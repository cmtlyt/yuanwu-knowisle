import { L, withKind } from '../../course-builders.ts'

export const L09 = withKind(
  L(
    'L09',
    2,
    'Cause 的底层结构：扁平 reasons 数组',
    4,
    ['L08'],
    ['cause'],
    [
      '解释 Cause 作为扁平 reasons 数组的结构及其相对树形结构的优势',
      '说清 Fail / Die / Interrupt 三类 reason 的组合规则',
      '读懂 pretty 输出与 Cause 结构之间的对应关系',
      '辨别并行失败合并时 reasons 的排列语义',
    ],
    `
### 一次并行失败只报出了第一个错误

批量导入里有三个请求同时失败，日志里却只留下第一条「超时」，另外两条被吞了。排查并发恢复逻辑时发现，代码把失败当成单个异常值处理，\`catch\` 里读到的永远是「最先到达的那一个」。可实际发生的是三件事：一个超时、一个权限不足、一个被父级中断——它们的处理动作完全不同。Effect 用 Cause 把这次失败表示成**扁平的 reasons 数组**，而不是一个层层嵌套的异常树。这一课拆开这个结构，看它为什么能同时保住「不漏」与「可分类」。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| Cause 为什么是扁平 reasons 数组，三类 reason 各自代表什么 | failure 与 defect 的语义分界（L08） |
| 并行失败合并时信息怎么不丢，pretty 输出与结构如何对应 | 恢复谓词与重试预算（L10）、日志埋点（L11） |
| 怎样用断言验证合并、分类与「不漏」 | 诊断器从 reasons 到恢复决策（L12） |

### 三类 reason，一张扁平表

v4 的 Cause 不再用树形结构表达失败，而是维护一个扁平的 reasons 集合。每个 reason 只有三种基本形态：

| reason | 含义 | 典型来源 |
|---|---|---|
| Fail | 一个预期失败，携带 E 里的具体错误 | Effect.fail、tryPromise 的 catch |
| Die | 一个缺陷，携带原始异常与堆栈 | 未捕获异常、Effect.die |
| Interrupt | 被父级或外部中断，携带 fiber 信息 | 作用域关闭、显式中断 |

扁平化的直接好处是**合并不会丢信息**：两个并发分支各自失败时，把两边的 reasons 拼起来即可，不需要决定「谁包住谁」。树形结构里这个决定不可避免，而一旦选了主次，恢复逻辑往往只处理根节点，子节点就被忽略了——开头那次只报一条超时，正是这个模型的后果。

| 结构 | 并行失败合并 | 恢复逻辑的可见范围 |
|---|---|---|
| 嵌套异常树 | 必须选一个作为根，其余变成 suppressed | 通常只看根，容易漏 |
| 扁平 reasons | 直接拼接数组 | 可以逐条分类，逐条处理 |

### 真实写法

\`\`\` title="Cause 的组合与检查" note="Cause.combine 合并两次失败；hasFails / hasDies 是分类入口，pretty 供人读。"
import { Cause, Effect } from "effect"

const timeout = Cause.fail(new Error("timeout"))
const defect = Cause.die(new Error("TypeError"))
const mixed = Cause.combine(timeout, defect)

console.log(Cause.hasFails(mixed), Cause.hasDies(mixed))
console.log(Cause.pretty(mixed))
const inspected = Effect.catchCause(Effect.fail(new Error("timeout")), (c) =>
  Effect.succeed(Cause.pretty(c)),
)
\`\`\`

\`Cause.pretty\` 是给人看的，程序里的分类判断要靠 \`hasFails\` / \`hasDies\` 这类谓词。把 pretty 字符串拿去做 \`includes('timeout')\` 判断，是这一步最常见的反模式：文案一改，恢复逻辑就失效。

### 用断言验证「合并不丢、分类不混」

\`\`\` title="扁平 reasons 的最小模型" note="自包含程序，只依赖 node:assert；模拟合并、分类与逐条恢复决策。"
import assert from "node:assert/strict"

type Reason =
  | { kind: "Fail"; name: string; retryable: boolean }
  | { kind: "Die"; name: string }
  | { kind: "Interrupt"; fiberId: number }

type Cause = { reasons: readonly Reason[] }
const cause = (...reasons: Reason[]): Cause => ({ reasons })

// 扁平合并：两边 reasons 直接拼接，不建立父子关系
const combine = (a: Cause, b: Cause): Cause => ({ reasons: [...a.reasons, ...b.reasons] })

const hasFails = (c: Cause) => c.reasons.some((r) => r.kind === "Fail")
const hasDies = (c: Cause) => c.reasons.some((r) => r.kind === "Die")
const isInterrupted = (c: Cause) => c.reasons.some((r) => r.kind === "Interrupt")

const left = cause({ kind: "Fail", name: "timeout", retryable: true })
const right = cause(
  { kind: "Fail", name: "forbidden", retryable: false },
  { kind: "Die", name: "TypeError" },
)
const merged = combine(left, right)

assert.equal(merged.reasons.length, 3, "合并必须保留全部 reasons，不能只留第一条")
assert.ok(hasFails(merged) && hasDies(merged), "两类信号可同时存在")
assert.equal(isInterrupted(merged), false)

const interrupted = combine(merged, cause({ kind: "Interrupt", fiberId: 7 }))
assert.equal(interrupted.reasons.length, 4, "中断也是一条独立 reason")
assert.ok(isInterrupted(interrupted))

// 逐条决策：只有可重试的 Fail 进入重试集合，其余不许混入
const retryable = interrupted.reasons
  .filter((r) => r.kind === "Fail" && r.retryable)
  .map((r) => (r.kind === "Fail" ? r.name : ""))
assert.deepEqual(retryable, ["timeout"], "缺陷、不可重试失败、中断都不该被重试")
console.log("t1 通过：flatten 不漏、分类不混、逐条决策")
\`\`\`

第一条断言是这课的 Hard 判据：如果合并后 reasons 长度小于输入之和，说明某个分支被压成了「次要错误」，L12 的诊断器再怎么写都找不回来。最后一条断言则把三类 reason 的处理动作彻底分开，与 L08 的「缺陷不许被恢复」形成同一条规则的两个视角。

:::deep

### 扁平结构为什么更适合自动化决策

树形异常擅长表达「由什么引起什么」，适合人阅读堆栈；但程序要做的是**逐条分类并决定动作**，这时层级反而是负担：每多一层嵌套，恢复逻辑就要多写一段递归展开，且很容易在某一层提前 return。扁平数组把「这次失败一共包含哪几件事」直接摆出来，恢复谓词可以对每条 reason 独立判断，再汇总成「重试 / 降级 / 上报 / 不动作」四类动作。更重要的是它天然支持并行：多个 Fiber 同时失败时合并只是数组拼接，不存在谁覆盖谁。L12 会从 reasons 反向生成恢复决策表，那个诊断器之所以能写成纯函数，前提就是 Cause 已经是扁平的、可枚举的、不带隐式优先级的数据。

:::

:::warn

### 三个与 Cause 有关的误用

第一件是拿 \`Cause.pretty\` 的输出做字符串判断，文案改一个词，恢复分支就整体失效；分类必须用谓词，pretty 只给人和日志用。第二件是只处理合并后的第一条 reason，等于把扁平结构又退化成「单异常」模型，开头那次只报超时就是这么来的。第三件是把 Interrupt 当成普通 Fail 去重试，父级明明已经取消，子任务却因重试不断重启，形成流量放大。三者都不会报错，且都在并行或取消路径上才出现，串行 happy path 完全测不到。因此 Cause 相关的回归必须包含一条「多个 reason 同时存在」的用例，以及一条「含 Interrupt」的用例，t1 已经把两条都钉住了。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 合并后 reasons 数等于输入之和 | 某个并行失败被压成次要错误 |
| Fail / Die / Interrupt 可同时存在且能分别识别 | 分类被合并，处理动作无从区分 |
| 只有可重试的 Fail 进入重试集合 | 缺陷或中断被误重试 |
| 分类不依赖 pretty 文案 | 日志改版会让恢复逻辑失效 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L08 两类错误 | failure 与 defect 的语义分界 | Fail / Die / Interrupt 三类 reason |
| L10 恢复与重试 | 按 reason 挑出可重试分支并设预算 | 扁平、可枚举的 reasons 数组 |
| L12 诊断实战 | 从 reasons 生成完整恢复决策表 | 「不漏、不混、可逐条处理」 |
`,
    'cause',
    [
      {
        text: 'v4 中一个 Cause 如何表达「两个并发任务同时失败」？',
        options: [
          'Parallel 节点套两个子节点',
          'reasons 数组里放两个 Fail reason',
          '只保留最后一个错误',
          '抛出聚合异常',
        ],
        answer: 1,
        explain: '扁平结构把并发与顺序失败统一收集到 reasons 数组，用 Cause.combine 合并。',
        concept: 'cause',
      },
      {
        text: '判断「这个 Cause 是否含有缺陷」用哪个？',
        options: [
          'Cause.isDieReason(cause)',
          'Cause.hasDies(cause)',
          'cause.reasons.length',
          'Exit.isFailure',
        ],
        answer: 1,
        explain: 'hasDies 是 Cause 级谓词；isDieReason 用来收窄数组中的单个 reason。',
        concept: 'cause',
      },
    ],
    [
      ['Reason', 'Cause 数组中的单个失败事实：Fail / Die / Interrupt'],
      ['无损失败', '不丢弃并行失败、finalizer 失败与中断来源'],
    ],
    [
      '把 Cause 当成单个 Error 对象，只取第一个 reason。',
      '用 cause._tag 去 switch——v4 应遍历 cause.reasons。',
    ],
  ),
  'theory',
)
