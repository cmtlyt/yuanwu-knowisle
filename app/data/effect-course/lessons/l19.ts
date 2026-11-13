import { L, prose, code, call, list, q } from '../../course-builders.ts'

export const L19 = L(
  'L19',
  4,
  '★ 指令解释器：Effect 蓝图与 runLoop',
  45,
  5,
  ['L18'],
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
)
