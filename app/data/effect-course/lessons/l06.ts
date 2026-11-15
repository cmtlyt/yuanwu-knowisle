import { L, withKind } from '../../course-builders.ts'

export const L06 = withKind(
  L(
    'L06',
    1,
    '类型是怎么长出来的：E 与 R 的累积',
    3,
    ['L05'],
    ['type-accumulation', 'gen'],
    [
      '解释 E 与 R 在组合过程中如何累积与收敛',
      '说清 provide 为什么能把 R 从类型里消掉',
      '用类型反例说明把错误统一成 unknown 丢失了什么',
      '判断一次重构该收敛类型还是保留信息',
    ],
    `
### provide 写完了，类型还是不干净

有人在入口处补了 \`Effect.provide(LiveLayer)\`，本以为 R 通道就此清空，结果 \`pnpm typecheck\` 依旧报「缺少服务」，再一看，报错指向的不是入口那一行，而是链中间一个自己新加的分支：那个分支调用了另一个需要 \`Logger\` 的辅助函数，而 provide 只覆盖了当时已有的那段程序。团队一度想用类型断言把 R 抹掉「先过编译」，被拦下来了。**类型不是声明出来的，是被组合过程推出来的**；只要链上还有一段需求没被覆盖，R 就会诚实地把它留着。这一课把累积与收敛的规则拆成可以跑的断言。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| E 与 R 在组合时按什么规则累积，provide 与恢复各收敛哪一部分 | 三通道各自承载什么（L02）、构造子怎么选（L04） |
| 为什么擦平类型能让编译通过却让能力消失 | 组合算子的结果形状（L05）、Cause 的缺陷结构（L09） |
| 怎样用可运行断言验证「只收敛该收敛的」 | Layer 依赖图的记忆化细节（L15） |

### 累积是并，收敛是差

把 L02 的集合语义再往前推一步：组合时两段通道取并集，而显式处理时只做**差集**——从集合里移除被声明处理的那一类，其余原样保留。这两条规则合起来，就解释了绝大多数「类型怎么长这样」的疑问。

| 动作 | 对 E 的影响 | 对 R 的影响 |
|---|---|---|
| flatMap / gen 串一步 | 联合新步骤的 E | 并上新步骤的 R |
| all 汇聚多个分支 | 联合所有分支的 E | 并上所有分支的 R（同一 Tag 只算一次） |
| Effect.catch 处理某类错误 | 移除被处理的那一类 | 不变，恢复代码自身的需求会被并入 |
| provide 装配某类服务 | 不变，装配失败属于另一层 | 移除被装配的那一类 |
| 直接运行 | E 折叠进 Exit | R 必须已为 never，否则无法运行 |

最后一行是最硬的约束：**运行之前 R 必须是 never**。这不是编译器挑剔，而是「程序还缺东西，运行时不知道该补什么」。用类型断言把 R 抹成 never，等于让运行时在真正需要服务时才发现缺失，编译期的保障被换成了运行时的崩溃。

### 用最小模型把规则跑出来

\`\`\` title="累积与收敛的最小模型" note="自包含程序，只依赖 node:assert；用字符串集合模拟 E 与 R，验证「只收敛该收敛的」。"
import assert from "node:assert/strict"

type Channels<A> = { value: A; errors: Set<string>; needs: Set<string> }
const of = <A>(value: A, errors: string[] = [], needs: string[] = []): Channels<A> => ({
  value,
  errors: new Set(errors),
  needs: new Set(needs),
})

const chain = <A, B>(a: Channels<A>, b: Channels<B>): Channels<B> => ({
  value: b.value,
  errors: new Set([...a.errors, ...b.errors]),
  needs: new Set([...a.needs, ...b.needs]),
})

// 恢复：只移除声明处理的那一类错误
const recover = <A>(c: Channels<A>, handled: string): Channels<A> => ({
  ...c,
  errors: new Set([...c.errors].filter((e) => e !== handled)),
})

// 装配：只移除被装配的那一类服务
const provide = <A>(c: Channels<A>, supplied: string): Channels<A> => ({
  ...c,
  needs: new Set([...c.needs].filter((n) => n !== supplied)),
})

const readUser = of(1, ["NotFound"], ["Db"])
const readOrders = of(["a", "b"], ["DbDown"], ["Db", "Logger"])
const program = chain(readUser, readOrders)

assert.deepEqual([...program.errors].sort(), ["DbDown", "NotFound"], "E 取联合")
assert.deepEqual([...program.needs].sort(), ["Db", "Logger"], "R 取并集并去重")

const recovered = recover(program, "NotFound")
assert.deepEqual([...recovered.errors], ["DbDown"], "恢复只移除被声明处理的错误")
assert.deepEqual([...recovered.needs].sort(), ["Db", "Logger"], "恢复不该动 R")

const provided = provide(recovered, "Db")
assert.deepEqual([...provided.needs], ["Logger"], "装配只移除被提供的服务")
assert.deepEqual([...provided.errors], ["DbDown"], "装配不该动 E")

// 只有 R 清空之后才允许运行
const runnable = provide(provided, "Logger")
assert.equal(runnable.needs.size, 0, "运行前 R 必须为 never")
console.log("t1 通过：累积是并、收敛是差、两类通道互不干扰")
\`\`\`

\`recover\` 与 \`provide\` 的对称性值得停一下：一个动 E、一个动 R，彼此绝不越界。这正是开头那次问题的答案——补了 provide 却没清干净，是因为链上后来新增的分支又并进了新的 R，而 provide 只作用于它当时看到的那段程序。正确做法不是加断言，而是把新增分支也纳入同一段被装配的程序，让累积发生在收敛之前。

### 什么时候该收敛，什么时候该保留

| 情形 | 建议 | 理由 |
|---|---|---|
| 错误在边界处能被完整降级 | 收敛 E | 上层不必再知道这个分支 |
| 错误需要上层决定是否重试 | 保留 E | 信息擦掉后上层无从判断 |
| 服务是全局共享的单例 | 收敛 R | 每个调用都重复装配没有意义 |
| 服务按租户或请求变化 | 保留 R 到更外层 | 过早装配会把错误的作用域固化 |

这里有个反直觉的判断：**收敛不总是好事**。类型信息是给上层做决策用的，把它在本层消掉，等于替上层做了决定。L02 开头那次 429 恢复失效，正是把「错误具体是哪一类」这个决策依据提前擦掉了。所以每次写 Effect.catch 或 provide 之前，先问一句：这个信息上层还要不要？

:::deep

### 为什么类型推导能当架构反馈

在命令式代码里，函数签名往往由人手写，写错了编译器也照单全收；但在 Effect 里，E 与 R 是组合过程推出来的，几乎无法手动伪造。这带来一个意外的好处：**类型变成了架构的体检报告**。某个工具函数突然需要 Logger，所有调用它的程序 R 里就会多出 Logger，编译错误会一路指到真正的边界；某段恢复逻辑漏了一类错误，E 里就会多出一个没人处理的分支。与其把这些报错当成要消灭的噪音，不如把它当成「这条依赖或这个失败分支还没被认真设计过」的提示。用 \`as any\` 抹平，得到的不是更干净的类型，而是一份被撕掉的体检报告。

:::

:::warn

### 三种擦平类型的写法与代价

第一种是在入口写 \`as Effect.Effect<A, never, never>\`，编译立刻通过，但运行时在第一次真正访问服务时才崩，且堆栈往往指向很远的地方。第二种是写一个全能的 Effect.catch，把所有错误映射成同一个通用错误，E 集合确实收敛了，可恢复谓词从此只能二选一：要么全重试，要么全不重试。第三种更隐蔽：把 provide 放在链中间而不是最外层，后续新增分支绕过了它，类型时灵时不灵，团队会误以为是推导不稳定。三者都让编译通过，代价分别是运行时崩溃、恢复粒度丢失、装配边界漂移。排查顺序建议固定：先看 R 是不是在链中间被提前收敛，再看 E 有没有被通用错误覆盖，最后才怀疑运行时。**能用类型表达的信息，不要用注释表达。**

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 串接后 E 是两段的联合 | 某一步失败分支被覆盖丢失 |
| 串接后 R 是两段的并集且去重 | 依赖漏报，运行时会缺服务 |
| 恢复只移除指定错误、装配只移除指定服务 | 两类通道被越界修改 |
| 收敛后 R 为 never 才允许运行 | 靠断言绕过检查，运行时崩溃 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L02 程序即值 | 三通道各自是什么 | 累积取并、收敛取差 |
| L07 运行边界与 Exit | R 清空之后结果怎么折叠成值 | 运行前 R 必须为 never |
| L15 依赖图记忆化 | 同一 Tag 为什么只装配一次 | R 并集按 Tag 去重 |
`,
    'triple',
    [
      {
        text: 'Effect.provide 对类型的影响是？',
        options: ['给 E 增加错误', '从 R 中移除被满足的服务', '把 Success 变成 void', '让程序立即执行'],
        answer: 1,
        explain: 'provide 是编译期的依赖消解，不触发运行。',
        concept: 'type-accumulation',
      },
      {
        text: 'R = never 意味着什么？',
        options: ['程序会失败', '没有未满足的依赖，可以直接运行', '程序永不结束', '需要更多服务'],
        answer: 1,
        explain: 'R=never 表示 Context 为空，是 run* 可执行的前提之一。',
        concept: 'type-accumulation',
      },
      {
        text: 'Effect.gen 里 yield* 多个 Effect 时，类型会怎样？',
        options: [
          'gen 会自动补全缺失的 R',
          'yield* 每个 Effect 时，其 E/R 并入外层，未被 provide/catch 消解的会留在最终类型里',
          'gen 只能处理 E，不处理 R',
          'gen 会忽略依赖直接运行',
        ],
        answer: 1,
        explain:
          'gen 的类型累积是结构性的：编译通过即代表 E 全部可恢复、R 全部已满足，这正是「架构编码进类型」的来源。',
        concept: 'gen',
      },
    ],
    [
      ['联合类型累积', '多个 yield* 的 E 汇成 union，R 汇成服务集合'],
      ['catchTag', '按 _tag 精确恢复某类错误，并把它从 E 中消除'],
    ],
    ['在库代码里提前 provide 掉所有依赖，让上层失去替换实现的能力。'],
  ),
  'theory',
)
