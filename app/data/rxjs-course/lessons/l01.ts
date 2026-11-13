import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 0 · 心智模型（压缩为 3 课） ========== */

export const L01 = L(
  'L01',
  0,
  '动机与创建源：异步组合的缺口与源操作符全景',
  30,
  1,
  [],
  ['c-callbacks', 'c-sources'],
  [
    '说清回调地狱、竞态、多源组合、时间序列四个缺口，理解 RxJS 处理的是「一段时间里的数据序列」',
    '按场景选对源操作符，理解 defer 的惰性重执行',
  ],
  [
    prose(
      '把时间装进值里',
      'Promise 只能表达「将来恰好一次」的结果；一旦要处理「一段时间里可能来很多次、可取消、可组合多个源」的事件，就只好靠回调地狱、手写防抖、定时器与 if 状态机来拼。RxJS 把「数据随时间流动」这件事抽象成一个可传递、可组合、可取消的值：Observable。',
    ),
    list('四个具体缺口', [
      '回调地狱：多个异步串行/并行组合时嵌套指数增长，且无法中途取消。',
      '竞态（race）：搜索框连点，先发请求后回、后发请求先回，旧结果盖掉新结果。',
      '多源组合：要把 A、B 两路信号按某种时序合成，纯回调没有统一模型。',
      '时间序列：「每隔 1s」「过去 5 秒内」「每 200ms 防抖」这类时间语义无处安放。',
    ]),
    code(
      '常用源操作符',
      'import { of, from, interval, timer, defer, fromEvent, empty, never, throwError } from "rxjs"\n\nof(1, 2, 3)                    // 同步、逐个、然后 complete\nfrom([1, 2, 3])                // 把数组/Promise/迭代器变成流\nfromEvent(window, "click")     // DOM 事件直接变流（热）\ntimer(200, 1000)              // 200ms 后首个，之后每 1000ms（delay + interval）\ninterval(1000)                 // 每 1000ms，从 0 开始\ndefer(() => fetchUser())       // 每次订阅都重新执行工厂\nempty()                        // 立即 complete，不发射值\nnever()                        // 永不终结、不发射值',
      'defer 是关键：它把「创建流」推迟到订阅时刻，每次订阅重新求值——避免共享一个已完成的冷源，是重试与路由重入的默认写法。',
    ),
    call(
      'deep',
      '它不是 Promise 的替代品',
      'Promise 是「恰好一个值（成功或失败）」的抽象；Observable 是「零到多个值」的抽象。Promise 是冷且一次性终结的；Observable 可以冷可热、可持续发射。两者互补：用 Promise 包一次性请求，用 Observable 包事件流。',
    ),
  ],
  'rxjsSource',
  [
    q(
      'Promise 与 Observable 最本质的区别是什么？',
      [
        'Observable 更快',
        'Promise 只产出恰好一个值（或一次失败），Observable 可产出 0..n 个值',
        'Observable 只能在浏览器用',
        'Promise 支持取消',
      ],
      1,
      'Promise 语义是「恰好一次结果」；Observable 是「一段时间里的若干次结果」，这才是它引入时序操作符的根基。',
      'c-callbacks',
    ),
    q(
      'defer(() => from(fetch())) 相比模块顶层 from(fetch()) 的好处是？',
      ['更快', '每次订阅都重新发起请求', '能取消', '类型更安全'],
      1,
      'defer 把源工厂推迟到订阅时执行，避免固化成一次性完成的冷源，适合重试与重入。',
      'c-sources',
    ),
  ],
  [
    ['回调地狱', '异步嵌套回调层层下钻，难以取消与组合'],
    ['源操作符', '产生可观察序列的函数（of/from/fromEvent/defer…）'],
  ],
  [
    '把 RxJS 当成「更快的 Promise」——它处理的是时间序列，不是单次结果。',
    '在模块顶层 new Promise / 建流，导致结果被固化、无法重试。',
  ],
)
