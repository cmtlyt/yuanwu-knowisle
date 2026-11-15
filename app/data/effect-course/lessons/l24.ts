import { L, withKind } from '../../course-builders.ts'

export const L24 = withKind(
  L(
    'L24',
    5,
    'Schedule：把重试策略变成值',
    3,
    ['L10'],
    ['schedule'],
    [
      '解释 Schedule 把重试策略变成可组合值的好处',
      '说清递归策略、抖动与上限的组合语义',
      '辨别 Schedule 与手写重试循环在可测试性上的差异',
      '判断一个策略该用循环还是组合子表达',
    ],
    `
### 手写重试循环改了三版，测试还是没覆盖全

一个同步接口里有段 \`while\` 重试：退避时间、最大次数、哪些错误该重试，全写在循环体里。每次改策略都要动这段循环，测试则靠 \`setTimeout\` 真等秒数，跑一轮要十几秒，于是大家渐渐不跑了。后来线上出现「重试间隔完全相等，把下游打成一排整齐的尖峰」，才发现问题不是参数没调好，而是**策略与执行时机焊死在同一个循环里**：想验证「第三次该等多久」必须真的运行三次。Schedule 把策略变成可独立检查的值，测试不再需要等待。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 策略作为值解决了什么，为什么不直接写循环 | 重试的分类与预算硬约束（L10）、Stream 背压（L23） |
| 固定、指数、抖动、次数上限怎么组合，组合后语义怎么变 | STM 事务与并发原语（L25） |
| 怎样用断言验证策略序列而不真的等待 | 生产落地检查单（L26） |

### 循环里的策略 vs 独立的策略值

| 维度 | 写在 while 里 | Schedule 值 |
|---|---|---|
| 可检查性 | 必须跑完才知道第 N 次等多久 | 直接展开成延迟序列 |
| 可测试性 | 依赖真实计时器，测试慢且 flaky | 纯数据断言，无需 sleep |
| 可组合性 | 改一处要动整个循环 | recurs / compose 等算子叠起来 |
| 复用 | 每个调用点复制一段 | 同一个策略值多处引用 |
| 与业务耦合 | 循环体里混着分类与上限 | 分类、预算仍由 L10 负责 |

最后一行必须说清：**Schedule 只管「什么时候再试」，不管「该不该试」**。L10 的分类谓词与总预算是硬约束，策略值再漂亮也不能把它们绕过。把两件事混在一个循环里，正是那三版越改越难测的原因。

### 真实写法

\`\`\` title="策略是可组合的值" note="Schedule.recurs 给次数上限，exponential 给退避，jittered 打散尖峰；compose 叠加。"
import { Effect, Schedule } from "effect"

declare const call: Effect.Effect<string, Error>

const base = Schedule.exponential("100 millis")
const bounded = Schedule.compose(Schedule.recurs(3), base)
const retried = Effect.retry(call, bounded)

// 抖动是策略层的另一个可叠加维度：Schedule.jittered
// 固定间隔同理可写成独立策略值：Schedule.fixed
\`\`\`

\`jittered\` 是那排整齐尖峰的解药：所有客户端按同样的指数序列重试，会在同一时刻齐刷刷打过来；加抖动把峰值摊开。这个改动只动策略值，业务调用与分类逻辑一行不改。

### 用断言检查策略序列

\`\`\` title="策略序列的最小模型" note="自包含程序，只依赖 node:assert；纯数据展开，不需要真实计时器。"
import assert from "node:assert/strict"

type Strategy = { readonly delays: number[]; readonly max: number }
const fixed = (ms: number, max: number): Strategy => ({
  delays: Array.from({ length: max }, () => ms),
  max,
})
const exponential = (base: number, max: number): Strategy => ({
  delays: Array.from({ length: max }, (_, i) => base * 2 ** i),
  max,
})
const jittered = (s: Strategy, seed: number): Strategy => ({
  delays: s.delays.map((d, i) => Math.round(d * (0.7 + ((seed + i * 37) % 6) / 20))),
  max: s.max,
})
// compose：次数上界取较小者，延迟序列按较短的截断
const compose = (a: Strategy, b: Strategy): Strategy => {
  const n = Math.min(a.max, b.max)
  return { delays: b.delays.slice(0, n), max: n }
}

const f = fixed(100, 3)
assert.deepEqual(f.delays, [100, 100, 100])
assert.equal(f.max, 3)

const e = exponential(100, 4)
assert.deepEqual(e.delays, [100, 200, 400, 800])
assert.equal(e.delays[3] / e.delays[0], 8, "指数增长可检查，无需等待")

const composed = compose(f, e)
assert.deepEqual(composed.delays, [100, 200, 400], "次数上界取较小者")
assert.equal(composed.max, 3)

// 抖动只改变时机，不改变次数与单调趋势
const j = jittered(e, 1)
assert.equal(j.delays.length, e.delays.length)
assert.ok(j.delays.every((d) => d > 0), "抖动不得产生非正延迟")
assert.notDeepEqual(j.delays, e.delays, "抖动确实打散了整齐尖峰")
assert.ok(new Set(j.delays).size >= 3, "不同轮次延迟有差异")
console.log("t1 通过：策略可纯数据展开、组合边界正确、抖动不改变次数")
\`\`\`

\`t1\` 里 \`compose\` 的断言最值得留意：两个策略叠加时**次数上界取较小者**，而不是相加。手写循环里很容易写成「先跑 3 次再跑 4 次」，预算悄悄翻倍，L10 的硬上限就形同虚设。第四条断言则钉住另一条边界：抖动只能改时间，不能改次数——否则「加了抖动」会顺手把重试次数也改了。

### 选型判据

| 情形 | 策略 | 理由 |
|---|---|---|
| 下游明确说「1 秒后可用」 | fixed | 可预期的固定间隔 |
| 未知故障、希望逐步退让 | exponential | 越久没好，越减少打扰 |
| 大量客户端同时重试 | jittered | 打散同步尖峰 |
| 只要 N 次、不管间隔 | recurs 与别的组合 | 次数是独立维度 |
| 瞬时错误分类不明 | 先回 L10 | 策略不负责该不该重试 |

:::deep

### 为什么「值是数据」比「少写代码」重要

把策略提成值，表面收益是代码短了、能复用；真正的收益是**它把时间这个副作用从测试里拿掉了**。手写循环里的 \`sleep(200)\` 对运行时是必要的，对验证「第三次间隔是不是 400 毫秒」却完全多余——你只需要一个数字。策略值让「什么时候再试」变成可展开的序列，测试从「等 1.5 秒再看结果」变成「断言数组等于 [100, 200, 400]」，既快又不 flaky。这与 L01 的蓝图、L19 的指令、L23 的流是同一个思路的第四次出现：**把本来隐含在执行过程中的东西显式变成数据，能力才可以被检查、被组合、被回归**。一门课里反复出现同一手法，不是巧合，而是这套运行时设计的核心。

:::

:::warn

### 三个策略组合上的坑

第一件是把次数上限写成相加，compose 两次之后实际重试次数翻倍，而 L10 的总预算是按「最多 3 次」申报的，配置与真实行为脱节。第二件是给每个调用点各自 new 一个策略实例，以为是「独立配置」，实际让抖动种子完全相同，所有客户端仍在同一毫秒重试，尖峰一点没散。第三件是在策略里顺手塞进错误分类，把「该不该试」混进「什么时候试」，结果 L10 的四条负例断言再也套不上去，改一个分类要动策略与循环两处。三者都不会报错，且都只在压测或真实流量下显现。排查顺序固定：先展开延迟序列看次数，再看抖动是否真的有差异，最后确认分类逻辑还在 L10 那一层。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 延迟序列可纯数据展开 | 测试仍需真实计时器，慢且 flaky |
| compose 后次数取较小上界 | 预算被叠加放大 |
| 指数序列比例正确 | 退避写成了等差 |
| 抖动不改变次数 | 加抖动顺手改了重试预算 |
| 分类逻辑不在策略里 | 「该不该试」与「何时试」混在一起 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L10 恢复与重试 | 分类、总预算与终止性 | 策略只负责时间间隔 |
| L23 Stream | 另一类「描述先于执行」 | 同一手法在流上的形态 |
| L26 渐进落地 | 老代码的 while 循环怎么替换 | 策略可独立断言，不改业务调用 |
`,
    'retry',
    [
      {
        text: 'Schedule.jittered 解决什么问题？',
        options: ['减少内存', '避免大量客户端同步重试造成风暴', '加快首次请求', '让错误类型变小'],
        answer: 1,
        explain: '随机扰动摊平重试峰值，保护刚恢复的下游。',
        concept: 'schedule',
      },
      {
        text: 'Effect.timeout 的实现基础是？',
        options: ['轮询时钟', 'race 一个定时器并中断原 fiber', '抛 JS 异常', '关闭 Scope'],
        answer: 1,
        explain: '建立在结构化中断之上，所以被中断任务的 finalizer 仍会执行。',
        concept: 'schedule',
      },
    ],
    [
      ['Schedule', '可组合的重复／退避策略值'],
      ['timeout', '基于竞速与中断的时间预算'],
    ],
    ['重试非幂等操作而不做去重，导致重复扣款／重复写入。'],
  ),
  'theory',
)
