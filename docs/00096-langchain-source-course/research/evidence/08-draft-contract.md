# 草稿契约 · LangChain 源码深度课（132 课，00096）

> 本文件是所有草稿撰写者（人/子代理）的**唯一事实源**。写草稿前必须通读，逐字遵守。
> 大纲蓝图：`docs/00096-langchain-source-course/outline.md`；证据台账：`research/evidence/01-07`。

## 1. 草稿格式

文件：`docs/00096-langchain-source-course/drafts/LNN.md`（三位数课如 `L100.md`）。`---` 包围 JSON frontmatter + markdown 正文。

```markdown
---
{
  "id": "L01",
  "stage": 1,
  "title": "三包分裂的 1.x 世界：langchain / langchain-core / langchain-classic 各自版本与定位",
  "difficulty": 2,
  "prereqs": [],
  "concepts": ["lc-package-split"],
  "kind": "framework",
  "goals": ["能说出三个包各自的定位与当前版本", "能从 package.json 取证依赖方向"],
  "quiz": [
    { "text": "…", "options": ["A", "B", "C", "D"], "answer": 1, "explain": "…", "concept": "lc-package-split" }
  ],
  "terms": [["langchain-classic", "旧 Chain/Memory/AgentExecutor 的隔离包，1.x 主线不再演进"]],
  "pitfalls": ["把 Python 主线的版本号（1.5.0/1.8.0）套用到 TS 线——TS 线是 langchain 1.6.6 / core 1.4.1 / langgraph 1.7.4"]
}
---
（正文 markdown）
```

字段硬约束（生成器会拒收）：
- `id` 匹配 `L\d{2,3}`；`stage` / `title` / `difficulty` 必填；`difficulty` 取 1–3。
- `prereqs` 是**课时 id 数组**（不是概念 id），且只能引用表中更早的课；按第 5 节总表填，不要自己发明。
- `concepts` 是概念 id 数组，**只能从第 6 节概念全集取**，至少 1 个；按总表给定的填（一般 1 个）。
- `goals` ≥ 2 条；`kind` ∈ theory/practice/framework/scenario/capstone/overview（本课只用前四种 + capstone）。
- `quiz` ≥ 1 题；每题 `options` ≥ 2、`answer` 为 0-based 索引、`concept` 必填且 ∈ 本课 concepts；`explain` 必须讲清为什么错项错。
- `terms` ≥ 1 条（`[术语, 解释]` 二元组）、`pitfalls` ≥ 1 条。
- JSON 必须严格合法（双引号、无尾逗号、无注释）。

## 2. 课型与体量闸门（硬门禁，不达标直接失败）

| kind | 正文字数下限 | 代码字符下限 | 说明 |
|---|---|---|---|
| theory | 1200 | 400 | 交付理解：机制、为什么、辨析 |
| practice | 1800 | 1500 | 交付可运行物：**goals 必须含实现类动词**（实现/写出/搭/构建/跑通/调通/接入/打通/产出/从零） |
| framework | 1500 | 1000 | 手写版/框架版对照或逐文件走读 + 差异结论 |
| capstone | 3000 | 2500 | 端到端交付 + 可执行验收断言 |

- H1：标题含「实战」→ 禁止 theory/overview（本课标题都不含，不用担心）。
- H2：kind=practice 的 goals 必须含至少一个实现类动词。
- 字数统计剥离代码块后按可见文字计；**写 1400+ / 2100+ / 1800+ / 3300+ 留安全余量**。
- 正文字数含表格文字与列表文字，但不要靠堆表格凑字——叙述段落是主体。

## 3. 正文风格（对齐 docs/00091-agent-harness-course/drafts/L05.md 的密度）

- 开篇 1-2 段定锚：本课在课程地图的位置 + 一句话核心结论。
- 用 `###` 小节推进（3-5 个），每个小节一个论证单元；「源码走读」课以**真实源码摘录 + 逐行解读**为主。
- 代码块一律来自证据台账摘录的真实源码（可裁剪），标注来源：```ts 代码块后紧跟一行斜体来源，如 *— langchain-core/src/messages/base.ts:215-230（commit 7704471）*。
- 事实句带出处（文件:行 或 台账编号）；不确定的不写，禁止凭记忆补 API。
- 版本号只在 META 与证据引用里出现，正文引用具体行为时不写「1.6.6 新增」这类漂移句式。
- 适度使用表格做对照（新旧映射、分类归纳）；**bold** 强调关键结论；每课正文 4-8 KB。
- 结尾小节「本课小结」3-5 条 bullet 收束，并为下一课留钩子。
- 不写 HTML；不用 `:::` 容器；不用一级/二级标题（从 `###` 开始）。

## 4. 全课统一口径（防止课间冲突）

- **TS 线版本**：langchain@1.6.6 / @langchain/core@1.4.1 / @langchain/langgraph@1.7.4 / langchain-classic@1.0.61；源码锚 langchainjs@7704471、langgraphjs@fa426b2。
- `createAgent`（camelCase）是 TS 真实导出，**14 个重载**；`create_agent` 是 Python 名。
- Agent = 编译后的 LangGraph 图：`createAgent()` 实现体仅 `return new ReactAgent(params)`，`invoke()` 委托 `#graph.invoke()`。
- middleware hook 六个：wrapModelCall / wrapToolCall / beforeAgent / beforeModel / afterModel / afterAgent。
- Pregel 内核：`PregelLoop.tick()` BSP 超步；Channel 11 种实现；checkpoint 三字典。
- 划界（不要越界讲）：L36 回调只讲执行树视角（消费视角归 L92/L93）；L81 只讲 langgraph prebuilt（langchain harness 归模块四）；9C 示范给完整代码，Capstone A 只给验收断言与关键提示。

## 5. 132 课总表（stage / kind / concept / prereqs / difficulty 一律按此表，不得自行更改）

> prereqs 空 = `[]`。标题照抄（quiz/正文可在此基础上展开）。

### 模块一 · 坐标与版本（stage 1-3）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L01 | 1 | 三包分裂的 1.x 世界：langchain / langchain-core / langchain-classic 各自版本与定位 | framework | lc-package-split | [] | 1 |
| L02 | 1 | 依赖方向取证：core 零依赖底座、主包换 langgraph 心脏、classic 回望 0.x | theory | lc-deps-direction | ["L01"] | 2 |
| L03 | 1 | 主包导出面清单：从 index.ts 读出 1.x 的产品重心 | framework | lc-export-surface | ["L01"] | 2 |
| L04 | 2 | core 依赖表会说话：zod v4 / mustache / p-queue / js-tiktoken 各管什么 | theory | lc-core-deps | [] | 2 |
| L05 | 2 | 跨包 instanceof 的 Symbol.for 解法：MESSAGE_SYMBOL 与 Symbol.hasInstance 覆写 | theory | lc-symbol-instanceof | ["L01"] | 3 |
| L06 | 2 | engines>=20 与 ESM/CJS 双轨发布：tsdown 构建、files 清单、兼容产物 | practice | lc-dual-format | [] | 2 |
| L07 | 3 | classic 的博物馆清单：files 字段里的 chains/memory/experimental | framework | lc-classic-museum | ["L01"] | 2 |
| L08 | 3 | 主包如何「重新导出」core：转发层作为版本稳定策略 | framework | lc-reexport-strategy | ["L03"] | 2 |
| L09 | 3 | initChatModel 与 headless tool：主包唯二的新增面 | practice | lc-init-chat-model | ["L03"] | 2 |

### 模块二 · core 数据原语（stage 4-7）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L10 | 4 | BaseMessage 骨架：type 泛型化 role、content 双轨、MESSAGE_SYMBOL | framework | lc-base-message | ["L05"] | 3 |
| L11 | 4 | HumanMessage/SystemMessage 极简实现与 concat 差异 | theory | lc-message-concat | ["L10"] | 1 |
| L12 | 4 | AIMessage 构造解剖：tool_calls 解析、invalid 桶、v1 内容块互补 | framework | lc-ai-message | ["L10"] | 3 |
| L13 | 4 | ToolMessage 三字段：tool_call_id 关联、artifact 双通道、status 错误即数据 | framework | lc-tool-message | ["L10"] | 2 |
| L14 | 4 | ContentBlock v1 类型集：text/reasoning/refusal/tool_call/多模态与 NonStandard 逃生舱 | theory | lc-content-blocks | ["L10"] | 2 |
| L15 | 4 | chunk 合并规则表：_mergeDicts/_mergeLists 的 index/id 匹配与 provider 特判 | theory | lc-chunk-merge | ["L12"] | 3 |
| L16 | 5 | BaseChatModel.invoke 全链路：消息 → PromptValue → generatePrompt → ChatGeneration | framework | lc-chat-model-invoke | ["L10"] | 3 |
| L17 | 5 | 流式三件套：_streamResponseChunks 缺省抛错、_streamIterator 降级 invoke、disableStreaming | theory | lc-model-streaming | ["L16"] | 2 |
| L18 | 5 | ChatModelStream 块级事件：text/toolCalls/reasoning/usage 四子流、v1/v0 协议并存 | framework | lc-chat-stream-events | ["L17"] | 3 |
| L19 | 5 | bindTools 与 withStructuredOutput：可选方法表达的能力契约 | framework | lc-bind-tools | ["L16"] | 2 |
| L20 | 5 | BaseLLM 与缓存：被边缘化的补全家族与 InMemoryCache.global() | theory | lc-base-llm-cache | ["L16"] | 2 |
| L21 | 6 | StructuredTool 校验双引擎：Zod interop 与 @cfworker/json-schema、ToolInputParsingException | framework | lc-structured-tool | ["L10"] | 3 |
| L22 | 6 | tool() 重载矩阵：schema 分派、AsyncGenerator 工具事件、returnDirect | framework | lc-tool-factory | ["L21"] | 3 |
| L23 | 6 | ToolRuntime 注入：state/toolCallId/context/store/writer 的第二参数契约 | theory | lc-tool-runtime | ["L22"] | 3 |
| L24 | 7 | PromptTemplate：f-string/mustache 双格式与类型级参数提取 | theory | lc-prompt-template | ["L10"] | 2 |
| L25 | 7 | ChatPromptTemplate.fromMessages 与 BasePromptTemplate 的 Runnable 身份 | framework | lc-chat-prompt-template | ["L24"] | 2 |
| L26 | 7 | FewShot 与 OutputParser 双层体系：exampleSelector、parse/parseResult 分层 | framework | lc-fewshot-parser | ["L25"] | 2 |

### 模块三 · Runnable 与组合（stage 8-10）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L27 | 8 | 四大支柱 invoke/batch/stream/transform 与降级链：默认实现即行为说明书 | framework | lc-runnable-pillars | ["L16"] | 3 |
| L28 | 8 | batch 的并发工程：AsyncCaller、maxConcurrency、returnExceptions | theory | lc-batch-concurrency | ["L27"] | 2 |
| L29 | 8 | stream 首块缓冲与 IterableReadableStream：为什么错误能立即抛出 | theory | lc-stream-buffer | ["L27"] | 3 |
| L30 | 9 | pipe 与 RunnableSequence：first/middle/last、吸并扁平化、seq:step:N 子回调 | framework | lc-runnable-sequence | ["L27"] | 3 |
| L31 | 9 | RunnableMap 并行扇出：Promise.all vs Promise.race 两种时序、atee 迭代器广播 | framework | lc-runnable-map | ["L30"] | 3 |
| L32 | 9 | RunnableLambda 行为分派：返回 Runnable 委托（recursionLimit:25）、返回 AsyncIterable 流式 | theory | lc-runnable-lambda | ["L30"] | 3 |
| L33 | 9 | RunnableWithFallbacks / RunnableAssign / pick：错误保留策略与字典扩展器 | framework | lc-fallbacks-assign | ["L30"] | 2 |
| L34 | 9 | withRetry/withConfig/withFallbacks/withListeners：bind 家族实现本质 | framework | lc-bind-family | ["L30"] | 2 |
| L35 | 10 | RunnableConfig 双轨传播：ensureConfig 默认值、runId 不继承、AsyncLocalStorage 隐式注入 | theory | lc-runnable-config | ["L27"] | 3 |
| L36 | 10 | 回调传播机制（执行树视角）：getChild 逐层下发、run 树生长——可观测消费视角见 L92/L93 | theory | lc-callback-propagation | ["L35"] | 3 |

### 模块四 · createAgent 与 ReactAgent（stage 11-14）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L37 | 11 | createAgent 全景：一行实现体到 14 个重载 | theory | lc-create-agent | ["L19"] | 3 |
| L38 | 11 | responseFormat 四形态与重载分类：Zod 对象/数组/JsonSchema/无 | theory | lc-response-format-overloads | ["L37"] | 2 |
| L39 | 11 | 泛型参数推导：TMiddleware/TTools 的 const 参数如何收集类型 | theory | lc-generics-inference | ["L37"] | 3 |
| L40 | 12 | ReactAgent 类骨架：~agentTypes 品牌与 #graph | theory | lc-react-agent-class | ["L37"] | 2 |
| L41 | 12 | 构造器如何编译出图：allNodeWorkflows.compile 全流程 | theory | lc-graph-compile | ["L40"] | 3 |
| L42 | 12 | invoke 路径追踪：从参数归一到 #graph.invoke | practice | lc-agent-invoke | ["L40"] | 2 |
| L43 | 12 | stream 路径与 streamEvents：流式输出的两条通道 | practice | lc-agent-stream | ["L42"] | 3 |
| L44 | 12 | 图级 API 透传：getState/getStateHistory/getSubgraphs | theory | lc-graph-api-passthrough | ["L40"] | 2 |
| L45 | 13 | AgentNode：模型调用与工具循环决策的 1107 行 | theory | lc-agent-node | ["L41"] | 3 |
| L46 | 13 | ToolNode：客户端工具执行与 returnDirect | practice | lc-tool-node | ["L41"] | 2 |
| L47 | 13 | hook 节点化：before*/after* 如何插进流水线 | theory | lc-hook-nodes | ["L41"] | 3 |
| L48 | 13 | entry/exit 决策：为什么入口由第一个 beforeAgent 决定 | theory | lc-entry-exit | ["L47"] | 3 |
| L49 | 14 | state/context 双 schema：内置状态与运行时上下文 | theory | lc-state-context-schema | ["L40"] | 2 |
| L50 | 14 | JumpToTarget 与节点跳转 | practice | lc-jump-to-target | ["L48"] | 2 |

### 模块五 · 中间件体系（stage 15-18）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L51 | 15 | AgentMiddleware 接口全解：stateSchema/contextSchema/tools/tracePolicy | theory | lc-mw-interface | ["L47"] | 3 |
| L52 | 15 | 六个 hook 的类型与调用时机：wrapModelCall/wrapToolCall/before*/after* | theory | lc-mw-hooks | ["L51"] | 3 |
| L53 | 15 | createMiddleware 工厂与 MIDDLEWARE_BRAND | practice | lc-create-middleware | ["L51"] | 2 |
| L54 | 15 | wrapModelCall：改写模型请求的统一入口 | practice | lc-wrap-model-call | ["L52"] | 2 |
| L55 | 16 | wrapToolCall 与 ToolNode 的联动 | practice | lc-wrap-tool-call | ["L52"] | 2 |
| L56 | 16 | modelRetry/modelFallback：模型层容错两件套 | theory | lc-model-retry-fallback | ["L52"] | 2 |
| L57 | 16 | modelCallLimit 与 toolCallLimit：预算闸两种 | theory | lc-call-limits | ["L52"] | 2 |
| L58 | 16 | toolRetry/toolError/toolEmulator：工具层容错与模拟 | practice | lc-tool-fault-tolerance | ["L55"] | 2 |
| L59 | 17 | summarization：1009 行的上下文压缩 | theory | lc-summarization-mw | ["L51"] | 3 |
| L60 | 17 | contextEditing 与 dynamicSystemPrompt：提示词工程中间件 | theory | lc-context-editing | ["L51"] | 2 |
| L61 | 17 | pii/piiRedaction：敏感信息检测与脱敏 | theory | lc-pii-mw | ["L51"] | 2 |
| L62 | 18 | hitl（上）：interrupt 机制与人工介入 | theory | lc-hitl-interrupt | ["L51"] | 3 |
| L63 | 18 | hitl（下）：per-call interrupts 与审批流 | practice | lc-hitl-approval | ["L62"] | 3 |
| L64 | 18 | modelRouter/llmToolSelector/providerToolSearch/todoList/autoMode：路由与选择族 | theory | lc-routing-family | ["L51"] | 2 |

### 模块六 · LangGraph 编排内核（stage 19-23）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L65 | 19 | StateGraph 类型全景：十个泛型如何驱动类型安全 | theory | lc-stategraph-generics | ["L27"] | 3 |
| L66 | 19 | schema 归一化：Annotation/StateSchema/Zod 三路汇成 StateDefinition | framework | lc-schema-normalization | ["L65"] | 2 |
| L67 | 19 | addNode 的编译期准备：自动错误处理器节点 __error_handler__ | practice | lc-addnode-error-handler | ["L65"] | 2 |
| L68 | 19 | 编译即接线：attachNode/attachEdge 把业务图降维成通道网络 | theory | lc-graph-compile-wiring | ["L65"] | 3 |
| L69 | 20 | BaseChannel 契约：七件套方法与双标记 | theory | lc-base-channel | ["L68"] | 2 |
| L70 | 20 | LastValue 与 BinaryOperatorAggregate：覆盖 vs 归并、INVALID_CONCURRENT_GRAPH_UPDATE | theory | lc-lastvalue-binop | ["L69"] | 3 |
| L71 | 20 | Topic 与 AnyValue/EphemeralValue：事件总线与一次性通道 | theory | lc-topic-ephemeral | ["L69"] | 2 |
| L72 | 20 | 同步屏障三兄弟：NamedBarrier/AfterFinish/DynamicBarrier 与 join 边降维 | theory | lc-barrier-channels | ["L69"] | 3 |
| L73 | 20 | DeltaChannel 与 UntrackedValue：不存全量的两种取舍、checkpoint 结构 v:4 | theory | lc-delta-untracked | ["L69"] | 3 |
| L74 | 21 | isResuming：五种 resume 信号与 channel_versions 前提 | theory | lc-is-resuming | ["L68"] | 2 |
| L75 | 21 | tick() 深读：一次 BSP 超步的完整旅程 | theory | lc-pregel-tick | ["L74"] | 3 |
| L76 | 21 | _applyWrites 与确定性排序：task path 排序为什么等于可重放 | theory | lc-apply-writes | ["L75"] | 3 |
| L77 | 21 | PregelRunner 与 loop 分工：并发执行、AbortSignal 三链、_commit 三形态 | practice | lc-pregel-runner | ["L75"] | 3 |
| L78 | 22 | 八种流模式与 StreamChunk：[namespace, mode, payload] 与子图路由 | theory | lc-stream-modes | ["L75"] | 2 |
| L79 | 22 | checkpoint 结构与 durability 三档：sync 在发 values 前 await | theory | lc-checkpoint-durability | ["L75"] | 3 |
| L80 | 22 | retry/timeout/resume 容错矩阵：指数退避、心跳、interrupt 按 XXH3 精确路由 | practice | lc-retry-timeout-resume | ["L77"] | 3 |
| L81 | 23 | createReactAgent + ToolNode：预置 ReAct 循环的降维拆解 | framework | lc-prebuilt-react-agent | ["L68"] | 2 |
| L82 | 23 | supervisor vs swarm：中心化 handoff vs activeAgent 状态接力 | framework | lc-supervisor-swarm | ["L81"] | 2 |

### 模块七 · 全栈能力（stage 24-27）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L83 | 24 | 加载环：DocumentLoader 契约与 Document 三元组 | theory | lc-document-loader | ["L27"] | 1 |
| L84 | 24 | 切分环（一）：Transformer 即 Runnable，Mapping/非 Mapping 两形态 | theory | lc-document-transformer | ["L83"] | 2 |
| L85 | 24 | 切分环（二）：RecursiveCharacterTextSplitter 递归算法逐行拆解、mergeSplits 滑窗 | framework | lc-recursive-splitter | ["L84"] | 3 |
| L86 | 24 | 向量化与存储环：EmbeddingsInterface 双方法 + VectorStore 三抽象 | framework | lc-embeddings-vectorstore | ["L83"] | 2 |
| L87 | 24 | 检索环：BaseRetriever 骨架 + asRetriever 桥 + MMR | practice | lc-retriever-mmr | ["L86"] | 2 |
| L88 | 25 | 遗留记忆层：BaseMemory/ChatHistory 双基类为何被淘汰 | theory | lc-legacy-memory | ["L10"] | 2 |
| L89 | 25 | LLM 缓存：BaseCache 与 sha256 键编码、Generation 级挂载层 | framework | lc-llm-cache | ["L20"] | 2 |
| L90 | 25 | checkpoint（一）：Checkpoint 三字典与版本时钟 | framework | lc-checkpoint-structure | ["L68"] | 3 |
| L91 | 25 | checkpoint（二）：BaseCheckpointSaver 契约、putWrites 排序、JsonPlusSerializer、BaseStore 分工 | framework | lc-checkpoint-saver | ["L90"] | 3 |
| L92 | 26 | Tracer 家族与 langsmith 硬依赖：persistRun、RunTree 上报、streamEvents 回调——与 L36 执行树视角划界 | theory | lc-tracer-family | ["L36"] | 3 |
| L93 | 26 | callback 消费端：configure 双层合并、handler 报错不中断主流程 | framework | lc-callback-consumer | ["L92"] | 3 |
| L94 | 27 | MCP 接入：loadMcpTools 与 ConnectionManager、三传输、elicitation | practice | lc-mcp-adapters | ["L21"] | 2 |
| L95 | 27 | provider 包结构与 Hub/load 序列化：import_map 与模型注册 | theory | lc-provider-hub | ["L03"] | 2 |

### 模块八 · 结构化输出与类型系统（stage 28-29）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L96 | 28 | 两种策略：ToolStrategy 隐藏 extract 工具 vs ProviderStrategy 原生 json_schema | framework | lc-response-strategies | ["L37"] | 3 |
| L97 | 28 | 错误哲学分野：parse 抛错可回喂 vs 返回 undefined；structuredOutput 能力协商 | theory | lc-parse-error-philosophy | ["L96"] | 3 |
| L98 | 28 | transformResponseFormat 归一化：三类 schema 输入 × 能力协商、数组约束、__brand | framework | lc-transform-response-format | ["L96"] | 3 |
| L99 | 29 | createAgent 的 const 泛型与 14 重载分派 | theory | lc-const-generics | ["L37"] | 3 |
| L100 | 29 | 类型级 reduce：CombineTools / CombineStreamTransformers 递归条件类型 | theory | lc-type-reduce | ["L99"] | 3 |
| L101 | 29 | InteropZodType 与 AgentTypeConfig：Zod v3/v4 互操作、InferAgent* 反查族 | theory | lc-interop-zod | ["L99"] | 2 |

### 模块九 · 迁移：从 0.x 到 1.x（stage 30-32）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L102 | 30 | 从 Chain 王国到 Runnable+Graph：classic 30 目录 vs 1.x 8 目录对比地图 | theory | lc-two-generations | ["L07"] | 2 |
| L103 | 30 | BaseChain 的 call/values 协议解剖：为什么必须被淘汰 | theory | lc-basechain-protocol | ["L102"] | 3 |
| L104 | 30 | memory 隐式读写协议：loadMemoryVariables/saveContext，状态藏在 chain 对象里 | theory | lc-legacy-memory-protocol | ["L102"] | 3 |
| L105 | 30 | 新世界观：Agent 即编译图 | theory | lc-agent-as-graph | ["L40"] | 2 |
| L106 | 30 | 持久化地基换代：BaseChatMessageHistory → BaseCheckpointSaver | theory | lc-persistence-foundation | ["L104"] | 3 |
| L107 | 31 | Chain 族迁移（上）：LLMChain/SequentialChain/TransformChain → LCEL 三原语 | practice | lc-chain-migration | ["L103"] | 2 |
| L108 | 31 | Chain 族迁移（下）：RetrievalQA/Stuff/MapReduce/Refine 与路由链、无替代项 | practice | lc-retrievalqa-migration | ["L107"] | 2 |
| L109 | 31 | Memory 族迁移：BufferMemory/WindowMemory/TokenBuffer → messages + trimMessages | practice | lc-memory-migration | ["L104"] | 2 |
| L110 | 31 | ConversationSummaryMemory → summarizationMiddleware 逐参数对照 | practice | lc-summary-memory-migration | ["L109"] | 3 |
| L111 | 31 | EntityMemory/CombinedMemory/VectorStoreRetrieverMemory 的 1.x 化身 | practice | lc-entity-memory-migration | ["L109"] | 2 |
| L112 | 31 | AgentExecutor → createAgent：主循环与构造参数映射 | practice | lc-executor-migration | ["L105"] | 3 |
| L113 | 31 | 旧 Agent 协议族退役：ZeroShot/Chat/StructuredChat/OpenAI/XML 五套协议收敛为 tool_calls | framework | lc-agent-protocol-retire | ["L112"] | 2 |
| L114 | 31 | Toolkits 与垂类链的去向：SqlToolkit/SqlDatabaseChain/GraphCypherQAChain | framework | lc-toolkit-whereabouts | ["L108"] | 2 |
| L115 | 31 | Executor 开关 → middleware 生态全景映射 | framework | lc-executor-switch-mapping | ["L112"] | 2 |
| L116 | 31 | 结构化输出换代：StructuredOutputParser → responseFormat 双策略 | practice | lc-structured-output-migration | ["L96"] | 3 |
| L117 | 31 | Prompt 与 OutputParser 搬家课：哪些只需改 import、classic 入口报错史 | practice | lc-prompt-parser-move | ["L103"] | 2 |
| L118 | 31 | 检索层迁移：BaseRetriever 下沉、12 个花式 retriever 留守 | framework | lc-retriever-migration | ["L87"] | 2 |
| L119 | 31 | 底座层迁移：VectorStore/Embeddings/Document 纯换包名 + createReactAgent 同名陷阱 | practice | lc-foundation-migration | ["L112"] | 2 |
| L120 | 32 | 双包并存与混合运行策略：共享 core 的类型互通 | theory | lc-dual-package | ["L07"] | 2 |
| L121 | 32 | 走查①：RAG 问答应用迁移（RetrievalQAChain+BufferMemory → LCEL+checkpointer） | practice | lc-walkthrough-rag | ["L108"] | 3 |
| L122 | 32 | 走查②：对话助手迁移（ConversationChain → createAgent+summarization+MemorySaver） | practice | lc-walkthrough-chatbot | ["L109"] | 3 |
| L123 | 32 | 走查③：工具调用 Agent 迁移（AgentExecutor+ZeroShot → createAgent+toolError/toolRetry） | practice | lc-walkthrough-agent | ["L112"] | 3 |
| L124 | 32 | 留守清单与迁移终局：无替代 API 的长期共存决策树 | framework | lc-legacy-keeplist | ["L118"] | 2 |

### 模块十 · 实战：两个 Capstone（stage 33-34）
| id | stage | title | kind | concept | prereqs | diff |
|---|---|---|---|---|---|---|
| L125 | 33 | 需求盘点与迁移计划：给定一个 0.x 应用（Chain+Memory+AgentExecutor+OutputParser 全家桶），产出迁移映射表与风险清单 | capstone | lc-capstone-inventory | ["L102"] | 3 |
| L126 | 33 | 数据层迁移：Chain/Memory → LCEL+messages 状态改写 | capstone | lc-capstone-data-migration | ["L107"] | 3 |
| L127 | 33 | Agent 层迁移：AgentExecutor+协议族 → createAgent+middleware，行为对齐断言 | capstone | lc-capstone-agent-migration | ["L112"] | 3 |
| L128 | 33 | 验收与复盘：迁移前后行为等价断言、遗留项决策、复盘表 | capstone | lc-capstone-acceptance | ["L125"] | 3 |
| L129 | 34 | 架构设计：带 middleware+检查点+RAG+结构化输出的 agent，画源码依据图 | capstone | lc-capstone-arch | ["L96"] | 3 |
| L130 | 34 | 核心实现：createAgent 组装 + 三类 middleware + MemorySaver + 检索链 | capstone | lc-capstone-impl | ["L129"] | 3 |
| L131 | 34 | 流式与结构化输出：streamEvents + responseFormat 双策略接入 | capstone | lc-capstone-stream-output | ["L130"] | 3 |
| L132 | 34 | 验收与复盘：可执行验收断言、失效面清单、全课程源码地图收束 | capstone | lc-capstone-final | ["L129"] | 3 |

## 6. 概念全集（132 个，concepts 与 quiz.concept 只能取自本节）

> 格式 `id = 名称（stage, weight）`。本课表与概念一一对应；quiz 的 concept 必须取本课的 concept 值。

模块一：lc-package-split=三包分裂格局(1,2)；lc-deps-direction=依赖方向(1,3)；lc-export-surface=主包导出面(1,2)；lc-core-deps=core 依赖表(2,2)；lc-symbol-instanceof=Symbol.for 跨包判型(2,3)；lc-dual-format=ESM/CJS 双轨发布(2,2)；lc-classic-museum=classic 博物馆清单(3,2)；lc-reexport-strategy=重新导出策略(3,2)；lc-init-chat-model=initChatModel(3,2)

模块二：lc-base-message=BaseMessage 骨架(4,3)；lc-message-concat=Human/System 消息(4,1)；lc-ai-message=AIMessage 解剖(4,3)；lc-tool-message=ToolMessage 三字段(4,2)；lc-content-blocks=ContentBlock v1(4,3)；lc-chunk-merge=chunk 合并规则(4,3)；lc-chat-model-invoke=模型 invoke 全链路(5,3)；lc-model-streaming=模型流式降级链(5,2)；lc-chat-stream-events=块级流事件(5,3)；lc-bind-tools=bindTools 能力契约(5,2)；lc-base-llm-cache=BaseLLM 与缓存(5,1)；lc-structured-tool=StructuredTool 校验(6,3)；lc-tool-factory=tool() 重载矩阵(6,3)；lc-tool-runtime=ToolRuntime 注入(6,2)；lc-prompt-template=PromptTemplate(7,2)；lc-chat-prompt-template=ChatPromptTemplate(7,2)；lc-fewshot-parser=FewShot 与解析双层(7,2)

模块三：lc-runnable-pillars=Runnable 四大支柱(8,3)；lc-batch-concurrency=batch 并发工程(8,2)；lc-stream-buffer=流首块缓冲(8,3)；lc-runnable-sequence=RunnableSequence(9,3)；lc-runnable-map=RunnableMap 扇出(9,3)；lc-runnable-lambda=RunnableLambda 分派(9,2)；lc-fallbacks-assign=兜底与字典扩展(9,2)；lc-bind-family=bind 家族(9,2)；lc-runnable-config=RunnableConfig 传播(10,3)；lc-callback-propagation=回调传播执行树(10,3)

模块四：lc-create-agent=createAgent 全景(11,3)；lc-response-format-overloads=responseFormat 重载分类(11,2)；lc-generics-inference=泛型推导(11,3)；lc-react-agent-class=ReactAgent 类骨架(12,2)；lc-graph-compile=构造器编译出图(12,3)；lc-agent-invoke=invoke 路径(12,2)；lc-agent-stream=stream 双通道(12,3)；lc-graph-api-passthrough=图级 API 透传(12,2)；lc-agent-node=AgentNode(13,3)；lc-tool-node=ToolNode(13,2)；lc-hook-nodes=hook 节点化(13,3)；lc-entry-exit=entry/exit 决策(13,2)；lc-state-context-schema=state/context 双 schema(14,2)；lc-jump-to-target=JumpToTarget(14,2)

模块五：lc-mw-interface=AgentMiddleware 接口(15,3)；lc-mw-hooks=六个 hook(15,3)；lc-create-middleware=createMiddleware 工厂(15,2)；lc-wrap-model-call=wrapModelCall(15,2)；lc-wrap-tool-call=wrapToolCall(16,2)；lc-model-retry-fallback=模型容错两件套(16,2)；lc-call-limits=预算闸(16,2)；lc-tool-fault-tolerance=工具容错与模拟(16,2)；lc-summarization-mw=summarization 中间件(17,3)；lc-context-editing=contextEditing(17,2)；lc-pii-mw=pii 中间件(17,1)；lc-hitl-interrupt=hitl interrupt(18,3)；lc-hitl-approval=hitl 审批流(18,2)；lc-routing-family=路由与选择族(18,2)

模块六：lc-stategraph-generics=StateGraph 泛型(19,3)；lc-schema-normalization=schema 归一化(19,2)；lc-addnode-error-handler=addNode 错误处理器(19,2)；lc-graph-compile-wiring=编译即接线(19,3)；lc-base-channel=BaseChannel 契约(20,2)；lc-lastvalue-binop=LastValue/Binop(20,3)；lc-topic-ephemeral=Topic/AnyValue/Ephemeral(20,2)；lc-barrier-channels=同步屏障通道(20,3)；lc-delta-untracked=Delta/Untracked(20,2)；lc-is-resuming=isResuming 信号(21,2)；lc-pregel-tick=tick BSP 超步(21,3)；lc-apply-writes=写排序与可重放(21,3)；lc-pregel-runner=PregelRunner(21,3)；lc-stream-modes=八种流模式(22,2)；lc-checkpoint-durability=checkpoint 与 durability(22,3)；lc-retry-timeout-resume=容错矩阵(22,3)；lc-prebuilt-react-agent=prebuilt ReAct(23,2)；lc-supervisor-swarm=supervisor/swarm(23,2)

模块七：lc-document-loader=DocumentLoader(24,1)；lc-document-transformer=Transformer(24,2)；lc-recursive-splitter=递归切分(24,3)；lc-embeddings-vectorstore=向量化与存储(24,2)；lc-retriever-mmr=检索与 MMR(24,2)；lc-legacy-memory=遗留记忆层(25,2)；lc-llm-cache=LLM 缓存层(25,1)；lc-checkpoint-structure=Checkpoint 三字典(25,3)；lc-checkpoint-saver=CheckpointSaver 契约(25,3)；lc-tracer-family=Tracer 家族(26,3)；lc-callback-consumer=callback 消费端(26,3)；lc-mcp-adapters=MCP 适配(27,2)；lc-provider-hub=provider 与 Hub(27,2)

模块八：lc-response-strategies=双策略(28,3)；lc-parse-error-philosophy=错误哲学(28,3)；lc-transform-response-format=归一化管线(28,2)；lc-const-generics=const 泛型(29,3)；lc-type-reduce=类型级 reduce(29,3)；lc-interop-zod=Zod 互操作(29,2)

模块九：lc-two-generations=两代世界观(30,3)；lc-basechain-protocol=BaseChain 协议(30,3)；lc-legacy-memory-protocol=memory 隐式协议(30,3)；lc-agent-as-graph=Agent 即编译图(30,3)；lc-persistence-foundation=持久化地基(30,2)；lc-chain-migration=Chain 迁移(31,2)；lc-retrievalqa-migration=RetrievalQA 迁移(31,2)；lc-memory-migration=Memory 迁移(31,2)；lc-summary-memory-migration=SummaryMemory 迁移(31,2)；lc-entity-memory-migration=EntityMemory 迁移(31,1)；lc-executor-migration=Executor 迁移(31,3)；lc-agent-protocol-retire=协议族退役(31,2)；lc-toolkit-whereabouts=Toolkits 去向(31,2)；lc-executor-switch-mapping=开关映射(31,2)；lc-structured-output-migration=结构化输出换代(31,2)；lc-prompt-parser-move=Prompt/Parser 搬家(31,1)；lc-retriever-migration=检索层迁移(31,2)；lc-foundation-migration=底座迁移(31,2)；lc-dual-package=双包并存(32,2)；lc-walkthrough-rag=走查 RAG(32,3)；lc-walkthrough-chatbot=走查对话助手(32,3)；lc-walkthrough-agent=走查工具 Agent(32,3)；lc-legacy-keeplist=留守清单(32,2)

模块十：lc-capstone-inventory=Capstone 盘点(33,2)；lc-capstone-data-migration=Capstone 数据层(33,2)；lc-capstone-agent-migration=Capstone Agent 层(33,3)；lc-capstone-acceptance=Capstone 验收迁移(33,2)；lc-capstone-arch=Capstone 架构(34,3)；lc-capstone-impl=Capstone 实现(34,3)；lc-capstone-stream-output=Capstone 流式输出(34,2)；lc-capstone-final=Capstone 收束(34,2)
