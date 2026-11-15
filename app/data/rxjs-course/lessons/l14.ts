import { L, withKind } from '../../course-builders.ts'

export const L14 = withKind(
  L(
    'L14',
    3,
    '恢复与重试：catchError / retry / retryWhen',
    3,
    ['L13'],
    ['c-retry'],
    [
      '实现 catchError 兜底与 retry 有界重试并跑通',
      '写出一个按计划退避的重试链',
      '搭好断言验证重试次数上限与兜底值只发射一次',
      '产出一份「哪些错误不该重试」的判定表',
    ],
    `
### 一次事故：一次故障被重试放大成一次雪崩

支付回调接口短暂不可用，链上挂了一句 \`retry()\`，本意是「网络抖动多试几次」。结果这个不带次数限制的重试在所有实例上同时循环，几秒内把下游 QPS 抬到平时的十几倍，恢复时间反而从几十秒拖到十几分钟。事后还发现两处次级问题：一是 4xx 的参数错误也被一并重试，永远不可能成功却占满队列；二是 \`catchError(() => EMPTY)\` 让流「正常完成」，监控里连一次失败都看不到。这节课把恢复拆成三件必须分别配置的事：**重试几次、哪些错误值得重试、失败后交付什么**，并给出一条能在断言里跑通的有界重试模型。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`retry\` 与 \`catchError\` 分工是什么 | \`retry\` 重新订阅原源；\`catchError\` 换一条替代源继续，二者不等价 |
| 重试必须有上限吗 | 必须；无上限重试会把局部故障放大成全局压力 |
| 哪些错误不该重试 | 参数错误、鉴权失败、业务拒绝等确定性失败，重试只会浪费容量 |
| 7.8.2 的退避怎么写 | \`retry({ count, delay })\`；\`retryWhen\` 在 7.x 已弃用，只作历史对照 |

### 恢复机制对照表

| 机制 | 触发条件 | 原流状态 | 下游收到 | 主要风险 |
|---|---|---|---|---|
| \`retry(n)\` | 遇到 error，且次数未用尽 | 重新订阅（冷源会重新执行工厂） | 新一次尝试的值 | 无退避时形成同步风暴 |
| \`retry({ count, delay })\` | 同上，按 delay 等待 | 重新订阅 | 新一次尝试的值 | delay 写成固定值时多实例仍会齐步 |
| \`catchError(fn)\` | 遇到 error | 已终结，不可续 | 替代源的值 | 返回 EMPTY 会把失败伪装成成功 |
| \`retryWhen\` | 同上 | 重新订阅 | 新一次尝试的值 | 7.x 已弃用，新代码不要引入 |
| 不处理 | 遇到 error | 终结 | 一次 error 通知 | 需要显式降级时才可接受 |

表里「原流状态」这一列解释了为什么 \`defer\` 在重试链路里是硬要求（L01、L02）：\`retry\` 做的事只是「再订阅一次」，如果源是模块顶层 \`from(fetch(...))\` 固化出来的已完成结果，再订阅一百次也只是重复读同一个失败快照，重试完全空转。要真正重发请求，工厂必须活在订阅期。

\`\`\`ts title="有界重试与语义清晰的兜底" note="retry 只重订阅原源；catchError 换替代源。retryWhen 在 7.8.2 已弃用，不在正文代码里使用。"
import { of, from, defer, timer, throwError, EMPTY } from "rxjs"
import { retry, catchError, mergeMap, tap, finalize } from "rxjs/operators"

type Reply = { ok: boolean; degraded: boolean; attempt: number }

let attempts = 0
const callApi = () =>
  defer(() => {
    attempts += 1
    if (attempts < 3) return throwError(() => new Error("temporarily down"))
    return of<Reply>({ ok: true, degraded: false, attempt: attempts })
  })

// ① 有界重试：最多 3 次，指数退避
const withRetry$ = callApi().pipe(
  retry({ count: 3, delay: (_err, n) => timer(100 * 2 ** n) }),
  finalize(() => console.log("attempts", attempts)),
)
withRetry$.subscribe((r) => console.log("ok", r.attempt))

// ② 确定性失败不重试：先分类，再决定要不要 retry
class ValidationError extends Error {}
const validate$ = throwError(() => new ValidationError("bad payload")).pipe(
  catchError((e) =>
    e instanceof ValidationError
      ? of<Reply>({ ok: false, degraded: true, attempt: 0 })
      : throwError(() => e),
  ),
)
validate$.subscribe(console.log)

// ③ 兜底要带语义，不要返回裸 EMPTY
const degraded$ = callApi().pipe(
  retry({ count: 2, delay: () => timer(50) }),
  catchError(() => of<Reply>({ ok: false, degraded: true, attempt: attempts })),
)
degraded$.subscribe((r) => console.log("degraded?", r.degraded))

// ④ 扁平化链里，兜底放在内层才能保住外层继续处理后续 id
const ids$ = of(1, 2, 3).pipe(
  mergeMap((id) =>
    callApi().pipe(
      retry({ count: 1, delay: () => timer(20) }),
      catchError(() => of<Reply>({ ok: false, degraded: true, attempt: id })),
    ),
    2,
  ),
)
ids$.pipe(tap((r) => console.log("row", r.attempt))).subscribe()

void EMPTY.pipe(finalize(() => {}))
\`\`\`

### 用最小模型把「有界、分类、兜底」变成可断言的事实

下面不依赖 RxJS 包，实现一个纯函数的重试运行器：记录尝试次数、按指数退避累计等待、对不可重试错误立即停止，最后验证兜底值只交付一次。

\`\`\`ts
import assert from "node:assert/strict"

type Failure = { kind: "transient" | "permanent"; message: string }

type RunResult = {
  ok: boolean
  attempts: number[]
  delays: number[]
  fallbackDelivered: number
  finalError: string | null
}

/** attempt(n) 返回成功值或失败；maxRetries 是「首次尝试之外的额外次数」。 */
function runWithRetry(
  attempt: (n: number) => Failure | null,
  maxRetries: number,
  baseDelay = 100,
): RunResult {
  const attempts: number[] = []
  const delays: number[] = []
  for (let n = 0; n <= maxRetries; n++) {
    attempts.push(n)
    const failure = attempt(n)
    if (failure === null) {
      return { ok: true, attempts, delays, fallbackDelivered: 0, finalError: null }
    }
    if (failure.kind === "permanent") {
      return {
        ok: false, attempts, delays, fallbackDelivered: 1, finalError: failure.message,
      }
    }
    if (n === maxRetries) break
    delays.push(baseDelay * 2 ** n)
  }
  return {
    ok: false, attempts, delays, fallbackDelivered: 1, finalError: "retry exhausted",
  }
}

// 前两次瞬时失败，第三次成功
const recovered = runWithRetry((n) => (n < 2 ? { kind: "transient", message: "down" } : null), 3)
assert.equal(recovered.ok, true)
assert.deepEqual(recovered.attempts, [0, 1, 2], "总尝试次数 = 1 + maxRetries 以内")
assert.deepEqual(recovered.delays, [100, 200], "指数退避，不重试就不产生等待")
assert.equal(recovered.fallbackDelivered, 0, "成功后不再交付兜底值")

// 一直失败：次数用尽，兜底值恰好一次
const exhausted = runWithRetry(() => ({ kind: "transient", message: "down" }), 3)
assert.equal(exhausted.ok, false)
assert.deepEqual(exhausted.attempts, [0, 1, 2, 3], "最多 4 次尝试，绝不无限循环")
assert.deepEqual(exhausted.delays, [100, 200, 400])
assert.equal(exhausted.fallbackDelivered, 1, "兜底只交付一次")

// 确定性失败：第一次就停，不产生任何退避
const invalid = runWithRetry(() => ({ kind: "permanent", message: "bad payload" }), 3)
assert.deepEqual(invalid.attempts, [0])
assert.deepEqual(invalid.delays, [])
assert.equal(invalid.finalError, "bad payload")

// 负例：把不可重试错误当成瞬时错误会白白放大流量
const wrong = runWithRetry(() => ({ kind: "transient", message: "bad payload" }), 3)
assert.equal(wrong.attempts.length, 4, "误分类 = 四倍无效请求")
assert.ok(invalid.attempts.length < wrong.attempts.length)
\`\`\`

最后这组负例把「错误分类」的价值量化了：同一个参数错误，分错类就是四倍无效请求。真实系统里还要乘上实例数与用户数，这正是开头那次雪崩的放大器。断言 \`fallbackDelivered === 1\` 则防住另一个常见问题：在 \`retry\` 与 \`catchError\` 之间又加一层兜底，导致降级值被交付两次，下游统计凭空多一条。

### 一次故障恢复的完整推演

以「前两次瞬时失败、第三次成功」、最多 3 次重试、指数退避为例：

| 轮次 | 尝试序号 | 结果 | 是否重试 | 等待 | 下游收到 |
|---|---|---|---|---|---|
| 1 | 0 | 瞬时失败 | 是 | 100ms | 无 |
| 2 | 1 | 瞬时失败 | 是 | 200ms | 无 |
| 3 | 2 | 成功 | 否 | 无 | 正常值 |
| 4 | — | 兜底未触发 | — | — | 无 |

把这张表与「失败到底」的版本对照，能看到两个必须显式配置的边界：一是**次数**，它决定第 4 轮是否存在；二是**退避**，它决定多实例会不会在同一毫秒齐步重试。固定 100ms 的 delay 在多实例部署下仍然会形成同步风暴，工程上通常还要加抖动，但那属于容量策略而非 RxJS 语义（L12、L25）。

### 恢复策略评审清单

| 评审项 | 要问的问题 | 不通过时的后果 |
|---|---|---|
| 次数上限 | 最多额外重试几次，依据是什么 | 无上限时局部故障被放大成全局压力 |
| 错误分类 | 哪些错误确定性失败、绝不重试 | 4xx 与参数错误反复重试，永远不成功 |
| 退避形态 | 是否指数退避、是否需要抖动 | 多实例齐步重试，下游刚恢复又被打挂 |
| 冷源前提 | 源是否包在 \`defer\` 里 | 重试只是重复读同一个失败快照 |
| 兜底语义 | 降级值是否带 \`degraded\` 标记 | 用 EMPTY 伪装成功，监控与 UI 都看不到降级 |
| 内层位置 | 扁平化链里兜底是否在内层 | 一个 id 失败让整批任务终结（L15） |
| 幂等性 | 重试副作用是否可重复执行 | 扣款、下单类操作被重复提交 |

最后一行是重试的硬前提：\`retry\` 会真的再执行一次源工厂，任何非幂等副作用都会被执行多次。搜索、查询类请求天然适合重试；提交、支付、发货类请求若没有幂等键，就应该把「重试」换成「查状态后决定」，而不是挂一个 \`retry(3)\` 了事。

:::deep

### \`retry\` 与 \`catchError\` 是两种完全不同的时间观

\`retry\` 认为「这次失败是暂时的，把时间倒回去再来一次」：原源被终结，但通过重新订阅产生一条新的尝试，因此成功的那一轮拿到的仍是正常值，业务上不需要知道失败发生过。\`catchError\` 认为「这条路走不通，换一条路继续」：原源已经终结且不可续（L13），下游收到的是替代源的值，因此必须显式携带「已降级」的信息，否则调用方会把兜底值当成正常结果。把两者混用最常见的错误是 \`catchError(() => source$)\` 想实现重试——它不会重新订阅原源，只会把已经终结的源再交出去一次，立刻又终结。反过来，\`retry\` 也无法提供降级值：次数用尽后它仍以 error 终结，需要 \`catchError\` 收尾。正确顺序是 **retry 在前、catchError 在后**：先给暂时性失败几次机会，再给永久性失败一个语义清晰的出口。

:::

:::warn

### 三个恢复踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| \`retry()\` 不带次数 | 故障期间无限循环，QPS 被放大 | 一律给 \`count\`，并配退避 |
| \`catchError(() => EMPTY)\` | 流正常完成，失败消失在监控里 | 返回带 \`degraded\` 标记的替代值 |
| 把 \`retryWhen\` 从旧资料直接搬进 7.8.2 | 弃用 API，升级时最先失效 | 用 \`retry({ count, delay })\`；\`timer\` 提供延迟源 |

第二条尤其值得强调：\`EMPTY\` 会立即 \`complete\`（L13），于是所有依赖 \`complete\` 的下游都以为「一切顺利」。监控看不到失败、UI 不显示降级、告警不触发，等用户发现数据不对时已经过去很久。降级不是把失败藏起来，而是把它变成一条带语义的、可观测的正常值。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 有界 | 最多 \`1 + maxRetries\` 次尝试，断言固定 |
| 退避 | 等待序列为 100 / 200 / 400ms，成功路径不产生多余等待 |
| 分类 | 确定性失败只尝试一次、零退避 |
| 兜底 | 降级值恰好交付一次，且带可识别标记 |
| 冷源前提 | 源包在 \`defer\` 内，每次重试都重新执行工厂 |
| 幂等 | 非幂等副作用不挂重试，或具备幂等键 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L13 终结语义 | error 不可逆、原流终结后不可续 | 本课基于它解释「恢复必须换源或重订阅」 |
| L15 错误传播 | 错误沿链向下、catchError 位置决定范围 | 本课只设计恢复策略，不画传播路径 |
| L01 / L02 | \`defer\` 与冷源重算能力 | 本课把它作为重试成立的前提，不重复冷热定义 |
| L16 空流兜底 | \`defaultIfEmpty\` / \`throwIfEmpty\` | 本课处理「有错误」，不处理「无值」 |
| L12 / L25 | 并发上限与背压容量 | 本课只提退避与抖动属于容量策略，不实现 |
`,
    'rxRetry',
    [
      {
        text: 'retry(2) 的含义是？',
        options: ['总共执行 1 次', '首次失败后再重试 2 次（最多 3 次执行）', '重试 2 个不同流', '无限重试'],
        answer: 1,
        explain: 'retry(n) 表示允许 n 次重试（加上首次共 n+1 次尝试），仍失败才向上抛 error。',
        concept: 'c-retry',
      },
      {
        text: '想做「指数退避 + 可取消」的重试，最合适的是？',
        options: ['retry(3)', 'retryWhen（把重试决策做成可观察逻辑）', 'catchError', 'map'],
        answer: 1,
        explain:
          'retryWhen 把错误流交给你自由组合，可加 delay、可加退避、可加超时熔断，比固定 retry 灵活得多。',
        concept: 'c-retry',
      },
      {
        text: '对「非幂等写操作」（如下单扣款）直接套 retry，最可能的风险是？',
        options: [
          '更可靠',
          '请求失败后重试，可能造成重复写入 / 重复扣款，需配合幂等键',
          '自动去重',
          '不会重试',
        ],
        answer: 1,
        explain:
          'retry 不区分幂等与否，失败即重新订阅上游。对写操作要配幂等键或去重，否则重试会放大业务故障。这是「能重试」与「不该盲目重试」的边界。',
        concept: 'c-retry',
      },
    ],
    [
      ['catchError', '捕获一次错误并决定恢复方式（终结原流）'],
      ['retryWhen', '把「是否/何时重试」交给一段可观察逻辑'],
    ],
    [
      '用 catchError 实现「重试」（它只接一次且终结原流，应使用 retry/retryWhen）。',
      '无退避地无限重试，造成重试风暴与下游过载。',
    ],
  ),
  'practice',
)
