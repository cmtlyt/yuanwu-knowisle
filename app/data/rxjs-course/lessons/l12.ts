import { L, withKind } from '../../course-builders.ts'

export const L12 = withKind(
  L(
    'L12',
    2,
    '并发限制与竞争：mergeMap 并发度 / race / startWith',
    3,
    ['L11'],
    ['c-concurrency-limit'],
    [
      '实现 mergeMap 的并发度上限并跑通一批任务',
      '写出 race / startWith 的最小用例说明竞争与占位',
      '搭好断言验证峰值并发不超过设定值',
      '产出一份并发度配置评审清单',
    ],
    `
### 一次事故：一次输入爆发，五百个请求同时打向下游

列表页把「可见的卡片」映射成详情请求，用了不带第二参数的 \`mergeMap\`。平时一屏十张卡片，一切正常；某天用户把筛选条件一次清空，外流在几十毫秒内吐出五百个 ID，五百条请求同时发出，网关先限流、再超时，前端重试又把量翻了一倍，最后整条链路雪崩。复盘时争论过「是不是该换 \`concatMap\`」，但那样五百个请求要串行跑完，用户盯着空白屏等几十秒。真正缺的是一个**旋钮**：允许并发以保吞吐，同时把同时活跃的内流数钉在一个下游能承受的上限内。这节课把这个旋钮、以及 \`race\` 与 \`startWith\` 这两个常被混用的时序工具，写成一套可以逐项验收的实现。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`mergeMap\` 的并发上限怎么给 | 第二参数：\`mergeMap(project, 4)\`，超出部分排队等空位 |
| 上限设了之后还保序吗 | 不保序；只保证「同时活跃数 ≤ N」，交付顺序仍按完成时刻 |
| \`race\` 做了什么 | 多个源竞争，只保留最先发射的那一条，其余全部取消订阅 |
| \`startWith\` 做了什么 | 在源的第一个值之前插入一个同步占位值，不改变源本身 |
| 本课不回答什么 | 重放与共享（L19 / L20）、背压落地的批量整形（L25） |

### 并发度与两个时序工具对照表

| 工具 | 作用对象 | 是否取消其他流 | 是否额外发射值 | 典型用途 |
|---|---|---|---|---|
| \`mergeMap(project, N)\` | 同一外流派生出的内流 | 否，超出的排队 | 否 | 限制并发、保护下游 |
| \`race(a$, b$, c$)\` | 若干独立源 | 是，输家被取消 | 否 | 超时竞速、多通道择优 |
| \`startWith(v)\` | 单条流 | 否 | 是，插入一个值 | 立即给 loading / 初始值 |
| \`concatMap\` | 派生内流 | 否，全部排队 | 否 | 严格保序（L09） |

表里最容易混淆的一列是「输家被取消」：\`race\` 与 \`switchMap\` 一样只是取消订阅，不会撤销输家已发出的请求或已登记的副作用（L10）。因此「用 race 实现超时」时，超时分支赢了不代表慢请求被中止，只代表它的结果不再被交付——若慢请求会写库，仍需要服务端幂等或 AbortController 配合。

\`\`\`ts title="有界并发与两个时序工具" note="mergeMap 第二参数即并发上限；race 只交付赢家；startWith 在订阅当帧给占位值。"
import { of, from, defer, timer, race, EMPTY } from "rxjs"
import { mergeMap, map, startWith, take, tap, toArray } from "rxjs/operators"

type Detail = { id: number; ok: boolean }

const fetchDetail = (id: number): Promise<Detail> =>
  Promise.resolve({ id, ok: true })

const ids = Array.from({ length: 12 }, (_, i) => i + 1)

// 有界并发：同时最多 4 条内流，其余排队等空位
const bounded$ = of(...ids).pipe(
  mergeMap((id) => defer(() => from(fetchDetail(id))), 4),
  toArray(),
)
bounded$.subscribe((all) => console.log("loaded", all.length))

// 占位值：订阅当帧先给 loading，再给真实结果
const withLoading$ = of(...ids).pipe(
  mergeMap((id) => from(fetchDetail(id)), 2),
  startWith({ id: -1, ok: false }),
  take(4),
)
withLoading$.subscribe((d) => console.log("row", d.id, d.ok))

// 竞速：慢源与快源只保留快源；输家被取消订阅
const slow$ = timer(300).pipe(map(() => "slow"))
const fast$ = timer(50).pipe(map(() => "fast"))
race(slow$, fast$).subscribe((winner) => console.log("winner", winner))

// 超时占位：把「超时」也建模成一条源，而不是在回调里比时间戳
const withTimeout$ = (id: number) =>
  race(
    defer(() => from(fetchDetail(id))),
    timer(1000).pipe(map(() => ({ id, ok: false }))),
  )
withTimeout$(7).subscribe(console.log)

void EMPTY.pipe(tap(), toArray())
\`\`\`

### 用最小模型把「峰值并发」变成可断言的事实

下面不依赖 RxJS 包，实现一个离散事件的有界并发调度器，断言峰值不超过上限、所有任务都完成、上限变化会改变总耗时、并发度为 0 时报错；再补 \`race\` 与 \`startWith\` 的最小模型与负例断言。

\`\`\`ts
import assert from "node:assert/strict"

type Job = { id: number; ms: number }
type Active = { id: number; until: number }

/** 有界并发：active 队列长度恒不超过 limit，完成一个补一个。 */
function runBounded(jobs: Job[], limit: number) {
  if (limit < 1) throw new Error("并发度必须 >= 1")
  const pending = [...jobs]
  const active: Active[] = []
  const completed: number[] = []
  const peaks: number[] = []
  let clock = 0
  while (pending.length > 0 || active.length > 0) {
    while (active.length < limit && pending.length > 0) {
      const j = pending.shift()!
      active.push({ id: j.id, until: clock + j.ms })
    }
    peaks.push(active.length)
    if (active.length === 0) break
    const next = Math.min(...active.map((a) => a.until))
    clock = next
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].until === next) {
        completed.push(active[i].id)
        active.splice(i, 1)
      }
    }
  }
  return { peak: Math.max(...peaks), completed, clock }
}

const jobs: Job[] = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, ms: 100 }))

const r2 = runBounded(jobs, 2)
assert.equal(r2.peak, 2, "峰值并发必须恰为上限")
assert.equal(r2.completed.length, 6, "一个任务都不能丢")
assert.deepEqual([...r2.completed].sort(), [1, 2, 3, 4, 5, 6])
assert.equal(r2.clock, 300, "6 个 100ms 任务 / 并发 2 = 3 轮")

const r1 = runBounded(jobs, 1)
assert.equal(r1.peak, 1)
assert.equal(r1.clock, 600, "并发 1 退化为串行")
const r6 = runBounded(jobs, 6)
assert.equal(r6.peak, 6)
assert.equal(r6.clock, 100, "并发足够时约等于最慢任务")
assert.throws(() => runBounded(jobs, 0), /并发度必须/, "并发度 0 会让队列永不推进")

// startWith：在第一个真实值之前插入占位
function withInitial<T>(values: T[], initial: T): T[] {
  return [initial, ...values]
}
assert.deepEqual(withInitial([1, 2], 0), [0, 1, 2], "占位值必须排在最前")

// race：只交付最快者，其余被取消，但已登记的副作用不撤销
const channels = [
  { id: "slow", ms: 300 },
  { id: "fast", ms: 50 },
  { id: "mid", ms: 120 },
]
const sideEffects: string[] = []
for (const c of channels) sideEffects.push("start " + c.id)
const winner = channels.reduce((a, b) => (b.ms < a.ms ? b : a))
const cancelled = channels.filter((c) => c.id !== winner.id).map((c) => c.id)
assert.equal(winner.id, "fast")
assert.deepEqual(cancelled, ["slow", "mid"], "输家被取消订阅")
assert.equal(sideEffects.length, 3, "取消不等于撤销已发出的副作用")
\`\`\`

\`runBounded\` 里「完成一个补一个」的结构是关键：如果每轮都从 \`jobs\` 重新取一批而不持久化 \`pending\`，游标就会重置，第一批任务被反复执行——这正是 00089 记录过的 cursor 重置类错误。断言 \`completed.length === 6\` 且排序后恰好是 1..6，能同时抓出丢值、重复与不推进三种实现错误。

### 一次并发爆发的完整推演

以 6 个各耗时 100ms 的任务、上限 2 为例：

| 轮次 | 时钟 | 本轮新启动 | 活跃内流 | 本轮完成 | 累计交付 |
|---|---|---|---|---|---|
| 1 | 0 | 1、2 | 2 | 无 | 0 |
| 2 | 100 | 3、4 | 2 | 1、2 | 2 |
| 3 | 200 | 5、6 | 2 | 3、4 | 4 |
| 4 | 300 | 无 | 0 | 5、6 | 6 |

把这张表与「无上限」的情形对照：后者第 1 轮就会启动 6 条内流，峰值 6、时钟 100ms 完成，看起来更快，但下游瞬时承压六倍。上限的价值不是让单次更快，而是把峰值变成**可配置的常数**，从而可以用下游容量反推：\`并发上限 ≈ 下游可承受 QPS × 平均响应时间\`。这个公式把「拍脑袋设 4」变成了有依据的容量决策，也是 L25 背压落地的起点。

### 并发度评审清单

| 评审项 | 要问的问题 | 不通过时的后果 |
|---|---|---|
| 上限来源 | 是否由下游容量与平均耗时推出 | 拍脑袋的数字在流量翻倍时失效 |
| 峰值可观测 | 有没有断言或指标记录同时活跃数 | 上限被后续改动悄悄抹掉无人发现 |
| 不丢值 | 排队任务是否全部完成 | 超限输入被静默丢弃（与 exhaustMap 混淆） |
| 不重复 | 完成后补位时游标是否持久化 | cursor 重置导致同一批任务重复执行 |
| 输家副作用 | race 的输家是否允许保留已发请求 | 超时竞速后服务端仍写入，前端以为没发生 |
| 占位语义 | startWith 的值是否会被下游当成真实数据 | loading 占位被写进业务状态或统计口径 |

最后两行把「工具正确性」与「业务语义」连起来了：\`startWith\` 插入的占位值会真的走一遍下游所有算子，若下游直接把它写进报表，就会多出一条 id 为 -1 的记录；\`race\` 取消订阅更不会回滚副作用。凡是引入这两个工具，都应同时给出「占位值如何被识别」与「输家副作用如何兜底」的答案。

:::deep

### 并发度是背压的第一道闸，但不是唯一一道

\`mergeMap(project, N)\` 限制的是**同时活跃的内流数**，它把「瞬时压力」压平，却不管「总量」：外流持续吐出一万个 ID，队列仍会累积一万个待执行任务，内存与等待时间照样上涨。这是限流（rate limit）与背压（backpressure）的分界——前者控制同时在跑的数量，后者要根据下游消费能力决定「要不要让上游慢下来、要不要分批、要不要丢弃」。L25 会用 \`bufferTime\` 把高速输入整形成批量落地，本质上是在这一层之外再补一道容量闸。理解这个分层很重要：把「设了并发上限」当成「背压解决了」，就会在长流场景里看到队列无限增长却找不到原因。反过来，如果只做批量整形而不限并发，一批之内仍可能同时发出几百个请求。两道闸各管一段，缺一不可。

:::

:::warn

### 三个并发与竞速踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| \`mergeMap(project)\` 不传并发上限 | 输入爆发时并发数等于外值个数，网关限流、重试放大 | 显式传上限，并由下游容量推导数值 |
| 以为 \`race\` 超时会中止慢请求 | 超时分支赢了，慢请求仍在服务端完成并写库 | 服务端做幂等，或配合 AbortController 真正中止 |
| 把 \`startWith\` 的占位值当真实数据消费 | 报表多一条哨兵记录、loading 被计入成功率 | 用可识别的哨兵类型，下游先过滤再统计 |

第二个坑在「超时」场景里几乎必然出现：\`race\` 只是订阅层的胜者判定，它无法触及已经离开进程的网络包。正确的心智模型是「**竞速决定谁的结果被采信，不决定谁的请求发生**」，与 L10 里 \`switchMap\` 的取消语义完全一致。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 峰值恒定 | 上限 2 时峰值恰为 2，上限 1 / 6 时分别为 1 / 6 |
| 不丢不重 | 6 个任务全部完成，排序后恰好为 1..6 |
| 耗时关系 | 并发 1 / 2 / 6 的总时钟分别为 600 / 300 / 100ms |
| 非法参数 | 并发度 0 会显式报错，不静默挂起 |
| 工具边界 | race 输家被取消但副作用保留；startWith 占位排在最前 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L09 排队与并发 | \`concatMap\` / \`mergeMap\` 的时序与耗时对照 | 本课给 mergeMap 补上第二参数，不重推无上限情形 |
| L10 取消与忽略 | \`switchMap\` / \`exhaustMap\` 与副作用不可撤销 | 本课把同一结论应用到 race 的输家 |
| L11 决策树 | 三问顺序与四类场景选型 | 本课实现「独立拉取」场景要求的并发上限 |
| L19 / L20 共享 | \`share\` / \`refCount\` 与重放边界 | 本课不处理多订阅者共享一条源 |
| L25 背压落地 | \`bufferTime\` 批量整形与容量控制 | 本课只做第一道闸，明确不解决总量累积 |
`,
    'rxCross',
    [
      {
        text: '10 个请求最多同时跑 2 个，最合适？',
        options: ['concatMap', 'mergeMap(fn, 2)', 'switchMap', 'exhaustMap'],
        answer: 1,
        explain: 'mergeMap 第二参限制并发数；2 表示至多 2 个在途、其余排队，兼顾速度与限流。',
        concept: 'c-concurrency-limit',
      },
      {
        text: 'race(a$, b$) 中 a$ 先发射时结果是？',
        options: ['两个都按序发', '只发 a$ 的值并取消 b$', '只发 b$', '报错'],
        answer: 1,
        explain: 'race 取「先到者」：任一源先 next 就发出该值并终止其余源，常用于竞速/取消。',
        concept: 'c-concurrency-limit',
      },
      {
        text: '「UI 首帧先展示加载态，真实数据到位后再替换」最简洁的写法是？',
        options: ['startWith(loading)', 'buffer', 'take(1)', 'skip(1)'],
        answer: 0,
        explain:
          'startWith 先立即发射初始态再跟随源值，是首屏占位的惯用法；配合 shareReplay 还能让晚到订阅者补初始态。',
        concept: 'c-concurrency-limit',
      },
    ],
    [
      ['并发上限', 'mergeMap 第二参控制在途请求最大数量'],
      ['race', '任一源先发射即胜出、其余忽略'],
    ],
    [
      '高频事件用无界 mergeMap，下游被请求打爆（应用 mergeMap(fn, N)）。',
      '期待 race 会发射所有源（它只取先到者并丢弃其余）。',
    ],
  ),
  'practice',
)
