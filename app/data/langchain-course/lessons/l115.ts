import { L, withKind } from '../../course-builders.ts'

export const L115 = withKind(
  L(
    'L115',
    31,
    'Executor 开关 → middleware 生态全景映射',
    2,
    ['L112'],
    ['lc-executor-switch-mapping'],
    [
      '能逐项说出 AgentExecutor 构造开关（maxIterations/earlyStoppingMethod/handleParsingErrors/handleToolRuntimeErrors/returnIntermediateSteps）在 1.x 的 middleware 或图级对应物',
      '能按「模型调用切面 / 工具调用切面 / 上下文切面 / 人工介入」给 middleware/index.ts 导出的 20+ middleware 分类',
      '拿到一个 AgentExecutor 配置时，能写出等价的 createAgent + middleware 组合并说明组合顺序的含义',
    ],
    `### 一、开关的黄昏：AgentExecutor 的参数面

L112 迁移了 AgentExecutor 的主循环，本课处理它剩下的「配置面」。先把旧开关一字排开（全部来自 \`langchain-classic/src/agents/executor.ts:352-398\` 的类字段）：

\`\`\`ts
export class AgentExecutor extends BaseChain<ChainValues, AgentExecutorOutput> {
  agent: BaseSingleActionAgent | BaseMultiActionAgent;
  tools: this["agent"]["ToolType"][];
  returnIntermediateSteps = false;
  maxIterations?: number = 15;
  earlyStoppingMethod: StoppingMethod = "force";
  handleParsingErrors:
    | boolean | string
    | ((e: OutputParserException | ToolInputParsingException) => string) = false;
  handleToolRuntimeErrors?: (e: Error) => string;
\`\`\`

*— langchain-classic/src/agents/executor.ts:352-394（commit 7704471，节选）*

七个字段的共同点：它们都是**对同一个 while 循环的全局开关**。maxIterations 数循环圈数，handleParsingErrors 决定解析失败时抛出还是回喂，returnIntermediateSteps 决定要不要把过程塞进结果。1.x 里 while 循环被 LangGraph 图取代（L105），而「图执行过程」被切成六个 hook 切面（L52：wrapModelCall/wrapToolCall/beforeAgent/beforeModel/afterModel/afterAgent）——于是每个开关的新家都是一个挂在特定切面上的 middleware。

### 二、middleware 生态全景：按切面归位

\`langchain/src/agents/middleware/index.ts:1-126\` 是 1.x middleware 的总目录，导出清单逐行核实如下（行号为该 middleware 在 index.ts 中的导出行）：

| 切面 | middleware（index.ts 导出行） | 接管的旧开关/旧能力 |
|---|---|---|
| 工具调用（wrapToolCall） | toolRetryMiddleware（:69）、toolErrorMiddleware（:73）、toolEmulatorMiddleware（:78）、toolCallLimitMiddleware（:48） | handleToolRuntimeErrors、handleParsingErrors 的工具侧语义、maxIterations 的工具侧预算 |
| 模型调用（wrapModelCall/beforeModel） | modelRetryMiddleware（:65）、modelFallbackMiddleware（:62）、modelRefusalMiddleware（:63）、modelRouterMiddleware（:86）、llmToolSelectorMiddleware（:15）、providerToolSearchMiddleware（:91）、openAIModerationMiddleware（:99） | 旧架构无对应物（LLMChain 的 fallbacks 探测代码 llm_chain.ts:61-68 是唯一前身） |
| 上下文（beforeModel） | summarizationMiddleware（:6）、contextEditingMiddleware（:41）、piiMiddleware（:19）、piiRedactionMiddleware（:37）、dynamicSystemPromptMiddleware（:11） | BufferMemory/WindowMemory/SummaryMemory 族（L109-L110） |
| 行为控制 | modelCallLimitMiddleware（:59）、autoModeMiddleware（:82）、todoListMiddleware（:54） | maxIterations 的模型调用预算、实验性自主 agent（L114 提到的 experimental/） |
| 人工介入 | hitl（:4 导出自 hitl.ts） | 旧架构无对应物 |
| 提供商专属 | anthropicPromptCachingMiddleware（:103）、bedrockPromptCachingMiddleware（:107）、openAIAutoModeMiddleware（:118）、openAIModelRouterMiddleware（:122） | 旧架构无对应物 |

这张表的读法：**列三是「迁移映射」，列二剩余部分是「纯新增能力」**。旧开关全部有 middleware 归宿，但 middleware 生态远大于旧开关集合——台账证据 23 统计的 20+ 预置 middleware 里，一半以上是旧架构根本没有的能力（PII 脱敏、模型路由、人工审批、提供商缓存）。迁移不只是搬家，还是能力升级。

### 三、逐项映射走读：从 onError 类型看语义保真

以错误处理为例验证映射的语义精度。旧开关：

\`\`\`ts
handleParsingErrors:
  | boolean | string
  | ((e: OutputParserException | ToolInputParsingException) => string) = false;
\`\`\`

*— langchain-classic/src/agents/executor.ts:383-390（commit 7704471）*

三态语义：false 抛出、true/字符串回喂固定文案、函数回喂定制文案。1.x 的新形态：

\`\`\`ts
export type ToolErrorHandler = (
  error: unknown,
  request: ToolCallRequest
) => MessageContent | void | Promise<MessageContent | void>;

export function toolErrorMiddleware(config: ToolErrorMiddlewareConfig) {
  return createMiddleware({
    name: "toolErrorMiddleware",
    wrapToolCall: async (request, handler) => { ... },
  });
}
\`\`\`

*— langchain/src/agents/middleware/toolError.ts:17-72（commit 7704471，节选）*

对照阅读：旧的三态开关变成了一个函数——返回 MessageContent 等价于旧 true/string（错误变 ToolMessage 喂回模型），返回 void 等价于旧 false（透传异常）。但升级点有三：错误类型从两种枚举放宽为 unknown；作用域从全局开关变成可按工具过滤（\`tools?: Array<ClientTool | ServerTool | string>\`，toolError.ts:33-35）；挂载点从 executor 内部硬编码变成标准 wrapToolCall 切面，可与 retry/限流任意组合。JSDoc 还给出组合规约：**「要重试后兜错，把 toolRetryMiddleware({ onFailure: \\"error\\" }) 放在本 middleware 之后」**（toolError.ts:60-63）——middleware 的数组顺序就是包裹的内外层，这是旧开关完全不存在的新维度。

重试一侧的配置面同样比旧版细：toolRetryMiddleware 的 schema（toolRetry.ts:30-59）里 onFailure 支持 \\"error\\"/\\"continue\\"/自定义函数三路，外加两个已废弃别名 \\"raise\\"/\\"return_message\\"——连弃用别名都写进了 zod schema，迁移时旧代码里的字符串能被类型检查兜住。

### 四、组合示范：一个「全开关」Executor 的翻译

把最复杂的旧配置翻成新形态，体会逐项映射的实际手感：

\`\`\`ts
// 旧：AgentExecutor 全开关
const executor = new AgentExecutor({
  agent: createToolCallingAgent({ llm, tools, prompt }),
  tools,
  maxIterations: 8,
  handleParsingErrors: "Tool failed, please retry with valid arguments.",
  returnIntermediateSteps: true,
});
\`\`\`

\`\`\`ts
// 新：createAgent + middleware 组合
import { createAgent } from "langchain";
import {
  toolErrorMiddleware,
  toolRetryMiddleware,
  toolCallLimitMiddleware,
} from "langchain";

const agent = createAgent({
  model,                       // 旧 llm + agent 协议的合体
  tools,
  middleware: [
    toolCallLimitMiddleware({ limit: 8 }),          // ← maxIterations 的工具侧
    toolRetryMiddleware({ maxAttempts: 2, onFailure: "error" }), // 重试在内层
    toolErrorMiddleware({
      onError: () =>
        "Tool failed, please retry with valid arguments.", // ← handleParsingErrors
    }),
  ],
});
for await (const step of agent.stream({ messages: [...] })) {
  // ← returnIntermediateSteps 的替代：中间步骤默认流式可见
}
\`\`\`

（新代码按 langchain/src/agents/index.ts:89-106 的 JSDoc 示例形状与 middleware/index.ts:47-76 的导出名编写。）注意两点差异：其一，recursionLimit 没出现在这段代码里——图级默认值在绝大多数场景够用，只有需要全局硬上限时才在 invoke 时传 \`recursionLimit\`；其二，旧 maxIterations: 8 这里翻译成了工具调用限制而非图步限制，因为旧计数器的语义本来就是「循环圈数≈工具往返数」，翻译要按语义不按名字。

### 五、模型切面补遗：modelRetry/modelFallback 与弃用别名的运行时处理

工具切面之外，模型切面也有两个旧架构没有的容错件值得抽样。modelRetryMiddleware（modelRetry.ts:126 导出实现）与 modelFallbackMiddleware（modelFallback.ts:37）分工明确：前者管「同一次调用的重试」（maxAttempts 配置），后者管「换了模型再试」——fallbacks 列表逐个兜底，modelFallback.ts:78 的注释明确语义：*If no fallbacks were provided, re-throw the original error*（没有兜底列表就把原始错误重抛）。对照旧架构：LLMChain 构造参数里的 fallbacks 探测代码（llm_chain.ts:61-68）是旧版唯一的容错面，且它埋在链的内部不可组合；新架构把「重试几次」和「换谁兜底」拆成两个独立 middleware，各自可按模型/条件过滤。这两个件与工具侧的 toolRetry/toolError 构成完整的 2×2 容错矩阵——模型重试、模型兜底、工具重试、工具兜错，四个切面互不侵入，这是旧版一个 handleParsingErrors 开关完全无法表达的正交性。

另一个值得写的细节是弃用别名的运行时处理方式。toolRetryMiddleware 的 config schema（toolRetry.ts:41-51）里 onFailure 的 \`"raise"\` 与 \`"return_message"\` 两个旧值已标 \`@deprecated\`，但实现体没有粗暴拒绝，而是在运行时做一次归一化并打印警告（toolRetry.ts:179-189）：

\`\`\`ts
let onFailure = onFailureConfig;
if (onFailureConfig === "raise") {
  console.warn("⚠️ \`onFailure: 'raise'\` is deprecated. Use \`onFailure: 'error'\` instead.");
  onFailure = "error";
} else if (onFailureConfig === "return_message") {
  console.warn("⚠️ \`onFailure: 'return_message'\` is deprecated. Use \`onFailure: 'continue'\` instead.");
  onFailure = "continue";
}
\`\`\`

*— langchain/src/agents/middleware/toolRetry.ts:179-189（commit 7704471，节选）*

这是 1.x 对旧配置的典型态度：**接受迁移期的旧写法，但把正确路径显式教给你**——运行时不炸、警告指路、语义归一。迁移 AgentExecutor 配置时遇到任何「看起来没有对应物」的旧值，先搜 middleware 源码里的 deprecated 标记，大概率这里已经铺好了兼容桥。这个模式与 L117 讲的报错占位正好构成光谱两端：占位文件是「此路已断、给你新家」，deprecated 别名是「此路还通、劝你换道」。

### 本课小结

- AgentExecutor 七个开关（executor.ts:352-398）全部有 middleware/图级归宿：maxIterations → recursionLimit + toolCallLimitMiddleware，handleParsingErrors/handleToolRuntimeErrors → toolErrorMiddleware，returnIntermediateSteps → stream() 默认行为。
- middleware/index.ts:1-126 是全景目录：工具切面、模型切面、上下文切面、行为控制、人工介入、提供商专属六大类；旧开关只覆盖其中一小半，另一半是 1.x 纯新增能力。
- 错误处理映射的语义保真度极高（三态开关 → 返回内容/返回 void），且多了作用域过滤与组合顺序两个新维度——middleware 数组顺序 = 包裹内外层。
- 下一课进入结构化输出的换代：StructuredOutputParser 的解析器思路如何被 responseFormat 的双策略（ToolStrategy/ProviderStrategy）取代。
`,
    null,
    [
      {
        text: 'AgentExecutor 的 maxIterations = 15（classic agents/executor.ts:367 附近）在 1.x 的对应物是？',
        options: [
          'createAgent({ maxIterations: 15 }) 参数原样保留',
          '图级 recursionLimit + 工具级 toolCallLimitMiddleware 两层预算闸',
          '没有对应物，1.x 无限循环直到模型自己停',
          'summarizationMiddleware 的 token 上限',
        ],
        answer: 1,
        explain:
          '旧架构只有一个粗粒度的迭代计数；1.x 把它细化成两层——LangGraph 图的 recursionLimit（模块三 L32 讲过 RunnableLambda 委托时的默认 25）管整个图的步数，toolCallLimitMiddleware（middleware/index.ts:48-51 导出，middleware/toolCallLimit.ts）管模型工具调用次数，且可以按工具名分别设限。A 错：createAgent 没有 maxIterations 参数；C 错：图执行始终受 recursionLimit 约束；D 错：summarization 管上下文长度不管执行预算。',
        concept: 'lc-executor-switch-mapping',
      },
      {
        text: 'handleParsingErrors / handleToolRuntimeErrors 两个开关的 1.x 形态是什么？',
        options: [
          '合并成 createAgent 的 onError 参数',
          '分别变成 toolErrorMiddleware（middleware/toolError.ts:72，onError 返回内容则转成错误 ToolMessage 喂回模型）与 toolRetryMiddleware（toolRetry.ts:162）等工具切面 middleware',
          '被 try/catch 取代，用户在工具函数里自己 catch',
          '由 AgentNode 内部硬编码处理，不可配置',
        ],
        answer: 1,
        explain:
          'toolErrorMiddleware 的 ToolErrorHandler 类型（toolError.ts:17）签名就是 (error, request) => MessageContent | void——返回内容把错误转成 ToolMessage 喂回模型（对应旧 handleParsingErrors 的 true/string 语义），返回空则原样抛出（对应 false 语义）。重试语义由 toolRetryMiddleware 承接，其 onFailure 支持 "error"/"continue"/自定义函数（toolRetry.ts:30-59），且官方注释明确：要先重试后兜错就把 toolRetryMiddleware({ onFailure: "error" }) 放在 toolErrorMiddleware 之后。C 错：1.x 刻意把错误策略从工具实现里解耦出来；D 错：AgentNode 不管工具错误。',
        concept: 'lc-executor-switch-mapping',
      },
      {
        text: 'middleware/index.ts 导出的 middleware 按 hook 切面分类，下列哪一组全是「模型调用切面」（wrapModelCall/beforeModel/afterModel 系）？',
        options: [
          'toolRetryMiddleware、toolEmulatorMiddleware、toolErrorMiddleware',
          'modelRetryMiddleware、modelFallbackMiddleware、modelRouterMiddleware、llmToolSelectorMiddleware',
          'summarizationMiddleware、piiMiddleware、hitl',
          'todoListMiddleware、autoModeMiddleware、contextEditingMiddleware',
        ],
        answer: 1,
        explain:
          'middleware/index.ts:14-17 导出 llmToolSelectorMiddleware、:62-67 导出 modelFallback/modelRefusal/modelRetry、:85-89 导出 modelRouter——它们都拦截「选模型/发请求/收响应」这个切面。A 组是 wrapToolCall 切面（:68-80）；C 组里 summarization 与 pii 是上下文切面（beforeModel 改消息），hitl 是人工介入切面；D 组里 todoList/autoMode 是行为控制、contextEditing 是上下文切面，混了多个切面。',
        concept: 'lc-executor-switch-mapping',
      },
      {
        text: 'returnIntermediateSteps = true（executor.ts:365）的 1.x 对应物是？',
        options: [
          'agent.stream() 默认就吐出每步状态更新（LangGraph 流模式），无需开关',
          '需要开启 debug 日志',
          '对应 middleware 的 tracePolicy',
          '没有对应物，中间步骤不可见',
        ],
        answer: 0,
        explain:
          '旧架构把中间步骤攒在最终输出里（returnIntermediateSteps），是「结果附加物」思路；1.x 的 agent 是编译图，stream() 天然按节点/超步吐出 messages 等状态增量（模块六 L78 的流模式），中间步骤从「要主动索取」变成「默认可见」。B/C 错：debug 日志与 tracePolicy 不是数据通道；D 错：恰恰相反，可见性是升级而非丢失。',
        concept: 'lc-executor-switch-mapping',
      },
    ],
    [
      [
        'earlyStoppingMethod',
        'AgentExecutor 达到 maxIterations 后的止损策略（executor.ts:369，默认 "force"）；1.x 由 recursionLimit 触发 GraphRecursionError 承接',
      ],
      [
        'ToolErrorHandler',
        'toolErrorMiddleware 的处理函数类型（toolError.ts:17）：(error, request) => MessageContent | void，返回内容即转错误 ToolMessage，返回空即透传异常',
      ],
      [
        'wrapToolCall',
        '六个 middleware hook 之一：包裹每次工具执行，toolError/toolRetry/toolEmulator/toolCallLimit 全部挂在这个切面',
      ],
    ],
    [
      '把 toolRetryMiddleware 放在 toolErrorMiddleware 前面——官方注释（toolError.ts:60-63）明确：要先重试后兜错，retry 必须放在 error 之后（外层）；顺序反了错误会先被吞掉',
      '用 recursionLimit 精确限制工具调用次数——它数的是图步数不是工具调用；要按次数/按工具名限制必须用 toolCallLimitMiddleware',
      '以为 middleware 组合顺序无关紧要——beforeModel/wrapToolCall 等切面按数组顺序层层包裹，错误处理与重试的内外层关系完全由顺序决定',
    ],
  ),
  'framework',
)
