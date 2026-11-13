import { L, prose, code, call, q } from '../../course-builders.ts'

export const L03 = L(
  'L03',
  0,
  'pipe、Effect.gen 与组合的本质',
  30,
  2,
  ['L01'],
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
)
