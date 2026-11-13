import { L, prose, code, call, q } from '../../course-builders.ts'

export const L06 = L(
  'L06',
  1,
  '类型是怎么长出来的：E 与 R 的累积',
  30,
  3,
  ['L05'],
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
    q(
      'Effect.gen 里 yield* 多个 Effect 时，类型会怎样？',
      [
        'gen 会自动补全缺失的 R',
        'yield* 每个 Effect 时，其 E/R 并入外层，未被 provide/catch 消解的会留在最终类型里',
        'gen 只能处理 E，不处理 R',
        'gen 会忽略依赖直接运行',
      ],
      1,
      'gen 的类型累积是结构性的：编译通过即代表 E 全部可恢复、R 全部已满足，这正是「架构编码进类型」的来源。',
      'gen',
    ),
  ],
  [
    ['联合类型累积', '多个 yield* 的 E 汇成 union，R 汇成服务集合'],
    ['catchTag', '按 _tag 精确恢复某类错误，并把它从 E 中消除'],
  ],
  ['在库代码里提前 provide 掉所有依赖，让上层失去替换实现的能力。'],
)
