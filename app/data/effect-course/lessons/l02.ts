import { L, withKind } from '../../course-builders.ts'

export const L02 = withKind(
  L(
    'L02',
    0,
    '程序即值：Effect<Success, Error, Requirements>',
    1,
    ['L01'],
    ['three-channels', 'laziness'],
    [
      '解释三通道类型 Success / Error / Requirements 各自承担什么信息',
      '说清惰性蓝图与立即执行副作用的区别',
      '用类型层面的反例说明为什么 Promise 不是 Effect 的等价物',
      '判断一段代码该留在 Effect 里还是推到运行边界',
    ],
    `
### 一次「顺手简化类型」引发的恢复失效

有个服务把几十个领域错误统一收成了一个 \`AppError\`，理由是「这样签名短一点」。两周后线上出现第三方接口 429，本该走退避重试的请求被直接判成不可恢复，熔断计数器一路涨到阈值。复盘时发现，简化类型那次把错误联合类型擦成了 \`string\`，恢复谓词里判断具体错误分支的代码从此永远返回 false，但 TypeScript 一声不响——因为 \`string\` 完全合法。**类型不是给编译器看的注释，它是运行时决策的唯一依据。** 这一课要讲清 Effect 三个类型参数各自守着哪一份契约，以及为什么擦掉其中任何一个，都会让某类运行时能力静默消失。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| Success / Error / Requirements 三个通道分别承载什么信息，以及它们为什么必须分开 | 各构造子的具体写法（L04）、组合时类型如何累积（L06） |
| \`never\` 出现在三个位置上分别意味着什么 | Exit 的折叠与运行边界选择（L07） |
| 擦平类型会具体损失哪些能力，如何用可运行断言验证 | Cause 的底层结构与缺陷分类（L08、L09） |

### 三份契约，不是三个泛型参数

\`Effect<Success, Error, Requirements>\` 常简写成 \`A / E / R\`。把它们当成三个泛型参数去背，很快就会把它们当成「编译器要的样板」；换成三份契约去读，每一个都对应一类明确的运行时行为。

| 通道 | 它承诺的事 | 擦掉之后失去的能力 |
|---|---|---|
| Success | 正常路径产出的值的类型 | 下游无法在不做断言的前提下消费结果，只能到处写类型守卫 |
| Error | 所有**预期失败**的穷举集合 | 恢复策略无法只针对某一类错误生效，重试与降级退化成「一视同仁」 |
| Requirements | 运行这段程序所需的服务集合 | 依赖只能靠参数透传，测试替换实现要改动整条调用链 |

关键在于 E 与 R 都是**集合语义**：多个步骤串起来时，E 取联合、R 取并集，只有显式恢复或显式装配才能把它们收敛掉。这与异常处理的默认行为完全不同——异常一旦被 catch 到 \`unknown\`，信息就永久丢了，后面没有任何机制能把它找回来。开头那次事故的本质，正是 E 从「三个具体错误类型的联合」被擦成了 \`string\`，恢复谓词的名字还在，判断依据却没了。

### 把三通道跑成可验证的模型

先看真实的类型提取工具，再用一个不依赖库的最小模型把「集合语义」变成断言。两段代码的分工要说清楚：前一段是 effect@4.1.4 的 API 长什么样，后一段是这套语义在什么情况下会失效。

\`\`\` title="三通道类型提取" note="Effect.Services 取出 R 通道；三个工具类型让恢复与装配代码不必手写类型体操。"
import { Context, Effect } from "effect"

class Db extends Context.Service<Db, {}>()("Db") {}
class Logger extends Context.Service<Logger, {}>()("Logger") {}

declare const program: Effect.Effect<number, Error, Db | Logger>

type A = Effect.Success<typeof program>   // number
type E = Effect.Error<typeof program>     // Error
type R = Effect.Services<typeof program>  // Db | Logger
\`\`\`

\`\`\` title="E 与 R 集合语义的最小模型与断言" note="自包含程序，只依赖 node:assert；模拟组合时的通道累积与收敛规则。"
import assert from "node:assert/strict"

type Program<A, E, R> = {
  readonly success: A
  readonly errors: readonly E[]
  readonly needs: readonly R[]
}

const of = <A, E, R>(
  success: A,
  errors: readonly E[] = [],
  needs: readonly R[] = [],
): Program<A, E, R> => ({ success, errors, needs })

const flatMap = <A, B, E extends string, F extends string, R, S>(
  p: Program<A, E, R>,
  f: (a: A) => Program<B, F, S>,
): Program<B, E | F, R | S> => {
  const next = f(p.success)
  return {
    success: next.success,
    errors: [...p.errors, ...next.errors] as (E | F)[],
    needs: [...p.needs, ...next.needs] as (R | S)[],
  }
}

type Err = "timeout" | "auth" | "defect"
type Need = "db" | "logger"

const first = of<number, Err, Need>(1, ["timeout"], ["db"])
const second = (n: number) => of<string, Err, Need>(String(n), ["auth"], ["logger"])
const joined = flatMap(first, second)

assert.deepEqual(joined.errors, ["timeout", "auth"], "E 必须取联合，不能只保留后者")
assert.deepEqual(joined.needs, ["db", "logger"], "R 必须取并集，不能只保留后者")

// 显式恢复只收敛某一类错误，其余必须原样留下
const recover = <A, E extends string, R>(
  p: Program<A, E, R>,
  handled: E,
): Program<A, E, R> => ({ ...p, errors: p.errors.filter((e) => e !== handled) })

const recovered = recover(joined, "timeout")
assert.deepEqual(recovered.errors, ["auth"], "恢复只能消掉被声明处理的那一类")
assert.deepEqual(joined.errors, ["timeout", "auth"], "原值不可被修改")
console.log("t1 通过：三通道按集合语义累积，恢复只收敛指定分支")
\`\`\`

第二条断言是这一课最该记住的：组合不会「自动帮你简化类型」。它只会诚实地把两段的错误与需求并起来，然后等你显式处理。所谓类型长出来，说的就是这件事——**类型不是预先声明好的，而是被组合过程推出来的**。

### never 的三种语义

三个通道上出现 \`never\` 时含义完全不同，混淆它们是很多「为什么跑不起来」的根源：

| 位置 | 含义 | 直接后果 |
|---|---|---|
| Error = never | 不存在任何预期失败 | Effect.catch 无事可做，运行时只可能因缺陷或中断终止 |
| Requirements = never | 不需要任何外部服务 | Context 为空，可以直接交给 run* 系列运行 |
| Success = never | 永远不会正常返回 | 要么一直运行，要么最终失败；常见于守护型长任务 |

把 \`Error = never\` 理解成「不会崩溃」是典型误读：它只说没有**预期**失败，缺陷（die）与中断（interrupt）仍然可能发生，二者属于 Cause 而不是 E。这也解释了为什么 \`Effect.fail\` 产生的东西能进 E，而 \`Effect.die\` 产生的不能。

:::deep

### 为什么它「概念上像函数，实际上不是」

很容易把 \`Effect<A, E, R>\` 粗略想成 \`(context: R) => A | E\`，这个比喻在讲类型时够用，但在讲运行时会误导。函数一旦被调用就立即执行，返回值是执行结果；Effect 是一个**不可变的值**，每个算子都返回新的 Effect，原值永不被修改。正因为它是值，才能描述同步、异步、并发、带资源的计算，并被同一个运行时按指令解释。更实际的区别是可重复性：函数式比喻里「调用」与「执行」是一件事，而 Effect 里构造、组合、运行是三件事，中间可以插入任意多次变换。L01 已经用断言证明过同一蓝图能被运行两次，这里补上另一半结论：**能重复解释的前提，是这个值完整地保存了 A、E、R 三份契约，而不是只保存了一个 thunk**。丢了 E，重试就不知道该对谁生效；丢了 R，装配就不知道该补什么。

:::

:::warn

### 擦平类型的三种常见方式

第一种是把错误统一成 \`string\` 或 \`unknown\`，开头的事故属于此类，特点是编译器不报错、恢复逻辑静默失效。第二种是在边界处用 \`as any\` 把 R 抹掉，好让代码「先跑起来」，结果依赖变成隐式全局，测试里替换实现必须改一堆模块。第三种更隐蔽：为了让泛型推导简单，把整个程序标成 \`Effect.Effect<unknown, never, never>\`，看似干净，实际是把三份契约一次清空，下游所有恢复、装配、类型提取都失去依据。三者的共同症状是**代码仍能编译，但某类运行时能力不再工作**。排查时不要从恢复逻辑开始看，先回到程序声明处，检查三个通道是否还保留着具体信息；本课的最小模型断言可以直接搬进 CI，作为「不许擦平」的回归护栏。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 两段组合后 E 是联合、R 是并集 | 通道被某一层悄悄覆盖，后半段错误与需求丢失 |
| 恢复只消掉被声明处理的错误类型 | 恢复谓词过宽，把不可恢复的错误也吞了 |
| 组合与原值都未被修改 | 蓝图被就地改写，重复运行的结果不再一致 |
| \`Error = never\` 的程序仍能被中断 | 把「无预期失败」误当成「不可终止」 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L01 动机与起步 | 为什么先要有描述与执行两个动作 | 已拆开的惰性蓝图 |
| L03 组合的本质 | 类型沿链传播的具体路径、pipe 与 gen 的等价性 | 三通道按集合语义累积 |
| L06 类型累积 | 累积之后如何收敛、provide 为什么能消掉 R | 「恢复只收敛指定分支」这条规则 |

下一课开始动这三条链：既然组合会把类型推出来，那组合本身到底在做什么。
`,
    'triple',
    [
      {
        text: 'Effect<number, never, never> 说明什么？',
        options: ['可能失败但不需依赖', '一定成功且不需要任何服务', '永不返回', '需要 Db 服务'],
        answer: 1,
        explain: 'Error=never 表示无预期错误，Requirements=never 表示可以直接交给 run* 执行。',
        concept: 'three-channels',
      },
      {
        text: '关于 Effect 值的可变性，正确的是？',
        options: [
          'runPromise 会修改原值',
          '每个算子返回新的 Effect 值',
          'Effect.gen 会就地累加状态',
          'flatMap 会消费掉原值',
        ],
        answer: 1,
        explain: '不可变性让同一份蓝图可以被重试、并发、多次运行而不互相污染。',
        concept: 'laziness',
      },
    ],
    [
      ['协变', '类型参数在组合时可安全地向更宽的类型 widening'],
      ['Context<R>', '以服务键为索引的不可变服务集合'],
    ],
    ['看到 Success=never 以为是 void——void 是「成功但没有有用信息」，never 是「根本不会成功」。'],
  ),
  'theory',
)
