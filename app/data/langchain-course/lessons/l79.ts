import { L, withKind } from '../../course-builders.ts'

export const L79 = withKind(
  L(
    'L79',
    22,
    'checkpoint 结构与 durability 三档：sync 在发 values 前 await',
    3,
    ['L75'],
    ['lc-checkpoint-durability'],
    [
      '复述 durability 三档（exit/async/sync）各自的落盘时机与一致性承诺的差异',
      '解释 _putCheckpoint 里「子图每父 checkpoint 至多一份、id 复用父 id」的设计如何服务错误恢复与中断恢复',
      '追踪 counters_since_delta_snapshot 计数器与 DeltaChannel 强制快照（Overwrite/存量 pending writes）两种触发路径',
    ],
    `### 定锚：checkpoint 是流的另一半

L78 说「流的承载是 checkpoint」，本课补全这句话：**checkpoint 结构决定能恢复什么，durability 决定恢复点多密**。二者合起来回答一个生产问题——崩溃后最多丢多少工作、恢复时花多少代价。核心结论先行：**durability 三档的真实区别不是「存不存」，而是「存几次、什么时机、是否在 values 可见前落定」**；而 DeltaChannel 的引入让 checkpoint 从「每步全量」走向「稀疏快照 + 写入重放」，metadata 里多了一个计数器字段来驱动这个节奏。

### checkpoint 结构 v:4 与 metadata 里的新成员

checkpoint 主体结构在 L73/L90 有完整展开（\`v: 4\` + \`id\` + \`ts\` + \`channel_values\` + \`channel_versions\` + \`versions_seen\`，channels/base.ts:303-378），本课聚焦运行时如何**喂**这个结构。第一步是 metadata：

\`\`\`ts
this.checkpointMetadata = {
  ...inputMetadata,
  step: this.step,
  parents: this.config.configurable?.[CONFIG_KEY_CHECKPOINT_MAP] ?? {},
};
\`\`\`

*— pregel/loop.ts:2140-2144（commit fa426b2）*

\`step\` 是超步号，\`parents\` 是 checkpoint map（子图定位用，时间旅行时 ReplayState 靠它找子图取点——pregel/replay.ts:63-81）。DeltaChannel 引入的第三个成员在独立模块里：

\`\`\`ts
export function advanceDeltaCounters(
  channels: Record<string, BaseChannel>,
  updatedChannels: Set<string>,
  counters: Record<string, [number, number]> | undefined
): Record<string, [number, number]> {
  const next: Record<string, [number, number]> = {};
  for (const name in channels) {
    if (!Object.prototype.hasOwnProperty.call(channels, name) ||
        !isDeltaChannel(channels[name])) continue;
    const [updates, supersteps] = counters?.[name] ?? [0, 0];
    next[name] = [
      updatedChannels.has(name) ? updates + 1 : updates,
      supersteps + 1,
    ];
  }
  return next;
}
\`\`\`

*— pregel/checkpoint.ts:17-37（commit fa426b2）*

每个 DeltaChannel 两个计数：距上次快照的**更新数**与**超步数**。快照计划由 \`deltaChannelsToSnapshot(channels, counters, ...)\` 依据这两个数与节奏阈值（per-channel 更新数到 snapshotFrequency，或全局超步上限）决定——落盘的 checkpoint 里只剩非零余量：\`deltaCountersMetadata\` 在计数全为零时干脆不写字段（checkpoint.ts:40-46），避免 metadata 膨胀。

### _putCheckpoint：三档判据与串行保存

\`\`\`ts
protected _putCheckpoint(inputMetadata: Omit<CheckpointMetadata, "step" | "parents">) {
  const exiting = this.checkpointMetadata === inputMetadata;
  if (exiting && this.checkpoint.id === this.checkpointIdSaved) return;
  const doCheckpoint =
    this.checkpointer != null && (this.durability !== "exit" || exiting);
  const storeCheckpoint = (checkpoint: Checkpoint) => {
    ...
    // save it, without blocking
    // if there's a previous checkpoint save in progress, wait for it
    // ensuring checkpointers receive checkpoints in order
    void this._checkpointerPutAfterPrevious({
      config: { ...this.checkpointConfig },
      checkpoint: copyCheckpoint(checkpoint),
      metadata: { ...this.checkpointMetadata },
      newVersions,
    });
    ...
  };
  ...
  // create new checkpoint
  this.checkpoint = createCheckpoint(
    this.checkpoint,
    doCheckpoint ? this.channels : undefined,
    this.step,
    { id: exiting ? this.checkpoint.id : undefined, channelsToSnapshot, ... }
  );
  ...
  if (doCheckpoint) storeCheckpoint(this.checkpoint);
  if (!exiting) this.step += 1;
}
\`\`\`

*— pregel/loop.ts:2080-2211（commit fa426b2）*

四个要点。**档位判据**：exit 档只有 exiting 调用（来自 finishAndHandleError）才 doCheckpoint——且 exit 档不推进 step，因为退出调用复用当前 checkpoint 的 id。**幂等守卫**：\`exiting && checkpoint.id === checkpointIdSaved\` 直接 return，注释说明原因是「再次存储会把自己存成自己的父」。**串行保存**：\`_checkpointerPutAfterPrevious\` 保证 saver 端收到 checkpoint 的顺序与产生顺序一致——这是很多存储后端（按 id 排序的键值存储）的正确性前提。**顺序链**：\`_pendingDeltaWrites\` 注释交代了 DeltaChannel 时代的硬约束——一次 delta 写入失败会跳过本次及之后所有保存，因为 DeltaChannel 从写入链重建，**存过一个缺段的 checkpoint 就永远读短**（loop.ts:571-578）。

### 三档在 tick 与收尾的落点

tick 收尾段（L75 已读）给出 sync 档的位置：\`_putCheckpoint\` → \`if (this.durability === "sync") await this._awaitCheckpointerPromises()\` → \`_emitValuesWithCheckpointMeta\`。**async 档**同样每超步调用 \`_putCheckpoint\`，但不等待——持久化 promise 由 \`_trackCheckpointerPromises\` 管理，失败的 promise 故意留在集合里，最终由 \`_streamIterator\` 的 finally 块 \`Promise.all\` 冒泡（loop.ts:587-604），不会变成未处理拒绝。**exit 档**的落盘条件在 finishAndHandleError：

\`\`\`ts
if (
  this.durability === "exit" &&
  (!this.isNested ||
    typeof error !== "undefined" ||
    this.checkpointNamespace.every((part) => !part.includes(CHECKPOINT_NAMESPACE_END)))
) {
  await this._putExitDeltaWrites();
  this._putCheckpoint(this.checkpointMetadata);
  this._flushPendingWrites();
}
\`\`\`

*— pregel/loop.ts:1413-1429（commit fa426b2）*

顶层图退出必存；**嵌套图带错误或中断也存**——这两个场景需要恢复点。\`_putExitDeltaWrites\` 是 exit 档独有的补救：整轮运行的 DeltaChannel 写入被累积在 \`_exitDeltaWrites\`（\`[step, taskId, taskPath, channel, value]\` 五元组，loop.ts:434-436），退出时统一锚定存储，首个超步的写入还保留真实 task path 以便与 checkpoint 上已存的写入交错一致（loop.ts:449-463 的 \`_exitFirstStep\` 逻辑）。这就是「exit 档每步不持久化增量」的完整机制：**运行期间零写入开销，退出时一次结清**。

### 子图复用父 id 与强制快照

\`\`\`ts
// child graphs keep at most one checkpoint per parent checkpoint
// this is achieved by writing child checkpoints as progress is made
// (so that error recovery / resuming from interrupt don't lose work)
// but doing so always with an id equal to that of the parent checkpoint
this.checkpointConfig = patchConfigurable(this.checkpointConfig, {
  [CONFIG_KEY_CHECKPOINT_NS]: this.config.configurable?.checkpoint_ns ?? "",
});
\`\`\`

*— pregel/loop.ts:2098-2105（commit fa426b2）*

子图每前进一步都写 checkpoint（错误恢复/中断恢复不丢子图工作），但 id 恒等于父 checkpoint id——存储视角下，一个父快照在子图命名空间里至多对应一份「滚动更新」的快照。父图推进到下一个 checkpoint 时，子图才获得新的锚点。强制快照的两条触发路径在 tick 收尾段：Overwrite 扫描（\`deltaChannelWrites\` 里的 \`_isOverwriteValue\` 检查，loop.ts:1226-1228）与 resume 存量写入（\`_resumeLoadedWrites\` 未被领回者，loop.ts:1229-1242）——两者的共同点是**稀疏重放会算错**，必须落全量值。

### durability 从哪来：解析链与失败 promise 的归宿

三档语义前面已经落地，但「档位本身怎么配置的」还有一条解析链值得读：

\`\`\`ts
if (config.durability != null && config.checkpointDuring != null) {
  throw new Error(
    "Cannot use both \`durability\` and \`checkpointDuring\` at the same time.");
}
const checkpointDuringDurability: Durability | undefined = (() => {
  if (config.checkpointDuring == null) return undefined;
  if (config.checkpointDuring === false) return "exit";
  return "async";
})();
const defaultDurability: Durability =
  config.durability ??
  checkpointDuringDurability ??
  config?.configurable?.[CONFIG_KEY_DURABILITY] ??
  "async";
\`\`\`

*— pregel/index.ts:2162-2177（commit fa426b2）*

四条事实：**新参数 \`durability\` 与旧布尔 \`checkpointDuring\` 互斥**，同时传直接抛错；旧布尔是两档映射（false→exit、true→async），老代码迁移时行为不变；解析链第四级是 \`configurable\` 里的运行时键——意味着档位可以随 invoke 逐次覆盖而不必重新 compile；**默认档是 "async" 而不是 exit**，这一默认保证了「不配置也有每超步恢复点」，与前文 pitfalls 里「async 不是不丢、只是崩溃窗口更小」的提醒呼应。另一个运行时细节是失败 promise 的归宿：\`_trackCheckpointerPromise\` 把每个持久化 promise 挂进 \`checkpointerPromises\` 集合，成功即移除、失败保留（loop.ts:587-604）；为了在没人 await 时也不触发 unhandled rejection，它先 \`tracked.catch(() => {})\` 标记已处理——错误仍会通过 finally 的 \`Promise.all\` 冒泡。sync 档的 \`await this._awaitCheckpointerPromises()\` 只是 \`Promise.all([...set])\` 的一行封装（loop.ts:613-615），且注释明确「快照即屏障」：持久化集合在 await 点截断，其后调度的保存不会延长这次等待。综合三档与解析链：**默认配置下你的图每超步都在异步落盘，想要「values 可见即已落盘」就必须显式传 sync**。

### 本课小结

- 三档一句话：exit 退出结清（嵌套图错误/中断除外）、async 每步调度不等待、sync 每步且 values 可见前 await。
- checkpoint metadata 三成员：step、parents（checkpoint map）、counters_since_delta_snapshot（DeltaChannel 节奏）。
- 保存串行化（_checkpointerPutAfterPrevious）与幂等守卫（不自为父）；DeltaChannel 写入失败会级联跳过后续保存。
- 子图 checkpoint 随进度滚动写、id 复用父 id；Overwrite 与未领回的 resume 写入触发强制快照。
- checkpoint 存进去之后如何「取回来接着跑」？下一课看容错矩阵：retry、timeout 与 interrupt 的精确 resume。
`,
    null,
    [
      {
        text: 'durability 三档下，checkpoint 实际写入存储的时机分别是？',
        options: [
          'exit：每超步；async：退出时；sync：退出时',
          'exit：仅运行退出（或嵌套图带错误/中断）时；async：每超步调度但不阻塞；sync：每超步且发 values 前 await 全部落定',
          '三档都是每超步，只是并发度不同',
          'exit：每节点；async：每超步；sync：每任务',
        ],
        answer: 1,
        explain:
          '核心判据在 _putCheckpoint 开头：`doCheckpoint = this.checkpointer != null && (this.durability !== "exit" || exiting)`——exit 档只有 exiting（收尾调用）才落盘；async 每超步走 `_checkpointerPutAfterPrevious` 串行调度但不等待；sync 在 tick 里额外 `await this._awaitCheckpointerPromises()`。C 错——三档连「写多少次」都不同；D 的粒度划分不存在。',
        concept: 'lc-checkpoint-durability',
      },
      {
        text: 'sync 档在发出 values 流事件前 await 全部 checkpointer promise，这条约束保证了什么？',
        options: [
          '流不会被背压阻塞',
          '「values 事件到达 ⇒ 该超步的 checkpoint 已在存储里」这一不变式，消费端基于 values 做分支/恢复时不会指向未落盘的快照',
          'checkpoint 写入永远成功',
          '多线程下的内存一致性',
        ],
        answer: 1,
        explain:
          'tick 里的注释与顺序（_putCheckpoint → await → _emitValuesWithCheckpointMeta）就是为了把「值可见」与「快照可恢复」绑定：消费者拿到 values 后立即用 checkpoint_id 分叉，分叉目标必须真实存在。A 无关；C 恰恰相反——失败 promise 会保留在集合里并通过 Promise.all 冒泡；D 是内存模型概念，不适用于异步落盘。',
        concept: 'lc-checkpoint-durability',
      },
      {
        text: '「子图 checkpoint id 复用父 checkpoint id」的设计动机是？',
        options: [
          '节省 UUID 生成的 CPU 开销',
          '子图随进度持续保存（错误恢复/中断恢复不丢工作），但每个父 checkpoint 至多对应一份子图快照，避免存储爆炸',
          '让子图 checkpoint 出现在父图的时间线里',
          '兼容不支持嵌套 checkpoint 的存储后端',
        ],
        answer: 1,
        explain:
          "storeCheckpoint 里的注释写明：「child graphs keep at most one checkpoint per parent checkpoint ... writing child checkpoints as progress is made (so that error recovery / resuming from interrupt don't lose work) but doing so always with an id equal to that of the parent checkpoint」。A 的开销可忽略；C 是副作用不是动机；D 无此兼容逻辑。",
        concept: 'lc-checkpoint-durability',
      },
      {
        text: '哪些情况会让 DeltaChannel 被强制纳入本轮快照（channelsToSnapshot）？',
        options: [
          '只有计数器到达 snapshotFrequency',
          '本轮出现过 Overwrite 写（live update 已丢弃兄弟值，稀疏重放必须从覆盖后值起步），或 resume 带来的存量 pending writes 归属的任务未被重放',
          '通道值为空时',
          '每次 interrupt 后',
        ],
        answer: 1,
        explain:
          'tick 里两条路径往 _deltaChannelsForcedSnapshot 加通道：`deltaChannelWrites(...)` 扫描本轮写入发现 Overwrite；`_resumeLoadedWrites` 中未被领回的写入归属的通道。计数器到达节奏阈值是常规快照路径，不是「强制」路径。C/D 与强制逻辑无关。',
        concept: 'lc-checkpoint-durability',
      },
    ],
    [
      [
        'Durability',
        'checkpoint 耐久档位：exit（退出才存）/ async（每超步异步存）/ sync（每超步同步存且先于 values 可见）',
      ],
      [
        'counters_since_delta_snapshot',
        'checkpoint metadata 里的计数器：每个 DeltaChannel 记录 [距上次快照的更新数, 超步数]，驱动快照节奏',
      ],
      [
        '_checkpointerPutAfterPrevious',
        'checkpointer 写入的串行化机制：有前一个保存在进行就等它，保证 saver 收到 checkpoint 的顺序与产生顺序一致',
      ],
      ['exiting', '_putCheckpoint 的收尾调用形态：durability 为 exit 时唯一落盘的时机，且不再推进 step 计数'],
    ],
    [
      '把 async 档当成「不会丢 checkpoint」——它在崩溃窗口内的最后若干超步可能未落盘，需要每步可恢复的场景必须用 sync',
      '以为 exit 档完全不写 checkpoint——嵌套图带错误或中断时仍会在收尾落盘（finishAndHandleError 的条件里写明），中断恢复不因 exit 档失效',
      '忽视 DeltaChannel 对 checkpointer 的新契约：一次写入失败会让后续所有保存被跳过（DeltaChannel 从写入链重建，缺一段就读短），存储层必须可靠而非尽力而为',
    ],
  ),
  'theory',
)
