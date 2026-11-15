import { L, withKind } from '../../course-builders.ts'

export const L69 = withKind(
  L(
    'L69',
    20,
    'BaseChannel 契约：七件套方法与双标记',
    2,
    ['L68'],
    ['lc-base-channel'],
    [
      '背下 BaseChannel 的抽象方法集（fromCheckpoint/update/get/checkpoint）与两个生命周期钩子（consume/finish）各自被谁调用',
      '解释 lg_is_channel 与 lc_graph_name 双标记分别服务什么判型场景',
      '用 Topic 的三泛型实例说明 ValueType/UpdateType/CheckpointType 把「读什么/写什么/存什么」拆开的设计',
    ],
    `### 11 种实现的公共骨架：先立规矩，再谈个性

从本课起进入 Channel 系统。上一课看到编译期的全部控制流都落在通道上，而所有通道共享同一个抽象基类。**BaseChannel 的契约极小：四个抽象方法 + 两个生命周期钩子 + 两个判型标记，整个 langgraph 内核对通道的全部期待都写在这 110 行里**。channels/index.ts 恰好导出 11 个具体通道类（LastValue、LastValueAfterFinish、BinaryOperatorAggregate、Topic、AnyValue、EphemeralValue、NamedBarrierValue、NamedBarrierValueAfterFinish、DynamicBarrierValue、DeltaChannel、UntrackedValueChannel），后面四课逐个拆解它们如何满足这份契约。

### 四个抽象方法：恢复、写入、读取、存档

\`\`\`ts
export abstract class BaseChannel<
  ValueType = unknown,
  UpdateType = unknown,
  CheckpointType = unknown,
> {
  abstract lc_graph_name: string;
  /** @ignore */
  lg_is_channel = true;

  abstract fromCheckpoint(checkpoint?: CheckpointType): this;
  abstract update(values: UpdateType[]): boolean;
  abstract get(): ValueType;
  abstract checkpoint(): CheckpointType | undefined;
\`\`\`

*— channels/base.ts:45-101（有裁剪，commit fa426b2）*

四个方法的调用方值得记住：**update 由 _applyWrites 在每个超步末调用**（把本步所有任务对该通道的写入按确定性顺序喂进来）；**get 由读侧调用**（PregelNode 的 mapper、ChannelRead、输出组装）；**checkpoint 由 createCheckpoint 调用**（生成 channel_values）；**fromCheckpoint 由 emptyChannels/channelsFromCheckpoint 调用**（恢复时造新实例）。update 返回 boolean 表示「本步是否真的更新了」——_applyWrites 用它决定是否推进 channel_versions（pregel/algo.ts:308-464，L76 详读）。

三泛型的拆分是类型层面的关键决策：读什么（ValueType）、写什么（UpdateType）、存什么（CheckpointType）是三个独立维度。CheckpointType 最容易被忽略——它可以是值本身（LastValue 的 Value）、二元组（LastValueAfterFinish 的 [Value, boolean]）、甚至 undefined（DeltaChannel/UntrackedValueChannel）。

### 双标记：一个判「是不是通道」，一个判「是哪种通道」

\`\`\`ts
export function isBaseChannel(obj: unknown): obj is BaseChannel {
  return obj != null && (obj as BaseChannel).lg_is_channel === true;
}
\`\`\`

*— channels/base.ts:40-42（commit fa426b2）*

\`lg_is_channel = true\` 是成员资格判定（getOnlyChannels 用它过滤杂项，base.ts:155-171）；\`lc_graph_name\` 是具体身份（"LastValue"、"Topic"、"DeltaChannel"...），isDeltaChannel、isBinaryOperatorAggregate 这类谓词全部基于字符串比较而非 instanceof——ESM/CJS 双副本加载时同一个类的构造函数可能是两个不同对象，字符串身份天然免疫。这套策略与 core 的 MESSAGE_SYMBOL（L05）、AnnotationRoot 的 lc_graph_name（L66）构成一条完整的设计主线：**跨包判型一律绕开 instanceof**。

### 生命周期钩子与可用性快捷路径

\`\`\`ts
consume(): boolean { return false; }
finish(): boolean { return false; }

isAvailable(): boolean {
  try {
    this.get();
    return true;
  } catch (error: any) {
    if (error.name === EmptyChannelError.unminifiable_name) {
      return false;
    }
    throw error;
  }
}

equals(other: BaseChannel): boolean { return this === other; }
\`\`\`

*— channels/base.ts:110-152（commit fa426b2）*

三个非抽象方法的默认实现都是「最小行为」，子类按需覆写。consume/finish 是引擎到通道的两个通知：finish 在「 tentative 最后一步」由 _applyWrites 广播（NamedBarrierValueAfterFinish 靠它解锁，L72），consume 在屏障集齐、值被消费后清空状态供下一轮复用。isAvailable 的注释明确建议子类覆写成 O(1) 检查——几乎所有实现都照做了（查数组长度或 undefined 标记）。equals 默认引用相等，用于重复 compile 时判断同 key 通道是否语义等价（graph/state.ts:923-928），BinaryOperatorAggregate 覆写为比较 operator 引用（channels/binop.ts:126-130）。

### 恢复协议：fromCheckpoint 的「新实例」契约

\`\`\`ts
export function emptyChannels<Cc extends Record<string, BaseChannel>>(
  channels: Cc,
  checkpoint: ReadonlyCheckpoint
): Cc {
  const filteredChannels = getOnlyChannels(channels) as Cc;
  const newChannels = {} as Cc;
  for (const k in filteredChannels) {
    if (!Object.prototype.hasOwnProperty.call(filteredChannels, k)) continue;
    const channelValue = checkpoint.channel_values[k];
    newChannels[k] = filteredChannels[k].fromCheckpoint(channelValue);
  }
  ...
}
\`\`\`

*— channels/base.ts:173-187（commit fa426b2）*

恢复语义的两个要点：其一，**通道实例是短命对象**，每次恢复都 fromCheckpoint 造新实例，通道上的运行时可变状态（seen 集合、缓冲列表）必须完整编码进 CheckpointType 才能幸存——Topic 的 unique 去重历史、DynamicBarrier 的 waiting 态都为此设计了专门的存档形态。其二，channel_values[k] 缺席（通道为空时 createCheckpoint 会吞掉 EmptyChannelError，base.ts:353-362）等价于传 undefined，fromCheckpoint 必须能处理「从零开始」。通道值缺席还有第三种含义——DeltaChannel 的重建走 channelsFromCheckpoint 的祖先回放（base.ts:526-577），那是 L73 的主题。

### equals 的两种覆写与 LastValue 的不对称宽容

equals 看似冷门，但它有一个真实的调用现场：\`_addSchema\` 把通道写进 \`this.channels\` 前，若同 key 已存在就调 \`equals\` 判语义等价——相等则复用旧实例；不等且新通道是 LastValue 则静默容忍；不等且新通道不是 LastValue 直接抛 \`Channel "\${key}" already exists with a different type.\`（graph/state.ts:915-929）。由于 state/input/output 三视图会各调一次 \`_addSchema\`，同一份定义里的每个 key 都要过这道闸——LastValue 之所以获得不对称宽容，是因为所有 LastValue 语义完全相同（无参数、无 reducer），新实例与旧实例「不等价」只发生在引用层面，容忍是安全的。

全部 11 种实现里覆写了 equals 的只有两个，且策略值得对照。BinaryOperatorAggregate 比较 \`this.operator === other.operator\`（channels/binop.ts:126-130）——reducer 函数引用相同即等价，因为它的全部行为都由 operator 决定；DeltaChannel 更严格：先 \`isDeltaChannel\` 判型，再比 \`snapshotFrequency\` 是否一致，最后比 reducer 引用（channels/delta.ts:225-231）——快照节奏不同会导致恢复语义不同，所以连这个数字参数也要纳入等价判定。其余九种通道全部沿用基类的引用相等——对它们而言「类型相同」就足够了。这个三层策略（引用相等 / reducer 引用 / reducer+节奏参数）本身就是一份关于「什么决定通道语义」的阅读理解题。

### 本课小结

- 契约 = 4 抽象方法（fromCheckpoint/update/get/checkpoint）+ 2 钩子（consume/finish）+ isAvailable/equals，全部 11 种实现共用。
- 双标记分工：lg_is_channel 判成员资格，lc_graph_name 判具体身份，全程不用 instanceof。
- 三泛型把读/写/存拆开；CheckpointType 的形态（值、元组、undefined）决定恢复语义。
- fromCheckpoint 必须返回新实例，运行时状态要完整编码进 CheckpointType。
- equals 有三个层级：基类引用相等、Binop 比 operator 引用、Delta 还要比 snapshotFrequency；LastValue 在 _addSchema 的重复注册检查里享受不对称宽容。
- 下一课：最常用的两个通道——LastValue 的单写覆盖与 BinaryOperatorAggregate 的归并语义。
`,
    null,
    [
      {
        text: 'isBaseChannel(obj) 的判据是什么？',
        options: [
          'obj instanceof BaseChannel',
          'obj != null && obj.lg_is_channel === true',
          'obj 上存在 update 和 get 方法',
          'typeof obj.checkpoint === "function"',
        ],
        answer: 1,
        explain:
          'channels/base.ts:40-42 的实现就是检查 lg_is_channel === true，这个字段在抽象类上初始化为 true（base.ts:60）。A 错在 ESM/CJS 双副本或跨包场景下 instanceof 不可靠——与 L05 的 Symbol.for 判型同一动机；C/D 是结构性探测，会把恰好长得很像的普通对象误判成通道，双标记是显式契约。',
        concept: 'lc-base-channel',
      },
      {
        text: 'consume() 与 finish() 两个钩子的默认行为与用途是？',
        options: [
          '都是抽象方法，每个通道必须实现',
          '默认都是 no-op 返回 false：consume 让通道在值被读后修改自身状态（防重复消费），finish 通知「Pregel 运行在收尾」',
          'consume 清空值，finish 持久化值',
          '它们由用户节点代码直接调用',
        ],
        answer: 1,
        explain:
          'BaseChannel.consume/finish 的默认实现只 return false（channels/base.ts:110-122），由需要生命周期语义的子类覆写：LastValueAfterFinish/NamedBarrierValueAfterFinish 用 finish 门控可见性，barrier 与 AfterFinish 家族用 consume 清空 seen 供复用。A 错在它们不是抽象方法；C 把具体子类行为当成了基类行为；D 错在调用方是 _applyWrites 等引擎内部（L76），不是用户代码。',
        concept: 'lc-base-channel',
      },
      {
        text: 'BaseChannel 的三个泛型参数 ValueType/UpdateType/CheckpointType 分别约束什么？',
        options: [
          '输入/输出/错误类型',
          'get() 返回什么 / update() 收到什么 / checkpoint() 存什么——三者互相独立',
          '三个都是值的类型，只是命名不同',
          'CheckpointType 固定为 ValueType',
        ],
        answer: 1,
        explain:
          '抽象类声明 abstract get(): ValueType、abstract update(values: UpdateType[]): boolean、abstract checkpoint(): CheckpointType | undefined（channels/base.ts:85-101）。Topic<Value> 是最好的反例：ValueType 是 Array<Value>（读一批）、UpdateType 是 Value | Value[]（写单值或一批）、CheckpointType 是 Value[] | UniqueTopicCheckpoint<Value>（两种存档形态）。A 是望文生义；C 错在 Topic 上三个类型肉眼可见地不同；D 被 UntrackedValueChannel 的 undefined 反驳。',
        concept: 'lc-base-channel',
      },
      {
        text: 'isAvailable() 的默认实现为什么用 try/catch 包住 get()？子类该怎么做？',
        options: [
          '因为 get() 可能有副作用，需要回滚',
          '默认实现靠捕获 EmptyChannelError 判断空通道；文档建议子类覆写为更高效的直接检查',
          '为了捕获所有异常，任何错误都返回 false',
          '它是一个抽象方法，子类必须实现',
        ],
        answer: 1,
        explain:
          'base.ts:129-140 的默认实现 try { this.get(); return true } catch 里只吞 EmptyChannelError.unminifiable_name 匹配的错误、其他重抛。注释明确写着「子类应覆写以提供比 get()+catch 更高效的实现」——如 LastValue 直接查 this.value.length !== 0（last_value.ts:64-66）。A 无此语义；C 错在非空通道错误必须重抛；D 错在它有默认实现。',
        concept: 'lc-base-channel',
      },
      {
        text: 'emptyChannels(channels, checkpoint) 做了什么？',
        options: [
          '清空所有通道的值',
          '对每个通道调 fromCheckpoint(checkpoint.channel_values[k])，从快照恢复出一套全新通道实例',
          '把通道序列化成 JSON',
          '删除 checkpoint 里多余的通道',
        ],
        answer: 1,
        explain:
          'channels/base.ts:173-187：newChannels[k] = filteredChannels[k].fromCheckpoint(checkpoint.channel_values[k])——恢复不是复用旧实例，而是造全新实例再灌入快照值，这是「通道实例不可复用、状态可重放」的关键。注意 getOnlyChannels 先过滤掉非 BaseChannel 的杂项（155-171）。A 是望文生义（empty 指从空开始重建）；C/D 无此逻辑。',
        concept: 'lc-base-channel',
      },
    ],
    [
      [
        'BaseChannel',
        '全部通道的抽象基类：4 个抽象方法 + 2 个生命周期钩子 + 2 个判型标记 + isAvailable/equals 快捷方法',
      ],
      ['lc_graph_name', '每个具体通道的字符串身份（如 "LastValue"），跨实现识别与 equals 分派都用它'],
      [
        'EmptyChannelError',
        '通道为空时 get()/checkpoint() 抛出的错误，readChannel 等读侧靠它决定「跳过还是报错」',
      ],
      [
        'equals(other)',
        '判断两个同 key 通道是否语义等价，默认引用相等；BinaryOperatorAggregate 覆写为按 operator 引用比较',
      ],
    ],
    [
      '复用旧通道实例恢复状态——fromCheckpoint 的契约是返回全新实例（返回类型 this），直接改旧实例会污染 checkpoint 语义',
      '给通道传了非 BaseChannel 的对象（比如普通 reducer 函数）——_addSchema 与 getOnlyChannels 会把它滤掉或报错，通道必须经 Annotation/工厂创建',
      '把 isAvailable 当作「值非 null」——它判断的是通道可读性（EmptyChannelError 与否），EphemeralValue 写后被清空时同样返回 false',
    ],
  ),
  'theory',
)
