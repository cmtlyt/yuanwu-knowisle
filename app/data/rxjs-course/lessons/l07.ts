import { L, withKind } from '../../course-builders.ts'

export const L07 = withKind(
  L(
    'L07',
    1,
    '归约与收集：reduce / toArray / count / buffer',
    2,
    ['L06'],
    ['c-reduce'],
    [
      '实现 reduce / toArray / count / buffer 的等价语义并跑通',
      '写出一个只在 complete 时发射的收集器',
      '搭好断言验证空流、单值流、多批次三种输入',
      '产出归约与缓冲的边界对照表',
    ],
    `
### 一次事故：两份报表对不上，因为共享了同一个累加数组

导出模块里用 \`let bucket: Row[] = []\`，在订阅回调里 \`bucket.push(row)\`，等 \`complete\` 时把 \`bucket\` 写成 CSV。单人操作时正常；后来页面同时开了两个导出任务，两个订阅者往同一个数组里塞数据，第一份报表里混进了第二份的行，第二份又重复了第一份。有人提议「每次订阅前清空数组」，但两个任务交错执行时清空本身就会丢数据。真正的问题是：**把「一条流里的多个值合成一个值」这件事，用手写外部状态实现了**。归约类算子的价值不只是少写几行代码，而是把累加状态绑定到一次订阅上，让每个订阅者拥有独立的账本；同时把「什么时候发射结果」钉死在 \`complete\` 那一刻，杜绝「边收边写」的竞态。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 归约类算子什么时候发射 | \`reduce\` / \`toArray\` / \`count\` 只在 \`complete\` 时发射**一个**结果 |
| 需要中间结果怎么办 | 用 \`scan\`，它每个输入值都发射一次累计状态 |
| 空流会怎样 | \`toArray\` / \`count\` 发射 \`[]\` / \`0\`；\`reduce\` 有 seed 时发射 seed，无 seed 时**不发值直接完成** |
| 缓冲与归约的差别 | \`buffer\` / \`bufferTime\` 把多个值打包成**多个数组**沿时间发出，不终结流 |

### 归约与缓冲对照表

| 算子 | 输出个数 | 发射时机 | 空流结果 | 内存特征 |
|---|---|---|---|---|
| \`reduce(fn, seed)\` | 1 | \`complete\` | 有 seed 发 seed；无 seed 不发值 | 只留一个累加值 |
| \`scan(fn, seed)\` | 与输入个数相同 | 每个 \`next\` | 不发值 | 只留一个累加值 |
| \`toArray()\` | 1 | \`complete\` | \`[]\` | 缓存全部值，长流危险 |
| \`count(pred?)\` | 1 | \`complete\` | \`0\` | 只留计数 |
| \`first()\` / \`last()\` | 1 | 首个值 / \`complete\` | \`first\` 报错，\`last\` 不发值 | 只留一个值 |
| \`buffer(closing$)\` | 0..n | 关闭信号到来时 | 不发值 | 缓存当前一批 |
| \`bufferTime(ms)\` | 0..n | 每个时间窗结束 | 不发值 | 缓存每个窗口 |

表里最需要警惕的是 \`toArray\`：它必须等流结束才能发射，因此**对永不终结的热流等于永不返回，对长流等于把全部数据堆在内存里**。看到 \`toArray\` 就该追问一句「这条流会 complete 吗、最多多少个值」，答案不肯定时改用 \`bufferTime\` 分批，或直接 \`scan\` 增量处理。

\`\`\`ts title="归约与缓冲的 7.8.2 写法" note="累加状态由算子按订阅持有，不再使用模块级数组；bufferTime 用于长流分批。"
import { of, from, EMPTY, interval, Subject } from "rxjs"
import {
  reduce,
  scan,
  toArray,
  count,
  buffer,
  bufferTime,
  take,
  map,
} from "rxjs/operators"

type Row = { id: string; amount: number }

const rows: Row[] = [
  { id: "r1", amount: 120 },
  { id: "r2", amount: 80 },
  { id: "r3", amount: 300 },
]

// 只在 complete 时发射一次
from(rows)
  .pipe(reduce((total, r) => total + r.amount, 0))
  .subscribe((sum) => console.log("total", sum))

// 每个值都给一次累计状态，适合进度条
from(rows)
  .pipe(scan((total, r) => total + r.amount, 0))
  .subscribe((running) => console.log("running", running))

// 空流：toArray / count 有明确结果，reduce 无 seed 时静默完成
EMPTY.pipe(toArray()).subscribe((v) => console.log("empty array", v))
EMPTY.pipe(count()).subscribe((v) => console.log("empty count", v))

// 按关闭信号分批；closing$ 是热的，每次 next 开新一批
const closing$ = new Subject<void>()
const batched$ = from(rows).pipe(buffer(closing$))
batched$.subscribe((batch) => console.log("batch", batch.length))
closing$.next()
closing$.next()
closing$.complete()

// 长流用时间窗分批，避免 toArray 无界缓存
interval(10)
  .pipe(take(6), bufferTime(30), map((b) => b.length))
  .subscribe((n) => console.log("window size", n))
\`\`\`

### 用最小模型把「状态按订阅隔离」变成可断言的事实

下面不依赖 RxJS 包，实现一个 \`Collect\` 累加器：每次订阅创建独立账本，在 \`complete\` 时给出结果。断言覆盖空流、单值流、多批次、两次订阅互不污染，以及「无 seed 的 reduce 在空流上不发值」这条最容易踩的语义。

\`\`\`ts
import assert from "node:assert/strict"

type Sink<T> = (v: T) => void

/** 每次 subscribe 都创建一份新的账本，complete 时发射一次。 */
function collect<T, R>(seed: R, step: (acc: R, v: T) => R, emitEmpty: boolean) {
  return {
    subscribe(items: T[], sink: Sink<R>): { received: R[] } {
      const received: R[] = []
      let acc = seed
      let seen = 0
      for (const item of items) { acc = step(acc, item); seen += 1 }
      if (seen > 0 || emitEmpty) { received.push(acc); sink(acc) }
      return { received }
    },
  }
}

const sum = collect<number, number>(0, (a, b) => a + b, true)
const rows = [120, 80, 300]

const a = sum.subscribe(rows, () => {})
const b = sum.subscribe(rows, () => {})
assert.deepEqual(a.received, [500])
assert.deepEqual(b.received, [500], "两次订阅互不污染")

const empty = sum.subscribe([], () => {})
assert.deepEqual(empty.received, [0], "有 seed 的归约在空流上发射 seed")

// 负例：无 seed 的归约在空流上不发值，只完成
const noSeed = collect<number, number>(0, (acc, v) => acc + v, false)
assert.deepEqual(noSeed.subscribe([], () => {}).received, [])
assert.deepEqual(noSeed.subscribe([7], () => {}).received, [7])

// scan 风格：每个输入值都给一次累计状态
function running(items: number[]): number[] {
  const out: number[] = []
  let acc = 0
  for (const v of items) { acc += v; out.push(acc) }
  return out
}
assert.deepEqual(running(rows), [120, 200, 500])

// buffer 风格：按关闭信号切批，不丢值、不重复、不越界
function batchBy(items: number[], closings: number[]): number[][] {
  const batches: number[][] = []
  let current: number[] = []
  let ci = 0
  for (const v of items) {
    current.push(v)
    if (ci < closings.length && v === closings[ci]) {
      ci += 1
      batches.push(current)
      current = []
    }
  }
  if (current.length) batches.push(current)
  return batches
}
const batches = batchBy([1, 2, 3, 4], [2, 4])
assert.deepEqual(batches, [[1, 2], [3, 4]])
assert.deepEqual(batches.flat(), [1, 2, 3, 4], "分批后展平必须与原序列逐项相同")
\`\`\`

最后两条断言把缓冲的正确性写成了一条不变量：**把所有批次展平，必须与原序列逐项相等**。这比「看起来分成了两批」严格得多，能同时抓出丢值、重复和跨批错位。真实项目里 \`bufferTime\` 的窗口边界受调度器影响（L22），正因为它容易在边界上出偏差，才更应该在测试里用 \`TestScheduler\`（L26）固定时间，再用这条展平断言收口。

:::deep

### \`reduce\` 与 \`scan\`：一条分界线

两者用的是同一个累加函数，差别只在**发射时机**，但这一点差别决定了它们能不能用在长流上。\`reduce\` 是「等全部到齐再给结论」，因此它与 \`complete\` 强绑定：流不结束就没有结果，流结束了也不能再补充。\`scan\` 是「每来一个值就给一次当前状态」，因此它可以在永不终结的流上持续工作，天然适合进度、累计计数、状态机。工程判断可以简化成一句：**如果 UI 需要在过程中看到变化，就不要用 \`reduce\`**。很多「进度条一直停在 0、导出完成瞬间跳到 100%」的实现，根因就是在长流上错用了 \`reduce\`；换成 \`scan\` 后不需要改任何业务公式，只是把发射时机从「结束」改成「每次」。反过来说，如果只需要最终汇总，\`scan\` 会多发射 N-1 次无人消费的值，白白增加下游压力——两者不是替代关系，而是「过程」与「结论」的分工。

:::

:::warn

### 三个归约踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 把累加数组放在模块顶层或闭包外层 | 多个订阅者共享账本，报表互相串数据 | 用 \`reduce\` / \`toArray\` 让算子按订阅持有状态，或用 \`defer\` 把状态关进订阅期 |
| 对永不终结的热流用 \`toArray()\` | 永不发射，内存持续增长直到页面卡死 | 改 \`bufferTime\` / \`buffer\` 分批，或用 \`scan\` 增量处理 |
| 无 seed 的 \`reduce\` 用在可能为空的流上 | 静默完成、一个值都不发，下游把「没结果」当成「没问题」 | 显式给 seed，或用 \`defaultIfEmpty\`（L16）把空流语义写清楚 |

第三个坑与 L06 提到的 \`first()\` 空流行为是一对：一个以 \`error\` 终结，一个静默完成，二者都不给「正常的空结果」。这类「什么都没发生」的失败最难排查，因为它不报错、不打日志，只是在某次数据量恰好为零时少了一步处理。凡是汇总链路，都应该有一条「空输入」的断言，把预期结果写死。

:::

### 四种输入下归约链的结果

| 输入 | reduce(seed=0) | toArray() | count() | 内存峰值 | 是否适合 |
|---|---|---|---|---|---|
| 空流 | 发射 0 | 发射空数组 | 发射 0 | 常数 | 适合，但需显式声明空语义 |
| 单值流 | 发射该值的累加结果 | 发射单元素数组 | 发射 1 | 常数 | 适合 |
| 有限多值流 | 发射一次汇总 | 发射一次全量数组 | 发射一次总数 | 与值个数成正比 | 适合，toArray 需有上界 |
| 永不终结的长流 | 永不发射 | 永不发射且持续缓存 | 永不发射 | 无界增长 | 不适合，改 scan 或 bufferTime |

前两行看起来都很温和，但第四行才是生产事故的来源：一条持续推送的行情流加上 toArray() 不会报错、不会打日志，只是内存曲线缓慢向上，直到标签页被系统回收。判断要不要用归约算子，先问「这条流会 complete 吗」，再问「最多多少个值」，两个答案都确定才用 toArray 或 reduce。第三行还有一个隐含成本：即使最终只需要一个数字，toArray 也已经把所有值物化过一遍，在十万条数据上这一步往往比累加本身贵得多。表格最后一行给出的替代方案分两类：scan 解决「过程中也要看结果」，bufferTime 解决「结果太大要分批落地」，后者会在 L25 的背压场景里展开，而窗口边界的时序验证要等 L26 的虚拟时间才能写稳。

### 验收清单

| 检查 | 判据 |
|---|---|
| 状态隔离 | 两次订阅的归约结果完全一致，账本不共享 |
| 发射时机 | \`reduce\` / \`toArray\` / \`count\` 只在 \`complete\` 时发一次 |
| 空流语义 | 有 seed 发 seed、无 seed 不发值；\`toArray\` 发 \`[]\`、\`count\` 发 \`0\` |
| 长流安全 | 永不终结的流不使用 \`toArray\`，改分批或 \`scan\` |
| 缓冲不变量 | 所有批次展平后与原序列逐项相同，无丢值 / 重复 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L05 纯变换 | \`map\` 的一对一映射与纯度 | 本课把「多对一 / 一对多批」补齐，不重复纯度论证 |
| L06 过滤与取舍 | \`filter\` / \`take\` / \`distinctUntilChanged\` 的状态归属 | 本课沿用「状态按订阅隔离」结论，不重写去重 |
| L16 安全订阅与空流 | \`defaultIfEmpty\` / \`throwIfEmpty\` 的兜底链 | 本课只指出空流风险，不实现兜底 |
| L25 背压与落地 | 有界缓冲、批量落地与框架接入 | 本课讲缓冲语义，不讲生产快于消费者时的容量控制 |
| L26 marble 测试 | 用虚拟时间固定 \`bufferTime\` 窗口边界 | 本课只给出展平不变量，不写时序断言 |
`,
    'rxTransform',
    [
      {
        text: 'reduce 与 scan 的区别是？',
        options: [
          '完全相同',
          'reduce 在 complete 时发一次最终值；scan 每步都发中间值',
          'scan 更快',
          'reduce 不能传初值',
        ],
        answer: 1,
        explain: 'scan 保留时间维度（每次发），reduce 折叠成单值（完成时发），二者可互相推导。',
        concept: 'c-reduce',
      },
      {
        text: 'toArray() 在流 complete 时发出什么？',
        options: ['最后一个值', '所有值的数组', 'undefined', '抛错'],
        answer: 1,
        explain: 'toArray 缓冲全部值，直到 complete 才把整个数组作为单次结果发出。',
        concept: 'c-reduce',
      },
    ],
    [
      ['reduce', '把整条流折叠成单个值，complete 时发出'],
      ['scan', '逐步归约，每一步都作为值发出'],
    ],
    [
      '期望 reduce 每步都发中间结果（那应该是 scan）。',
      '对无限流用 toArray/reduce，期待它能完成——永远等不到 complete。',
    ],
  ),
  'practice',
)
