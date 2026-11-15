import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 15 ========== */

export const L89 = withKind(
  L(
    'L89',
    15,
    '实战：实现模型路由（provider 抽象 + 按成本/质量分流）',
    43,
    ['L88'],
    ['routing-impl'],
    [
      '用 TypeScript 实现 provider 抽象（统一接口 + 能力声明）与路由器',
      '实现级联执行器（不达标升级）与成本累计、决策记录',
      '对照 Vercel AI SDK 的 provider 切换与 LiteLLM 的网关思路',
    ],
    `
### 路由上线了，没人知道它选了谁

一个团队按 L88 的策略上了模型路由，运行两周后想调阈值，却发现拿不到数据：每次调用只记了「耗时」和「token 数」，没有记「选了哪档」「为什么选它」「有没有升级」。

于是无法回答任何一个关键问题：误路由率是多少？哪类任务最常升级？升级后的额外成本占多少？最终只能靠猜。

这暴露了路由系统的第一个工程要求：**路由决策本身必须是一等事件**。它要和模型调用一样被记录、被统计、被归因。

这一课搭一个路由层，四个部件：provider 抽象、能力过滤、决策与级联、决策记录。

### provider 抽象：统一接口 + 能力声明

\`\`\`ts title="Provider：统一调用形状 + 能力元数据"
export type Tier = 'small' | 'medium' | 'large'

export interface Capability {
  jsonMode: boolean // 是否支持强制 JSON 输出
  toolCall: boolean // 是否支持函数调用
  maxInputTokens: number
  vision: boolean
}

export interface LlmRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  jsonSchema?: Record<string, unknown>
  tools?: Array<{ name: string; schema: Record<string, unknown> }>
  temperature?: number
  maxOutputTokens?: number
}

export interface LlmResponse {
  text: string
  usage: { in: number; out: number }
  toolCalls?: Array<{ name: string; args: unknown }>
  raw?: unknown
}

export interface Provider {
  name: string
  tier: Tier
  cap: Capability
  /** 每千 token 单价（用于成本估算与排序） */
  price: { in: number; out: number }
  call(req: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>
}
\`\`\`

三个设计决定：

1. **能力写在元数据里，不写在文档里。** 路由要在运行时判断「这个模型能不能做 JSON 输出」，而文档里的说明无法被代码读取。写成 \`cap\` 之后，过滤是代码而非约定。
2. **\`price\` 分输入输出**。输出 token 通常贵 2–4 倍，只用一个单价会让长输出的成本估算偏得很厉害。
3. **\`call\` 接受 \`signal\`**。级联与超时都需要能中断（L81 讲过 \`Promise.race\` 的教训）。

### 能力过滤：路由的第一道闸

很多人把路由做成「按难度选档」，然后发现小模型在处理工具调用时直接报错——因为它根本不支持。所以路由第一步不是选档，是**过滤掉做不到的**：

\`\`\`ts title="候选集：先过滤，再排序"
export interface RouteNeeds {
  json: boolean
  tools: boolean
  vision: boolean
  inputTokens: number
}

export function candidates(providers: Provider[], need: RouteNeeds): Provider[] {
  return providers.filter(
    (p) =>
      (!need.json || p.cap.jsonMode) &&
      (!need.tools || p.cap.toolCall) &&
      (!need.vision || p.cap.vision) &&
      p.cap.maxInputTokens >= need.inputTokens,
  )
}

/** 估算成本：输入按 messages 长度粗估，输出按 maxOutputTokens 或默认值 */
export function estimate(p: Provider, req: LlmRequest): number {
  const inTok = req.messages.reduce((n, m) => n + m.content.length / 2.5, 0) // 中文约 1.6 字/token
  const outTok = req.maxOutputTokens ?? 512
  return (inTok / 1000) * p.price.in + (outTok / 1000) * p.price.out
}
\`\`\`

\`estimate\` 里的 \`2.5\` 是中文的粗略字/token 比。它不需要精确——路由只需要**相对排序**正确，绝对误差 20% 不影响选档决策。真正需要精确计费的地方用返回的 \`usage\`。

过滤之后如果候选为空，说明需求超出了所有 provider 的能力，应当直接报错而不是降级到某个不满足能力的模型。静默降级（比如把 \`tools\` 需求丢掉）会造成难以排查的「工具没被调用」类 bug。

### 路由器：决策 + 记录

\`\`\`ts title="路由决策：可选性与理由都留痕"
export interface RouteDecision {
  requestId: string
  tier: Tier
  provider: string
  estCost: number
  why: string[]
  candidates: string[] // 过滤后的候选，便于排查「为什么只剩一个」
}

export interface RouterOpts {
  providers: Provider[]
  /** 按 L88 的规则给出目标档位 */
  targetTier: (req: LlmRequest) => { tier: Tier; why: string[] }
  onDecision?: (d: RouteDecision) => void
}

export class Router {
  constructor(private opts: RouterOpts) {}

  pick(req: LlmRequest, requestId: string, tierOverride?: Tier): { provider: Provider; decision: RouteDecision } {
    const need: RouteNeeds = {
      json: Boolean(req.jsonSchema),
      tools: Boolean(req.tools?.length),
      vision: false,
      inputTokens: req.messages.reduce((n, m) => n + Math.ceil(m.content.length / 1.6), 0),
    }

    const pool = candidates(this.opts.providers, need)
    if (!pool.length) {
      throw new Error('没有满足能力的 provider：json=' + need.json + ' tools=' + need.tools + ' input=' + need.inputTokens)
    }

    // 级联会显式指定档位；否则按 L88 的规则推断
    const t = tierOverride ? { tier: tierOverride, why: ['级联指定档位=' + tierOverride] } : this.opts.targetTier(req)
    // 目标档没有候选时，向上（更强）找，而不是向下——与 L88 的保守原则一致
    const order: Tier[] = ['small', 'medium', 'large']
    const startAt = order.indexOf(t.tier)
    const tierPool = [t.tier, ...order.slice(startAt + 1)]
    let chosen = pool.find((p) => tierPool.includes(p.tier)) ?? pool[pool.length - 1]

    // 同档内按估算成本最低选
    const sameTier = pool.filter((p) => p.tier === chosen.tier)
    if (sameTier.length > 1) {
      chosen = sameTier.reduce((a, b) => (estimate(b, req) < estimate(a, req) ? b : a))
    }

    const decision: RouteDecision = {
      requestId,
      tier: chosen.tier,
      provider: chosen.name,
      estCost: estimate(chosen, req),
      why: [...t.why, '候选=' + pool.map((p) => p.name).join(',')],
      candidates: pool.map((p) => p.name),
    }
    this.opts.onDecision?.(decision)
    return { provider: chosen, decision }
  }
}
\`\`\`

两个细节值得单说：

- **目标档没有候选时向上找**。比如目标是 \`small\` 但只有 \`large\` 支持工具调用，就选 \`large\`。反过来（向下找）会得到一个不满足能力的模型，那正是各类奇怪 bug 的来源。
- **\`candidates\` 记进决策**。当线上出现「为什么这次用了大模型」，看这一条就知道当时候选池里有什么——如果候选只有一个，那就不是路由选错，是能力过滤把它筛没了。

### 级联执行器

\`\`\`ts title="级联：升级、预算、记录"
export interface CascadeOutcome {
  response: LlmResponse
  tier: Tier
  attempts: Array<{ provider: string; ok: boolean; cost: number; ms: number }>
  totalEstCost: number
}

export interface CascadeOpts {
  router: Router
  /** 判定是否够好：来自验证器（L64），不是模型自评 */
  accept: (r: LlmResponse) => boolean
  /** 成本上限（估算值），超了就停 */
  budget?: number
  tiers?: Tier[]
  signal?: AbortSignal
}

export async function runCascade(
  req: LlmRequest,
  requestId: string,
  o: CascadeOpts,
): Promise<CascadeOutcome> {
  const tiers = o.tiers ?? ['small', 'medium', 'large']
  const attempts: CascadeOutcome['attempts'] = []
  let total = 0
  let last: LlmResponse | undefined

  for (let i = 0; i < tiers.length; i++) {
    // requestId 带档位后缀：三次尝试必须能被日志区分
    const attemptId = requestId + '#' + i
    const { provider, decision } = o.router.pick(req, attemptId, tiers[i])
    const started = Date.now()
    try {
      const res = await provider.call(req, o.signal)
      last = res
      total += decision.estCost
      const ok = o.accept(res) || i === tiers.length - 1 // 最后一档无条件接受
      attempts.push({ provider: provider.name, ok, cost: decision.estCost, ms: Date.now() - started })
      if (ok) return { response: res, tier: provider.tier, attempts, totalEstCost: total }
    } catch (e) {
      total += decision.estCost
      attempts.push({ provider: provider.name, ok: false, cost: decision.estCost, ms: Date.now() - started })
      // 调用异常继续升级，但不吞掉最后一档的错误
      if (i === tiers.length - 1) throw e
    }
    if (o.budget !== undefined && total >= o.budget) break
  }

  if (!last) throw new Error('级联全部失败：' + requestId)
  return { response: last, tier: 'large', attempts, totalEstCost: total }
}
\`\`\`

三处关键：

1. **失败的那次调用也要计入成本**。\`total += decision.estCost\` 在 catch 里也执行——这是 L88 那个「总账更高」的账本基础，少记一笔就无法解释「优化后更贵」。
2. **最后一档无条件接受**。没有这一条，一个永远不通过的输入会升级到最后一档再抛错，而它其实已经有输出了。
3. **预算在档与档之间检查**。超预算就停，返回当前已有的结果而不是抛错——部分结果通常比报错更有用。

:::deep

### 为什么误路由的检测要单独做

路由决策记录能回答「选了谁、为什么」，但不能回答「这次选择对不对」。后者需要**结果信号**：

| 信号 | 从哪来 | 说明什么 |
| --- | --- | --- |
| 升级率 | 级联的 attempts | 第一档没通过的比例 ≈ 误路由率 |
| 同任务重跑率 | 用户重问 / 重试 | 用户不满意，可能是档位太低 |
| 验证器通过率 | 每档的 accept 结果 | 分档能力差异 |
| 人工抽检 | 抽样评分 | 兜住「通过了但质量差」的情况 |

第一项最直接且零成本——级联本来就会跑 \`accept\`，把结果按档统计就是误路由率。如果这个数超过 L88 算的 20% 盈亏线，路由就是亏的。

第二项能发现一类漏网：级联通过了（\`accept\` 为真）但质量不够好，用户重问。这类误判不会被升级率捕获，因为系统认为自己成功了。

:::

:::warn

### 三个实现陷阱

**第一，把控制字段塞进请求对象。** 常见做法是给 \`req\` 挂一个 \`_forceTier\` 再断言回 \`LlmRequest\`——它会污染缓存 key（L90）与日志，还要靠类型断言兜。给 \`pick\` 加显式的 \`tierOverride\` 参数更干净，类型也更安全。

**第二，级联里复用同一个 \`requestId\`。** 三次尝试共用 id 会让日志无法区分是哪一档产生的错误。上面的实现用 \`requestId + '#' + i\` 作为每次尝试的 id。

**第三，\`accept\` 里做真正的验证（跑测试、调校验器）。** 这类验证本身有成本（时间 + 可能的模型调用），放在级联里会让「先试小的」这条路变慢。合理的做法是 \`accept\` 只做轻量判定（格式、长度、关键字段存在），重型验证放在级联之后一次性做。

:::

### 规则要能改，且改了要能比对

路由规则会持续调整（阈值、档位映射、能力过滤条件）。如果它们写死在代码里，每次调整都要走一次发布流程——而成本实验往往需要一天改五版。

把规则外置成配置，同时保留两件事：**版本号**与**决策记录里的版本号**。

\`\`\`ts title="可版本化的路由配置"
export interface RoutingConfig {
  version: string // 'r7'
  byKind: Record<string, Tier>
  thresholds: { longInput: number; manyTools: number; failRate: number }
  externalAlwaysLarge: boolean
}

export const CONFIG_V1: RoutingConfig = {
  version: 'r1',
  byKind: { classify: 'small', extract: 'small', qa: 'medium', plan: 'large', create: 'large' },
  thresholds: { longInput: 6000, manyTools: 8, failRate: 0.15 },
  externalAlwaysLarge: true,
}
\`\`\`

有了 \`version\` 之后，决策记录里带上它，就能做一件很有价值的事：**按配置版本切分指标**。同样是 \`r1\` 时期的请求，升级率是 12%；换成 \`r2\` 后是 19%——差异直接指向配置改动，而不是模型或业务在变。

没有版本号时，这类对比只能靠时间窗口对齐，而时间窗口里往往同时发生了别的变更（模型升级、样本变化、流量结构变化），归因永远不干净。

### 灰度与回滚

路由是「影响全部请求」的改动，必须能灰度。三种做法：

| 做法 | 规则 | 适合 |
| --- | --- | --- |
| 按比例 | 5% 流量走新规则 | 首次上线，观察整体指标 |
| 按任务类型 | 只对 \`classify\` 类启用 | 低风险类别先行 |
| 按租户 | 内部租户先跑 | 有内部 dogfood 环境时 |

回滚必须是**配置级**的（改一个 version 字段），而不是代码级。这与 L80 的「基线只增不改」是同一个思路：变更要可追溯、可撤销，而不是靠重新部署来赌博。

:::warn

### 三处让路由结果无法复现的细节

**第一，\`recentFailRate\` 是滑动窗口。** 同一个请求在上午和下午可能拿到不同的失败率，从而走不同档位。这本身没问题，但排查时必须记录当时的值——否则「同样的输入为什么选了不同模型」永远解释不清。

**第二，\`estimate\` 用的是粗估比例。** 同档内按估算成本排序，估算偏差会改变选择。当两个 provider 价格接近时，这种排序实际是随机的——要接受这一点，不要试图用更精确的估算去「稳定」它。

**第三，能力过滤依赖 \`cap\` 元数据。** 元数据是手写的，可能与真实情况不符（比如某模型升级后支持了 JSON 但元数据没更新）。这类不一致会让过滤结果错误，而且表现是「某个模型从不出现在日志里」——需要定期核对元数据与厂商文档。

:::

### 与 Vercel AI SDK / LiteLLM 的对照

| 能力 | 本课实现 | Vercel AI SDK | LiteLLM |
| --- | --- | --- | --- |
| 统一调用接口 | \`Provider.call\` | \`generateText({ model })\` | OpenAI 兼容协议 |
| 能力声明 | \`Capability\` 元数据 | 无统一元数据（靠文档） | 部分（模型信息表） |
| 路由 | 自写 \`Router\` | 需自写（换 \`model\` 参数） | 有 router 配置（按权重/成本） |
| 级联 | 自写 \`runCascade\` | 需自写 | 有 fallback 配置（异常时切换） |
| 可观测 | 自写 \`onDecision\` | 有 telemetry 钩子 | 有日志与用量统计 |

AI SDK 的定位是「统一调用形状」，它不负责选型；LiteLLM 的定位是「网关」，它的 router 更偏「按权重负载均衡 + 异常 fallback」，而不是「按任务难度分流」。

所以自建路由的价值在两点：**能力过滤**（多数网关不做这个，它假设你传的模型就能用）与**级联的接受判据**（网关的 fallback 只处理异常，不处理「答得不好」）。这两点恰好是 L88 讲的核心。

### 收束

这个路由层到这一步能回答「谁被选了、为什么、升级了几次、花了多少」。它省下的钱来自「该省的地方省」，而不是「全面降级」。

下一课换一个维度：不换模型，而是避免重复调用——缓存。
`,
    null,
    [
      {
        text: '路由的第一步为什么是能力过滤而不是选档？',
        options: [
          '性能考虑',
          '小模型可能根本不支持工具调用 / JSON 输出，选档选了也会直接报错',
          '代码规范',
          '方便统计',
        ],
        answer: 1,
        explain: '候选为空时应报错，而不是静默丢掉能力需求后降级。',
        concept: 'routing-impl',
      },
      {
        text: '级联里失败的那次调用为什么要计入成本？',
        options: [
          '为了日志完整',
          '那笔钱真实花掉了，不记就无法解释「优化后总账更高」',
          '为了重试',
          '为了预算控制',
        ],
        answer: 1,
        explain: '成本账本必须包含所有尝试，否则优化结论失真。',
        concept: 'routing-impl',
      },
      {
        text: '误路由率最直接的零成本度量是？',
        options: ['人工抽检', '级联的升级率（第一档未通过的比例）', '用户重问率', 'token 总量'],
        answer: 1,
        explain: '级联本来就会跑 accept，按档统计即可；用户重问率捕捉的是另一类漏网。',
        concept: 'routing-impl',
      },
      {
        text: '级联里的 `accept` 为什么只应做轻量判定？',
        options: [
          '实现简单',
          '重型验证本身有成本，会让「先试小的」这条路变慢，应放在级联之后一次做',
          '类型限制',
          '避免误判',
        ],
        answer: 1,
        explain: '轻量判定（格式、字段、长度）足以决定是否升级。',
        concept: 'routing-impl',
      },
    ],
    [
      ['Provider 抽象', '统一调用形状 + 能力元数据 + 单价，使路由可代码化'],
      ['能力过滤', '按 json / tools / vision / 输入长度筛掉做不到的 provider'],
      ['级联执行器', '按档升级，失败也计成本，最后一档无条件接受'],
      ['决策记录', '把 tier / provider / 理由 / 候选池写成一等事件，用于调参与归因'],
    ],
    [
      '路由上线无决策记录，无法算误路由率也无法调阈值。',
      '目标档没有候选时向下找，选中不满足能力的模型。',
      '级联失败调用不计成本，导致「省了钱」的错误结论。',
    ],
  ),
  'practice',
)
