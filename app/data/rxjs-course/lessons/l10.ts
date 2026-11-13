import { L, prose, code, call, q } from '../../course-builders.ts'

export const L10 = L(
  'L10',
  2,
  'switchMap 与 exhaustMap：取最新 vs 排空',
  30,
  3,
  ['L09'],
  ['c-switch', 'c-exhaust'],
  ['讲清 switchMap 的取消语义', '区分 exhaustMap 的排队语义'],
  [
    code(
      '取最新 / 排空',
      'import { switchMap, exhaustMap } from "rxjs/operators"\n\n// switchMap：新值到来时取消旧内层，只保留最新（防搜索竞态的默认答案）\nsearch$.pipe(switchMap((q) => httpGet("/api?q=" + q)))\n\n// exhaustMap：内层在进行中时，新的外值被忽略（直到当前内层完成）\nbutton$.pipe(exhaustMap(() => loadOnce())) // 加载中忽略后续点击',
      'switchMap「取消旧的、换新的」；exhaustMap「旧的做完前，新的直接丢」。',
    ),
    prose(
      'switchMap 是取消的艺术',
      'switchMap 不仅取最新，它还会调用旧内层订阅的 unsubscribe。所以它是「取消过期请求」的标准工具：搜索框每次键入都 switchMap，旧请求被自动取消，只有最新一个存活。',
    ),
    call(
      'deep',
      'exhaustMap 与 switchMap 的差别',
      'exhaustMap 不取消正在跑的内层（做完为止），期间来多少外值都忽略；switchMap 一有新外值立即取消旧内层。排队按钮用 exhaustMap，搜索框用 switchMap。',
    ),
  ],
  'rxCross',
  [
    q(
      'switchMap 收到新外值时会做什么？',
      ['忽略新值', '取消当前内层、改为订阅新内层', '排队等旧完成', '报错'],
      1,
      'switchMap 的核心是「取消旧内层 + 订阅新内层」，这正是搜索防竞态的答案。',
      'c-switch',
    ),
    q(
      '「按钮加载中，忽略后续点击，直到本次加载完成」应该用？',
      ['switchMap', 'concatMap', 'exhaustMap', 'mergeMap'],
      2,
      'exhaustMap 在旧内层未完成时忽略新外值，做完后接受下一次，正好是「排队/防重复提交」语义。',
      'c-exhaust',
    ),
    q(
      'switchMap 取消旧内层后，旧内层已发出的部分 next 值会怎样？',
      ['保留并继续转发', '被丢弃，下游只看到新内层的值', '自动补发', '抛错'],
      1,
      'switchMap 取消旧内层订阅：旧内层尚未发出的值被丢弃，下游只接收新内层；已发出的历史值仍在。',
      'c-switch',
    ),
  ],
  [
    ['switchMap', '取最新并取消旧内层'],
    ['exhaustMap', '排空语义：进行中忽略新值'],
  ],
  [
    '搜索框用 mergeMap/concatMap 导致竞态与旧结果覆盖（应使用 switchMap）。',
    '把 exhaustMap 当成 switchMap 用，期待「取消旧的」（它不取消，只忽略）。',
  ],
)
