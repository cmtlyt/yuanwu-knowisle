import { L, code, call, list, q } from '../../course-builders.ts'

export const L16 = L(
  'L16',
  3,
  '安全订阅与空流：throwIfEmpty / defaultIfEmpty / 防御式',
  24,
  2,
  ['L15'],
  ['c-safe'],
  ['为「一个值都没有」的流设计兜底', '订阅前做防御式处理'],
  [
    code(
      '空流与兜底',
      'import { from, EMPTY, NEVER } from "rxjs"\nimport { throwIfEmpty, defaultIfEmpty, startWith, tap } from "rxjs/operators"\n\nfrom([]).pipe(defaultIfEmpty("无")).subscribe((v) => console.log(v)) // 空流兜底 → "无"\nfrom([]).pipe(throwIfEmpty("没有数据")).subscribe({\n  error: (e) => console.log("缺数据", e), // 空流转成 error\n})\n\nof("x").pipe(startWith("loading")).subscribe((v) => console.log(v)) // 先给个初始/加载态',
      '搜索「一个结果都没有」用 defaultIfEmpty 给出占位；「必须有值否则算失败」用 throwIfEmpty。',
    ),
    list('防御式订阅', [
      'always 给一个初始态（startWith）避免「加载中/空态」渲染出 undefined。',
      '对「可能为空」的查询默认加 defaultIfEmpty，避免 UI 闪空。',
      '对外部输入（如路由参数、事件）先过滤非法值再进入管道。',
    ]),
    call(
      'tip',
      'EMPTY 与 NEVER 的用途',
      'EMPTY 是「立即 complete、无值」，适合做 takeUntil 的信号源；NEVER 是「永不发射也永不终结」，适合占位或让上游一直等待。',
    ),
  ],
  'rxTeardown',
  [
    q(
      'from([]) 一个值都没发就 complete，想要「空时给个默认值」用？',
      ['throwIfEmpty', 'defaultIfEmpty(v)', 'startWith', 'take(0)'],
      1,
      'defaultIfEmpty 在流未发出任何值就 complete 时，改发一次你给的默认值。',
      'c-safe',
    ),
    q(
      '给 UI 一个「加载中」的初始态，避免首帧渲染 undefined，最合适？',
      ['startWith(loading)', 'buffer', 'skip', 'exhaustMap'],
      0,
      'startWith 在真实值到来前先发一次初始态，是处理首屏「加载中/默认值」的惯用法。',
      'c-safe',
    ),
  ],
  [
    ['throwIfEmpty', '空流转成 error'],
    ['defaultIfEmpty', '空流改发一次默认值'],
  ],
  [
    '空流被渲染成 undefined 白屏（缺 startWith / defaultIfEmpty 兜底）。',
    '把「空结果」误当「错误」，导致用户看到红屏。',
  ],
)
