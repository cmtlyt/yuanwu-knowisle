import { L, withKind } from '../../course-builders.ts'

export const L22 = withKind(
  L(
    'L22',
    5,
    '调度器：把时间注入系统',
    3,
    ['L01'],
    ['c-scheduler'],
    [
      '说清调度器把「何时 / 在哪里执行」从计算里分离出来的机制',
      '解释同步调度、异步调度与虚拟时间的差别',
      '对照 observeOn / subscribeOn 的作用位置',
      '说清为什么测试要用 TestScheduler 而不是真实时钟',
    ],
    `
### 一次事故：同一段逻辑，测试里过了、生产里慢了半拍

一个递归聚合任务在开发机上跑得好好的，到了浏览器里却把主线程卡住几百毫秒，动画掉帧；配套的测试用真实 \`setTimeout\` 等待，CI 上偶尔因为机器负载超时失败，重跑又通过。两处问题看起来一个是性能、一个是稳定性，根子却是同一个：**「什么时候执行」被硬编码在业务逻辑里**——同步递归直接压栈，测试直接依赖真实时钟。RxJS 的 Scheduler 把「何时 / 在哪个任务队列上执行」抽成可注入的依赖，于是同一段计算既能在宏任务里让出主线程，也能在虚拟时间里被精确断言。这节课讲清这个抽象，以及 \`subscribeOn\` / \`observeOn\` 各自作用在链路的哪一段。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 调度器抽象了什么 | 「何时执行」与「在哪个任务队列执行」，与「计算什么」解耦 |
| \`subscribeOn\` 管哪一段 | 建立订阅与首次发射的时机 |
| \`observeOn\` 管哪一段 | 每个值在哪个任务上被下游消费 |
| 虚拟时间为什么重要 | 让时间算子可精确断言、不依赖真实时钟，测试不再 flaky（L26） |

### 四种调度器对照表

| 调度器 | 执行队列 | 典型用途 | 误用后果 |
|---|---|---|---|
| \`queueScheduler\` | 微任务 / 同步队列 | 递归调度、避免爆栈 | 长任务仍占住当前调用栈 |
| \`asyncScheduler\` | 宏任务（setInterval 风格） | 让出主线程、定时执行 | 高频值产生大量宏任务 |
| \`asapScheduler\` | 微任务优先，溢出到宏任务 | 尽快但不压栈 | 与 queue 的边界容易混淆 |
| \`animationFrameScheduler\` | 渲染帧 | 动画、与绘制对齐的更新 | 后台标签页帧率下降 |

表里前两行是最常用的一组：\`queueScheduler\` 让递归「排队执行」而不是层层压栈，\`asyncScheduler\` 把工作推到下一个宏任务，给浏览器留出绘制机会。第三行的 \`asapScheduler\` 处在两者之间，7.8.2 里它是「微任务优先、溢出到宏任务」的默认异步选择；第四行与渲染帧绑定，适合把高频值收敛成一帧一次的更新。选型的本质不是「哪个更快」，而是**你希望这段计算占用哪一种任务队列**。

| 维度 | \`subscribeOn\` | \`observeOn\` |
|---|---|---|
| 作用位置 | 订阅建立与首次发射 | 每个值向下游交付时 |
| 影响范围 | 一次性 | 逐个值 |
| 多次使用的效果 | 以最靠近源的一处为准 | 每出现一次就再切换一次队列 |
| 常见用途 | 把冷源的订阅动作挪到别的队列 | 把密集计算的结果切回渲染帧 |

\`\`\`ts title="把时间注入链路" note="subscribeOn 决定何时订阅，observeOn 决定值在哪个队列被消费；所有操作符从 rxjs/operators 导入。"
import {
  of,
  interval,
  timer,
  asyncScheduler,
  queueScheduler,
  animationFrameScheduler,
} from "rxjs"
import { subscribeOn, observeOn, take, map, tap } from "rxjs/operators"

// ① 把订阅动作挪到宏任务：不阻塞当前调用栈
of(1, 2, 3)
  .pipe(subscribeOn(asyncScheduler), map((n) => n * 2))
  .subscribe((n) => console.log("async", n))

// ② 把每个值的交付切到渲染帧：动画更新与绘制对齐
interval(16)
  .pipe(take(60), observeOn(animationFrameScheduler))
  .subscribe((frame) => console.log("frame", frame))

// ③ 递归调度用 queueScheduler：排队执行而非层层压栈
const recursive$ = of(0).pipe(
  map((n) => n + 1),
  take(5),
  subscribeOn(queueScheduler),
)
recursive$.subscribe(console.log)

// ④ 时间源同样可以显式给调度器；虚拟时间测试（L26）会替换它
const ticks$ = timer(0, 100, asyncScheduler).pipe(
  tap((n) => console.log("tick", n)),
  take(3),
)
ticks$.subscribe()

void interval(1000).pipe(take(1)).subscribe()
\`\`\`

### 用最小模型把「时间可注入」变成可断言的事实

下面不依赖 RxJS 包，实现一个虚拟调度器：任务按虚拟时刻排队，\`flush()\` 一次性跑完，不等待任何真实时间；再用负例说明「不注入时间」时执行顺序完全由调用顺序决定。

\`\`\`ts
import assert from "node:assert/strict"

type Task = { at: number; seq: number; run: () => void }

class VirtualScheduler {
  private queue: Task[] = []
  private clock = 0
  private seq = 0

  schedule(delay: number, run: () => void): void {
    this.queue.push({ at: this.clock + delay, seq: this.seq++, run })
  }
  flush(): void {
    while (this.queue.length > 0) {
      this.queue.sort((a, b) => a.at - b.at || a.seq - b.seq)
      const task = this.queue.shift()!
      this.clock = task.at
      task.run()
    }
  }
  now(): number { return this.clock }
}

const log: string[] = []
const s = new VirtualScheduler()
s.schedule(30, () => log.push("c"))
s.schedule(10, () => log.push("a"))
s.schedule(20, () => log.push("b"))
assert.equal(s.now(), 0, "flush 之前虚拟时钟不前进")

// 同一段业务逻辑，换成「直接同步执行」的负例
const syncLog: string[] = []
const syncRun = () => { syncLog.push("c"); syncLog.push("a"); syncLog.push("b") }
syncRun()
assert.deepEqual(syncLog, ["c", "a", "b"], "不注入时间时顺序 = 调用顺序")

s.flush()
assert.deepEqual(log, ["a", "b", "c"], "虚拟调度按时间戳排序，与调用顺序无关")
assert.equal(s.now(), 30, "flush 后时钟停在最后一个任务，不依赖真实等待")

// 嵌套调度必须在同一时钟下继续排入队列
const s2 = new VirtualScheduler()
const nested: string[] = []
s2.schedule(10, () => {
  nested.push("first")
  s2.schedule(5, () => nested.push("later"))
})
s2.flush()
assert.deepEqual(nested, ["first", "later"], "嵌套任务按虚拟时间继续推进")
assert.equal(s2.now(), 15)
\`\`\`

第三组断言是本课的落点：调度器不只是「延时执行」，它还提供了**一个可被替换的时钟**。真实运行时这个时钟由 \`asyncScheduler\` 驱动，测试时换成 \`TestScheduler\`（L26），业务代码一行都不用改。把 \`now()\` 做成可查询的数据，时间相关逻辑就从「等一会儿看看」变成了「断言第几帧发生什么」。

### 一次任务调度的完整推演

以 \`schedule(30, c)\`、\`schedule(10, a)\`、\`schedule(20, b)\` 为例：

| 轮次 | 虚拟时钟 | 取出的任务 | 执行后队列 | 日志 |
|---|---|---|---|---|
| 0 | 0 | 无（尚未 flush） | a(10)、b(20)、c(30) | 空 |
| 1 | 10 | a | b(20)、c(30) | a |
| 2 | 20 | b | c(30) | a、b |
| 3 | 30 | c | 空 | a、b、c |

把这张表与「直接同步执行」的负例对照，能清楚看到调度器的两项能力：**重排**（按时间而非调用顺序）与**可冻结**（flush 之前时钟不动）。前者让 \`debounceTime\` / \`bufferTime\` 这类时间算子有统一实现（L23），后者让它们可被精确测试（L26）。两个能力都来自「把时间变成数据」这一件事。

:::deep

### 调度器不是「更快的定时器」

常见的误解是把 Scheduler 当成 \`setTimeout\` 的替代品，于是问「用哪个调度器性能更好」。但调度器抽象的是**执行上下文**，不是速度：\`queueScheduler\` 可能比 \`asyncScheduler\` 更早执行，却更容易长时间占住调用栈；\`animationFrameScheduler\` 在后台标签页里几乎停摆，却正是动画需要的语义。真正的设计收益在可组合性与可测试性：时间算子只需要面向 Scheduler 编程，不必关心底层是宏任务、微任务还是虚拟帧；测试只需要换一个 Scheduler，不必改业务代码。这与 L01「把时间装进值里」是同一条主线的两面——前面把时间变成可传递的数据，这里把「何时执行」变成可注入的依赖，两者合起来才让「一段时间里的序列」真正可检查、可组合、可回归。

:::

:::warn

### 三个调度器踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 用真实 \`setTimeout\` 测时间算子 | CI 负载高时偶发超时，重跑又通过 | 注入 \`TestScheduler\`，用虚拟时间断言（L26） |
| 把 \`observeOn\` 当成 \`subscribeOn\` | 想让订阅异步，结果每个值都被切换队列，开销暴涨 | 记住作用位置：订阅建立 vs 每个值 |
| 在高频流上层层叠加 \`observeOn\` | 每个值跨多个任务队列，延迟与调度开销叠加 | 一处切换即可；动画场景统一切到渲染帧 |

第二条尤其容易被忽略：\`subscribeOn\` 只影响「建立订阅 + 首次发射」，对后续值不起作用；想让整条流的消费都异步，需要 \`observeOn\`。反过来，若只是想让冷源的订阅动作不阻塞当前调用栈，用 \`observeOn\` 是无效的——订阅已经同步发生了。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 依赖注入 | 同一段逻辑在真实与虚拟调度器下结果一致 |
| 重排 | 虚拟调度按时间戳执行，与调用顺序无关 |
| 可冻结 | flush 之前 \`now()\` 为 0，flush 后停在最后任务 |
| 嵌套 | 任务内再调度仍在同一虚拟时钟下推进 |
| 作用位置 | 能说清 subscribeOn 与 observeOn 各管哪一段 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L01 描述与执行分离 | 订阅才执行、时间语义存在 | 本课把「何时执行」进一步抽成可注入依赖 |
| L12 有界并发 | 同时在跑的内流数 | 本课不管并发数，只管任务队列 |
| L23 时间算子 | 防抖 / 节流 / 采样的窗口语义 | 本课只提供它们依赖的调度器 |
| L26 marble 测试 | 用 TestScheduler 冻结时间做断言 | 本课给出虚拟时钟模型，不写 marble |
| L25 背压落地 | 批量整形与容量控制 | 本课不处理生产快于消费者 |
`,
    'rxScheduler',
    [
      {
        text: '「让后续每个值都在微任务队列里被处理」应使用？',
        options: ['subscribeOn(queueScheduler)', 'observeOn(queueScheduler)', 'map', 'startWith'],
        answer: 1,
        explain: 'observeOn 控制每个值的消费时机；subscribeOn 只管订阅与首发射，不改变后续值的调度。',
        concept: 'c-scheduler',
      },
      {
        text: '做 UI 动画、希望发射对齐渲染帧，选哪个调度器？',
        options: ['queueScheduler', 'animationFrameScheduler', 'timer', 'asapScheduler'],
        answer: 1,
        explain: 'animationFrameScheduler 把执行对齐 requestAnimationFrame，避免与渲染争抢主线程。',
        concept: 'c-scheduler',
      },
      {
        text: '「让后续每个值都在宏任务队列里被消费」应使用？',
        options: ['subscribeOn(asyncScheduler)', 'observeOn(asyncScheduler)', 'map(fn)', 'delay(0)'],
        answer: 1,
        explain: 'observeOn 控制每个值在哪个调度器上被处理；subscribeOn 只影响订阅与首次发射的时机。',
        concept: 'c-scheduler',
      },
    ],
    [
      ['Scheduler', '把「时间/节奏」抽离为可注入依赖'],
      ['subscribeOn / observeOn', '分别控制订阅时机与值消费时机'],
    ],
    [
      '混用 subscribeOn 与 observeOn，期望「整条流异步」却只异步了首发射。',
      '在高并发 UI 里默认用宏任务调度，主线程被阻塞、动画掉帧。',
    ],
  ),
  'theory',
)
