import { L } from '../../course-builders.ts'

export const L15 = L(
  'L15',
  3,
  '错误传播：错误只在一条路径上走',
  24,
  3,
  ['L14'],
  ['c-error-prop'],
  ['理解错误在多订阅/多分支下的传播规则', '避免错误被静默吞掉'],
  `
### 错误是「值」，沿管道向下游传播

没有 catchError/retry 接住，error 会一路向下传播到最终订阅者的 error 回调。若某条分支被 merge/combineLatest 汇入，错误会传播到合并流；被 flatMap 内层抛出则会按扁平化语义处理。

\`\`\` title="多分支与错误" note="多源合并时，任一路 error 会让合并流 error；要「某路失败不拖垮整体」需用 catchError 在该路兜底。"
import { throwError, merge } from "rxjs"
import { catchError, tap } from "rxjs/operators"

const a = throwError(() => new Error("A 挂了"))
const b = of("b1")
merge(a, b).subscribe({
  next: (v) => console.log("next", v),
  error: (e) => console.log("整体以", e, "结束") // 一条分支 error，整个合并流 error
\`\`\`

:::warn

### 静默失败是最危险的反模式

订阅里不写 error 回调、或 catch 后 console.log 了事，是「静默失败」。生产环境要么有全局错误边界，要么显式上报，绝不能让错误在某个未订阅的分支里悄悄消失。

:::

`,
  'rxTeardown',
  [
    {
      text: '两条流 merge 后，其中一条 error 会发生什么？',
      options: ['只有那条停', '整个合并流 error，全部订阅者收到', '自动忽略该路', '变成 complete'],
      answer: 1,
      explain: '合并流把任一路的 error 视为整体 error；想让某路失败不传播，要在该路单独 catchError。',
      concept: 'c-error-prop',
    },
    {
      text: '「某路失败不应拖垮整体合并流」应怎么做？',
      options: ['什么都不做', '在该路加 catchError 兜底', '用 mergeMap', '用 take'],
      answer: 1,
      explain: '在出错的那一路单独 catchError（恢复成正常流或吞掉），错误才不会传播到合并层。',
      concept: 'c-error-prop',
    },
    {
      text: '要杜绝「错误在某处被静默吞掉」，最稳妥的做法是？',
      options: [
        '订阅不写 error 回调，交给 GC',
        'catch 后 console.log 了事',
        '在管道末端统一 catchError 上报',
        '对每路都加 retry(99)',
      ],
      answer: 2,
      explain:
        '末端统一捕获 + 显式上报（或全局错误边界）才能保证错误不消失；零散 log 与无限重试都是静默失败/重试风暴。',
      concept: 'c-error-prop',
    },
  ],
  [
    ['错误传播', 'error 作为值沿管道向下游订阅者传播'],
    ['静默失败', '错误被吞掉、无人上报'],
  ],
  [
    '在多源合并里不处理某一路的 error，导致整体流意外终止。',
    'catch 后仅打印日志不上报，生产环境「静默失败」。',
  ],
)
