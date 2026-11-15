# 模块六 · LangGraph JS 源码证据台账（Module C: LangGraph）

- 仓库：`libs/langgraph-core/src/`（commit fa426b2，路径前缀省略为 `langgraphjs-src/`）
- 取证方式：全部结论来自实际读取的源码文件，标注 `相对路径:行号`
- 相对路径基准：`libs/langgraph-core/src/`

---

## 第一部分 · 证据条目

### 1. StateGraph 类定义与泛型签名
**来源**：`graph/state.ts:407-418`
**证据**：
```ts
export class StateGraph<
  SD extends StateDefinitionInit | unknown,
  S = ExtractStateType<SD>,
  U = ExtractUpdateType<SD, S>,
  N extends string = typeof START,
  ...
> extends Graph<N, S, U, StateGraphNodeSpec<S, U>, ToStateDefinition<C>> {
  channels: Record<string, BaseChannel> = {};
  waitingEdges: Set<[N[], N]> = new Set();
```
**可讲的知识点**：
- StateGraph 继承自 `Graph`（通用图构建器），扩展出「节点读写共享状态」语义。
- 10 个泛型：SD/S/U/N/I/O/C/NodeReturnType/InterruptType/WriterType，节点名 N 随 `addNode` 逐次累积实现类型安全路由。
- `waitingEdges` 是 `Set<[N[], N]>`——多入边（join）语义在构建期就与普通边分开存放。

### 2. StateGraph.compile 的返回类型
**来源**：`graph/state.ts:1398-1436, 1693-1716`
**证据**：
```ts
override compile<...>({ checkpointer, store, cache, interruptBefore,
  interruptAfter, name, description, transformers } = {}):
  CompiledStateGraph<Prettify<S>, Prettify<U>, N, I, O, C, ...>
...
export class CompiledStateGraph<...> extends CompiledGraph<...> {
  declare builder: StateGraph<unknown, S, U, N, I, O, C, NodeReturnType>;
  description?: string;
```
**可讲的知识点**：
- compile 返回 `CompiledStateGraph`，继承 `CompiledGraph`，持有 `builder` 反向引用。
- 编译选项除 checkpointer/store/interrupt 外还有 `cache: BaseCache`（节点结果缓存）与 `transformers`（streamEvents v3 流变换器）。
- `compile()` 内部临时注入 `__default_error_handler__` 节点，`finally` 中删除——builder 可重复 compile 而不被污染（state.ts:1442-1474）。

### 3. 构造期 schema 归一化：4 种状态定义方式
**来源**：`graph/state.ts:598-667, 805-862, 868-898`
**证据**：`_normalizeToStateGraphInit` 将 AnnotationRoot / StateSchema / Zod / legacy `{channels}` 统一为 `StateGraphInit`；`_getChannelsFromSchema` 中：
```ts
if (StateSchema.isInstance(schema)) return schema.getChannels();
if (isInteropZodObject(schema)) return this._metaRegistry.getChannelsForSchema(schema);
if (... lc_graph_name === "AnnotationRoot") return schema.spec;
```
**可讲的知识点**：
- 所有状态写法最终都归约为 `StateDefinition`（`{[key]: BaseChannel | (() => BaseChannel)}`，annotation.ts:21-23）。
- input/output schema 可以与 state schema 不同：input 缺省时用 `PartialStateSchema` Symbol 标记部分校验（state.ts:303, 620-631）。
- `StateGraphInputError` 是无效 schema 的统一报错出口。

### 4. addNode：节点校验、Runnable 包装与错误处理器节点
**来源**：`graph/state.ts:1063-1243`
**证据**：
```ts
if (key in this.channels) throw new Error(
  `${key} is already being used as a state attribute ... cannot also be used as a node name.`);
...
runnable = new RunnableCallable({ func: action, name: key, trace: false });
...
if (options?.errorHandler !== undefined) {
  errorHandlerNode = `__error_handler__${key}`;
  ... this.nodes[errorHandlerNode as N] = handlerSpec;  // isErrorHandler: true
```
**可讲的知识点**：
- 节点名不得与 channel 名冲突；`|` 与 `)` 是 checkpoint namespace 保留字符（state.ts:1131-1140）。
- 普通函数被包成 `RunnableCallable` 且 `trace: false`——追踪交给外层 Pregel 任务。
- 每个带 errorHandler 的节点会自动生成一个 `__error_handler__<node>` 独立节点（isErrorHandler: true），重试耗尽后才运行。

### 5. addEdge(数组) 与 waitingEdges / attachEdge 的 join 通道
**来源**：`graph/state.ts:1245-1278, 1976-2003`
**证据**：
```ts
this.waitingEdges.add([startKey, endKey]);   // 多起点边
...
const channelName = `join:${starts.join("+")}:${end}`;
this.channels[channelName] = this.builder.nodes[end].defer
  ? new NamedBarrierValueAfterFinish(new Set(starts))
  : new NamedBarrierValue(new Set(starts));
this.nodes[end].triggers.push(channelName);
```
**可讲的知识点**：
- `addEdge([a,b], c)` 不是 N 条边，而是编译成一条 NamedBarrier 同步屏障通道。
- 每个起点节点写入 `{channel: join:..., value: start}`；终点节点 trigger 是该 barrier 通道——全部到齐才触发。
- defer 节点使用 `NamedBarrierValueAfterFinish`（finish 后才可读）。

### 6. attachNode：START 节点与 PregelNode 的组装
**来源**：`graph/state.ts:1749-1974`
**证据**：
```ts
this.nodes[key] = new PregelNode<S, U>({
  triggers: [branchChannel],
  channels: isSingleInput ? Object.keys(inputValues) : inputValues,
  writers: [new ChannelWrite(stateWriteEntries, [TAG_HIDDEN])],
  mapper: isSingleInput ? undefined : (input) => filter keys,
  bound: node?.runnable, ...
});
this.channels[branchChannel] = node?.defer
  ? new LastValueAfterFinish() : new EphemeralValue(false);
```
**可讲的知识点**：
- 编译后每个业务节点都变成 PregelNode：`triggers: ["branch:to:<node>"]`，读 `channels`，写 `ChannelWrite`（PASSTHROUGH + mapper）。
- 每个 PregelNode 都挂在一条私有 `branch:to:X` EphemeralValue(false) 通道上——控制流与数据流统一为通道。
- 节点返回值经 `_getUpdates`/`_getRoot` mapper 过滤出合法 channel 键（Command 会被 `_updateAsTuples()` 展开），非法返回值抛 `INVALID_GRAPH_NODE_RETURN_VALUE`（state.ts:1898-1906）。

### 7. 条件边（addConditionalEdges/attachBranch）的编译产物
**来源**：`graph/state.ts:2005-2042`（attachBranch）、`graph/state.ts:2157-2200`（_controlBranch）
**证据**：
```ts
const writes: (ChannelWriteEntry | Send)[] = filteredPackets.map((p) => {
  if (_isSend(p)) return p;
  return { channel: p === END ? p : `branch:to:${p}`, value: start };
});
await ChannelWrite.doWrite({ ...config, tags: [TAG_HIDDEN] }, writes);
```
**可讲的知识点**：
- 条件分支函数返回的目标名被映射为 `branch:to:<target>` 通道写入；返回 `Send` 则原样下发（动态 map-reduce 路由）。
- 返回 `Command({goto})` 时 `_controlBranch` 解析目标；`graph === Command.PARENT` 抛 `ParentCommand` 交给父图（state.ts:2170-2172）。
- 每个节点（含 START）都挂了一个隐式 `_getControlBranch()`，这是 `Command.goto` 不需要显式条件边也能路由的机制。

### 8. Annotation API 与 getChannel：reducer → BinaryOperatorAggregate
**来源**：`graph/annotation.ts:158-195`
**证据**：
```ts
export const Annotation: AnnotationFunction = function (annotation?) {
  if (annotation) return getChannel<ValueType, UpdateType>(annotation);
  else return new LastValue<ValueType>();
} as AnnotationFunction;
...
export function getChannel<V, U = V>(reducer: SingleReducer<V, U>) {
  if (... "reducer" in reducer && reducer.reducer)
    return new BinaryOperatorAggregate(reducer.reducer, reducer.default);
  ...
  return new LastValue<V>();
}
```
**可讲的知识点**：
- `Annotation<T>()` 无 reducer → LastValue；带 `{reducer, default}` → BinaryOperatorAggregate。用户 API 与 channel 类型在此换算。
- `Annotation.Root(sd)` 仅是 `new AnnotationRoot(sd)`（annotation.ts:172），`lc_graph_name = "AnnotationRoot"` 是运行时识别标记（annotation.ts:63, 77-84）。
- `SingleReducer` 里 `value` 字段是 deprecated 别名（annotation.ts:12-18）。

### 9. MessagesAnnotation / MessagesZodState
**来源**：`graph/messages_annotation.ts:44-68, 109-111`
**证据**：
```ts
export const MessagesAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[], Messages>({
    reducer: messagesStateReducer, default: () => [],
  }),
});
export const MessagesZodMeta: SchemaMeta<BaseMessage[], Messages> = {
  reducer: { fn: messagesStateReducer },
  jsonSchemaExtra: { langgraph_type: "messages" },
  default: () => [],
};
```
**可讲的知识点**：
- 预置状态只有 `messages` 一个 key，UpdateType 放宽为 `Messages`（单条或数组、message-like）。
- Zod 版本通过 `SchemaMeta` 注册 reducer + `langgraph_type: "messages"` 额外元数据，与 Annotation 版本语义等价。
- `withLangGraph(schema, meta)` 把 meta 写进 `schemaMetaRegistry` 全局注册表（zod/meta.ts:284-309）。

### 10. messagesStateReducer：ID 去重 / 替换 / 删除 / REMOVE_ALL
**来源**：`graph/messages_reducer.ts:106-179`
**证据**：
```ts
if (RemoveMessage.isInstance(m) && m.id === REMOVE_ALL_MESSAGES) removeAllIdx = i;
...
if (removeAllIdx != null) return rightMessages.slice(removeAllIdx + 1);
...
if (RemoveMessage.isInstance(m)) idsToRemove.add(m.id);
else { idsToRemove.delete(m.id); merged[existingIdx] = m; }   // 同 ID 替换
... throw new Error(`Attempting to delete a message with an ID that doesn't exist ...`)
```
**可讲的知识点**：
- 五条合并规则（见 docstring messages_reducer.ts:72-95）：归一化数组、补 ID、按 ID 替换、RemoveMessage 删除、不存在的 ID 删除报错。
- `REMOVE_ALL_MESSAGES = "__remove_all__"` 哨兵直接截断历史（messages_reducer.ts:21, 142）。
- `toMessage` 把 `AIMessageChunk` 转回普通类：否则 checkpoint 依赖运行方式，重载时 tool_calls 会被 chunk 重建逻辑破坏（messages_reducer.ts:46-70）。

### 11. messagesDeltaReducer：批量不变式 reducer
**来源**：`graph/messages_reducer.ts:213-284`
**证据**：
```ts
// batching-invariant: reducer(reducer(state, xs), ys) === reducer(state, xs.concat(ys))
const MESSAGES_DELTA_REDUCER = Symbol.for("langgraph.messages_delta_reducer");
Object.defineProperty(messagesDeltaReducer, MESSAGES_DELTA_REDUCER, { value: true });
```
**可讲的知识点**：
- 为 DeltaChannel 设计的单遍批量 reducer：去重 + tombstone 置 null，一次线性扫描。
- 用 `Symbol.for` 品牌标记让 ESM/CJS 双副本加载时也能被 `isMessagesDeltaReducer` 识别（messages_reducer.ts:269-284）。
- REDUCE_ALL 哨兵在同一批次内也即时清空，保证批次切分不影响结果。

### 12. Zod 状态支持：SchemaMetaRegistry.getChannelsForSchema
**来源**：`graph/zod/meta.ts:155-171`、`graph/zod/meta.ts:18`
**证据**：
```ts
getChannelsForSchema(schema) {
  for (const [key, channelSchema] of Object.entries(shape)) {
    const meta = this.get(channelSchema);
    if (meta?.reducer) channels[key] = new BinaryOperatorAggregate(meta.reducer.fn, meta.default);
    else channels[key] = new LastValue(meta?.default);
  }
}
...
export const META_EXTRAS_DESCRIPTION_PREFIX = "lg:";
```
**可讲的知识点**：
- Zod schema 转通道的逻辑与 Annotation 相同：有 reducer → BinaryOperatorAggregate，否则 LastValue。
- `getExtendedChannelSchemas` 按 effects（withReducerSchema/asPartial 等）缓存扩展 schema，供输入校验时把 reducer 的 UpdateType schema 套进 partial（meta.ts:187-263）。
- `lg:` 前缀 description 用于把 jsonSchemaExtra 序列化进 schema 描述，服务端可读取。

### 13. BaseChannel 抽象契约
**来源**：`channels/base.ts:45-153`
**证据**：
```ts
export abstract class BaseChannel<ValueType, UpdateType, CheckpointType> {
  abstract lc_graph_name: string;
  lg_is_channel = true;
  abstract fromCheckpoint(checkpoint?): this;
  abstract update(values: UpdateType[]): boolean;
  abstract get(): ValueType;
  abstract checkpoint(): CheckpointType | undefined;
  consume(): boolean { return false; }
  finish(): boolean { return false; }
  isAvailable(): boolean { try { this.get(); return true; } catch ... }
  equals(other: BaseChannel): boolean { return this === other; }
}
```
**可讲的知识点**：
- 7 个抽象方法 + 2 个生命周期钩子（consume/finish）+ 1 个可用性快速路径（isAvailable）。
- `lg_is_channel = true` 是 `isBaseChannel` 的判据（base.ts:40-42）；`lc_graph_name` 是跨实现识别标记。
- ValueType/UpdateType/CheckpointType 三泛型把「读什么/写什么/存什么」拆开——如 Topic 的 ValueType 是 `Array<Value>` 而 UpdateType 是 `Value | Value[]`。

### 14. LastValue：单写覆盖 + INVALID_CONCURRENT_GRAPH_UPDATE
**来源**：`channels/last_value.ts:12-67`
**证据**：
```ts
export class LastValue<Value> extends BaseChannel<Value, Value, Value> {
  lc_graph_name = "LastValue";
  value: [Value] | [] = [];   // 数组包装：undefined 也算一次写入
  update(values: Value[]): boolean {
    if (values.length !== 1) throw new InvalidUpdateError(
      "LastValue can only receive one value per step.",
      { lc_error_code: "INVALID_CONCURRENT_GRAPH_UPDATE" });
```
**可讲的知识点**：
- 每步最多一个值；两个并行节点同时写同一 LastValue 通道就是经典并发冲突错误。
- 内部用 `[Value] | []` 数组包装，区分「未写」与「写了 undefined」。
- checkpoint 即值本身（`checkpoint(): Value`）；`isAvailable` 直接查 length 避免异常。

### 15. LastValueAfterFinish：finish 后才可见，消费即清空
**来源**：`channels/last_value.ts:73-138`
**证据**：
```ts
get(): Value { if (this.value.length === 0 || !this.finished) throw new EmptyChannelError(); }
consume(): boolean { if (this.finished) { this.finished = false; this.value = []; return true; } }
finish(): boolean { if (!this.finished && this.value.length > 0) { this.finished = true; return true; } }
```
**可讲的知识点**：
- 三阶段生命周期：update 存储 → finish 置 finished → 读取后 consume 清空。
- checkpoint 存 `[Value, boolean]` 二元组，resume 时恢复 finished 状态。
- 用于 defer 节点的 `branch:to:` 通道（state.ts:1942-1944）：任务延迟到图结束前执行。

### 16. BinaryOperatorAggregate：归并语义 + Overwrite 哨兵
**来源**：`channels/binop.ts:28-131`
**证据**：
```ts
update(values) {
  if (this.value === undefined) { ... this.value = first; newValues = newValues.slice(1); }
  let seenOverwrite = false;
  for (const incoming of newValues) {
    if (_isOverwriteValue(incoming)) {
      if (seenOverwrite) throw new InvalidUpdateError("Can receive only one Overwrite value per step.");
      this.value = val; seenOverwrite = true; continue;
    } else if (!seenOverwrite && this.value !== undefined)
      this.value = this.operator(this.value, incoming);
  }
}
equals(other) { ... return this.operator === other.operator; }
```
**可讲的知识点**：
- reducer 语义：`operator(current, incoming)`；首个写入直接作为初值（免掉与 default 归并）。
- `Overwrite` 哨兵（constants.ts 导出）一步内只能出现一次，出现即短路归并——这是「绕过 reducer 强制覆盖」的底层实现。
- `equals` 按 operator 引用相等比较（对齐 Python），支撑重复 compile 时通道去重（state.ts:923-928）。

### 17. Topic：PubSub 语义、unique/accumulate 与 checkpoint 兼容
**来源**：`channels/topic.ts:27-136`
**证据**：
```ts
export class Topic<Value> extends BaseChannel<Array<Value>, Value | Value[], Value[] | UniqueTopicCheckpoint<Value>> {
  unique = false; accumulate = false;
  update(values) {
    if (!this.accumulate) { updated = this.values.length > 0; this.values = []; } // 每步清空
    ... if (this.unique) { if (!this.seen.has(value)) { this.seen.add(value); ... } }
  }
  checkpoint() { if (this.unique) return [[...this.seen], [...this.values]]; return [...this.values]; }
```
**可讲的知识点**：
- ValueType 是数组（读一批），UpdateType 是单值或数组（写一批）——写读不对称。
- `accumulate: false` 时每步开头清空缓冲，天然「本步事件总线」；`unique` 用引用相等去重并持久化 seen。
- checkpoint 形状有兼容逻辑：默认 flat 列表（对齐 Python），unique 时 `[seen, values]`。

### 18. AnyValue：并发写不报错，后者覆盖
**来源**：`channels/any_value.ts:10-57`
**证据**：
```ts
// Stores the last value received, assumes that if multiple values are received, they are all equal.
update(values: Value[]): boolean {
  if (values.length === 0) { const updated = this.value.length > 0; this.value = []; return updated; }
  this.value = [values[values.length - 1]];
}
```
**可讲的知识点**：
- 与 LastValue 唯一的行为差异：多写不抛 InvalidUpdateError，静默取最后一个。
- 空更新（update([])）会清空通道——这来自 `_applyWrites` 对未更新通道的步进通知（algo.ts:429-446）。
- 用于 barrier 等内部场景：多节点同时到齐写同一状态值。

### 19. EphemeralValue：写后即焚的控制流通道
**来源**：`channels/ephemeral_value.ts:7-63`
**证据**：
```ts
update(values: Value[]): boolean {
  if (values.length === 0) { const updated = this.value.length > 0; this.value = []; return updated; }
  if (values.length !== 1 && this.guard)
    throw new InvalidUpdateError("EphemeralValue can only receive one value per step.");
```
**可讲的知识点**：
- 无写入的一步自动清空值——`branch:to:` 触发通道用 `EphemeralValue(false)`（guard=false 允许多写，state.ts:1944）。
- checkpoint 虽然返回值，但 START 通道等场景下值生命周期只有一步。
- guard=true 时与 LastValue 一样限制单写，默认值 true。

### 20. UntrackedValueChannel：永不持久化的通道
**来源**：`channels/untracked_value.ts:21-113`
**证据**：
```ts
export class UntrackedValueChannel<Value> extends BaseChannel<Value, Value, undefined> {
  lc_graph_name = "UntrackedValue";
  checkpoint(): undefined { return undefined; }   // 永不 checkpoint
  fromCheckpoint(_checkpoint?: undefined): this { return new UntrackedValueChannel({...}); }
```
**可讲的知识点**：
- CheckpointType 固定 undefined：DB 连接、临时缓存等运行时状态不进 checkpoint。
- guard 与 LastValue 相同（并发单写），但可选 guard=false + initialValueFactory。
- fromCheckpoint 直接丢弃 checkpoint——恢复即重置。

### 21. NamedBarrierValue：静态 join 屏障
**来源**：`channels/named_barrier_value.ts:13-81`
**证据**：
```ts
export class NamedBarrierValue<Value> extends BaseChannel<void, Value, Value[]> {
  names: Set<Value>;  // 要等待的节点集合
  seen: Set<Value>;
  get(): void { if (!areSetsEqual(this.names, this.seen)) throw new EmptyChannelError(); return undefined; }
  consume(): boolean { if (...areSetsEqual(this.seen, this.names)) { this.seen = new Set(); return true; } }
```
**可讲的知识点**：
- ValueType 是 void——它不传数据只传「同步信号」；update 记录 seen，集齐 names 才 isAvailable。
- 写入不在 names 中的名字直接抛 InvalidUpdateError（屏障成员是编译期固定的）。
- consume 集齐后清空 seen，供下一次 join 复用；checkpoint 存 seen 列表。

### 22. NamedBarrierValueAfterFinish：finish 门控的屏障
**来源**：`channels/named_barrier_value.ts:88-171`
**证据**：
```ts
get(): void { if (!this.finished || !areSetsEqual(this.names, this.seen)) throw new EmptyChannelError(); }
finish(): boolean { if (!this.finished && ...areSetsEqual(this.names, this.seen)) { this.finished = true; ... } }
checkpoint(): [Value[], boolean] { return [[...this.seen], this.finished]; }
```
**可讲的知识点**：
- 在 barrier 之上再加 finish 门：所有成员到齐 + 图进入收尾才放行。
- 用于 defer 节点的 join（state.ts:1988-1990）：保证图内普通工作先完成。
- checkpoint 三元信息（seen + finished）完整恢复屏障状态。

### 23. DynamicBarrierValue：两态屏障（priming/waiting）
**来源**：`channels/dynamic_barrier_value.ts:24-103`
**证据**：
```ts
// priming: 收到 WaitForNames 更新切换到 waiting；waiting: 集齐后可读一次，回到 priming
update(values: (Value | WaitForNames<Value>)[]) {
  const waitForNames = values.filter(isWaitForNames);
  if (waitForNames.length > 1) throw new InvalidUpdateError("Received multiple WaitForNames updates in the same step.");
  this.names = new Set(waitForNames[0].__names);
```
**可讲的知识点**：
- 与 NamedBarrier 的区别：等待名单是运行时通过 `WaitForNames{__names}` 更新动态下发的（Send 场景）。
- 一步内只允许一个 WaitForNames 更新；consume 后回到 priming 态、names 复位 undefined。
- checkpoint 存 `[names?, seen]`，waiting 态跨 checkpoint 恢复。

### 24. DeltaChannel：存哨兵、靠重放重建的 reducer 通道
**来源**：`channels/delta.ts:84-231`
**证据**：
```ts
// Stores only a sentinel in checkpoint blobs and reconstructs state by replaying ancestor writes
public checkpoint(): undefined { return undefined; }
update(values) { ... if (hasOverwrite) { this.value = overwriteValue ?? initialValueFactory(); return true; }
  this.value = this.reducer(base, values); }
replayWrites(writes) { // 最后一个 Overwrite 作为重置点
  ... this.value = remaining.length > 0 ? this.reducer(base, remaining) : base; }
```
**可讲的知识点**：
- 每步不重序列化全量值：channel_values 里缺省，读取时沿祖先链取 writes 重放（`getDeltaChannelHistory`）。
- 快照节奏 = per-channel 更新计数到 `snapshotFrequency`（默认 100）或全局 `DELTA_MAX_SUPERSTEPS_SINCE_SNAPSHOT`（默认 5000）。
- reducer 必须满足批量不变式（结合律），否则用 BinaryOperatorAggregate——这是与普通 reducer 通道的本质契约差异（delta.ts:14-37）。

### 25. 通道创建/恢复的两组基础设施：emptyChannels / channelsFromCheckpoint / createCheckpoint
**来源**：`channels/base.ts:173-187, 303-378, 526-577`
**证据**：
```ts
export function emptyChannels(channels, checkpoint) {
  newChannels[k] = filteredChannels[k].fromCheckpoint(checkpoint.channel_values[k]);
}
export function createCheckpoint(...): Checkpoint {
  return { v: 4, id: options?.id ?? uuid6(step), ts: new Date().toISOString(),
    channel_values: values, channel_versions: channelVersions,
    versions_seen: markBumpsSeen(...) };
}
```
**可讲的知识点**：
- checkpoint 结构：`v: 4` + `id(uuid6)` + `ts` + `channel_values` + `channel_versions` + `versions_seen`，与 langgraph-checkpoint 包的 Checkpoint 类型对应。
- `channelsFromCheckpoint` 对 DeltaChannel 做「祖先回放」补值：批量调 `saver.getDeltaChannelHistory`，逐通道 replayWrites（base.ts:559-576）。
- 版本 bump（快照但非写入）需同步推进 versions_seen，否则会误触发 interruptBefore/订阅者——`markBumpsSeen` + `SNAPSHOT_BUMPS` 专治此坑（base.ts:391-421）。

### 26. PregelLoop 字段全景与 isResuming 判定
**来源**：`pregel/loop.ts:404-678`
**证据**：
```ts
get isResuming() {
  const configIsResuming = ... [CONFIG_KEY_RESUMING];
  const inputIsNullOrUndefined = this.input === null || this.input === undefined;
  const inputIsCommandResuming = isCommand(this.input) && this.input.resume != null;
  const inputIsResuming = this.input === INPUT_RESUMING;
  const runIdMatchesPrevious = !this.isNested && config.metadata?.run_id === checkpointMetadata?.run_id;
  return hasChannelVersions && (configIsResuming || inputIsNullOrUndefined || inputIsCommandResuming || inputIsResuming || runIdMatchesPrevious);
}
```
**可讲的知识点**：
- 五种 resume 信号：显式 config 标记、input 为空、Command.resume、内部 INPUT_RESUMING 符号、同 run_id 重放。
- 前提是 checkpoint 里存在 channel_versions——空 checkpoint 的新 run 不算 resume。
- loop 内大量 DeltaChannel 退出模式的簿记字段（_exitDeltaWrites/_storedDeltaWrites 等，loop.ts:434-487）体现 exit 持久化是本版重点。

### 27. PregelLoop.tick()：BSP 超步主循环
**来源**：`pregel/loop.ts:1194-1411`
**证据**（关键路径摘要）：
```ts
async tick(params): Promise<boolean> {
  if (![INPUT_DONE, INPUT_RESUMING].includes(this.input)) await this._first(inputKeys);
  else if (Object.values(this.tasks).every((task) => task.writes.length > 0)) {
    this.updatedChannels = _applyWrites(this.checkpoint, this.channels, finishTaskList, ...);
    const valuesOutput = ... mapOutputValues(...);           // 产出 values 流
    await this._putCheckpoint({ source: "loop" });           // 先存 checkpoint 再发 values
    if (this.durability === "sync") await this._awaitCheckpointerPromises();
    if (shouldInterrupt(this.checkpoint, this.interruptAfter, finishTaskList)) { this.status = "interrupt_after"; throw new GraphInterrupt(); }
  } else return false;
  if (this.step > this.stop) { this.status = "out_of_steps"; return false; }
  const nextTasks = _prepareNextTasks(this.checkpoint, this.checkpointPendingWrites, this.nodes, this.channels, this.config, true, {...});
  if (taskList.length === 0) { this.status = "done"; return false; }
  if (taskList.every((task) => task.writes.length > 0)) return this.tick({ inputKeys });   // 全部已完成→重入
  if (shouldInterrupt(this.checkpoint, this.interruptBefore, taskList)) { this.status = "interrupt_before"; throw new GraphInterrupt(); }
  if (this.control != null && this.control.drainRequested) { this.status = "draining"; return false; }
  return true;   // 交由外部 runner 执行任务，任务完成后 putWrites → 再 tick
}
```
**可讲的知识点**：
- BSP 模型：tick 做的是「收写 → applyWrites → checkpoint → 准备下一批任务」，真正的并发执行在 `PregelRunner.tick`，二者交替驱动超步。
- 递归重入：若本轮所有任务在 checkpoint 里已有写（resume 场景），直接再 tick 跳过执行（loop.ts:1377-1380）。
- interruptBefore 在派发前检查、interruptAfter 在写入应用后检查；两者都以 `throw GraphInterrupt` 中断——异常即控制流。
- 步数上限 `stop`（`DEFAULT_LOOP_LIMIT = 25`，loop.ts:137）与 cooperative drain（control.drainRequested）都在 tick 里裁决。

### 28. _applyWrites：写应用与通道生命周期钩子
**来源**：`pregel/algo.ts:308-464`
**证据**：
```ts
tasks.sort((a, b) => compareWritesSortKeys(sortKeys.get(a)!, sortKeys.get(b)!));  // 按序列化 task path 确定性排序
for (const task of tasks) { checkpoint.versions_seen[task.name][chan] = checkpoint.channel_versions[chan]; }
...
updated = channel.update(vals);
if (updated && getNextVersion !== undefined) { checkpoint.channel_versions[chan] = nextVersion;
  if (channel.isAvailable()) updatedChannels.add(chan); }
// bumpStep && !triggersNextStep(...) → channel.finish()
```
**可讲的知识点**：
- 写应用顺序按「序列化 task path」排序，保证 live 执行与 checkpointer 重放（writesSortKey）完全一致——确定性是可重放性的根基。
- versions_seen 在应用写之前记录，之后 `channel.update([])` 通知未更新通道进入新步（Topic 清缓冲就靠这里）。
- 「 tentatively 最后一步」时对所有通道调 `finish()`（NamedBarrierAfterFinish/DynamicBarrierAfterFinish 依赖此钩子）。

### 29. shouldInterrupt：版本比较实现断点
**来源**：`pregel/algo.ts:166-202`
**证据**：
```ts
if ((checkpoint.channel_versions[START] ?? nullVersion) > (seen[START] ?? nullVersion)) anyChannelUpdated = true;
...
const anyTriggeredNodeInInterruptNodes = tasks.some((task) =>
  interruptNodes === "*" ? !task.config?.tags?.includes(TAG_HIDDEN) : interruptNodes.includes(task.name));
return anyChannelUpdated && anyTriggeredNodeInInterruptNodes;
```
**可讲的知识点**：
- 断点 = 「有通道版本前进」∧「目标节点被触发」；`"*"` 表示所有非 TAG_HIDDEN 节点。
- versions_seen 记录节点上次读到的版本，比较的是 checkpoint 而非实时 channels——与 checkpoint 恢复语义一致。
- TAG_HIDDEN（内置 START/control branch 写手）不会触发 `*` 断点。

### 30. PregelRunner：任务并发执行与错误聚合
**来源**：`pregel/runner.ts:92-218, 279-415`
**证据**：
```ts
async tick(options: TickOptions = {}) {
  const pendingTasks = allTasks.filter((t) => t.writes.length === 0);
  const taskStream = this._executeTasksWithRetry(pendingTasks, { signals, retryPolicy, maxConcurrency });
  for await (const { task, error, signalAborted } of taskStream) { this._commit(task, error); ... }
  if (nodeErrors.size === 1) throw Array.from(nodeErrors)[0];
  else if (nodeErrors.size > 1) throw new AggregateError(..., `Multiple errors occurred during superstep ...`);
```
**可讲的知识点**：
- runner 与 loop 分离：loop 决定「跑谁」，runner 决定「怎么跑」（并发调度、AbortSignal 链、retry、maxConcurrency）。
- `_executeTasksWithRetry` 用 Promise.race + promiseBarrier 动态接纳 `call()` 推入的 PUSH 任务（runner.ts:333-364）。
- 错误分类：GraphInterrupt 聚合 interrupts 再抛；普通错误 abort 其余并发任务并收集；invalid resume 不 abort（runner.ts:158-188）。

### 31. _commit：任务结果落盘的三种形态
**来源**：`pregel/runner.ts:438-483`
**证据**：
```ts
if (error !== undefined) {
  if (isGraphInterrupt(error)) { const writes = [[INTERRUPT, error.interrupts], ...]; this.loop.putWrites(task.id, writes); }
  ...
} else {
  if (task.writes.length === 0) task.writes.push([NO_WRITES, null]);
  this.loop.putWrites(task.id, task.writes);
}
... task.writes.push([ERROR, { message, name }]); if (this._shouldRouteToErrorHandler(task)) task.writes.push([ERROR_SOURCE_NODE, String(task.name)]);
```
**可讲的知识点**：
- 每个任务结果都以 pending writes 形式持久化（INTERRUPT/ERROR/NO_WRITES 都是特殊通道名）——这是 resume 能精确续跑的存储基础。
- ERROR_SOURCE_NODE 记录失败来源节点，resume 时 `_resumeErrorHandlersIfApplicable` 扫描它重排错误处理器任务（loop.ts:1604-1630）。
- 成功但零写出的任务写 NO_WRITES 哨兵，避免 resume 时被误认为未完成。

### 32. retry：指数退避与默认不重试清单
**来源**：`pregel/retry.ts:13-62, 106-215`
**证据**：
```ts
export const DEFAULT_INITIAL_INTERVAL = 500;
export const DEFAULT_BACKOFF_FACTOR = 2;
export const DEFAULT_MAX_INTERVAL = 128000;
export const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_STATUS_NO_RETRY = [400, 401, 402, 403, 404, 405, 406, 407, 409];
...
if (resolvedRetryPolicy.retryOn ?? DEFAULT_RETRY_ON_HANDLER)(error) ...
const interval = Math.min(maxInterval, initialInterval * backoffFactor ** (attempts - 1));
const sleepMs = jitter ? interval + Math.random() * 1000 : interval;
```
**可讲的知识点**：
- 默认 500ms 起步、2 倍退避、上限 128s、3 次、抖动 +0~1s；4xx/409/AbortError/GraphValueError/ECONNABORTED/insufficient_quota 不重试。
- 每次重试前 `pregelTask.writes.splice(0)` 清空上一轮写；`CONFIG_KEY_RESUMING` 与 `scratchpad.interruptCounter = -1` 让子图 interrupt 复用既有答案（retry.ts:198-205）。
- 节点级 `pregelTask.retry_policy` 优先于图级 retryPolicy（retry.ts:86）。

### 33. timeout：run/idle 双时钟与 TimedAttemptScope
**来源**：`pregel/timeout.ts:27-57, 67-114`
**证据**：
```ts
class TimedAttemptScope { active = true; lastProgress = Date.now(); touch(); autoTouch(); close(); }
class IdleProgressCallbackHandler extends BaseCallbackHandler {
  handleLLMStart = this.#touch; handleLLMNewToken = this.#touch; handleToolEnd = this.#touch; ... }
```
**可讲的知识点**：
- 超时不止 wall-clock：idle timeout 通过 CallbackHandler 观测 LLM/Tool/Chain 事件自动续期，或仅在 `runtime.heartbeat()` 显式心跳时续期（refreshOn: "auto" | "heartbeat"）。
- 超时后 scope.close()：迟到写/迟来任务被丢弃，防止失败尝试的缓冲写泄漏进 checkpoint（timeout.ts:16-24）。
- 超时抛 `NodeTimeoutError`，交由节点的 retryPolicy 决定是否重试（state.ts:159-166）。

### 34. 流模式枚举：8 种 StreamMode
**来源**：`pregel/types.ts:25-35`、`pregel/stream.ts:31-32`
**证据**：
```ts
export type StreamMode = "values" | "updates" | "debug" | "messages" | "checkpoints" | "tasks" | "custom" | "tools";
export type Durability = "exit" | "async" | "sync";
...
// [namespace, streamMode, payload]
export type StreamChunk = [string[], StreamMode, unknown];
```
**可讲的知识点**：
- 8 种模式：values（全量状态）、updates（默认，节点增量）、messages（LLM token）、custom（writer）、debug、checkpoints、tasks、tools。
- StreamChunk 是 `[namespace[], mode, payload]` 三元组，天然支持子图命名空间路由（stream.ts:75-102 的 eventNamespace）。
- 默认 streamMode 是 `"updates"`（state.ts:1558：`streamMode: "updates"`）；checkpoints/tasks 流仅在订阅时才产出，避免全量快照开销（loop.ts:1336-1341）。

### 35. StreamProtocolMessagesHandler：messages 流的实现方式
**来源**：`pregel/messages-v2.ts:102-119`
**证据**：
```ts
export class StreamProtocolMessagesHandler extends BaseCallbackHandler {
  name = "StreamProtocolMessagesHandler";
  streamFn: (streamChunk: StreamChunk) => void;
  metadatas: Record<string, Meta | undefined> = {};
  seen: Record<string, BaseMessage | true> = {};
```
**可讲的知识点**：
- messages 流不是轮询状态，而是 BaseCallbackHandler 挂进 config.callbacks，在 handleLLMNewToken 等回调里直接向流写字。
- `seen` 表用于同消息去重（非流式 fallback 只发一次）。
- content-block 事件（text/reasoning/tool_call_chunk）映射成协议级 delta 事件（messages-v2.ts:63-100）。

### 36. io.ts：输入/命令/输出与通道读取
**来源**：`pregel/io.ts:22-66, 71-133, 168-190`
**证据**：
```ts
export function readChannel(channels, chan, catchErrors = true, ...) { try { return channels[chan].get(); } catch (e) { if (EmptyChannelError) ... return null; } }
export function* mapCommand(cmd, pendingWrites): Generator<[string, string, unknown]> {
  if (_isSend(send)) yield [NULL_TASK_ID, TASKS, send];
  else if (typeof send === "string") yield [NULL_TASK_ID, `branch:to:${send}`, "__start__"];
  if (cmd.resume != null) { ... yield [tid, RESUME, existing]; } else yield [NULL_TASK_ID, RESUME, cmd.resume];
```
**可讲的知识点**：
- Command 在 io 层被解包成 NULL_TASK_ID 挂名的 pending writes：goto→TASKS/branch:to、resume→RESUME、update→逐 channel 写。
- resume 值按 XXH3 任务 id 哈希精确路由到对应任务的 RESUME 写（io.ts:98-111）——interrupt 答案匹配的底层。
- readChannel 对 EmptyChannelError 的吞/抛策略支撑「空通道跳过」的输出语义。

### 37. PregelNode 与 ChannelRead：读模型
**来源**：`pregel/read.ts:17-69, 106-141`
**证据**：
```ts
export class ChannelRead extends RunnableCallable {
  static doRead(config, channel, fresh, mapper) {
    const read = config.configurable?.[CONFIG_KEY_READ];
    if (!read) throw new Error("Runnable is not configured with a read function. Make sure to call in the context of a Pregel process");
```
**可讲的知识点**：
- 读不是闭包直取 channels，而是通过 config.configurable[CONFIG_KEY_READ] 注入的读取函数——同一 runnable 可在任意子图上下文中读正确的通道。
- PregelNode 继承 RunnableBinding：`bound`（业务 runnable）+ `writers`（ChannelWrite 列表）+ `triggers`。
- `fresh` 参数支持读「含本任务未提交写」的本地视图（配合 algo.ts:_localRead 的试算通道副本）。

### 38. ChannelWrite 与 PASSTHROUGH
**来源**：`pregel/write.ts:12-90`
**证据**：
```ts
export const SKIP_WRITE = { [Symbol.for("LG_SKIP_WRITE")]: true };
export const PASSTHROUGH = { [Symbol.for("LG_PASSTHROUGH")]: true };
export class ChannelWrite extends RunnableCallable<RunInput, RunInput> {
  async _write(input, config) {
    const writes = this.writes.map((write) => {
      if (_isChannelWriteTupleEntry(write) && _isPassthrough(write.value)) return { mapper: write.mapper, value: input };
```
**可讲的知识点**：
- PASSTHROUGH 使写条目在运行时才把节点输出注入 value，配合 mapper 完成输出→channel 元组的转换（attachNode 的 stateWriteEntries 即此模式）。
- SKIP_WRITE 哨兵允许 mapper 返回「不写」。
- `ChannelWrite.doWrite` 是静态入口，条件边 branchWriter 也复用它（state.ts:2022-2025）。

### 39. _putCheckpoint：durability 三档与子图 checkpoint 复用父 id
**来源**：`pregel/loop.ts:2080-2193`
**证据**：
```ts
const doCheckpoint = this.checkpointer != null && (this.durability !== "exit" || exiting);
...
// child graphs keep at most one checkpoint per parent checkpoint
// ... always with an id equal to that of the parent checkpoint
this.checkpointMetadata = { ...inputMetadata, step: this.step, parents: this.config.configurable?.[CONFIG_KEY_CHECKPOINT_MAP] ?? {} };
this.checkpoint = createCheckpoint(this.checkpoint, doCheckpoint ? this.channels : undefined, this.step, { channelsToSnapshot, ... });
```
**可讲的知识点**：
- Durability 三档语义落地：exit 只在结束时存、async 异步存、sync 每超步同步存（sync 还要在发 values 前 await 全部持久化 promise，loop.ts:1288-1293）。
- 子图 checkpoint id 复用父 checkpoint id（每父最多一份），错误恢复/中断恢复不丢子图进度。
- checkpoint metadata 携带 `step`、`parents`（checkpoint map）与 `counters_since_delta_snapshot`（pregel/checkpoint.ts:40-46）。

### 40. ReplayState：父图时间旅行时子图的取点规则
**来源**：`pregel/replay.ts:16-82`
**证据**：
```ts
async getCheckpoint(checkpointNs, checkpointer, checkpointConfig) {
  if (this.#isFirstVisit(checkpointNs)) {
    // 返回 checkpointId 之前最近的一个 checkpoint（list + before + limit 1）
  }
  return (await checkpointer.getTuple(checkpointConfig)) ?? undefined;
}
```
**可讲的知识点**：
- 重放历史 checkpoint 时，子图第一次被访问要取「重放点之前」的历史 checkpoint，之后访问退回正常 latest。
- 命名空间去掉 task-id 后缀做「同一子图跨循环迭代只算一次首访」（replay.ts:37-49）。
- 解释了 time-travel 如何保证父子图状态快照的一致性。

### 41. createReactAgent：预置 ReAct 循环
**来源**：`prebuilt/react_agent_executor.ts:669-718`
**证据**：
```ts
export function createReactAgent<A, StructuredResponseFormat, C>(
  params: CreateReactAgentParams<A, StructuredResponseFormat, C>
): CompiledStateGraph<...> {
  const { llm, tools, prompt, stateSchema, checkpointer, responseFormat, preModelHook, postModelHook, version = "v1", ... } = params;
  ...
  toolNode = new ToolNode(toolClasses.filter(isClientTool));
```
**可讲的知识点**：
- 预置图只有 agent/tools 两节点（`N = typeof START | "agent" | "tools"`，react_agent_executor.ts:65）+ messages 状态。
- params 面很宽：pre/postModelHook、responseFormat（结构化输出另调一次 LLM）、version="v1"。
- 动态 llm（函数型 prompt/model）绕过缓存，每次调用重解析（_getDynamicModel，react_agent_executor.ts:742-750）。

### 42. ToolNode：工具执行与错误回喂
**来源**：`prebuilt/tool_node.ts:210-280`、`tool_node.ts:417-433`
**证据**：
```ts
export class ToolNode<T = any> extends RunnableCallable<T, T> {
  handleToolErrors = true;
  protected async runTool(call, config, state): Promise<ToolMessage | Command> {
    ...
    if (isGraphInterrupt(e) || isGraphDrained(e)) throw e;   // 中断不可被错误回喂吞掉
    return new ToolMessage({ status: "error", content: `Error: ${e.message}\n Please fix your mistakes.`, ... });
```
**可讲的知识点**：
- 工具结果统一包成 ToolMessage（status success/error）或放行 Command；错误默认不抛而是回喂给模型（"Please fix your mistakes"）。
- GraphInterrupt/GraphDrained 必须穿透——它们是控制流不是工具错误。
- `toolsCondition` 是极简路由：最后一条 AIMessage 有 tool_calls → "tools"，否则 END。

### 43. langgraph-supervisor：主管-Agent 编排库
**来源**：`libs/langgraph-supervisor/src/supervisor.ts:118-159`、目录 `libs/langgraph-supervisor/src/`（handoff.ts / supervisor.ts）
**证据**：
```ts
export type CreateSupervisorParams<...> = {
  agents: (CompiledStateGraph<...> | RemoteGraph)[];
  llm: LanguageModelLike;
  tools?: (StructuredToolInterface | RunnableToolLike | DynamicTool)[];
  prompt?: CreateReactAgentParams["prompt"];
  responseFormat?: InteropZodType<...> | ...;
```
**可讲的知识点**：
- supervisor 本质是用 createReactAgent 造一个「持有一组 handoff 工具」的中心 agent（输出模式 outputMode、addHandoffBackMessages 在 _makeAgent 中处理，supervisor.ts:103-114）。
- agents 接受编译图或 RemoteGraph——多代理可以跨进程部署。
- 同仓 langgraph-swarm 的 createSwarm 则是无中心：`addConditionalEdges(START, routeToActiveAgent)` 由 state.activeAgent 驱动接力（swarm.ts:64-69, 101-118），要求 stateSchema 必含 activeAgent key。

---

## 第二部分 · 课程清单建议（模块六 · 5 阶段 · 18 课）

### 6.1 StateGraph 构建 API（4 课）
- L01 StateGraph 类型全景：SD/S/U/N 十个泛型如何驱动类型安全 — 从 addNode 累积节点名联合类型到 compile 的 CompiledStateGraph | 源码依据：graph/state.ts:407-418,1693-1716 | kind: theory
- L02 schema 归一化：Annotation/StateSchema/Zod 三条路汇成一个 StateDefinition — constructor 重载与 _normalizeToStateGraphInit | 源码依据：graph/state.ts:805-898 | kind: framework
- L03 addNode 的编译期准备：RunnableCallable 包装、节点名保留字、自动错误处理器节点 — 每个带 errorHandler 的节点悄悄多出一个 __error_handler__<node> | 源码依据：graph/state.ts:1063-1243 | kind: practice ★
- L04 编译即接线：attachNode/attachEdge/attachBranch 如何把业务图降维成 PregelNode + branch:to 通道网络 — join 边变成 NamedBarrier 通道 | 源码依据：graph/state.ts:1749-2003 | kind: theory ★

### 6.2 Channel 系统（5 课）
- L05 BaseChannel 契约：fromCheckpoint/update/get/checkpoint/consume/finish 七件套 — lg_is_channel 与 lc_graph_name 双标记 | 源码依据：channels/base.ts:45-153 | kind: theory
- L06 LastValue 与 BinaryOperatorAggregate：覆盖 vs 归并 — INVALID_CONCURRENT_GRAPH_UPDATE 与 Overwrite 哨兵、equals 按 operator 引用比较 | 源码依据：channels/last_value.ts:12-67, channels/binop.ts:69-131 | kind: theory ★
- L07 Topic 与 AnyValue/EphemeralValue：事件总线与一次性通道 — accumulate/unique 选项、空更新清缓冲的步进通知 | 源码依据：channels/topic.ts:84-135, channels/ephemeral_value.ts:28-44, channels/any_value.ts:28-38 | kind: theory
- L08 同步屏障三兄弟：NamedBarrier/NamedBarrierAfterFinish/DynamicBarrier — join: 命名通道与 WaitForNames 两态机 | 源码依据：channels/named_barrier_value.ts:13-81, channels/dynamic_barrier_value.ts:24-103 | kind: theory ★
- L09 DeltaChannel 与 UntrackedValue：不存全量的两种取舍 — 重放祖先写 vs 完全不追踪，checkpoint 结构 v:4 与 getDeltaChannelHistory | 源码依据：channels/delta.ts:84-231, channels/untracked_value.ts:21-113, channels/base.ts:303-378 | kind: theory ★

### 6.3 Pregel 运行时（4 课）
- L10 PregelLoop.isResuming：五种 resume 信号与 channel_versions 前提 — 从 input 到 run_id 的判定链 | 源码依据：pregel/loop.ts:633-678 | kind: theory
- L11 tick() 深读：一次 BSP 超步的完整旅程 — _first/applyWrites/putCheckpoint/_prepareNextTasks/interrupt 检查/递归重入 | 源码依据：pregel/loop.ts:1194-1411 | kind: theory ★
- L12 _applyWrites 与确定性排序：task path 序列化排序为什么等于可重放 — versions_seen、finish() 钩子、INVALID_UPDATE 包装 | 源码依据：pregel/algo.ts:308-464 | kind: theory ★
- L13 PregelRunner 与 loop 的分工：并发执行、AbortSignal 三链合成、错误聚合 — promiseBarrier 动态接纳 PUSH 任务、_commit 三形态 | 源码依据：pregel/runner.ts:92-218,438-483 | kind: practice ★

### 6.4 流式/检查点/重放（3 课）
- L14 八种流模式与 StreamChunk：values/updates 默认从哪来 — [namespace, mode, payload] 与子图命名空间路由、按需订阅 checkpoints/tasks | 源码依据：pregel/types.ts:25-35, pregel/stream.ts:31-32,75-102, graph/state.ts:1558 | kind: theory
- L15 checkpoint 结构与 durability 三档：exit/async/sync 的真实区别 — sync 在发 values 前 await、子图 checkpoint 复用父 id、metadata 里藏的计数器 | 源码依据：pregel/loop.ts:2080-2193, pregel/checkpoint.ts:17-93 | kind: theory ★
- L16 retry/timeout/resume 的容错矩阵：指数退避默认参数、idle timeout 心跳、ERROR_SOURCE_NODE 重排错误处理器 — interrupt 答案按 XXH3 精确路由 | 源码依据：pregel/retry.ts:13-62, pregel/timeout.ts:27-57, pregel/loop.ts:1604-1630, pregel/io.ts:97-115 | kind: practice ★

### 6.5 高层模式（2 课）
- L17 createReactAgent + ToolNode：预置 ReAct 循环的降维拆解 — agent/tools 两节点、toolsCondition 路由、错误回喂 "Please fix your mistakes" | 源码依据：prebuilt/react_agent_executor.ts:669-750, prebuilt/tool_node.ts:210-280,417-433 | kind: framework
- L18 supervisor vs swarm：中心化 handoff 工具 vs activeAgent 状态接力 — 两个官方多代理库的图结构差异 | 源码依据：libs/langgraph-supervisor/src/supervisor.ts:118-159, libs/langgraph-swarm/src/swarm.ts:64-118 | kind: framework
