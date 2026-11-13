import { L, prose, code, call, q } from '../../course-builders.ts'

export const L21 = L(
  'L21',
  4,
  '★ 结构化并发与异步中断',
  45,
  5,
  ['L16', 'L18'],
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
)
