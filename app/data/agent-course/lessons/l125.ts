import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 25 ========== */

export const L125 = withKind(
  L(
    'L125',
    25,
    '灰度发布与容量规划',
    2,
    ['L124'],
    ['canary'],
    [
      '实现按会话/租户稳定分桶的灰度路由与影子流量对比',
      '写出基于 λ × W 的容量模型与自动回滚判据',
      '跑通分桶稳定性、灰度比例、影子隔离与回滚四类验收断言',
    ],
    `
### 灰度 5% 一切正常，全量后 p95 翻了三倍

新版本先放 5% 流量跑了两天，错误率、通过率、成本三张图都平得近乎重合，于是放心全量。全量当晚 p95 从 1.9 秒涨到 6.1 秒，客服工单里出现「它突然不记得我刚才说什么」。复盘发现两个独立的错：

第一，灰度是**按请求随机分桶**的。同一个会话的连续两条消息可能一条走新版本、一条走旧版本，而新版本改了提示词与历史压缩策略——用户感受到的「失忆」其实是版本来回跳，可单请求监控里没有任何异常。第二，5% 流量集中在白天低峰，容量按**平均 QPS** 估算，没覆盖晚高峰的并发特征；L92 的 \`L = λ × W\` 里 λ 取了均值、W 取了平均耗时，两个都取平均，算出来的实例数在峰值时差了近三倍。

灰度要回答的不是「新版本对不对」，是「**新版本在真实流量形状下对不对，且出问题时能不能一键退回去**」。

### Agent 灰度为什么比传统服务更难

| 维度 | 传统无状态服务 | Agent 服务 | 直接后果 |
|---|---|---|---|
| 状态 | 请求之间无关 | 会话有延续的历史与待审批项 | 按请求分桶会把上下文切裂 |
| 输出 | 确定性、可断言 | 非确定性，同一输入两次不同 | 不能靠「响应相等」做判定 |
| 依赖 | 内部服务为主 | 外部模型 / 工具 / 供应商（L122） | 变更可能是别人替你做的 |
| 成本 | 与 QPS 近似线性 | 轮次可变，单请求成本方差大 | 平均成本看不出尾部风险 |

第二行决定了灰度判据必须是**分布级别**的：通过率、p95 时延、每轮工具调用数、降级率（L124）、单位会话成本，都要按版本分组看，且样本量要够（L77 的 Wilson 区间）。第三行意味着即便你什么都没发布，供应商换了底层权重也可能让指标漂移——所以分组里必须带上 \`profileAlias\`，不然归因会把「别人的变更」算到「你的灰度」头上。

:::deep
### 分桶单位必须是会话，不是请求

按请求随机分桶在电商、资讯类服务里没问题，因为每个请求自包含。但 L123 已经把会话状态外置成一条可延续的记录：第 3 轮用 v2 的压缩策略写过历史，第 4 轮切回 v1 去读，读到的格式可能就不兼容了。**版本不只是代码，也是状态的写入格式**——一旦允许同一会话跨版本，状态就成了一个没有 schema 契约的共享对象。

所以分桶键要取 \`tenantId + sessionId\`，用稳定性哈希映射到 0–99，再与 \`rolloutPct\` 比较。这样一次灰度调整只会让**新会话**进入新版本，老会话始终留在原来的版本直到自然结束。同理，回滚也不是「把比例调回 0」就完事：已经进入新版本的老会话要么继续跑完，要么走显式迁移，不能让它们半路被拽回旧版本。
:::

### 稳定分桶与版本配置

\`\`\`ts title="按会话稳定分桶" note="要点：哈希键含 tenantId + sessionId；配置带版本三元组；影子流量只复制不返回。"
type VersionConfig = {
  name: 'stable' | 'canary'
  rolloutPct: number
  promptVersion: string
  profileAlias: string       // L122 的能力契约别名
  toolManifestVersion: string
  activeFrom: number
}

const STABLE: VersionConfig = {
  name: 'stable', rolloutPct: 100, promptVersion: 'p12',
  profileAlias: 'agent-main', toolManifestVersion: 'tm3', activeFrom: 0,
}
const CANARY: VersionConfig = {
  name: 'canary', rolloutPct: 5, promptVersion: 'p13',
  profileAlias: 'agent-main', toolManifestVersion: 'tm3', activeFrom: Date.parse('2026-11-15T10:00:00Z'),
}

function bucketOf(tenantId: string, sessionId: string): number {
  return stableHash(tenantId + ':' + sessionId) % 100
}

function assignVersion(tenantId: string, sessionId: string, now: number): VersionConfig {
  if (now < CANARY.activeFrom) return STABLE
  // 先查粘性表：已进入 canary 的老会话不随比例调整被拽回
  const sticky = stickyStore.get(tenantId + ':' + sessionId)
  if (sticky) return sticky === 'canary' ? CANARY : STABLE
  const chosen = bucketOf(tenantId, sessionId) < CANARY.rolloutPct ? CANARY : STABLE
  stickyStore.set(tenantId + ':' + sessionId, chosen.name)
  return chosen
}
\`\`\`

\`stickyStore\` 是这段代码的重点。没有它，把 \`rolloutPct\` 从 5% 调到 10% 时，原本在 5–9 区间的**老会话**会突然从 stable 跳到 canary；回滚时又会被拽回去。粘性表按会话生命周期保留，会话结束后自然清理。

### 分层灰度与影子流量

Agent 的变更至少有三层，混在一起发布就无法归因：提示词、模型（能力契约别名）、工具清单。稳妥做法是**一次只动一层**，其余两层锁死（L94 的五锁在这里的灰度版）。影子流量则用来在零风险下拿到对照数据：

\`\`\`ts title="三层开关 + 影子流量" note="要点：一次只动一层；影子请求不返回、不写会话状态；比对用 firstDivergence。"
type Layers = { prompt: string; profile: string; tools: string }

function diffLayers(a: Layers, b: Layers): (keyof Layers)[] {
  return (['prompt', 'profile', 'tools'] as (keyof Layers)[]).filter((k) => a[k] !== b[k])
}

async function serve(req: Request, v: VersionConfig, shadow?: VersionConfig): Promise<Response> {
  const layers: Layers = {
    prompt: v.promptVersion, profile: v.profileAlias, tools: v.toolManifestVersion,
  }
  if (shadow) {
    const shadowLayers: Layers = {
      prompt: shadow.promptVersion, profile: shadow.profileAlias, tools: shadow.toolManifestVersion,
    }
    if (diffLayers(layers, shadowLayers).length > 1) {
      throw new Error('影子对比一次只能变一层，否则无法归因')
    }
    void shadowRun(req, shadow).then((r) => {
      metrics.recordShadow({
        sessionId: req.sessionId,
        passRate: r.passRate,
        toolCalls: r.toolCalls,
        firstDivergence: r.firstDivergence,  // L94 的归因字段
        cost: r.cost,
      })
    }) // 不 await、不返回、不写会话状态
  }
  return runWith(req, layers)
}
\`\`\`

\`void shadowRun(...)\` 后面那三个「不」是硬约束：影子请求**不返回给用户**（不影响体验）、**不写会话状态**（否则会污染 L123 的权威状态、触发乐观锁冲突）、**失败不冒泡**。少了任何一条，影子流量就会从「无风险对照」变成「隐性第二份生产流量」。

### 容量模型与自动回滚判据

\`\`\`ts title="按峰值算实例数 + 回滚闸门" note="要点：λ 取峰值、W 取 p95；按目标利用率留余量；四类指标任一越线即自动回退。"
function requiredInstances(cfg: {
  peakQps: number; p95LatencySec: number; maxInFlightPerInstance: number; targetUtil: number
}): number {
  const inFlight = cfg.peakQps * cfg.p95LatencySec   // L = λ × W
  const raw = inFlight / cfg.maxInFlightPerInstance
  return Math.ceil(raw / cfg.targetUtil)             // 目标利用率，如 0.7
}

const ROLLBACK_RULES = [
  { metric: 'p95LatencyMs', op: 'gt', threshold: 1.5, baseline: 'stable' },
  { metric: 'degradedRate', op: 'gt', threshold: 0.05, baseline: 'absolute' },
  { metric: 'passRate', op: 'lt', threshold: 0.9, baseline: 'stable' },
  { metric: 'costPerSession', op: 'gt', threshold: 1.3, baseline: 'stable' },
]

async function checkRollback(canary: Metrics, stable: Metrics): Promise<boolean> {
  for (const r of ROLLBACK_RULES) {
    const c = canary[r.metric as keyof Metrics]
    const s = r.baseline === 'absolute' ? r.threshold : stable[r.metric as keyof Metrics] * r.threshold
    if (r.op === 'gt' ? c > s : c < s) {
      await setRolloutPct(0)   // 自动回退，同时保留 sticky 表里已在 canary 的老会话
      alert('canary rollback: ' + r.metric + ' = ' + c)
      return true
    }
  }
  return false
}
\`\`\`

\`requiredInstances\` 里 \`peakQps\` 与 \`p95LatencySec\` 都不能取平均值——开头那起事故正是两个平均值相乘，把峰值容量算小了近三倍。\`targetUtil=0.7\` 留出的 30% 不是浪费，是给重试放大（L124）和模型慢响应留的缓冲。回滚规则里特意放了 \`degradedRate\` 与 \`costPerSession\`：只看错误率会漏掉「降级很多但没报错」和「答案对但轮次暴涨」这两类 Agent 特有的退化。

:::warn
### 两个必踩的坑

- **按请求随机分桶**。同一会话在新旧版本间来回跳，上下文切裂、状态格式不兼容，而单请求监控一片正常。分桶键必须含会话 id，并配粘性表。
- **用平均 QPS × 平均耗时算容量**。两个平均值相乘会系统性低估峰值；Agent 的单请求耗时方差还特别大（轮次数可变），低估幅度比传统服务更严重。
:::

### 验收：把「可灰度、可回滚」写成断言

\`\`\`ts title="灰度回归断言" note="要点：分桶稳定、比例误差、影子隔离、回滚触发四项。"
function runCanaryCase() {
  const now = Date.now()
  // ① 同一会话 100 次分桶结果必须完全一致
  const picks = new Set(Array.from({ length: 100 }, () => assignVersion('t1', 's1', now).name))
  assert.equal(picks.size, 1, '同一会话跨版本')

  // ② 灰度比例误差 < 2%（用 10000 个不同会话）
  const hits = Array.from({ length: 10_000 }, (_, i) => assignVersion('t1', 's-' + i, now))
    .filter((v) => v.name === 'canary').length
  assert.ok(Math.abs(hits / 100 - 5) < 2, '灰度比例失真: ' + hits)

  // ③ 影子流量不写权威状态
  assert.equal(shadowStore.writes(), 0, '影子请求污染了会话状态')

  // ④ 触发任一回滚规则即自动回退到 0
  const bad: Metrics = { p95LatencyMs: 9_000, degradedRate: 0.01, passRate: 0.97, costPerSession: 0.9 }
  const base: Metrics = { p95LatencyMs: 2_000, degradedRate: 0.01, passRate: 0.98, costPerSession: 0.9 }
  assert.equal(checkRollback(bad, base), true)
  assert.equal(currentRolloutPct(), 0)
}
\`\`\`

四条断言对应的都是「图上看着正常、实际已经出事」的情形。特别是第三条：影子流量污染状态是很隐蔽的 bug，它不会让请求失败，只会让 L123 的乐观锁偶尔冲突，排查时几乎不会往灰度这边想。

### 灰度要观察多久，才敢说「没问题」

「5% 跑两天」是开头那起事故里最容易被忽略的一半。判据不该是时长，而是**三件事都满足**：样本量、流量形状、会话生命周期。

样本量先算清楚。若基线通过率 95%、想检出 2 个点的下降，用 L77 的 Wilson 区间估，5% 分桶在低峰时段两天可能只攒到几百个会话，区间宽度比待检出的差异还大——此时「没有显著差异」只是「没测出来」，不是「没问题」。稳妥做法是先定最小样本数再开灰度，没攒够就不许推进比例，而不是看日历。

流量形状要覆盖至少一个**完整的高峰周期**。Agent 的单请求耗时随轮次数大幅波动，低峰时 \`L = λ × W\` 里的两项都偏小，容量问题、队列堆积、重试放大全都藏在高峰里。所以灰度推进节奏应写成「跨过一个晚高峰 + 一个工作日高峰」，而不是「24 小时无异常」。

会话生命周期则决定了**最早什么时候能读到完整结论**：按会话分桶后，一个进入 canary 的老会话会一直留在新版本直到自然结束，长任务甚至可能跨天。若指标只统计「已完成会话」，早期数据会系统性偏向短会话，把长会话的问题延后暴露。因此看板要同时给「进行中会话数」与「已完成会话指标」，并等长会话跑完一批再判定。

把这三条写成发布检查项，比在群里问「灰度看着咋样」可靠得多。**灰度的结论是「在什么样本、什么流量、什么会话范围内没发现问题」，脱离这三个限定语的「没问题」没有意义。**

### 与相邻课的分工

- **L123**：状态外置与租户键，本课的分桶键与粘性表直接建立在它之上。
- **L94**：对照实验五锁与 \`firstDivergence\`，影子流量是它在生产流量上的形态。
- **L92**：\`L = λ × W\`，本课复用其结论算实例数，不重推公式。
- **L88 / L89 / L122**：模型路由与能力契约，本课的 \`profileAlias\` 是灰度分层里的一层。
- **L124**：降级率，本课把它列为回滚闸门之一。
- **L127**：部署实战，本课的路由与回滚闸门是那个服务的发布面。

**一句话收束**：灰度的最小单位不是请求而是会话，容量的输入不是平均值而是峰值；发布前先想清楚**怎么退回去**。
`,
    null,
    [
      {
        text: '灰度按请求随机分桶，为什么在 Agent 服务上会出事？',
        options: ['成本更高', '同一会话在新旧版本间跳，上下文与状态写入格式被切裂', '哈希不均', '模型不支持'],
        answer: 1,
        explain: '版本也是状态的写入格式，分桶键必须含 sessionId 并配粘性表。',
        concept: 'canary',
      },
      {
        text: '用平均 QPS × 平均耗时算容量，主要风险是？',
        options: [
          '算得太保守',
          '系统性低估峰值，Agent 单请求耗时方差大时低估更严重',
          '与实例数无关',
          '只影响成本',
        ],
        answer: 1,
        explain: 'L = λ × W 里 λ 取峰值、W 取 p95，两个平均值相乘会低估。',
        concept: 'canary',
      },
      {
        text: '影子流量必须满足的硬约束是？',
        options: [
          '必须用更贵的模型',
          '不返回、不写会话状态、失败不冒泡',
          '必须同步等待结果',
          '必须写进同一会话',
        ],
        answer: 1,
        explain: '否则影子流量会变成隐性第二份生产流量并污染权威状态。',
        concept: 'canary',
      },
    ],
    [
      ['稳定分桶', '按 tenantId + sessionId 哈希，保证同一会话不跨版本'],
      ['影子流量', '复制真实请求到新版本但不返回其响应，用于无风险对照'],
      ['容量模型', 'peakQps × p95 耗时得到在途数，再按目标利用率折算实例数'],
    ],
    [
      '把 rolloutPct 调大时没有粘性表，老会话会被在新旧版本间来回拽。',
      '回滚闸门只看错误率，漏掉「降级很多但没报错」「答案对但轮次暴涨」。',
    ],
  ),
  'scenario',
)
