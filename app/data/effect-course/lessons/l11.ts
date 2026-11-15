import { L, withKind } from '../../course-builders.ts'

export const L11 = withKind(
  L(
    'L11',
    2,
    '可观测性：日志、追踪与失败报告',
    2,
    ['L10'],
    ['observability'],
    [
      '接入日志、span 与失败报告三类可观测信号',
      '写出带 traceId 的最小追踪包装并跑通',
      '实现失败时自动附带 Cause 报告的函数',
      '验证埋点不改变业务结果类型',
    ],
    `
### 一条「成功」日志背后丢了三次失败

线上有个批处理任务显示「执行成功」，但产出文件是空的。查了两天才发现：任务内部三次失败都被恢复逻辑兜住了，每次都返回兜底值继续跑，而日志只在最外层打了一行开始与一行结束。中间发生了什么、被哪一层恢复、原始 Cause 是什么，全部没有留下。事后加监控时团队才发现一个尴尬的事实：**不是没有日志，而是日志打在了错误的位置**——埋点跟着流程走，没跟着失败走。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 日志、span、失败报告三类信号各自该挂在链的哪一层 | failure / defect 的分类（L08）、Cause 结构（L09） |
| 怎样让埋点不改变业务结果类型，又能带上 traceId 与原始 Cause | 重试预算与策略（L10）、从 reasons 生成决策表（L12） |
| 如何用断言证明「埋点不丢信息、不改变语义」 | 生产级 tracing 后端与采样配置（S5 落地部分） |

### 三类信号，三个挂载点

| 信号 | 回答的问题 | 应挂的位置 | 常见错误 |
|---|---|---|---|
| 日志（log） | 这一步发生过吗 | 每个有意义的业务步骤前后 | 只在最外层打开始 / 结束 |
| span（追踪） | 这次调用属于哪条链路 | 运行边界处创建，随上下文传播 | 每个函数各建一个 traceId，链路断裂 |
| 失败报告（Cause） | 到底失败在哪、原始原因是什么 | 恢复动作发生之前 | 恢复后再打日志，原始 Cause 已被改写 |

第三行是开头事故的根因：恢复算子把失败变成兜底值之后，再想记录「原来为什么失败」已经晚了。正确顺序是**先观察、再恢复**——在 \`catchCause\` 这一类入口里拿到的 Cause 还是原始的，pretty 输出能带上全部 reasons；一旦先用 \`catch\` 折成普通值，这些信息就永久丢了。

### 真实写法

\`\`\` title="埋点挂在业务链上，不进结果类型" note="Effect.tap 的回调返回 Effect，但主链的成功值保持不变；catchCause 在恢复前拿到原始 Cause。"
import { Cause, Effect } from "effect"

const program = Effect.gen(function* () {
  yield* Effect.log("import started")
  const n = yield* Effect.tap(Effect.succeed(42), (v) => Effect.log("got " + v))
  return n
})

const withReport = Effect.catchCause(program, (c) =>
  Effect.succeed("reported: " + Cause.pretty(c)),
)
\`\`\`

注意 \`Effect.tap\` 里那个回调的返回值不会替换主链的值：日志是旁路，不是变换。把 \`tap\` 写成 \`map\` 并顺手返回日志字符串，是这一步最常见的自伤——业务结果被换成了日志文本，类型检查往往放行，因为两者都是字符串。

### 可运行断言：埋点不改变语义

本课是 26 课里唯一没有交互演练的一节，交付物就是下面这个自包含的追踪包装与断言集。它把「不丢信息」和「不改变结果」两条约束写成可执行的检查。

\`\`\` title="traceId 包装与埋点断言" note="自包含程序，只依赖 node:assert；模拟 span 传播、旁路日志与失败报告。"
import assert from "node:assert/strict"

type Span = { traceId: string; name: string; parent?: string }
type Outcome<A> = { ok: true; value: A; spans: Span[] } | { ok: false; cause: string; spans: Span[] }

const withSpan = <A>(
  traceId: string,
  name: string,
  run: () => { ok: boolean; value?: A; cause?: string },
  log: (line: string) => void,
): Outcome<A> => {
  const span: Span = { traceId, name }
  log("enter " + name + " trace=" + traceId)
  const result = run()
  const spans = [{ ...span }, { traceId, name: name + ".end", parent: name }]
  log(result.ok ? "exit " + name + " ok" : "exit " + name + " failed")
  return result.ok
    ? { ok: true, value: result.value as A, spans }
    : { ok: false, cause: result.cause ?? "unknown", spans }
}

const lines: string[] = []
const success = withSpan("t-1", "import", () => ({ ok: true, value: 42 }), (l) => lines.push(l))
assert.ok(success.ok && success.value === 42, "埋点不能改变成功值")
assert.equal(success.spans.length, 2)
assert.equal(success.spans[0]!.traceId, success.spans[1]!.traceId, "同一链路 traceId 必须一致")

const failure = withSpan("t-2", "fetch", () => ({ ok: false, cause: "timeout + forbidden" }), (l) => lines.push(l))
assert.ok(!failure.ok)
assert.equal(failure.cause, "timeout + forbidden", "原始 Cause 必须原样保留，不能被折叠成兜底文案")
assert.ok(lines.includes("enter import trace=t-1") && lines.includes("exit fetch failed"))

// 旁路日志：记录次数不影响返回值
const observed: number[] = []
const withLog = <A>(value: A, sink: (v: A) => void): A => {
  sink(value)
  return value
}
assert.equal(withLog(7, (v) => observed.push(v)), 7, "tap 等价于旁路，不是 map")
assert.deepEqual(observed, [7])
console.log("t1 通过：埋点不改结果、span 不断链、Cause 不被改写")
\`\`\`

第三条断言最容易被跳过：如果失败报告里存的是「服务暂时不可用」这类兜底文案，而不是原始 reasons，L12 的诊断器就没有输入。把「原始 Cause 原样保留」写成断言，比在代码评审里反复强调更可靠。

### 埋点检查清单

| 检查 | 失败时说明什么 |
|---|---|
| 每个业务步骤前后各有一条日志 | 中间恢复过程完全不可见 |
| 同一次调用的所有 span 共享 traceId | 链路断裂，无法串联因果 |
| 成功值在埋点前后逐字一致 | 把 tap 写成 map，业务结果被日志替换 |
| 失败报告里是原始 Cause 而非兜底文案 | 恢复后信息丢失，无法诊断 |
| 日志里不含敏感字段 | 可观测性变成数据泄漏面 |

:::deep

### 为什么可观测性必须写在描述层

一个反直觉的结论：把 \`console.log\` 塞进回调里，看似最直接的埋点，实际最难用好。因为它发生在「执行」那一刻，拿不到程序的结构信息——不知道这一步在链上的位置、不知道父 span、也不知道这次失败会不会被上层恢复。写在描述层的埋点则是一个**算子**：它接收一个程序、返回一个带观测语义的新程序，天然知道自己在链中的位置，也能随组合一起被复制、被取消、被回放。更实际的好处是可测试：本课的最小模型把日志收进一个数组，就能断言「Enter 与 Exit 成对」「traceId 一致」；如果日志直接打在回调里，这类断言只能靠抓 stdout，脆弱且难维护。**可观测性不是打印语句，是关于程序的一组可验证元数据。**

:::

:::warn

### 三个让监控失真的埋点写法

第一件是恢复之后再打日志，开头的事故属于此类；症状是错误率曲线很好看、产出却不对。第二件是每个函数内部各自生成 traceId，日志量充足但链路拼不起来，排查时只能靠时间戳猜因果。第三件是把 span 信息拼进业务返回值里，比如返回对象多带一个 \`_trace\` 字段，结果下游 schema 校验开始失败，而这类字段一旦进入持久化数据就很难清掉。三者的共同点是**埋点侵入了业务契约**。纠偏的顺序固定：先把观测动作从回调函数挪到描述层的算子，再把 traceId 放进出参之外的上下文，最后补一条「成功值在埋点前后一致」的回归断言。t1 已经覆盖前两步的验收点。

:::

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L09 Cause 结构 | 报告里那个 Cause 内部长什么样 | 原始 Cause 必须原样保留 |
| L12 诊断实战 | 从 reasons 生成完整的恢复决策表 | 报告是诊断器的输入 |
| L26 渐进落地 | 生产环境的采样、导出与后端对接 | 埋点不改业务契约这条约束 |

### 一次「日志齐全却查不出原因」的排障回放

| 步骤 | 当时手上有什么 | 缺的是哪一层 |
|---|---|---|
| 看最外层日志 | 开始与结束两行，状态成功 | 业务步骤级日志，中间恢复不可见 |
| 看错误率曲线 | 全部为 0，因为失败被兜底 | 失败发生在恢复之前，没被计数 |
| 想串联链路 | 每个函数各自生成 traceId | 运行边界处统一创建并传播的 span |
| 想拿原始错误 | 只剩「服务暂时不可用」文案 | catchCause 里的原始 Cause |
| 补埋点后复现 | 三次失败、各自的 reason、同一 traceId | 一次就能定位到根因 |

这张表值得按倒序读：最后一步能一次定位，是因为前面四层信号都在；而当时团队花了两天，恰恰是因为只保留了最外层那两行。**可观测性的成本不在日志量，而在挂载点**——把一行日志从「最外层」挪到「每个恢复动作之前」，信息量会差一个数量级，日志条数只多几条。开头那次产出为空却显示成功，缺的从来不是更详细的日志文案，而是失败发生那一刻的记录。

### 与后续模块的接缝

| 上游交付 | 下游怎么用 | 不允许改什么 |
|---|---|---|
| 原始 Cause 报告 | L12 的诊断器逐条分类 reasons | 不把报告折成兜底文案 |
| 统一 traceId | S4 的多 Fiber 链路追踪 | 不在子任务里另起 traceId |
| 旁路日志算子 | L26 接入生产 tracing 后端 | 不把观测字段塞进业务返回值 |
`,
    null,
    [
      {
        text: 'fiber 局部的日志／追踪配置如何传给子 fiber？',
        options: ['手动逐层传参', '由运行时沿 fiber 继承，退出局部作用域自动还原', '写全局变量', '无法传播'],
        answer: 1,
        explain: '这正是结构化并发带来的可观测性红利。',
        concept: 'observability',
      },
      {
        text: '输出完整 Cause 报告用？',
        options: ['JSON.stringify', 'Cause.pretty', 'Effect.map', 'Fiber.join'],
        answer: 1,
        explain: 'Cause.pretty 会遍历 reasons 并格式化堆栈与中断信息。',
        concept: 'observability',
      },
    ],
    [
      ['Context.Reference', 'v4 中承载 fiber 局部配置与状态的引用类型'],
      ['span', '一次有起止与父子关系的追踪单元'],
    ],
    ['在并发任务里用模块级变量记录请求 ID，导致日志串线。'],
  ),
  'practice',
)
