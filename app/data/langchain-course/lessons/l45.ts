import { L, withKind } from '../../course-builders.ts'

export const L45 = withKind(
  L(
    'L45',
    13,
    'AgentNode：模型调用与工具循环决策的 1107 行',
    3,
    ['L41'],
    ['lc-agent-node'],
    [
      '说出 AgentNode 在图中的节点名（model_request）、输出形状（Command 数组或结构化更新）与三个执行出口',
      '解释 wrapModelCall 洋葱的组装顺序（从后往前包、第一个中间件在最外层）与工具增改的两条校验规则',
      '复述结构化输出 native/tool 两策略的解析路径与 errorHandler 四种取值的行为差异',
      '解释 #areMoreStepsNeeded 的两个阈值（<1 与 <2）分别保护哪种场景',
    ],
    `L41 我们看到构造器把中间件 hook 展开成一张图；本课走进这张图真正的发动机——\`nodes/AgentNode.ts\`，1107 行，是整个 agents 目录最大的节点文件。一句话核心结论：**AgentNode 不只是「调一次模型」，它同时是 wrapModelCall 洋葱的编排器、结构化输出的解析器、步数保护的执行者和工具循环的第一决策点**——理解了它，模块五所有 wrap 型中间件的行为才有锚点。

### 节点身份：model_request 与 RunnableCallable 底座

AgentNode 在图里的注册名是常量 \`AGENT_NODE_NAME\`，值不是直觉的 "agent"，而是 "model_request"：

\`\`\`ts
export const AGENT_NODE_NAME = "model_request";

export class AgentNode<...> extends RunnableCallable<
  InternalAgentState<StructuredResponseFormat>,
  | Command[]
  | { messages: BaseMessage[]; structuredResponse: StructuredResponseFormat }
> {
  constructor(options: AgentNodeOptions<...>) {
    super({
      name: options.name ?? "model",
      func: (input, config) => this.#run(input, config as RunnableConfig),
    });
    this.#options = options;
    this.#systemMessage = options.systemMessage;
  }
\`\`\`

*— libs/langchain/src/agents/nodes/AgentNode.ts:95-159（commit 7704471）*

两个细节值得停一下。其一，节点名是 \`model_request\`，而回调树里显示的名字默认是 "model"（\`options.name ?? "model"\`）——前者是图拓扑里的跳转目标（L50 的 \`jumpTo: "model"\` 就映射到它），后者是观测层面的可读名，两套命名不要混淆。其二，输出类型是联合：\`Command[]\` 或 \`{ messages, structuredResponse }\`。这就是后文三个出口的类型化表达：多数路径返回 Command 数组（每个 Command 携带一部分状态更新），只有结构化输出的终局路径返回普通更新字典。

### #run：一次执行的三个出口

\`#run\` 是节点入口，开头就有一个容易被忽略的短路分支——上一轮刚执行过成功的 returnDirect 工具时，**不再调用模型**：

\`\`\`ts
const lastMessage = state.messages.at(-1);
if (
  lastMessage &&
  ToolMessage.isInstance(lastMessage) &&
  lastMessage.name &&
  lastMessage.status !== "error" &&
  this.#options.shouldReturnDirect.has(lastMessage.name)
) {
  return [new Command({ update: { messages: [] } })];
}
\`\`\`

*— libs/langchain/src/agents/nodes/AgentNode.ts:247-256（commit 7704471）*

注意 \`status !== "error"\` 这个条件：**失败的 returnDirect 调用不享受短路**，照常回模型让它自我修正。图级路由里也有对称逻辑（ReactAgent 的 \`#createToolsRouter\` 同样检查 status），两处共同保证「returnDirect 只对成功结果生效」。

第一个出口是结构化输出终局。当响应是 \`{ structuredResponse, messages }\` 形状时，返回普通更新字典——源码注释解释了为什么不用 Command：

> structuredResponse — return as a plain state update dict (not a Command) because the structuredResponse channel uses UntrackedValue(guard=true) which only allows a single write per step.

*— libs/langchain/src/agents/nodes/AgentNode.ts:261-280（commit 7704471）*

这是 L49 要展开的通道语义在节点层的投影：UntrackedValue 带 guard 就是不允许多写，Command 与普通更新如果混用可能触发重复写入，所以这里刻意选了字典。

第二个出口是常规路径：把 AI 回复包成 \`Command({ update: { messages: [aiMessage] } })\`；第三个出口是步数耗尽时注入一条 "Sorry, need more steps to process this request." 的 AIMessage（AgentNode.ts:292-308）。

### 步数保护：两个阈值各守一种死法

\`\`\`ts
#areMoreStepsNeeded(state, response) {
  const allToolsReturnDirect =
    AIMessage.isInstance(response) &&
    response.tool_calls?.every((call) =>
      this.#options.shouldReturnDirect.has(call.name)
    );
  const remainingSteps =
    "remainingSteps" in state ? (state.remainingSteps as number) : undefined;
  return Boolean(
    remainingSteps &&
    ((remainingSteps < 1 && allToolsReturnDirect) ||
      (remainingSteps < 2 && hasToolCalls(state.messages.at(-1))))
  );
}
\`\`\`

*— libs/langchain/src/agents/nodes/AgentNode.ts:965-981（commit 7704471）*

阈值不对称是有理由的：\`remainingSteps < 2 && hasToolCalls(...)\` 拦截普通工具循环——模型还想调工具但步数不够完成「调工具→执行→再总结」的两步闭环，提前拦下注入提示；\`remainingSteps < 1 && allToolsReturnDirect\` 则针对 returnDirect 全家桶——这种场景模型回复后只差「工具执行」一步就能出结果，所以允许拖到最后一格。**两个阈值合起来意味着：普通工具调用需要 2 步余量，returnDirect 只需要 1 步**。这是 recursionLimit 报错前最后一道软闸，比让 Pregel 直接抛 GraphRecursionError 体验好得多。

### wrapModelCall 洋葱：从后往前包，第一个中间件在最外层

\`#invokeModel\` 是本文件的重头戏。baseHandler 定义了「真正调模型」的最内层逻辑（校验模型没绑过工具、绑定工具、拼 systemMessage、raceWithSignal 包住 abort）。然后是洋葱组装：

\`\`\`ts
/**
 * Build composed handler from last to first so first middleware becomes outermost
 */
for (let i = wrapperMiddleware.length - 1; i >= 0; i--) {
  const middlewareEntry = wrapperMiddleware[i];
  const middleware = Array.isArray(middlewareEntry)
    ? middlewareEntry[0]
    : middlewareEntry;
  if (middleware.wrapModelCall) {
    const innerHandler = wrappedHandler;
    ...
    wrappedHandler = async (request) => {
      ...
      const runtime: Runtime<unknown> = Object.freeze({
        context, store, configurable, writer, interrupt, signal,
      });
      ...
      const middlewareResponse = await currentMiddleware.wrapModelCall(
        requestWithStateAndRuntime,
        handlerWithValidation as WrapModelCallHandler
      );
      ...
    };
  }
}
\`\`\`

*— libs/langchain/src/agents/nodes/AgentNode.ts:491-508, 700-708（commit 7704471，有裁剪）*

「第一个中间件在最外层」的语义是：数组顺序 = 请求流向。\`[auth, retry, cache]\` 的组合意味着 auth 先看到请求、最后看到响应，retry/cache 都在 auth 的内层。这与 L52 要讲的 wrapToolCall 组合方向一致。

洋葱的每一层还内嵌了一个 \`handlerWithValidation\` 校验层，干三件事。**第一，工具增改校验**：把 middleware 改过的 tools 与静态注册表对比，分 added（全新名字）与 replaced（同名不同实例）两类——added 必须存在某个 middleware 的 wrapToolCall 作执行者，否则抛错；replaced 无条件拒绝，报错信息明说 "This is not supported"，理由是保住 ToolNode 的执行身份（L46 细讲）。**第二，systemPrompt/systemMessage 互斥**：

\`\`\`ts
const hasSystemPromptChanged =
  req.systemPrompt !== currentSystemMessage.text;
const hasSystemMessageChanged =
  req.systemMessage !== currentSystemMessage;
if (hasSystemPromptChanged && hasSystemMessageChanged) {
  throw new Error(
    "Cannot change both systemPrompt and systemMessage in the same request."
  );
}
\`\`\`

*— libs/langchain/src/agents/nodes/AgentNode.ts:629-637（commit 7704471）*

这两个字段是同一份系统提示的两种视图，同时改等于改了两份不同内容，框架宁可拒绝也不猜你的意图。**第三，错误归属**：每一层维护一个 \`downstreamErrors\` Set，内部 handler 抛出的错误被记下再原样上抛；只有 middleware 自己产生的错误才被 \`MiddlewareError.wrap(error, currentMiddleware.name)\` 包裹。这样外层消费方（重试、日志）能准确区分「错误是哪一层造成的」，而不是让纯转发的中间件背锅。

另一个精巧处：当内层 handler 返回 Command（比如结构化输出重试）时，洋葱层会把 Command 收进 \`collectedCommands\` 并用追踪的 \`lastAiMessage\` 顶替返回——保证中间件永远看到 AIMessage 形状的响应，原始 Command 由框架另行传播（AgentNode.ts:689-694）。

### 结构化输出：native 与 tool 两条解析路径

baseHandler 里模型响应落地的解析分两支。native（ProviderStrategy）路径调 \`strategy.parse(response)\`，成功即返回结构化结果；失败时若模型已无 tool_calls（终局回复），抛 \`StructuredOutputParsingError\`——注释特意说明：**带 tool_calls 的失败不抛错**，因为循环还会继续，后续步骤还有机会产出合法结构（AgentNode.ts:416-444）。tool（ToolStrategy）路径按工具名过滤 tool_calls，出现多个结构化工具调用抛 \`MultipleStructuredOutputsError\`，单个则 parse 后补一条 ToolMessage 和一条总结 AIMessage（AgentNode.ts:806-844）。

解析失败的善后由 \`#handleToolStrategyError\` 收口，errorHandler 四种取值语义分明：\`false\` 直接 throw；\`undefined\`/\`true\` 用 error.message 回喂；字符串用该字符串回喂；函数用其返回值回喂但**必须返回 string**。三条重试路径殊途同归——都是 \`Command({ update: {...}, goto: AGENT_NODE_NAME })\`，把决策权交回模型而不是崩掉整个运行。

### 本课小结

- AgentNode 注册名 \`model_request\`，继承 RunnableCallable，输出是 Command 数组或结构化更新字典；returnDirect 工具成功后短路、失败不短路（AgentNode.ts:247-256）。
- wrapModelCall 洋葱从后往前包，数组第一个中间件在最外层；每层附带工具增改校验、systemPrompt/systemMessage 互斥校验与 downstreamErrors 错误归属。
- 结构化输出 native 失败仅在终局回复时抛错，tool 多调用抛 MultipleStructuredOutputsError；errorHandler=false 是唯一终止分支，其余都 goto 回 model_request 重试。
- 步数保护双阈值：普通工具调用需 remainingSteps ≥ 2，returnDirect 场景只需 ≥ 1。
- 下一课走进流水线的另一半：ToolNode 如何执行这些工具调用、错误如何变成回喂模型的数据。
`,
    null,
    [
      {
        text: '多个 middleware 定义了 wrapModelCall 时，洋葱的包裹顺序是？',
        options: [
          '按 middleware 数组顺序，第一个在最内层',
          '从后往前包裹，数组第一个 middleware 位于最外层',
          '随机顺序，取决于注册先后',
          '按 middleware 名字典序',
        ],
        answer: 1,
        explain:
          'AgentNode.#invokeModel 里用 for 循环从 wrapperMiddleware.length - 1 递减遍历，逐层把 wrappedHandler 包进去，注释明确写着 Build composed handler from last to first so first middleware becomes outermost。选项 A 方向反了，选项 C/D 在源码里没有任何依据。',
        concept: 'lc-agent-node',
      },
      {
        text: 'middleware 在 wrapModelCall 里新增了一个 client tool，框架的反应是？',
        options: [
          '直接允许，ToolNode 会自动执行',
          '一律抛错',
          '仅当存在某个 middleware 定义了 wrapToolCall 时才允许，否则抛错',
          '静默丢弃该工具',
        ],
        answer: 2,
        explain:
          'handlerWithValidation 会区分 added 与 replaced 两类工具：新增工具必须有 wrapToolCall 执行者才放行（报错信息明说 This is not supported unless a middleware provides a wrapToolCall handler），同名换实例的 replaced 工具则无条件拒绝以保住 ToolNode 的执行身份。选项 B 一刀切、选项 A 无校验、选项 D 不存在静默路径。',
        concept: 'lc-agent-node',
      },
      {
        text: 'AgentNode 返回结构化结果时为什么用普通 state 更新而不是 Command？',
        options: [
          'Command 只能携带 messages，装不下结构化数据',
          'structuredResponse 通道是 UntrackedValue(guard=true)，每步只允许一次写入',
          '因为 responseFormat 是可选的，Command 类型不支持可选字段',
          '历史遗留，没有原因',
        ],
        answer: 1,
        explain:
          '#run 的注释直接给出理由：structuredResponse 通道用 UntrackedValue(guard=true)，每步只允许一次写入，所以以普通更新字典的形式返回。选项 A 错误——Command 的 update 可以携带任意通道字段；选项 C 是编造的类型限制；选项 D 更是反事实，注释写得很清楚。',
        concept: 'lc-agent-node',
      },
      {
        text: 'errorHandler 设为 false 与 undefined 在 ToolStrategy 解析出错时的行为差异是？',
        options: [
          'false 重试、undefined 抛错',
          '都重试，只是错误消息不同',
          'false 直接抛出原错误终止运行；undefined 走默认重试——把错误消息作为 ToolMessage 回喂并 goto 回 model_request',
          'false 静默返回 undefined',
        ],
        answer: 2,
        explain:
          '#handleToolStrategyError 里 errorHandler === false 是唯一 throw 的分支，注释写明 Only throw if explicitly set to false；undefined（以及 true、数组含 MultipleStructuredOutputsError）都走默认重试路径，返回 goto: AGENT_NODE_NAME 的 Command。选项 A 把语义说反了，选项 B 忽略了 false 的终止语义，选项 D 无此行为。',
        concept: 'lc-agent-node',
      },
    ],
    [
      [
        'model_request',
        'AgentNode 在编译图中注册的节点名（AGENT_NODE_NAME），jumpTo 的 model 目标即映射到它',
      ],
      [
        'wrapModelCall 洋葱',
        '多个 wrapModelCall hook 逐层包裹 baseHandler 形成的调用链，第一个 middleware 是最外层，最内层才是真正的模型调用',
      ],
      [
        'downstreamErrors',
        'AgentNode 与 wrapToolCall 共用的错误归属机制：内部 handler 已抛出的错误穿透中间件时原样上抛，不包裹成 MiddlewareError',
      ],
      [
        'shouldReturnDirect',
        'AgentNodeOptions 里的 Set<string>，记录 returnDirect 工具名，用于跳过再次调用模型',
      ],
    ],
    [
      '以为 AgentNode 只是「调一次模型」——它还承担 wrapModelCall 编排、工具增改校验、结构化输出解析、步数保护四件事，问题排查时这四层都要看',
      '在 wrapModelCall 里同时改 systemPrompt 和 systemMessage——两者都被检测到变化时直接抛 Cannot change both systemPrompt and systemMessage in the same request',
      '给 openai: 前缀的模型字符串传实例化的预期行为——字符串会默认走 Responses API（useResponsesApi: true），想绕开必须传模型实例',
    ],
  ),
  'theory',
)
