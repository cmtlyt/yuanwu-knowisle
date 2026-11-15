import { L, withKind } from '../../course-builders.ts'

export const L05 = withKind(
  L(
    'L05',
    1,
    '组合与变换：map / flatMap / all / zip',
    2,
    ['L04'],
    ['composition'],
    [
      '实现 map / flatMap / all / zip 的四段可运行流水线',
      '写出 all 并发与 zip 配对的对照程序并断言结果形状',
      '跑通「任一失败即整体失败」的短路验证',
      '改造一段嵌套回调代码为组合子表达',
    ],
    `
### 一次「并发提速」把两个请求的答案配错了

报表接口把三次串行查询改成并发，压测显示耗时降到原来的三分之一，于是直接上线。几天后财务发现部分账单的金额和用户名对不上：并发版本用 all 收集结果，再按下标去配另一份并行返回的元数据，两个数组来自不同的请求批次，下标并不对应。问题不是并发本身，而是**结果形状选错了**：需要一一配对时应该用 zip，需要聚合成数组才用 all。组合算子的差别不在性能，在「成功后长什么样、失败后怎么传播」。L03 已经把传播路径讲清楚，这一课把四个算子写成可跑的实现，并把结果形状变成断言。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| map / flatMap / all / zip 各自产出什么形状，怎么选 | pipe 与 gen 的语义等价性、断链判据（L03） |
| 怎样把嵌套回调改造成组合子表达而不丢错误通道 | 类型累积与收敛（L06）、构造子选型（L04） |
| 如何用断言验证短路、配对与形状 | 并发的运行时实现与级联中断（S4） |

### 四个算子的结果与传播契约

| 算子 | 输入关系 | 成功时的形状 | 失败时 |
|---|---|---|---|
| map | 只改当前成功值 | 单值，类型可变 | 原样传播，不引入新通道 |
| flatMap | 下一步依赖上一步结果 | 单值，由回调决定 | 两段错误联合、需求并集 |
| all | 多个彼此独立的步骤 | 数组，顺序与输入一致 | 任一失败即整体失败 |
| zip | 多个步骤需要按位置配对 | 元组或成对结构 | 任一失败即整体失败 |

all 与 zip 在失败语义上一样，区别只在**成功值的形状**：all 把若干结果收进一个数组，zip 把它们按位置绑成一对。开头的事故就是拿 all 的数组去和另一批数据按下标配对，配对关系没有任何类型保证。若一开始写成 zip，两个结果会在类型层面被绑在一起，错配根本编译不过。

### 真实写法与最小模型

\`\`\` title="四个算子的 effect@4.1.4 写法" note="zip 把两个结果绑成元组；all 收成数组。二者都要求所有分支成功。"
import { Effect } from "effect"

declare const readAmount: Effect.Effect<number, "DbDown", never>
declare const readName: Effect.Effect<string, "DbDown", never>

const doubled = Effect.map(readAmount, (n) => n * 2)
const withTax = Effect.flatMap(readAmount, (n) => Effect.succeed(n * 1.06))
const everything = Effect.all([readAmount, readName])
const paired = Effect.zip(readAmount, readName)
\`\`\`

\`\`\` title="all / zip 结果形状与短路的最小模型" note="自包含程序，只依赖 node:assert；模拟成功聚合、位置配对与任一失败即整体失败。"
import assert from "node:assert/strict"

type Outcome<A> = { ok: true; value: A } | { ok: false; error: string }
const ok = <A>(value: A): Outcome<A> => ({ ok: true, value })
const bad = <A>(error: string): Outcome<A> => ({ ok: false, error })

const all = <A>(items: readonly Outcome<A>[]): Outcome<A[]> => {
  const failed = items.find((x) => !x.ok)
  if (failed && !failed.ok) return bad(failed.error)
  return ok(items.map((x) => (x.ok ? x.value : (undefined as never))))
}

const zip = <A, B>(a: Outcome<A>, b: Outcome<B>): Outcome<[A, B]> => {
  if (!a.ok) return bad(a.error)
  if (!b.ok) return bad(b.error)
  return ok([a.value, b.value])
}

const amounts = [ok(100), ok(200), ok(300)]
assert.deepEqual(all(amounts), { ok: true, value: [100, 200, 300] })

const names = ok("alice")
assert.deepEqual(zip(ok(100), names), { ok: true, value: [100, "alice"] }, "zip 把两份结果绑定")

// 任一失败即整体失败，且失败原因来自第一个失败分支
assert.deepEqual(all([ok(100), bad<string>("DbDown"), ok(300)]), { ok: false, error: "DbDown" })
assert.deepEqual(zip(ok(100), bad<string>("DbDown")), { ok: false, error: "DbDown" })

// 形状断言：all 产出数组，zip 产出二元组，不能拿数组下标去配另一批数据
const aggregated = all(amounts)
assert.ok(aggregated.ok && Array.isArray(aggregated.value))
const paired = zip(ok(100), names)
assert.ok(paired.ok && paired.value.length === 2)
console.log("t1 通过：all 聚合、zip 配对、两者都遵循短路")
\`\`\`

### 把嵌套回调改造成组合子

下面是一段典型的嵌套写法与改造后版本的对照。改造不是为了少几行，而是让每一步的错误都明确回到主链。

\`\`\` title="嵌套回调改造前后" note="自包含程序；改造后用顺序步骤表达，中间失败不再被内层吞掉。"
import assert from "node:assert/strict"

type Step<A> = { value: A; error?: string }
const step = <A>(value: A, error?: string): Step<A> => ({ value, error })

// 改造前：内层失败被字符串兜底，主链只看到默认值
const before = (raw: Step<number>) => {
  const inner = step(raw.value * 2, raw.error)
  return inner.error ? "fallback" : String(inner.value)
}
assert.equal(before(step(2, "DbDown")), "fallback", "错误被伪装成默认值")

// 改造后：失败作为一等结果沿链传播，交给统一的恢复点
type Chain<A> = { ok: true; value: A } | { ok: false; error: string }
const of = <A>(s: Step<A>): Chain<A> => (s.error ? { ok: false, error: s.error } : { ok: true, value: s.value })
const flatMap = <A, B>(c: Chain<A>, f: (a: A) => Chain<B>): Chain<B> => (c.ok ? f(c.value) : c)
const after = (raw: Step<number>) => flatMap(of(raw), (n) => of(step(String(n * 2))))

assert.deepEqual(after(step(2)), { ok: true, value: "4" })
assert.deepEqual(after(step(2, "DbDown")), { ok: false, error: "DbDown" }, "失败必须沿链传播")
console.log("t2 通过：改造后错误通道完整")
\`\`\`

\`t2\` 的第二条断言是这类改造唯一需要盯住的验收点：成功路径无论怎么改都容易对，失败路径才是分水岭。改造前的内层用三元表达式给了个 fallback，改造后把失败作为一等结果交给统一恢复点，L10 才谈得上「只对可重试错误生效」。

### 选择判据

| 场景 | 选择 | 反例 |
|---|---|---|
| 结果来自同一次请求的两个字段 | zip | 两次 all 后按下标配对 |
| 一批彼此独立的查询都要成功 | all | 手写计数器等待全部完成 |
| 后一步要拿前一步的 id | flatMap | 把两步塞进 all 再取第 0 项 |
| 只想把成功值换个格式 | map | 用 flatMap 包一层 succeed |

:::deep

### 形状是契约，不是便利

组合算子最容易被低估的一点是：**成功值的形状本身就是一份类型契约**。all 给数组、zip 给元组，差别看似只是数据结构，实际决定了「这两份结果是否属于同一次业务动作」能不能被编译器检查。数组允许任意长度、允许按下标错位访问；元组把长度和位置写进类型，错配在编译期就失败。前面那次账单错配，根因不是并发，而是用数组表达了一个本该是二元组的绑定关系。推广开来看，凡是「这几个值必须一起才有意义」的地方，都不该让它们先散成数组再靠约定拼回去；先选对形状，再谈性能。这也解释了为什么组合子值得单独一课：它们不是链式调用的胶水，而是把业务约束编码进类型的位置。

:::

:::warn

### 三个不会报错的误用

第一件是把有数据依赖的两步塞进 all，测试用例恰好都用同一份固定数据，于是「用旧值算新值」看不出来；换一组数据才暴露。第二件是在 map 的回调里返回一个 Effect，得到嵌套的 Effect 值，后续代码拿到的是「装着程序的程序」而不是结果，类型检查常常放行。第三件是用 all 收集结果后，再按下标去配另一批并行数据，正是开头的事故；两份数组来自不同批次时顺序没有任何保证。三者的共同症状是**成功路径看起来完全正常**，因此回归集里必须包含一条失败路径断言（t2 第二条）和一条形状断言（t1 末尾两条）。只跑 happy path 的组合改造，等于没验。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| all 产出数组且顺序与输入一致 | 聚合结果错位 |
| zip 产出固定长度元组 | 两份结果没被绑定，存在下标错配风险 |
| 任一分支失败时整体失败且原因可追溯 | 失败被某一层吞掉 |
| 改造后失败仍沿链传播 | 内层 fallback 把错误伪装成默认值 |
| 嵌套 map 不产生嵌套的 Effect 值 | 用错算子，拿到的是程序而不是结果 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L03 组合的本质 | 传播路径与 pipe / gen 等价性 | 四个算子的结果形状与短路语义 |
| L06 类型累积 | 串起来之后 E 与 R 怎么长出来 | flatMap 会合并两段通道 |
| S4 结构化并发 | all 之后失败分支如何级联回收 | 「任一失败即整体失败」的语义约定 |

### 评审组合改造时的六条核对项

| 核对项 | 怎么看 | 不通过时的典型后果 |
|---|---|---|
| 两步之间有没有数据依赖 | 删掉前一步，后一步还能不能独立跑 | 用旧值算新值，固定测试数据下不暴露 |
| 回调里有没有返回 Effect | map 的回调返回类型是不是普通值 | 得到嵌套的 Effect，永远拿不到内层结果 |
| 失败有没有沿链传播 | 让中间步骤失败，看最终结果 | 内层 fallback 把错误伪装成默认值 |
| 结果形状是否表达了绑定关系 | 两个值必须一起才有意义吗 | 用数组下标配另一批数据，顺序错位 |
| 并发分支是否彼此独立 | 是否共享同一份可变状态 | 竞态写，结果依赖调度顺序 |
| 短路后其余分支是否回收 | 父级结束时子任务还在不在跑 | 后台任务泄漏，缩容时丢数据 |

六条里前三条在 L03 已经出现过，这里补上的是后三条：形状、独立性、回收。它们都属于「成功路径完全正常、只在特定条件下暴露」的类别，靠手工点一遍页面验不出来，必须写成断言。t1 的形状断言与 t2 的失败断言分别覆盖了前两条，后两条要到 S4 讲结构化并发时才能用运行时机制兜住——在那之前，选型判据就是唯一的护栏。评审时按这张表从上往下走一遍，比讨论「这样写是不是更简洁」有效得多。

### 与相邻模块的接缝

| 上游交付 | 下游怎么用 | 不允许改什么 |
|---|---|---|
| 形状明确的聚合 / 配对结果 | L06 推导 E 与 R 的联合 | 不把元组散成数组再靠约定拼回 |
| 完整的错误传播链 | L10 挑出可重试分支 | 不在内层用 fallback 截断 |
| 「任一失败即整体失败」的约定 | S4 的级联中断 | 不改成「忽略失败分支继续返回」 |
`,
    'concurrency',
    [
      {
        text: 'Effect.all([a,b,c]) 不传 concurrency 时如何执行？',
        options: ['全并发', '顺序执行', '随机顺序', '只执行第一个'],
        answer: 1,
        explain: 'v4 默认顺序；显式传 concurrency 才会并发。',
        concept: 'composition',
      },
      {
        text: 'map 与 flatMap 的分界是？',
        options: [
          'map 只能用于数字',
          'flatMap 的回调返回 Effect，map 返回普通值',
          'flatMap 会立刻执行',
          '二者完全等价',
        ],
        answer: 1,
        explain: 'flatMap 用于把下一步计算也建模成 Effect，从而保留错误与依赖通道。',
        concept: 'composition',
      },
    ],
    [
      ['短路', '前一个失败后，后续组合子不再执行，错误沿链传播'],
      ['concurrency 选项', 'number 有界 / "unbounded" 无界 / 省略则顺序'],
    ],
    [
      '以为 Effect.all 像 Promise.all 一样默认并行。',
      '在 map 里返回 Effect，结果拿到一个 Effect 值而不是它的结果。',
    ],
  ),
  'practice',
)
