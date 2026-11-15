import { L, withKind } from '../../course-builders.ts'

export const L25 = withKind(
  L(
    'L25',
    5,
    '背压与落地：buffer 整形与框架接入',
    3,
    ['L23', 'L24'],
    ['c-backpressure'],
    [
      '实现基于 buffer 整形的批量落地链路并跑通',
      '写出一个生产者快于消费者时的有界缓冲',
      '搭好断言验证批次不丢值、不重复、不越界',
      '产出一份框架接入与清理清单',
    ],
    `
### 一次事故：上游每秒两千条，落地页三分钟后卡死

行情推送接入后，写入模块先把一批值收进 \`toArray()\` 再统一落库。开发环境的模拟源只有几十条，一切正常；生产环境源是永不终结的热流，\`toArray()\` 永远等不到 \`complete\`，数组一路增长，三分钟后标签页内存爆掉。改成 \`bufferTime\` 分批之后内存稳了，但下游写入比生产慢，排队批次还是越积越多，最后又回到同一个问题。复盘结论很直接：**「限并发」和「限总量」是两道不同的闸**（L12 只做了第一道）。这节课把高速输入整形成有界批量落地，并让队列在超过容量时给出可观测的背压信号。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 为什么 \`toArray()\` 不能用在热流上 | 它只在 \`complete\` 时发射，热流不终结就永不返回、且持续缓存（L07） |
| 第一道闸是什么 | \`mergeMap(project, N)\` 限制同时在跑的内流数 |
| 第二道闸是什么 | \`bufferTime\` / \`buffer\` 把总量切成有界批次，并对积压设上限 |
| 背压信号应该长什么样 | 队列超限时显式拒绝或降采样，且这个事件要能被断言与监控 |

### 背压手段对照表

| 手段 | 限制对象 | 是否降低总量 | 适用 | 风险 |
|---|---|---|---|---|
| \`mergeMap(project, N)\` | 同时活跃的内流数 | 否，队列仍会累积 | 保护下游瞬时并发 | 只做它，长流队列无限增长 |
| \`bufferTime(ms)\` | 每个时间窗的批量大小 | 是（按时间切分） | 高速事件批量落库 | 窗口内峰值仍需上限 |
| \`buffer(closing$)\` | 按信号切批 | 是 | 业务事件驱动的分批 | 信号不来则当前批无限增长 |
| \`take(n)\` / 超时 | 流的长度 | 是 | 一次性抽取 | 丢值，需业务允许 |
| \`scan\` | 不缓存全部值 | 是（增量） | 累计指标、状态机 | 不适合需要原值的落地 |
| 有界队列 + 拒绝 | 待处理积压 | 是 | 生产快于消费 | 必须定义拒绝后的补偿 |

最后一行是这节课的重点：前五种都是「怎么处理值」，只有有界队列回答了「处理不过来时怎么办」。没有这个答案，任何整形手段最终都会在某处把积压重新堆起来。

\`\`\`ts title="高速流的批量落地" note="bufferTime 按时间切批，mergeMap 第二参数限制并发写入；两者各管一段。"
import { interval, from, defer, of, Subject } from "rxjs"
import {
  bufferTime,
  buffer,
  mergeMap,
  take,
  scan,
  finalize,
  toArray,
} from "rxjs/operators"

type Batch = { ids: number[]; landed: boolean }
const writeBatch = (ids: number[]): Promise<Batch> =>
  Promise.resolve({ ids, landed: true })

// ① 时间窗切批 + 有界并发写入
const source$ = interval(10).pipe(take(20))
const landed$ = source$.pipe(
  bufferTime(100),
  mergeMap((ids) => defer(() => from(writeBatch(ids))), 2),
  finalize(() => console.log("landing stopped")),
)
landed$.subscribe((b) => console.log("landed", b.ids.length))

// ② 按业务信号切批
const closing$ = new Subject<void>()
const bySignal$ = source$.pipe(buffer(closing$), take(2))
bySignal$.subscribe((ids) => console.log("signal batch", ids.length))
closing$.next()
closing$.next()
closing$.complete()

// ③ 增量指标用 scan，不物化全部值
const totals$ = source$.pipe(scan((acc, n) => acc + n, 0))
totals$.subscribe(console.log)

// ④ 有限流才可以用 toArray，且必须有明确上界
const finite$ = of(1, 2, 3).pipe(toArray())
finite$.subscribe((all) => console.log("finite", all.length))
\`\`\`

### 用最小模型把「不丢、不重、不越界」变成可断言的事实

下面不依赖 RxJS 包，先实现一个按窗口切批的落地器，再实现一个有界队列：队列超限时返回拒绝信号，最后断言所有被接受的值都按原顺序落地、积压从未超过容量。

\`\`\`ts
import assert from "node:assert/strict"

/** 按窗口切批；返回批次与展平结果，便于验证不丢不重。 */
function batchLand(producer: number[], windowSize: number, capacity: number) {
  const batches: number[][] = []
  let current: number[] = []
  for (const v of producer) {
    current.push(v)
    if (current.length === windowSize) { batches.push(current); current = [] }
  }
  if (current.length > 0) batches.push(current)
  return {
    batches,
    flat: batches.flat(),
    overflow: batches.some((b) => b.length > capacity),
  }
}

const producer = Array.from({ length: 10 }, (_, i) => i + 1)
const r = batchLand(producer, 3, 3)
assert.deepEqual(r.batches, [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]])
assert.deepEqual(r.flat, producer, "所有批次展平后必须与原序列逐项相同")
assert.equal(r.overflow, false, "每批不得超过容量")

// 负例一：不切批（toArray 式单批）会越过容量
const unbounded = batchLand(producer, Number.POSITIVE_INFINITY, 3)
assert.equal(unbounded.batches.length, 1)
assert.equal(unbounded.overflow, true, "热流上单批缓存必然越界")

// 负例二：切批时 cursor 每批重置会重复生产
function buggyBatch(values: number[], windowSize: number): number[][] {
  const out: number[][] = []
  let cursor = 0
  while (cursor < Math.ceil(values.length / windowSize)) {
    out.push(values.slice(0, windowSize)) // 忘了用 cursor，永远取第一批
    cursor += 1
  }
  return out
}
assert.notDeepEqual(buggyBatch(producer, 3).flat(), producer, "cursor 重置能被展平断言抓到")

/** 有界队列：生产快于消费时显式拒绝，避免无限积压。 */
class BoundedLanding {
  private pending: number[] = []
  private landed: number[] = []
  maxPending = 0
  constructor(private readonly capacity: number, private readonly perTick: number) {}
  produce(values: number[]): boolean {
    if (this.pending.length + values.length > this.capacity) return false
    this.pending.push(...values)
    this.maxPending = Math.max(this.maxPending, this.pending.length)
    return true
  }
  tick(): void {
    this.landed.push(...this.pending.splice(0, this.perTick))
  }
  get done(): boolean { return this.pending.length === 0 }
  get result(): number[] { return this.landed }
}

const land = new BoundedLanding(8, 3)
const accepted: number[] = []
let rejects = 0
for (let i = 0; i < 5; i++) {
  const batch = [i * 3 + 1, i * 3 + 2, i * 3 + 3]
  if (land.produce(batch)) accepted.push(...batch)
  else rejects += 1
  if (i % 2 === 1) land.tick() // 每两轮才消费一批，模拟慢消费者
}
while (!land.done) land.tick()

assert.equal(rejects, 1, "队列超限时必须给出一次可观测的背压信号")
assert.ok(land.maxPending <= 8, "积压从未超过容量")
assert.deepEqual(land.result, accepted, "被接受的值按原顺序全部落地，不丢不重")

// 负例：无界队列从不拒绝，积压单调增长
const unlimited = new BoundedLanding(Number.POSITIVE_INFINITY, 1)
for (let i = 0; i < 20; i++) unlimited.produce([i])
assert.equal(unlimited.maxPending, 20, "没有上限就没有背压，只有内存曲线")
assert.ok(unlimited.maxPending > land.maxPending)
\`\`\`

\`buggyBatch\` 这个负例是 00089 记录过的 cursor 重置类错误在批量落地里的翻版：光看「分了几批」完全正常，一展平就露馅。把它和 \`r.flat\` 的断言放在一起，就把「切批」这件看似简单的操作变成了可回归的资产。

### 一次批量落地的完整推演

以生产者每轮给 3 个值、消费者每两轮处理 3 个、队列容量 8 为例：

| 轮次 | 生产 | 消费前积压 | 是否接受 | 本轮消费 | 消费后积压 |
|---|---|---|---|---|---|
| 0 | 1–3 | 0 | 接受 | 无 | 3 |
| 1 | 4–6 | 3 | 接受 | 3 个 | 3 |
| 2 | 7–9 | 3 | 接受 | 无 | 6 |
| 3 | 10–12 | 6 | **拒绝**（6+3>8） | 3 个 | 3 |
| 4 | 13–15 | 3 | 接受 | 无 | 6 |
| 收尾 | — | 6 | — | 分两轮处理完 | 0 |

第 3 行的「拒绝」不是故障，而是系统把「处理不过来」变成了一个可计数、可告警的事件。没有它，积压会从 9 继续涨到 12、15……直到内存或延迟先崩。业务上要接着回答的是「被拒绝的这批怎么办」：重试、降采样、还是落盘后补处理——这是产品决策，不是算子能替你决定的。

### 落地链路评审清单

| 评审项 | 要问的问题 | 不通过时的后果 |
|---|---|---|
| 终结性 | 源会不会 complete | 对热流用 \`toArray\` 会永不返回 |
| 批大小 | 每个窗口最多多少值 | 窗口内峰值压垮下游 |
| 并发上限 | 同时几个写入在跑 | 瞬时打爆数据库连接池（L12） |
| 队列容量 | 待处理积压上限是多少 | 积压单调增长，延迟失控 |
| 拒绝补偿 | 被拒绝的批次去哪了 | 静默丢数据，报表对不上 |
| 展平不变量 | 所有批次展平是否等于输入 | 丢值 / 重复 / 跨批错位无人发现 |
| 清理 | 卸载时是否取消源与定时器 | 路由切走后写入仍在进行（L21） |

:::deep

### 两道闸各管一段，缺一不可

L12 的 \`mergeMap(project, N)\` 限制的是**同时在跑的数量**，它把瞬时压力压平，却完全不管队列总长：外流持续吐一万个 ID，仍会有一万个任务在排队。本课的 \`bufferTime\` / 有界队列限制的是**待处理总量**，它把「无限累积」变成「有界 + 拒绝信号」，却不管同一时刻发几个写入请求。只装第一道闸，长流队列无限增长；只装第二道闸，一批之内仍可能同时发出几百个请求。因此真实链路几乎总是两者叠加：\`bufferTime\` 切批 → \`mergeMap(project, N)\` 限并发 → 有界队列兜住积压。再往外看，背压的完整形态还包括「让上游慢下来」或「丢弃低优先级数据」，那已经超出 RxJS 算子的范围，属于系统容量设计；但无论选哪种，前提都是先把积压变成**可观测的数字**，而不是让它藏在数组长度里。

:::

:::warn

### 三个背压落地踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 对永不终结的热流用 \`toArray()\` | 永不发射、内存持续增长 | 改 \`bufferTime\` / \`scan\`，或先 \`take\` 给出明确上界 |
| 只设并发上限不设队列上限 | 瞬时 QPS 稳了，但待处理任务越积越多 | 加有界队列与拒绝信号，并监控积压长度 |
| 拒绝后没有补偿 | 静默丢批次，报表少数据且无日志 | 明确重试 / 降采样 / 落盘补处理，并留下可查询记录 |

第三条是最容易在压测里被忽略的：拒绝信号本身是好事，但如果没有配套的补偿，它只是把「内存爆掉」换成「数据悄悄少了」。凡是引入背压，都要同时回答「被拒的那批值最终去哪了」，否则正确性比可用性先出问题。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 展平不变量 | 所有批次展平后与原序列逐项相同 |
| 批大小 | 每批不超过 \`capacity\`，负例能抓到越界 |
| cursor 持久化 | 重复生产的错误实现被展平断言抓到 |
| 背压信号 | 队列超限时恰好产生可计数的拒绝 |
| 积压有界 | \`maxPending <= capacity\`，无界队列作为负例对照 |
| 两道闸 | 同时配置切批与并发上限，不偏废 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L07 归约与收集 | \`toArray\` / \`reduce\` 的空流与终结语义 | 本课处理「永不终结且值很多」的相反情形 |
| L12 有界并发 | \`mergeMap\` 第二参数与峰值并发 | 本课补上第二道闸：总量与积压 |
| L23 时间算子 | 防抖 / 节流 / 采样的窗口语义 | 本课把 \`bufferTime\` 当作容量工具而非削峰 |
| L24 组合多源 | 多路输入的触发权与配对 | 本课只处理单路高速输入 |
| L21 泄漏排查 | 订阅未回收与无界缓冲探针 | 本课给出缓冲上限检查器，不做完整探针 |
`,
    'rxCombine',
    [
      {
        text: '「快源慢消费，想攒一批再处理」最合适？',
        options: ['bufferTime(ms)', 'take(1)', 'debounceTime', 'throwIfEmpty'],
        answer: 0,
        explain: 'bufferTime 把一段时间内的值攒成数组一次发出，是「批处理」的背压整形手段。',
        concept: 'c-backpressure',
      },
      {
        text: '想给「debounceTime 之后何时发值」写测试而不用真实计时，用什么？',
        options: ['TestScheduler（虚拟时间）', 'console.log', 'setTimeout', '真实等待'],
        answer: 0,
        explain: 'TestScheduler 用 Marble 图描述「值在何时发」，可精确断言时间类操作符而无需真实计时。',
        concept: 'c-backpressure',
      },
      {
        text: '快源慢消费，想「丢弃中间值、只保留最新值」做背压整形应选？',
        options: ['bufferTime(ms)', 'sampleTime(ms) / throttleTime(ms)', 'toArray()', 'concatAll()'],
        answer: 1,
        explain:
          'sampleTime 定时采样最近值、throttleTime 限频丢弃中间值；bufferTime 是攒批保留全部，toArray 要等 complete。',
        concept: 'c-backpressure',
      },
    ],
    [
      ['背压', '快源慢消费下的值堆积与整形'],
      ['TestScheduler', '用虚拟时间/Marble 测试时间逻辑'],
    ],
    [
      '高并发事件直接喂给慢消费者，不缓冲也不采样，导致堆积或卡顿。',
      '组件卸载不取消订阅/取最新，旧请求回来盖掉新状态（应使用 takeUntil/switchMap）。',
    ],
  ),
  'practice',
)
