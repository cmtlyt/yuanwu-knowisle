import { L } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L08 = L(
  'L08',
  2,
  '两类错误：failure 与 defect',
  2,
  ['L07'],
  ['typed-error', 'defect'],
  ['能判断一个失败该建模成哪种', '知道各自的处理入口'],
  `
### 分界线是「要不要做决策」

预期错误（failure / typed error）属于业务领域：无效输入、记录不存在、请求被拒。它们出现在 E 里，调用方用 Effect.catch / catchTag 恢复。缺陷（defect）代表断言失败、不可能状态、第三方 bug，不进 E，运行时仍由 Cause 完整保留。

\`\`\` title="两条处理路径" note="catch* 系列只处理 E 通道；要看 defect 与 interruption 必须用 catchDefect / catchCause / Effect.exit。"
import { Effect } from "effect"

const domain = Effect.fail(new NotFound()).pipe(
  Effect.catchTag("NotFound", () => Effect.succeed(null))
)

// 缺陷只在边界处检查 / 上报
const boundary = risky.pipe(
  Effect.catchDefect((defect) =>
    Effect.log("unexpected: " + String(defect))
  )
)

// 想看全貌：把整个 Cause 暴露出来
const full = Effect.catchCause(risky, (cause) => report(cause))
\`\`\`

:::warn

### 不要在领域逻辑里吞掉缺陷

把 defect 统一 catch 成「返回默认值」会掩盖 bug。正确做法是让它在应用边界被记录、告警、转成 500，而不是变成一条正常的业务分支。

:::

`,
  'cause',
  [
    {
      text: '「用户余额不足」应建模为？',
      options: ['Effect.die', 'E 通道中的 typed error', '直接抛异常', 'Success 里的 null'],
      answer: 1,
      explain: '调用方需要据此走不同业务流程，属于可恢复的领域错误。',
      concept: 'typed-error',
    },
    {
      text: '哪个算子能看到缺陷和中断？',
      options: ['Effect.catch', 'Effect.catchTag', 'Effect.catchCause', 'Effect.mapError'],
      answer: 2,
      explain: 'catchCause 接收完整 Cause，包含 Fail / Die / Interrupt 三类 reason。',
      concept: 'defect',
    },
  ],
  [
    ['failure', 'E 通道里的预期错误'],
    ['defect', 'Cause 里的意外错误，不参与类型化恢复'],
  ],
  ['把「不可能发生」的状态用 Effect.fail 建模，逼调用方写永远用不上的恢复分支。'],
)
