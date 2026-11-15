import { L, withKind } from '../../course-builders.ts'

export const L48 = withKind(
  L(
    'L48',
    13,
    'entry/exit 决策：为什么入口由第一个 beforeAgent 决定',
    3,
    ['L47'],
    ['lc-entry-exit'],
    [
      '复述入口三段决策（beforeAgentNodes[0] → beforeModelNodes[0] → AGENT_NODE_NAME）与出口决策（最后一个 afterAgent 或 END）',
      '解释 entryNode 与 loopEntryNode 的区别，以及这个区别如何保证 beforeAgent 每次 invoke 只执行一次',
      '画出 model router 与 tools router 的完整分支：extract- 前缀工具、v1/v2 分发差异、returnDirect 与 responseFormat 的交互',
    ],
    `L47 看完 hook 节点怎么出生，本课看它们被接到哪：一张 agent 图的入口、出口与循环回边是怎么定的。核心结论：**这张图有三个「门户」变量——entryNode（每次 invoke 进一次）、loopEntryNode（每轮循环进一次）、exitNode（终局出一次）——beforeAgent 只出现在 entryNode 上，这就是它「每次 invoke 恰好执行一次」的全部机制**，没有任何额外计数器。

### 入口三段决策与出口决策

先看总开关，这段代码是本课标题的答案：

\`\`\`ts
// Determine the entry node (runs once at start): before_agent -> before_model -> model_request
let entryNode: string;
if (beforeAgentNodes.length > 0) {
  entryNode = beforeAgentNodes[0].name;
} else if (beforeModelNodes.length > 0) {
  entryNode = beforeModelNodes[0].name;
} else {
  entryNode = AGENT_NODE_NAME;
}

// Determine the loop entry node (beginning of agent loop, excludes before_agent)
const loopEntryNode =
  beforeModelNodes.length > 0 ? beforeModelNodes[0].name : AGENT_NODE_NAME;

// Determine the exit node (runs once at end): after_agent or END
const exitNode =
  afterAgentNodes.length > 0
    ? afterAgentNodes[afterAgentNodes.length - 1].name
    : END;

allNodeWorkflows.addEdge(START, entryNode);
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:420-441（commit 7704471）*

为什么入口由第一个 beforeAgent 决定？语义对称性：入口是「agent 生命周期的第一个动作」，而 beforeAgent 的文档语义正是 called once at the start of the agent invocation（types.ts:587）。有节点能表达这个语义时，START 直连它是最短实现——不需要任何「已执行」标记。注意取的是 \`beforeAgentNodes[0]\`：**多个 beforeAgent 按注册顺序串成链，第一个进门**；beforeModel 只在没有任何 beforeAgent 时顶替入口位。出口同理取最后一个 afterAgent——收尾管道的末端。

### 两个入口的分工：beforeAgent 为何天然只跑一次

entryNode 与 loopEntryNode 的差集就是 beforeAgent 系列。接边代码印证了这一点：

\`\`\`ts
// Connect afterAgent nodes ... (reverse order like afterModel)
...
// add edges for tools node (includes both registered tools and dynamic tools via middleware)
if (hasToolsAvailable) {
  // Tools should return to loop entry node (not including before_agent)
  const toolReturnTarget = loopEntryNode;
  if (shouldReturnDirect.size > 0) {
    allNodeWorkflows.addConditionalEdges(
      TOOLS_NODE_NAME,
      this.#createToolsRouter(shouldReturnDirect, exitNode, toolReturnTarget),
      [toolReturnTarget, exitNode as string]
    );
  } else {
    allNodeWorkflows.addEdge(TOOLS_NODE_NAME, toolReturnTarget);
  }
}
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:603-685（commit 7704471，有裁剪）*

注释「not including before_agent」一语道破：工具循环的回边指向 loopEntryNode，所以每轮「beforeModel → model_request → tools」的循环都不再路过 beforeAgent——它的单次语义完全由拓扑保证，失败恢复（checkpoint resume）时同样成立，因为恢复走的是图状态而不是重新从 START 进。另一个细节：loopEntryNode 取的是 beforeModelNodes[0]，也就是说**多轮循环里 beforeModel 系列每一轮都按注册顺序完整重放**，这与 afterModel 的逆序重放形成镜像。

beforeAgent 链内部的接线还有一层结构值得看，它解释了「多个 beforeAgent 之间如何串、最后一个接到哪」：

\`\`\`ts
for (let i = 0; i < beforeAgentNodes.length; i++) {
  const node = beforeAgentNodes[i];
  const isLast = i === beforeAgentNodes.length - 1;
  const nextDefault = isLast ? loopEntryNode : beforeAgentNodes[i + 1].name;
  ...
}
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:449-472（commit 7704471，有裁剪）*

链条的默认出边是 \`nextDefault\`：非末节点指向下一个 beforeAgent 节点，末节点指向 **loopEntryNode 而不是 model_request**。这个落点选择很关键——最后一个 beforeAgent 结束后进入的是循环起点，如果它声明的 canJumpTo 白名单里有合法跳转，接边处会改成条件边：\`allowedMapped\` 把白名单目标经 parseJumpToTarget 映射后过滤掉 tools（无可用工具时剔除，与 L50 的降级规则同源），END 统一替换为 exitNode。同时别忘了 \`hasToolsAvailable\` 的定义就在这几行之前：\`clientTools.length > 0 || hasWrapToolCallMiddleware\`（ReactAgent.ts:444-447）——动态工具也算可用，这与 L46 的 ToolNode 创建条件是同一个判据的复用。把这些接边规则连起来读，你就有了手工画出任意中间件组合图拓扑的完整能力：入口三段回退定 START、链条 nextDefault 定串行顺序、loopEntryNode 定回边、exitNode 定终局。

### model router：循环中枢的分支树

模型输出后走哪条路，由 \`#createModelRouter\` 决定（没有 afterModel 时直接从 model_request 出边，有 afterModel 时这段逻辑由 afterModel 路由器复用）：

\`\`\`ts
return (state) => {
  const lastMessage = messages.at(-1);
  if (
    !AIMessage.isInstance(lastMessage) ||
    !lastMessage.tool_calls ||
    lastMessage.tool_calls.length === 0
  ) {
    return exitNode;
  }
  const hasOnlyStructuredResponseCalls = lastMessage.tool_calls.every(
    (toolCall) => toolCall.name.startsWith("extract-")
  );
  if (hasOnlyStructuredResponseCalls) {
    return exitNode;
  }
  if (this.#toolBehaviorVersion === "v1") {
    return TOOLS_NODE_NAME;
  }
  const regularToolCalls = lastMessage.tool_calls.filter(
    (toolCall) => !toolCall.name.startsWith("extract-")
  );
  if (regularToolCalls.length === 0) { return exitNode; }
  return regularToolCalls.map(
    (toolCall) => new Send(TOOLS_NODE_NAME, { lg_tool_call: toolCall })
  );
};
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:851-896（commit 7704471，有裁剪）*

分支顺序就是优先级：无 tool_calls 即终局 → exitNode；全是提取工具 → exitNode（AgentNode 内部消化，L45 讲过的 tool 策略路径）；v1 整消息进 ToolNode；v2 逐调用 Send。**extract- 前缀是结构化输出与工具循环的分界线**——如果模型把提取工具和普通工具混在一次回复里，router 会滤掉前者只把后者送进 ToolNode。

### tools router：returnDirect 的两个出口

工具端的路由器只有 returnDirect 一个变数：

\`\`\`ts
return (state) => {
  const lastMessage = messages[messages.length - 1];
  if (
    ToolMessage.isInstance(lastMessage) &&
    lastMessage.name &&
    lastMessage.status !== "error" &&
    shouldReturnDirect.has(lastMessage.name)
  ) {
    // If we have a response format, route to agent to generate structured response
    // Otherwise, return directly to exit node (could be after_agent or END)
    return this.options.responseFormat ? toolReturnTarget : exitNode;
  }
  return toolReturnTarget;
};
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:820-840（commit 7704471，有裁剪）*

三个细节与 L45 呼应：status 非 error 才算成功（失败的 returnDirect 回模型自我修正）；配置了 responseFormat 时即使 returnDirect 成功也要绕回 toolReturnTarget——让模型基于工具结果补一轮结构化提取；exitNode 而非字面 END 意味着 returnDirect 终局同样会经过 afterAgent 收尾管道。把四个门户变量连起来，一次带三个中间件（A.beforeAgent+B.beforeModel+C.afterAgent）的完整生命周期就是：START → A.before_agent → B.before_model → model_request → C.after_agent → END；若模型调了工具，中段变成循环 A.before_model → model_request → tools → A.before_model → ...，A.before_agent 永远只在开头出现一次。

与相邻课的衔接上还有一条设计动机值得点破：为什么把「循环入口」从「生命周期的入口」里拆出来？如果只有 entryNode 一个变量，工具回边也只能连它，那么 beforeAgent 与 beforeModel 两个语义就只能二选一——要么每次循环重放 beforeAgent（语义被稀释，状态注入反复发生），要么干脆不给 beforeAgent 独立槽位。拆成两个门户变量后，「整轮一次」与「每轮一次」成为正交的两个拓扑位置，中间件作者不必再为了规避重复执行而把一次性的状态初始化塞进 beforeModel——hook 语义与执行次数一一对应，这正是 L47 hook 节点化设计的收尾一笔。

### 本课小结

- 入口三段回退：beforeAgentNodes[0] → beforeModelNodes[0] → model_request；出口取最后一个 afterAgent 或 END；工具回边指向刻意排除 beforeAgent 的 loopEntryNode。
- beforeAgent 的「只执行一次」由拓扑保证（它只出现在 START 出边与 beforeAgent 链内部），没有运行时计数器，resume 语义也一致。
- model router 的优先级：无 tool_calls 终局 → extract- 全提取终局 → v1 整消息 / v2 逐调用 Send；extract- 前缀是结构化输出不进 ToolNode 的分界线。
- tools router 里 returnDirect 成功且无 responseFormat 才直奔 exitNode，否则回 loopEntryNode 让模型做结构化提取。
- 下一课转到状态面：内置状态只有 messages 与 structuredResponse 两个字段，middleware 的私有状态如何并进这三份 schema。
`,
    null,
    [
      {
        text: '没有任何中间件定义 beforeAgent，但有中间件定义了 beforeModel 时，START 连到哪里？',
        options: [
          '直接连 model_request',
          '连到第一个 beforeModel 节点',
          '连到最后一个 beforeModel 节点',
          '连到第一个 afterModel 节点',
        ],
        answer: 1,
        explain:
          'entryNode 的三段回退是 if (beforeAgentNodes.length > 0) 取 beforeAgentNodes[0].name；else if (beforeModelNodes.length > 0) 取 beforeModelNodes[0].name；else AGENT_NODE_NAME。选项 A 忽略了 beforeModel 也能当入口；选项 C 方向错——入口取数组第一个（最先注册的）；选项 D 是模型输出端的节点，与入口无关。',
        concept: 'lc-entry-exit',
      },
      {
        text: '工具执行完毕后回到哪个节点？为什么不是 entryNode？',
        options: [
          '回到 entryNode，保证每次循环都重新跑一遍全部 hook',
          '回到 loopEntryNode（第一个 beforeModel 或 model_request），beforeAgent 因此只在 invoke 开始时执行一次',
          '回到 START',
          '回到第一个 afterAgent 节点',
        ],
        answer: 1,
        explain:
          '源码注释写明 Determine the loop entry node (beginning of agent loop, excludes before_agent)：loopEntryNode = beforeModelNodes.length > 0 ? beforeModelNodes[0].name : AGENT_NODE_NAME，tools 节点的回边连的是它（toolReturnTarget = loopEntryNode）。选项 A 会让 beforeAgent 在每轮循环重复执行，违背它 run once at the start of the agent invocation 的文档语义；选项 C/D 均无对应接线。',
        concept: 'lc-entry-exit',
      },
      {
        text: '模型回复的 tool_calls 全部以 extract- 开头时，model router 走向哪里？',
        options: [
          'tools 节点',
          'exitNode（可能是最后一个 afterAgent 节点，也可能是 END）',
          '回到 model_request 重试',
          '抛出异常',
        ],
        answer: 1,
        explain:
          '#createModelRouter 检查 hasOnlyStructuredResponseCalls = tool_calls.every(name.startsWith(extract-))，命中则 return exitNode——注释说明 The AgentNode will handle these internally and return the structured response。这些结构化提取工具由 AgentNode 在节点内部消化（L45 的 tool 策略路径），不该进 ToolNode 执行。选项 A 会把提取工具当普通工具执行；选项 C 是 errorHandler 重试路径的行为，不发生在路由层；选项 D 无依据。',
        concept: 'lc-entry-exit',
      },
      {
        text: 'v1 工具行为版本下，humanInTheLoopMiddleware 的 per_call 模式为什么被构造器禁止？',
        options: [
          'v1 不支持 interrupt',
          'v1 把一轮所有工具调用放进同一个任务执行，per-call interrupt 会共享同一个 ID',
          'v1 已弃用，全部中间件都被禁止',
          'per_call 模式只适用于 Python 版',
        ],
        answer: 1,
        explain:
          '构造器检查 #toolBehaviorVersion === v1 且存在名为 HumanInTheLoopMiddleware 且带 wrapToolCall 的中间件时抛错，错误消息原话：Version v1 runs every tool call in one task, so per-call interrupts would share an ID。v2 用 Send 把每个调用拆成独立任务，interrupt 才能按调用粒度隔离。选项 A 错——v1 支持 interrupt 但粒度不够；选项 C 过度推断，被禁的只有这个组合；选项 D 与 TS 实现无关。',
        concept: 'lc-entry-exit',
      },
    ],
    [
      [
        'entryNode',
        'START 直连的节点：第一个 beforeAgent 节点，回退到第一个 beforeModel 节点，再回退到 model_request；每次 invoke 只经过一次',
      ],
      [
        'loopEntryNode',
        '工具循环的回边目标：第一个 beforeModel 节点或 model_request；刻意排除 beforeAgent 系列',
      ],
      [
        'exitNode',
        '终局出口：最后一个 afterAgent 节点名，无 afterAgent 时为 END；所有「结束」语义的边都指向它而非直接指 END',
      ],
      [
        'extract- 前缀',
        '结构化输出 ToolStrategy 生成的提取工具命名约定，model router 识别到它后不进 ToolNode，交给 AgentNode 内部消化',
      ],
    ],
    [
      '以为有 beforeModel 时入口仍可能跳过 beforeAgent——决策是三段回退不是叠加：有 beforeAgent 节点时入口就是它，beforeModel 只影响 loopEntryNode',
      '把 jumpTo: end 理解为「直接到 END」——在多数路由器里 end 会被映射到 exitNode，让最后注册的 afterAgent 收尾钩子仍有机会执行；只有第一个 afterAgent 节点的白名单跳转里 END 才是字面 END',
      '在 v1 版本下并行使用多个工具调用加 per_call 人工审批——不是报错在运行期，而是构造期直接抛错，迁移旧 agent 时要先确认 toolBehaviorVersion',
    ],
  ),
  'theory',
)
