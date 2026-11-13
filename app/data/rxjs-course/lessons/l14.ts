import { L, code, call, q } from '../../course-builders.ts'

export const L14 = L(
  'L14',
  3,
  '恢复与重试：catchError / retry / retryWhen',
  30,
  3,
  ['L13'],
  ['c-retry'],
  ['设计一条可重试的流', '理解 retryWhen 的退避控制'],
  [
    code(
      '三层重试',
      'import { interval, throwError } from "rxjs"\nimport { retry, catchError, retryWhen, tap } from "rxjs/operators"\n\n// 固定重试 3 次\nsrc.pipe(retry(3)).subscribe({ next: (v) => {}, error: (e) => {} })\n\n// 捕获后决定：要么恢复成新流，要么把错误吞掉返回正常值\nsrc.pipe(catchError((err) => { console.log("兜底", err); return interval(1000) }))\n\n// 完全可控：按指数退避决定何时重试\nfunction retryWithBackoff() {\n  return (errors) =>\n    errors.pipe(\n      retryWhen((e) => e.pipe(retry({ delay: (e, i) => 500 * 2 ** i }))) // 7.x 支持延迟函数\n    )\n}',
      'retry(n) 最常用；retryWhen 让你把「是否/何时重试」交给一段可观察逻辑，能实现退避与熔断。',
    ),
    call(
      'warn',
      'catchError 只接一次，且会终结原流',
      'catchError 的回调要么返回一个新可观察来「恢复」，要么返回一个值；它不会「重试原流」，也不会多次触发。想要重试语义用 retry / retryWhen。',
    ),
  ],
  'rxRetry',
  [
    q(
      'retry(2) 的含义是？',
      ['总共执行 1 次', '首次失败后再重试 2 次（最多 3 次执行）', '重试 2 个不同流', '无限重试'],
      1,
      'retry(n) 表示允许 n 次重试（加上首次共 n+1 次尝试），仍失败才向上抛 error。',
      'c-retry',
    ),
    q(
      '想做「指数退避 + 可取消」的重试，最合适的是？',
      ['retry(3)', 'retryWhen（把重试决策做成可观察逻辑）', 'catchError', 'map'],
      1,
      'retryWhen 把错误流交给你自由组合，可加 delay、可加退避、可加超时熔断，比固定 retry 灵活得多。',
      'c-retry',
    ),
    q(
      '对「非幂等写操作」（如下单扣款）直接套 retry，最可能的风险是？',
      ['更可靠', '请求失败后重试，可能造成重复写入 / 重复扣款，需配合幂等键', '自动去重', '不会重试'],
      1,
      'retry 不区分幂等与否，失败即重新订阅上游。对写操作要配幂等键或去重，否则重试会放大业务故障。这是「能重试」与「不该盲目重试」的边界。',
      'c-retry',
    ),
  ],
  [
    ['catchError', '捕获一次错误并决定恢复方式（终结原流）'],
    ['retryWhen', '把「是否/何时重试」交给一段可观察逻辑'],
  ],
  [
    '用 catchError 实现「重试」（它只接一次且终结原流，应使用 retry/retryWhen）。',
    '无退避地无限重试，造成重试风暴与下游过载。',
  ],
)
