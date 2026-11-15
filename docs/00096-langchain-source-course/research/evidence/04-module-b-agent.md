# 证据台账 04 · 模块四~五：createAgent/ReactAgent 与 middleware

- 核实日期：2026-11-15，A 级（真实源码 `langchainjs@7704471` 逐文件读取）
- 修正：`createAgent` 类型重载实测 **14 个**（`grep -c "export function createAgent" index.ts` = 14；此前台账 02 写 13，以本台账为准）

## 证据条目（模块四）

1. **createAgent 14 个重载** — 来源 `libs/langchain/src/agents/index.ts:176..672`；重载按 responseFormat 形态分类：Zod 对象 / Zod 数组联合 / JsonSchemaFormat / 无结构化输出 / middleware 变体。实现体（L672 起）唯一一行 `return new ReactAgent(params)`。
2. **ReactAgent 类** — `agents/ReactAgent.ts:164`，泛型 5 参（middleware 数组、tools 数组等），`declare readonly "~agentTypes"` 品牌类型 L179。
3. **#graph 私有字段** — `ReactAgent.ts:181` `#graph: CompiledStateGraph<...>`；构造器 L703 `this.#graph = allNodeWorkflows.compile({...})`，L720 `withConfig(graphDefaultConfig)`。
4. **invoke 委托图** — `ReactAgent.ts:1223/1241` `return this.#graph.invoke(...)`；**stream L1289/1312** `this.#graph.stream(initializedState, mergedConfig)`。
5. **图级 API 透传** — `ReactAgent.ts:1489/1533` streamEvents、`1562/1586/1600` getGraphAsync、`1606/1612` getState/getStateHistory、`1618` getSubgraphs——agent 完整暴露图运行时的状态/历史/子图接口。
6. **节点注册：middleware hook 展开为节点链** — `ReactAgent.ts:269-382`：每个 middleware 若实现 beforeAgent/beforeModel/afterModel/afterAgent hook，就 new 对应节点并 `allNodeWorkflows.addNode(...)`；hook 节点插在 AgentNode（L382）与 ToolNode（L414）前后，形成流水线。
7. **ToolNode 按需创建** — `ReactAgent.ts:403-414`：「有 client-side tools **或 middleware 定义了 wrapToolCall**」才创建 ToolNode。
8. **entry/exit 由 hook 决定** — `ReactAgent.ts:422-441`：`entryNode = beforeAgentNodes[0].name`（无则 START 直连 agent）；exit = 最后一个 afterAgent 节点。
9. **6 类节点文件** — `agents/nodes/`：AgentNode(1107 行，模型调用+工具循环决策)、ToolNode(594)、BeforeModelNode/AfterModelNode/BeforeAgentNode/AfterAgentNode(36-40 行薄壳) + nodes/middleware.ts(193，hook 节点实现)。
10. **state/context schema** — `agents/state.ts`(55 行)、`annotation.ts`(169)、`runtime.ts`(195)：state schema 用 `StateDefinitionInit`，context 用 `AnyAnnotationRoot | InteropZodObject`。
11. **responses 三策略类** — `agents/responses.ts`：`ToolStrategy` class L54（用工具调用回传结构化结果）、`ProviderStrategy` class L164（provider 原生 JSON schema）、`transformResponseFormat` L322 统一归一化。
12. **toolStrategy() 8 个重载 / providerStrategy()** — `responses.ts:478-618`：单 Zod / Zod 数组 / JsonSchema 等形态各一个重载。
13. **JumpToTarget** — `agents/constants.ts`（`export type { JumpToTarget }`，index.ts re-export）：节点间的跳转目标类型。

## 证据条目（模块五）

14. **AgentMiddleware 接口** — `agents/middleware/types.ts:404`：可选字段 `stateSchema` L450 / `contextSchema` L459 / `tools` L464 / `streamTransformers` L471 / `tracePolicy` L490。
15. **6 个 hook** — `types.ts:554-624`：`wrapToolCall` / `wrapModelCall` / `beforeAgent` / `beforeModel` / `afterModel` / `afterAgent`，各有泛型 hook 类型（WrapModelCallHook 等）。
16. **createMiddleware + MIDDLEWARE_BRAND** — `agents/middleware.ts`(292 行) 构造器；`middleware/types.ts` 导出 `MIDDLEWARE_BRAND`（品牌标记）。
17. **MiddlewareTypeConfig / ToolCallRequest** — `types.ts:66/146`：中间件泛型配置与工具调用请求结构。
18. **20 个内置中间件实测清单**（文件:行数）：
    - 控制流：`modelRetry`(239) `modelFallback`(84，「automatic model fallback on errors」) `modelCallLimit`(208) `toolRetry`(333) `toolCallLimit`(529) `toolError`(107) `error`(配置校验异常)
    - 上下文/安全：`summarization`(1009) `contextEditing`(965) `dynamicSystemPrompt`(74) `pii`(720) `piiRedaction`(494) `autoMode`(120，含 BaseDecisionModel/NoulCriteria/Question)
    - 交互/路由：`hitl`(1233，最大) `modelRouter`(140，BaseDecisionModel/ChoiceAnswer/Content) `llmToolSelector`(387) `providerToolSearch`(201) `todoListMiddleware`(262) `toolEmulator`(189)
19. **hitl 是最大中间件** — `middleware/hitl.ts` 1233 行，含 interrupts（对应 release notes 的 opt-in per-call interrupts）。
20. **RunnableCallable** — `agents/RunnableCallable.ts`(86)：中间件/节点包装为 Runnable 的桥接层。

## 课程清单建议（模块四 4 阶段 / 模块五 4 阶段）

模块四（4 阶段 / 14 课）：
- L1 createAgent 全景：从一行实现体到 14 个重载 | index.ts:176-730 | theory ★
- L2 responseFormat 四形态与重载分类：Zod 对象/数组/JsonSchema/无 | index.ts 各重载 | theory
- L3 泛型参数推导：TMiddleware/TTools 的 const 参数如何收集类型 | index.ts | theory ★
- L4 ReactAgent 类骨架：~agentTypes 品牌与 #graph | ReactAgent.ts:164-190 | theory
- L5 构造器如何编译出图：allNodeWorkflows.compile 全流程 | ReactAgent.ts:189-730 | theory ★
- L6 invoke 路径追踪：从参数归一到 #graph.invoke | ReactAgent.ts:1223-1241 | practice
- L7 stream 路径与 streamEvents：流式输出的两条通道 | ReactAgent.ts:1289-1533 | practice
- L8 图级 API 透传：getState/getStateHistory/getSubgraphs | ReactAgent.ts:1562-1618 | theory
- L9 AgentNode：模型调用与工具循环决策的 1107 行 | nodes/AgentNode.ts | theory ★
- L10 ToolNode：客户端工具执行与 returnDirect | nodes/ToolNode.ts | practice
- L11 hook 节点化：before*/after* 如何插进流水线 | ReactAgent.ts:269-382 + nodes/middleware.ts | theory ★
- L12 entry/exit 决策：为什么 entryNode 由第一个 beforeAgent 决定 | ReactAgent.ts:422-441 | theory
- L13 state/context 双 schema：内置状态与运行时上下文 | state.ts/annotation.ts/runtime.ts | theory
- L14 JumpToTarget 与节点跳转 | constants.ts + AgentNode | practice

模块五（4 阶段 / 14 课）：
- L15 middleware 契约：AgentMiddleware 接口全解 | types.ts:404-490 | theory ★
- L16 六个 hook 的类型与调用时机 | types.ts:554-624 | theory ★
- L17 createMiddleware 工厂与品牌标记 | middleware.ts | practice
- L18 wrapModelCall：改写模型请求的统一入口 | types.ts + 示例实现 | practice
- L19 wrapToolCall 与 ToolNode 的联动 | ToolNode + types | practice
- L20 modelRetry/modelFallback：模型层容错两件套 | modelRetry.ts/modelFallback.ts | theory
- L21 modelCallLimit 与 toolCallLimit：预算闸两种 | modelCallLimit.ts/toolCallLimit.ts | theory
- L22 toolRetry/toolError/toolEmulator：工具层容错与模拟 | toolRetry/toolError/toolEmulator.ts | practice
- L23 summarization：1009 行的上下文压缩 | summarization.ts | theory ★
- L24 contextEditing 与 dynamicSystemPrompt：提示词工程中间件 | contextEditing.ts/dynamicSystemPrompt.ts | theory
- L25 pii/piiRedaction：敏感信息检测与脱敏 | pii.ts/piiRedaction.ts | theory
- L26 hitl（上）：interrupt 机制与人工介入 | hitl.ts:1-600 | theory ★
- L27 hitl（下）：per-call interrupts 与审批流 | hitl.ts:600-1233 | practice
- L28 modelRouter/llmToolSelector/providerToolSearch/todoList：路由与选择族 | 四文件 | theory
