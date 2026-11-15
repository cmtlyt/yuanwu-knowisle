# 证据台账 02 · 关键机制源码铁证

- 核实日期：2026-11-15，A 级（逐行读源码）

## 1. createAgent 的真相（纠正记忆）
- 文件：`libs/langchain/src/agents/index.ts`
- `createAgent()` 有 13 个重载（L176/L214/L256/…/L672），分别针对 `responseFormat` 的不同形态（Zod 对象 / Zod 数组联合 / JsonSchemaFormat / 无结构化输出）推导类型。
- **实现体（L672 起）核心只有一行**：`return new ReactAgent(params);`
- 结论：教程若把 `createAgent` 讲成「一串 Chain 拼接」是错的；它是**类型重载极重、运行时极薄的构造器**，复杂度全在 `ReactAgent` 与类型系统。

## 2. Agent = 编译后的图（Agent/Graph 一体的源码证据）
- 文件：`libs/langchain/src/agents/ReactAgent.ts`
- `class ReactAgent`（L164），私有字段 `#graph`
- `invoke()` L1223 → `return this.#graph.invoke(...)`（L1241）
- `stream()` L1312 → `return this.#graph.stream(initializedState, mergedConfig)`（L1312）
- 结论：`createAgent` 产出的 harness 内部就是一张 LangGraph 图；「LangChain vs LangGraph 二选一」的旧认知失效——**LangChain 的 agent 构建在 LangGraph 运行时之上**。这与官方文档「LangGraph 用于确定性+agentic 混合的高级需求」并不矛盾：简单 agent 用 createAgent，需要改图结构时才下探 LangGraph。

## 3. middleware 体系（新架构的处理管道）
- 文件：`agents/middleware/` 目录实测 20 个：
  `autoMode` `contextEditing` `dynamicSystemPrompt` `error` `hitl`（human-in-the-loop）`llmToolSelector` `modelCallLimit` `modelFallback` `modelRefusal` `modelRetry` `modelRouter` `pii` `piiRedaction` `providerToolSearch` `summarization` `todoListMiddleware` `toolCallLimit` `toolEmulator` `toolError` `toolRetry` + `types.ts` `constants.ts` `utils.ts` `index.ts`
- 版本说明来自 A 级 release notes：`ModelRouterMiddleware` 在 langchain(JS) 1.x 标 beta；`SummarizationMiddleware` 支持 per-call interrupt（HITL）；`ModelRefusalMiddleware` 省略 trace 输入（Python 线 v1.4.10 的对应修复，TS 线需单独取证确认，禁止直接套用）。
- `createMiddleware()` 为公开的中间件构造入口（`agents/index.ts` re-export），`MIDDLEWARE_BRAND` 用于类型品牌。

## 4. Pregel 运行时（LangGraph 内核）
- 文件：`langgraph-core/src/pregel/loop.ts`
- `class PregelLoop`（L404），`constructor` L684，`tick()` L1194（`async tick(params): Promise<boolean>`）——BSP 超步推进，返回是否还要继续
- 配套：`runner.ts`（任务执行）、`algo.ts`（任务准备/写入归并）、`stream.ts`（迭代流）、`checkpoint.ts`（状态快照）、`read.ts`/`write.ts`（通道读写）、`retry.ts` `timeout.ts` `validate.ts`
- `channels/base.ts`：`BaseChannel` 是抽象类，`lg_is_channel = true` 作类型标记，`lc_graph_name` 作运行时识别；`isDeltaChannel()` 靠 `lc_graph_name === "DeltaChannel"` 判定（避免 import 环）
- `graph/state.ts`：`class StateGraph`（L407），`addNode` / `addEdge` / `addConditionalEdges` / `compile()` 是图构建 API

## 5. 新旧架构物理隔离
- `langchain-classic@1.0.61` 独立包，src 保留 `chains/` `memory/` `retrievers/` `output_parsers/` `indexes/` `evaluation/` 等——即旧教程里的 `LLMChain` / `ConversationalRetrievalChain` / `BufferMemory` 等全在这里。
- 课程必须明确：1.x 主线写 `createAgent` + middleware + LangGraph，classic 仅作历史对照/迁移章节，禁止混用（与 AGENTS.md §7「严禁混用跨版本 API」一致）。

## 待补证据（大纲审批后、写正文前必须补齐）
- middleware hooks 的完整类型契约（`agents/middleware/types.ts` 逐行）
- `StateGraph.compile()` 如何产出 `CompiledGraph`（`graph/state.ts` L407+）
- `messages/` 的消息协议（AIMessage / tool_calls / content blocks）
- `tools/` 的 tool 定义与执行路径
- `runnables/` 的 LCEL 组合（`RunnableSequence` / `RunnableParallel` / `pipe()`）
- checkpoint 的 serde/store 与 thread 隔离
