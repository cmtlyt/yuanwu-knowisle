import { L } from '../../course-builders.ts'

export const L05 = L(
  'L05',
  1,
  'map / pipe / lift：纯变换与组合子',
  2,
  ['L04'],
  ['c-transform'],
  ['熟练写出 pipe 变换链', '理解 map 的 monad 视角'],
  `
### map 是纯变换

map 不改变发射的「次数与时机」，只变换每个值的形态——这正是它和 flatMap 的分界。pipe 把若干操作符缝成一条可复用、可读的管道；lift 则让你自定义操作符。

\`\`\` title="pipe 与操作符链" note="把操作符组合先 pipe() 成常量，便于复用、单测与阅读；这也是 7.x 里最主流的写法。"
import { interval, pipe } from "rxjs"
import { map, filter, take, scan } from "rxjs/operators"

const toPercent = pipe(
  map((n) => n * 10),        // 0,1,2… → 0,10,20…
  filter((n) => n < 100),     // 截到 90
  take(5),
  scan((acc, n) => acc + n, 0) // 累加：0,10,30,60,100
)

interval(200).pipe(toPercent).subscribe((v) => console.log(v))
\`\`\`

:::deep

### monad 视角

map 对应函子（Functor）的 map，flatXxxMap 对应链式 bind，lift 对应 lift 到更高类型。一旦你接受「流是容器、操作符是组合子」，整门课的心智模型就统一了。

:::

`,
  'rxTransform',
  [
    {
      text: 'map 会改变流的发射次数或时序吗？',
      options: ['会，可能变多', '不会，只变换每个值的形态', '取决于回调', '会重置流'],
      answer: 1,
      explain: 'map 是一对一纯变换，次数与时机完全不变；改变「次数/时序」的是 flatXxxMap 与 merge。',
      concept: 'c-transform',
    },
    {
      text: 'pipe(map(f), map(g))(src) 等价于？',
      options: ['map(g) 先执行', 'src.map(g).map(f)', 'src.map(f).map(g)', '报错'],
      answer: 2,
      explain: 'pipe 从左到右依次应用：先 map(f) 再 map(g)，等价于嵌套 src.pipe(f).pipe(g)。',
      concept: 'c-transform',
    },
  ],
  [
    ['pipe', '把多个操作符按顺序组合成单一可复用函数的工具'],
    ['lift', '把操作符提升为可作用于可观察的机制'],
  ],
  [
    '用 flatMap 做纯值变换，白白引入嵌套流的复杂度（应使用 map）。',
    '把 pipe 里的操作符顺序写反，导致语义与预期不符（顺序即执行顺序）。',
  ],
)
