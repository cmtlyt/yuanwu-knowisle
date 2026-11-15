import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 25 ========== */

export const L124 = withKind(
  L(
    'L124',
    25,
    '降级与兜底：别让一次超时拖垮整个系统',
    3,
    ['L123'],
    ['degradation'],
    [
      '实现贯穿整轮请求的超时预算、有界重试与熔断器',
      '写出可标记的降级阶梯，区分「优雅降级」与「静默失败」',
      '跑通一次注入 30s 超时的雪崩演练并验收四项断言',
    ],
    `
### 一个工具慢了 30 秒，全站都超时了

下午三点，一个不常用的查询工具开始偶发 30 秒超时，占比不到 3%。二十分钟后整个 Agent 服务不可用，监控上却没有一条「错误率飙升」——因为**没有请求失败，只是所有请求都在排队**。链路是：工具超时 → 调用方按「三次重试」重试 → 上游看到慢又发一次请求 → 每个慢请求占住一个连接和队列位置。L92 的 \`L = λ × W\` 在这里直接兑现：到达率 λ 没变，单次占用时长 W 从 0.8 秒涨到 30 秒，在途请求数从 40 涨到 1500，而队列上限只有 200。剩下的请求不是被拒绝，是被拖到超时。

复盘最该记住的一句是：**慢比错更危险**。错误会立刻返回、释放连接和线程；慢会一直占着资源，而且天然诱发重试，重试又制造更多慢。所以这一课要交付的不是「多试几次」，而是一套把失败**收口**的机制：给整轮请求一个预算、让重试有上限、让持续失败的依赖被熔断、最后让降级结果带上可识别的标记。

### 四层防线，各管一件事

| 层 | 管什么 | 判据 | 做错的后果 |
|---|---|---|---|
| 超时预算 | 整轮最多花多久、每段能分到多少 | 剩余时间而不是每段独立超时 | 各段都「没超」，加起来超了 |
| 有界重试 | 哪些错误值得重试、总共能试几次 | 只对瞬态错误 + 全局重试预算 | 重试放大，把慢变成雪崩 |
| 熔断 | 依赖持续不健康时停止调用 | 滑动窗口失败率 / 慢调用率 | 明知坏着还继续灌请求 |
| 降级阶梯 | 拿不到结果时给什么 | 每级可回退、响应里可标记 | 静默失败，调用方以为拿到了真结果 |

四层是**串联**的，缺任何一层都会把压力漏给下一层：没有预算，重试会无限拖；没有熔断，重试会打在已坏的依赖上；没有可标记的降级，用户拿到一个看似正常、实则空洞的答案。

:::deep
### 为什么「每段各设一个超时」不够

常见写法是给模型 10s、给工具 5s、给数据库 3s，看起来都有保护。但一轮 Agent 可能调六次工具、两次模型，六段各自「没超」完全可以是 30 秒以上；更要命的是每段超时后各自重试，重试时间不计入原超时。于是「局部都合规、整体失控」。

正确做法是把**整轮预算当作一个递减的资源**：请求进来时记下 deadline，每次外部调用前用 \`deadline - now\` 作为本次允许时间，并把同一个 \`AbortController\` 传下去。预算耗尽就立刻走降级，不再尝试「最后再试一次」。这个思路和 L120 语音场景的时延预算是同一个东西，只是那里优化体验、这里保命。
:::

### 超时预算与有界重试

\`\`\`ts title="整轮预算 + 有界重试" note="要点：deadline 贯穿；只对瞬态错误重试；全局重试预算；退避加抖动避免同步洪峰。"
type Budget = { deadline: number; retriesLeft: number; signal: AbortSignal }

function newBudget(totalMs: number): Budget {
  const ctrl = new AbortController()
  return { deadline: Date.now() + totalMs, retriesLeft: 2, signal: ctrl.signal }
}

function remaining(b: Budget): number {
  const ms = b.deadline - Date.now()
  if (ms <= 0) throw new Error('budget exhausted')
  return ms
}

const TRANSIENT = /timeout|ECONNRESET|429|503|rate.?limit/i

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, b: Budget): Promise<T> {
  const ms = Math.min(remaining(b), 5_000)     // 单次最多 5s，且不超过剩余预算
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('budget'), ms)
  b.signal.addEventListener('abort', () => ctrl.abort('parent'), { once: true })
  try {
    return await fn(ctrl.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function resilientCall<T>(fn: (signal: AbortSignal) => Promise<T>, b: Budget): Promise<T> {
  for (;;) {
    try {
      return await withTimeout(fn, b)
    } catch (e) {
      const msg = String(e)
      const retryable = TRANSIENT.test(msg) && b.retriesLeft > 0 && remaining(b) > 1_500
      if (!retryable) throw e
      b.retriesLeft -= 1
      const backoff = 120 * Math.pow(2, 2 - b.retriesLeft) + Math.random() * 80
      await new Promise((r) => setTimeout(r, Math.min(backoff, remaining(b))))
    }
  }
}
\`\`\`

三个细节决定它能不能挡住雪崩：\`retriesLeft\` 是**整轮共享**的，不是每个调用各三次；\`remaining(b) > 1_500\` 保证剩余预算不够时不再重试；退避里那点随机抖动不是装饰，没有它，所有实例会在同一毫秒一起重试，形成同步洪峰。\`/timeout|429|503/\` 之外的错误（参数错误、权限不足、业务拒绝）一律不重试——**对不可重试的错误重试，是在用资源给一个确定的失败买单**。

### 熔断器：别继续往坏依赖上灌请求

\`\`\`ts title="滑动窗口熔断器" note="要点：失败率与慢调用率一起统计；打开后直接走降级；半开只放一个探测请求。"
type BreakerState = 'closed' | 'open' | 'half-open'

class Breaker {
  private state: BreakerState = 'closed'
  private window: { ok: boolean; slow: boolean }[] = []
  private openedAt = 0
  private probeInFlight = false

  constructor(private minSamples = 20, private failRate = 0.5, private cooldownMs = 10_000) {}

  allow(): boolean {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt < this.cooldownMs) return false
      this.state = 'half-open'
    }
    if (this.state === 'half-open') {
      if (this.probeInFlight) return false
      this.probeInFlight = true
    }
    return true
  }

  record(ok: boolean, elapsedMs: number): void {
    this.window.push({ ok, slow: elapsedMs > 3_000 })
    if (this.window.length > 100) this.window.shift()
    const n = this.window.length
    if (n < this.minSamples) return
    const bad = this.window.filter((x) => !x.ok || x.slow).length
    if (bad / n > this.failRate) {
      this.state = 'open'; this.openedAt = Date.now(); this.probeInFlight = false
    } else if (this.state === 'half-open') {
      this.state = 'closed'; this.window = []; this.probeInFlight = false
    }
  }
}
\`\`\`

把 **慢调用也算进 \`bad\`** 是这一课的关键改动。只统计失败率的熔断器，在开头那起事故里会一直显示「全绿」——30 秒超时最终确实失败了，但在它失败之前，几百个请求已经堆在队列里。半开状态只放一个探测请求，是为了避免冷却结束后一口气把全量流量重新灌回还没恢复的依赖。

### 降级阶梯：每一级都要能被认出来

\`\`\`ts title="可标记的降级阶梯" note="要点：响应带 degraded 标记与 level；禁止返回看起来正常的空结果。"
type Answer = { text: string; degraded: boolean; level?: number; reason?: string }

async function answerWithFallback(q: string, b: Budget, cache: Cache, breaker: Breaker): Promise<Answer> {
  if (!breaker.allow()) {
    return { text: '查询服务暂时繁忙，已为你保留问题，稍后可继续', degraded: true, level: 4, reason: 'breaker-open' }
  }
  try {
    const fresh = await resilientCall((s) => queryTool(q, s), b)
    breaker.record(true, 0)
    return { text: fresh, degraded: false }
  } catch (e) {
    breaker.record(false, 5_000)
    const cached = await cache.get(q)                    // ① 用 L90 的缓存兜底
    if (cached && isAdmissible(q, cached)) {
      return { text: cached.text + '（数据可能不是最新）', degraded: true, level: 2, reason: 'stale-cache' }
    }
    if (remaining(b) > 2_000) {                          // ② 预算够就走简化回答
      const short = await resilientCall((s) => llm.shortAnswer(q, s), b)
      return { text: short + '（未查询实时数据）', degraded: true, level: 3, reason: 'no-tool' }
    }
    return { text: '暂时无法获取实时数据，请稍后重试', degraded: true, level: 4, reason: 'budget' }
  }
}
\`\`\`

\`degraded\` 字段不是给日志看的，是给**下游和用户**看的：L86 输出护栏要求「不能把不确定的东西说成确定」，L72 仪表盘需要把降级率单独画一条线，客服系统要能按 \`level=4\` 自动建工单。少了这个字段，降级就退化成静默失败——用户拿到一段流畅但没查过数据的回答，比明确告知「暂时不可用」危险得多。

:::warn
### 两个必踩的坑

- **对不可重试的错误重试**。参数校验失败、权限不足、业务明确拒绝，重试一百次也不会变，只会把队列占住。判定要基于错误类型白名单，不是「凡是异常都再试一次」。
- **降级返回一个看起来正常的空结果**。比如工具失败时让模型「根据已有信息回答」，模型会编出一段非常自然的说明。降级必须在**文本里**和**结构化字段里**同时标注，且不得由模型自由发挥。
:::

### 雪崩演练：把断言写进回归

\`\`\`ts title="注入 30s 超时的演练脚本" note="要点：断言在途数、熔断状态、降级标记、恢复后半开成功四项。"
async function runDegradationDrill(fakeTool: FakeTool, cache: Cache) {
  fakeTool.injectLatency(30_000, { rate: 0.03 })       // 复刻事故：3% 请求慢 30s
  const breaker = new Breaker()
  const results = await Promise.all(
    Array.from({ length: 200 }, (_, i) =>
      answerWithFallback('q-' + i, newBudget(8_000), cache, breaker))
  )

  assert.ok(fakeTool.maxInFlight() <= 20, '在途请求未被收口: ' + fakeTool.maxInFlight())
  assert.ok(results.some((r) => r.degraded), '没有任何降级发生')
  assert.ok(results.filter((r) => r.degraded).every((r) => r.reason), '降级响应缺原因标记')

  fakeTool.clearLatency()
  await new Promise((r) => setTimeout(r, 10_100))       // 冷却后进半开
  const probe = await answerWithFallback('q-probe', newBudget(8_000), cache, breaker)
  assert.equal(probe.degraded, false, '半开探测未恢复')
}
\`\`\`

用假工具注入延迟、断言「在途数 ≤ 20」而不是「错误率 < 1%」——因为这类事故的体征就是**没有错误**。这正是 L77 强调的「先选对度量维度」：盯错误率会漏掉慢故障，盯在途数与 p95 才看得见。演练脚本用假时钟与假依赖，可进 CI；真集群的混沌演练只做人工记录。

### 降级不是免费的：把它算进 SLO 与错误预算

降级让请求「成功返回」了，但用户拿到的是次一等的结果。如果 SLO 只统计可用率，一个把 30% 流量都降到 \`level=4\` 的系统仍然显示 99.99% 可用——**这是最危险的一种绿灯**。所以 SLO 要拆成两个口径：可用性（请求是否返回）与完整性（是否拿到未降级的结果），后者单独设目标，例如「非降级响应占比 ≥ 98%」。错误预算的消耗也按后者算：每出现一次降级，就按 \`level\` 折算成一定比例的预算消耗，\`level=4\` 全额计、\`level=2\` 的陈旧缓存按半额计。

这样设计有个直接好处：它把「要不要继续降级」从技术判断变成有额度的运营决策。预算快耗尽时，正确动作是修依赖或扩容，而不是把降级阈值调得更宽松。反过来，若发现降级率长期为零，也值得查一下是不是熔断器根本没打开过、或者 \`degraded\` 字段压根没被埋点——**一个从不报警的降级系统，通常不是太健康，而是没接好**。

还有一条文案边界：兜底响应不能承诺系统做不到的事。「已为你保留问题，稍后可继续」的前提是真的把问题落了盘；如果只回一句「稍后自动重试」而后台没有任何重试队列，那就是在用礼貌的话术制造一次新的失信。L86 的输出护栏在这里同样适用：**不确定能否兑现，就不要写成确定会发生**。

### 与相邻课的分工

- **L92**：有界并发与 \`L = λ × W\`，本课直接复用其结论（不重推公式），补的是「怎么把 W 压回去」。
- **L123**：状态外置与租约，本课「拿不到租约不排队」与「拿不到结果不排队」是同一条原则。
- **L90**：语义缓存，本课的 \`isAdmissible\` 复用其不可缓存清单，陈旧数据也要走业务闸。
- **L86 / L72**：输出护栏与仪表盘，本课的 \`degraded\` 字段是它们的输入。
- **L127**：部署实战，本课四层防线是那个服务必须带上的中间件。

**一句话收束**：故障收口的目标不是「每次都成功」，是**失败得够快、够明显、且不把别人一起拖下水**。
`,
    null,
    [
      {
        text: '3% 的工具超时让全站排队，监控却没看到错误率飙升，原因是？',
        options: ['模型答错了', '慢请求占住资源且诱发重试，请求不是失败而是在排队', '缓存击穿', '磁盘满了'],
        answer: 1,
        explain: 'L = λ × W，W 暴涨让在途数超过队列上限，体征是慢不是错。',
        concept: 'degradation',
      },
      {
        text: '熔断器里为什么要把「慢调用」也算进失败率？',
        options: [
          '为了统计好看',
          '只统计失败会在慢请求堆满队列时一直显示健康',
          '慢调用一定失败',
          '为了减少日志',
        ],
        answer: 1,
        explain: '慢在失败之前就已经占住资源，必须提前打开熔断。',
        concept: 'degradation',
      },
      {
        text: '「优雅降级」与「静默失败」的分界是？',
        options: ['响应更短', '降级在文本与结构化字段里都可被识别', '不抛异常', '用了缓存'],
        answer: 1,
        explain: '缺 degraded 标记时，用户会拿到流畅却没查过数据的回答。',
        concept: 'degradation',
      },
    ],
    [
      ['超时预算', '整轮共享的递减 deadline，每次调用按剩余时间截断'],
      ['熔断器', '按失败率与慢调用率打开，冷却后半开只放一个探测'],
      ['降级阶梯', '缓存 → 简化回答 → 明确告知，每级本轮生效、可回退、可标记'],
    ],
    [
      '对参数错误/权限不足这类不可重试错误也重试，是用资源给确定的失败买单。',
      '工具失败时让模型「根据已有信息回答」，会编出流畅但没有依据的内容。',
    ],
  ),
  'scenario',
)
