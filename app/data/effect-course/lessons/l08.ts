import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L08 = L(
  'L08',
  2,
  '两类错误：failure 与 defect',
  25,
  2,
  ['L07'],
  ['typed-error', 'defect'],
  ['能判断一个失败该建模成哪种', '知道各自的处理入口'],
  [
    prose(
      '分界线是「要不要做决策」',
      '预期错误（failure / typed error）属于业务领域：无效输入、记录不存在、请求被拒。它们出现在 E 里，调用方用 Effect.catch / catchTag 恢复。缺陷（defect）代表断言失败、不可能状态、第三方 bug，不进 E，运行时仍由 Cause 完整保留。',
    ),
    code(
      '两条处理路径',
      'import { Effect } from "effect"\n\nconst domain = Effect.fail(new NotFound()).pipe(\n  Effect.catchTag("NotFound", () => Effect.succeed(null))\n)\n\n// 缺陷只在边界处检查 / 上报\nconst boundary = risky.pipe(\n  Effect.catchDefect((defect) =>\n    Effect.log("unexpected: " + String(defect))\n  )\n)\n\n// 想看全貌：把整个 Cause 暴露出来\nconst full = Effect.catchCause(risky, (cause) => report(cause))',
      'catch* 系列只处理 E 通道；要看 defect 与 interruption 必须用 catchDefect / catchCause / Effect.exit。',
    ),
    call(
      'warn',
      '不要在领域逻辑里吞掉缺陷',
      '把 defect 统一 catch 成「返回默认值」会掩盖 bug。正确做法是让它在应用边界被记录、告警、转成 500，而不是变成一条正常的业务分支。',
    ),
  ],
  'cause',
  [
    q(
      '「用户余额不足」应建模为？',
      ['Effect.die', 'E 通道中的 typed error', '直接抛异常', 'Success 里的 null'],
      1,
      '调用方需要据此走不同业务流程，属于可恢复的领域错误。',
      'typed-error',
    ),
    q(
      '哪个算子能看到缺陷和中断？',
      ['Effect.catch', 'Effect.catchTag', 'Effect.catchCause', 'Effect.mapError'],
      2,
      'catchCause 接收完整 Cause，包含 Fail / Die / Interrupt 三类 reason。',
      'defect',
    ),
  ],
  [
    ['failure', 'E 通道里的预期错误'],
    ['defect', 'Cause 里的意外错误，不参与类型化恢复'],
  ],
  ['把「不可能发生」的状态用 Effect.fail 建模，逼调用方写永远用不上的恢复分支。'],
)
