import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L131 = withKind(
  L(
    'L131',
    26,
    '实战 Capstone A：从零接入链路追踪与回放',
    4,
    ['L130'],
    ['cap-a-trace'],
    [
      '从零实现统一事件源与 AsyncLocalStorage span 上下文',
      '写出 span 树构建器、父子关系校验与孤儿检出',
      '从零实现按事件重建状态的确定性回放器，并与 L129 恢复结果做一致性断言',
      '实现审计完整性检查，回填 L128 风险登记表的「审计缺失」项',
    ],
    `
### 复盘会上找不到的那次重启

第三周出了一次事故：告警恢复后三十分钟又复发，值班同学想弄清「到底重启过几次、每次依据是什么」。系统有日志、有指标、有审批记录，但拼不出一条完整的链。审批系统里有一张票据；网关日志里有一条重启；span 里有一个孤立的「执行」节点，parentId 是空的。三个系统各自都对，合起来却回答不了「谁在什么时候、因为哪份诊断、批准了哪一步、执行后指标有没有恢复」。

根因不是「日志打少了」，而是**追踪与状态各写各的**。L129 把状态转移和工具提交做成了同源事件，L130 把路由决定做成了可序列化的数据，但还没人把它们串成一棵树。本课要交的不是一个 tracer 类，而是一个可验证的性质：**给任意一次运行的事件流，都能还原出当时的状态、决策与动作顺序，且不需要重新调用模型或工具。**

### 本课唯一要回答的问题

**如何让「一次运行」成为一份可复现、可审计、可逐帧检查的数据，而不是一堆散落的日志。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 评测集、基线与回归阈值 | L132 | 本课只提供事件查询接口，不定义好坏判据 |
| 采样率、事件体积与成本熔断 | L133 | 审计事件不采样，成本策略属于横切加固 |
| 分布式 collector 与 OTLP 导出 | L134 | 本地事件流语义相同，导出只是换 sink |
| 提示词注入防护与权限加固 | L133 | 不改变追踪语义 |
| 研究报告的溯源质量校验 | L139（Capstone B） | 那边校验引用与证据，不是动作链 |

### 第一件事：把事件流定成唯一事实来源

L129 已经产出 \`state.changed\`、\`budget.hit\`、\`action.committed\`、\`action.rejected\`、\`turn.end\`，L130 又加了 \`route.escalated\` 与 \`Handoff\`。本课不再新增「另一套 tracing 事件」，而是给已有事件补三个字段：全局单调序号、父 span 序号、以及来源标识。补完之后，事件本身就是追踪数据，不需要在业务代码里再写一遍埋点。

| 不变量 | 含义 | 违反时的症状 |
|---|---|---|
| seq 全局单调 | 同一 taskId 内严格递增且不重复 | 回放顺序错乱，动作看起来发生在审批之前 |
| parentSeq 可解析 | 每个子 span 的父序号必须指向已存在的 span | span 树出现孤儿，复盘断链 |
| 决策先于动作 | \`action.committed\` 之前必有 \`route.planned\` | 无法回答「依据是什么」 |
| 提交必有结果 | 每个 \`action.committed\` 对应一条 tool span 的 output | 说做完了却看不到执行结果 |
| 终态有且仅有一次 | \`turn.end\` 与终态转移各出现一次 | 任务被重复汇总或漏记结局 |
| 事件不可变 | append-only，修正靠追加补偿事件而非改写 | 历史被悄悄篡改，审计失去意义 |

\`\`\`ts title="observability/events.ts：扩展后的统一事件与 append-only 存储" note="关键：不再另建 tracing 事件；给业务事件补 seq、parentSeq 与 source，事件流本身就是追踪数据。"
export type EventSource = 'runtime' | 'tool' | 'orchestrator' | 'human'

export type TracedEvent = {
  seq: number
  taskId: string
  parentSeq: number | null
  traceId: string
  spanId: string
  source: EventSource
  type:
    | 'state.changed'
    | 'budget.hit'
    | 'action.committed'
    | 'action.rejected'
    | 'turn.end'
    | 'route.planned'
    | 'route.escalated'
    | 'handoff'
    | 'span.end'
  payload: Record<string, unknown>
  at: number
}

export interface EventLog {
  append(e: TracedEvent): Promise<void>
  ofTask(taskId: string): Promise<TracedEvent[]>
  byTrace(traceId: string): Promise<TracedEvent[]>
}

export class InMemoryEventLog implements EventLog {
  private rows: TracedEvent[] = []
  private seqs = new Map<string, number>()
  async append(e: TracedEvent): Promise<void> {
    const last = this.seqs.get(e.taskId) ?? 0
    if (e.seq !== last + 1) throw new Error('non-monotonic seq: ' + e.seq + ' after ' + last)
    this.seqs.set(e.taskId, e.seq)
    this.rows.push(Object.freeze({ ...e, payload: Object.freeze({ ...e.payload }) }))
  }
  async ofTask(taskId: string): Promise<TracedEvent[]> {
    return this.rows.filter((e) => e.taskId === taskId).sort((a, b) => a.seq - b.seq)
  }
  async byTrace(traceId: string): Promise<TracedEvent[]> {
    return this.rows.filter((e) => e.traceId === traceId).sort((a, b) => a.seq - b.seq)
  }
  async count(): Promise<number> { return this.rows.length }
}
\`\`\`

\`Object.freeze\` 不是装饰：它把「事件不可变」从约定变成运行时约束。若允许改写，一次「顺手修正一下时间戳」就会让回放结果与当时实际发生的不一致，审计也就没有意义了。seq 校验放在 \`append\` 里，是为了让并发写与乱序写在写入当下就失败，而不是等复盘时才发现顺序错乱。

### 第二件事：用 AsyncLocalStorage 传递 span 上下文

最笨的埋点方式是给每个函数加一个 \`parentSpan\` 参数，从 \`supervise()\` 一路传到 \`gateway.execute()\`。它的问题不只是啰嗦：任何一层忘了传，父子关系就断在那里，而且编译器不会提醒。用 \`AsyncLocalStorage\` 把当前 span 放在异步调用上下文里，业务函数签名一行不改，跨 await 也不会丢。

\`\`\`ts title="observability/tracer.ts：ALS 上下文、withSpan 与 span 结束事件" note="关键：span 的 start / end 成对写入同一事件流，异常时也要写 end 并带 error 标记。"
import { AsyncLocalStorage } from 'node:async_hooks'

export type SpanCtx = { traceId: string; spanId: string; parentSeq: number | null; name: string }

export class Tracer {
  private als = new AsyncLocalStorage<SpanCtx>()
  constructor(private log: EventLog, private clock: () => number = Date.now) {}

  context(): SpanCtx | undefined { return this.als.getStore() }

  private async emit(taskId: string, type: TracedEvent['type'],
    payload: Record<string, unknown>, ctx: SpanCtx, source: EventSource): Promise<number> {
    const parent = this.als.getStore()
    const seq = await this.nextSeq(taskId)
    await this.log.append({
      seq, taskId, parentSeq: parent?.parentSeq ?? ctx.parentSeq,
      traceId: ctx.traceId, spanId: ctx.spanId, source, type, payload, at: this.clock(),
    })
    return seq
  }

  private seqCounters = new Map<string, number>()
  private async nextSeq(taskId: string): Promise<number> {
    const n = (this.seqCounters.get(taskId) ?? 0) + 1
    this.seqCounters.set(taskId, n)
    return n
  }

  async withSpan<T>(opts: { taskId: string; name: string; source: EventSource;
    input: unknown }, fn: () => Promise<T>): Promise<T> {
    const parent = this.als.getStore()
    const ctx: SpanCtx = {
      traceId: parent?.traceId ?? opts.taskId + ':trace',
      spanId: [opts.taskId, opts.name, this.clock()].join('/'),
      parentSeq: parent?.parentSeq ?? null,
      name: opts.name,
    }
    const startSeq = await this.emit(opts.taskId, 'span.end',
      { phase: 'start', name: opts.name, input: opts.input }, ctx, opts.source)
    const childCtx = { ...ctx, parentSeq: startSeq }
    try {
      const out = await this.als.run(childCtx, fn)
      await this.emit(opts.taskId, 'span.end',
        { phase: 'end', name: opts.name, output: out }, childCtx, opts.source)
      return out
    } catch (err) {
      await this.emit(opts.taskId, 'span.end',
        { phase: 'end', name: opts.name, error: String(err) }, childCtx, opts.source)
      throw err
    }
  }
}
\`\`\`

这里有个刻意的设计：\`span.end\` 事件同时承担 start 与 end 两种 \`phase\`。看起来不如分成两个类型干净，但它保证了「一个 span 的两条记录一定来自同一个 emitter、同一个 spanId」，不会出现 start 写了、end 因为异常路径漏写。异常分支里也写 end 并带 \`error\`，所以失败的工具调用在树上是完整节点，而不是一个悬空的开头。

### 第三件事：把事件流折成一棵 span 树

有了事件，树是算出来的，不是维护出来的。\`buildTree()\` 只做三件事：按 \`spanId\` 聚合 start / end、按 \`parentSeq\` 挂到父节点、检出无法挂载的孤儿。树结构本身不持久化——持久化的是事件，树随时可重建，这正是「审计可复现」的含义。

\`\`\`ts title="observability/tree.ts：从事件折出 span 树并检出结构问题" note="关键：孤儿不是警告而是错误；父子链断裂意味着这次运行无法被完整复盘。"
export type SpanNode = {
  spanId: string
  name: string
  source: EventSource
  parentId: string | null
  startedAt: number
  endedAt?: number
  durationMs?: number
  input?: unknown
  output?: unknown
  error?: string
  children: SpanNode[]
}

export function buildTree(events: TracedEvent[]): { roots: SpanNode[]; orphans: string[] } {
  const nodes = new Map<string, SpanNode>()
  const parentOf = new Map<string, string | null>()
  const seqToSpan = new Map<number, string>()

  for (const e of events) {
    if (e.type !== 'span.end') continue
    const phase = e.payload.phase
    if (phase === 'start') {
      seqToSpan.set(e.seq, e.spanId)
      nodes.set(e.spanId, {
        spanId: e.spanId, name: String(e.payload.name), source: e.source,
        parentId: null, startedAt: e.at, input: e.payload.input, children: [],
      })
      const parentId = e.parentSeq === null ? null : (seqToSpan.get(e.parentSeq) ?? null)
      parentOf.set(e.spanId, parentId)
    } else {
      const n = nodes.get(e.spanId)
      if (!n) continue
      n.endedAt = e.at
      n.durationMs = e.at - n.startedAt
      n.output = e.payload.output
      if (e.payload.error) n.error = String(e.payload.error)
    }
  }

  const roots: SpanNode[] = []
  const orphans: string[] = []
  for (const [id, node] of nodes) {
    const p = parentOf.get(id)
    if (p === null || p === undefined) { roots.push(node); continue }
    const parent = nodes.get(p)
    if (!parent) { orphans.push(id); continue }
    node.parentId = p
    parent.children.push(node)
  }
  return { roots, orphans }
}

export function assertTreeComplete(events: TracedEvent[]): SpanNode[] {
  const { roots, orphans } = buildTree(events)
  const started = new Set(events.filter((e) => e.payload.phase === 'start').map((e) => e.spanId))
  const ended = new Set(events.filter((e) => e.payload.phase === 'end').map((e) => e.spanId))
  const dangling = [...started].filter((id) => !ended.has(id))
  if (orphans.length) throw new Error('orphan spans: ' + orphans.join(','))
  if (dangling.length) throw new Error('span without end: ' + dangling.join(','))
  if (started.size > 0 && roots.length === 0) throw new Error('no root span')
  return roots
}
\`\`\`

\`assertTreeComplete()\` 把三类结构问题全部判为硬错误：孤儿、有 start 没 end、以及一个根节点都没有。为什么这么严格？因为「大部分节点正常」在复盘时毫无用处——恰恰是断掉的那个节点，对应着出问题的那次动作。L130 开头那次「supervisor 顺手补了一次工具调用」，在这套检查下会直接报孤儿 span：动作发生在任何路由决定之外，找不到父节点。

:::deep

### 回放不是重跑

很多人把「回放」实现成「用同样的输入再跑一次」。这在 Agent 系统里几乎必然失败：模型输出有随机性，外部系统状态已经变了，重启再执行一次就是第二次事故。真正的回放是**纯数据变换**：读事件流，按 seq 顺序把状态机推进一遍，遇到模型输出就读事件里记下的输出，绝不重新调用任何东西。

这个区别决定了 L129 为什么要把 \`action.committed\` 与 \`state.changed\` 从同一次执行里产出。若事件是事后从日志「补记」的，回放得到的是一份看起来合理的叙述，而不是当时真实发生的状态序列；两者在顺利路径上一致，在失败路径上必然分叉。回放要能回答「崩溃那一刻系统认为自己处于哪个状态」，这只有同源事件能做到。

也因此，回放器不产生副作用、不需要网络、不需要模型，可以在 CI 里对任意一次历史运行反复执行。它是 L132 评测集能稳定复现的前提。

:::

### 第四件事：按事件重建状态，并与恢复结果对齐

回放器的输入是事件流与初始预算，输出是与 \`RuntimeState\` 同形的状态。关键校验是**一致性断言**：同一批事件，走 \`replay()\` 得到的终态，必须与 L129 的 \`resume()\` 从快照加事件恢复出的终态在关键字段上完全相同。两者若不一致，说明恢复路径与审计路径对「发生过什么」的理解不同，其中一条一定是错的。

\`\`\`ts title="observability/replay.ts：确定性回放器与一致性断言" note="关键：回放只读事件，不调用模型、不调用网关、不产生任何副作用。"
export type ReplayResult = {
  taskId: string
  tenantId: string
  phase: Phase
  version: number
  steps: number
  committed: string[]
  rejected: { key: string; reason: string }[]
  decisions: number
  escalations: string[]
  lastSeq: number
}

export function replay(taskId: string, tenantId: string,
  budget: Budget, events: TracedEvent[]): ReplayResult {
  const ordered = [...events].filter((e) => e.taskId === taskId).sort((a, b) => a.seq - b.seq)
  let last = 0
  for (const e of ordered) {
    if (e.seq !== last + 1) throw new Error('event gap at seq ' + e.seq)
    last = e.seq
  }
  let phase: Phase = 'running'
  let version = 0
  let steps = 0
  const committed: string[] = []
  const rejected: { key: string; reason: string }[] = []
  let decisions = 0
  const escalations: string[] = []
  for (const e of ordered) {
    switch (e.type) {
      case 'state.changed':
        phase = e.payload.to as Phase
        version++
        break
      case 'action.committed':
        committed.push(String(e.payload.key))
        steps++
        break
      case 'action.rejected':
        rejected.push({ key: String(e.payload.key), reason: String(e.payload.reason) })
        break
      case 'route.planned':
        decisions += Number(e.payload.count ?? 0)
        break
      case 'route.escalated':
        escalations.push(String(e.payload.reason))
        break
      case 'budget.hit':
        phase = 'aborted'
        break
      case 'turn.end':
        if (e.payload.exit === 'answer') phase = 'done'
        break
    }
  }
  if (steps > budget.maxSteps) throw new Error('replay exceeded recorded step budget')
  return { taskId, tenantId, phase, version, steps, committed, rejected,
    decisions, escalations, lastSeq: last }
}

export function assertReplayMatchesRecovery(result: ReplayResult, s: RuntimeState): void {
  if (result.phase !== s.phase) throw new Error('phase divergence')
  if (result.lastSeq !== s.lastEventSeq) throw new Error('event seq divergence')
  for (const key of result.committed) {
    if (!s.done.includes(key)) throw new Error('recovery lost a committed action: ' + key)
  }
  for (const key of s.done) {
    if (!result.committed.includes(key)) throw new Error('audit lost a committed action: ' + key)
  }
}
\`\`\`

\`replay()\` 返回类型与 \`RuntimeState\` 不完全同形（少了 messages 与 budget），这是刻意的：回放关心的是**状态骨架与动作清单**，不是完整的对话上下文。强行让它返回 \`RuntimeState\` 会诱导实现去伪造 messages，而伪造出来的内容在审计里没有任何证据价值。一致性断言只比三个真正可比的东西：终态、事件序号、已提交动作集合。前两者对齐说明顺序没乱，第三者双向比对说明恢复路径与审计路径都没有漏记或臆造动作。

\`\`\`ts title="observability/audit.ts：审计完整性检查，把「找不到记录」变成硬失败" note="关键：每个提交动作都要能回溯到一条路由决定，否则这次动作没有依据。"
export function assertAuditComplete(events: TracedEvent[], plan?: RoutePlan): void {
  const ordered = [...events].sort((a, b) => a.seq - b.seq)
  const planSeqs = ordered.filter((e) => e.type === 'route.planned').map((e) => e.seq)
  const commits = ordered.filter((e) => e.type === 'action.committed')
  if (commits.length > 0 && planSeqs.length === 0) {
    throw new Error('actions without any recorded decision')
  }
  for (const c of commits) {
    const priorPlan = planSeqs.filter((s) => s < c.seq)
    if (priorPlan.length === 0) throw new Error('action precedes decision: ' + c.seq)
    const toolSpans = ordered.filter((e) => e.type === 'span.end'
      && e.source === 'tool' && e.payload.phase === 'end' && e.seq > c.seq)
    if (toolSpans.length === 0) throw new Error('commit without tool result span: ' + c.seq)
  }
  const ends = ordered.filter((e) => e.type === 'turn.end')
  if (ends.length !== 1) throw new Error('expected exactly one turn.end, got ' + ends.length)
  if (plan && plan.decisions.length > 0) {
    const expected = plan.decisions.filter((d) => d.kind === 'act').length
    if (commits.length !== expected) throw new Error('route/action coverage mismatch')
  }
  assertTreeComplete(ordered)
}
\`\`\`

\`assertAuditComplete()\` 检查的是 L128 风险登记表最后一项「审计缺失」的具体化：动作有没有决策依据、提交有没有结果 span、结局是不是恰好一次、路由表里的 act 步是不是都落地了、树有没有断链。任意一条不满足，复盘就不是「信息少一点」，而是**这份运行记录不可信**，必须判失败。这也把 L130 的覆盖率检查从「分发器内部」提升到了「事件流外部」。

### 一次完整运行长什么样

把本课开头那次「重启了几次、依据是什么」的问题拿回来，一次标准运行留下的事件大概是下面这六行。它不依赖任何外部日志系统，读一遍就能逐帧检查：

| seq | type | source | 回答了复盘里的哪个问题 |
|---|---|---|---|
| 1 | route.planned | orchestrator | 打算做什么，步骤由谁执行 |
| 2 | span.end（start） | runtime | 这次运行的根在哪、什么时候开始 |
| 3 | action.committed | tool | 提交了哪个动作、幂等键是什么 |
| 4 | span.end（end） | tool | 动作实际返回了什么、耗时多久 |
| 5 | state.changed | runtime | 状态从哪一态推进到哪一态 |
| 6 | turn.end | runtime | 结局是什么、为什么停 |

四问全部有答案：谁批准（\`route.planned\` 对应 L130 的路由表与票据引用）、什么时候（seq 与 at）、依据什么（决策先于动作的顺序）、结果如何（tool span 的 output 加复核角色的结论）。注意这里没有「模型当时想了什么」——那是调试信息，不是审计事实；把它混进骨架事件只会让体积暴涨，还会因为随机性破坏回放的确定性。

体积口径也在这里定下来：骨架事件全量、永久保留；详细输入输出 span 属于调试层，可以按任务采样、按保留期滚动清理。两者从写入时就带不同的 \`source\` 与类型，L133 做成本优化时会据此分别定价，但**不会改动事件结构**，否则本课所有断言都要重写。这也是把追踪放在 L132 评测之前实现的原因：先有可信的事实，才谈得上给事实打分。

### 五个验收断言

\`\`\`ts title="evals/l131-trace.test.ts：结构、回放与审计三类断言" note="关键：全部用手工构造的事件流，能在 CI 里确定性跑通，不依赖真实运行。"
import assert from 'node:assert/strict'

function ev(seq: number, type: TracedEvent['type'], payload: Record<string, unknown>,
  extra: Partial<TracedEvent> = {}): TracedEvent {
  return { seq, taskId: 'T1', parentSeq: null, traceId: 'T1:trace',
    spanId: 'root', source: 'runtime', type, payload, at: seq * 10, ...extra }
}

async function t1_monotonicSeqEnforced() {
  const log = new InMemoryEventLog()
  await log.append(ev(1, 'state.changed', { to: 'running' }))
  await assert.rejects(log.append(ev(3, 'turn.end', { exit: 'answer' })), /non-monotonic/)
}

function t2_orphanDetected() {
  const events = [
    ev(1, 'span.end', { phase: 'start', name: 'root' }, { spanId: 'root' }),
    ev(2, 'span.end', { phase: 'start', name: 'orphan' }, { spanId: 'orphan', parentSeq: 99 }),
    ev(3, 'span.end', { phase: 'end', name: 'root' }, { spanId: 'root' }),
    ev(4, 'span.end', { phase: 'end', name: 'orphan' }, { spanId: 'orphan' }),
  ]
  assert.throws(() => assertTreeComplete(events), /orphan spans/)
}

function t3_replayRebuildsTerminalState() {
  const events = [
    ev(1, 'route.planned', { count: 1 }, { source: 'orchestrator' }),
    ev(2, 'action.committed', { key: 'k1', action: '重启服务' }, { source: 'tool' }),
    ev(3, 'state.changed', { to: 'done' }),
    ev(4, 'turn.end', { exit: 'answer' }),
  ]
  const r = replay('T1', 'tenant', { maxSteps: 5, maxTokens: 9999, deadlineMs: 99999 }, events)
  assert.equal(r.phase, 'done')
  assert.deepEqual(r.committed, ['k1'])
  assert.equal(r.lastSeq, 4)
}

function t4_auditRejectsActionWithoutDecision() {
  const events = [
    ev(1, 'action.committed', { key: 'k1', action: '重启服务' }, { source: 'tool' }),
    ev(2, 'turn.end', { exit: 'answer' }),
  ]
  assert.throws(() => assertAuditComplete(events), /actions without any recorded decision/)
}

function t5_replayMatchesRecovery() {
  const events = [
    ev(1, 'action.committed', { key: 'k1', action: '重启服务' }, { source: 'tool' }),
    ev(2, 'state.changed', { to: 'done' }),
    ev(3, 'turn.end', { exit: 'answer' }),
  ]
  const r = replay('T1', 'tenant', { maxSteps: 5, maxTokens: 9999, deadlineMs: 99999 }, events)
  const s = newState('T1', 'tenant', { maxSteps: 5, maxTokens: 9999, deadlineMs: 99999 })
  s.phase = 'done'
  s.done = ['k1']
  s.lastEventSeq = 3
  assertReplayMatchesRecovery(r, s)
  s.done = []
  assert.throws(() => assertReplayMatchesRecovery(r, s), /recovery lost/)
}

async function run() {
  await t1_monotonicSeqEnforced()
  t2_orphanDetected(); t3_replayRebuildsTerminalState()
  t4_auditRejectsActionWithoutDecision(); t5_replayMatchesRecovery()
  console.log('L131 trace: 5/5 passed')
}
await run()
\`\`\`

第五条是整套设计的收敛点：它同时用了 L129 的 \`newState\`、L130 的事件语义与本课的 \`replay\`，验证「恢复看到的」与「审计看到的」是同一份事实。把 \`s.done\` 清空后必须报错，说明断言真的在双向比对，不是个恒真的占位。

:::warn

### 三种会让追踪失真的做法

**一、把 tracing 当成第二套日志。** 业务事件写一份，span 另写一份，两份靠时间戳对齐。时间戳精度、时钟偏移、异步写入顺序都会让对齐失败，最终得到两棵互相矛盾的树。正确做法是只有一条 append-only 事件流，span 是它的视图。

**二、对审计事件做采样。** 「只留 10% 降低存储成本」在指标上完全合理，在审计上是灾难：出问题的那次运行有 90% 概率不在样本里。调试 span 可以采样，\`action.committed\`、\`state.changed\`、\`route.planned\` 这些构成事实骨架的事件必须全量。L133 讲成本时会把两者分开定价，本课先立规矩。

**三、回放时重新调用工具或模型。** 这已经不是追踪，是第二次执行。若某个「回放」按钮背后藏着一次真实的重启，它迟早会被人在生产上点到。回放器必须是纯函数：只读事件、只算状态、不碰任何副作用接口。

:::

### 风险登记表回填与分工

| L128 风险项 | 本课进展 | 状态 |
|---|---|---|
| 审计缺失 | 动作须有决策依据、提交须有结果 span、终态恰好一次、树无孤儿 | 已闭合 |
| 恢复时重复执行 | \`assertReplayMatchesRecovery\` 双向比对已完成集合 | 与 L129 共同闭合 |
| 审批被绕过 | 无决策的动作在审计检查里直接判失败 | 补上了事后检出，事前拦截仍靠 L133 |

与相邻课的边界：L129 提供 append-only 的事件与状态机，本课不改它的 \`AgentEvent\` 字段，只在出口处补 \`seq / parentSeq / source\`；L130 提供 \`RoutePlan\` 与 \`Handoff\`，本课把它们变成 span 的父子边与 \`route.planned\` 事件，不重新解释路由语义。L132 消费本课的 \`replay()\` 与 \`assertAuditComplete()\`，把「一次运行是否可复现」变成评测集里的一条硬断言；L133 决定哪些 span 可采样、哪些必须全留，但不改事件结构；L134 只把 \`EventLog\` 换成持久化实现与远端 collector，回放语义保持完全一致。

一句话记住本课：**追踪的产物不是图，是一份能被反复重算的事实；图画得再漂亮，若不能从事件流重新算出来，就没有审计价值。**

:::tip

### 判断追踪是否真的能用的三个问题

随机删掉一条 \`span.end\` 的 end 事件，完整性检查有没有报「span without end」；把某条 \`action.committed\` 挪到 \`route.planned\` 之前，有没有报「action precedes decision」；拿一周前的事件流跑 \`replay()\`，在完全不联网的前提下能不能还原终态与动作清单。三个都成立，L132 才敢把「可复现」写进验收标准。只看到一张漂亮的调用树，什么都还没证明。

:::
`,
    null,
    [
      {
        text: '为什么回放必须是纯数据变换，而不是「用同样输入再跑一次」？',
        options: [
          '重跑速度太慢',
          '模型有随机性且外部状态已变，重跑会重新产生副作用，得到的也不是当时的状态序列',
          '重跑需要额外的模型配额',
          '重跑无法生成 span 树',
        ],
        answer: 1,
        explain: '回放只读事件、只算状态，绝不调用模型或工具。',
        concept: 'cap-a-trace',
      },
      {
        text: '用 AsyncLocalStorage 传 span 上下文，主要解决什么问题？',
        options: [
          '让日志体积更小',
          '避免每层函数手工透传 parentSpan，且跨 await 不丢上下文导致父子链断裂',
          '提高模型推理速度',
          '替代事件流的持久化',
        ],
        answer: 1,
        explain: '手工透传容易被某一层漏掉，编译器也不会提醒。',
        concept: 'cap-a-trace',
      },
      {
        text: '下列哪类事件绝对不能采样？',
        options: [
          '调试用的详细输入输出 span',
          'action.committed、state.changed、route.planned 这类构成事实骨架的事件',
          '耗时统计 span',
          '缓存命中标记',
        ],
        answer: 1,
        explain: '采样会让出问题的那次运行有概率不在样本里，审计失去意义。',
        concept: 'cap-a-trace',
      },
      {
        text: 'assertReplayMatchesRecovery 双向比对已完成集合，目的是？',
        options: [
          '统计 token 消耗',
          '确认恢复路径与审计路径对「发生过什么」的理解一致，任一侧漏记或臆造都会报错',
          '压缩事件流体积',
          '校验审批票据有效期',
        ],
        answer: 1,
        explain: '单向比对只能发现一侧缺失，双向才能发现臆造。',
        concept: 'cap-a-trace',
      },
    ],
    [
      ['统一事件源', '追踪与业务共用一条 append-only 事件流，span 只是它的视图'],
      ['ALS span 上下文', '异步调用上下文中传递当前 span，业务函数签名不变'],
      ['span 树', '按 spanId 聚合 start/end、按 parentSeq 挂父节点，孤儿判硬错误'],
      ['确定性回放', '按 seq 顺序重算状态骨架，不调用模型与工具、不产生副作用'],
      ['一致性断言', '回放终态与恢复快照在终态、序号、已提交集合三项上对齐'],
      ['审计完整性', '决策先于动作、提交必有结果、终态恰好一次、树无断链'],
    ],
    [
      '业务事件与 tracing 事件写成两份，靠时间戳对齐，最终得到两棵互相矛盾的树。',
      '对 action.committed 之类的事实骨架事件做采样，出问题的运行大概率不在样本里。',
      '把回放做成「再跑一次」，在生产上产生第二次不可逆动作。',
      '异常路径漏写 span end，失败节点变成悬空开头，复盘时链条断裂。',
      '允许事后改写事件内容，回放得到的是一份看起来合理的叙述而非当时的事实。',
    ],
  ),
  'capstone',
)
