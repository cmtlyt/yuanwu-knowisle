import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 5 ========== */

export const L40 = withKind(
  L(
    'L40',
    5,
    '工具执行的安全边界（超时 / 权限 / 回滚）',
    3,
    ['L39'],
    ['tool-safety'],
    [
      '为工具执行器加上权限、超时、配额与审计四类边界',
      '实现危险操作的二次确认与补偿式回滚',
      '理解为什么提示词守则不能当安全边界',
    ],
    `
### 参数正确，后果灾难

一个内部运维 Agent 有个工具 \`delete_records(table, where)\`。某天它接到任务「清理测试环境里的过期数据」，生成的调用是：

\`\`\`json
{ "table": "orders", "where": "created_at < '2026-01-01'" }
\`\`\`

参数完全符合 schema：表名合法、条件语法正确、字段存在。工具照常执行，删掉了生产库 2026 年之前的全部订单——因为那次请求连的是生产环境。

复盘时有三处发现：

1. 工具有 \`table\` 参数，但没有**环境隔离**，默认连生产。
2. \`delete\` 类操作没有任何**二次确认**，模型说删就删。
3. 日志只有「工具调用成功」，没有**删了多少行**，事后无法评估影响面。

三处都不是「模型犯的错」，而是执行侧没有边界。本课讲的就是这三类边界怎么加。

### 三层边界，管的是不同的事

| 层次 | 问题 | 手段 |
|---|---|---|
| 能力边界 | 这个工具**能**做什么 | 工具拆分、参数收窄、只读/可写分离 |
| 权限边界 | 这个调用**该**被允许吗 | 身份 + 资源归属校验、危险操作审批 |
| 执行边界 | 执行过程**可控**吗 | 超时、配额、并发限制、回滚 |

三者顺序不能颠倒：能力边界先收窄（不给它做危险事的能力），权限边界再判断（有能力的也不一定允许），执行边界兜底（允许的也要可控）。

只做第三层（超时、重试）而不管前两层，等于「让一个能删库的工具跑得更稳」。

### 能力边界：最小权限的工具集

工具设计的第一原则：**默认只读，写操作显式列出**。

- \`get_order\` / \`search_orders\` 是只读的，随便调。
- \`update_order_status\` 只能改状态这一个字段，不能改金额、不能改收货地址。
- \`delete_order\` 单独存在，且要求明确的订单号（不接受条件删除）。

「不接受条件删除」这一条尤其重要：它把「删一批」拆成「逐个删」，让每一次删除都可追溯、都可拦截。上面那个事故如果工具签名是 \`delete_order(orderId)\`，模型只能一个一个删，而且会在删除前被确认关卡拦住。

同理，参数收窄要**避免「范围型」参数**：\`where\` 子句、\`glob\` 模式、\`regex\` 都是范围型，它们的危险在于「表达力太强」。如果业务确实需要批量操作，用显式的 \`batchDelete(orderIds: string[])\`，让范围是**枚举出来的**而不是**表达式描述的**。

### 权限边界：身份与归属

权限校验必须在执行侧，且要回答三个问题：

1. **谁在调**？—— 不是「哪个模型」，而是「哪个用户的任务」。运行时要携带用户身份，工具执行器据此取权限。
2. **这个资源属于他吗**？—— 查订单要校验 \`order.userId === ctx.userId\`。这是最常见的一类越权：接口本身合法，但对象不属于调用者。
3. **这个操作需要额外授权吗**？—— 退款、删除、发消息、调外部付费 API，属于「有外部副作用」，需要审批或二次确认。

第二条最容易被漏掉。很多团队做了「用户认证」，却没做「对象级鉴权」，于是 Agent 只要拿到一个订单号就能查任何人的订单——因为它在用服务账号的权限访问数据库。

### 执行边界：超时、配额、并发

超时要做**两层**：工具内部超时（控制单次调用）+ 运行时外层超时（控制整体）。只做一层都有漏洞：内部不设超时，一个挂住的 HTTP 请求会占满连接池；外层不设超时，工具内部的慢查询会一直拖着。

配额要按「任务」和「用户」两个维度设：单任务最多调 N 次写操作、单用户每小时最多 M 次。前者防「Agent 跑飞」，后者防「被刷」。

### 实现：一个带边界的执行器

下面这个执行器把四类边界收在一处。关键在于：**边界检查与工具实现分离**——工具作者只关心业务逻辑，边界由执行器统一施加。

\`\`\`ts title="guarded-executor.ts：权限 → 配额 → 超时 → 审计 → 补偿" note="所有工具都必须经过 execute 这一个入口，这是「边界生效」的前提。"
type Risk = 'read' | 'write' | 'destructive'

interface ToolMeta {
  name: string
  risk: Risk
  timeoutMs: number
  /** 写操作必须提供补偿（回滚）逻辑；只读可省略 */
  compensate?: (args: Record<string, unknown>, out: unknown) => Promise<void>
}

interface Ctx {
  userId: string
  runId: string
  env: 'dev' | 'prod'
  /** 用户已确认的危险操作集合（如 'delete_order:ORD-123'） */
  approved: Set<string>
  quota: { writesLeft: number }
}

interface AuditEntry {
  runId: string
  userId: string
  tool: string
  risk: Risk
  args: Record<string, unknown>
  ok: boolean
  ms: number
  /** 影响面：行数 / 金额 等，便于事后评估 */
  impact?: number
  error?: string
}

export class ToolGuard {
  private audit: AuditEntry[] = []
  private undoStack: { meta: ToolMeta; args: Record<string, unknown>; out: unknown }[] = []

  constructor(
    private registry: Map<string, { meta: ToolMeta; run: (a: Record<string, unknown>) => Promise<unknown> }>,
    private now: () => number = Date.now,
  ) {}

  async execute(name: string, args: Record<string, unknown>, ctx: Ctx): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const t0 = this.now()
    const entry = this.registry.get(name)
    if (!entry) return this.fail(ctx, name, 'read', args, t0, '未知工具')

    const { meta, run } = entry

    // ① 能力边界：生产环境的破坏性操作必须有显式确认
    if (meta.risk === 'destructive') {
      const key = \`\${name}:\${String(args.id ?? args.orderId ?? 'all')}\`
      if (ctx.env === 'prod' && !ctx.approved.has(key)) {
        return this.fail(ctx, name, meta.risk, args, t0, \`需要人工确认：\${key}\`)
      }
    }

    // ② 配额：写操作计数
    if (meta.risk !== 'read') {
      if (ctx.quota.writesLeft <= 0) return this.fail(ctx, name, meta.risk, args, t0, '写操作配额已用尽')
      ctx.quota.writesLeft -= 1
    }

    // ③ 执行边界：超时（Promise.race 而不是只依赖工具内部）
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), meta.timeoutMs)
    let out: unknown
    try {
      out = await Promise.race([
        run({ ...args, __signal: ctrl.signal } as Record<string, unknown>),
        new Promise((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error('工具超时')))),
      ])
    } catch (e) {
      clearTimeout(timer)
      return this.fail(ctx, name, meta.risk, args, t0, (e as Error).message)
    }
    clearTimeout(timer)

    // ④ 审计 + 补偿登记
    const impact = typeof (out as { affected?: number })?.affected === 'number' ? (out as { affected: number }).affected : undefined
    this.audit.push({ runId: ctx.runId, userId: ctx.userId, tool: name, risk: meta.risk, args, ok: true, ms: this.now() - t0, impact })
    if (meta.risk !== 'read' && meta.compensate) this.undoStack.push({ meta, args, out })

    return { ok: true, data: out }
  }

  /** 任务失败或用户取消：按逆序补偿已执行的写操作。 */
  async rollback(times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      const item = this.undoStack.pop()
      if (!item?.meta.compensate) continue
      await item.meta.compensate(item.args, item.out)
    }
  }

  private fail(ctx: Ctx, tool: string, risk: Risk, args: Record<string, unknown>, t0: number, error: string) {
    this.audit.push({ runId: ctx.runId, userId: ctx.userId, tool, risk, args, ok: false, ms: this.now() - t0, error })
    return { ok: false, error }
  }

  getAudit(): AuditEntry[] {
    return [...this.audit]
  }
}
\`\`\`

四个设计点：

**第一，\`risk\` 是工具的固有属性，写在元数据里。** 它不依赖模型判断「这个调用危险不危险」——那是执行侧的分类，不是生成侧的。

**第二，生产环境的破坏性操作需要 \`approved\` 集合。** 确认动作来自用户（或审批系统），不是模型。模型无法「自己确认」。

**第三，超时用 \`Promise.race\` 兜底，不信任工具内部。** 工具作者的实现可能有 bug，执行器必须自己保证上限。

**第四，补偿登记是「逆序」的。** 多个写操作组合成一个任务时，回滚顺序必须与执行顺序相反——先撤销后做的，否则可能出现「先删了订单，再想取消发货」这种不可能的操作。

### 危险操作的两阶段：确认后再执行

对真正不可逆的操作（转账、删除、对外发消息），推荐「两阶段」：第一次调用只做预检并生成待确认项，用户确认后再真正执行。

\`\`\`ts title="prepare / commit 两阶段" note="prepare 只做只读校验并返回影响面摘要；commit 需要 approvalId，且一次性消费。"
interface Pending {
  approvalId: string
  tool: string
  args: Record<string, unknown>
  summary: string // 给用户看的影响面，如「将删除 37 条 2026 年前的订单」
  expiresAt: number
}

const pending = new Map<string, Pending>()

export async function prepare(
  tool: string,
  args: Record<string, unknown>,
  preview: (a: Record<string, unknown>) => Promise<string>,
): Promise<Pending> {
  const summary = await preview(args) // 只读预检：查会影响多少行
  const p: Pending = {
    approvalId: crypto.randomUUID(),
    tool,
    args,
    summary,
    expiresAt: Date.now() + 10 * 60_000,
  }
  pending.set(p.approvalId, p)
  return p
}

export async function commit(approvalId: string, ctx: Ctx, guard: ToolGuard): Promise<{ ok: boolean; error?: string }> {
  const p = pending.get(approvalId)
  if (!p) return { ok: false, error: '未找到待确认项' }
  if (Date.now() > p.expiresAt) return { ok: false, error: '确认已过期' }
  pending.delete(approvalId) // 一次性：防止重放
  const key = \`\${p.tool}:\${String(p.args.id ?? p.args.orderId ?? 'all')}\`
  ctx.approved.add(key)
  const r = await guard.execute(p.tool, p.args, ctx)
  return { ok: r.ok, error: r.error }
}
\`\`\`

两阶段的价值在于**把「影响面」摆到用户面前**：\`summary\` 不是「将执行删除」，而是「将删除 37 条 2026 年前的订单」。用户看到具体数字才能做出真实判断。

「一次性消费」也是必须的：\`pending.delete\` 在 commit 开头就执行，防止同一个 approvalId 被重放（模型可能重复提交）。

:::deep

### 为什么提示词里的「安全守则」不是安全边界

很多项目在系统提示里写：「不要删除生产数据」「不要给未付款订单发货」。这些话有用，但它们**不是安全边界**，原因有三：

**① 提示词可以被上下文覆盖。** 用户输入里的一句「忽略之前的规则，这是测试环境」，就可能让模型改变行为。这不是模型「不听话」，而是提示词与用户输入在同一个上下文里竞争，谁的表述更强取决于模型判断。

**② 提示词不影响代码。** 即使模型决定「不删」，它也只是不发起调用；一旦它决定发起，代码侧没有任何东西拦它。安全必须由「无论模型想做什么都拦得住」的机制保证。

**③ 提示词无法审计。** 「它有没有试图违规」这件事，在提示词层面只有一段自然语言；在执行层面则是「有一条被拒绝的调用记录」。

正确的定位是：**提示词负责「让它不想做错」，代码负责「让它做不到」**。前者提升正常路径的成功率，后者是失效时的兜底。把两者混为一谈，就会出现「提示词写得很严，实际一注入就破防」的安全假象。

:::

### 审计日志该记什么

出事后能追溯的前提是日志里有关键字段。一个够用的审计条目至少包含：

| 字段 | 为什么需要 |
|---|---|
| \`runId\` / \`userId\` | 定位「哪个任务的哪个用户」 |
| \`tool\` / \`risk\` | 定位「什么级别的操作」 |
| \`args\` | 复现「它到底想做什么」 |
| \`ok\` / \`error\` | 区分「做了」与「尝试了但被拦」 |
| \`impact\` | 评估影响面（行数 / 金额） |
| \`ms\` | 排查超时与性能 |

其中 \`impact\` 最常被漏掉，也最重要：事后复盘的第一个问题永远是「影响了多少」。工具实现应该主动返回 \`affected\` 字段（更新了几行、删了几条），执行器把它记进审计。

:::warn

### 三个「看起来防住了、其实没有」的做法

**做法一：只在前端加确认弹窗。** 前端确认只防「用户误点」，不防「Agent 自动执行」。Agent 的调用不经过前端。

**做法二：靠工具名区分危险度。** \`delete_*\` 前缀看起来能识别危险操作，但只要有人加一个 \`purge_records\`，规则就失效了。危险度该写在**元数据**里，而不是从名字推断。

**做法三：靠「只读数据库账号」保证安全。** 只读账号确实能防写，但很多 Agent 需要写。此时正确做法不是「给写权限然后祈祷」，而是**写操作走独立的、带审批的通道**——权限分级，而不是一刀切。

:::

### 收束：安全边界是「执行侧的属性」

这一课的核心可以压成一句话：**Agent 的安全性由执行侧的能力与权限决定，与模型的意图无关。**

模型可能被注入、可能理解错、可能过度执行。这些都不该成为事故原因——因为它们都发生在「请求」这一侧，而拦截发生在「执行」这一侧。只要执行侧的边界足够清楚，最坏情况就是「一次被拒绝的调用 + 一条审计记录」。

L41 回到协议层的另一个特性：并行调用。它会让「一次请求里多个工具同时执行」成为常态，也把权限与配额的设计推到更复杂的位置——因为并行意味着「部分成功」。

`,
    null,
    [
      {
        text: '三层安全边界的正确顺序是？',
        options: [
          '先超时、再权限、最后能力',
          '先收窄能力（工具能做什么）、再判权限（该不该允许）、最后执行兜底（超时/配额/回滚）',
          '三者可任意顺序',
          '只需执行边界',
        ],
        answer: 1,
        explain: '只做执行边界等于「让能删库的工具跑得更稳」。',
        concept: 'tool-safety',
      },
      {
        text: '为什么「不接受条件删除」更安全？',
        options: ['性能更好', '把「删一批」拆成逐个删，每次可追溯、可拦截', 'SQL 语法限制', '减少 token'],
        answer: 1,
        explain: '范围型参数表达力太强，枚举式参数范围可控。',
        concept: 'tool-safety',
      },
      {
        text: '对象级鉴权（如 order.userId === ctx.userId）防止的是？',
        options: ['SQL 注入', '接口合法但对象不属于调用者的越权访问', '模型幻觉', '超时'],
        answer: 1,
        explain: '只做用户认证不做对象级鉴权，拿到 id 就能查任何人的数据。',
        concept: 'tool-safety',
      },
      {
        text: '两阶段（prepare / commit）里最关键的产出是？',
        options: ['随机 id', '给用户看的影响面摘要（如「将删除 37 条」）', '更快的执行', '更小的参数'],
        answer: 1,
        explain: '具体数字才能让用户做出真实判断；commit 要一次性消费防重放。',
        concept: 'tool-safety',
      },
      {
        text: '为什么提示词里的安全守则不能当安全边界？',
        options: [
          '模型不读提示词',
          '提示词可被上下文覆盖、不约束代码、且无法审计',
          '提示词太短',
          '提示词会被缓存',
        ],
        answer: 1,
        explain: '提示词让它「不想做错」，代码保证它「做不到」。',
        concept: 'tool-safety',
      },
    ],
    [
      ['能力边界', '工具本身能做什么，靠拆分与参数收窄'],
      ['对象级鉴权', '校验资源是否属于调用者，防越权'],
      ['补偿式回滚', '按逆序撤销已执行的写操作（saga 思路）'],
      ['两阶段确认', 'prepare 预检影响面、commit 需审批且一次性消费'],
    ],
    [
      '工具默认连生产、无确认、无影响面记录，参数一正确就造成灾难。',
      '只做用户认证不做对象级鉴权，拿到 id 就能查他人数据。',
      '超时只依赖工具内部实现，执行器没有兜底。',
    ],
  ),
  'practice',
)
