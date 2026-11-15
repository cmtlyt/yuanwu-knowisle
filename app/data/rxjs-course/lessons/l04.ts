import { L, withKind } from '../../course-builders.ts'

export const L04 = withKind(
  L(
    'L04',
    1,
    '用 new Observable 自定义源：观察者协议',
    2,
    ['L03'],
    ['c-new-observable'],
    [
      '实现一个遵守观察者协议的自定义源并跑通同步与异步两条路径',
      '写出带 teardown 的定时源，断言取消后定时器不再触发',
      '搭好最小断言脚本验证终结后不再发射值',
      '产出一份源实现检查清单，覆盖重入、并发订阅与异常包裹',
    ],
    `
### 一次事故：包了 WebSocket，却包不住它的生命周期

团队把一条行情推送封装成「订阅消息」的工具函数：内部 \`new WebSocket(url)\`，在 \`onmessage\` 里调外部回调，\`onerror\` 打到控制台，\`onclose\` 什么都不做。调用方拿到的是一个回调句柄，没有「完成」概念；页面切走时有人记得 \`close()\`，有人只把界面隐藏，几个小时后浏览器里堆了十几条连接。更糟的是下游想用 \`retry\` 重连，却发现重试根本无从下手——这个工具函数连「一次订阅」的边界都没有。重构的第一步不是换库，而是把它写成一个遵守观察者协议的源：**谁创建资源、谁交付值、谁在什么时候归还，三件事必须在同一个函数里说清楚**。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 什么时候才需要 \`new Observable\` | 现成创建函数（L01）都无法表达的外部资源：WebSocket、SSE、第三方回调 SDK、带句柄的原生 API |
| 订阅函数里必须做什么 | 交付 \`next\` / \`error\` / \`complete\`，并返回 teardown 释放资源 |
| 怎么保证取消与终结都清理 | 用 \`subscriber.add(teardown)\` 登记，或用 \`finalize\` 覆盖三条路径 |
| 本课不回答什么 | 变换链（L05）、错误恢复（L14）、多播共享（L17） |

### 观察者协议：一份必须逐条兑现的契约

\`new Observable(subscribe)\` 里的 \`subscribe\` 函数接收一个 \`subscriber\`。它既是观察者（能 \`next\` / \`error\` / \`complete\`），也是资源账本（能 \`add\` 子订阅与清理函数）。写自定义源时，下面这张表就是全部要兑现的义务。

| 成员 | 作用 | 漏掉会怎样 |
|---|---|---|
| \`subscriber.next(v)\` | 交付一个值 | 下游永远收不到数据，看起来像「没订阅上」 |
| \`subscriber.error(e)\` | 以失败终结 | 异常被吞掉，流一直挂着，重试与告警都不触发 |
| \`subscriber.complete()\` | 以完成终结 | \`toArray\` / \`reduce\` 永不发射，\`finalize\` 不执行 |
| \`subscriber.closed\` | 判断订阅是否已结束 | 定时器继续跑、\`next\` 被静默丢弃，浪费资源却不报错 |
| \`subscriber.add(fn)\` | 登记 teardown 或子订阅 | 取消时监听器 / 连接不会释放，形成泄漏 |
| \`subscribe\` 返回值 | 也可直接返回 teardown 函数 | 与 \`add\` 二选一即可，不要两套清理各写一遍 |

最容易漏的是 \`closed\`：一个同步循环里连续 \`next\` 一万次，如果中途订阅者 \`take(1)\` 取消了，源若不看 \`closed\` 就会把剩下九千多次全部跑完。自定义源不是「把回调改个名字」，而是**把外部资源的整个生命周期收进一次订阅的边界**。

\`\`\`ts title="把 WebSocket 写成合格的自定义源" note="创建、交付、终结、清理都在同一个 subscribe 函数里闭环；subscriber.add 保证取消与终结都释放连接。"
import { Observable, interval, Subscription } from "rxjs"
import { take, map } from "rxjs/operators"

interface Tick { symbol: string; price: number }

function market$(url: string, symbol: string): Observable<Tick> {
  return new Observable<Tick>((subscriber) => {
    const ws = new WebSocket(url)
    const onOpen = () => ws.send(JSON.stringify({ type: "sub", symbol }))
    const onMessage = (ev: MessageEvent<string>) => {
      if (subscriber.closed) return
      try {
        const raw = JSON.parse(ev.data) as { price?: number }
        if (typeof raw.price !== "number") {
          subscriber.error(new Error("bad payload: " + ev.data))
          return
        }
        subscriber.next({ symbol, price: raw.price })
      } catch (e) {
        subscriber.error(e)
      }
    }
    const onError = () => subscriber.error(new Error("socket failed"))
    const onClose = () => {
      if (!subscriber.closed) subscriber.complete()
    }

    ws.addEventListener("open", onOpen)
    ws.addEventListener("message", onMessage as EventListener)
    ws.addEventListener("error", onError)
    ws.addEventListener("close", onClose)

    // 唯一的清理点：取消订阅、error、complete 都会走到这里
    return () => {
      ws.removeEventListener("open", onOpen)
      ws.removeEventListener("message", onMessage as EventListener)
      ws.removeEventListener("error", onError)
      ws.removeEventListener("close", onClose)
      ws.close()
    }
  })
}

const parent = new Subscription()
const sub = market$("wss://example.invalid/quotes", "AAPL")
  .pipe(take(3))
  .subscribe({
    next: (t) => console.log(t.symbol, t.price),
    error: (e) => console.warn("stream failed", e),
    complete: () => console.log("closed"),
  })
parent.add(sub)

// 对照：现成创建函数不需要手写协议，interval 自带 teardown
const clock$ = interval(100).pipe(
  map((n) => n),
  take(2),
)
parent.add(clock$.subscribe(console.log))
parent.unsubscribe()
\`\`\`

### 用最小模型把「协议是否兑现」变成可断言的事实

下面不依赖 RxJS 包与浏览器环境，手写一个带 \`closed\` 判断、teardown 登记、终结不可逆的最小观察者，然后用断言逐条验收：同步源、异步源、终结后静默、取消只跑一次清理、忽略 \`closed\` 会多做多少工。

\`\`\`ts
import assert from "node:assert/strict"

type Observer<T> = {
  next: (v: T) => void
  error: (e: Error) => void
  complete: () => void
}

class MiniSubscriber<T> implements Observer<T> {
  closed = false
  private teardowns: Array<() => void> = []
  constructor(private readonly sink: { values: T[]; error?: Error; completed: boolean }) {}
  next(v: T) { if (!this.closed) this.sink.values.push(v) }
  error(e: Error) {
    if (!this.closed) { this.sink.error = e; this.dispose() }
  }
  complete() {
    if (!this.closed) { this.sink.completed = true; this.dispose() }
  }
  add(fn: () => void) { this.teardowns.push(fn) }
  private dispose() {
    this.closed = true
    for (const fn of this.teardowns) fn()
  }
  unsubscribe() { this.dispose() }
}

function synchronous(): { subscribe: (o: Observer<number>) => void } {
  return {
    subscribe(o) {
      o.next(1); o.next(2); o.complete()
    },
  }
}

let cleanups = 0
function timed(): { subscribe: (o: Observer<number>) => void } {
  return {
    subscribe(o) {
      const s = o as MiniSubscriber<number>
      s.add(() => { cleanups += 1 })
      s.next(10)
      s.next(20)
      s.complete()
    },
  }
}

const sinkA = { values: [] as number[], error: undefined as Error | undefined, completed: false }
const a = new MiniSubscriber(sinkA)
synchronous().subscribe(a)
assert.deepEqual(sinkA.values, [1, 2])
assert.equal(sinkA.completed, true)
a.next(3)
assert.deepEqual(sinkA.values, [1, 2], "终结之后 next 必须静默")

const sinkB = { values: [] as number[], error: undefined as Error | undefined, completed: false }
const b = new MiniSubscriber(sinkB)
timed().subscribe(b)
b.unsubscribe()
assert.equal(cleanups, 1, "重复取消只能清理一次")

// 负例：不看 closed 的同步源会在取消后继续做无用功
let wasted = 0
function blind(o: Observer<number>) {
  for (let i = 0; i < 100; i++) { wasted += 1; o.next(i) }
}
const sinkC = { values: [] as number[], error: undefined as Error | undefined, completed: false }
const c = new MiniSubscriber(sinkC)
blind({
  next: (v) => c.next(v),
  error: (e) => c.error(e),
  complete: () => c.complete(),
})
c.complete()
assert.equal(wasted, 100, "不检查 closed 时源仍跑满 100 次")
assert.equal(sinkC.values.length, 100)
\`\`\`

最后这组负例给出一个可量化的判断：**自定义源是否合格，不看它能不能吐值，而看订阅者提前离开后它有没有立刻停手**。\`wasted\` 是纯浪费的工作量，在真实项目里就是没人收的网络响应、没人看的解析与没人用的定时器回调。把 \`if (subscriber.closed) return\` 写进每个异步回调，是自定义源最便宜也最容易被跳过的一条纪律。

:::deep

### 为什么自定义源应该是「最后手段」

\`new Observable\` 给了你完全的自由，也把协议的全部义务都交给了你：终结是否唯一、错误是否被吞、清理是否幂等、并发订阅是否各自持有独立资源。相比之下 \`fromEvent\` / \`from\` / \`defer\` / \`interval\` 已经把这些边界实现好并经过回归。工程上的顺序应该是：先找现成创建函数，再用 \`defer\` 把副作用挪到订阅期，只有遇到「外部资源带自己的句柄、且没有对应创建函数」时才手写。一个实用的判据是：**如果你在 \`subscribe\` 里写的代码超过一半是 \`addEventListener\` / \`removeEventListener\` / \`close\` 这类生命周期样板，那就确实该自定义；如果大部分是业务校验与数据整形，应该把它们移到下游的 \`map\` / \`filter\`（L05、L06）**。自定义源只负责「把外部世界接进流」，不负责业务规则，这条分界能让 L03 的资源账本与 L05 的纯变换各自保持简单。

:::

:::warn

### 三个自定义源踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 只在 \`onmessage\` 里 \`next\`，不处理 \`onerror\` / \`onclose\` | 连接断了流还挂着，\`toArray\` / \`reduce\` 永不发射，看板停在最后一帧 | 两条路径都要终结：\`error\` 或 \`complete\` 二选一，且只调用一次 |
| 清理函数里抛异常 | 取消订阅时报错冒泡，掩盖真正的业务异常 | teardown 只做释放，用 try / catch 包住不可靠的第三方 \`close()\` |
| 把「业务校验失败」写成 \`subscriber.error\` | 一条脏数据让整条行情流终结，后续合法报价再也进不来 | 校验失败是正常值（如带 \`invalid\` 标记），交给下游 \`filter\`；\`error\` 只留给连接级故障 |

第三条与 L01 提到的「完成不等于成功」是一体两面：自定义源是整条链的入口，入口处对 \`error\` 的语义定义会一路影响 L13 的终结语义与 L14 的重试策略。宁可在入口处多写一层结果类型，也不要让一条脏数据拥有终结全局的权力。

:::

### 一次订阅从建立到归还的时间线

| 步骤 | 动作 | 账本状态 | 漏掉后的现象 |
|---|---|---|---|
| 1 | 调用 subscribe | 创建父 Subscription，尚未持有资源 | 没有统一句柄，卸载时只能逐个找 |
| 2 | 执行 new Observable 的工厂 | 建立连接、登记四个监听 | 资源在模块导入时就创建，与订阅脱钩 |
| 3 | subscriber.add(teardown) | 账本登记一次清理 | 取消时监听器与连接都留在浏览器里 |
| 4 | next 交付值 | 下游依次跑 take 与业务算子 | 下游拿不到值，界面停在初始态 |
| 5 | 第 3 个值到达 | take(3) 反向取消上游 | 上游继续推送，closed 判断形同虚设 |
| 6 | teardown 执行 | 移除监听、关闭连接、账本关闭 | 连接残留，重连次数与请求量暴涨 |

把这张表从上往下读一遍，会发现「资源」与「数据」是两条并行线：第 2、3 步建立资源账本，第 4、5 步交付数据，第 6 步归还资源。自定义源之所以容易写错，正是因为多数示例代码只画了中间那条数据线，把首尾两步留给了调用方。评审时可以要求每个自定义源都附上这张六行表，并逐行回答「这一步在本实现里由谁负责」；答不上来的行通常就是事故现场。特别是第 5 步，take 之类的下游算子会反向取消上游，这不是可选项，而是 L03 里 unsubscribe 契约在变换链上的延伸——源若不看 closed，第 5 步之后依旧会跑满全部回调。也正因为如此，L04 的验收标准不能只写「能收到消息」，必须同时写「收到第 3 条之后源侧不再持有监听」。

### 验收清单

| 检查 | 判据 |
|---|---|
| 协议完整 | \`next\` / \`error\` / \`complete\` 三条路径都有实现，终结唯一且不互斥混用 |
| 资源归还 | 取消订阅后 \`removeEventListener\` 与 \`close\` 都执行，且只执行一次 |
| 提前离开 | 同步源在 \`take(1)\` 之后不再继续计算，断言能测出浪费工作量 |
| 终结静默 | \`complete\` 之后继续 \`next\` 不产生任何值 |
| 职责边界 | \`subscribe\` 里只做资源接入与交付，业务整形在下游算子 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L01 动机与创建源 | 现成创建函数选型、\`defer\` 的默认写法 | 本课只讲「现成函数不够用时」的手写路径 |
| L03 订阅与资源回收 | \`Subscription\` 树、\`finalize\`、\`unsubscribe\` 幂等 | 本课把 L03 的账本落到一个具体源实现里 |
| L05 纯变换 | \`map\` / \`pipe\` 的值整形与组合 | 本课明确把业务校验移出 \`subscribe\` |
| L14 恢复与重试 | \`catchError\` / \`retry\` 的恢复策略 | 本课只保证「入口会正确 \`error\`」，不设计重试 |
`,
    'rxObserver',
    [
      {
        text: 'new Observable 的订阅函数返回什么最规范？',
        options: ['一个字符串', 'void', '一个 teardown 清理函数或 Subscription', '一个 Promise'],
        answer: 2,
        explain: '返回清理函数可让订阅取消时自动回收定时器/连接，是自定义源防泄漏的关键。',
        concept: 'c-new-observable',
      },
      {
        text: '自定义源里 observer.complete() 之后还能 observer.next() 吗？',
        options: ['能', '不能，终结后调用无效', '会抛异常', '会重新开始'],
        answer: 1,
        explain: '一次终结（error 或 complete）之后，该订阅的 next/error/complete 都会被忽略，语义不可逆。',
        concept: 'c-new-observable',
      },
    ],
    [
      ['观察者协议', 'new Observable(fn) 中 fn 接收 observer 并返回 teardown'],
      ['teardown 函数', '订阅取消时执行的清理逻辑'],
    ],
    [
      '自定义源创建了定时器却不返回清理函数，订阅取消后定时器仍在跑。',
      '在源内部直接操作外部可变状态而不封装进 teardown，导致多次订阅互相干扰。',
    ],
  ),
  'practice',
)
