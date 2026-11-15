import { L, withKind } from '../../course-builders.ts'

export const L10 = withKind(
  L(
    'L10',
    2,
    '恢复策略与重试边界',
    3,
    ['L09'],
    ['recovery', 'schedule'],
    [
      '实现 catchAll / catchSome / retry / timeout 的恢复链',
      '写出只对可重试错误生效的恢复谓词',
      '跑通「不可重试错误不消耗预算」的断言',
      '改造一段无限重试代码为有界策略',
    ],
    `
### 一个「加了重试」的接口把下游打挂了

支付回调偶发超时，有人给调用加了个无限重试，心想「总会成功」。结果下游限流后，重试把 QPS 抬到平时的六倍，超时更频繁，重试更密集，最后整个可用区被拖垮。复盘时争论的焦点是「重试次数该设成几」，但真正的问题在前面两步：**没有先判断这个错误值不值得重试，也没有给重试设一个可终止的预算**。L08 说缺陷不能恢复，L09 说 reasons 可逐条分类，这一课把两者合起来变成一个可运行、可断言的恢复链。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 恢复、重试、超时三者分别解决什么问题，边界在哪 | failure 与 defect 的分界（L08）、Cause 结构（L09） |
| 如何只对可重试错误生效，且让重试一定终止 | Schedule 策略的完整组合语义（L24） |
| 怎样用断言验证「预算不被不可重试错误消耗」 | 日志与追踪埋点（L11）、诊断决策表（L12） |

### 三个动作，三份契约

| 动作 | 输入 | 输出 | 最常见的误用 |
|---|---|---|---|
| 恢复（catch 类） | 某一个失败分支 | 一个新的程序 | 用通用恢复接住缺陷或中断 |
| 重试（retry） | 可重试策略 + 次数预算 | 同一程序被重新解释 | 不分类就重试，缺陷也被反复触发 |
| 超时（timeout） | 时间上限 | 超时错误进入 E | 与重试叠加时没有总预算，逐次放大 |

关键在「同一程序被重新解释」这一格：L01 已经证明蓝图可以重复运行，重试才有意义；如果拿到的是一次性执行结果，重试只是在读同一个失败。另一个容易被忽略的是**预算的归属**：次数预算应该只被「确实值得重试」的错误消耗，不可重试错误要立刻穿透，否则一次权限错误也会把预算烧光，掩盖后面真正的瞬时故障。

### 真实写法

\`\`\` title="分类、预算与总时限" note="Effect.catch 只处理预期失败；retry 配 Schedule.recurs 给出可终止的次数上限。"
import { Effect, Schedule } from "effect"

class Timeout extends Error {}
class Forbidden extends Error {}

declare const call: Effect.Effect<string, Timeout | Forbidden, never>

const isRetryable = (e: Timeout | Forbidden) => e instanceof Timeout

// 策略本身是可组合的值：次数上限与指数退避叠在一起
const policy = Schedule.compose(Schedule.recurs(3), Schedule.exponential("100 millis"))
const bounded = Effect.retry(call, policy)

const withDeadline = Effect.timeout(bounded, "2 seconds")
const recovered = Effect.catch(withDeadline, () => Effect.succeed("degraded"))
\`\`\`

\`Schedule.recurs(3)\` 让循环一定终止，\`isRetryable\` 把判断限定在错误类型上（实践中可作为重试选项或前置分类接入），\`timeout\` 给整条链一个总时限而不是单次时限。三层合起来才叫「有边界的重试」：只加其中任何一层，都能构造出打挂下游的场景。把策略写成可组合的值还有一个好处——L24 会看到退避、抖动、上限都能独立替换，而分类与总预算这两条硬约束始终不动。

### 把边界写成断言

\`\`\` title="恢复链的最小模型" note="自包含程序，只依赖 node:assert；验证分类、预算消耗与终止性。"
import assert from "node:assert/strict"

type Err = "timeout" | "forbidden" | "defect"
type Result = { ok: true; value: string } | { ok: false; error: Err }

const retryable = (e: Err): boolean => e === "timeout"
const runOnce = (script: readonly Result[]): (() => Result) => {
  let i = 0
  return () => script[Math.min(i++, script.length - 1)]!
}

type Attempt = { error: Err; usedBudget: boolean }
const boundedRetry = (run: () => Result, max: number): { final: Result; log: Attempt[] } => {
  const log: Attempt[] = []
  let left = max
  let current = run()
  while (!current.ok && left > 0) {
    const error = current.error
    if (!retryable(error)) {
      log.push({ error, usedBudget: false })
      return { final: current, log }
    }
    log.push({ error, usedBudget: true })
    left -= 1
    current = run()
  }
  return { final: current, log }
}

// 正例：两次瞬时超时后成功，预算消耗 2
const a = boundedRetry(runOnce([
  { ok: false, error: "timeout" },
  { ok: false, error: "timeout" },
  { ok: true, value: "done" },
]), 3)
assert.deepEqual(a.final, { ok: true, value: "done" })
assert.deepEqual(a.log.map((x) => x.usedBudget), [true, true])

// 负例 1：不可重试错误立刻穿透，且不消耗预算
const b = boundedRetry(runOnce([
  { ok: false, error: "forbidden" },
  { ok: true, value: "never" },
]), 3)
assert.deepEqual(b.final, { ok: false, error: "forbidden" })
assert.deepEqual(b.log, [{ error: "forbidden", usedBudget: false }])

// 负例 2：缺陷一律不重试
const c = boundedRetry(runOnce([{ ok: false, error: "defect" }]), 3)
assert.equal(c.log.length, 1)

// 负例 3：预算耗尽必须终止，不能无限循环
const d = boundedRetry(runOnce([{ ok: false, error: "timeout" }]), 3)
assert.equal(d.log.length, 3, "预算是硬上限")
assert.deepEqual(d.final, { ok: false, error: "timeout" })
console.log("t1 通过：分类生效、预算不被误耗、循环可终止")
\`\`\`

四条断言里前两条对应「只对可重试错误生效」，后两条对应「一定终止」。开头那次被打挂的下游，缺的正是第三条与第四条：缺陷与权限错误没有穿透，次数也没有上限。

### 从无限重试改造过来

\`\`\` title="无限循环改造前后" note="自包含程序；改造后把分类与预算从循环体里提出来，成为可测试的两个参数。"
import assert from "node:assert/strict"

const always: () => { ok: false; error: string } = () => ({ ok: false, error: "timeout" })

const before = (): string => {
  let n = 0
  while (n < 100_000) {
    n += 1
    if (always().ok) return "done"
  }
  return "gave up after " + n
}
assert.equal(before(), "gave up after 100000", "没有分类、只有硬编码上限")

const after = (max: number, canRetry: (e: string) => boolean): string => {
  for (let n = 0; n < max; n += 1) {
    const r = always()
    if (!canRetry(r.error)) return "not retryable: " + r.error
  }
  return "budget exhausted"
}
assert.equal(after(3, (e) => e === "timeout"), "budget exhausted")
assert.equal(after(3, () => false), "not retryable: timeout", "不可重试立即穿透")
console.log("t2 通过：分类与预算都成为显式参数")
\`\`\`

### 边界四问

| 问 | 不通过时的后果 |
|---|---|
| 这个错误重试一次会改变结果吗 | 权限错误、参数错误被反复重放 |
| 整条链的总时限是多少 | 单次超时乘以重试次数，实际远超预期 |
| 预算耗尽后返回什么 | 抛异常丢上下文，上层无法降级 |
| 缺陷和中断会不会进重试集合 | 空转，越取消越重启 |

:::deep

### 重试是对「同一个程序」的再解释，不是对「同一个请求」的再发送

这两句话在 HTTP 调用上看起来一样，在语义上完全不同。再解释一份蓝图意味着从描述层重新走一遍：可能重新读配置、重新取连接、重新判断路径；再发送一个请求则只是把已经构造好的副作用重复触发。前者能被超时、取消、降级统一治理，后者一旦启动就无法中途收回。这也解释了为什么把 \`runPromise\` 下沉到工具函数内部会毁掉重试（L07）：那之后上层手里只有一个 Promise，重试只能靠重复调用整个工具函数，等于把「再解释」降级成「再发送」，幂等键、上下文、预算全部要自己重新拼。L01 那条「描述与执行分离」的断言，到这里才显出它在生产里的真实价值。

:::

:::warn

### 三个不会在测试里暴露的重试坑

第一件是「while 判断写在重试之后」：先跑再判断，等于不可重试错误也至少被重放一次，恰好是幂等性最容易出事的那一次。第二件是给每个分支各自加超时，却没给整条链加总时限，三次重试各 2 秒，用户实际等 6 秒以上，压测只测单次所以看不出来。第三件是预算用共享计数器，多个并发请求一起消耗，一个慢请求把其它请求的次数吃光。三者都让「看起来有边界」的配置在真实流量下失效。排查时别只看配置里的次数，把 t1 的四条断言搬到集成测试里跑一遍：不可重试错误是否零次重放、预算用尽是否终止、总时限是否覆盖整条链。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 可重试错误消耗预算、不可重试不消耗 | 预算被无关错误烧光 |
| 缺陷与中断不进入重试集合 | 空转或反复触发 bug |
| 预算耗尽后循环终止 | 无限重试打挂下游 |
| 超时覆盖整条链而非单次 | 实际耗时远超预期 |
| 预算耗尽后返回可降级的结果 | 上层拿不到上下文，无法兜底 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L08 / L09 | 三类 reason 的分类依据 | 可重试谓词与有界预算 |
| L11 可观测性 | 每次重试的日志、trace 与失败报告 | 每次尝试都是可记录的事件 |
| L24 Schedule | 退避、抖动与策略组合的完整语义 | 预算与分类是策略之外的硬约束 |

### 重试配置的六项评审清单

| 检查项 | 怎么看 | 漏掉之后的表现 |
|---|---|---|
| 分类谓词是否只放行瞬时错误 | 权限错误、参数错误能否零次重放 | 幂等性事故，同一写操作被重放 |
| 预算是不是硬上限 | 用一条永远失败的输入跑到底 | 无限循环，下游被打挂 |
| 总时限是否覆盖整条链 | 单次超时乘以最大次数 | 用户等待远超 SLA |
| 预算是否按请求隔离 | 两个并发请求一起跑 | 慢请求吃掉其它请求的次数 |
| 预算耗尽后返回什么 | 上层能否拿到可降级的结论 | 抛异常丢上下文，无法兜底 |
| 中断与缺陷是否被排除 | 父级取消后任务会不会重启 | 越取消越重启的流量放大 |

六项里前三项通常会在配置评审时被问到，后三项最容易漏：预算隔离、耗尽后的返回值、中断排除，都属于「单请求测试完全正常、并发或缩容时才出问题」的类别。把 t1 的四条断言与这张表一起放进上线检查单，比在配置里反复调次数有用得多。开头那次把下游打挂的事故，逐项对照会同时踩中第一、第二、第四项——**任何一个单项修好都不足以阻止它，必须整条链都有边界**。

### 与后续模块的接缝

| 上游交付 | 下游怎么用 | 不允许改什么 |
|---|---|---|
| 可重试谓词 | L12 的诊断器输出 retry 决策 | 不把缺陷或中断放进白名单 |
| 有界预算 | L24 的退避策略在预算内替换 | 不因为换了策略就取消上限 |
| 每次尝试的记录 | L11 生成失败报告与告警级别 | 不在恢复后才记录，原始 Cause 会丢 |
`,
    'retry',
    [
      {
        text: '只想恢复 NotFound 这一种错误，用？',
        options: ['catchCause', 'catchTag("NotFound", ...)', 'catchDefect', 'Effect.exit'],
        answer: 1,
        explain: 'catchTag 按 _tag 精确恢复，并把它从 E 通道消除。',
        concept: 'recovery',
      },
      {
        text: 'Effect.retry 接受的是什么？',
        options: ['一个数字', '一份 Schedule 策略描述', '一个 Promise', '一个 Fiber'],
        answer: 1,
        explain: 'Schedule 是可组合的策略值，retry 只是在运行时解释它。',
        concept: 'schedule',
      },
    ],
    [
      ['Schedule', '描述重复／延迟／退避策略的不可变值'],
      ['jitter', '给重试间隔加随机扰动以避免同步重试风暴'],
    ],
    [
      '对 defect 做 retry——bug 不会因为重试而消失，只会放大流量。',
      '重试非幂等写操作，需要配合幂等键或去重。',
    ],
  ),
  'practice',
)
