import { L, withKind } from '../../course-builders.ts'

export const L19 = withKind(
  L(
    'L19',
    5,
    'bindTools 与 withStructuredOutput：可选方法表达的能力契约',
    2,
    ['L16'],
    ['lc-bind-tools'],
    [
      '解释 bindTools 为何声明为可选方法，以及 core 用「可选方法 + 运行时检查」而非抽象方法表达能力契约的设计理由',
      '读出基类 withStructuredOutput 的完整装配步骤：schema → JSON Schema → ToolDefinition → bindTools → RunnableLambda 提取 → assembleStructuredOutputPipeline',
      '说出基类默认实现的能力边界：仅支持 functionCalling、strict 直接抛错、includeRaw 改变返回形状',
    ],
    `模型调用面还剩最后一块拼图：让模型**按约定形状输出**。这一课读两个方法——\`bindTools\` 与 \`withStructuredOutput\`——它们的源码合起来不到一百行，却展示了 core 的一种标志性设计：**用可选方法表达能力契约，用运行时检查守护契约边界**。上一课结束时模型已经会「说话」，这一课之后它会「填表」；至于填表的两种策略如何被 createAgent 消费，那是模块八（L96–L98）的领地，本课只负责把基类的默认装配线讲透。

### 可选方法即契约

先看 \`bindTools\` 的声明方式：

\`\`\`ts
export type BindToolsInput =
  | StructuredToolInterface
  | Record<string, any>
  | ToolDefinition
  | RunnableToolLike
  | StructuredToolParams;

/**
 * Bind tool-like objects to this chat model.
 */
bindTools?(
  tools: BindToolsInput[],
  kwargs?: Partial<CallOptions>
): Runnable<BaseLanguageModelInput, OutputMessageType, CallOptions>;
\`\`\`

*— langchain-core/src/language_models/chat_models.ts:208-279（commit 7704471）*

注意方法名后面的 \`?\`——\`bindTools\` 是**可选方法**，不是抽象方法。这与 \`_generate\`（抽象方法，不实现就无法编译通过）形成鲜明对比。为什么？因为「支持工具调用」是**能力**而非**义务**：core 无法强制每个 provider 都支持，但又要让上层代码能探测和依赖这种支持。于是契约被拆成两层——类型层的 \`bindTools?\` 表达「可能存在」，运行层的检查表达「不存在就明说」。输入类型 \`BindToolsInput\` 的五分支也值得注意：既接受 LangChain 工具对象，也接受 provider 原生格式的裸对象与参数-only 的 \`StructuredToolParams\`，工具体系（L21–L23）的产出最终都要流进这个联合类型。

### 运行时检查：把「不支持」说清楚

\`withStructuredOutput\` 在基类有默认实现，开头就是两道闸门：

\`\`\`ts
if (typeof this.bindTools !== "function") {
  throw new Error(
    \`Chat model must implement ".bindTools()" to use withStructuredOutput.\`
  );
}
if (config?.strict) {
  throw new Error(
    \`"strict" mode is not supported for this model by default.\`
  );
}
const method = config?.method;
if (method === "jsonMode") {
  throw new Error(
    \`Base withStructuredOutput implementation only supports "functionCalling" as a method.\`
  );
}
\`\`\`

*— langchain-core/src/language_models/chat_models.ts:1290-1311（commit 7704471）*

三连抛错不是防御式编程的堆砌，而是能力边界的**自我声明**：默认实现只做一件事——基于工具调用协议的结构化输出。strict 与 jsonMode 都是 provider 特性，基类宁可抛错也不提供「看起来能用」的降级。对比很多框架「静默忽略不支持的选项」的做法，这里的行为对调试者更友好：错误发生在配置时刻而不是推理时刻。

### 装配管线：从 schema 到 extract 工具

通过闸门后，默认实现完成四步装配：

\`\`\`ts
let functionName = name ?? "extract";
if (
  !isInteropZodSchema(schema) &&
  !isSerializableSchema(schema) &&
  "name" in schema
) {
  functionName = schema.name;
}

const asJsonSchema =
  isInteropZodSchema(schema) || isSerializableSchema(schema)
    ? toJsonSchema(schema)
    : schema;

const tools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: functionName,
      description,
      parameters: asJsonSchema,
    },
  },
];

const llm = this.bindTools(tools);
const outputParser = RunnableLambda.from<OutputMessageType, RunOutput>(
  (input: BaseMessageChunk): RunOutput => {
    if (!AIMessageChunk.isInstance(input)) {
      throw new Error("Input is not an AIMessageChunk.");
    }
    if (!input.tool_calls || input.tool_calls.length === 0) {
      throw new Error("No tool calls found in the response.");
    }
    const toolCall = input.tool_calls.find(
      (tc) => tc.name === functionName
    );
    if (!toolCall) {
      throw new Error(\`No tool call found with name \${functionName}.\`);
    }
    return toolCall.args as RunOutput;
  }
);

return assembleStructuredOutputPipeline(
  llm,
  outputParser,
  includeRaw,
  includeRaw ? "StructuredOutputRunnable" : "StructuredOutput"
);
\`\`\`

*— langchain-core/src/language_models/chat_models.ts:1313-1363（commit 7704471）*

逐段读：**命名**——默认叫 \`extract\`，裸 schema 对象自带 \`name\` 时借用之；**schema 归一**——Zod 或 SerializableSchema 先过 \`toJsonSchema\`，原生 JSON Schema 直通；**工具定义**——schema 被包装成一个名为 functionName 的 OpenAI 风格 function 工具，description 取 schema 描述或兜底字符串 "A function available to call."；**提取器**——一个 \`RunnableLambda\` 从响应的 \`tool_calls\` 里按名捞 args。最后 \`assembleStructuredOutputPipeline\` 把「绑定工具的模型」与「提取器」拼成 Runnable：\`includeRaw: true\` 时管线多一层，返回 \`{ raw, parsed }\` 双字段，否则只吐解析结果。**结构化输出的本质在此显形：它不是输出格式的魔法，而是「让模型调用一个隐藏工具，再把工具参数当成答案」**——这条思路将在 L96 的 ToolStrategy 里以正式形态回归。

### 与解析器世界的分野

这里要立一块界碑：本课的提取器**不做任何文本解析**。响应里的 args 已经是 \`defaultToolCallParser\`（L12）解析好的对象，提取只是按名取值。而 L26 的 \`StructuredOutputParser\` 走的是另一条路——要求模型在文本里输出 JSON、再用正则修围栏和转义、最后 Zod 校验。两条路对应两种能力假设：前者假设模型支持工具调用（协议级），后者只假设模型会写 JSON（提示级）。源码层还有一个细节佐证两条路的独立性：基类提取器的失败形态是普通 \`Error\`（"No tool calls found in the response."），而不是 \`OutputParserException\`——后者属于文本解析体系的错误 vocabulary。provider 包（如 openai/anthropic）会覆写 \`withStructuredOutput\` 增加对 strict、jsonMode 的真实支持，覆写时同样要维持「先检查再装配」的次序。

### includeRaw 的降级拼装：parsed 失败回落为 null

\`withStructuredOutput\` 的最后一步交给 \`assembleStructuredOutputPipeline\`，它的两个分支都值得细看：

\`\`\`ts
if (!includeRaw) {
  const result = llm.pipe(outputParser);
  return runName ? result.withConfig({ runName }) : result;
}

const parserAssign = RunnablePassthrough.assign({
  parsed: (input: any, config) => outputParser.invoke(input.raw, config),
});
const parserNone = RunnablePassthrough.assign({
  parsed: () => null,
});
const parsedWithFallback = parserAssign.withFallbacks({
  fallbacks: [parserNone],
});
const result = RunnableSequence.from<
  BaseLanguageModelInput,
  { raw: BaseMessage; parsed: RunOutput }
>([{ raw: llm }, parsedWithFallback]);
\`\`\`

*— langchain-core/src/language_models/structured_output.ts:107-125（commit 7704471）*

无 \`includeRaw\` 的默认形态就是一句话：模型 pipe 提取器，有 runName 再包一层 withConfig。而 \`includeRaw: true\` 的形态藏着一个重要契约——文档注释写明 *"If parsing fails, \`parsed\` falls back to null"*（structured_output.ts:91-93）。实现是三段组合：\`{ raw: llm }\` 这个对象字面量被 coerce 成 RunnableMap，把模型输出包成 \`{ raw }\` 键（L31 的对象语法糖在此复用）；\`RunnablePassthrough.assign\` 用 \`input.raw\` 喂提取器算出 \`parsed\` 键；再挂 \`parserNone\` 兜底——提取器抛错时 \`parsed\` 被置为 \`null\` 而不是让整条链炸掉，\`raw\` 始终保留。注意这与 L33 的 fallback 语义层级不同：**这是字段级的容错**，失败只影响一个键的值，不影响整体调用成功。还有一处细节：装配全程使用的都是模块三的组合子原语——pipe、RunnableSequence.from、withConfig——结构化输出管线没有引入任何新机制，它本身就是「能力组合而非继承」的完整应用实例，也为 L96 的双策略对照埋下参照。\`parserNone\` 还有一个容易忽略的细节：它的 \`parsed\` 值是一个函数 \`() => null\` 而非字面量——RunnablePassthrough.assign 的字段既接受值也接受 \`(input, config)\` 回调，兜底层恰好复用了同一约定，null 是惰性算出来的。装配调用的最后一参同样值得记：\`includeRaw ? "StructuredOutputRunnable" : "StructuredOutput"\`（chat_models.ts:1357-1360）——两种形态的根 run 在追踪树上有不同的名字，按 runName 过滤结构化输出调用时要区分这两个字符串。把整条装配线收拢成一句话：**基类 withStructuredOutput 是「闸门三连 + 四步装配 + 组合子拼装」的三段式工厂**，它对 provider 的要求只有一件——实现 bindTools；其余的 schema 归一、工具包装、提取、容错与命名全部由 core 代劳，这正是能力契约把复杂度压到子类一侧的方式。

### 本课小结

- \`bindTools?\` 的可选性是核心设计：类型层表达「能力可探测」，运行时检查表达「不支持要明说」，比抽象方法更适配多 provider 现实。
- 基类 \`withStructuredOutput\` 的能力边界被三道检查明确圈定：无 bindTools 抛错、strict 抛错、jsonMode 抛错——只保留 functionCalling 一条装配线。
- 默认装配线四步走：命名 extract → schema 归一为 JSON Schema → 包装成隐藏 function 工具绑定 → RunnableLambda 按 tool_calls.name 提取 args。
- includeRaw 切换返回形状；提取失败是普通 Error，与文本解析体系的 OutputParserException 分属两个 vocabulary。
- 下一课看被边缘化的另一半家族：BaseLLM 补全式模型与 BaseLanguageModel 上的缓存三态构造。
`,
    null,
    [
      {
        text: '一个自定义 ChatModel 子类没有实现 bindTools，调用其 withStructuredOutput(schema) 会发生什么？',
        options: [
          'TypeScript 编译直接报错，无法通过类型检查',
          '运行时抛出错误：Chat model must implement ".bindTools()" to use withStructuredOutput.',
          '静默返回原模型，结构化约束被忽略',
          '自动降级为 jsonMode 输出',
        ],
        answer: 1,
        explain:
          'withStructuredOutput 在基类有默认实现，其第一行就是运行时检查 typeof this.bindTools !== "function" 则抛错。选 A 错在 bindTools 是可选方法（bindTools?），类型系统允许不实现，编译期不拦；C 和 D 都不存在降级路径——core 明确拒绝在无工具调用能力的模型上假装支持结构化输出。',
        concept: 'lc-bind-tools',
      },
      {
        text: '基类默认的 withStructuredOutput 实现支持哪些 method 取值？',
        options: [
          'functionCalling 与 jsonMode 都支持',
          '只支持 functionCalling；传 method: "jsonMode" 会抛错',
          '只支持 jsonMode',
          'method 参数在 TS 里不存在',
        ],
        answer: 1,
        explain:
          '基类实现里 if (method === "jsonMode") throw，错误文案写明 Base withStructuredOutput implementation only supports "functionCalling" as a method。jsonMode 需要模型侧的 JSON 输出开关，属于 provider 特有能力，只有覆写了 withStructuredOutput 的 provider 子类才可能支持；基类不假装通用。',
        concept: 'lc-bind-tools',
      },
      {
        text: '默认实现的 config.strict 选项行为是？',
        options: [
          '默认开启 strict，生成严格 JSON Schema',
          'strict: true 会抛错——strict 模式由 provider 子类覆写后才可用',
          'strict 被静默忽略',
          'strict 控制是否包含原始消息',
        ],
        answer: 1,
        explain:
          '源码在检查完 bindTools 后立刻判断 if (config?.strict) throw new Error("\\"strict\\" mode is not supported for this model by default.")。strict（约束解码级别的严格 schema）是 provider 特性，基类宁可抛错也不给出「看似生效实则无效」的静默行为。包含原始消息是 includeRaw 的职责，与 strict 无关。',
        concept: 'lc-bind-tools',
      },
      {
        text: '默认实现的输出解析器如何从模型响应中取出结构化结果？',
        options: [
          '对响应文本做 JSON.parse 后用 schema 校验',
          '从 AIMessageChunk.tool_calls 里找到 name 与提取函数名一致的调用，返回其 args；找不到则抛错',
          '读取 additional_kwargs 里的 provider 原始字段',
          '把整条 AIMessage 交给 OutputParserException 处理',
        ],
        answer: 1,
        explain:
          '基类装配的 RunnableLambda 依次检查：输入必须是 AIMessageChunk；tool_calls 非空；存在 name === functionName 的调用，命中后 return toolCall.args。整个提取建立在工具调用协议之上，而不是文本解析——这就是它与 StructuredOutputParser（L26）的本质分野。C 是旧格式兼容路径，不用于此；D 中的异常类是文本解析世界的产物。',
        concept: 'lc-bind-tools',
      },
      {
        text: '不传 config.name 时，默认提取工具的函数名是？',
        options: ['extract', 'output', 'schema 的构造器类名', '随机 UUID'],
        answer: 0,
        explain:
          'let functionName = name ?? "extract"——只有当传入的 schema 对象本身带 name 字段（且既非 Zod 也非 SerializableSchema）时才改用 schema.name。这个「extract」名字在 provider 包生态里被大量教程引用，来源正是这一行。',
        concept: 'lc-bind-tools',
      },
    ],
    [
      [
        'BindToolsInput',
        'bindTools 接受的工具联合类型：StructuredToolInterface / Record / ToolDefinition / RunnableToolLike / StructuredToolParams',
      ],
      [
        'withStructuredOutput',
        '把 Zod/JSON Schema 装配成「绑定工具 + 提取 Runnable」组合的能力方法，基类有默认实现',
      ],
      [
        'includeRaw',
        'withStructuredOutput 选项：为 true 时返回形状变为 { raw: BaseMessage, parsed: RunOutput }',
      ],
      ['能力契约', 'core 用可选方法 + 运行时检查表达「子类可以实现、不实现则显式拒绝」的协议风格'],
    ],
    [
      '以为 withStructuredOutput 是独立能力——它的默认实现完全建立在 bindTools 之上，能力协商链是 withStructuredOutput → bindTools → provider 实现，链条断在 bindTools 就全部不可用',
      '把 Python 线的 strict/jsonMode 行为套到 TS 基类上——TS 基类对两者都是显式抛错，只有 provider 覆写后才可能支持',
      'includeRaw: true 时返回类型从 RunOutput 变成 { raw, parsed }，消费端要按新形状取值，直接当对象用会拿到 undefined',
    ],
  ),
  'framework',
)
