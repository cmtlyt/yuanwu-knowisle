import { L, withKind } from '../../course-builders.ts'

export const L96 = withKind(
  L(
    'L96',
    28,
    '两种策略：ToolStrategy 隐藏 extract 工具 vs ProviderStrategy 原生 json_schema',
    3,
    ['L37'],
    ['lc-response-strategies'],
    [
      '能画出 ToolStrategy 与 ProviderStrategy 各自的产出物（隐藏 function tool vs 原生 json_schema 直通），并对照两条 parse 契约的输入与失败行为',
      '能解释两处 strict 默认值（ToolStrategy 为 false、ProviderStrategy 为 true）各自背后的机制原因',
      '能依据模型 profile.structuredOutput 与多 schema 需求在两种策略间做出选型判断',
    ],
    `### 上承 L37：responseFormat 背后的两个执行体

L37 拆 createAgent 全景时，responseFormat 只是参数表里的一个形态分类；从本课开始我们进入模块八，把它的实现体彻底打开。核心结论一句话：**responseFormat 的所有运行时行为差异，都源于两个策略类的实现差异——ToolStrategy 把 schema 藏进一次工具调用，ProviderStrategy 把 schema 交给模型提供商的原生 json_schema 通道**。两个类都在 \`libs/langchain/src/agents/responses.ts\`，加起来不到三百行，但它们决定了结构化输出的可靠性、错误语义与模型兼容面。本课先看两个类的外壳与构造路径，错误哲学的深水区留给 L97。

### ToolStrategy：把 schema 变成一个隐藏的 extract 工具

\`\`\`ts
export class ToolStrategy<_T = unknown> {
  private constructor(
    public readonly schema: Record<string, unknown>,
    public readonly tool: {
      type: "function";
      function: FunctionDefinition;
    },
    public readonly options?: ToolStrategyOptions
  ) {}

  get name() {
    return this.tool.function.name;
  }

  static fromSchema<S extends InteropZodObject>(
    schema: S,
    outputOptions?: ToolStrategyOptions
  ): ToolStrategy<S extends InteropZodType<infer U> ? U : unknown>;
  static fromSchema(
    schema: SerializableSchema,
    outputOptions?: ToolStrategyOptions
  ): ToolStrategy<Record<string, unknown>>;
  static fromSchema(
    schema: Record<string, unknown>,
    outputOptions?: ToolStrategyOptions
  ): ToolStrategy<Record<string, unknown>>;
\`\`\`

*— libs/langchain/src/agents/responses.ts:54-92（commit 7704471）*

三个要点。第一，**构造器是 private 的**，外部只能走 \`static fromSchema\` 工厂，而工厂有三个重载：Zod 对象、Standard Schema（\`SerializableSchema\`）、裸 JSON Schema 对象——类型推断经由 \`S extends InteropZodType<infer U> ? U : unknown\` 完成（responses.ts:82），Zod 用户的 output 类型可以直接被抽出来。第二，工厂内部先把 schema 经 \`toJsonSchema\` 转 JSON Schema，再装配成 \`{ type: "function", function: { name, strict, description, parameters } }\` 的工具定义（responses.ts:106-119）。第三，工具名有兜底逻辑：

\`\`\`ts
let bindingIdentifier = 0;
// ... inside fromSchema:
function getFunctionName(name?: string) {
  return name ?? \`extract-\${++bindingIdentifier}\`;
}
// tool definition:
const tool = {
  type: "function" as const,
  function: {
    name: getFunctionName(asJsonSchema.title),
    strict: false,
    description:
      asJsonSchema.description ??
      "Tool for extracting structured output from the model's response.",
    parameters: asJsonSchema,
  },
};
\`\`\`

*— libs/langchain/src/agents/responses.ts:46, 98-119（commit 7704471）*

\`bindingIdentifier\` 是模块级全局计数器（responses.ts:46），注释写明用途是「给工具生成唯一名字」。工具名必须唯一——多个 ToolStrategy 并存时（多 schema 场景），模型返回的 tool call 要靠名字映射回正确的策略实例去 parse。\`strict: false\` 写死在工具定义里（responses.ts:112）：tool calling 通道下，即便提供商不支持严格 schema 强制也能工作，**正确性由本地校验兜底**——parse 阶段用 JSON Schema Validator 重新验证（responses.ts:151-161），这是下一课的主角。注意泛型参数名 \`_T\` 带下划线：它不在字段上出现，类型信息完全靠工厂重载的返回类型声明携带。

### ProviderStrategy：schema 直通提供商原生通道

\`\`\`ts
const PROVIDER_STRATEGY_DEFAULT_STRICT = true;

export class ProviderStrategy<T = unknown> {
  // @ts-expect-error - _schemaType is used only for type inference
  private _schemaType?: T;
  public readonly schema: Record<string, unknown>;
  public readonly strict: boolean;

  static fromSchema<T = unknown>(
    schema: InteropZodType<T> | SerializableSchema | Record<string, unknown>,
    strict?: boolean
  ): ProviderStrategy<T> | ProviderStrategy<Record<string, unknown>> {
    const asJsonSchema = toJsonSchema(schema);
    return new ProviderStrategy(asJsonSchema, strict) as
      | ProviderStrategy<T>
      | ProviderStrategy<Record<string, unknown>>;
  }
}
\`\`\`

*— libs/langchain/src/agents/responses.ts:41, 164-230（裁剪，commit 7704471）*

与 ToolStrategy 的差异一目了然：**没有 tool 字段，不构造任何工具定义**，只保留转好的 JSON Schema 和一个 strict 开关。strict 的默认值来自 responses.ts:41 的常量，其上方注释直接引用了 OpenAI 结构化输出文档：使用 json_schema 响应格式时，OpenAI 的 parse() 方法要求所有 function tool 都为 strict——所以默认值取 true，把 schema 强制交给提供商执行。构造器有两个重载形态，既接受位置参数 \`(schema, strict)\`，也接受 \`{ schema, strict }\` 选项对象（responses.ts:178-205），运行时用 \`"schema" in schemaOrOptions && !("type" in schemaOrOptions)\` 判别——这个 \`type\` 字段判别是为了把裸 JSON Schema（必有 \`type: "object"\`）与选项对象区分开。

还有一处类型工程值得圈点：\`_schemaType?: T\` 是 **phantom type（幻影类型）**——\`@ts-expect-error\` 注释承认它运行时永远没有值，存在的唯一目的是把泛型 \`T\` 绑在实例类型上，让 \`providerStrategy(z.object({...}))\` 的返回类型能携带 Zod output 类型（responses.ts:165-166）。

### 两个策略类逐项对照

| 维度 | ToolStrategy | ProviderStrategy |
|---|---|---|
| 产出物 | 隐藏 function tool，模型发 tool call | JSON Schema 交给提供商原生通道 |
| strict 默认 | false（responses.ts:112） | true（responses.ts:41） |
| parse 输入 | tool call 的参数对象 | AIMessage（从 content 抽文本） |
| parse 失败 | 抛 StructuredOutputParsingError | 返回 undefined |
| 校验方式 | 本地 JSON Schema Validator | 本地 Validator（提供商侧另有强制） |
| 兼容面 | 任何支持 function calling 的模型 | 需要模型 profile.structuredOutput 为 true |

**为什么 strict 值恰好相反**：两处 strict 的语义层完全不同。ToolStrategy 的 strict 是工具定义的一个字段，false 意味着不指望提供商做严格强制——反正本地 Validator 会校验、报错还能回喂重试；ProviderStrategy 的 strict 是提供商侧的强制开关，true 才能触发提供商的结构化输出保障，而这是该策略「更可靠」卖点的来源（responses.ts:573-579 的 JSDoc：更高效、更可靠的 schema enforcement）。**选型规则**在源码 JSDoc 里写得直白：toolStrategy 适用于「任何支持 function calling 的模型，兼容面更宽」（responses.ts:510-511）；providerStrategy 适用于「模型支持原生 JSON schema 输出时的推荐路径」（responses.ts:579）。能力判定函数 \`hasSupportForJsonSchemaOutput\` 读的是模型 \`profile.structuredOutput\` 元数据（responses.ts:697-714）——是运行时能力协商，不是硬编码厂商清单，这个函数我们在 L97 展开拆解。

### 策略的消费端：AgentNode 如何分派两条通道

两个策略类造出来之后去哪了？答案在 AgentNode 的 \`#getResponseFormat\`（AgentNode.ts:173-235，commit 7704471）：它先把模型参数归一——如果传进来的是 ConfigurableModel 包装，先调 \`_getModelInstance()\` 解析成真实模型实例，再以 \`(responseFormat, undefined, resolvedModel)\` 调 transformResponseFormat。注意第二个参数传的是 undefined：**经由 createAgent 裸 schema 入口进来的策略不携带 ToolStrategyOptions**，toolMessageContent 与 handleError 这些选项只在用户显式用 toolStrategy()/new ToolStrategy 构造实例时生效——「默认路径没有选项」是源码里的隐式约定。

归一化结果按策略类型分派成两种执行形态：

\`\`\`ts
const isProviderStrategy = strategies.every(
  (format) => format instanceof ProviderStrategy
);
if (!isProviderStrategy) {
  return {
    type: "tool",
    tools: (strategies.filter(
      (format) => format instanceof ToolStrategy
    ) as ToolStrategy[]).reduce((acc, format) => {
      acc[format.name] = format;
      return acc;
    }, {} as Record<string, ToolStrategy>),
  };
}
return { type: "native", strategy: strategies[0] as ProviderStrategy };
\`\`\`

*— libs/langchain/src/agents/nodes/AgentNode.ts:190-235（commit 7704471，有裁剪）*

这段是 L96 前文两处伏笔的实现现场：其一，「模型返回的 tool call 要靠名字映射回策略实例」——\`acc[format.name] = format\` 就是那张名字→实例映射表的构造处；其二，「provider 通道一次只能一个 schema」——注释原话 there can only be one provider strategy，native 形态只保留 \`strategies[0]\`。baseHandler 每次模型调用前都会走一遍 getResponseFormat 与 bindTools（AgentNode.ts:383-390），隐藏 extract 工具就是在那里注入请求的。还有一处通道设计值得圈点：结构化结果走 \`structuredResponse\` 状态字段，其通道用 \`UntrackedValue(guard=true)\` 实现，注释写明**每个超步只允许一次写入**（AgentNode.ts:262-268）——结构化输出是终态产物，不参与循环内的增量合并。

### 本课小结

- ToolStrategy = schema → 隐藏 extract 工具（strict:false、extract-N 命名计数器、本地 Validator 校验兜底），兼容面宽；ProviderStrategy = schema → 提供商原生 json_schema（strict 默认 true），可靠性与效率更优。
- 两个类的构造器都是 private，入口是 static fromSchema 工厂；泛型信息靠工厂重载声明与 phantom type（\`_schemaType?: T\`）携带。
- 两处 strict 的语义层不同：一个是工具定义字段，一个是提供商强制开关，默认值相反各有机制依据。
- 多 schema 场景（策略数组）只有 tool calling 通道能表达「模型挑一个工具调用」，这是数组输入一律转 ToolStrategy 的根本原因——归一化细节在 L98。
- 下一课拆两条 parse 契约的错误哲学：抛错可回喂 vs 静默返回 undefined，以及 structuredOutput 能力协商的判定细节。
`,
    null,
    [
      {
        text: 'ToolStrategy 让模型如何产出结构化数据？',
        options: [
          '把 JSON 直接写进 AIMessage 的 content',
          '调用一个按 schema 自动生成的隐藏 function tool，agent 从 tool call 参数中提取结果',
          '走模型提供商的原生 json_schema 响应模式',
          '用正则表达式从模型文本输出中抽取字段',
        ],
        answer: 1,
        explain:
          'ToolStrategy.fromSchema 把 schema 转成一个 { type: "function", function: {...} } 的工具定义交给模型（responses.ts:106-119），模型通过调用该工具产出参数。A 是 ProviderStrategy 的 parse 输入形态；C 是 ProviderStrategy 的实现路径；D 在源码中不存在。',
        concept: 'lc-response-strategies',
      },
      {
        text: '两个策略类的 strict 默认值分别是什么？',
        options: [
          '都是 true',
          '都是 false',
          'ToolStrategy 为 false，ProviderStrategy 为 true（PROVIDER_STRATEGY_DEFAULT_STRICT）',
          'ToolStrategy 为 true，ProviderStrategy 为 false',
        ],
        answer: 2,
        explain:
          'ToolStrategy 生成的工具定义里写死 strict: false（responses.ts:112），因为校验由本地 Validator 在 parse 阶段兜底；ProviderStrategy 默认 strict 为 true（responses.ts:41 常量），注释明确原因是 OpenAI 的 parse() 方法要求所有 function tool 都为 strict。两个 strict 分属不同层，语义不同。',
        concept: 'lc-response-strategies',
      },
      {
        text: 'schema 没有 title 时，ToolStrategy 生成的工具名是什么？',
        options: [
          '固定叫 extract',
          '用 schema 的 JSON 字符串哈希作为名字',
          'extract-N，N 来自模块级全局计数器 bindingIdentifier 的自增',
          '随机生成 UUID',
        ],
        answer: 2,
        explain:
          'responses.ts:102-104 的 getFunctionName 兜底逻辑是 `extract-${++bindingIdentifier}`，计数器是 responses.ts:46 的模块级变量。工具名必须唯一且可回溯到具体策略实例，全局自增保证同进程内不重名；A 无法区分多个策略，B 与 D 在源码中不存在。',
        concept: 'lc-response-strategies',
      },
      {
        text: '某模型的 profile 里没有 structuredOutput: true，传裸 Zod schema 给 createAgent 时默认会走哪种策略？',
        options: [
          'ProviderStrategy，因为 Zod 是一等公民',
          'ToolStrategy，因为能力协商失败时归一化管线回退到 tool calling 通道',
          '抛出异常，要求显式传策略实例',
          '自动降级为纯文本输出，responseFormat 被忽略',
        ],
        answer: 1,
        explain:
          'transformResponseFormat 在 responses.ts:405 用 hasSupportForJsonSchemaOutput(model) 决定 useProviderStrategy，判定失败即回退 ToolStrategy.fromSchema（responses.ts:419-423）。tool calling 的兼容面更宽（任何支持 function calling 的模型都行），这正是 JSDoc 里写明的定位（responses.ts:510-515）。C 只在输入形态非法时发生；D 不存在。',
        concept: 'lc-response-strategies',
      },
    ],
    [
      [
        'ToolStrategy',
        '把 schema 包装成隐藏 function tool、从 tool call 参数提取结构化输出的策略类，兼容任何支持 function calling 的模型',
      ],
      [
        'ProviderStrategy',
        '把 schema 转 JSON Schema 后直通提供商原生 structured output 通道的策略类，strict 默认 true',
      ],
      [
        'bindingIdentifier',
        'responses.ts:46 的模块级全局计数器，为无 title 的 schema 生成不重复的 extract-N 工具名',
      ],
    ],
    [
      '以为 ProviderStrategy 对所有模型可用——它依赖模型 profile.structuredOutput 元数据，能力不满足时归一化管线会回退 ToolStrategy（responses.ts:405-423）',
      '以为隐藏 extract 工具需要自己写并在 tools 里注册——它由策略类内部构造并由 agent 运行时注入，用户侧只传 schema',
      '把两处 strict 混为一谈——ToolStrategy 的 strict:false 是工具定义字段（本地校验兜底），ProviderStrategy 的 strict:true 是提供商侧的 schema 强制开关',
    ],
  ),
  'framework',
)
