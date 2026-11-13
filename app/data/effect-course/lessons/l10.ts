import { L, code, call, list, q } from '../../course-builders.ts'

export const L10 = L(
  'L10',
  2,
  '恢复策略与重试边界',
  30,
  3,
  ['L09'],
  ['recovery', 'schedule'],
  ['按场景选择恢复算子', '理解 retry 与 Schedule 是策略描述'],
  [
    list('恢复算子选择表', [
      'catch / catchTag / catchTags：只处理 E 中的某类或全部预期错误。',
      'orElse / Effect.result：提供备用计算，或把结果转成值再分支。',
      'catchDefect：只在边界处理缺陷。',
      'catchCause：拿到完整 Cause，做统一上报或聚合决策。',
      'Effect.exit：把失败吸收成值，用于批量任务里「不因一个失败中断全部」。',
    ]),
    code(
      '重试是策略，不是循环',
      'import { Effect, Schedule } from "effect"\n\nconst resilient = flakyRequest.pipe(\n  Effect.retry(\n    Schedule.exponential("100 millis").pipe(\n      Schedule.jittered,\n      Schedule.compose(Schedule.recurs(4))\n    )\n  ),\n  Effect.timeout("3 seconds")\n)',
      'Schedule 本身是一份可组合的策略描述：初始延迟、退避因子、抖动、最多几次。',
    ),
    call(
      'deep',
      '为什么要 jitter',
      '固定间隔的重试会让大量客户端在同一时刻再次冲击刚恢复的下游——重试风暴。jittered 给间隔加随机扰动，把峰值摊平。Schedule 把这类经验直接做成可组合的算子。',
    ),
  ],
  'retry',
  [
    q(
      '只想恢复 NotFound 这一种错误，用？',
      ['catchCause', 'catchTag("NotFound", ...)', 'catchDefect', 'Effect.exit'],
      1,
      'catchTag 按 _tag 精确恢复，并把它从 E 通道消除。',
      'recovery',
    ),
    q(
      'Effect.retry 接受的是什么？',
      ['一个数字', '一份 Schedule 策略描述', '一个 Promise', '一个 Fiber'],
      1,
      'Schedule 是可组合的策略值，retry 只是在运行时解释它。',
      'schedule',
    ),
  ],
  [
    ['Schedule', '描述重复／延迟／退避策略的不可变值'],
    ['jitter', '给重试间隔加随机扰动以避免同步重试风暴'],
  ],
  ['对 defect 做 retry——bug 不会因为重试而消失，只会放大流量。', '重试非幂等写操作，需要配合幂等键或去重。'],
)
