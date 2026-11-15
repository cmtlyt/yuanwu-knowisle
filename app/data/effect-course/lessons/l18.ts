import { L, withKind } from '../../course-builders.ts'

export const L18 = withKind(
  L(
    'L18',
    4,
    'Fiber：虚拟线程与运行中的 Effect',
    3,
    ['L07'],
    ['fiber'],
    [
      '解释 Fiber 作为虚拟线程与操作系统线程的区别',
      '说清 forkChild / forkDetach / forkScoped / forkIn 的生命周期差异',
      '读懂 Fiber 状态与中断信号的关系',
      '判断一个并发任务该用哪种 fork',
    ],
    `
### 以为 fork 开了线程，结果内存先爆了

批处理里有人用 fork 起了几万个并行任务，理由是「反正 Fiber 是轻量线程，多开点没关系」。进程没崩在 CPU，而是崩在内存：每个 fork 都带着自己的栈片段、状态与中断入口，且没有任何人 join，几万个运行中的 Fiber 同时挂着。复盘时最需要纠正的一句话是：**Fiber 不是线程，它是一段可被运行时挂起与恢复的计算状态**。轻量不等于免费，更不等于不需要生命周期管理。这一课把四种 fork 的归属关系与 Fiber 的状态拆开。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| Fiber 与操作系统线程的区别，以及它到底保存了什么 | runLoop 怎么解释指令（L19）、调度器怎么分配时间（L20） |
| forkChild / forkDetach / forkScoped / forkIn 各自的生命周期归属 | 结构化并发的父子树与级联中断（L21） |
| 怎样用状态机断言验证「fork 返回句柄、join 才拿结果」 | Channel 与中断竞态（L22） |

### 虚拟线程里装的是什么

| 维度 | 操作系统线程 | Fiber |
|---|---|---|
| 谁调度 | 内核抢占式调度 | 运行时协作式调度 |
| 栈 | 独立的完整调用栈 | 一段可保存的 continuation |
| 创建成本 | 高，通常几百个就吃紧 | 低，可以成千上万 |
| 挂起 | 由内核切换上下文 | 遇到异步边界就把状态交给运行时 |
| 取消 | 没有统一语义 | 一等中断信号，可级联 |

Fiber 保存的是「接下来还要执行哪几步」以及这条链上的上下文，而不是一整个线程栈。这解释了开头的内存问题：虽然单个 Fiber 很轻，但几万个未完成的 continuation 加上各自持有的引用，依然会堆满堆；**轻量是相对线程而言，不是相对无限而言**。

### 四种 fork 的归属

| 方式 | 生命周期挂在谁身上 | 父级结束时 | 适用场景 |
|---|---|---|---|
| forkChild | 当前 Fiber | 自动中断 | 绝大多数子任务 |
| forkScoped | 当前 Scope | Scope 关闭时中断 | 与资源同生命周期的任务 |
| forkIn | 指定 Scope | 该 Scope 关闭时中断 | 跨层共享一个作用域 |
| forkDetach | 不挂任何父级 | 继续运行 | 明确要脱离父级的守护任务 |

最后一行是例外而不是默认。把它当默认用，就等于放弃了 L07 那条「不持有句柄就无法收尾」的保障；开头的事故虽然不是 detach 写的，但「起了几万个没人管」的效果完全一样。

### 真实写法

\`\`\` title="fork 与 Fiber 句柄" note="Fiber.join 等待结果，Fiber.interrupt 主动中断；两者都作用于同一个句柄。"
import { Effect, Fiber } from "effect"

const program = Effect.gen(function* () {
  const child = yield* Effect.forkChild(Effect.succeed(42))
  const scoped = yield* Effect.forkScoped(Effect.succeed("scoped"))
  const value = yield* Fiber.join(child)
  yield* Fiber.interrupt(scoped)
  return value
})
\`\`\`

注意 \`forkChild\` 返回的是 Fiber 句柄，不是结果值。把句柄直接拿去用，是这一步最常见的类型误判；L07 已经用断言钉过一次，这里补上它在运行时层的意义：句柄是唯一能 join 与 interrupt 的入口。

### Fiber 状态机与断言

\`\`\` title="Fiber 状态与 join / interrupt" note="自包含程序，只依赖 node:assert；验证状态迁移、句柄语义与级联归属。"
import assert from "node:assert/strict"

type State = "running" | "done" | "interrupted"
type Fiber<A> = {
  readonly id: number
  state: State
  value?: A
  parent: number | null
  join: () => A | undefined
  interrupt: () => void
}

let nextId = 1
const fork = <A>(value: A, parent: number | null, delayMs: number): Fiber<A> => {
  const f: Fiber<A> = {
    id: nextId++,
    state: "running",
    parent,
    join: () => (f.state === "done" ? f.value : undefined),
    interrupt: () => {
      if (f.state === "running") f.state = "interrupted"
    },
  }
  setTimeout(() => {
    if (f.state === "running") {
      f.value = value
      f.state = "done"
    }
  }, delayMs)
  return f
}

const root: Fiber<number> = { id: 0, state: "done", value: 0, parent: null,
  join: () => 0, interrupt: () => {} }
const children = [fork(1, root.id, 1), fork(2, root.id, 50), fork(3, root.id, 50)]

assert.ok(children.every((c) => c.state === "running"), "fork 后处于运行中")
assert.equal(children[0]!.join(), undefined, "未完成前 join 拿不到结果")
const parentInterrupt = () => {
  for (const c of children) if (c.state === "running") c.interrupt()
}
parentInterrupt()
assert.equal(children.filter((c) => c.state === "interrupted").length, 3, "父级结束级联中断")
assert.ok(children.every((c) => c.parent === root.id), "子 Fiber 必须挂在父级上")

// 独立完成的 Fiber 不受后续中断影响
const done = fork(9, null, 1)
await new Promise((r) => setTimeout(r, 5))
assert.equal(done.state, "done")
done.interrupt()
assert.equal(done.state, "done", "已完成的 Fiber 不应被回退")
console.log("t1 通过：状态迁移、句柄语义、级联归属")
\`\`\`

t1 的第二条断言把 L07 的「句柄不是结果」在运行时层重述了一遍；最后一条断言则说明中断不是回滚——已经完成的计算不会被抹掉，这也是为什么幂等与补偿要在业务层设计，而不能指望运行时撤销副作用。

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L19 runLoop | 运行中的 continuation 到底怎么被解释 | 可挂起、可恢复的计算状态 |
| L20 Scheduler | 哪些 Fiber 先跑、什么时候让出 | 运行时可调度的 Fiber 集合 |
| L21 结构化并发 | 父子 Fiber 树与统一回收 | 句柄与 parent 归属 |

:::deep

### 为什么协作式调度反而更适合大量并发

抢占式线程不需要任务主动配合，听起来更省心；但它的代价是每个线程都要有独立的栈与内核上下文，数量一上来内存与切换成本就压不住。Fiber 把调度权收进运行时，任务只在明确的异步边界让出，于是「当前执行到哪一步」可以被压成一段数据结构而不是一整个栈。更重要的是中断语义：运行时知道每个 Fiber 的父子归属与当前步骤，父级结束能精确级联，而线程模型里没有这种结构信息，只能靠标志位与超时硬杀。反过来说，协作式也有明确代价——**一个不让出的 CPU 密集任务会饿死同一运行时里的其它 Fiber**，这正是 L20 要解决的问题。理解 Fiber 的关键不是「它多轻」，而是「它把调度与中断都变成了运行时可操作的数据」。

:::

:::warn

### 三个与 Fiber 生命周期有关的坑

第一件是 fork 之后既不 join 也不 interrupt，开头的内存事故属于此类；测试跑得快，任务恰好在进程退出前完成，生产一缩容就丢。第二件是把 forkDetach 当默认，理由往往是「不想让父级影响它」，结果是所有脱离父级的任务都没有统一收尾入口，异常与资源全部外泄。第三件是在异步回调里保存 Fiber 句柄却跨作用域使用，父 Scope 已关闭，句柄指向的 continuation 再也拿不到上下文。三者都不报编译错误，且都只在并发或缩容路径显现。排查时先数「运行中的 Fiber 有多少、各挂在谁身上」，比看 CPU 曲线有用得多；t1 的 parent 归属断言就是这条检查的最小形式。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| fork 后状态为 running，join 返回 undefined | 把句柄当结果消费 |
| 父级结束级联中断所有未完成子 Fiber | 子任务脱离归属，缩容时泄漏 |
| 每个子 Fiber 都有 parent | 无法统一回收 |
| 已完成 Fiber 不被中断回退 | 误以为运行时会撤销副作用 |
| forkDetach 只在明确场景出现 | 默认放弃生命周期管理 |
`,
    'fiber',
    [
      {
        text: 'Fiber<A, E> 为什么没有 R 参数？',
        options: ['设计遗漏', '它执行的是依赖已满足的 effect', 'R 被合并进 E', '只有 run* 才有 R'],
        answer: 1,
        explain: 'requirements 在 fork 之前已被 provide 消解。',
        concept: 'fiber',
      },
      {
        text: '想拿到 fiber 的失败／中断详情用？',
        options: ['Fiber.join', 'Fiber.await（返回 Exit）', 'Effect.map', 'Effect.provide'],
        answer: 1,
        explain: 'join 给结果，await 给 Exit 完成信息。',
        concept: 'fiber',
      },
    ],
    [
      ['虚拟线程', '由 runtime 在单线程上模拟的逻辑执行单元'],
      ['Fiber handle', '对一次运行中计算的引用，可 join / await / interrupt'],
    ],
    ['把 Fiber 直接 yield*，或把它当成 Promise 去 await。'],
  ),
  'theory',
)
