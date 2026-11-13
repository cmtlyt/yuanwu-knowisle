import { L, prose, code, call, q } from '../../course-builders.ts'

export const L12 = L(
  'L12',
  2,
  'Cause 诊断实战：从 reasons 到恢复决策',
  35,
  4,
  ['L09', 'L10'],
  ['cause', 'recovery'],
  ['读真实失败程序的 Cause.reasons 并分类', '按原因类型选对恢复算子', '把缺陷与中断留在边界，不污染领域分支'],
  [
    prose(
      '诊断三步法',
      '拿到一个 Exit.fail 后不要急着重试。先 Cause.squash / 遍历 cause.reasons，把每条 reason 归到 Fail / Die / Interrupt 三类；再对每一类决定「能否恢复、用什么恢复」；最后让缺陷与中断只在应用边界被记录或转成 5xx，领域内的预期错误才用 catchTag 恢复。',
    ),
    code(
      '把三类原因分层处置',
      'import { Cause, Effect, Exit } from "effect"\n\n// 一段会并发失败 + 缺陷 + 中断的复合程序\nconst flaky = Effect.all(\n  [\n    Effect.fail("db down"),          // Fail（可重试）\n    Effect.die("bad index"),         // Die（缺陷，不该重试）\n    Effect.fail("timeout"),          // Fail（可重试）\n  ],\n  { concurrency: 2 }\n).pipe(\n  Effect.exit,                       // 吸收成值，不因一个失败中断整体\n  Effect.map((e) => {\n    if (Exit.isSuccess(e)) return "ok"\n    const reasons = e.cause.reasons\n    const retryable = reasons.filter(Cause.isFailReason).length\n    const hasDefect = Cause.hasDies(e.cause)\n    return { retryable, hasDefect } // 诊断结论\n  })\n)',
      '用 Cause.isFailReason / hasDies 把「可重试的失败」与「不可恢复的缺陷」区分开，恢复策略才不会被 bug 放大成重试风暴。',
    ),
    call(
      'warn',
      '恢复算子与原因类型要匹配',
      'retry / recover 只该用于 Fail（可重试的预期错误）；对 Die（缺陷）做 retry 只会放大 bug 与流量；对 Interrupt（中断）做 retry 会被再次中断。看到 cause.reasons 里混着 Die，先修缺陷而不是加重试。',
    ),
  ],
  'cause',
  [
    q(
      '一条 cause.reasons 里同时有 Fail 和 Die，正确处置是？',
      [
        '整条 retry 直到成功',
        '只对 Fail 恢复，Die 留在边界记录/上报',
        '直接吞掉 Die 当作成功',
        '抛出第一个 reason',
      ],
      1,
      '缺陷（Die）不参与类型化恢复，应在边界处 catchDefect 记录并转成 5xx；只有可重试的 Fail 才进 retry。',
      'cause',
    ),
    q(
      '「数据库连接超时」这类可重试失败，最合适的恢复算子是？',
      ['Effect.die', 'Effect.retry（配 Schedule）', 'Effect.catchCause 后返回默认值', 'Effect.interrupt'],
      1,
      '可重试的预期错误用 retry + Schedule（退避/抖动/次数上限）；catchCause 返回默认值会掩盖真实故障。',
      'recovery',
    ),
    q(
      '为什么「对中断（Interrupt）做 retry」通常没有意义？',
      ['Interrupt 会再次被同一取消信号中断', 'retry 会吞掉所有错误', '中断不能被捕获', 'retry 不支持中断'],
      0,
      '中断是「用户/系统要求停止」，重试一个被要求停止的任务只会立刻再次被中断；正确做法是响应取消而非重试。',
      'recovery',
    ),
  ],
  [
    ['诊断三步法', 'squash → 分类 reasons → 按类型选恢复'],
    ['Fail / Die / Interrupt', 'Cause 中三类 reason 及其恢复边界'],
  ],
  [
    '不看 reasons 一律 retry，把缺陷也反复重试，放大流量与故障。',
    '用 catchCause 把缺陷吞成「成功返回默认值」，掩盖了真实的 bug。',
  ],
)
