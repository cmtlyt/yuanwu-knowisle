import { L, withKind } from '../../course-builders.ts'

export const L02 = withKind(
  L(
    'L02',
    0,
    '冷流与热流：订阅才产生数据',
    1,
    ['L01'],
    ['c-cold-hot', 'c-triplet'],
    [
      '说清冷流「每次订阅独立执行」与热流「订阅只接入」的差别',
      '解释 next / error / complete 三元组与订阅契约的顺序约束',
      '用同一段源在两种语义下的输出对照说明「谁触发生产」',
      '说清为什么共享一个已完成的冷源会让重试失效',
    ],
    `
### 一次事故：同一份数据请求了两次，晚来的组件却什么都没拿到

详情页头部和侧栏各订阅了一次「当前用户」流。上线后发现每次进页面都发两次请求，于是有人把它改成一个 \`Subject\` 多播，结果侧栏因为渲染慢、订阅晚，永远拿不到已经发过的用户值，只能显示骨架屏；再补一个「把上次结果存到模块变量里手动补发」的补丁，缓存与流开始各存一份真相。两次事故看起来方向相反，根因却是同一个问题没被回答：**到底是谁触发了数据的生产？** 冷流与热流不是两种写法，而是两种生产责任归属，选错了后面所有重试、共享、补值都会打补丁。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 订阅冷流会发生什么 | 生产逻辑被**完整执行一遍**，每个订阅者拿到独立的一条序列 |
| 订阅热流会发生什么 | 只是**接进已经在跑的生产**，晚到者从接入那一刻开始收 |
| 二者能否互相转换 | 能，但转换必须显式承担「谁补历史值、谁负责断开」的责任，见 L17 / L19 |
| 本课不回答什么 | 订阅如何回收（L03）、如何自定义源（L04）、如何共享一条昂贵源（L19） |

### 三元组：一条序列的时序契约

在讨论冷热之前，必须先把「一次订阅里发生了什么」写清楚。Observable 通过观察者对象的三个回调与订阅者通信：\`next\` 给值，\`error\` 或 \`complete\` 终结。它们之间有严格的顺序约束，违反约束的源不是「有点怪」，而是契约失效。

| 约束 | 含义 | 违反后的典型现象 |
|---|---|---|
| \`next\` 可多次 | 0..n 个值，按发射顺序交付 | 用同步循环一次性吐出全部值，后续算子以为流已结束 |
| \`error\` / \`complete\` 至多一次 | 二者互斥，先到者胜 | 两个终结回调都触发，下游清理逻辑跑两遍 |
| 终结之后静默 | 之后的 \`next\` 一律被忽略 | 定时器还在跑，界面却不再更新，排查极难 |
| 取消也是终结 | \`unsubscribe()\` 后不再交付任何值 | 路由切走后仍收到回调，写进已卸载组件的状态 |

这套契约与冷热无关：无论生产由谁触发，交付给每个订阅者的都是一条遵守上述约束的序列。差别只在于**这条序列是「现场跑出来的」还是「已经跑着的」**。

### 冷与热：生产责任对照表

| 维度 | 冷流（cold） | 热流（hot） |
|---|---|---|
| 谁触发生产 | 每次 \`subscribe\` | 生产独立于订阅，通常在创建时就启动 |
| 每个订阅者的序列 | 独立、完整、可能值不同 | 共享同一条进行中的序列 |
| 晚订阅者 | 从头开始，不丢值 | 从接入时刻开始，历史值不补 |
| 典型来源 | \`of\` / \`from\` / \`defer\` / \`interval\` | \`fromEvent\` / \`Subject\` / WebSocket 消息 |
| 取消的影响 | 只停掉自己这一份生产 | 只摘掉自己这个听众，生产照常 |
| 适合 | 请求、按订阅重算的任务、可重试链路 | 鼠标键盘事件、广播、全局状态推送 |

注意 \`interval\` 虽然在概念上是时间源，但它是冷的：两个订阅者各自拥有独立计数器。\`fromEvent\` 则天然是热的：点击发生时就发生，没人订阅也不会重来。判断口诀是问一句「**如果没有订阅者，生产还会不会发生**」：会，就是热；不会，就是冷。

\`\`\`ts title="同一份写法，冷热两种结果" note="cold$ 两次订阅得到两条独立序列；hot$ 的晚订阅者只能收到接入之后的值。"
import { defer, of, interval, fromEvent, Subject } from "rxjs"
import { take, map } from "rxjs/operators"

let calls = 0
const cold$ = defer(() => {
  calls += 1
  return of({ seq: calls })
})

// 两个订阅者 = 两次工厂执行、两条独立序列
cold$.subscribe((v) => console.log("cold-A", v.seq))
cold$.subscribe((v) => console.log("cold-B", v.seq))
// 输出 cold-A 1 / cold-B 2，calls === 2

const ticks$ = interval(100).pipe(take(3))
ticks$.subscribe((n) => console.log("tick-A", n))
ticks$.subscribe((n) => console.log("tick-B", n))
// 两个订阅者各有自己的 0,1,2；虽然看起来「同时」，但计数器互不共享

const hot$ = new Subject<number>()
hot$.subscribe((n) => console.log("hot-A", n))
hot$.next(1) // 只有 hot-A 收到
hot$.subscribe((n) => console.log("hot-B", n))
hot$.next(2) // hot-A 与 hot-B 都收到 2，但 hot-B 永远收不到 1

const clicks$ = fromEvent(document, "click").pipe(map(() => "click"))
const clickSub = clicks$.subscribe(console.log)
clickSub.unsubscribe() // 取消只摘掉听众，DOM 事件本身照常发生
\`\`\`

### 用最小模型把「谁触发生产」变成可断言的事实

下面不依赖 RxJS 包：分别实现一个冷源与一个热源，断言两次订阅的执行次数、晚订阅者拿到的值，以及「已终结的冷源被共享」时重试为什么失效。

\`\`\`ts
import assert from "node:assert/strict"

type Listener<T> = (v: T) => void

function cold(factory: () => number) {
  return { subscribe: (fn: Listener<number>) => { fn(factory()) } }
}

function hot() {
  const listeners: Listener<number>[] = []
  return {
    subscribe: (fn: Listener<number>) => { listeners.push(fn) },
    emit: (v: number) => { for (const fn of listeners) fn(v) },
  }
}

let calls = 0
const src = cold(() => ++calls)
const a: number[] = []
const b: number[] = []
src.subscribe((v) => a.push(v))
src.subscribe((v) => b.push(v))
assert.equal(calls, 2, "冷源每次订阅独立执行工厂")
assert.deepEqual(a, [1])
assert.deepEqual(b, [2])

const h = hot()
const early: number[] = []
const late: number[] = []
h.subscribe((v) => early.push(v))
h.emit(1)
h.subscribe((v) => late.push(v))
h.emit(2)
assert.deepEqual(early, [1, 2])
assert.deepEqual(late, [2], "晚订阅者不补历史值")

// 负例：把一个「已经完成」的冷源结果固化后共享，重试拿到的是旧值
const snapshot = 42
let attempts = 0
const frozen = { subscribe: (fn: Listener<number>) => { attempts += 1; fn(snapshot) } }
const seen: number[] = []
frozen.subscribe((v) => seen.push(v))
frozen.subscribe((v) => seen.push(v))
assert.deepEqual(seen, [42, 42])
assert.equal(attempts, 2, "订阅次数增加，但生产内容从未重算")
assert.notEqual(seen[1], ++calls, "固化结果不会随新的生产变化；重试需要 defer 重新求值")
\`\`\`

第三组断言是这节课最值得记住的一条：**失败重试之所以能生效，前提是「再订阅一次」会重新执行生产逻辑**。一旦把某个已完成冷源的结果提升成模块级共享值，再多次订阅也只是重复读同一个快照，重试看起来跑了，实际上一次都没重试。修复方式不是给快照加版本号，而是回到 L01 的 \`defer\` 口径，把生产放回订阅期。

:::deep

### 冷不是「懒」，热也不是「缓存」

常见误解是把冷流等同于懒加载、把热流等同于带缓存。二者都不准确。冷流可以 eagerly 计算：\`of(computeHeavy())\` 在构造时就求出了参数，只是每次订阅都会重放同一个值；热流可以完全不缓存：普通 \`Subject\` 一个值都不存，晚订阅者什么也拿不到。「冷 / 热」描述的是生产与订阅的因果关系，与「是否惰性」「是否重放历史」是两个正交维度。真正提供重放能力的是 \`ReplaySubject\` / \`BehaviorSubject\` / \`shareReplay\`（L18、L20），它们是**热流之上额外加的一层状态**，不是热流的定义。把这两个维度混在一起，就会在选型时问出「我要一个能补历史值的冷流」这种自相矛盾的需求：要么改成热流 + 重放，要么保留冷流并接受每次订阅重算。

:::

:::warn

### 三个冷热踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 把 \`Subject\` 当冷源给列表页用 | 晚挂载的组件永远缺第一批数据，只能靠外部变量补 | 需要「从头完整序列」就用 \`defer(() => from(...))\`；需要「当前状态」才用 \`BehaviorSubject\` |
| 直接把 \`from(fetch(...))\` 提升为模块常量给多组件共享 | 请求在模块导入时只发一次，之后所有人读同一份已完成结果，刷新 / 重试全失效 | 用 \`defer\` 保持重算能力，共享交给 \`shareReplay\` 并显式决定 \`refCount\`（L19 / L20） |
| 在 \`error\` 之后继续调用 \`next\`，指望下游收到兜底值 | 终结不可逆，后续值被静默丢弃 | 兜底必须写进流内：\`catchError\` 返回新的替代源（L14），不要在源外补发 |

第二个坑在真实项目里最贵：它往往是为了「优化一下，别让两个组件各发一次请求」而做的，优化本身没错，错在把**去重**和**重算能力**一起优化掉了。正确做法是保留冷源的 \`defer\`，再在下游用共享算子控制连接次数，两个关注点各自可配置。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 生产责任 | 能用「没有订阅者时生产是否发生」判断任意来源的冷热 |
| 冷流独立性 | 同一冷源两次订阅，工厂执行 2 次、结果可不同 |
| 热流晚订阅 | 晚订阅者序列缺少接入前的值，断言能抓到 |
| 终结约束 | \`error\` / \`complete\` 后不再交付值；两者互斥 |
| 重试前提 | 能说清为什么固化已完成冷源会让 \`retry\` 空转 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L01 动机与创建源 | 描述与执行分离、源操作符选型、\`defer\` 的默认写法 | 本课不重复列源清单，只判断冷热 |
| L03 订阅与资源回收 | \`unsubscribe\` / \`teardown\` 的清理链 | 本课只说「取消也是终结」，不解释清理实现 |
| L17 Subject 多播 | 如何把冷流显式转成热源并承担补值责任 | 本课只用 \`Subject\` 举例说明热，不写多播桥 |
| L18 状态型 Subject | 重放与初始值的语义 | 本课明确把重放排除在冷热定义之外 |
`,
    'rxColdHot',
    [
      {
        text: '下面哪个是典型的热源？',
        options: ['of(1,2,3)', 'fromEvent(el,"click")', 'timer(1000)', 'new Observable(...)'],
        answer: 1,
        explain: 'DOM 事件独立于订阅者持续发生，是热的；其余都是惰性、按订阅重放的冷源。',
        concept: 'c-cold-hot',
      },
      {
        text: '一条流调用 error() 之后还能再 next() 吗？',
        options: ['能，正常继续', '不能，终结不可逆', '取决于订阅者', '会抛异常'],
        answer: 1,
        explain: 'error 与 complete 都是终结信号，之后该次订阅不再接受任何 next/error/complete。',
        concept: 'c-triplet',
      },
    ],
    [
      ['冷源 cold', '每个订阅者独立触发源执行、数据独立重放'],
      ['热源 hot', '独立于订阅者持续产生，晚订阅者错过早期数据'],
    ],
    [
      '把 interval 当冷源，期待每个订阅者拿到「相同的」时间线——它其实各自独立计时。',
      '以为 complete 后还能继续 next，或以为 error 可被重试在同一条订阅上恢复。',
    ],
  ),
  'theory',
)
