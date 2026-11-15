import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 25 ========== */

export const L127 = withKind(
  L(
    'L127',
    25,
    '实战：部署一个有状态会话 Agent 服务并接入监控告警',
    4,
    ['L123', 'L125'],
    ['deploy-service'],
    [
      '部署一个带状态外置、降级、灰度与就绪探针的 Agent 服务骨架',
      '接入业务 / 时延 / 成本三类告警并写出可执行的一次部署演练',
      '跑通覆盖 L123–L126 各一条的验收断言',
    ],
    `
### 四课都做完了，上线当天却没人能回答「现在健康吗」

前面四件事逐一落地：状态外置了、降级阶梯接了、灰度按会话分桶了、运行清单和 runbook 也建了。发布那晚值班同学盯着面板问了一句「现在到底算健康吗」，屋里没人答得上来——HTTP 5xx 是 0，CPU 平稳，但**没有一条告警是针对 Agent 自己的**：降级率涨了没报、每个会话成本翻倍没报、十几个会话卡在 \`pendingApproval\` 超过两小时也没报。健康检查只有一个返回 200 的 \`/health\`，它连状态存储是否可读都没验证。

这就是综合实战课要补的最后一环：**前四课解决「出事时系统怎么行为」，这一课解决「出事时人怎么知道、怎么验证」**。本课不再复述租约、熔断、分桶、迁移的原理，只给三样东西：一个把中间件按正确顺序装起来的服务骨架、一套三类告警规则、以及一次能进 CI 的部署演练。

### 三类告警，缺一类就会漏掉一类事故

| 类别 | 信号 | 阈值示例 | 处置人 | 误报陷阱 |
|---|---|---|---|---|
| 业务 | 降级率、通过率、卡住的审批会话数 | 降级率 >5% / 卡住 >30min | 业务 owner | 灰度期间的 canary 单独分组，别和 stable 混算 |
| 时延 | p95 首字节、在途请求数、租约等待时长 | p95 >4s / 在途 >上限 80% | SRE | 只看错误率会漏掉「全是慢请求」 |
| 成本 | 单会话 token、单会话工具调用数、缓存命中率 | 单会话成本 >基线 1.3 倍 | 平台 | 平均值掩盖长尾，要按 p95 看 |

三类必须**按版本分组**（L125 的分桶），否则灰度 5% 的异常会被 95% 的正常流量稀释到看不见。每条告警都要带 runbook 链接与 owner——L126 那起「没人知道该找谁」的事故，最后就是靠这一列修掉的。

:::deep
### 就绪探针不能只返回 200

传统服务的 \`/health\` 检查进程活着就够了，Agent 服务不行：进程活着但状态存储连不上、模型能力契约已退役、凭证 30 分钟后到期、积压了大量卡住的审批会话——这些情况下继续接流量只会制造更多半途而废的会话。

所以 \`/live\` 只回答「进程还在吗」（用于决定是否重启），\`/ready\` 要逐项验证依赖契约（用于决定是否接流量）。两者分离还有一个实际好处：滚动发布时新实例如果契约校验没过，就不会被挂进负载均衡，故障被挡在接流量之前，而不是等用户撞上。
:::

### 服务骨架：中间件的顺序就是架构

\`\`\`ts title="可部署服务骨架" note="要点：顺序固定——trace → 租约 → 预算 → 熔断 → 降级 → 分桶 → handler；就绪探针逐项验契约。"
function createApp(deps: {
  store: SessionStore; breaker: Breaker; cache: Cache; metrics: MetricsSink
}) {
  const app = new HttpApp()

  app.get('/live', () => ({ status: 'ok', instance: INSTANCE_ID }))

  app.get('/ready', async () => {
    const checks = {
      store: await deps.store.ping(),                       // L123 共享存储可读
      profile: assertSupportedManifests(CURRENT_PROFILES), // L122/L126 契约仍在支持期
      credential: daysUntilCredentialExpiry() > 1,        // L126 凭证不在临界
      stuckApprovals: (await deps.store.countStuck()) < 20,
    }
    const ok = Object.values(checks).every(Boolean)
    return ok ? { status: 'ready', checks } : { status: 'not-ready', checks, httpStatus: 503 }
  })

  app.post('/chat', async (req) => {
    const traceId = tracer.start(req)                       // L73 链路贯穿
    const version = assignVersion(req.tenantId, req.sessionId, Date.now())  // L125 分桶
    const budget = newBudget(8_000)                         // L124 整轮预算
    const leaseKey = sessionKey(req.tenantId, req.sessionId)
    if (!(await deps.store.acquireLease(leaseKey, INSTANCE_ID, 15_000))) {
      return { text: '正在处理上一条消息，请稍候', degraded: true, reason: 'lease' }
    }
    try {
      const answer = await answerWithFallback(req.text, budget, deps.cache, deps.breaker)
      await deps.store.compareAndSet(leaseKey, req.version, {
        ...req.state, version: req.version + 1, turns: appendTurn(req.state, answer),
      })
      deps.metrics.record({ version: version.name, degraded: answer.degraded, traceId })
      return { ...answer, version: version.name, traceId }
    } finally {
      await deps.store.releaseLease(leaseKey, INSTANCE_ID)
    }
  })
  return app
}
\`\`\`

顺序不是随便排的：先拿 traceId 才能把后续所有指标归到一条链路；租约要在任何状态读写之前拿到；预算要在调用模型/工具之前建立；分桶决定这轮用哪套契约；降级包住所有可能失败的外部调用；\`compareAndSet\` 与 \`finally\` 里的释放保证 L123 的状态不被覆盖、租约不泄漏。**把顺序写错，四课的防线会互相拆台**——例如先分桶后拿租约，同一会话的两个请求可能落到不同版本。

### 告警规则与去抖

\`\`\`ts title="三类告警规则" note="要点：按版本分组；用持续窗口去抖；每条带 owner 与 runbook 链接。"
type AlertRule = {
  name: string; groupBy: 'version' | 'tenant'
  signal: string; op: 'gt' | 'lt'; threshold: number; baseline?: 'stable'
  windowMin: number; owner: string; runbook: string
}

const ALERTS: AlertRule[] = [
  { name: 'degraded-rate', groupBy: 'version', signal: 'degradedRate',
    op: 'gt', threshold: 0.05, windowMin: 5, owner: 'business', runbook: '/rb/degrade' },
  { name: 'stuck-approval', groupBy: 'tenant', signal: 'stuckApprovals',
    op: 'gt', threshold: 10, windowMin: 15, owner: 'platform', runbook: '/rb/approval' },
  { name: 'p95-latency', groupBy: 'version', signal: 'p95Ms',
    op: 'gt', threshold: 4_000, windowMin: 5, owner: 'sre', runbook: '/rb/latency' },
  { name: 'in-flight', groupBy: 'version', signal: 'inFlight',
    op: 'gt', threshold: 0.8, windowMin: 2, owner: 'sre', runbook: '/rb/queue' },
  { name: 'cost-per-session', groupBy: 'version', signal: 'costPerSession',
    op: 'gt', threshold: 1.3, baseline: 'stable', windowMin: 15, owner: 'platform', runbook: '/rb/cost' },
]

async function evaluate(rules: AlertRule[], window: MetricWindow) {
  for (const r of rules) {
    for (const [group, m] of window.by(r.groupBy)) {
      const base = r.baseline === 'stable' ? window.get('stable')[r.signal] * r.threshold : r.threshold
      const breached = r.op === 'gt' ? m[r.signal] > base : m[r.signal] < base
      const sustained = window.sustained(r.name, group, r.windowMin)
      if (breached && sustained) {
        notify({ rule: r.name, group, value: m[r.signal], owner: r.owner, runbook: r.runbook })
      }
    }
  }
}
\`\`\`

\`sustained\` 是防止告警风暴的关键：单点越线不报，持续一个窗口才报。但窗口不能一概设长——在途数（\`in-flight\`）是雪崩前兆，窗口设 2 分钟；成本可以慢一点，15 分钟。把这两类用同一个窗口，要么太吵要么太迟。

### 一次部署演练：四条断言覆盖前四课

\`\`\`ts title="deployDrill：可进 CI 的部署演练" note="要点：四条断言各对应 L123/L124/L125/L126 一条；用假依赖，不连真模型。"
async function deployDrill(fake: FakeDeps) {
  const app = createApp(fake)
  assert.equal((await call(app, '/ready')).status, 'ready', '就绪探针未通过')

  // ① L124：注入 30s 超时，必须降级且带 reason，不能 5xx
  fake.tool.injectLatency(30_000)
  const slow = await call(app, '/chat', { tenantId: 't1', sessionId: 's-slow', text: '查订单' })
  assert.equal(slow.degraded, true, '慢依赖未触发降级')
  assert.ok(slow.reason, '降级响应缺原因标记')
  assert.ok(await fake.alerts.fired('degraded-rate'), '业务告警未触发')

  // ② L123：模拟实例被杀，另一实例必须能接管同一会话
  fake.killInstance('i1')
  const recovered = await call(app, '/chat', { tenantId: 't1', sessionId: 's-slow', text: '继续' })
  assert.ok(recovered.traceId, '故障转移后会话无法继续')

  // ③ L125：触发回滚闸门后，新会话必须回到 stable
  fake.metrics.setCanary({ p95Ms: 9_000 })
  await checkRollback(fake.metrics.canary(), fake.metrics.stable())
  const fresh = await call(app, '/chat', { tenantId: 't1', sessionId: 's-new', text: '你好' })
  assert.equal(fresh.version, 'stable', '回滚后仍有新会话进 canary')

  // ④ L126：runbook 与运行清单必须齐全
  assert.ok(await fake.manifest.has('s-new'), '缺 RunManifest')
  assert.ok(await fake.runbook.exists(), '缺可执行的 runbook')
}
\`\`\`

四条断言刻意选的是**「指标全绿也可能已经出事」**的那四类：降级没标记、状态不可接管、回滚没生效、契约没记录。用假依赖驱动，不连真模型、不连真 Redis，因此能进 CI；真实集群的混沌演练（真的杀 Pod、真的断网）只做人工记录，不写硬断言——与 L82 的分层一致。

:::warn
### 两个必踩的坑

- **只接 5xx / CPU 告警**。Agent 最典型的三种退化（降级变多、成本翻倍、会话卡在审批）都不会让 HTTP 失败，机器指标也毫无变化。三类告警必须按版本分组单独配置。
- **把部署演练做成上线当天跑一次的人工脚本**。中间件顺序、降级标记、回滚闸门都会随后续改动悄悄退化；演练要变成 CI 里的断言，和 L81 的 Eval harness 一起每次发布都跑。
:::

### 交付清单与验收口径

| 交付物 | 验收方式 | 对应课 |
|---|---|---|
| 服务骨架 + \`/live\` / \`/ready\` | 依赖注入失败时 \`/ready\` 返回 503 | L123 / L126 |
| 降级中间件与 \`degraded\` 字段 | 注入慢依赖后断言降级 + reason | L124 |
| 分桶路由与回滚闸门 | 触发阈值后新会话回 stable | L125 |
| 三类告警规则 | 每条都有 owner / runbook / 去抖窗口 | L72 / L126 |
| \`deployDrill\` 演练脚本 | CI 中四条断言全绿 | 本阶段收束 |

这张表也是给评审用的签字清单：**服务上线不等于「能跑」，等于这五行都能被验证**。少一行，前面四课的改造就只是代码里的美好设计。

### 回滚之后才算真正结束

演练通过、告警接通、签字上线，都还不是终点。真实事故里最常被跳过的一步是**回滚之后**：流量退回 stable、面板恢复绿色，大家就散了，而那条让 canary 出问题的路径仍然躺在代码里，下一次发布还会再踩。

一次完整的收口至少留下三样东西。第一，**把事故转成一条断言**——这次是「降级响应缺 reason 标记」，就往 \`deployDrill\` 里加一条；这次是「回滚后新会话仍进 canary」，就往分桶回归里加一条。演练脚本应该是越用越长的资产，而不是一份写完就不动的模板。第二，**更新 runbook**：新增的告警规则、新发现的依赖、这次实际有效的处置顺序都要写回去，特别是「哪一步其实没用」也值得记，否则下次值班会重复试错。第三，**补一条回归基线**（L80）：把触发事故的那一类输入或流量形状固化成固定用例，让它在日常体检里被反复跑到。

还有个组织层面的判据：告警必须能**被人确认收到并处置**。演练里只断言「alert fired」是不够的，至少要在预演环境验证通知链路真的到了值班渠道、runbook 链接打得开、owner 字段指向的人还在岗。开头那晚「没人能回答现在健康吗」，缺的从来不是指标，而是「指标 → 人 → 动作」这条链。把它接通并演练，才算把前四课的改造真正交付出去。

### 与相邻课的分工

- **L123** 给状态外置与租约，本课只把它装进中间件链，不复述一致性推导。
- **L124** 给预算 / 熔断 / 降级阶梯，本课只负责把 \`degraded\` 字段送进指标与告警。
- **L125** 给分桶与回滚闸门，本课只负责让 \`/chat\` 真的使用它们。
- **L126** 给运行清单与 runbook，本课把「清单齐全」列为部署验收的一行。
- **L72 / L73** 给仪表盘与链路追踪，本课只配置告警规则与 traceId 的传递。

**一句话收束**：部署的终点不是「服务起来了」，是**出事时有人被通知到、有脚本能证明防线还在、有一键退回去的路**。
`,
    null,
    [
      {
        text: 'HTTP 5xx 为 0、CPU 平稳，为什么仍可能已经出事？',
        options: [
          '监控坏了',
          '降级率、成本、卡住的审批会话这些 Agent 特有退化不体现在 5xx 上',
          '模型一定答错',
          '实例太少',
        ],
        answer: 1,
        explain: '三类告警必须按版本分组单独配置，机器指标看不见这些。',
        concept: 'deploy-service',
      },
      {
        text: '/ready 与 /live 分离的主要目的是？',
        options: ['少写代码', '契约校验未过的新实例不接流量，故障挡在接流量之前', '提高 QPS', '方便缓存'],
        answer: 1,
        explain: 'live 决定是否重启，ready 决定是否被挂进负载均衡。',
        concept: 'deploy-service',
      },
      {
        text: '部署演练为什么必须进 CI 而不是上线跑一次？',
        options: ['CI 更快', '中间件顺序、降级标记、回滚闸门会随后续改动悄悄退化', '省人力', '云厂商要求'],
        answer: 1,
        explain: '演练是回归资产，和 L81 harness 一起每次发布都跑。',
        concept: 'deploy-service',
      },
    ],
    [
      ['就绪探针', '逐项验证状态存储、能力契约、凭证到期与卡住会话'],
      ['三类告警', '业务 / 时延 / 成本，按版本分组，带 owner 与 runbook'],
      ['部署演练', '四条断言分别覆盖状态接管、降级标记、回滚生效、契约齐全'],
    ],
    [
      '只接 5xx 与 CPU 告警，Agent 最典型的三种退化全部静默。',
      '把演练做成上线当天跑一次的人工脚本，防线退化后无人察觉。',
    ],
  ),
  'scenario',
)
