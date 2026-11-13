/*
 * Effect 4.1.4 深度课 —— 内容数据层（知识岛的一门课）
 * 说明：本文件是这门课唯一的内容源。新增课时只需往 LESSONS 追加一项并登记概念，
 *      不需要改动 lib/analytics.ts、lib/widgets.ts 或任何页面组件。
 */
import type {
  Stage,
  Concept,
  Lesson,
  LessonBlock,
  QuizQuestion,
  CourseMeta,
  EffectCourseData,
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
    summary: '先换脑子，再写代码。理解「程序即值」与三通道类型。',
    color: '#5b8def',
    goal: '能解释为什么 Effect 不是 Promise 包装器',
  },
  {
    id: 1,
    name: '核心值与组合',
    en: 'Core & Composition',
    summary: '构造子、组合子、类型累积、运行边界。',
    color: '#3fb984',
    goal: '能独立写出并运行一段完整的 Effect 流水线',
  },
  {
    id: 2,
    name: '错误与诊断',
    en: 'Errors & Cause',
    summary: '预期错误 / 缺陷 / 中断，Cause 与恢复策略。',
    color: '#e8a33d',
    goal: '能为领域错误设计类型化恢复路径',
  },
  {
    id: 3,
    name: '依赖与资源',
    en: 'Services & Resources',
    summary: 'Context.Service、Layer 依赖图、Scope 与 finalizer。',
    color: '#a878e6',
    goal: '能把一个应用拆成可替换的服务层',
  },
  {
    id: 4,
    name: '并发与运行时底层',
    en: 'Runtime Internals',
    summary: 'Fiber、runLoop 指令解释、Scheduler、结构化中断。课程核心。',
    color: '#e46a70',
    goal: '能讲清一个 Effect 从蓝图到 Exit 的完整执行链',
  },
  {
    id: 5,
    name: '流、调度与工程化',
    en: 'Streams & Production',
    summary: 'Stream 背压、Schedule 重试、并发原语、生态与落地。',
    color: '#38a9c4',
    goal: '能把 Effect 渐进引入真实项目',
  },
]

/* ---------------- 知识点图谱 ---------------- */
const CONCEPTS: Concept[] = [
  { id: 'program-value', name: '程序即值', stage: 0, weight: 3, prereqs: [] },
  { id: 'three-channels', name: '三通道类型', stage: 0, weight: 3, prereqs: ['program-value'] },
  { id: 'laziness', name: '惰性与不可变', stage: 0, weight: 2, prereqs: ['program-value'] },
  { id: 'runners', name: '运行边界 run*', stage: 0, weight: 2, prereqs: ['laziness'] },
  { id: 'composition', name: 'pipe 与组合子', stage: 1, weight: 3, prereqs: ['three-channels'] },
  { id: 'gen', name: 'Effect.gen 与 yield*', stage: 1, weight: 3, prereqs: ['composition'] },
  { id: 'constructors', name: '构造子全景', stage: 1, weight: 2, prereqs: ['three-channels'] },
  { id: 'type-accumulation', name: 'E / R 通道累积', stage: 1, weight: 3, prereqs: ['gen'] },
  { id: 'exit', name: 'Exit 与 Result', stage: 1, weight: 2, prereqs: ['runners'] },
  { id: 'typed-error', name: '预期错误', stage: 2, weight: 3, prereqs: ['type-accumulation'] },
  { id: 'defect', name: '缺陷 defect', stage: 2, weight: 3, prereqs: ['typed-error'] },
  { id: 'cause', name: 'Cause.reasons', stage: 2, weight: 3, prereqs: ['typed-error', 'defect'] },
  { id: 'recovery', name: '恢复策略', stage: 2, weight: 3, prereqs: ['cause'] },
  { id: 'observability', name: '日志与追踪', stage: 2, weight: 2, prereqs: ['cause'] },
  { id: 'context', name: 'Context.Service', stage: 3, weight: 3, prereqs: ['type-accumulation'] },
  { id: 'layer', name: 'Layer 构造配方', stage: 3, weight: 3, prereqs: ['context'] },
  { id: 'layer-graph', name: '依赖图与记忆化', stage: 3, weight: 3, prereqs: ['layer'] },
  { id: 'scope', name: 'Scope 与 finalizer', stage: 3, weight: 3, prereqs: ['layer'] },
  { id: 'fiber', name: 'Fiber 生命周期', stage: 4, weight: 3, prereqs: ['runners'] },
  { id: 'runloop', name: '指令解释与 runLoop', stage: 4, weight: 4, prereqs: ['laziness', 'fiber'] },
  { id: 'scheduler', name: '调度与协作让出', stage: 4, weight: 4, prereqs: ['runloop'] },
  { id: 'concurrency', name: '结构化并发与中断', stage: 4, weight: 4, prereqs: ['fiber', 'scope'] },
  { id: 'stream', name: 'Stream 与背压', stage: 5, weight: 3, prereqs: ['concurrency'] },
  { id: 'schedule', name: 'Schedule 与重试', stage: 5, weight: 2, prereqs: ['recovery'] },
  { id: 'stm', name: '并发原语与 STM', stage: 5, weight: 2, prereqs: ['concurrency'] },
  { id: 'ecosystem', name: '生态与工程落地', stage: 5, weight: 2, prereqs: ['layer-graph', 'context'] },
]

/* ---------------- 课时 ---------------- */
const LESSONS: Lesson[] = [
  /* ========== Stage 0 ========== */
  L(
    'L01',
    0,
    '为什么需要 Effect：TypeScript 的四个缺口',
    20,
    1,
    [],
    ['program-value'],
    [
      '说清 Promise / try-catch 在生产代码里的结构性缺陷',
      '理解 Effect 要解决的是「程序」的类型化，而不是数据',
    ],
    [
      prose(
        '数据有类型，程序没有',
        'TypeScript 能精确描述一个 User 对象，但一个函数签名几乎不告诉你：它可能怎么失败、需要哪些外部服务、能不能被安全地重试／超时／取消。于是这些保证只能靠散落的 try/catch、AbortController、手写 retry 循环和口头约定来维持，且彼此无法组合。',
      ),
      list('四个具体缺口', [
        '错误无类型：Promise 的 rejection 是 any，catch (e: unknown) 之后只能靠猜。',
        '依赖靠传参：配置、DB、Logger 层层透传，测试替换实现要改动调用链。',
        '取消不安全：AbortSignal 需要手动串联，资源清理与超时竞态容易泄漏。',
        '并发无结构：Promise.all 一个失败，其余任务仍在后台跑，无法统一回收。',
      ]),
      code(
        '同一段逻辑的两种写法',
        '// Promise：立即执行、错误无类型、取消靠外部约定\nconst getTodo = async (id: number) => {\n  const res = await fetch("/todos/" + id)\n  return res.json() // 可能抛任何东西\n}\n\n// Effect：只描述、不执行；E 与 R 都留在类型里\nimport { Effect } from "effect"\n\nconst getTodo = (id: number) =>\n  Effect.tryPromise({\n    try: () => fetch("/todos/" + id),\n    catch: () => new HttpError("request failed")\n  }).pipe(Effect.andThen((res) => Effect.promise(() => res.json())))\n\n// 类型：Effect<any, HttpError, never> —— 还没运行过一次',
        '注意 Effect.tryPromise 的 catch 把「任意异常」收敛成一个有名字的错误类型。',
      ),
      call(
        'deep',
        '它不是代数效应语言',
        'Effect 没有用户可自定义的 perform / handler，也没有语言级可恢复续体。它只有一个固定的解释器：fiber runtime，解释一组固定的内部指令。这是「工业级 effect 框架」，灵感来自 ZIO / Cats Effect，而不是 Koka / OCaml 5 那类 algebraic effects。',
      ),
    ],
    'blueprint',
    [
      q(
        'Effect 与 Promise 最本质的区别是什么？',
        [
          'Effect 更快',
          'Effect 是惰性的程序描述，Promise 是立即启动的执行',
          'Effect 只能用于 Node.js',
          'Effect 不需要类型',
        ],
        1,
        'Effect 值创建时什么也没发生，只有交给 run* 才由 runtime 解释执行。这正是 retry／timeout／并发能被做成普通算子的前提。',
        'program-value',
      ),
      q(
        '下面哪一项不是 Effect 直接解决的痛点？',
        ['错误类型化', '依赖注入', '资源安全释放', 'CSS 样式作用域'],
        3,
        '前三项分别对应 E 通道、R 通道、Scope 与结构化中断；样式作用域与 effect system 无关。',
        'program-value',
      ),
    ],
    [
      ['副作用 (effect)', '与外部世界交互的行为，被建模成值而不是立即执行'],
      ['programs as values', '把程序本身当作可传递、可组合、可检查的不可变数据'],
    ],
    [
      '把 Effect.succeed(x) 当成 Promise.resolve(x)：前者只是描述，后者已开始执行。',
      '以为引入 Effect 要重写整个项目——实际可以从最复杂的一小块开始渐进替换。',
    ],
  ),

  L(
    'L02',
    0,
    '程序即值：Effect<Success, Error, Requirements>',
    25,
    1,
    ['L01'],
    ['three-channels', 'laziness'],
    ['读三通道类型签名', '解释 E=never / R=never / Success=never 各自的含义'],
    [
      prose(
        '一个类型，三份契约',
        'Effect<Success, Error, Requirements> 是一份不可变的程序蓝图：成功时产出 Success；可能以 Error 中列出的预期错误失败；需要 Requirements 里的服务才能运行。官方文档常简写成 A / E / R。',
      ),
      code(
        '类型签名与提取工具',
        'import { Context, Effect } from "effect"\n\nclass Db extends Context.Service<Db, {}>()("Db") {}\n\ndeclare const program: Effect.Effect<number, Error, Db>\n\ntype A = Effect.Success<typeof program>  // number\ntype E = Effect.Error<typeof program>     // Error\ntype R = Effect.Services<typeof program>  // Db',
        '三个参数都是协变的，组合时会安全地取并集：多个 yield* 的 E 汇成联合类型，R 汇成需求集合。',
      ),
      list('never 的三种语义', [
        'Error = never：不可能失败（没有 never 类型的值可以构造出来）。',
        'Requirements = never：不需要任何服务，Context 为空，可以直接 run*。',
        'Success = never：永不成功返回——要么一直运行，要么最终失败。',
      ]),
      call(
        'tip',
        '概念上像函数，实际上不是',
        '可以把 Effect<A,E,R> 粗略想成 (context: Context<R>) => A | E，但它不是函数：它能描述同步、异步、并发、带资源的计算，并且每个算子都返回新的 Effect 值，原值永不被修改。',
      ),
    ],
    'triple',
    [
      q(
        'Effect<number, never, never> 说明什么？',
        ['可能失败但不需依赖', '一定成功且不需要任何服务', '永不返回', '需要 Db 服务'],
        1,
        'Error=never 表示无预期错误，Requirements=never 表示可以直接交给 run* 执行。',
        'three-channels',
      ),
      q(
        '关于 Effect 值的可变性，正确的是？',
        [
          'runPromise 会修改原值',
          '每个算子返回新的 Effect 值',
          'Effect.gen 会就地累加状态',
          'flatMap 会消费掉原值',
        ],
        1,
        '不可变性让同一份蓝图可以被重试、并发、多次运行而不互相污染。',
        'laziness',
      ),
    ],
    [
      ['协变', '类型参数在组合时可安全地向更宽的类型 widening'],
      ['Context<R>', '以服务键为索引的不可变服务集合'],
    ],
    ['看到 Success=never 以为是 void——void 是「成功但没有有用信息」，never 是「根本不会成功」。'],
  ),

  L(
    'L03',
    0,
    '安装、配置与第一次运行',
    20,
    1,
    ['L02'],
    ['runners'],
    ['搭好可运行的最小工程', '分清 runSync / runPromise / runFork / run*With'],
    [
      code(
        '最小工程（effect 4.1.4，单依赖零运行时依赖）',
        'npm install effect@4.1.4\n\n// tsconfig.json 关键项\n// { "strict": true, "module": "NodeNext", "target": "ES2022" }\n\nimport { Effect } from "effect"\n\nconst program = Effect.gen(function* () {\n  const name = yield* Effect.succeed("world")\n  yield* Effect.log("Hello, " + name + "!")\n})\n\nawait Effect.runPromise(program)',
        'v4 的 effect 是单包：HTTP、Schema、RPC、SQL 等都从 effect/* 子路径导入，不再需要额外的平台核心包。',
      ),
      list('运行边界怎么选', [
        'runSync：纯同步程序；遇到异步边界会抛错，适合脚本与测试。',
        'runPromise / runPromiseExit：常规入口，后者把结果包成 Exit 而不抛。',
        'runFork：立即返回 Fiber handle，用于需要中断或手动 join 的场景。',
        'run*With(context)：手里已有 Context<R> 时直接带上下文运行，跳过 Effect.provide。',
      ]),
      call(
        'warn',
        '让执行只发生一次',
        '把所有 Effect 组合都留在库代码里，只在应用入口（main / 请求处理器）调用一次 run*。到处 run 会丢掉结构化并发、资源作用域与追踪上下文。',
      ),
    ],
    'blueprint',
    [
      q(
        '一段含 Effect.promise 的程序用 runSync 执行会怎样？',
        ['正常返回 Promise', '遇到异步边界时抛错 / 无法同步完成', '自动降级为 runPromise', '返回 Exit'],
        1,
        'runSync 只适用于纯同步蓝图；异步边界必须交给 runPromise / runFork。',
        'runners',
      ),
      q(
        '已经手动构造了 Context<R>，最直接的运行方式是？',
        [
          'Effect.provide 后 runPromise',
          'Effect.runPromiseWith(context)',
          'Effect.forkChild',
          'Effect.scoped',
        ],
        1,
        'v4 提供 run*With 系列，直接带 Context 运行，无需先包一层 provide。',
        'runners',
      ),
    ],
    [
      ['运行边界', '把惰性蓝图交给 runtime 解释执行的唯一位置'],
      ['default services', '不开任何配置就存在的日志／调度／追踪等默认服务'],
    ],
    ['在工具函数内部随手 runPromise，导致上层无法重试或统一超时。'],
  ),

  L(
    'L04',
    0,
    'pipe、Effect.gen 与组合的本质',
    30,
    2,
    ['L03'],
    ['composition', 'gen'],
    ['熟练写出 pipe 链和 gen 两种风格', '理解 yield* 为什么能自动解包 Success'],
    [
      prose(
        '两种写法，同一棵树',
        'pipe 是函数式流水线：每个算子接收一个 Effect、返回一个新 Effect。Effect.gen 用生成器把同样的嵌套结构写成看起来像同步代码的形态。二者产出的都是不可变蓝图，没有任何执行发生。',
      ),
      code(
        '等价的两种表达',
        'import { Effect } from "effect"\n\nconst pipeline = Effect.succeed(1).pipe(\n  Effect.map((n) => n + 1),\n  Effect.tap((n) => Effect.log("value: " + n)),\n  Effect.flatMap((n) => Effect.succeed(n * 10))\n)\n\nconst generator = Effect.gen(function* () {\n  const a = yield* Effect.succeed(1)\n  const b = a + 1\n  yield* Effect.log("value: " + b)\n  return yield* Effect.succeed(b * 10)\n})\n\nawait Effect.runPromise(generator) // => 20',
        '每个 Effect 都实现 Symbol.iterator，yield* 委托给一个单次生成器，由 runtime 在解释时恢复执行。',
      ),
      call(
        'deep',
        'yield* 不是 await',
        'yield* 拿到的是 Success 值；失败会直接短路整个生成器，并把该错误并入外层 Effect 的 E 通道。同时每个被 yield* 的 Effect 的 R 也会并入外层的 Requirements——类型就是这么「长出来」的。',
      ),
    ],
    'blueprint',
    [
      q(
        'Effect.gen 里 yield* 某个失败 Effect 会怎样？',
        ['返回 undefined 继续执行', '短路整个 gen，错误进入 E 通道', '抛 JS 异常', '自动重试三次'],
        1,
        '这是结构化错误传播：错误作为值沿组合树向上传导，不需要 try/catch。',
        'gen',
      ),
      q(
        'pipe 链中每个算子的返回值是？',
        ['void', 'Promise', '一个新的 Effect 值', '原始值被就地修改'],
        2,
        '不可变组合：原 Effect 保持不变，可复用、可重试、可并发。',
        'composition',
      ),
    ],
    [
      ['组合子 (combinator)', '接收 Effect 并返回新 Effect 的算子'],
      ['SingleShotGen', '配合 Symbol.iterator 让 Effect 可被 yield* 的内部迭代器'],
    ],
    [
      '在 Effect.gen 里用普通 await，绕过类型系统与中断机制。',
      '把 yield* 写成 yield（少了星号），拿到的是 Effect 本身而不是结果。',
    ],
  ),

  /* ========== Stage 1 ========== */
  L(
    'L05',
    1,
    '构造子全景：把现实世界装进 Effect',
    25,
    2,
    ['L04'],
    ['constructors', 'typed-error'],
    ['按场景选对构造子', '区分可恢复错误与缺陷的构造方式'],
    [
      code(
        '常用构造子',
        'import { Effect } from "effect"\n\nEffect.succeed(42)                 // 已有值\nEffect.fail(new NotFound())         // 预期错误，进入 E 通道\nEffect.sync(() => Date.now())       // 同步副作用，假定不抛\nEffect.try(() => JSON.parse(s))     // 同步副作用 + 映射异常\nEffect.promise(() => fetch(url))    // 不抛的异步\nEffect.tryPromise({                // 异步 + 显式映射异常\n  try: () => fetch(url),\n  catch: () => new HttpError()\n})\nEffect.die("impossible state")     // 缺陷 defect，不进 E 通道\nEffect.void                        // 成功但无有用值\nEffect.log("hello")                // 结构化日志\nEffect.sleep("200 millis")         // 可中断的等待',
        'try / tryPromise 是把「不受控异常」收敛成「有名字的预期错误」的主要入口。',
      ),
      prose(
        '为什么要有 die',
        '有些失败不是业务分支，而是程序写错了：断言失败、不可能的状态、第三方库的 bug。它们不该被 domain 逻辑 catch 掉，也不该污染 E 类型。Effect.die 把它们放进 Cause 的 Die reason，由应用边界统一报告。',
      ),
      call(
        'tip',
        '选择顺序',
        '先问「调用方需要为这个失败做决策吗？」需要 → Effect.fail / tryPromise 的 catch；不需要、代表 bug → Effect.die 或让异常自然变成 defect。',
      ),
    ],
    'triple',
    [
      q(
        '把一个「缓存未命中」建模成什么最合适？',
        ['Effect.die', 'Effect.fail(new CacheMiss())', 'throw new Error', 'Effect.void'],
        1,
        '调用方需要据此回源查询，属于领域决策，应进入 E 通道。',
        'typed-error',
      ),
      q(
        'Effect.die 产生的失败在哪里？',
        ['E 通道里', 'Cause 的 Die reason，不在 E 里', '被 runtime 忽略', 'Success 值里'],
        1,
        '缺陷不进入类型化错误通道，但被 Cause 完整保留，可在边界处检查或上报。',
        'constructors',
      ),
    ],
    [
      ['defect', '意外的、代表 bug 的失败，不参与类型化恢复'],
      ['预期错误 failure', 'E 通道中列出的、调用方应处理的失败'],
    ],
    ['到处用 tryPromise 把真 bug 也吞成业务错误，导致错误永远被「恢复」掉。'],
  ),

  L(
    'L06',
    1,
    '组合与变换：map / flatMap / all / zip',
    30,
    2,
    ['L05'],
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
        [
          'map 只能用于数字',
          'flatMap 的回调返回 Effect，map 返回普通值',
          'flatMap 会立刻执行',
          '二者完全等价',
        ],
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
  ),

  L(
    'L07',
    1,
    '类型是怎么长出来的：E 与 R 的累积',
    30,
    3,
    ['L06'],
    ['type-accumulation', 'gen'],
    ['能手工推导一段 gen 程序的最终类型', '理解为什么「编译通过即依赖齐全」'],
    [
      prose(
        '编译器替你做依赖记账',
        'Effect.gen 里每 yield* 一个 Effect，它的 Error 会并入外层 E 的联合类型，Requirements 会并入外层 R。反过来，Effect.catch 处理掉某个错误后它会从 E 中消失，Effect.provide 提供某个服务后它会从 R 中消失。',
      ),
      code(
        '一次完整的类型变化',
        'import { Context, Effect } from "effect"\n\nclass Db extends Context.Service<Db, {\n  readonly find: (id: number) => Effect.Effect<string, NotFound>\n}>()("Db") {}\n\n// yield* Db            -> R 增加 Db\n// yield* db.find(id)   -> E 增加 NotFound\nconst program = Effect.gen(function* () {\n  const db = yield* Db\n  return yield* db.find(1)\n})\n// Effect<string, NotFound, Db>\n\nconst handled = program.pipe(\n  Effect.catchTag("NotFound", () => Effect.succeed("fallback")),\n  Effect.provide(DbLive)\n)\n// Effect<string, never, never>  -> 现在可以直接 runPromise',
        '类型层面的「减法」是 Effect 最有生产力的部分：未处理的错误与未提供的依赖都过不了编译。',
      ),
      call(
        'deep',
        '架构编码进类型',
        '一个用例函数只要签名里还留着 R，就说明它还有依赖没被满足。于是「六边形架构」「端口与适配器」不再是目录约定，而是可检查的类型事实：Tag/Service 是端口，Layer 是适配器。',
      ),
    ],
    'triple',
    [
      q(
        'Effect.provide 对类型的影响是？',
        ['给 E 增加错误', '从 R 中移除被满足的服务', '把 Success 变成 void', '让程序立即执行'],
        1,
        'provide 是编译期的依赖消解，不触发运行。',
        'type-accumulation',
      ),
      q(
        'R = never 意味着什么？',
        ['程序会失败', '没有未满足的依赖，可以直接运行', '程序永不结束', '需要更多服务'],
        1,
        'R=never 表示 Context 为空，是 run* 可执行的前提之一。',
        'type-accumulation',
      ),
    ],
    [
      ['联合类型累积', '多个 yield* 的 E 汇成 union，R 汇成服务集合'],
      ['catchTag', '按 _tag 精确恢复某类错误，并把它从 E 中消除'],
    ],
    ['在库代码里提前 provide 掉所有依赖，让上层失去替换实现的能力。'],
  ),

  L(
    'L08',
    1,
    '运行边界与 Exit：把结果变成值',
    25,
    2,
    ['L07'],
    ['exit', 'runners'],
    ['区分抛异常与返回 Exit', '知道何时用 runPromiseExit / Effect.exit'],
    [
      prose(
        'Exit 是最终判决书',
        'runtime 把 Context<R> + Effect<A,E,R> 解释成 Exit<A,E>：Success(A) 或 Failure(Cause<E>)。Exit 把「结果」也变成值，于是可以对失败做分支、记录、聚合，而不依赖异常控制流。',
      ),
      code(
        '四种常见出口',
        'import { Effect, Exit } from "effect"\n\nconst program = Effect.fail("nope")\n\nawait Effect.runPromise(program)          // 抛出（不推荐直接吃）\nconst exit = await Effect.runPromiseExit(program) // Exit.fail("nope")\n\nif (Exit.isFailure(exit)) {\n  console.log(exit.cause.reasons.map((r) => r._tag))\n}\n\n// 在 Effect 内部观察另一个 Effect 的结果\nconst inner = Effect.gen(function* () {\n  const e = yield* Effect.exit(Effect.fail("nope"))\n  return Exit.isFailure(e) ? "recovered" : "ok"\n})',
        'Effect.exit 把失败「捕获」成 Success 通道里的 Exit 值，是写聚合逻辑与测试断言的常用手法。',
      ),
      call(
        'tip',
        'Result 与 Exit',
        'v4 还提供 Effect.result，把结果包成 Result（Success / Failure）。在 race 场景里包一层 Result，可以让「第一个完成但失败」也能成为竞速的胜者。',
      ),
    ],
    'blueprint',
    [
      q(
        'runPromiseExit 相比 runPromise 的关键差异？',
        ['更快', '把失败作为 Exit 值返回而不抛', '只能同步运行', '自动重试'],
        1,
        'Exit 让失败成为可分支、可记录的数据。',
        'exit',
      ),
      q(
        'Effect.exit(inner) 之后，外层程序的 E 通道通常？',
        [
          '一定增加 inner 的错误',
          '不再包含 inner 的错误（已被转成值）',
          '变成 never 且无法恢复',
          '自动变成 defect',
        ],
        1,
        'exit 把失败吸收为 Success 通道的 Exit 值，错误不再向外传播。',
        'exit',
      ),
    ],
    [
      ['Exit<A,E>', 'Success(A) | Failure(Cause<E>) 的运行终态'],
      ['Result', 'v4 中表示成功／失败的轻量结果类型，常用于 race'],
    ],
    ['用 try/catch 包住 runPromise 来处理业务错误——应该改用 Exit 或 catch*。'],
  ),

  /* ========== Stage 2 ========== */
  L(
    'L09',
    2,
    '两类错误：failure 与 defect',
    25,
    2,
    ['L08'],
    ['typed-error', 'defect'],
    ['能判断一个失败该建模成哪种', '知道各自的处理入口'],
    [
      prose(
        '分界线是「要不要做决策」',
        '预期错误（failure / typed error）属于业务领域：无效输入、记录不存在、请求被拒。它们出现在 E 里，调用方用 Effect.catch / catchTag 恢复。缺陷（defect）代表断言失败、不可能状态、第三方 bug，不进 E，运行时仍由 Cause 完整保留。',
      ),
      code(
        '两条处理路径',
        'import { Effect } from "effect"\n\nconst domain = Effect.fail(new NotFound()).pipe(\n  Effect.catchTag("NotFound", () => Effect.succeed(null))\n)\n\n// 缺陷只在边界处检查 / 上报\nconst boundary = risky.pipe(\n  Effect.catchDefect((defect) =>\n    Effect.log("unexpected: " + String(defect))\n  )\n)\n\n// 想看全貌：把整个 Cause 暴露出来\nconst full = Effect.catchCause(risky, (cause) => report(cause))',
        'catch* 系列只处理 E 通道；要看 defect 与 interruption 必须用 catchDefect / catchCause / Effect.exit。',
      ),
      call(
        'warn',
        '不要在领域逻辑里吞掉缺陷',
        '把 defect 统一 catch 成「返回默认值」会掩盖 bug。正确做法是让它在应用边界被记录、告警、转成 500，而不是变成一条正常的业务分支。',
      ),
    ],
    'cause',
    [
      q(
        '「用户余额不足」应建模为？',
        ['Effect.die', 'E 通道中的 typed error', '直接抛异常', 'Success 里的 null'],
        1,
        '调用方需要据此走不同业务流程，属于可恢复的领域错误。',
        'typed-error',
      ),
      q(
        '哪个算子能看到缺陷和中断？',
        ['Effect.catch', 'Effect.catchTag', 'Effect.catchCause', 'Effect.mapError'],
        2,
        'catchCause 接收完整 Cause，包含 Fail / Die / Interrupt 三类 reason。',
        'defect',
      ),
    ],
    [
      ['failure', 'E 通道里的预期错误'],
      ['defect', 'Cause 里的意外错误，不参与类型化恢复'],
    ],
    ['把「不可能发生」的状态用 Effect.fail 建模，逼调用方写永远用不上的恢复分支。'],
  ),

  L(
    'L10',
    2,
    'Cause 的底层结构：扁平 reasons 数组',
    35,
    4,
    ['L09'],
    ['cause'],
    ['读懂 Cause<E> 的数据结构', '会用 guards 与 Cause.combine 分析复合失败'],
    [
      prose(
        '为什么 E 不够',
        '一个程序可能同时因为多个原因结束：两个并发任务都失败、finalizer 也失败、还有 fiber 被中断。若只保留一个 error 就会丢信息。Cause 的设计目标是无损保留所有失败事实。',
      ),
      code(
        'v4 的 Cause 是扁平数组',
        'import { Cause, Effect, Exit } from "effect"\n\n// Cause<E> ≈ { reasons: ReadonlyArray<Reason<E>> }\n// Reason = Fail<E> | Die | Interrupt\n\nconst combined = Cause.combine(\n  Cause.fail("db down"),\n  Cause.die("bug in mapper")\n)\ncombined.reasons.map((r) => r._tag) // ["Fail", "Die"]\n\nconst exit = await Effect.runPromiseExit(\n  Effect.all([Effect.fail("e1"), Effect.fail("e2")], { concurrency: 2 })\n)\nif (Exit.isFailure(exit)) {\n  exit.cause.reasons.filter(Cause.isFailReason).map((r) => r.error)\n  // 并发失败会被一起收集进同一个 reasons 数组\n}',
        'Cause.combine 只是把两个 reasons 数组拼起来；顺序与并发的组合方式不再编码进数据结构。',
      ),
      list('常用 API', [
        'Cause.fail / die / interrupt / empty：构造单 reason 的 Cause（empty 即 reasons 为空）。',
        'Cause.hasFails / hasDies / hasInterrupts / hasInterruptsOnly：Cause 级判定。',
        'Cause.isFailReason / isDieReason / isInterruptReason：单个 reason 的类型收窄。',
        'Cause.combine / fromReasons / annotate：合并、从数组构造、附加注解。',
        'Cause.pretty：把整个 Cause 格式化成可读的多行错误报告。',
      ]),
      call(
        'warn',
        '文档勘误提醒',
        '官方并发章节的部分打印示例里仍出现树形的 Parallel / Sequential 输出。v4 的 Cause 模块文档与数据结构是扁平 reasons 数组，以 Cause 模块为准；分析失败时请遍历 cause.reasons。',
      ),
    ],
    'cause',
    [
      q(
        'v4 中一个 Cause 如何表达「两个并发任务同时失败」？',
        [
          'Parallel 节点套两个子节点',
          'reasons 数组里放两个 Fail reason',
          '只保留最后一个错误',
          '抛出聚合异常',
        ],
        1,
        '扁平结构把并发与顺序失败统一收集到 reasons 数组，用 Cause.combine 合并。',
        'cause',
      ),
      q(
        '判断「这个 Cause 是否含有缺陷」用哪个？',
        ['Cause.isDieReason(cause)', 'Cause.hasDies(cause)', 'cause.reasons.length', 'Exit.isFailure'],
        1,
        'hasDies 是 Cause 级谓词；isDieReason 用来收窄数组中的单个 reason。',
        'cause',
      ),
    ],
    [
      ['Reason', 'Cause 数组中的单个失败事实：Fail / Die / Interrupt'],
      ['无损失败', '不丢弃并行失败、finalizer 失败与中断来源'],
    ],
    [
      '把 Cause 当成单个 Error 对象，只取第一个 reason。',
      '用 cause._tag 去 switch——v4 应遍历 cause.reasons。',
    ],
  ),

  L(
    'L11',
    2,
    '恢复策略与重试边界',
    30,
    3,
    ['L10'],
    ['recovery', 'schedule'],
    ['按场景选择恢复算子', '理解 retry 与 Schedule 是策略描述'],
    [
      list('恢复算子选择表', [
        'catch / catchTag / catchTags：只处理 E 中的某类或全部预期错误。',
        'orElse / Effect.result：提供备用计算，或把结果转成值再分支。',
        'catchDefect：只在边界处理缺陷。',
        'catchCause：拿到完整 Cause，做统一上报或聚合决策。',
        'Effect.exit：把失败吸收成值，用于批量任务里「不因一个失败中断全部」。',
      ]),
      code(
        '重试是策略，不是循环',
        'import { Effect, Schedule } from "effect"\n\nconst resilient = flakyRequest.pipe(\n  Effect.retry(\n    Schedule.exponential("100 millis").pipe(\n      Schedule.jittered,\n      Schedule.compose(Schedule.recurs(4))\n    )\n  ),\n  Effect.timeout("3 seconds")\n)',
        'Schedule 本身是一份可组合的策略描述：初始延迟、退避因子、抖动、最多几次。',
      ),
      call(
        'deep',
        '为什么要 jitter',
        '固定间隔的重试会让大量客户端在同一时刻再次冲击刚恢复的下游——重试风暴。jittered 给间隔加随机扰动，把峰值摊平。Schedule 把这类经验直接做成可组合的算子。',
      ),
    ],
    'retry',
    [
      q(
        '只想恢复 NotFound 这一种错误，用？',
        ['catchCause', 'catchTag("NotFound", ...)', 'catchDefect', 'Effect.exit'],
        1,
        'catchTag 按 _tag 精确恢复，并把它从 E 通道消除。',
        'recovery',
      ),
      q(
        'Effect.retry 接受的是什么？',
        ['一个数字', '一份 Schedule 策略描述', '一个 Promise', '一个 Fiber'],
        1,
        'Schedule 是可组合的策略值，retry 只是在运行时解释它。',
        'schedule',
      ),
    ],
    [
      ['Schedule', '描述重复／延迟／退避策略的不可变值'],
      ['jitter', '给重试间隔加随机扰动以避免同步重试风暴'],
    ],
    [
      '对 defect 做 retry——bug 不会因为重试而消失，只会放大流量。',
      '重试非幂等写操作，需要配合幂等键或去重。',
    ],
  ),

  L(
    'L12',
    2,
    '可观测性：日志、追踪与失败报告',
    25,
    2,
    ['L11'],
    ['observability'],
    ['知道上下文如何在 fiber 内传播', '能配置局部 logger 并格式化 Cause'],
    [
      prose(
        '上下文跟着 fiber 走',
        '日志注解、当前 span、堆栈信息是 fiber 局部状态，由 Context.Reference 一类的引用在 fiber 内传播：子 fiber 继承父 fiber 的配置，退出局部作用域后自动还原。因此并发任务里的日志天然带着正确上下文，不需要手动透传。',
      ),
      code(
        '局部替换 logger 与格式化失败',
        'import { Cause, Effect, Logger } from "effect"\n\nconst simple = Logger.layer([\n  Logger.make(({ message }) => console.log(message))\n])\n\nconst program = Effect.gen(function* () {\n  yield* Effect.log("start")\n  yield* Effect.log("nested").pipe(Effect.provide(simple))\n  yield* Effect.log("back to default")\n})\n\n// 边界处统一输出完整失败报告\nconst report = (cause: Cause.Cause<unknown>) =>\n  Effect.log(Cause.pretty(cause))',
        'Effect.provide 可以只作用于一段嵌套 workflow，离开后配置恢复原状。',
      ),
      call(
        'tip',
        ' preferentially 用 Cause.pretty',
        'Cause.pretty 会把多个 reason、堆栈与中断来源排版成可读报告，比 console.log(error) 更适合生产排障。配合 Cause.annotate 还能给失败附加结构化元数据。',
      ),
    ],
    null,
    [
      q(
        'fiber 局部的日志／追踪配置如何传给子 fiber？',
        ['手动逐层传参', '由运行时沿 fiber 继承，退出局部作用域自动还原', '写全局变量', '无法传播'],
        1,
        '这正是结构化并发带来的可观测性红利。',
        'observability',
      ),
      q(
        '输出完整 Cause 报告用？',
        ['JSON.stringify', 'Cause.pretty', 'Effect.map', 'Fiber.join'],
        1,
        'Cause.pretty 会遍历 reasons 并格式化堆栈与中断信息。',
        'observability',
      ),
    ],
    [
      ['Context.Reference', 'v4 中承载 fiber 局部配置与状态的引用类型'],
      ['span', '一次有起止与父子关系的追踪单元'],
    ],
    ['在并发任务里用模块级变量记录请求 ID，导致日志串线。'],
  ),

  /* ========== Stage 3 ========== */
  L(
    'L13',
    3,
    'Context.Service：类型化的服务键',
    25,
    2,
    ['L07'],
    ['context'],
    ['会定义并消费一个服务', '理解 R 通道与 Context 的关系'],
    [
      prose(
        '服务 = 键 + 形状',
        'Context.Service 把服务标识和实现形状定义成一个类。Context 则是以这些键为索引的不可变服务集合。程序通过 yield* SomeService 或 SomeService.use(...) 声明「我需要它」，编译器把该服务记进 R。',
      ),
      code(
        '定义、使用、提供',
        'import { Context, Effect, Layer } from "effect"\n\nclass Notifications extends Context.Service<\n  Notifications,\n  { readonly notify: (msg: string) => Effect.Effect<void> }\n>()("Notifications") {}\n\nNotifications.key // "Notifications"\n\nconst action = Notifications.use((n) => n.notify("hello"))\n// Effect<void, never, Notifications>\n\nconst runnable = action.pipe(\n  Effect.provide(Layer.succeed(Notifications, {\n    notify: (msg) => Effect.log(msg)\n  }))\n)\n// Effect<void, never, never>',
        '服务形状里的方法返回的仍是 Effect，于是错误与依赖可以继续向外累积。',
      ),
      call(
        'tip',
        '端口与适配器',
        '把 Context.Service 当作端口（接口），把 Layer 当作适配器（实现）。用例代码只依赖端口，测试里换一个 Layer.succeed 就能替换整个外部系统，无需 mock 框架。',
      ),
    ],
    'layer',
    [
      q(
        'yield* SomeService 之后，程序类型发生什么变化？',
        ['E 增加错误', 'R 增加 SomeService', 'Success 变成 void', '立即执行'],
        1,
        '服务需求被记进 Requirements 通道，直到 provide 才被消解。',
        'context',
      ),
      q(
        '替换服务的实现应该改哪里？',
        ['用例函数签名', '提供的 Layer', 'Context.Service 的 key', 'run* 函数'],
        1,
        '端口不变、换适配器，这是 Effect 做 DI 的核心。',
        'context',
      ),
    ],
    [
      ['Context.Service', 'v4 中定义服务键与形状的类'],
      ['Context.make', '手动构造一个 Context<R>'],
    ],
    ['把服务实例塞进模块级单例，绕开 R 通道，测试时无法替换。'],
  ),

  L(
    'L14',
    3,
    'Layer 是构造配方，不是服务本身',
    30,
    3,
    ['L13'],
    ['layer'],
    ['读懂 Layer<ROut, Err, RIn> 三个参数', '区分 succeed / effect / scoped'],
    [
      prose(
        '把依赖放在构造期',
        '如果 Logger 内部直接去读 Config，服务的形状就会被实现细节污染。Layer 把「怎么造这个服务」单独抽出来：它是一份构造配方，声明产出什么、可能构造失败成什么、以及造它需要先有哪些服务。',
      ),
      code(
        '三个参数与三种构造',
        'import { Context, Effect, Layer } from "effect"\n\n// Layer<ROut, Err, RIn>\n//       产出服务  构造错误  构造所需依赖\n\nconst ConfigLive: Layer.Layer<Config> =\n  Layer.succeed(Config, { get: () => Effect.succeed({ dsn: "..." }) })\n\nconst LoggerLive: Layer.Layer<Logger, never, Config> =\n  Layer.effect(Logger, Effect.gen(function* () {\n    const config = yield* Config\n    return { log: (m: string) => Effect.log(m) }\n  }))\n\n// 需要清理的资源用 Layer.scoped / Effect.acquireRelease\nconst DbLive: Layer.Layer<Db, DbError, Config | Logger> =\n  Layer.scoped(Db, Effect.acquireRelease(connect, (conn) => close(conn)))',
        'Layer.scoped 让服务的生命周期与 Scope 绑定，关闭时自动释放。',
      ),
      call(
        'deep',
        'Live / Test 约定',
        '同一个服务通常配两份配方：XxxLive 用于生产、XxxTest 用于测试。类型系统保证两者形状一致，测试代码只改应用根部的那一处装配。',
      ),
    ],
    'layer',
    [
      q(
        'Layer<Logger, never, Config> 中的 Config 表示？',
        ['产出的服务', '构造期需要的依赖', '构造错误类型', '成功值类型'],
        1,
        'RIn 是构造这个 Layer 之前必须先满足的服务集合。',
        'layer',
      ),
      q(
        '服务需要在关闭时释放连接，用哪个构造？',
        ['Layer.succeed', 'Layer.effect', 'Layer.scoped', 'Layer.merge'],
        2,
        'scoped 把构造与 finalizer 绑定到 Scope，退出时保证释放。',
        'layer',
      ),
    ],
    [
      ['Layer<ROut, Err, RIn>', '服务构造蓝图的三段式类型'],
      ['scoped', '带资源生命周期的构造方式'],
    ],
    ['把 Layer 当成「服务容器对象」，在业务代码里直接读它的属性。'],
  ),

  L(
    'L15',
    3,
    '依赖图：merge / provide / provideMerge 与记忆化',
    35,
    4,
    ['L14'],
    ['layer-graph'],
    ['能手工算出组合后的 RIn / ROut 类型', '理解 Layer 记忆化对资源共享的意义'],
    [
      prose(
        '类型就是架构图',
        'merge 是横向并联：产出与需求都取并集。provide 是纵向串联：用外层配方的产出去满足内层配方的输入，最终只暴露最外层的输出。provideMerge 则在串联的同时把被提供的一方也保留在输出里。',
      ),
      code(
        '三种组合的类型演算',
        'import { Layer } from "effect"\n\ndeclare const ConfigLive: Layer.Layer<Config>\ndeclare const LoggerLive: Layer.Layer<Logger, never, Config>\ndeclare const DbLive: Layer.Layer<Db, never, Config | Logger>\n\n// merge: 并联，需求 = Config，产出 = Config | Logger\nconst AppConfig = Layer.merge(ConfigLive, LoggerLive)\n\n// provide: 串联消解，产出只剩 Db，需求归零\nconst MainLive = DbLive.pipe(\n  Layer.provide(AppConfig),\n  Layer.provide(ConfigLive)\n) // Layer<Db, never, never>\n\n// provideMerge: 产出 = Db | Config | Logger\nconst Exposed = DbLive.pipe(Layer.provideMerge(AppConfig))',
        '写对组合方式后，MainLive 的 RIn 变成 never——这就是「依赖已全部装配完成」的编译期证明。',
      ),
      call(
        'deep',
        '记忆化与共享',
        'Layer 的构建结果会被记忆化：同一份配方在依赖图里被多处引用时只构造一次，多个消费者拿到同一个服务实例。v4 中跨 Effect.provide 调用的记忆化更一致，这对连接池、缓存客户端这类「必须单例」的资源尤其关键。',
      ),
    ],
    'layer',
    [
      q(
        'Layer.provide(inner, outer) 的结果产出是？',
        ['inner 与 outer 的并集', 'inner 的产出（outer 的需求被消解）', 'outer 的产出', 'never'],
        1,
        'provide 是纵向消解：outer 的产出喂给 inner，最终只暴露 inner 的 ROut。',
        'layer-graph',
      ),
      q(
        '记忆化最重要的实际价值是？',
        ['让类型更短', '共享同一份有状态资源，避免重复建连接池', '加快编译', '自动重试构造失败'],
        1,
        '同一配方只构建一次，保证连接池／客户端在依赖图中是单例。',
        'layer-graph',
      ),
    ],
    [
      ['merge', '并联组合：输出与输入都取并集'],
      ['provideMerge', '消解依赖同时保留被提供方的输出'],
    ],
    [
      '在循环依赖里反复 provide，导致类型永远消不掉 R。',
      '把带状态的 Layer 在多个入口各构建一次，造成连接池泄漏。',
    ],
  ),

  L(
    'L16',
    3,
    'Scope 与资源安全：finalizer 为什么不会漏',
    35,
    4,
    ['L15'],
    ['scope'],
    ['解释 LIFO 释放顺序', '知道成功 / 失败 / 中断三种退出都会清理'],
    [
      prose(
        'Scope 是资源的生命周期边界',
        'Scope 持有若干 finalizer。关闭 Scope 时按加入的逆序（LIFO）执行它们——和栈展开一致：先关文件，再关连接。Effect.scoped 会创建 Scope、运行 effect、并在结束时关闭它，无论正常成功、失败还是被中断。',
      ),
      code(
        'acquireRelease 与 addFinalizer',
        'import { Effect, Console, Exit } from "effect"\n\nconst conn = Effect.acquireRelease(\n  Effect.tryPromise({ try: () => open(), catch: () => new DbError() }),\n  (c) => Effect.promise(() => c.close())\n) // Effect<Conn, DbError, Scope>\n\nconst program = Effect.gen(function* () {\n  const c = yield* conn\n  yield* Effect.addFinalizer((exit) =>\n    Console.log("closing with " + exit._tag)\n  )\n  return yield* c.query("select 1")\n})\n\nawait Effect.runPromise(Effect.scoped(program))\n// finalizer 逆序执行：后加的先跑',
        'acquire 阶段是不可中断的：避免「拿到一半资源却被取消」造成不一致状态。',
      ),
      call(
        'deep',
        '与结构化并发的接缝',
        'Scope 也是 Fiber 生命周期的锚点：Effect.forkScoped 把子 fiber 绑到局部 scope，Effect.forkIn 绑到指定 scope。父 fiber 结束不一定杀掉它，但 scope 关闭一定会——取消信号因此跨异步边界传播，无需层层传 AbortController。',
      ),
    ],
    'scope',
    [
      q(
        'finalizer 的执行顺序是？',
        ['按加入顺序', '逆序 LIFO', '随机', '只执行最后一个'],
        1,
        '逆序释放保证先关依赖资源、再关被依赖的连接。',
        'scope',
      ),
      q(
        'fiber 被中断时，Scope 里的 finalizer？',
        ['不会执行', '仍会执行', '只有成功时执行', '需要手动 catch'],
        1,
        '成功、失败、中断三种退出路径都会关闭 Scope 并运行 finalizer。',
        'scope',
      ),
    ],
    [
      ['finalizer', '注册在 Scope 上的释放动作'],
      ['acquireRelease', '不可中断获取 + 保证释放的资源构造'],
    ],
    ['在 try/finally 里手写清理，遇到异步中断就失效。', '把资源存成模块级变量，脱离 Scope 生命周期。'],
  ),

  /* ========== Stage 4 ========== */
  L(
    'L17',
    4,
    'Fiber：虚拟线程与运行中的 Effect',
    35,
    3,
    ['L08'],
    ['fiber'],
    ['区分 Effect 与 Fiber', '掌握 join / await / interrupt 的语义差别'],
    [
      prose(
        '一个是蓝图，一个是执行',
        'JavaScript 本身单线程，Fiber 是 runtime 模拟出来的逻辑线程。每次运行 effect 都会创建一个 fiber；即便没有显式并发，也至少有一个 main fiber。并发时每个并发任务各有一个 fiber。Fiber<Success, Error> 没有 R 参数，因为它执行的是依赖已被提供完的 effect。',
      ),
      code(
        'fork / join / await',
        'import { Effect, Fiber, Exit } from "effect"\n\nconst program = Effect.gen(function* () {\n  const fiber = yield* Effect.forkChild(Effect.succeed(55))\n\n  const value = yield* Fiber.join(fiber)   // 取结果\n  const exit  = yield* Fiber.await(fiber)  // 取 Exit 完成详情\n  // exit => Exit.succeed(55)\n  return value\n})',
        'v4 中 Fiber 不再是 Effect：不能直接 yield* fiber，必须 Fiber.join(fiber)。Ref / Deferred 同理，用 Ref.get / Deferred.await。',
      ),
      call(
        'warn',
        'fork 出去不是立刻开跑',
        '官方明确：forked fibers 在当前 fiber 完成或让出后才开始执行，且启动时机不确定。Effect.sleep() / Effect.yieldNow() 可以给它们机会，但不要依赖「单次 yield 一定够」做同步假设。',
      ),
    ],
    'fiber',
    [
      q(
        'Fiber<A, E> 为什么没有 R 参数？',
        ['设计遗漏', '它执行的是依赖已满足的 effect', 'R 被合并进 E', '只有 run* 才有 R'],
        1,
        'requirements 在 fork 之前已被 provide 消解。',
        'fiber',
      ),
      q(
        '想拿到 fiber 的失败／中断详情用？',
        ['Fiber.join', 'Fiber.await（返回 Exit）', 'Effect.map', 'Effect.provide'],
        1,
        'join 给结果，await 给 Exit 完成信息。',
        'fiber',
      ),
    ],
    [
      ['虚拟线程', '由 runtime 在单线程上模拟的逻辑执行单元'],
      ['Fiber handle', '对一次运行中计算的引用，可 join / await / interrupt'],
    ],
    ['把 Fiber 直接 yield*，或把它当成 Promise 去 await。'],
  ),

  L(
    'L18',
    4,
    '★ 指令解释器：Effect 蓝图与 runLoop',
    45,
    5,
    ['L17'],
    ['runloop', 'laziness'],
    ['能复述一个 Effect 从构造到 Exit 的执行链', '理解 continuation 栈与 trampoline 的作用'],
    [
      prose(
        'Effect 是一棵指令树',
        '每个 Effect 值都是一个不可变的指令节点：已有成功值、同步 thunk、异步注册、成功续体、失败续体、finalizer 续体、让出指令等。pipe / Effect.gen 只是在不断往这棵树上加节点，不执行任何一步。runtime 的工作就是解释这棵树。',
      ),
      code(
        'runLoop 的心智模型（伪代码，示意内部结构）',
        '// 简化示意，非真实源码\nfunction runLoop(fiber, effect0) {\n  let cur = effect0\n  while (true) {\n    // 1) 先处理外部消息（中断请求等）\n    if (fiber.queue.length > 0) cur = drainQueue(fiber, cur)\n\n    // 2) 检查是否该协作让出\n    fiber.currentOpCount++\n    if (fiber.scheduler.shouldYield(fiber)) {\n      cur = flatMap(yieldNow(), () => cur)  // 插入让出指令\n      enqueueToScheduler(fiber, cur)\n      return\n    }\n\n    // 3) 解释当前指令；结果推入 / 弹出 continuation 栈\n    cur = interpret(fiber, cur, fiber.contStack)\n  }\n}',
        '真实实现是一个 trampoline 循环：用显式的 continuation 栈代替 JS 调用栈，因此十万层 flatMap 也不会栈溢出。',
      ),
      list('一次执行的完整链路', [
        '构造：Effect.succeed / gen / pipe 生成不可变指令树。',
        '启动：run* 创建 root fiber，带上初始 Context、fiber 局部状态与初始 effect。',
        '解释：runLoop 逐条执行指令，遇 async 就挂起并注册回调，回调来了重新入队。',
        '让出：超过操作预算后插入 yieldNow，把续体交给 Scheduler 排队。',
        '收尾：成功产出 A、失败收集 Cause、中断运行 finalizer，最后得到 Exit<A,E>。',
      ]),
      call(
        'deep',
        '固定指令集 = 只有一个解释器',
        'Effect 没有用户可定义的 handler，指令集是运行时内置且固定的。所有上层能力（retry、timeout、并发、资源、追踪）都是把效果翻译成这些指令的组合子。这也解释了为什么「程序即值」能带来如此强的可组合性：解释器不变，组合方式无限。',
      ),
    ],
    'runloop',
    [
      q(
        'runLoop 为什么用显式 continuation 栈？',
        [
          '为了类型推断',
          '避免深层 flatMap 造成 JS 调用栈溢出（trampoline）',
          '为了并行执行',
          '为了减少内存分配',
        ],
        1,
        '循环 + 显式续体栈把递归解释摊平成迭代，同时让挂起／恢复可控。',
        'runloop',
      ),
      q(
        'Effect.gen 构建程序时发生了几步计算？',
        ['与代码行数相同的步数', '零步，只生成指令树', '一步', '取决于是否有 async'],
        1,
        '惰性是 Effect 的根本：构造与组合永不执行，运行才解释。',
        'laziness',
      ),
    ],
    [
      ['primitive instruction', '运行时内置的最小指令（sync / async / 续体 / finalizer / yield）'],
      ['trampoline', '用循环与显式栈代替递归调用的解释执行方式'],
    ],
    ['以为 async 回调里会「继续执行同一个调用栈」——其实是 fiber 重新入队后恢复。'],
  ),

  L(
    'L19',
    4,
    '★ Scheduler：协作让出与公平性',
    40,
    5,
    ['L18'],
    ['scheduler'],
    ['解释 shouldYield 的触发条件', '知道如何调节操作预算与执行模式'],
    [
      prose(
        '单线程上如何不饿死别人',
        'Fiber 是协作式的，不是抢占式：一个 CPU 密集的 fiber 若不让出，整个事件循环都会被它占住。MixedScheduler 用「操作预算」解决：每个 fiber 记录 currentOpCount，达到 maxOpsBeforeYield 就插入 yieldNow，把续体排进调度队列。',
      ),
      code(
        'Scheduler 接口与默认实现（示意）',
        'interface Scheduler {\n  readonly executionMode: "sync" | "async"\n  makeDispatcher(): SchedulerDispatcher\n  shouldYield(fiber: Fiber): boolean\n}\n\nclass MixedScheduler implements Scheduler {\n  shouldYield(fiber) {\n    return fiber.currentOpCount >= fiber.maxOpsBeforeYield\n  }\n  makeDispatcher() { return new MixedSchedulerDispatcher(setImmediate) }\n}\n\n// 默认值 2048 次操作；两个可调的 Context.Reference：\n// MaxOpsBeforeYield / PreventSchedulerYield',
        'SchedulerDispatcher.scheduleTask(task, priority)：数值小的优先级先跑，同优先级 FIFO；flush() 同步排空队列，测试里可得到确定性执行。',
      ),
      list('调度链路', [
        'fiber 执行若干条指令 → currentOpCount 增长。',
        'shouldYield 命中 → 插入 yieldNow 指令，把续体交给 dispatcher。',
        'dispatcher 按优先级入队，异步模式下经 setImmediate（无 setImmediate 时退回 setTimeout 0）回到宿主事件循环。',
        '下一轮 drain 取出任务，恢复 fiber 的 continuation 栈继续执行。',
      ]),
      call(
        'warn',
        'sync 模式的代价',
        'MixedScheduler("sync") 不向事件循环让出，CPU 密集任务会拖慢同进程其他请求。官方特别提醒 Cloudflare Workers 上 request-owned timer 可能被丢弃，需要整体使用 sync 模式并配合 HttpRouter.toWebHandler 的配方，但它并不修复 Effect.sleep 这类请求绑定的异步上下文。',
      ),
    ],
    'scheduler',
    [
      q(
        '默认操作预算是多少，超了会怎样？',
        ['16 次，抛错', '2048 次，插入 yieldNow 让出', '无限，不让出', '由 GC 决定'],
        1,
        'MaxOpsBeforeYield 默认 2048，shouldYield 命中即协作让出。',
        'scheduler',
      ),
      q(
        '调度队列的优先级规则是？',
        ['数值越大越先', '数值越小越先，同优先级 FIFO', '完全随机', '按 fiber id 排序'],
        1,
        '低数值优先、同级 FIFO，便于确定性测试。',
        'scheduler',
      ),
    ],
    [
      ['协作式调度', 'fiber 在明确的让出点交出执行权，而非被抢占'],
      ['MixedScheduler', '默认调度器，支持 sync / async 模式与优先级队列'],
    ],
    [
      '把 Effect 的并发理解成多线程并行——JS 宿主仍是单线程。',
      '为了「快」把 PreventSchedulerYield 全局打开，结果是长任务饿死 I/O。',
    ],
  ),

  L(
    'L20',
    4,
    '★ 结构化并发与异步中断',
    45,
    5,
    ['L16', 'L17'],
    ['concurrency'],
    ['区分四种 fork 的生命周期绑定', '解释中断如何跨异步边界传播且保证清理'],
    [
      prose(
        '子 fiber 的寿命由谁决定',
        'Effect 采用结构化并发：子 fiber 的生命周期默认绑定父 fiber。四种 fork 策略改变的是「绑定到谁」：forkChild 绑父（自动监督）、forkDetach 绑全局（daemon）、forkScoped 绑局部 scope、forkIn 绑指定 scope。',
      ),
      code(
        '四种 fork 与中断',
        'import { Effect, Fiber, Console } from "effect"\n\nconst child = Effect.repeat(\n  Console.log("tick"),\n  Schedule.fixed("1 second")\n)\n\nconst parent = Effect.gen(function* () {\n  yield* Effect.forkChild(child)   // 父结束 → 子被终止\n  // Effect.forkDetach(child)      // 父结束/被中断，子仍继续\n  // Effect.forkScoped(child)      // 局部 scope 关闭时终止\n  yield* Effect.sleep("3 seconds")\n})\n\n// 中断并等待 finalizer 执行完\nconst stop = Effect.gen(function* () {\n  const f = yield* Effect.forkChild(parent)\n  yield* Effect.sleep("1 second")\n  yield* Fiber.interrupt(f)        // 返回 Effect<void>，等待完全终止\n  // f.interruptUnsafe()           // fire-and-forget，不等 finalizer\n})',
        'Effect.onInterrupt 注册只在中断时触发的清理；Effect.forEach 并发中任一子任务被中断，其余并发任务一起被中断。',
      ),
      call(
        'deep',
        '为什么不用轮询中断',
        '轮询标志位需要程序员记得检查，漏一次就永远不响应，且无法与纯函数式组合兼容。Effect 采用完全异步的信号机制：目标 fiber 不轮询，运行时在安全的指令边界注入中断；临界区通过关闭可中断性来保护。中断请求沿 fiber 树向下传播，Scope 的 finalizer 保证资源收尾。',
      ),
    ],
    'fiber',
    [
      q(
        '父 fiber 被中断时，forkDetach 出来的 fiber？',
        ['一起终止', '继续运行，直到自身完成或全局 scope 关闭', '抛异常', '自动重启'],
        1,
        'detach 无 parent、不被监督，是 daemon 语义。',
        'concurrency',
      ),
      q(
        'Fiber.interrupt 与 interruptUnsafe 的差别？',
        ['前者等待 fiber 完全终止并执行 finalizer', '后者更快且保证清理', '两者完全一样', '前者只能中断自己'],
        0,
        'interrupt 是 back-pressuring 的安全路径；Unsafe 不等待 finalizer 完成。',
        'concurrency',
      ),
    ],
    [
      ['结构化并发', '子任务生命周期绑定父任务，取消与清理可整体传播'],
      ['异步中断', '运行时在安全边界注入取消信号，无需目标轮询'],
    ],
    [
      '用 forkDetach 做「顺手起个后台任务」，结果应用退出时它还挂着。',
      '误以为 race 的失败者会自动停止——需要确认它已被中断并清理。',
    ],
  ),

  /* ========== Stage 5 ========== */
  L(
    'L21',
    5,
    'Stream：零到多个值与背压',
    35,
    3,
    ['L20'],
    ['stream'],
    ['区分 Effect 与 Stream', '理解 pull-based 背压为什么天然成立'],
    [
      prose(
        'Effect 恰好一个值，Stream 零到无数个',
        'Stream<A,E,R> 是 Effect 的延伸：同样的三通道，但能发出 0 个、1 个、有限多个甚至无限多个 A。它可替代 Observable、Node stream、AsyncIterable，且与 Effect 共用同一套错误、依赖、中断与资源语义。',
      ),
      code(
        '基础用法',
        'import { Effect, Stream } from "effect"\n\nconst numbers = Stream.range(1, 10)\nconst doubled = numbers.pipe(Stream.map((n) => n * 2))\n\nawait Effect.runPromise(Stream.runCollect(doubled))\n// [2, 4, 6, ..., 20]\n\nconst infinite = Stream.iterate(1, (n) => n + 1)\nconst firstFive = infinite.pipe(Stream.take(5), Stream.runCollect)',
        'runCollect 是众多 Sink 之一：它决定「如何消费」这条流。',
      ),
      call(
        'deep',
        '背压来自 pull',
        '流不是生产者随便往里推，而是下游按需 pull 一个 chunk。消费者慢，上游就停下来等——背压因此是模型的自然结果，不需要额外的缓冲阈值配置。Chunk 是批量传输单位，减少逐元素调度开销；底层由 Channel 统一描述「读／写／结束」的状态机。',
      ),
    ],
    'stream',
    [
      q(
        'Stream 相对 Effect 的关键差别？',
        ['Stream 没有错误通道', 'Stream 可发出零到多个值', 'Stream 立即执行', 'Stream 不支持依赖'],
        1,
        'Effect 成功时恰好一个值；Stream 是 0..N 个值的时间序列。',
        'stream',
      ),
      q(
        'pull-based 模型如何带来背压？',
        ['靠固定大小缓冲区', '下游按需拉取，上游不会超过消费速度', '靠丢弃数据', '靠提高生产者优先级'],
        1,
        '需求由下游驱动，是结构化而非补救式的流量控制。',
        'stream',
      ),
    ],
    [
      ['Chunk', 'Stream 批量传输的数据块'],
      ['Sink', '流的消费者，如 runCollect / runDrain'],
    ],
    ['把无限流直接 runCollect，等价于让程序永不结束。'],
  ),

  L(
    'L22',
    5,
    'Schedule：把重试策略变成值',
    30,
    3,
    ['L11'],
    ['schedule'],
    ['能组合出指数退避 + 抖动 + 次数上限', '知道 timeout 与重试的边界'],
    [
      prose(
        '策略描述，而非控制流',
        'Schedule 是一个不可变值：描述「第 n 次重试前等多久、最多重试几次、什么条件下继续」。Effect.repeat / Effect.retry 在运行时解释它。因为它是值，所以可以 compose、jittered、并复用到不同任务上。',
      ),
      code(
        '组合一个生产级策略',
        'import { Effect, Schedule } from "effect"\n\nconst policy = Schedule.exponential("100 millis").pipe(\n  Schedule.jittered,\n  Schedule.compose(Schedule.recurs(4))\n)\n\nconst safe = fetchUser.pipe(\n  Effect.retry(policy),\n  Effect.timeout("3 seconds")\n)',
        'Effect.timeout 本质是 race 一个定时器并在超时后中断原 fiber，因此资源清理依然有保证。',
      ),
      call(
        'tip',
        '顺序很重要',
        '先 retry 再 timeout 表示总时长受限；反过来则每次尝试各自限时。写策略时先画出「时间预算」再决定算子顺序。',
      ),
    ],
    'retry',
    [
      q(
        'Schedule.jittered 解决什么问题？',
        ['减少内存', '避免大量客户端同步重试造成风暴', '加快首次请求', '让错误类型变小'],
        1,
        '随机扰动摊平重试峰值，保护刚恢复的下游。',
        'schedule',
      ),
      q(
        'Effect.timeout 的实现基础是？',
        ['轮询时钟', 'race 一个定时器并中断原 fiber', '抛 JS 异常', '关闭 Scope'],
        1,
        '建立在结构化中断之上，所以被中断任务的 finalizer 仍会执行。',
        'schedule',
      ),
    ],
    [
      ['Schedule', '可组合的重复／退避策略值'],
      ['timeout', '基于竞速与中断的时间预算'],
    ],
    ['重试非幂等操作而不做去重，导致重复扣款／重复写入。'],
  ),

  L(
    'L23',
    5,
    '并发原语与 STM',
    30,
    3,
    ['L20'],
    ['stm'],
    ['知道常见并发原语的用途', '理解事务内存解决什么问题'],
    [
      list('常用原语', [
        'Ref：单个可变引用的原子读写（Ref.make / Ref.get / Ref.update）。',
        'Deferred：一次性结果的占位，多方等待、一方完成（Deferred.await）。',
        'Queue / PubSub：有界／无界队列与发布订阅，自带背压与中断语义。',
        'Semaphore / Latch：许可控制与一次性门闩，用于限流与同步。',
        'SubscriptionRef：可读变化流的状态引用，Stream.tap 能观察每次变更。',
      ]),
      code(
        'Ref 的基本用法',
        'import { Effect, Ref } from "effect"\n\nconst counter = Effect.gen(function* () {\n  const ref = yield* Ref.make(0)\n  yield* Effect.all(\n    Array.from({ length: 10 }, () => Ref.update(ref, (n) => n + 1)),\n    { concurrency: "unbounded" }\n  )\n  return yield* Ref.get(ref)\n})',
        'v4 中 Ref 不是 Effect：要用 Ref.get / Ref.update，而不是直接 yield* ref。',
      ),
      call(
        'deep',
        'STM：把多步状态变更变成一个事务',
        '当多个引用必须「要么一起变、要么都不变」时，锁容易写错。v4 引入软件事务内存（Effect.tx 与 TxRef / TxQueue / TxHashMap / TxPubSub / TxSemaphore 等），把一组读写包成原子事务：冲突时由运行时重试，而不是由程序员手写锁与回滚。',
      ),
    ],
    'concurrency',
    [
      q(
        'v4 中想读一个 Ref 的值，正确写法是？',
        ['yield* ref', 'yield* Ref.get(ref)', 'await ref', 'Ref.value(ref)'],
        1,
        'Fiber / Ref / Deferred 不再是 Effect，必须走对应的访问函数。',
        'stm',
      ),
      q(
        'STM 主要解决？',
        ['更快的 JSON 解析', '多个状态引用的原子变更与冲突重试', '类型化错误', '日志格式化'],
        1,
        '事务内存把加锁与回滚交给运行时，避免手写临界区出错。',
        'stm',
      ),
    ],
    [
      ['Ref', 'fiber 安全的单值可变引用'],
      ['STM', '软件事务内存：一组读写作为原子事务执行'],
    ],
    ['用模块级 let 变量在并发 fiber 间共享状态，绕开原子性保证。'],
  ),

  L(
    'L24',
    5,
    '生态、稳定性与渐进落地',
    30,
    2,
    ['L15', 'L21'],
    ['ecosystem'],
    ['知道 v4 的包结构与稳定性标记', '能给出一条渐进引入路线'],
    [
      prose(
        '一个生态，零依赖',
        'v4 把原先分散的平台、RPC、Cluster、CLI、AI、SQL、Workflow 等能力收进 effect 单包，核心包零运行时依赖；平台特定驱动／AI provider／OpenTelemetry 集成仍作为独立 @effect/* 包，但全生态统一版本号、同步发布。',
      ),
      code(
        '导入路径与版本锁步',
        'npm install effect@4.1.4\n# 需要 pg 驱动时：@effect/sql-pg@4.1.4（版本必须对齐）\n\nimport { Effect, Layer, Stream } from "effect"\nimport { Schema } from "effect/schema"\nimport { HttpRouter } from "effect/http"\nimport { Sql } from "effect/sql"',
        '子路径模块带 @stability 标记：stable 严格遵循 semver；unstable 在 minor 可能有破坏性变更；experimental 在 patch 也可能变。选型时先看稳定性标签。',
      ),
      list('渐进落地路线', [
        '第 1 步：只把「错误最乱」的一个函数改成 Effect，边界处 runPromise。',
        '第 2 步：把外部依赖抽成 Context.Service + Live/Test 两层配方。',
        '第 3 步：给 I/O 加 retry / timeout / Scope，享受结构化中断。',
        '第 4 步：在应用根部用 ManagedRuntime.make(MainLive) 统一装配一次。',
      ]),
      call(
        'warn',
        'ManagedRuntime 的一个坑',
        '它在首次使用时构建 Layer 并缓存结果。若首次构建失败，这个失败会被一直保留，后续所有运行都失败且不重建。对可能瞬时失败的构造，应在 Layer 内部用 Effect.retry，而不是指望 runtime 自愈。',
      ),
    ],
    'layer',
    [
      q(
        'v4 生态包的版本规则是？',
        ['各包独立版本', '全生态统一版本、同步发布', '固定 0.x', '跟随 Node 版本'],
        1,
        'effect@4.1.4 对应 @effect/*@4.1.4，避免兼容性矩阵。',
        'ecosystem',
      ),
      q(
        'ManagedRuntime 首次构建失败会？',
        ['自动重试直到成功', '缓存该失败，后续运行都失败', '回退默认 runtime', '静默忽略'],
        1,
        '应在 Layer 内部用 Effect.retry 处理瞬时故障。',
        'ecosystem',
      ),
    ],
    [
      ['@stability', 'v4 模块的稳定性标记：stable / unstable / experimental'],
      ['ManagedRuntime', '从根 Layer 构建一次、可复用并负责释放资源的运行时'],
    ],
    [
      '把 unstable 模块直接用到长期维护的核心路径上而不做隔离。',
      '在 React / Serverless 每个请求里重新构建一次根 Layer。',
    ],
  ),
]

/* ---------------- 版本与资源 ---------------- */
const META: CourseMeta = {
  version: 'effect@4.1.4',
  verifiedAt: '2026-11-13',
  lts: '4.x bug 修复至 2029-09（或 5.0 后 1 年），安全修复至 2029-09（或 5.0 后 2 年）',
  docs: 'https://effect.website/docs/v4/',
  release: 'https://effect.website/blog/releases/effect/40',
  playground: 'https://effect.website/play',
  source: 'https://github.com/Effect-TS/effect',
  notes: [
    '单包零运行时依赖；effect/* 子路径提供 http / schema / sql / rpc / ai / workflow 等模块。',
    'Cause 为扁平 reasons 数组（Fail / Die / Interrupt）。',
    'Scheduler 默认 MixedScheduler，MaxOpsBeforeYield 默认 2048。',
    '服务用 Context.Service 定义，Fiber 用 forkChild / forkDetach / forkScoped / forkIn。',
    '全生态版本锁步；模块带 @stability stable / unstable / experimental 标记。',
  ],
}

export const EFFECT_COURSE: EffectCourseData = { STAGES, CONCEPTS, LESSONS, META }
