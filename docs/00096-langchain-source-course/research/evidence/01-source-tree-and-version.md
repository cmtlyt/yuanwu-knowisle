# 证据台账 01 · TS 线源码树与版本基线

- 核实日期：2026-11-15
- 取证方式：浅克隆真实仓库到 `/tmp`（等价 `C:/Users/cmtlyt/AppData/Local/Temp/`），逐文件读取
- 证据分级：**A 级**（直接从官方仓库源码读取，非记忆、非二手）

## 仓库与 commit 锚点
| 仓库 | HEAD commit | 用途 |
|---|---|---|
| `langchain-ai/langchainjs` | `7704471213953c590c50deaa0ae8e9a34b66003d` | langchain / langchain-core / langchain-classic 主仓 |
| `langchain-ai/langgraphjs` | `fa426b293b6ecccbf62b4f262475777b4bf86673` | langgraph-core / checkpoint / prebuilt 编排仓 |

## 版本（源码 package.json 实测，与 npm registry 交叉验证一致）
| 包 | 源码路径 | 版本 | 备注 |
|---|---|---|---|
| `langchain` | `libs/langchain` | **1.6.6** | agent harness 主包 |
| `@langchain/core` | `libs/langchain-core` | **1.4.1** | Runnable / messages / tools / callbacks |
| `langchain-classic` | `libs/langchain-classic` | **1.0.61** | **1.0 后旧 Chain/LCEL API 被隔离至此** |
| `@langchain/langgraph` | `libs/langgraph` (langgraphjs 仓) | 1.0.47 | 高层 StateGraph |
| `@langchain/langgraph-core` | `libs/langgraph-core` | — | Pregel / channels / graph 内核 |

## langchainjs 顶层 libs（课程模块划分依据）
`langchain` / `langchain-core` / `langchain-classic` / `langchain-textsplitters` / `langchain-mcp-adapters` / `providers` / `create-langchain-integration`

## langchain 包 src 顶层
`agents/` `chat_models/` `prompts/` `storage/` `tools/` `hub/` `load/` + `index.ts` `browser.ts`

## langchain-core src 顶层（内核模块）
`runnables/` `messages/` `tools/` `retrievers/` `vectorstores.ts` `embeddings.ts` `documents/` `document_loaders/` `output_parsers/` `caches/` `callbacks/` `tracers/` `structured_query/` `indexing/` `memory.ts` `language_models/` `agents.ts` `decisions/` `types/` `utils/`

## agents/ 源码结构（新架构核心，A 级）
- 入口：`agents/index.ts`——`createAgent()` 的 13+ 个类型重载 + 唯一实现体
- 内核类：`agents/ReactAgent.ts`——`class ReactAgent`（L164），`constructor` L189，`invoke()` L1223（委托 `this.#graph.invoke()`），`stream()` L1312（委托 `this.#graph.stream()`）
- 节点：`agents/nodes/`——`AgentNode` / `ToolNode` / `BeforeModelNode` / `AfterModelNode` / `BeforeAgentNode` / `AfterAgentNode` + `middleware.ts`
- 中间件：`agents/middleware.ts` + `agents/middleware/` 20 个文件（见台账 02）
- 支撑：`state.ts` `runtime.ts` `responses.ts` `types.ts` `model.ts` `annotation.ts` `constants.ts` `errors.ts` `utils.ts` `withAgentName.ts` + `transformers/`（subagent / tool-call）

## langgraph-core 源码结构（编排内核，A 级）
- `pregel/`：`algo.ts` `loop.ts` `runner.ts` `stream.ts` `checkpoint.ts` `io.ts` `read.ts` `write.ts` `retry.ts` `replay.ts` `timeout.ts` `validate.ts` `debug.ts` `messages.ts` + `utils/`
- `channels/`：11 种——`base.ts` `last_value.ts` `binop.ts` `topic.ts` `delta.ts` `any_value.ts` `ephemeral_value.ts` `untracked_value.ts` `named_barrier_value.ts` `dynamic_barrier_value.ts`
- `graph/`：`state.ts`（`class StateGraph` L407）`graph.ts` `annotation.ts` `messages_annotation.ts` `messages_reducer.ts` `message.ts` `types.ts` `zod/`
- `prebuilt/`：预构建 agent 模式；另有独立包 `langgraph-supervisor` / `langgraph-swarm`

## checkpoint 源码（持久化）
`libs/checkpoint/src/`：`base.ts` `memory.ts` `serde/` `store/` `cache/` `types.ts` `id.ts`
