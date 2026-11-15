import { L, withKind } from '../../course-builders.ts'

export const L71 = withKind(
  L(
    'L71',
    20,
    'Topic 与 AnyValue/EphemeralValue：事件总线与一次性通道',
    2,
    ['L69'],
    ['lc-topic-ephemeral'],
    [
      '解释 Topic 写读不对称（UpdateType 是单值或数组、ValueType 是数组）与 accumulate/unique 两个开关的语义',
      '说出 AnyValue 与 LastValue 的唯一行为差异及它的适用场景',
      '理解 EphemeralValue 的空更新清空行为如何服务于 branch:to 触发通道',
    ],
    `### 三种「非默认」通道：为特定协作模式而生

默认的 LastValue/Binop 之外，内核还内置了三类协作原语：**Topic 是「本步内多发多收」的事件总线，AnyValue 是「多写等值」的宽容通道，EphemeralValue 是「写后即焚」的触发器**。它们都没有对应的 Annotation 语法糖，属于内核层通道（编译器自己大量使用后两者）。本课按「写读不对称 → 两个开关 → 两种宽容」的顺序拆解。

### Topic：写读不对称的事件总线

\`\`\`ts
export class Topic<Value> extends BaseChannel<
  Array<Value>,
  Value | Value[],
  Value[] | UniqueTopicCheckpoint<Value>
> {
  lc_graph_name = "Topic";
  unique = false;
  accumulate = false;
  seen: Set<Value>;
  values: Value[];
\`\`\`

*— channels/topic.ts:27-40（commit fa426b2）*

三泛型的不对称一眼可见：update 接受 \`Value | Value[]\`（单发或批发），get 返回 \`Array<Value>\`（读整批）。这正是 PubSub 的形状——订阅方永远拿「这一步发生的事件列表」，发布方不必关心打包。两个开关的组合语义：

| 组合 | 行为 | checkpoint 形态 |
|---|---|---|
| accumulate=false（默认） | 每步开头清空，get 只见本步写入 | 扁平 values 列表 |
| accumulate=true | 跨步累积全部历史 | 扁平 values 列表 |
| unique=true | 引用相等去重（seen 集合持久化） | [[...seen], [...values]] |

### accumulate/unique 的实现与 checkpoint 兼容史

\`\`\`ts
public update(values: Array<Value | Value[]>): boolean {
  let updated = false;
  if (!this.accumulate) {
    updated = this.values.length > 0;
    this.values = [];
  }
  const flatValues = values.flat() as Value[];
  if (flatValues.length > 0) {
    if (this.unique) {
      for (const value of flatValues) {
        if (!this.seen.has(value)) {
          updated = true;
          this.seen.add(value);
          this.values.push(value);
        }
      }
    } else {
      updated = true;
      this.values.push(...flatValues);
    }
  }
  return updated;
}
\`\`\`

*— channels/topic.ts:84-106（commit fa426b2）*

两个细节体现工程功力。其一，\`accumulate=false\` 的清空返回 updated = 原来有值——**清空也是一次状态变更**，版本时钟因此前进，下游依赖「本步无事件」语义的订阅者才能正确感知。其二，unique 的去重历史 seen 必须进 checkpoint（否则恢复后重复值会再次入列），所以 unique 时存档是 [seen, values] 二元组。checkpoint 的注释还记录了一段兼容决策（topic.ts:115-125）：默认路径改为扁平列表以对齐 Python——以前空 TASKS 通道存 [[], []]，Python checkpointer 会拒收，扁平化后此坑消失；fromCheckpoint 对两种形态都兼容（isUniqueTopicCheckpoint 探测，topic.ts:13-22）。

### AnyValue：多写不报错的「都一样」假设

\`\`\`ts
// Stores the last value received, assumes that if multiple values are received, they are all equal.
update(values: Value[]): boolean {
  if (values.length === 0) {
    const updated = this.value.length > 0;
    this.value = [];
    return updated;
  }
  this.value = [values[values.length - 1]];
  return true;
}
\`\`\`

*— channels/any_value.ts:28-38（commit fa426b2）*

与 LastValue 逐行对照，差异只有两处：多值不抛 InvalidUpdateError 而是**静默取最后一个**；空更新**清空**通道（LastValue 的 update([]) 返回 false 什么都不做）。注释把前提写得很诚实：assume that if multiple values are received, they are all equal——它服务的场景是多个并行节点同步写同一个「确认信号」，语义上取哪个都一样。用户态并发写不相等的值用它，得到的是静默的数据丢失，所以选型时要想清楚「相等假设」是否成立。

### EphemeralValue：空更新清空的触发器

\`\`\`ts
constructor(guard: boolean = true) { super(); this.guard = guard; }

update(values: Value[]): boolean {
  if (values.length === 0) {
    const updated = this.value.length > 0;
    // If there are no updates for this specific channel at the end of the step, wipe it.
    this.value = [];
    return updated;
  }
  if (values.length !== 1 && this.guard) {
    throw new InvalidUpdateError("EphemeralValue can only receive one value per step.");
  }
  this.value = [values[values.length - 1]];
  return true;
}
\`\`\`

*— channels/ephemeral_value.ts:15-44（commit fa426b2）*

关键行为：**本步没有写入就清掉上一步的残留值**。编译器把它用作每个节点的 branch:to 触发通道（graph/state.ts:1944，传 guard=false）：超步 N 写入触发 → 节点执行 → 超步 N+1 若无新写入则自动清空——触发信号天然「一次性」，不会残留导致节点被反复调度。guard=false 放宽单写限制的原因在 attachBranch：条件分支一步可能产生多个目标（多路并发触发），而 barrier 通道按目标隔离，各写各的实例并不冲突。checkpoint() 虽然返回值（可存档），但配合清空行为，值的有效期实际只有一步。

### 步进通知：空更新清空是引擎契约，不是通道自觉

本课三个通道都依赖一个前提：**「一步过去了、本通道没收到写入」这个事实必须有人通知通道**。通道自己没有时钟，感知不到超步边界——通知者是引擎侧的 \`_applyWrites\`：\`bumpStep\` 为真时，它遍历本步所有未进入 \`updatedChannels\` 的可用通道，逐个调 \`channel.update([])\`，若返回 true 且有版本推进函数，就把该通道的 \`channel_versions\` 前进一版（pregel/algo.ts:430-441）。EphemeralValue 的「无写入即清空」与 Topic 的「每步开头清空」都靠这次 \`update([])\` 驱动，这不是通道的自觉行为，而是引擎与通道的契约。

两个细节让这个契约更精确。其一，通知前有 \`isAvailable()\` 预筛——不可用的通道（比如已被清空的 EphemeralValue）不参与步进通知，避免无意义调用。其二，**「清空也是一次状态变更」**：\`update([])\` 返回 true 会让版本时钟前进，这意味着 Topic 清空后通道版本与前一步不同——依赖版本判定中断与否的 \`shouldInterrupt\`（algo.ts:166-202，比较的是 \`channel_versions\` 与 \`versions_seen\`）因此能感知「本步事件已清空」这一变化。不过清空后的通道通常不再可读、也不会触发任务调度，版本前进的副作用主要落在增量恢复与订阅者的簿记上——这也是 L76 要展开「写应用与版本时钟」的伏笔。

把这个契约记住，再看 EphemeralValue 的行为就不会觉得「魔法」：branch:to 触发通道在超步 N 被写入、节点执行，超步 N+1 若无新触发，引擎的步进通知调 \`update([])\`，值被清掉——触发信号的一次性语义由「引擎广播 + 通道配合」两半拼成，缺一半都不成立。

### 本课小结

- Topic：写单值/数组、读数组的 PubSub；accumulate 控制跨步累积、unique 用引用相等去重并把 seen 编码进 checkpoint。
- Topic checkpoint 的扁平化是对齐 Python 的兼容决策，fromCheckpoint 双形态兼容。
- AnyValue：LastValue 去掉并发报错加上空更新清空，前提是「并发写入相等」。
- EphemeralValue：无写入即清空，guard 控制单写约束；branch:to 用 guard=false。
- 清空的驱动力是 _applyWrites 的步进通知（对本步无写入的可用通道调 update([])，algo.ts:430-441），清空也会推进版本时钟。
- 下一课：三个屏障通道——join 边的同步等待如何用通道实现。
`,
    null,
    [
      {
        text: 'Topic 的三个泛型参数分别是什么？',
        options: [
          'Value / Value / Value[]',
          'ValueType = Array<Value>，UpdateType = Value | Value[]，CheckpointType = Value[] | UniqueTopicCheckpoint<Value>',
          '全部是 Array<Value>',
          'ValueType = Value，UpdateType = Array<Value>',
        ],
        answer: 1,
        explain:
          'channels/topic.ts:27-31 的类签名：BaseChannel<Array<Value>, Value | Value[], Value[] | UniqueTopicCheckpoint<Value>>。写读不对称是有意设计：一次 update 可以喂单值或数组，但 get 永远返回本步收集的数组（事件批）。A/C/D 都没有同时表达「写单值或数组、读数组」的不对称。CheckpointType 的双形态对应 unique 开关（flat 列表 vs [seen, values]）。',
        concept: 'lc-topic-ephemeral',
      },
      {
        text: 'Topic 的 accumulate: false（默认）意味着什么？',
        options: [
          '通道永不累积，update 直接丢弃',
          '每步 update 开始时先清空缓冲——它是「本步事件总线」，get 只看到本步写入',
          '写入会被去重',
          'checkpoint 里只存最后一条',
        ],
        answer: 1,
        explain:
          'update 的第一段：if (!this.accumulate) { updated = this.values.length > 0; this.values = []; }（topic.ts:86-89）——注意清空发生在收新值之前，且「原来有值、这步被清空」也算一次更新（返回 true，让版本时钟前进）。C 描述的是 unique 开关；D 无此逻辑。清空的时机由 _applyWrites 的步进通知保证：未收到写入的通道也会被 update([]) 通知（L76）。',
        concept: 'lc-topic-ephemeral',
      },
      {
        text: 'Topic 的 unique 去重用什么判等？checkpoint 形态有何不同？',
        options: [
          'deep equal；checkpoint 相同',
          '引用相等（Set.has）；unique 时 checkpoint 存 [[...seen], [...values]]，默认存扁平 values 列表',
          '按 id 字段；checkpoint 存 Map',
          '哈希比较；checkpoint 永远是 [seen, values]',
        ],
        answer: 1,
        explain:
          'update 里 if (!this.seen.has(value))——Set 的引用相等去重（topic.ts:92-99）；checkpoint() 按 this.unique 分支：unique 返回 [[...this.seen], [...this.values]]，否则 [...this.values]（topic.ts:126-131）。扁平形态是对齐 Python 的决定，注释还记录了一段兼容史：以前空 TASKS 会存成 [[], []] 被 Python checkpointer 拒收。D 错在只有 unique 用 [seen, values]；C 无 id 概念。',
        concept: 'lc-topic-ephemeral',
      },
      {
        text: 'AnyValue 与 LastValue 的行为差异是什么？',
        options: [
          'AnyValue 支持数组值',
          '多写不抛错，静默取最后一个；且空更新（update([])）会清空通道',
          'AnyValue 的值会在 finish 后清空',
          '没有差异，只是别名',
        ],
        answer: 1,
        explain:
          'any_value.ts:28-38：values.length === 0 时清空并返回「原来是否有值」，否则取 values[values.length - 1]。类文档写明前提假设——多个并发写入认为它们相等（any_value.ts:5）。这与 LastValue 抛 INVALID_CONCURRENT_GRAPH_UPDATE 形成对照：NamedBarrier 等内部场景多个节点同时写同一值，报错反而是干扰。A 错在类型泛型与 LastValue 相同；C 描述的是 AfterFinish 家族。',
        concept: 'lc-topic-ephemeral',
      },
      {
        text: '为什么 branch:to 触发通道用 EphemeralValue(false) 而不是 EphemeralValue()？',
        options: [
          'false 表示通道不可用',
          'guard=false 放宽单写限制——条件边可能一步写多个目标值；而默认 guard=true 与 LastValue 一样限制单写',
          'false 表示不参与 checkpoint',
          '两者等价，只是历史写法',
        ],
        answer: 1,
        explain:
          'EphemeralValue 构造器 guard: boolean = true（ephemeral_value.ts:15-18）；update 里 values.length !== 1 && this.guard 才抛错（35-39）。attachNode 给 branch:to 通道传 false（graph/state.ts:1944），因为 attachBranch 的 branchWriter 一步可能向多条 branch:to 通道各写一次，而 EphemeralValue 实例按通道隔离，多目标写入各走各的通道；guard=true 的默认从严是给用户态用的。C 错在它 checkpoint() 返回值（生命周期短是靠空更新清空实现的）；D 错在语义确实不同。',
        concept: 'lc-topic-ephemeral',
      },
    ],
    [
      ['Topic', 'PubSub 通道：单步收集多值、读出数组；accumulate 跨步累积、unique 引用去重'],
      ['AnyValue', '多写静默取最后的通道：前提是并发写入相等，服务于屏障等内部同步场景'],
      ['EphemeralValue', '写后即焚通道：无写入的一步自动清空；guard 控制是否限制单写'],
      ['步进通知', '_applyWrites 对本步未收到写入的通道也调 update([])，Topic/EphemeralValue 的清空依赖它'],
    ],
    [
      '以为 Topic 的 unique 能跨步去重任意对象——Set.has 是引用相等，每次 new 的对象视为不同值',
      '在 accumulate: true 的 Topic 上期待「本步视图」——累积后 get 返回全部历史，要本步增量应该用 accumulate: false 或 updates 流模式',
      '给 branch 通道类场景用默认 EphemeralValue(guard=true) 却写入多次——抛 EphemeralValue can only receive one value per step',
    ],
  ),
  'theory',
)
