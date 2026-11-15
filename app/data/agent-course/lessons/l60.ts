import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 9 ========== */

export const L60 = withKind(
  L(
    'L60',
    9,
    '实战：实现 Plan-and-Execute 引擎（含动态重规划钩子）',
    3,
    ['L59', 'L15'],
    ['pe-engine'],
    [
      '用 TypeScript 实现「规划 → 执行 → 判定 → 重规划」的完整 P&E 引擎',
      '实现失败分类器，区分「该重试」与「该重规划」',
      '用结果账本让重规划继承已完成产出，避免重复劳动',
    ],
    `
### 一个把成果丢掉的引擎

某团队第一版 P&E 引擎上线后，一个「分析上月销售」的任务触发了三次重规划：token 花了四倍，答案还是错的。日志逐条看下去很清楚——每次重规划后，之前已经查好的八张表被全部重查一遍，重查时又踩到限流，于是又触发重规划。循环的起点不是模型不行，是引擎在重规划时把结果账本丢了。

这一课把这四条缝补上：规划、执行、判定、重规划。重点在中间那一环——很多人以为「失败就重规划」，实际上一半的失败应该重试。

### 引擎的四个部件

| 部件 | 职责 | 不该做的事 |
| --- | --- | --- |
| Planner | 把目标拆成子目标，并在偏离时重拆 | 直接调用工具 |
| Executor | 执行单个子目标，返回结构化结果 | 增删子目标、改计划 |
| 判定器（classify） | 把结果分成 continue / retry / replan | 调用模型 |
| 账本（ledger） | 保存子目标产出，跨重规划存活 | 保存意图描述 |

四个部件里只有判定器需要一点「经验」，其余都是结构问题。而判定器写错的代价最大：它把重试升级成重规划，重规划就会吃掉所有成果。

### 类型与契约

先把数据结构钉死。注意 \`deps\` 用 id 而不是描述——描述会变，id 是稳定的引用。

\`\`\`ts title="引擎的类型层"
type Status = 'pending' | 'done' | 'failed'

interface SubGoal {
  id: string
  desc: string
  deps: string[]
  status: Status
  output?: string
  error?: string
}

interface ExecResult {
  ok: boolean
  output?: string
  error?: string
}

type Verdict = 'continue' | 'retry' | 'replan'

interface Planner {
  decompose(goal: string): Promise<SubGoal[]>
  replan(goal: string, plan: SubGoal[], ledger: Map<string, string>, reason: string): Promise<SubGoal[]>
}

interface Executor {
  run(sg: SubGoal, inputs: string[]): Promise<ExecResult>
}
\`\`\`

接口里的 \`replan\` 多了一个 \`reason\` 参数，这是有意的：重规划必须知道自己为什么被叫醒。不带原因的 \`replan(goal, plan)\` 只能全量重拆，而全量重拆必然丢成果。

### 判定器：失败不等于该重规划

这是整课最容易被写错的一处。默认写法通常是「\`ok === false\` 就重规划」，结果一个 429 限流就把整份计划推翻重来。

\`\`\`ts title="classify：三种裁决"
function classify(r: ExecResult, retries: Map<string, number>, id: string): Verdict {
  if (r.ok) {
    // 成功但产出为空：形式上成功，实质上是偏离
    if (!r.output || r.output.trim() === '') return 'replan'
    return 'continue'
  }
  const err = r.error ?? ''
  const transient = /timeout|ECONNRESET|429|503|rate limit/i.test(err)
  const tried = retries.get(id) ?? 0
  if (transient && tried < 2) return 'retry'
  return 'replan'
}
\`\`\`

三类判据可以归纳成一张表：

| 结果 | 裁决 | 理由 |
| --- | --- | --- |
| 成功且产出非空 | continue | 正常路径 |
| 成功但产出为空 / 明显答非所问 | replan | 计划对该子目标的假设错了，重试只会重复错 |
| 瞬时错误（超时、限流、连接重置） | retry | 环境抖动，重试即可，不该推翻计划 |
| 持久错误（参数非法、资源不存在、权限不足） | replan | 同一个调用再试一百次也一样 |

关键区别是「这个错误会不会因为再试一次而消失」。会，就重试；不会，就重规划。

:::deep

### 为什么 retry 要单独一层，而不是直接交给 executor

把重试塞进 executor（\`for (let i = 0; i < 3; i++) try ...\`）看起来更内聚，但会带来两个问题：一是重试次数无法被引擎观测，日志里只看到「一次耗时 9 秒的调用」，看不出中间试了三次；二是重试与重规划共用同一个计数上限，限流引发的重试会挤占重规划预算。

正确的分层是：executor 只管「一次尝试」，重试由引擎判定后发起。这样每次尝试都是一条独立事件，重试预算和重规划预算也各自独立。

:::

### 结果账本：让成果跨重规划存活

账本是一个 \`Map<string, string>\`，键是子目标 id，值是产出。它的作用是重规划后把已完成的产出搬回新计划。

\`\`\`ts title="carryOver：先按 id 认，再按描述认"
function normalize(desc: string): string {
  return desc.replace(/\\s+/g, '').toLowerCase()
}

function carryOver(prev: SubGoal[], next: SubGoal[], ledger: Map<string, string>): SubGoal[] {
  const doneById = new Map(prev.filter((s) => s.status === 'done').map((s) => [s.id, s]))
  const doneByDesc = new Map(prev.filter((s) => s.status === 'done').map((s) => [normalize(s.desc), s]))

  return next.map((s) => {
    const old = doneById.get(s.id) ?? doneByDesc.get(normalize(s.desc))
    if (!old) return s
    const output = ledger.get(old.id) ?? old.output
    if (output === undefined) return s
    return { ...s, status: 'done' as Status, output }
  })
}
\`\`\`

为什么要有「按描述认」这一层兜底：重规划时模型经常给同一条子目标换 id（\`g2\` 变成 \`s2\`）。只按 id 匹配会全部失配，账本等于没用。按归一化描述匹配能救回大部分情况，剩下的才是真的新任务。

:::warn

### replan 的隐藏契约：保留已完成子目标的 id

接口上没写、文档里通常也不写，但引擎依赖它：**重规划返回的新计划，必须原样保留已完成子目标的 id**。如果模型每次重拆都重新编号，账本就会退化成「按描述猜」，一旦描述也被改写（「读取销售数据」变成「拉取上月销售明细」），成果照样丢。

所以实践中要在 planner 的 prompt 里显式约束：「已完成的部分原样保留，不得改写 id 与描述」。这条约束不是可选的礼貌建议，它是引擎正确性的一部分。

:::

### 主循环

有了判定器和账本，主循环反而最短。注意它用 \`while\` 找「下一个可执行的」而不是 \`for\` 顺序遍历——重规划可能插入新子目标，顺序遍历会漏掉它们。

\`\`\`ts title="planAndExecute：主循环"
interface EngineOpts {
  planner: Planner
  executor: Executor
  maxReplans?: number
  maxSteps?: number
  onEvent?: (kind: string, detail: string) => void
}

export async function planAndExecute(goal: string, opts: EngineOpts) {
  const { planner, executor, onEvent = () => {} } = opts
  const maxReplans = opts.maxReplans ?? 3
  const maxSteps = opts.maxSteps ?? 40

  let plan = await planner.decompose(goal)
  const ledger = new Map<string, string>()
  const retries = new Map<string, number>()
  let replans = 0
  let steps = 0

  onEvent('plan', plan.map((s) => s.id + ':' + s.desc).join(' | '))

  while (steps < maxSteps) {
    const ready = plan.find(
      (s) => s.status === 'pending' && s.deps.every((d) => plan.find((x) => x.id === d)?.status === 'done'),
    )
    if (!ready) break

    const inputs = ready.deps.map((d) => ledger.get(d) ?? '').filter(Boolean)
    const r = await executor.run(ready, inputs)
    steps++

    const verdict = classify(r, retries, ready.id)
    onEvent('result', ready.id + ' → ' + verdict)

    if (verdict === 'retry') {
      retries.set(ready.id, (retries.get(ready.id) ?? 0) + 1)
      continue
    }

    if (verdict === 'replan') {
      ready.status = 'failed'
      ready.error = r.error ?? '产出为空'
      if (++replans > maxReplans) throw new Error('重规划超限：' + (r.error ?? '产出为空'))
      const reason = ready.id + ' 失败：' + ready.error
      plan = carryOver(plan, await planner.replan(goal, plan, ledger, reason), ledger)
      onEvent('replan', reason + ' → ' + plan.filter((s) => s.status === 'pending').length + ' 项待执行')
      continue
    }

    ready.status = 'done'
    ready.output = r.output
    ledger.set(ready.id, r.output as string)
  }

  const blocked = plan.filter((s) => s.status !== 'done')
  if (blocked.length) throw new Error('未完成：' + blocked.map((s) => s.id).join(','))

  return {
    answer: plan
      .map((s) => '[' + s.id + '] ' + s.output)
      .join(' / '),
    plan,
    replans,
    steps,
  }
}
\`\`\`

三个细节值得单独说：

1. **\`ready\` 用 \`find\` 挑第一个可执行的**，不是按数组顺序。依赖未满足的子目标会被跳过，等下一轮。
2. **\`replans\` 与 \`steps\` 分开计数**。一个任务可能重规划 2 次、执行 3 步；把两者混成一个计数器，就无法回答「是计划不好还是执行太慢」。
3. **结束条件是「没有可执行的」而不是「计划全 done」**。依赖成环时前者能立刻退出并报错，后者会死循环。

### 跑通一次

用 mock 的 planner 与一个会返回 429 的 executor 验证重试与重规划两条路径。

\`\`\`ts title="最小可跑示例"
const planner: Planner = {
  async decompose() {
    return [
      { id: 'g1', desc: '读取销售数据', deps: [], status: 'pending' },
      { id: 'g2', desc: '按地区聚合', deps: ['g1'], status: 'pending' },
      { id: 'g3', desc: '生成图表', deps: ['g2'], status: 'pending' },
    ]
  },
  async replan(_goal, plan, ledger, reason) {
    // 契约：已完成的原样保留；失败项换一条路径，并把下游的 deps 指向新 id
    return plan
      .filter((s) => s.status !== 'failed')
      .map((s) => (s.id === 'g3' ? { ...s, deps: ['g2b'] } : s))
      .concat([{ id: 'g2b', desc: '改为按省份抽样聚合', deps: ['g1'], status: 'pending' as Status }])
  },
}

const executor: Executor = {
  async run(sg, inputs) {
    if (sg.id === 'g2') return { ok: false, error: 'HTTP 400 参数非法：地区字段不支持中文' }
    return { ok: true, output: sg.id + '(' + inputs.join('+') + ')' }
  },
}

const out = await planAndExecute('分析上月销售', {
  planner,
  executor,
  maxReplans: 2,
  onEvent: (kind, detail) => console.log('[' + kind + '] ' + detail),
})
console.log(out.answer, out.replans, out.steps)
\`\`\`

事件的真实顺序是：\`plan → result(g1,continue) → result(g2,replan) → replan → result(g2b,continue) → result(g3,continue)\`。\`g1\` 只执行了一次——因为 \`carryOver\` 把它的产出搬进了新计划。把 \`carryOver\` 注释掉再跑一次，\`g1\` 会出现两次，这就是开头那个事故的复现。

### 事件流：让引擎可观测

\`onEvent\` 不是调试残留，它是引擎的对外接口。四类事件各有用途：

| 事件 | 携带信息 | 用来回答什么 |
| --- | --- | --- |
| plan | 初始计划全貌 | 它一开始打算怎么做 |
| result | 子目标 id + 裁决 | 哪一步慢了、哪一步被判偏离 |
| replan | 原因 + 剩余项数 | 重规划是失败驱动还是偏离驱动 |
| （结束时返回） | steps / replans | 成本结构是执行重还是规划重 |

没有这三类事件，线上排查只能靠猜。而「猜测它当时想干什么」在 Agent 系统里成本极高——一次错误归因往往导致改错地方。

### 三个预算参数怎么配

\`maxReplans\`、\`maxSteps\`、executor 内部的重试上限，三者不是随手填的，它们之间有硬关系：

- \`maxSteps\` 必须大于 \`计划长度 × (maxReplans + 1)\`。否则引擎会在还有可执行子目标时因为步数耗尽而误报失败——这个错误看起来像「任务太难」，实际是预算配错。
- \`maxReplans\` 通常取 2 到 3。超过 3 次的场景多半不是计划问题，而是目标本身描述不清，此时继续重规划只会把错误答案换几种写法。
- 单子目标的重试上限取 2，且只对瞬时错误生效。取 5 以上意味着你在用重试掩盖一个持久性问题。

一个可直接用的起点是：计划长度 6、\`maxReplans = 2\`、\`maxSteps = 24\`、重试上限 2。先按这个跑基线，再根据事件流里 replan 的实际触发次数调。

### 三个坑

- **重试与重规划共用一个上限**。限流引发的重试会把重规划预算耗光，然后引擎在真正需要重规划时直接抛错。
- **\`carryOver\` 只在重规划后调用，忘了在首次规划后也调用**。断点续跑（从存储里恢复计划）是同一条路径，首次规划同样需要继承账本。
- **\`maxSteps\` 设得比 \`maxReplans × 计划长度\` 小**。引擎会在还有可执行子目标时因为步数耗尽而误报失败。

引擎跑起来了，但它的重规划还是「全量重拆」。下一课讨论什么时候该局部修、什么时候该整体推翻。
`,
    null,
    [
      {
        text: 'classify 把「瞬时错误」判为 retry 而不是 replan 的理由是？',
        options: [
          'retry 更省 token',
          '这类错误会因再试一次而消失，重规划只会白白推翻计划',
          'replan 的实现更复杂',
          'retry 不需要记录日志',
        ],
        answer: 1,
        explain: '判据是「再试一次会不会消失」：会就重试，不会就重规划。',
        concept: 'pe-engine',
      },
      {
        text: '重规划后 g1 被重复执行，最可能的原因是？',
        options: [
          'executor 有缓存 bug',
          '缺少 carryOver / 结果账本，已完成产出未被搬进新计划',
          'maxReplans 太小',
          'onEvent 未注册',
        ],
        answer: 1,
        explain: '账本缺失时新计划里的 g1 仍是 pending，会被重新执行一遍。',
        concept: 'pe-engine',
      },
      {
        text: '主循环用「找不到可执行子目标」作为结束条件，而不是「全部 done」，是为了？',
        options: ['省 CPU', '依赖成环时能立刻退出并报错，避免死循环', '兼容旧版本', '减少日志量'],
        answer: 1,
        explain: '成环时没有 ready 项，前者能退出，后者会永远等待。',
        concept: 'pe-engine',
      },
      {
        text: 'replan 接口必须带 reason 参数，作用是？',
        options: [
          '用于日志美化',
          '让重规划知道偏离原因，从而支持局部修正而非全量重拆',
          '校验权限',
          '控制并发',
        ],
        answer: 1,
        explain: '没有原因只能全量重拆，全量重拆必然丢成果。',
        concept: 'pe-engine',
      },
    ],
    [
      ['裁决（Verdict）', '对一次执行结果的处理决定：continue / retry / replan'],
      ['结果账本', '以子目标 id 为键保存产出的 Map，跨重规划存活'],
      ['瞬时错误', '再试一次可能消失的错误，如超时、限流、连接重置'],
      ['carryOver', '把已完成产出搬到新计划，并标记其为 done'],
    ],
    [
      '失败即重规划，限流导致整份计划被推翻。',
      '重规划不继承账本，已完成子目标被重复执行。',
      '重试与重规划共用计数上限，互相挤占预算。',
      '结束条件写成「全部 done」，依赖成环时死循环。',
    ],
  ),
  'practice',
)
