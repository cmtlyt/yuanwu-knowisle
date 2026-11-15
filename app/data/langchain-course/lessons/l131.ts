import { L, withKind } from '../../course-builders.ts'

export const L131 = withKind(
  L(
    'L131',
    34,
    '流式与结构化输出：streamEvents + responseFormat 双策略接入',
    3,
    ['L130'],
    ['lc-capstone-stream-output'],
    [
      '实现研究情报助手的流式接入：streamEvents 的 v3 AgentRunStream 消费面（messages/toolCalls/output 三子流）与 v2 事件流的对照接法，产出流式 UI 的数据管线',
      '实现结构化输出的 providerStrategy 接入与 toolStrategy 降级路径：报告 schema（title/findings/confidence）经两策略分别跑通，断言 structuredResponse 结构等价',
      '写出流式与结构化的验收断言：token 级事件序列断言、toolCalls 子流断言、structuredResponse 字段约束断言，并入总套件形成 O 组',
    ],
    `### 定锚：给可运行骨架装上能力面

L130 的骨架六组断言全绿，本课加装最后两块能力：流式（UI 管线的数据源）与结构化输出（报告产物通道）。它们对应课程两条主线——L43/L18 讲过的流双通道，L96/L97 讲过的双策略。一句话核心结论：**流式的选型是「version 分派」（v3 AgentRunStream 或 legacy 事件流），结构化的选型是「能力协商」（providerStrategy 或 toolStrategy），两条选型链都钉在 ReactAgent 与 responses.ts 的源码上。**

### streamEvents 的 version 分派：源码走读

ReactAgent.streamEvents 的实现分派是本课第一段源码：

\`\`\`ts
streamEvents(state, config, streamOptions?) {
  if (config?.version !== "v3" || streamOptions != null) {
    const mergedConfig = this.#getGraphConfig(config);
    const version =
      config?.version === "v1" || config?.version === "v2"
        ? config.version
        : "v2";
    return this.#graph.streamEvents(
      state,
      { ...(mergedConfig), version },
      streamOptions
    );
  }
  // v3 分支：含 #initializeMiddlewareStates 预处理，
  // 返回 AgentRunStream（七子流消费面）
  return (async () => {
    // ... transformers / version 解构后
    return (await this.#graph.streamEvents(initializedState, {
      ...(mergedConfig),
      version: "v3",
      transformers: callSiteTransformers,
    })) as unknown as AgentRunStream<...>;
  })();
}
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:1460-1545（commit 7704471，有裁剪）*

三个读点。**读点一：默认 v2**——不传 version 落 legacy 事件流，这是兼容面最大的通道。**读点二：v3 才有中间件状态预处理**——v3 分支显式调用 \`#initializeMiddlewareStates\`，与 invoke 同构；v2 分支直接透传，中间件状态默认值语义有差异，接 UI 时要知道。**读点三：streamOptions 存在即走 legacy**——\`|| streamOptions != null\` 意味着部分高级选项只在 legacy 通道可用，选型时要核对选项清单。

### v3 消费面：UI 管线的三子流接法

研究助手的 UI 需要三样实时数据：模型逐 token 输出、工具调用进度、终态报告。v3 的接法：

\`\`\`ts
const run = await agent.streamEvents(
  { messages: [{ role: "user", content: "调研 agent memory 主题" }] },
  { version: "v3", configurable: { thread_id: "t-research-1" },
    context: { tenantId: "acme" } }
);

// 子流一：token 级文本（UI 打字机效果）
for await (const msg of run.messages) {
  for await (const token of msg.text) process.stdout.write(token);
}

// 子流二：工具调用（进度条：input 即时、output await）
for await (const call of run.toolCalls) {
  showSpinner(call.name, call.input);
  const result = await call.output;     // status: 完成态
  hideSpinner(call.name);
}

// 子流三：终态（报告与状态）
const finalState = await run.output;
// finalState.structuredResponse 由 responseFormat 注入（下一段接入）
\`\`\`

*— 消费骨架，依据 ReactAgent.ts:1360-1395 JSDoc 示例（commit 7704471）*

三个子流是独立异步通道——这正是 O 组断言「子流内有序、子流间齐全」设计的源码依据（quiz 辨析）。run.values 快照流与 run.middleware 生命周期流在本课不接 UI，但断言齐全性时要覆盖：middleware 子流应出现 before/after 事件对（citationGuard/toolRetry 的装订痕迹），这是流式视角下验证 middleware 顺序的唯一通道。三子流的类型化消费还有一个工程红利：**UI 组件与数据管线的解耦点天然清晰**——打字机组件只依赖 messages 子流的 token 迭代、进度条组件只依赖 toolCalls 子流的 input/output/status、报告面板只依赖 run.output，三个组件可以并行开发、各自单测，互不等待。相比之下 v2 事件流把所有信号塞进一个事件序贯流，组件要从混合流里各自挑事件——这是「新管线选 v3」在工程效率上的第二条论据（第一条是类型化消费面）。

### v2 legacy 事件流的对照接法

v3 不是唯一通道——很多既有 UI 管线与观测工具吃的是 v2 事件流，研究助手也要留出这条对照接法。v2 的消费对象是标准 StreamEvent，按事件名分发：

\`\`\`ts
// v2（默认版本）事件流：LangGraph streamEvents 透传
const eventStream = await agent.streamEvents(
  { messages: [{ role: "user", content: "调研 agent memory 主题" }] },
  { configurable: { thread_id: "t-research-1" } }   // 不传 version → 默认 v2
);

for await (const ev of eventStream) {
  switch (ev.event) {
    case "on_chat_model_stream":    // 模型 token 级事件
      break;                        // ev.data.chunk 里取文本增量
    case "on_tool_start":          // 工具开始（对应 v3 的 toolCall.input）
      break;
    case "on_tool_end":            // 工具结束（对应 v3 的 toolCall.output）
      break;
  }
}
\`\`\`

*— 对照骨架，事件名以 LangGraph streamEvents legacy 协议为准（ReactAgent.ts:1460-1490 委托 #graph.streamEvents，commit 7704471）*

两通道的对照表要写进架构文档：v3 的 \`run.messages\` 对应 v2 的 \`on_chat_model_stream\` 事件、\`run.toolCalls\` 对应 \`on_tool_start/on_tool_end\` 事件对、\`run.output\` 对应「流结束后的终态获取」（v2 没有直接等价物，要从 values 快照或单独 invoke 补取）。选型结论：**新管线选 v3**（消费面类型化、含中间件生命周期事件）；**存量管线维持 v2**（不为此重写）；两者的分派成本为零——同一个 streamEvents 调用换 version 参数即可，这也是 ReactAgent 把两通道塞进同一方法的设计意图。唯一要记住的分派副作用：v2 通道**没有** #initializeMiddlewareStates 预处理，带必填 stateSchema 的 agent 走 v2 时默认值填充行为不同，切通道前用 S 组断言各自验证一遍。

对照表还多一个断言层面的用途：**v2 对照接法是 O1 断言的交叉验证通道**——同一剧本先走 v3 拿子流齐全性结论，再走 v2 数一遍 on_chat_model_stream/on_tool_start/on_tool_end 的事件计数，两通道的工具事件数必须相等（同一执行、两种观测视角）；计数不等说明某一通道丢事件或分派逻辑有变，这类问题在只测一个通道时会被埋进「实现细节」里。对照验证的成本只有几行断言，买到的置信度是双通道分派逻辑本身的正确性——这正是「同一执行、多视角观测」的验收思想，与 O4 型对照断言（多配置观测）互为补充：一个变配置、一个变视角，两者合起来才能把「行为正确」的证明补完整。

### 结构化输出：providerStrategy 接入与 toolStrategy 降级

报告 schema 三字段（title/findings/confidence），按 L129 决策链先走 providerStrategy。接入前把「schema 怎么写」的取舍想清楚：schema 越贴合业务、越容易被 provider 端约束拒绝（嵌套过深、联合类型、自定义校验都是常见雷区），越保守、结构化输出的价值又打折扣——工程折中是把 schema 定为**字段集稳定、值域宽松**的形态（字符串不限长、枚举用普通 string + 断言兜底），把强约束留给 O3 的 Zod 断言层而不是模型端。这个取舍写进接入注释，防止后来者「顺手收紧 schema」引爆能力协商。

\`\`\`ts
import { providerStrategy, toolStrategy } from "langchain";
import { z } from "zod";

const reportSchema = z.object({
  title: z.string(),
  findings: z.array(z.object({
    claim: z.string(),
    source: z.string(),
  })),
  confidence: z.number().min(0).max(1),
});

// 主路径：原生 json_schema（能力协商通过时）
const agentP = createAgent({
  model, tools: [searchWeb, saveNote],
  stateSchema, contextSchema, checkpointer,
  middleware: [summarization, retry, citationGuard],
  responseFormat: providerStrategy(reportSchema),
});

// 降级路径：provider 不支持 json_schema 时（如部分开源模型）
const agentT = createAgent({
  // ...其余同上
  responseFormat: toolStrategy(reportSchema),
});

const r = await agentP.invoke(
  { messages: [{ role: "user", content: "调研并出报告" }] },
  { configurable: { thread_id: "t-r1" }, context: { tenantId: "acme" } }
);
// 类型化取值：r.structuredResponse.title / .findings / .confidence
\`\`\`

*— 接入骨架，依据 responses.ts:478-555（toolStrategy）/615-623（providerStrategy）与 agents/index.ts 重载分派（commit 7704471）*

两策略接入后共享同一消费通道 structuredResponse——这决定了 O 组断言的关键设计：**对两策略分别跑同一剧本，断言 structuredResponse 结构等价**。策略差异在约束执行位置（模型端 vs extract 工具），不在产物协议上；若两策略产物结构对不上，说明 schema 里用了某一策略独有的特性（如 provider 不支持的联合类型），这本身就是失效面清单条目。

### structuredResponse 的注入通道：从返回文档到泛型来源

structuredResponse 这个字段名不是约定俗成，而是有明确的源码出处。invoke 的返回文档写明状态包含三样东西：messages、structuredResponse（if configured）、middleware 声明的全部状态值（ReactAgent.ts:1200-1210 的 @returns 说明），JSDoc 示例直接 \`result.structuredResponse.weather\` 取值。类型层面，它的形状来自 createAgent 的泛型推导——14 个重载全围 responseFormat 的形态转（Zod 对象/数组联合/JsonSchema/无），responseFormat 传 providerStrategy(reportSchema) 时，reportSchema 的 Zod 推断类型就被推到返回状态的 structuredResponse 上。**值与类型是两条不同的注入路径**：值的注入发生在图执行的收尾段（模型最终输出经策略解析归一后写入状态），类型的注入发生在编译期（重载分派 + 泛型推导）——O3 断言用 Zod safeParse 再验一次运行时形状，就是不信类型注入覆盖了值注入的所有路径（运行时模型产物可能与 schema 有偏差，这正是策略解析层要处理的）。

接入侧还有一条容易忽略的联动：structuredResponse 与 middleware 状态同住一个返回状态里，命名冲突是真实风险——若某个 middleware 的 stateSchema 也声明了名为 structuredResponse 的字段，两个注入源会互相覆盖，且不报错。架构期 L129 的状态字段白名单纪律在这里补上第三条：**middleware 状态字段命名避开 messages/structuredResponse 两个保留名**，写进架构文档的字段命名节。

### chunk 合并：token 流能拼接的底层规则

流式接法里 \`for await (const token of msg.text)\` 之所以成立，底层依赖的是 chunk 合并规则——token 流本质上是一串 BaseMessageChunk（langchain-core/src/messages/base.ts:709 的类定义），消费端按序 concat 才能拼出完整消息。合并规则的核心在两个函数：_mergeDicts（base.ts:470）递归合并字典字段、_mergeLists（base.ts:634）按 index/id 匹配合并列表字段——tool_calls 的增量就是靠这套规则拼的：流式吐出的 tool_call chunks 带相同的 index，合并函数按 index 对位、把 args 的字符串增量逐段拼接，最终还原出完整的 tool_call。这解释了 O2 断言为什么可行：**子流内的合并是确定性的**（规则写在 core 源码里、无模型参与），token 增量拼接的终态与一次性完整输出在结构上等价——O2 才能拿流式拼接产物与剧本期望逐字段比对。

工程上还有一个由合并规则派生的排障知识点：**流式场景下中途检查 tool_calls 会拿到半成品**——args 字符串拼到一半时 JSON.parse 会失败，接 UI 时若想在工具开始前预览参数，要用 toolCalls 子流的 input 事件（工具真正开始执行时的完整参数）而不是中途读 AIMessage.tool_calls。这条与「run.output 未 resolve 前终态不可读」（pitfall 已记）是同型问题：**流式世界的一切「中途读取」都要挑协议保证完整的时点**——token 有 chunk 语义、toolCall 有 input/output 时点、终态有 output Promise，三者的「可读时点」不同，消费端各按各的时点取数，混用时点就是竞态 bug 的温床。

接入时最容易省略的一步是**能力协商的实际执行**。L129 架构期写了「目标模型支持原生 json_schema」的前置判断，实现课必须把它变成动作而不是文档语句：拿目标模型真实跑一次 providerStrategy 的最小请求，确认 schema 约束生效（例如故意构造一个不可能满足的约束看是否被模型端拒绝），再把结论回写进架构文档的能力面清单。跳过这一步的后果是 quiz 辨析里那条 pitfall——能力缺失不是编译期错误，类型检查全绿、运行时才炸，而且炸的位置在 provider 侧，报错信息的可读性远不如本地断言。降级路径（agentT 的 toolStrategy 版本）在能力确认通过时也要至少跑一次冒烟：降级预案没演练过的预案等于没有预案。

### O 组断言：流与结构的验收落地

O 组断言并入 L130 总套件，四条设计如下：

\`\`\`ts
// O1 子流齐全性：v3 剧本跑完后，断言
//    - messages 子流产出了 token（长度 > 0）
//    - toolCalls 子流出现 search_web 与 save_note 各一次
//    - middleware 子流出现 citationGuard 的 before/after 事件对
//    - await run.output 得到终态且包含 structuredResponse
// O2 子流内有序：单个 toolCall 的生命周期 input → output，
//    且 output 的内容与剧本工具返回一致（逐字段）
// O3 结构等价：agentP 与 agentT 各跑同一剧本，
//    structuredResponse 经同一 Zod safeParse 均通过，
//    且 confidence 落在 [0,1]（字段约束断言，非值断言）
// O4 无结构化配置的对照：去掉 responseFormat 后，
//    invoke 返回状态不含 structuredResponse 字段
//    （排除「字段永远存在」的假阳性认知）
\`\`\`

O3 的实现细节值得点破：**结构等价断言的对象是 Zod safeParse 的通过性**，不是 JSON 深比对——findings 数组内容依赖模型措辞，两策略的产出值允许不同，但字段集、嵌套结构与数值约束必须一致。O4 是防假阳性的对照断言：只有证明「没有 responseFormat 就没有 structuredResponse」，O3 的通过才能归因于策略接入本身。

O2 的逐字段比对还有一个工程细节：toolCall 的 status 字段要单独断言——子流对象带 .input/.output/.status 三个时点，status 是工具执行的完成态标记（成功/错误），比 output 更早可判定。剧本工具固定返回成功值，O2 断言 status 的终值为成功态即可把「工具真的执行完了」与「output 承载了正确内容」分开验证——两者分开后，一旦失败能直接区分是执行层问题还是数据层问题。O 组的执行还有一条工程约束：O1/O2 走流式通道、O3 走 invoke 通道，两组的剧本必须完全一致（同一 GOLDEN_SCRIPT、同一假模型）——剧本不一致时，流式与结构化的断言结论就失去了可比性，对照的价值归零。至此研究情报助手的能力面全部接通，I/S/R/C/K/P/O 七组断言构成完整验收基线。

### 本课小结

- **version 分派三读点**：默认 v2 走 legacy、v3 才有中间件状态预处理、streamOptions 非空锁死 legacy——选型钉在 ReactAgent.ts:1460-1545。
- **v3 七子流消费面**：messages/toolCalls/values/output/middleware/subgraphs/extensions；UI 接三样：token、工具进度、终态。
- **chunk 合并确定性**：_mergeDicts/_mergeLists 按 index/id 对位（base.ts:470/634），流式拼接终态与一次性输出结构等价是 O2 可行性的底层依据；中途读取都要挑协议保证完整的时点。
- **structuredResponse 双注入路径**：值在图执行收尾段写入、类型在编译期经重载推导；middleware 状态字段避开保留名。
- **双策略一通道**：providerStrategy（原生 json_schema）与 toolStrategy（extract 工具）产物同走 structuredResponse，结构等价断言按 Zod safeParse 写。
- **O 组四断言**：子流齐全、子流内有序（status 与 output 分开验）、双策略结构等价、无配置对照（防假阳性）。
- 下一课是全课程收官：可执行验收断言总装、失效面清单定稿、全课程源码地图收束。
`,
    null,
    [
      {
        text: 'agent.streamEvents 不传 version 或传 v1/v2 时，内部行为是什么？',
        options: [
          '抛错，要求必须传 v3',
          '委托 #graph.streamEvents 并透传 version——走 LangGraph 的 legacy 事件流，v3 才走 AgentRunStream 新通道',
          '自动升级为 v3',
          '退化为非流式 invoke',
        ],
        answer: 1,
        explain:
          'ReactAgent.ts:1460-1545 的分派逻辑：`if (config?.version !== "v3" || streamOptions != null)` 时取 mergedConfig 并把 version（v1/v2/默认 v2）透传给 `this.#graph.streamEvents(...)`；只有 version=="v3" 且无 streamOptions 才进入 AgentRunStream 分支（含 #initializeMiddlewareStates 预处理）。选项 A 无此校验；选项 C 错——不传时默认 v2，不自动升级；选项 D 无退化逻辑。',
        concept: 'lc-capstone-stream-output',
      },
      {
        text: 'v3 AgentRunStream 的消费面包含哪些子流？',
        options: [
          '只有 message tokens',
          'run.messages（token 级）/ run.toolCalls（input/output/status）/ run.values（状态快照）/ run.output（终态）/ run.middleware（生命周期）/ run.subgraphs / run.extensions',
          '只有 run.output 一个 Promise',
          '原始 SSE 文本流',
        ],
        answer: 1,
        explain:
          'streamEvents 的 JSDoc（ReactAgent.ts:1360-1395）逐条列出：run.toolCalls 带 .input/.output/.status，run.middleware 是 before/after agent/model 生命周期事件，run.values 是 async iterable + promise-like 的快照，run.output 是终态 Promise。选项 A 以偏概全；选项 C 丢了全部子流能力；选项 D 是传输层视角，不是消费 API。',
        concept: 'lc-capstone-stream-output',
      },
      {
        text: 'providerStrategy 与 toolStrategy 的机制差异是什么？',
        options: [
          'provider 用外部 API，tool 用本地函数',
          'providerStrategy 用模型原生 json_schema 受限解码；toolStrategy 向模型隐藏一个 extract 工具、靠 tool_calls 强制结构化——两者产物都经解析归一后进 structuredResponse',
          'providerStrategy 不需要 Zod schema',
          'toolStrategy 是 providerStrategy 的别名',
        ],
        answer: 1,
        explain:
          '两策略工厂都在 langchain/src/agents/responses.ts（toolStrategy:478-555、providerStrategy:615-623），机制分野是 L96 的核心结论：约束执行位置不同（provider 端 vs 工具调用通路）。选项 A 望文生义；选项 C 错，两者都吃 InteropZodType；选项 D 错，签名与行为都不同。',
        concept: 'lc-capstone-stream-output',
      },
      {
        text: '结构化输出接入后，从哪里取类型化结果？',
        options: [
          '从最后一条 AIMessage 的字符串手工解析',
          'invoke 返回状态的 structuredResponse 字段（responseFormat 配置后由 agent 注入），Zod 类型经泛型推导获得',
          '从 run.values 的第一个快照',
          '从 checkpointer 读取',
        ],
        answer: 1,
        explain:
          'invoke 的返回文档写明状态包含 structuredResponse（ReactAgent.ts:1200-1210 的 @returns 说明），JSDoc 示例直接 `result.structuredResponse.weather` 取值——这是 responseFormat 的产物通道，类型由泛型（14 个重载的 responseFormat 分支）推导。选项 A 退回了解析器旧世界；选项 C 时序错；选项 D 无此通道。',
        concept: 'lc-capstone-stream-output',
      },
      {
        text: '流式与结构化输出叠加时，O 组断言的「token 事件序列断言」为什么允许乱序容差？',
        options: [
          '因为 token 传输是乱序协议',
          '因为子流（messages/toolCalls/values）是独立异步通道，跨子流的到达次序不确定，断言按「子流内有序 + 子流间事件齐全」两层写，跨子流全局次序不作为契约',
          '因为框架会随机丢事件',
          '因为断言框架限制',
        ],
        answer: 1,
        explain:
          'AgentRunStream 的多个子流由不同内部通道推进，跨子流的全局时序是实现细节而非 API 契约——把全局次序写进断言会得到脆弱测试。正确分层：子流内（如单条 message 的 token 序列、单个 toolCall 的 input→output→status）断言有序；跨子流断言事件齐全性（该有的 token 事件、toolCall 事件、output 终态都出现）。选项 B 正确；选项 C/D 均无据。',
        concept: 'lc-capstone-stream-output',
      },
    ],
    [
      [
        'AgentRunStream',
        'streamEvents version:"v3" 返回的运行流对象：messages/toolCalls/values/output/middleware/subgraphs/extensions 七个子流的统一消费面（ReactAgent.ts:1360-1395 JSDoc）',
      ],
      [
        'legacy 事件流',
        'streamEvents v1/v2 的 LangGraph streamEvents 通道：标准 on_chat_model_stream 等事件，与 v3 通道在 ReactAgent.streamEvents 内分派',
      ],
      [
        'providerStrategy',
        '结构化输出的原生策略：经 provider 的 json_schema 能力受限解码（responses.ts:615-623 工厂），schema 约束在模型端执行',
      ],
      [
        'toolStrategy',
        '结构化输出的工具策略：隐藏 extract 工具强制结构化（responses.ts:478-555 工厂），依赖 tool_calls 通路，是 provider 能力缺失时的降级路径',
      ],
    ],
    [
      '把 v3 与 v2 事件消费代码混用——v3 的 run.messages 是子流对象，v2 的事件是 StreamEvent 回调；混用会在类型层报错，但 JS 运行时可能静默拿到 undefined，接 UI 管线前先钉死 version',
      '给 providerStrategy 传目标模型不支持的 schema 特性（如 discriminated union）——能力协商失败不是编译期错误，验收时必须实际跑一次 schema 回读断言而不是只看类型通过',
      '在流式场景断言最后一条 AIMessage 立即可用——run.output 未 resolve 前终态消息尚未写入，消费端要用 await run.output 取终态，不能用流中途的最后一条消息冒充终态',
    ],
  ),
  'capstone',
)
