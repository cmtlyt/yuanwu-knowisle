import { L, withKind } from '../../course-builders.ts'

export const L68 = withKind(
  L(
    'L68',
    19,
    '编译即接线：attachNode/attachEdge 把业务图降维成通道网络',
    3,
    ['L65'],
    ['lc-graph-compile-wiring'],
    [
      '说出 attachNode 为每个节点生成的 branch:to:<node> 触发通道与 EphemeralValue(false) 的关系',
      '解释 addEdge([a,b], c) 编译成 join: NamedBarrier 通道的完整产物（通道、triggers、writers 三处改动）',
      '理解隐式 _getControlBranch 如何让 Command.goto 无需显式条件边即可路由',
    ],
    `### compile 的本质：把「节点图」翻译成「通道网络」

模块六前四课都在 builder 层打转，本课是它的收官：**compile() 不执行任何业务逻辑，它做的是一次降维翻译——把 addNode/addEdge/addConditionalEdges 的人机接口，全部改写成「PregelNode 读哪些通道、写哪些通道」的均匀结构**。翻译完成后 Pregel 引擎（L75 起）只需要一种机制：超步内读通道、跑任务、写通道。我们按 attachNode → attachEdge → attachBranch 的顺序走读。

### 门面：compile 的临时注入与 builder 可重复编译

\`\`\`ts
const defaultErrorHandlerSpec = this._createDefaultErrorHandlerSpec();
if (defaultErrorHandlerSpec !== undefined) {
  if (DEFAULT_ERROR_HANDLER_NODE in this.nodes) {
    throw new Error(\`Cannot apply a default error handler: ...\`);
  }
  this.nodes[DEFAULT_ERROR_HANDLER_NODE as N] = defaultErrorHandlerSpec;
}
try {
  return this._compileResolved({ ... });
} finally {
  if (defaultErrorHandlerSpec !== undefined) {
    delete this.nodes[DEFAULT_ERROR_HANDLER_NODE as N];
  }
}
\`\`\`

*— graph/state.ts:1437-1474（有裁剪，commit fa426b2）*

\`setNodeDefaults({ errorHandler })\` 配置的共享处理器在 compile 开头以 \`__default_error_handler__\` 名义临时塞进 nodes，让可达性校验把它当普通节点对待；\`finally\` 里删除——**同一个 builder 可以 compile 多次而互不污染**。compile 的选项（graph/state.ts:1402-1424）除 checkpointer/store/interruptBefore/After 外还有 \`cache\`（节点结果缓存）与 \`transformers\`（streamEvents v3 流变换器），返回类型是 \`CompiledStateGraph<Prettify<S>, Prettify<U>, ...>\`，持有一个 \`declare builder\` 反向引用（graph/state.ts:1693-1716）。

### attachNode：每个节点一条私有触发通道

\`\`\`ts
const branchChannel = \`branch:to:\${key}\` as string | N;
this.channels[branchChannel] = node?.defer
  ? new LastValueAfterFinish()
  : new EphemeralValue(false);
this.nodes[key] = new PregelNode<S, U>({
  triggers: [branchChannel],
  channels: isSingleInput ? Object.keys(inputValues) : inputValues,
  writers: [new ChannelWrite(stateWriteEntries, [TAG_HIDDEN])],
  mapper: isSingleInput ? undefined : (input) => Object.fromEntries(
    Object.entries(input).filter(([k]) => k in inputValues)),
  bound: node?.runnable,
  ...
});
\`\`\`

*— graph/state.ts:1941-1972（有裁剪，commit fa426b2）*

三个翻译动作：**触发**——节点的 triggers 是 \`branch:to:<key>\`，谁往这条通道写值谁就调度它；**读取**——channels 映射决定节点输入是全量状态还是过滤子集（单输入且是 __root__ 时直接给 key 列表）；**写出**——writers 是一个带 PASSTHROUGH 条目的 ChannelWrite，运行时才把节点返回值交给 \`_getUpdates\` mapper，展开成 (channel, value) 元组，非法返回值在此抛 INVALID_GRAPH_NODE_RETURN_VALUE（graph/state.ts:1898-1906）。控制流与数据流在此**统一为通道**：调度一个节点 = 向它的 branch 通道写一次。

### attachEdge：join 边的三件套产物

\`\`\`ts
} else if (Array.isArray(starts)) {
  const channelName = \`join:\${starts.join("+")}:\${end}\`;
  this.channels[channelName] = this.builder.nodes[end].defer
    ? new NamedBarrierValueAfterFinish(new Set(starts))
    : new NamedBarrierValue(new Set(starts));
  this.nodes[end].triggers.push(channelName);
  for (const start of starts) {
    this.nodes[start].writers.push(
      new ChannelWrite([{ channel: channelName, value: start }], [TAG_HIDDEN]));
  }
}
\`\`\`

*— graph/state.ts:1985-2002（有裁剪，commit fa426b2）*

\`addEdge(["a","b"], "c")\` 的全部产物：一条名为 \`join:a+b:c\` 的屏障通道、c 的 triggers 追加它、a 与 b 的 writers 各追加一条「写自己名字」的 ChannelWrite。通道成员集合在编译期固定（new Set(starts)），屏障的集齐判定与复用逻辑在通道内核（L72 详读）。单起点边则简单得多：直接给起点节点的 writers 追加一条写 \`branch:to:<end>\` 的 ChannelWrite（graph/state.ts:1978-1984）。

### attachBranch 与隐式控制分支：条件路由的统一出口

\`\`\`ts
const writes: (ChannelWriteEntry | Send)[] = filteredPackets.map((p) => {
  if (_isSend(p)) return p;
  return { channel: p === END ? p : \`branch:to:\${p}\`, value: start };
});
await ChannelWrite.doWrite(
  { ...config, tags: (config.tags ?? []).concat([TAG_HIDDEN]) }, writes);
\`\`\`

*— graph/state.ts:2011-2026（有裁剪，commit fa426b2）*

条件边函数返回的目标名一律映射为 \`branch:to:<target>\` 写入；返回 Send 则原样下发——动态 map-reduce 的路由与普通条件边共用同一出口。Tag 是 TAG_HIDDEN，这些控制写入不进用户的流与回调树。此外每个节点还挂着一条**隐式** \`<control_branch>\`（graph/state.ts:2187-2200），它的 \`_controlBranch\` 专门解析节点返回值中的 Command：goto 字符串/数组转成目标写入，Send 放行，\`graph === Command.PARENT\` 抛 \`ParentCommand\`（graph/state.ts:2170-2172）上交父图。这就是 \`Command({ goto })\` 不需要注册任何条件边也能路由的原因——**路由是通道写，不是边表查**。

### 设计动机：为什么路由必须是「通道写」而不是「边表查」

把三种接线机制放在一起看，会浮现一个共同形态：顺序边、join、条件边、Command 最终全部落成「向某条通道写某个值」。这个统一不是审美选择，而是 BSP 运行时的工程前提。断点判定 \`shouldInterrupt\` 依赖的是 \`checkpoint.channel_versions\` 与 \`versions_seen\` 的版本比较（pregel/algo.ts:166-202）——如果路由存在边表这种「通道之外的第三形态」，中断/恢复就得为它维护另一套簿记；而路由即写通道后，**恢复（replay）与中断共享同一套版本时钟**，L74/L75 的 isResuming 与 tick 才能只用一种机制闭环。\`Command\` 的处理是同样的思路：io 层的 \`mapCommand\` 把 goto/resume/update 全部解包成以 \`NULL_TASK_ID\` 挂名的 pending writes——goto 变成向 \`branch:to:<target>\` 写 \`"__start__"\`，resume 变成向 \`RESUME\` 通道写值（pregel/io.ts:71-133）。入口处的 Command 与超步内的通道写在数据面上没有区别。

易混淆点随之而来：**branch:to 通道写入的 value 是「触发者节点名」，不是业务数据**。attachEdge 给每个起点追加的写条目是 \`{ channel: "join:a+b:c", value: start }\`（graph/state.ts:1994-2000），attachBranch 的条件路由写的是 \`{ channel: "branch:to:<p>", value: start }\`（2011-2026）——这些值只服务于屏障集齐与调度，业务数据永远走状态通道。初学者常在 join 场景里找「a 的输出怎么传给 c」，答案是：c 从状态通道读，join 通道里根本没有 a 的输出。

### 报错信息怎么读：INVALID_GRAPH_NODE_RETURN_VALUE 现场

节点返回值非法时的报错值得原样读一遍（graph/state.ts:1898-1906）：

\`\`\`ts
throw new InvalidUpdateError(
  \`Expected node "\${nodeKey.toString()}" to return an object or an array \` +
  \`containing at least one Command object, received \${typeofInput}\`,
  { lc_error_code: "INVALID_GRAPH_NODE_RETURN_VALUE" }
);
\`\`\`

*— graph/state.ts:1898-1906（commit fa426b2）*

信息量有三层：节点名（定位现场）、期望形态（对象或含 Command 的数组）、实际收到的 \`typeof\`（array/string/number...）。对照第四节的quiz 场景：多通道图里节点返回裸字符串 \`return "done"\`，报错就是 \`received string\`；而单 \`__root__\` 输出形态的图（1765-1791）会走 \`_getRoot\` 分支合法地把它包成 \`[ROOT, value]\`——同一个返回值在不同输出 schema 下生死不同，这也是为什么排错时第一步是确认图的 output schema 是不是 ROOT 形态。

### 本课小结

- compile = 降维翻译：所有控制流（顺序边、join、条件边、Command）最终都是「向某条通道写某个值」。
- 每个业务节点私有一条 branch:to 通道，普通节点 EphemeralValue(false)、defer 节点 LastValueAfterFinish。
- join 边 = NamedBarrier 通道 + 终点 trigger + 各起点 writer 三件套，成员名单编译期固定。
- 隐式 <control_branch> 让 Command.goto/Send 免注册路由；PARENT 上抛 ParentCommand。
- branch:to/join 通道写入的 value 是触发者节点名而非业务数据；路由即通道写让中断、恢复与调度共享同一套版本时钟。
- 下一课进入 Channel 系统：BaseChannel 的七件套契约是全部 11 种实现的公共骨架。
`,
    null,
    [
      {
        text: 'compile 后每个业务节点挂在什么通道上？',
        options: [
          '直接读 START 通道',
          '一条私有 branch:to:<node> 通道：普通节点用 EphemeralValue(false)，defer 节点用 LastValueAfterFinish',
          '所有节点共享一条全局任务通道',
          '每个节点一条 Topic 通道',
        ],
        answer: 1,
        explain:
          'attachNode 里 branchChannel = `branch:to:${key}`，defer 节点挂 LastValueAfterFinish()，普通节点挂 EphemeralValue(false)（graph/state.ts:1941-1944），PregelNode 的 triggers 就是这条通道（1948-1953）。A 错在 START 通道只属于隐式 START 节点；C 错在没有共享任务通道——任务派发走 __pregel_tasks（后续课）；D 错在 Topic 是用户可用的 PubSub 通道，不用于控制流。',
        concept: 'lc-graph-compile-wiring',
      },
      {
        text: 'addEdge(["a", "b"], "c") 的编译产物是什么？',
        options: [
          '两条独立边 a→c、b→c',
          '一条 join:a+b:c 的 NamedBarrierValue 屏障通道：每个起点节点的 writers 追加向它写入自己名字，c 的 triggers 追加该通道',
          '一个 RunnableLambda 做计数等待',
          'c 节点被复制成两份分别等 a 和 b',
        ],
        answer: 1,
        explain:
          'attachEdge 的数组分支（graph/state.ts:1985-2002）：channelName = `join:${starts.join("+")}:${end}`，注册 NamedBarrierValue(new Set(starts))（defer 时 NamedBarrierValueAfterFinish），nodes[end].triggers.push(channelName)，并给每个 start 节点的 writers 追加 ChannelWrite([{ channel: channelName, value: start }])。A 错在语义完全不同——两条独立边会让 c 收到一次就跑；C 错在等待逻辑在通道内核而非用户代码；D 无此实现。',
        concept: 'lc-graph-compile-wiring',
      },
      {
        text: '节点返回值不是对象（比如返回一个字符串）时会发生什么？',
        options: [
          '被静默忽略',
          '抛 INVALID_GRAPH_NODE_RETURN_VALUE 错误',
          '自动包装成 { __root__: value } 写入',
          '写入所有通道',
        ],
        answer: 1,
        explain:
          'attachNode 的 _getUpdates 对非对象非 Command 的输入抛 InvalidUpdateError，错误码 INVALID_GRAPH_NODE_RETURN_VALUE（graph/state.ts:1898-1906）。但注意区分：输出 schema 的第一个 key 是 __root__ 时走 _getRoot 分支，单值会以 [ROOT, input] 元组写入（1765-1791）——那是 ROOT 通道的特殊形态，与普通多通道图不同。A 错在有显式报错；C 错在包装只发生在 ROOT 输出形态；D 无此逻辑。',
        concept: 'lc-graph-compile-wiring',
      },
      {
        text: 'Command({ goto: "x" }) 在没有显式条件边时为什么也能路由？',
        options: [
          'goto 直接修改 checkpoint 里的边表',
          '每个节点（含 START）都挂了隐式 _getControlBranch，它解析返回值里的 Command 并把目标写进 branch:to:<target> 通道',
          '运行时用字符串反射查找节点',
          'goto 需要预先注册，否则报错',
        ],
        answer: 1,
        explain:
          '_getControlBranch 构造一个 path 为 <control_branch> 的 Branch（graph/state.ts:2187-2200），其 _controlBranch 解析 Command：Send 原样下发、goto 目标交给 branchWriter 映射为 branch:to:<target> 写入（2005-2042）。每个节点都挂了这条隐式分支，所以 Command 不需要显式 addConditionalEdges。A 错在边表是构建期产物运行期不可变；C 错在路由也是通过通道写完成的；D 错在 goto 目标只要是图内节点名即可，Command.PARENT 之外无需注册。',
        concept: 'lc-graph-compile-wiring',
      },
      {
        text: 'Command({ goto, graph: Command.PARENT }) 会触发什么？',
        options: [
          '正常路由到父图同名节点',
          '抛 ParentCommand，交给父图处理',
          '被忽略，图继续走到 END',
          '转换成 END',
        ],
        answer: 1,
        explain:
          '_controlBranch 遇到 command.graph === Command.PARENT 时 throw new ParentCommand(command)（graph/state.ts:2170-2172），attachNode 的 _getUpdates/_getRoot 对 PARENT 的 Command 返回 null/跳过（1766-1791）——即子图节点本身不消费它，由运行时上抛给父图的分支层处理。A 错在子图无法直接解析父图的节点名；C/D 错在它是显式控制流信号，不会被吞。',
        concept: 'lc-graph-compile-wiring',
      },
    ],
    [
      [
        'branch:to:<node>',
        '编译期为每个节点生成的私有触发通道名，PregelNode 的 triggers 指向它；写入它等于「调度该节点」',
      ],
      ['join:<a+b>:<c>', '多起点边编译出的 NamedBarrier 通道名，成员集合在编译期固定'],
      [
        'PASSTHROUGH',
        'ChannelWrite 条目里的哨兵：运行时才把节点输出注入 value，配合 mapper 完成输出→(channel, value) 元组的转换',
      ],
      [
        '<control_branch>',
        '挂在每个节点上的隐式控制分支名（TAG_HIDDEN），负责 Command.goto / Send 的路由下发',
      ],
    ],
    [
      '以为 addEdge([a,b], c) 是 N 条独立边——它是屏障同步，任一起点未完成 c 都不会触发；想要「谁先到谁触发」要写成 N 条单边',
      '在 defer 节点上期待普通触发时机——defer 节点的 branch 通道是 LastValueAfterFinish、join 是 NamedBarrierValueAfterFinish，全部推迟到图收尾前执行',
      '在节点里返回裸字符串（多通道图）——会得到 INVALID_GRAPH_NODE_RETURN_VALUE；要么返回对象、要么返回 Command、要么让输出 schema 走 __root__ 形态',
    ],
  ),
  'theory',
)
