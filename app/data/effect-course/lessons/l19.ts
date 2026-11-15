import { L, withKind } from '../../course-builders.ts'

export const L19 = withKind(
  L(
    'L19',
    4,
    '★ 指令解释器：Effect 蓝图与 runLoop',
    5,
    ['L18'],
    ['runloop', 'laziness'],
    [
      '解释 Effect 蓝图如何被 runLoop 当作指令序列解释',
      '说清指令、continuation 与栈安全之间的关系',
      '读懂一次 yield 在指令流里的位置',
      '辨别「惰性描述」与「解释执行」的分界线',
    ],
    `
### 一条十万步的链把栈打爆了

有人把递归展开的流程写成十万次嵌套回调，本地跑前几千步正常，跑满就栈溢出。第一反应是「改成循环」，但业务上每一步都依赖前一步的结果，还可能是异步的，简单循环写不出来。真正的问题是**把「下一步」压在 JavaScript 调用栈里**：每多一步就多一层栈帧。Effect 的做法是把整段程序变成一串指令，交给 runLoop 用循环逐条解释，continuation 存在堆上而不是栈上。这一课把这个过程写成可运行的最小解释器。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 蓝图、指令、continuation、runLoop 四者是什么关系 | Fiber 的状态与归属（L18）、调度器怎么分配时间（L20） |
| 为什么解释执行能解决深链栈溢出 | 协作让出与公平性（L20） |
| 怎样用断言验证「十万步不爆栈、顺序不乱」 | 结构化并发与中断（L21、L22） |

### 从蓝图到指令

| 概念 | 是什么 | 放在哪里 |
|---|---|---|
| 蓝图 | 不可变的 Effect 值，描述整段计算 | 堆上的数据 |
| 指令 | 蓝图被拆成的最小步骤：succeed / flatMap / async 等 | 解释器的输入 |
| continuation | 「这一步之后还要做什么」的函数链 | 堆上的显式结构，不是调用栈 |
| runLoop | 用循环逐条取指令并推进的解释器 | 运行时 |

关键在于第三行：命令式嵌套里，continuation 隐含在调用栈的每一层返回地址里；解释器把它变成显式数据之后，栈深度不再随步数增长。这也解释了 L01 那条「删掉运行边界，业务逻辑仍完整存在」——删掉之后剩下的是蓝图，也就是这串指令，而不是一段已经执行过的代码。

### 真实写法

\`\`\` title="深链在 Effect 里是数据而不是栈帧" note="Effect.gen 与 flatMap 产生的都是可解释的指令；yieldNow 是显式的让出点。"
import { Effect } from "effect"

const chain = (n: number): Effect.Effect<number> =>
  n === 0
    ? Effect.succeed(0)
    : Effect.flatMap(Effect.succeed(n), (x) => chain(x - 1))

const program = Effect.gen(function* () {
  const value = yield* chain(100_000)
  yield* Effect.yieldNow
  return value
})
\`\`\`

\`chain(100_000)\` 构造时只是把指令挂成一条链，没有执行任何一层回调；真正的推进发生在运行边界之后，由 runLoop 用循环完成。

### 最小 runLoop 与栈安全断言

\`\`\` title="指令解释器的最小模型" note="自包含程序，只依赖 node:assert；用显式 continuation 栈替代 JS 调用栈。"
import assert from "node:assert/strict"

type Instr<A> =
  | { op: "succeed"; value: A }
  | { op: "map"; f: (a: number) => number }
  | { op: "yieldNow" }

function runLoop<A>(instructions: readonly Instr<A>[], initial: number): { value: number; yields: number } {
  let acc = initial
  let yields = 0
  // 显式 continuation 栈在堆上，不占用 JS 调用栈
  const continuations: Array<(a: number) => number> = []
  for (const ins of instructions) {
    switch (ins.op) {
      case "succeed":
        break
      case "map":
        continuations.push(ins.f)
        break
      case "yieldNow":
        yields += 1
        break
    }
  }
  for (let i = continuations.length - 1; i >= 0; i -= 1) acc = continuations[i]!(acc)
  return { value: acc, yields }
}

const steps: Instr<number>[] = []
for (let i = 0; i < 100_000; i += 1) {
  steps.push({ op: "map", f: (x) => x + 1 })
  if (i % 2_048 === 0) steps.push({ op: "yieldNow" })
}

const result = runLoop(steps, 0)
assert.equal(result.value, 100_000, "十万步不能爆栈，也不能丢步")
assert.ok(result.yields >= 48, "长链中要有让出点")
assert.equal(runLoop([{ op: "succeed", value: 7 }], 5).value, 5, "无指令时不改变初值")

// 顺序不能乱：把 +1 与 *2 的顺序换一下，结果必须不同
const ordered = runLoop([
  { op: "map", f: (x) => x + 1 },
  { op: "map", f: (x) => x * 2 },
], 1)
const swapped = runLoop([
  { op: "map", f: (x) => x * 2 },
  { op: "map", f: (x) => x + 1 },
], 1)
assert.equal(ordered.value, 3)
assert.equal(swapped.value, 4)
assert.notEqual(ordered.value, swapped.value, "continuation 顺序必须保真")
console.log("t1 通过：十万步栈安全、让出点存在、顺序保真")
\`\`\`

第一条断言是这课的核心：真实递归写法在十万层就会爆栈，而这个模型用 \`for\` 循环推进，栈深度恒定。最后一条断言则提醒一个容易忽略的点——把 continuation 搬进堆上之后，**顺序必须显式保真**，否则优化解释器时很容易把交换律误当成结合律。

### 让出点在指令流里的位置

| 位置 | 效果 |
|---|---|
| 每个异步边界 | 运行时把 Fiber 挂起，交出执行权 |
| 显式 yieldNow | 主动让出，供调度器安排其它 Fiber |
| 连续同步指令 | 不主动让出，直到达到配额上限 |

第三行是 L20 的起点：如果一段程序全是同步指令且从不异步，它会一直占着运行时，别的 Fiber 就没机会跑。默认配额就是为这种情况准备的兜底。

:::deep

### 惰性描述与解释执行的分界线

很多人把「Effect 是惰性的」理解成「延迟到 runPromise 才执行」，这只说对了一半。更准确的分界是：**构造阶段产出指令数据，解释阶段由 runLoop 逐条推进，运行边界只是把数据交给解释器的那一刻**。这个区分在实践中很有用：因为指令是数据，运行时才能在推进过程中插入让出、中断、追踪、资源登记；如果构造阶段就已经把回调压进栈，这些能力全都无从插入。L11 说可观测性要写在描述层、L16 说释放动作要登记在作用域里，其实都依赖同一件事——运行时看得见「下一步要做什么」。换个角度说，runLoop 不是性能优化技巧，而是整个 Effect 运行时能力模型的地基。

:::

:::warn

### 三个与长链有关的误判

第一件是把深链改成手写循环来「避免栈溢出」，结果把依赖前一步结果的语义改成了批量处理，失败与中断路径全部丢失。第二件是在链里到处插 \`yieldNow\` 求安心，让出点过密会显著增加调度开销，且掩盖真正的问题（某段同步计算本就该拆开）。第三件是以为「惰性」等于「什么都没发生」，于是把副作用写进构造阶段，等解释器真正推进时才发现请求早就发出去了——L01 的事故在同一层换了件衣服。三者都不会报错。排查长链问题时先确认「指令是不是数据、continuation 是不是在堆上」，再看让出点密度，最后才怀疑调度器配置。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 十万步链执行完成且结果正确 | continuation 仍在调用栈上，会爆栈 |
| 长链中存在让出点 | 同步长任务会饿死其它 Fiber |
| 交换两条 continuation 结果不同 | 解释器丢了顺序，语义被改写 |
| 无指令时不改变初值 | 空蓝图被误当成一次执行 |
| 构造阶段不产生副作用计数 | 把惰性误解成「还没启动的回调」 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L01 描述与执行 | 为什么要分开两个动作 | 分开之后剩下的是指令数据 |
| L20 Scheduler | 让出点之间怎么分配执行权 | runLoop 的推进循环与配额 |
| L18 Fiber | 被挂起的 continuation 存在哪 | 堆上的显式指令链 |
`,
    'runloop',
    [
      {
        text: 'runLoop 为什么用显式 continuation 栈？',
        options: [
          '为了类型推断',
          '避免深层 flatMap 造成 JS 调用栈溢出（trampoline）',
          '为了并行执行',
          '为了减少内存分配',
        ],
        answer: 1,
        explain: '循环 + 显式续体栈把递归解释摊平成迭代，同时让挂起／恢复可控。',
        concept: 'runloop',
      },
      {
        text: 'Effect.gen 构建程序时发生了几步计算？',
        options: ['与代码行数相同的步数', '零步，只生成指令树', '一步', '取决于是否有 async'],
        answer: 1,
        explain: '惰性是 Effect 的根本：构造与组合永不执行，运行才解释。',
        concept: 'laziness',
      },
    ],
    [
      ['primitive instruction', '运行时内置的最小指令（sync / async / 续体 / finalizer / yield）'],
      ['trampoline', '用循环与显式栈代替递归调用的解释执行方式'],
    ],
    ['以为 async 回调里会「继续执行同一个调用栈」——其实是 fiber 重新入队后恢复。'],
  ),
  'theory',
)
