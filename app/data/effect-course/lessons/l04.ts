import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 1 ========== */

export const L04 = L(
  'L04',
  1,
  '构造子全景：把现实世界装进 Effect',
  25,
  2,
  ['L03'],
  ['constructors', 'typed-error'],
  ['按场景选对构造子', '区分可恢复错误与缺陷的构造方式'],
  [
    code(
      '常用构造子',
      'import { Effect } from "effect"\n\nEffect.succeed(42)                 // 已有值\nEffect.fail(new NotFound())         // 预期错误，进入 E 通道\nEffect.sync(() => Date.now())       // 同步副作用，假定不抛\nEffect.try(() => JSON.parse(s))     // 同步副作用 + 映射异常\nEffect.promise(() => fetch(url))    // 不抛的异步\nEffect.tryPromise({                // 异步 + 显式映射异常\n  try: () => fetch(url),\n  catch: () => new HttpError()\n})\nEffect.die("impossible state")     // 缺陷 defect，不进 E 通道\nEffect.void                        // 成功但无有用值\nEffect.log("hello")                // 结构化日志\nEffect.sleep("200 millis")         // 可中断的等待',
      'try / tryPromise 是把「不受控异常」收敛成「有名字的预期错误」的主要入口。',
    ),
    prose(
      '为什么要有 die',
      '有些失败不是业务分支，而是程序写错了：断言失败、不可能的状态、第三方库的 bug。它们不该被 domain 逻辑 catch 掉，也不该污染 E 类型。Effect.die 把它们放进 Cause 的 Die reason，由应用边界统一报告。',
    ),
    call(
      'tip',
      '选择顺序',
      '先问「调用方需要为这个失败做决策吗？」需要 → Effect.fail / tryPromise 的 catch；不需要、代表 bug → Effect.die 或让异常自然变成 defect。',
    ),
  ],
  'triple',
  [
    q(
      '把一个「缓存未命中」建模成什么最合适？',
      ['Effect.die', 'Effect.fail(new CacheMiss())', 'throw new Error', 'Effect.void'],
      1,
      '调用方需要据此回源查询，属于领域决策，应进入 E 通道。',
      'typed-error',
    ),
    q(
      'Effect.die 产生的失败在哪里？',
      ['E 通道里', 'Cause 的 Die reason，不在 E 里', '被 runtime 忽略', 'Success 值里'],
      1,
      '缺陷不进入类型化错误通道，但被 Cause 完整保留，可在边界处检查或上报。',
      'constructors',
    ),
  ],
  [
    ['defect', '意外的、代表 bug 的失败，不参与类型化恢复'],
    ['预期错误 failure', 'E 通道中列出的、调用方应处理的失败'],
  ],
  ['到处用 tryPromise 把真 bug 也吞成业务错误，导致错误永远被「恢复」掉。'],
)
