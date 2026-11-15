import { L, withKind } from '../../course-builders.ts'

export const L44 = withKind(
  L(
    'L44',
    12,
    '图级 API 透传：getState/getStateHistory/getSubgraphs',
    2,
    ['L40'],
    ['lc-graph-api-passthrough'],
    [
      '能列出 ReactAgent 类尾部的图级透传方法清单（getGraphAsync/getState/getStateHistory/getSubgraphs/getSubgraphsAsync/updateState/builder）并说明它们的共同实现模式',
      '能解释这批方法为什么标注 @internal 且返回类型断言为 never——LangGraph Platform 解包集成的设计动机',
      '能区分两类透传：公开的可视化方法（drawMermaid/drawMermaidPng）与内部协议方法，以及 checkpointer/store 属性 setter 的穿透语义',
    ],
    `### 开篇：agent 的「另一半接口」

L42/L43 走了 invoke/stream 两条执行路径，本课补上第三类接口：**图级 API 透传**。ReactAgent 类尾部有一整块方法，把 #graph（CompiledStateGraph）的运行时面原样转发出去——状态快照（getState）、历史轨迹（getStateHistory）、子图枚举（getSubgraphs）、状态回写（updateState）、图形化表示（getGraphAsync）、未编译 builder（builder）。它们的存在理由写在源码注释里：**为 LangGraph Platform 支持**。本课结论先行：这批方法是「内部协议」，\`as never\` 的返回断言是类型层的自觉降级——ReactAgent 不想复述编译图的泛型复杂度，也不想对这份接口做公开承诺。

### @internal 方法群：一行委托的统一模式

先看原文。ReactAgent.ts:1590-1643，注释与七个成员：

\`\`\`ts
/**
 * The following are internal methods to enable support for LangGraph Platform.
 * They are not part of the createAgent public API.
 *
 * Note: we intentionally return as \`never\` to avoid type errors due to type inference.
 */
/**
 * @internal
 */
getGraphAsync(config?: RunnableConfig) {
  return this.#graph.getGraphAsync(config) as never;
}
/**
 * @internal
 */
getState(config: RunnableConfig, options?: GetStateOptions) {
  return this.#graph.getState(config, options) as never;
}
/**
 * @internal
 */
getStateHistory(config: RunnableConfig, options?: CheckpointListOptions) {
  return this.#graph.getStateHistory(config, options) as never;
}
/**
 * @internal
 */
getSubgraphs(namespace?: string, recurse?: boolean) {
  return this.#graph.getSubgraphs(namespace, recurse) as never;
}
/**
 * @internal
 */
updateState(
  inputConfig: LangGraphRunnableConfig,
  values: Record<string, unknown> | unknown,
  asNode?: string
) {
  return this.#graph.updateState(inputConfig, values, asNode) as never;
}

/**
 * @internal
 */
get builder() {
  return this.#graph.builder;
}
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:1596-1643（commit 7704471，getSubgraphsAsync 同构略）*

模式总结成一句话：**零逻辑、零类型、纯转发**。每个方法只做三件事——签名保持与 #graph 一致、转调同名方法、返回值 \`as never\`。七个成员覆盖了 LangGraph 运行时的核心面：getState 拿某线程当前状态快照（可带 subgraphs 选项）、getStateHistory 拿检查点历史序列、getSubgraphs/getSubgraphsAsync 枚举嵌套子图（namespace + recurse）、updateState 按 asNode 语义回写检查点状态、getGraphAsync 拿图的节点边结构、builder 暴露未编译的 StateGraph。为什么这层薄得如此彻底？因为**ReactAgent 对图运行时的姿态是「持有人」而非「包装器」**——它不翻译、不缓存、不裁剪，只把图交给需要它的消费者。

### as never 的类型学动机与公开承诺等级

\`as never\` 是这批代码最显眼的怪异之处。动机有两层。第一层是工程现实：#graph 在类里声明为 \`CompiledStateGraph<any, any, any, any, any, any, unknown>\`（ReactAgent.ts:181），转发出去的真实返回类型其实依赖构造期编译产物的具体泛型——ReactAgent 层没有足够类型信息表达，强行转发会传播 any 或写错。第二层是契约立场：注释原文「not part of the createAgent public API」——**never 断言是一种「此处无承诺」的类型签名**，LangGraph Platform 的消费方（langgraph-api 的 afterResolve）自己知道拿到的是什么。与 invoke/stream 对照更清晰：那两个方法的返回类型是精心构造的 \`MergedAgentState<Types>\`/\`StreamOutputMap<...>\`（L39/L43），而透传方法连类型都不给。公开承诺等级排序：**invoke/stream/streamEvents > drawMermaid 族 > @internal 透传**。

### 两类「透传」的对照：公开可视化 vs 内部协议

类尾部还有一组看起来相似但承诺等级不同的方法：

\`\`\`ts
async drawMermaidPng(params?: {
  withStyles?: boolean;
  curveStyle?: string;
  nodeColors?: Record<string, string>;
  wrapLabelNWords?: number;
  backgroundColor?: string;
}) {
  const representation = await this.#graph.getGraphAsync();
  const image = await representation.drawMermaidPng(params);
  const arrayBuffer = await image.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  return buffer;
}

async drawMermaid(params?: {...}) {
  const representation = await this.#graph.getGraphAsync();
  return representation.drawMermaid(params);
}
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:1555-1588（commit 7704471）*

它们也转发 getGraphAsync，但属于**公开 API**：带完整 JSDoc、类型化参数、稳定返回（PNG 的 Uint8Array / Mermaid 字符串）。与 @internal 方法群的差异不在实现形态（都是委托），而在**契约面**——可视化方法对用户承诺稳定，透传方法只对平台承诺存在。用法上 drawMermaid 的典型场景是把 agent 编译出的拓扑导出审查：连上 checkpointer 的复杂 agent（含中间件节点链）画出来的图能直观验证 L41 的接线结果，这是把「Agent 即编译图」变成可看证据的最短路径。

### 配置也要透传：withConfig 烘焙与属性穿透

本课还有两处「静态透传」值得收尾。其一是构造器末尾的烘焙（L40 拆过、本课从平台视角再看）：

\`\`\`ts
const graphDefaultConfig = toGraphDefaultConfig(this.#defaultConfig);
if (Object.keys(graphDefaultConfig).length > 0) {
  this.#graph = this.#graph.withConfig(graphDefaultConfig);
}
\`\`\`

*— libs/langchain/src/agents/ReactAgent.ts:718-721（commit 7704471）*

ReactAgent.ts:711-717 的注释把因果讲全：langgraph-api 解析 agent 时经 afterResolve 解包出内部编译图、直接在其上调用 streamEvents——这条路径只看得到 \`.withConfig()\` 烘焙的配置，看不到 invoke/stream 时合并的 #defaultConfig；所以构造期必须把静态默认（白名单键，由 utils.ts 的 toGraphDefaultConfig 筛选）写进图。**这是「配置透传」的编译期版本**。其二是属性的穿透赋值：\`set checkpointer(value) { this.#graph.checkpointer = value; }\`、\`set store(value) { this.#graph.store = value; }\`（ReactAgent.ts:735-745）——对 agent 赋 checkpointer/store 实际写到编译图上，运行时立即生效。连同 getter，checkpointer/store 在 agent 与图之间是同一份引用，没有副本。

### 本课小结

- **@internal 方法群七成员**：getGraphAsync/getState/getStateHistory/getSubgraphs/getSubgraphsAsync/updateState/builder——一行委托、\`as never\` 断言、零类型承诺，为 LangGraph Platform 的解包消费而设。
- **契约分级**：invoke/stream/streamEvents（完整类型 + 公开承诺）> drawMermaid/drawMermaidPng（类型化公开可视化）> @internal 透传（不进公开 API）。
- **配置透传两条线**：编译期烘焙（toGraphDefaultConfig 白名单 + withConfig，服务 afterResolve 解包路径）；运行期属性穿透（checkpointer/store setter 直写 #graph）。
- **一个心理模型**：ReactAgent 是图的持有人而非包装器——执行与状态读取都指向同一张 CompiledStateGraph，agent 层只做参数归一与类型包推导。
- 下一课进入节点内部：AgentNode——模型调用与工具循环决策所在的 1107 行，模块四最深的一课。
`,
    null,
    [
      {
        text: 'ReactAgent 上的 getState/getStateHistory/getSubgraphs 的实现体长什么样？',
        options: [
          '各自实现了复杂的状态读取逻辑，几百行',
          '每个都是一行委托：return this.#graph.getState(config, options) as never——类尾部 @internal 方法群的统一模式',
          '它们读取 #defaultConfig 里的快照',
          '这些方法在 ReactAgent 上不存在',
        ],
        answer: 1,
        explain:
          'ReactAgent.ts:1599-1619：三个方法（连同 getSubgraphsAsync/updateState/getGraphAsync）都是单行转调 #graph 上的同名方法并 as never。选项 A 错在真实逻辑都在 LangGraph 编译图上；选项 C 是编造；选项 D 与源码矛盾——方法存在，只是 @internal（注释明说是「为 LangGraph Platform 支持而保留」，不属于 createAgent 公开 API）。',
        concept: 'lc-graph-api-passthrough',
      },
      {
        text: '这批透传方法的返回类型为什么断言成 never？',
        options: [
          '它们永远不会返回（死循环）',
          '为绕开类型推断的复杂度：真返回类型来自 #graph 的编译期泛型，ReactAgent 层无法静态给出，用 never 让调用点类型检查「放过」，同时提醒这不是公开契约',
          '因为运行时会抛异常',
          'never 是普通 void 的别名',
        ],
        answer: 1,
        explain:
          '源码注释（ReactAgent.ts:1594）写明动机：「we intentionally return as never to avoid type errors due to type inference」——#graph 的 CompiledStateGraph 泛型在 ReactAgent 层是 any 化的，转发会引入不准确的类型；never 断言让 LangGraph Platform 的解包消费方自行处理类型。选项 A 把 never 语义曲解为运行时行为；选项 C 错在方法正常返回；选项 D 错在 never 与 void 类型上不相容（never 是底类型）。',
        concept: 'lc-graph-api-passthrough',
      },
      {
        text: 'drawMermaid/drawMermaidPng 与 @internal 方法群的差异是什么？',
        options: [
          '都标注 @internal',
          'drawMermaid/drawMermaidPng 是公开 API：经 #graph.getGraphAsync() 取图表示再渲染，参数是样式选项；@internal 方法群是给 LangGraph Platform 的运行时协议，不承诺稳定性',
          'drawMermaid 只在 Node.js 可用，@internal 方法只在浏览器可用',
          '没有差异，功能一样',
        ],
        answer: 1,
        explain:
          'drawMermaid/drawMermaidPng（ReactAgent.ts:1545-1588）带完整 JSDoc、类型化参数（withStyles/curveStyle/nodeColors 等），是给用户的可视化出口；@internal 方法群（ReactAgent.ts:1596-1643）注释明说「internal methods to enable support for LangGraph Platform ... not part of the createAgent public API」。选项 A 错在可视化方法不是内部协议；选项 C 无平台限制的源码依据；选项 D 忽略了承诺等级与用途差异。',
        concept: 'lc-graph-api-passthrough',
      },
      {
        text: '构造器末尾的 withConfig 烘焙（toGraphDefaultConfig + #graph.withConfig）要解决什么问题？',
        options: [
          '让 invoke 更快',
          'LangGraph API 解析 agent 时会解包 ReactAgent 直取内部图调用 streamEvents，该路径只看得到编译期烘焙进图的配置、看不到 invoke 时合并的 #defaultConfig，所以静态默认配置必须在构造期写进图',
          '为了兼容 Python 版',
          '为了让 drawMermaid 带上样式',
        ],
        answer: 1,
        explain:
          'ReactAgent.ts:711-721 的注释逐句说明：langgraph-api 的 load.utils afterResolve 会把 ReactAgent 解包到编译图直接调用 streamEvents，这条路径只认 .withConfig() 烘焙的配置。toGraphDefaultConfig（utils.ts）按白名单键从 #defaultConfig 挑出可烘焙项。选项 A 错在不影响执行速度；选项 C 无关；选项 D 与配置烘焙无关——drawMermaid 走 getGraphAsync 与配置无关。',
        concept: 'lc-graph-api-passthrough',
      },
    ],
    [
      [
        '图级透传（passthrough）',
        'ReactAgent 类尾部把 #graph 的运行时方法原样转发出去的一批 @internal 方法：getGraphAsync/getState/getStateHistory/getSubgraphs/getSubgraphsAsync/updateState/builder',
      ],
      [
        'as never 断言',
        '透传方法的统一返回类型技巧：避免在 ReactAgent 层复述编译图的复杂泛型，同时标记「非公开契约」',
      ],
      [
        'updateState',
        '透传方法之一：以 asNode 语义向检查点状态写入值（LangGraph 的人工干预原语），ReactAgent 层仅转发',
      ],
      [
        'afterResolve',
        'langgraph-api 平台加载工具的解析钩子：把 ReactAgent 解包为内部编译图，是其上 streamEvents/getState 等调用得以直接发生的前提',
      ],
      [
        'getGraphAsync',
        '取编译图的图形化表示（节点/边结构）的异步方法；drawMermaid/drawMermaidPng 的底层依赖',
      ],
    ],
    [
      '在业务代码里调用 getState/getStateHistory 等 @internal 方法——它们不承诺稳定；生产持久化读取应走 checkpointer 或 LangGraph Platform 的线程 API',
      '以为 agent.graph 上的配置与 agent 实例的 #defaultConfig 等价——invoke 时合并的配置只存在于调用路径，编译期烘焙（withConfig）只覆盖 toGraphDefaultConfig 白名单键，两份配置不一致时以调用时为准',
      '把 updateState 当普通写状态工具——它按 asNode 语义写检查点（会触发对应通道 reducer 与 superstep 语义），误用会破坏消息序',
    ],
  ),
  'theory',
)
