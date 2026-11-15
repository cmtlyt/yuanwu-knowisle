import { L, withKind } from '../../course-builders.ts'

export const L01 = withKind(
  L(
    'L01',
    0,
    '动机与起步：TypeScript 的缺口与第一次运行',
    1,
    [],
    ['program-value', 'runners'],
    [
      '说清 Promise / try-catch 在生产代码里的四类结构性缺陷',
      '搭好 effect@4.1.4 最小工程并跑通第一个 Effect',
      '写出 runSync / runPromise / runFork / run*With 四种运行边界的对照程序',
      '用断言验证「描述」与「执行」已被分离',
    ],
    `
### 一次上线后发现重试逻辑根本没生效

某次把订单查询从 Promise 改成带重试的实现，代码评审时所有人都看到了 retry 循环，上线后却发现在数据库超时的那条路径上完全没有重试。排查半天，原因不在循环里：获取订单的函数在构造时就发出了请求，重试的地方拿到的已经是一个 rejected Promise，重试只是把同一个失败结果重新读了几遍。事后复盘写下的那句话，成了这门课第一课的起点：**副作用一旦在描述阶段发生，后面所有关于重试、超时、取消的组合就都失去了对象**。这不是某个库的 API 用错了，而是 TypeScript 的类型系统能描述数据、却描述不了程序这件事，在具体工程里第一次露出代价。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 为什么必须把「描述程序」和「执行程序」拆成两个动作，以及拆开之后第一步怎么落地 | 三通道类型每个参数的完整语义（L02）、pipe 与 gen 的等价性（L03）、构造子全景（L04） |
| Promise / try-catch 组合在生产代码里具体漏掉了哪四类保证 | Fiber、Scheduler、runLoop 等运行时内部实现（S4 整段） |
| 怎样用一组可运行断言证明「描述阶段零副作用」 | Layer 依赖注入、Scope 资源安全（S3）与 Stream 背压（S5） |

一句话内核：**下一步由运行边界决定，而不是由函数被调用的那一刻决定。** 后面 25 课讲的所有机制，都是这句话在不同维度上的展开。

### 四个结构性缺口

先看清楚到底漏了什么。下面四行不是「Effect 的优点清单」，而是四种可以在现有代码里逐条复现的失效模式：只要写出对应的最小例子，就能看到缺口本身。

| 缺口 | 在 Promise / try-catch 里的表现 | 拆开描述与执行之后的对应机制 |
|---|---|---|
| 错误无类型 | catch 收到的错误是 unknown，只能靠猜，Promise 的 rejection 不带类型信息 | 预期失败写进 E 通道，恢复策略可以只对某一类错误生效 |
| 依赖靠传参 | 配置、连接池、Logger 层层透传，测试替换实现要改动整条调用链 | 需求写进 R 通道，运行前统一装配，调用链不感知 |
| 取消不安全 | AbortSignal 需要手工串联，超时与资源清理容易竞态泄漏 | 中断是运行时的一等语义，finalizer 与中断绑定 |
| 并发无结构 | Promise.all 一个失败，其余任务仍在后台跑，无法统一回收 | 子任务挂在父作用域上，父级结束即级联中断 |

注意四行里没有一行是「语法更优雅」。它们都是可以在事故报告里写清楚具体后果的东西：错误被误判、测试改不动、资源没释放、后台任务泄漏。**如果一段重构只让代码变短却没解决这四条里的任何一条，那它只是换了一种写法。**

### 最小工程：先把描述和执行分开

先装好锁定的版本，避免后面所有示例在不同小版本间漂移：

\`\`\` title="环境契约" note="全课统一 effect@4.1.4；Node 24 LTS，TypeScript 7。版本不一致时，运行边界相关的 API 形状会变化，示例结论不再成立。"
pnpm add effect@4.1.4
\`\`\`

第一段真实代码只做一件事：把「要做什么」写成值，把「什么时候做」留给运行边界。请特别留意 describe 被调用时并没有发出任何网络请求。

\`\`\` title="描述与执行的第一次分离" note="describe 返回的是不可变蓝图，runPromise 是唯一把蓝图交给运行时的位置。"
import { Effect } from "effect"

class TodoError extends Error {
  constructor(readonly causeText: string) {
    super("todo fetch failed: " + causeText)
  }
}

// 描述：此刻什么都没发生，fetch 尚未被调用
const describe = (id: number) =>
  Effect.tryPromise({
    try: () => fetch("https://example.test/todos/" + id).then((r) => r.json()),
    catch: (e) => new TodoError(String(e)),
  })

// 组装：仍然是值，仍然没有副作用
const main = Effect.gen(function* () {
  const todo = yield* describe(1)
  return yield* Effect.succeed(todo)
})

// 执行：运行边界
Effect.runPromise(main).then(console.log)
\`\`\`

把这段改回 Promise 版本对照一下，差别不在行数，而在**时序**：Promise 版本在 getTodo(1) 求值那一刻就发了请求；Effect 版本在 runPromise 之前，整条链只是一个可传递、可检查、可重复解释的数据结构。这个差别决定了后面能不能对同一份程序叠加超时、重试、取消而不改动它本身。

### 用断言把「零副作用」钉死

光靠读代码确认「没有提前执行」不可靠，评审时会反复争论。更稳的做法是写一个不依赖网络、不依赖 effect 包的最小模型，把这条不变量变成可执行的断言。下面这段可以直接粘进 ts 文件跑，它模拟的正是 Effect 最核心的一层语义。

\`\`\` title="描述阶段零副作用的最小模型" note="自包含程序，只依赖 node:assert；用来验证语义，不替代真实库。"
import assert from "node:assert/strict"

type Blueprint<A> = { readonly tag: "blueprint"; readonly thunk: () => A }

const describe = <A>(thunk: () => A): Blueprint<A> => ({ tag: "blueprint", thunk })
const runSync = <A>(b: Blueprint<A>): A => {
  assert.equal(b.tag, "blueprint", "只有蓝图能被交给运行边界")
  return b.thunk()
}

let executed = 0
const program = describe(() => {
  executed += 1
  return 42
})

assert.equal(executed, 0, "构造蓝图不得触发副作用")
assert.equal(runSync(program), 42)
assert.equal(executed, 1, "只有运行边界执行一次")
const twice = [runSync(program), runSync(program)]
assert.deepEqual(twice, [42, 42], "同一蓝图可被重复解释，值本身不被消耗")
assert.equal(executed, 3)
console.log("t1 通过：描述与执行已分离")
\`\`\`

第三条断言最容易被忽略：蓝图不是一次性票据。同一个值可以被不同运行器解释多次，也可以被同一个运行器解释两次，这正是「程序即值」与「一次性 Promise」最硬的分界。事故里的重试之所以失效，就是因为拿到的已经是一个正在失败的执行结果，而不是一份还能重新解释的蓝图。

### 四种运行边界逐一跑通

runSync、runPromise、runFork、run*With 不是四个同义的启动函数，它们对**同步性、生命周期、上下文来源**各做了一个不同的选择。下面用同一套最小 Exit 模型把四种差异跑出来，每一种都配一条断言。

\`\`\` title="四种运行边界的对照程序" note="自包含程序；顶层 await 需要 ESM。runFork 用 AbortSignal 模拟可中断的独立 Fiber。"
import assert from "node:assert/strict"

type Exit<A> = { ok: true; value: A } | { ok: false; reason: string }
type Program<A> = {
  readonly run: (signal?: AbortSignal) => Exit<A> | Promise<Exit<A>>
}

const sync = <A>(value: A): Program<A> => ({
  run: () => ({ ok: true as const, value }),
})
const asyncOf = <A>(value: A): Program<A> => ({
  run: () => Promise.resolve({ ok: true as const, value }),
})
const withSignal = <A>(value: A): Program<A> => ({
  run: (signal) =>
    signal?.aborted
      ? { ok: false as const, reason: "interrupted" }
      : Promise.resolve({ ok: true as const, value }),
})

// runSync：纯同步蓝图，立即拿到 Exit
assert.deepEqual(sync(7).run(), { ok: true, value: 7 })

// runPromise：异步蓝图，等待 Promise 折叠成 Exit
assert.deepEqual(await asyncOf(8).run(), { ok: true, value: 8 })

// runFork：交给独立生命周期，调用方可随时中断
const controller = new AbortController()
const forked = withSignal(9).run(controller.signal)
controller.abort("caller no longer needs the result")
assert.ok(forked instanceof Promise, "fork 返回的是句柄，不是结果")
const abortedController = new AbortController()
abortedController.abort()
assert.deepEqual(withSignal(9).run(abortedController.signal), {
  ok: false,
  reason: "interrupted",
})

// run*With：上下文已构造好，直接交给运行器，无需再 provide 一层
const runWith = <A>(p: Program<A>, signal?: AbortSignal) => p.run(signal)
assert.deepEqual(runWith(sync(10)), { ok: true, value: 10 })
console.log("t2 通过：四种运行边界语义互不混淆")
\`\`\`

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 构造蓝图后副作用计数为 0 | 副作用漏到了描述阶段，后续所有组合都会失效 |
| 同一蓝图可重复运行且结果一致 | 把一次性执行结果当成了值，重试必然空转 |
| runSync 遇到异步边界要能明确拒绝 | 运行边界选错，同步假设会在生产环境崩掉 |
| runFork 返回句柄而非结果 | 少了中断入口，父级结束无法级联回收 |
| run*With 不再额外 provide 一层 | 上下文被重复装配，服务实例可能不是同一个 |

:::deep

### 为什么「程序即值」不是一句口号

把程序当成值，真正的收益不是可以到处传递，而是**可以对它做变换而不必重新写它**。超时、重试、日志、并发控制都是「接收一个程序、返回一个新程序」的函数；如果程序在被构造时就已经执行，这类函数就没有任何可操作的对象，只能退化成在执行前手工包裹一层，且每层都要自己处理错误与清理。这也解释了为什么 Effect 的算子看起来比 Promise 多得多：算子多不是功能堆叠，而是因为描述层确实存在，才有一整类「关于程序的程序」可以写。反过来说，评价一段代码有没有真正用上 Effect，不看它 import 了几个算子，只看一件事：**把运行边界那一行删掉，业务逻辑是否仍然完整存在**。删掉之后什么都不剩，说明写的还是立即执行的 Promise，只是换了层皮。

:::

:::warn

### 三个在第一次运行就会踩到的坑

第一个是把 runPromise 写进工具函数内部。表面上看调用方更省事，实际是把运行边界下沉到了组合链中间：上层再也无法对这段逻辑统一重试或超时，因为拿到的已经是一个 Promise，而不是可再解释的程序。第二个是用 Effect.sync 包住本来异步的调用，还以为 runSync 能跑通；同步运行器遇到异步边界会直接失败，这不是 bug，是运行时在替你守住契约。第三个是以为 Effect.succeed(x) 与 Promise.resolve(x) 等价，进而在构造子里放 await；前者只是描述「成功产出 x」，后者已经启动了一次异步计算。这三个坑的共同点是**边界被无意中提前**，排查时都表现为「重试没生效 / 取消没生效 / 资源没释放」，而不是语法报错，所以格外难在测试里发现。本课的四条验收断言就是为这类静默失效准备的。

:::

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L02 程序即值 | 三通道各自承载什么、never 的三种语义 | 一份可重复解释的惰性蓝图 |
| L03 组合的本质 | pipe 与 gen 为什么等价、类型如何沿链传播 | 运行边界只有一处，边界以内可以任意组合 |
| S1 构造与运行 | 更多构造子、Exit 折叠成业务结果 | 「构造不执行、执行只一次」这条不变量 |

到这一步为止，我们只证明了一件事：把描述和执行拆开是可行的，而且能用四条断言验证。至于拆开之后那个值里到底装了什么，是下一课要回答的。
`,
    'blueprint',
    [
      {
        text: 'Effect 与 Promise 最本质的区别是什么？',
        options: [
          'Effect 更快',
          'Effect 是惰性的程序描述，Promise 是立即启动的执行',
          'Effect 只能用于 Node.js',
          'Effect 不需要类型',
        ],
        answer: 1,
        explain:
          'Effect 值创建时什么也没发生，只有交给 run* 才由 runtime 解释执行。这正是 retry／timeout／并发能被做成普通算子的前提。',
        concept: 'program-value',
      },
      {
        text: '下面哪一项不是 Effect 直接解决的痛点？',
        options: ['错误类型化', '依赖注入', '资源安全释放', 'CSS 样式作用域'],
        answer: 3,
        explain: '前三项分别对应 E 通道、R 通道、Scope 与结构化中断；样式作用域与 effect system 无关。',
        concept: 'program-value',
      },
      {
        text: '一段含 Effect.promise 的程序用 runSync 执行会怎样？',
        options: [
          '正常返回 Promise',
          '遇到异步边界时抛错 / 无法同步完成',
          '自动降级为 runPromise',
          '返回 Exit',
        ],
        answer: 1,
        explain: 'runSync 只适用于纯同步蓝图；异步边界必须交给 runPromise / runFork。',
        concept: 'runners',
      },
      {
        text: '已经手动构造了 Context<R>，最直接的运行方式是？',
        options: [
          'Effect.provide 后 runPromise',
          'Effect.runPromiseWith(context)',
          'Effect.forkChild',
          'Effect.scoped',
        ],
        answer: 1,
        explain: 'v4 提供 run*With 系列，直接带 Context 运行，无需先包一层 provide。',
        concept: 'runners',
      },
    ],
    [
      ['副作用 (effect)', '与外部世界交互的行为，被建模成值而不是立即执行'],
      ['programs as values', '把程序本身当作可传递、可组合、可检查的不可变数据'],
      ['运行边界', '把惰性蓝图交给 runtime 解释执行的唯一位置'],
      ['default services', '不开任何配置就存在的日志／调度／追踪等默认服务'],
    ],
    [
      '把 Effect.succeed(x) 当成 Promise.resolve(x)：前者只是描述，后者已开始执行。',
      '以为引入 Effect 要重写整个项目——实际可以从最复杂的一小块开始渐进替换。',
      '在工具函数内部随手 runPromise，导致上层无法重试或统一超时。',
    ],
  ),
  'practice',
)
