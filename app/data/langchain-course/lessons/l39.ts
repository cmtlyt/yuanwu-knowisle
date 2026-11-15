import { L, withKind } from '../../course-builders.ts'

export const L39 = withKind(
  L(
    'L39',
    11,
    '泛型参数推导：TMiddleware/TTools 的 const 参数如何收集类型',
    3,
    ['L37'],
    ['lc-generics-inference'],
    [
      '能解释 const 类型参数修饰符如何让 TS 从数组字面量推断出元组与字面量类型，以及这对 TMiddleware/TTools 收集工具名的意义',
      '能画出 CombineTools 的类型级拼接链路：TAgentTools + InferMiddlewareToolsArray<TMiddleware> 的递归展开过程',
      '能使用 ~agentTypes 品牌与 ResolveAgentTypeConfig/InferAgentState 等反查族从 agent 实例反向提取类型',
    ],
    `### 开篇：14 个重载共用的类型引擎

L37 的总表里每个重载返回的都是 \`ReactAgent<AgentTypeConfig<...>>\`，L38 拆了其中 Response 这一条轴。本课补齐剩下的引擎零件：六个泛型参数如何协同、\`const\` 修饰符为什么是整个推导体系的基石、工具与中间件的类型如何在类型层拼接、以及反向从 agent 实例提取类型的反查族。核心结论：**createAgent 的类型系统本质是一条「正向收集 + 打包传递 + 反向解包」的流水线，const 泛型负责收集的保真度**。难度 3，概念较抽象，建议对照源码逐段读。

### const 类型参数：保住字面量的关键修饰符

回到任意一个重载的签名头部（index.ts:181-189）：

\`\`\`ts
const TMiddleware extends readonly AnyAgentMiddleware[] =
  readonly AnyAgentMiddleware[],
const TTools extends readonly (ClientTool | ServerTool)[] = readonly (
  | ClientTool
  | ServerTool
)[],
const TStreamTransformers extends ReadonlyArray<() => StreamTransformer<any>> =
  readonly [],
\`\`\`

*— libs/langchain/src/agents/index.ts:181-189（commit 7704471）*

三个数组型泛型都带 \`const\` 前缀，这是 TypeScript 5.0 引入的 const 类型参数。没有它时，\`tools: [searchTool]\` 里的数组会被推断为宽泛的元素类型数组；有它时，TS 把调用点字面量按 \`as const\` 的规则推断——数组变成 readonly 元组、元素保留最精确的实例类型。对 createAgent 的意义直接而具体：\`CombineTools<TTools, TMiddleware>\` 拼接出的元组里每个位置都对应一个具体工具类型，随后 \`ToolsToMessageToolSet\`（types.ts:260-266）用映射类型把每个工具的 \`name\` 字面量作为键、输入输出类型作为值——**invoke 返回状态里 \`messages\` 的 tool_calls 类型精确到工具名，源头就在这里**。注意约束里反复出现的 \`readonly\`：与 const 推断产物（readonly 元组）保持一致，避免「可变数组实参赋给 readonly 元组形参」的矛盾。三个默认值（\`readonly []\` 等）让「不传」也有确定的类型形状，而不是 undefined 污染下游。

### 类型级 reduce：CombineTools 的递归拼接

tools 数组有两个来源：createAgent 的 params，以及每个中间件自带的 \`tools\` 字段。运行时的拼接在 ReactAgent.ts:225-228（\`middlewareTools\` flatMap 后与 \`options.tools\` 合并成 toolClasses）；类型层的等价物是 types.ts 里的两个定义：

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

export type CombineTools<
  TAgentTools extends readonly (ClientTool | ServerTool)[],
  TMiddleware extends readonly AnyAgentMiddleware[],
> = readonly [...TAgentTools, ...InferMiddlewareToolsArray<TMiddleware>];
\`\`\`

*— libs/langchain/src/agents/types.ts:171-191（commit 7704471）*

这是「类型级 reduce」的标准写法：空元组是递归基（返回 \`readonly []\`），\`[infer First, ...infer Rest]\` 把元组拆头尾，对 First 用 \`AgentMiddleware<...infer TTools, ...>\` 模式提取该中间件声明的工具类型，尾部递归，最后 spread 拼接。\`CombineStreamTransformers\`（types.ts:214-220）用完全相同的骨架处理中间件的 streamTransformers。理解这组类型的要点是把它当**编译期执行的函数**读：输入是类型、输出是类型、递归是「循环」。这组机械在 L100 还会更深地展开（CombineTools/CombineStreamTransformers 与类型包的组合细节），本课只需建立「类型级拼接与运行时拼接一一对应」的心智模型。

### 类型包：AgentTypeConfig 收拢六个参数

所有推导结果最终被打包进 \`AgentTypeConfig\`（types.ts:93-129）——一个带六个类型参数的接口，字段命名直接：\`Response\`、\`State\`、\`Context\`、\`Middleware\`、\`Tools\`、\`StreamTransformers\`。ReactAgent 类只接受这一个泛型参数（ReactAgent.ts:164-173），内部全部通过 \`Types["Response"]\`、\`Types["Tools"]\` 这样的索引访问解包。这个「类型包（type bag）」模式的收益在源码注释里写得直白：**新增类型参数时不必修改多处函数签名**——只要 AgentTypeConfig 加一个字段，ReactAgent 与 createAgent 的签名结构保持稳定。对照 L37 的重载表：每个重载「重写」的只是 params 的 responseFormat 约束，而返回类型中的类型包结构完全同构，这就是重载能批量复制的原因。

### 反向解包：~agentTypes 品牌与反查族

正向流水线结束后，用户拿到的是一个 \`ReactAgent<某个具体类型包>\`。反向提取靠两件套。第一件是品牌幽灵属性：

\`\`\`ts
/**
 * Type marker for extracting the AgentTypeConfig from a ReactAgent instance.
 * This is a phantom property used only for type inference.
 * @internal
 */
declare readonly "~agentTypes": Types;
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:174-179（commit 7704471）*

\`declare\` 意味着这个属性只存在于类型世界，运行时零开销。第二件是反查条件类型 \`ResolveAgentTypeConfig<T>\`（types.ts:284-292）：\`T extends { "~agentTypes": infer Types }\` 从实例类型里抓出类型包，否则尝试 \`T extends AgentTypeConfig\` 直接命中（允许传类型包本身或实例两种用法）。其上是反查族：\`InferAgentResponse\`、\`InferAgentStateSchema\`、\`InferAgentState\`、\`InferAgentContextSchema\` 等（types.ts:311-381），全部是 \`InferAgentType<T, K>\` 的单字段别名。实用价值最高的两个：\`InferAgentState<typeof agent>\` 给出 invoke 返回的完整合并状态（含中间件状态），\`InferAgentResponse<typeof agent>\` 给出 structuredResponse 的精确类型。写测试与泛型封装时，这是官方推荐的类型出口，胜过手写条件类型。

### 本课小结

- **const 类型参数是保真源头**：三个 \`const\` 修饰让数组字面量推断为 readonly 元组，工具实例与名字以字面量类型保留，是后续所有映射（ToolsToMessageToolSet 等）的前提。
- **类型级 reduce 双写**：CombineTools/CombineStreamTransformers 在类型层拼接 agent 与中间件的工具/转换器，运行时 ReactAgent.ts:225-228 有逐点对应的拼接代码。
- **类型包模式**：AgentTypeConfig 把六个类型参数收拢为 ReactAgent 的单泛型，签名因此稳定、重载因此可复制。
- **反查族出口**：\`~agentTypes\` 声明属性 + ResolveAgentTypeConfig + InferAgentState/InferAgentResponse，从实例反查类型零运行时成本。
- 下一课进入运行时世界：ReactAgent 类骨架——#graph 私有字段、#toolBehaviorVersion、defaultConfig，以及类上那些「看起来像字段实际是委托」的成员。
`,
    null,
    [
      {
        text: 'TMiddleware/TTools 前面的 const 修饰符起什么作用？',
        options: [
          '让运行时参数变成只读数组，禁止原地修改',
          '让 TS 从数组字面量推断出元组类型和元素的字面量类型（而不是宽泛的 string[]），使工具名等字面量得以保留',
          '只是文档性标注，无实际类型效果',
          '把泛型参数变成常量，编译后内联',
        ],
        answer: 1,
        explain:
          'const 类型参数是 TS 5.0+ 的纯类型层修饰符：推断时把数组字面量当作 readonly 元组、把字符串当作字面量类型。对 createAgent 的意义是 tools 数组里每个工具实例的具体类型与名字都被保留，CombineTools 拼接后 ToolsToMessageToolSet 才能把字面量名映射到 MessageToolDefinition。选项 A 错在它不是运行时机制；选项 C 错在有实质推断效果；选项 D 把类型层概念误当编译器优化。',
        concept: 'lc-generics-inference',
      },
      {
        text: 'CombineTools<TAgentTools, TMiddleware> 的定义本质是什么？',
        options: [
          '运行时的数组 concat 调用',
          '类型级的元组展开：readonly [...TAgentTools, ...InferMiddlewareToolsArray<TMiddleware>]，后者用递归条件类型逐个中间件提取 tools',
          '一个 Map 数据结构，按中间件名索引工具',
          'interface 的 extends 合并',
        ],
        answer: 1,
        explain:
          'types.ts:188-191 就是这一行元组展开；InferMiddlewareToolsArray（types.ts:171-183）用 `T extends readonly [infer First, ...infer Rest]` 逐位拆数组、对每个元素用 AgentMiddleware 的 infer TTools 提取工具类型并递归拼接。它是「类型级 reduce」。选项 A 混淆了类型与运行时——运行时确有对应拼接（ReactAgent.ts:225-228 的 toolClasses），但 CombineTools 本身不执行任何代码；选项 C 无据；选项 D 的 extends 合并是对象类型操作，不适用于元组拼接。',
        concept: 'lc-generics-inference',
      },
      {
        text: 'declare readonly "~agentTypes": Types 这行代码在运行时产生了什么？',
        options: [
          '一个真实的原型属性，可被 JSON 序列化',
          '什么都不产生：declare 只做类型声明，幽灵属性纯粹供 ResolveAgentTypeConfig 从实例类型反查类型包',
          '一个 Symbol 属性，通过 Symbol.for 注册',
          '一个 getter，惰性返回 AgentTypeConfig 的运行时对象',
        ],
        answer: 1,
        explain:
          'ReactAgent.ts:179 用 declare 声明该字段——declare 修饰的类属性不会进入构造器与原型，运行时完全不存在。它的唯一用途是被 ResolveAgentTypeConfig 的 `T extends { "~agentTypes": infer Types }` 模式捕获，实现「从 typeof agent 反查类型包」。选项 A 错在 declare 无运行时产物；选项 C 混淆了另一个机制——L05 讲过的 Symbol.for 跨包判型是 BaseMessage 的方案，与此无关；选项 D 错在不存在 getter，AgentTypeConfig 是纯类型，没有运行时对象可言。',
        concept: 'lc-generics-inference',
      },
      {
        text: '想从 agent 实例（typeof agent）提取 invoke 返回的完整合并状态类型，应该用哪个？',
        options: [
          'InferAgentStateSchema<typeof agent>',
          'InferAgentState<typeof agent>——它合并 agent 自身 stateSchema 与所有中间件的 stateSchema',
          'InferAgentResponse<typeof agent>',
          'typeof agent.invoke',
        ],
        answer: 1,
        explain:
          'InferAgentState（types.ts:366-367）= InferSchemaValue<State> & InferMiddlewareStates<Middleware>，正是「invoke 返回值」的完整形状。选项 A 只返回传入的 stateSchema 原始类型，不含中间件状态与内置字段；选项 C 是 Response 泛型的反查，答非所问；选项 D 拿到的是方法签名而不是状态类型。反查族背后都走 ResolveAgentTypeConfig → "~agentTypes" 品牌这一条路。',
        concept: 'lc-generics-inference',
      },
    ],
    [
      [
        'const 类型参数',
        'TypeScript 5.0+ 的泛型修饰符：推断时保留字面量与元组形状，等价于调用点加 as const 的推断效果，仅影响类型不影响运行时',
      ],
      [
        'AgentTypeConfig',
        '六个类型参数的「类型包」接口：Response/State/Context/Middleware/Tools/StreamTransformers，ReactAgent 的唯一泛型参数',
      ],
      [
        'CombineTools',
        '类型级工具拼接：readonly [...TAgentTools, ...InferMiddlewareToolsArray<TMiddleware>]，与运行时 toolClasses 拼接逐点对应',
      ],
      [
        '~agentTypes',
        'ReactAgent 上的 declare 幽灵属性（ReactAgent.ts:179），供 ResolveAgentTypeConfig 从实例类型反查类型包；运行时不存在',
      ],
      [
        'InferAgentState',
        '反查族成员：从 agent 实例或类型包提取「agent 自身 + 全部中间件」合并后的完整状态类型',
      ],
    ],
    [
      '在工具数组变量上用宽泛注解（如 const tools: StructuredTool[] = [...]）——字面量类型在赋值处就被磨平，const 泛型无从恢复；应直接传字面量数组或用 satisfies 保留形状',
      '以为 InferMiddlewareToolsArray 是运行时遍历——它是递归条件类型，靠元组 infer 逐位展开；数组过长时类型计算量随之增长',
      '手动 new ReactAgent(params) 绕过 createAgent——实现签名外的构造调用拿不到重载层的推导，Types 会落到默认的宽泛配置，类型精确度全失',
    ],
  ),
  'theory',
)
