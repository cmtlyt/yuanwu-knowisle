import { L, withKind } from '../../course-builders.ts'

export const L37 = withKind(
  L(
    'L37',
    11,
    'createAgent 全景：一行实现体到 14 个重载',
    3,
    ['L19'],
    ['lc-create-agent'],
    [
      '能说出 createAgent 的 14 个重载按 responseFormat 形态的完整分类，并指出实现体只有一行 return new ReactAgent(params)',
      '能从 index.ts 的导出面清单读出 agents 模块的公共 API 边界（toolStrategy/providerStrategy/createMiddleware/JumpToTarget/Runtime 等）',
      '能解释「类型在外、运行时在内」的分层设计：重载层负责类型分派，ReactAgent 负责图编译与执行',
    ],
    `### 开篇：模块四的入口，也是全课的第一条主线

从本课起进入模块四：createAgent 与 ReactAgent 的完整解剖。上一阶段（模块三）我们看完 Runnable 组合层的机制，现在终于走到 1.x 主包的产品重心——\`createAgent\`。本课先建立全景坐标：这个函数的类型签名有五百行、运行时实现只有一行；**理解它的正确姿势是把「类型层」与「运行时层」分开读**——类型层的 14 个重载负责把用户的参数形状翻译成精确的返回类型，运行时层把一切交给 \`ReactAgent\` 构造器去编译成图。全课统一口径先立住：\`createAgent\` 是 camelCase 的 TS 导出，14 个重载，实现体一行 \`return new ReactAgent(params)\`，后面所有课都基于这个事实展开。

### 一行实现体：类型在外，运行时在内

先看真相。\`libs/langchain/src/agents/index.ts\` 前 670 行全是 JSDoc 与重载签名，真正干活的代码是文件尾部这十几行：

\`\`\`ts
// Implementation
export function createAgent<
  StructuredResponseFormat extends Record<string, any>,
  TStateSchema extends StateDefinitionInit,
  ContextSchema extends AnyAnnotationRoot | InteropZodObject,
  TMiddleware extends readonly AnyAgentMiddleware[],
  TTools extends readonly (ClientTool | ServerTool)[],
  TStreamTransformers extends ReadonlyArray<() => StreamTransformer<any>>,
>(
  params: CreateAgentParams<
    StructuredResponseFormat,
    TStateSchema,
    ContextSchema,
    any
  >
): ReactAgent<AgentTypeConfig<...>> {
  return new ReactAgent(params);
}
\`\`\`

*— libs/langchain/src/agents/index.ts:672-702（commit 7704471）*

实现签名本身也是一个「兜底签名」：它的 \`responseFormat\` 参数类型是 \`any\`，前面的 14 个重载负责按具体形态收紧类型。这一行的含义比看上去深——**createAgent 不做任何运行时决策**。没有参数校验、没有 schema 归一化、没有模型初始化，全部工作下推到 \`ReactAgent\` 构造器（\`ReactAgent.ts:189-722\`）。这是一种典型的「门面函数」设计：\`index.ts\` 的五百行签名是给类型检查器看的 API 合同，\`ReactAgent\` 是真正的引擎。后续 L41 会逐段走读构造器里的编译流程。

### 14 个重载的分类学：按 responseFormat 形态分派

14 个重载（index.ts:176-669，\`grep -c "export function createAgent" index.ts\` = 14）乍看眼花，其实分派轴只有一个：\`responseFormat\` 参数的类型形态。除重载 11（完全省略 responseFormat）外，每个重载的 params 都包含一个具名的 responseFormat 字段，类型检查器按它的形状匹配到第一份兼容签名。完整分类如下表：

| 重载 | responseFormat 形态 | 返回类型中的 Response 泛型 |
|---|---|---|
| 1 | 单个 \`InteropZodType\`（Zod 对象） | \`StructuredResponseFormat\`（精确推导） |
| 2 | \`InteropZodType[]\`（Zod 数组） | \`ExtractZodArrayTypes<...>\` 提取的联合 |
| 3 | 单个 \`JsonSchemaFormat\` | \`Record<string, unknown>\`（无精确推导） |
| 4 | \`JsonSchemaFormat[]\` | \`Record<string, unknown>\` |
| 5 | \`JsonSchemaFormat \\| JsonSchemaFormat[]\` | \`Record<string, unknown>\` |
| 6 | 单个 \`SerializableSchema\` | \`Record<string, unknown>\` |
| 7 | \`SerializableSchema[]\` | \`Record<string, unknown>\` |
| 8 | \`TypedToolStrategy<StructuredResponseFormat>\` | 精确推导 |
| 9 | \`ToolStrategy\` 实例 | 精确推导 |
| 10 | \`ProviderStrategy\` 实例 | 精确推导 |
| 11 | **Omit 掉 responseFormat**（不传） | \`ResponseFormatUndefined\` |
| 12 | \`responseFormat?: undefined\`（显式传 undefined） | \`ResponseFormatUndefined\` |
| 13 | 其他 \`ResponseFormat\` 值（兜底） | \`StructuredResponseFormat\` |

这张表值得记住的规律有三条。第一，**Zod 与策略对象能拿到精确推导，JSON Schema 不能**——因为 JSON Schema 是普通对象，类型系统无法从 \`{ type: "object", properties: {...} }\` 反推运行时形状，所以重载 3-7 的 Response 一律退化为 \`Record<string, unknown>\`。第二，重载 11 与 12 是「无结构化输出」的两种写法：不写字段与显式写 \`undefined\` 是两条不同的类型路径，但殊途同归于 \`ResponseFormatUndefined\`——这个哨兵类型会让 \`structuredResponse\` 从状态类型中被条件剔除。第三，重载 8-10 是给 \`toolStrategy()\`/\`providerStrategy()\` 工厂准备的入口，这两个工厂在 responses.ts 里又各有自己的重载矩阵（L96-L98 详细展开，本课不越界）。

### 重载之下：六个泛型参数与类型包

每个重载都携带六个泛型参数：\`StructuredResponseFormat\`、\`TStateSchema\`、\`ContextSchema\`、以及三个 \`const\` 修饰的 \`TMiddleware\`/\`TTools\`/\`TStreamTransformers\`。其中三个 \`const\` 类型参数是 1.x 类型系统的关键设计——它让 TypeScript 从数组字面量里推断出**元组与字面量类型**而不是宽泛的数组类型，工具名因此能保留为字符串字面量。这三个类型随后被收拢进返回类型：

\`\`\`ts
): ReactAgent<
  AgentTypeConfig<
    StructuredResponseFormat,   // Response
    TStateSchema,               // State
    ContextSchema,              // Context
    TMiddleware,                // Middleware
    CombineTools<TTools, TMiddleware>,
    CombineStreamTransformers<TStreamTransformers, TMiddleware>
  >
>;
\`\`\`

*— libs/langchain/src/agents/index.ts:202-211（commit 7704471）*

注意 \`CombineTools\` 把 agent 自带的 tools 与每个 middleware 声明的 tools **在类型层做拼接**（types.ts:188-191：\`readonly [...TAgentTools, ...InferMiddlewareToolsArray<TMiddleware>]\`）——运行时 ReactAgent 构造器里有一模一样的拼接（ReactAgent.ts:225-228），类型与运行时逐点对应。\`AgentTypeConfig\` 这个「类型包」把六个类型参数打包成单个泛型参数传给 ReactAgent，这是 L40 的主题。L39 则会拆开 \`const\` 泛型与 \`CombineTools\` 的推导机制细讲。

### 导出面：index.ts 尾部的 re-export 疆域

\`createAgent\` 不是 index.ts 的全部。文件尾部有一块完整的导出清单（index.ts:704-731），值得作为 API 边界地图记住：

\`\`\`ts
export * from "./types.js";
export * from "./errors.js";
export * from "./nodes/types.js";
export type { JumpToTarget } from "./constants.js";
export type { Runtime } from "./runtime.js";
export {
  toolStrategy,
  providerStrategy,
  ToolStrategy,
  ProviderStrategy,
  type TypedToolStrategy,
  type ResponseFormat,
  type ResponseFormatUndefined,
} from "./responses.js";
export { createMiddleware } from "./middleware.js";
export { MIDDLEWARE_BRAND } from "./middleware/types.js";
export { FakeToolCallingModel } from "./tests/utils.js";
export type { ReactAgent } from "./ReactAgent.js";
\`\`\`

*— libs/langchain/src/agents/index.ts:704-723（commit 7704471）*

三个观察点。其一，结构化输出双子星 \`toolStrategy\`/\`providerStrategy\` 与中间件工厂 \`createMiddleware\`、品牌标记 \`MIDDLEWARE_BRAND\` 都从 agents 子目录转发——想找定义要顺着跳。其二，\`JumpToTarget\` 定义在 \`constants.ts\`（一行 \`export const JUMP_TO_TARGETS = ["model", "tools", "end"] as const\`），L50 的节点跳转就建立在这三个字符串上。其三，最反直觉的一行：**\`FakeToolCallingModel\` 从 \`./tests/utils.js\` 导出**——测试工具被提升为公共 API，说明官方把「用假模型测 agent」当成下游一等需求。这对我们写源码课的实验代码非常有用：L42/L43 的 practice 环节可以直接用它，不必依赖真实 LLM。

### 本课小结

- **createAgent 的运行时实现只有一行** \`return new ReactAgent(params)\`（index.ts:672-702）；全部编译逻辑在 ReactAgent 构造器里，类型层的 14 个重载才是 index.ts 的主体。
- **14 个重载按 responseFormat 形态分派**：Zod 对象/数组、JsonSchema 单/数组/联合、SerializableSchema 单/数组、TypedToolStrategy/ToolStrategy/ProviderStrategy、无 responseFormat 的 Omit 与 undefined 两条路径、最后是兜底。
- **Zod 与策略对象可精确推导 Response 类型**，JSON Schema 形态一律退化为 \`Record<string, unknown>\`——这是形态本身的类型学限制，不是实现遗漏。
- **导出面地图**：types/errors/nodes 全量转发 + JumpToTarget/Runtime/toolStrategy/providerStrategy/createMiddleware/MIDDLEWARE_BRAND 指名转发 + FakeToolCallingModel（测试工具公共化）。
- 下一课拆开重载分派轴上最重要的形态——responseFormat 的四种输入，以及它们如何决定 \`structuredResponse\` 字段的有无。
`,
    null,
    [
      {
        text: 'createAgent 的函数实现体（真正的运行时代码）是什么？',
        options: [
          '一个 700 行的函数，内部组装 StateGraph 并编译',
          '只有一行：return new ReactAgent(params)，图编译全部发生在 ReactAgent 构造器里',
          '直接返回一个 Pregel 实例，不经过任何类',
          '返回一个普通对象，用闭包维护消息历史',
        ],
        answer: 1,
        explain:
          'index.ts:672-702 的实现签名下只有一行 return new ReactAgent(params)。所有运行时工作——状态 schema 合并、节点注册、边接线、compile——都在 ReactAgent 构造器（ReactAgent.ts:189-722）里完成。选项 A 描述的是 ReactAgent 构造器而非 createAgent 本体；选项 C 错在 createAgent 返回的是 ReactAgent 类实例，Pregel 是 #graph 内部的编译产物；选项 D 是 0.x AgentExecutor 的思路，1.x 已废弃。',
        concept: 'lc-create-agent',
      },
      {
        text: '「createAgent 有 14 个重载」中的重载计数，核实方式与含义是？',
        options: [
          '指运行时会按参数个数执行 14 条不同的代码路径',
          "指类型层 14 个函数签名声明（grep 'export function createAgent' 计 14 次），运行时只有一个实现签名",
          '指 createAgent 接受 14 种不同的回调钩子',
          '指 14 个不同的导出函数，名字分别是 createAgent1 到 createAgent14',
        ],
        answer: 1,
        explain:
          'TypeScript 函数重载是纯类型层机制：index.ts 里 14 个 export function createAgent 声明都是签名，只有最后一个是实现体。运行时只存在一个函数。选项 A 混淆了类型层与运行时层；选项 C 的 hook 是 middleware 的六个钩子（beforeAgent 等），与重载无关；选项 D 错在重载不是多个导出，是同一个名字的多份签名。',
        concept: 'lc-create-agent',
      },
      {
        text: 'TS 主线的工厂函数名是什么？Python 主线呢？',
        options: [
          '都是 create_agent',
          'TS 是 createAgent（camelCase），Python 是 create_agent（snake_case）',
          '都是 createReactAgent',
          'TS 是 createAgent，Python 是 newAgent',
        ],
        answer: 1,
        explain:
          '全课统一口径：TS 导出的是 camelCase 的 createAgent（index.ts:176），Python 主线用 snake_case 的 create_agent。选项 C 的 createReactAgent 是 0.x/langgraph prebuilt 的旧名（L81 与 L119 会处理这个同名陷阱），不要和 1.x 的 createAgent 混用；选项 D 是凭空编造的名字。',
        concept: 'lc-create-agent',
      },
      {
        text: 'agents/index.ts 的导出面里，下面哪一项「不属于」生产 API 而是测试工具？',
        options: [
          'toolStrategy / providerStrategy',
          'createMiddleware 与 MIDDLEWARE_BRAND',
          'FakeToolCallingModel',
          'JumpToTarget 与 Runtime 类型',
        ],
        answer: 2,
        explain:
          'index.ts:722 有一行 export { FakeToolCallingModel } from "./tests/utils.js"——把测试目录里的假模型直接导出成公共 API，供下游测试复用。选项 A/B/D 分别是结构化输出策略（responses.ts）、中间件工厂与品牌标记、跳转与运行时类型（constants.ts/runtime.ts），都是真实的生产导出。',
        concept: 'lc-create-agent',
      },
      {
        text: '为什么 createAgent 的每个重载都返回 ReactAgent<AgentTypeConfig<...>> 而不是 ReactAgent<any>？',
        options: [
          '为了运行时性能优化',
          '为了把 responseFormat/stateSchema/middleware/tools/streamTransformers 推导出的字面量类型打包进单个类型包 AgentTypeConfig，让 invoke/stream 的返回类型精确到具体工具名与响应形状',
          '因为 ReactAgent 不接受泛型，只能在外面包一层',
          '为了兼容 CommonJS',
        ],
        answer: 1,
        explain:
          'ReactAgent 类只有一个泛型参数 Types extends AgentTypeConfig（ReactAgent.ts:164-173），重载层把六个泛型变量的推导结果收拢进这个类型包。invoke 的返回状态里因此能精确到每个工具的字面量名（ToolsToMessageToolSet）与结构化响应形状。选项 A 错在类型信息编译后即擦除，不影响运行时；选项 C 与事实相反，ReactAgent 正是泛型类；选项 D 与类型系统无关。',
        concept: 'lc-create-agent',
      },
    ],
    [
      [
        'createAgent',
        'TS 主线 1.x 的 agent 工厂（camelCase），14 个类型重载 + 一行实现体 return new ReactAgent(params)',
      ],
      [
        '函数重载（overload）',
        'TypeScript 的纯类型层机制：同一函数名多份签名声明，调用点按参数形状匹配到第一份兼容签名；运行时只有实现体一个函数',
      ],
      [
        '类型包（type bag）',
        'AgentTypeConfig 接口：把 Response/State/Context/Middleware/Tools/StreamTransformers 六个类型参数收拢为一个泛型参数的设计模式',
      ],
      [
        'FakeToolCallingModel',
        'agents/tests/utils.ts 里的假模型类，被 index.ts 直接导出为公共 API，供下游编写不依赖真实 LLM 的测试',
      ],
    ],
    [
      '把 createAgent 当成运行时分派器去读实现——实现体只有一行，14 个重载全在类型层；想理解行为要去读 ReactAgent 构造器',
      '用旧名 createReactAgent 调用 1.x 主包——那是 langgraph prebuilt / 0.x 时代的名字，1.x 主包导出的是 createAgent',
      '忽略 index.ts 尾部的 re-export 块——JumpToTarget、Runtime、MIDDLEWARE_BRAND 等类型都不定义在 index.ts，而是从这里转发，只 grep 定义文件会漏掉公共 API 面',
    ],
  ),
  'theory',
)
