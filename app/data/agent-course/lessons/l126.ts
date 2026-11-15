import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 25 ========== */

export const L126 = withKind(
  L(
    'L126',
    25,
    'Agent 系统的全生命周期运维',
    2,
    ['L72'],
    ['lifecycle-ops'],
    [
      '实现运行清单、状态 schema 迁移、凭证双密钥轮换与留存删除',
      '写出把责任与复核周期变成可执行断言的 runbook 自检脚本',
      '建立「设计 → 开发 → 发布 → 观测 → 迭代」各阶段的验收物清单',
    ],
    `
### 一张凭证过期，所有长任务同时失败，却没人知道该找谁

周五傍晚，调用外部数据服务的 API 凭证到期。受影响的远不只是新请求：十几个跑了一半、正在等人审批的长任务，恢复时全部因为「凭据无效」失败，状态卡在 \`pendingApproval\` 里既不能继续也不能自动回滚。值班同学翻了半小时才搞清楚三件事：这凭证是谁申请的（没人登记）、哪些会话正在用它（没记录 keyId）、到期后该找谁续（runbook 里没写）。

更让人后背发凉的是后续清点：同一份提示词在系统里同时存在 v9 / v12 两个版本，没人说得清线上跑的是哪个；会话状态的 schema 半年前改过一次，旧会话靠一段临时兼容代码勉强能读；用户要求删除的数据，只有「逻辑删除标记」而没有真正的清理任务。**机器指标一直全绿**——CPU、内存、错误率都正常，问题全部出在「契约没人维护」。

这一课要立的判断是：**Agent 运维的对象不是服务器，是契约**。一次运行由四个版本号共同定义——模型能力契约、提示词、工具清单、会话状态 schema；服务器只是执行者。改其中任何一个都是一次需要迁移、验证与回滚的变更。

### 五个阶段，各自要交出什么

| 阶段 | 关键动作 | 责任角色 | 可验收物 |
|---|---|---|---|
| 设计 | 定契约、定 SLO、定留存策略 | 架构 + 法务 | \`RunManifest\` 字段表、留存策略文档 |
| 开发 | 版本锁、迁移器、假模型隔离 | 开发 | L95 四重版本锁、迁移演练脚本 |
| 发布 | 分桶灰度、回滚闸门 | 发布负责人 | L125 的路由配置与回滚规则 |
| 观测 | 按版本分组的指标与 trace | SRE | 降级率 / 成本 / p95 三条分组曲线 |
| 迭代 | 复评契约、清理旧版本、演练 runbook | 值班 owner | 复评记录、季度演练报告 |

最后一行最容易被砍掉，因为它「不出功能」。但上面那起凭证事故的每一环都对应这里：没有复评记录 → 没人知道到期；没有 owner → 出事找不到人；没有演练 → 双密钥并存窗口从没被验证过。**上线不是终点，持续评测与回滚才是常态**（L80 的回归基线在这里从「发布前检查」变成「日常体检」）。

:::deep
### 为什么「运行清单」比日志更能定位问题

L73 的链路追踪能告诉你「这次请求调了哪些工具、花了多久」，但回答不了「这次运行用的是哪一版提示词、哪一版状态格式、哪个模型别名、哪个凭证」。而这些恰恰是复现事故的必要条件：同一个 bug 在 p12 与 p13 下表现不同，在 schema v1 与 v2 下的恢复路径也不同。

所以每次运行落一条 \`RunManifest\`，把四个版本号 + 租户 + traceId + 凭证 keyId 绑成一条不可变记录。它和 L122 的 \`ModelProfile\`、L95 的版本锁是同一套思路的延伸：**会变的东西必须显式声明，不能靠日志里的蛛丝马迹去猜**。有了它，「把上周三失败的那一批会话找出来重跑」才是一句可执行的话。
:::

### 运行清单与启动校验

\`\`\`ts title="RunManifest：一次运行的四个版本号" note="要点：不可变记录；启动前校验版本仍受支持；traceId 与 L73 的 span 对齐。"
type RunManifest = {
  runId: string
  traceId: string
  tenantId: string
  promptVersion: string
  profileAlias: string        // L122 能力契约
  toolManifestVersion: string // L121 工具清单
  stateSchemaVersion: number
  credentialKeyId: string
  createdAt: number
}

const SUPPORTED = {
  prompts: new Set(['p13', 'p14']),
  profiles: new Set(['agent-main', 'agent-main-b']),
  tools: new Set(['tm3', 'tm4']),
  stateSchema: 2,
}

function assertSupported(m: RunManifest): void {
  if (!SUPPORTED.prompts.has(m.promptVersion)) throw new Error('提示词版本已退役: ' + m.promptVersion)
  if (!SUPPORTED.profiles.has(m.profileAlias)) throw new Error('模型契约已退役: ' + m.profileAlias)
  if (!SUPPORTED.tools.has(m.toolManifestVersion)) throw new Error('工具清单已退役: ' + m.toolManifestVersion)
  if (m.stateSchemaVersion > SUPPORTED.stateSchema) {
    throw new Error('状态格式来自未来版本，拒绝读取')
  }
  if (!m.credentialKeyId) throw new Error('未记录凭证 keyId，事故时无法定位影响面')
}
\`\`\`

最后一条是那起事故的直接产物：记录 \`credentialKeyId\` 之后，「哪些会话在用旧凭证」从半小时的翻日志变成一条查询。倒数第二条同样重要——读到比当前程序更新的状态版本时**必须拒绝**，否则会把看不懂的字段静默丢弃，等用户回来时历史已经缺了一半。

### 状态 schema 迁移：幂等、双写、可演练

\`\`\`ts title="幂等迁移器与双写窗口" note="要点：迁移函数可重复执行；双写期新旧字段都写；迁移后用 L80 回归基线验收。"
type StateV1 = { turns: { role: string; content: string }[]; pending?: string }
type StateV2 = { turns: Turn[]; pendingApproval?: { id: string; expiresAt: number }; version: number }

function migrateV1toV2(s: StateV1 | StateV2): StateV2 {
  if ('version' in s) return s                       // 已迁移：幂等返回，不重复加工
  const turns: Turn[] = s.turns.map((t) => ({ ...t, at: 0 })) as Turn[]
  const pendingApproval = s.pending
    ? { id: s.pending, expiresAt: Date.now() + 86_400_000 }
    : undefined
  return { turns, pendingApproval, version: 2 }
}

async function loadWithMigration(store: SessionStore, key: string): Promise<StateV2> {
  const raw = await store.loadRaw(key)
  const migrated = migrateV1toV2(raw)
  if (raw !== migrated) {
    // 双写窗口：保留旧字段一段时间，便于回滚；不清原始数据（L74 回放要用）
    await store.writeBoth(key, raw, migrated)
  }
  return migrated
}
\`\`\`

\`writeBoth\` 是迁移期最关键的一行。**能回滚的迁移才是安全的迁移**：只写新格式，一旦新版本有问题，旧版本读不了新状态，回滚就变成了数据事故。双写窗口通常保留一个发布周期，之后由清理任务删除旧字段——清理也要走演练，不能上线后顺手跑一次。

### 凭证轮换与数据留存

\`\`\`ts title="双密钥并存窗口 + 留存清理" note="要点：轮换不硬删旧凭证；按 keyId 记录影响面；删除要可审计。"
type CredentialSet = { active: string; previous?: string; previousValidUntil: number }

async function callExternal(creds: CredentialSet, req: Request, m: RunManifest) {
  const keyId = creds.active
  try {
    return await external.call(req, credentialOf(keyId))
  } catch (e) {
    if (isAuthError(e) && creds.previous && Date.now() < creds.previousValidUntil) {
      // 长任务恢复时可能仍持有旧 keyId：在并存窗口内允许用旧凭证完成
      audit.record({ runId: m.runId, keyId: creds.previous, fallback: true })
      return external.call(req, credentialOf(creds.previous))
    }
    throw e
  }
}

const RETENTION_DAYS: Record<string, number> = { conversation: 90, trace: 30, audit: 365 }

async function purgeExpired(tenantId: string, now: number): Promise<{ deleted: number }> {
  let deleted = 0
  for (const [kind, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = now - days * 86_400_000
    const rows = await store.listOlderThan(tenantId, kind, cutoff)
    for (const r of rows) {
      await store.hardDelete(r.key)       // 真删除，不是只打标记
      audit.record({ tenantId, kind, key: r.key, at: now, reason: 'retention' })
      deleted += 1
    }
  }
  return { deleted }
}
\`\`\`

\`previous\` 与 \`previousValidUntil\` 组成的并存窗口，是长任务与凭证轮换共存的最小机制：新请求用新凭证，恢复中的老任务在窗口内仍可用旧凭证完成，窗口关闭前由 runbook 强提醒「还有 N 个会话在用旧 keyId」。留存这边则强调两点：**按租户删除**（L87 隔离）、**真删除且写审计**。只打 \`deleted=true\` 标记的做法在很多合规场景里不算删除，而审计记录本身有更长的保留期。

:::warn
### 两个必踩的坑

- **把运维等同于盯机器指标**。CPU、内存、错误率全绿时，契约仍可能已经过期、schema 可能早已不兼容、凭证可能明天到期。要把「版本复评、凭证到期、留存执行、runbook 演练」做成可查询、可告警的对象。
- **轮换时直接删掉旧凭证**。长任务、审批中的会话、重试队列都还握着旧 keyId，硬删会让它们在同一时刻集体失败——正是本课开场的事故。并存窗口 + 影响面清单是必修项。
:::

### runbook 自检：把「谁负责」变成可执行断言

\`\`\`ts title="季度演练脚本" note="要点：断言 owner、复评期、迁移幂等、轮换窗口、留存真删除、SLO 定义六项。"
const RUNBOOK = {
  owner: 'platform-agent',
  reviewEveryDays: 90,
  slo: { availability: 0.995, p95Ms: 4_000, maxCostPerSession: 1.2 },
}

async function runLifecycleDrill() {
  assert.ok(RUNBOOK.owner && RUNBOOK.owner !== 'todo', '未指定值班 owner')
  assert.ok(RUNBOOK.slo.p95Ms > 0 && RUNBOOK.slo.maxCostPerSession > 0, 'SLO 不完整')

  const v1: StateV1 = { turns: [{ role: 'user', content: 'hi' }], pending: 'ap-1' }
  const once = migrateV1toV2(v1)
  assert.deepEqual(migrateV1toV2(once), once, '迁移不幂等，重跑会破坏状态')
  assert.ok(once.pendingApproval?.id === 'ap-1', '迁移丢了未决审批项')

  const creds: CredentialSet = { active: 'k2', previous: 'k1', previousValidUntil: Date.now() + 3_600_000 }
  assert.ok(creds.previous && creds.previousValidUntil > Date.now(), '轮换没有并存窗口')

  const purged = await purgeExpired('t1', Date.now())
  assert.ok(await audit.hasEntry({ tenantId: 't1', reason: 'retention' }), '删除未写审计')
  return { migrated: 1, purged: purged.deleted, owner: RUNBOOK.owner }
}
\`\`\`

这份脚本的价值不在「跑通」，在**它是可执行的责任声明**：owner 没填会失败、SLO 缺项会失败、迁移不幂等会失败、没有轮换窗口会失败、删除没审计会失败。把它放进季度演练（而不是文档里的一句「请定期复核」），契约维护才从口号变成门禁。L81 的 Eval harness 也可以接进来，让「持续评测」和「持续运维」共用同一套断言资产。

### 责任矩阵：契约要有人认领

把「运维的对象是契约」落到组织上，需要一张最小责任矩阵：每类契约有明确的 owner、复核周期、以及到期前的提醒天数。没有这张表，前面所有脚本都只是代码，出事时依然会回到「这凭证是谁申请的」。

| 契约 | owner | 复核周期 | 到期前提醒 | 到期未处理的动作 |
|---|---|---|---|---|
| 模型能力契约 | 平台 | 90 天 | 14 天 | 禁止新会话使用该 alias |
| 提示词版本 | 业务 | 每次发布 | — | 从 \`SUPPORTED\` 移除并清理旧会话 |
| 工具清单 | 平台 | 90 天 | 14 天 | 阻断新增依赖该清单的会话 |
| 凭证 | 值班 owner | 30 天 | 7 天 | \`/ready\` 转 not-ready，不再接流量 |
| 留存策略 | 法务 + 平台 | 180 天 | 30 天 | 暂停删除任务并告警 |

最后一行「到期未处理的动作」是这张表的价值所在：**每个契约都要有一个会自动发生、且不依赖人记得的兜底行为**。凭证到期就让就绪探针失败、契约退役就禁止新会话使用，系统自己把风险挡住，而不是等值班同学在事故里翻文档。这也解释了为什么 \`SUPPORTED\` 那张集合要放在代码里而不是 wiki 上——能被启动校验读到的规则才算规则。

### 与相邻课的分工

- **L72 / L73**：仪表盘与链路追踪讲「怎么看清一次运行」，本课补「这次运行由哪些契约定义」。
- **L95 / L122**：四重版本锁与能力契约，本课的 \`RunManifest\` 是它们在运行时的落点。
- **L123 / L124 / L125**：状态外置、降级、灰度，本课负责它们在**长时间尺度**上的迁移与复评。
- **L87 / L74**：租户隔离与回放调试，本课的按租户删除、迁移不清原始数据直接依赖它们。
- **L127**：部署实战，本课的 runbook 是那个服务上线后必须一起交付的东西。

**一句话收束**：服务器坏了换一台就行，**契约没人维护会让所有实例一起错**；运维的验收物是清单、迁移器、轮换窗口和能跑的 runbook。
`,
    null,
    [
      {
        text: '凭证过期导致长任务集体失败，最该补的机制是？',
        options: ['加机器', '双密钥并存窗口 + 运行清单记录 keyId', '提高超时', '换模型'],
        answer: 1,
        explain: '恢复中的会话仍握旧 keyId，硬删会同时打断；并存窗口让轮换可过渡。',
        concept: 'lifecycle-ops',
      },
      {
        text: '状态 schema 迁移为什么必须双写？',
        options: ['为了更快', '只写新格式时旧版本读不了，回滚会变成数据事故', '为了省空间', '为了兼容日志'],
        answer: 1,
        explain: '能回滚的迁移才是安全迁移，且原始数据要留给 L74 回放。',
        concept: 'lifecycle-ops',
      },
      {
        text: 'runbook 自检脚本相比「文档里写请定期复核」的价值是？',
        options: [
          '更美观',
          '把 owner、SLO、迁移幂等、轮换窗口、删除审计变成可执行断言',
          '字数更多',
          '可以替代监控',
        ],
        answer: 1,
        explain: '责任声明变成门禁，缺项会在演练里直接失败。',
        concept: 'lifecycle-ops',
      },
    ],
    [
      ['RunManifest', '一次运行绑定的四个版本号 + 租户 + traceId + 凭证 keyId'],
      ['双写窗口', '迁移期新旧格式都写，保证回滚后旧版本仍能读'],
      ['留存策略', '按租户真删除并写审计，不是只打 deleted 标记'],
    ],
    [
      '把运维等同于盯 CPU/错误率，契约过期与 schema 不兼容在这些指标上完全不可见。',
      '轮换凭证时直接删旧 key，审批中与重试队列里的长任务会集体失败。',
    ],
  ),
  'scenario',
)
