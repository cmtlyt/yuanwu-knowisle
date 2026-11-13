import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L01 = L(
  'L01',
  0,
  '动机与起步：TypeScript 的缺口与第一次运行',
  35,
  1,
  [],
  ['program-value', 'runners'],
  [
    '说清 Promise / try-catch 在生产代码里的结构性缺陷',
    '理解 Effect 要解决的是「程序」的类型化，而不是数据',
    '搭好可运行的最小工程，把第一个 Effect 跑起来',
    '分清 runSync / runPromise / runFork / run*With',
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
    code(
      '最小工程与第一次运行（effect 4.1.4，单包零运行时依赖）',
      'npm install effect@4.1.4\n\n// tsconfig.json 关键项：{ "strict": true, "module": "NodeNext", "target": "ES2022" }\n\nimport { Effect } from "effect"\n\nconst program = Effect.gen(function* () {\n  const name = yield* Effect.succeed("world")\n  yield* Effect.log("Hello, " + name + "!")\n})\n\nawait Effect.runPromise(program)',
      'v4 的 effect 是单包：HTTP、Schema、RPC、SQL 等都从 effect/* 子路径导入。惰性蓝图只有交给 run* 才被 runtime 解释执行。',
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
    q(
      '一段含 Effect.promise 的程序用 runSync 执行会怎样？',
      ['正常返回 Promise', '遇到异步边界时抛错 / 无法同步完成', '自动降级为 runPromise', '返回 Exit'],
      1,
      'runSync 只适用于纯同步蓝图；异步边界必须交给 runPromise / runFork。',
      'runners',
    ),
    q(
      '已经手动构造了 Context<R>，最直接的运行方式是？',
      ['Effect.provide 后 runPromise', 'Effect.runPromiseWith(context)', 'Effect.forkChild', 'Effect.scoped'],
      1,
      'v4 提供 run*With 系列，直接带 Context 运行，无需先包一层 provide。',
      'runners',
    ),
  ],
  [
    ['副作用 (effect)', '与外部世界交互的行为，被建模成值而不是立即执行'],
    ['programs as values', '把程序本身当作可传递、可组合、可检查的不可变数据'],
    ['运行边界', '把惰性蓝图交给 runtime 解释执行的唯一位置'],
    ['default services', '不开任何配置就存在的日志／调度／追踪等默认服务'],
  ],
  [
    '把 Effect.succeed(x) 当成 Promise.resolve(x)：前者只是描述，后者已开始执行。',
    '以为引入 Effect 要重写整个项目——实际可以从最复杂的一小块开始渐进替换。',
    '在工具函数内部随手 runPromise，导致上层无法重试或统一超时。',
  ],
)
