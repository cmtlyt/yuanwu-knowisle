import { L, withKind } from '../../course-builders.ts'

export const L100 = withKind(
  L(
    'L100',
    29,
    '类型级 reduce：CombineTools / CombineStreamTransformers 递归条件类型',
    3,
    ['L99'],
    ['lc-type-reduce'],
    [
      '能写出 InferMiddlewareToolsArray 的递归骨架（infer First/Rest + rest 展开 + 尾递归拼接）并解释双重守卫各自的防御目标',
      '能解释 [T] extends [readonly []] 包元组写法解决的分发误判问题',
      '能对比 CombineTools 与 ExtractZodArrayTypes 两个同构 reduce，说出「类型级 reduce」模式的基本形状',
    ],
    `### 上课的伏笔：CombineTools 从哪来

L99 看到每个 createAgent 重载的返回类型里，Tools 槽位填的都是 \`CombineTools<TTools, TMiddleware>\`——中间件贡献的工具在编译期被并入 agent 的类型指纹。本课拆它的定义（\`libs/langchain/src/agents/types.ts:148-220\`），核心结论：**这是一组「递归条件类型 + 可变元组 rest 展开」写成的类型级 reduce——把运行时 reduce 的头处理、尾递归、哨兵返回原样搬进了类型系统**。学完本课你不仅能读懂这两行定义，还能识别这个模式在 langchain 类型工具箱里的三次复用。

### 第一层：从单个中间件剥出工具类型

\`\`\`ts
export type InferMiddlewareTools<T extends AgentMiddleware> =
  T extends AgentMiddleware<any, any, any, infer TTools, any>
    ? TTools extends readonly (ClientTool | ServerTool)[]
      ? TTools
      : readonly []
    : readonly [];
\`\`\`

*— libs/langchain/src/agents/types.ts:148-153（commit 7704471）*

reduce 的「单元素处理函数」。\`AgentMiddleware\` 的第五个泛型槽位是工具元组，\`infer TTools\` 把它抽出来（index.ts 的中间件五泛型依次是 state/context/…/tools/…）。两层防御：\`T\` 不是 AgentMiddleware 时返回 \`readonly []\`；抽出来的 TTools 不是合法工具数组时也返回 \`readonly []\`——**防御式默认值让后续递归永远拿到合法输入**，这是整个类型族能安全组合的地基。

### 第二层：递归元组与双重守卫

\`\`\`ts
export type InferMiddlewareToolsArray<T extends readonly AnyAgentMiddleware[]> =
  T extends readonly []
    ? readonly []
    : T extends readonly [infer First, ...infer Rest]
      ? First extends AgentMiddleware
        ? Rest extends readonly AnyAgentMiddleware[]
          ? readonly [
              ...InferMiddlewareTools<First>,
              ...InferMiddlewareToolsArray<Rest>,
            ]
          : InferMiddlewareTools<First>
        : readonly []
      : readonly [];
\`\`\`

*— libs/langchain/src/agents/types.ts:171-183（commit 7704471）*

对照运行时 reduce 逐段读。**哨兵分支**：\`T extends readonly [] ? readonly []\`——元组耗尽返回空元组，等价于 reduce 的初始值。**递归分支**：\`readonly [infer First, ...infer Rest]\` 把元组拆成头与尾。**头部处理**：\`InferMiddlewareTools<First>\` 剥出本层工具。**尾递归**：\`...InferMiddlewareToolsArray<Rest>\` 处理剩余。**拼接**：\`readonly [...A, ...B]\` 把两层结果按顺序并成新元组——顺序信息全程保留，这正是 L99 强调 const 泛型保真元组的原因。最关键的是**双重守卫**：\`First extends AgentMiddleware\` 失败说明头元素根本不是中间件，返回 \`readonly []\` 整体短路；\`Rest extends readonly AnyAgentMiddleware[]\` 失败说明尾部不可继续递归，返回 \`InferMiddlewareTools<First>\` 提前终止。**守卫的价值在于给递归一条确定的终止路径**——没有它，畸形输入会让编译器沿着 infer 一路展开直到报 Type instantiation is excessively deep。

### 第三层：拼接出口与包元组技巧

\`\`\`ts
export type CombineTools<
  TAgentTools extends readonly (ClientTool | ServerTool)[],
  TMiddleware extends readonly AnyAgentMiddleware[],
> = readonly [...TAgentTools, ...InferMiddlewareToolsArray<TMiddleware>];

export type InferMiddlewareStreamTransformers<T extends AgentMiddleware> =
  T extends AgentMiddleware<any, any, any, any, infer TStreamTransformers>
    ? [TStreamTransformers] extends [readonly []]
      ? readonly []
      : TStreamTransformers extends ReadonlyArray<() => StreamTransformer<any>>
        ? TStreamTransformers
        : readonly []
    : readonly [];

export type CombineStreamTransformers<
  TAgentStreamTransformers extends ReadonlyArray<() => StreamTransformer<any>>,
  TMiddleware extends readonly AnyAgentMiddleware[],
> = readonly [
  ...TAgentStreamTransformers,
  ...InferMiddlewareStreamTransformersArray<TMiddleware>,
];
\`\`\`

*— libs/langchain/src/agents/types.ts:188-191, 158-165, 214-220（commit 7704471）*

\`CombineTools\` 本体只是**一次 rest 拼接**：agent 工具在前、中间件递归结果在后——递归逻辑全部委托给 \`InferMiddlewareToolsArray\`，出口类型保持薄。\`CombineStreamTransformers\` 与它完全同构，只是元素从工具换成了流式转换器工厂（用于推断 streamEvents v3 的 run.extensions 形状，types.ts:122-128 注释）。值得单独讲的是中间那行的 \`[TStreamTransformers] extends [readonly []]\`：中间件没注册流转换器时，槽位类型是 \`readonly []\`，但如果直接写 \`TStreamTransformers extends readonly []\`，当该参数是 union 时条件类型会**分发**——union 被拆散逐成员比较，某些成员判空、另一些不判空，结果意外展开。**包一层元组后，比较对象从「成员」变成「整个元组」，判断不可分发**，空元组哨兵判断才能稳定命中。这是条件类型工程里最常用的一个小技巧，值得记住。

### 同构复用：ExtractZodArrayTypes 也是 reduce

\`\`\`ts
export type ExtractZodArrayTypes<T extends readonly InteropZodType<any>[]> =
  T extends readonly [InteropZodType<infer A>, ...infer Rest]
    ? Rest extends readonly InteropZodType<any>[]
      ? A | ExtractZodArrayTypes<Rest>
      : A
    : never;
\`\`\`

*— libs/langchain/src/agents/types.ts:935-937（commit 7704471）*

同一个模式第三次出现，只是归并运算从「元组拼接」换成了「union 合并」：头元素 infer 出 Zod output 类型 A，尾部递归，中间用 \`|\` 归并，哨兵分支返回 never（union 的幺元，\`A | never === A\`）。L99 的重载 2 用它把 \`[zodA, zodB]\` 变成 output union。**三处复用、两种归并、同一骨架**——infer 拆头、守卫短路、递归尾部、哨兵返回。识别出这个骨架后，源码里任何新出现的递归条件类型都可以按「处理函数 / 归并运算 / 哨兵值 / 守卫」四件套快速读懂，这就是本课想交付的通用读法。

最后一个值得回答的问题：这些类型级 reduce 的结果真的有运行时落点吗？还是纯装饰？答案是前者。\`CombineStreamTransformers\` 的产出填进 \`AgentTypeConfig\` 的 StreamTransformers 槽位，该槽位的 JSDoc 写明用途：「Used to infer the shape of \`run.extensions\` on the stream returned by \`streamEvents(..., { version: "v3" })\`」（types.ts:122-128，commit 7704471）；ReactAgent 的流式文档同样注明 \`run.extensions\` 是「merged projections from user-supplied transformers」（ReactAgent.ts:1365）。也就是说，编译期递归剥出的转换器元组，最终决定了 v3 流事件上 \`run.extensions\` 各字段的静态类型——**类型级 reduce 不是类型体操表演，它把「中间件注册了哪些流转换器」这个运行时事实精确地搬进了编译期**。CombineTools 同理：合并后的工具元组类型支撑 \`agent.invoke\` 返回值的工具相关推断，写错工具名在编译期就会暴露。这也是为什么这些类型要写得如此防御严谨——它们是 API 类型契约的一等公民，不是内部辅助。

### 本课小结

- InferMiddlewareToolsArray 是类型级 reduce：infer First/Rest 拆头、每层剥工具、尾递归拼接、空元组哨兵返回，顺序全程保留。
- 双重守卫（First 与 Rest 的 extends 检查）给递归确定终止路径，防御畸形输入触发实例化过深。
- CombineTools/CombineStreamTransformers 本体只是 rest 拼接，递归全在 Infer*Array 里；\`[T] extends [readonly []]\` 包元组防 union 分发误判。
- ExtractZodArrayTypes 是同构 reduce 的第二次复用（归并运算换成 |，哨兵换成 never），识别「处理/归并/哨兵/守卫」四件套即可通读这类定义。
- 下一课转向类型工具箱的地基：InteropZodType 的 Zod v3/v4 互操作与 AgentTypeConfig 六槽位指纹、InferAgent* 反查族。
`,
    null,
    [
      {
        text: 'InferMiddlewareToolsArray 遍历中间件元组靠什么机制？',
        options: [
          'keyof 逐个枚举元组成员',
          'Mapped Type 映射每个元素',
          '可变元组的 rest 展开：T extends readonly [infer First, ...infer Rest] 拆出头元素递归处理剩余',
          '数组的索引签名访问 T[number]',
        ],
        answer: 2,
        explain:
          'types.ts:171-183：递归条件类型配 readonly [infer First, ...infer Rest] 的 rest 展开，每层处理 First、对 Rest 继续递归——这是 TypeScript 表达「类型级循环」的标准模式。A/C 的 keyof 与索引访问只能拿到 union，保不住顺序与分层；B 的 Mapped Type 无递归短路能力。',
        concept: 'lc-type-reduce',
      },
      {
        text: '递归里 Rest extends readonly AnyAgentMiddleware[] 这个守卫失败时返回什么？',
        options: [
          'never，让整个类型失效',
          '返回 InferMiddlewareTools<First>，提前终止递归',
          '编译器直接报 Type instantiation is excessively deep',
          '跳过该元素继续处理下一个',
        ],
        answer: 1,
        explain:
          'types.ts:176-181：Rest 通过守卫才继续递归拼接，失败则只返回当前层 First 的工具后停止。这是防御非法输入（元组里混入非中间件元素）的短路写法，防止递归失去终止条件导致实例化过深。C 的报错恰恰是没有这类守卫时的后果，而不是有了守卫的结果。',
        concept: 'lc-type-reduce',
      },
      {
        text: 'InferMiddlewareStreamTransformers 里 [TStreamTransformers] extends [readonly []] 为什么要包一层元组？',
        options: [
          '为了提升类型计算性能',
          '强制该类型变为只读',
          '避免裸类型参数在 extends 判断中被分发（union 拆散逐成员比较），让空元组判断按整体进行',
          'TypeScript 的语法强制要求',
        ],
        answer: 2,
        explain:
          'types.ts:158-165：若写 TStreamTransformers extends readonly []，当它是 union 时条件类型会按成员分发，判断结果可能逐成员不同导致意外展开；包一层元组后比较对象变成整个元组类型，判断不可分发。这是空元组哨兵判断的标准写法，types.ts:160 的 [TStreamTransformers] extends [readonly []] 正是此用。',
        concept: 'lc-type-reduce',
      },
      {
        text: 'CombineTools<TAgentTools, TMiddleware> 的合并顺序是？',
        options: [
          '中间件工具在前，agent 工具在后',
          'agent 工具在前，中间件工具按元组顺序追加在后',
          '按工具名排序去重合并',
          '不确定，取决于泛型推断顺序',
        ],
        answer: 1,
        explain:
          'types.ts:188-191：CombineTools = readonly [...TAgentTools, ...InferMiddlewareToolsArray<TMiddleware>]——agent 自己的工具元组在前，中间件递归剥出的工具按中间件声明顺序拼在后面。A/B/D 都与定义不符；该类型也不做去重。',
        concept: 'lc-type-reduce',
      },
    ],
    [
      [
        '递归条件类型',
        '在条件类型的真分支里引用类型自身、靠元组逐层缩小实现递归的 TypeScript 技术，是类型级 reduce 的载体',
      ],
      [
        '元组 rest 展开',
        'readonly [infer First, ...infer Rest] 写法，把元组类型拆成头元素与剩余元组，支撑递归推进',
      ],
      [
        '类型级 reduce',
        '把运行时 reduce 的「头处理 + 尾递归」搬进类型系统：每层抽取信息并拼接，直到元组耗尽返回哨兵值',
      ],
    ],
    [
      '以为 CombineTools 在运行时合并数组——它是纯类型运算，运行时的工具合并发生在 ReactAgent 构造器，两者只保证结果对应',
      '递归条件类型漏掉 Rest 守卫——元组内容不符合约束时递归没有短路出口，容易触发 Type instantiation is excessively deep',
      '对可能是 union 的类型参数直接 extends readonly [] 做空元组判断——分发会让判断逐成员进行，必须包一层元组再比较',
    ],
  ),
  'theory',
)
