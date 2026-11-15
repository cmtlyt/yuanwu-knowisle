import { L, withKind } from '../../course-builders.ts'

export const L99 = withKind(
  L(
    'L99',
    29,
    'createAgent 的 const 泛型与 14 重载分派',
    3,
    ['L37'],
    ['lc-const-generics'],
    [
      '能解释 const 类型参数如何保持数组字面量的元组与成员字面量类型，以及它对 CombineTools 递归展开的必要性',
      '能按 responseFormat 形态列出 createAgent 14 个重载签名的分派逻辑（单 Zod / Zod 数组 / JSON Schema / 策略实例 / 无 / 显式 undefined）',
      '能说出实现签名体只有 return new ReactAgent(params) 一行，理解重载是纯类型层分派',
    ],
    `### 从全景回到签名内部

L37 拆 createAgent 全景时，我们把重载当作参数形态的分类表浏览过一遍；本课进入签名内部，讲清两件事：**const 类型参数如何让字面量保真，14 个重载签名如何按 responseFormat 形态完成编译期分派**。先校准口径：源码注释编号 Overload 1 到 Overload 13 共 13 个声明重载，加上末尾唯一的实现签名，createAgent 对外一共 14 个函数签名——课程统一按「14 个重载」计。而实现签名体只有一行 \`return new ReactAgent(params)\`（index.ts:672-702），这决定了本课讨论的一切都发生在编译期。

### const 类型参数：不让字面量塌缩

\`\`\`ts
// Overload 1: With responseFormat as single InteropZodType
export function createAgent<
  StructuredResponseFormat extends Record<string, any> = Record<string, any>,
  TStateSchema extends StateDefinitionInit | undefined = undefined,
  ContextSchema extends AnyAnnotationRoot | InteropZodObject =
    AnyAnnotationRoot,
  const TMiddleware extends readonly AnyAgentMiddleware[] =
    readonly AnyAgentMiddleware[],
  const TTools extends readonly (ClientTool | ServerTool)[] = readonly (
    | ClientTool
    | ServerTool
  )[],
  const TStreamTransformers extends ReadonlyArray<
    () => StreamTransformer<any>
  > = readonly [],
>(
  params: CreateAgentParams<
    StructuredResponseFormat, TStateSchema, ContextSchema,
    InteropZodType<StructuredResponseFormat>
  > & {
    responseFormat: InteropZodType<StructuredResponseFormat>;
    middleware?: TMiddleware;
    tools?: TTools;
    streamTransformers?: TStreamTransformers;
  }
): ReactAgent<
  AgentTypeConfig<
    StructuredResponseFormat, TStateSchema, ContextSchema, TMiddleware,
    CombineTools<TTools, TMiddleware>,
    CombineStreamTransformers<TStreamTransformers, TMiddleware>
  >
>;
\`\`\`

*— libs/langchain/src/agents/index.ts:176-211（commit 7704471）*

签名里六个类型参数，其中三个带 \`const\` 前缀——\`const TMiddleware\`、\`const TTools\`、\`const TStreamTransformers\`。这是 TS 5.0 的 const 类型参数特性：推断时按「尽可能窄」的原则，把传入的数组字面量保持为元组、把成员保持为字面量类型。没有 const 时，\`tools: [searchTool]\` 会被放宽成 \`(ClientTool | ServerTool)[]\`；有了 const，它保持为 \`readonly [typeof searchTool]\`。为什么这很重要？因为返回类型里的 \`CombineTools<TTools, TMiddleware>\`（index.ts:208-209）要在类型级把这个元组与从中间件剥出的工具元组拼接——**递归 reduce（L100）要求输入是有分层的元组，塌缩成一维联合数组后剥层就无从谈起**。每个 const 参数还配了宽类型默认值，未传时兜底为宽只读数组，保证空参调用也能通过约束检查。

### 14 个签名的分派逻辑：responseFormat 形态驱动

14 个签名几乎全部围绕一个参数的形态展开——responseFormat。按注释编号归组：

| 重载 | responseFormat 形态 | StructuredResponseFormat / Response 槽位 |
|---|---|---|
| 1 | 单个 Zod 对象 | 从 Zod output 直接推断（index.ts:176-211） |
| 2 | Zod 数组 | ExtractZodArrayTypes 递归出的 union（index.ts:214-253） |
| 3 / 4 / 5 | JSON Schema / 其数组 / 二者 union | Record<string, unknown>（index.ts:256-364） |
| 6 / 7 | SerializableSchema / 其数组 | Record<string, unknown>（index.ts:367-438） |
| 8 | TypedToolStrategy（品牌数组） | 经幻影字段保真 union（index.ts:441-476） |
| 9 / 10 | ToolStrategy / ProviderStrategy 实例 | 从实例泛型参数取（index.ts:479-552） |
| 11 | 不传 responseFormat | ResponseFormatUndefined（index.ts:555-591） |
| 12 | 显式 responseFormat: undefined | ResponseFormatUndefined（index.ts:594-631） |
| 13 | failsafe：宽 ResponseFormat | 泛型推断兜底（index.ts:634-669） |
| 实现签名 | 任意 | 一行 new ReactAgent(params)（index.ts:672-702） |

重点看重载 2 的 union 推断：

\`\`\`ts
// Overload 2: With responseFormat as array of InteropZodTypes (infers union type)
export function createAgent<
  StructuredResponseFormat extends readonly InteropZodType<any[]>,
  ...
>(
  params: CreateAgentParams<
    ExtractZodArrayTypes<StructuredResponseFormat> extends Record<string, any>
      ? ExtractZodArrayTypes<StructuredResponseFormat>
      : Record<string, any>,
    TStateSchema, ContextSchema, StructuredResponseFormat
  > & { responseFormat: StructuredResponseFormat; ... }
): ReactAgent<AgentTypeConfig<...>>;
\`\`\`

*— libs/langchain/src/agents/index.ts:214-253（裁剪，commit 7704471）*

与重载 1 的差别在两处：\`StructuredResponseFormat\` 的约束从 \`Record<string, any>\` 换成 \`readonly InteropZodType<any[]>\`（数组本身成为泛型参数），且 Response 槽位不是直接用它，而是先经 \`ExtractZodArrayTypes\` 递归抽取——该类型按「infer 出第一个元素的 output，再递归处理剩余元组」的方式合成 union（types.ts:935-937），与 L100 要讲的 reduce 模式同构。语义依据在 L98 埋过：多 schema 意味着模型挑一个调用，所以类型层表达为 union 而不是数组。

再看重载 11 与 12 的微妙差别：

\`\`\`ts
// Overload 11: Without responseFormat property at all
>(
  params: Omit<
    CreateAgentParams<ResponseFormatUndefined, TStateSchema, ContextSchema, never>,
    "responseFormat"
  > & { middleware?: TMiddleware; tools?: TTools; ... }
): ReactAgent<AgentTypeConfig<ResponseFormatUndefined, ...>>;

// Overload 12: With responseFormat explicitly undefined
>(
  params: Omit<CreateAgentParams<ResponseFormatUndefined, ...>, "responseFormat">
    & { responseFormat?: undefined; middleware?: TMiddleware; ... }
): ReactAgent<AgentTypeConfig<ResponseFormatUndefined, ...>>;
\`\`\`

*— libs/langchain/src/agents/index.ts:555-631（裁剪，commit 7704471）*

两个重载都把 Response 槽位填成 \`ResponseFormatUndefined\`（L98 的哨兵类型），差别只在参数面：重载 11 用 \`Omit\` 把 responseFormat 从参数类型里整个移除，重载 12 保留一个 \`responseFormat?: undefined\`。**「没传」与「显式传 undefined」在类型层是两个入口**，运行时则被 transformResponseFormat 归约为同一结果（L98）。类型上如此细分的收益是错误提示精确：用户传了一个非法值给 responseFormat 时，编译器能指向正确的重载报错，而不是把所有形态混在一个宽松签名里。

### 返回类型：CombineTools 把中间件的工具并进类型指纹

每个重载的返回类型都是同一个模板：\`ReactAgent<AgentTypeConfig<Response, State, Context, TMiddleware, CombineTools<TTools, TMiddleware>, CombineStreamTransformers<TStreamTransformers, TMiddleware>>>\`。注意 Tools 槽位填的从来不是裸的 \`TTools\`，而是 \`CombineTools<TTools, TMiddleware>\`——**中间件贡献的工具在编译期就被并进 agent 的类型指纹**，\`InferAgentTools<typeof agent>\` 拿到的是合并后的完整清单。这个类型级合并先于任何运行时行为：运行时工具注册发生在 ReactAgent 构造器里，而类型层在 createAgent 的返回类型上就已经完成。\`CombineTools\` 与 \`CombineStreamTransformers\` 的递归定义是下一课的全部内容——它们是 langchain 类型工具箱里「类型级 reduce」的代表作。

### 本课小结

- 口径校准：createAgent 对外共 14 个函数签名——注释编号 Overload 1–13 的声明重载加实现签名；实现体仅 \`return new ReactAgent(params)\`，重载是纯编译期分派。
- const 类型参数保真三个数组字面量的元组结构，是 CombineTools 递归展开的编译期前提。
- 14 个签名按 responseFormat 形态分组：单 Zod 直接推断、Zod 数组经 ExtractZodArrayTypes 出 union、JSON Schema 与 Standard Schema 降到 Record、策略实例从泛型取、不传与显式 undefined 分别对应重载 11/12 但都落到 ResponseFormatUndefined。
- 返回类型的 Tools 槽位永远是 CombineTools<TTools, TMiddleware>：中间件工具的类型合并先于运行时注册。
- 下一课拆 CombineTools 的定义——递归条件类型 + 元组 rest 展开的类型级 reduce。
`,
    null,
    [
      {
        text: 'createAgent 泛型列表里的 const TMiddleware / const TTools / const TStreamTransformers，const 修饰符的作用是？',
        options: [
          '让参数在运行时被 Object.freeze 冻结',
          '让传入的数组字面量推断为最窄的元组类型，成员保持字面量而不放宽为联合数组',
          '让这些参数可以省略实参',
          '只是一种命名约定，没有类型效果',
        ],
        answer: 1,
        explain:
          '这是 TS 5.0 的 const 类型参数特性：加在类型参数上的 const 让推断按「尽可能窄的字面量」进行，[toolA, toolB] 推断为 readonly [typeof toolA, typeof toolB] 而不是 (ClientTool|ServerTool)[]。L100 的 CombineTools 递归要按「头元素 + 剩余元组」剥层，元组塌缩会让 reduce 拿不到分层信息。A 是运行时概念，const 类型参数是纯编译期行为。',
        concept: 'lc-const-generics',
      },
      {
        text: 'responseFormat 传 [zodA, zodB]（Zod schema 数组）时，返回类型里 Response 槽位是什么？',
        options: [
          '两个 schema 的 output 类型组成的 union（经 ExtractZodArrayTypes 递归抽取）',
          '由两个 output 组成的数组类型',
          '只有第一个 schema 的 output 类型',
          'Record<string, any> 兜底',
        ],
        answer: 0,
        explain:
          '重载 2（index.ts:214-253）把 StructuredResponseFormat 约束为 readonly InteropZodType<any>[]，再用 ExtractZodArrayTypes<StructuredResponseFormat> 抽 union——该类型按「infer A + 递归 Rest」逐元素 infer 出 output 再用 | 合并（types.ts:935-937）。B 是数组思路，但多 schema 的语义是「模型挑一个」，结果是 union 不是数组。',
        concept: 'lc-const-generics',
      },
      {
        text: '不传 responseFormat 时，返回类型的 Response 槽位是什么？',
        options: ['Record<string, any>', 'undefined', 'ResponseFormatUndefined（哨兵类型）', 'never'],
        answer: 2,
        explain:
          '重载 11（index.ts:555-591）的参数类型用 Omit<CreateAgentParams<...>, "responseFormat"> 把 responseFormat 从参数面移除，返回 AgentTypeConfig 的 Response 槽位填 ResponseFormatUndefined——L98 讲过的哨兵类型。运行时结果里 structuredResponse 不存在。重载 12 则处理显式传 responseFormat: undefined 的情况，两者在类型层是不同入口。',
        concept: 'lc-const-generics',
      },
      {
        text: 'createAgent 的 14 个重载在运行时有几条执行路径？',
        options: [
          '14 条，每个重载各自编译不同的图',
          '只有一条：实现签名体就是 return new ReactAgent(params)',
          '两条：有 responseFormat 与没有 responseFormat 各一条',
          '取决于传入的参数形态，动态选择',
        ],
        answer: 1,
        explain:
          'index.ts:672-702：实现签名的函数体只有一行 return new ReactAgent(params)。所有重载签名都是纯类型层分派面，编译后消失；运行时的差异处理全部发生在 ReactAgent 构造器与归一化管线里。这也是重载与条件分支的本质区别：重载影响类型检查，不影响执行流。',
        concept: 'lc-const-generics',
      },
    ],
    [
      [
        'const 类型参数',
        'TS 5.0 特性：类型参数前的 const 修饰让字面量推断保持最窄元组/字面量类型，createAgent 用于保真 tools/middleware/streamTransformers 三个数组参数',
      ],
      [
        'ExtractZodArrayTypes',
        'types.ts:935-937 的递归条件类型，从 Zod schema 元组逐元素 infer output 类型并合成 union',
      ],
      [
        'ResponseFormatUndefined',
        '「未配置结构化输出」的哨兵类型，Response 槽位的默认占位（responses.ts:28-30）',
      ],
    ],
    [
      '把 14 个重载当成 14 条运行时分支——重载是纯编译期分派，运行时只有 new ReactAgent(params) 一条路径',
      '工具/中间件数组先存进变量再传入（或显式标注宽类型），导致 const 推断失效、元组塌缩，CombineTools 的类型合并随之退化',
      '以为 responseFormat: undefined 与不传 responseFormat 是同一个重载——它们分别对应重载 12 与重载 11 两个不同入口，但运行时行为一致',
    ],
  ),
  'theory',
)
