import { L, prose, code, call, q } from '../../course-builders.ts'

export const L07 = L(
  'L07',
  1,
  '运行边界与 Exit：把结果变成值',
  25,
  2,
  ['L06'],
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
    q(
      '为保留结构化并发、资源 Scope 与追踪上下文，run* 应当放在哪里？',
      [
        '每个工具函数内部都 runPromise',
        '应用根部 / 请求处理器这一处',
        '每次调用 Effect.all 的地方',
        '服务构造函数里',
      ],
      1,
      '运行边界只在应用入口出现一次；到处 run 会丢掉结构化并发、Scope 与追踪上下文。',
      'runners',
    ),
  ],
  [
    ['Exit<A,E>', 'Success(A) | Failure(Cause<E>) 的运行终态'],
    ['Result', 'v4 中表示成功／失败的轻量结果类型，常用于 race'],
  ],
  ['用 try/catch 包住 runPromise 来处理业务错误——应该改用 Exit 或 catch*。'],
)
