import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L18 = L(
  'L18',
  4,
  'Fiber：虚拟线程与运行中的 Effect',
  35,
  3,
  ['L07'],
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
)
