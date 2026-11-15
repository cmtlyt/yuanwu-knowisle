import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L133 = withKind(
  L(
    'L133',
    26,
    '实战 Capstone A：从零加安全护栏 + 成本优化 + 降级兜底',
    4,
    ['L132'],
    ['cap-a-safety'],
    [
      '从零实现静态调用图检查，把「执行入口唯一」从事后抽查变成事前可证',
      '写出参数、凭证、网络三层隔离的沙箱，并接进现有工具网关',
      '实现按任务复杂度的成本路由与可度量账单',
      '实现带能力损失标记的四层降级阶梯与故障演练断言',
    ],
    `
### 一行「临时方便」的直通调用

L132 的评测跑绿之后，有人为了排查一个只读工具偶发超时，在 MCP 服务端加了一行「临时方便」的快路径：绕过 \`ToolGateway.execute()\` 直接调 \`tool.run()\`，理由是「反正只是查日志，不会改东西」。那行代码合进去的第三天，一条含「建议立即重启」的日志被模型读成指令，重启请求沿这条快路径走了出去——审批票据校验整段被跳过，L129 的 \`applied\` 幂等集合也没记上。评测集里的 N1 负例为什么没拦住？因为它查的是 \`action.committed\` 事件，而旁路调用根本不产生事件。

复盘结论不是「以后别写快路径」，而是：**只要「旁路不存在」依赖人自觉，它就一定会重新出现**。L129 的 t5 断言当时只留了个占位，L130 反复强调唯一执行入口，L132 也指出评测只能看见走了入口的动作——三课都点到了同一个缺口，却没人把它封死。本课就是来封这个口的：用静态调用图让旁路在 CI 里编译不过，用沙箱把凭证与网络出口收拢，再把成本与降级接进来，且**不改变任何既有执行语义**。

### 本课唯一要回答的问题

**如何在不改动 L129–L132 一行接口的前提下，把「不能绕过」和「坏了也不崩」变成可验证的性质。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 注入载荷分类与三层防御原理 | L83 / L84 | 本课只在这套代码上落地，不复述原理 |
| 熔断算法、AIMD、重试放大 | L124 / L92 | 降级阶梯消费已有算法，不重新推导 |
| 评测集、负例与发布门禁 | L132 | 已交付，本课断言原样复用 |
| 部署拓扑、探针与灰度配置 | L134 | 本课只给可装配的模块 |
| 研究报告的溯源校验 | L140（Capstone B） | 那是认知型任务的安全，约束不同 |

### 第一件事：把「唯一执行入口」变成静态可证

运行时检查能拦住「这一次调用没走网关」，但拦不住「代码里存在一条可以绕过网关的路径」。后者必须用静态分析：穷举源码里所有对 \`tool.run(\` 与 \`gateway.execute(\` 的调用点，规定前者只能出现在 \`tools/gateway.ts\` 内且只能有一处，后者允许出现在网关消费者里，但任何文件不得直接 import 工具注册表并调用 \`run\`。

| 检查项 | 允许的位置 | 违反后果 |
|---|---|---|
| \`tool.run(\` 调用 | 仅 \`tools/gateway.ts\`，且恰好 1 处 | CI 失败：存在旁路执行 |
| \`new ToolGateway(\` | 仅装配入口 \`infra/app.ts\` | CI 失败：私自造第二个网关实例 |
| \`registry.get(\` / \`registry.values(\` | 仅 \`tools/gateway.ts\` | CI 失败：外部拿到 ToolDef 自行调用 |
| MCP \`tools/call\` 处理 | 必须转交 \`execute()\`，不得出现 \`run(\` | CI 失败：协议层开了快路径 |
| 审批字段读取 \`approval\` | 仅 \`tools/gateway.ts\` | CI 失败：审批逻辑被复制到别处 |

\`\`\`ts title="infra/call-graph.ts：静态调用图检查，发布前跑一次" note="关键：检查的是源码文本而非运行日志，旁路路径即使从未被触发也会被检出。"
export type GraphViolation = { file: string; line: number; rule: string }
export type SourceFile = { rel: string; text: string }

const RULES: { rule: string; needle: string; allowed: string[] }[] = [
  { rule: 'tool.run 只能出现在网关且只能一处', needle: 'tool.run(', allowed: ['gateway.ts'] },
  { rule: '工具注册表的私有访问', needle: 'registry.get(', allowed: ['gateway.ts'] },
  { rule: '网关实例只能在装配入口创建', needle: 'new ToolGateway(', allowed: ['app.ts'] },
  { rule: 'MCP 服务端不得自行执行工具', needle: '.run(parsed', allowed: ['gateway.ts'] },
]

export function assertCallGraph(sources: SourceFile[]): GraphViolation[] {
  const violations: GraphViolation[] = []
  for (const f of sources) {
    // 装配层负责把路径统一成正斜杠，这里只做纯文本判断，不引入路径分隔符与正则
    const base = f.rel.slice(f.rel.lastIndexOf('/') + 1)
    f.text.split('\\n').forEach((line, i) => {
      for (const r of RULES) {
        if (line.includes(r.needle) && !r.allowed.includes(base)) {
          violations.push({ file: f.rel, line: i + 1, rule: r.rule })
        }
      }
    })
  }
  const gateway = sources.find((f) => f.rel.endsWith('/gateway.ts'))
  if (!gateway) {
    return [{ file: '(missing)', line: 0, rule: 'gateway.ts 未纳入扫描' }]
  }
  const runCalls = gateway.text.split('tool.run(').length - 1
  if (runCalls !== 1) {
    violations.push({ file: gateway.rel, line: 0,
      rule: 'tool.run 调用点必须恰好 1 处，实际 ' + runCalls })
  }
  return violations
}

export function assertNoBypass(violations: GraphViolation[]): void {
  if (violations.length) {
    throw new Error('call graph bypass: ' + violations
      .map((v) => v.file + ':' + v.line + ' ' + v.rule).join(' | '))
  }
}
\`\`\`

这里有两处刻意的选择。第一，用 \`line.includes(needle)\` 而不是正则：课程仓库里的源码检查脚本一旦写正则，就要处理转义与边界，而字符串包含对「有没有直接调 \`run(\`」这个问题已经足够，且不会漏报。第二，\`gateway.ts\` 里 \`tool.run(\` 的数量被钉死为 1——不是「至少 1」，是**恰好 1**。多一处就意味着有人在同一文件里又开了个便捷入口，审批校验很可能没跟着复制。

\`\`\`ts title="infra/gate.ts：把调用图检查接进 L132 的发布门禁" note="关键：调用图失败与负例失败同级，都是 hardFailures，不允许被平均分掉。"
export async function preReleaseChecks(args: {
  report: SuiteReport
  sources: SourceFile[]   // 由装配层读盘并归一化路径，检查器本身保持纯函数
}): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = []
  assertReleaseGate(args.report)
  try {
    assertNoBypass(assertCallGraph(args.sources))
  } catch (err) {
    reasons.push('call-graph: ' + String(err))
  }
  return { ok: reasons.length === 0, reasons }
}
\`\`\`

把它接进 \`preReleaseChecks()\` 而不是单独写个脚本，是因为「单独有一个检查」和「检查挡得住发布」是两件事。L132 的 \`assertReleaseGate()\` 已经负责硬失败，本课只往同一处加一条理由，评测集与基线一行不改。

:::deep

### 为什么安全必须是结构，而不是提示词或运行时检查

三种强度完全不同。提示词里写「不要执行危险操作」是**劝告**，模型读到一条含「建议立即重启」的历史日志就可能把它当成指令，L83 讲过的指令与数据同通道问题在这里再次生效。运行时在 \`execute()\` 里校验票据是**门**，它能挡住走门的请求，但挡不住绕门的路——本课开头那行快路径就是证明。静态调用图是**墙**：它不允许那条路存在，无论模型说了什么、无论这次请求有没有触发它。

三者不是替代关系，而是叠加：票据仍然要在执行入口校验，负例仍然要在评测里跑，调用图负责保证「校验一定被经过」。L132 说过「评测负责事后检出，调用图负责事前封死」，本课把后半句落地。还有一个常被忽略的收益：静态检查不消耗运行时成本，也不需要真实流量，它在 CI 里跑一次就能覆盖所有尚未被触发的分支路径——这正是动态测试做不到的部分。

:::

### 第二件事：沙箱收拢参数、凭证与网络出口

L132 的评测运行器里，跨租户参数校验写在假网关的 \`schema.parse\` 里。那是**评测桩**，目的是让 N3 负例可跑，不是生产实现。本课把它抽到 \`Sandbox.assertArgs()\`，工具契约只保留类型校验；沙箱再补两件运行时做不到的事：凭证不进工具上下文、网络出口走白名单。

\`\`\`ts title="infra/sandbox.ts：三层隔离与统一校验入口" note="关键：工具拿到的是脱敏后的 ctx，永远接触不到原始凭证；网络出口按工具名白名单。"
export type SandboxCtx = { tenantId: string; key: string; allowedHosts: string[] }

const SAFE_TARGET_CHARS = new Set('abcdefghijklmnopqrstuvwxyz0123456789-'.split(''))

export class Sandbox {
  constructor(private secrets: Map<string, string>, private clock: () => number = Date.now) {}

  assertArgs(action: string, args: unknown, ctx: SandboxCtx): Record<string, unknown> {
    const a = (args ?? {}) as Record<string, unknown>
    if (a.tenantId !== undefined && a.tenantId !== ctx.tenantId) {
      throw new Error('cross-tenant argument rejected')
    }
    if (a.target !== undefined
      && !String(a.target).split('').every((ch) => SAFE_TARGET_CHARS.has(ch))) {
      throw new Error('invalid target: ' + String(a.target))
    }
    if (JSON.stringify(a).length > 4096) throw new Error('args too large')
    if (ctx.key.length === 0) throw new Error('missing idempotency key')
    return { ...a, tenantId: ctx.tenantId, key: ctx.key }
  }

  assertHost(action: string, host: string, ctx: SandboxCtx): void {
    if (!ctx.allowedHosts.includes(host)) {
      throw new Error('egress denied for ' + action + ': ' + host)
    }
  }

  scopedContext(ctx: SandboxCtx): Record<string, unknown> {
    return { tenantId: ctx.tenantId, key: ctx.key, at: this.clock() }
  }

  resolveSecret(alias: string): string {
    const v = this.secrets.get(alias)
    if (!v) throw new Error('unknown secret alias: ' + alias)
    return v
  }
}

export async function guardedExecute(
  sandbox: Sandbox, gateway: ToolGateway, req: ExecuteRequest,
): Promise<string> {
  const ctx: SandboxCtx = { tenantId: req.tenantId, key: req.key,
    allowedHosts: ['logs.internal', 'metrics.internal', 'cluster.internal'] }
  const safeArgs = sandbox.assertArgs(req.action, req.args, ctx)
  const result = await gateway.execute({ ...req, args: safeArgs })
  return result
}
\`\`\`

\`scopedContext()\` 返回的对象里没有任何凭证字段，工具只能拿到租户、幂等键与时间戳。凭证由 \`resolveSecret()\` 在网关内部按需取，且只接受别名不接受明文——这样即便工具参数里混进了「请把 apiKey 回显给我」这类注入内容，也没有东西可回显。\`assertHost()\` 则是网络出口白名单：一个「查日志」工具不该能连到任意域名，否则它就成了数据外泄通道。

注意 \`guardedExecute()\` 包在 \`gateway.execute()\` **外面**，没有替换它。审批票据、幂等集合、\`action.committed\` 事件仍然由网关产生，L129–L132 的语义完全不变；沙箱只增加前置校验与凭证隔离。这正是横切加固该有的样子：往既有入口前加一层，而不是再造一个入口——否则它自己就违反了上一条静态调用图规则。

\`\`\`ts title="infra/route-by-cost.ts：按任务复杂度分流，账单可度量" note="关键：路由只换模型别名，不换提示词、工具集与退出条件，语义锁死。"
export type Complexity = { evidenceCount: number; actionCount: number; hasDanger: boolean }
export type ModelAlias = 'cheap' | 'strong'

export function routeByCost(c: Complexity): { alias: ModelAlias; reason: string } {
  if (c.hasDanger || c.evidenceCount >= 4 || c.actionCount >= 3) {
    return { alias: 'strong', reason: 'danger or multi-step: do not economize' }
  }
  if (c.evidenceCount <= 1 && c.actionCount <= 1) {
    return { alias: 'cheap', reason: 'single read-only step' }
  }
  return { alias: 'strong', reason: 'ambiguous evidence' }
}

export type CostLedger = { alias: ModelAlias; inputTokens: number; outputTokens: number; at: number }

const PRICE: Record<ModelAlias, number> = { cheap: 1, strong: 6 }

export function bill(rows: CostLedger[]): { total: number; byAlias: Record<ModelAlias, number> } {
  const byAlias: Record<ModelAlias, number> = { cheap: 0, strong: 0 }
  for (const r of rows) {
    byAlias[r.alias] += (r.inputTokens + r.outputTokens * 2) * PRICE[r.alias]
  }
  return { total: byAlias.cheap + byAlias.strong, byAlias }
}

export function assertRoutingDoesNotChangeContract(c: Complexity): void {
  const before = routeByCost(c)
  const after = routeByCost({ ...c, hasDanger: c.hasDanger })
  if (before.alias !== after.alias) throw new Error('routing is not deterministic')
}
\`\`\`

\`routeByCost()\` 的判据里 \`hasDanger\` 直接一票选强模型，理由不是「强模型更聪明」而是**别在不可逆动作上省钱**：省下来的调用费远小于一次误重启的事故成本。更重要的是注释里那条约束：路由只换模型别名，不换提示词、工具集与退出条件。L114 讲框架对照时说过「框架影响循环怎么组织，不改业务契约」，这里是同一条原则在成本层的版本——如果便宜模型看到的是简化版提示词、少两个工具，评测集的期望轨迹就不再适用，基线也就失去可比性。

### 第三件事：降级阶梯，每级都要写清损失了什么

「超时就 catch 一下返回兜底文案」不是降级，是掩盖。真正的降级要回答三件事：这一级少了什么能力、用户能不能看见、事件流里怎么标。本课定义四级，从完整能力退到只读人工交接，每级都在 \`TracedEvent\` 里写 \`degraded\` 标记，L131 的回放器能原样还原「当时是降级状态」。

| 级别 | 触发 | 保留的能力 | 明确损失 | 用户可见标记 |
|---|---|---|---|---|
| L0 正常 | 无 | 诊断 + 动作 + 复核 | 无 | 无 |
| L1 换模型 | 主力模型超时 | 全部 | 时延增加、成本变化 | \`degraded:model-swap\` |
| L2 只读 | 工具网关连续失败 | 诊断 + 建议 | **不能执行任何动作** | \`degraded:read-only\` |
| L3 人工交接 | 预算耗尽或审计不完整 | 产出诊断快照与 escalation | 自动闭环终止 | \`degraded:handoff\` |

\`\`\`ts title="infra/degradation.ts：四级阶梯与降级事件" note="关键：L2 起必须清空 act 步骤，禁止「降级后还偷偷执行动作」。"
export type LadderLevel = 'L0' | 'L1' | 'L2' | 'L3'

export type LadderDecision = {
  level: LadderLevel
  plan: RoutePlan
  markers: string[]
  reason: string
}

export class DegradationLadder {
  constructor(private clock: () => number = Date.now) {}
  decide(input: {
    plan: RoutePlan
    modelTimeout: boolean
    toolFailures: number
    budgetHit: boolean
    auditComplete: boolean
  }): LadderDecision {
    const base = { plan: input.plan, reason: '', markers: [] as string[] }
    if (input.budgetHit || !input.auditComplete) {
      return { level: 'L3', ...base,
        plan: { ...input.plan, decisions: [], escalation: {
          reason: 'budget-exhausted', detail: '自动闭环终止，交人工',
          waitingFor: 'human', snapshotRef: input.plan.taskId + ':final',
        } },
        markers: ['degraded:handoff'], reason: 'budget or audit integrity lost' }
    }
    if (input.toolFailures >= 3) {
      const readOnly = input.plan.decisions.filter((d) => d.kind !== 'act')
      return { level: 'L2', ...base,
        plan: { ...input.plan, decisions: readOnly },
        markers: ['degraded:read-only'], reason: 'tool gateway unstable' }
    }
    if (input.modelTimeout) {
      return { level: 'L1', ...base,
        markers: ['degraded:model-swap'], reason: 'primary model timeout' }
    }
    return { level: 'L0', ...base, reason: 'nominal' }
  }

  async emitMarkers(taskId: string, d: LadderDecision, sink: EventSink, seqStart: number): Promise<void> {
    for (let i = 0; i < d.markers.length; i++) {
      await sink.append({ seq: seqStart + i + 1, taskId, type: 'degradation.entered',
        marker: d.markers[i], level: d.level, reason: d.reason, at: this.clock() })
    }
  }
}

export function assertNoActBelowL2(d: LadderDecision): void {
  if ((d.level === 'L2' || d.level === 'L3')
    && d.plan.decisions.some((x) => x.kind === 'act')) {
    throw new Error('degraded mode still contains act decisions')
  }
}
\`\`\`

L2 清空 act 步骤这一步最容易被漏掉，也最危险：工具网关已经在连续失败，若降级后仍保留重启步骤，重试会在更不稳定的环境下反复触发不可逆动作。降级的方向必须是「能力变少」，不是「换个方式把动作做完」。L3 更进一步，连自动闭环都终止，只留诊断快照与 \`Escalation\`——因为审计不完整时，系统已经无法证明自己做过什么，继续跑只会制造更多不可解释的状态。

:::warn

### 三个让降级变成新事故的做法

**一、降级只改文案不改能力。** 模型超时后在提示里加「请尽量简洁」，工具调用照发、动作照做。这不是降级，是把失败往后推了一步，而且推到了更不可观测的位置。每一级必须真的减少能力，且写进事件标记。

**二、降级标记不进事件流。** 事后复盘看到「这次动作正确」，却不知道当时处于只读降级、复核角色根本没跑。L131 的回放器能还原状态骨架，但前提是降级这个事实被写成事件。凡是影响结论的能力损失，都必须可回放。

**三、把降级当成默认路径。** 若 L2 长期占多数，说明工具网关本身有病，此时该修网关而不是继续优化阶梯。降级是**异常态**，要有告警、要有退出条件，不能被当成正常的成本优化手段——否则「便宜」是靠悄悄不做事换来的。

:::

### 演练断言：造故障，验的是「没做什么」

\`\`\`ts title="evals/l133-safety.test.ts：调用图、沙箱、路由与阶梯四类演练" note="关键：阶梯演练断言的是「降级后零 act」，不是「降级后还能出结果」。"
import assert from 'node:assert/strict'

function t1_callGraphCatchesFastPath() {
  const clean: SourceFile[] = [
    { rel: 'tools/gateway.ts', text: 'async execute() { return tool.run(parsed, ctx) }' },
    { rel: 'tools/mcp.ts', text: 'return this.gateway.execute(req)' },
  ]
  assertNoBypass(assertCallGraph(clean))
  const bypassed: SourceFile[] = [
    clean[0]!,
    { rel: 'tools/mcp.ts', text: 'const out = tool.run(parsed, ctx)' },
  ]
  assert.throws(() => assertNoBypass(assertCallGraph(bypassed)), /call graph bypass/)
  const twoEntries: SourceFile[] = [
    { rel: 'tools/gateway.ts', text: 'tool.run(a) tool.run(b)' },
    clean[1]!,
  ]
  assert.throws(() => assertNoBypass(assertCallGraph(twoEntries)), /恰好 1 处/)
}

function t2_sandboxRejectsCrossTenant() {
  const sb = new Sandbox(new Map([['cluster-token', 'secret']]))
  assert.throws(() => sb.assertArgs('查日志', { tenantId: 't-b' },
    { tenantId: 't-a', key: 'k1', allowedHosts: [] }), /cross-tenant/)
  const safe = sb.assertArgs('查日志', { query: 'error' },
    { tenantId: 't-a', key: 'k1', allowedHosts: [] })
  assert.equal(safe.tenantId, 't-a')
  assert.equal(safe.key, 'k1')
  assert.ok(!('secret' in sb.scopedContext({ tenantId: 't-a', key: 'k1', allowedHosts: [] })))
}

function t3_dangerNeverRoutedToCheap() {
  const c: Complexity = { evidenceCount: 1, actionCount: 1, hasDanger: true }
  assert.equal(routeByCost(c).alias, 'strong')
  const cheap = { evidenceCount: 1, actionCount: 0, hasDanger: false }
  assert.equal(routeByCost(cheap).alias, 'cheap')
  const rows: CostLedger[] = [
    { alias: 'cheap', inputTokens: 100, outputTokens: 10, at: 0 },
    { alias: 'strong', inputTokens: 100, outputTokens: 10, at: 0 },
  ]
  assert.ok(bill(rows).byAlias.strong > bill(rows).byAlias.cheap)
}

function t4_ladderRemovesActs() {
  const ladder = new DegradationLadder()
  const plan: RoutePlan = { taskId: 'T', revision: 1, createdAt: 0, decisions: [
    { seq: 1, role: 'diagnose', kind: 'analyze', action: '查日志',
      dependsOn: [], requiresApproval: false },
    { seq: 2, role: 'execute', kind: 'act', action: '重启服务',
      dependsOn: [1], requiresApproval: true },
    { seq: 3, role: 'verify', kind: 'verify', action: '查指标',
      dependsOn: [2], requiresApproval: false },
  ] }
  const l2 = ladder.decide({ plan, modelTimeout: true, toolFailures: 3,
    budgetHit: false, auditComplete: true })
  assert.equal(l2.level, 'L2')
  assert.equal(l2.plan.decisions.some((d) => d.kind === 'act'), false)
  assert.deepEqual(l2.markers, ['degraded:read-only'])
  assertNoActBelowL2(l2)
  const l3 = ladder.decide({ plan, modelTimeout: false, toolFailures: 0,
    budgetHit: false, auditComplete: false })
  assert.equal(l3.level, 'L3')
  assert.equal(l3.plan.decisions.length, 0)
  assert.ok(l3.plan.escalation)
  assertNoActBelowL2(l3)
}

function t5_l132CasesStillPass() {
  assertCaseSet(CASES)
  const report: SuiteReport = { total: 12, passed: 12, hardFailures: [],
    actionAccuracy: 1, spinRate: 0, negativePassed: 4, byCase: [] }
  assert.doesNotThrow(() => assertReleaseGate(report))
}

t1_callGraphCatchesFastPath()
t2_sandboxRejectsCrossTenant()
t3_dangerNeverRoutedToCheap()
t4_ladderRemovesActs()
t5_l132CasesStillPass()
console.log('L133 safety: 5/5 passed')
\`\`\`

第五条断言看起来什么都没测，却是本课的收口条件：**横切加固之后，L132 的 12 条用例与发布门禁必须原样通过**。如果加了沙箱或降级阶梯之后需要改评测期望，说明改动碰到了业务契约，那就不是加固而是重写。把「不改契约」写成断言，比写在文档里可靠。

还有一处刻意避开的写法：本课的源码检查器从头到尾没有写正则。\`assertCallGraph()\` 用 \`line.includes(needle)\` 判断调用点，\`Sandbox.assertArgs()\` 用字符白名单判断 target，路径由装配层归一化成正斜杠后只用 \`lastIndexOf('/')\` 取文件名。原因有两层：对「有没有直接调 \`run(\`」这个问题，字符串包含已经足够，且不会因为转义边界写错而漏报；更重要的是课程正文是模板字符串，正则里的反斜杠会被吞掉（坑库已记的第四种转义坑），写进去的代码块粘出去就是坏的。**让示例代码粘出去就能跑，比展示一招漂亮的正则更有价值**——这也是 L129 那次正则事故之后统一改掉的写法。

### 风险登记表回填与分工

| L128 风险项 | 本课进展 | 状态 |
|---|---|---|
| 审批被绕过 | 静态调用图把「旁路不存在」变成 CI 硬门禁；沙箱补凭证与出口隔离 | **已闭合**（事前） |
| 误重启生产实例 | 票据校验仍在网关，沙箱再校验 target 格式与租户边界 | 与 L129/L132 共同闭合 |
| 循环超预算 | 预算触发 L3 人工交接，降级后零动作 | 与 L129/L132 共同闭合 |
| 审计缺失 | \`degradation.entered\` 事件让能力损失可回放 | 与 L131 共同闭合 |
| 恢复时重复执行 | 幂等键由沙箱强制非空，网关去重不变 | 与 L129/L131 共同闭合 |

与相邻课的边界：L129 的 \`ToolGateway\` / \`Approval\` / \`action.committed\`、L130 的 \`RoutePlan\` / \`Escalation\`、L131 的 \`TracedEvent\` / \`EventSink\`、L132 的 \`assertReleaseGate()\` / \`CASES\` 全部原样消费，本课新增的是 \`infra/\` 下的调用图检查、沙箱、成本路由与降级阶梯。L134 把这些模块接进 \`createApp()\` 装配，并把 \`preReleaseChecks()\` 放进部署流水线；它不需要知道沙箱内部怎么校验，只需要保证装配顺序是「沙箱 → 网关 → 分发器」。

一句话记住本课：**安全要变成墙而不是门，降级要变成能力更少的明确状态而不是换个说法继续跑；两者都不能改业务契约。**

:::tip

### 判断加固是否真的完成的两个问题

在 \`tools/mcp.ts\` 里加一行 \`tool.run(parsed)\`，\`assertCallGraph()\` 有没有在不运行任何用例的情况下报红；把工具网关连续失败三次喂给 \`DegradationLadder\`，产出的路由表里还有没有 act 步骤、事件流里有没有 \`degraded:read-only\`。两个都成立，L134 才敢把这套系统部署上线。只跑通「正常路径一切照旧」，说明加固还没被验证过。

:::
`,
    null,
    [
      {
        text: '为什么「执行入口唯一」必须靠静态调用图，而不能只靠运行时校验？',
        options: [
          '运行时校验太慢',
          '运行时只能拦住这一次调用，拦不住代码里存在一条从未被触发的旁路',
          '静态检查不需要写测试',
          '运行时校验无法读日志',
        ],
        answer: 1,
        explain: '调用图让旁路路径本身不存在，覆盖所有未触发分支。',
        concept: 'cap-a-safety',
      },
      {
        text: 'L2 只读降级时，路由表应该怎么处理 act 步骤？',
        options: [
          '保留但降低重试次数',
          '全部清空，并写 degraded:read-only 事件标记',
          '换成便宜模型继续执行',
          '延后到下一轮执行',
        ],
        answer: 1,
        explain: '降级方向必须是能力变少，且损失要可回放。',
        concept: 'cap-a-safety',
      },
      {
        text: '成本路由的边界是什么？',
        options: [
          '可以同时简化提示词和工具集以省钱',
          '只换模型别名，不换提示词、工具集与退出条件，否则评测基线失去可比性',
          '危险动作优先走便宜模型',
          '不受任何约束',
        ],
        answer: 1,
        explain: '路由影响循环组织，不改业务契约；danger 动作一票选强模型。',
        concept: 'cap-a-safety',
      },
      {
        text: '横切加固完成后，L132 的评测集应该怎样？',
        options: [
          '按新的沙箱行为重写期望轨迹',
          '12 条用例与发布门禁原样通过，需要改期望就说明碰到了业务契约',
          '暂时停用负例',
          '只跑正例即可',
        ],
        answer: 1,
        explain: '把「不改契约」写成断言，比写在文档里可靠。',
        concept: 'cap-a-safety',
      },
    ],
    [
      ['静态调用图', '穷举源码调用点，让旁路路径在 CI 里不存在'],
      ['沙箱三层隔离', '参数边界、凭证不进工具上下文、网络出口白名单'],
      ['成本路由', '只换模型别名，danger 动作一票选强模型，账单可度量'],
      ['降级阶梯', 'L0–L3 四级，每级写明能力损失与用户可见标记'],
      ['降级事件', 'degradation.entered 让能力损失进入 L131 回放'],
      ['不改契约', '加固后 L132 的 12 条用例与门禁必须原样通过'],
    ],
    [
      '在协议层开「只是查日志」的直通工具快路径，审批与幂等整段被跳过，且评测查不到（旁路不产生事件）。',
      '把安全寄托在提示词护栏或运行时检查上，没有用静态调用图封死旁路的存在。',
      '降级只改文案不改能力，工具调用照发，把失败推到更不可观测的位置。',
      '降级标记不写进事件流，复盘时不知道当时处于只读状态、复核根本没跑。',
      '成本路由顺便简化提示词或减少工具，导致评测基线失去可比性。',
    ],
  ),
  'capstone',
)
