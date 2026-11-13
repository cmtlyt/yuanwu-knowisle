import { L, prose, code, call, list, q } from '../../course-builders.ts'

export const L02 = L(
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
)
