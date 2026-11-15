import { L, withKind } from '../../course-builders.ts'

export const L98 = withKind(
  L(
    'L98',
    28,
    'transformResponseFormat 归一化：三类 schema 输入 × 能力协商、数组约束、__brand',
    3,
    ['L96'],
    ['lc-transform-response-format'],
    [
      '能复述 transformResponseFormat 的完整分派表：空值、哨兵、策略实例、三类 schema、数组、非法输入各自的归宿',
      '能解释数组分支一律走 ToolStrategy 且强制同质类型的原因，以及混合类型抛错的触发条件',
      '能说明 ResponseFormatUndefined 哨兵、JsonSchemaFormat 的 __brand?: never 负品牌、TypedToolStrategy 品牌数组三个类型防御各自防什么',
    ],
    `### responseFormat 的海关：一切输入在此归一化

L96 给出了两个策略类，L97 拆了它们的错误哲学；但用户在 createAgent 参数里写的从不是策略实例，而是一个 Zod schema、一个 JSON Schema 对象、或它们的数组——**把这些异构输入收敛成统一的 \`ResponseFormat[]\`，是 \`transformResponseFormat\` 的职责**（responses.ts:322-439）。它同时是能力协商的发生地：同一个 schema 输入，在支持的模型上走 ProviderStrategy，在不支持的模型上走 ToolStrategy。本课按分派表逐支走读这份一百二十行的归一化函数。

### 分派表全景：六组分支

\`\`\`ts
export function transformResponseFormat(
  responseFormat?: ResponseFormatInput,
  options?: ToolStrategyOptions,
  model?: LanguageModelLike
): ResponseFormat[] {
  if (!responseFormat) { return []; }
  if (
    typeof responseFormat === "object" && responseFormat !== null &&
    "__responseFormatUndefined" in responseFormat
  ) { return []; }
  if (Array.isArray(responseFormat)) { /* 数组分支，下节 */ }
  if (
    responseFormat instanceof ToolStrategy ||
    responseFormat instanceof ProviderStrategy
  ) { return [responseFormat]; }
  const useProviderStrategy = hasSupportForJsonSchemaOutput(model);
  if (isSerializableSchema(responseFormat)) {
    return useProviderStrategy
      ? [ProviderStrategy.fromSchema(responseFormat)]
      : [ToolStrategy.fromSchema(responseFormat, options)];
  }
  if (isInteropZodObject(responseFormat)) { /* 同上双分支 */ }
  if (
    typeof responseFormat === "object" && responseFormat !== null &&
    "properties" in responseFormat
  ) { /* 同上双分支 */ }
  throw new Error(\`Invalid response format: \${String(responseFormat)}\`);
}
\`\`\`

*— libs/langchain/src/agents/responses.ts:322-439（裁剪，commit 7704471）*

按顺序六组分支：**空值**（falsy）与**哨兵**（带 \`__responseFormatUndefined\` 标记）都返回 \`[]\`——类型层区分「没传」与「显式 undefined」（L99 会看到它们对应 createAgent 的不同重载），运行时归约成同一种「无结构化输出」；**策略实例**原样包成单元素数组（responses.ts:398-403）；然后是三类 schema 输入——Standard Schema（\`isSerializableSchema\`）、Zod 对象（\`isInteropZodObject\`）、裸 JSON Schema（以 \`"properties" in responseFormat\` 识别）——三支共用同一个双分支模板：\`useProviderStrategy ? ProviderStrategy : ToolStrategy\`（responses.ts:405-436）。能力协商开关在进入 schema 判定前就计算好了（responses.ts:405），判定细节 L97 已拆：读 \`model.profile.structuredOutput === true\`。都不匹配才抛「Invalid response format」。函数顶部 JSDoc 把默认行为总结为：Zod 与 JSON schema 默认走 tool calling，自定义 response format 原样返回（responses.ts:310-316）。

### 数组分支：一律 ToolStrategy，且强制同质

\`\`\`ts
if (Array.isArray(responseFormat)) {
  if (
    responseFormat.every(
      (item) => item instanceof ToolStrategy || item instanceof ProviderStrategy
    )
  ) { return responseFormat as unknown as ResponseFormat[]; }
  if (responseFormat.every((item) => isSerializableSchema(item))) {
    return responseFormat.map((item) =>
      ToolStrategy.fromSchema(item as SerializableSchema, options));
  }
  if (responseFormat.every((item) => isInteropZodObject(item))) {
    return responseFormat.map((item) =>
      ToolStrategy.fromSchema(item as InteropZodObject, options));
  }
  if (
    responseFormat.every(
      (item) => typeof item === "object" && item !== null &&
        !isInteropZodObject(item) && !isSerializableSchema(item)
    )
  ) {
    return responseFormat.map((item) =>
      ToolStrategy.fromSchema(item as JsonSchemaFormat, options));
  }
  throw new Error(
    \`Invalid response format: list contains mixed types.\\n\` +
    \`All items must be either InteropZodObject, Standard Schema, or plain JSON schema objects.\`
  );
}
\`\`\`

*— libs/langchain/src/agents/responses.ts:344-396（裁剪，commit 7704471）*

两个硬约束藏在分支顺序里。**其一，数组不做能力协商**：整个分支没有 \`useProviderStrategy\` 的影子，三种同质 schema 数组全部 map 成 ToolStrategy。机制原因在 L96 结尾埋过伏笔——多 schema 场景的语义是「模型从多个候选中挑一个调用」，这只有 tool calling 通道能表达；provider 原生 json_schema 一次只能接受一个 schema。顶部 JSDoc 也写明数组应只含裸 schema 而非策略实例（responses.ts:340-343），但第一个 every 检查对已构造的策略实例数组网开一面、原样放行（responses.ts:348-355）——宽松入口与严格文档并存，是这份源码里少见的妥协。**其二，强制同质**：四个 every 全量检查失败即抛「list contains mixed types」，不做逐元素自动识别。错误消息把三种合法形态全部列出，这是一个把约束写进运行时错误文本的好例子。

### 哨兵、负品牌与品牌数组：三个类型防御

\`\`\`ts
export type ResponseFormatUndefined = {
  __responseFormatUndefined: true;
};

export type JsonSchemaFormat = {
  type: "null" | "boolean" | "object" | "array" | "number" | "string" | "integer";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
} & {
  // Brand to ensure this is not a ToolStrategy or ProviderStrategy
  __brand?: never;
};

export interface TypedToolStrategy<T = unknown> extends Array<ToolStrategy<any>> {
  _schemaType?: T;
}
\`\`\`

*— libs/langchain/src/agents/responses.ts:28-30, 671-687, 444-448（commit 7704471）*

三个类型各自防一种误用。\`ResponseFormatUndefined\` 是**正哨兵**：运行时检查 \`"__responseFormatUndefined" in responseFormat\`（responses.ts:332-338），让「显式传 undefined」成为类型系统里可表达的状态。\`__brand?: never\` 是**负品牌**：\`never\` 意味着任何对象都不能真的带上这个字段，除非它撒谎——策略类实例没有 \`__brand\` 属性，但裸 JSON Schema 对象类型上带了这个排除标记，二者在类型层从此互斥，防止用户把裸对象误赋给需要策略实例的参数位。\`TypedToolStrategy\` 是**品牌数组**：继承 \`Array<ToolStrategy<any>>\` 并挂 \`_schemaType?: T\` 幻影字段——L96 讲过 ProviderStrategy 的 \`_schemaType\` 幻影类型，这里同款技巧用在数组上，\`toolStrategy([zodA, zodB])\` 的 union 输出类型就靠它穿过 \`createAgent\` 的重载 8（index.ts:441-476）。

### 快捷工厂：toolStrategy() 与 providerStrategy()

\`\`\`ts
export function toolStrategy(
  responseFormat:
    | InteropZodType<any> | InteropZodType<any>[]
    | SerializableSchema | SerializableSchema[]
    | JsonSchemaFormat | JsonSchemaFormat[],
  options?: ToolStrategyOptions
): TypedToolStrategy {
  return transformResponseFormat(responseFormat, options) as TypedToolStrategy;
}

export function providerStrategy(
  responseFormat:
    | InteropZodType<unknown> | SerializableSchema | JsonSchemaFormat
    | { schema: ...; strict?: boolean }
): ProviderStrategy<unknown> {
  if (
    typeof responseFormat === "object" && responseFormat !== null &&
    "schema" in responseFormat && !isInteropZodSchema(responseFormat) &&
    !isSerializableSchema(responseFormat) && !("type" in responseFormat)
  ) {
    const { schema, strict: strictFlag } = responseFormat as { schema: ...; strict?: boolean };
    return ProviderStrategy.fromSchema(schema, strictFlag);
  }
  return ProviderStrategy.fromSchema(responseFormat as InteropZodType<unknown>);
}
\`\`\`

*— libs/langchain/src/agents/responses.ts:555-566, 628-665（裁剪，commit 7704471）*

\`toolStrategy()\` 的实现体只有一行——调 \`transformResponseFormat\` 但**不传 model**，于是 \`hasSupportForJsonSchemaOutput(undefined)\` 恒为 false，必然产出 ToolStrategy：这是「显式指定策略」跳过能力协商的实现机制（responses.ts:565）。\`providerStrategy()\` 则在运行时判别两种入参：选项对象 \`{ schema, strict }\` 与直接 schema。判别条件值得细读——\`"schema" in responseFormat\` 且**不是** Zod/Standard Schema（它们内部可能也有 schema 形属性）且**没有** \`type\` 字段（裸 JSON Schema 必有 type）才算选项对象（responses.ts:641-648）。\`type\` 字段判别与 \`__brand\` 负品牌是同一件事的两面：一个在运行时分流，一个在类型层互斥。

### 消费端走读：归一化不是一次性的，是每轮都跑的活水管线

归一化函数的消费方在 AgentNode 里，值得专门走读一遍，因为它揭示了几个容易误判的边界。\`#getResponseFormat\`（AgentNode.ts:173-235，commit 7704471）先解析模型——ConfigurableModel 包装要经 \`_getModelInstance()\` 拆出真实实例才传入 \`transformResponseFormat(responseFormat, undefined, resolvedModel)\`：**能力协商必须发生在真实模型对象上**，这正是 L97 说的「传字符串进去恒 false」的调用侧防线。注意第二个实参是 undefined——经由 createAgent 裸 schema 入口进来的策略不带 ToolStrategyOptions，toolMessageContent/handleError 只在用户显式构造策略实例时才存在。

分派结果只有两种形态：

\`\`\`ts
const isProviderStrategy = strategies.every(
  (format) => format instanceof ProviderStrategy
);
if (!isProviderStrategy) {
  return {
    type: "tool",
    tools: strategies
      .filter((f) => f instanceof ToolStrategy)
      .reduce((acc, f) => { acc[f.name] = f; return acc; },
        {} as Record<string, ToolStrategy>),
  };
}
return { type: "native", strategy: strategies[0] as ProviderStrategy };
\`\`\`

*— libs/langchain/src/agents/nodes/AgentNode.ts:190-235（commit 7704471，有裁剪）*

三个边界由此看清。**其一**，全量 ProviderStrategy 才走 native（注释：there can only be one provider strategy），native 形态只取 \`strategies[0]\`——消费端再次确认了「provider 单 schema」约束；否则按 \`format.name\` reduce 成名字→实例映射表，L96 说的「tool call 靠名字映射回策略实例」的现场就是这行 reduce。**其二**，归一化的 mixed types 抛错（responses.ts:392-395）保证了消费端拿到的数组要么全 provider 要么全 tool，\`every\` 检查是防线而不是修补——上游约束让下游可以放心做激进假设。**其三**，最容易被忽略的一点：baseHandler 里 \`getResponseFormat\` 是在**每次模型调用前**执行的（AgentNode.ts:383-383 附近，wrapModelCall 链内），且 responseFormat 可以来自 \`request.responseFormat\`——中间件能在 wrapModelCall 里动态改写这轮请求的 responseFormat。所以归一化不是构造期一次性的静态转换，而是执行环上每轮都重新协商的活水管线；给 wrapModelCall 中间件做「按轮切换输出 schema」这类高级玩法，底层支撑就是这里的每轮重跑。

### 本课小结

- transformResponseFormat 分派表：空值/哨兵 → []；策略实例 → 原样；三类 schema（Standard/Zod/裸 JSON）→ 能力协商双分支；数组 → 一律 ToolStrategy；其余 → 抛错。
- 数组分支不做能力协商（多 schema 需要「模型挑工具」，仅 tool calling 可表达）且强制同质，混合类型抛「list contains mixed types」。
- 三个类型防御各司其职：ResponseFormatUndefined 正哨兵、__brand?: never 负品牌、TypedToolStrategy 品牌数组（幻影字段承载 union 推断）。
- toolStrategy() 靠不传 model 恒走 Tool 策略；providerStrategy() 用 type 字段在运行时区分选项对象与裸 JSON Schema。
- 运行时的归一化讲完了；下一课 L99 进入类型层，看 createAgent 的 14 个重载如何在编译期表达同一张分派表。
`,
    null,
    [
      {
        text: 'responseFormat 传 Zod schema 数组（如 [zodA, zodB]）时，归一化结果是什么？',
        options: [
          '根据模型 profile.structuredOutput 能力选择 ProviderStrategy 或 ToolStrategy',
          '一律 map 成多个 ToolStrategy，不做能力协商',
          '一律 map 成多个 ProviderStrategy',
          '抛出错误，多 schema 不被支持',
        ],
        answer: 1,
        explain:
          'responses.ts:344-390 的数组分支里没有任何 useProviderStrategy 判断，三种同质数组（策略实例 / SerializableSchema / Zod / 裸 JSON）全部 map 成 ToolStrategy.fromSchema。原因：多 schema 需要「模型挑一个工具调用」，只有 tool calling 通道能表达，provider 原生通道一次只能接受一个 schema。',
        concept: 'lc-transform-response-format',
      },
      {
        text: '数组里同时混有 Zod schema 和裸 JSON Schema 对象时会怎样？',
        options: [
          '自动逐个识别并分别转换',
          '抛出 Invalid response format 错误，提示 list contains mixed types',
          '按第一个元素的类型统一处理其余元素',
          '静默忽略不合规的元素',
        ],
        answer: 1,
        explain:
          'responses.ts:392-395：四个 every 检查（全是策略实例、全是 SerializableSchema、全是 Zod、全是裸 JSON）都失败后，直接 throw `Invalid response format: list contains mixed types.`，错误消息明确要求所有元素同质。A 的「自动逐个识别」不存在——归一化刻意拒绝隐式混合。',
        concept: 'lc-transform-response-format',
      },
      {
        text: 'JsonSchemaFormat 类型里的 __brand?: never 起什么作用？',
        options: [
          '给对象打上序列化标记，便于 checkpoint 存储',
          '负品牌：让裸 JSON Schema 对象无法被误当作 ToolStrategy/ProviderStrategy 实例',
          '防止 JSON.stringify 循环引用',
          '标记该对象不可变',
        ],
        answer: 1,
        explain:
          'responses.ts:671-687：类型名旁注释写明「Brand to ensure this is not a ToolStrategy or ProviderStrategy」。策略实例不会有 __brand 字段，而 __brand?: never 让任何试图给它赋值的代码编译失败——用结构类型体系实现「排除性判别」。A/C/D 与该字段无关。',
        concept: 'lc-transform-response-format',
      },
      {
        text: '用户显式传 ResponseFormatUndefined 哨兵（或传 undefined）给 responseFormat 时，transformResponseFormat 返回什么？',
        options: [
          '抛出 Invalid response format',
          '返回 [new ProviderStrategy()]',
          '返回空数组 []',
          '返回 undefined',
        ],
        answer: 2,
        explain:
          'responses.ts:327-338：falsy 入参返回 []；带 __responseFormatUndefined 标记的哨兵对象也返回 []。哨兵的存在是为了在类型层区分「没传」与「显式传 undefined」（对应 createAgent 的两个不同重载，L99 展开），运行时两者都归约为无结构化输出。',
        concept: 'lc-transform-response-format',
      },
      {
        text: 'toolStrategy() 快捷工厂与直接传裸 Zod schema 给 createAgent 的关键区别是？',
        options: [
          '没有区别，完全等价',
          'toolStrategy() 跳过能力协商，强制走 Tool 策略；裸传 schema 则由模型 profile 决定默认策略',
          'toolStrategy() 只支持 JSON Schema，不支持 Zod',
          'toolStrategy() 会把 schema 注册为可见的公开工具',
        ],
        answer: 1,
        explain:
          'responses.ts:555-566：toolStrategy 的实现体直接调 transformResponseFormat(responseFormat, options) 且不传 model 参数——hasSupportForJsonSchemaOutput(undefined) 返回 false，于是必然得到 ToolStrategy。裸传 schema 时归一化管线会拿真实模型做能力协商（responses.ts:405）。C 错误（重载支持 Zod/Standard/JSON Schema 及其数组）；D 错误，extract 工具是隐藏注入的。',
        concept: 'lc-transform-response-format',
      },
    ],
    [
      [
        'ResponseFormatUndefined',
        '带 __responseFormatUndefined: true 标记的哨兵类型，表达「用户显式传了 undefined」，运行时归约为空数组',
      ],
      [
        'TypedToolStrategy',
        '带 _schemaType?: T 幻影字段的 ToolStrategy 数组品牌类型，承载 toolStrategy() 的 union 类型推断',
      ],
      [
        '负品牌（__brand?: never）',
        '用 never 类型的可选字段让裸 JSON Schema 对象在类型层无法冒充策略实例的结构类型技巧',
      ],
    ],
    [
      '在数组输入里混合 Zod、Standard Schema 与裸 JSON Schema——四个 every 全量同质检查失败会直接抛错，框架不做逐元素自动识别',
      '以为数组输入也会按模型能力协商策略——数组分支无条件走 ToolStrategy，能力协商只发生在单 schema 分支',
      '把 { schema, strict } 选项对象误传进需要裸 JSON Schema 的位置——运行时用 type 字段判别两者，混用可能落入错误分支',
    ],
  ),
  'framework',
)
