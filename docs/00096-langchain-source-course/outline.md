# LangChain 源码深度课 · 逐课大纲 v3（待审批）

- 日期：2026-11-15；证据基础：`research/evidence/01-07`（全部 A 级，源码 `langchainjs@7704471` / `langgraphjs@fa426b2`）
- 规模：**10 模块 / 34 阶段 / 132 课**。超出 100–120 承诺的 12 课来自两处弹性：模块二 17 课（消息/模型/工具/Prompt 的知识面向驱动，含 5 课压缩候选见文末）与模块九 23 课（用户要求覆盖全部迁移变更、不锁课数）。压缩后可达 127。
- 用户已拍板：量级 OK；演练形态自定；**实战拆 2 个 Capstone**；迁移深度覆盖全部变更
- kind 依据项目闸门口径：theory 交付理解 / practice 交付可运行物 / framework 框架对照；★ = 原理重课

## 模块一 · 坐标与版本（3 阶段 / L01–L09）

**1A 仓库地形**
- L01 三包分裂的 1.x 世界：langchain / langchain-core / langchain-classic 各自版本与定位 | package.json×3 | framework
- L02 依赖方向取证：core 零依赖底座、主包换 langgraph 心脏、classic 回望 0.x | langchain/package.json:73-81 | theory ★
- L03 主包导出面清单：从 index.ts 读出 1.x 的产品重心 | langchain/src/index.ts:4-78 | framework

**1B 运行时底座**
- L04 core 依赖表会说话：zod v4 / mustache / p-queue / js-tiktoken 各管什么 | langchain-core/package.json:17-25 | theory
- L05 跨包 instanceof 的 Symbol.for 解法：MESSAGE_SYMBOL 与 Symbol.hasInstance 覆写 | messages/base.ts:21,364-376 | theory ★
- L06 engines>=20 与 ESM/CJS 双轨发布：tsdown 构建、files 清单、兼容产物 | langchain/package.json:7-32 | practice

**1C 从导出看到架构**
- L07 classic 的博物馆清单：files 字段里的 chains/memory/experimental | langchain-classic/package.json:14-60 | framework
- L08 主包如何「重新导出」core：转发层作为版本稳定策略 | langchain/src/index.ts:4-44 | framework
- L09 initChatModel 与 headless tool：主包唯二的新增面 | langchain/src/index.ts:23-33 | practice

## 模块二 · core 数据原语（4 阶段 / L10–L26，17 课）

**2A 消息模型（6 课）**
- L10 BaseMessage 骨架：type 泛型化 role、content 双轨、MESSAGE_SYMBOL | messages/base.ts:215-311 | framework ★
- L11 HumanMessage/SystemMessage 极简实现与 concat 差异 | human.ts:18-79; system.ts:40-68 | theory
- L12 AIMessage 构造解剖：tool_calls 解析、invalid 桶、v1 内容块互补 | ai.ts:68-189 | framework ★
- L13 ToolMessage 三字段：tool_call_id 关联、artifact 双通道、status 错误即数据 | tool.ts:13-118 | framework
- L14 ContentBlock v1 类型集：text/reasoning/refusal/tool_call/多模态与 NonStandard 逃生舱 | messages/content/index.ts:19-169 | theory ★
- L15 chunk 合并规则表：_mergeDicts/_mergeLists 的 index/id 匹配与 provider 特判 | base.ts:446-666; ai.ts:477-530 | theory ★

**2B 模型调用面（5 课）**
- L16 BaseChatModel.invoke 全链路：消息 → PromptValue → generatePrompt → ChatGeneration | chat_models.ts:287-300 | framework ★
- L17 流式三件套：_streamResponseChunks 缺省抛错、_streamIterator 降级 invoke、disableStreaming | chat_models.ts:302-309,504-514 | theory
- L18 ChatModelStream 块级事件：text/toolCalls/reasoning/usage 四子流、v1/v0 协议并存 | chat_models.ts:318-345; event.ts:47-155 | framework ★
- L19 bindTools 与 withStructuredOutput：可选方法表达的能力契约 | chat_models.ts:276-279,1290-1338 | framework
- L20 BaseLLM 与缓存：被边缘化的补全家族与 InMemoryCache.global() | llms.ts:38; base.ts:464-481 | theory

**2C 工具体系（3 课）**
- L21 StructuredTool 校验双引擎：Zod interop 与 @cfworker/json-schema、ToolInputParsingException | tools/index.ts:222-272 | framework ★
- L22 tool() 重载矩阵：schema 分派、AsyncGenerator 工具事件、returnDirect | tools/index.ts:652-872; tools/types.ts:30-64 | framework
- L23 ToolRuntime 注入：state/toolCallId/context/store/writer 的第二参数契约 | tools/types.ts:541-581 | theory ★

**2D Prompt 与解析（3 课）**
- L24 PromptTemplate：f-string/mustache 双格式与类型级参数提取 | prompts/prompt.ts:75-96,216-275 | theory ★
- L25 ChatPromptTemplate.fromMessages 与 BasePromptTemplate 的 Runnable 身份 | prompts/chat.ts:1190-1216 | framework
- L26 FewShot 与 OutputParser 双层体系：exampleSelector、parse/parseResult 分层 | few_shot.ts:106-121; output_parsers/base.ts | framework

## 模块三 · Runnable 与组合（3 阶段 / L27–L36）

**3A Runnable 基类（3 课）**
- L27 四大支柱 invoke/batch/stream/transform 与降级链：默认实现即行为说明书 | runnables/base.ts:121-324 | framework ★
- L28 batch 的并发工程：AsyncCaller、maxConcurrency、returnExceptions | base.ts:208-290 | theory
- L29 stream 首块缓冲与 IterableReadableStream：为什么错误能立即抛出 | base.ts:298-324 | theory ★

**3B 组合子家族（5 课）**
- L30 pipe 与 RunnableSequence：first/middle/last、吸并扁平化、seq:step:N 子回调 | base.ts:616-624,1944-2040 | framework ★
- L31 RunnableMap 并行扇出：Promise.all vs Promise.race 两种时序、atee 迭代器广播 | base.ts:2335-2425,2888 | framework ★
- L32 RunnableLambda 行为分派：返回 Runnable 委托（recursionLimit:25）、返回 AsyncIterable 流式 | base.ts:2572-2852 | theory ★
- L33 RunnableWithFallbacks / RunnableAssign / pick：错误保留策略与字典扩展器 | base.ts:2958-3334 | framework
- L34 withRetry/withConfig/withFallbacks/withListeners：bind 家族实现本质 | base.ts:151-206,1740-1814 | framework

**3C config 与回调（执行视角，2 课）**
- L35 RunnableConfig 双轨传播：ensureConfig 默认值、runId 不继承、AsyncLocalStorage 隐式注入 | runnables/config.ts:153-186 | theory ★
- L36 回调传播机制（执行树视角）：getChild 逐层下发、run 树生长——可观测消费视角见模块七 L92/L93 | callbacks/manager.ts:779-1100 | theory ★

## 模块四 · 新架构核心：createAgent 与 ReactAgent（4 阶段 / L37–L50）

**4A createAgent 解剖（3 课）**
- L37 createAgent 全景：一行实现体到 14 个重载 | agents/index.ts:176-730 | theory ★
- L38 responseFormat 四形态与重载分类：Zod 对象/数组/JsonSchema/无 | index.ts 各重载 | theory
- L39 泛型参数推导：TMiddleware/TTools 的 const 参数如何收集类型 | index.ts | theory ★

**4B ReactAgent 内核（5 课）**
- L40 ReactAgent 类骨架：~agentTypes 品牌与 #graph | ReactAgent.ts:164-190 | theory
- L41 构造器如何编译出图：allNodeWorkflows.compile 全流程 | ReactAgent.ts:189-730 | theory ★
- L42 invoke 路径追踪：从参数归一到 #graph.invoke | ReactAgent.ts:1223-1241 | practice
- L43 stream 路径与 streamEvents：流式输出的两条通道 | ReactAgent.ts:1289-1533 | practice
- L44 图级 API 透传：getState/getStateHistory/getSubgraphs | ReactAgent.ts:1562-1618 | theory

**4C 节点流水线（4 课）**
- L45 AgentNode：模型调用与工具循环决策的 1107 行 | nodes/AgentNode.ts | theory ★
- L46 ToolNode：客户端工具执行与 returnDirect | nodes/ToolNode.ts | practice
- L47 hook 节点化：before*/after* 如何插进流水线 | ReactAgent.ts:269-382; nodes/middleware.ts | theory ★
- L48 entry/exit 决策：为什么入口由第一个 beforeAgent 决定 | ReactAgent.ts:422-441 | theory

**4D 状态与上下文（2 课）**
- L49 state/context 双 schema：内置状态与运行时上下文 | state.ts/annotation.ts/runtime.ts | theory
- L50 JumpToTarget 与节点跳转 | constants.ts + AgentNode | practice

## 模块五 · 中间件体系（4 阶段 / L51–L64）

**5A middleware 契约（4 课）**
- L51 AgentMiddleware 接口全解：stateSchema/contextSchema/tools/tracePolicy | middleware/types.ts:404-490 | theory ★
- L52 六个 hook 的类型与调用时机：wrapModelCall/wrapToolCall/before*/after* | types.ts:554-624 | theory ★
- L53 createMiddleware 工厂与 MIDDLEWARE_BRAND | middleware.ts | practice
- L54 wrapModelCall：改写模型请求的统一入口 | types.ts + 实现示例 | practice

**5B 控制流类（4 课）**
- L55 wrapToolCall 与 ToolNode 的联动 | ToolNode + types | practice
- L56 modelRetry/modelFallback：模型层容错两件套 | modelRetry.ts; modelFallback.ts | theory
- L57 modelCallLimit 与 toolCallLimit：预算闸两种 | modelCallLimit.ts; toolCallLimit.ts | theory
- L58 toolRetry/toolError/toolEmulator：工具层容错与模拟 | 三文件 | practice

**5C 上下文与安全类（3 课）**
- L59 summarization：1009 行的上下文压缩 | summarization.ts | theory ★
- L60 contextEditing 与 dynamicSystemPrompt：提示词工程中间件 | 两文件 | theory
- L61 pii/piiRedaction：敏感信息检测与脱敏 | pii.ts; piiRedaction.ts | theory

**5D 交互与路由类（3 课）**
- L62 hitl（上）：interrupt 机制与人工介入 | hitl.ts:1-600 | theory ★
- L63 hitl（下）：per-call interrupts 与审批流 | hitl.ts:600-1233 | practice
- L64 modelRouter/llmToolSelector/providerToolSearch/todoList/autoMode：路由与选择族 | 五文件 | theory

## 模块六 · LangGraph 编排内核（5 阶段 / L65–L82）

**6.1 StateGraph 构建 API（4 课）**
- L65 StateGraph 类型全景：十个泛型如何驱动类型安全 | graph/state.ts:407-418,1693-1716 | theory
- L66 schema 归一化：Annotation/StateSchema/Zod 三路汇成 StateDefinition | state.ts:805-898 | framework
- L67 addNode 的编译期准备：自动错误处理器节点 __error_handler__ | state.ts:1063-1243 | practice ★
- L68 编译即接线：attachNode/attachEdge 把业务图降维成通道网络 | state.ts:1749-2003 | theory ★

**6.2 Channel 系统（5 课）**
- L69 BaseChannel 契约：七件套方法与双标记 | channels/base.ts:45-153 | theory
- L70 LastValue 与 BinaryOperatorAggregate：覆盖 vs 归并、INVALID_CONCURRENT_GRAPH_UPDATE | last_value.ts:12-67; binop.ts:69-131 | theory ★
- L71 Topic 与 AnyValue/EphemeralValue：事件总线与一次性通道 | topic.ts:84-135 等 | theory
- L72 同步屏障三兄弟：NamedBarrier/AfterFinish/DynamicBarrier 与 join 边降维 | named_barrier_value.ts:13-81 | theory ★
- L73 DeltaChannel 与 UntrackedValue：不存全量的两种取舍、checkpoint 结构 v:4 | delta.ts:84-231 | theory ★

**6.3 Pregel 运行时（4 课）**
- L74 isResuming：五种 resume 信号与 channel_versions 前提 | pregel/loop.ts:633-678 | theory
- L75 tick() 深读：一次 BSP 超步的完整旅程 | loop.ts:1194-1411 | theory ★
- L76 _applyWrites 与确定性排序：task path 排序为什么等于可重放 | pregel/algo.ts:308-464 | theory ★
- L77 PregelRunner 与 loop 分工：并发执行、AbortSignal 三链、_commit 三形态 | runner.ts:92-218 | practice ★

**6.4 流式/检查点/重放（3 课）**
- L78 八种流模式与 StreamChunk：[namespace, mode, payload] 与子图路由 | pregel/types.ts:25-35; stream.ts | theory
- L79 checkpoint 结构与 durability 三档：sync 在发 values 前 await | loop.ts:2080-2193; checkpoint.ts | theory ★
- L80 retry/timeout/resume 容错矩阵：指数退避、心跳、interrupt 按 XXH3 精确路由 | retry.ts:13-62; timeout.ts | practice ★

**6.5 高层模式（2 课）**
- L81 createReactAgent + ToolNode：预置 ReAct 循环的降维拆解 | prebuilt/react_agent_executor.ts:669-750 | framework
- L82 supervisor vs swarm：中心化 handoff vs activeAgent 状态接力 | langgraph-supervisor/src/supervisor.ts:118-159 | framework

## 模块七 · 全栈能力（4 阶段 / L83–L95）

**7A RAG 源码链（5 课）**
- L83 加载环：DocumentLoader 契约与 Document 三元组 | document_loaders/base.ts:6-21 | theory
- L84 切分环（一）：Transformer 即 Runnable，Mapping/非 Mapping 两形态 | documents/transformers.ts:15-59 | theory
- L85 切分环（二）：RecursiveCharacterTextSplitter 递归算法逐行拆解、mergeSplits 滑窗 | text_splitter.ts:183-226,289-348 | framework ★
- L86 向量化与存储环：EmbeddingsInterface 双方法 + VectorStore 三抽象 | embeddings.ts:9-61; vectorstores.ts:553-698 | framework
- L87 检索环：BaseRetriever 骨架 + asRetriever 桥 + MMR | retrievers/index.ts:142-173 | practice

**7B 记忆与缓存（4 课）**
- L88 遗留记忆层：BaseMemory/ChatHistory 双基类为何被淘汰 | memory.ts:28-54; chat_history.ts | theory
- L89 LLM 缓存：BaseCache 与 sha256 键编码、Generation 级挂载层 | caches/index.ts:6-97 | framework
- L90 checkpoint（一）：Checkpoint 三字典与版本时钟 | checkpoint/base.ts:18-104 | framework ★
- L91 checkpoint（二）：BaseCheckpointSaver 契约、putWrites 排序、JsonPlusSerializer、BaseStore 分工 | checkpoint/base.ts:180-239; serde/jsonplus.ts | framework ★

**7C 可观测体系（消费视角，2 课）**
- L92 Tracer 家族与 langsmith 硬依赖：persistRun、RunTree 上报、streamEvents 回调——与 L36 执行树视角划界 | tracers/base.ts:21-128 | theory ★
- L93 callback 消费端：configure 双层合并、handler 报错不中断主流程 | callbacks/manager.ts:1337-1442 | framework ★

**7D 外部连接（2 课）**
- L94 MCP 接入：loadMcpTools 与 ConnectionManager、三传输、elicitation | langchain-mcp-adapters/src/tools.ts:470-500 | practice
- L95 provider 包结构与 Hub/load 序列化：import_map 与模型注册 | providers/langchain-openai/package.json; hub/base.ts | theory

## 模块八 · 结构化输出与类型系统（2 阶段 / L96–L101）

**8A 结构化输出（3 课）**
- L96 两种策略：ToolStrategy 隐藏 extract 工具 vs ProviderStrategy 原生 json_schema | responses.ts:54-230 | framework ★
- L97 错误哲学分野：parse 抛错可回喂 vs 返回 undefined；structuredOutput 能力协商 | responses.ts:151-161,238-288,449-476 | theory ★
- L98 transformResponseFormat 归一化：三类 schema 输入 × 能力协商、数组约束、__brand | responses.ts:293-439 | framework

**8B 类型系统（3 课）**
- L99 createAgent 的 const 泛型与 14 重载分派 | agents/index.ts:176-236 | theory ★
- L100 类型级 reduce：CombineTools / CombineStreamTransformers 递归条件类型 | agents/types.ts:148-220 | theory ★
- L101 InteropZodType 与 AgentTypeConfig：Zod v3/v4 互操作、InferAgent* 反查族 | utils/types/zod.ts:167-189 | theory

## 模块九 · 迁移：从 0.x 到 1.x（3 阶段 / L102–L124，覆盖变更驱动、课数弹性）

**9A 两代架构世界观差异（5 课）**
- L102 从 Chain 王国到 Runnable+Graph：classic 30 目录 vs 1.x 8 目录对比地图 | classic/src; langchain/src/index.ts | theory ★
- L103 BaseChain 的 call/values 协议解剖：为什么必须被淘汰 | chains/llm_chain.ts:89-200 | theory ★
- L104 memory 隐式读写协议：loadMemoryVariables/saveContext，状态藏在 chain 对象里 | classic/memory/buffer_memory.ts:50-96 | theory ★
- L105 新世界观：Agent 即编译图 | agents/index.ts:672-702 | theory ★
- L106 持久化地基换代：BaseChatMessageHistory → BaseCheckpointSaver | chat_history.ts:10-40; checkpoint/base.ts | theory ★

**9B 逐项 API 映射（13 课，36 行映射总表见 evidence/07）**
- L107 Chain 族迁移（上）：LLMChain/SequentialChain/TransformChain → LCEL 三原语 | sequential_chain.ts:77 | practice
- L108 Chain 族迁移（下）：RetrievalQA/Stuff/MapReduce/Refine 与路由链、无替代项 | retrieval_qa.ts:57-117 | practice
- L109 Memory 族迁移：BufferMemory/WindowMemory/TokenBuffer → messages + trimMessages | buffer_memory.ts:80-96 | practice
- L110 ConversationSummaryMemory → summarizationMiddleware 逐参数对照 | summary.ts:127; summarization.ts:36-68 | practice ★
- L111 EntityMemory/CombinedMemory/VectorStoreRetrieverMemory 的 1.x 化身 | 三个 memory 文件 | practice
- L112 AgentExecutor → createAgent：主循环与构造参数映射 | executor.ts:352-398 | practice ★
- L113 旧 Agent 协议族退役：ZeroShot/Chat/StructuredChat/OpenAI/XML 五套协议收敛为 tool_calls | agents/mrkl 等 | framework
- L114 Toolkits 与垂类链的去向：SqlToolkit/SqlDatabaseChain/GraphCypherQAChain | toolkits/sql/sql.ts:37 | framework
- L115 Executor 开关 → middleware 生态全景映射 | middleware/index.ts:1-126 | framework
- L116 结构化输出换代：StructuredOutputParser → responseFormat 双策略 | classic/output_parsers/structured.ts:30 | practice ★
- L117 Prompt 与 OutputParser 搬家课：哪些只需改 import、classic 入口报错史 | prompts/index.ts:1-7 | practice
- L118 检索层迁移：BaseRetriever 下沉、12 个花式 retriever 留守 | multi_query.ts:91; self_query/index.ts | framework
- L119 底座层迁移：VectorStore/Embeddings/Document 纯换包名 + createReactAgent 同名陷阱 | classic/agents/index.ts:96-99 | practice

**9C 完整应用迁移走查（示范性质，5 课）**
- L120 双包并存与混合运行策略：共享 core 的类型互通 | classic/package.json:123-204 | theory
- L121 走查①：RAG 问答应用迁移（RetrievalQAChain+BufferMemory → LCEL+checkpointer） | retrieval_qa.ts | practice
- L122 走查②：对话助手迁移（ConversationChain → createAgent+summarization+MemorySaver） | conversation.ts:30-53 | practice ★
- L123 走查③：工具调用 Agent 迁移（AgentExecutor+ZeroShot → createAgent+toolError/toolRetry） | executor.ts | practice
- L124 留守清单与迁移终局：无替代 API 的长期共存决策树 | classic/src/index.ts:1-3 | framework

## 模块十 · 实战：两个 Capstone（2 阶段 / L125–L132）

> 与模块九 9C 的边界：9C 是**教学示范**（每课聚焦一类迁移、跟着改）；Capstone A 是**独立交付**（一个综合多类旧 API 的完整应用，从盘点到验收全流程自己做，带可执行断言）；Capstone B 与迁移无关，纯 1.x 从零构建。

**10.1 Capstone A · 迁移型实战（4 课）**
- L125 需求盘点与迁移计划：给定一个 0.x 应用（Chain+Memory+AgentExecutor+OutputParser 全家桶），产出迁移映射表与风险清单 | 复用 evidence/07 映射表 | capstone
- L126 数据层迁移：Chain/Memory → LCEL+messages 状态改写 | classic 多文件 | capstone
- L127 Agent 层迁移：AgentExecutor+协议族 → createAgent+middleware，行为对齐断言 | executor.ts | capstone
- L128 验收与复盘：迁移前后行为等价断言、遗留项决策、复盘表 | capstone

**10.2 Capstone B · 综合型实战（4 课）**
- L129 架构设计：带 middleware+检查点+RAG+结构化输出的 agent，画源码依据图 | 全课程综合 | capstone
- L130 核心实现：createAgent 组装 + 三类 middleware + MemorySaver + 检索链 | capstone
- L131 流式与结构化输出：streamEvents + responseFormat 双策略接入 | capstone
- L132 验收与复盘：可执行验收断言、失效面清单、全课程源码地图收束 | capstone

## 覆盖审计与划界说明

- **划界 1**：L36（模块三，执行树视角的回调传播）↔ L92/L93（模块七，可观测消费视角）——同一套 callbacks 源码，两个视角不重复讲。
- **划界 2**：L81（langgraph prebuilt createReactAgent）↔ 模块四 createAgent——前者是 LangGraph 预置件，后者是 langchain 包 harness，同名陷阱在 L119 点破。
- **划界 3**：9C 示范走查（L121-L123）↔ Capstone A（L125-L128）——示范 vs 独立交付；9C 每课给完整代码，Capstone A 只给验收断言与关键节点提示。
- **前置无环**：模块编号即依赖序；模块九依赖模块一~八全部主线；模块十依赖全部。
- **kind 实测分布**：theory 61 / practice 28 / framework 35 / capstone 8 = 132；原理重课 ★ 实测 55 节（含在 theory/framework 内）。
- **数量口径**：模块九 23 课由「覆盖全部迁移变更」驱动（36 行映射表 + 3 类走查 + 5 课世界观）；模块二 17 课含 5 课压缩候选——**审核时可指定砍/并**：L11（并入 L10）、L20（并入 L16）、L25（并入 L24）、L28（并入 L27）、L34（并入 L33），砍满即回到 127 课。
