import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L134 = withKind(
  L(
    'L134',
    26,
    '实战 Capstone A：从零部署上线 + 全链路复盘',
    4,
    ['L133'],
    ['cap-a-deploy'],
    [
      '从零实现 createApp() 装配六课组件，并给出不可颠倒的依赖顺序',
      '写出 live/ready 分离、会话分桶灰度与 RunManifest 四版本号',
      '把 L132 评测与 L133 调用图接成唯一发布闸门',
      '实现 deployDrill() 五项故障演练断言，并产出复盘与演示脚本',
    ],
    `
### 本地全绿，上线第一小时就挂

六课代码在笔记本上跑得很好：12 条评测全绿、调用图干净、追踪树完整。第一次部署到预发，服务启动后 \`/health\` 返回 200，但第一个真实请求卡了三分钟，最后超时。查下来不是任何一课的逻辑错了，而是**装配顺序反了**：\`ToolGateway\` 在 \`Sandbox\` 之前创建，沙箱的参数校验根本没接进执行入口；同时 \`EventLog\` 用的是进程内实现，两个实例各自维护一份 \`seq\`，L131 的单调序号校验在多进程下直接抛错。

这两个 bug 都过不了本地测试，却又都被本地测试放过——因为本地只有一个进程、只装配一次。L127 讲过「状态外置、探针分离、灰度分桶」的通用原理，但原理不会告诉你**这六课组件该按什么顺序拼、哪一步漏了会让前面五课全部白做**。本课就是把 L128 图纸里的 \`infra/\` 目录真正填上，并给出一条能挡住「本地绿、线上挂」的发布闸门。

### 本课唯一要回答的问题

**如何让「六课各自正确」变成「装配起来的系统仍然正确」，且发布这件事本身可被验证。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 状态外置、租约、乐观锁原理 | L123 | 本课只把它接成具体实现 |
| 影子流量、容量模型的推导 | L125 | 本课只做会话分桶与回滚闸门 |
| runbook、双密钥轮换、责任矩阵 | L126 | 本课只给 RunManifest 版本号 |
| live/ready 与告警分类的通用规则 | L127 | 本课沿用其判据，不重新论证 |
| 研究报告的交付与溯源 | L141（Capstone B） | 另一条分支，交付物性质不同 |

### 第一件事：装配顺序不是实现细节，是契约

六课组件之间存在严格的依赖方向。把 \`Sandbox\` 放在 \`ToolGateway\` 之后，沙箱就只是个没人调用的摆设；把 \`EventLog\` 做成进程内单例，L131 的 append-only 事件流在多实例下立刻分叉；把 \`preReleaseChecks()\` 放在镜像构建之后，坏版本已经推到仓库了才被拦下。

| 顺序 | 组件 | 来自 | 依赖谁 | 装配错误的症状 |
|---|---|---|---|---|
| 1 | \`EventLog\`（外置持久化） | L131 | 无 | 多实例 seq 分叉、回放不一致 |
| 2 | \`ToolRegistry\` / \`ToolGateway\` | L129 | EventLog | 动作提交不产生事件，覆盖率恒为 0 |
| 3 | \`Sandbox\` 包在网关外 | L133 | ToolGateway | 参数与凭证校验被绕过 |
| 4 | \`PlanStore\` / \`Supervisor\` / \`Dispatcher\` | L130 | ToolGateway、EventLog | 路由表无法落盘，升级决定丢快照 |
| 5 | \`Tracer\` / \`replay()\` / \`assertAuditComplete()\` | L131 | EventLog、PlanStore | span 树无父节点、审计完整性判失败 |
| 6 | \`DegradationLadder\` / \`routeByCost()\` | L133 | 以上全部 | 降级时不知道该清哪些 act 步骤 |
| 7 | \`createApp()\` / 探针 / 灰度 | 本课 | 以上全部 | 请求进不来或进了错版本 |

\`\`\`ts title="infra/app.ts：createApp() 按依赖顺序装配" note="关键：构造顺序写死并配一条 assertWiring 自检，任何一处漏接在启动时就失败。"
export type Deps = {
  eventLog: EventLog
  planStore: PlanStore
  secrets: Map<string, string>
  clock: () => number
}

export type App = {
  handle(req: TurnRequest): Promise<TurnReply>
  live(): { status: string }
  ready(): Promise<{ status: string; checks: Record<string, boolean> }>
  manifest: RunManifest
}

export function createApp(deps: Deps): App {
  // ① 事件流外置：多实例共享同一份 seq
  const gateway = new ToolGateway(deps.clock)
  for (const [name, level] of Object.entries(TOOL_LEVELS)) {
    gateway.register({
      name, description: name, sideEffect: level,
      schema: { parse: (a: unknown) => a as Record<string, unknown> },
      run: async () => 'ok',
    })
  }
  assertLevelTableMatchesGateway(gateway)
  // ② 沙箱包在网关外：代理继承原网关方法，只覆盖 execute()
  const sandbox = new Sandbox(deps.secrets, deps.clock)
  const guardedGateway = Object.create(gateway) as ToolGateway
  guardedGateway.execute = (req: ExecuteRequest) => guardedExecute(sandbox, gateway, req)
  // ③ 编排与追踪都指向同一份事件流与同一个被保护的网关
  const supervisor = new Supervisor(deps.planStore)
  const dispatcher = new Dispatcher(guardedGateway)
  const tracer = new Tracer(deps.eventLog, deps.clock)
  const ladder = new DegradationLadder(deps.clock)
  assertWiring({ gateway: guardedGateway, sandbox, dispatcher,
    eventLog: deps.eventLog, wrapped: true })

  return {
    manifest: CURRENT_MANIFEST,
    live: () => ({ status: 'live' }),
    ready: () => readiness(deps, gateway),
    handle: async (req) => {
      const variant = pickBucket(req.sessionId)
      const plan = await supervisor.plan({ taskId: req.taskId, revision: 1,
        diagnosis: req.diagnosis, approvals: new Set(req.approvals),
        now: deps.clock() })
      const degraded = ladder.decide({ plan, modelTimeout: false, toolFailures: 0,
        budgetHit: false, auditComplete: true })
      assertNoActBelowL2(degraded)
      const events = await deps.eventLog.ofTask(req.taskId)
      assertAuditComplete(events, degraded.plan)
      await tracer.withSpan({ taskId: req.taskId, name: 'handle:' + variant,
        source: 'runtime', input: req.task }, async () => dispatcher.run(degraded.plan, req.state))
      return { taskId: req.taskId, variant, level: degraded.level }
    },
  }
}

export function assertWiring(w: {
  gateway: ToolGateway; sandbox: Sandbox; dispatcher: Dispatcher;
  eventLog: EventLog; wrapped: boolean
}): void {
  if (!w.gateway || !w.sandbox || !w.dispatcher || !w.eventLog) {
    throw new Error('incomplete wiring')
  }
  if (!w.wrapped) throw new Error('sandbox is not wired into the execution entry')
  if (typeof w.eventLog.append !== 'function') throw new Error('eventLog must be append-only')
  if (typeof w.gateway.execute !== 'function') throw new Error('single execution entry missing')
}
\`\`\`

\`assertWiring()\` 检查的字段看起来都很基础，但它挡住的正是开头那次事故的两个根因：网关是不是真的挂上了事件流、沙箱是不是真的存在于依赖图里。装配层最容易出的问题不是「写错逻辑」，而是「某个组件创建了但没接上」——这类缺口不会报错，只会静默地让某一课的保护失效，直到出事才被发现。

这里用 \`Object.create(gateway)\` 做代理，而不是把沙箱塞进 \`Dispatcher\` 的构造器，是有讲究的。\`Dispatcher\` 的签名在 L130 定死为「接收一个 \`ToolGateway\`」，为了接沙箱去改它，就得连带改 L130 的六条断言与 \`coverage()\` 的取数口径，等于把「横切加固」做成了「重写编排」。代理继承原网关的 \`describe()\`、\`requiresApproval()\`、\`approvalFor()\`，只覆盖 \`execute()\` 一处：上游接口一行不动，沙箱却真的落在了每一次调用的路径上。这正是 L133「加固一律包在既有入口外」在装配层的落点，也让 \`assertCallGraph()\` 里「\`tool.run(\` 恰好 1 处」这条规则依然成立——代理没有新增执行点。

还有一处容易自作聪明的地方：代码块里工具的 \`run()\` 只返回 \`'ok'\`，**不自己写 \`action.committed\`**。事件由 L129 的执行器在动作成功后统一产出，这是 L131「事件同源」的前提。若某个工具图省事自行 append，seq 分配与顺序立刻失控，回放器读到的会是两份互相矛盾的事实，L132 的覆盖率也随之失真。表格里「动作提交不产生事件」说的就是这条链断了，解法是把链重新接上，而不是让每个工具各自补写一条。

\`\`\`ts title="infra/readiness.ts：live 与 ready 分离" note="关键：ready 检查的是依赖契约，不是进程活着；任一契约不成立就返回 503。"
export async function readiness(deps: Deps, gateway: ToolGateway) {
  const checks = {
    eventLog: typeof deps.eventLog.append === 'function'
      && (await deps.eventLog.ofTask('__probe__')).length >= 0,
    planStore: typeof deps.planStore.loadPlan === 'function',
    toolLevels: (() => { try {
      assertLevelTableMatchesGateway(gateway); return true
    } catch { return false } })(),
    manifest: CURRENT_MANIFEST.versions.every((v) => v.length > 0),
    stuckApprovals: (await deps.eventLog.ofTask('__pending__')).length < 20,
  }
  const ok = Object.values(checks).every(Boolean)
  return { status: ok ? 'ready' : 'not-ready', checks }
}
\`\`\`

\`live\` 只回答「进程还在」，\`ready\` 回答「能不能接流量」。两者分开的理由在 L127 已经讲过，本课落地的具体检查项则完全来自这六课的契约：事件流可写、路由表可存取、工具等级表没漂移、四个版本号齐全、挂起审批没有堆积。特别要注意 \`toolLevels\` 这一项——它把 L130 的启动自检搬到了探针里，于是「有人偷偷改了某个工具的副作用等级」会在滚动发布时让新实例直接不就绪，而不是带着错误权限接流量。

### 第二件事：灰度分桶与四版本号

Capstone A 的灰度最小单位是**会话**不是请求，因为版本也是状态的写入格式：同一个任务的前半段在 v1 写入、后半段在 v2 读，恢复时可能读不出来。分桶用会话号的稳定哈希，不用请求号，也不用随机数。

\`\`\`ts title="infra/manifest.ts：会话分桶与 RunManifest 四版本号" note="关键：四个版本号任一变化都要触发重新评测，不能只对比代码版本。"
export type RunManifest = {
  versions: [string, string, string, string]  // code / prompt / tool-schema / model
  builtAt: number
  baselineCommit: string
}

export const CURRENT_MANIFEST: RunManifest = {
  versions: ['cap-a-1.0.0', 'prompt-7', 'tools-3', 'strong-2026-11'],
  builtAt: 1_700_000_000_000,
  baselineCommit: 'c1',
}

export function pickBucket(sessionId: string, canaryPercent = 10): 'stable' | 'canary' {
  let h = 0
  for (const ch of sessionId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 100 < canaryPercent ? 'canary' : 'stable'
}

export function assertManifestCovered(m: RunManifest, baselineCommit: string): void {
  if (m.baselineCommit !== baselineCommit) {
    throw new Error('manifest points to a different evaluation baseline')
  }
  if (new Set(m.versions).size !== 4) throw new Error('version fields must be distinct')
}

export async function rolloutGate(args: {
  manifest: RunManifest
  report: SuiteReport
  sources: SourceFile[]
  baselineCommit: string
}): Promise<{ approved: boolean; reasons: string[] }> {
  assertManifestCovered(args.manifest, args.baselineCommit)
  const checks = await preReleaseChecks({ report: args.report, sources: args.sources })
  return { approved: checks.ok, reasons: checks.reasons }
}

export function assertRollbackSafe(prev: RunManifest, next: RunManifest): void {
  if (prev.versions[2] !== next.versions[2]) {
    throw new Error('tool schema changed: state written by new version may be unreadable')
  }
}
\`\`\`

\`assertRollbackSafe()\` 只看工具 schema 版本，不是偷懒：代码、提示词、模型换了都能回滚（重放事件、重新生成），但工具 schema 一变，已经持久化的 \`RoutePlan\` 与动作参数格式可能读不出来，回滚就变成数据损坏。L126 讲「RunManifest 绑四个版本号」时给的是通用清单，本课把它收敛成一条可执行的前置判据：**打算自动回滚，就别在这次发布里改 schema**。

### 第三件事：发布闸门只有一个，且在所有动作之前

L132 的 \`assertReleaseGate()\`、L133 的 \`assertNoBypass()\`、本课的 \`assertManifestCovered()\` 必须汇到同一个 \`rolloutGate()\`，并且在**镜像构建之前**跑。若把它放在部署阶段，坏版本已经进了制品库，回滚要清仓库；放在 CI 之外靠人记，等于没有。

| 检查 | 来源 | 失败时挡住什么 |
|---|---|---|
| 12 条用例全过、4 条负例全过 | L132 | 质量倒退与越权 |
| 无硬失败、无空转 | L132 | 掩盖在平均分下的事故 |
| 静态调用图无旁路 | L133 | 从未被触发的越权路径 |
| 基线 commit 与 manifest 一致 | 本课 | 用旧基线给新版本背书 |
| 工具 schema 未变（可回滚） | 本课 | 回滚后的数据不可读 |
| 回放与审计完整性 | L131 | 上线后无法复盘的运行 |

\`\`\`ts title="infra/deploy-drill.ts：上线前造故障，验的是闸门与恢复" note="关键：演练断言的是「坏版本没被发布」「回滚后状态可读」，不是「服务还能返回 200」。"
export type DrillResult = { name: string; passed: boolean; detail: string }

export async function deployDrill(env: {
  goodReport: SuiteReport
  badReport: SuiteReport
  sources: SourceFile[]
  cleanSources: SourceFile[]
  manifest: RunManifest
  baselineCommit: string
}): Promise<DrillResult[]> {
  const out: DrillResult[] = []
  const good = await rolloutGate({ manifest: env.manifest, report: env.goodReport,
    sources: env.cleanSources, baselineCommit: env.baselineCommit })
  out.push({ name: 'good-version-approved', passed: good.approved,
    detail: good.reasons.join(' | ') || 'clean' })
  let blocked = false
  try {
    await rolloutGate({ manifest: env.manifest, report: env.badReport,
      sources: env.cleanSources, baselineCommit: env.baselineCommit })
  } catch { blocked = true }
  out.push({ name: 'bad-version-blocked', passed: blocked,
    detail: 'negative case loss must fail before build' })
  let bypassBlocked = false
  try {
    await rolloutGate({ manifest: env.manifest, report: env.goodReport,
      sources: env.sources, baselineCommit: env.baselineCommit })
  } catch { bypassBlocked = true }
  out.push({ name: 'call-graph-bypass-blocked', passed: bypassBlocked,
    detail: 'fast path in mcp.ts must fail' })
  let manifestBlocked = false
  try {
    await rolloutGate({ manifest: { ...env.manifest, baselineCommit: 'other' },
      report: env.goodReport, sources: env.cleanSources, baselineCommit: env.baselineCommit })
  } catch { manifestBlocked = true }
  out.push({ name: 'stale-baseline-blocked', passed: manifestBlocked,
    detail: 'cannot ship a version measured against an old baseline' })
  const sameSchema = { ...env.manifest, versions: ['cap-a-1.0.1', 'prompt-8',
    env.manifest.versions[2], 'strong-2026-11'] as [string, string, string, string] }
  let rollbackOk = true
  try { assertRollbackSafe(env.manifest, sameSchema) } catch { rollbackOk = false }
  out.push({ name: 'rollback-state-readable', passed: rollbackOk,
    detail: 'tool schema unchanged, replay still works' })
  return out
}

export function assertDrill(results: DrillResult[]): void {
  const failed = results.filter((r) => !r.passed)
  if (failed.length) throw new Error('deploy drill failed: ' + failed.map((r) => r.name).join(','))
}
\`\`\`

五条演练里只有第一条是「好版本能发布」，其余四条都在验「坏东西有没有被挡住」。这个比例是刻意的：部署环节的价值不在于把代码送上去，而在于**把不该送上去的拦下来**。L132 的负例思想在这里延伸到了发布层——发布演练同样要以负例为主。

:::deep

### 为什么 Capstone 的交付物必须是「系统」而不是「代码合集」

六课各自都有可运行代码与断言，为什么还要单独一课做装配？因为正确性不封闭在单个模块里。L129 的状态机正确、L131 的事件流正确，两者若各用一份存储，合起来就是错的；L133 的沙箱正确、L129 的网关正确，装配顺序反了，合起来还是错的。这些都属于**接口之间的性质**，没有任何一课的单元测试能覆盖。

这也是 L128 为什么在动工前就要求「定死目录骨架与依赖关系」：Capstone 的失败模式几乎从来不是「某一课没写好」，而是「第六课推翻了第一课的假设」。所以本课的 \`assertWiring()\`、\`readiness()\`、\`rolloutGate()\`、\`deployDrill()\` 四件东西，测的都不是业务逻辑，而是「这些组件真的按约定连在一起了吗」。**能跑是一次运行的性质，能装配、能回滚、能复盘才是一个系统的性质。**

:::

### 第四件事：复盘要写「如果重做会怎么改」

L128 的复盘清单里最容易被敷衍的是最后一项。列「做了什么」很容易，列「哪些设计对了 / 哪些走了弯路 / 重做会怎么改」则会暴露判断，而这才是从「跟着学」走向「独立做」的那一步。下面这张表按六课逐一给出，不写空话。

| 课 | 判断对了的地方 | 走过的弯路 | 如果重做会怎么改 |
|---|---|---|---|
| L128 | 先定权限等级再写工具，避免 L133 返工 | 风险表初版漏了「恢复时重复执行」 | 开工前先演练一次崩溃恢复路径 |
| L129 | 五态状态机 + 事件同源，让恢复可信 | 审批票据最初只绑动作没绑任务 | 票据四元组从第一天就定死 |
| L130 | 路由做成纯数据，回放才可能 | 初版让 supervisor 汇总时补动作 | 把「不持网关」写进构造器签名 |
| L131 | 单一 append-only 事件流 | 差点另建一套 tracing 事件 | 事件扩展字段在 L129 就预埋 |
| L132 | 4 条负例 + 硬失败 | 初稿 12 条全是正例 | 用例集先按「该不该动」分组 |
| L133 | 调用图把旁路变成 CI 失败 | 沙箱曾试图替换网关入口 | 所有加固一律包在既有入口外 |
| 本课 | 发布闸门只有一个 | 装配顺序最初没写自检 | \`assertWiring()\` 提前到 L128 图纸里 |

\`\`\`ts title="infra/demo.ts：演示脚本是可执行的交付物" note="关键：演示路径必须包含一次拒绝、一次恢复、一次追踪树展示，不能只放顺利路径。"
export type DemoStep = { label: string; action: string; expected: string }

export const DEMO_SCRIPT: DemoStep[] = [
  { label: '一条告警进来', action: '查日志 + 查指标', expected: '诊断结论带两条证据' },
  { label: '模型提出重启，但没审批', action: '请求 danger 动作',
    expected: '产出 missing-approval 升级，零 action.committed' },
  { label: '值班同学签发票据', action: 'resume() 恢复',
    expected: '重启恰好一次，幂等键不重复' },
  { label: '进程在提交后立刻被杀', action: 'resume() 再恢复',
    expected: '从事件流重建 done，不二次重启' },
  { label: '展示追踪树', action: 'replay() + buildTree()',
    expected: '六行事件、父子完整、审计完整性通过' },
  { label: '注入 N1 负例', action: '跑 assertReleaseGate()',
    expected: '若出现禁区动作则发布被拦' },
]

export function assertDemoCoversRefusal(s: DemoStep[]): void {
  if (!s.some((x) => x.expected.includes('零'))) {
    throw new Error('demo must show a refusal path')
  }
  if (!s.some((x) => x.expected.includes('恢复') || x.label.includes('被杀'))) {
    throw new Error('demo must show a recovery path')
  }
  if (!s.some((x) => x.action.includes('replay') || x.action.includes('buildTree'))) {
    throw new Error('demo must show an audit path')
  }
}
\`\`\`

\`assertDemoCoversRefusal()\` 把「演示不能只放顺利路径」写成断言。这看似小题大做，实际是 L132 那条教训的延续：一路畅通的演示信息量最低，观众看完只会问「那出错了怎么办」。演示里必须有一次被拒绝、一次崩溃恢复、一次可回放的追踪树，才能证明这六课真正解决的问题。

:::warn

### 三个「本地绿、线上挂」的典型翻车点

**一、把进程内实现直接搬上多实例。** \`InMemoryEventLog\` 在 L131 用于评测完全够用，但生产必须换成共享存储，否则每个实例的 \`seq\` 都从 1 开始，单调性校验与回放一致性同时崩掉。判据很简单：凡是 L131 里带 \`seq\` 或 \`version\` 的东西，都必须问一句「两个进程同时写会怎样」。

**二、把发布闸门放在部署阶段。** 镜像已经构建、制品已经推送，才发现负例没过，此时「拦下」只是不部署，坏版本仍在仓库里等着被误取。闸门必须在构建之前，且只有一个。

**三、回滚只回滚代码。** 提示词、工具 schema、模型别名都在 \`RunManifest\` 里，只换回旧二进制等于用新提示词跑旧代码。尤其是工具 schema，它决定持久化状态能不能被读出来；改了它就不能宣称「可自动回滚」。

:::

### 风险登记表最终收口与 A → B 分叉

| L128 风险项 | 触发信号 | 最终缓解 | 验证位置 |
|---|---|---|---|
| 误重启生产实例 | 无票据的 danger 提交记录 | 票据四元组 + schema 校验目标 + 沙箱前置校验 | L129 / L132 N2 / L133 |
| 审批被绕过 | 调用图里存在旁路 | 静态调用图 \`assertNoBypass()\` 进发布闸门 | L133 / 本课 rolloutGate |
| 循环超预算 | 步数或 token 触顶 | 三硬出口 + 空转检测 + L3 人工交接 | L129 / L132 / L133 |
| 审计缺失 | 复盘找不到动作记录 | 统一事件流 + \`assertAuditComplete()\` + 降级事件 | L131 / L133 |
| 恢复时重复执行 | 同一动作出现两次 | 幂等键透传 + 事件重建 done + 双向一致性断言 | L129 / L131 / L132 |

五项全部闭合，且每一项都同时具备**事前拦截**与**事后检出**两条路径。这是 Capstone A 与前面所有普通课最大的区别：普通课交付一个结论，Capstone 交付一个能被反复验证的闭环。

与相邻课的边界：本课不改 L129–L133 的任何接口，只新增 \`infra/\` 下的装配、探针、清单、闸门、演练与演示脚本；它是 Stage 26 的终点。L135 开启另一条分支，两者刻意分叉：Capstone A 是**执行型**，主轴「动作 → 权限 → 回滚」，失败的代价是不可逆副作用；Capstone B 是**认知型**，主轴「问题 → 证据 → 结论」，失败的代价是无出处的结论被当成事实。B 不会复用 A 的工具网关与审批票据，但会复用「把约束写进类型」「用事件流做事实来源」「评测以负例为主」这三条方法——**方法可迁移，组件不迁移**。

:::tip

### 判断 Capstone A 是否真的交付完成的三个问题

把 \`Sandbox\` 从装配里摘掉，\`assertWiring()\` 或 \`readiness()\` 有没有让实例不就绪；把一份负例挂掉的报表喂给 \`rolloutGate()\`，镜像构建有没有被挡在前面；随便挑一次历史运行，在不联网的前提下能不能用 \`replay()\` 还原「谁批准了什么、动作执行了几次、指标有没有恢复」。三个都成立，这六课才算从「能跑」走到了「敢交付」。只看到服务返回 200，什么都还没证明。

:::
`,
    null,
    [
      {
        text: '为什么装配顺序必须写进 assertWiring() 自检？',
        options: [
          '为了让代码更好看',
          '「组件创建了但没接上」不会报错，只会静默让某一课的保护失效',
          '为了减少依赖数量',
          '为了加快启动速度',
        ],
        answer: 1,
        explain: '装配缺口是静默的，只有启动自检能把它变成显式失败。',
        concept: 'cap-a-deploy',
      },
      {
        text: '发布闸门应该放在什么位置？',
        options: [
          '部署阶段，接近真实环境',
          '镜像构建之前，且全流水线只有一个闸门',
          '上线后由监控兜底',
          '每周人工跑一次',
        ],
        answer: 1,
        explain: '构建后再拦，坏版本已经进了制品库。',
        concept: 'cap-a-deploy',
      },
      {
        text: 'assertRollbackSafe() 为什么只检查工具 schema 版本？',
        options: [
          '其他版本不重要',
          'schema 变了，已持久化的路由表与动作参数可能读不出来，回滚会变成数据损坏',
          'schema 最容易改',
          '为了简化代码',
        ],
        answer: 1,
        explain: '代码/提示词/模型可回滚，状态写入格式不可。',
        concept: 'cap-a-deploy',
      },
      {
        text: 'Capstone A 与 Capstone B 的正确关系是？',
        options: [
          'B 直接复用 A 的工具网关与审批票据',
          '组件不迁移，但「约束写进类型 / 事件流做事实源 / 评测以负例为主」三条方法可迁移',
          '两者是同一套系统的两个版本',
          'B 是 A 的简化版',
        ],
        answer: 1,
        explain: 'A 防不可逆副作用，B 防无出处结论，性质不同。',
        concept: 'cap-a-deploy',
      },
    ],
    [
      ['装配顺序', '事件流 → 网关 → 沙箱 → 编排 → 追踪 → 降级 → 应用，不可颠倒'],
      ['live/ready 分离', 'live 只看进程，ready 检查六课的依赖契约'],
      ['RunManifest', '代码 / 提示词 / 工具 schema / 模型四版本号齐全'],
      ['会话分桶', '灰度最小单位是会话，因为版本也是状态的写入格式'],
      ['发布闸门', '评测 + 调用图 + 清单一致性汇到唯一 rolloutGate，且在构建前'],
      ['部署演练', '五条断言四条验「坏东西有没有被挡住」'],
      ['交付物', '代码 + 架构图 + 评测基线 + 部署配置 + 复盘 + 演示脚本'],
    ],
    [
      '把 InMemoryEventLog 直接搬上多实例，seq 各自从 1 开始，回放一致性崩掉。',
      '把发布闸门放在部署阶段，坏版本已经进了制品库才发现负例没过。',
      '回滚只回滚二进制，提示词、工具 schema、模型别名仍是新版。',
      '演示脚本只放顺利路径，没有拒绝、恢复与可回放的追踪树。',
      '复盘只列「做了什么」，不写「哪些判断错了、重做会怎么改」。',
    ],
  ),
  'capstone',
)
