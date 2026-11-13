import { L, prose, code, call, list, q } from '../../course-builders.ts'

export const L09 = L(
  'L09',
  2,
  'Cause 的底层结构：扁平 reasons 数组',
  35,
  4,
  ['L08'],
  ['cause'],
  ['读懂 Cause<E> 的数据结构', '会用 guards 与 Cause.combine 分析复合失败'],
  [
    prose(
      '为什么 E 不够',
      '一个程序可能同时因为多个原因结束：两个并发任务都失败、finalizer 也失败、还有 fiber 被中断。若只保留一个 error 就会丢信息。Cause 的设计目标是无损保留所有失败事实。',
    ),
    code(
      'v4 的 Cause 是扁平数组',
      'import { Cause, Effect, Exit } from "effect"\n\n// Cause<E> ≈ { reasons: ReadonlyArray<Reason<E>> }\n// Reason = Fail<E> | Die | Interrupt\n\nconst combined = Cause.combine(\n  Cause.fail("db down"),\n  Cause.die("bug in mapper")\n)\ncombined.reasons.map((r) => r._tag) // ["Fail", "Die"]\n\nconst exit = await Effect.runPromiseExit(\n  Effect.all([Effect.fail("e1"), Effect.fail("e2")], { concurrency: 2 })\n)\nif (Exit.isFailure(exit)) {\n  exit.cause.reasons.filter(Cause.isFailReason).map((r) => r.error)\n  // 并发失败会被一起收集进同一个 reasons 数组\n}',
      'Cause.combine 只是把两个 reasons 数组拼起来；顺序与并发的组合方式不再编码进数据结构。',
    ),
    list('常用 API', [
      'Cause.fail / die / interrupt / empty：构造单 reason 的 Cause（empty 即 reasons 为空）。',
      'Cause.hasFails / hasDies / hasInterrupts / hasInterruptsOnly：Cause 级判定。',
      'Cause.isFailReason / isDieReason / isInterruptReason：单个 reason 的类型收窄。',
      'Cause.combine / fromReasons / annotate：合并、从数组构造、附加注解。',
      'Cause.pretty：把整个 Cause 格式化成可读的多行错误报告。',
    ]),
    call(
      'warn',
      '文档勘误提醒',
      '官方并发章节的部分打印示例里仍出现树形的 Parallel / Sequential 输出。v4 的 Cause 模块文档与数据结构是扁平 reasons 数组，以 Cause 模块为准；分析失败时请遍历 cause.reasons。',
    ),
  ],
  'cause',
  [
    q(
      'v4 中一个 Cause 如何表达「两个并发任务同时失败」？',
      ['Parallel 节点套两个子节点', 'reasons 数组里放两个 Fail reason', '只保留最后一个错误', '抛出聚合异常'],
      1,
      '扁平结构把并发与顺序失败统一收集到 reasons 数组，用 Cause.combine 合并。',
      'cause',
    ),
    q(
      '判断「这个 Cause 是否含有缺陷」用哪个？',
      ['Cause.isDieReason(cause)', 'Cause.hasDies(cause)', 'cause.reasons.length', 'Exit.isFailure'],
      1,
      'hasDies 是 Cause 级谓词；isDieReason 用来收窄数组中的单个 reason。',
      'cause',
    ),
  ],
  [
    ['Reason', 'Cause 数组中的单个失败事实：Fail / Die / Interrupt'],
    ['无损失败', '不丢弃并行失败、finalizer 失败与中断来源'],
  ],
  ['把 Cause 当成单个 Error 对象，只取第一个 reason。', '用 cause._tag 去 switch——v4 应遍历 cause.reasons。'],
)
