import { L, withKind } from '../../course-builders.ts'

export const L03 = withKind(
  L(
    'L03',
    0,
    'pipe、Effect.gen 与组合的本质',
    2,
    ['L01'],
    ['composition', 'gen'],
    [
      '解释 pipe 与 Effect.gen 在组合语义上的等价与差异',
      '说清 flatMap 为什么是「依赖前一步结果」的表达式',
      '读懂类型累积在链式调用中的传播路径',
      '辨别哪些组合该用 all、哪些必须串行',
    ],
    `
### 一次改写后，错误通道悄悄没了

有段回调嵌套五层的取数逻辑被改成生成器写法，评审时大家只核对了成功路径的返回值，觉得清爽很多就合了。上线后一批权限错误没有触发降级，而是冒到了最外层变成 500。原因很具体：改写时把 \`flatMap\` 链里的一段换成了普通 \`map\`，前一步的结果被当成普通值继续传，而那一步的失败分支再也没有接回主链。**map 只能改成功值，flatMap 才能把「下一步依赖上一步」这件事接回 Effect。** 组合不是把代码串起来，而是决定错误与需求沿哪条路径传播；这一课就把这条路径拆开看。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| pipe 与 Effect.gen 为什么在语义上等价，各自的适用面在哪 | 三通道各自承载什么（L02）、构造子有哪些（L04） |
| flatMap 为什么是「下一步依赖前一步结果」的唯一表达方式 | 类型累积的完整推导与收敛（L06） |
| all 与串行组合该怎么选，如何用断言验证传播路径 | 并发的运行时实现与中断语义（S4） |

### 两种写法，一棵语法树

先看同一段逻辑的两种写法。左边是显式 pipe，右边是生成器；差别只在可读性，运行时看到的指令序列是同一棵结构。

\`\`\` title="pipe 与 gen 的等价写法" note="两段产生的指令序列一致；gen 只是把 flatMap 的回调写成了顺序语句。"
import { Effect } from "effect"

declare const readUser: (id: number) => Effect.Effect<{ id: number }, "NotFound", never>
declare const readOrders: (u: { id: number }) => Effect.Effect<string[], "DbDown", never>

const byPipe = (id: number) =>
  Effect.flatMap(readUser(id), (u) => Effect.map(readOrders(u), (orders) => orders.length))

const byGen = (id: number) =>
  Effect.gen(function* () {
    const u = yield* readUser(id)
    const orders = yield* readOrders(u)
    return orders.length
  })
\`\`\`

\`yield*\` 不是 JavaScript 的异步等待，它把「取出上一步的成功值」这件事交给生成器解释器，解释器在背后替你接上 \`flatMap\`。所以 gen 里每多一个 \`yield*\`，E 与 R 就按 L02 的规则并一次；把 \`yield*\` 写成普通赋值、或者把 \`flatMap\` 降级成 \`map\`，等于把那一段从主链上剪掉——开头的事故正是这么发生的。**判断改写有没有等价，不看成功值，看失败与需求有没有继续沿链传播。**

### 把传播路径变成断言

下面这个最小模型把 map / flatMap / all 三种组合的差别跑成可执行断言。它不依赖 effect 包，只刻画「通道如何传播」，因此可以直接作为改写前后的回归对照。

\`\`\` title="组合算子传播路径的最小模型" note="自包含程序，只依赖 node:assert；模拟成功值、错误集合与依赖集合如何沿链传播。"
import assert from "node:assert/strict"

type Step<A> = { value: A; errors: string[]; needs: string[] }
const ok = <A>(value: A, errors: string[] = [], needs: string[] = []): Step<A> => ({
  value,
  errors,
  needs,
})

const map = <A, B>(s: Step<A>, f: (a: A) => B): Step<B> => ({
  value: f(s.value),
  errors: s.errors,
  needs: s.needs,
})

const flatMap = <A, B>(s: Step<A>, f: (a: A) => Step<B>): Step<B> => {
  const next = f(s.value)
  return {
    value: next.value,
    errors: [...s.errors, ...next.errors],
    needs: [...s.needs, ...next.needs],
  }
}

const all = <A>(steps: readonly Step<A>[]): Step<A[]> => ({
  value: steps.map((s) => s.value),
  errors: steps.flatMap((s) => s.errors),
  needs: [...new Set(steps.flatMap((s) => s.needs))],
})

const base = ok(2, ["timeout"], ["db"])
const dependent = (n: number) => ok(String(n * 3), ["auth"], ["logger"])

// map 只改值，不会把新步骤的通道接回来
const mapped = map(base, (n) => dependent(n).value)
assert.deepEqual(mapped.errors, ["timeout"], "map 不能引入新步骤的错误")
assert.deepEqual(mapped.needs, ["db"], "map 不能引入新步骤的需求")

// flatMap 才是「下一步依赖上一步」的表达：两段通道都要在
const chained = flatMap(base, dependent)
assert.equal(chained.value, "6")
assert.deepEqual(chained.errors, ["timeout", "auth"])
assert.deepEqual(chained.needs, ["db", "logger"])

// all 汇聚成功值，但错误联合、需求去重
const parallel = all([ok(1, ["e1"], ["db"]), ok(2, ["e2"], ["db"])])
assert.deepEqual(parallel.value, [1, 2])
assert.deepEqual(parallel.errors, ["e1", "e2"])
assert.deepEqual(parallel.needs, ["db"], "同一需求只算一次")
console.log("t1 通过：map / flatMap / all 的传播路径互不等价")
\`\`\`

第一条断言值得单独盯住：如果改写后只想拿到「新步骤的成功值」，用 map 确实能编译通过，但那一步的失败与依赖被丢在了模型之外。真实库里对应的表现就是错误不再进入 E 联合、需求不再进入 R 并集，直到线上某个分支第一次失败才暴露。

### 什么时候串行，什么时候 all

| 判据 | 选择 | 理由 |
|---|---|---|
| 后一步的参数来自前一步的结果 | 串行 flatMap / gen | 存在数据依赖，无法同时启动 |
| 多个步骤彼此独立且都要成功 | all | 可并发，任一失败即整体失败 |
| 需要配对而不是聚合 | zip | 结果按位置成对，形状与 all 不同 |
| 只要第一个成功、允许其它失败 | 显式恢复后组合 | all 的默认短路语义不满足需求 |

\`all\` 的默认语义是「任一失败即整体失败」，这点与 Promise.all 表面相似，但差别在**回收**：Effect 的并发受结构化作用域管理，父级结束会级联中断其余分支；Promise.all 里其余请求仍在后台跑。这里只记住选型判据，运行时怎么做到级联回收留到 S4 讲。

:::deep

### 等价的是语义，不是写法

pipe 与 gen 常被争论「哪个更现代」，这是把语法偏好当成了技术判断。真正需要判断的是两件事：一是**链有没有断**，即每个 \`yield*\` 是否都对应一次 flatMap 式的接回；二是**顺序有没有被无意中改动**，即把有数据依赖的两步塞进 all 之后，看起来快了，实际是在用旧值算新值。生成器写法降低了阅读嵌套的负担，但也让「这一步到底依不依赖上一步」变得不明显，所以评审 gen 代码时应该反过来逐个 \`yield*\` 问一句：删掉前一个，这一个还能不能独立跑？能独立跑的才该考虑并发。反过来，pipe 写法把嵌套显式摆出来，代价是长链难读，但每一步的数据流向都写在类型里。**两种写法都正确，断链与错序才不正确。**

:::

:::warn

### 改写组合链时最容易漏的三件事

第一件是把 \`Effect.map\` 当成「异步 then」用，在回调里返回一个 Effect，结果得到嵌套的 Effect 值而不是它的结果——类型上常常能过，运行时却永远拿不到内层的值。第二件是在 gen 里用普通函数调用代替 \`yield*\`，比如直接调用一个返回 Effect 的辅助函数却没接它的结果，这一步整个被跳过，错误通道也随之消失。第三件是为了「提速」把有依赖的两步塞进 all，测试用例恰好都用同一份固定数据，看不出问题，换一组数据就得到旧值。三者都不会产生编译错误，共同点是**成功路径看起来正常**。因此改写组合链之后不要只跑 happy path，至少补一条负例：让中间步骤失败，断言错误仍然出现在最终结果的 E 里。本课 t1 的模型断言就是这条负例的最小形式，可以直接迁移到真实项目。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 改写 pipe → gen 后成功值一致 | 最基本的等价性没保住 |
| 改写后 E 联合与 R 并集逐项一致 | 链断了，某一步的错误或需求被丢掉 |
| 中间步骤失败时最终程序仍以该错误终止 | 失败被 map 或漏掉的 yield 吞掉 |
| 有数据依赖的两步不被放进 all | 用旧值算新值，固定测试数据下不易暴露 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L02 程序即值 | 三通道各自承载什么 | 组合按集合语义累积通道 |
| L04 构造子全景 | 链上每一步的值从哪来 | flatMap 是依赖前一步的唯一表达 |
| L05 组合与变换 | all / zip 的完整对照与可跑实现 | 串行与并发的选型判据 |

到这里，描述、类型、组合三件事都有了可验证的落点。S1 开始往这条链里填真实的构造子与运行结果。
`,
    'blueprint',
    [
      {
        text: 'Effect.gen 里 yield* 某个失败 Effect 会怎样？',
        options: ['返回 undefined 继续执行', '短路整个 gen，错误进入 E 通道', '抛 JS 异常', '自动重试三次'],
        answer: 1,
        explain: '这是结构化错误传播：错误作为值沿组合树向上传导，不需要 try/catch。',
        concept: 'gen',
      },
      {
        text: 'pipe 链中每个算子的返回值是？',
        options: ['void', 'Promise', '一个新的 Effect 值', '原始值被就地修改'],
        answer: 2,
        explain: '不可变组合：原 Effect 保持不变，可复用、可重试、可并发。',
        concept: 'composition',
      },
    ],
    [
      ['组合子 (combinator)', '接收 Effect 并返回新 Effect 的算子'],
      ['SingleShotGen', '配合 Symbol.iterator 让 Effect 可被 yield* 的内部迭代器'],
    ],
    [
      '在 Effect.gen 里用普通 await，绕过类型系统与中断机制。',
      '把 yield* 写成 yield（少了星号），拿到的是 Effect 本身而不是结果。',
    ],
  ),
  'theory',
)
