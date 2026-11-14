import { L } from '../../course-builders.ts'

export const L11 = L(
  'L11',
  2,
  '可观测性：日志、追踪与失败报告',
  25,
  2,
  ['L10'],
  ['observability'],
  ['知道上下文如何在 fiber 内传播', '能配置局部 logger 并格式化 Cause'],
  `
### 上下文跟着 fiber 走

日志注解、当前 span、堆栈信息是 fiber 局部状态，由 Context.Reference 一类的引用在 fiber 内传播：子 fiber 继承父 fiber 的配置，退出局部作用域后自动还原。因此并发任务里的日志天然带着正确上下文，不需要手动透传。

\`\`\` title="局部替换 logger 与格式化失败" note="Effect.provide 可以只作用于一段嵌套 workflow，离开后配置恢复原状。"
import { Cause, Effect, Logger } from "effect"

const simple = Logger.layer([
  Logger.make(({ message }) => console.log(message))
])

const program = Effect.gen(function* () {
  yield* Effect.log("start")
  yield* Effect.log("nested").pipe(Effect.provide(simple))
  yield* Effect.log("back to default")
})

// 边界处统一输出完整失败报告
const report = (cause: Cause.Cause<unknown>) =>
  Effect.log(Cause.pretty(cause))
\`\`\`

:::tip

###  preferentially 用 Cause.pretty

Cause.pretty 会把多个 reason、堆栈与中断来源排版成可读报告，比 console.log(error) 更适合生产排障。配合 Cause.annotate 还能给失败附加结构化元数据。

:::

`,
  null,
  [
    {
      text: 'fiber 局部的日志／追踪配置如何传给子 fiber？',
      options: ['手动逐层传参', '由运行时沿 fiber 继承，退出局部作用域自动还原', '写全局变量', '无法传播'],
      answer: 1,
      explain: '这正是结构化并发带来的可观测性红利。',
      concept: 'observability',
    },
    {
      text: '输出完整 Cause 报告用？',
      options: ['JSON.stringify', 'Cause.pretty', 'Effect.map', 'Fiber.join'],
      answer: 1,
      explain: 'Cause.pretty 会遍历 reasons 并格式化堆栈与中断信息。',
      concept: 'observability',
    },
  ],
  [
    ['Context.Reference', 'v4 中承载 fiber 局部配置与状态的引用类型'],
    ['span', '一次有起止与父子关系的追踪单元'],
  ],
  ['在并发任务里用模块级变量记录请求 ID，导致日志串线。'],
)
