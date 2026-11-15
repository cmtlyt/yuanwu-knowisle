import { L, withKind } from '../../course-builders.ts'

export const L08 = withKind(
  L(
    'L08',
    2,
    '两类错误：failure 与 defect',
    2,
    ['L07'],
    ['typed-error', 'defect'],
    [
      '区分 failure（预期、类型化）与 defect（缺陷、不可恢复）',
      '解释 die 与 interruption 在 Cause 里的位置',
      '说清为什么 catchAll 不该吞掉 defect',
      '判断一个异常该建模成 E 还是 Die',
    ],
    `
### 告警里全是「数据库不可用」，实际只有一次是真的

某次故障复盘发现，一周内 37 条「数据库不可用」告警里只有 1 条真正来自数据库；其余 36 条是同一个空指针缺陷被通用恢复逻辑兜住后，重新抛成「服务暂时不可用」的文案。根因是把两类性质完全不同的失败合并处理了：**预期失败（failure）是业务上知道会发生的分支，缺陷（defect）是程序写错了**。前者可以降级、重试、给用户提示；后者应该暴露、上报、修代码。把它们塞进同一条恢复路径，短期看错误率下降，长期看监控失去意义。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| failure 与 defect 在类型层、运行时行为、处理动作上的三条分界 | Cause 内部 reasons 怎么组织（L09）、重试策略怎么组合（L10） |
| 为什么 E 通道里看不到缺陷，以及 catch 类算子分别接哪一类 | Layer 装配失败的归类（S3）、可观测埋点（L11） |
| 怎样用断言证明恢复逻辑没有吞掉缺陷 | Exit 折叠与运行边界（L07） |

### 两条通道，三种处理方式

| 维度 | failure（预期失败） | defect（缺陷） |
|---|---|---|
| 来源 | Effect.fail、tryPromise 的 catch 映射 | 未捕获异常、Effect.die |
| 类型位置 | 出现在 E 联合里，编译期可见 | 不出现在 E 里，属于 Cause 的 Die |
| 语义 | 「这件事没办成，但系统正常」 | 「程序有 bug，结果不可信」 |
| 恢复动作 | 按错误类型降级、重试、返回兜底 | 记录堆栈、告警、尽快失败 |
| 被通用恢复接住时 | 合理 | 危险：把 bug 伪装成可恢复故障 |

表里最关键的是第二行：**E 是预期失败的穷举集合，不包含缺陷**。所以 \`Error = never\` 只表示「没有预期失败」，绝不表示「不会崩」。L02 提过这一点，这里补上它的后果：凡是试图用恢复算子去接缺陷的代码，都接不到；能接到的只有专门面向缺陷的算子。

### 真实写法

\`\`\` title="两类失败各自的入口与处理" note="Effect.catch 处理 E 通道；缺陷要走 Effect.catchDefect，两者不能互相替代。"
import { Effect } from "effect"

class NotFound extends Error {}
class DbDown extends Error {}

// 预期失败：进 E 通道，可被恢复算子按类型挑出来
const expected = Effect.fail(new NotFound("missing"))
// 缺陷：不属于 E，会进入 Cause 的 Die
const defect = Effect.die(new Error("unexpected"))

const recovered = Effect.catch(expected, () => Effect.succeed("fallback"))
const defended = Effect.catchDefect(defect, () => Effect.succeed("reported"))
\`\`\`

注意 \`recovered\` 与 \`defended\` 用的是两个不同的算子。把它们合并成一个「万能 catch」正是开头事故的写法：缺陷被兜住后返回一个看似正常的兜底值，调用方无从分辨这次结果到底可不可信。

### 把分界变成断言

\`\`\` title="failure 与 defect 分类的最小模型" note="自包含程序，只依赖 node:assert；验证通用恢复不会误吞缺陷。"
import assert from "node:assert/strict"

type Signal =
  | { kind: "failure"; name: string }
  | { kind: "defect"; name: string }
  | { kind: "interrupted" }

const classify = (s: Signal): "recoverable" | "bug" | "cancelled" => {
  switch (s.kind) {
    case "failure":
      return "recoverable"
    case "defect":
      return "bug"
    default:
      return "cancelled"
  }
}

// 通用恢复只能处理可恢复分支；缺陷必须原样上报
const recover = (s: Signal): string => {
  const verdict = classify(s)
  if (verdict === "bug") throw new Error("defect must not be swallowed: " + s.name)
  if (verdict === "cancelled") return "cancelled"
  return "fallback"
}

assert.equal(recover({ kind: "failure", name: "DbDown" }), "fallback")
assert.throws(() => recover({ kind: "defect", name: "TypeError" }), /must not be swallowed/)
assert.equal(recover({ kind: "interrupted" }), "cancelled", "中断不能被当成可重试失败")

const signals: Signal[] = [
  { kind: "failure", name: "DbDown" },
  { kind: "defect", name: "TypeError" },
  { kind: "interrupted" },
]
const verdicts = signals.map(classify)
assert.deepEqual(verdicts, ["recoverable", "bug", "cancelled"], "三类信号必须可区分")
console.log("t1 通过：预期失败可恢复、缺陷必须上报、中断不重试")
\`\`\`

第二条断言对应开头 36 条误报告警：如果 \`recover\` 对 defect 也返回 fallback，缺陷就被静默吞掉，监控里只会看到一条「服务暂时不可用」。把这条断言放进测试，等于给「不许写万能 catch」加了一道硬护栏。

:::deep

### 为什么缺陷不该进 E 通道

一个常见疑问是：既然都要处理，为什么不把缺陷也写进 E，让类型统一？因为 E 的价值在于**可穷举**：编译器能列出所有预期失败，恢复逻辑可以逐一声明「这一类我怎么处理」。缺陷恰恰不可穷举——任何空指针、越界、断言失败都算，写进 E 之后这个联合类型会变成 \`Error | unknown\`，穷举性立刻归零，恢复谓词再也写不出有意义的分支。更实际的是责任归属不同：预期失败属于业务流程，产品可以决定降级文案；缺陷属于代码质量问题，正确处理是修代码而不是重试。把它塞进 E，等于让业务流程替代码 bug 背书。L09 会看到 Cause 用独立的 Die reason 承载它，正是为了保住 E 的穷举性。

:::

:::warn

### 三个把缺陷伪装成失败的写法

第一件是通用恢复里不加分类，直接返回兜底值，本课的开头事故；症状是告警文案单一、错误率虚低。第二件是在 catch 里把未知异常映射成一个领域错误，看似「统一了错误类型」，实际是把不可恢复的 bug 标成了可重试分支，重试会反复触发同一个空指针。第三件是把 \`Error = never\` 理解成「这段程序不会失败」，于是既不加缺陷上报也不加超时，缺陷发生时直接冒泡到最外层，连上下文都没有。三者都不会被类型检查拦下，共同点是**失败信息被改写过一次**。排查时不要只看最终错误文案，要回到第一次分类的位置，确认那次改写有没有保留原始信号。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| failure 与 defect 分类结果不同 | 两类失败被合并，恢复粒度丢失 |
| 通用恢复遇到 defect 必须抛出 | 万能 catch 吞了 bug，监控失真 |
| 中断不被当成可重试失败 | 越取消越重启的空转 |
| E 联合里不出现缺陷类型 | 穷举性被 unknown 破坏 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L04 构造子全景 | 哪些入口产出 failure、哪些会变成 defect | 具名的预期失败类型 |
| L09 Cause 结构 | Die / Fail / Interrupt 在 reasons 里怎么组织 | 三类信号必须可区分 |
| L10 恢复与重试 | 只对可重试的 failure 生效 | 「缺陷不许被恢复」这条硬约束 |
`,
    'cause',
    [
      {
        text: '「用户余额不足」应建模为？',
        options: ['Effect.die', 'E 通道中的 typed error', '直接抛异常', 'Success 里的 null'],
        answer: 1,
        explain: '调用方需要据此走不同业务流程，属于可恢复的领域错误。',
        concept: 'typed-error',
      },
      {
        text: '哪个算子能看到缺陷和中断？',
        options: ['Effect.catch', 'Effect.catchTag', 'Effect.catchCause', 'Effect.mapError'],
        answer: 2,
        explain: 'catchCause 接收完整 Cause，包含 Fail / Die / Interrupt 三类 reason。',
        concept: 'defect',
      },
    ],
    [
      ['failure', 'E 通道里的预期错误'],
      ['defect', 'Cause 里的意外错误，不参与类型化恢复'],
    ],
    ['把「不可能发生」的状态用 Effect.fail 建模，逼调用方写永远用不上的恢复分支。'],
  ),
  'theory',
)
