import { L, withKind } from '../../course-builders.ts'

export const L09 = withKind(
  L(
    'L09',
    2,
    'concatMap 与 mergeMap：排队 vs 并发',
    3,
    ['L08'],
    ['c-concat', 'c-merge'],
    [
      '说清排队与并发在时序上的本质差别',
      '解释并发度、内流交错与完成顺序',
      '用同一组输入推演两条输出序列',
      '说清何时该用 concatMap 保序、何时用 mergeMap 提吞吐',
    ],
    `
### 一次事故：换了保序写法，吞吐掉了一半

批量上传三个文件，原来的 \`mergeMap\` 让三个请求同时发出，后端按到达顺序写入索引，结果顺序经常和界面上的列表不一致。有人把算子改成 \`concatMap\`，顺序确实稳了，但原本 300ms 的批次变成 600ms，高峰期队列越积越长，值班同学一度以为是网络变慢。两次改动都没写错代码，问题是**「保序」与「并发」是同一个旋钮的两端**，团队却把它当成两个独立开关来回拨。要选对，必须先把同一组输入在两种策略下的完成时刻写出来，而不是凭「哪个听起来更稳」。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`concatMap\` 对新外值做什么 | 排队；只有当前内流 \`complete\` 后才订阅下一条 |
| \`mergeMap\` 对新外值做什么 | 立即并存订阅；内流之间互不等候 |
| 二者输出顺序差别 | 前者按外值顺序分组保序，后者按各内流实际完成时刻交错 |
| 本课不回答什么 | 取消旧内流（L10）、并发上限（L12）、决策树（L11） |

### 排队与并发：时序对照表

| 维度 | \`concatMap\` | \`mergeMap\` |
|---|---|---|
| 同时活跃的内流 | 恒为 1 | 0..n，取决于外值到达速度 |
| 新外值到来 | 进队列，不订阅 | 立刻订阅 |
| 输出顺序 | 按外值顺序，段内有序 | 按内流完成时刻，可能交错 |
| 批次总耗时 | 各内流耗时之和 | 约等于最慢那条内流的耗时 |
| 阻塞风险 | 一条内流不终结，后续全卡住 | 不阻塞，但并发无上限 |
| 适合 | 顺序写入、有依赖、必须保序 | 独立请求、追求吞吐、可乱序 |

表里「批次总耗时」这一行是选型的量化依据：三条耗时 300 / 100 / 200ms 的独立任务，\`concatMap\` 需要 600ms，\`mergeMap\` 约 300ms。这不是快慢偏好，而是**你愿不愿意为顺序付两倍时间**。如果业务约束是「第 2 条必须等第 1 条落库后才能写」，那 600ms 是正确成本；如果三条彼此独立，多付的 300ms 就是纯粹浪费。

\`\`\`ts title="同一批任务，两种策略" note="mergeMap 的第二参数可以限制并发；不传时并发无上限，L12 会展开。"
import { of, from, defer, timer } from "rxjs"
import { concatMap, mergeMap, map, take } from "rxjs/operators"

type Job = { id: string; ms: number }
type Done = { id: string; at: number }

const jobs: Job[] = [
  { id: "a", ms: 300 },
  { id: "b", ms: 100 },
  { id: "c", ms: 200 },
]

const run = (j: Job) => defer(() => from(Promise.resolve<Done>({ id: j.id, at: j.ms })))

// 保序：a 完成后才订阅 b，b 完成后才订阅 c
const queued$ = of(...jobs).pipe(concatMap(run))
queued$.subscribe((d) => console.log("queued", d.id))

// 并发：三条内流同时订阅，谁先完成谁先交付
const parallel$ = of(...jobs).pipe(mergeMap(run))
parallel$.subscribe((d) => console.log("parallel", d.id))

// 有界并发：最多同时 2 条，兼顾吞吐与下游容量（L12）
const bounded$ = of(...jobs).pipe(mergeMap(run, 2))
bounded$.subscribe((d) => console.log("bounded", d.id))

// 轮询场景：内流若永不终结，concatMap 会永远等第一条
const poll$ = timer(0, 1000).pipe(
  take(3),
  map((n) => ({ id: "tick-" + n, ms: 0 })),
  concatMap(run),
)
poll$.subscribe(console.log)
\`\`\`

### 用最小模型把「保序的代价」变成可断言的事实

下面不依赖 RxJS 包，用耗时数组计算两种策略的完成时刻与顺序，断言总耗时差、输出顺序差，以及「内流不终结会让排队策略永久阻塞」。

\`\`\`ts
import assert from "node:assert/strict"

type Job = { id: string; ms: number; done: boolean }
type Finish = { id: string; at: number }

const jobs: Job[] = [
  { id: "a", ms: 300, done: true },
  { id: "b", ms: 100, done: true },
  { id: "c", ms: 200, done: true },
]

/** concatMap：串行累加耗时。 */
function concatTimeline(items: Job[]): Finish[] {
  let clock = 0
  const out: Finish[] = []
  for (const j of items) {
    if (!j.done) break // 一条不终结的内流会让后续全部排队
    clock += j.ms
    out.push({ id: j.id, at: clock })
  }
  return out
}

/** mergeMap：全部同时开始，按耗时排序交付。 */
function mergeTimeline(items: Job[]): Finish[] {
  return items
    .filter((j) => j.done)
    .map((j) => ({ id: j.id, at: j.ms }))
    .sort((x, y) => x.at - y.at)
}

const queued = concatTimeline(jobs)
const parallel = mergeTimeline(jobs)
assert.deepEqual(queued.map((f) => f.id), ["a", "b", "c"], "排队严格保序")
assert.equal(queued.at(-1)!.at, 600, "总耗时 = 300 + 100 + 200")
assert.deepEqual(parallel.map((f) => f.id), ["b", "c", "a"], "并发按完成时刻交错")
assert.equal(parallel.at(-1)!.at, 300, "总耗时 ≈ 最慢的一条")
assert.ok(queued.at(-1)!.at > parallel.at(-1)!.at, "保序要付时间成本")

// 负例：中间一条内流不终结
const stuck: Job[] = [jobs[0], { ...jobs[1], done: false }, jobs[2]]
const blocked = concatTimeline(stuck)
assert.deepEqual(blocked.map((f) => f.id), ["a"], "concatMap 卡在不终结的内流上")
assert.equal(mergeTimeline(stuck).length, 2, "mergeMap 不受单条内流阻塞，但不保序")
\`\`\`

第三组断言给出了排查「批次卡住」的判据：如果日志里最后一条完成的是 a，而 b、c 的请求一个都没发出，几乎可以断定用了排队策略且 b 的内流没有正常终结。修复不是换算子，而是给内流加超时或 \`take\`（L25），让「永远不回来」变成可观测的错误。

### 同一组输入的完整推演

以 a=300ms、b=100ms、c=200ms 为例，按 100ms 一帧把两种策略的时间线摊开：

| 帧 | concatMap 正在跑 | concatMap 交付 | mergeMap 正在跑 | mergeMap 交付 |
|---|---|---|---|---|
| 0–100 | a | 无 | a、b、c | 无 |
| 100–200 | a | 无 | a、c | b |
| 200–300 | a | 无 | a | c |
| 300–400 | b | a | 无 | a |
| 400–500 | c | b | 无 | 无 |
| 500–600 | 无 | c | 无 | 无 |

把表横着读，能同时看到两件事：\`concatMap\` 的「正在跑」列从头到尾只有一个任务，因此顺序必然稳定；\`mergeMap\` 的「正在跑」列在首帧就有三条，交付顺序完全由耗时决定。这也是为什么**「改成 concatMap 之后变慢了」不是回归，而是策略本身的定义**。要在保序与吞吐之间取中间值，正确做法不是反复换算子，而是 \`mergeMap(project, 2)\` 这样的有界并发（L12），或者把必须保序的那几步单独拆成一段 \`concatMap\`，其余仍并发。

:::deep

### 保序的真正含义是「段间有序」

\`concatMap\` 保证的是**按外值分组**的顺序：a 的所有值交付完，才轮到 b 的所有值。它并不保证全局只有一个值，也不保证 b 一定紧跟 a——如果 a 的内流发出 5 个值，下游会先收到 5 个 a 的值。因此「保序」的准确说法是段间有序、段内按内流自身时序。反过来，\`mergeMap\` 连段内都不保序：a1 可能晚于 c2 到达。很多「顺序错乱」的事故，其实是把这两种保序混为一谈：以为 \`concatMap\` 会让每条内流只发一个值，于是把 \`from(list)\` 直接放进投影函数，结果一次外值就吐出一串值，前端按「每个外值一条」的假设渲染，界面依然错位。需要在段内也只取一个值时，应在内流上加 \`take(1)\` 或改用 \`first()\`（L06），那是内流自己的取舍，与扁平化策略无关。

:::

:::warn

### 三个排队 / 并发踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 用 \`mergeMap\` 处理有先后依赖的写入 | 后一条先落库，前一条覆盖回去，数据最终不一致 | 有依赖就用 \`concatMap\`，或把依赖显式建模成链式调用 |
| 默认 \`mergeMap\` 且外值是高频事件 | 输入爆发时并发数等于事件数，瞬时打爆下游 | 传第二参数限制并发（L12），或先用 \`debounceTime\`（L23）削峰 |
| 以为 \`concatMap\` 能自动超时 | 某条内流不 complete，后续任务永远排队，日志停在最后一条 | 给内流加超时 / \`take\`，让不终结变成可观测的失败 |

第二个坑与 L08 的「并发无上限」是同一条，但在高频输入下后果更直接：鼠标移动、输入框连打、WebSocket 高频推送都可能在一秒内给出几十个外值。此时 \`mergeMap\` 不是「快一点」，而是把下游的请求队列当成无限容量，限流与熔断会先于业务代码生效。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 活跃内流数 | \`concatMap\` 恒为 1；\`mergeMap\` 随外值增加 |
| 输出顺序 | 三条耗时不同的任务在两种策略下交付顺序不同，断言固定 |
| 总耗时 | 排队为耗时之和，并发约为最慢一条 |
| 阻塞判据 | 中间内流不终结时，排队只交付首条 |
| 保序粒度 | 能说清「段间有序」与「段内只一个值」的区别 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L08 嵌套流心智模型 | 四种策略的取消语义总表 | 本课只推演排队与并发两种 |
| L10 取最新与排空 | \`switchMap\` / \`exhaustMap\` 的取消与忽略 | 本课不处理「取消旧内流」 |
| L11 决策树 | 三问顺序与四类场景选型 | 本课不给选型结论，只给量化依据 |
| L12 并发限制 | \`mergeMap\` 第二参数、\`race\`、\`startWith\` | 本课只在示例中提示有界并发存在 |
`,
    'rxCross',
    [
      {
        text: 'concatMap 与 mergeMap 的核心差异是？',
        options: ['concatMap 更快', 'concatMap 串行保序；mergeMap 并发', '完全相同', 'mergeMap 保序'],
        answer: 1,
        explain: 'concatMap 等前一个内层完成才启动下一个（保序）；mergeMap 让内层并行（乱序风险）。',
        concept: 'c-concat',
      },
      {
        text: '限制在途并发数为 3，最合适的写法是？',
        options: ['concatMap', 'mergeMap(x, {concurrent:3})', 'switchMap', 'exhaustMap'],
        answer: 1,
        explain: 'mergeMap 的第二参 { concurrent } 就是为「有界并发」设计的，既并发又限流。',
        concept: 'c-merge',
      },
      {
        text: '一批彼此独立的 10 张图片，希望尽快全部加载完成，最合适的扁平化是？',
        options: ['concatMap', 'mergeMap', 'switchMap', 'exhaustMap'],
        answer: 1,
        explain: '彼此独立、越快越好 → mergeMap 并发加载；若必须保序或对接口限流才用 concatMap。',
        concept: 'c-merge',
      },
    ],
    [
      ['concatMap', '内层串行合并，保证顺序与限流'],
      ['mergeMap', '内层并发合并（7.x 中 flatMap 是其别名）'],
    ],
    [
      '搜索框输入用 mergeMap，旧请求回来盖掉新结果（应使用 switchMap）。',
      '对高并发事件源用无界 mergeMap，下游被请求打爆。',
    ],
  ),
  'theory',
)
