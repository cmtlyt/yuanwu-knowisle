import { L, prose, code, call, q } from '../../course-builders.ts'

export const L13 = L(
  'L13',
  3,
  '终结语义：error 与 complete 不可逆',
  24,
  2,
  ['L03'],
  ['c-terminal'],
  ['理解流的一次性终结', '区分 complete 与 error'],
  [
    prose(
      '一次终结，永久关闭',
      '一条流一旦发出 error 或 complete，对该订阅而言就永久结束，不能再 next。这是 Promise「恰好一次结果」在时间维度的推广：多值流也可以「恰好一次地终结」。',
    ),
    code(
      '两种终结',
      'import { of } from "rxjs"\nimport { finalize, tap } from "rxjs/operators"\n\nof(1, 2, 3).pipe(\n  tap((n) => console.log("next", n)),\n  finalize(() => console.log("无论成功/失败/取消都会跑")) // 资源清理统一放这里\n).subscribe({\n  complete: () => console.log("正常完成"),\n  error: (e) => console.log("以错误结束", e),\n})',
      'finalize 是「无论以何种方式结束都执行」的钩子，适合做资源清理，等价于 try/finally。',
    ),
    call(
      'deep',
      '为什么终结不可逆是特性而非缺陷',
      '正因为不可逆，下游可以放心假设「拿到 complete 就再不会有值」，不必做幂等去重。若流能「复活」，整个时间语义会崩塌。',
    ),
  ],
  'rxTeardown',
  [
    q(
      '一条流调用 complete() 之后会怎样？',
      ['可以再次 next', '对该订阅永久结束，不再接受任何信号', '自动重连', '抛错'],
      1,
      'complete 与 error 都是终结且不可逆；之后的 next/error/complete 都会被忽略。',
      'c-terminal',
    ),
    q(
      '「无论流成功、失败还是被取消都要清理资源」应该放在哪？',
      ['next', 'finalize', 'filter', 'take'],
      1,
      'finalize 在任何终结方式（完成/错误/取消）时都执行，是资源清理的统一位置。',
      'c-terminal',
    ),
  ],
  [
    ['终结信号', 'error 与 complete，使流不可逆地结束'],
    ['finalize', '任意结束方式都会触发的清理钩子'],
  ],
  [
    '以为 complete 后还能继续 next（不可逆）。',
    '把资源清理写在 complete 回调里，结果流 error 时泄漏（应使用 finalize）。',
  ],
)
