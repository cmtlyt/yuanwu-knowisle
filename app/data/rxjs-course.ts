/*
 * RxJS 7.8.x 深度课 —— 内容数据层（知识岛的一门课）
 * 说明：本文件是这门课唯一的内容源。新增课时只需往 LESSONS 追加一项并登记概念，
 *      不需要改动 lib/analytics.ts、lib/widgets.ts 或任何页面组件。
 * 正文一律基于 7.8.x 主线；9.0.0-beta 的破坏性变更只记在设计说明书，不混入正文。
 */
import type {
  Stage,
  Concept,
  Lesson,
  LessonBlock,
  QuizQuestion,
  CourseMeta,
  CourseData,
  CourseDesign,
} from '~/types/course'

const prose = (title: string, text: string): LessonBlock => ({ type: 'prose', title, text })
const code = (title: string, body: string, note?: string): LessonBlock => ({
  type: 'code',
  title,
  code: body,
  note: note || '',
})
const call = (tone: string, title: string, text: string): LessonBlock => ({
  type: 'callout',
  tone,
  title,
  text,
})
const list = (title: string, items: string[]): LessonBlock => ({ type: 'list', title, items })
const q = (
  text: string,
  options: string[],
  answer: number,
  explain: string,
  concept: string,
): QuizQuestion => ({ text, options, answer, explain, concept })
const L = (
  id: string,
  stage: number,
  title: string,
  minutes: number,
  difficulty: number,
  prereqs: string[],
  concepts: string[],
  goals: string[],
  blocks: LessonBlock[],
  widget: string | null,
  quiz: QuizQuestion[],
  terms: string[][],
  pitfalls: string[],
): Lesson => ({
  id,
  stage,
  title,
  minutes,
  difficulty,
  prereqs,
  concepts,
  goals,
  blocks,
  widget,
  quiz,
  terms,
  pitfalls,
})

/* ---------------- 阶段 ---------------- */
const STAGES: Stage[] = [
  {
    id: 0,
    name: '心智模型与准备',
    en: 'Mental Model',
    summary: '先换脑子：把「一段时间里的数据序列」当作一个值来传递、组合、取消。',
    color: '#6366f1',
    goal: '能解释为什么 RxJS 不是 Promise 的替代品，而是另一种时间维度的抽象',
  },
  {
    id: 1,
    name: '可观察与发射',
    en: 'Observables & Emission',
    summary: '自定义源、观察者协议、纯变换、过滤与归约。',
    color: '#3fb984',
    goal: '能独立写出并订阅一段完整的变换管道',
  },
  {
    id: 2,
    name: '扁平化',
    en: 'Flattening',
    summary: '嵌套流的展开：concatMap / mergeMap / switchMap / exhaustMap。课程核心。',
    color: '#e8a33d',
    goal: '能按交互模式正确选择扁平化操作符，讲清四者的时序差异',
  },
  {
    id: 3,
    name: '错误与生命周期',
    en: 'Errors & Lifecycle',
    summary: 'next / error / complete 的不可逆语义、重试、错误传播与防御式订阅。',
    color: '#e46a70',
    goal: '能为一条流设计完整的错误恢复路径，并做到零静默失败',
  },
  {
    id: 4,
    name: '多播与热流',
    en: 'Multicast & Hot',
    summary: 'Subject 家族、状态型 Subject、publish / share 与引用计数。',
    color: '#a878e6',
    goal: '能把一条冷流变成多订阅者共享的热连接，避免重复请求',
  },
  {
    id: 5,
    name: '调度、时间与落地',
    en: 'Scheduling & Production',
    summary: '把时间注入系统、时间算子、组合多源、背压与测试框架落地。',
    color: '#38a9c4',
    goal: '能把 RxJS 渐进引入真实项目（含 Angular），并能用虚拟时间测试',
  },
]

/* ---------------- 知识点图谱 ---------------- */
const CONCEPTS: Concept[] = [
  { id: 'c-callbacks', name: '异步组合的缺口', stage: 0, weight: 1.5, prereqs: [] },
  { id: 'c-cold-hot', name: '冷流与热流', stage: 0, weight: 3, prereqs: ['c-callbacks'] },
  { id: 'c-triplet', name: '发射三态 next/error/complete', stage: 0, weight: 3, prereqs: ['c-cold-hot'] },
  { id: 'c-teardown', name: '订阅与资源回收', stage: 0, weight: 2, prereqs: ['c-triplet'] },

  { id: 'c-sources', name: '源操作符全景', stage: 1, weight: 2, prereqs: ['c-teardown'] },
  { id: 'c-new-observable', name: '观察者协议与自定义源', stage: 1, weight: 3, prereqs: ['c-sources'] },
  { id: 'c-transform', name: 'map 与纯变换（monad）', stage: 1, weight: 3, prereqs: ['c-new-observable'] },
  { id: 'c-filter', name: '过滤与取舍', stage: 1, weight: 2, prereqs: ['c-transform'] },
  { id: 'c-reduce', name: '归约与收集', stage: 1, weight: 2, prereqs: ['c-filter'] },

  { id: 'c-flatten', name: '扁平化心智模型', stage: 2, weight: 4, prereqs: ['c-transform'] },
  { id: 'c-concat', name: 'concatMap 顺序合并', stage: 2, weight: 3, prereqs: ['c-flatten'] },
  { id: 'c-merge', name: 'mergeMap 并发合并', stage: 2, weight: 4, prereqs: ['c-flatten'] },
  { id: 'c-switch', name: 'switchMap 取最新', stage: 2, weight: 3, prereqs: ['c-merge'] },
  { id: 'c-exhaust', name: 'exhaustMap 排空', stage: 2, weight: 2, prereqs: ['c-switch'] },
  { id: 'c-concurrency-limit', name: '有界并发与竞争 race', stage: 2, weight: 3, prereqs: ['c-merge'] },

  { id: 'c-terminal', name: '终结语义不可逆', stage: 3, weight: 3, prereqs: ['c-triplet'] },
  { id: 'c-retry', name: 'catchError 与 retry', stage: 3, weight: 3, prereqs: ['c-terminal'] },
  { id: 'c-error-prop', name: '错误传播与多订阅者', stage: 3, weight: 2, prereqs: ['c-retry'] },
  { id: 'c-safe', name: '安全订阅与空流', stage: 3, weight: 2, prereqs: ['c-retry'] },

  { id: 'c-subject', name: 'Subject 多播', stage: 4, weight: 3, prereqs: ['c-cold-hot'] },
  { id: 'c-state-subj', name: '状态型 Subject', stage: 4, weight: 3, prereqs: ['c-subject'] },
  { id: 'c-share', name: 'publish / share 与引用计数', stage: 4, weight: 3, prereqs: ['c-subject'] },
  { id: 'c-share-pitfall', name: 'share 的陷阱', stage: 4, weight: 2, prereqs: ['c-share'] },

  { id: 'c-scheduler', name: '调度器与时间注入', stage: 5, weight: 3, prereqs: ['c-sources'] },
  { id: 'c-time-ops', name: '时间算子', stage: 5, weight: 3, prereqs: ['c-scheduler'] },
  { id: 'c-combine', name: '组合多源', stage: 5, weight: 3, prereqs: ['c-transform'] },
  { id: 'c-backpressure', name: '背压与缓冲', stage: 5, weight: 2, prereqs: ['c-merge'] },
  { id: 'c-testing', name: 'marble 测试与 TestScheduler', stage: 5, weight: 3, prereqs: ['c-scheduler'] },
]

/* ---------------- 课时 ---------------- */
const LESSONS: Lesson[] = [
  /* ========== Stage 0 · 心智模型（压缩为 3 课） ========== */
  L(
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
  ),

  L(
    'L02',
    0,
    '冷流与热流：订阅才产生数据',
    25,
    1,
    ['L01'],
    ['c-cold-hot', 'c-triplet'],
    ['解释冷源每次订阅独立重放', '说清热源共享同一份时间线'],
    [
      prose(
        '冷与热的分水岭',
        '冷源（cold）为每个订阅者独立运行一遍，数据只在有订阅者时才开始发射；热源（hot）独立于订阅者持续产生数据，晚到的订阅者只能拿到之后的部分。这是理解 Subject、share、组合多源之前的第一块基石。',
      ),
      code(
        '冷 vs 热',
        'import { interval, Subject } from "rxjs"\n\n// 冷：每个订阅者各自从 0 开始\ninterval(1000).pipe(take(3)).subscribe((n) => console.log("A", n))\ninterval(1000).pipe(take(3)).subscribe((n) => console.log("B", n)) // A、B 各跑一遍 0,1,2\n\n// 热：Subject 独立计时，晚到的 C 错过 0、1\nconst hot = new Subject<number>()\nhot.subscribe((n) => console.log("早到", n))\nhot.next(0); hot.next(1)\nhot.subscribe((n) => console.log("晚到", n)) // 晚到者只看到 2,3…',
        '热源没有「重放」语义，晚订阅者不会补看历史（ReplaySubject 除外）。',
      ),
      list('发射三态', [
        'next(v)：持续发射普通值，可发生 0..n 次。',
        'error(e)：以错误终止，终止后不再有任何发射（不可逆）。',
        'complete()：正常完成，同样终止（不可逆）。',
      ]),
      call(
        'tip',
        '判断冷热的一句话',
        '问「数据是否因为我订阅才开始存在？」是 → 冷；否（数据本来就在流）→ 热。DOM 事件、interval、WebSocket 是热/共享的；of/from/自定义 new Observable 是冷的。',
      ),
    ],
    'rxColdHot',
    [
      q(
        '下面哪个是典型的热源？',
        ['of(1,2,3)', 'fromEvent(el,"click")', 'timer(1000)', 'new Observable(...)'],
        1,
        'DOM 事件独立于订阅者持续发生，是热的；其余都是惰性、按订阅重放的冷源。',
        'c-cold-hot',
      ),
      q(
        '一条流调用 error() 之后还能再 next() 吗？',
        ['能，正常继续', '不能，终结不可逆', '取决于订阅者', '会抛异常'],
        1,
        'error 与 complete 都是终结信号，之后该次订阅不再接受任何 next/error/complete。',
        'c-triplet',
      ),
    ],
    [
      ['冷源 cold', '每个订阅者独立触发源执行、数据独立重放'],
      ['热源 hot', '独立于订阅者持续产生，晚订阅者错过早期数据'],
    ],
    [
      '把 interval 当冷源，期待每个订阅者拿到「相同的」时间线——它其实各自独立计时。',
      '以为 complete 后还能继续 next，或以为 error 可被重试在同一条订阅上恢复。',
    ],
  ),

  L(
    'L03',
    0,
    '订阅与资源回收：Subscription 与 teardown',
    24,
    1,
    ['L02'],
    ['c-teardown'],
    ['掌握 subscribe 的三种签名', '理解 teardown 的可组合性'],
    [
      prose(
        '订阅即资源',
        '订阅一条流会建立定时器、事件监听、网络连接等资源。RxJS 用 Subscription 统一管理，且它本身是可组合的：子订阅会挂到父订阅上，取消父订阅会级联回收所有子资源——这是防内存泄漏的关键。',
      ),
      code(
        '三种订阅签名',
        'import { interval, Subscription } from "rxjs"\n\n// 1) 传一个对象观察者\nconst s1 = interval(1000).subscribe({\n  next: (n) => console.log(n),\n  error: (e) => console.error(e),\n  complete: () => console.log("done"),\n})\n// 2) 传三个函数\ninterval(1000).subscribe((n) => {}, (e) => {}, () => "all done")\n// 3) 传一个回调（只关心 next）\ninterval(1000).subscribe((n) => console.log(n))\n\ns1.unsubscribe() // 手动回收，定时器停止\n// 或用 teardown 自动回收\nnew Subscription(() => console.log("teardown")) // 带清理回调',
        '组件卸载、路由离开时统一 unsubscribe，是 React/Vue 里最常见的泄漏源。',
      ),
      call(
        'warn',
        'teardown 是可组合的',
        'Subscription 支持 add / 级联：把多个子资源（定时器、子订阅、事件监听）都 add 进同一个 Subscription，一次 unsubscribe 全部回收。Vue 3 里通常配合 onBeforeUnmount 或 takeUntil 使用。',
      ),
    ],
    'rxTeardown',
    [
      q(
        '取消父订阅会发生什么？',
        ['只停父流，子资源泄漏', '级联取消所有子订阅，资源全部回收', '抛出异常', '子资源继续运行'],
        1,
        'Subscription 的级联设计正是为了让「取消一个订阅」能统一回收其下所有定时器/监听/子流。',
        'c-teardown',
      ),
      q(
        '组件卸载时最稳妥的做法是？',
        ['什么都不做，交给 GC', 'unsubscribe / takeUntil 主动回收', '重新订阅一次', '忽略 complete'],
        1,
        '被动等 GC 对「持有事件监听与定时器的订阅」无效，必须主动回收或靠生命周期自动取消。',
        'c-teardown',
      ),
    ],
    [
      ['Subscription', '订阅句柄，可级联、可取消、可承载 teardown 回调'],
      ['teardown', '取消订阅时执行的清理逻辑'],
    ],
    [
      '只订阅不取消，组件频繁切换导致定时器/监听堆积（最常见的性能与内存问题）。',
      '把 unsubscribe 写在错误的位置（如只清理了最后一个），遗漏中间子资源。',
    ],
  ),

  /* ========== Stage 1 · 可观察与发射（保持 4 课） ========== */
  L(
    'L04',
    1,
    '用 new Observable 自定义源：观察者协议',
    28,
    2,
    ['L03'],
    ['c-new-observable'],
    ['手写一个自定义源', '用返回清理函数回收资源'],
    [
      prose(
        '观察者协议',
        'new Observable 接收一个「订阅函数」：它被调用时拿到 observer，可对其调用 next / error / complete，并返回一个 teardown 清理函数（或 Subscription）。这是 RxJS 里「一切皆可观察」的底层入口。',
      ),
      code(
        '自定义源 + 自动清理',
        'import { Observable } from "rxjs"\n\n// 把「每秒报时 + 可停止」做成一个冷源\nconst ticker = new Observable<number>((observer) => {\n  let n = 0\n  const id = setInterval(() => {\n    observer.next(n++)\n    if (n >= 5) observer.complete()\n  }, 1000)\n  // 返回清理函数：订阅取消时 clearInterval，防泄漏\n  return () => clearInterval(id)\n})\n\nticker.subscribe({\n  next: (n) => console.log("tick", n),\n  complete: () => console.log("end"),\n})',
        '忘记返回清理函数是自定义源最常见的泄漏；订阅取消时清理函数自动执行。',
      ),
      call(
        'tip',
        '什么时候才手写 new Observable',
        '90% 场景用现成源（fromEvent / interval / fetch 包 from）即可；只有当你要把一段命令式代码（定时器、轮询、DOM 事件封装、WebSocket）封装成流时才手写。写出来一定是「惰性 + 可取消」。',
      ),
    ],
    'rxObserver',
    [
      q(
        'new Observable 的订阅函数返回什么最规范？',
        ['一个字符串', 'void', '一个 teardown 清理函数或 Subscription', '一个 Promise'],
        2,
        '返回清理函数可让订阅取消时自动回收定时器/连接，是自定义源防泄漏的关键。',
        'c-new-observable',
      ),
      q(
        '自定义源里 observer.complete() 之后还能 observer.next() 吗？',
        ['能', '不能，终结后调用无效', '会抛异常', '会重新开始'],
        1,
        '一次终结（error 或 complete）之后，该订阅的 next/error/complete 都会被忽略，语义不可逆。',
        'c-new-observable',
      ),
    ],
    [
      ['观察者协议', 'new Observable(fn) 中 fn 接收 observer 并返回 teardown'],
      ['teardown 函数', '订阅取消时执行的清理逻辑'],
    ],
    [
      '自定义源创建了定时器却不返回清理函数，订阅取消后定时器仍在跑。',
      '在源内部直接操作外部可变状态而不封装进 teardown，导致多次订阅互相干扰。',
    ],
  ),

  L(
    'L05',
    1,
    'map / pipe / lift：纯变换与组合子',
    28,
    2,
    ['L04'],
    ['c-transform'],
    ['熟练写出 pipe 变换链', '理解 map 的 monad 视角'],
    [
      prose(
        'map 是纯变换',
        'map 不改变发射的「次数与时机」，只变换每个值的形态——这正是它和 flatMap 的分界。pipe 把若干操作符缝成一条可复用、可读的管道；lift 则让你自定义操作符。',
      ),
      code(
        'pipe 与操作符链',
        'import { interval, pipe } from "rxjs"\nimport { map, filter, take, scan } from "rxjs/operators"\n\nconst toPercent = pipe(\n  map((n) => n * 10),        // 0,1,2… → 0,10,20…\n  filter((n) => n < 100),     // 截到 90\n  take(5),\n  scan((acc, n) => acc + n, 0) // 累加：0,10,30,60,100\n)\n\ninterval(200).pipe(toPercent).subscribe((v) => console.log(v))',
        '把操作符组合先 pipe() 成常量，便于复用、单测与阅读；这也是 7.x 里最主流的写法。',
      ),
      call(
        'deep',
        'monad 视角',
        'map 对应函子（Functor）的 map，flatXxxMap 对应链式 bind，lift 对应 lift 到更高类型。一旦你接受「流是容器、操作符是组合子」，整门课的心智模型就统一了。',
      ),
    ],
    'rxTransform',
    [
      q(
        'map 会改变流的发射次数或时序吗？',
        ['会，可能变多', '不会，只变换每个值的形态', '取决于回调', '会重置流'],
        1,
        'map 是一对一纯变换，次数与时机完全不变；改变「次数/时序」的是 flatXxxMap 与 merge。',
        'c-transform',
      ),
      q(
        'pipe(map(f), map(g))(src) 等价于？',
        ['map(g) 先执行', 'src.map(g).map(f)', 'src.map(f).map(g)', '报错'],
        2,
        'pipe 从左到右依次应用：先 map(f) 再 map(g)，等价于嵌套 src.pipe(f).pipe(g)。',
        'c-transform',
      ),
    ],
    [
      ['pipe', '把多个操作符按顺序组合成单一可复用函数的工具'],
      ['lift', '把操作符提升为可作用于可观察的机制'],
    ],
    [
      '用 flatMap 做纯值变换，白白引入嵌套流的复杂度（应使用 map）。',
      '把 pipe 里的操作符顺序写反，导致语义与预期不符（顺序即执行顺序）。',
    ],
  ),

  L(
    'L06',
    1,
    '过滤与取舍：filter / take / skip / distinctUntilChanged',
    26,
    2,
    ['L05'],
    ['c-filter'],
    ['按条件取舍元素', '用 distinctUntilChanged 去抖重复'],
    [
      code(
        '常用过滤操作符',
        'import { from } from "rxjs"\nimport { filter, take, skip, distinctUntilChanged, first, last } from "rxjs/operators"\n\nfrom([1, 1, 2, 3, 4, 5, 5, 6])\n  .pipe(\n    distinctUntilChanged(), // 去掉相邻重复 → 1,2,3,4,5,6\n    filter((n) => n % 2 === 0), // 偶数 → 2,4,6\n    take(2),              // 取前 2 个 → 2,4\n  )\n  .subscribe((n) => console.log(n)) // 2, 4\n\nfrom(["a", "b"]).pipe(first()).subscribe((x) => console.log(x)) // "a"',
        'distinctUntilChanged 只对「相邻」去重；要全量去重需配合 Set 自己写或 distinct(keySelector)。',
      ),
      list('取舍操作符', [
        'take(n)：取前 n 个后 complete；takeUntil(other)：另一流发信号即截断。',
        'skip(n)：丢弃前 n 个。',
        'elementAt(n)：只取第 n 个；first / last：取第一个/最后一个（配合谓词）。',
        'takeWhile(pred)：满足谓词前全取，遇到不满足即 complete。',
      ]),
      call(
        'warn',
        'takeUntil 要喂一个不会立刻 complete 的信号',
        '常见写法 takeUntil(this.destroyed$)，其中 destroyed$ 是组件卸载时 next() 一次的 Subject。喂错信号（比如自己会 complete 的流）会导致管道提前静默终止。',
      ),
    ],
    'rxFilter',
    [
      q(
        'distinctUntilChanged 的去重范围是？',
        ['整条流去重', '仅相邻重复', '可配置去重窗口', '按 key 全量去重'],
        1,
        '它只比较「上一个」值；全量去重要么自己维护 Set，要么用 distinct(keySelector)。',
        'c-filter',
      ),
      q(
        'take(3) 之后流的状态是？',
        ['继续发射', 'complete，不再发射', '挂起等待', '抛错'],
        1,
        'take(n) 取到第 n 个值就自动 complete，下游不再收到任何值——这是「截断」的内置语义。',
        'c-filter',
      ),
    ],
    [
      ['filter', '按谓词保留元素、改变发射次数'],
      ['take / skip', '按数量截断 / 丢弃前 n 个'],
    ],
    [
      '以为 distinctUntilChanged 能跨非相邻去重。',
      'takeWhile 与 take 混用：takeWhile 遇到首个不满足即停，take 是固定数量。',
    ],
  ),

  L(
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
  ),

  /* ========== Stage 2 · 扁平化（核心） ========== */
  L(
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
  ),

  L(
    'L09',
    2,
    'concatMap 与 mergeMap：排队 vs 并发',
    30,
    3,
    ['L08'],
    ['c-concat', 'c-merge'],
    ['区分 concatMap 与 mergeMap 的时序', '按场景选择'],
    [
      code(
        '排队 vs 并发',
        'import { of, mergeMap, concatMap } from "rxjs/operators"\n// concatMap：一个内层完成才启动下一个（保序、防过载）\nsrc.pipe(concatMap((id) => fetchUser(id)))   // 逐个、顺序\n\n// mergeMap：所有内层并发（快、可能乱序、过载风险）\nsrc.pipe(mergeMap((id) => fetchUser(id)))    // 全部并行\n// 限流并发：mergeMap 第二参数\nsrc.pipe(mergeMap((id) => fetchUser(id), { concurrent: 2 })) // 最多 2 个并发',
        'concatMap 像「排队点餐」；mergeMap 像「开多个窗口」，默认无界并发。',
      ),
      list('何时用哪个', [
        '必须保序、或对下游限流 → concatMap。',
        '彼此独立、越快越好（如批量并行取 N 个不相关资源）→ mergeMap。',
        '搜索框每次输入都请求、且要最新 → switchMap（下一课）。',
        '防止请求风暴、限制在途数量 → mergeMap 带 { concurrent: N }。',
      ]),
      call(
        'warn',
        'mergeMap 默认无界并发',
        '事件来多少就并发多少，没有节流。高并发场景务必给 { concurrent } 或改用 switchMap/exhaustMap，否则下游被打爆。',
      ),
    ],
    'rxCross',
    [
      q(
        'concatMap 与 mergeMap 的核心差异是？',
        ['concatMap 更快', 'concatMap 串行保序；mergeMap 并发', '完全相同', 'mergeMap 保序'],
        1,
        'concatMap 等前一个内层完成才启动下一个（保序）；mergeMap 让内层并行（乱序风险）。',
        'c-concat',
      ),
      q(
        '限制在途并发数为 3，最合适的写法是？',
        ['concatMap', 'mergeMap(x, {concurrent:3})', 'switchMap', 'exhaustMap'],
        1,
        'mergeMap 的第二参 { concurrent } 就是为「有界并发」设计的，既并发又限流。',
        'c-merge',
      ),
      q(
        '一批彼此独立的 10 张图片，希望尽快全部加载完成，最合适的扁平化是？',
        ['concatMap', 'mergeMap', 'switchMap', 'exhaustMap'],
        1,
        '彼此独立、越快越好 → mergeMap 并发加载；若必须保序或对接口限流才用 concatMap。',
        'c-merge',
      ),
    ],
    [
      ['concatMap', '内层串行合并，保证顺序与限流'],
      ['mergeMap', '内层并发合并（7.x 中 flatMap 是其别名）'],
    ],
    [
      '搜索框输入用 mergeMap，旧请求回来盖掉新结果（应使用 switchMap）。',
      '对高并发事件源用无界 mergeMap，下游被请求打爆。',
    ],
  ),

  L(
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
  ),

  L(
    'L11',
    2,
    '扁平化的选择决策树',
    24,
    3,
    ['L10'],
    ['c-flatten'],
    ['能按交互模式选对扁平化操作符', '理解「取消 vs 忽略 vs 排队 vs 并发」'],
    [
      list('决策树', [
        '要不要取消旧的？→ 是（搜索/最新值）：switchMap。',
        '要不要忽略新的（进行中排空）？→ 是（防重复提交）：exhaustMap。',
        '要不要严格保序、一个一个来？→ 是（顺序敏感、限流）：concatMap。',
        '要不要并发、越快越好？→ 是（批量独立请求）：mergeMap（可带 { concurrent }）。',
      ]),
      code(
        '一图四例',
        'import { mergeMap, concatMap, switchMap, exhaustMap } from "rxjs/operators"\n\nsearch$.pipe(switchMap(q => api(q)))     // 取消旧、取最新\njobs$.pipe(concatMap(j => run(j)))        // 排队、保序\ntasks$.pipe(mergeMap(t => fetch(t), { concurrent: 3 })) // 有界并发\nsubmit$.pipe(exhaustMap(() => save()))     // 进行中忽略',
        '把四个操作符当「时序策略旋钮」来记：顺序 / 并发 / 取最新 / 排空。',
      ),
      call(
        'tip',
        '记法',
        '「搜索框永远 switchMap，批量独立任务 mergeMap，顺序任务 concatMap，进行中不可打断用 exhaustMap」。把场景和操作符绑定记忆，比背定义牢得多。',
      ),
    ],
    'rxCross',
    [
      q(
        '「任务必须按提交顺序逐个执行，前面的完成才开始下一个」用？',
        ['mergeMap', 'switchMap', 'concatMap', 'exhaustMap'],
        2,
        'concatMap 串行保序，前一个内层完成才启动下一个，正好满足顺序执行。',
        'c-flatten',
      ),
      q(
        '「只保留最新一次输入的结果，旧请求作废」用？',
        ['exhaustMap', 'concatMap', 'switchMap', 'mergeMap'],
        2,
        'switchMap 会取消旧内层、订阅新内层，是搜索/最新值竞态的标准解。',
        'c-flatten',
      ),
      q(
        '「进行中不可打断，做完前忽略新值、做完接受下一次」用？',
        ['switchMap', 'concatMap', 'mergeMap', 'exhaustMap'],
        3,
        'exhaustMap「排空」语义：当前内层未完成时新外值被忽略，完成后放行下一个，适合防重复提交。',
        'c-flatten',
      ),
    ],
    [
      ['时序策略', '多个内层流重叠时的合并规则'],
      ['取消 vs 忽略', 'switchMap 取消旧内层；exhaustMap 忽略新外值'],
    ],
    [
      '把四个操作符都当成「能扁平就行」，不区分取消/忽略/保序语义。',
      '对需要顺序的资源分配用 mergeMap 造成乱序与过载。',
    ],
  ),

  /* ========== Stage 3 · 错误与生命周期 ========== */
  /* ---- Stage 2 追加：有界并发与竞争（难点加密） ---- */
  L(
    'L12',
    2,
    '并发限制与竞争：mergeMap 并发度 / race / startWith',
    30,
    3,
    ['L11'],
    ['c-concurrency-limit'],
    ['用 mergeMap 并发度参数控制并发上限', '讲清 race 与 startWith 语义'],
    [
      code(
        '有界并发与竞争',
        'import { of, race, interval } from "rxjs"\nimport { mergeMap, startWith } from "rxjs/operators"\n\n// 有界并发：最多 2 个在途请求，其余排队\nof(1, 2, 3, 4, 5)\n  .pipe(mergeMap((id) => fetchUser(id), 2)) // 第二参 = 并发上限\n\n// race：任一源先发则胜出，其余忽略\nrace(interval(50), of("fast")).subscribe((v) => console.log("winner", v))\n\n// startWith：先给初始值，再跟随源值\nof("A", "B").pipe(startWith("init")).subscribe((v) => console.log(v))',
        'mergeMap 第二参把「无界并发」压成「有界并发」，是高频事件（如批量上传）的标准解；startWith 补 UI 首帧初始态。',
      ),
      prose(
        'startWith 补初始值',
        'startWith(x) 会先立即发射 x 再跟随后面的源值，专治「UI 首帧没有可用状态」；配合 shareReplay 是跨路由共享状态的常见组合。',
      ),
      call(
        'deep',
        '并发上限是 concatMap 与无界 mergeMap 的中间档',
        'concatMap 严格保序（并发=1），无界 mergeMap 可能打爆下游；mergeMap(fn, N) 是「最多 N 个并发、其余排队」，比串并行都更贴合真实限流。',
      ),
    ],
    'rxCross',
    [
      q(
        '10 个请求最多同时跑 2 个，最合适？',
        ['concatMap', 'mergeMap(fn, 2)', 'switchMap', 'exhaustMap'],
        1,
        'mergeMap 第二参限制并发数；2 表示至多 2 个在途、其余排队，兼顾速度与限流。',
        'c-concurrency-limit',
      ),
      q(
        'race(a$, b$) 中 a$ 先发射时结果是？',
        ['两个都按序发', '只发 a$ 的值并取消 b$', '只发 b$', '报错'],
        1,
        'race 取「先到者」：任一源先 next 就发出该值并终止其余源，常用于竞速/取消。',
        'c-concurrency-limit',
      ),
      q(
        '「UI 首帧先展示加载态，真实数据到位后再替换」最简洁的写法是？',
        ['startWith(loading)', 'buffer', 'take(1)', 'skip(1)'],
        0,
        'startWith 先立即发射初始态再跟随源值，是首屏占位的惯用法；配合 shareReplay 还能让晚到订阅者补初始态。',
        'c-concurrency-limit',
      ),
    ],
    [
      ['并发上限', 'mergeMap 第二参控制在途请求最大数量'],
      ['race', '任一源先发射即胜出、其余忽略'],
    ],
    [
      '高频事件用无界 mergeMap，下游被请求打爆（应用 mergeMap(fn, N)）。',
      '期待 race 会发射所有源（它只取先到者并丢弃其余）。',
    ],
  ),
  L(
    'L13',
    3,
    '终结语义：error 与 complete 不可逆',
    24,
    2,
    ['L03'],
    ['c-terminal'],
    ['理解流的一次性终结', '区分 complete 与 error'],
    [
      prose(
        '一次终结，永久关闭',
        '一条流一旦发出 error 或 complete，对该订阅而言就永久结束，不能再 next。这是 Promise「恰好一次结果」在时间维度的推广：多值流也可以「恰好一次地终结」。',
      ),
      code(
        '两种终结',
        'import { of } from "rxjs"\nimport { finalize, tap } from "rxjs/operators"\n\nof(1, 2, 3).pipe(\n  tap((n) => console.log("next", n)),\n  finalize(() => console.log("无论成功/失败/取消都会跑")) // 资源清理统一放这里\n).subscribe({\n  complete: () => console.log("正常完成"),\n  error: (e) => console.log("以错误结束", e),\n})',
        'finalize 是「无论以何种方式结束都执行」的钩子，适合做资源清理，等价于 try/finally。',
      ),
      call(
        'deep',
        '为什么终结不可逆是特性而非缺陷',
        '正因为不可逆，下游可以放心假设「拿到 complete 就再不会有值」，不必做幂等去重。若流能「复活」，整个时间语义会崩塌。',
      ),
    ],
    'rxTeardown',
    [
      q(
        '一条流调用 complete() 之后会怎样？',
        ['可以再次 next', '对该订阅永久结束，不再接受任何信号', '自动重连', '抛错'],
        1,
        'complete 与 error 都是终结且不可逆；之后的 next/error/complete 都会被忽略。',
        'c-terminal',
      ),
      q(
        '「无论流成功、失败还是被取消都要清理资源」应该放在哪？',
        ['next', 'finalize', 'filter', 'take'],
        1,
        'finalize 在任何终结方式（完成/错误/取消）时都执行，是资源清理的统一位置。',
        'c-terminal',
      ),
    ],
    [
      ['终结信号', 'error 与 complete，使流不可逆地结束'],
      ['finalize', '任意结束方式都会触发的清理钩子'],
    ],
    [
      '以为 complete 后还能继续 next（不可逆）。',
      '把资源清理写在 complete 回调里，结果流 error 时泄漏（应使用 finalize）。',
    ],
  ),

  L(
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
  ),

  L(
    'L15',
    3,
    '错误传播：错误只在一条路径上走',
    24,
    3,
    ['L14'],
    ['c-error-prop'],
    ['理解错误在多订阅/多分支下的传播规则', '避免错误被静默吞掉'],
    [
      prose(
        '错误是「值」，沿管道向下游传播',
        '没有 catchError/retry 接住，error 会一路向下传播到最终订阅者的 error 回调。若某条分支被 merge/combineLatest 汇入，错误会传播到合并流；被 flatMap 内层抛出则会按扁平化语义处理。',
      ),
      code(
        '多分支与错误',
        'import { throwError, merge } from "rxjs"\nimport { catchError, tap } from "rxjs/operators"\n\nconst a = throwError(() => new Error("A 挂了"))\nconst b = of("b1")\nmerge(a, b).subscribe({\n  next: (v) => console.log("next", v),\n  error: (e) => console.log("整体以", e, "结束") // 一条分支 error，整个合并流 error',
        '多源合并时，任一路 error 会让合并流 error；要「某路失败不拖垮整体」需用 catchError 在该路兜底。',
      ),
      call(
        'warn',
        '静默失败是最危险的反模式',
        '订阅里不写 error 回调、或 catch 后 console.log 了事，是「静默失败」。生产环境要么有全局错误边界，要么显式上报，绝不能让错误在某个未订阅的分支里悄悄消失。',
      ),
    ],
    'rxTeardown',
    [
      q(
        '两条流 merge 后，其中一条 error 会发生什么？',
        ['只有那条停', '整个合并流 error，全部订阅者收到', '自动忽略该路', '变成 complete'],
        1,
        '合并流把任一路的 error 视为整体 error；想让某路失败不传播，要在该路单独 catchError。',
        'c-error-prop',
      ),
      q(
        '「某路失败不应拖垮整体合并流」应怎么做？',
        ['什么都不做', '在该路加 catchError 兜底', '用 mergeMap', '用 take'],
        1,
        '在出错的那一路单独 catchError（恢复成正常流或吞掉），错误才不会传播到合并层。',
        'c-error-prop',
      ),
      q(
        '要杜绝「错误在某处被静默吞掉」，最稳妥的做法是？',
        [
          '订阅不写 error 回调，交给 GC',
          'catch 后 console.log 了事',
          '在管道末端统一 catchError 上报',
          '对每路都加 retry(99)',
        ],
        2,
        '末端统一捕获 + 显式上报（或全局错误边界）才能保证错误不消失；零散 log 与无限重试都是静默失败/重试风暴。',
        'c-error-prop',
      ),
    ],
    [
      ['错误传播', 'error 作为值沿管道向下游订阅者传播'],
      ['静默失败', '错误被吞掉、无人上报'],
    ],
    [
      '在多源合并里不处理某一路的 error，导致整体流意外终止。',
      'catch 后仅打印日志不上报，生产环境「静默失败」。',
    ],
  ),

  L(
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
  ),

  /* ========== Stage 4 · 多播与热流 ========== */
  L(
    'L17',
    4,
    'Subject：把冷流变成可多播的热源',
    26,
    3,
    ['L02'],
    ['c-subject'],
    ['用 Subject 共享一条时间线', '理解 Subject 即观察者又可被订阅'],
    [
      prose(
        'Subject 的两副面孔',
        'Subject 既是 Observer（可 next/error/complete 推数据），又是 Observable（可 subscribe 收数据）。一条源可以「喂给」多个 Subject，让 N 个订阅者共享同一份时间线——这就是多播（multicast）。',
      ),
      code(
        '一个源，多个消费者',
        'import { interval } from "rxjs"\nimport { Subject } from "rxjs"\n\nconst hot = new Subject<number>()\ninterval(1000).pipe(take(5)).subscribe((n) => hot.next(n)) // 源喂给 Subject\n\nhot.subscribe((n) => console.log("UI 面板", n))   // 晚到也共享同一份\nhot.subscribe((n) => console.log("日志面板", n))   // 多订阅者同步看到',
        '注意：这里源仍在「推」，Subject 只是转发；晚到订阅者会错过已发过的值（ReplaySubject 除外）。',
      ),
      call(
        'deep',
        'Subject 是「广播」不是「重放」',
        '普通 Subject 不保存历史：你 next() 发过的值，晚到的订阅者看不到。需要「新订阅者立刻拿到最近值」是 BehaviorSubject，「拿到最近 N 个」是 ReplaySubject。',
      ),
    ],
    'rxSubject',
    [
      q(
        'Subject 同时具备哪两种身份？',
        ['只是 Observer', '只是 Observable', '既是被订阅的源，又是可推数据的观察者', '只是定时器'],
        2,
        'Subject 双身份：能 next()（观察者）又能 subscribe()（可观察），这是它能做多播广播的原因。',
        'c-subject',
      ),
      q(
        '普通 Subject 晚到的订阅者能拿到之前发过的值吗？',
        ['能，自动重放', '不能，不保存历史', '只能拿最后一个', '拿前 5 个'],
        1,
        '普通 Subject 不存历史；要「拿最近值」用 BehaviorSubject，「拿最近 N 个」用 ReplaySubject。',
        'c-subject',
      ),
      q(
        '一个 Subject 调用了 complete() 之后，再继续 next() 会发生什么？',
        [
          '继续正常发出',
          'next 被忽略（已终止），且 complete 已传播给所有订阅者并终结流',
          '抛 JS 异常',
          '自动重开',
        ],
        1,
        'error/complete 会传播给全部订阅者并让 Subject 进入终止态，之后再 next 无效。这是「热流也会终结」的陷阱，与「晚到无历史」是不同面向。',
        'c-subject',
      ),
    ],
    [
      ['Subject', '既是 Observer 又是 Observable，可多播'],
      ['多播', '一条源被多个订阅者共享'],
    ],
    [
      '以为普通 Subject 会重放历史（它不会，需行为/回放型）。',
      '把 Subject 当冷源，期待每次订阅都「从头」重放。',
    ],
  ),

  L(
    'L18',
    4,
    '状态型 Subject：Behavior / Replay / Async',
    28,
    3,
    ['L17'],
    ['c-state-subj'],
    ['按需求选对状态型 Subject', '理解「初始值/缓冲」的语义'],
    [
      code(
        '三种状态型',
        'import { BehaviorSubject, ReplaySubject, AsyncSubject } from "rxjs"\n\nconst b = new BehaviorSubject(0)          // 必须有初始值，新订阅者立刻拿到「当前值」\nb.next(10)\nb.subscribe((v) => console.log(v))         // 立刻 10，之后随 next\n\nconst r = new ReplaySubject(3)             // 缓存最近 3 个\nr.next(1); r.next(2); r.next(3); r.next(4)\nr.subscribe((v) => console.log(v))         // 2,3,4（最早 1 被挤掉）\n\nconst a = new AsyncSubject()              // 只发「最后一个」，且 complete 时才发\na.next(1); a.next(2)\na.complete()\na.subscribe((v) => console.log(v))         // 2',
        'Behavior「最新值」、Replay「最近 N 个」、Async「完成时给最后一个」——语义差异极大。',
      ),
      list('怎么选', [
        '需要「订阅即拿当前值」（如表单初始值、开关状态）→ BehaviorSubject。',
        '需要「新订阅者补看最近 N 条」（聊天历史、日志回放）→ ReplaySubject(N)。',
        '需要「等完成才给最终结果」（如某次任务结束后的最终值）→ AsyncSubject。',
      ]),
      call(
        'warn',
        'ReplaySubject 会一直持有缓冲',
        '不设容量上限的 ReplaySubject 在长期运行的热流上会无限堆积内存；务必给 bufferSize 或改用 shareReplay({ bufferSize })。',
      ),
    ],
    'rxSubject',
    [
      q(
        '「新订阅者立刻拿到最近一个值」应使用？',
        ['普通 Subject', 'BehaviorSubject', 'ReplaySubject', 'AsyncSubject'],
        1,
        'BehaviorSubject 需要初始值，并把「当前值」立即发给新订阅者，之后随 next 更新。',
        'c-state-subj',
      ),
      q(
        '「等整个流 complete 时才把最后一个值发给订阅者」是？',
        ['BehaviorSubject', 'ReplaySubject', 'AsyncSubject', '普通 Subject'],
        2,
        'AsyncSubject 只在 complete 时发一次「最终值」，若流从未 complete 则订阅者什么都拿不到。',
        'c-state-subj',
      ),
      q(
        'BehaviorSubject 的构造有什么硬性要求？',
        ['无要求，可选初始值', '必须提供初始值', '必须提供缓冲上限', '必须传清理函数'],
        1,
        'BehaviorSubject(v) 强制要求初始值，新订阅者立即收到「当前值」，之后随 next 更新。',
        'c-state-subj',
      ),
    ],
    [
      ['BehaviorSubject', '需初始值，新订阅者立即拿到当前值'],
      ['ReplaySubject', '缓存最近 N 个值供新订阅者重放'],
    ],
    [
      '长期运行的热流用无上限 ReplaySubject，内存无限增长。',
      '期望 AsyncSubject 在未 complete 时就有值（它只在完成时发最后一个）。',
    ],
  ),

  L(
    'L19',
    4,
    '连接共享：publish / multicast / share 与 refCount',
    30,
    3,
    ['L17'],
    ['c-share'],
    ['用 share 让多订阅者共用一条源', '理解 refCount 的自动连接/断开'],
    [
      prose(
        '为什么要「共享」',
        '默认每条订阅都独立重放冷源。若某源开销大（网络请求、WebSocket），多个组件各订阅一次就会发起 N 次请求。share/publish 让所有订阅者连接「同一条」上游，N 个订阅者 → 1 次源执行。',
      ),
      code(
        'share 的等价形态',
        'import { of, interval } from "rxjs"\nimport { share, tap } from "rxjs/operators"\n\n// 等价于 new BehaviorSubject(...) 的「连接 + 重放最近」形态（取决于参数）\nconst shared$ = interval(1000)\n  .pipe(\n    tap(() => console.log("源只执行一次")), // 多订阅者都看到 1 次\n    share({ refCount: true }) // 第一个订阅者连接，最后一个取消时断开\n  )\n\nshared$.subscribe(() => console.log("订阅 A"))\nshared$.subscribe(() => console.log("订阅 B")) // 共享同一时间线',
        'refCount: true 时，订阅者计数归零自动断开上游；这是「懒连接」的关键。',
      ),
      call(
        'deep',
        'share 与 BehaviorSubject 的边界',
        'share() 不重放历史（新订阅者拿不到已发值）；需要「新订阅者补最近值」时改用 shareReplay / BehaviorSubject。选错会让「晚进页面」的组件状态错乱。',
      ),
    ],
    'rxShare',
    [
      q(
        '多组件共用同一昂贵源，避免重复请求，最常用？',
        ['各写一份 from()', 'share（让 N 个订阅者连接一条上游）', 'concat', 'reduce'],
        1,
        'share 把源「连接共享」：第一个订阅者建立上游，后续订阅者复用，最后一个取消才断开。',
        'c-share',
      ),
      q(
        'refCount: true 的作用是？',
        ['限制并发数', '订阅者计数归零时自动断开上游', '重放历史', '缓存结果'],
        1,
        'refCount 让共享流「有订阅者才连接、无人订阅就断开」，避免无人消费时上游还在跑。',
        'c-share',
      ),
      q(
        'N 个组件订阅同一份 interval(1000).pipe(share({ refCount: true }))，上游源执行几次？',
        ['N 次（每人一次）', '1 次（共享一条上游连接）', '0 次', 'N² 次'],
        1,
        'share 把 N 个订阅者接到同一条上游，源只执行 1 次；refCount 在订阅数归零时自动断开，再次订阅才重建。',
        'c-share',
      ),
    ],
    [
      ['multicast', '让一条源被多订阅者共享'],
      ['refCount', '按订阅者计数自动连接/断开'],
    ],
    [
      '每个组件各自 from(request) 发起重复请求（应使用 share 共享）。',
      '用 share() 期待重放历史，结果晚订阅者状态缺失（应使用 shareReplay/BehaviorSubject）。',
    ],
  ),

  L(
    'L20',
    4,
    'share 的陷阱：连接、断开与重放边界',
    26,
    3,
    ['L19'],
    ['c-share-pitfall'],
    ['识别 share 的常见坑', '为「晚到订阅者」补状态'],
    [
      list('三大陷阱', [
        '陷阱一：晚到订阅者错过早期值——share() 不重放，需 shareReplay / BehaviorSubject。',
        '陷阱二：无人订阅就断开——refCount 归零即断开，再次订阅会重新建立，可能重发请求。',
        '陷阱三：错误传播后整条共享流终结——一个订阅者触发的 error 会让 share 流永久结束，所有订阅者受影响。',
      ]),
      code(
        '为晚到者补状态',
        'import { fromEvent } from "rxjs"\nimport { shareReplay, startWith } from "rxjs/operators"\n\n// 路由重入 / 晚挂载的组件需要「当前值 + 未来值」\ntheme$.pipe(shareReplay(1)).subscribe((t) => apply(t)) // 重放最近 1 个\n\n// 或给初始值，让任何时刻订阅者都有可用态\nstate$.pipe(startWith(DEFAULT), shareReplay()).subscribe((s) => render(s))',
        'shareReplay(1) 让「任何时候来」的订阅者立即拿到最近值，是 SPA 里跨路由共享状态的关键。',
      ),
      call(
        'warn',
        'error 会终结共享流',
        'share 流一旦 error，对所有订阅者永久结束。要「一条分支挂了整条都废」之外的语义，得在源头加 retry/catchError，或干脆不共享带错误语义的流。',
      ),
    ],
    'rxShare',
    [
      q(
        '「晚进页面的组件也要立即拿到最近一次状态」最合适的做法是？',
        ['share()', 'shareReplay / startWith(初始值)', 'concat', 'take(0)'],
        1,
        'share() 不重放历史；shareReplay 会缓存最近值，startWith 提供初始态，二者才能让晚到者有可用状态。',
        'c-share-pitfall',
      ),
      q(
        '共享流收到 error 后会发生什么？',
        ['自动重试', '对所有订阅者永久终结', '只影响该订阅者', '变成 complete'],
        1,
        'error 沿共享流传播给全部订阅者并终结它；要避免「一处挂全废」需在源头加重试或兜底。',
        'c-share-pitfall',
      ),
      q(
        '跨路由共享主题状态用 shareReplay() 相比 share() 额外解决了什么？',
        ['晚到订阅者能立即拿到最近一次值', '减少并发请求', '提高发射频率', '自动取消 error'],
        0,
        'shareReplay 缓存最近值供新订阅者重放；share() 不重放历史，晚进页面的组件会拿到空状态。',
        'c-share-pitfall',
      ),
    ],
    [
      ['重放边界', 'share 不重放 vs shareReplay/Behavior 重放'],
      ['连接生命周期', 'refCount 归零断开、重订重连'],
    ],
    [
      '用 share() 跨路由共享状态，结果晚到组件拿不到值（应使用 shareReplay/startWith）。',
      '忽略共享流的 error 终结语义，一条分支失败拖垮所有消费者。',
    ],
  ),

  /* ========== Stage 5 · 调度、时间与落地 ========== */
  /* ---- Stage 4 追加：热流选型与泄漏排查（难点加密） ---- */
  L(
    'L21',
    4,
    '热流选型与内存泄漏排查：Subject vs share 实战',
    30,
    3,
    ['L20'],
    ['c-subject'],
    ['在 Subject / BehaviorSubject / shareReplay 间正确选型', '排查 refCount 三类内存泄漏场景'],
    [
      list('选型对照', [
        '要「已知初始值 + 新订阅者立刻拿当前值」→ BehaviorSubject(initial)。',
        '要「新订阅者补最近 N 个」→ ReplaySubject(N) 或 shareReplay({ bufferSize: N })。',
        '要「N 个订阅者共享一条昂贵源、自动连接/断开」→ share({ refCount: true })。',
        '要「纯广播、不重放」→ Subject。',
      ]),
      code(
        '三类内存泄漏排查',
        '// ① 无界 ReplaySubject：new ReplaySubject()（不设上限）长期热流会无限堆积\n// ② shareReplay 默认 refCount:false：最后一个订阅者取消后源可能仍连接\n// ③ 组件卸载未取消订阅：theme$.subscribe(apply) 缺 takeUntil(destroy$)，定时器/监听常驻',
        '热流泄漏三源：无界缓冲、共享流不断开、订阅不回收——排查时依次核对这三点。',
      ),
      call(
        'warn',
        'share + refCount 的「重连即重请求」特性',
        'refCount:true 时订阅数归零会断开源；再次订阅会重新执行源——若源是网络请求就会重发。要「连一次就常驻」用 share({ refCount: false }) 或 BehaviorSubject。',
      ),
    ],
    'rxSubject',
    [
      q(
        '「晚进页面的组件也要立刻拿到最近一次主题值」最合适？',
        ['Subject', 'BehaviorSubject / shareReplay(1)', 'ReplaySubject(0)', 'concat'],
        1,
        'BehaviorSubject 需初始值并发当前值；shareReplay(1) 重放最近一个；普通 Subject 不重放。',
        'c-subject',
      ),
      q(
        'share({ refCount: true }) 下所有订阅者取消后，再次订阅会发生？',
        ['复用缓存值不重请求', '重新执行源、可能重发请求', '报错', '永久挂起'],
        1,
        'refCount 归零即断开，重订重连是特性，昂贵源要显式设计是否「常驻」。',
        'c-subject',
      ),
      q(
        '「组件卸载后定时器/监听仍常驻」这类泄漏的直接原因是？',
        [
          'ReplaySubject 无上限',
          '卸载时未取消订阅（缺 takeUntil / unsubscribe）',
          'refCount 为 true',
          'next 调用太频繁',
        ],
        1,
        '泄漏三源之一：订阅未随组件生命周期回收；无界缓冲与 refCount 失配是另外两类，需分别排查。',
        'c-subject',
      ),
    ],
    [
      ['refCount 泄漏', '源昂贵且 refCount 配置失当时重连触发重执行与堆积'],
      ['takeUntil', '组件卸载自动取消订阅，防监听常驻'],
    ],
    [
      '长期热流用无界 ReplaySubject，内存无限增长。',
      '组件卸载忘记取消订阅，定时器/监听堆积（应使用 takeUntil / destroy$）。',
    ],
  ),
  L(
    'L22',
    5,
    '调度器：把时间注入系统',
    28,
    3,
    ['L01'],
    ['c-scheduler'],
    ['理解 Scheduler 把「时间」变成可替换的依赖', '选对调度器'],
    [
      prose(
        '时间是一种依赖',
        '调度器（Scheduler）把「何时、以什么节奏执行」从代码里抽离成可注入的参数。同一套时间逻辑，换个调度器就能跑在宏任务 / 微任务 / 动画帧上，还能在测试里换成「虚拟时间」。这是 RxJS 可测试性的根基。',
      ),
      code(
        '三种常见调度器',
        'import { of, asyncScheduler, queueScheduler, animationFrameScheduler } from "rxjs"\n\nof(1).pipe(map(n => n + 1)).subscribe() // 默认同步\n\n// 异步（宏任务）：把执行推到 setTimeout 队列\nof(1, 2, 3).pipe(subscribeOn(asyncScheduler), /* ... */)\n   .subscribe((n) => console.log(n))\n\n// 微任务（Promise）\n// 动画帧：与 requestAnimationFrame 对齐，做动画更顺',
        'subscribeOn 决定「何时订阅/首次发射」；observeOn 决定「后续值在哪个调度器上被消费」。',
      ),
      list('四个调度器', [
        'queueScheduler：微任务（Promise.resolve），最接近同步。',
        'asyncScheduler：宏任务（setTimeout/queueMicrotask），默认异步。',
        'animationFrameScheduler：requestAnimationFrame，做动画。',
        'asapScheduler：队列优先、溢出宏任务（默认异步选择）。',
      ]),
      call(
        'deep',
        'subscribeOn vs observeOn',
        'subscribeOn 只影响「建立订阅 + 首次发射」的时机；observeOn 影响「每个值在哪个任务上被处理」。要整条流都异步，用 observeOn。',
      ),
    ],
    'rxScheduler',
    [
      q(
        '「让后续每个值都在微任务队列里被处理」应使用？',
        ['subscribeOn(queueScheduler)', 'observeOn(queueScheduler)', 'map', 'startWith'],
        1,
        'observeOn 控制每个值的消费时机；subscribeOn 只管订阅与首发射，不改变后续值的调度。',
        'c-scheduler',
      ),
      q(
        '做 UI 动画、希望发射对齐渲染帧，选哪个调度器？',
        ['queueScheduler', 'animationFrameScheduler', 'timer', 'asapScheduler'],
        1,
        'animationFrameScheduler 把执行对齐 requestAnimationFrame，避免与渲染争抢主线程。',
        'c-scheduler',
      ),
      q(
        '「让后续每个值都在宏任务队列里被消费」应使用？',
        ['subscribeOn(asyncScheduler)', 'observeOn(asyncScheduler)', 'map(fn)', 'delay(0)'],
        1,
        'observeOn 控制每个值在哪个调度器上被处理；subscribeOn 只影响订阅与首次发射的时机。',
        'c-scheduler',
      ),
    ],
    [
      ['Scheduler', '把「时间/节奏」抽离为可注入依赖'],
      ['subscribeOn / observeOn', '分别控制订阅时机与值消费时机'],
    ],
    [
      '混用 subscribeOn 与 observeOn，期望「整条流异步」却只异步了首发射。',
      '在高并发 UI 里默认用宏任务调度，主线程被阻塞、动画掉帧。',
    ],
  ),

  L(
    'L23',
    5,
    '时间算子：debounceTime / throttleTime / sampleTime',
    30,
    3,
    ['L22'],
    ['c-time-ops'],
    ['区分去抖/节流/采样', '按交互模式选时间算子'],
    [
      prose(
        '三种「时间整形」',
        '输入事件太频繁时，用时间算子整形：debounceTime 只在「静默 N 毫秒后」发最后一个（去抖）；throttleTime 每 N 毫秒最多发一次（节流）；sampleTime 每 N 毫秒采样一次最近值（采样）。三者时序语义完全不同。',
      ),
      code(
        '三件套',
        'import { fromEvent } from "rxjs"\nimport { debounceTime, throttleTime, sampleTime, auditTime } from "rxjs/operators"\n\ninput$.pipe(debounceTime(300))            // 停打 300ms 才发最后一次（搜索框）\ninput$.pipe(throttleTime(200))            // 每 200ms 最多发一次（拖拽/滚动）\nstream$.pipe(sampleTime(500))             // 每 500ms 采一次最新值（进度条刷新）\nstream$.pipe(auditTime(1000))            // 每个 1s 窗口内只处理「最后」到来的值',
        'debounceTime 静默才发；throttleTime 固定节奏；sampleTime 定时采样；auditTime 窗口内取最后。',
      ),
      list('按交互选', [
        '搜索框打字 → debounceTime（静默后发最新）。',
        '滚动/拖拽高频 → throttleTime（限频）。',
        '轮询刷新 UI → sampleTime（定时取最近值）。',
        '批处理，每个时间窗只认最后一个 → auditTime。',
      ]),
      call(
        'tip',
        'debounce 与 throttle 是高频混淆点',
        'debounce「等你停手」才触发；throttle「不管你停没停，固定间隔触发一次」。搜索用 debounce，滑动/滚动用 throttle。',
      ),
    ],
    'rxScheduler',
    [
      q(
        '「用户停打 300ms 后才触发搜索」最合适？',
        ['throttleTime(300)', 'debounceTime(300)', 'sampleTime(300)', 'delay(300)'],
        1,
        'debounceTime 在「静默 N ms」后发最后一个值，正是搜索框去抖语义。',
        'c-time-ops',
      ),
      q(
        'throttleTime 与 debounceTime 的核心差异是？',
        [
          '没有差异',
          'throttle 固定节奏发一次；debounce 要静默才发最后一个',
          'debounce 更快',
          'throttle 会丢值',
        ],
        1,
        'throttle「每 N ms 至多发一次」（不管你停没停）；debounce「停 N ms 才发最后一次」。',
        'c-time-ops',
      ),
      q(
        '「每个 1s 时间窗内只处理最后到达的那个值，静默则不发」是？',
        ['debounceTime(1000)', 'throttleTime(1000)', 'auditTime(1000)', 'sampleTime(1000)'],
        2,
        'auditTime 窗口内只放行「最后到达」的值，窗口无值则静默；sampleTime 是每窗口定时采样最近值，语义不同。',
        'c-time-ops',
      ),
    ],
    [
      ['debounceTime', '静默 N ms 后发最后一个值'],
      ['throttleTime', '每 N ms 至多发一次'],
    ],
    [
      '搜索框用 throttleTime 导致「打到一半就请求」（应使用 debounceTime）。',
      '把 sampleTime 当 debounceTime 用，期待它「静默才发」（它是定时采样最近值）。',
    ],
  ),

  L(
    'L24',
    5,
    '组合多源：combineLatest / merge / zip / withLatestFrom',
    30,
    3,
    ['L05'],
    ['c-combine'],
    ['按时序语义选组合操作符', '理解「谁等谁」'],
    [
      code(
        '四种组合',
        'import { of, merge, zip, combineLatest } from "rxjs"\n\n// merge：任一源来值就转发（谁先到转发谁，不等待）\nmerge(a$, b$).subscribe((v) => console.log("任一", v))\n\n// zip：按「配对」同步取，第 1 个配第 1 个……\nzip(a$, b$).subscribe(([x, y]) => console.log("成对", x, y))\n\n// combineLatest：每个源「至少发过一次」后，任一变化就发最新值组合\ncombineLatest(a$, b$).subscribe(([x, y]) => console.log("最新组合", x, y))\n\n// withLatestFrom：只在你「触发」时，带上另一源的最近值\ntrigger$.pipe(withLatestFrom(data$)).subscribe(([t, d]) => console.log(t, d))',
        '一句话：merge「不等待」、zip「按对等步」、combineLatest「要都发过、谁变都触发」、withLatestFrom「我触发、你补最近值」。',
      ),
      list('选择口诀', [
        '多源并发、互不等待、来就处理 → merge。',
        '两个源按步对齐、第 n 配第 n → zip。',
        '要「两个都有最新值」且任一变化就刷新 → combineLatest。',
        '只在我这个触发点，把另一个源的「当前值」捎上 → withLatestFrom。',
      ]),
      call(
        'warn',
        'combineLatest 要等所有源都发过值',
        '若某个源永远不发（或很晚发），combineLatest 就一直不发组合值。务必确认每个源都有初始值（配合 startWith）。',
      ),
    ],
    'rxCombine',
    [
      q(
        '「两个源都要有最新值，且任一变化就发一次组合」最合适？',
        ['merge', 'zip', 'combineLatest', 'withLatestFrom'],
        2,
        'combineLatest 在「每个源至少发过一次」后，任一变化就发出当前所有源的最新值组合。',
        'c-combine',
      ),
      q(
        '「只在用户点击时，把当前选中的数据值捎上」最合适？',
        ['merge', 'withLatestFrom(data$)', 'zip', 'reduce'],
        1,
        'withLatestFrom 在触发源发值时，带上另一源「最近一次」的值，正是「点击时取当前状态」语义。',
        'c-combine',
      ),
      q(
        '用 combineLatest 组合两个源时，「其中一个源还没发过第一个值」会发生什么？',
        [
          '已发出的源会先发',
          '整体不会发射任何值，直到所有源都至少发过一次',
          '跳过该源直接发其它值',
          '立即报错',
        ],
        1,
        'combineLatest 要求每个参与源都「有最新值」才发组合，某源尚未发值时整体静默。这是「组合需各源有初始值」的边界，常需配 startWith 补初始态。',
        'c-combine',
      ),
    ],
    [
      ['combineLatest', '所有源都有最新值后，任一变化即发组合'],
      ['withLatestFrom', '触发时带上另一源的最近值'],
    ],
    [
      '用 zip 期待「任一变化都触发」（那是 combineLatest；zip 是按步对齐）。',
      'combineLatest 中某源无初始值，导致组合流一直沉默（应配合 startWith）。',
    ],
  ),

  L(
    'L25',
    5,
    '背压与落地：buffer 整形与框架接入',
    28,
    3,
    ['L23', 'L24'],
    ['c-backpressure'],
    ['能处理快源慢消费者的背压', '在真实框架里落地 takeUntil / switchMap / shareReplay'],
    [
      prose(
        '背压：当源比消费者快',
        '快源（高频事件、WebSocket 推送）配慢消费者（渲染、写库）时，值会堆积。RxJS 用「缓冲 / 丢弃 / 采样」三种策略整形：buffer/bufferTime 攒批处理，throttle/sample 丢弃或采样，audit 窗口取最后。',
      ),
      code(
        '背压三策 + 虚拟时间测试',
        'import { interval } from "rxjs"\nimport { bufferTime, throttleTime, pairwise } from "rxjs/operators"\n\n// 快源慢消费：攒 200ms 一批\nfast$.pipe(bufferTime(200)).subscribe((batch) => send(batch)) // 批量提交\n\n// 虚拟时间测试（不需要真实等待）\nimport { TestScheduler } from "rxjs/testing"\nconst ts = new TestScheduler()\nts.expectObservable(src$).toBe("a-b-|", { a: 1, b: 2 }) // 用 Marble 描述期望',
        'TestScheduler 让「debounceTime/switchMap」等时间逻辑可被断言，无需真实计时。',
      ),
      list('框架落地（以 Angular 为例）', [
        '把 HTTP 请求包成 Observable，配合 takeUntil 在组件销毁时自动取消。',
        '事件（搜索、点击）→ switchMap 请求 → AsyncPipe 渲染（自动订阅/取消）。',
        '跨组件共享状态用 shareReplay 或 BehaviorSubject。',
      ]),
      call(
        'deep',
        '与 Effect 的对照',
        'RxJS 的背压靠「缓冲/丢弃/采样」显式整形；Effect 的 Stream 是 pull-based 天然背压。两者都承认「快源慢消费必须整形」，只是模型不同：RxJS 推（push）为主，Effect 拉（pull）为主。',
      ),
    ],
    'rxCombine',
    [
      q(
        '「快源慢消费，想攒一批再处理」最合适？',
        ['bufferTime(ms)', 'take(1)', 'debounceTime', 'throwIfEmpty'],
        0,
        'bufferTime 把一段时间内的值攒成数组一次发出，是「批处理」的背压整形手段。',
        'c-backpressure',
      ),
      q(
        '想给「debounceTime 之后何时发值」写测试而不用真实计时，用什么？',
        ['TestScheduler（虚拟时间）', 'console.log', 'setTimeout', '真实等待'],
        0,
        'TestScheduler 用 Marble 图描述「值在何时发」，可精确断言时间类操作符而无需真实计时。',
        'c-backpressure',
      ),
      q(
        '快源慢消费，想「丢弃中间值、只保留最新值」做背压整形应选？',
        ['bufferTime(ms)', 'sampleTime(ms) / throttleTime(ms)', 'toArray()', 'concatAll()'],
        1,
        'sampleTime 定时采样最近值、throttleTime 限频丢弃中间值；bufferTime 是攒批保留全部，toArray 要等 complete。',
        'c-backpressure',
      ),
    ],
    [
      ['背压', '快源慢消费下的值堆积与整形'],
      ['TestScheduler', '用虚拟时间/Marble 测试时间逻辑'],
    ],
    [
      '高并发事件直接喂给慢消费者，不缓冲也不采样，导致堆积或卡顿。',
      '组件卸载不取消订阅/取最新，旧请求回来盖掉新状态（应使用 takeUntil/switchMap）。',
    ],
  ),
  /* ---- Stage 5 追加：marble 测试（可测试性加密） ---- */
  L(
    'L26',
    5,
    'marble 测试与 TestScheduler 深入',
    30,
    3,
    ['L23'],
    ['c-testing'],
    ['给时间算子写可断言的 marble 测试', '理解帧-毫秒映射与冷/热 marble'],
    [
      prose(
        'marble 图语言',
        'marble 测试用字符串描述「哪个值在哪个帧发射」：字符按帧（每帧默认 20ms）排布，小写为普通值、(x|) 表示同帧多事件、# 表示 error、- 表示该帧无值。TestScheduler 把调度器换成虚拟时间，让时间算子可精确断言。',
      ),
      code(
        '给 debounceTime 写 marble 断言',
        'import { TestScheduler } from "rxjs/testing"\nimport { debounceTime } from "rxjs"\n\nconst ts = new TestScheduler((a, b) => Math.abs(a - b) < 0.5)\nts.run(({ cold, expectObservable }) => {\n  const src = cold("-a-b-c-")      // 帧1发a、帧2发b、帧3发c\n  const out = src.pipe(debounceTime(40)) // 40ms = 2 帧\n  expectObservable(out).toBe("-----x", { x: "c" })  // 静默 2 帧后才发最后一个\n})',
        'TestScheduler（rxjs/testing）把真实计时换成虚拟帧，debounceTime/switchMap/timer 的时间逻辑首次变得可断言、不 flaky。',
      ),
      call(
        'deep',
        '虚拟时间是可测试性的根基',
        '把 Scheduler 抽离为可注入依赖后，测试注入 TestScheduler 即可冻结时间；这与「把时间注入系统」（L22）是一体两面——先会注入时间，才会断言时间。',
      ),
    ],
    'rxScheduler',
    [
      q(
        'marble 字符串 "-a-b-|" 表示？',
        ['帧1发a、帧3发b、帧5 complete', '帧0发a、帧1发b', '只发 a、b 两个值', '以错误结束'],
        0,
        '每个字符一帧（0 起）：- 无值、字母为该帧值、| 为 complete；位置 1=a、3=b、5=complete。',
        'c-testing',
      ),
      q(
        '默认帧=20ms 时 debounceTime(40) 等于多少帧的静默？',
        ['1 帧', '2 帧', '4 帧', '无法测试'],
        1,
        '40ms ÷ 20ms = 2 帧；虚拟时间把毫秒换算成帧，让时间算子可被精确断言。',
        'c-testing',
      ),
      q(
        'marble 字符串里的 # 表示？',
        ['该帧无值', '该帧发射 error', 'complete', '同帧两个值'],
        1,
        '# 表示该帧发 error 并终结；| 是 complete、- 是空帧、(x|) 表示同帧多个事件。',
        'c-testing',
      ),
    ],
    [
      ['marble 图', '用字符序列描述「值在何时（帧）发射」的测试语法'],
      ['TestScheduler', '虚拟时间调度器，使时间算子可测试'],
    ],
    [
      '用真实 setTimeout 测时间算子，测试又慢又 flaky（应使用 TestScheduler 虚拟时间）。',
      '混淆 frame 与 ms：忘按「帧=20ms」换算 debounce/interval 的时长。',
    ],
  ),
]

/* ---------------- 版本与资源 ---------------- */
const META: CourseMeta = {
  version: 'rxjs@7.8.2',
  verifiedAt: '2026-11-13',
  lts: '7.x 为长期维护主线；9.0.0-beta.1 已在 next 通道，未用于正文',
  docs: 'https://rxjs.dev/guide/overview',
  release: 'https://github.com/ReactiveX/rxjs/releases/tag/7.8.2',
  playground: 'https://stackblitz.com/edit/rxjs-quickstart',
  source: 'https://github.com/ReactiveX/rxjs',
  notes: [
    '单包 rxjs；约定：创建函数与单值操作符从 rxjs 导入，单一参数操作符从 rxjs/operators 导入。',
    '7.x 中 flatMap 是 mergeMap 的别名；exhaustMap / exhaustMapTo 已回归 7.x。',
    'Subject 家族：Subject（无状态）/ BehaviorSubject（需初始值，发最近）/ ReplaySubject（缓存 N 个）/ AsyncSubject（complete 时发最后）。',
    'Scheduler 注入时间：asyncScheduler（宏任务）/ queueScheduler（微任务）/ animationFrameScheduler（渲染帧）/ asapScheduler。',
    '9.0.0-beta 破坏性变更（仅记于此与 DESIGN，正文不混用）：统一从 rxjs 导入操作符、废弃 rxjs/operators、Subscription 由接口改为类。',
  ],
}

/* ---------------- 课程设计说明书（绑定到课程的数据，非独立 Markdown） ---------------- */

const DESIGN: CourseDesign = {
  title: 'RxJS 7.8.x 深度课 · 教学设计说明书',
  summary:
    '面向「有 JS/Promise 经验、想真正理解响应式数据流为什么这样设计」的学习者。6 阶段 26 课、28 概念、69 题、13 个交互演练，含知识点依赖图与学情模型公式。版本基线核实日期：2026-11-13。',
  sections: [
    {
      id: 'baseline',
      title: '0. 版本基线（先钉死，再设计）',
      blocks: [
        {
          type: 'kv',
          rows: [
            { k: '课程主线', v: 'rxjs@7.8.2（npm registry latest dist-tag）' },
            { k: '其他 dist-tags', v: 'next: 9.0.0-beta.1（beta）、forward-compat: 5.6.0-forward-compat.5' },
            { k: '官方文档', v: 'rxjs.dev/guide/overview（入门 + API）' },
            { k: '包形态', v: '单包 rxjs；创建/单值从 rxjs 导入，单一参数操作符从 rxjs/operators 导入' },
            { k: '稳定性', v: '7.x 长期维护；9.0.0-beta 不用于正文' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: '纯 7.8 主线',
          text: '全部代码与原理按 7.8.x 讲。9.0.0-beta 的破坏性变更（统一从 rxjs 导入、废弃 rxjs/operators、Subscription 改类）只记于此处，正文与代码一律使用 7.x 的 import 约定，不混用。',
        },
        {
          type: 'list',
          title: '已核对的 7.x 事实（避免按旧资料教错）',
          items: [
            'flatMap 在 7.x 是 mergeMap 的别名（不再是 6.x 里被移出的名字）。',
            'exhaustMap / exhaustMapTo 在 7.x 已回归并可用。',
            'Subject / BehaviorSubject / ReplaySubject / AsyncSubject 四种语义差异（无状态 / 最近值 / 最近 N / 完成时最后值）。',
            'share 支持 { refCount }；shareReplay 带 { bufferSize }；BehaviorSubject 需初始值。',
            'Scheduler：queueScheduler（微任务）、asyncScheduler（宏任务）、animationFrameScheduler、asapScheduler。',
            'TestScheduler（rxjs/testing）用 Marble 图做虚拟时间断言。',
          ],
        },
      ],
    },
    {
      id: 'goals',
      title: '1. 教学目标与受众',
      blocks: [
        {
          type: 'prose',
          text: '受众：有 TypeScript / Promise / 前端或 Node 经验，但没有系统学过响应式流（Reactive Streams / Rx 时间模型）的工程师。不要求函数式编程背景。',
        },
        {
          type: 'prose',
          text: '总目标：能独立讲清「一条冷流如何被创建、组合、扁平化、多播、调度，并在错误/取消时安全收尾」的完整链路，并能在真实项目（含 Angular）里落地与测试。',
        },
        {
          type: 'table',
          columns: ['层', '问题', '覆盖课时'],
          rows: [
            ['L1 架构设计', '为什么把「时间里的数据」建模成流？冷/热、多播的边界？', 'S0 / S4'],
            ['L2 运行原理', '扁平化按什么时序合并？错误/取消如何传播与回收？', 'S2 / S3'],
            ['L3 底层逻辑', '调度器如何把时间注入？背压如何整形？如何用虚拟时间测试？', 'S5（L22–L26）'],
          ],
        },
      ],
    },
    {
      id: 'path',
      title: '2. 平缓学习路径（6 阶段 26 课，密度随复杂度动态调整）',
      intro: '下表由课程数据动态生成，新增课时会自动出现。',
      blocks: [
        {
          type: 'prose',
          text: '设计原则：先把「能跑起来」的心智模型建立好（冷/热、三态、订阅回收），再引入组合与扁平化；把「取消旧内层」这类反直觉语义放在第 2 阶段用 4 个交互演练拆解；错误、多播、调度依次展开，最后落地测试与框架。难度按 1→4 递进，第 2、5 阶段是陡坡。',
        },
        { type: 'lessons' },
        {
          type: 'prose',
          text: '合计约 12 小时净学习时长，建议按 25–30 分钟/天推进，约 4–5 周完成，之后进入长期复习。',
        },
      ],
    },
    {
      id: 'graph',
      title: '3. 知识点依赖图',
      blocks: [
        {
          type: 'prose',
          text: '28 个概念节点，每个带 stage / weight / prereqs。引擎据此做前置缺口归因。主干依赖（箭头表示依赖方向）：',
        },
        {
          type: 'code',
          title: '概念依赖主干',
          code: `c-callbacks → c-cold-hot → c-triplet → c-teardown
                              │              │
                              │              └→ c-subject → c-state-subj
                              │                    c-subject → c-share → c-share-pitfall
                              │
c-sources → c-new-observable → c-transform → c-filter → c-reduce
                                        │
                                        └→ c-flatten → c-concat
                                                  └→ c-merge → c-switch → c-exhaust
                                                  └→ c-backpressure
c-triplet → c-terminal → c-retry → c-error-prop / c-safe
c-sources → c-scheduler → c-time-ops
c-transform → c-combine`,
        },
        {
          type: 'list',
          items: [
            'c-flatten、c-merge 权重 4（最高），是「底层逻辑」的考核重点。',
            '前置未达 70 分的概念会在诊断里被标为「前置缺口」。',
          ],
        },
      ],
    },
    {
      id: 'lesson-template',
      title: '4. 单课时结构（固定模板，降低认知负荷）',
      blocks: [
        {
          type: 'list',
          title: '每课六块',
          items: [
            '目标（2 条可验证的行为目标）',
            '知识块：prose 讲解 / code 示例（带语法高亮与一句提示）/ callout（tip 提示、warn 易错、deep 底层）/ list 对照表，每课 3–4 块',
            '交互演练：13 个可复用组件之一，必须动手操作才计入学情',
            '关键术语 + 常见误区（每课 1–2 条，直接写学习者最常犯的错）',
            '随堂测验：每题即时反馈 + 解析 + 概念标签，可重做',
            '完成按钮：写入进度并解锁路径下一课的推荐',
          ],
        },
        {
          type: 'list',
          title: '交互组件清单（13 个，零依赖 SVG/DOM，离线可用）',
          items: [
            '源操作符节奏、冷/热对比、订阅回收、观察者协议、map 流水线、过滤取舍、嵌套展开、四操作符时序对比（核心）、重试退避、Subject 多播、share 引用计数、调度器时间注入、多源组合',
          ],
        },
      ],
    },
    {
      id: 'analytics',
      title: '5. 学情分析模型',
      blocks: [
        {
          type: 'prose',
          text: '数据采集：课时访问次数、停留时长（进入/离开计时）；每次答题记录 ts / lessonId / qIndex / correct / concept / isReview；演练完成标记、课时完成时间、每日会话汇总；全部存 localStorage（键 knowisle:rxjs:v1），可导出 JSON。',
        },
        {
          type: 'code',
          title: '概念级掌握度（0–100，四项加权）',
          code: `mastery = 100 × (0.30·recent + 0.20·accuracy + 0.25·retention + 0.25·exposure)
recent    = 最近 5 次作答按 exp(-Δt / 14天) 加权的正确率
accuracy  = (correct + 1) / (total + 2)              // 拉普拉斯平滑，避免 1 题满分
retention = exp(-Δt / S)                             // 艾宾浩斯式遗忘
exposure  = min(1, total / 4)                        // 样本不足不轻易判「掌握」`,
        },
        {
          type: 'code',
          title: '记忆稳定度 S（天）随复习演化',
          code: `答对：S ← min(90, S × (1 + 0.8·(1 − R)) + 0.6)
答错：S ← max(0.5, S × 0.55)`,
        },
        {
          type: 'table',
          columns: ['条件', '归因', '建议动作'],
          rows: [
            ['前置概念 mastery < 70', '前置缺口', '回到前置课时重做测验'],
            ['retention < 0.6 且 accuracy ≥ 0.65', '遗忘型', '加入今日复习队列'],
            ['accuracy < 0.6', '误解型', '重读「常见误区」+ 重跑交互演练'],
            ['其余', '练习不足', '补 2–3 道同概念题'],
          ],
        },
        {
          type: 'list',
          title: '视图',
          items: [
            '课程地图：阶段卡片（掌握度 / 完成数）+ 全部课时 + 下一步建议',
            '学情仪表盘：4 个 KPI、六维能力雷达、阶段与概念掌握度条、14 天时长柱状、薄弱点归因',
            '复习中心：遗忘队列 + 抽题复习 + 错题本',
            '教学准备：版本基线、扩课机制、课时级质量表',
            '教学设计：本说明书，作为绑定到课程的数据渲染（见各章节）',
          ],
        },
      ],
    },
    {
      id: 'prep',
      title: '6. 长期教学准备',
      blocks: [
        {
          type: 'list',
          items: [
            '内容层独立：所有课时、概念、题目集中在 app/data/rxjs-course.ts。新增课时只需追加一项并在 CONCEPTS 登记，地图、侧栏、雷达、复习队列、诊断全部自动接入。',
            '引擎与视图解耦：analytics.ts（模型）、widgets.ts（演练）、pages + components（Vue 视图）、main.css（外观）互不依赖具体实现，可单独替换。',
            '版本更新机制：升级到 8.x/9.x 时只需更新 META 的版本号、核实日期与 LTS 说明，并复核受影响的课时代码；9.0 的 import 约定变化在基线区集中记录。',
            '数据可迁移：学情档案为显式 v1 schema，导出/导入 JSON 可跨设备、跨浏览器迁移；未来改 schema 只需补一个 importState 迁移分支。',
            '质量闭环：某课时正确率长期 < 55%（≥3 次作答）自动标记「需修订」；课时表记录访问、停留、重做次数、演练完成率。',
            '教学节奏：建议 25–30 分钟/天；连续天数、每日目标、累计时长都在本地记录，不上传任何数据。',
          ],
        },
      ],
    },
    {
      id: 'running',
      title: '7. 运行与维护',
      blocks: [
        {
          type: 'callout',
          tone: 'tip',
          title: '已迁入知识岛',
          text: '本课程已迁入 Nuxt 4 知识岛站点 yuanwu-knowisle，作为 /courses/rxjs 下的一门课程实体；站点首页 / 是课程岛。',
        },
        {
          type: 'prose',
          text: '运行：pnpm dev（开发）或 pnpm build && pnpm exec wrangler --cwd .output dev --port 3199（生产 Worker 预览）；冒烟用 python scripts/smoke.py --base http://127.0.0.1:3199。',
        },
        {
          type: 'prose',
          text: '内容、引擎、演练、视图四层解耦：app/data/rxjs-course.ts 是唯一内容源，app/data/courses.ts 是课程注册表，app/lib/analytics.ts 是学情引擎，app/lib/widgets.ts 是演练内核，app/components/course/* 与 app/pages/courses/[slug]/* 是 Vue 视图。',
        },
        {
          type: 'prose',
          text: '浏览器需支持 ES2022+（Chrome / Edge / Firefox / Safari 近两年版本）。',
        },
        {
          type: 'prose',
          text: '回归自检：pnpm verify（多课程数据一致性 + 学情引擎全轨迹）、check-course.mjs（引用完整性）、smoke.py（SSR 路由 + 真实视口）。每次改动 rxjs-course.ts、引擎或样式后都跑一遍。',
        },
      ],
    },
    {
      id: 'boundaries',
      title: '8. 已知边界',
      blocks: [
        {
          type: 'list',
          items: [
            '交互演练是原理模拟，不是真实 RxJS runtime；真实运行请用官方 Playground 或本地装 rxjs@7.8.2。',
            '课程内容基于 2026-11-13 核实的 7.8.2 文档；9.0.0-beta 可能继续变动，涉及处已在基线区标注。',
            '学情数据存在浏览器本地，清理浏览器数据会丢失，建议定期在「设置」导出备份。',
          ],
        },
      ],
    },
  ],
}

export const RXJS_COURSE: CourseData = { STAGES, CONCEPTS, LESSONS, META, DESIGN }
