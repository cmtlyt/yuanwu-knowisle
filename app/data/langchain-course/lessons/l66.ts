import { L, withKind } from '../../course-builders.ts'

export const L66 = withKind(
  L(
    'L66',
    19,
    'schema 归一化：Annotation/StateSchema/Zod 三路汇成 StateDefinition',
    2,
    ['L65'],
    ['lc-schema-normalization'],
    [
      '对照三种状态定义写法（Annotation.Root / StateSchema / Zod）在归一化管线里的路径差异',
      '读出 _getChannelsFromSchema 的四路分派逻辑与 StateGraphInputError 的触发条件',
      '解释 PartialStateSchema 标记在 input 校验里的作用',
    ],
    `### 三种写法，一个终点

上一课看到 StateGraph 的十个泛型都源自 SD，而 SD 允许四种写法：\`Annotation.Root\`、\`StateSchema\` 子类、Zod object、以及老的 \`{ channels }\` 形态。本课按 framework 课型做逐文件走读，核心结论：**构造器前 100 行的全部工作，就是把四种输入压平成一个 \`StateDefinition\`——通道名到通道（或通道工厂）的映射**。归一化之后的所有编译代码都只认这一种形态，这是「多入口、单内压」的典型设计。

### 第一站：_normalizeToStateGraphInit 的三分支

\`\`\`ts
private _normalizeToStateGraphInit(
  stateOrInit: unknown,
  options?: unknown
): StateGraphInit<StateDefinitionInit, I, O, C> {
  if (isStateGraphInit(stateOrInit)) {
    // 第二参可以是直接的 context schema 或 options 对象
    if (isInteropZodObject(options) || AnnotationRoot.isInstance(options)) {
      return { ...stateOrInit, context: options as C };
    }
    const opts = options as StateGraphOptions<I, O> | undefined;
    return {
      ...stateOrInit,
      input: stateOrInit.input ?? opts?.input,
      output: stateOrInit.output ?? opts?.output,
      ...
    };
  }
  if (isStateDefinitionInit(stateOrInit)) {
    ...
    return { state: stateOrInit, input: opts?.input, output: opts?.output, ... };
  }
  // legacy { channels } 格式
  if (isStateGraphArgs(stateOrInit as StateGraphArgs<S>)) {
    const legacyArgs = stateOrInit as StateGraphArgs<S>;
    const spec = _getChannels(legacyArgs.channels);
    return { state: spec as StateDefinitionInit };
  }
  throw new StateGraphInputError();
}
\`\`\`

*— graph/state.ts:805-862（有裁剪，commit fa426b2）*

三分支对应三种调用姿势：\`new StateGraph({ state, input, output })\` 对象包、\`new StateGraph(schema, options)\` 直接 schema、\`new StateGraph({ channels })\` legacy。两个值得注意的细节：第二参如果直接传 Zod object 或 AnnotationRoot，会被当作 **context schema**（这是「第二个参数两种含义」的巧思）；legacy 分支用 \`_getChannels\` 把旧通道映射转为新形态，0.x 用户的代码因此不用改。构造器主流程（graph/state.ts:598-671）随后按 \`state > stateSchema(deprecated) > input\` 的优先级选状态 schema，缺失即抛 \`StateGraphInputError\`。

### 第二站：_getChannelsFromSchema 的四路分派

\`\`\`ts
private _getChannelsFromSchema(schema: StateDefinitionInit): StateDefinition {
  if (StateSchema.isInstance(schema)) {
    return schema.getChannels();
  }
  if (isInteropZodObject(schema)) {
    return this._metaRegistry.getChannelsForSchema(schema);
  }
  if (
    typeof schema === "object" &&
    "lc_graph_name" in schema &&
    (schema as { lc_graph_name: unknown }).lc_graph_name === "AnnotationRoot"
  ) {
    return (schema as AnnotationRoot<StateDefinition>).spec;
  }
  // StateDefinition（原始通道映射）- 原样返回
  if (
    typeof schema === "object" &&
    !Array.isArray(schema) &&
    Object.keys(schema).length > 0
  ) {
    return schema as StateDefinition;
  }
  throw new StateGraphInputError(
    "Invalid schema type. Expected StateSchema, Zod object, AnnotationRoot, or StateDefinition."
  );
}
\`\`\`

*— graph/state.ts:868-898（commit fa426b2）*

StateSchema 路径最直接：类自带 \`getChannels()\`，通道由类定义声明。Zod 路径委托给全局 \`schemaMetaRegistry\`——Zod 本身没有 reducer 概念，reducer 是通过 \`withLangGraph(schema, meta)\` 注册进 SchemaMetaRegistry 的，\`getChannelsForSchema\` 遍历 shape，**有 reducer 的 key 生成 BinaryOperatorAggregate，否则 LastValue**（graph/zod/meta.ts:155-171）。AnnotationRoot 路径只做一件事：返回 \`.spec\`——因为 Annotation 函数在创建时就已把每个 key 换算成了具体通道（\`Annotation<T>()\` 无 reducer 返回 \`LastValue<ValueType>\`，带 reducer 返回 \`getChannel(...)\` 的产物，graph/annotation.ts:158-195）。也就是说：**Zod 的通道换算推迟到归一化时做，Annotation 的通道换算在定义时已做完**，两条路殊途同归。

### StateSchema 路径补遗：getChannels 的自换算表

第二站里 StateSchema 分支只有一行 \`return schema.getChannels()\`，但这个方法内部是一张完整的「字段形态 → 通道类型」换算表（state/schema.ts:190-274）。\`StateSchema\` 构造器接收一份 \`fields\` 映射，\`getChannels()\` 遍历时按四个 \`isInstance\` 分派：\`DeltaValue\` → DeltaChannel（value schema 的 default 转成 initialValueFactory）、\`ReducedValue\` → BinaryOperatorAggregate（reducer + default 一起带入）、\`UntrackedValue\` → UntrackedValueChannel（guard/初值工厂透传）、普通 standard schema → LastValue（schema 的 \`.default()\` 取值器作构造参数）；四者皆非则抛 \`Invalid state field "\${key}": must be a schema, ReducedValue, DeltaValue, UntrackedValue, or ManagedValue\`。也就是说，**Annotation 的 reducer 换算发生在定义时、Zod 的换算发生在归一化时，而 StateSchema 的换算发生在 getChannels 被调用的瞬间**——三个时机不同，产物都是 StateDefinition。

判型细节也值得圈出来：\`StateSchema.isInstance\` 不用 instanceof，而是检查对象上是否存在 \`Symbol.for("langgraph.state.state_schema")\` 标记（state/schema.ts:26、196）——与 L05 的 MESSAGE_SYMBOL、L69 的 lg_is_channel 同属一条「跨副本判型绕开 instanceof」的主线。类型层面，StateSchema 用 \`declare State / Update / Node\` 三个声明（schema.ts:204-233）提供 \`typeof AgentState.State\`、\`typeof AgentState.Node\` 的反查能力，节点函数可以在图外先标好类型再注册——这是三路写法中唯一自带节点函数类型锚点的。

### 第三站：input/output 与 PartialStateSchema

\`\`\`ts
if (init.input) {
  if (StateSchema.isInstance(init.input)) {
    this._inputRuntimeDefinition = init.input;
  } else if (isInteropZodObject(init.input)) {
    this._inputRuntimeDefinition = init.input;
  } else {
    this._inputRuntimeDefinition = PartialStateSchema;
  }
} else {
  this._inputRuntimeDefinition = PartialStateSchema;
}
\`\`\`

*— graph/state.ts:620-631（commit fa426b2）*

\`PartialStateSchema = Symbol.for("langgraph.state.partial")\`（graph/state.ts:303）。input 与 output 可以独立于 state 指定——这是「图的公共接口」与「内部工作状态」分离的机制：内部状态可以有中间变量，而 invoke 只接受/返回声明的子集。注意 \`_inputDefinition\` 与 \`_inputRuntimeDefinition\` 是两套：前者是通道映射（供 attachNode 读 input keys），后者是校验 schema（供 \`_validateInput\` 解析输入）。

### 第四站：通道工厂与 _addSchema

\`\`\`ts
_addSchema(stateDefinition: StateDefinitionInit) {
  if (this._schemaDefinitions.has(stateDefinition)) return;
  this._schemaDefinitions.set(stateDefinition, stateDefinition);
  for (const [key, val] of Object.entries(stateDefinition)) {
    let channel;
    if (typeof val === "function") {
      channel = val();
    } else {
      ...
\`\`\`

*— graph/state.ts:909-920（commit fa426b2）*

\`(() => BaseChannel)\` 的工厂形态在这里被实例化——同一份 StateDefinition 可以被 \`_addSchema\` 调用三次（state/input/output 各一次），通道工厂保证每次拿到全新实例，避免三个视图共享同一个通道状态。\`_schemaDefinitions\` 这个 Map 还在 attachNode 里被反查（\`this.builder._schemaDefinitions.get(inputDefinition)\`，graph/state.ts:1757-1758），用来确定节点读哪些 key。

第四站还有一个容易被漏看的守门员：**同名 key 的二次注册要过 \`equals\` 检查**。实例化出来的通道写进 \`this.channels\` 之前，如果这个 key 已经存在，就调 \`this.channels[key].equals(channel)\` 判语义等价：相等则安然复用；不等且新通道是 LastValue 则静默容忍（保持旧通道）；不等且新通道不是 LastValue 直接抛 \`Channel "\${key}" already exists with a different type.\`（graph/state.ts:915-929）。这条规则与 L69 要讲的 equals 契约直接呼应——state/input/output 三个视图共享同一份定义时，同 key 通道必须语义一致，而 LastValue 的默认地位让它获得了不对称的宽容。如果你在两个视图里给同一个 key 配了不同 reducer，这里就是报错现场。

### 预置状态的双生记：MessagesAnnotation 与 MessagesZodState

把归一化管线跑在两个官方预置状态上，能同时看清 Annotation 路与 Zod 路的收尾差异。Annotation 版只有一行：

\`\`\`ts
export const MessagesAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[], Messages>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});
\`\`\`

*— graph/messages_annotation.ts:44-48（commit fa426b2）*

带 reducer 的 Annotation 在**定义时**就已经换算成了 BinaryOperatorAggregate（第二站的结论），所以它进 \`_getChannelsFromSchema\` 时走 AnnotationRoot 分支、原样返回 \`.spec\` 即可。Zod 版则是另一条路——它不是 schema 本身带 reducer，而是把元数据注册进全局表：

\`\`\`ts
export const MessagesZodMeta: SchemaMeta<BaseMessage[], Messages> = {
  reducer: { fn: messagesStateReducer },
  jsonSchemaExtra: { langgraph_type: "messages" },
  default: () => [],
};
\`\`\`

*— graph/messages_annotation.ts:62-68（commit fa426b2）*

用户用 \`z.custom<BaseMessage[]>().register(registry, MessagesZodMeta)\`（messages_annotation.ts:55-60 的示例）或 \`withLangGraph(schema, meta)\` 把这份 meta 挂到 schema 上。\`withLangGraph\` 的实现（graph/zod/meta.ts:284-309）有两个细节：其一，reducer 存在而 default 缺失时，会从 Zod schema 自己的 default 取值器里补一个 default——**reducer 与 default 的绑定关系在 Annotation 里由用户手写，在 Zod 里可以借 schema 的 \`.default()\` 自动补齐**；其二，注册时把 \`lg_reducer_schema\` 直接 Object.assign 到 schema 对象上，让后续能从 schema 反查 reducer 的 UpdateType schema。\`jsonSchemaExtra.langgraph_type: "messages"\` 则是给服务端/可视化消费方的类型标记，经 \`lg:\` 前缀序列化进 schema description。两条预置路径的终点完全一致：一个名为 \`messages\` 的 BinaryOperatorAggregate 通道，UpdateType 放宽为 \`Messages\`（单条、数组或 message-like 对象都能写）——这就是三路归一「殊途同归」的最好例证。

### 本课小结

- 归一化管线两步走：\`_normalizeToStateGraphInit\` 统一调用姿势，\`_getChannelsFromSchema\` 统一 schema 形态，终点都是 StateDefinition。
- 通道换算的时机因写法而异：Annotation 在定义时换算，Zod 在归一化时经 SchemaMetaRegistry 换算，StateSchema 自带 getChannels。
- input 缺省不是「不校验」，而是 PartialStateSchema 标记下的部分视图校验；input/output 与 state 分离是接口收敛机制。
- AnnotationRoot 的识别靠 lc_graph_name 字符串而非 instanceof，与 core 的跨包判型策略一脉相承。
- StateSchema 的 getChannels 内部是四路字段换算表（DeltaValue/ReducedValue/UntrackedValue/普通 schema），判型靠 Symbol.for 标记；MessagesAnnotation 与 MessagesZodState 是三路归一的最佳双例证。
- 同 key 通道二次注册要过 equals 检查：不等且新通道非 LastValue 时抛 \`Channel already exists with a different type\`（graph/state.ts:915-929）。
- 下一课进入 addNode：五道校验关卡与自动生成的 \`__error_handler__\` 节点。
`,
    null,
    [
      {
        text: '_getChannelsFromSchema 面对四种输入的分派顺序是？',
        options: [
          'Zod → StateSchema → AnnotationRoot → 原始通道映射',
          'StateSchema.isInstance → isInteropZodObject → lc_graph_name === "AnnotationRoot" → 非空对象原样返回',
          '先反射检查 channels 字段再分派',
          '全部交给 _metaRegistry 处理',
        ],
        answer: 1,
        explain:
          'graph/state.ts:868-898 的实现依次检查：StateSchema 实例调 schema.getChannels()；Zod object 调 this._metaRegistry.getChannelsForSchema(schema)；AnnotationRoot 直接返回 .spec；其余非空对象按原始 StateDefinition 处理，都不匹配则抛 StateGraphInputError。A 的顺序颠倒——Zod 检查在 StateSchema 之后；C 错在 legacy {channels} 的识别发生在更上游的 _normalizeToStateGraphInit（isStateGraphArgs），不在这个函数；D 错在只有 Zod 走 _metaRegistry。',
        concept: 'lc-schema-normalization',
      },
      {
        text: '构造时只传 state 不传 input，输入校验用哪个 schema？',
        options: [
          '直接用 state schema 做全量校验',
          '用 PartialStateSchema 标记：按 state 的 partial 扩展 schema 校验，允许只传部分 key',
          '不校验，原样透传',
          '报错，input 必须显式指定',
        ],
        answer: 1,
        explain:
          '构造器里 init.input 缺省时 this._inputRuntimeDefinition = PartialStateSchema（graph/state.ts:629-631），这个 Symbol（graph/state.ts:303）标记「输入是 state 的部分视图」；_validateInput 对 inputDef === PartialStateSchema 的情形会用 state schema 的 asPartial 扩展形态做解析（graph/state.ts:2097-2104）。A 错在全量校验会拒绝只初始化部分字段的合法调用；C 错在 Zod 路径确实会 parse；D 错在 input 是可选的。',
        concept: 'lc-schema-normalization',
      },
      {
        text: 'Annotation.Root({ messages: ... }) 最终被识别为哪种类型？',
        options: [
          '一个特殊的 class 实例，走 instanceof 判断',
          'lc_graph_name === "AnnotationRoot" 的普通对象，spec 字段就是 StateDefinition',
          'Zod schema 的包装器',
          '编译期纯类型，运行时不存在',
        ],
        answer: 1,
        explain:
          'AnnotationRoot 类只持有 spec（graph/annotation.ts:62-85），isInstance 检查的是 value.lc_graph_name === "AnnotationRoot"，不用 instanceof——这与 core 的 MESSAGE_SYMBOL 跨包判型（L05）同属一个设计谱系。A 错在刻意避开 instanceof 以兼容多副本加载；C 错在 Zod 是独立分支；D 错在 AnnotationRoot 是运行时真实存在的对象，归一化要读它的 spec。',
        concept: 'lc-schema-normalization',
      },
      {
        text: 'Annotation 的 getChannel 函数如何决定通道类型？',
        options: [
          '一律创建 LastValue',
          '有 reducer 字段（或 deprecated 的 value 字段）→ BinaryOperatorAggregate，否则 LastValue',
          '有 reducer → Topic，否则 LastValue',
          '根据值类型自动选择',
        ],
        answer: 1,
        explain:
          'graph/annotation.ts:174-195：reducer 存在则 new BinaryOperatorAggregate(reducer.reducer, reducer.default)，value 字段（deprecated 别名）同理，兜底 new LastValue<V>()。A 错在只对无 reducer 的情形成立；C 错在 Topic 不由 Annotation 创建，它有独立构造入口；D 错在这是显式契约不是类型推断——用户 API 与 channel 类型在这一个函数里完成换算。',
        concept: 'lc-schema-normalization',
      },
    ],
    [
      [
        'StateDefinition',
        '归一化的终点形态：{ [key: string]: BaseChannel | (() => BaseChannel) }（graph/annotation.ts:21-23），通道实例或通道工厂皆可',
      ],
      ['AnnotationRoot', 'Annotation.Root 的产物，仅持有 spec 一个字段，靠 lc_graph_name 字符串做运行时识别'],
      [
        'PartialStateSchema',
        'Symbol.for("langgraph.state.partial") 标记，表示输入校验应使用 state 的部分视图',
      ],
      [
        'SchemaMetaRegistry',
        'Zod 路径的全局元数据注册表，getChannelsForSchema 按「有 reducer → BinaryOperatorAggregate，否则 LastValue」生成通道',
      ],
    ],
    [
      '以为四种写法是四套独立实现——所有路径的终点都是同一个 StateDefinition，后续 compile/attachNode 只认这一种形态',
      '给 StateGraph 传了一个空对象 schema——_getChannelsFromSchema 对空对象不匹配「非空 StateDefinition」分支，会抛 StateGraphInputError',
      '在 Annotation 里写 value: fn 期望是新 API——value 字段是 deprecated 别名，新代码一律用 reducer',
    ],
  ),
  'framework',
)
