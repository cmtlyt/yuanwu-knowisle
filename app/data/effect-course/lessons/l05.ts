import { L, code, call, list, q } from '../../course-builders.ts'

export const L05 = L(
  'L05',
  1,
  '组合与变换：map / flatMap / all / zip',
  30,
  2,
  ['L04'],
  ['composition'],
  ['掌握常用算子的语义差异', '知道 Effect.all 默认顺序执行'],
  [
    code(
      '变换 vs 串联',
      'import { Effect } from "effect"\n\nconst base = Effect.succeed(2)\n\nEffect.map(base, (n) => n * 3)             // 纯值变换\nEffect.flatMap(base, (n) => loadUser(n))    // 串接另一个 Effect\nEffect.andThen(base, () => Effect.log("ok"))// 忽略前值，继续\nEffect.tap(base, (n) => Effect.log(n))      // 副作用观察，保留原值\nEffect.zip(Effect.succeed("a"), Effect.succeed("b")) // 元组\nEffect.all([t1, t2, t3], { concurrency: 2 })        // 受控并发',
      'map 的回调返回普通值，flatMap 的回调必须返回 Effect。混用会导致类型错误或 Effect 被当成值。',
    ),
    call(
      'warn',
      '并发默认是关的',
      'Effect.all 不传 concurrency 时是顺序执行。想要并发必须显式给 { concurrency: 2 } 或 { concurrency: "unbounded" }。这是刻意的：并发语义必须由作者声明，不能被库偷偷引入。',
    ),
    list('顺序 / 有界 / 无界', [
      '默认顺序：前一个完成后才启动下一个，失败即短路。',
      'concurrency: number：最多 N 个在跑，适合限流保护下游。',
      'concurrency: "unbounded"：全部同时启动，任一失败其余被中断。',
    ]),
  ],
  'concurrency',
  [
    q(
      'Effect.all([a,b,c]) 不传 concurrency 时如何执行？',
      ['全并发', '顺序执行', '随机顺序', '只执行第一个'],
      1,
      'v4 默认顺序；显式传 concurrency 才会并发。',
      'composition',
    ),
    q(
      'map 与 flatMap 的分界是？',
      ['map 只能用于数字', 'flatMap 的回调返回 Effect，map 返回普通值', 'flatMap 会立刻执行', '二者完全等价'],
      1,
      'flatMap 用于把下一步计算也建模成 Effect，从而保留错误与依赖通道。',
      'composition',
    ),
  ],
  [
    ['短路', '前一个失败后，后续组合子不再执行，错误沿链传播'],
    ['concurrency 选项', 'number 有界 / "unbounded" 无界 / 省略则顺序'],
  ],
  [
    '以为 Effect.all 像 Promise.all 一样默认并行。',
    '在 map 里返回 Effect，结果拿到一个 Effect 值而不是它的结果。',
  ],
)
