import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 13 ========== */

export const L81 = withKind(
  L(
    'L81',
    13,
    '实战：搭建 Eval harness 与 agent 检测（自动化轨迹评测 + 异常/退化检测）',
    44,
    ['L80', 'L78'],
    ['eval-harness'],
    [
      '用 TypeScript 搭建一个可运行的 Eval harness（用例集、执行器、指标、快照比对、报告）',
      '实现并行执行、单例超时隔离、工具 mock 与退化检测',
      '对照 LangSmith Evals / Ragas 的等价能力，说清自建 harness 的边界',
    ],
    `
### 评测脚本长成了第二个产品

一个团队的评测脚本从 80 行起步，半年后是 1400 行：里面有爬取线上日志的代码、有手工维护的 case 数组、有三十个 \`if (caseId === 'xxx')\` 的特例、有直接写进主分支的断言。

它是能跑的，但没人愿意改——每次要加一个用例都得读一遍那 1400 行。结果就是评测覆盖停止增长，而线上问题继续出现。

这不是纪律问题，是结构问题：**评测代码没有被当成产品来设计**。它需要和业务代码一样的边界——用例是数据不是代码、执行是可替换的、指标是算出来的不是写死的、结果可比对。

这一课搭一个 200 行左右的 harness，把这四条边界立起来。

### 五个部件

| 部件 | 职责 | 不该做的事 |
| --- | --- | --- |
| Case 集 | 声明「测什么、预期是什么」 | 包含执行逻辑 |
| Runner | 执行单个 case：隔离、超时、重试 | 判断对错 |
| Judge / 校验 | 判断输出是否符合预期 | 执行 agent |
| 指标聚合 | 从轨迹算 L78 的三个指标 | 决定是否通过 |
| 快照与比对 | 与历史最好版本比较、出报告 | 修改基线 |

五个部件里，最容易被合并的是第三和第四——很多 harness 把「判定」与「统计」写在一处，结果是想换一个判定口径就得动统计代码。

### 用例是数据

\`\`\`ts title="Case 定义：声明式"
export interface EvalCase {
  id: string
  input: string
  tags: string[] // 'common' | 'edge' | 'regression' | 'safety'
  /** 判定：可以是精确匹配、正则、谓词，或外部标准化答案 */
  expect: { kind: 'exact'; value: string } | { kind: 'regex'; value: string } | { kind: 'predicate'; fn: (out: string) => boolean }
  /** 工具返回值覆盖：让 case 不依赖真实外部系统 */
  toolStub?: Record<string, unknown>
  /** 允许的步数上限，超过判失败（防止用暴力步数换正确性） */
  maxSteps?: number
}
\`\`\`

三个字段值得解释：

- **\`tags\`**：让报告能按层聚合（L80 的分层抽样对应这里）。没有标签，你只能看总分，无法回答「边界层是不是变差了」。
- **\`toolStub\`**：把外部依赖固定下来。没有它，评测结果会随真实库存 / 汇率 / 缓存变化而漂移——那不是被测系统在变，是世界在变（L74 讲过回放同理）。
- **\`maxSteps\`**：把「用暴力换正确率」这条捷径堵住。只判答案对错的评测一定会被步数暴力刷分。

### Runner：隔离、超时、并行

\`\`\`ts title="Runner：每个 case 独立、可超时"
export interface AgentRun {
  (input: string, ctx: { toolStub?: Record<string, unknown>; signal: AbortSignal }): Promise<{
    output: string
    steps: number
    toolCalls: number
    tokens: number
  }>
}

export interface Outcome {
  caseId: string
  tags: string[]
  passed: boolean
  output: string
  steps: number
  toolCalls: number
  tokens: number
  ms: number
  error?: string
  timeout?: boolean
}

async function runOne(c: EvalCase, agent: AgentRun, timeoutMs: number): Promise<Outcome> {
  const started = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  try {
    const r = await agent(c.input, { toolStub: c.toolStub, signal: ac.signal })
    const passed = judge(c, r.output)
    const overSteps = c.maxSteps !== undefined && r.steps > c.maxSteps
    return {
      caseId: c.id,
      tags: c.tags,
      passed: passed && !overSteps,
      output: r.output,
      steps: r.steps,
      toolCalls: r.toolCalls,
      tokens: r.tokens,
      ms: Date.now() - started,
      error: overSteps ? 'steps-exceeded:' + r.steps : undefined,
    }
  } catch (e) {
    const aborted = ac.signal.aborted
    return {
      caseId: c.id,
      tags: c.tags,
      passed: false,
      output: '',
      steps: 0,
      toolCalls: 0,
      tokens: 0,
      ms: Date.now() - started,
      error: String((e as Error)?.message ?? e),
      timeout: aborted,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** 并发池：限制同时跑几个，避免打满配额 */
export async function runAll(
  cases: EvalCase[],
  agent: AgentRun,
  opts: { concurrency?: number; timeoutMs?: number } = {},
): Promise<Outcome[]> {
  const concurrency = opts.concurrency ?? 4
  const timeoutMs = opts.timeoutMs ?? 60_000
  const out: Outcome[] = []
  let i = 0

  const workers = Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
    while (i < cases.length) {
      const idx = i++
      out[idx] = await runOne(cases[idx], agent, timeoutMs)
    }
  })
  await Promise.all(workers)
  return out
}
\`\`\`

四处设计决定这个 harness 能不能长期用：

1. **\`AbortController\` 而不是 \`Promise.race\`**。\`race\` 超时后原任务还在后台跑，会继续烧 token 并可能写入共享状态。\`abort\` 能让 agent 内部真的停下来（前提是它接受 \`signal\`，这也是 \`AgentRun\` 签名里为什么要它）。
2. **\`maxSteps\` 判在断言之外**。答案对但步数超限，也判失败——这是把 L78 的轨迹评测接进门禁的最短路径。
3. **\`out[idx] = ...\` 保序写入**。并发完成顺序不确定，但报告必须按用例顺序排，否则 diff 时满屏乱序。
4. **并发池而不是 \`Promise.all\` 全发**。200 个用例全发会打满工具配额并让所有调用一起变慢，超时误判率飙升。

### 判定与聚合分离

\`\`\`ts title="judge 与指标聚合"
export function judge(c: EvalCase, output: string): boolean {
  const norm = output.trim()
  switch (c.expect.kind) {
    case 'exact':
      return norm === c.expect.value.trim()
    case 'regex':
      return new RegExp(c.expect.value).test(norm)
    case 'predicate':
      return c.expect.fn(norm)
  }
}

export interface Aggregate {
  total: number
  passed: number
  passRate: number
  byTag: Record<string, { total: number; passed: number; passRate: number }>
  avgSteps: number
  p95Steps: number
  avgTokens: number
  timeoutRate: number
}

const pct = (arr: number[], p: number): number => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

export function aggregate(outcomes: Outcome[]): Aggregate {
  const byTag: Aggregate['byTag'] = {}
  for (const o of outcomes) {
    for (const t of o.tags) {
      byTag[t] ??= { total: 0, passed: 0, passRate: 0 }
      byTag[t].total++
      if (o.passed) byTag[t].passed++
    }
  }
  for (const t of Object.keys(byTag)) {
    byTag[t].passRate = byTag[t].passed / byTag[t].total
  }
  const steps = outcomes.map((o) => o.steps)
  return {
    total: outcomes.length,
    passed: outcomes.filter((o) => o.passed).length,
    passRate: outcomes.length ? outcomes.filter((o) => o.passed).length / outcomes.length : 0,
    byTag,
    avgSteps: steps.reduce((a, b) => a + b, 0) / Math.max(steps.length, 1),
    p95Steps: pct(steps, 0.95), // 看尾部，不看平均（L72）
    avgTokens: outcomes.reduce((a, o) => a + o.tokens, 0) / Math.max(outcomes.length, 1),
    timeoutRate: outcomes.filter((o) => o.timeout).length / Math.max(outcomes.length, 1),
  }
}
\`\`\`

\`byTag\` 是这个聚合里最有用的部分。总分掉 2 个点时，它能立刻告诉你是哪一层掉了——如果是 \`regression\` 层掉，说明旧问题复发；如果是 \`edge\` 层掉，说明新改动没考虑边界。两种情况的处置完全不同。

### 退化检测与报告

\`\`\`ts title="与历史最好快照比对"
export interface Snapshot {
  version: string
  sampleSetVersion: string
  passRate: number
  p95Steps: number
  avgTokens: number
  byTag: Record<string, { passRate: number }>
}

export interface Diff {
  metric: string
  base: number
  cur: number
  verdict: 'better' | 'worse' | 'ok'
}

export function diff(cur: Snapshot, base: Snapshot, tol = 0.02): Diff[] {
  if (cur.sampleSetVersion !== base.sampleSetVersion) {
    throw new Error('样本集版本不同，分数不可比：' + base.sampleSetVersion + ' → ' + cur.sampleSetVersion)
  }
  const rows: Diff[] = []
  const cmp = (metric: string, b: number, c: number, higherBetter: boolean) => {
    const worse = higherBetter ? c < b - tol : c > b + tol
    const better = higherBetter ? c > b + tol : c < b - tol
    rows.push({ metric, base: b, cur: c, verdict: worse ? 'worse' : better ? 'better' : 'ok' })
  }
  cmp('passRate', base.passRate, cur.passRate, true)
  cmp('p95Steps', base.p95Steps, cur.p95Steps, false)
  cmp('avgTokens', base.avgTokens, cur.avgTokens, false)
  for (const tag of Object.keys(base.byTag)) {
    if (cur.byTag[tag]) cmp('passRate@' + tag, base.byTag[tag].passRate, cur.byTag[tag].passRate, true)
  }
  return rows
}
\`\`\`

那个 \`throw\` 对应 L80 的「样本集版本不一致不允许比」。它在 CI 里会直接中断流程——这是对的，因为继续比下去得到的是一个没有意义的数字。

\`tol = 0.02\` 是绝对 2 个百分点。对于 200–300 条样本，这个阈值大致相当于「差异可能不是噪声」的量级（严格做法用 L77 的区间估计，但门禁场景下固定阈值更可预测）。

:::deep

### 为什么 harness 要做「可替换的执行器」

\`runAll\` 的第二个参数是 \`AgentRun\` —— 一个函数类型，而不是某个具体的 Agent 类。这个选择让同一套 harness 能跑三类对象：

- **真实 agent**：连真实模型与工具，用于发布前评测。
- **回放 agent**（L74）：用录制的 tape 替换模型调用，用于复现某个 bug 并验证修复。
- **假 agent**：直接返回固定输出，用于测 harness 自己（比如验证「步数超限会判失败」这条逻辑）。

第三类最容易被忽略，但它是 harness 可信的前提：如果 harness 本身的判定逻辑有 bug，所有评测结论都不可信。用假代理跑一组「必须有 N 个失败」的用例，是成本最低的自检方式。

同理，\`toolStub\` 让同一份 harness 能在无网络环境下跑全部用例——这直接决定了它能不能进 CI。

:::

:::warn

### 四个会让 harness 结果不可信的做法

**第一，用例之间共享状态。** 如果一个用例改了全局缓存、写入了共享目录，它会影响后续用例。表现是「单独跑通过、全量跑失败」或「顺序换了结果变了」。每个 case 必须独立——agent 实例、工具状态、临时目录都要新建。

**第二，重试用在评测里。** harness 对失败的 case 自动重试直到通过，等价于「允许无限次尝试」——这与生产只给一次机会完全不同，会系统性高估能力（L79 讲过基准的同类问题）。

**第三，把超时算作普通失败。** 超时与答错是两种问题：前者说明性能或死循环，后者说明能力。混在一起统计会让「p95 时延劣化」和「准确率下降」看起来是同一件事。所以 \`Outcome\` 里单独有 \`timeout\` 字段，聚合时单独算 \`timeoutRate\`。

**第四，报告只给总分。** 没有 \`byTag\`、没有 \`p95\`、没有逐条结果，报告就只是一句「通过率 78%」。这种报告无法支撑任何决策。

:::

### 与 LangSmith Evals / Ragas 对照

| 能力 | 本课 harness | LangSmith Evals | Ragas |
| --- | --- | --- | --- |
| 用例管理 | 代码内数组（可换成 JSON） | 平台数据集 + 版本 | 数据集对象 |
| 执行 | 自写并发池 + Abort 超时 | SDK 托管（含重试） | 内置 |
| 判定 | exact / regex / predicate | 内置 + 自定义 evaluator | 内置 RAG 专用指标 |
| 轨迹指标 | 自算（L78） | 自动采集 run 树 | 部分 |
| 报告 | 自写聚合 | 平台 UI + 对比视图 | 表格 |
| 依赖 | 零 | 平台账号 | Python 生态 |

自建的价值在三个点：**判定口径完全可控**（不依赖平台的 evaluator 语义）、**不引入外部依赖**（能进任何 CI）、**轨迹指标可自定义**（平台的通用指标未必对应你的业务关注点）。

代价也清楚：没有现成的对比视图、没有数据集协作、跨版本管理要自己做。判断标准是团队规模——一个人维护自建 harness 划算，十个人协作时平台的可视化与共享价值会超过自建的控制力。

### 先测 harness 自己

在跑任何真实 agent 之前，用假 agent 跑一组「答案已知」的用例，验证 harness 的判定逻辑本身是对的。三类必须覆盖：

| 假 agent 的行为 | 期望结果 | 验证什么 |
| --- | --- | --- |
| 返回完全正确的输出 | 全部通过 | 判定路径正常 |
| 返回正确但步数超限 | 全部失败，\`error = steps-exceeded\` | \`maxSteps\` 生效 |
| 无限循环不返回 | 全部超时，\`timeoutRate = 1\` | Abort 生效且计入超时而非失败 |

这三条跑通只需要几十毫秒，却能挡住最尴尬的一类问题：harness 的 bug 让所有评测结论都失真，而你在用这些结论做上线决策。

### 收束

这个 harness 到这一步能回答「这次改动有没有退化」，但它的判定依赖 \`expect\` 里的可执行断言。当任务没有标准答案时（写得好不好、解释得清不清楚），\`exact\` 和 \`regex\` 都用不上——那就需要 L82 的 LLM-as-Judge，而它带来一整套新的偏差问题。
`,
    null,
    [
      {
        text: 'Runner 用 AbortController 而不是 Promise.race 做超时的原因是？',
        options: [
          '代码更短',
          'race 超时后原任务仍在后台跑，会继续烧 token 并可能写共享状态',
          'race 不支持并发',
          'abort 更快',
        ],
        answer: 1,
        explain: 'abort 能让 agent 内部真的停下，前提是它接受 signal。',
        concept: 'eval-harness',
      },
      {
        text: '用例里 `maxSteps` 字段的作用是？',
        options: [
          '限制并发',
          '堵住「用暴力步数换正确率」这条捷径，答案对但步数超限也判失败',
          '控制超时',
          '减少 token',
        ],
        answer: 1,
        explain: '只判答案对错的评测一定会被步数暴力刷分。',
        concept: 'eval-harness',
      },
      {
        text: '聚合里 `byTag` 最有用的场景是？',
        options: [
          '美化报告',
          '总分下降时立刻定位是哪一层退化（regression 复发 vs edge 未覆盖）',
          '减少存储',
          '支持并行',
        ],
        answer: 1,
        explain: '不同层的退化处置完全不同。',
        concept: 'eval-harness',
      },
      {
        text: '评测中给失败 case 自动重试直到通过，问题在于？',
        options: [
          '浪费时间',
          '等价于允许无限次尝试，与生产只给一次机会不符，会系统性高估能力',
          '增加成本',
          '无法统计',
        ],
        answer: 1,
        explain: '这与 L79 讲的「多次采样择优刷分」是同一个问题。',
        concept: 'eval-harness',
      },
    ],
    [
      ['Eval harness', '把用例集、执行器、判定、指标、快照比对固定下来的可重复装置'],
      ['AgentRun', '可替换的执行器函数签名，让同一 harness 能跑真实 / 回放 / 假 agent'],
      ['byTag 聚合', '按样本层分别统计通过率，用于定位退化发生在哪一类'],
      ['timeoutRate', '超时占比，与「答错」分开统计，对应性能而非能力问题'],
    ],
    [
      '评测脚本里堆特例与业务逻辑，逐渐变成不可维护的第二个产品。',
      '用例共享全局状态，导致「单独跑通过、全量跑失败」。',
      '把超时算作普通失败，性能退化与准确率下降混为一谈。',
    ],
  ),
  'practice',
)
