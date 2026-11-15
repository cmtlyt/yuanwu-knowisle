# 00096 · LangChain 源码深度学习课（已落地）

- 分支：`feat/langchain-source-course`（基点 `main@6bdb400`）
- 状态：**132 课全量落地完成**（2026-11-15），全部门禁绿：check-course ✓ / `pnpm verify` 四段 ✓（含体量闸门 353/353）/ fmt:check ✓ / lint 0 errors / typecheck 0 errors / build ✓
- 落地形态：`app/data/langchain-course/`（complex 4 层：`modules.ts` 10 模块 / `stages.ts` 34 阶段 / `concepts.ts` 132 概念 / `design.ts` / `meta.ts` / `lessons/` 132 文件由草稿管线生成）；`courses.ts` 注册 `slug: 'langchain-source'`、`storageKey: 'knowisle:langchain-source:v1'`。草稿是唯一内容源（`drafts/L01-L132.md`），正文修改只改草稿再重新生成。
- 落地过程要点：用户拍板「不压缩课数，直接落地」→ 14 批子代理按 `research/evidence/08-draft-contract.md` 契约写草稿 → gen-course 生成 → 首轮体量闸门 104 课不达标（子代理自报字数与官方 contentStats 口径偏差约 2 倍）→ 按官方口径缺口清单分 9 批扩写并自测 → 全部达标后重新生成过闸。
- 日期：2026-11-15
- v2 变更（用户反馈）：模块顺序调整为「**1.x 主线（模块一~八）→ 0.x→1.x 迁移（模块九）→ 实战 Capstone（模块十）**」。原模块九「迁移与综合」拆成两个独立模块，迁移后置、实战收尾；模块一原先提前讲的「0.x→1.x 变化」下移到模块九，避免重复。
- v3 变更（用户拍板四项决策后）：① 量级确认；② 演练形态自定（倾向代码片段+文字推演，写正文时按课判断是否补交互 widget）；③ 实战拆 2 个 Capstone（迁移型 L125-L128 + 综合型 L129-L132）；④ 迁移深度覆盖全部变更、不锁课数。**逐课大纲见 `outline.md`（10 模块 / 34 阶段 / 132 课，编号连贯无跳号，kind 实测 theory 61 / practice 28 / framework 35 / capstone 8，★ 原理重课 55）**。逐模块源码取证完成：`research/evidence/03-07` 五份台账共 180 条 A 级证据（core 32 / agent 20 / langgraph 43 / fullstack 39 / migration 38 + 36 行映射表）。

## 1. 目标

新增第 5 门课程「LangChain 源码深度课」，以 **TypeScript 线真实源码**为唯一事实来源，系统课形态（complex 4 层：模块 → 阶段 → 子阶段 → 课时），「把每个知识点揉碎了讲」。覆盖用户点名的三层次：1.0 新架构、内核源码、全栈生态。

## 2. 硬约束（来自用户与本仓库约定）

1. **不靠记忆**：正文每一个 API 名、行为、版本都必须能在克隆的源码 `langchainjs@7704471` / `langgraphjs@fa426b2` 中找到出处；资料先落盘（已完成，见 `research/`），写正文前逐模块补 A 级取证。
2. **版本基线锁定**：`langchain@1.6.6` + `@langchain/core@1.4.1` + `langchain-classic@1.0.61` + `@langchain/langgraph@1.7.4`（npm latest，源码 package.json 交叉验证一致）。Python 线的 1.5.0/1.8.0 **不得混入**。`META` 标注 commit 锚点 + 核实日期。
3. **新架构与 classic 物理隔离 + 迁移后置**：模块一~八全程只讲 1.x 主线（`createAgent` + middleware + LangGraph + core），不提前铺垫旧 API；旧 `Chain`/`LLMChain`/`BufferMemory` 统一放到**模块九（迁移模块）**才出现，明确标注在 `langchain-classic` 包。用户明确口径：「先以 1.x 为主线讲最新源码，最后提供 0.x 到 1.x 的迁移模块，再往后是实战模块」。
4. **课程自包含**（course-builder 规则 10）：除用户明确要求外，不引用既有 Effect/RxJS/Agent 课的概念或代码。
5. **先审后做**：本文件即审批对象；审批通过后才进入「正文取证 → 草稿 → 生成器 → 门禁」实施。

## 3. 已完成的资料取证（详见 `research/`）

- `raw/001` Python 线版本（C 级，仅作反面对照：**证明不可套用**）
- `raw/002` npm registry 官方版本基线（A 级）
- `raw/003` 官方文档 overview（A 级，发现 `create_agent` vs `createAgent` 命名陷阱）
- `raw/…` 待补：middleware 类型契约 / messages / tools / runnables / checkpoint 逐文件摘录
- `evidence/00` 用户口径决策
- `evidence/01` 源码树与版本（A 级）
- `evidence/02` 关键机制源码铁证（A 级）：`createAgent()` 实现体仅 `return new ReactAgent(params)`；`ReactAgent.invoke()` 委托 `#graph.invoke()`；`PregelLoop.tick()`；11 种 Channel；classic 包隔离

## 4. 课程大纲（草案）

**形态**：complex 4 层渲染（`renderMode: 'complex'`），对标 AI Agent 工程课（11 模块 / 28 阶段 / 142 课）。本大纲规划 **10 模块 / 33 阶段 / 约 100–120 课**，课数按知识点面向驱动，实施中可微调并在最终 overview 回填实数。

**顺序（v2）**：1.x 主线（模块一~八）→ 0.x→1.x 迁移（模块九）→ 实战 Capstone（模块十）。迁移与旧 API 只在模块九集中处理，主线模块不提前铺垫。

### 模块一 · 坐标与版本：LangChain 1.x 立足点（3 阶段 / 约 9 课）
- 阶段 1.1 版本地图与 1.x 承诺 — `langchain@1.6.6` 坐标、1.0 GA 与「2.0 前无破坏性变更」边界、`langchain-classic` 隔离的事实陈述（**不展开 0.x 差异，那部分后置到模块九**）
- 阶段 1.2 包版图与依赖方向 — `langchain` / `langchain-core` / `langchain-classic` / `langgraph` / `providers` / MCP adapters 各司其职；core 零依赖内核
- 阶段 1.3 读源码的方法论 — 从 `index.ts` 导出面顺藤、类型重载 vs 运行时实现、用测试反推契约（每个声明都指到具体文件行）

### 模块二 · core 内核之一：数据原语（4 阶段 / 约 12 课）
- 阶段 2.1 Messages 协议 — `HumanMessage`/`AIMessage`/`ToolMessage`/`SystemMessage`、content blocks、tool_calls 结构、message 的序列化与 role 语义
- 阶段 2.2 Models 抽象 — `BaseChatModel` / `BaseLLM`、invoke/stream/batch 三入口、标准化错误与重试边界（源码 `language_models/`）
- 阶段 2.3 Tools 定义与执行 — `tool()` 构造器、schema 校验、ToolNode 执行路径、客户端/服务端工具之别（`ClientTool`/`ServerTool`）
- 阶段 2.4 Prompts 与输出解析 — prompt template、few-shot、`output_parsers/` 与结构化输出的关系

### 模块三 · core 内核之二：Runnable 与组合（3 阶段 / 约 10 课）
- 阶段 3.1 Runnable 协议 — `Runnable` 基类契约、invoke/stream/batch/transform、config 与 callbacks 透传（`runnables/`）
- 阶段 3.2 LCEL 组合子源码 — `RunnableSequence` / `RunnableParallel` / `RunnableLambda` / `pipe()` 的类型体操与运行时调度
- 阶段 3.3 流式与背压 — stream 事件形态、`transform` 与生成器、与 async iterator 的边界

### 模块四 · 新架构核心：createAgent 与 ReactAgent（4 阶段 / 约 14 课）
- 阶段 4.1 `createAgent()` 解剖 — 13 个类型重载逐个读、唯一实现体 `return new ReactAgent(params)`、泛型参数如何推导 state/context/tools/middleware
- 阶段 4.2 ReactAgent 内核 — `class ReactAgent`、`#graph` 私有字段、`invoke()`/`stream()` 委托图运行；构造时如何编译出图
- 阶段 4.3 Agent 节点流水线 — `AgentNode`/`ToolNode`/`BeforeModelNode`/`AfterModelNode`/`BeforeAgentNode`/`AfterAgentNode` 的执行顺序与跳转（`JumpToTarget`）
- 阶段 4.4 状态与上下文 — `state.ts` / `runtime.ts` / `annotation.ts`、state schema 与 context schema 的区别、会话状态如何随图流转

### 模块五 · 中间件体系（4 阶段 / 约 14 课）
- 阶段 5.1 middleware 契约 — `createMiddleware()` / `MIDDLEWARE_BRAND` / hook 类型全解（`middleware/types.ts` 逐行取证）
- 阶段 5.2 控制流类 — `modelRetry` / `modelFallback` / `modelCallLimit` / `toolRetry` / `toolCallLimit` / `error`
- 阶段 5.3 上下文与安全类 — `summarization` / `contextEditing` / `pii` / `piiRedaction` / `dynamicSystemPrompt` / `autoMode`
- 阶段 5.4 交互与路由类 — `hitl`（人工介入）/ `modelRouter` / `llmToolSelector` / `providerToolSearch` / `todoList` / `toolEmulator`

### 模块六 · LangGraph 编排内核（5 阶段 / 约 18 课）
- 阶段 6.1 StateGraph 构建 API — `addNode`/`addEdge`/`addConditionalEdges`/`compile()` 源码（`graph/state.ts`）
- 阶段 6.2 Channel 系统与状态归并 — 11 种 Channel 逐个读、`BaseChannel` 标记协议、`messages_reducer` 的累加语义
- 阶段 6.3 Pregel 运行时 — `PregelLoop`/`tick()` BSP 超步、`algo.ts` 任务准备、`runner.ts` 执行、`io.ts` 读写
- 阶段 6.4 流式 / 检查点 / 重放 — `stream.ts` 流模式、`checkpoint.ts` 快照、`retry.ts`/`replay.ts`/`timeout.ts`
- 阶段 6.5 高层模式 — `prebuilt/` 预构建 agent、`langgraph-supervisor`/`swarm`、与 `createAgent` 的分工边界

### 模块七 · 全栈能力：检索、持久化与外部连接（4 阶段 / 约 12 课）
- 阶段 7.1 RAG 源码链 — `document_loaders/` → `textsplitters` → `embeddings` → `vectorstores` → `retrievers/` 的完整数据流
- 阶段 7.2 记忆与缓存 — `memory.ts` / `chat_history.ts` / `caches/`，与 LangGraph checkpoint 的职责分工
- 阶段 7.3 可观测与回调 — `callbacks/` / `tracers/` / LangSmith 集成、trace 字段与成本归因
- 阶段 7.4 外部连接 — `langchain-mcp-adapters` / `providers/` / `hub` / `load`，MCP 工具接入源码

### 模块八 · 结构化输出与类型系统（2 阶段 / 约 6 课）
- 阶段 8.1 responseFormat 三策略 — Zod 对象 / Zod 数组联合 / JsonSchemaFormat 的重载与推导（`responses.ts`）
- 阶段 8.2 TS 类型体操在源码中的实战 — `const` 泛型参数、`CombineTools`/`CombineStreamTransformers`、类型如何约束运行时

### 模块九 · 迁移：从 0.x 到 1.x（3 阶段 / 约 9 课）
> 后置模块：学完全部 1.x 主线后，才回头处理旧版本。前置知识全部来自模块一~八，本模块只做「旧 → 新」的映射与迁移，不重复讲 1.x 机制。
- 阶段 9.1 两代架构的世界观差异 — 0.x 的 `LLMChain`/`AgentExecutor`/`Memory` 组合范式 vs 1.x 的 `createAgent` + middleware + checkpointer；为什么 1.0 要把旧 API 整体搬进 `langchain-classic@1.0.61`（源码包隔离结构取证）
- 阶段 9.2 逐项 API 映射 — `LLMChain`/`ConversationalRetrievalChain`/`BufferMemory`/`OutputParser` 等旧写法，逐项映射到 1.x 对应物；哪些被 middleware 取代、哪些被 checkpointer 取代、哪些在 classic 里保留
- 阶段 9.3 真实例子迁移走查 — 一个完整 0.x 应用迁到 1.x 的 step-by-step，标注每处改动对应的源码文件与 commit；迁移的边界与「不必迁」的情形

### 模块十 · 实战：综合 Capstone（1 阶段 / 约 4 课 + Capstone）
> 收尾模块：把模块一~八的源码理解落到可运行交付物，不再引入新机制。
- 阶段 10.1 综合 Capstone — 从零搭一个带 middleware + 检查点 + RAG + 结构化输出的可运行 agent；全程标注每段代码对应的源码文件与行数出处；含可执行的验收断言
- Capstone 设计：默认 **1 个完整综合项目**（覆盖主线核心机制）；是否拆成 2 个（迁移型 + 综合型）列为待审批决策点

## 5. 每课结构（遵循项目数据契约）

`kind` 按内容判定（theory/practice/framework/scenario/capstone/overview），正文为 Markdown-in-TS，测验/术语/误区结构化；演练优先复用或按本项目 widgets 规范新增。系统课正文量按项目体量闸门执行（theory 1200 / practice 1800 字起，揉碎讲）。所有 API 引用在正文或 `:::deep` 中标注源码文件与 commit。

## 6. 验证方案

- **取证**：写正文前，每个模块的 API 清单先补 A 级源码摘录到 `research/raw/`，台账登记；正文出现但源码查无的标识符一律删改。
- **数据门禁**：`pnpm verify`（verify-course → verify-tutor → verify-content-stats → content-gate）全绿；`check-course.mjs app/data/langchain-course app/lib/widgets` 零悬空引用。
- **质量门禁**：`pnpm fmt:check` → `lint`（0 error）→ `typecheck`（0 error，warnings 不超过现行基线 lint 5/typecheck 10）→ `build`。
- **正确性抽查**：至少 5 课 SSR 渲染 200 且表格/代码块齐全；全课 API 名与 commit 锚点交叉核对表。
- **不提交**：按项目惯例，累计改动停在工作区，等用户指令再提交。

## 7. 待审批决策点

1. 课数规模：v2 草案 10 模块 / 33 阶段 / 100–120 课（模块一~八 8 主线模块 + 模块九迁移 + 模块十实战），是否按此量级实施？
2. 演练（widget）：本项目现有 widgets 面向 Effect/RxJS；本课程演练是「新增专用 widget」还是「以可运行代码片段 + 文字推演为主、不接交互演练」？倾向于后者（源码课重阅读与追踪），请确认。
3. Capstone 数量：默认 1 个综合型（模块十），是否要拆成 2 个（迁移型 + 综合型）？
4. 迁移模块深度（模块九）：按 3 阶段 / 9 课的「映射 + 一个完整走查」够用，还是要扩展成更多迁移案例？
