# 模块九（0.x→1.x 迁移）证据台账

> 取证基线：langchainjs 仓库 commit 7704471，`libs/langchain-classic`（package.json 版本 1.0.61）、`libs/langchain`（1.6.6）、`libs/langchain-core`，以及 langgraphjs `libs/checkpoint`。
> 所有结论均来自实际读取的源码文件，标注「相对路径:行号」。相对路径根：`libs/`（langgraph checkpoint 为 langgraphjs 仓库 `libs/checkpoint/src/`）。

---

## 第一部分 · 证据条目

### 1. classic 包定位：显式的「旧抽象收藏馆」
**来源**：`langchain-classic/package.json:2-4`
**证据**：
```json
"name": "@langchain/classic",
"version": "1.0.61",
"description": "Old abstractions from LangChain.js"
```
**可讲的知识点**：
- classic 包在 monorepo 内是独立发布的 npm 包 `@langchain/classic`，描述直接写明「Old abstractions」，官方定位就是迁移缓冲区。
- 版本号 1.0.61 说明它跟随 1.x 主线同步发版，但内容是旧 API。
- 迁移课的第一个世界观：1.x 迁移不是「删旧代码」，而是「新旧两包并存、官方同时维护」。

### 2. classic 包结构全览：30 个顶级条目
**来源**：`langchain-classic/src/` 目录列表（实际 ls 结果）
**证据**：顶级目录/文件：`agents, cache, callbacks, chains, chat_models, document.ts, document_loaders, document_transformers, embeddings, evaluation, experimental, hub, index.ts, indexes, load, memory, output_parsers, prompts, retrievers, schema, smith, sql_db.ts, storage, stores, tests, text_splitter.ts, tools, types, util, vectorstores`
**可讲的知识点**：
- `chains/` 与 `memory/` 是 0.x 时代的两大核心，1.x 主线包里没有这两个目录。
- `experimental/`（autogpt、babyagi、plan_and_execute、generative_agents）整族只活在 classic。
- `sql_db.ts`、`smith`、`indexes`、`evaluation` 是 classic 独占能力。

### 3. classic 根入口是空的并给出警告
**来源**：`langchain-classic/src/index.ts:1-3`
**证据**：
```ts
console.warn(
  `[WARNING]: The root "langchain" entrypoint is empty. Please use a specific entrypoint instead.`
);
```
**可讲的知识点**：
- classic 包的 `import "langchain"`（映射到 @langchain/classic）只会得到一个警告，强制用户用具体子入口如 `langchain/chains`。
- 这是 0.1→0.2→1.0 演进中「大包拆小包」策略的残留证据。

### 4. prompts 入口直接报错移除
**来源**：`langchain-classic/src/prompts/index.ts:1-7`
**证据**：
```ts
/* #__PURE__ */ console.warn(
  `[ERROR]: The "langchain/prompts" entrypoint was removed in LangChain version 0.2.0.`,
  `Instead, please import from "@langchain/core/prompts".`
);
```
**可讲的知识点**：
- Prompt 族早在 0.2.0 就整体搬去 `@langchain/core/prompts`，classic 里只留一个报错占位。
- `langchain-classic/src/prompts/base.ts:1-11` 也只是 `export ... from "@langchain/core/prompts"` 的转发——Prompt 在迁移里是「已归 core、无新版替代」。

### 5. BaseChain：旧架构的执行单元
**来源**：`langchain-classic/src/chains/base.ts:32`
**证据**：`export abstract class BaseChain<`
**可讲的知识点**：
- 0.x 的一切编排（问答/路由/顺序/转换）都继承 BaseChain，靠 `call()` + memory 注入运行。
- 1.x 中这个抽象整体消失，编排单元统一为 core 的 Runnable。

### 6. LLMChain：最经典的旧 API
**来源**：`langchain-classic/src/chains/llm_chain.ts:89-133`
**证据**：
```ts
export class LLMChain<T extends string | object = string, Model extends LLMType = LLMType>
  extends BaseChain implements LLMChainInput<T> {
  prompt: BasePromptTemplate;
  llm: Model;
  outputKey = "text";
  outputParser?: BaseLLMOutputParser<T>;
```
其 JSDoc 示例（llm_chain.ts:78-87）已经在教新写法：
```ts
const chain = prompt.pipe(llm);
const response = await chain.invoke({ adjective: "funny" });
```
**可讲的知识点**：
- LLMChain 的官方替代就是 LCEL 的 `prompt.pipe(llm)`，连旧类自己的文档注释都这么写——这是「概念替代」的最硬证据。
- LLMChain 内部持有 prompt+llm+outputParser 三个字段，LCEL 中它们由 `RunnableSequence` 组合替代。

### 7. ConversationChain：memory 与 chain 的耦合
**来源**：`langchain-classic/src/chains/conversation.ts:30-53`
**证据**：
```ts
export class ConversationChain extends LLMChain {
  constructor({ prompt, outputKey, memory, ...rest }) {
    super({
      prompt: prompt ?? new PromptTemplate({ template: DEFAULT_TEMPLATE, inputVariables: ["history", "input"] }),
      outputKey: outputKey ?? "response",
      memory: memory ?? new BufferMemory(),
      ...rest,
    });
  }
}
```
**可讲的知识点**：
- ConversationChain 默认注入 BufferMemory + history/input 模板，对话状态藏在 chain 对象里。
- 1.x 中对话状态显式化：messages 数组 + LangGraph checkpointer，见证据 24/25。

### 8. RetrievalQAChain：RAG 的旧形态
**来源**：`langchain-classic/src/chains/retrieval_qa.ts:57-117`
**证据**：
```ts
export class RetrievalQAChain extends BaseChain implements RetrievalQAChainInput {
  inputKey = "query";
  retriever: BaseRetrieverInterface;
  combineDocumentsChain: BaseChain;
  ...
  async _call(values, runManager) {
    const docs = await this.retriever.invoke(question, runManager?.getChild("retriever"));
    const inputs = { question, input_documents: docs, ...values };
    const result = await this.combineDocumentsChain.call(inputs, ...);
```
**可讲的知识点**：
- 旧 RAG 是一个 BaseChain 包着 retriever + combineDocumentsChain，输入键是 `query`。
- 1.x 概念替代为 `createRetrievalChain`（仍在 classic 提供但已是 LCEL 函数）或自组 LCEL/Graph。

### 9. createRetrievalChain：classic 里已 LCEL 化的桥
**来源**：`langchain-classic/src/chains/retrieval.ts:70-80`
**证据**：
```ts
export async function createRetrievalChain<RunOutput>({ retriever, combineDocsChain }): Promise<
  Runnable<{ input: string; chat_history?: BaseMessage[] | string } & {...},
             { context: Document[]; answer: RunOutput } & {...}>
>
```
其示例注释（retrieval.ts:56-57）写的导入是：
```ts
import { createRetrievalChain } from "@langchain/classic/chains/retrieval";
import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents";
```
**可讲的知识点**：
- 返回类型是 Runnable 而非 BaseChain——0.1 末期官方已在 classic 内用 LCEL 重写旧链，是 0.x→1.x 的过渡层。
- 迁移课可借此讲「两代 API 在同一个包里共存」的历史切面。

### 10. StuffDocumentsChain / MapReduce / Refine 三兄弟
**来源**：`langchain-classic/src/chains/combine_docs_chain.ts:29,131,306`
**证据**：`export class StuffDocumentsChain`、`export class MapReduceDocumentsChain`、`export class RefineDocumentsChain`
配套工厂：`langchain-classic/src/chains/combine_documents/stuff.ts:37` `export async function createStuffDocumentsChain<RunOutput = string>({`
**可讲的知识点**：
- 三种文档合并策略（塞入/MapReduce/Refine）在旧架构里各是一个类。
- 1.x 中 Stuff 策略由 `createStuffDocumentsChain`（LCEL 函数）+ core `runnables/passthrough` 组合表达；MapReduce/Refine 无一等价官方类，需用 RunnableEach/RunnableLambda 自组。

### 11. SequentialChain / TransformChain / RouterChain 族
**来源**：`langchain-classic/src/chains/sequential_chain.ts:77,284`、`chains/transform.ts:28`、`chains/router/multi_route.ts:63`、`chains/router/llm_router.ts:32`、`chains/router/multi_prompt.ts:40`、`chains/router/multi_retrieval_qa.ts:66`
**证据**：`export class SequentialChain extends BaseChain`、`export class SimpleSequentialChain`、`export class TransformChain<`、`export class MultiRouteChain extends BaseChain`、`export class LLMRouterChain extends RouterChain`、`export class MultiPromptChain extends MultiRouteChain`、`export class MultiRetrievalQAChain extends MultiRouteChain`
**可讲的知识点**：
- SequentialChain ≈ `RunnableSequence`；TransformChain ≈ `RunnableLambda`；MultiRouteChain ≈ `RunnableBranch`（core runnables/base.ts）。
- 路由链整族在 1.x 无同名替代，是「概念替代」的典型教材。

### 12. classic 其余 Chain：APIChain/SqlDatabaseChain/GraphCypherQAChain/ConstitutionalChain 等
**来源**：`chains/api/api_chain.ts:40`、`chains/sql_db/sql_db_chain.ts:68`、`chains/graph_qa/cypher.ts:65`、`chains/constitutional_ai/constitutional_chain.ts:48`、`chains/constitutional_ai/constitutional_principle.ts:28`、`chains/chat_vector_db_chain.ts:42`、`chains/conversational_retrieval_chain.ts:108`、`chains/analyze_documents_chain.ts:46`、`chains/openai_moderation.ts:56`、`chains/vector_db_qa.ts:32`、`chains/query_constructor/index.ts:35,66`
**证据**：`export class APIChain extends BaseChain`、`export class SqlDatabaseChain extends BaseChain`、`export class GraphCypherQAChain extends BaseChain`、`export class ConstitutionalChain`、`export class ConstitutionalPrinciple`、`export class ChatVectorDBQAChain`、`export class ConversationalRetrievalQAChain`、`export class AnalyzeDocumentChain`、`export class OpenAIModerationChain`、`export class VectorDBQAChain`、`export class AttributeInfo`、`export class StructuredQueryOutputParser`
**可讲的知识点**：
- 这些垂类链（SQL/Graph/Constitutional/Moderation）在 1.x 主线 `libs/langchain/src/` 顶层目录（agents/browser/chat_models/hub/load/prompts/storage/tools，见 langchain/src ls 结果）中完全没有对应物——只能留 classic 或改用 Agent+tool 模式。
- OpenAIModerationChain 的精神续作是 middleware `openAIModerationMiddleware`（证据 26）。

### 13. BaseMemory 与 memory 接口三件套
**来源**：`langchain-core/src/memory.ts:28-54`
**证据**：
```ts
export abstract class BaseMemory {
  abstract get memoryKeys(): string[];
  abstract loadMemoryVariables(values: InputValues): Promise<MemoryVariables>;
  abstract saveContext(inputValues, outputValues): Promise<void>;
}
```
**可讲的知识点**：
- BaseMemory 住在 core 里，但 classic 的 chain 才消费它；1.x 新 agent 不接受 memory 参数。
- `loadMemoryVariables/saveContext` 的隐式读写模式是旧架构核心心智模型，迁移时必须换成显式 messages 状态。

### 14. BufferMemory：默认记忆实现
**来源**：`langchain-classic/src/memory/buffer_memory.ts:50-96`
**证据**：
```ts
export class BufferMemory extends BaseChatMemory implements BufferMemoryInput {
  humanPrefix = "Human";
  aiPrefix = "AI";
  memoryKey = "history";
  async loadMemoryVariables(_values: InputValues): Promise<MemoryVariables> {
    const messages = await this.chatHistory.getMessages();
    ...
    [this.memoryKey]: getBufferString(messages, this.humanPrefix, this.aiPrefix)
```
**可讲的知识点**：
- BufferMemory 本质 = chatHistory（消息存储）+ getBufferString（渲染为字符串）。
- 1.x 对应物是 messages 数组 + `getBufferString`（core messages，见新包 middleware summarization.ts:12 的 import），再加 LangGraph checkpointer 做持久化——逐件拆解讲解。

### 15. BaseChatMemory：memory 与 chat history 的分层
**来源**：`langchain-classic/src/memory/chat_memory.ts:29`
**证据**：`export abstract class BaseChatMemory extends BaseMemory`
配套：`langchain-classic/src/memory/index.ts:10` `export { InMemoryChatMessageHistory as ChatMessageHistory } from "@langchain/core/chat_history"`
**可讲的知识点**：
- 旧 memory 分两层：BaseMemory（变量读写）→ BaseChatMemory（底层 BaseChatMessageHistory）。
- `BaseChatMessageHistory`/`BaseListChatMessageHistory` 定义在 `langchain-core/src/chat_history.ts:10,40`，是 1.x 仍保留的持久层接口，但消费方从 chain 变成 LangGraph。

### 16. Memory 全家福（以源码为准）
**来源**：`langchain-classic/src/memory/` 下各文件
**证据**：
- `buffer_window_memory.ts:44` `export class BufferWindowMemory`
- `buffer_token_memory.ts:52` `export class ConversationTokenBufferMemory`
- `summary.ts:127` `export class ConversationSummaryMemory extends BaseConversationSummaryMemory`
- `summary_buffer.ts:59` `export class ConversationSummaryBufferMemory`
- `entity_memory.ts:71` `export class EntityMemory extends BaseChatMemory`
- `combined_memory.ts:26` `export class CombinedMemory`
- `vector_store.ts:65` `export class VectorStoreRetrieverMemory`
- `stores/entity/in_memory.ts:7` `export class InMemoryEntityStore extends BaseEntityStore`
**可讲的知识点**：
- 窗口/token/摘要/实体四种裁剪策略在 1.x 全部由 middleware 吸收：`summarizationMiddleware`、`trimMessages`（langchain/src/index.ts:17）、`contextEditingMiddleware`（证据 26）。
- CombinedMemory 的组合需求在 1.x 由 stateSchema（多个状态字段）解决。

### 17. AgentExecutor：旧 agent 运行时
**来源**：`langchain-classic/src/agents/executor.ts:352-398`
**证据**：
```ts
export class AgentExecutor extends BaseChain<ChainValues, AgentExecutorOutput> {
  agent: BaseSingleActionAgent | BaseMultiActionAgent;
  tools: this["agent"]["ToolType"][];
  returnIntermediateSteps = false;
  maxIterations?: number = 15;
  earlyStoppingMethod: StoppingMethod = "force";
  handleParsingErrors: boolean | string | ((e: OutputParserException | ToolInputParsingException) => string) = false;
```
**可讲的知识点**：
- AgentExecutor 是手写的 while 循环 + maxIterations=15 兜底，一个 BaseChain 子类。
- 1.x 中执行循环交给 LangGraph StateGraph（ReactAgent 内部持有 `#graph: CompiledStateGraph`，见证据 22），中间步骤/错误处理/迭代上限分别变成 LangGraph 流、middleware（toolError/toolRetry/toolCallLimit）与 recursionLimit。

### 18. initializeAgentExecutor：字符串选型的旧入口
**来源**：`langchain-classic/src/agents/initialize.ts:26-63`
**证据**：
```ts
type AgentType = "zero-shot-react-description" | "chat-zero-shot-react-description" | "chat-conversational-react-description";
export async function initializeAgentExecutor(tools, llm, _agentType?: AgentType, ...): Promise<AgentExecutor> {
  switch (agentType) {
    case "zero-shot-react-description":
      return AgentExecutor.fromAgentAndTools({ agent: ZeroShotAgent.fromLLMAndTools(llm, tools), tools, ... });
```
**可讲的知识点**：
- 旧 agent 用字符串类型名 + switch 分发到不同 prompt 工厂，是「prompt 模板驱动的 agent」。
- 1.x 用 `createAgent({ model: "openai:gpt-4o", tools })` 一把梭，字符串从「agent 类型」变成「模型标识」（langchain/src/agents/index.ts:89-106 示例）。

### 19. 旧 Agent 类族谱
**来源**：`langchain-classic/src/agents/` 各文件
**证据**：
- `agent.ts:175` `AgentRunnableSequence`、`agent.ts:214` `RunnableSingleActionAgent`、`agent.ts:295` `RunnableMultiActionAgent`、`agent.ts:411` `LLMSingleActionAgent`
- `mrkl/index.ts:59` `ZeroShotAgent extends Agent`（ReAct 文本协议）
- `chat/index.ts:44` `ChatAgent`、`chat_convo/index.ts:54` `ChatConversationalAgent`
- `structured_chat/index.ts:65` `StructuredChatAgent`
- `openai_functions/index.ts:98` `OpenAIAgent`、`openai_tools/`（仅 output_parser）
- `xml/index.ts:38` `XMLAgent`
- `tool_calling/output_parser.ts:75` `ToolCallingAgentOutputParser`
- `executor.ts:47` `AgentExecutorIterator`
**可讲的知识点**：
- 每个 Agent 类 = 一种「让 LLM 输出可解析动作」的协议（ReAct 文本/OpenAI functions/XML/structured chat），1.x 收敛为统一的 tool-calling + LangGraph 循环。
- BaseSingleActionAgent/BaseMultiActionAgent（`agents/agent.ts`）在 1.x 主线不存在——单/多动作之分由模型原生并行 tool call 取代。

### 20. 旧 Agent 输出解析器与 Toolkits
**来源**：`langchain-classic/src/agents/mrkl/outputParser.ts:12`、`agents/structured_chat/outputParser.ts:19,100`、`agents/openai_functions/output_parser.ts:47`、`agents/openai_tools/output_parser.ts:43`、`agents/xml/output_parser.ts:26`、`agents/toolkits/sql/sql.ts:37`、`agents/toolkits/vectorstore/vectorstore.ts:42,71`、`agents/toolkits/json/json.ts:25`、`agents/toolkits/openapi/openapi.ts:24,57`
**证据**：`ZeroShotAgentOutputParser`、`StructuredChatOutputParser(+WithRetries)`、`OpenAIFunctionsAgentOutputParser`、`OpenAIToolsAgentOutputParser`、`XMLAgentOutputParser`、`SqlToolkit extends BaseToolkit`、`VectorStoreToolkit/VectorStoreRouterToolkit`、`JsonToolkit`、`RequestsToolkit/OpenApiToolkit`
**可讲的知识点**：
- 旧 agent 的一大复杂度在输出解析器（AgentAction/AgentFinish 二元返回），1.x 直接解析模型原生 tool_calls，解析器层消失。
- Toolkit（工具集合体）在 1.x 无对应物，迁移路径是把 toolkit 里的工具列表直接传给 `createAgent` 的 tools 参数。

### 21. classic agents 入口导出清单
**来源**：`langchain-classic/src/agents/index.ts:1-104`
**证据**：导出 Agent/BaseSingleActionAgent/BaseMultiActionAgent/RunnableAgent/LLMSingleActionAgent、AgentExecutor、initializeAgentExecutor(WithOptions)、ZeroShotAgent、ChatAgent、ChatConversationalAgent、StructuredChatAgent、OpenAIAgent、createOpenAIToolsAgent、createToolCallingAgent、createReactAgent、createXmlAgent、createStructuredChatAgent、createOpenAIFunctionsAgent、JsonToolkit/OpenApiToolkit 等；末行 `export type { AgentAction, AgentFinish, AgentStep } from "@langchain/core/agents"`（index.ts:100-104）
**可讲的知识点**：
- `AgentAction/AgentFinish` 类型虽在 core，但只有 classic 消费——core 里它是 0.x 兼容残留。
- `createReactAgent`（classic）≠ 新 `createAgent`：前者是 LangGraph 的 ReAct 预制图迁移过来的旧入口，同名陷阱必须在课里点破。

### 22. 新 Agent：createAgent + ReactAgent
**来源**：`langchain/src/agents/index.ts:176-202（Overload 1 签名）、672-702（implementation）`、`langchain/src/agents/ReactAgent.ts:164-188`
**证据**：
```ts
export function createAgent<...>(params: CreateAgentParams<...>): ReactAgent<AgentTypeConfig<...>> {
  return new ReactAgent(params);
}
// ReactAgent.ts
export class ReactAgent<Types extends AgentTypeConfig = ...> {
  declare readonly "~agentTypes": Types;
  #graph: CompiledStateGraph<any, any, any, any, any, any, unknown>;
```
createAgent JSDoc 示例（index.ts:89-106）：
```ts
const agent = createAgent({ llm: "openai:gpt-4o", tools: [search] });
const result = await agent.invoke({ messages: [{ role: "user", content: "..." }] });
```
**可讲的知识点**：
- 新 API 是工厂函数 + ReactAgent 类，内部编译成 LangGraph StateGraph——「AgentExecutor 循环」变成「图执行」。
- 参数面：model/llm、tools、prompt、responseFormat、stateSchema、middleware（index.ts:77-83），与 AgentExecutor 的构造参数几乎一一对应，是映射表的最佳锚点。
- `createAgent` 有 13 个重载（index.ts:175-670），全部围绕 responseFormat 的类型变体——课里可讲「结构化输出从 OutputParser 变成 responseFormat 策略」。

### 23. 新 Agent 的 middleware 体系
**来源**：`langchain/src/agents/middleware/index.ts:1-126`（完整导出清单）
**证据**：导出包括 `summarizationMiddleware`、`dynamicSystemPromptMiddleware`、`llmToolSelectorMiddleware`、`piiMiddleware`（内置 detectEmail/detectCreditCard/detectIP 等）、`piiRedactionMiddleware`、`contextEditingMiddleware`、`toolCallLimitMiddleware`、`todoListMiddleware`、`modelCallLimitMiddleware`、`modelFallbackMiddleware`、`modelRefusalMiddleware`、`modelRetryMiddleware`、`toolRetryMiddleware`、`toolErrorMiddleware`、`toolEmulatorMiddleware`、`autoModeMiddleware`、`modelRouterMiddleware`、`providerToolSearchMiddleware`、`hitl`（hitl.js）、`openAIModerationMiddleware`、`anthropicPromptCachingMiddleware`、`bedrockPromptCachingMiddleware`；创建入口 `createMiddleware`（`agents/index.ts:719`）
**可讲的知识点**：
- 旧 AgentExecutor 的散装开关（handleParsingErrors/maxIterations/returnIntermediateSteps）全部 middleware 化、可组合。
- middleware 按「模型调用前/后、工具调用前/后」切面注入，是 1.x 架构讲解的重头戏。

### 24. summarizationMiddleware：ConversationSummaryMemory 的 1.x 化身
**来源**：`langchain/src/agents/middleware/summarization.ts:1-68`
**证据**：
- import 里直接复用旧世界的积木：`import { ..., trimMessages, HumanMessage, getBufferString } from "@langchain/core/messages"`（summarization.ts:4-13）
- `export const DEFAULT_SUMMARY_PROMPT = "<role>Context Extraction Assistant</role>..."`（summarization.ts:36）
- 常量：`DEFAULT_MESSAGES_TO_KEEP = 20`、`DEFAULT_TRIM_TOKEN_LIMIT = 4000`（summarization.ts:65-66）
**可讲的知识点**：
- 摘要记忆没被删除，而是变成 middleware：触发条件（fraction/tokens/messages）+ 保留条数 + token 计数器。
- 对照讲解 `langchain-classic/src/memory/summary.ts:127` ConversationSummaryMemory → summarizationMiddleware，是迁移课最有戏剧性的一组映射。

### 25. LangGraph checkpointer：对话持久化的新地基
**来源**：langgraphjs `libs/checkpoint/src/base.ts:180-239`、`libs/checkpoint/src/memory.ts:106`、`libs/checkpoint/src/index.ts:1-9`
**证据**：
```ts
export abstract class BaseCheckpointSaver<V extends string | number = number> {
  serde: SerializerProtocol = new JsonPlusSerializer();
  abstract getTuple(config): Promise<CheckpointTuple | undefined>;
  abstract list(config, options?): AsyncGenerator<CheckpointTuple>;
  abstract put(config, checkpoint, metadata, newVersions): Promise<RunnableConfig>;
  abstract putWrites(config, writes, taskId, taskPath?): Promise<void>;
  abstract deleteThread(threadId: string): Promise<void>;
}
export class MemorySaver extends BaseCheckpointSaver {}
```
**可讲的知识点**：
- 旧 BaseChatMessageHistory（chat_history.ts:10）只管「追加消息」，checkpointer 管「整个 agent 状态的版本快照」——持久化粒度从消息升级为图状态。
- MemorySaver 对应旧的 ChatMessageHistory（in-memory 起步），生产再换 Postgres/Redis saver。
- thread 概念（deleteThread）取代了旧 memory 的 sessionId 惯例。

### 26. 新包 langchain 1.6.6 的顶层世界
**来源**：`langchain/src/index.ts:1-79`、`langchain/package.json:2-3,77`
**证据**：
- 顶层导出：`BaseMessage/AIMessage/HumanMessage/SystemMessage/ToolMessage/filterMessages/trimMessages`（index.ts:4-18）、`initChatModel`（:23）、`tool`/HeadlessTool（:28-33）、core 的 `Tool/StructuredTool/DynamicStructuredTool`（:38-44）、`context`（:49）、`export * from "./agents/index.js"`（:54）、`export * from "./agents/middleware/index.js"`（:59）、`InMemoryStore`（:64）、`Document`（:69）、`langchainMatchers/fakeModel`（:74-78）。
- 顶层目录只有 `agents, browser, chat_models, hub, load, prompts, storage, tools`（ls 结果）。
- package.json：`"name": "langchain", "version": "1.6.6"`，依赖 `"@langchain/langgraph": "^1.6.1"`（package.json:77）。
**可讲的知识点**：
- 1.x 主线包没有 chains/memory/retrievers/vectorstores/output_parsers 目录——它们或下沉 core（runnables/retrievers/messages/vectorstores.ts）、或留在 classic。
- langchain 1.x 依赖 langgraph：agent 即图，这是两代架构世界观的分水岭。

### 27. core runnables：1.x 编排原语清单
**来源**：`langchain-core/src/runnables/base.ts:1315,1618,1740,1944,2297,2450,2572,2888,2958,3246,3381,3485`
**证据**：`RunnableBinding`(:1315)、`RunnableEach`(:1618)、`RunnableRetry`(:1740)、`RunnableSequence`(:1944)、`RunnableMap`(:2297)、`RunnableTraceable`(:2450)、`RunnableLambda`(:2572)、`RunnableParallel extends RunnableMap`(:2888)、`RunnableWithFallbacks`(:2958)、`RunnableAssign`(:3246)、`RunnablePick`(:3381)、`RunnableToolLike`(:3485)
**可讲的知识点**：
- RunnableSequence/RunnableLambda/RunnableBranch/RunnableParallel 是旧 SequentialChain/TransformChain/MultiRouteChain/ParallelChain 的逐项替代。
- RunnableWithFallbacks 取代旧 LLMChain 里 fallbacks 的处理逻辑（llm_chain.ts:61-68 的 fallbacks 探测代码是旧实现的证据）。

### 28. core prompts：Prompt 族的正式住所
**来源**：`langchain-core/src/prompts/`：`chat.ts:101` `MessagesPlaceholder`、`chat.ts:924` `ChatPromptTemplate`、`prompt.ts:113` `PromptTemplate`、`few_shot.ts:106` `FewShotPromptTemplate`、`few_shot.ts:333` `FewShotChatMessagePromptTemplate`、`pipeline.ts:73` `PipelinePromptTemplate`、`dict.ts:10` `DictPromptTemplate`、`structured.ts:46` `StructuredPrompt`
**可讲的知识点**：
- Prompt 类在 0.2 就迁 core，1.x 不再有「prompt 迁移」，迁移课只需指认「新家」。
- `DictPromptTemplate` 是 core 独有的新增项，可作为「core 还在演进」的证据。

### 29. core output_parsers：旧解析器的幸存名单
**来源**：`langchain-core/src/output_parsers/`：`string.ts:22` `StringOutputParser`、`json.ts:12` `JsonOutputParser`、`list.ts:64,104,159,179`（CommaSeparated/Custom/Numbered/MarkdownListOutputParser）、`structured.ts:34,158` `StructuredOutputParser`/`JsonMarkdownStructuredOutputParser`、`xml.ts:38` `XMLOutputParser`、`bytes.ts:7` `BytesOutputParser`、`standard_schema.ts:9` `StandardSchemaOutputParser`、`base.ts:170` `OutputParserException`、`openai_tools/json_output_tools_parsers.ts:124,243`、`openai_functions/json_output_functions_parsers.ts:27,81,176`
**可讲的知识点**：
- 大部分通用解析器（String/Json/List/Structured/XML）原样在 core，与 classic 版同签名——这类「无替代但同款」要专门讲（classic `output_parsers/structured.ts:30,129` 与 core `output_parsers/structured.ts:34,158` 对照）。
- agent 专用解析器（AgentAction/AgentFinish 族）不在 core output_parsers，只有 openai_tools/openai_functions 的 JSON 解析器留存；新 agent 用模型原生 tool_calls 免解析。

### 30. core messages：消息模型与 trimMessages
**来源**：`langchain-core/src/messages/base.ts:215,709`、`human.ts:18`、`ai.ts:46`、`system.ts:18`、`tool.ts:53`、`modifier.ts:22`
**证据**：`export abstract class BaseMessage<`(:215)、`BaseMessageChunk`(:709)、`HumanMessage`(:18)、`AIMessage`(:46)、`SystemMessage`(:18)、`ToolMessage`(:53)、`export class RemoveMessage extends BaseMessage`(:22)
新包导出 `filterMessages, trimMessages`（langchain/src/index.ts:16-17）。
**可讲的知识点**：
- 旧 memory 输出的是 `{history: string|BaseMessage[]}` 变量；1.x 输入输出统一是 `messages: BaseMessage[]`，`trimMessages`/`RemoveMessage` 承担裁剪。
- RemoveMessage 是 LangGraph 状态修订专用（配合 REMOVE_ALL_MESSAGES，见 summarization.ts:28 的 import），旧 memory 里没有对应概念。

### 31. core retrievers 与 document_compressors 下沉
**来源**：`langchain-core/src/retrievers/index.ts:31-61`（BaseRetrieverInput/BaseRetrieverInterface/BaseRetriever）、`langchain-core/src/retrievers/document_compressors/index.ts:7-27`
**证据**：
```ts
export abstract class BaseDocumentCompressor {
  abstract compressDocuments(documents, query, callbacks?): Promise<DocumentInterface[]>;
}
```
**可讲的知识点**：
- BaseRetriever 抽象在 core，classic 的 12 个花式 retriever（MultiQuery/Ensemble/HyDE/SelfQuery/ParentDocument 等）都继承它——抽象仍在、实现留 classic。
- BaseDocumentCompressor 已下沉 core，说明「压缩/过滤」被官方认为属于核心层。

### 32. classic retrievers 全家族
**来源**：`langchain-classic/src/retrievers/`：`contextual_compression.ts:35`、`hyde.ts:64`、`ensemble.ts:25`、`multi_vector.ts:41`、`multi_query.ts:91`、`parent_document.ts:67`、`time_weighted.ts:43`、`matryoshka_retriever.ts:68`、`score_threshold.ts:17`、`self_query/index.ts:62`、`document_compressors/chain_extract.ts:62` `LLMChainExtractor`、`document_compressors/embeddings_filter.ts:33` `EmbeddingsFilter`、`document_compressors/index.ts:59` `DocumentCompressorPipeline`
**可讲的知识点**：
- 1.x 主线 core 只有 BaseRetriever + document_compressors 抽象，这些高级检索策略无官方替代，全部留 classic。
- LLMChainExtractor 名字里带着 LLMChain——它内部依赖旧链，迁移时要手工改写成 LCEL。

### 33. vectorstores/embeddings/documents/stores 的下沉
**来源**：`langchain-core/src/vectorstores.ts:192,553,866`、`langchain-core/src/embeddings.ts:32`、`langchain-core/src/documents/document.ts`（DocumentInterface，retrievers/index.ts:7 import）、`langchain-core/src/stores.ts:6,56`
**证据**：`VectorStoreRetriever`(:192)、`export abstract class VectorStore`(:553)、`SaveableVectorStore`(:866)、`export abstract class Embeddings<`(:32)、`BaseStore<K,V>`(:6)、`InMemoryStore`(:56)
**可讲的知识点**：
- VectorStore/Embeddings/Document/Store 四大底座全部在 core，1.x 主线包直接 re-export（langchain/src/index.ts:64,69），迁移时只是换 import 来源。
- classic `vectorstores/memory.ts:142` `MemoryVectorStore extends VectorStore` 留在 classic（经典内存向量库无新版包）。

### 34. classic 顶层文件只是 re-export 空壳
**来源**：`langchain-classic/src/text_splitter.ts:1`、`load/serializable.ts:1`、`storage/in_memory.ts:1`
**证据**：
```ts
export * from "@langchain/textsplitters";      // text_splitter.ts
export * from "@langchain/core/load/serializable";  // load/serializable.ts
export { InMemoryStore } from "@langchain/core/stores";  // storage/in_memory.ts
```
**可讲的知识点**：
- text_splitter/serializable/storage 三处「旧路径」只是转发——迁移 = 改 import 语句，零代码逻辑变化。
- 这是给学员的第一课：先跑「机械替换」再处理「结构性迁移」。

### 35. classic document_loaders 与 core 的对照
**来源**：`langchain-classic/src/document_loaders/fs/directory.ts:47` `DirectoryLoader`、`fs/json.ts:11,151` `JSONLoader`/`JSONLinesLoader`、`fs/text.ts:19` `TextLoader`、`fs/multi_file.ts:25` `MultiFileLoader`；`langchain-core/src/document_loaders/base.ts`（BaseDocumentLoader，core 顶层有 document_loaders/ 目录）
**可讲的知识点**：
- fs 类 loader（TextLoader/DirectoryLoader/JSONLoader）仍是 classic 独占实现，base 抽象在 core。
- 1.x 主线包顶层无 document_loaders 目录——loader 没进新主线，是「留 classic」名单的一员。

### 36. classic 包依赖视角：与 1.x 能否并存
**来源**：`langchain-classic/package.json:120,123,131,173,199-204,216-227`
**证据**：
- devDependencies：`"@langchain/core": "workspace:^"`(:123)、`"@langchain/langgraph": "1.4.18"`(:131)、`"langchain": "workspace:*"`(:173)——classic 自身的测试代码同时引 core/langgraph/langchain 三个包。
- peerDependencies：`"@langchain/core": "workspace:^"`(:200)，cheerio/peggy/typeorm 为 optional(:201-215)。
- dependencies：`@langchain/openai`、`@langchain/textsplitters`、handlebars、js-yaml、zod(:216-225)。
**可讲的知识点**：
- classic 与新 langchain 共享同一个 `@langchain/core`：同一进程可并存，类型互通（Document/BaseMessage 等都是同一个类），这是官方设计的「混合运行」迁移路径。
- classic 不依赖新 langchain 作为运行时（仅 devDependency），说明两包运行时独立、core 是共同地基。

### 37. 经典 memory 变量协议的废弃面
**来源**：`langchain-core/src/memory.ts:6-20`、`langchain-classic/src/chains/llm_chain.ts:112-118`
**证据**：`InputValues/OutputValues/MemoryVariables` 类型仍在 core memory.ts(:6-20)，但 1.x 主线包无任何 import；LLMChain 的 `get inputKeys() { return this.prompt.inputVariables }`、`outputKey = "text"`（llm_chain.ts:108-118）。
**可讲的知识点**：
- 旧协议「inputKeys/outputKeys/memoryKeys 三元组」随 BaseChain 一起退役，1.x 是单一 messages/document 状态。
- core 保留 memory.ts 只是给 classic 供类型——「core 有不等于 1.x 推荐」是识别废弃面的方法。

### 38. initChatModel：同一 API 的两个住址
**来源**：`langchain-classic/src/chat_models/universal.ts:614,870`（`export async function initChatModel<`）、`langchain/src/chat_models/universal.ts`（新包 index.ts:23 `export { initChatModel } from "./chat_models/universal.js"`）、classic universal.ts:293 `ConfigurableModel`
**可讲的知识点**：
- initChatModel 在 classic 与新包各有一份实现（同名不同文件），新包 index.ts 直接从自身 `./chat_models/universal.js` 导出。
- 迁移时同名函数直接换包导入即可，是「精确替代」的正面教材；classic 的 `_inferModelProvider`(:240) 推断逻辑可作为对照。

---

## 第二部分 · 映射总表

| 旧 API (classic 路径) | 1.x 对应物 (新路径) | 关系 | 说明 |
|---|---|---|---|
| `chains/llm_chain.ts:89` `LLMChain` | LCEL：`prompt.pipe(llm)`；编排类 `langchain-core/src/runnables/base.ts:1944` `RunnableSequence` | 概念替代 | LLMChain 自身 JSDoc（llm_chain.ts:78-87）即示范新写法 |
| `chains/base.ts:32` `BaseChain` | `langchain-core/src/runnables/base.ts` `Runnable` 抽象 | 概念替代 | call/values 协议 → invoke/RunnableConfig 协议 |
| `chains/conversation.ts:30` `ConversationChain` | `createAgent` + LangGraph checkpointer（langgraphjs `libs/checkpoint/src/memory.ts:106` `MemorySaver`） | 概念替代 | 隐式 memory → messages 状态 + thread 持久化 |
| `chains/retrieval_qa.ts:57` `RetrievalQAChain` | `langchain-classic/src/chains/retrieval.ts:70` `createRetrievalChain`（LCEL 版）或自组 Runnable | 概念替代 | query 输入 → input + context |
| `chains/combine_docs_chain.ts:29` `StuffDocumentsChain` | `chains/combine_documents/stuff.ts:37` `createStuffDocumentsChain`（LCEL） | 概念替代 | 类 → 工厂函数 + formatDocuments 组合 |
| `combine_docs_chain.ts:131,306` `MapReduceDocumentsChain`/`RefineDocumentsChain` | core `RunnableEach`/`RunnableLambda` 自组 | 已在 classic 保留无替代 | 1.x 无同名官方类 |
| `chains/sequential_chain.ts:77` `SequentialChain` | core `runnables/base.ts:1944` `RunnableSequence` | 精确替代（语义） | 顺序编排一对一 |
| `chains/transform.ts:28` `TransformChain` | core `runnables/base.ts:2572` `RunnableLambda` | 精确替代（语义） | 自定义函数节点 |
| `chains/router/multi_route.ts:63` `MultiRouteChain` | core `runnables/branch.ts` `RunnableBranch` | 概念替代 | LLM 路由需自写分类节点 |
| `memory/buffer_memory.ts:50` `BufferMemory` | messages 数组 + `trimMessages`（langchain/src/index.ts:17）+ checkpointer | 概念替代 | getBufferString 渲染仍在 core messages |
| `memory/summary.ts:127` `ConversationSummaryMemory` | `langchain/src/agents/middleware/summarization.ts` `summarizationMiddleware` | 精确替代（语义） | 摘要提示词/保留条数/token 阈值参数化 |
| `memory/buffer_window_memory.ts:44` `BufferWindowMemory` | core messages `trimMessages` / middleware `contextEditingMiddleware`（middleware/index.ts:41-46） | 概念替代 | 滑窗裁剪 → token 计数裁剪 |
| `memory/entity_memory.ts:71` `EntityMemory` | `createAgent` 的 `stateSchema` 自定义状态 + Store（langchain/src/index.ts:64） | 概念替代 | 实体抽取需自写 middleware |
| `memory/combined_memory.ts:26` `CombinedMemory` | `stateSchema` 多字段 + 多 middleware 组合 | 概念替代 | 组合需求由状态合并取代 |
| `memory/chat_memory.ts:29` `BaseChatMemory` | `langchain-core/src/chat_history.ts:40` `BaseListChatMessageHistory` + checkpointer | 概念替代 | chatHistory 抽象仍存活于 core |
| `agents/executor.ts:352` `AgentExecutor` | `langchain/src/agents/index.ts:672` `createAgent` → `ReactAgent.ts:164` | 概念替代 | while 循环 → LangGraph 编译图（ReactAgent `#graph`，ReactAgent.ts:181） |
| `agents/initialize.ts:26` `initializeAgentExecutor` | `createAgent({ model, tools })`（langchain/src/agents/index.ts:89-106 示例） | 概念替代 | 字符串 agentType → 直接传模型+工具 |
| `agents/mrkl/index.ts:59` `ZeroShotAgent`（ReAct） | `createAgent`（内部即 ReAct，ReactAgent 类名） | 概念替代 | 文本协议 → 原生 tool_calls |
| `agents/openai_functions/index.ts:98` `OpenAIAgent`、`agents/xml/index.ts:38` `XMLAgent` | 无对应物；统一走 tool-calling | 已在 classic 保留无替代 | 旧协议 agent 全部废弃 |
| `agents/structured_chat/outputParser.ts:19` 等输出解析器 | 无对应物（模型原生 tool_calls 免解析） | 已在 classic 保留无替代 | AgentAction/AgentFinish 协议退役 |
| `agents/executor.ts:384-390` `handleParsingErrors/handleToolRuntimeErrors` | middleware：`toolErrorMiddleware`、`toolRetryMiddleware`（middleware/index.ts:68-76） | 精确替代（语义） | 单开关 → 可组合 middleware |
| `agents/executor.ts:367` `maxIterations` | LangGraph recursionLimit + `toolCallLimitMiddleware`（middleware/index.ts:47-51） | 概念替代 | 迭代上限细化为工具级+图级两层 |
| `agents/toolkits/sql/sql.ts:37` `SqlToolkit` 等 | 无对应物，tools 列表直传 `createAgent` | 已在 classic 保留无替代 | SqlDatabaseChain/SqlToolkit 依赖 classic sql_db |
| `output_parsers/structured.ts:30` `StructuredOutputParser` | core `output_parsers/structured.ts:34` 同名类 + `createAgent` 的 `responseFormat`（agents/index.ts:81） | 精确替代 | 解析器仍可用；新结构化输出走 responseFormat |
| `output_parsers/openai_tools.ts:33,110` `JsonOutputToolsParser` | core `output_parsers/openai_tools/json_output_tools_parsers.ts:124,243` 同名类 | 精确替代 | 原样下沉 core |
| `retrievers/multi_query.ts:91` `MultiQueryRetriever` 等 12 个 retriever | 无官方替代（抽象 `BaseRetriever` 在 core retrievers/index.ts） | 已在 classic 保留无替代 | RAG 策略实现留 classic，可自行迁移为 Runnable |
| `retrievers/document_compressors/chain_extract.ts:62` `LLMChainExtractor` | core `retrievers/document_compressors/index.ts:7` `BaseDocumentCompressor` 基类保留 | 概念替代（基类） | 具体压缩器需用 LCEL 重写 |
| `vectorstores/memory.ts:142` `MemoryVectorStore` | 抽象 `VectorStore` 在 core vectorstores.ts:553；实现留 classic | 已在 classic 保留无替代 | 具体向量库在各自集成包 |
| `storage/in_memory.ts:1` `InMemoryStore` | core `stores.ts:56` `InMemoryStore` | 精确替代 | 纯 re-export，改 import 即可 |
| `text_splitter.ts:1` | `@langchain/textsplitters` 包 | 精确替代 | classic 文件仅一行转发 |
| `chat_models/universal.ts:614` `initChatModel` | `langchain/src/chat_models/universal.ts` `initChatModel`（langchain/src/index.ts:23） | 精确替代 | 同名同签名，换包导入 |
| `chains/openai_moderation.ts:56` `OpenAIModerationChain` | `openAIModerationMiddleware`（middleware/index.ts:98-101） | 概念替代 | chain 校验 → agent 前置 middleware |
| `experimental/`（autogpt/babyagi/plan_and_execute） | 无对应物 | 已在 classic 保留无替代 | 自主 agent 实验由 LangGraph 手工搭图取代 |
| `load/index.ts:17` `load()` 序列化 | core `@langchain/core/load`（classic load/index.ts:1 import） | 概念替代 | classic 版仅是带 importMap 的包装 |
| —（无旧 API） | `createMiddleware`（langchain/src/agents/index.ts:719）+ 20+ 预置 middleware | 1.x 全新能力 | 旧架构无等价物，迁移课必须新增章节 |

---

## 第三部分 · 阶段与课程清单建议

**阶段一 · 两代架构世界观差异（原理重课为主）**

- L01 从「Chain 王国」到「Runnable + Graph」：两代架构总览与 classic 包定位 — 用 30 个顶级目录与 1.x 顶层 8 目录做对比地图 | 源码依据：langchain-classic/src 目录列表；langchain/src/index.ts:1-79 | kind: theory | ★
- L02 BaseChain 的 call/values 协议解剖：为什么它必须被淘汰 — LLMChain 的 prompt/llm/outputParser 三字段与隐式 memory | 源码依据：langchain-classic/src/chains/llm_chain.ts:89-200；chains/base.ts:32 | kind: theory | ★
- L03 memory 的隐式读写协议：loadMemoryVariables/saveContext — 旧对话状态藏在 chain 对象里 | 源码依据：langchain-core/src/memory.ts:28-54；langchain-classic/src/memory/buffer_memory.ts:50-96 | kind: theory | ★
- L04 新世界观：Agent 即 LangGraph 编译图 — createAgent 返回 ReactAgent、内部 #graph、13 个重载只围着 responseFormat 转 | 源码依据：langchain/src/agents/index.ts:672-702；ReactAgent.ts:164-188 | kind: theory | ★
- L05 持久化地基换代：BaseChatMessageHistory → BaseCheckpointSaver/MemorySaver — 从「追加消息」到「图状态版本快照」 | 源码依据：langchain-core/src/chat_history.ts:10-40；langgraphjs libs/checkpoint/src/base.ts:180-239 | kind: theory | ★

**阶段二 · 逐项 API 映射（对照实操课）**

- L06 Chain 族迁移总表走查（上）：LLMChain/SequentialChain/TransformChain → LCEL 三原语 — RunnableSequence/RunnableLambda/RunnableBranch 一对一改写 | 源码依据：langchain-classic/src/chains/sequential_chain.ts:77；langchain-core/src/runnables/base.ts:1944,2572 | kind: practice
- L07 Chain 族迁移走查（下）：RetrievalQA/Stuff/MapReduce/Refine 与路由链 — createRetrievalChain/createStuffDocumentsChain 的 LCEL 化与无替代项 | 源码依据：langchain-classic/src/chains/retrieval_qa.ts:57-117；chains/combine_docs_chain.ts:29,131,306；chains/retrieval.ts:70-80 | kind: practice
- L08 Memory 族迁移：BufferMemory/WindowMemory/TokenBuffer → messages + trimMessages — 显式消息列表取代 memoryKey 变量 | 源码依据：langchain-classic/src/memory/buffer_memory.ts:80-96；langchain/src/index.ts:16-17；langchain-core/src/messages/modifier.ts:22 | kind: practice
- L09 ConversationSummaryMemory → summarizationMiddleware — 摘要提示词、DEFAULT_MESSAGES_TO_KEEP=20、token 触发阈值逐参数对照 | 源码依据：langchain-classic/src/memory/summary.ts:127；langchain/src/agents/middleware/summarization.ts:36-68 | kind: practice | ★
- L10 EntityMemory/CombinedMemory/VectorStoreRetrieverMemory 的 1.x 化身 — stateSchema 自定义状态、InMemoryStore、自写 middleware | 源码依据：langchain-classic/src/memory/entity_memory.ts:71；combined_memory.ts:26；vector_store.ts:65；langchain/src/index.ts:64 | kind: practice
- L11 AgentExecutor → createAgent：主循环与构造参数映射 — agent/tools/maxIterations/returnIntermediateSteps/handleParsingErrors 逐项找新家 | 源码依据：langchain-classic/src/agents/executor.ts:352-398；langchain/src/agents/index.ts:76-106 | kind: practice | ★
- L12 旧 Agent 协议族退役现场：ZeroShot/Chat/StructuredChat/OpenAIAgent/XMLAgent — 为什么输出解析器层整体消失 | 源码依据：langchain-classic/src/agents/mrkl/index.ts:59；openai_functions/index.ts:98；xml/index.ts:38；langchain/src/agents/index.ts:54 | kind: framework
- L13 Toolkits 与垂类链的去向：SqlToolkit/SqlDatabaseChain/GraphCypherQAChain — 拆工具传 tools、或整体留 classic | 源码依据：langchain-classic/src/agents/toolkits/sql/sql.ts:37；chains/sql_db/sql_db_chain.ts:68；chains/graph_qa/cypher.ts:65 | kind: framework
- L14 Executor 开关 → middleware 生态全景 — toolError/toolRetry/toolCallLimit/modelFallback/modelRouter/hitl 等 20+ middleware 清单式走读 | 源码依据：langchain/src/agents/middleware/index.ts:1-126 | kind: framework
- L15 结构化输出换代：StructuredOutputParser/JsonOutputParser → responseFormat + toolStrategy/providerStrategy — 解析器与策略双轨 | 源码依据：langchain-classic/src/output_parsers/structured.ts:30；langchain-core/src/output_parsers/structured.ts:34；langchain/src/agents/index.ts:710-718 | kind: practice | ★
- L16 Prompt 与 OutputParser 的「搬家课」：core 里的原样同名类 — 哪些只需改 import、classic prompts 入口报错史 | 源码依据：langchain-classic/src/prompts/index.ts:1-7；langchain-core/src/prompts/prompt.ts:113；chat.ts:924；output_parsers/string.ts:22 | kind: practice
- L17 检索层迁移：BaseRetriever/BaseDocumentCompressor 下沉、12 个花式 retriever 留守 — 哪些 RAG 策略要自研 LCEL 版 | 源码依据：langchain-core/src/retrievers/index.ts:31-61；retrievers/document_compressors/index.ts:7-27；langchain-classic/src/retrievers/multi_query.ts:91；self_query/index.ts:62 | kind: framework
- L18 底座层迁移：VectorStore/Embeddings/Document/Store/initChatModel — 纯换包名清单 + 同名陷阱（classic createReactAgent ≠ createAgent） | 源码依据：langchain-core/src/vectorstores.ts:553；embeddings.ts:32；stores.ts:56；langchain-classic/src/agents/index.ts:96-99；chat_models/universal.ts:614 | kind: practice

**阶段三 · 完整应用迁移走查**

- L19 双包并存与混合运行策略：classic 与 langchain 1.x 同进程协作 — 共享 @langchain/core 的类型互通、依赖树取证 | 源码依据：langchain-classic/package.json:123,131,173,199-204；langchain/package.json:77 | kind: theory
- L20 实战走查①：RAG 问答应用迁移（RetrievalQAChain + BufferMemory → LCEL + checkpointer） — 逐文件改写示范 | 源码依据：langchain-classic/src/chains/retrieval_qa.ts:57-117；langgraphjs libs/checkpoint/src/memory.ts:106 | kind: practice
- L21 实战走查②：对话助手迁移（ConversationChain → createAgent + summarizationMiddleware + MemorySaver） — thread 模型取代 sessionId | 源码依据：langchain-classic/src/chains/conversation.ts:30-53；langchain/src/agents/middleware/summarization.ts:36-68 | kind: practice | ★
- L22 实战走查③：工具调用 Agent 迁移（AgentExecutor + ZeroShotAgent + handleParsingErrors → createAgent + toolError/toolRetry middleware） | 源码依据：langchain-classic/src/agents/executor.ts:352-398；langchain/src/agents/middleware/index.ts:68-76 | kind: practice
- L23 留守清单与迁移终局：无替代 API 的长期共存方案 — experimental/垂类链/花式 retriever 的决策树 + classic 入口警告与空壳文件盘点 | 源码依据：langchain-classic/src/index.ts:1-3；prompts/index.ts:1-7；text_splitter.ts:1；storage/in_memory.ts:1 | kind: framework

（共 23 课：theory 6 / practice 11 / framework 6，含 ★ 原理重课 7 节）
