import { L, withKind } from '../../course-builders.ts'

export const L07 = withKind(
  L(
    'L07',
    1,
    '运行边界与 Exit：把结果变成值',
    2,
    ['L06'],
    ['exit', 'runners'],
    [
      '实现 runPromise / runFork 两种运行边界并对比 Exit',
      '写出把 Exit 折叠成业务结果的函数',
      '跑通 Fiber 中断与 join 的验收断言',
      '识别在工具函数内部随手 runPromise 的破坏性',
    ],
    `
### 一个没人 join 的后台任务

批处理服务里有个分支用 fork 启动了清理任务，主流程拿着结果就返回了，测试环境一切正常。上到生产后，容器缩容时偶尔丢最后一批清理记录：任务还在跑，进程已经被回收。复盘时争论了很久「fork 到底算不算等」，最后发现问题根本不在等待，而在**把 Exit 当成异常、把 Fiber 句柄当成结果**这两件事上。主流程既没有把运行产物折叠成一个可检查的值，也没有持有可中断的句柄，于是既观察不到失败，也无法在退出前统一收尾。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| Exit 有哪几种形状，怎么把它折叠成业务结果而不丢失败信息 | 描述与执行为什么必须分离、四种边界的语义差别（L01） |
| runFork 返回的句柄该怎么 join / 中断，父级退出前如何统一回收 | Fiber 的运行时实现与调度（L18、L19） |
| 怎样用断言证明「在工具函数内部运行」会破坏上层组合能力 | Cause 的底层 reasons 结构（L09） |

### Exit 是把结果变成值的最后一步

\`runPromise\` 这类运行器并不「返回结果或抛异常」，它把整段程序的所有结局收进一个可检查的值：Exit。常见的形状有四种。

| 形状 | 含义 | 常见误判 |
|---|---|---|
| Success | 正常产出 A | 以为只有这一种，其它形状靠 try/catch 兜 |
| Failure | 以 E 中的某个预期错误终止 | 当成缺陷上报，触发不必要的告警 |
| Die | 出现未预期的缺陷 | 用 Effect.catch 去接，接不到 |
| Interrupted | 被父级或外部中断 | 当成失败重试，反复重启一个已被取消的任务 |

把 Failure 与 Die 混为一谈是最常见的代价：Failure 是业务上可以预期的分支，Die 是程序有 bug，两者的处理动作完全不同。L08、L09 会展开 Cause 的结构，这里只需要记住一件事：**运行之后不要立刻用 catch 包一层，先看 Exit 的形状**。

### 真实写法

\`\`\` title="运行边界与 Exit 折叠" note="runPromiseExit 把全部结局收进 Exit 值；顶层 await 需要 ESM。折叠动作留在最外层。"
import { Effect, Exit } from "effect"

class DbDown extends Error {}

const program = Effect.fail(new DbDown("connection lost"))

// 运行边界：把蓝图交给 runtime，结果仍是值
const exit = await Effect.runPromiseExit(program)

const fold = (e: Exit.Exit<never, DbDown>): string =>
  Exit.isSuccess(e) ? "ok" : Exit.isFailure(e) ? "recoverable" : "halted"

console.log(fold(exit))
\`\`\`

注意折叠函数放在最外层，链中间的每一步仍然返回 Effect。把运行边界下沉到工具函数内部，看起来省了一行，实际是让上层失去了对这段逻辑统一超时、重试、取消的能力——因为拿到的已经是一个结果值，而不是还能被解释的程序。

### Exit 折叠与句柄回收的可运行断言

下面两段自包含程序分别验证「结局不丢信息」与「父级退出前必须收尾」。它们不依赖 effect 包，刻画的是运行边界这一层的语义。

\`\`\` title="四种 Exit 形状与折叠" note="自包含程序，只依赖 node:assert；验证折叠函数能区分预期失败、缺陷与中断。"
import assert from "node:assert/strict"

type Exit<A, E> =
  | { tag: "success"; value: A }
  | { tag: "failure"; error: E }
  | { tag: "die"; defect: string }
  | { tag: "interrupted" }

class DbDown extends Error {}

const fold = <A, E>(e: Exit<A, E>): string => {
  switch (e.tag) {
    case "success":
      return "ok:" + String(e.value)
    case "failure":
      return "recoverable"
    case "die":
      return "bug"
    default:
      return "cancelled"
  }
}

assert.equal(fold({ tag: "success", value: 7 }), "ok:7")
assert.equal(fold({ tag: "failure", error: new DbDown("down") }), "recoverable")
assert.equal(fold({ tag: "die", defect: "TypeError" }), "bug")
assert.equal(fold({ tag: "interrupted" }), "cancelled")

// 折叠不能把 Failure 与 Die 合并成同一类
const exits: Exit<number, DbDown>[] = [
  { tag: "failure", error: new DbDown("down") },
  { tag: "die", defect: "TypeError" },
]
const folded = exits.map(fold)
assert.notEqual(folded[0], folded[1], "预期失败与缺陷必须可区分")
console.log("t1 通过：Exit 四种形状折叠后信息不丢")
\`\`\`

\`\`\` title="Fiber 句柄的 join 与中断" note="自包含程序；模拟 fork 返回句柄、join 拿结果、父级结束前统一回收。"
import assert from "node:assert/strict"

type Fiber<A> = {
  readonly id: number
  readonly state: { done: boolean; cancelled: boolean; value?: A }
  join: () => Promise<A | undefined>
  interrupt: () => void
}

let nextId = 1
const fork = <A>(value: A, delayMs: number): Fiber<A> => {
  const state = { done: false, cancelled: false, value: undefined as A | undefined }
  const timer = setTimeout(() => {
    if (!state.cancelled) {
      state.value = value
      state.done = true
    }
  }, delayMs)
  return {
    id: nextId++,
    state,
    join: async () => {
      await new Promise((r) => setTimeout(r, delayMs + 5))
      return state.value
    },
    interrupt: () => {
      clearTimeout(timer)
      state.cancelled = true
    },
  }
}

const children: Fiber<number>[] = [fork(1, 1), fork(2, 50), fork(3, 50)]
const parent = {
  async shutdown() {
    for (const c of children) if (!c.state.done) c.interrupt()
    return children.filter((c) => c.state.cancelled).length
  },
}

const first = await children[0]!.join()
assert.equal(first, 1, "join 拿到的是结果，不是句柄")
const cancelled = await parent.shutdown()
assert.equal(cancelled, 2, "父级结束前必须回收未完成的子任务")
assert.ok(children[1]!.state.cancelled && children[2]!.state.cancelled)
console.log("t2 通过：句柄可 join，父级退出统一中断")
\`\`\`

\`t2\` 对应开头那次事故：如果主流程直接返回、不调用 shutdown，两个还在跑的子任务就会随进程被回收。这里用 \`interrupt\` 表达「父级结束即级联中断」的雏形，S4 会讲运行时怎么用作用域把它自动化，但**「不持有句柄就无法收尾」这条判据在那一层依然成立**。

### 边界放在哪一层

| 位置 | 后果 | 判定 |
|---|---|---|
| 应用入口 main | 上层策略可统一叠加 | 正确 |
| 工具函数内部 | 上层拿到结果值，无法再组合 | 反模式 |
| 测试里 | 只验断言，不改变生产边界 | 可以 |
| 每个分支各一处 | 出现多个执行阶段，取消与超时语义分裂 | 反模式 |

:::deep

### 为什么「结果是值」比「结果或异常」更重要

异常处理模型里，失败走的是另一条控制流：调用栈展开、上下文丢失、恢复点必须提前埋好。Exit 把失败、缺陷、中断都变成普通数据之后，恢复逻辑就只是一个函数：接收 Exit、返回业务结果，可以被测试、被组合、被缓存，也可以原样存进日志供事后回放。这不是语法偏好，而是**把控制流问题转成数据问题**。一旦转成数据，L09 讲的 Cause 扁平 reasons 才有落脚点，L10 的恢复谓词才能写成纯函数。反过来看，如果一运行就 throw，后面所有关于诊断与恢复的机制都只能靠 try/catch 手工拼，且每拼一层就丢一点上下文。所以运行边界这一行代码的位置，决定的不只是「什么时候执行」，还决定了「失败信息能不能被完整地留下来」。

:::

:::warn

### 三个与运行边界有关的静默故障

第一件是 fork 之后既不 join 也不 interrupt，开头的事故属于此类；本地测试跑得快，任务恰好在进程退出前完成，生产一缩容就丢。第二件是把 runPromise 塞进工具函数，上层再写 timeout 或 retry 时完全不生效，症状是「超时配置看起来没起作用」。第三件是折叠 Exit 时把所有非成功形状都当成一个通用失败，于是被取消的任务也被重试，越取消越重启，形成空转。三者的共同点是**没有编译错误、happy path 完全正常**。因此运行边界附近的回归至少要三条：join 能拿到结果、父级结束会回收子任务、折叠函数能区分 Failure 与 Interrupted。t1 与 t2 正好覆盖这三条。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 四种 Exit 形状折叠后结果互不相同 | 缺陷或中断被误当成预期失败 |
| Failure 与 Die 不被合并成一类 | 恢复谓词会重试一个 bug |
| fork 返回句柄，join 才拿到结果 | 把句柄当结果消费，永远拿不到值 |
| 父级结束前未完成子任务全部中断 | 后台任务泄漏，缩容时丢数据 |
| 运行边界只出现在最外层 | 上层策略失效，取消与超时分裂 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L01 动机与起步 | 四种运行边界的语义差别 | 运行产物是可检查的 Exit 值 |
| L08 / L09 错误与 Cause | Failure、Die、Interrupt 在 Cause 里怎么组织 | Exit 把结局变成数据 |
| S4 结构化并发 | 作用域如何自动化级联中断 | 「不持有句柄就无法收尾」 |

### 运行边界附近的排障表

| 现象 | 优先检查 | 常见根因 |
|---|---|---|
| 缩容时丢最后一批数据 | fork 出来的句柄有没有 join / interrupt | 主流程直接返回，子任务还在跑 |
| timeout 配置看起来没生效 | 运行边界是不是在工具函数内部 | 上层拿到结果值，无法再叠加策略 |
| 被取消的任务反复重启 | Exit 折叠函数是否区分 Interrupted | 把中断当成普通失败重试 |
| 缺陷触发了业务降级 | Failure 与 Die 是否被合并 | 把 bug 当成可恢复错误 |
| 同一段逻辑出现多个执行阶段 | 是否每个分支各放了一处运行边界 | 取消与超时语义分裂 |

前两行是「句柄与边界位置」问题，后三行是「结局分类」问题。两类都不会让 happy path 失败，所以出问题时最容易误判成基础设施抖动，进而去调重试次数或加机器；按这张表先定位到具体一层，比直接加资源有用。特别提醒第三行：越取消越重启的空转，会让取消操作本身变成流量放大器。

### 与后续模块的接缝

| 上游交付 | 下游怎么用 | 不允许改什么 |
|---|---|---|
| 可检查的 Exit 值 | L09 的 Cause 展开失败结构 | 不在边界处 throw 掉上下文 |
| Failure / Die / Interrupted 三分 | L10 只对可重试错误生效 | 不把三类合并成通用失败 |
| 可 join 的 Fiber 句柄 | S4 用作用域自动化级联中断 | 不丢弃句柄，也不提前运行 |
`,
    'blueprint',
    [
      {
        text: 'runPromiseExit 相比 runPromise 的关键差异？',
        options: ['更快', '把失败作为 Exit 值返回而不抛', '只能同步运行', '自动重试'],
        answer: 1,
        explain: 'Exit 让失败成为可分支、可记录的数据。',
        concept: 'exit',
      },
      {
        text: 'Effect.exit(inner) 之后，外层程序的 E 通道通常？',
        options: [
          '一定增加 inner 的错误',
          '不再包含 inner 的错误（已被转成值）',
          '变成 never 且无法恢复',
          '自动变成 defect',
        ],
        answer: 1,
        explain: 'exit 把失败吸收为 Success 通道的 Exit 值，错误不再向外传播。',
        concept: 'exit',
      },
      {
        text: '为保留结构化并发、资源 Scope 与追踪上下文，run* 应当放在哪里？',
        options: [
          '每个工具函数内部都 runPromise',
          '应用根部 / 请求处理器这一处',
          '每次调用 Effect.all 的地方',
          '服务构造函数里',
        ],
        answer: 1,
        explain: '运行边界只在应用入口出现一次；到处 run 会丢掉结构化并发、Scope 与追踪上下文。',
        concept: 'runners',
      },
    ],
    [
      ['Exit<A,E>', 'Success(A) | Failure(Cause<E>) 的运行终态'],
      ['Result', 'v4 中表示成功／失败的轻量结果类型，常用于 race'],
    ],
    ['用 try/catch 包住 runPromise 来处理业务错误——应该改用 Exit 或 catch*。'],
  ),
  'practice',
)
