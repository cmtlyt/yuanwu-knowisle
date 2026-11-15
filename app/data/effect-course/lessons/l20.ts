import { L, withKind } from '../../course-builders.ts'

export const L20 = withKind(
  L(
    'L20',
    4,
    '★ Scheduler：协作让出与公平性',
    5,
    ['L19'],
    ['scheduler'],
    [
      '解释 MixedScheduler 与 MaxOpsBeforeYield 默认值的公平性含义',
      '说清协作让出与抢占式调度的差别',
      '读懂 CPU 密集任务饿死其他 Fiber 的原因',
      '判断什么时候该显式让出',
    ],
    `
### 一个同步任务让整站的请求排队

上线后偶发「所有接口同时变慢」，但数据库与外部依赖都正常。最后定位到一段纯计算：某个报表任务在同一次请求里做了大量同步循环，中间没有任何异步边界。由于运行时是协作式调度，这段循环不主动让出，其它 Fiber 就一直排不上队，直到它跑完。**这不是死循环，也不是 CPU 不够，而是「没给运行时一个可以插手的点」**。v4 的默认 MixedScheduler 用 \`MaxOpsBeforeYield\` 配额兜底（默认 2048），但理解配额为什么存在，比记住数字重要得多。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 协作让出与抢占式调度的差别，公平性由什么保证 | 指令怎么被解释（L19）、Fiber 保存什么（L18） |
| CPU 密集任务为什么会饿死其它 Fiber，配额怎么兜底 | 结构化并发与级联中断（L21） |
| 怎样用断言验证「让出之后其它任务有机会跑」 | Channel 与中断竞态（L22） |

### 两种调度模型

| 维度 | 抢占式（线程） | 协作式（Fiber） |
|---|---|---|
| 谁决定切换 | 内核按时间片强制切换 | 任务在明确边界主动让出 |
| 上下文成本 | 高，需要完整栈 | 低，continuation 是堆上数据 |
| 长同步任务 | 不会独占，时间片到就切 | 会独占，除非触达配额 |
| 可预测性 | 差，切换点不受控 | 好，切换点可枚举 |
| 兜底机制 | 不需要 | MaxOpsBeforeYield 配额 |

最后一行是这课的关键：协作式把控制点交给任务，换成低成本与可预测性，代价是必须有个「万一任务忘了让出」的兜底。配额不是性能优化，而是**公平性的最低保证**——连续执行超过配额后，运行时会插入一次让出，把执行权交回调度队列。

### 真实写法

\`\`\` title="显式让出点" note="Effect.yieldNow 是主动把执行权交回调度器的指令；长同步计算里应显式插入。"
import { Effect } from "effect"

const heavy = (n: number) =>
  Effect.gen(function* () {
    let acc = 0
    for (let i = 0; i < n; i += 1) {
      acc += i
      if (i % 2_048 === 0) yield* Effect.yieldNow
    }
    return acc
  })
\`\`\`

把 \`yieldNow\` 放在循环里，等于亲手给运行时一个可插入的点。默认配额能兜底大多数情况，但显式让出让「这一段很重」成为代码里可读的事实，也让评审时能问一句「这个粒度合适吗」。

### 配额调度器与公平性断言

\`\`\` title="协作让出的最小模型" note="自包含程序，只依赖 node:assert；验证无让出会饿死其它任务、配额能恢复公平。"
import assert from "node:assert/strict"

type Task = { id: string; ops: number; yieldEvery: number; done: number }
const task = (id: string, ops: number, yieldEvery: number): Task => ({ id, ops, yieldEvery, done: 0 })

const QUOTA = 2_048

const schedule = (tasks: Task[], withQuota: boolean): { order: string[]; yields: number } => {
  const queue = tasks.slice()
  const order: string[] = []
  let yields = 0
  while (queue.length) {
    const t = queue.shift()!
    let slice = 0
    while (t.done < t.ops) {
      t.done += 1
      slice += 1
      const shouldYield = t.yieldEvery > 0 && t.done % t.yieldEvery === 0
      const quotaHit = withQuota && slice >= QUOTA
      if (shouldYield || quotaHit) {
        yields += 1
        break
      }
    }
    order.push(t.id)
    if (t.done < t.ops) queue.push(t)
  }
  return { order, yields }
}

// 错误情形：重任务从不让出且无配额，轻任务被排到它跑完才执行
const starved = schedule([task("heavy", 20_000, 0), task("light", 1, 0)], false)
assert.deepEqual(starved.order, ["heavy", "light"], "无让出、无配额时确实饿死")
assert.equal(starved.yields, 0)

// 修订情形 A：显式让出
const explicit = schedule([task("heavy", 20_000, 2_048), task("light", 1, 0)], false)
assert.ok(explicit.order.indexOf("light") < explicit.order.length - 1, "让出后轻任务提前执行")
assert.ok(explicit.yields > 0)

// 修订情形 B：默认配额兜底
const quota = schedule([task("heavy", 20_000, 0), task("light", 1, 0)], true)
assert.ok(quota.yields > 0, "配额必须插入让出")
assert.ok(quota.order.indexOf("light") < quota.order.indexOf("heavy") + 3)

// 配额本身不能改变计算结果
const single = schedule([task("only", 5, 0)], true)
assert.equal(single.yields, 0, "短任务不该被无谓打断")
console.log("t1 通过：复现饿死、显式让出与配额都能恢复公平")
\`\`\`

第一条断言故意复现事故：重任务不让出、调度器也不兜底时，轻任务只能排在最后。最后一条断言同样重要——**配额只影响什么时候切，不影响算出来是什么**；如果加配额改变了结果，说明切换点被写进了业务逻辑，那是另一个 bug。

### 什么时候该显式让出

| 情形 | 做法 | 理由 |
|---|---|---|
| 纯同步长循环 | 按固定步长插 yieldNow | 没有天然异步边界 |
| 已是异步密集的流程 | 依赖默认配额即可 | 每个异步边界本来就会让出 |
| 每一步都很重但步数少 | 每步之后让出 | 配额按指令数计，不按时长 |
| 实时性要求高的同进程任务 | 缩小让出步长 | 降低最坏等待时间 |

第三行常被忽略：配额数的是指令条数，不是毫秒。一条指令里做一秒的计算，配额也拦不住，所以「每步很重」的场景必须自己插点。

:::deep

### 公平性为什么必须是运行时的责任

一个自然的想法是「让写业务的人记得让出就行」。这在单任务 demo 里成立，在真实服务里不成立：任何一段第三方库里的同步循环都可能悄悄占住运行时，而调用方看不到它的内部。把公平性收进运行时，用配额兜底，等于把「不饿死别人」变成系统级保证，而不是每位作者的自觉。反过来说，协作式调度给出的可预测性也正来自这里：切换点是显式或配额触发的，能枚举、能测试、能在压测里复现；抢占式调度虽然不存在饿死问题，但切换点不可控，状态竞争更难排查。两种模型没有绝对优劣，区别在**代价由谁承担**：抢占式由内核与内存承担，协作式由运行时契约与少量显式让出承担。

:::

:::warn

### 三个与调度有关的误判

第一件是以为「加了机器就能解决同时变慢」，开头的事故里所有接口一起排队，扩容只是多几个一起排队的进程。第二件是在同步循环里把 \`yieldNow\` 插得极密（每几步一次），调度开销反而吃掉大部分收益，且掩盖了「这段计算本该拆成批处理」的设计问题。第三件是把配额数字当成性能参数去调大，觉得「少切换更快」，结果长任务的最坏等待时间成倍上升，P99 明显恶化。三者都不会报错，且都只在混合负载下显现。排查顺序建议固定：先看有没有从不让出的同步段，再看让出粒度，最后才动配额；t1 的三组对照正好可以按这个顺序复用。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 无让出无配额时轻任务确实被饿死 | 回归集没复现问题，护栏形同虚设 |
| 显式让出后轻任务提前执行 | 让出点没有真正交出执行权 |
| 配额能插入让出 | 默认公平性兜底失效 |
| 配额不改变计算结果 | 切换点污染了业务逻辑 |
| 短任务不被无谓打断 | 调度开销被浪费在无需切换的路径上 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L19 runLoop | 指令怎么被推进、continuation 在哪 | 推进循环里的让出触发点 |
| L21 结构化并发 | 父级结束时怎么统一中断多个 Fiber | 可交回执行权的调度队列 |
| L26 渐进落地 | 生产环境的负载特征与配额调优 | 「配额只改时机不改结果」 |
`,
    'scheduler',
    [
      {
        text: '默认操作预算是多少，超了会怎样？',
        options: ['16 次，抛错', '2048 次，插入 yieldNow 让出', '无限，不让出', '由 GC 决定'],
        answer: 1,
        explain: 'MaxOpsBeforeYield 默认 2048，shouldYield 命中即协作让出。',
        concept: 'scheduler',
      },
      {
        text: '调度队列的优先级规则是？',
        options: ['数值越大越先', '数值越小越先，同优先级 FIFO', '完全随机', '按 fiber id 排序'],
        answer: 1,
        explain: '低数值优先、同级 FIFO，便于确定性测试。',
        concept: 'scheduler',
      },
    ],
    [
      ['协作式调度', 'fiber 在明确的让出点交出执行权，而非被抢占'],
      ['MixedScheduler', '默认调度器，支持 sync / async 模式与优先级队列'],
    ],
    [
      '把 Effect 的并发理解成多线程并行——JS 宿主仍是单线程。',
      '为了「快」把 PreventSchedulerYield 全局打开，结果是长任务饿死 I/O。',
    ],
  ),
  'theory',
)
