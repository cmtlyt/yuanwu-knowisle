import { L } from '../../course-builders.ts'

export const L24 = L(
  'L24',
  5,
  'Schedule：把重试策略变成值',
  3,
  ['L10'],
  ['schedule'],
  ['能组合出指数退避 + 抖动 + 次数上限', '知道 timeout 与重试的边界'],
  `
### 策略描述，而非控制流

Schedule 是一个不可变值：描述「第 n 次重试前等多久、最多重试几次、什么条件下继续」。Effect.repeat / Effect.retry 在运行时解释它。因为它是值，所以可以 compose、jittered、并复用到不同任务上。

\`\`\` title="组合一个生产级策略" note="Effect.timeout 本质是 race 一个定时器并在超时后中断原 fiber，因此资源清理依然有保证。"
import { Effect, Schedule } from "effect"

const policy = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.compose(Schedule.recurs(4))
)

const safe = fetchUser.pipe(
  Effect.retry(policy),
  Effect.timeout("3 seconds")
)
\`\`\`

:::tip

### 顺序很重要

先 retry 再 timeout 表示总时长受限；反过来则每次尝试各自限时。写策略时先画出「时间预算」再决定算子顺序。

:::

`,
  'retry',
  [
    {
      text: 'Schedule.jittered 解决什么问题？',
      options: ['减少内存', '避免大量客户端同步重试造成风暴', '加快首次请求', '让错误类型变小'],
      answer: 1,
      explain: '随机扰动摊平重试峰值，保护刚恢复的下游。',
      concept: 'schedule',
    },
    {
      text: 'Effect.timeout 的实现基础是？',
      options: ['轮询时钟', 'race 一个定时器并中断原 fiber', '抛 JS 异常', '关闭 Scope'],
      answer: 1,
      explain: '建立在结构化中断之上，所以被中断任务的 finalizer 仍会执行。',
      concept: 'schedule',
    },
  ],
  [
    ['Schedule', '可组合的重复／退避策略值'],
    ['timeout', '基于竞速与中断的时间预算'],
  ],
  ['重试非幂等操作而不做去重，导致重复扣款／重复写入。'],
)
