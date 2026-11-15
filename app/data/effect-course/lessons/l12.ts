import { L, withKind } from '../../course-builders.ts'

export const L12 = withKind(
  L(
    'L12',
    2,
    'Cause 诊断实战：从 reasons 到恢复决策',
    4,
    ['L09', 'L10'],
    ['cause', 'recovery'],
    [
      '实现从 Cause reasons 提取恢复决策的诊断器',
      '写出缺陷 / 失败 / 中断三路分类程序',
      '跑通四条负例断言，验证不会把 defect 误判为可重试',
      '产出一份可直接落地的恢复决策表',
    ],
    `
### 诊断器说「可重试」，结果把 bug 重放了 200 次

故障演练里构造了一个混合失败：一次超时、一次权限不足、一次空指针。诊断器读完 Cause 只返回了「可重试」，重试器照办，空指针被反复触发 200 次，日志把磁盘写满。查下来逻辑并不复杂：诊断器先扫到一条超时的 Fail reason 就提前返回了，后面两条根本没看。**扁平 reasons 数组的价值是「不漏」，而诊断器把数组又当成了单个异常来读**，恰好把 L09 解决的问题重新引入了一遍。这一课把从 reasons 到恢复决策的整条路径写成可运行程序，并用负例把「漏判」钉死。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 怎样把一组 reasons 完整地映射成一条恢复决策，且不会漏掉任何一条 | Cause 为什么是扁平数组（L09）、failure / defect 分界（L08） |
| 为什么「只遍历已有记录」的校验会漏，怎样做双向比对 | 重试预算与退避策略（L10）、日志埋点（L11） |
| 如何用四条负例断言证明不会把 defect 或 Interrupt 判成可重试 | 生产告警分级与值班流程（S5） |

### 从 reason 到动作的完整映射

| reason | 判定依据 | 恢复动作 | 是否消耗重试预算 |
|---|---|---|---|
| Fail + 瞬时类 | 错误名在可重试白名单内 | 按策略重试 | 是 |
| Fail + 永久类 | 错误名在禁止名单内 | 立即降级，不重试 | 否 |
| Die | 任何缺陷 | 上报并尽快失败 | 否 |
| Interrupt | 父级取消 | 直接退出，不做任何恢复 | 否 |

一个容易忽略的规则：**多条 reason 同时存在时，动作取最保守的那一条**。只要含 Die 或 Interrupt，整次失败就不能判为可重试；只有全部 reason 都是瞬时 Fail 时才允许重试。这条「一票否决」比逐条投票更符合生产语义——一次并行调用里只要有一个 bug，重试整批就没有任何意义。

### 真实写法

\`\`\` title="在恢复前拿到完整 Cause" note="Effect.catchCause 是诊断入口；hasFails / hasDies 做分类，pretty 只进报告。"
import { Cause, Effect } from "effect"

declare const program: Effect.Effect<string, Error, never>

const diagnosed = Effect.catchCause(program, (c) => {
  const hasDefect = Cause.hasDies(c)
  const hasExpected = Cause.hasFails(c)
  return Effect.succeed({ hasDefect, hasExpected, report: Cause.pretty(c) })
})
\`\`\`

诊断必须发生在恢复之前。先用 \`Effect.catch\` 把失败折成兜底值，Cause 就已经不在了；这也是 L11 强调「先观察、再恢复」的原因。

### 诊断器实现与四条负例

\`\`\` title="从 reasons 到恢复决策" note="自包含程序，只依赖 node:assert；含错误版与双向比对修订版的对照。"
import assert from "node:assert/strict"

type Reason =
  | { kind: "Fail"; name: string }
  | { kind: "Die"; name: string }
  | { kind: "Interrupt" }
type Decision = "retry" | "degrade" | "report" | "exit"

const RETRYABLE = new Set(["timeout", "connection-reset"])
const FORBIDDEN = new Set(["forbidden", "invalid-argument"])

const classifyOne = (r: Reason): Decision => {
  if (r.kind === "Interrupt") return "exit"
  if (r.kind === "Die") return "report"
  return RETRYABLE.has(r.name) ? "retry" : FORBIDDEN.has(r.name) ? "degrade" : "report"
}

// 一票否决：只要有一条不是 retry，整批就不能重试
const decide = (reasons: readonly Reason[]): Decision => {
  if (reasons.length === 0) throw new Error("empty cause")
  const parts = reasons.map(classifyOne)
  if (parts.includes("exit")) return "exit"
  if (parts.includes("report")) return "report"
  if (parts.includes("degrade")) return "degrade"
  return "retry"
}

// 错误版校验：只遍历已经写好的决策记录，看起来合理却查不出「漏掉一条」
const records = new Map<string, Decision>()
records.set("r1", "retry")
const assertRecordsOnly = (ids: string[]) =>
  assert.ok(ids.every((id) => records.has(id)), "每条记录都有决策")
assertRecordsOnly(["r1"]) // 悄悄漏掉 r2 / r3 也能通过

// 修订版：双向比对 reason 集合与决策集合，两侧都不许多也不许少
const assertCovered = (reasons: readonly { id: string }[], decided: readonly string[]) => {
  const expected = new Set(reasons.map((r) => r.id))
  const actual = new Set(decided)
  for (const id of expected) assert.ok(actual.has(id), "漏判 reason: " + id)
  for (const id of actual) assert.ok(expected.has(id), "多余决策: " + id)
}

const tagged = [
  { id: "r1", kind: "Fail", name: "timeout" } as const,
  { id: "r2", kind: "Fail", name: "forbidden" } as const,
  { id: "r3", kind: "Die", name: "TypeError" } as const,
]
assertCovered(tagged, tagged.map((t) => t.id))
assert.throws(() => assertCovered(tagged, ["r1"]), /漏判 reason/, "修订版能抓到错误版漏掉的两条")

// 四条负例
assert.equal(decide([{ kind: "Fail", name: "timeout" }]), "retry")
assert.equal(decide([{ kind: "Fail", name: "timeout" }, { kind: "Fail", name: "forbidden" }]), "degrade")
assert.equal(decide([{ kind: "Fail", name: "timeout" }, { kind: "Die", name: "TypeError" }]), "report")
assert.equal(decide([{ kind: "Fail", name: "timeout" }, { kind: "Interrupt" }]), "exit")
console.log("t1 通过：一票否决生效、双向比对能抓漏判、四条负例全过")
\`\`\`

\`assertRecordsOnly\` 是这次事故的形状：它检查了「已有记录格式对不对」，没检查「该有的记录齐不齐」，所以对漏判完全无感。\`assertCovered\` 从 reason 与决策两侧各比对一次，缺一条或多一条都会失败。**一条规则如果有「不漏」的要求，校验就必须双向**，只从一侧遍历永远抓不到缺席的那一半。

### 恢复决策表（可直接落地）

| 输入组合 | 决策 | 上层动作 |
|---|---|---|
| 全为瞬时 Fail | retry | 交给 L10 的有界重试 |
| 含永久 Fail | degrade | 返回兜底值并记录原因 |
| 含 Die | report | 上报堆栈，不重试、不降级 |
| 含 Interrupt | exit | 立即退出，清理 finalizer |
| reasons 为空 | 抛错 | 诊断器不接受空 Cause，属于调用方 bug |

:::deep

### 为什么决策要做成纯函数

把 reasons 映射成决策这件事，完全可以内联在重试循环里写几个 if；但那样诊断逻辑就与运行时状态、计数器、日志切面缠在一起，无法单独测「超时 + 空指针」这种组合。做成纯函数之后，输入是一组数据、输出是一个枚举，所有边界组合都能用表驱动的方式枚举出来，本课四条负例只是其中四种。更重要的是它能被复用：L10 的重试器拿它决定要不要消耗预算，L11 的报告拿它生成告警级别，S4 的中断处理拿它决定要不要继续回收子 Fiber。**同一个诊断结论被多处消费时，它就必须是数据而不是流程里的一个分支**。这也是 L09 把 Cause 做成扁平数据的最终目的——让诊断可判定、可枚举、可回归。

:::

:::warn

### 三个让诊断器静默失真的写法

第一件是扫到第一条 reason 就 return，本课开头的事故；数组越长越容易漏，而且漏掉的恰好常常是更严重的 Die。第二件是校验只遍历已有决策记录，看起来每条都对，实际上「没生成的记录」根本不在遍历范围内；修订版的双向比对就是为它准备的。第三件是把 \`Cause.pretty\` 的产物当结构化输入，用字符串包含判断错误类型，日志文案一改，整张决策表就失效。三者都不会报错，且都只在混合失败路径上出现，happy path 与单一失败用例完全测不出来。因此诊断器的回归集至少要包含「多个 reason 同时存在」「含 Die」「含 Interrupt」「空 Cause」四类用例，t1 已覆盖前三类，最后一类由 \`decide\` 的抛错分支兜住。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 多条 reason 中任一条非瞬时即否决重试 | 缺陷或永久错误被重放 |
| 双向比对能抓出漏判 | 校验只查格式不查完整性 |
| Die 与 Interrupt 分别映射为 report / exit | 中断被当成可重试失败，形成空转 |
| 空 Cause 直接抛错 | 调用方吞掉了失败信息还继续跑 |
| 决策不依赖 pretty 文案 | 日志改版让诊断失效 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L09 Cause 结构 | 扁平 reasons 从哪来、为什么不丢 | 可枚举的 reason 集合 |
| L10 恢复与重试 | 拿到 retry 决策后怎么消耗预算 | 一票否决后的单一决策 |
| L11 可观测性 | 把决策与原始 Cause 写进报告 | 诊断发生在恢复之前 |

### S2 五课的复盘：一条失败信息走过的五站

| 站 | 课 | 把什么变成数据 | 交给下一站的东西 |
|---|---|---|---|
| 1 | L08 两类错误 | 预期失败与缺陷的分界 | 三类互不混淆的信号 |
| 2 | L09 Cause 结构 | 并行失败的完整集合 | 扁平、可枚举的 reasons |
| 3 | L11 可观测性 | 失败发生那一刻的上下文 | 带 traceId 的原始 Cause 报告 |
| 4 | L12 诊断实战 | reasons 到动作的映射 | 单一决策：retry / degrade / report / exit |
| 5 | L10 恢复与重试 | 决策到有界执行 | 可终止的重试与可降级的结果 |

复盘表里最值得记住的是第 3 站与第 4 站的顺序：诊断器必须拿到**恢复之前**的 Cause，否则第 2 站费尽力气保住的全部 reasons 会在第 5 站被一个兜底值抹平。五站合起来是一条完整的信息链，任何一站把数据变成「一句文案」或「一个布尔值」，后面就再也恢复不出细节。这也是整门课反复出现的判据：**能用数据表达的信息，不要提前压成结论**。

### 与 S3 的接缝

| S2 交付 | S3 怎么用 | 不允许改什么 |
|---|---|---|
| 单一恢复决策 | L17 的多 Layer 装配失败沿用同一套分类 | 不在装配层另写一套错误判断 |
| 原始 Cause 报告 | L16 的资源释放失败进同一条追踪链 | 不在 finalizer 里吞掉失败 |
| 双向比对校验 | L17 的依赖图完整性检查复用同一手法 | 不退化成「只遍历已有记录」 |

S2 到这里收口：分类、结构、恢复、观测、诊断五件事各自有了可运行的落点。S3 开始处理另一类问题——程序需要的外部服务从哪里来。
`,
    'cause',
    [
      {
        text: '一条 cause.reasons 里同时有 Fail 和 Die，正确处置是？',
        options: [
          '整条 retry 直到成功',
          '只对 Fail 恢复，Die 留在边界记录/上报',
          '直接吞掉 Die 当作成功',
          '抛出第一个 reason',
        ],
        answer: 1,
        explain:
          '缺陷（Die）不参与类型化恢复，应在边界处 catchDefect 记录并转成 5xx；只有可重试的 Fail 才进 retry。',
        concept: 'cause',
      },
      {
        text: '「数据库连接超时」这类可重试失败，最合适的恢复算子是？',
        options: [
          'Effect.die',
          'Effect.retry（配 Schedule）',
          'Effect.catchCause 后返回默认值',
          'Effect.interrupt',
        ],
        answer: 1,
        explain:
          '可重试的预期错误用 retry + Schedule（退避/抖动/次数上限）；catchCause 返回默认值会掩盖真实故障。',
        concept: 'recovery',
      },
      {
        text: '为什么「对中断（Interrupt）做 retry」通常没有意义？',
        options: [
          'Interrupt 会再次被同一取消信号中断',
          'retry 会吞掉所有错误',
          '中断不能被捕获',
          'retry 不支持中断',
        ],
        answer: 0,
        explain:
          '中断是「用户/系统要求停止」，重试一个被要求停止的任务只会立刻再次被中断；正确做法是响应取消而非重试。',
        concept: 'recovery',
      },
    ],
    [
      ['诊断三步法', 'squash → 分类 reasons → 按类型选恢复'],
      ['Fail / Die / Interrupt', 'Cause 中三类 reason 及其恢复边界'],
    ],
    [
      '不看 reasons 一律 retry，把缺陷也反复重试，放大流量与故障。',
      '用 catchCause 把缺陷吞成「成功返回默认值」，掩盖了真实的 bug。',
    ],
  ),
  'practice',
)
