import { L, withKind } from '../../course-builders.ts'

export const L129 = withKind(
  L(
    'L129',
    34,
    '架构设计：带 middleware+检查点+RAG+结构化输出的 agent，画源码依据图',
    3,
    ['L96'],
    ['lc-capstone-arch'],
    [
      '产出 Capstone B「研究情报助手」的架构设计文档：分层架构图 + 每个组件的源码依据表（文件:行号 + commit），每个架构决策可追溯到真实导出',
      '构建关键决策论证：论证 createAgent 而非裸 StateGraph、MemorySaver 而非自建存储、双策略选 providerStrategy 的三条决策链，写出各自的反方案对比',
      '写出架构级验收标准：模块边界（哪些层允许互相 import）、状态形状（messages + stateSchema 字段清单）、失效面清单的初版',
    ],
    `### 定锚：Capstone B 开局——架构先行，依据随行

进入模块十的第二个 Capstone。与 Capstone A 的迁移划清界限：**Capstone B 不碰任何 classic API，纯 1.x 从零构建**。目标应用是「研究情报助手」：给定一个研究主题，agent 检索内部知识库（RAG）、调用搜索与笔记两个工具、长对话自动摘要（middleware）、按 thread 保存会话（checkpointer）、最终产出结构化情报报告（responseFormat）。四项能力正好覆盖课程主线：middleware 体系（模块五）、LangGraph 持久化（模块六/七）、RAG 管线（模块七）、结构化输出（模块八）。本课只做架构：分层图 + 源码依据表 + 决策论证 + 架构级验收标准。一句话核心结论：**1.x 的架构设计就是「面向 core 抽象编程、用 createAgent 拿运行时、用 middleware 与 stateSchema 定制行为」——每个决策都必须能画进源码依据图。**

### 分层架构与源码依据表

架构分五层，每层右侧给出源码依据（commit 7704471）：

\`\`\`
┌─ 应用层：业务编排、golden 剧本、验收断言 ─────────────┐
│ ┌─ Agent 层：createAgent 组装（model/tools/middleware │
│ │  /responseFormat/stateSchema）                      │
│ │   依据：langchain/src/agents/index.ts:672-702       │
│ ├─ Middleware 层：summarization + toolRetry + 自建    │
│ │   依据：agents/middleware/index.ts:1-126 导出面；    │
│ │   createMiddleware 工厂 agents/index.ts:719         │
│ ├─ 状态/持久化层：stateSchema + checkpointer(thread)  │
│ │   依据：ReactAgent.ts:164-188（#graph）；            │
│ │   libs/checkpoint/src/base.ts:180-239（五方法契约）  │
│ ├─ RAG 层：检索实现 + LCEL 组合                        │
│ │   依据：core retrievers/index.ts:31-61（BaseRetriever│
│ │   抽象）；core runnables/base.ts:1944/2572（组合原语）│
│ └─ 模型/工具层：initChatModel + tool()                 │
│     依据：langchain/src/index.ts:23（initChatModel）； │
│     :28-33（tool/HeadlessTool 导出）                   │
└──────────────────────────────────────────────────────┘
\`\`\`

依据表的填写规则与 L125 映射表同源：**每个组件必须有真实存在的导出锚点，写不出锚点的组件名一律不进架构图**。这张表同时是防幻觉装置——架构期想当然引入的「MemoryManager」「SessionStore」类组件，在核对 \`langchain/src/index.ts:1-79\` 的顶层导出清单（BaseMessage 族/initChatModel/tool/context/agents/middleware/InMemoryStore/Document）时就会现形：不存在，删除或换成 InMemoryStore + checkpointer 的组合。

### 关键决策一：createAgent 还是裸 StateGraph

这是 Capstone B 的第一决策，论证要给反方案。**正方案 createAgent**：研究情报助手的控制流是标准 ReAct（模型→工具→回环→收尾），createAgent 一步拿到完整循环、middleware 挂载点、responseFormat 通道与 stateSchema 扩展点。先钉实现体的证据：

\`\`\`ts
export function createAgent<...>(params: CreateAgentParams<...>) {
  return new ReactAgent(params);
}
\`\`\`

*— libs/langchain/src/agents/index.ts:672-702（commit 7704471，泛型签名裁剪）*

它不是黑盒框架，而是类型重载极重（14 个重载全围 responseFormat 转）、运行时极薄的构造器，复杂度都在可配置面。**反方案裸 StateGraph**：只有当需要改图拓扑本身时才成立——比如要在工具循环之外插入独立的审校子图、或需要 supervisor/swarm 式多 agent 接力（L82）。本项目无此需求，且下探裸图意味着自建模型路由、工具节点与 hook 挂载，全是从 createAgent 已解决的问题重新做一遍。**决策：createAgent；保留逃生舱**——若后期需要子图编排，ReactAgent 的图级 API（getState/getStateHistory/getSubgraphs，L44）仍可观察运行，届时再评估下探，不为假想需求预付复杂度。

### 关键决策二：状态与持久化设计

状态设计两条线。**会话线**：messages 走内置状态，持久化交给 checkpointer——抽象依据是 BaseCheckpointSaver 的五方法契约，直接读源码：

\`\`\`ts
export abstract class BaseCheckpointSaver<V extends string | number = number> {
  serde: SerializerProtocol = new JsonPlusSerializer();
  abstract getTuple(config): Promise<CheckpointTuple | undefined>;
  abstract list(config, options?): AsyncGenerator<CheckpointTuple>;
  abstract put(config, checkpoint, metadata, newVersions): Promise<RunnableConfig>;
  abstract putWrites(config, writes, taskId, taskPath?): Promise<void>;
  abstract deleteThread(threadId: string): Promise<void>;
}
\`\`\`

*— langgraphjs libs/checkpoint/src/base.ts:180-239（commit fa426b2，有裁剪）*

deleteThread 直接对应「删会话」；起步 MemorySaver（libs/checkpoint/src/memory.ts:106），生产换 Postgres saver，接口不变。会话标识走 \`configurable.thread_id\`——thread 取代旧 sessionId 惯例，这个语义写进架构文档。**业务线**：研究助手需要跨轮共享的非消息状态只有两个：\`topic\`（当前研究主题）与 \`sources\`（已引用来源去重表）。设计依据：stateSchema 声明的字段会进入图状态参与每轮合并（L49 的 state/context 双 schema），**字段越多序列化与合并成本越高**——凡能从 messages 重算的信息不进 stateSchema，sources 之所以进，是因为它被工具与自建 middleware 双方消费且有去重副作用，重算成本高于存储成本。contextSchema 单列：模型密钥级别别、租户 id 这类**只读运行时配置**走 context（L42 讲过的 context 与 configurable 分离），不污染状态。

两条线的声明形态在架构文档里固定为：

\`\`\`ts
// 架构定稿：状态形状声明（实现课 L130 落地）
const stateSchema = z.object({
  topic: z.string().default(""),
  sources: z.array(z.string()).default([]),
});
const contextSchema = z.object({
  tenantId: z.string(),        // 只读：runtime.context 消费，不进图状态
});
// 会话持久化：checkpointer: new MemorySaver()
// 会话标识：configurable.thread_id（invoke 时传入）
// 声明纪律：清单之外的字段进图状态需过架构评审——防状态膨胀
\`\`\`

状态线的底层还有一笔架构账要算清：**状态即序列化成本**。BaseCheckpointSaver 自带 \`serde: SerializerProtocol = new JsonPlusSerializer()\`（libs/checkpoint/src/base.ts:180-239 的字段声明）——checkpointer 的每次 put 都要把图状态经 serde 序列化落盘，stateSchema 里每个字段都在这笔成本里。topic/sources 两个字符串与字符串数组的序列化成本可以忽略，但若状态里塞进大对象（如把检索到的全文塞进 stateSchema），每轮超步的序列化开销会随对话长度线性放大，MemorySaver 里看不出来、换 Postgres saver 后就是实打实的数据库写入体积。架构评审时对每个 stateSchema 字段问一句「它的 serde 体积会增长吗」，增长型字段要么改成引用（存 id，正文走存储层），要么降级为 messages 内容。

### 决策四：模型与工具入口的选型

架构图最底层还有两个入口要定：模型从哪来、工具怎么造。**模型入口选 initChatModel**——langchain 主包的顶层导出（langchain/src/index.ts:23，从 \`./chat_models/universal.js\` 转出），createAgent 的 model 参数直接吃 \`"openai:gpt-4o"\` 这类字符串标识（agents/index.ts:89-106 的 JSDoc 示例）。选它的架构理由：模型标识是**配置而非代码**——研究助手要换模型（如评测不同 provider 的 tool_calls 质量，L129 失效面里已有这条），改配置字符串即可，不用动组装代码；同一函数还能接受预构建的模型实例（FakeToolCallingModel 就是这么接进来的），测试注入与生产配置共用一个参数位。classic 里有个同名 initChatModel（classic chat_models/universal.ts:614），签名相同但住址不同——Capstone B 的模块边界契约规定只从新包取，这正是 L119 同名陷阱的预防动作：写架构文档时就把 import 来源钉死。

**工具入口选 tool() 工厂**——主包顶层导出（langchain/src/index.ts:28-33 的 tool/HeadlessTool）。架构层的选型论证要点不在「怎么写工具」（那是 L22 的重载矩阵），而在**schema 的 describe 纪律**：工具的 name/description/schema 字段描述会整体进入模型的工具说明书，检索类工具的 query 参数要 describe 到「期望的语言与粒度」（如「中文关键词，3-6 个词」），否则模型给检索器的 query 质量不可控——研究助手的检索命中率直接受此影响。两个入口的选型写进依据表后，五层架构的每一层就都有了可核的锚点。

### 关键决策三：RAG 层与结构化输出选型

RAG 层面向 core 抽象：检索器实现 BaseRetriever（\`_getRelevantDocuments\` 一次覆盖，asRetriever 桥免费获得 Runnable 能力），检索结果与问题的合并用 LCEL 组合——\`RunnableLambda\`（core runnables/base.ts:2572）做格式化、pipe 进模型请求的 prompt 组装段。**不引入 classic 的 RetrievalQAChain**——那是迁移课题（Capstone A 已处理），从零构建的世界里没有它的位置。向量库起步用内存实现，架构上只依赖 VectorStore 抽象（core vectorstores.ts:553）。检索器的注册身份也要在架构期声明：BaseRetriever 子类要给 \`lc_namespace\` 命名空间（回调树的节点命名用它），研究助手定为 \`["capstone", "retrievers"]\`——这个决定看似琐碎，实则绑定可观测性：L92/L93 的 trace 消费按 run name 过滤，命名空间混乱的检索器在观测面板上无法归因，回调树的形状从架构期就该有命名规范。

结构化输出选 providerStrategy，决策链三步：**第一步能力确认**——目标模型支持原生 json_schema 受限解码；**第二步产物确认**——报告结构（title/findings/confidence 三字段）是单对象，无双 schema 联合需求，providerStrategy 的单 Zod schema 足够；**第三步降级预案**——能力协商失败时回退 toolStrategy（responses.ts:478 工厂）或降级纯文本 + 外部解析，预案写进失效面清单。两个策略工厂的签名先看一眼：

\`\`\`ts
export function toolStrategy<T extends InteropZodType<any>>(schema: T, ...): ToolStrategy<T>;
export function providerStrategy<T extends InteropZodType<unknown>>(schema: T, ...): ProviderStrategy<T>;
\`\`\`

*— libs/langchain/src/agents/responses.ts:555、615-623（commit 7704471，重载裁剪为一元形态）*

middleware 层选型同步定稿：summarizationMiddleware（长对话压缩，DEFAULT_MESSAGES_TO_KEEP=20 / DEFAULT_TRIM_TOKEN_LIMIT=4000 作为显式配置起点）、toolRetryMiddleware（搜索工具网络抖动）、自建 citationGuard middleware（wrapToolCall 里校验笔记工具的写入来源，createMiddleware 工厂生产）。三者的装配顺序在架构期声明为 \`middleware: [summarization, toolRetry, citationGuard]\`——顺序即生效次序，写进架构文档防止实现期随手调换。选型依据来自 middleware/index.ts:1-126 的导出面——预置件先查清单再决定是否自建，是架构期的固定动作：

\`\`\`ts
// middleware/index.ts:1-126 导出面（架构选型依据，节选）
// summarizationMiddleware, dynamicSystemPromptMiddleware,
// llmToolSelectorMiddleware, piiMiddleware, piiRedactionMiddleware,
// contextEditingMiddleware, toolCallLimitMiddleware, todoListMiddleware,
// modelCallLimitMiddleware, modelFallbackMiddleware, modelRefusalMiddleware,
// modelRetryMiddleware, toolRetryMiddleware, toolErrorMiddleware,
// toolEmulatorMiddleware, autoModeMiddleware, modelRouterMiddleware,
// providerToolSearchMiddleware, hitl, openAIModerationMiddleware,
// anthropicPromptCachingMiddleware, bedrockPromptCachingMiddleware
// —— 预置 20+；本架构取 summarization / toolRetry，其余按需追加
\`\`\`

RAG 层的组合形态在架构期同样固化为草图（实现课 L130 落地）：

\`\`\`ts
// 架构草图：检索链的 LCEL 形态（core runnables/base.ts:1944/2572 为组合原语）
const knowledgeChain = retriever          // 自定义 BaseRetriever 经 asRetriever 桥
  .pipe(formatDocsLambda);                // RunnableLambda：Document[] → 上下文字符串
// 产物写入 stateSchema 的 retrievedContext 字段，prompt 组装段引用——
// 检索产物不进 messages（保持消息序列断言纯净与摘要计数语义）
\`\`\`

### 装配顺序的机制依据：hook 节点化与拦截层次

\`middleware: [summarization, toolRetry, citationGuard]\` 这个顺序不是随手排的，机制依据在 hook 节点化（L47）：六个 hook 里 before*/after* 四个成为图节点、wrap* 两个包裹节点内部调用——三种 middleware 在流水线上的位置不同，顺序语义也不同。**summarization 挂 beforeModel**（模型调用前裁剪上下文），它影响的是每轮模型看到的输入；**toolRetry 与 citationGuard 都挂 wrapToolCall**，两者在同一个包裹链上，数组顺序直接决定包裹的内外层：数组先声明的在外层。当前顺序下 toolRetry 在外、citationGuard 在内——一个工具调用先经重试包裹、再进来源校验，语义是「重试的每一发都过校验」；若调换成 \`[summarization, citationGuard, toolRetry]\`，语义变成「先校验、失败的调用不进重试」——校验拒绝（REJECTED ToolMessage）是终态，重试只救网络抖动不救非法来源，两次注入的行为完全不同。

架构文档因此要为顺序声明附一句**语义注释**而不只是顺序本身：注释写明「重试包外、校验包内：拒绝是终态、重试只救抖动」。判断顺序的原则可以固化为一条公式：**变更型拦截（重试、fallback）放外层、守门型拦截（校验、限流）放内层**——守门型在内保证每一发实际执行都过闸，变更型在外保证闸门拒绝不消耗重试预算。违反公式的组合不是错误而是语义翻转，正是 L129 失效面清单第一条「middleware 顺序」的判定依据。这条公式同样是自建 middleware 时的设计输入：写 citationGuard 之前先想清楚它属于守门型，声明位置自然就定了。

### 架构级验收标准与失效面初版

本课的架构交付物带三条可检验的验收标准。**模块边界**：应用层只 import \`langchain\` 主包与 \`@langchain/core\` 抽象；检索/向量库实现只在 RAG 层出现；任何文件 import classic 即架构违规（grep 断言可执行：\`grep -rn "@langchain/classic" src/\` 必须为空）。**状态形状**：图状态 = messages（内置）+ topic/sources（stateSchema）+ structuredResponse（responseFormat 注入），清单之外的字段进入需过架构评审——防止状态膨胀。**失效面初版**四条：middleware 叠放顺序（自建 citationGuard 与 toolRetry 的内外层顺序决定谁先拦错误，L63 的「审批中间件排在重试之前」是同型问题）；thread 隔离失效（跨租户串话，P1 断言承接）；流中断恢复（durability 语义，L79）；provider 的 tool_calls 质量差异（invalid 桶，L12）。这四条将在 L132 验收课升格为完整失效面清单。下一课按图施工：createAgent 组装 + 三类 middleware + MemorySaver + 检索链的完整实现。

### 本课小结

- **五层架构 + 依据表**：应用/Agent/Middleware/状态持久化/RAG+模型工具，每层带 文件:行号 锚点；写不出锚点的组件名不进架构图。
- **决策一**：createAgent（标准 ReAct + 逃生舱 getState 族），裸 StateGraph 只在改图拓扑时成立。
- **决策二**：持久化面向 BaseCheckpointSaver 五方法契约（MemorySaver 起步），stateSchema 只放「重算成本高于存储」的字段，只读配置走 context；状态即 serde 成本，增长型字段进评审。
- **决策三**：RAG 面向 core BaseRetriever + LCEL 组合；结构化输出 providerStrategy（能力协商三步决策链 + 降级预案）。
- **决策四**：模型入口 initChatModel（模型标识是配置不是代码）、工具入口 tool()（describe 纪律决定检索命中率），import 来源钉死新包防同名陷阱。
- **装配顺序公式**：变更型拦截外层、守门型拦截内层——顺序语义附注释写进架构文档。
- **架构级验收三条**：import 边界 grep 断言、状态字段白名单、失效面初版四条（中间件顺序/thread 隔离/流恢复/provider 差异）。
- 下一课：按图施工——完整可运行的实现与逐段验收断言。
`,
    null,
    [
      {
        text: '选 createAgent 而不是裸 StateGraph 的源码依据是什么？',
        options: [
          'createAgent 比 StateGraph 性能更好',
          'createAgent 实现体就是 return new ReactAgent(params)，ReactAgent 内部 #graph 是编译好的 LangGraph 图——简单 agent 场景直接得到完整 ReAct 循环，只有需要改图结构时才下探裸 StateGraph',
          'StateGraph 不支持工具调用',
          '两者是竞品关系，只能二选一',
        ],
        answer: 1,
        explain:
          'langchain/src/agents/index.ts:672-702 的实现体与 ReactAgent.ts:164-188 的 #graph 字段共同证明：createAgent 产出的就是 LangGraph 图的封装，二者不是竞品而是包装关系。「LangChain vs LangGraph 二选一」的旧认知失效（模块四口径）。选项 A 无性能证据；选项 C 错，ToolNode 就是图内节点；选项 D 与包装关系相反。',
        concept: 'lc-capstone-arch',
      },
      {
        text: 'checkpointer 层选 MemorySaver 起步的契约依据是什么？',
        options: [
          'MemorySaver 是唯一实现',
          'BaseCheckpointSaver 抽象契约固定五个方法（getTuple/list/put/putWrites/deleteThread），MemorySaver 是其内存实现——应用面向抽象编程，生产换 Postgres saver 时接口不变',
          'MemorySaver 自带持久化到磁盘',
          'checkpointer 必须与模型同厂商',
        ],
        answer: 1,
        explain:
          'libs/checkpoint/src/base.ts:180-239 的抽象类固定五方法契约，memory.ts:106 的 MemorySaver extends BaseCheckpointSaver 是最小实现——架构上应用只依赖抽象契约，saver 可替换。选项 A 错，还有其他 saver 实现与生态 saver；选项 C 与「内存实现」语义相反；选项 D 无此约束。',
        concept: 'lc-capstone-arch',
      },
      {
        text: 'RAG 层的检索抽象应该依赖哪个包的什么类？',
        options: [
          'classic 包的 RetrievalQAChain',
          'core 的 BaseRetriever 抽象（retrievers/index.ts:31-61）——1.x 主线的检索抽象在 core，实现自持或用集成包',
          'langchain 主包的 Retriever 类',
          '向量库厂商 SDK 直接裸用',
        ],
        answer: 1,
        explain:
          'BaseRetriever 定义在 langchain-core/src/retrievers/index.ts:31-61，12 个花式实现留 classic 但抽象在 core——1.x 架构下 RAG 层面向 core 抽象编程，检索实现可自持（自定义 _getRelevantDocuments）或走集成包。选项 A 是旧栈编排类，与「纯 1.x 从零构建」的 Capstone B 划界冲突；选项 C 的类名不存在；选项 D 绕过了 Runnable 生态（asRetriever 桥、回调传播），丢失可观测性。',
        concept: 'lc-capstone-arch',
      },
      {
        text: '结构化输出双策略中，选 providerStrategy 的决策依据是什么？',
        options: [
          '它实现更简单',
          'providerStrategy 走模型原生 json_schema 能力，schema 约束由 provider 端执行——前提是目标模型支持该能力（能力协商），不支持时回退 toolStrategy（隐藏 extract 工具，依赖 tool_calls 通路）',
          'toolStrategy 已被废弃',
          'providerStrategy 输出不需要解析',
        ],
        answer: 1,
        explain:
          '双策略的分工（L96）：ToolStrategy 隐藏一个 extract 工具、靠 tool_calls 强制结构化；ProviderStrategy 用模型原生 json_schema 受限解码。选型的硬依据是目标模型的能力面——能力协商决定策略可用性，而不是实现复杂度。选项 A 无关；选项 C 错，toolStrategy 是活跃导出（responses.ts:478）；选项 D 错，任何策略的产物都要经解析归一才能进 structuredResponse。',
        concept: 'lc-capstone-arch',
      },
      {
        text: '架构图里 middleware 层的横切位置依据是什么？',
        options: [
          'middleware 是独立进程',
          '六个 hook（wrapModelCall/wrapToolCall/beforeAgent/beforeModel/afterModel/afterAgent）经 hook 节点化插进 agent 图流水线——middleware 是图内的切面层，不是外部代理',
          'middleware 只在模型外网请求时生效',
          'middleware 是编译期宏',
        ],
        answer: 1,
        explain:
          '六 hook 契约（L52）与 hook 节点化机制（L47）：before*/after* 成为图节点、wrap* 包裹节点内部调用——middleware 的横切位置在图流水线内部，这决定了它天然获得图状态与回调上下文。选项 A/D 无据；选项 C 与事实相反，wrapToolCall 恰在工具执行路径上。',
        concept: 'lc-capstone-arch',
      },
    ],
    [
      [
        '源码依据图',
        '架构图 + 依据表的合体：每个组件除画依赖关系外，必须标注其源码锚点（文件:行号 + commit），决策不可溯源即架构不成立',
      ],
      [
        '能力协商',
        '结构化输出选型的前置检查：目标模型是否支持原生 json_schema 决定 providerStrategy 可用性，schema 归一化管线（transformResponseFormat）按能力分派策略',
      ],
      [
        '模块边界契约',
        '架构文档中声明的 import 允许方向：应用层→langchain 主包、模型/检索实现→core 抽象、禁止任何层 import classic',
      ],
      [
        '失效面清单',
        '架构期列出的「可能失败且需要预案」的面：中间件顺序、thread 隔离、流中断恢复、provider tool_calls 质量差异',
      ],
    ],
    [
      '架构文档只画组件框图不带源码锚点——没有 文件:行号 依据的组件名（比如想当然的「MemoryManager」）在 1.x 里可能根本不存在，写实现时才发现要重新设计',
      '把 stateSchema 设计成大杂烩——状态字段越多，图状态的序列化/合并成本越高；只放「中间件与工具 genuinely 需要跨轮共享」的字段，消息历史一律走 messages 不另设字段',
      '默认 providerStrategy 永远可用——能力协商失败时 createAgent 的行为要在架构期确认并写降级预案（回退 toolStrategy 或降级为纯文本 + 外部解析），而不是上线后遇错再查',
    ],
  ),
  'capstone',
)
