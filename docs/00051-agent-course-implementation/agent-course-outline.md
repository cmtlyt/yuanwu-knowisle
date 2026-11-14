# Agent 系列系统课程大纲（草稿 v7 · 待评审）

> **状态**：大纲草稿 v7（按推荐定稿，待你最终审视），**未落地任何课程代码/数据**。
> **分支**：`feat/agent-course-outline`（基于 `main`）
> **目标定位**：面向已具备基础编程能力的开发者，建立 AI Agent 的**完整工程化知识体系**——理论 + **不依赖框架的动手实战（每课再对照主流 TS 框架等价用法）** + 两个**从零实现**的综合实战（Capstone）。
> **实现语言与运行环境**：**全课基于 TypeScript 7，固定运行环境 Node 24 LTS**。所有「实战」课先**不依赖框架用 TS 手写**，再对照主流 **TS 框架**的等价用法；Python 生态（AutoGen / CrewAI / LiteLLM / LlamaGuard 模型）仅作架构/思路对照，**不写 Python 代码**。
> **课程代号（拟）**：`agent-course`；**计划规模**：11 大模块、28 阶段（Stage，其中阶段三含 3 个子阶段）、约 142 课（Lesson）。**体量按需拆分，不卡课程数量**——任何阶段过大都可再拆子阶段；但遵循「**一个概念一节课**」原则，不把同一概念拆成两节。
> **图例**：
> - 标注「**实战**」的课为动手编码课（全部 TypeScript）。
> - 所有实战课采用「**先无框架手写实现（TS）→ 再对照主流 TS 框架等价用法**」双段结构（框架对照为练手，可跳过）。
> - **MCP 也不例外**：L45 纯手写协议后，L46 立即用官方 TS SDK 对照重写同一 Server。
> - Capstone A / B **不复用前期任何课程的代码成果**，各自从零构建（仅 Capstone 内部可递进复用自身代码）。
> - **课程解耦**：本大纲**不引用、不呼应、不前置依赖**本项目任何既有课程（含既有的 Effect / RxJS 深度课）。此规则已写入项目级 skill `course-builder`（硬性规则第 10 条）。
> - **实施期灵活拆分**：框架理念的覆盖度将在落地时验证；若某框架对照课未能充分覆盖其理念，实施期可继续拆细该课（仍遵循「一概念一课」），不卡数量。

---

## 课程元信息（草案）

| 字段 | 内容 |
|---|---|
| 标题 | AI Agent 工程：从范式到生产（TS 实现 + 全栈实战 + 框架对照） |
| 副标题 | 理论 + 无框架手写实战（TypeScript 7 / Node 24）+ 框架对照 + 两个从零 Capstone |
| 适配基线 | 以通用对话/推理模型为参照，**框架无关、强调 TS 手写实现，再对照 TS 框架** |
| 前置要求 | 熟悉 TypeScript、异步编程、HTTP、基础数据结构；了解 Prompt 基本概念；**运行环境 Node 24 LTS** |
| 实现语言 | **TypeScript 7**（仓库已锁定 `typescript@7.0.2`） |
| 运行环境 | **固定 Node 24 LTS**（不混用 Deno / Bun，避免环境差异带来的不确定性） |
| 总课时 | 约 142 课（概念课 + 实战课），单课 8–15 分钟 + 配套演练内核 |
| 配套资产 | 每课含「概念卡 + 最小可运行 TS 示例 + 演练内核 + 自测题」；实战课附无框架骨架 + 框架对照示例 |

---

## 模块一 · 工程基线与环境（TypeScript First）

> 先把「为什么先手写、后框架」「所有代码都是 TS」「版本怎么锁」「运行环境固定 Node 24」钉死，避免后面踩环境坑。

### 阶段一 · 工程基线：TS 工具链与版本锁定
- **课程**
  - L1 课程地图与学习路径：为什么本课程「先手写、后框架」
  - L2 TypeScript 工具链与固定运行环境：Node 24 LTS + TypeScript 7（不混用 Deno / Bun）
  - L3 版本锁定表与依赖安装（集中标注所有框架版本，见附录 B）
  - L4 项目脚手架：一个可运行的最小 Agent 工程（tsconfig / 测试 / 脚本 / 目录约定）
  - L5 可观测与评估的「预埋」：为什么从第一课就接 trace / assert

---

## 模块二 · 基础与范式理论

### 阶段二 · 认知基础（Foundations）
- **要点**：说清 Agent 的边界，建立「模型决定下一步」的架构直觉。
- **课程**
  - L6 Agent 到底是什么：用三个反例说清边界
  - L7 一张图看懂 Agent 系统的组成要素
  - L8 为什么「让模型决定下一步」改变架构
  - L9 选型清单：哪些任务适合 Agent，哪些该用传统代码
  - **实战 L10** 调通你的第一个 LLM 调用（TS）：裸 `fetch` vs 官方 SDK，观察不确定性与重试
    - 框架对照：`openai` / `@ai-sdk/openai` 等 SDK 封装差异

### 阶段三 · Agent 范式全景（Paradigm Taxonomy）★核心
- **要点**：逐一定义 12 种主流范式的内核机制、适用场景、代价与陷阱。这是全课理论支点。为导航清晰拆分为 3 个子阶段（**仅分组，不增课、不改课号**）。

#### 子阶段 3.1 · 基线范式（ReAct / Plan-and-Execute / ReWOO）
- **课程**
  - L11 范式总览：为什么需要这么多「玩法」
  - L12 ReAct：最通用的基线范式
  - **实战 L13** 用 TS 实现 ReAct 循环（真代码：循环 / 解析 / 执行）
    - 框架对照：LangGraph（`@langchain/langgraph@1.4.x`）/ OpenAI Agents SDK（`@openai/agents@0.22.x`）的等价 ReAct
  - L14 Plan-and-Execute：先想清楚再动手
  - **实战 L15** 对比实现 Plan-and-Execute：与 ReAct 跑同一任务（TS）
    - 框架对照：LangGraph 的 plan / execute 模板
  - L16 ReWOO：用「一次性规划」省下 LLM 往返

#### 子阶段 3.2 · 反思与搜索树（Reflexion / ToT / GoT / LATS / Voyager）
- **课程**
  - L17 Reflexion：让 Agent 从失败里学
  - **实战 L18** 实现 Reflexion 记忆回路：把失败写进持久化记忆（TS）
    - 框架对照：LangGraph 持久化 checkpoint + 自检节点
  - L19 Tree-of-Thoughts：把推理变成搜索树
  - L20 Graph-of-Thoughts：当思维需要聚合与合并
  - L21 LATS：用蒙特卡洛树搜索找最优路径
  - L22 Voyager：会「攒技能」的终身智能体

#### 子阶段 3.3 · 谱系与分解（AutoGPT 谱系 / Least-to-Most+ADaPT / Self-Consistency / CoT）
- **课程**
  - L23 自主智能体谱系：AutoGPT / BabyAGI / Generative Agents
  - L24 分解与自适应：Least-to-Most 与 ADaPT
  - L25 多路径投票：Self-Consistency 提升鲁棒性
  - L26 CoT 基石：所有范式都从它长出来

### 阶段四 · 范式对比与选型（Comparison & Selection）
- **要点**：给一张可操作的选型矩阵，并演示混合范式与反模式。
- **课程**
  - L27 一张对比矩阵看懂 12 种范式（上下文成本 / 可靠性 / 可控性 / 典型场景）
  - L28 混合范式实战：Plan + ReAct + Reflexion 怎么串
  - L29 反模式：把 Agent 用成昂贵的 if-else
  - **实战 L30** 同一任务跑三种范式并对比（含成本 / 质量度量，TS）
    - 框架对照：三种范式在 LangGraph 中的实现差异

---

## 模块三 · 运行时与工具

### 阶段五 · 核心循环与运行时（Agent Loop & Runtime）
- **要点**：把「循环解剖 → 上下文预算 → 停止条件 → 状态机 → 流式」讲透，并用 TS 落地一个可运行运行时（含流式）。
- **课程**
  - L31 运行时解剖：看懂 Agent Loop 的骨架（循环 / 状态 / 终止 / 错误恢复的本质，仅示意，不要求当场写出可运行代码）
  - L32 Thought/Action/Observation 各司其职
  - L33 上下文预算：你的 Agent 只有「这么大」的内存
  - L34 让 Agent 知道「该停了」：终止与回归
  - L35 用状态机建模 Agent 行为
  - **实战 L36** 从零实现一个最小可运行运行时（融合 L31 解剖，TS 完整代码：循环 + 终止 + 错误恢复）
    - 框架对照：用官方 SDK 搭建等价循环
  - **实战 L37** 给运行时加上流式输出与增量处理（SSE / async iterator，TS：让模型 token 边生成边消费）
    - 框架对照：Vercel AI SDK（`ai@7.0.x`）的 `streamText` / `toDataStream` 等价流式

### 阶段六 · 工具与函数调用（Tools & Function Calling）
- **要点**：Function Calling 原理、Schema 规范（TS 类型 / zod）、安全边界、并行决策。
- **课程**
  - L38 Function Calling 是怎么工作的
  - L39 写好工具 Schema：让模型「用得对」（TS 类型与 zod 校验）
  - L40 工具执行的安全边界（超时 / 权限 / 回滚）
  - L41 并行调用与「先观测再决策」
  - **实战 L42** 不依赖框架实现 Function Calling 运行时（TS：解析模型输出 → 执行 → 回填）
    - 框架对照：OpenAI Agents SDK 的 `tool()` + 自动解析 / Vercel AI SDK 的 `tool()`

### 阶段七 · 模型上下文协议 MCP（Model Context Protocol）★含框架对照
- **要点**：MCP 动机、三件套、transport；**先纯手写协议，再用官方 TS SDK 对照重写同一 Server**。
- **课程**
  - L43 为什么需要 MCP：告别「每家一套工具接口」
  - L44 MCP 三件套：Host / Client / Server，transport（stdio / SSE / 流式）
  - **实战 L45** 不使用框架用 TS 实现 MCP：手写 JSON-RPC + stdio transport + 工具发现与调用
  - **对照 L46** 用官方 TS SDK（`@modelcontextprotocol/sdk@1.x`）重写同一个 Server（对比代码量与健壮性）
  - L47 接入一个 MCP Server 并让 Agent 用起来（手写 Client → SDK Client 对照）

### 阶段八 · 记忆系统与知识接入（Memory & RAG）
- **要点**：记忆三层、向量 RAG、Graph RAG、结构化记忆、压缩与持久化。
- **课程**
  - L48 记忆的三层架构
  - **实战 L49** 实现一个最小向量 RAG 管线（TS：embedding + 检索 + 重排，无框架）
    - 框架对照：LlamaIndex.TS（`llamaindex`）/ LangChain JS（`langchain@0.3.x`）Retriever 等价实现
  - L50 Graph RAG：让检索支持多跳推理
  - L51 结构化记忆：让 Agent「记得你说过的话」
  - L52 上下文压缩：长对话如何瘦身
  - L53 跨会话持久化与隐私清理

---

## 模块四 · 推理·规划·自我改进

### 阶段九 · 推理增强模式（Reasoning Augmentation）
- **要点**：CoT / ToT / GoT / Self-Consistency / Scratchpad 的工程化。
- **课程**
  - L54 CoT 与零样本推理链
  - **实战 L55** 工程化实现 ToT 搜索树（TS：节点评估 + 回溯 + 剪枝）
    - 框架对照：LangGraph 树搜索 / 自研节点图
  - L56 GoT 实战：思维聚合解决依赖型任务
  - L57 多路径投票的工程实现（Self-Consistency）
  - L58 Scratchpad：让 Agent「写下来」再思考

### 阶段十 · 规划与动态重规划（Planning & Replanning）
- **要点**：任务分解、计划执行分离、动态重规划、ADaPT（合并「分解技巧」与「工程结构」为一课，避免同一概念分两节）。
- **课程**
  - L59 任务分解与计划执行分离：从拆解技巧到工程结构（含子目标表示与 plan/execute 分离）
  - **实战 L60** 实现 Plan-and-Execute 引擎（含动态重规划钩子，TS）
    - 框架对照：LangGraph 等价 plan-execute 图
  - L61 动态重规划：当现实偏离计划
  - L62 ADaPT：按难度自适应抽象层级

### 阶段十一 · 自我反思与纠错（Self-Reflection & Correction）
- **要点**：Reflexion、自我批评、验证回路。
- **课程**
  - L63 Reflexion 机制：失败经验持久化
  - L64 自我批评循环：先写再挑刺
  - **实战 L65** 实现 Self-Critique + 验证回路闭环（TS）
    - 框架对照：用 `@openai/guardrails@0.3.0` 做生成 / 评审护栏

---

## 模块五 · 多智能体（Multi-Agent）

### 阶段十二 · 多智能体协作（Multi-Agent Systems）
- **要点**：角色分工、通信协议、编排模式、冲突消解、人在回路。**学完多 Agent 先专注把它做出来（L68），链路追踪留到阶段十三学完后再接入。**
- **课程**
  - L66 什么时候需要多个 Agent
  - L67 设计 Agent 之间的「对话协议」
  - **实战 L68** 亲手用 TS 实现一个多 Agent 系统（无框架：消息总线 + 角色定义 + supervisor 编排）
    - 框架对照：OpenAI Agents SDK 的 `handoff` / AutoGen（Python，仅架构对照）角色与编排
  - L69 三种编排模式对比与选型（supervisor / 群聊 / 图 workflow）
  - L70 多 Agent 的冲突与一致性保障
  - L71 人在回路：把关键决策交还给人类

---

## 模块六 · 工程化可靠交付

### 阶段十三 · 可观测性（Observability）
- **要点**：全链路追踪、结构化度量、回放调试。**先自建追踪中间件，再把追踪接入 L68 多 Agent 系统。**
- **课程**
  - L72 给 Agent 装上「仪表盘」
  - L73 链路追踪：一次请求穿过多少工具
  - L74 回放失败现场：调试 Agent 的正确姿势
  - **实战 L75** 从零用 TS 实现 span 追踪中间件（OpenTelemetry 原生手写）
    - 框架对照：LangSmith（`@langchain/langsmith@0.3.x`）/ OpenTelemetry SDK 等价埋点
  - **实战 L76** 把链路追踪与回放接入 L68 的多 Agent 系统（学完追踪后再做）
    - 框架对照：LangSmith 对多 Agent 的自动 span 串联

### 阶段十四 · 评测体系与基准（Eval & Benchmarks）
- **要点**：评测维度、方法、主流基准、回归基线、agent 检测、LLM-as-Judge。
- **课程**
  - L77 怎么知道 Agent 真的变好了
  - L78 轨迹级评测的工程实现
  - L79 主流基准导览：AgentBench / WebArena / GAIA（该信哪一个）
  - L80 建立你自己的回归基线
  - **实战 L81** 搭建 Eval harness 与 agent 检测（TS：自动化轨迹评测 + 异常 / 退化检测）
    - 框架对照：LangSmith Evals / Ragas 等价用法
  - L82 LLM-as-Judge：用模型评模型（评分维度设计、位置/自我偏好偏差与缓解，TS 实现评审器）

### 阶段十五 · 安全与对齐（Safety & Alignment）
- **要点**：提示注入、工具授权、输出护栏、隐私隔离。
- **课程**
  - L83 提示注入：最现实的 Agent 威胁
  - **实战 L84** 提示注入攻防演练：构造注入并构建防御（TS）
    - 框架对照：`@openai/guardrails@0.3.0` / LlamaGuard（模型 API）等价防护
  - L85 工具最小权限与沙箱隔离
  - L86 输出护栏：别让 Agent 说 / 做不该的
  - L87 多租户下的记忆与数据隔离

### 阶段十六 · 成本与性能优化（Cost & Performance）
- **要点**：模型路由、缓存、提示裁剪、并发批处理。
- **课程**
  - L88 把成本压下来：模型路由策略
  - **实战 L89** 实现模型路由（TS：provider 抽象 + 按成本 / 质量分流）
    - 框架对照：Vercel AI SDK（`ai@7.0.x`）provider 切换 / LiteLLM（Python，仅思路对照）
  - L90 缓存体系：语义缓存与工具结果缓存
  - L91 提示裁剪与上下文复用
  - L92 并发与批处理：吞吐优化

---

## 模块七 · 框架专论与对照实战（独立阶段）★新增

> 本模块**单独、系统地**逐个讲透主流 **TS 框架**，并配**独立的对照实战**——同一需求先手写、再用框架实现，对比代码量 / 可控性 / 运行时位置。目标：让你能独立为真实项目选型，而不是被框架绑架。

### 阶段十七 · 框架生态总览与对照方法论
- **要点**：先建立选型维度与对照方法，再逐个框架深入。
- **课程**
  - L93 框架全景与选型维度：能力 / 可控性 / 学习曲线 / 持久化运行时位置（请求结束后「运行活在哪」）
  - L94 对照实战方法论：同一需求「手写 → 框架」双实现，如何度量差异
  - L95 版本锁定表回顾（附录 B）+ TS 工程模板（框架无关骨架，便于各框架对照）

### 阶段十八 · LangGraph JS 专论与对照实战
- **课程**
  - L96 LangGraph 核心概念：图 / 状态 / reducer / checkpoint（`@langchain/langgraph@1.4.x`）
  - **对照 L97** 用 LangGraph 重写 ReAct / Plan-and-Execute（对比 L13 / L15 手写版）
  - **对照 L98** 用 LangGraph 实现多 Agent 与 subgraph / human-in-loop
  - **对照 L99** LangGraph 可观测性 + 部署（LangSmith / LangGraph Platform）

### 阶段十九 · OpenAI Agents SDK 专论与对照实战
- **课程**
  - L100 核心概念：Agent / run / handoff / guardrail / session / tracing（`@openai/agents@0.22.x`）
  - **对照 L101** 用 OpenAI Agents SDK 重写运行时 + 多 Agent handoffs（对比 L36 / L68 手写版）
  - **对照 L102** 用 `@openai/guardrails@0.3.0` 做输入 / 输出护栏（对比 L84 手写版）

### 阶段二十 · Mastra 专论与对照实战
- **课程**
  - L103 核心概念：agent / workflow / memory / rag / observability（`@mastra/core@1.82.x`）
  - **对照 L104** 用 Mastra 重写工具型 Agent + workflow 编排（对比 L42 / L60 手写版）
  - **对照 L105** 用 Mastra 的 MCP server 能力 + 内置可观测性（对比 L45 / L75 手写版）

### 阶段二十一 · Vercel AI SDK 专论与对照实战
- **课程**
  - L106 核心概念：`ai` 包 / provider / tool / streaming（`ai@7.0.x`）
  - **对照 L107** 用 AI SDK 重写工具调用 + 流式 + 模型路由（对比 L42 / L89 手写版）

### 阶段二十二 · LlamaIndex.TS / LangChain JS 专论与对照实战
- **课程**
  - L108 LlamaIndex.TS 核心：RAG / 向量 / Graph RAG（`llamaindex`，估算版本落地核实）
  - **对照 L109** 用 LlamaIndex.TS 重写向量 / Graph RAG（对比 L49 / L50 手写版）
  - L110 LangChain JS 核心：tools / chains（`langchain@0.3.x` + `@langchain/core@1.x`）
  - **对照 L111** 用 LangChain JS 重写 Function Calling + 检索链（对比 L42 / L49 手写版）

### 阶段二十三 · 框架横评与迁移
- **要点**：汇总结论，并讲清何时该回退到手写。
- **课程**
  - L112 横向对比矩阵：LangGraph / OpenAI Agents / Mastra / AI SDK / LlamaIndex / LangChain（能力 / 成本 / 可控性 / 学习曲线 / 运行时位置）
  - L113 从框架回退到手写：何时放弃框架
  - **综合对照 L114** 用 4 种框架各实现同一 Agent 并对比代码量 / 可维护性 / 运行时位置
  - L115 Python 生态对照（AutoGen / CrewAI）：仅架构对比，不写 TS 代码（解释为何本课以 TS 框架为准）

---

## 模块八 · 专项 Agent 与生态

### 阶段二十四 · 专项 Agent（Specialized Agents）
- **要点**：把前面能力组合到具体场景。
- **课程**
  - L116 编码 Agent：读仓库 → 生成补丁 → 跑测试闭环（TS 手写 → Cursor / Aider 思路对照）
  - L117 数据 Agent：说人话查数
  - L118 研究 Agent：带溯源的综述
  - L119 GUI / 具身 Agent（**可选短单元**：依赖 CV / 控制栈，非 TS 主线，按需选修）：让 Agent 会点界面
  - L120 语音 Agent：低时延对话流水线

### 阶段二十五 · 生态与工具市场
- **课程**
  - L121 MCP 生态与工具市场速览
  - L122 模型与供应商生态

---

## 模块九 · 生产部署与运维

### 阶段二十六 · 生产部署与运维（Deployment & Ops）
- **课程**
  - L123 有状态会话的水平扩展
  - L124 降级与兜底：别让一次超时拖垮整个系统
  - L125 灰度发布与容量规划
  - L126 Agent 系统的全生命周期运维
  - **实战 L127** 部署一个有状态会话 Agent 服务并接入监控告警（框架无关手写 → 云部署对照）

---

## 模块十 · Capstone A：工具型智能体系统（从零）

> **硬性约束**：本 Capstone **不复用前期任何课程的代码成果**。每课从零构建自身组件，仅在本 Capstone 内部递进复用（例如 L130 复用 L129 在本模块内写好的运行时）。目标是产出一个完全自包含、可演示、可评测、可部署的**执行型** Agent 系统。

### 阶段二十七 · 工具型 Capstone（执行 / 动作型）
- **课程（全部为实战，从零）**
  - **实战 L128** 需求拆解与架构设计：从零画一张完整架构图（运行时 / 工具 / MCP / 多 Agent / 可观测 / 评测 / 安全）
  - **实战 L129** 从零实现核心运行时 + 工具 + 不依赖框架接入 MCP（手写协议，不复用 L36/L42/L45）
  - **实战 L130** 从零实现多 Agent 编排（supervisor + 专门角色，不复用 L68）
  - **实战 L131** 从零接入链路追踪与回放（本模块内自建中间件，不复用 L75/L76）
  - **实战 L132** 从零接入评测 / agent 检测，建立回归基线（不复用 L81）
  - **实战 L133** 从零加上安全护栏 + 成本优化 + 降级兜底（不复用 L84/L89/L124）
  - **实战 L134** 从零部署上线 + 全链路复盘与迭代（输出 Capstone A 交付物，不复用 L127）

---

## 模块十一 · Capstone B：研究型智能体系统（从零）

> **硬性约束**：同上，**不复用前期任何课程（含 Capstone A）的代码成果**，各自独立从零。目标是产出一个**认知型** Agent 系统：深度推理 + 海量检索 + 多源综合 + 带引用与溯源校验的研究报告产物。

### 阶段二十八 · 研究型 Capstone（认知 / 综合型）
- **课程（全部为实战，从零）**
  - **实战 L135** 需求拆解与架构设计：从零画架构图（聚焦深度推理 / 检索 / 综合 / 溯源）
  - **实战 L136** 从零实现深度推理与规划引擎（ToT / GoT / 规划，不复用 L55/L60）
  - **实战 L137** 从零实现 RAG + Graph RAG 知识库（不复用 L49/L50）
  - **实战 L138** 从零实现多 Agent 研究小组（研究员 / 评审 / 合成角色，不复用 L68/L130）
  - **实战 L139** 从零接入链路追踪 + 评测 + 溯源质量校验（不复用 L75/L81）
  - **实战 L140** 从零加安全（防幻觉 / 溯源校验）+ 成本优化（长文 token 优化，不复用 L84/L89）
  - **实战 L141** 从零部署 + 研究报告产物交付 + 全链路复盘（输出 Capstone B 交付物，不复用 L127/L134）

---

## 收尾 · 课程总览与进阶路线

- **实战 L142** 课程总览与进阶路线：回顾你已掌握的知识地图（范式 → 运行时 → 工具/MCP → 记忆 → 推理/规划 → 多 Agent → 可观测/评测/安全/成本 → 框架选型 → 双 Capstone），并给出社区、论文与下一步深耕建议（本课不写新代码，为连贯性收口）

---

## 附录 A · 范式速查矩阵

| 范式 | 核心机制 | 上下文成本 | 可靠性 | 可控性 | 典型场景 |
|---|---|---|---|---|---|
| ReAct | 推理+行动交替 | 中 | 中 | 中 | 通用工具调用 |
| Plan-and-Execute | 先规划后执行 | 低 | 中 | 高 | 长任务、可控流程 |
| ReWOO | 批量规划免观测 | 低 | 中 | 中 | 工具多、依赖少 |
| Reflexion | 失败记忆强化 | 高 | 高(迭代后) | 低 | 需反复试错的复杂任务 |
| ToT | 树搜索+回溯 | 高 | 高 | 低 | 需探索的规划/创意 |
| GoT | 图聚合 | 高 | 高 | 低 | 多依赖、需合并结果 |
| LATS | MCTS+反思 | 高 | 很高 | 低 | 高价值决策搜索 |
| Voyager | 技能库终身学习 | 高 | 中 | 低 | 开放式环境探索 |
| AutoGPT 谱系 | 目标自驱动循环 | 高 | 低 | 低 | 自主探索（风险高） |
| Least-to-Most | 由易到难分解 | 中 | 中 | 中 | 复合问题分解 |
| ADaPT | 抽象层级自适应 | 中 | 中 | 中 | 跨尺度任务 |
| Self-Consistency | 多采样投票 | 高(并行) | 高 | 低 | 单点推理提鲁棒 |

---

## 附录 B · 版本锁定表（编写时核实 / 估算）

> 全课实现语言 **TypeScript 7**，运行环境 **固定 Node 24 LTS**。下表版本在**落地课程时**会通过 `course-builder` 的「版本基线核实」步骤（硬性规则第 1 条）二次锁定到 `META.version` / `verifiedAt` / `docs`。「状态」列：✅ 已核实（2026-11-14 联网核实）/ ⚠️ 估算（落地时核实）。

| 框架 / 库 | 用途 | 版本 | 状态 |
|---|---|---|---|
| `node` | 固定运行环境 | `24.x`（LTS） | ✅ 本次评审固定 |
| `typescript` | 全课实现语言 | `7.0.2` | ✅ 本仓库锁定（AGENTS.md） |
| `@langchain/langgraph` | 图编排 / 状态 Agent | `1.4.x`（1.4.19, 2026-10） | ✅ 已核实 |
| `@langchain/core` | LangChain 基础抽象 | `1.x` | ✅ 随 langgraph 依赖 |
| `langchain` | 链 / 代理 / 检索 | `0.3.x` | ⚠️ 估算，落地核实 |
| `@openai/agents` | 轻量多 Agent 工作流 | `0.22.x`（0.22.0, 2026-11） | ✅ 已核实 |
| `@openai/guardrails` | 输入 / 输出护栏 | `0.3.0` | ✅ 已核实 |
| `@mastra/core` | TS 原生 Agent / Workflow | `1.82.x`（1.82.0, 2026-11） | ✅ 已核实 |
| `ai`（Vercel AI SDK） | provider / tool / streaming | `7.0.x`（7.0.107, 2026-09） | ✅ 已核实 |
| `llamaindex` | LlamaIndex.TS RAG | `0.9.x` / `1.x` | ⚠️ 估算，落地核实 |
| `@modelcontextprotocol/sdk` | MCP TS SDK | `1.x` | ⚠️ 估算，落地核实 |
| `@opentelemetry/*` | 原生追踪 | `1.9.x`（api / sdk） | ⚠️ 估算，落地核实 |
| `@langchain/langsmith` | LangSmith 客户端 | `0.3.x` | ⚠️ 估算，落地核实 |
| `zod` | Schema 校验 | `4.x`（随各框架 peer） | ✅ 已核实（agents peer `^4`） |
| `litellm` | 模型路由（Python 侧参考） | `1.x` | ⚠️ 估算（Python，仅参考） |
| AutoGen / CrewAI | 多 Agent（Python 侧参考） | — | 架构对比，不写 TS |
| LlamaGuard | 安全分类模型（API） | `LlamaGuard-3-8B` | 模型，经 API |

---

## 附录 C · 两个 Capstone 的区别与知识连贯性

### 工具型（Capstone A）vs 研究型（Capstone B）

| 维度 | Capstone A · 工具型 | Capstone B · 研究型 |
|---|---|---|
| 目标形态 | 解决「动作型」任务：调用工具 / MCP、执行代码、读写外部系统、产生**副作用** | 解决「认知型」任务：深度推理、海量检索、多源综合、产出**带引用的报告** |
| 知识主线 | 运行时 → 工具/函数调用 → MCP → 多 Agent 编排 → 链路追踪 → 评测/检测 → 安全(工具权限/沙箱) → 成本(路由/缓存) → 部署 | 推理增强(ToT/GoT) → 规划 → RAG/Graph RAG → 多 Agent 研究小组(研究员/评审/合成) → 链路追踪 → 评测(溯源质量/引用准确性) → 安全(防幻觉/溯源校验) → 成本(长文 token 优化) → 部署(报告产物) |
| 强调点 | 执行正确性、副作用隔离、可回滚、工具权限、稳定调用 | 推理深度、检索质量、可信溯源、长上下文管理、综合严谨性 |
| 典型产物 | 一个能「动手做事」的 Agent（如运维/编码助手） | 一个能「写研究报告」的 Agent（如调研/分析助手） |

### 是否影响知识连贯性？

**不影响，反而强化。** 两个 Capstone 都建立在模块一～模块九**同一套核心知识**之上（运行时、工具、MCP、多 Agent、可观测、评测、安全、成本、部署），只是**应用切面不同**（执行 vs 认知）。它们相当于同一知识树的**两条实践分支**：

- 学生可**选做其一**（单线深入），也可**都做**（双线贯通，互为对照）。
- 底层组件完全一致，任何一边的实现经验都能直接迁移到另一边——例如 A 里写的 MCP server 在 B 里可作为「知识检索工具」复用**思路**（但按规则两者各自从零、不共享代码）。
- 连贯性由「**共享核心**」保证，不依赖「互相引用」，因此完全符合本大纲的**课程解耦**原则（不与既有课程、也不互相耦合）。

**交付策略（已锁定）**：学生在课程交付物层面**选做其一**（按职业方向推荐：偏工程选 A、偏研究选 B）+ **学有余力者双做**；不强制双做，降低完课门槛，且两者均从零、不共享代码。

---

## 附录 D · 课程渲染模式方案（多模式：simple / complex，可扩展）

> 本附录为**落地前的渲染调研结论与方案**，不改动任何 `app/` 代码；待 Agent 课正式落地时按此执行。
> **v2 修订**：原 D.1–D.5 的「扩展现有渲染层以兼容四层结构」方案已废弃，改为 **多模式渲染**——简单课走现有简单模式、系统课走新的复杂模式，由路由/数据分派。理由见 D.1。

### D.1 为什么不用「扩展现有渲染层」
原方案是在现有 2 层（Stage→Lesson）渲染上叠加 `MODULES` / `subStages` 可选字段 + 容错兜底。问题在于：
- **关注点污染**：2 门现有课（Effect / RxJS）的渲染组件会被大量 `if (hasModule)` 分支侵入，简单模式为了兼容复杂模式付出永久复杂度，且这些分支在简单课里永远走空。
- **表达力错配**：复杂课是 4 层（模块>阶段>子阶段>课时），简单课是 2 层；强行统一会让复杂模式的专属能力（模块分组、模块主轴雷达、子阶段三级头）在简单课里全是空分支，可读性更差。
- **扩展性差**：未来若再出现「路径式」「项目式」等课程形态，扩展方案会再叠一层条件分支，复杂度雪球越滚越大。
- **更优解：多模式渲染**——渲染按 `renderMode` 分派到不同组件，简单与复杂各自独立、互不影响；新形态只需注册一个新模式，既有模式零改动。

### D.2 模式分发机制
- **数据驱动**：`CourseData` 增加 `renderMode?: 'simple' | 'complex'`（缺省 `'simple'`，既有的 Effect / RxJS 课无需改动即落入简单模式）。
- **路由层面（从路由区分渲染模式）**：保持干净 URL `/courses/[slug]`，在 `[slug]` 动态路由内根据 `course.renderMode` 分派到对应页面组件。即「课程自带 mode，页面据以选择渲染分支」——Nuxt 已按 `slug` 解析课程，mode 由课程数据携带，天然从路由区分，无需额外路由段。
  - **不采用** `pages/courses/[slug]/[mode]/...` 把 mode 写进 URL 的做法：`slug` 已能决定 mode，URL 多一段无意义，且会破坏既有课程的链接（如 `/courses/effect` 的历史书签/外链）。
- **组件化分派**：把现有渲染逻辑原样抽成 `simple` 组件，新增 `complex` 组件；`[slug]` 各页面只做「按 mode 选择组件」的薄壳。

### D.3 组件拆分与数据流
| 页面 / 组件 | simple 模式（现有课，行为不变） | complex 模式（Agent 系统课） |
|---|---|---|
| `[slug]/index.vue`（地图） | 薄壳 → `<CourseMapSimple>`（现有逻辑原样移入） | 薄壳 → `<CourseMapComplex>`（模块手风琴 + 子阶段三级头 + 模块导航条） |
| `[slug]/dashboard.vue`（仪表盘） | 薄壳 → `<CourseDashboardSimple>`（按阶段画轴，现状不变） | 薄壳 → `<CourseDashboardComplex>`（按模块画轴 + 模块下钻） |
| `[slug]/lessons/[id].vue`（单课时） | 面包屑「阶段」 | 面包屑「模块 · 阶段（· 子阶段）」 |
| `design.vue`（教学设计） | 现状（仅阶段列） | 加「模块」「子阶段」两列 |
| `analytics.ts`（学情聚合） | 现有 `stageRows` 不变 | 额外 `moduleRows`；按 mode 选主轴 |
| `verify-course.mjs` | 现有校验不变 | complex 额外校验 `MODULES` / `stage.module` / `subStage` 引用完整性 |
> 现有 `[slug]/index.vue`、`dashboard.vue` 的实现**原样抽进 `CourseMapSimple` / `CourseDashboardSimple`**，所以既有 2 门课行为零变化，只是换了组件归属。

### D.4 复杂模式专属数据模型（仅 complex 需要）
- `CourseData.renderMode = 'complex'`
- `MODULES: Module[]`（同 `Stage` 形状：`{ id, name, en, summary, color, goal }`）
- `Stage.module: number`（所属模块 id）
- `Stage.subStages?: { id: string; name: string; summary?: string }[]`（仅「阶段三」定义 3.1 / 3.2 / 3.3；其它阶段可省略）
- `Lesson.subStage?: string | null`（如 `'3.1'`）
- simple 模式**不要求**以上字段，缺失即按 2 层结构渲染；complex 专属字段对 simple 课完全透明。

### D.5 扩展新模式的路径（未来）
1. 在 `CourseData.renderMode` 联合类型加一个新值（如 `'path'` / `'project'`）。
2. 在 `app/components/course/` 新增 `<CourseMapXxx>` / `<CourseDashboardXxx>`。
3. 在 `[slug]/index.vue`、`dashboard.vue` 的分派表登记该模式。
4. 若新模式的专属数据结构需要，在校验脚本加对应分支。
既有模式与课程**不受影响**——这是多模式方案相对扩展方案的最大收益。

### D.6 落地时改动清单
| 文件 | 改动 |
|---|---|
| `app/types/course.ts` | `CourseData` + `renderMode?: 'simple'\|'complex'`（默认 simple）；complex 专属：`Module` 接口、`Stage.module`、`Stage.subStages?`、`Lesson.subStage?` |
| `app/components/course/map-simple.vue` | 从 `[slug]/index.vue` 抽出**现有**逻辑（不改行为） |
| `app/components/course/map-complex.vue` | 新增：模块手风琴 + 子阶段三级头 + 模块导航条 |
| `app/components/course/dashboard-simple.vue` | 从 `dashboard.vue` 抽出**现有**逻辑（不改行为） |
| `app/components/course/dashboard-complex.vue` | 新增：模块主轴 + 模块下钻 |
| `app/pages/courses/[slug]/index.vue` | 改为按 `renderMode` 分派薄壳 |
| `app/pages/courses/[slug]/dashboard.vue` | 同上 |
| `app/pages/courses/[slug]/lessons/[id].vue` | 面包屑按 mode 分支 |
| `app/pages/courses/[slug]/design.vue` | complex 模式加「模块」「子阶段」列 |
| `app/lib/analytics.ts` | + `moduleRows`（仅 complex 用） |
| `scripts/verify-course.mjs` | 按 `renderMode` 分支校验 |
| 既有 Effect / RxJS 课 | **零改动**（renderMode 缺省 simple，走现有组件） |

### D.7 风险与成本
- 既有 2 门课**零代码改动**、零行为变化——只把现有渲染逻辑搬进 `*-simple.vue`，不引入任何 `if (hasModule)` 分支。
- 主要工作量是「抽 simple 组件」+「写 complex 组件」，二者隔离、复杂度可控。
- 数据模型对 simple 课完全透明；complex 专属字段缺省即简单渲染，天然兼容。
- 未来扩新模式成本极低（加组件 + 注册），不会污染既有模式。

---

## 决策记录（已按推荐锁定）

> 以下 7 项已于 v7 按推荐锁定；课程仍**暂不实施**，仅落盘大纲。

1. **受众门槛**：维持「熟悉 TS / 异步 / HTTP / 基础数据结构，了解 Prompt」——目标人群为会 TS 的开发者，与「全课 TS 手写」定位自洽。
2. **双 Capstone 结构**：维持 A 工具型 + B 研究型各 7 课（L128–L134 / L135–L141），暂不扩课；若落地时某 Capstone 显露出覆盖不足，再按「一概念一课」拆细。
3. **阶段三预拆子阶段**：范式全景（L11–L26）拆为 3 个子阶段（3.1 基线范式 / 3.2 反思与搜索树 / 3.3 谱系与分解），仅分组、不增课、不改课号，提升导航清晰度。
4. **专项 Agent 选题**：保留编码 / 数据 / 研究 / 语音四类；GUI·具身（L119）降为**可选短单元**（依赖 CV / 控制栈，非 TS 主线，按需选修），避免引入非 TS 生态依赖。
5. **是否落地 + 分期**：已明确**暂不实施**（仅大纲，且**暂不提交**到分支）。后续若确认落地，按 `app/data/agent-course/`（目录化结构）实现并通过 `check-course.mjs` 校验；分期顺序：范式+运行时 → 记忆+规划 → 多 Agent+工程化 → 框架专论 → 双 Capstone。
6. **框架对照课拆细时机**：模块七各框架对照课（L97–L114）先按现状讲；落地时验证「是否充分覆盖框架理念」，不足者在实施期继续拆细（仍守一概念一课）。
7. **Capstone 选做策略**：交付层面定为「按职业方向推荐选做其一，学有余力者双做」；不强制双做，降低完课门槛（详见附录 C）。
8. **教学基准模型**：代码样例**默认以 OpenAI 兼容接口为教学基线**（贯穿 `openai` / `@openai/agents` / `@openai/guardrails` 等示例），不一开始就兼容多模型；多供应商 / 本地模型留到模块七（Vercel AI SDK / Mastra provider 抽象）统一讲解。
9. **框架版本策略**：附录 B 中标注 ⚠️ 估算的框架版本（`langchain` / `llamaindex` / `@modelcontextprotocol/sdk` / `@opentelemetry/*` / `@langchain/langsmith`）**保留现状**，落地时经 `course-builder` 的「版本基线核实」步骤二次锁定，不在大纲阶段强行定死。
10. **渲染采用多模式（非扩展现有层）**：废弃附录 D v1 的「扩展现有渲染层」方案，改为**多模式渲染**——课程数据用 `renderMode?: 'simple' | 'complex'`（缺省 simple，既有课零改动）；`/courses/[slug]` 路由内按 mode 分派到 `CourseMapSimple`/`CourseMapComplex` 等组件（不把 mode 写进 URL）；后续可注册更多模式（路径式/项目式等）。详见附录 D v2。
