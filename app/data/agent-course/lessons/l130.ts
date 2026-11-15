import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L130 = withKind(
  L(
    'L130',
    26,
    '实战 Capstone A：从零实现多 Agent 编排（supervisor + 专门角色）',
    4,
    ['L129'],
    ['cap-a-multi'],
    [
      '从零实现 supervisor 路由表与三个专门角色的职责边界',
      '写出路由不产生副作用的硬检查，并把越权与漏执行做成负例断言',
      '实现升级人工的有类型决定与诊断 / 复核冲突仲裁',
      '把路由表执行覆盖率纳入验收，回填 L128 编排层风险项',
    ],
    `
### 事故：supervisor「顺手」重启了一次服务

上一批运维助手把「诊断」和「执行」塞进同一个 Agent，工具全集一次性挂上去。某次告警里，模型读到一条含「建议立即重启」的历史日志，跳过根因分析直接调用了重启工具。审批票据是有的，签发人也是有的——但批准的是「按诊断结论重启订单服务」，而这次根本没有诊断结论。审计系统查不出任何违规，因为每个字段都合法。

于是团队决定拆成 supervisor 加专门角色。第一版跑起来后又出了新事故：supervisor 在「汇总结果」时觉得复核角色太慢，自己顺手补了一次工具调用。这一次的违规连审计事件都写歪了——动作发生在路由决定之前，span 树里找不到父节点。两次事故指向同一条结论：**多 Agent 的价值不在「用了几个模型」，而在决策权与执行权能否被物理隔开**。本课要做的，就是让 supervisor 在类型上根本没有执行能力。

### 本课唯一要回答的问题

**如何让「谁来处理」成为一个可验收的数据产物，而不是一段藏着副作用的调度代码。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 工具执行、幂等键、审批票据的实现 | L129 | 已交付，本课只消费接口 |
| span 父子关系与失败现场回放 | L131 | 需要路由表稳定后才有可追踪的边界 |
| 评测集与回归基线 | L132 | 本课只给断言，不建基线与阈值 |
| 提示词注入、沙箱、成本熔断 | L133 | 属于横切加固，不改编排语义 |
| 多 Agent 的部署拓扑与扩缩容 | L134 | 编排在本地与分布式下语义相同 |

### 第一件事：角色是权限容器，不是提示词

把角色定义成「一段 prompt + 几个工具」是常见但不充分的写法。角色真正要约束的是**它能接触到的副作用等级上限**：诊断角色只读，执行角色可写但 danger 仍需票据，复核角色只读且不能看到待审批的 pending。这三条一旦写进类型，越权就不再是「模型有没有听话」的概率问题，而是「编译期能不能构造出来」的结构问题。

| 角色 | 允许的工具 | 副作用上限 | 能否产生动作 | 输入 | 输出 |
|---|---|---|---|---|---|
| 诊断 | 查日志、查指标 | read | 否 | 告警与上下文 | 结构化的诊断结论 |
| 执行 | 重启服务、确认告警 | danger（需票据） | 是 | 诊断结论 + 路由步骤 | 动作结果与回执 |
| 复核 | 查指标、查日志 | read | 否 | 动作结果 + 诊断结论 | 通过 / 驳回 + 理由 |
| supervisor | 无 | 无 | **否** | 任务与角色输出 | 路由表或升级决定 |

最后一行是本课的关键：supervisor 的工具集是空集合。它不是「被要求别调工具」，而是拿不到网关。任何试图在 supervisor 里写 \`await this.gateway.execute(...)\` 的代码都过不了类型检查，因为构造器根本不接收这个依赖。

\`\`\`ts title="orchestrator/types.ts：路由决定是纯数据，没有方法、没有依赖" note="关键：RouteDecision 不携带回调与客户端，序列化后可直接进事件流供 L131 回放。"
export type RoleName = 'diagnose' | 'execute' | 'verify' | 'supervisor'

export type SideEffect = 'read' | 'write' | 'danger'

export type Role = {
  name: RoleName
  goal: string
  allowedTools: string[]
  maxSideEffect: SideEffect
  canAct: boolean
}

export type Diagnosis = {
  rootCause: string
  confidence: number
  evidenceIds: string[]
  proposedActions: { action: string; args: unknown; reason: string }[]
}

export type RouteDecision = {
  seq: number
  role: Exclude<RoleName, 'supervisor'>
  kind: 'analyze' | 'act' | 'verify'
  action?: string
  args?: unknown
  dependsOn: number[]
  requiresApproval: boolean
}

export type Escalation = {
  reason: 'low-confidence' | 'missing-approval' | 'verification-rejected' | 'budget-exhausted'
  detail: string
  waitingFor: 'human'
  snapshotRef: string
}

export type RoutePlan = {
  taskId: string
  revision: number
  decisions: RouteDecision[]
  escalation?: Escalation
  createdAt: number
}

export type Handoff = {
  seq: number
  from: RoleName
  to: RoleName
  payload: unknown
  at: number
}

export interface PlanStore {
  savePlan(plan: RoutePlan): Promise<void>
  loadPlan(taskId: string): Promise<RoutePlan | null>
}

export interface EventSink {
  append(event: Record<string, unknown>): Promise<void>
}

export const TOOL_LEVELS: Record<string, SideEffect> = {
  '查日志': 'read',
  '查指标': 'read',
  '确认告警': 'write',
  '重启服务': 'danger',
}
\`\`\`

注意 \`RouteDecision\` 里没有 \`execute()\`、没有 \`client\`、没有闭包，只有可序列化的字段。这不是为了好看：L131 的回放器需要把一次运行的路由表原样重放，如果决定里藏着一个函数或一条网络连接，回放就只能得到「当时跑过了」，得不到「当时决定了什么」。可序列化是编排层能被审计的前提。

### 第二件事：supervisor 只做三件事，且都必须无副作用

supervisor 的输入是任务与已有角色输出，输出是路由表或升级决定。它做三件事：把诊断结论翻译成有序步骤、给每个步骤标注依赖与审批要求、在条件不满足时产出升级决定。它不做工具调用、不写业务状态、不吞掉异常。

\`\`\`ts title="orchestrator/supervisor.ts：纯函数 decideRoute + 薄调度壳" note="关键：构造器不接收 ToolGateway；decideRoute 是同步纯函数，同一输入永远产出同一张路由表。"
import assert from 'node:assert/strict'

export const ROLES: Record<RoleName, Role> = {
  supervisor: { name: 'supervisor', goal: '分派、汇总、仲裁', allowedTools: [],
    maxSideEffect: 'read', canAct: false },
  diagnose: { name: 'diagnose', goal: '定位根因并给出证据', allowedTools: ['查日志', '查指标'],
    maxSideEffect: 'read', canAct: false },
  execute: { name: 'execute', goal: '按已批准步骤执行动作', allowedTools: ['重启服务', '确认告警'],
    maxSideEffect: 'danger', canAct: true },
  verify: { name: 'verify', goal: '核对动作后的指标是否恢复', allowedTools: ['查指标', '查日志'],
    maxSideEffect: 'read', canAct: false },
}

const RANK: Record<SideEffect, number> = { read: 0, write: 1, danger: 2 }

export function assertRoleTools(role: Role): void {
  for (const tool of role.allowedTools) {
    const level = TOOL_LEVELS[tool]
    if (!level) throw new Error('role references unknown tool: ' + tool)
    if (RANK[level] > RANK[role.maxSideEffect]) {
      throw new Error('role exceeds its side-effect ceiling: ' + role.name)
    }
  }
  if (!role.canAct && role.allowedTools.some((t) => TOOL_LEVELS[t] === 'danger')) {
    throw new Error('read-only role holds a danger tool: ' + role.name)
  }
}

export function assertLevelTableMatchesGateway(gateway: ToolGateway): void {
  const actual = new Map(gateway.describe().map((t) => [t.name, t.sideEffect]))
  for (const [name, level] of Object.entries(TOOL_LEVELS)) {
    if (actual.get(name) !== level) throw new Error('tool level drift: ' + name)
  }
  for (const role of Object.values(ROLES)) assertRoleTools(role)
}

export function decideRoute(input: {
  taskId: string
  revision: number
  diagnosis?: Diagnosis
  approvals: Set<string>
  now: number
}): RoutePlan {
  const base = { taskId: input.taskId, revision: input.revision, createdAt: input.now }
  const d = input.diagnosis
  if (!d) {
    return { ...base, decisions: [{ seq: 1, role: 'diagnose', kind: 'analyze',
      action: '查日志', dependsOn: [], requiresApproval: false }] }
  }
  if (d.confidence < 0.6 || d.evidenceIds.length < 2) {
    return { ...base, decisions: [], escalation: {
      reason: 'low-confidence', detail: '证据不足，禁止把猜测转成动作',
      waitingFor: 'human', snapshotRef: input.taskId + ':' + input.revision,
    } }
  }
  const decisions: RouteDecision[] = []
  let seq = 1
  for (const a of d.proposedActions) {
    if (!ROLES.execute.allowedTools.includes(a.action)) {
      return { ...base, decisions: [], escalation: {
        reason: 'verification-rejected', detail: '诊断提出了执行角色无权使用的动作: ' + a.action,
        waitingFor: 'human', snapshotRef: input.taskId + ':' + input.revision,
      } }
    }
    const needs = TOOL_LEVELS[a.action] === 'danger'
    if (needs && !input.approvals.has(a.action)) {
      return { ...base, decisions: [], escalation: {
        reason: 'missing-approval', detail: a.action + ' 缺审批票据',
        waitingFor: 'human', snapshotRef: input.taskId + ':' + input.revision,
      } }
    }
    decisions.push({ seq, role: 'execute', kind: 'act', action: a.action,
      args: a.args, dependsOn: seq === 1 ? [0] : [seq - 1], requiresApproval: needs })
    seq++
  }
  decisions.push({ seq, role: 'verify', kind: 'verify', action: '查指标',
    dependsOn: [seq - 1], requiresApproval: false })
  return { ...base, decisions }
}

export class Supervisor {
  constructor(private store: PlanStore) {}
  async plan(input: Parameters<typeof decideRoute>[0]): Promise<RoutePlan> {
    const plan = decideRoute(input)
    await this.store.savePlan(plan)
    return plan
  }
  async arbitrate(plan: RoutePlan, verdict: { passed: boolean; reason: string }): Promise<RoutePlan> {
    if (verdict.passed) return plan
    return { ...plan, revision: plan.revision + 1, decisions: [], escalation: {
      reason: 'verification-rejected', detail: verdict.reason,
      waitingFor: 'human', snapshotRef: plan.taskId + ':' + plan.revision,
    } }
  }
}
\`\`\`

\`decideRoute\` 是同步纯函数，这一点值得强调。很多实现把路由决策写成「问一次模型，让它输出下一步」，于是同样的输入在不同时间会得到不同的路由表，评测集无法复现，回放器也无法判断「当时为什么这么走」。这里让模型只负责产出 \`Diagnosis\`（结构化结论），把「结论 → 步骤」的翻译留给确定性代码。模型的不确定性被限制在诊断这一层，不进入控制流。**这和 L08 的结论一致：不确定性应该从数据进入，而不是从调度进入。**

### 接缝：本课到底复用了 L129 的哪三样东西

L128 定过「不复用此前任何课程的代码」，这条约束针对的是**跨 Wave 的课程代码**；Capstone 内部的六课必须互相复用，否则第六课会推翻第一课的接口。本课与 L129 的接缝只有三处，每一处都写清了「不允许改什么」：

| L129 交付 | 本课的用法 | 不允许改什么 |
|---|---|---|
| \`ToolGateway.execute()\` | 所有角色的动作（含只读）都经它执行 | 不给只读角色开直通工具的快路径 |
| \`AgentEvent\` 流 | \`action.committed\` 作为覆盖率与回放的事实来源 | 分发器不得自己伪造提交事件 |
| \`RuntimeState\` 状态机 | 升级决定直接复用 \`awaiting_approval\` 与 \`resume()\` | 编排层不得另造一套挂起状态 |

还有一处容易被当作「小事」的接缝：\`TOOL_LEVELS\` 常量表。它必须与 L129 网关里注册的工具等级一致，否则 \`assertRoleTools()\` 会用错误的等级去判断角色上限，读角色手握 danger 工具也可能被判为合法。所以启动时跑一次 \`assertLevelTableMatchesGateway()\`，把网关 \`describe()\` 的结果与常量表逐项比对，不一致就拒绝启动。这延续了 L129 手写 MCP 时定下的原则：**能力清单只能有一个事实来源，展示与校验都必须指向它**。

### 第三件事：漏执行比越权更难发现

越权会触发 \`unknown action\` 或审批失败，日志里很响；漏执行却是静默的。路由表写了三步，执行时第二步抛错被 catch 吞掉，第三步照常跑，最终汇总说「已完成」，而实际上核心动作根本没发生。这类 bug 在演示里几乎不会出现，因为演示路径一路畅通。所以编排层必须有一项硬指标：**路由表执行覆盖率**——每个 \`kind: 'act'\` 的决定都要有对应的 \`action.committed\` 事件，否则整个任务判失败，不允许进入 done。

\`\`\`ts title="orchestrator/dispatcher.ts：消费路由表、记录回执、校验覆盖率" note="关键：覆盖率在汇总之前算；任何一步未提交，任务直接 abort，不允许带着缺口汇报完成。"
export type Receipt = { seq: number; role: RoleName; ok: boolean; output: unknown; error?: string }

export class Dispatcher {
  constructor(private gateway: ToolGateway) {}

  private assertAllowed(role: Role, d: RouteDecision): void {
    if (!role.canAct && d.kind === 'act') {
      throw new Error('read-only role received an act decision: ' + role.name)
    }
    if (d.action && !role.allowedTools.includes(d.action)) {
      throw new Error('role not allowed to use tool: ' + role.name + ' / ' + d.action)
    }
  }

  async run(plan: RoutePlan, state: RuntimeState): Promise<{ receipts: Receipt[]; plan: RoutePlan }> {
    if (plan.escalation) return { receipts: [], plan }
    const receipts: Receipt[] = []
    const completed = new Set<number>()
    for (const d of plan.decisions) {
      if (!d.dependsOn.every((p) => p === 0 || completed.has(p))) {
        throw new Error('dependency not satisfied at seq ' + d.seq)
      }
      const role = ROLES[d.role]
      this.assertAllowed(role, d)
      try {
        if (!d.action) throw new Error('decision without action at seq ' + d.seq)
        const key = [plan.taskId, plan.revision, d.seq, d.action].join(':')
        const out = await this.gateway.execute({
          action: d.action, args: d.args, key, tenantId: state.tenantId,
          approval: d.requiresApproval ? this.gateway.approvalFor({ key }) : undefined,
        })
        receipts.push({ seq: d.seq, role: d.role, ok: true, output: out })
        completed.add(d.seq)
      } catch (err) {
        receipts.push({ seq: d.seq, role: d.role, ok: false, output: null, error: String(err) })
        throw err
      }
    }
    return { receipts, plan }
  }
}

export function coverage(plan: RoutePlan, events: AgentEvent[]): { total: number; committed: number; missing: number[] } {
  const acts = plan.decisions.filter((d) => d.kind === 'act')
  const committedKeys = new Set(
    events.filter((e) => e.type === 'action.committed')
      .map((e) => (e as { key: string }).key),
  )
  const missing = acts
    .filter((d) => !committedKeys.has([plan.taskId, plan.revision, d.seq, d.action].join(':')))
    .map((d) => d.seq)
  return { total: acts.length, committed: acts.length - missing.length, missing }
}
\`\`\`

\`coverage()\` 用 L129 的 \`action.committed\` 事件做事实来源，而不是读 dispatcher 自己记录的 \`receipts\`。这是刻意的：回执是「我觉得我做完了」，事件是「执行入口确认做完了」，两者在崩溃恢复、旁路调用、异步提交这些路径上会分叉。用外部事实校验内部汇报，才能发现「汇总说成功但动作没落地」这类问题。

:::deep

### 为什么路由必须是数据，而不是回调

把 \`RouteDecision\` 写成 \`{ run: () => Promise<void> }\` 看起来更方便：拿到决定直接调用，省一层分发。但这样会同时丢掉三样东西。第一，无法打印「系统当时打算做什么」，升级人工时只能给人看一段代码而不是一张表。第二，无法做依赖校验与覆盖率统计，因为步骤没有编号、没有顺序。第三，无法回放——函数不能被序列化进事件流，L131 只能重放结果，不能重放决策。

更隐蔽的问题是权限：回调里能捕获任何闭包，包括网关。一旦 \`RouteDecision\` 能携带可执行代码，「supervisor 不产生副作用」就只能靠代码评审保证，而不是靠类型保证。本课把它写成纯数据，本质上是把**决策权与执行权之间的缝隙做成了一条不可跨越的序列化边界**。这也是 L128 图纸里「supervisor 只做路由」那句话真正的落点。

:::

### 第四件事：升级人工要是有类型的决定

「不确定怎么办」不能实现成抛异常、返回 null 或者打一行日志。三种情况下必须停下来交给人：诊断置信度低或证据少于两条、danger 动作缺票据、复核判定不通过。三者共用 \`Escalation\` 类型，带原因枚举、可读说明与快照引用；运行时见到它就进入 \`awaiting_approval\`，把快照留给后续请求恢复，正是 L129 那套机制。

\`\`\`ts title="orchestrator/escalation.ts：把「停下」变成可审计的一等公民" note="关键：升级决定写进事件流，人工处理后按 revision 递增重新规划，不复用旧路由表。"
export type HumanReply = { approved: boolean; by: string; note: string; at: number }

export class EscalationHandler {
  constructor(private store: PlanStore, private events: EventSink) {}

  async raise(plan: RoutePlan, state: RuntimeState): Promise<RuntimeState> {
    if (!plan.escalation) throw new Error('plan has no escalation')
    await this.events.append({
      seq: state.lastEventSeq + 1, taskId: plan.taskId,
      type: 'route.escalated', reason: plan.escalation.reason, detail: plan.escalation.detail,
      at: Date.now(),
    })
    return transition(state, 'awaiting_approval')
  }

  async resolve(plan: RoutePlan, reply: HumanReply): Promise<{ next: 'replan' | 'abort'; plan: RoutePlan }> {
    if (!plan.escalation) throw new Error('nothing to resolve')
    if (reply.approved && plan.escalation.reason === 'missing-approval') {
      await this.store.savePlan({ ...plan, revision: plan.revision + 1,
        decisions: [], escalation: undefined })
      return { next: 'replan', plan: { ...plan, revision: plan.revision + 1,
        decisions: [], escalation: undefined } }
    }
    if (reply.approved && plan.escalation.reason === 'low-confidence') {
      return { next: 'replan', plan: { ...plan, revision: plan.revision + 1,
        decisions: [], escalation: undefined } }
    }
    return { next: 'abort', plan }
  }
}

export function assertNoSilentSkip(plan: RoutePlan, receipts: Receipt[]): void {
  const acted = new Set(receipts.filter((r) => r.ok).map((r) => r.seq))
  for (const d of plan.decisions) {
    if (!acted.has(d.seq)) throw new Error('silent skip at seq ' + d.seq)
  }
}
\`\`\`

\`revision\` 递增而不是复用旧路由表，是为了避免「人工改了主意，系统却还按旧步骤执行」。快照引用 \`taskId:revision\` 让 L131 能精确回放「第几次规划时交给了人」，复盘时不必猜是哪一轮。诊断与复核冲突时走 \`verification-rejected\`，且这个分支永远不会被人工批准直接放行——\`resolve()\` 里它落到 \`abort\`，必须重新诊断并产生新证据。这条规则防止「复核说不行、值班同学说算了先过」把安全门变成橡皮图章。

### 负例断言：测「不该发生」比测「正常路径」值钱

\`\`\`ts title="evals/l130-orchestration.test.ts：越权、漏执行与副作用三类负例" note="关键：所有断言只用假网关与序列化后的路由表，不依赖真实模型。"
import assert from 'node:assert/strict'

const fakeGateway = {
  describe: () => Object.entries(TOOL_LEVELS).map(([name, sideEffect]) => ({
    name, description: name, sideEffect,
  })),
  approvalFor: () => undefined,
  execute: async () => 'ok',
} as unknown as ToolGateway

async function t1_supervisorHasNoTools() {
  assert.deepEqual(ROLES.supervisor.allowedTools, [])
  assert.equal(ROLES.supervisor.canAct, false)
  assertLevelTableMatchesGateway(fakeGateway)
  const sup = new Supervisor({ savePlan: async () => {} } as unknown as PlanStore)
  assert.ok(!('gateway' in sup), 'supervisor 构造器不得持有网关')
}

async function t2_readOnlyRoleCannotReceiveAct() {
  const plan: RoutePlan = { taskId: 't', revision: 1, createdAt: 0, decisions: [
    { seq: 1, role: 'diagnose', kind: 'act', action: '重启服务',
      dependsOn: [], requiresApproval: true },
  ] }
  const d = new Dispatcher(fakeGateway)
  await assert.rejects(d.run(plan, {} as RuntimeState), /read-only role received an act/)
}

async function t3_approvalMissingDoesNotProduceSteps() {
  const d: Diagnosis = { rootCause: '连接池耗尽', confidence: 0.91,
    evidenceIds: ['log-1', 'metric-2'],
    proposedActions: [{ action: '重启服务', args: { target: 'order-api' }, reason: '释放连接' }] }
  const plan = decideRoute({ taskId: 't', revision: 1, diagnosis: d,
    approvals: new Set(), now: 0 })
  assert.equal(plan.decisions.length, 0)
  assert.equal(plan.escalation?.reason, 'missing-approval')
}

async function t4_lowConfidenceStopsBeforeAnyAction() {
  const d: Diagnosis = { rootCause: '疑似', confidence: 0.3,
    evidenceIds: ['log-1'], proposedActions: [] }
  const plan = decideRoute({ taskId: 't', revision: 1, diagnosis: d,
    approvals: new Set(['重启服务']), now: 0 })
  assert.equal(plan.decisions.length, 0)
  assert.equal(plan.escalation?.reason, 'low-confidence')
}

async function t5_coverageDetectsSilentSkip() {
  const plan = decideRoute({ taskId: 't', revision: 1, now: 0,
    approvals: new Set(['重启服务']),
    diagnosis: { rootCause: 'x', confidence: 0.9, evidenceIds: ['a', 'b'],
      proposedActions: [{ action: '重启服务', args: {}, reason: 'r' }] } })
  const report = coverage(plan, [])
  assert.equal(report.total, 1)
  assert.deepEqual(report.missing, [1])
  await assert.rejects(async () => assertNoSilentSkip(plan, []), /silent skip at seq 1/)
}

async function t6_planIsSerializable() {
  const plan = decideRoute({ taskId: 't', revision: 1, now: 0, approvals: new Set() })
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan)
}

await t1_supervisorHasNoTools()
await t2_readOnlyRoleCannotReceiveAct()
t3_approvalMissingDoesNotProduceSteps()
t4_lowConfidenceStopsBeforeAnyAction()
await t5_coverageDetectsSilentSkip()
t6_planIsSerializable()
console.log('L130 orchestration: 6/6 passed')
\`\`\`

六条里有四条是负例。这是 L128「评测集必须有负例」在编排层的提前落地：正常路径的测试只能证明「一次能跑通」，负例才能证明「不该动的时候真的没动」。\`t6\` 看起来平平无奇，却是最容易被后续改动破坏的一条——只要有人为了省事往 \`RouteDecision\` 里塞一个回调，它会立刻变红，L131 的回放能力也就随之失效。

:::warn

### 三个会把多 Agent 做成负担的做法

**一、为了「多 Agent」而拆角色。** 角色数量不是价值，职责边界才是。若诊断与复核用同一套工具、同一份输入、同一个判据，拆成两个角色只是多付一次模型调用。判据很简单：两个角色若不能回答「各自被禁止做什么」，它们就是同一个角色。

**二、让 supervisor 汇总时顺手补动作。** 这就是本课开头那次事故。汇总阶段发现「复核没跑」，正确做法是产出升级决定或重新规划，而不是自己调一次工具。supervisor 的构造器里没有网关，这条在类型层面已封死；但仍要防止有人通过全局单例绕过——L133 的调用图检查会穷举所有 \`execute()\` 调用点。

**三、把升级人工做成异常。** 抛异常会丢掉「为什么停、等谁、当时快照是哪一版」，恢复时只能从头再来。升级必须是有类型的、可序列化的、进事件流的决定，这也是 L129 \`awaiting_approval\` 与 \`resume()\` 能直接复用它的原因。

:::

### 风险登记表回填与分工

| L128 风险项 | 本课进展 | 仍需谁接手 |
|---|---|---|
| 越权执行 | 角色权限上限 + 断言校验，supervisor 无工具 | L132 加入评测集负例 |
| 漏执行 | 覆盖率以事件为准，缺提交即判失败 | L131 提供事件查询接口 |
| 审批被绕过 | 缺票据直接产出升级决定，不生成步骤 | L133 静态调用图硬门禁 |
| 审计缺失 | 路由表与升级决定均可序列化进事件流 | L131 组织成 span 树 |

与相邻课的边界：L129 提供 \`ToolGateway\`、\`Executor\` 与 \`AgentEvent\`，本课一行不改，只消费；本课新增的是 \`orchestrator/\` 下的角色表、纯函数 \`decideRoute\`、分发器与升级处理。L131 消费本课的两样东西——\`RoutePlan\`（作为一次运行的骨架）与 \`Handoff\`（作为 span 的父子边），它不需要知道工具怎么执行。L132 会把本课的六条断言扩成带基线的评测集，L133 在不改变路由语义的前提下加安全与成本，L134 只负责让这套编排跑在真实进程里。

一句话记住本课：**编排的产物是「谁该做什么」的记录，不是「已经做了什么」的动作。** 两者混在一起，审计、回放与权限就同时失效。

:::tip

### 判断编排层是否做完的三个问题

把模型的输出固定成一份低置信度诊断，系统有没有产出零步骤的升级决定；把路由表里某个 act 步的 \`action.committed\` 事件删掉，任务有没有被判失败而不是汇报完成；把 \`RoutePlan\` 序列化再反序列化，能不能原样交给分发器执行。三个都成立，L131 才有可靠的东西可追踪。只跑通「诊断 → 重启 → 复核」的顺利路径，什么都没证明。

:::
`,
    null,
    [
      {
        text: 'supervisor 最应该被如何约束，才能真正做到「不产生副作用」？',
        options: [
          '在提示词里写明不要调用工具',
          '构造器不接收网关、工具集为空，路由决定里也不放可执行回调',
          '在执行前加一次运行时检查',
          '把工具调用放到异步队列里',
        ],
        answer: 1,
        explain: '结构性隔离才可靠；提示词约束与运行时检查都能被绕过。',
        concept: 'cap-a-multi',
      },
      {
        text: '为什么路由表执行覆盖率要以 action.committed 事件为准，而不是读分发器回执？',
        options: [
          '事件体积更小',
          '回执是内部汇报，事件是执行入口确认的事实，崩溃恢复与旁路调用时两者会分叉',
          '回执无法序列化',
          '事件里带模型输出',
        ],
        answer: 1,
        explain: '用外部事实校验内部汇报，才能发现「汇报成功但动作没落地」。',
        concept: 'cap-a-multi',
      },
      {
        text: '复核判定不通过时，正确的处理是？',
        options: [
          '让值班同学批准直接放行',
          '产出 verification-rejected 升级决定并终止本轮，重新诊断产生新证据',
          '跳过复核步骤继续汇总',
          '把复核结果记为警告后照常完成',
        ],
        answer: 1,
        explain: '冲突必须回到证据层解决，人工批准不能替代复核。',
        concept: 'cap-a-multi',
      },
      {
        text: '把 RouteDecision 写成带 run 回调的对象，最主要的代价是？',
        options: [
          '性能略差',
          '无法打印决策、无法统计覆盖率、无法序列化回放，还可能携带网关闭包绕过权限',
          '类型定义更长',
          '需要多写一个文件',
        ],
        answer: 1,
        explain: '纯数据是决策权与执行权之间不可跨越的序列化边界。',
        concept: 'cap-a-multi',
      },
    ],
    [
      ['路由表', 'supervisor 唯一产物，可序列化的有序步骤，只决定谁来处理'],
      ['角色权限上限', '每个角色允许的副作用等级，编译期即可阻止越权构造'],
      ['升级决定', '带原因、快照引用与等待对象的有类型决定，不是异常或空值'],
      ['执行覆盖率', '以 action.committed 事件为准，缺任一 act 即判任务失败'],
      ['冲突仲裁', '诊断与复核不一致时回到证据层，不允许人工直接放行'],
      ['依赖校验', '每个步骤的 dependsOn 必须全部完成，防止乱序与静默跳过'],
    ],
    [
      '把 supervisor 写成「问一次模型输出下一步」，使路由无法复现、无法回放。',
      '让 supervisor 在汇总阶段顺手补一次工具调用，动作发生在路由决定之前，审计链条断裂。',
      '用抛异常或返回 null 表示升级人工，丢失原因、快照版本与等待对象。',
      '角色只写 prompt 不写副作用上限，越权退化为「模型有没有听话」的概率问题。',
      '只测顺利路径，漏执行在演示里一路畅通而上线后静默发生。',
    ],
  ),
  'capstone',
)
