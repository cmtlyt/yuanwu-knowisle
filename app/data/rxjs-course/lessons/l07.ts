import { L, prose, code, call, q } from '../../course-builders.ts'

export const L07 = L(
  'L07',
  1,
  '归约与收集：reduce / toArray / count / buffer',
  24,
  2,
  ['L06'],
  ['c-reduce'],
  ['把一串值归约成一个值', '区分 reduce 与 toArray 的时机'],
  [
    prose(
      '从序列到单值',
      'reduce / scan / toArray / count 把「多个值」压缩成「一个值」。reduce 在流完成时一次性给出最终结果；scan 则逐步给出中间结果（保留流的时间性）。',
    ),
    code(
      '归约 vs 逐步',
      'import { from } from "rxjs"\nimport { reduce, scan, toArray, count, buffer } from "rxjs/operators"\n\nfrom([1, 2, 3, 4]).pipe(reduce((a, b) => a + b, 0)).subscribe((s) => console.log("sum", s)) // 10\nfrom([1, 2, 3, 4]).pipe(scan((a, b) => a + b, 0)).subscribe((s) => console.log("step", s)) // 1,3,6,10\nfrom([1, 2, 3, 4]).pipe(toArray()).subscribe((arr) => console.log(arr)) // [1,2,3,4]\nfrom(["a", "b", "c"]).pipe(count()).subscribe((n) => console.log(n))     // 3',
      'reduce 只发一次（complete 时）；scan 每次都发，适合做「累计值」展示。',
    ),
    call(
      'tip',
      'buffer 是「攒一批」',
      'buffer(closingNotifier) 把一段时间的值攒成数组一次发出，常用于「攒够 N 条再提交」或「每 X 毫秒发一批」，与 reduce 的差别在于它是「分批成数组」而非「压成单值」。',
    ),
  ],
  'rxTransform',
  [
    q(
      'reduce 与 scan 的区别是？',
      [
        '完全相同',
        'reduce 在 complete 时发一次最终值；scan 每步都发中间值',
        'scan 更快',
        'reduce 不能传初值',
      ],
      1,
      'scan 保留时间维度（每次发），reduce 折叠成单值（完成时发），二者可互相推导。',
      'c-reduce',
    ),
    q(
      'toArray() 在流 complete 时发出什么？',
      ['最后一个值', '所有值的数组', 'undefined', '抛错'],
      1,
      'toArray 缓冲全部值，直到 complete 才把整个数组作为单次结果发出。',
      'c-reduce',
    ),
  ],
  [
    ['reduce', '把整条流折叠成单个值，complete 时发出'],
    ['scan', '逐步归约，每一步都作为值发出'],
  ],
  [
    '期望 reduce 每步都发中间结果（那应该是 scan）。',
    '对无限流用 toArray/reduce，期待它能完成——永远等不到 complete。',
  ],
)
