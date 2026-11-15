import { L, withKind } from '../../course-builders.ts'

export const L72 = withKind(
  L(
    'L72',
    20,
    '同步屏障三兄弟：NamedBarrier/AfterFinish/DynamicBarrier 与 join 边降维',
    3,
    ['L69'],
    ['lc-barrier-channels'],
    [
      '解释 NamedBarrierValue 的 ValueType 为什么是 void——它传同步信号不传数据',
      '区分 NamedBarrierValueAfterFinish 与 DynamicBarrierValue 的两态机（priming/waiting）',
      '从 addEdge([a,b], c) 的编译产物推导 join 通道在超步内的完整判定流程',
    ],
    `### 同步等待也是一种通道：三种屏障的分工

上一课的 EphemeralValue 解决「单个触发信号」，本课解决更难的问题：**多个并行节点全部完成后才允许下一个节点启动**。BSP（批量同步并行）模型里这叫屏障（barrier），langgraph 把它做成了三种通道：NamedBarrier（静态名单）、NamedBarrierValueAfterFinish（加 finish 门控）、DynamicBarrierValue（运行时名单）。它们的共同点先记住：**ValueType 是 void——屏障不传数据只传同步信号，终点节点被触发后从正常状态通道读数据**。

### NamedBarrierValue：集齐才可读

\`\`\`ts
export class NamedBarrierValue<Value> extends BaseChannel<void, Value, Value[]> {
  lc_graph_name = "NamedBarrierValue";
  names: Set<Value>;   // Names of nodes that we want to wait for.
  seen: Set<Value>;

  update(values: Value[]): boolean {
    let updated = false;
    for (const nodeName of values) {
      if (this.names.has(nodeName)) {
        if (!this.seen.has(nodeName)) {
          this.seen.add(nodeName);
          updated = true;
        }
      } else {
        throw new InvalidUpdateError(
          \`Value \${JSON.stringify(nodeName)} not in names \${JSON.stringify(this.names)}\`);
      }
    }
    return updated;
  }

  get(): void {
    if (!areSetsEqual(this.names, this.seen)) throw new EmptyChannelError();
    return undefined;
  }
  consume(): boolean {
    if (this.seen && this.names && areSetsEqual(this.seen, this.names)) {
      this.seen = new Set<Value>();
      return true;
    }
    return false;
  }
  isAvailable(): boolean { return !!this.names && areSetsEqual(this.names, this.seen); }
}
\`\`\`

*— channels/named_barrier_value.ts:13-81（有裁剪，commit fa426b2）*

超步内的判定流程：每个起点节点完成时经 ChannelWrite 写入自己的名字（\`{ channel: "join:a+b:c", value: start }\`，graph/state.ts:1994-2000）→ update 把名字记入 seen → _prepareNextTasks 用 isAvailable 决定终点节点是否进入下一批任务（L75）→ 集齐后终点节点的 triggers 里有这条通道，被调度执行 → consume 清空 seen，供循环里的下一次 join 复用。checkpoint 存 [...seen]（66-68 行）——中断恢复时已到齐的成员不会重复等待。

### AfterFinish 变体：屏障 + 收尾门控

\`\`\`ts
get(): void {
  if (!this.finished || !areSetsEqual(this.names, this.seen)) {
    throw new EmptyChannelError();
  }
  return undefined;
}
finish(): boolean {
  if (!this.finished && !!this.names && areSetsEqual(this.names, this.seen)) {
    this.finished = true;
    return true;
  }
  return false;
}
checkpoint(): [Value[], boolean] { return [[...this.seen], this.finished]; }
\`\`\`

*— channels/named_barrier_value.ts:135-166（有裁剪，commit fa426b2）*

在集齐条件之上叠加 finished 门：**成员全部到齐 + 引擎调用 finish() 两个条件同时满足才放行**。finish 钩子由 _applyWrites 在「疑似最后一步」对所有通道广播（L76）——所以这个变体服务的是 defer 节点：\`addNode(key, fn, { defer: true })\` 的节点全部推迟到图收尾前批量执行，join 到 defer 节点的边用 NamedBarrierValueAfterFinish（graph/state.ts:1988-1990）。checkpoint 是 [seen, finished] 二元组，门控状态跨中断存活。

### DynamicBarrierValue：两态机与运行时名单

\`\`\`ts
export class DynamicBarrierValue<Value> extends BaseChannel<
  void, Value | WaitForNames<Value>, [Value[] | undefined, Value[]]
> {
  names?: Set<Value>;   // priming 态为 undefined
  seen: Set<Value>;

  update(values: (Value | WaitForNames<Value>)[]): boolean {
    const waitForNames = values.filter(isWaitForNames);
    if (waitForNames.length > 0) {
      if (waitForNames.length > 1) {
        throw new InvalidUpdateError("Received multiple WaitForNames updates in the same step.");
      }
      this.names = new Set(waitForNames[0].__names);
      return true;
    } else if (this.names !== undefined) {
      let updated = false;
      for (const value of values) {
        if (this.names.has(value) && !this.seen.has(value)) {
          this.seen.add(value);
          updated = true;
        }
      }
      return updated;
    }
    return false;
  }
\`\`\`

*— channels/dynamic_barrier_value.ts:24-76（有裁剪，commit fa426b2）*

与 NamedBarrier 的本质区别在名单来源：**NamedBarrier 的名单在编译期写死（new Set(starts)），DynamicBarrier 的名单由 WaitForNames 更新在运行时下发**。为什么需要动态名单？Send 场景：\`Send(node, arg)\` 动态派发的任务数量事先未知，等待「这批动态任务全部完成」的名单只能在实际派发时确定。两态机文档（dynamic_barrier_value.ts:16-23）写得像注释版规范：priming 不可读 → 收到 WaitForNames 切 waiting → 集齐可读一次 → consume 后回 priming、names 复位 undefined。checkpoint 存 [names?, seen]，waiting 态跨中断恢复。文件里还有一个 DynamicBarrierValueAfterFinish 变体（115-215 行，三态信息 checkpoint），但它没有从 channels/index.ts 导出——仅内核内部可用。

### join 边降维：回到编译现场

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

L68 已看过这段，现在能读出深层结构：**\`addEdge([a,b], c)\` 的语义完全由通道类型承载**——普通终点用 NamedBarrier（超步内集齐即触发），defer 终点用 AfterFinish 变体（收尾才触发）。通道名里的 \`+\` 连接起点名，调试时在 checkpoint 的 channel_versions/versions_seen 里能直接看到 \`join:a+b:c\` 的版本轨迹。值得强调的边界：屏障等待是按超步对齐的——若 a 本步完成、b 下一步才完成，它们的名字会分别落在两个超步的写入里，而 seen 集合跨超步存活（除非被 consume），所以屏障仍然是「全部到齐」而非「同一步到齐」。

### 集齐判定的底层与中断恢复在屏障层的体现

三种屏障的「集齐」判定压在一个工具函数上：\`areSetsEqual\` 定义就在 named_barrier_value.ts 文件头（第 4 行），语义是「size 相等且每个成员都 \`has\`」——**集合相等，不是子集关系**。这个细节与 update 的名单外写入拦截（抛 InvalidUpdateError）配套：seen 既不能混入名单外成员，也不能少于名单，判定逻辑因此可以只用一次集合比较。isAvailable 用的也是同一个函数（named_barrier_value.ts:79-80），读侧与调度侧对「集齐」的理解天然一致。

屏障与 checkpoint 的交互有一个容易忽略的福利：**中断恢复不会让已到齐的成员重等**。NamedBarrier 的 checkpoint 存 \`[...seen]\`（named_barrier_value.ts:66-68），AfterFinish 变体存 \`[[...seen], finished]\`（154 行）——若中断恰好发生在「集齐之后、consume 之前」，恢复时 seen 从 checkpoint 灌回，屏障立即处于可读状态，终点节点直接被调度，不需要等待任何成员重跑。这是「中断恢复不重做已完成工作」这条全局承诺（L79/L80）在屏障层的一个具体兑现。反过来，consume 之后的复用也安全：seen 清空、屏障回到等待态，循环体里的下一次 join 从零开始。

最后一个组合陷阱：**Send 与静态屏障不兼容**。\`Send(node, arg)\` 动态派发的任务数量事先未知，这些动态任务不会出现在编译期固定的 names 集合里——把它们接向 NamedBarrier 的结果是「永远差几个人」的死等。官方为此设计了 DynamicBarrier 的 WaitForNames 更新：在实际派发时把动态名单下发给屏障（dynamic_barrier_value.ts:16-23、50-59）。选型口诀一句话：**名单编译期能确定用 NamedBarrier，名单要等运行时才知道用 DynamicBarrier**。

### 本课小结

- 屏障通道 ValueType=void：只传「到齐」信号，数据走状态通道。
- NamedBarrier：静态名单 + seen 集合，集齐可读、consume 复用、名单外写入抛错。
- AfterFinish 变体：叠加 finish 门控，defer 节点的 join 专用；checkpoint 带 finished。
- DynamicBarrier：两态机 + WaitForNames 运行时名单，服务 Send 动态任务的全员等待。
- 集齐判定是 areSetsEqual 的集合相等；checkpoint 灌回 seen 让中断恢复免重等，Send 动态任务必须配 DynamicBarrier 而非静态屏障。
- 下一课：两个「不存全量」的通道——DeltaChannel 的重放重建与 UntrackedValue 的永不持久化。
`,
    null,
    [
      {
        text: 'NamedBarrierValue.get() 在什么时候才不抛 EmptyChannelError？',
        options: [
          '只要收到过任意一个写入',
          'seen 与 names 两个集合相等时（areSetsEqual）——所有等待成员都到齐',
          '图进入最后一步时',
          '它从不抛错，返回 undefined',
        ],
        answer: 1,
        explain:
          'channels/named_barrier_value.ts:59-64：if (!areSetsEqual(this.names, this.seen)) throw new EmptyChannelError()。names 是编译期固定的等待名单（new Set(starts)），seen 是已到齐成员；isAvailable 同样检查集合相等（78-80）。A 错在部分到齐也不放行——这正是屏障语义；C 是 AfterFinish 变体的附加条件；D 错在未集齐时读取就是报错（读侧捕获后跳过该节点调度）。',
        concept: 'lc-barrier-channels',
      },
      {
        text: 'NamedBarrierValue.update 收到不在名单里的名字会怎样？',
        options: [
          '静默忽略',
          '抛 InvalidUpdateError——屏障成员在编译期固定，名单外的写入是图结构错误',
          '把它加进 names 动态扩容',
          '返回 false 不更新',
        ],
        answer: 1,
        explain:
          'update 的循环里 if (this.names.has(nodeName)) 记入 seen，else 抛 InvalidUpdateError（named_barrier_value.ts:46-52），错误信息带名单 JSON。与 DynamicBarrier 对比：后者的名单是运行时下发的，所以能动态接受新名单（但一步只允许一个 WaitForNames）。A/C 与屏障的编译期固定语义矛盾；D 错在合法写入返回 true。',
        concept: 'lc-barrier-channels',
      },
      {
        text: 'NamedBarrierValueAfterFinish 的放行条件比 NamedBarrierValue 多了什么？',
        options: [
          '多了超时判定',
          '多了 finished 标志——所有成员到齐且 finish() 钩子被调用后才可读',
          '多了对 Send 的支持',
          '没有任何区别',
        ],
        answer: 1,
        explain:
          'get 检查 if (!this.finished || !areSetsEqual(this.names, this.seen)) throw（named_barrier_value.ts:135-140）；finish() 在集齐时置 finished=true（160-166）。finish 钩子由 _applyWrites 在「疑似最后一步」时广播（L76）——defer 节点的 join 用它（graph/state.ts:1988-1990），保证图内普通工作全部完成之后才触发 defer 任务。A/C 无此机制；D 错在差异是实质性的。',
        concept: 'lc-barrier-channels',
      },
      {
        text: 'DynamicBarrierValue 的等待名单从哪来？一步内允许多少个 WaitForNames？',
        options: [
          '编译期 addEdge 注册；允许多个',
          '运行时经 WaitForNames{__names} 更新下发（Send 场景）；一步只允许一个',
          '从 checkpoint 恢复；不允许下发',
          '用户手动调用 setNames 设置',
        ],
        answer: 1,
        explain:
          'update 里 values.filter(isWaitForNames)，多于一个抛 "Received multiple WaitForNames updates in the same step."，单个则 this.names = new Set(waitForNames[0].__names)（dynamic_barrier_value.ts:50-59）。WaitForNames 是 { __names: Value[] } 接口（5-7 行），由 Send 动态派发任务时写入——名单人数事先未知，只能运行时定。A 描述的是 NamedBarrier；C 错在 checkpoint 存 [names?, seen]，waiting 态可跨 checkpoint 恢复；D 无此 API。',
        concept: 'lc-barrier-channels',
      },
      {
        text: 'DynamicBarrierValue 集齐并被消费一次后回到什么状态？',
        options: [
          'waiting 态，继续等下一批',
          'priming 态：names 复位为 undefined、seen 清空，等待新的 WaitForNames',
          '终态，不再可用',
          '保持集齐状态供反复读取',
        ],
        answer: 1,
        explain:
          'consume() 在 areSetsEqual(seen, names) 时清空 seen 并把 names 置回 undefined（dynamic_barrier_value.ts:78-85）——两态机完成一轮。类文档明确描述：priming 态不可读，收到 WaitForNames 切到 waiting；waiting 态集齐可读一次，消费后回到 priming（16-23 行）。A 错在 waiting 必须先有新名单；C 错在屏障是可复用的；D 错在 consume 即失效（读侧的一次性语义）。',
        concept: 'lc-barrier-channels',
      },
    ],
    [
      ['NamedBarrierValue', '静态名单屏障：names 编译期固定，seen 集齐才可读；consume 清空复用'],
      [
        'NamedBarrierValueAfterFinish',
        '屏障 + finish 门控：集齐且 finish() 被调用才放行，defer 节点的 join 专用',
      ],
      ['DynamicBarrierValue', '动态名单屏障：两态机 priming/waiting，名单经 WaitForNames 运行时下发'],
      ['join:<a+b>:<c>', 'addEdge 数组形式编译出的屏障通道名，+ 连接各起点名'],
    ],
    [
      '以为 join 边「谁先到谁先触发终点」——屏障要求全部起点本步到齐，差一个终点就不跑；BSP 模型下等待天然按超步对齐',
      '把数据挂在屏障通道上传递——它的 ValueType 是 void，get 返回 undefined，节点间传数据要靠状态通道',
      '给 DynamicBarrier 一步下发多个 WaitForNames——直接抛错；名单变化必须跨超步逐步下发',
    ],
  ),
  'theory',
)
