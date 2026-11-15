# 03 · 模块一~三 源码证据台账

> 仓库：langchainjs @ commit `7704471213953c590c50deaa0ae8e9a34b66003d`（7704471）
> 所有行号均来自实际读取的源码文件；路径相对仓库根目录。
> 日期：2026-11-15

---

## 第一部分 · 证据条目

### E01 三包版本与依赖方向
来源：libs/langchain/package.json:2,76-81,73-75；libs/langchain-core/package.json:2,17-25；libs/langchain-classic/package.json:2,199-200,216-225
证据：
- `libs/langchain/package.json:2` → `"name": "langchain", "version": "1.6.6"`；:77-80 dependencies 仅 `@langchain/langgraph ^1.6.1`、`@langchain/langgraph-checkpoint ^1.1.5`、`langsmith`、`zod`；:73-74 `"peerDependencies": { "@langchain/core": "workspace:^" }`
- `libs/langchain-core/package.json:2` → `"@langchain/core", "1.4.1"`；:17-25 dependencies：`@cfworker/json-schema`、`@standard-schema/spec`、`js-tiktoken`、`langsmith`、`mustache`、`p-queue`、`zod ^4.6.6`（core 无任何 @langchain 依赖，是真正的零依赖底座）
- `libs/langchain-classic/package.json:2` → `"@langchain/classic", "1.0.61"`，description "Old abstractions from LangChain.js"；:199-200 peerDep `@langchain/core`；:217-218 dependencies 含 `@langchain/openai`、`@langchain/textsplitters`
可讲的知识点：
1. 依赖方向是单向的：classic → core、langchain → core，core 不依赖任何人；
2. langchain 1.x 主包的运行时底座已换成 langgraph（agents 建在其上），core 通过 peerDep 引入；
3. 三个包的版本号各自独立演进（1.6.6 / 1.4.1 / 1.0.61），classic 是 0.x 时代抽象的"博物馆"；
4. core 的运行时依赖表本身就是知识点：zod v4、mustache（模板）、p-queue（并发）、js-tiktoken（计数）。

### E02 langchain 主包顶层导出面
来源：libs/langchain/src/index.ts:4-18,23,28-44,49,54-59,64,69,74-78
证据：导出分组——messages 一组（`BaseMessage/AIMessage/SystemMessage/HumanMessage/ToolMessage` + 各 Chunk + `filterMessages/trimMessages`，均从 `@langchain/core/messages` 再导出）；`initChatModel`（./chat_models/universal.js）；`tool` + HeadlessTool 三类型（./tools/headless.js）；core 工具原语 `Tool/DynamicTool/StructuredTool/DynamicStructuredTool/ToolRuntime`；`context`；`export * from "./agents/index.js"` 与 middleware；`InMemoryStore`、`Document`、测试工具 `fakeModel/langchainMatchers`
可讲的知识点：
1. 主包导出面 = core 原语子集 + agents 全家桶 + 少量新增（headless tool），几乎没有自己的独立实现；
2. `initChatModel` 是主包唯一直属的 chat_models 代码；
3. 从导出面即可讲清 1.x 的产品重心转移：agents/middleware 占据导出大头。

### E03 BaseMessage 基类：字段、role 与品牌 symbol
来源：libs/langchain-core/src/messages/base.ts:69-88,215-311,364-376
证据：`BaseMessageFields` 含 `id/name/content/contentBlocks/additional_kwargs(已标注 deprecated 的 tool_calls、function_call)/response_metadata`；类声明 `export abstract class BaseMessage<TStructure, TRole> extends Serializable implements Message`（:215-220），`readonly [MESSAGE_SYMBOL] = true`（:234，symbol 定义在 :21 `Symbol.for("langchain.message")`），`abstract readonly type: TRole`（:236）；构造函数支持「裸 string / 数组 / fields 对象」三态（:276-284）；跨包安全判型 `static isInstance` 检查 symbol + `static [Symbol.hasInstance]` 覆写（:364-376）
可讲的知识点：
1. role 由泛型 `TRole extends MessageType` 承担，子类用 `readonly type = "ai" as const` 固定；
2. `Symbol.for` 注册的全局 symbol 让 instanceof 判型跨 realms（多份 core 实例）依然成立——这是 ESM 多实例现实问题的工程解法；
3. `additional_kwargs.tool_calls` 已被弃用，规范位置上移到 AIMessage 顶层字段。

### E04 content 与 contentBlocks：多 provider 翻译管线
来源：libs/langchain-core/src/messages/base.ts:313-339；libs/langchain-core/src/messages/ai.ts:195-233
证据：`get text()`（base.ts:314-322）过滤 `type === "text"` 的 block 后拼接；`get contentBlocks()`（base.ts:324-339）先归一化 string→`[{type:"text",text}]`，再依次过三个翻译步骤 `convertToV1FromDataContent → convertToV1FromChatCompletionsInput → convertToV1FromAnthropicInput`（:329-333）；AIMessage 覆写版（ai.ts:195-233）优先响应 `output_version === "v1"`，其次按 `response_metadata.model_provider` 找 translator（ai.ts:209-213），最后把不在 blocks 里的 tool_calls 补成 `{type:"tool_call",id,name,args}`（ai.ts:217-230）
可讲的知识点：
1. v1 内容模型（content blocks）与 v0 内容模型（provider 原始 content）是并存的两轨，`output_version` 是切换开关；
2. "翻译器按 provider 注册" 是适配层模式：model_provider 元数据驱动惰性翻译，不翻译则拿原始 payload；
3. tool_calls 与 tool_call block 双向补齐（构造时 ai.ts:133-177 会互相同步），可讲一致性问题。

### E05 BaseMessageChunk 与 concat 的合并规则
来源：libs/langchain-core/src/messages/base.ts:446-450,470-547,634-666,709-733；libs/langchain-core/src/messages/ai.ts:477-530
证据：`DEFAULT_MERGE_IGNORE_KEYS = ["index","created","timestamp"]`（base.ts:446-450）；`_mergeDicts` 对字符串默认 `+=` 但 `type` 不合并、`id/name/output_version/model_provider` 取后值（base.ts:511-527）；`_mergeLists` 用 `_findMergeTarget` 按 `index` 优先、`id` 兜底匹配增量（base.ts:602-632），并特判 Anthropic `input_json_delta` 续接 `tool_use`（:572-574,583-588）；`BaseMessageChunk` 只有 `abstract concat()`（:713）；AIMessageChunk.concat 走 `tool_call_chunks` 合并 + 惰性 tool_calls（ai.ts:488-518）
可讲的知识点：
1. 流式聚合 = 一套精心设计的"字典/列表合并 DSL"，规则表值得逐行讲；
2. index/id 匹配是并行 tool call 流还原的关键；字符串 args 的拼接在 chunk 层而非模型层完成；
3. provider 差异（如 Anthropic 的 delta 块类型）直接编码在通用合并逻辑里——讲技术债与扩展性的好素材。

### E06 HumanMessage / SystemMessage：role 语义与差异
来源：libs/langchain-core/src/messages/human.ts:18-42,65-79；libs/langchain-core/src/messages/system.ts:18-77
证据：`HumanMessage` 是全库最薄的消息类——只声明 `readonly type = "human" as const` 与构造透传（human.ts:18-33）；`HumanMessageChunk.concat` 用 `mergeContent + _mergeDicts`（:65-79）；`SystemMessage.concat` 额外支持直接拼 string 且不走 `_mergeDicts` 而是 `{...a,...b}` 浅合并（system.ts:40-68）
可讲的知识点：
1. role 就是类本身，"human/system/ai/tool/remove" 与消息类一一对应；
2. SystemMessage 对 concat 的特殊处理（可直接接字符串）说明系统消息通常单条存在、无需增量合并语义；
3. 最薄类背后是泛型基类承载全部逻辑——讲继承设计的范例。

### E07 ToolMessage：tool_call_id / artifact / status 三字段
来源：libs/langchain-core/src/messages/tool.ts:13-28,37-48,53-118,192-209
证据：`ToolMessageFields` 含 `artifact?: any`（注释："Artifact of the Tool execution which is not meant to be sent to the model"，:16-25）、`tool_call_id: string`、`status?: "success" | "error"`、`metadata`（:13-28）；`DirectToolOutput` 接口 `lc_direct_tool_output: true`（:37-48）——工具可直接返回 ToolMessage 而不被强制字符串化；构造函数双签名（fields 或 fields+tool_call_id+name，:90-96）；`ToolMessageChunk.concat` 中 `status` 用 `_mergeStatus`（error 优先，:204-208）；artifact 用 `_mergeObj`（:204）
可讲的知识点：
1. `artifact` 是"给程序看、不给模型看"的双通道输出设计；
2. `status` 是错误传递约定：工具失败不必抛异常，可包装为 error 状态的 ToolMessage；
3. `lc_direct_tool_output` 标记位让工具返回值穿透 agent 循环，直接成为消息。

### E08 AIMessage：tool_calls 与 invalid_tool_calls 的双轨
来源：libs/langchain-core/src/messages/ai.ts:38-44,46-189；libs/langchain-core/src/messages/tool.ts:228-246,313-367
证据：`AIMessage` 字段 `tool_calls?: ToolCall[]`、`invalid_tool_calls?: InvalidToolCall[]`、`usage_metadata`（ai.ts:52-56）；构造时若只有 `additional_kwargs.tool_calls`（OpenAI 原始形态）则先打印升级警告再 `defaultToolCallParser` 解析（ai.ts:81-107）；`defaultToolCallParser`（tool.ts:338-367）对每个 raw call 做 `JSON.parse(toolCall.function.arguments)`，失败进 invalid 桶标 `"Malformed args."`；`ToolCall` 结构 `{type?:"tool_call", id?, name, args}`（tool.ts:228-246）
可讲的知识点：
1. tool_calls（已解析）/ invalid_tool_calls（JSON.parse 失败保底）双轨是健壮性设计：模型幻觉出非法 JSON 时不至于崩；
2. 旧 OpenAI 格式 `function:{name,arguments}` → 新格式 `{name,args}` 的迁移逻辑在构造函数里完成；
3. `ToolCall.id` 是把 AIMessage 与后续 ToolMessage 串起来的链路键。

### E09 AIMessageChunk：tool_call_chunks 懒折叠
来源：libs/langchain-core/src/messages/ai.ts:286-406,371-406
证据：`AIMessageChunk` 字段 `tool_call_chunks?: ToolCallChunk[]`（ai.ts:308）；注释："Lazily collapses tool_call_chunks into tool_calls / invalid_tool_calls on first read"（:371-375）；`_defineLazyToolCallGetters`（:376-406）用 `Object.defineProperty` 在实例（含 `lc_kwargs`）上定义 getter/setter，首次读取才 `collapseToolCallChunks`，写入则替换 getter 恢复普通赋值
可讲的知识点：
1. 每个流式 delta 一个 chunk 时，反复全量折叠是 O(n²)——懒 getter 是真实存在的性能工程；
2. 用 defineProperty 而非原型 accessor 是为了 `Object.entries`/spread 序列化兼容（注释里明说）；
3. `ToolCallChunk` 的 args 是"JSON 子串"（tool.ts:293-311），与最终 `ToolCall.args`（对象）的差距就是 `collapseToolCallChunks`。

### E10 ContentBlock v1 标准块类型集
来源：libs/langchain-core/src/messages/content/index.ts:19-25,75-169
证据：`KNOWN_BLOCK_TYPES = ["text","reasoning","refusal", ...KNOWN_TOOL_BLOCK_TYPES, ...KNOWN_MULTIMODAL_BLOCK_TYPES]`（:19-25）；`ContentBlock.Standard = Text | Reasoning | Refusal | NonStandard | Tools.Standard | Multimodal.Standard`（:163-169）；`Text` 块带 `index`（流式聚合用）与 `annotations: Array<Citation | BaseContentBlock>`（:75-92）；`Reasoning` 块注明常解析自 `<think>` 标签（:97-113）；`Refusal` 块注明 provider 以成功响应返回的安全拒答，需与空答案区分（:115-136）；`NonStandard` 块兜底 provider 专属数据（:138-157）
可讲的知识点：
1. v1 内容模型的统一话语：文本/推理/拒答/工具/多模态五族 + NonStandard 逃生舱；
2. `index` 字段是为流式聚合服务的——block 级流的还原键；
3. Refusal 块的存在说明"拒答是数据不是异常"。

### E11 BaseChatModel：invoke 入口与 generatePrompt
来源：libs/langchain-core/src/language_models/chat_models.ts:220-252,287-300；libs/langchain-core/src/language_models/base.ts:440-481
证据：`export abstract class BaseChatModel<CallOptions, OutputMessageType extends BaseMessageChunk = AIMessageChunk> extends BaseLanguageModel`（chat_models.ts:220-224）；`disableStreaming = false`、`outputVersion` 字段默认 "v0" 且可被环境变量 `LC_OUTPUT_VERSION` 覆盖（:236-252）；`invoke()` 实现：`_convertInputToPromptValue(input)` → `generatePrompt([promptValue], options, callbacks)` → 取 `result.generations[0][0] as ChatGeneration` → 返回 `chatGeneration.message`（:287-300）；`BaseLanguageModel` 构造处理 cache：对象用之，true 用 `InMemoryCache.global()`（base.ts:471-481）
可讲的知识点：
1. invoke 并不直接调模型，而是经由 generatePrompt/generation 体系——讲"消息 → PromptValue → Generation"的中间表示链；
2. 流式开关与输出版本都是实例级配置 + 环境变量兜底；
3. 输出类型泛型默认 `AIMessageChunk`，说明流式 chunk 就是 invoke 的返回基线。

### E12 BaseChatModel 的流式三件套：_streamResponseChunks / _streamChatModelEvents / _streamIterator
来源：libs/langchain-core/src/language_models/chat_models.ts:302-345,504-593
证据：`_streamResponseChunks` 默认 `throw new Error("Not implemented.")`（:302-309）——provider 子类必须覆写才能流式；`_streamChatModelEvents` 默认从 legacy chunks 桥接 `yield* convertChunksToEvents(chunks, {signal})`（:337-345）；注释给出事件生命周期图 `MessageStart → ContentBlockStart → ContentBlockDelta* → ContentBlockFinish → MessageFinish`（:318-326）；`_streamIterator` 判断「子类未覆写 _streamResponseChunks 或 disableStreaming」则退化为 `yield this.invoke(input, options)`（:508-514），否则边流边 `generationChunk = generationChunk.concat(chunk)` 聚合、无 id 时以 `run-${runId}` 补 id（:555-583）
可讲的知识点：
1. 流式能力是"覆写即获得"：不覆写则 stream 自动降级为 invoke 单发——优雅降级的教科书实现；
2. 两代流协议并存：ChatGenerationChunk（chunk 流）与 ChatModelStreamEvent（块级事件流），桥接层可对照讲演进；
3. 流式聚合发生在框架侧而非用户侧，`concat` 是 E05 合并规则的落点。

### E13 ChatModelStream：新一代流式门面
来源：libs/langchain-core/src/language_models/chat_models.ts:416-492；libs/langchain-core/src/language_models/stream.ts:571-615；libs/langchain-core/src/language_models/event.ts:47-221
证据：`streamEvents()` 无 version 参数时构造 `_streamChatModelEvents` 生成器并包成 `new ChatModelStream(generator)`（chat_models.ts:460-492）；带 `version:"v1"|"v2"` 则退回 `super.streamEvents` 的回调式追踪事件（:473-482）；`ChatModelStream` 提供四个子流访问器 `get text/toolCalls/reasoning/usage`（stream.ts:603-615）且自身可 `await` 出完整 AIMessage（chat_models.ts:432-458 文档示例）；事件类型：`MessageStartEvent/ContentBlockStartEvent/ContentBlockDeltaEvent/MessageFinishEvent`，delta 族 `text-delta/reasoning-delta/data-delta/tool-call-delta/block-delta`（event.ts:47-155）
可讲的知识点：
1. 一个流对象既可整体 await（最终消息）又可分维度订阅（text/toolCalls/…）——门面 + 多视图模式；
2. 事件形态对标 Anthropic 的块级事件协议，OpenAI 风格 token 流被 `convertChunksToEvents` 合成出生命周期；
3. streamEvents 旧版（v1/v2 StreamEvent）与新版的语义差异，是"回调世界 → 迭代器世界"迁移的实例。

### E14 bindTools 与 withStructuredOutput 的基类实现
来源：libs/langchain-core/src/language_models/chat_models.ts:268-279,1211-1338
证据：`bindTools?(tools: BindToolsInput[], kwargs?: Partial<CallOptions>): Runnable<BaseLanguageModelInput, OutputMessageType, CallOptions>` 是可选方法（:276-279）——core 不强制实现；`withStructuredOutput` 在基类有默认实现：`if (typeof this.bindTools !== "function") throw new Error('Chat model must implement ".bindTools()" to use withStructuredOutput.')`（:1290-1292），且仅支持 `method:"functionCalling"`（:1309）；内部 `bindTools(tools)` 组装 `assembleStructuredOutputPipeline`（:69,1338）
可讲的知识点：
1. core 用"可选方法 + 运行时检查"表达能力协议：结构化输出建立在工具调用之上；
2. 依赖方向：withStructuredOutput → bindTools → provider 实现——讲能力组合而非继承；
3. 可对照 provider 包（如 anthropic/openai）讲各自的覆写。

### E15 BaseLLM 与 BaseChatModel 的分野
来源：libs/langchain-core/src/language_models/llms.ts:38,569
证据：`export abstract class BaseLLM<...>`（llms.ts:38）与抽象 `_call`（:569）独立成文件；chat_models.ts:222 还有注释 `// TODO: Fix the parameter order on the next minor version.` 暗示两个泛型参数顺序的历史包袱
可讲的知识点：
1. BaseLLM（补全式）/BaseChatModel（对话式）平行存在，1.x 生态几乎全用后者；
2. 源码注释本身是考古证据：API 设计的遗留决策如何被注释标记；
3. llms.ts 仍被维护但导出面在主包已消失（E02 可交叉验证）。

### E16 StructuredTool：schema 校验与 invoke/call 链
来源：libs/langchain-core/src/tools/index.ts:95-209,222-272
证据：`export abstract class StructuredTool<SchemaT,...> extends BaseLangChain`，abstract 字段 `name/description/schema`，`returnDirect = false`、`responseFormat = "content"`、`extras`（:95-150）；`invoke()`（:175-209）：若输入是 ToolCall 则取 `input.args` 并把整个 call 挂到 `enrichedConfig.toolCall`；`call()`（:222-272）做双路径校验：`isInteropZodSchema(this.schema)` 走 `interopParseAsync`（失败抛 `ToolInputParsingException`），否则走 `@cfworker/json-schema` 的 `validate()`（:254-272）；`_call` 返回值可为 `AsyncGenerator<ToolEventT, ToolOutputT>`（:163-167，工具可流式）
可讲的知识点：
1. 工具输入校验是双引擎：Zod（v3/v4 interop）或 JSON Schema——同一抽象容纳两种生态；
2. ToolCall 输入与裸输入在 invoke 处分叉，toolCall 进 config 供 runtime 读取（呼应 E17）；
3. `_call` 支持 AsyncGenerator：工具执行也能产出事件流。

### E17 tool() 构造器：重载矩阵与 ToolRuntime 注入
来源：libs/langchain-core/src/tools/index.ts:596-633,652-872+；libs/langchain-core/src/tools/types.ts:541-581
证据：`ToolWrapperParams` = `{name, description?, schema?, responseFormat?, returnDirect?}`（index.ts:596-633）；`tool()` 的实现签名矩阵覆盖 `ZodStringV3/V4`（→DynamicTool）、`ZodObjectV3/V4`（→DynamicStructuredTool）、`JSONSchema`、以及一组「func 第二参为 `runtime: ToolRuntime<TState,TContext>`」的重载（index.ts:777-824）；`ToolRuntime = RunnableConfig & { state, toolCallId, toolCall?, config, context, store, writer }`（types.ts:541-581），注释明确"无需 Annotated 包装，直接用 `runtime: ToolRuntime` 形参注入"（types.ts:477-501）
可讲的知识点：
1. tool() 是"按 schema 形状分派实现"的函数重载展示柜：string schema→DynamicTool，object schema→StructuredTool；
2. 第二参数形态（有无 ToolRuntime）决定是否接入 agent 状态/context/writer——工具与 agent 运行时的桥梁；
3. returnDirect 语义：返回值直接终结 agent 循环（index.ts:626-632 注释）。

### E18 工具类家族：DynamicTool / DynamicStructuredTool / BaseToolkit
来源：libs/langchain-core/src/tools/index.ts:560-574,581-587,535-545(区域)
证据：`BaseToolkit` 仅约束 `abstract tools: StructuredToolInterface[]` 与 `getTools()`（:581-587）；`DynamicStructuredTool._call` 直接 `return this.func(arg, runManager, parentConfig)`（:560-573）；`isLangChainTool/isRunnableToolLike/isStructuredTool` 等判型从 types.js 再导出（:83-89）
可讲的知识点：
1. Toolkit 是"工具集合"的最小抽象，实际集合在各自 provider 包实现；
2. DynamicTool/DynamicStructuredTool 是把函数提升为一等工具的胶水类；
3. `isRunnableToolLike` 暗示第三种工具形态：RunnableToolLike（runnables/base.ts 附近定义），工具与 Runnable 互通。

### E19 PromptTemplate：f-string/mustache 双模板与类型级参数提取
来源：libs/langchain-core/src/prompts/prompt.ts:24-54,75-96,113-166,177-184,216-275
证据：`PromptTemplateInput` 含 `template/templateFormat("f-string"|"mustache")/validateTemplate`（:24-54）；构造时 mustache 强制 `validateTemplate=false`（"Mustache templates cannot be validated."，:141-153）；类型级黑科技 `ExtractTemplateParamsRecursive<T>` 用模板字面量递归提取 `{var}`（:75-82），`fromTemplate` 返回 `PromptTemplate<ExtractedFStringParams<T, RunInput>>`（:216-275，inputVariables 由 `parseTemplate` 运行时提取，:260-270）；`format()` = `mergePartialAndUserVariables(values)` + `renderTemplate`（:177-184）
可讲的知识点：
1. 编译期从字符串模板推 inputVariables 类型、运行时用同一解析器推值——TS 类型体操有真实用途；
2. mustache 不校验的原因（无变量清单语义）可作为模板引擎差异的切入点；
3. partialVariables 支持函数（异步 partial），见 prompts/base.ts:112-118。

### E20 BasePromptTemplate 本身是 Runnable
来源：libs/langchain-core/src/prompts/base.ts:48-57,95-147,160-174
证据：`export abstract class BasePromptTemplate<RunInput, RunOutput, PartialVariableName> extends Runnable<RunInput, RunOutput>`（:48-56）；`invoke()` 走 `this._callWithConfig((input) => this.formatPromptValue(input), input, { runType: "prompt" })`（:133-147）；构造禁止 inputVariables 出现 `"stop"`（:87-91，因 stop 被内部占用）；抽象面 `format/formatPromptValue/_getPromptType/partial`
可讲的知识点：
1. Prompt 是 Runnable → 可直接 pipe 进模型，链式组合无特殊通道；
2. `runType:"prompt"` 与 model/chain/tool 一样是回调系统的一等公民；
3. "stop 保留字"这类防御式设计值得在课上点出。

### E21 ChatPromptTemplate.fromMessages 与消息级模板
来源：libs/langchain-core/src/prompts/chat.ts:924-949,1190-1216；libs/langchain-core/src/prompts/few_shot.ts:106-121
证据：`ChatPromptTemplate` 持有 `promptMessages: Array<BaseMessagePromptTemplate | BaseMessage>`（:943）；`fromMessages` 会展平嵌套的 ChatPromptTemplate 并逐条 `_coerceMessagePromptTemplateLike`（:1190-1216）；`FewShotPromptTemplate` 字段 `examples/exampleSelector/examplePrompt/suffix/exampleSeparator`，且 `lc_serializable = false`（few_shot.ts:106-121）
可讲的知识点：
1. ChatPrompt 是"消息模板的列表"，每条消息各自模板化后组装成 Message[]——prompt→messages 的桥梁；
2. FewShot 既可静态 examples 也可动态 exampleSelector（检索式 few-shot）；
3. FewShotPromptTemplate 明确不可序列化（lc_serializable=false），可讲为什么（exampleSelector 含运行时状态）。

### E22 Output Parser 双层体系与 OutputParserException
来源：libs/langchain-core/src/output_parsers/base.ts:19-100,105-150,170-198；libs/langchain-core/src/output_parsers/structured.ts:34-56,121-143
证据：`BaseLLMOutputParser<T> extends Runnable<string|BaseMessage, T>` 定义 abstract `parseResult(generations)`（:19-34）；`invoke` 按 string/BaseMessage 输入分别构造 Generation 后仍走 `parseResult`，`runType:"parser"`（:72-99）；`BaseOutputParser` 在其上加 `parse(text)` 与 `getFormatInstructions()`（:105-142）；`OutputParserException` 携带 `llmOutput/observation/sendToLLM` 并打 `OUTPUT_PARSING_FAILURE` 错误码（:170-197）；`StructuredOutputParser.fromZodSchema` 生成 schema 说明文案并在 parse 中先做 JSON 转义修复再 `interopParseAsync`（structured.ts:56,121-143）
可讲的知识点：
1. parser 也是 Runnable（string|BaseMessage 进），所以 parser 能 pipe 在模型后；
2. parseResult（面向 generations）与 parse（面向文本）的分层映射；
3. OutputParserException 的 observation/sendToLLM 是"错误喂回模型重试"的老 agent 模式遗存。

### E23 Runnable 抽象类：invoke/batch/stream/transform 四大支柱
来源：libs/langchain-core/src/runnables/base.ts:121-149,244-290,298-324,656-672
证据：类注释 "A Runnable is a generic unit of work that can be invoked, batched, streamed, and/or transformed"（:121-124）；`abstract invoke(input, options?): Promise<RunOutput>`（:146-149）；默认 `batch` 用 `AsyncCaller({maxConcurrency})` 并发跑 N 次 invoke，`batchOptions.returnExceptions` 决定错误入数组还是抛出（:244-290）；默认 `_streamIterator` 就是 `yield this.invoke(input, options)`（:298-303）；默认 `transform` 缓冲全部输入 chunk（`_concatOutputChunks` 尽力拼接）再一次性流出（:656-672）；`stream()` 用 `AsyncGeneratorWithSetup` 预取首块以便立即抛错（:311-324）
可讲的知识点：
1. 四个能力互为降级来源：stream←invoke、transform←stream，覆盖点全在子类；
2. batch 的 maxConcurrency 与 returnExceptions 语义；
3. stream 先缓冲首 chunk 的原因：把错误提前到调用点而不是消费点。

### E24 pipe 与 RunnableSequence 的扁平化
来源：libs/langchain-core/src/runnables/base.ts:610-647,1944-2040,2222-2278
证据：`Runnable.pipe(coerceable)` = `new RunnableSequence({first: this, last: _coerceToRunnable(coerceable)})`（:616-624）；`RunnableSequence.pipe` 覆写为「吸并为单链」：把 `this.last` 与对方 `first` 摘出塞进 middle，避免嵌套 sequence（:2222-2244）；内部结构 `first/middle/last` + `get steps()`（:1954-1989）；`invoke` 逐步调用并为每步挂子回调 `seq:step:${i+1}`（:1991-2040）；`_coerceToRunnable` 是 RunnableLike（函数/对象/Runnable）的统一入口
可讲的知识点：
1. `.pipe()` 是"每次都新建"的不可变组合：组合即返回新对象；
2. 序列扁平化保证 LCEL 图不出现嵌套黑洞——与 RunnableSequence.getGraph 的图生成（:2189-2220）联动讲；
3. `seq:step:N` 命名让追踪树每一跳可读。

### E25 RunnableMap/RunnableParallel：并行扇出
来源：libs/langchain-core/src/runnables/base.ts:2297-2425,2888
证据：`RunnableMap` 持 `steps: Record<string, Runnable>`，构造时逐值 `_coerceToRunnable`（:2317-2323）；`invoke` 对所有 step 并行 `Promise.all` + `raceWithSignal`（:2355-2366），子回调命名 `map:key:${key}`（:2361）；流式版 `_transform` 用 `atee` 把输入生成器复制成 N 份，`Promise.race(tasks.values())` 先到先 yield（:2375-2414）；`export class RunnableParallel<RunInput> extends RunnableMap<RunInput> {}`（:2888）——纯别名
可讲的知识点：
1. 并行的 invoke 语义（全部完成才返回）与 transform 语义（先完成先流出）不同——同一抽象两种时序；
2. `atee` 一份迭代器广播给 N 个消费者的技巧；
3. RunnableParallel 只是历史名字，讲 API 演迁。

### E26 RunnableLambda：返回 Runnable/AsyncIterable 时的行为分派
来源：libs/langchain-core/src/runnables/base.ts:2572-2617,2669-2749,2759-2825,2838-2852
证据：构造时若传入 traceable 函数则直接改道 `RunnableTraceable.from`（:2604-2611）；`_invoke` 中 `if (output && Runnable.isRunnable(output))` 递归调用返回的 Runnable（受 recursionLimit 保护，:2687-2695），`isAsyncIterable/isIterableIterator` 则消费并 concat 成最终值（:2696-2742）；`_transform` 同样分派，但对 AsyncIterable 是逐 chunk `yield`（:2809-2821）——即 lambda 返回生成器就自动获得流式；`stream()` 亲自走 `transform`（:2838-2852）；func 接收 `(input, config)` 第二参（:2684,2789）
可讲的知识点：
1. 「lambda 返回什么决定行为」：值→结束；Runnable→委托调用（并耗 recursionLimit）；AsyncIterable→流式透传；
2. recursionLimit 每层递减（默认 25，config.ts:160），防无限自引用；
3. AsyncLocalStorage 把 config 隐式注入 lambda 第二参（:2680-2682）——呼应 E28。

### E27 RunnableWithFallbacks 与 RunnableAssign/RunnablePick
来源：libs/langchain-core/src/runnables/base.ts:2958-3033,3246-3334,629-647
证据：fallbacks `invoke` 顺序尝试 `this.runnables()`（主 runnable 在前），首个成功即返回；所有失败则抛**第一个**错误 `firstError`（:2990-3030）；流式版先为每个候选拿 `stream()`，成功者胜出（:3035-3067）；`RunnableAssign.invoke` = `{...input, ...mapperResult}`（:3276-3286），transform 版用 `atee` 双通道：passthrough 透传输入（过滤掉 mapper 的 key）+ mapper 输出（:3288-3323）；`Runnable.pick(keys)` 实现 = `this.pipe(new RunnablePick(keys))`（:629-632），`assign` 同理 pipe RunnableAssign（:637-647）
可讲的知识点：
1. fallbacks 不吞错：最终抛出的是主 runnable 的原始错误（firstError 保留）；
2. assign 是"原值透传 + 新字段并行计算"的字典扩展器，流式下 passthrough 与 mapper 是并发双流；
3. pick/assign 都建立在 pipe 之上——组合子的组合子。

### E28 RunnableConfig：ensureConfig 与 AsyncLocalStorage 隐式传播
来源：libs/langchain-core/src/runnables/config.ts:153-186；libs/langchain-core/src/runnables/base.ts:326-358
证据：`ensureConfig` 从 `AsyncLocalStorageProviderSingleton.getRunnableConfig()` 取隐式配置合并，默认值 `{tags:[],metadata:{},recursionLimit:25}`，且明确剔除 runId/runName 不允许子 run 隐式继承父 run 的 id（config.ts:156-177）；`_separateRunnableConfigFromCallOptions` 把 callbacks/tags/metadata/runName/configurable/recursionLimit/maxConcurrency/runId/timeout/signal 从用户 CallOptions 中剥离（base.ts:326-358）
可讲的知识点：
1. config 的"显式参数 + ALS 隐式上下文"双轨：lambda 里不加参数也能拿到 config；
2. runId 特意不继承——子 run 必须有自己的身份；
3. CallOptions 与 RunnableConfig 的切分是 provider 自定义参数（如 temperature）的挂载点。

### E29 withRetry / withConfig / withFallbacks / withListeners
来源：libs/langchain-core/src/runnables/base.ts:151-206,1211-1230,1740-1814(RunnableRetry)
证据：`withRetry(fields?: {stopAfterAttempt?, onFailedAttempt?}) → new RunnableRetry({bound:this,...})`（:157-169）；`withConfig(config) → new RunnableBinding({bound:this, config, kwargs:{}})`（:176-185）；`withFallbacks(fields)`（:193-206）；`withListeners({onStart?,onEnd?,onError?})`（:1211）；RunnableRetry.invoke 内部 `this._callWithConfig` + 重试循环（:1740-1814）
可讲的知识点：
1. 四个修饰器全部是"包装类"而非钩子注册——每次修饰产生新 Runnable（RunnableRetry/RunnableBinding/RunnableWithFallbacks）；
2. 这就是 bind() 家族的实现本质：bind = withConfig 固定 kwargs；
3. 与 E26 的 traceable 改道一起构成 Runnable 的"装饰器生态"。

### E30 回调体系：BaseCallbackHandler 事件面与传播机制
来源：libs/langchain-core/src/callbacks/base.ts:58-300,352-457；libs/langchain-core/src/callbacks/manager.ts:41-43,298-310,779-1100,1337
证据：`Callbacks = CallbackManager | (BaseCallbackHandler | CallbackHandlerMethods)[]`（manager.ts:41-43）；handler 可选方法群 `handleLLMStart/handleLLMNewToken/handleChatModelStart/handleChainStart/handleToolStart/handleRetrieverStart/...`，全部携带 `runId: string` 与 parent 信息（base.ts:58-300）；`BaseCallbackHandler` 开关字段 `ignoreLLM/ignoreChain/ignoreAgent/ignoreRetriever/ignoreCustomEvent/raiseError` 与 `awaitHandlers`（受环境变量 `LANGCHAIN_CALLBACKS_BACKGROUND` 影响，base.ts:402-415）；run 级管理器 `CallbackManagerForLLMRun/ChainRun/ToolRun/RetrieverRun` 均有 `getChild(tag?)`（manager.ts:298-310,517-521,664-668）；`handleChatModelStart` 若 handler 未实现则回退 `handleLLMStart`（manager.ts:944-957）；`CallbackManager.configure`（:1337）
可讲的知识点：
1. 回调树 = 运行树：getChild 逐层下发 callbackManager，与 Runnable.invoke 里的 patchConfig 配合构成追踪链；
2. ChatModelStart 对 LLMStart 的降级兼容说明事件面的演进策略；
3. awaitHandlers/raiseError 决定回调是"尽力而为的后台任务"还是"同步阻塞且可抛错"。

### E31 getGraph 与 LCEL 的图视图
来源：libs/langchain-core/src/runnables/base.ts:588-608,2189-2220；libs/langchain-core/src/runnables/graph.ts:53-152
证据：`Runnable.getGraph()` 默认画三节点图 `Input → 本 Runnable → Output`（base.ts:588-608）；`RunnableSequence.getGraph` 覆写为逐 step 展开、用 `graph.addEdge(currentLastNode, stepFirstNode)` 串接（base.ts:2189-2220）；Graph 类提供 `addNode/lastNode`（graph.ts:53-152）
可讲的知识点：
1. LCEL 的可视化不是外挂：每个 Runnable 自带图描述，组合子负责拼接子图；
2. schema 用 `z.any()` 占位——图尚不承载完整类型信息（TODO 注释在 :591-599）；
3. mermaid 导出/Studio 可视化都源于这条链路。

### E32 消息工具函数面：filterMessages / trimMessages / coerceMessageLikeToMessage
来源：libs/langchain-core/src/messages/base.ts:747-765；libs/langchain/src/index.ts:16-17；libs/langchain-core/src/messages/transformers.ts（1104 行，含 filterMessages/trimMessages 实现）
证据：`BaseMessageLike` 联合类型涵盖 `BaseMessage | MessageFieldWithRole | [role, content] | string | {type:"remove",id} | SerializedConstructor`（base.ts:747-765，remove 注明由 langgraph 的 add_messages reducer 消费）；主包从 core 再导出 `filterMessages, trimMessages`（libs/langchain/src/index.ts:16-17）
可讲的知识点：
1. "message-like 宽容输入"是所有接受消息的 API 的统一约定；
2. `{type:"remove"}` 消息类型与 langgraph 的消息 reducer 形成闭环（RemoveMessage，modifier.ts:22-52）；
3. trimMessages 是上下文窗口管理的框架侧落点。

---

## 第二部分 · 课程清单建议

### 模块一 · 坐标与版本（3 阶段 9 课）

阶段 1A：仓库地形
- L01 三包分裂的 1.x 世界：langchain / langchain-core / langchain-classic 各自的版本号与定位 — 版本矩阵与包职责 | 源码依据：libs/langchain/package.json:2, libs/langchain-classic/package.json:2 | kind: framework
- L02 依赖方向取证：core 零依赖底座、主包换 langgraph 心脏、classic 回望 0.x — 依赖图与 peerDependencies 语义 | 源码依据：libs/langchain/package.json:73-81, libs/langchain-core/package.json:17-25 | kind: theory ★
- L03 主包导出面清单：从 index.ts 读出 1.x 的产品重心 — agents/middleware 为何占 C 位 | 源码依据：libs/langchain/src/index.ts:4-78 | kind: framework

阶段 1B：运行时底座
- L04 core 的依赖表会说话：zod v4、mustache、p-queue、js-tiktoken 各管什么 — 第三方选型全景 | 源码依据：libs/langchain-core/package.json:17-25 | kind: theory
- L05 跨包 instanceof 的 Symbol.for 解法：MESSAGE_SYMBOL 与 Symbol.hasInstance 覆写 — 判型为何不能靠原型链 | 源码依据：libs/langchain-core/src/messages/base.ts:21,364-376 | kind: theory ★
- L06 engines>=20 与 ESM/CJS 双轨发布：tsdown 构建、files 清单、load.cjs 等兼容产物 — 包工程化细节 | 源码依据：libs/langchain/package.json:7-32 | kind: practice

阶段 1C：从导出看到架构
- L07 classic 的博物馆清单：files 字段里的 chains/memory/experimental — 0.x 抽象的去向 | 源码依据：libs/langchain-classic/package.json:14-60 | kind: framework
- L08 主包如何"重新导出"core：消息与工具原语的转发层 — 再导出作为版本稳定策略 | 源码依据：libs/langchain/src/index.ts:4-44 | kind: framework
- L09 initChatModel 与 headless tool：主包唯二的新增面 — 统一模型入口的雏形 | 源码依据：libs/langchain/src/index.ts:23-33 | kind: practice

### 模块二 · core 数据原语（4 阶段 12 课）

阶段 2A：消息模型
- L10 BaseMessage 的骨架：type 泛型化 role、content 双轨、MESSAGE_SYMBOL — 一切消息的基座 | 源码依据：libs/langchain-core/src/messages/base.ts:215-311 | kind: framework ★
- L11 HumanMessage/SystemMessage 的极简实现与 concat 差异 — 最薄子类读继承设计 | 源码依据：libs/langchain-core/src/messages/human.ts:18-79, libs/langchain-core/src/messages/system.ts:40-68 | kind: theory
- L12 AIMessage 构造函数解剖：tool_calls 解析、invalid 桶、v1 内容块互补 — 模型输出落地的第一站 | 源码依据：libs/langchain-core/src/messages/ai.ts:68-189 | kind: framework ★
- L13 ToolMessage 三字段：tool_call_id 关联、artifact 双通道、status 错误即数据 — 工具结果的消息协议 | 源码依据：libs/langchain-core/src/messages/tool.ts:13-118 | kind: framework
- L14 ContentBlock v1 类型集：text/reasoning/refusal/tool_call/多模态与 NonStandard 逃生舱 — 统一内容话语 | 源码依据：libs/langchain-core/src/messages/content/index.ts:19-169 | kind: theory ★
- L15 chunk 合并规则表：_mergeDicts/_mergeLists 的 index/id 匹配与 provider 特判 — 流式聚合的底层 DSL | 源码依据：libs/langchain-core/src/messages/base.ts:446-666, libs/langchain-core/src/messages/ai.ts:477-530 | kind: theory ★

阶段 2B：模型调用面
- L16 BaseChatModel.invoke 全链路：消息 → PromptValue → generatePrompt → ChatGeneration — 调用入口的中间表示 | 源码依据：libs/langchain-core/src/language_models/chat_models.ts:287-300 | kind: framework ★
- L17 流式三件套：_streamResponseChunks 缺省抛错、_streamIterator 降级 invoke、disableStreaming 开关 — 流式的优雅降级 | 源码依据：libs/langchain-core/src/language_models/chat_models.ts:302-309,504-514 | kind: theory
- L18 新一代 ChatModelStream：块级事件生命周期与 text/toolCalls/reasoning/usage 四子流 — 流协议的 v1/v0 并存 | 源码依据：libs/langchain-core/src/language_models/chat_models.ts:318-345,460-492, libs/langchain-core/src/language_models/event.ts:47-155 | kind: framework ★
- L19 bindTools 与 withStructuredOutput：能力协议与基类默认实现 — 可选方法表达的能力契约 | 源码依据：libs/langchain-core/src/language_models/chat_models.ts:276-279,1290-1338 | kind: framework
- L20 BaseLLM 与缓存：BaseLanguageModel 的 cache 字段与 InMemoryCache.global() — 被边缘化的补全家族与缓存开关 | 源码依据：libs/langchain-core/src/language_models/llms.ts:38, libs/langchain-core/src/language_models/base.ts:464-481 | kind: theory

阶段 2C：工具体系
- L21 StructuredTool 的校验双引擎：Zod interop 与 @cfworker/json-schema，ToolInputParsingException — 工具输入的防线 | 源码依据：libs/langchain-core/src/tools/index.ts:222-272 | kind: framework ★
- L22 tool() 重载矩阵：string/object schema 分派、AsyncGenerator 工具事件、returnDirect — 一个函数承载的工具生态 | 源码依据：libs/langchain-core/src/tools/index.ts:652-872, libs/langchain-core/src/tools/types.ts:30-64 | kind: framework
- L23 ToolRuntime 注入：state/toolCallId/context/store/writer 如何从 agent 进入工具函数 — 第二参数形态的契约 | 源码依据：libs/langchain-core/src/tools/types.ts:541-581 | kind: theory ★

阶段 2D：Prompt 与解析
- L24 PromptTemplate：f-string/mustache 双格式与类型级参数提取 ExtractTemplateParamsRecursive — 字符串变类型的体操 | 源码依据：libs/langchain-core/src/prompts/prompt.ts:75-96,216-275 | kind: theory ★
- L25 ChatPromptTemplate.fromMessages 与 BasePromptTemplate 的 Runnable 身份 — prompt 可直接 pipe 的原因 | 源码依据：libs/langchain-core/src/prompts/chat.ts:1190-1216, libs/langchain-core/src/prompts/base.ts:48-147 | kind: framework
- L26 FewShot 与 Output Parser 双层体系：examples/exampleSelector、parseResult/parse 分层、OutputParserException 的 observation — few-shot 与结构化解析 | 源码依据：libs/langchain-core/src/prompts/few_shot.ts:106-121, libs/langchain-core/src/output_parsers/base.ts:19-150,170-198, libs/langchain-core/src/output_parsers/structured.ts:34-143 | kind: framework

### 模块三 · Runnable 与组合（3 阶段 10 课）

阶段 3A：Runnable 基类
- L27 四大支柱 invoke/batch/stream/transform 与它们的降级链 — 默认实现即行为说明书 | 源码依据：libs/langchain-core/src/runnables/base.ts:121-324,656-672 | kind: framework ★
- L28 batch 的并发工程：AsyncCaller、maxConcurrency、returnExceptions、runId 警告 — 并发语义逐行读 | 源码依据：libs/langchain-core/src/runnables/base.ts:208-290 | kind: theory
- L29 stream 首块缓冲与 IterableReadableStream — 为什么错误能立即抛出 | 源码依据：libs/langchain-core/src/runnables/base.ts:298-324 | kind: theory ★

阶段 3B：组合子家族
- L30 pipe 与 RunnableSequence：first/middle/last、吸并扁平化、seq:step:N 子回调 — LCEL 串行心脏 | 源码依据：libs/langchain-core/src/runnables/base.ts:616-624,1944-2040,2222-2278 | kind: framework ★
- L31 RunnableMap 并行扇出：Promise.all 语义 vs Promise.race 流式语义、atee 迭代器广播 — 并行两种时序 | 源码依据：libs/langchain-core/src/runnables/base.ts:2335-2425,2888 | kind: framework ★
- L32 RunnableLambda 行为分派：返回 Runnable 委托、返回 AsyncIterable 流式、traceable 改道 — lambda 的三种命运 | 源码依据：libs/langchain-core/src/runnables/base.ts:2572-2852 | kind: theory ★
- L33 RunnableWithFallbacks / RunnableAssign / pick：错误保留策略与字典扩展器 — 组合子的组合子 | 源码依据：libs/langchain-core/src/runnables/base.ts:2958-3092,3246-3334,629-647 | kind: framework
- L34 withRetry/withConfig/withFallbacks/withListeners：包装类装饰器生态 — bind 家族实现本质 | 源码依据：libs/langchain-core/src/runnables/base.ts:151-206,1211-1230,1740-1814 | kind: framework

阶段 3C：config 与回调
- L35 RunnableConfig 双轨传播：ensureConfig 默认值、runId 不继承、AsyncLocalStorage 隐式注入 — 显式与隐式配置 | 源码依据：libs/langchain-core/src/runnables/config.ts:153-186, libs/langchain-core/src/runnables/base.ts:326-358 | kind: theory ★
- L36 回调事件面与传播：BaseCallbackHandler 方法群、ignoreLLM 等开关、getChild 逐层下发 — 运行树即回调树 | 源码依据：libs/langchain-core/src/callbacks/base.ts:58-300,352-457, libs/langchain-core/src/callbacks/manager.ts:779-1100 | kind: framework ★
- L37 handleChatModelStart 的降级兼容与 CallbackManager.configure — 事件演进与配置汇聚点 | 源码依据：libs/langchain-core/src/callbacks/manager.ts:907-973,1337 | kind: theory
- L38 getGraph 与 LCEL 图视图：默认三节点、sequence 子图拼接 — 可视化的源码起源 | 源码依据：libs/langchain-core/src/runnables/base.ts:588-608,2189-2220, libs/langchain-core/src/runnables/graph.ts:53-152 | kind: practice

> 注：为满足"每课一依据"，模块三实际 9 课（L27-L38 中 L34 为收束课），如需严格 10 课可拆 L38 为「getGraph 实战：mermaid 导出」与「Graph 类内部结构」两课。
