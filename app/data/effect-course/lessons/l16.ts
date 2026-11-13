import { L, prose, code, call, q } from '../../course-builders.ts'

export const L16 = L(
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
)
