import { L, withKind } from '../../course-builders.ts'

export const L130 = withKind(
  L(
    'L130',
    34,
    '核心实现：createAgent 组装 + 三类 middleware + MemorySaver + 检索链',
    3,
    ['L129'],
    ['lc-capstone-impl'],
    [
      '实现研究情报助手的完整 agent 组装：createAgent + 两个工具 + stateSchema（topic/sources）+ contextSchema，用 FakeToolCallingModel 剧本跑通主循环并断言消息序列',
      '实现三类 middleware 的接入与验证：summarizationMiddleware 显式参数、toolRetryMiddleware 重试剧本、createMiddleware 自建 citationGuard（wrapToolCall 校验来源），逐个用剧本断言触发行为',
      '打通 RAG 检索链与 MemorySaver 持久化：自定义 BaseRetriever + LCEL 检索组合接入 prompt，双 thread 隔离断言与重启恢复断言全绿',
    ],
    `### 定锚：按图施工，逐段验收

L129 的架构依据图定稿，本课施工。交付物是完整可运行的组装：createAgent 主体、三类 middleware（内置两件 + 自建一件）、检索链、checkpointer，以及随代码逐段给出的验收断言。全程用 FakeToolCallingModel（langchain/src/agents/index.ts:722 公开导出）驱动——剧本回放让每个断言确定性成立，这套测试资产将原样进入 L131 与 L132。一句话核心结论：**1.x 的实现工作是「填参数 + 写 middleware + 实现抽象」三件事，运行时（图循环、状态合并、回调传播）全部托管给框架。**

### 主体组装：createAgent 的参数面落地

先落主体。两个工具、stateSchema、contextSchema、checkpointer 一次配齐：

\`\`\`ts
import { createAgent, tool, FakeToolCallingModel, MemorySaver } from "langchain";
import { z } from "zod/v3";

// ── 工具层（架构依据：langchain/src/index.ts:28-33 的 tool 导出）──
const searchWeb = tool(
  ({ query }) => \`[web] \${query}: 3 hits (arxiv:2101.x, blog:rlhf, wiki:agent)\`,
  { name: "search_web", description: "Search the web for references",
    schema: z.object({ query: z.string() }) }
);
const saveNote = tool(
  ({ title, body, source }) => \`saved note "\${title}" from \${source}\`,
  { name: "save_note", description: "Save a research note with its source",
    schema: z.object({
      title: z.string(), body: z.string(),
      source: z.string().describe("must be a source already in \`sources\`"),
    }) }
);

// ── 状态与上下文（架构依据：L49 state/context 双 schema）──
const stateSchema = z.object({
  topic: z.string().default(""),
  sources: z.array(z.string()).default([]),
});
const contextSchema = z.object({
  tenantId: z.string(),
});

const model = new FakeToolCallingModel({
  toolCalls: [
    [{ name: "search_web", args: { query: "agent memory" },
       id: "c1", type: "tool_call" }],
    [{ name: "save_note",
       args: { title: "memo", body: "…", source: "arxiv:2101.x" },
       id: "c2", type: "tool_call" }],
    [],
  ],
});

const checkpointer = new MemorySaver();   // libs/checkpoint/src/memory.ts:106

export const agent = createAgent({
  model,
  tools: [searchWeb, saveNote],
  stateSchema,
  contextSchema,
  checkpointer,
  // middleware 与 responseFormat 在本课后两段接入
});
\`\`\`

*— 组装骨架，依据 langchain/src/agents/index.ts:672-702 与 ReactAgent 构造器（commit 7704471）*

主循环验收断言（进入总套件的 I 组）：剧本三轮回放后 \`messages\` 类型序列应为 \`["human","ai","tool","ai","tool","ai"]\`；第 2 轮 save_note 的 args 与剧本逐字段相等；终态 \`topic\`/\`sources\` 为 stateSchema 声明的 default 形态（空串/空数组，因为内置节点未写它们——它们由 middleware 与后续段落写）。这组断言同时验证了两件架构承诺：图循环托管正确、双 schema 编译期生效。

选 FakeToolCallingModel 而不是真模型的原因值得写成纪律：它是 agents/index.ts:722 导出的**公共 API**（不是内部测试私有物），构造参数 \`toolCalls: ToolCall[][]\` 是逐轮剧本——第 N 轮模型调用吐第 N 组 tool_calls，吐完保持末组。这意味着主循环的每一步（模型路由决策、Send 分发、ToolNode 执行、回环、出环）都被剧本钉死，断言从「大概率复现」变成「必然复现」。真模型留给最后的冒烟测试，验收套件全程剧本——这也是 I 组断言能在 CI 里稳定跑的前提。

剧本语义的两个边界要在 I 组注释里写清。**边界一：末组保持**——剧本耗尽后模型持续吐末组 tool_calls（第三轮是空数组，意味着后续所有轮都吐空），这保证了「出环」是稳定终态而不是巧合；若末组是非空 tool_calls 且 recursionLimit 未触顶，主循环会带着同一组调用反复执行——利用这个语义可以构造「重放剧本」验证工具幂等性，也可以用来验证 toolCallLimit 的闸门（L57）在重复调用下的触发。**边界二：args 的形状自由**——FakeToolCallingModel 不做 schema 校验，剧本可以吐出违反工具 schema 的 args（如缺字段），这正好用于负例剧本：断言 ToolNode/schema 校验层对非法参数的降级行为。两个边界合起来读出的结论是：**FakeToolCallingModel 是「模型行为模拟器」而不只是「测试桩」**——真实模型会做的（并行调用、乱序、幻觉参数）它都能在剧本里表达，I 组断言的判别力因此覆盖了主循环对异常模型行为的处理面。

### 三类 middleware：内置显式配置 + 自建最小样本

middleware 段按 L129 定稿接入。内置两件先看配置面：

\`\`\`ts
import {
  summarizationMiddleware,
  toolRetryMiddleware,
} from "langchain";

const summarization = summarizationMiddleware({
  model: "openai:gpt-4o-mini",      // 摘要用小模型（summarization.ts 内经 initChatModel 初始化）
  keep: { messages: 10 },           // 显式覆盖 DEFAULT_MESSAGES_TO_KEEP=20
  trimTokensToSummarize: 2000,      // 显式覆盖 DEFAULT_TRIM_TOKEN_LIMIT=4000
});

const retry = toolRetryMiddleware({
  maxAttempts: 2,
  tools: ["search_web"],            // 只重试外网工具，笔记工具失败直达 toolError
  onFailure: "continue",            // 显式声明，与源码默认一致（toolRetry.ts:55）
});
\`\`\`

*— 配置面依据 langchain/src/agents/middleware/summarization.ts:65-68、toolRetry.ts:16-57（commit 7704471）*

自建 citationGuard 是 createMiddleware 工厂的最小完整样本：

\`\`\`ts
import { createMiddleware } from "langchain";
import { z } from "zod/v3";

const citationGuard = createMiddleware({
  name: "citation_guard",
  contextSchema: z.object({ tenantId: z.string() }),
  wrapToolCall: async (request, handler) => {
    if (request.toolCall.name !== "save_note") return handler(request);
    const { source } = request.toolCall.args as { source: string };
    const ok = (request.runtime.state.sources ?? []).includes(source);
    if (!ok) {
      // 拒绝写入：回喂一条错误 ToolMessage，让模型换来源重试
      return new ToolMessage({
        tool_call_id: request.toolCall.id,
        content: \`REJECTED: source "\${source}" is not in the sources set\`,
        status: "error",
      });
    }
    return handler(request);
  },
});
\`\`\`

*— 自建骨架，依据 createMiddleware（agents/index.ts:719）与 wrapToolCall 契约（middleware/types.ts；L55 联动）（commit 7704471）*

### wrapToolCall 契约细读：ToolCallRequest 的字段面

自建 middleware 的质量取决于对 ToolCallRequest 的理解深度，接口定义值得逐字段走读：

\`\`\`ts
export interface ToolCallRequest<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TContext = unknown,
> {
  /** The tool call to be executed */
  toolCall: ToolCall;
  /**
   * The BaseTool instance being invoked.
   * Provides access to tool metadata like name, description, schema, etc.
   *
   * This will be \`undefined\` for dynamically registered tools ...
   */
  tool: ClientTool | ServerTool | undefined;
\`\`\`

*— libs/langchain/src/agents/middleware/types.ts:146-175（commit 7704471，有裁剪）*

两个读点决定自建 middleware 的健壮性。**读点一：toolCall 是纯数据**——name/args/id 三个字段来自模型的输出（AIMessage.tool_calls 的条目），citationGuard 校验 args 时拿到的是模型声称的参数，**未经验证**——这也是为什么校验逻辑必须 defensive：\`request.toolCall.args as { source: string }\` 的类型断言背后，真实输入可能缺字段或类型不符，生产级 middleware 要先做一次形状检查再取值。**读点二：tool 可能是 undefined**——动态注册的工具（运行时才出现的工具）不在 agent 预声明列表里，此时 request.tool 为 undefined，JSDoc 示例给了标准接法：middleware 可以 \`{ ...request, tool: myDynamicTool }\` 展开注入实现再调 handler。研究助手没有动态工具，但 citationGuard 若想复用到「工具集运行时可变」的场景，这个分支必须处理。handler(request) 的语义是「继续执行链」，返回值绕过 handler 则拦截——自建拦截的全部机制就这两条路径，没有第三种。

### middleware 状态的校验时机：initializeMiddlewareStates

自建 middleware 若声明了 stateSchema，还有一个容易踩坑的时机问题——校验发生在什么时候？答案在初始化链路：invoke 时 ReactAgent 先调 \`#initializeMiddlewareStates\`（invoke 体 ReactAgent.ts:1223-1245 里可见调用），真正的校验逻辑在 nodes/utils.ts 的 initializeMiddlewareStates（:26 起），实现用 **safeParse + 改造后的 schema**（:67-75 附近）逐个中间件校验状态默认值——safeParse 失败意味着「必需的公共字段缺失」，此时才抛错。坑就在这里：**构造 middleware 对象时不校验、invoke 时才校验**——stateSchema 若写了必填字段不给 default，createAgent 组装阶段一切正常，第一次 invoke 才炸，报错位置离代码位置隔了一整个运行时。

防护纪律就是本课 pitfall 的展开：stateSchema 的每个字段一律 \`.default()\` 起步，把「缺失」消化成默认值而不是错误；确需必填语义的字段（如 sources 必须由架构保证先被写入），用 contextSchema 的只读注入或应用层前置检查表达，不用 Zod 的必填约束——图状态的写入时序由图执行决定，编译期无法保证某字段在第一次 invoke 前已写入，必填约束在这里是错位的设计。R 组剧本顺带验证了这条纪律：工具计数器状态在 middleware 的 stateSchema 里带 default 初始化，首轮未写入时读出默认值——若没有 default，R 组剧本第一轮就会暴露问题，这也是「剧本要覆盖首轮」的又一例证。

三类 middleware 的验收断言各一。S 组（摘要）：把 keep 调成极小值 + 长剧本，断言摘要后状态恰含一条带 \`DEFAULT_SUMMARY_PREFIX\`（"Here is a summary of the conversation to date:"，summarization.ts:63）的消息且旧消息被 RemoveMessage 清理。R 组（重试）：剧本让 search_web 第一次抛错、第二次成功（假工具计数器），断言最终 ToolMessage 是成功产物且模型收到过中间错误信息——onFailure:"continue" 的语义落地。C 组（自建）：让 save_note 带一个 sources 之外的来源，断言返回的 ToolMessage content 以 \`REJECTED:\` 开头且 status 为 error——citationGuard 生效的证据，同时验证了 contextSchema 的 tenantId 经 runtime.context 只读可达。

### 检索链：BaseRetriever 实现与 LCEL 组合

RAG 层按架构决策实现。自定义检索器只覆盖检索逻辑：

\`\`\`ts
import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "langchain";

class InMemoryKnowledgeRetriever extends BaseRetriever {
  lc_namespace = ["capstone", "retrievers"];
  constructor(private docs: Document[]) { super(); }
  async _getRelevantDocuments(query: string) {
    const kw = query.toLowerCase();
    return this.docs.filter(d =>
      d.pageContent.toLowerCase().includes(kw)
    ).slice(0, 3);
  }
}
\`\`\`

*— 实现骨架，依据 langchain-core/src/retrievers/index.ts:31-61 的 BaseRetriever 骨架（commit 7704471）*

检索产物进 prompt 组装段而非 messages（pitfall 已点名），组合方式是 LCEL：检索器经 \`asRetriever()\` 桥天然是 Runnable，与格式化 \`RunnableLambda\`（core runnables/base.ts:2572）pipe 成「query → 检索 → 拼上下文」小链，其输出作为 stateSchema 字段 \`retrievedContext\` 供下一轮模型请求引用——检索链的验收断言（K 组）：给定知识库文档集，断言格式化输出包含命中文档的 pageContent 且条数不超过 3。检索链与 agent 的衔接点是 prompt 组装（beforeModel 或 prompt 函数读取 retrievedContext），本课用 prompt 函数最简形态，不引入额外 middleware。

K 组断言的对象是 Document 三元组的一个子集，这里补一句为什么 Document 值得单独说：Document 携带 pageContent 与 metadata 两个字段（core documents 的 DocumentInterface），K 组断言只碰 pageContent——**metadata 在架构上有另一个消费者**：研究助手的 sources 去重表（stateSchema 字段）的来源 id 正是从命中文档的 metadata 里提取的，检索链的产出因此有两条支线：正文进 retrievedContext、来源 id 进 sources。这条支线关系写进 K 组注释，防止实现时把 metadata 丢在格式化 lambda 里没有传出来——丢了的后果不是报错而是 citationGuard 拿不到合法来源集合，校验全部拒绝，问题显形位置在 C 组断言，离根因隔了两层。K 组因此多一条断言：格式化函数的返回值除正文外必须携带来源 id 字段（结构与来源的非空断言）。

这条小链的选择过程本身就是架构决策的微缩样本：**为什么不用 classic 的 RetrievalQAChain**——那是迁移课题的产物（Capstone A 已处理），从零构建的世界里引旧包违背 L129 的模块边界契约（grep 断言会红）；**为什么不用裸函数**——检索器继承 BaseRetriever 后免费获得 Runnable 生态的回调传播与流式能力，裸函数要手工补这些横切面，得不偿失；**为什么格式化用 RunnableLambda 而不是普通函数内联**——pipe 进链后每一步都有独立 runId 与回调子树（L30 的 seq:step:N 子回调），排障时检索与格式化的耗时/失败可分别归因。三个「为什么不用」都有明确答案，这段实现才算按图施工而不是顺手写。

### 持久化验收：P 组断言与运行边界

MemorySaver 接入后的 P 组断言按 L129 失效面清单逐条落地。**P1 thread 隔离**：同一个 checkpointer、两个 thread_id 各自完整跑剧本，断言线程 A 的 \`getState({ configurable: { thread_id: "A" } })\` 的 messages 不含线程 B 的任何消息——隔离单位是 thread_id 而非实例（quiz 辨析）。**P2 重启恢复**：同一 saver 实例、新 invoke 调用（模拟进程重启后的新请求），断言同 thread 的历史消息仍完整可见。P2 的运行边界要写进测试注释：**内存实现不跨进程**，多进程部署的恢复验证要等外部 saver（Postgres saver），本断言只覆盖同进程语义——这条边界本身就是失效面清单的存量项。

P 组底层还有一个值得走读的机制点：getState 的透传实现只有两行——\`getState(config, options?)\` 直接 \`return this.#graph.getState(config, options)\`（ReactAgent.ts:1605-1612，getStateHistory 同构透传）——P 组断言的全部取数能力都来自图内核的 checkpoint 读取，ReactAgent 层零加工。这意味着 P 组断言的语义边界就是 checkpointer 的语义边界：MemorySaver 的 getTuple 按 thread_id 定位最新 checkpoint、反序列化出状态——断言看到的消息序列就是 serde 往返后的产物。**serde 往返是 P 组断言的隐性验证对象**：如果某个 stateSchema 字段的类型无法被 JsonPlusSerializer 无损往返（如函数、类实例），P1/P2 的断言会以「字段消失或变形」的形式失败——这正是 L129「状态即 serde 成本」架构账的验收面。P 组还有一条容易忽略的正向断言：**deleteThread 的清理语义**——deleteThread 是 BaseCheckpointSaver 契约的第五个方法（libs/checkpoint/src/base.ts:239），跑一个一次性 thread，断言 deleteThread 后 getState 返回空状态；这个方法在验收套件里同时承担清场职责（破坏性剧本跑完即删，防止污染后续轮次），一物两用，断言与工具合一。至此核心实现全绿：I/S/R/C/K/P 六组断言构成可执行验收基线，随代码一并交付。下一课在其上加装流式与结构化输出两块能力面。

### 本课小结

- **实现三件事**：填参数（createAgent 参数面）、写 middleware（内置显式配置 + createMiddleware 自建）、实现抽象（BaseRetriever 只覆盖 _getRelevantDocuments）——运行时全部托管。
- **FakeToolCallingModel 是模型行为模拟器**：末组保持语义可构造重放与限流剧本、args 形状自由可构造非法参数负例——主循环对异常模型行为的处理面也进断言。
- **wrapToolCall 两路径**：toolCall 是模型声称的未验证数据（校验要 defensive）、tool 可为 undefined（动态工具注入接法）；handler 继续、返回值拦截，无第三种。
- **校验时机**：middleware stateSchema 在 invoke 时的 initializeMiddlewareStates 里 safeParse，构造期不报错——字段一律 .default() 起步，必填语义用 context 或前置检查表达。
- **三类 middleware 三组断言**：S 摘要结构（显式覆盖 20/4000 默认）、R 重试剧本（onFailure:"continue" 语义）、C 自建拦截（REJECTED ToolMessage + context 只读可达）。
- **检索链进 prompt 不进 messages**：metadata 是 sources 去重表的来源支线，K 组断言覆盖正文与来源 id 两条产出。
- **P 组断言两条件 + 一边界**：thread_id 隔离、同进程恢复、内存实现不跨进程写进测试注释；getState 双行透传意味着 serde 往返是 P 组的隐性验证对象；deleteThread 一物两用（清场 + 断言）。
- 下一课：streamEvents 双版本通道与 responseFormat 双策略接入，流式与结构化的验收断言补齐能力面。
`,
    null,
    [
      {
        text: 'summarizationMiddleware 接入时，为什么默认参数要显式重写？',
        options: [
          '默认值是废弃字段',
          '内置默认是 DEFAULT_MESSAGES_TO_KEEP=20、DEFAULT_TRIM_TOKEN_LIMIT=4000——不显式配置，触发条件就随版本默认走，架构期定的压缩策略会静默漂移',
          '显式配置能提升摘要质量',
          '默认值只对 OpenAI 生效',
        ],
        answer: 1,
        explain:
          'summarization.ts:65-68 固化了四个默认常量（保留 20 条 / token 限 4000 / 回退 15 条 / 工具对搜索范围 5）。它们不是错误，但「架构文档说保留 10 条」而代码里没传参，实际行为就是 20 条——策略与实现静默脱节。选项 A/C/D 均无源码依据。',
        concept: 'lc-capstone-impl',
      },
      {
        text: 'toolRetryMiddleware 的 onFailure 默认值与语义是？',
        options: [
          '默认 "error"：重试耗尽后中断执行',
          '"continue"（默认）：重试耗尽后返回带错误详情的 AIMessage 让 agent 继续处理；只有显式传 "error" 才重新抛异常',
          '没有默认值，必须显式配置',
          '默认把错误吞掉并返回 null',
        ],
        answer: 1,
        explain:
          'ToolRetryMiddlewareOptionsSchema 的 onFailure 定义（toolRetry.ts:41-55）：z.union(["error", "continue", 弃用的 "raise"/"return_message", 自定义函数]).default("continue")，注释写明 continue 是「Return an AIMessage with error details, allowing the agent to potentially handle the failure gracefully」。选项 A 把非默认值当默认；选项 C 错，.default("continue") 就是默认；选项 D 无此语义。',
        concept: 'lc-capstone-impl',
      },
      {
        text: '自建 citationGuard middleware 用 createMiddleware 后获得什么身份？',
        options: [
          '一个普通函数，agent 不识别',
          'MIDDLEWARE_BRAND 品牌化的 AgentMiddleware：可声明 stateSchema/contextSchema，六 hook 可用，与内置 middleware 同一装配路径',
          '一个独立的 Runnable，需要手动 pipe',
          '一个 LangGraph 子图',
        ],
        answer: 1,
        explain:
          'createMiddleware 工厂（agents/index.ts:719 re-export）的返回值带 MIDDLEWARE_BRAND 标记（middleware.ts:270 附近）——这是 1.x 中间件体系的类型品牌，品牌化对象与内置 middleware（summarization/toolRetry 同源工厂）走同一装配路径。选项 A 错，无品牌不进 middleware 数组的类型约束；选项 C 混淆了 Runnable 与 middleware 两个体系；选项 D 无据。',
        concept: 'lc-capstone-impl',
      },
      {
        text: '自定义检索器继承 BaseRetriever 后，除了检索逻辑还要实现什么？',
        options: [
          '什么都不要，继承即可',
          '_getRelevantDocuments（核心检索逻辑）——继承抽象后 asRetriever 桥、回调传播、流式能力都由基类提供，检索器自动成为 Runnable 生态成员',
          '自己实现 invoke/stream/batch 全套',
          '必须同时实现 VectorStore',
        ],
        answer: 1,
        explain:
          'BaseRetriever（core retrievers/index.ts:31-61）的骨架设计：子类只覆盖 _getRelevantDocuments，基类持有 invoke 与回调 getChild 传播（L87 的 asRetriever 桥与 MMR 同基座）。选项 C 把 Runnable 四支柱当成必须自建的，与基类分层设计相反；选项 D 混淆检索器与向量库两层抽象。',
        concept: 'lc-capstone-impl',
      },
      {
        text: '「双 thread 隔离」断言的实现要点是什么？',
        options: [
          '用两个 MemorySaver 实例',
          '同一个 checkpointer、两个不同的 configurable.thread_id 各跑剧本，断言 A 线程的 getState 状态里不包含 B 线程的消息',
          '用两个 agent 实例天然隔离',
          '靠环境变量切换会话',
        ],
        answer: 1,
        explain:
          'thread 隔离是 checkpointer 的语义：隔离单位是 thread_id 而非 saver 实例或 agent 实例——用两个 saver 反而绕过了被测语义。同一 saver + 两个 thread_id 各自完整剧本后互查对方状态，才是对隔离性的直接检验。选项 A 测的是实例隔离不是 thread 隔离；选项 C 的两实例若共享 saver 仍可能串；选项 D 无此机制。',
        concept: 'lc-capstone-impl',
      },
    ],
    [
      [
        'citationGuard',
        '本课自建的演示 middleware：wrapToolCall 里校验笔记工具写入的来源字段，来源不在 sources 集合时拒绝写入——createMiddleware 自建能力的最小完整样本',
      ],
      [
        '检索链',
        '自定义 BaseRetriever + LCEL 组合的 RAG 数据通路：检索结果经 RunnableLambda 格式化后进 prompt 组装段，替代旧 RetrievalQAChain 的编排',
      ],
      [
        'thread_id',
        'checkpointer 的会话标识：置于 invoke config 的 configurable 下，同一 saver 按 thread 隔离状态，deleteThread 删除整条会话',
      ],
      [
        'middleware 装配路径',
        '内置与自建 middleware 统一经 createAgent 的 middleware 数组按序装配，hook 节点化进图（L47），顺序即生效次序',
      ],
    ],
    [
      '自建 middleware 的 stateSchema 写必填字段不给 default——invoke 时 initializeMiddlewareStates 才 safeParse（nodes/utils.ts），构造不报错、运行才抛错，缺省字段一律 .default() 起步',
      '把检索结果直接塞 messages——检索产物（Document 列表）应进 prompt 组装段或 stateSchema 专用字段，混进 messages 会破坏消息序列断言（多出非协议消息类型）且干扰摘要中间件的计数',
      'MemorySaver 在多进程部署下当持久化用——内存实现跨进程不共享，「重启恢复」断言只在同进程内成立（P2 的测试边界要写清），生产部署必须换外部 saver',
    ],
  ),
  'capstone',
)
