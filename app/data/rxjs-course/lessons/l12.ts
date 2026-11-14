import { L } from '../../course-builders.ts'

export const L12 = L(
  'L12',
  2,
  '并发限制与竞争：mergeMap 并发度 / race / startWith',
  30,
  3,
  ['L11'],
  ['c-concurrency-limit'],
  ['用 mergeMap 并发度参数控制并发上限', '讲清 race 与 startWith 语义'],
  `
\`\`\` title="有界并发与竞争" note="mergeMap 第二参把「无界并发」压成「有界并发」，是高频事件（如批量上传）的标准解；startWith 补 UI 首帧初始态。"
import { of, race, interval } from "rxjs"
import { mergeMap, startWith } from "rxjs/operators"

// 有界并发：最多 2 个在途请求，其余排队
of(1, 2, 3, 4, 5)
  .pipe(mergeMap((id) => fetchUser(id), 2)) // 第二参 = 并发上限

// race：任一源先发则胜出，其余忽略
race(interval(50), of("fast")).subscribe((v) => console.log("winner", v))

// startWith：先给初始值，再跟随源值
of("A", "B").pipe(startWith("init")).subscribe((v) => console.log(v))
\`\`\`

### startWith 补初始值

startWith(x) 会先立即发射 x 再跟随后面的源值，专治「UI 首帧没有可用状态」；配合 shareReplay 是跨路由共享状态的常见组合。

:::deep

### 并发上限是 concatMap 与无界 mergeMap 的中间档

concatMap 严格保序（并发=1），无界 mergeMap 可能打爆下游；mergeMap(fn, N) 是「最多 N 个并发、其余排队」，比串并行都更贴合真实限流。

:::

`,
  'rxCross',
  [
    {
      text: '10 个请求最多同时跑 2 个，最合适？',
      options: ['concatMap', 'mergeMap(fn, 2)', 'switchMap', 'exhaustMap'],
      answer: 1,
      explain: 'mergeMap 第二参限制并发数；2 表示至多 2 个在途、其余排队，兼顾速度与限流。',
      concept: 'c-concurrency-limit',
    },
    {
      text: 'race(a$, b$) 中 a$ 先发射时结果是？',
      options: ['两个都按序发', '只发 a$ 的值并取消 b$', '只发 b$', '报错'],
      answer: 1,
      explain: 'race 取「先到者」：任一源先 next 就发出该值并终止其余源，常用于竞速/取消。',
      concept: 'c-concurrency-limit',
    },
    {
      text: '「UI 首帧先展示加载态，真实数据到位后再替换」最简洁的写法是？',
      options: ['startWith(loading)', 'buffer', 'take(1)', 'skip(1)'],
      answer: 0,
      explain:
        'startWith 先立即发射初始态再跟随源值，是首屏占位的惯用法；配合 shareReplay 还能让晚到订阅者补初始态。',
      concept: 'c-concurrency-limit',
    },
  ],
  [
    ['并发上限', 'mergeMap 第二参控制在途请求最大数量'],
    ['race', '任一源先发射即胜出、其余忽略'],
  ],
  [
    '高频事件用无界 mergeMap，下游被请求打爆（应用 mergeMap(fn, N)）。',
    '期待 race 会发射所有源（它只取先到者并丢弃其余）。',
  ],
)
