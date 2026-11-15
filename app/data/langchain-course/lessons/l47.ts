import { L, withKind } from '../../course-builders.ts'

export const L47 = withKind(
  L(
    'L47',
    13,
    'hook 节点化：before*/after* 如何插进流水线',
    3,
    ['L41'],
    ['lc-hook-nodes'],
    [
      '说出四个 before*/after* hook 各自对应的节点类、节点命名规则（middleware名.阶段）与去重校验',
      '解释 MiddlewareNode 公共骨架的三件套：context 按 schema 形状过滤、messages 保持原引用、runtime 冻结为具名类实例',
      '复述 hook 的两种形态（纯函数与 { hook, canJumpTo } 对象）及运行时跳转约束的校验时机',
      '解释 afterModel 与 afterAgent 节点为什么按数组逆序接线执行',
    ],
    `L41 说过「构造器把中间件展开成图」，但只看了骨架；本课专讲四个生命周期 hook（beforeAgent/beforeModel/afterModel/afterAgent）如何从配置对象变成图里的真实节点、按什么顺序接线、返回值如何被消费。核心结论：**hook 不是回调——每个实现了 hook 的中间件会在编译期生成一个 36 行左右的薄壳节点，插在 model_request 前后的固定槽位上，before 系列正序、after 系列逆序**。

### 六类节点的出生：构造器里逐中间件展开

ReactAgent 构造器维护四个节点登记数组，然后遍历 middleware 数组逐个检查 hook：

\`\`\`ts
const beforeAgentNodes: { index: number; name: string; allowed?: string[] }[] = [];
...
for (let i = 0; i < middleware.length; i++) {
  const m = middleware[i];
  if (middlewareNames.has(m.name)) {
    throw new Error(\`Middleware \${m.name} is defined multiple times\`);
  }
  middlewareNames.add(m.name);
  if (m.beforeAgent) {
    beforeAgentNode = new BeforeAgentNode(m);
    const name = \`\${m.name}.before_agent\`;
    beforeAgentNodes.push({
      index: i,
      name,
      allowed: getHookConstraint(m.beforeAgent),
    });
    allNodeWorkflows.addNode(name, beforeAgentNode, beforeAgentNode.nodeOptions);
  }
  ...
}
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:269-330（commit 7704471，有裁剪）*

三个要点。第一，**登记条目不只是名字**：\`index\` 记住中间件在数组里的位次，\`allowed\` 预先算好 canJumpTo 白名单——这两个信息在后面接边时决定用 addEdge 还是 addConditionalEdges。第二，**去重按 name 而非引用**，同名中间件直接抛错，防止两个 hook 节点撞注册名。第三，只有实现了对应 hook 的中间件才产生节点——没写 beforeModel 的中间件不会在模型调用前占一跳。wrapModelCall 不在这里建节点，而是被收进 \`wrapModelCallHookMiddleware\` 数组留给 AgentNode（ReactAgent.ts:374-376），它走的是函数洋葱而非图节点路线——这是 L52 的核心分野。

### 薄壳与骨架：36 行节点类 + 193 行 MiddlewareNode

四个节点类都是同构薄壳，以 BeforeAgentNode 为例：

\`\`\`ts
export class BeforeAgentNode<...> extends MiddlewareNode<...> {
  lc_namespace = ["langchain", "agents", "beforeAgentNodes"];

  constructor(public middleware: AnyAgentMiddleware) {
    super({
      name: \`BeforeAgentNode_\${middleware.name}\`,
      func: async (state, config?) => this.invokeMiddleware(state, config),
    });
  }

  runHook(state: TStateSchema, runtime: Runtime<TContextSchema>) {
    const fn = getHookFunction(this.middleware.beforeAgent!);
    return fn(state, runtime) as Promise<MiddlewareResult<TStateSchema>>;
  }
}
\`\`\`

*— libs/langchain/src/agents/nodes/BeforeAgentNode.ts:13-35（commit 7704471）*

注意有两层名字：节点注册名是 \`中间件名.before_agent\`，回调树显示名是 \`BeforeAgentNode_中间件名\`——后者正是 L50 运行时校验里 \`this.name?.startsWith("BeforeAgentNode_")\` 的匹配依据。真正的工作在抽象基类 \`MiddlewareNode.invokeMiddleware\` 里，干三件事。其一，context 过滤：

\`\`\`ts
const schemaShape = getInteropZodObjectShape(this.middleware.contextSchema);
if (schemaShape) {
  const relevantContext: Record<string, unknown> = {};
  const invokeContext = config?.context || {};
  for (const key of Object.keys(schemaShape)) {
    if (key in invokeContext) {
      relevantContext[key] = invokeContext[key];
    }
  }
  filteredContext = interopParse(this.middleware.contextSchema, relevantContext);
}
\`\`\`

*— libs/langchain/src/agents/nodes/middleware.ts:65-84（commit 7704471）*

每个中间件只看到自己 contextSchema 声明的键，其余被忽略（不是报错），parse 一并应用默认值与必填校验。其二，state 组装时刻意保留 \`messages: invokeState.messages\` 原引用，注释写明 "don't overwrite possible outdated messages from other middleware nodes"——多个 hook 节点串行执行时，后面的节点必须看到前面节点写入后的最新消息，而不是自己输入快照里的旧值。其三，runtime 用 \`Object.freeze(Object.assign(new AgentRuntime(), {...}))\` 构造，context 也冻在具名的 \`AgentContext\` 实例上——类名会出现在报错栈里，把「某个冻结对象上不可写」这类晦涩错误变成可读信息（middleware.ts:104-118）。

### hook 的两种形态与跳转白名单的来源

类型层每个 before/after hook 都是联合类型：

\`\`\`ts
export type BeforeModelHook<...> =
  | BeforeModelHandler<TSchema, TContext>
  | {
      hook: BeforeModelHandler<TSchema, TContext>;
      canJumpTo?: JumpToTarget[];
    };
\`\`\`

*— libs/langchain/src/agents/middleware/types.ts:295-303（commit 7704471）*

纯函数形态意味着「我只改状态，不跳转」；对象形态额外声明 canJumpTo 白名单，这是 L50 运行时校验的数据源。运行期两个工具函数负责解包：\`getHookFunction\`（函数直接用，对象取 .hook）与 \`getHookConstraint\`（函数形态返回 undefined，对象形态取 canJumpTo）——构造器登记的 \`allowed\` 与 MiddlewareNode 返回值校验用的都是它（middleware/utils.ts:79-100）。

### 逆序接线：after 系列的镜像洋葱

接边逻辑是本课最反直觉的部分。before 系列正序链：\`beforeAgentNodes[i] → beforeAgentNodes[i+1]\`，最后一个接到 loopEntryNode。after 系列则反过来——先看模型端：

\`\`\`ts
// Connect agent to last afterModel node (for reverse order execution)
const lastAfterModelNode = afterModelNodes.at(-1);
if (afterModelNodes.length > 0 && lastAfterModelNode) {
  allNodeWorkflows.addEdge(AGENT_NODE_NAME, lastAfterModelNode.name);
}
// Connect afterModel nodes in reverse sequence
for (let i = afterModelNodes.length - 1; i > 0; i--) {
  ...
  allNodeWorkflows.addEdge(current, afterModelNodes[i - 1].name);
}
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:515-545（commit 7704471，有裁剪）*

执行链条是 \`model_request → C.after_model → B.after_model → A.after_model → (tools|end)\`——后注册的中间件先处理模型输出。afterAgent 完全同构（ReactAgent.ts:603-630），最后一个 afterAgent 节点连 END 之外的所有终点都换成了 exitNode（L48 的出口决策）。为什么逆序？因为 after 阶段的语义是「收尾管道」：越后注册的中间件越靠近模型输出，先做即时处理（如解析、校验），先注册的做最终收尾（如日志、清理）。这与 wrapModelCall 洋葱「第一个中间件最外层、最后处理响应」的语义殊途同归——**两种实现（图节点与函数洋葱）都把数组序统一成了「请求正序、响应逆序」**。

第一个（即最后执行的）afterModel 节点的出边不走 addEdge，而是接 \`#createAfterModelRouter\` 条件路由——它同时承担「跳去 tools/model_request」「去 exitNode」「正常按 tool_calls 分发 Send」三种职责，jumpTo 的消费就在这里（L50 展开）。

### 返回值协议：undefined、状态补丁、terminate 与 jumpTo

\`invokeMiddleware\` 的后半段定义了 hook 返回值的完整协议。undefined → \`{ jumpTo: undefined }\` 哨兵（不重放输入状态）；带 jumpTo 的部分状态 → 校验白名单后合并；\`{ type: "terminate" }\` 控制动作 → 携带 error 时直接抛出，否则合并 result 并按 jumpTo 跳转：

\`\`\`ts
if (typeof result === "object" && "type" in result) {
  if (result.type === "terminate") {
    if (result.error) { throw result.error; }
    return { ...state, ...(result.result || {}), jumpTo: result.jumpTo };
  }
  throw new Error(\`Invalid control action: \${JSON.stringify(result)}\`);
}
return { ...state, ...result, jumpTo: result.jumpTo };
\`\`\`

*— libs/langchain/src/agents/nodes/middleware.ts:165-184（commit 7704471）*

jumpTo 的白名单校验就发生在合并之前：按节点显示名前缀找到对应 hook 的 canJumpTo，越界跳转抛 "Invalid jump target: X, must be one of ... 或 no beforeModel.canJumpTo defined in middleware Y"——错误消息直接指出该补哪个配置（middleware.ts:135-160）。

### 本课小结

- 四个生命周期 hook 各生成一个薄壳节点，注册名 \`中间件名.阶段\`，登记 index 与 allowed 供接边使用；同名中间件在构造期抛错。
- MiddlewareNode 骨架三件套：context 按 schema 形状过滤 + interopParse；messages 保持最新引用不覆盖；runtime/context 冻结为具名类实例以改善报错。
- before 系列正序接线，afterModel/afterAgent 逆序接线——「请求正序、响应逆序」的洋葱语义同时存在于图节点与 wrapModelCall 函数洋葱两种实现里。
- hook 返回协议四分支：undefined 发哨兵、状态补丁带 jumpTo、terminate 可携带错误或结果、未知控制动作抛错；jumpTo 校验按节点名前缀取对应 hook 的 canJumpTo。
- 下一课精读接线的入口与出口决策：为什么入口由第一个 beforeAgent 决定、工具循环为什么回到 loopEntryNode 而不是 entryNode。
`,
    null,
    [
      {
        text: 'beforeAgent hook 的节点在图里叫什么名字？',
        options: [
          'beforeAgent',
          'middleware名.before_agent（如 myMw.before_agent）',
          'BeforeAgentNode',
          '与 middleware 同名',
        ],
        answer: 1,
        explain:
          'ReactAgent 构造器里 const name = `${m.name}.before_agent`，随后 addNode(name, beforeAgentNode, ...)——节点名由中间件名加点分阶段后缀拼出，这样多个中间件的同类 hook 不会撞名。选项 A/C 是类的直觉名而非注册名；选项 D 会触发 Middleware X is defined multiple times 的去重检查。',
        concept: 'lc-hook-nodes',
      },
      {
        text: 'MiddlewareNode.invokeMiddleware 对 context 的处理方式是？',
        options: [
          '原样透传完整 context',
          '按 middleware 自己 contextSchema 的字段形状过滤出相关键，再 interopParse 应用默认值与校验',
          '深拷贝后传给 hook',
          '直接拒绝未声明的 context 键并抛错',
        ],
        answer: 1,
        explain:
          'invokeMiddleware 用 getInteropZodObjectShape 取出 middleware contextSchema 的键集合，只把 invokeContext 里存在的对应键收进 relevantContext，再 interopParse——注释写明 Parse to apply defaults and validation, even if relevantContext is empty。选项 A 会让中间件看到别人的 context 键；选项 C 无拷贝必要；选项 D 错在多余键是被忽略而非报错。',
        concept: 'lc-hook-nodes',
      },
      {
        text: '三个中间件 A、B、C 依次注册且都定义了 afterModel，实际执行顺序是？',
        options: ['A → B → C', 'C → B → A（逆序）', '并行执行', '取决于 canJumpTo 配置'],
        answer: 1,
        explain:
          '接线代码把 AGENT_NODE_NAME 连到最后一个 afterModel 节点，再从数组末尾向前逐个连边（for i = afterModelNodes.length - 1; i > 0; i--），注释明说 reverse order execution——后注册的中间件先看到模型输出，形成与 before 系列镜像的洋葱。A→B→C 是 beforeAgent/beforeModel 的顺序而非 after 系列；并行与 canJumpTo 都不影响默认顺序。',
        concept: 'lc-hook-nodes',
      },
      {
        text: 'hook 返回 undefined 时，MiddlewareNode 返回什么状态更新？',
        options: [
          '返回完整输入状态的拷贝',
          '只返回 { jumpTo: undefined } 这个哨兵，不把输入键重新发射一遍',
          '返回 null',
          '抛出异常',
        ],
        answer: 1,
        explain:
          "源码注释：If result is undefined, the hook made no state changes — return only the jumpTo sentinel so we don't re-emit every input key as a state update。返回 { jumpTo: undefined } 既能触发图里 jumpTo 通道的路由读取，又避免把整个输入状态当更新重放（那会干扰消息 reducer 与版本时钟）。选项 A 正是要避免的行为；选项 C/D 无此路径。",
        concept: 'lc-hook-nodes',
      },
    ],
    [
      [
        'MiddlewareNode',
        'nodes/middleware.ts 里 193 行的抽象基类，四个 before/after 节点类的公共骨架，负责 context 过滤、runtime 构造与返回值协议',
      ],
      [
        '节点命名规则',
        'hook 节点的注册名格式为 中间件名.阶段（如 authMw.before_model），回调树里显示 BeforeModelNode_中间件名',
      ],
      [
        'getHookConstraint',
        'middleware/utils.ts 里的工具函数：hook 是函数形态时返回 undefined，是对象形态时取 canJumpTo 数组',
      ],
      [
        'terminate 控制动作',
        'MiddlewareNode 支持的返回协议之一：{ type: terminate, result?, error?, jumpTo? }，携带 error 时直接抛出，否则合并结果并按 jumpTo 跳转',
      ],
    ],
    [
      '把 hook 当成回调监听器——每个 hook 是图里的真实节点，有独立的状态输入输出，占一个超步；在 hook 里做超轻量工作时也要考虑这一跳的代价',
      '以为 after 系列与 before 系列执行方向一致——afterModel/afterAgent 是逆序接线，写依赖顺序的中间件组合时要把这一点算进去',
      '在 hook 里返回新 messages 数组引用以外的「局部修改」——节点输出按状态更新合并，改了数组里某个对象但引用不变时可能不触发期望的通道写入',
    ],
  ),
  'theory',
)
