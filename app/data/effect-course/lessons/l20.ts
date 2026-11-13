import { L, prose, code, call, list, q } from '../../course-builders.ts'

export const L20 = L(
  'L20',
  4,
  '★ Scheduler：协作让出与公平性',
  40,
  5,
  ['L19'],
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
)
