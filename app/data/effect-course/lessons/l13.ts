import { L, withKind } from '../../course-builders.ts'

export const L13 = withKind(
  L(
    'L13',
    3,
    'Context.Service：类型化的服务键',
    2,
    ['L06'],
    ['context'],
    [
      '实现 Context.Service 定义与最小服务实现',
      '写出用假实现替换真实服务的测试',
      '跑通「缺服务时类型不通过」的编译期断言',
      '识别把服务当全局单例的误用',
    ],
    `
### 两个测试互相串了数据库配置

单测单独跑全绿，并行跑就随机失败。查了很久才发现，有人把数据库连接抽成了模块级单例，测试 A 用假实现替换它，测试 B 在同一进程里读到的是被替换后的实例。**问题不在「用了全局状态」，而在「服务与它的使用者直接绑定」**：调用方 import 了具体实现，替换实现只能改模块状态，于是测试之间必然互相污染。Context.Service 把这件事拆成两半——服务用类型化的键来声明，实例在运行前装配。这一课把这条分界写成可运行的程序。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 服务键与服务实例的区别，以及为什么键要进 R 通道 | Layer 的构造时机与记忆化（L14、L15） |
| 怎样用假实现替换真实服务而不改动调用链 | Scope 与 finalizer 的资源安全（L16） |
| 如何用编译期与运行时断言验证「缺服务即失败」 | 多 Layer 装配与资源竞争（L17） |

### 键、实现、装配三者的分工

| 概念 | 是什么 | 谁持有 | 常见误用 |
|---|---|---|---|
| 服务键（Tag） | 一个类型化的标识符，出现在 R 通道 | 类型系统 | 把具体实现当键用，测试无法替换 |
| 服务实现 | 满足该接口的真实对象 | 装配层 | 在业务函数里直接 new，绕过装配 |
| 装配（provide） | 在边界处把实现交给程序 | 运行边界 | 每个函数各装配一次，实例不共享 |

关键在第一行：R 里写的是「我需要一个 Db」，不是「我需要这个具体的 Db 实例」。所以 L06 讲的 R 并集不是接口清单，而是**需求清单**；装配的作用是把需求从集合里消掉。把键写成具体类，等于把需求与供给焊死，L06 的收敛规则也就失效了。

### 真实写法

\`\`\` title="类型化服务键与装配" note="Context.Service 声明键；业务代码只 yield 服务，不 import 任何具体实现。"
import { Context, Effect } from "effect"

class Db extends Context.Service<Db, {
  readonly get: (id: number) => Effect.Effect<string, Error, never>
}>()("Db") {}

class Logger extends Context.Service<Logger, {
  readonly info: (line: string) => Effect.Effect<void, never, never>
}>()("Logger") {}

const program = Effect.gen(function* () {
  const db = yield* Db
  const log = yield* Logger
  yield* log.info("reading")
  return yield* db.get(1)
})

// 此刻 R 通道里是 Db | Logger；装配由 L14 的 Layer 在应用最外层完成
\`\`\`

注意业务函数里没有任何具体实现，也没有用占位值假装装配过。这一课只交付「需求被正确声明」，装配的具体写法留给下一课，两者混在一起讲容易让人以为 \`Effect.provide\` 的第二个参数可以随便塞。测试要替换实现时，只需换掉最外层提供的那一层，调用链一行都不用改——这正是开头那次并行测试失败所缺的能力。

### 把「可替换」变成断言

\`\`\` title="服务键与假实现的最小模型" note="自包含程序，只依赖 node:assert；模拟键声明、装配、缺服务硬失败与测试替换。"
import assert from "node:assert/strict"

type Tag<T> = { readonly id: string; readonly phantom?: T }
const tag = <T>(id: string): Tag<T> => ({ id })

type Context = Map<string, unknown>
type Program<A> = { readonly needs: readonly string[]; readonly run: (ctx: Context) => A }

const ask = <T>(t: Tag<T>): Program<T> => ({
  needs: [t.id],
  run: (ctx) => {
    if (!ctx.has(t.id)) throw new Error("missing service: " + t.id)
    return ctx.get(t.id) as T
  },
})

const provide = <A>(p: Program<A>, id: string, impl: unknown): Program<A> => ({
  needs: p.needs.filter((n) => n !== id),
  run: (ctx) => p.run(new Map([...ctx, [id, impl]])),
})

interface Db { get(id: number): string }
const DbTag = tag<Db>("Db")
const LoggerTag = tag<(s: string) => void>("Logger")

const business = ask(DbTag)
assert.deepEqual(business.needs, ["Db"], "需求写进 R 通道")

const real: Db = { get: (id) => "row-" + id }
const fake: Db = { get: () => "fake" }

assert.equal(provide(business, "Db", real).run(new Map()), "row-1")
assert.equal(provide(business, "Db", fake).run(new Map()), "fake", "换实现不改调用链")
assert.equal(provide(business, "Db", real).needs.length, 0, "装配后需求被消掉")
assert.throws(() => business.run(new Map()), /missing service: Db/, "缺服务必须硬失败")

// 两个不同键不会互相覆盖
const composed = provide(ask(LoggerTag), "Logger", () => {})
assert.deepEqual(composed.needs, [])
console.log("t1 通过：键进 R、装配收敛、缺服务硬失败、实现可替换")
\`\`\`

第四条断言对应「编译期检查」的运行时版本：真实库里，R 未清空就无法运行，TypeScript 会直接报错；这个最小模型用抛错把同一条约束钉住。第三条断言则是 L06 收敛规则在服务这一层的具体形态。

### 编译期与运行时的双层保障

| 层 | 检查什么 | 失效的表现 |
|---|---|---|
| 类型层 | R 里声明的需求是否都被装配 | 无法通过 typecheck，指向缺服务的边界 |
| 运行时 | 装配的键与需求是否匹配 | 抛「缺服务」，指向装配顺序 |
| 测试层 | 假实现能否替换真实实现 | 测试串数据，或要改业务代码才能 mock |

三层缺一不可。只依赖类型层，遇到动态装配（按租户选实现）时无从下手；只依赖运行时，错误会推迟到生产。把 t1 的「缺服务硬失败」放进集成测试，等于给动态装配补上运行时兜底。

:::deep

### 为什么键必须是类型而不是字符串

用字符串当键也能实现同样的装配表，但会丢掉两样东西：一是**接口约束**，字符串查出来的值只能靠断言转成目标类型，写错名字时编译器沉默；二是**需求推导**，R 通道无法从字符串自动收集出「这段程序需要哪些服务」。类型化的键让 \`yield* Db\` 这一行同时完成三件事：声明需求、获得正确类型、留下可追踪的标识。这也是为什么 Context.Service 的定义看起来有点绕——它把「键」和「该键对应的服务形状」绑成一个整体，让类型推导有依据。回头看 L02 的三通道，R 之所以能像 E 一样按集合累积，靠的正是每个需求都是一个可比较、可去重、带类型的键，而不是一段文字描述。

:::

:::warn

### 三个把服务写成全局状态的坑

第一件是在业务函数里直接 import 具体实现，开头那次并行测试串数据就是这么来的；症状是单测单独跑全绿、并行跑随机失败。第二件是把装配放在链中间，后续新增分支绕过它，R 时灵时不灵，团队容易误判成类型推导不稳定——L06 已经讲过同一类问题。第三件是把服务实例塞进模块级变量当缓存，本意是省一次构造，实际让不同租户、不同测试共享同一份状态，且没有任何机制能在作用域结束时清理。三者都不会产生编译错误，共同点是**需求与供给被绑在同一个作用域里**。纠偏顺序固定：先把实现从业务模块移出去，再把装配收敛到最外层，最后补一条「换实现不改调用链」的测试。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 业务程序的 needs 里只出现键，不出现实例 | 需求与实现焊死，无法替换 |
| 装配后 needs 被消掉 | 收敛规则失效，运行时会缺服务 |
| 缺服务时硬失败而非返回 undefined | 静默降级掩盖装配错误 |
| 换假实现不改调用链 | 测试必须改业务代码才能 mock |
| 两个不同键互不覆盖 | 装配表键冲突，串实现 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L06 类型累积 | R 并集与收敛的一般规则 | 服务键是可去重的需求项 |
| L14 Layer 语义 | 实现怎么被构造、何时被构造 | 装配发生在最外层 |
| L17 多 Layer 实战 | 多个键的依赖图与竞争 | 「换实现不改调用链」这条判据 |

### 一次并行测试串数据的排障回放

| 步骤 | 当时看到的现象 | 缺的是哪一层 |
|---|---|---|
| 单独跑测试 A | 全绿 | 看不出问题，假实现确实生效了 |
| 单独跑测试 B | 全绿 | 同样看不出，进程是干净的 |
| 并行跑 | 随机失败，读到的配置不属于自己 | 具体实现被放在模块级共享状态里 |
| 想换假实现 | 必须改业务模块的 import | 调用链与实现焊死，需求没有独立声明 |
| 改成服务键后 | 只换最外层装配，调用链一行不动 | 需求、供给、装配三层终于分开 |

这张表值得按倒序看：最后一步能一次修好，是因为把「我需要什么」与「谁给我」拆成了两个动作；而前四步花掉的时间，都耗在试图给共享状态加锁、加清理钩子上。**并行测试串数据几乎从来不是并发问题，而是身份问题**——两个测试以为自己拿到不同的服务，实际拿到同一个模块级实例。把服务键写进 R 通道之后，装配器至少能知道「这里应该有两份不同的上下文」，才有机会做隔离。

### 与 S3 后续课的接缝

| 本课交付 | 下游怎么用 | 不允许改什么 |
|---|---|---|
| 类型化服务键 | L14 的配方按 Tag 提供产物 | 不把具体实现当键 |
| 「换实现不改调用链」判据 | L17 的三层装配验收 | 不在业务函数里直接 new |
| 缺服务硬失败断言 | L15 依赖图的装配期检查 | 不用 undefined 静默降级 |
`,
    'layer',
    [
      {
        text: 'yield* SomeService 之后，程序类型发生什么变化？',
        options: ['E 增加错误', 'R 增加 SomeService', 'Success 变成 void', '立即执行'],
        answer: 1,
        explain: '服务需求被记进 Requirements 通道，直到 provide 才被消解。',
        concept: 'context',
      },
      {
        text: '替换服务的实现应该改哪里？',
        options: ['用例函数签名', '提供的 Layer', 'Context.Service 的 key', 'run* 函数'],
        answer: 1,
        explain: '端口不变、换适配器，这是 Effect 做 DI 的核心。',
        concept: 'context',
      },
    ],
    [
      ['Context.Service', 'v4 中定义服务键与形状的类'],
      ['Context.make', '手动构造一个 Context<R>'],
    ],
    ['把服务实例塞进模块级单例，绕开 R 通道，测试时无法替换。'],
  ),
  'practice',
)
