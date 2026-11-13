import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 2 · 扁平化（核心） ========== */

export const L08 = L(
  'L08',
  2,
  '为什么需要扁平化：嵌套流的心智模型',
  26,
  3,
  ['L07'],
  ['c-flatten'],
  ['识别「内层流」的嵌套问题', '理解扁平化的动机'],
  [
    prose(
      '嵌套流是什么',
      '当 map 的回调本身返回一个 Observable（而不是普通值），你就得到「流的流」。它不会自动展开——下游拿到的是一整个内层流对象。扁平化（flatten）就是决定如何把内层流摊回成一条外层流。',
    ),
    code(
      '从嵌套到扁平',
      'import { from, of, concat } from "rxjs"\nimport { map, concatMap, mergeMap } from "rxjs/operators"\n\n// 嵌套：每个名字变成一个内层流（"流的流"）\nconst nested = from(["a", "b"]).pipe(map((name) => of(name + "-1", name + "-2")))\n// 扁平：把内层摊回来\nnested.pipe(concatMap((inner) => inner)).subscribe((v) => console.log(v)) // a-1,a-2,b-1,b-2',
      '7.x 里 concatMap/mergeMap 可以直接接收内层可观察，也可用 pipe 写法；语义一致。',
    ),
    call(
      'deep',
      '扁平化的核心问题是「时序策略」',
      '当多个内层流在时间上重叠时，谁来先？并发还是排队？新到的要不要取消旧的？这四个问题恰好对应 concatMap / mergeMap / switchMap / exhaustMap——下一课逐个拆解。',
    ),
  ],
  'rxFlatten',
  [
    q(
      'map 的回调返回 Observable 时，下游收到什么？',
      ['内层流的值', '整个内层 Observable 对象（未展开）', 'undefined', '报错'],
      1,
      '这是「流的流」，必须用扁平化操作符（mergeMap 等）摊回，否则下游拿到的是对象本身。',
      'c-flatten',
    ),
    q(
      '扁平化要回答的根本问题是？',
      ['如何命名', '多个内层流在时间上重叠时按什么策略合并', '如何加速', '如何取消'],
      1,
      '四个扁平化操作符的差异全在于「内层时序策略」：顺序 / 并发 / 取最新 / 排空。',
      'c-flatten',
    ),
    q(
      'map 回调返回 Observable 且内层都是同步 of() 时，用哪个扁平化能保持外层顺序？',
      ['switchMap', 'concatMap', 'race', 'exhaustMap'],
      1,
      'concatMap 严格串行：前一个内层 complete 才启动下一个，输出顺序与外层一致；switch/exhaust 带取消或忽略语义。',
      'c-flatten',
    ),
  ],
  [
    ['内层流', 'map/flatMap 回调返回的 Observable'],
    ['扁平化', '把「流的流」摊回成一条流的算子族'],
  ],
  [
    '以为 map 会自动展开内层流（它不会，必须显式扁平化）。',
    '在不该并发的场景用了 mergeMap，导致请求乱序、旧结果覆盖新结果。',
  ],
)
