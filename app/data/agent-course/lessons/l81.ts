import { L } from '../../course-builders.ts'

/* ========== Stage 13 ========== */

export const L81 = L(
  'L81',
  13,
  '实战：搭建 Eval harness 与 agent 检测（自动化轨迹评测 + 异常/退化检测）',
  20,
  4,
  ['L80', 'L78'],
  ['eval-harness'],
  [
    '用 TS 搭建一个可运行的 Eval harness',
    '实现自动化轨迹评测与异常/退化检测',
    '对照 LangSmith Evals / Ragas 等价用法',
  ],
  `
### 把评测做成可重复的 harness

Eval harness 是把「跑样本 → 评测 → 汇总 → 告警」固化成可重复执行的工具。它让你每次改动都能一键回归。

\`\`\` title="Eval harness" note="关键：一次运行同时产出「结果对错 + 轨迹质量 + 异常检测」，三合一。"
interface EvalResult { task: string; correct: boolean; steps: number; cost: number; anomaly: boolean }

async function runEval(agent, evalSet, evaluator): Promise<EvalSummary> {
  const results: EvalResult[] = []
  for (const c of evalSet) {
    const { output, trace } = await agent.run(c.task)
    const correct = evaluator(output, c.expected)

    // ① 轨迹评测：步数、冗余
    const steps = trace.spans.filter((s) => s.name.startsWith("tool.")).length

    // ② agent 检测：异常行为
    const anomaly = detectAnomaly(trace)   // 危险动作/重复调用/超时

    results.push({ task: c.task, correct, steps, cost: trace.tokens, anomaly })
  }
  return summarize(results)   // ③ 汇总：正确率/平均步数/异常数
}

function detectAnomaly(trace) {
  const tools = trace.spans.map((s) => s.name)
  const repeated = new Set(tools).size < tools.length * 0.5   // 重复调用
  const danger = tools.some((t) => DANGEROUS.includes(t))       // 危险动作
  return repeated || danger
}
\`\`\`

:::deep

### agent 检测 = 异常/退化检测

「agent 检测」本质是发现「不该发生的行为」：重复调用、危险动作、超时、结果格式异常。它和「正确性评测」互补——正确性看「对不对」，检测看「有没有乱来」。

:::

:::tip

### 框架对照：LangSmith Evals / Ragas

LangSmith Evals 提供「数据集 + evaluator + 在线评估」的托管；Ragas 专注 RAG 质量（忠实度、相关性）。你手写的 harness 是它们的「最小自建版」——核心逻辑相同。

:::

### harness 的三个能力

- 自动化：一键跑完整样本集。
- 可重复：同样的样本、同样的 evaluator，结果可复现。
- 可告警：退化或异常时明确报出，而非靠人肉看。

`,
  null,
  [
    {
      text: 'Eval harness 的核心价值是？',
      options: ['好看', '把「跑样本→评测→汇总→告警」固化为可重复工具', '省 token', '更快'],
      answer: 1,
      explain: '可重复、自动化、可告警。',
      concept: 'eval-harness',
    },
    {
      text: '「agent 检测」本质是？',
      options: ['评测正确性', '发现不该发生的行为（重复/危险/超时）', '选模型', '写 prompt'],
      answer: 1,
      explain: '检测异常与退化。',
      concept: 'eval-harness',
    },
    {
      text: '一次 harness 运行同时产出？',
      options: ['只对错', '结果对错 + 轨迹质量 + 异常检测', '只轨迹', '只异常'],
      answer: 1,
      explain: '三合一。',
      concept: 'eval-harness',
    },
  ],
  [
    ['Eval harness', '可重复执行的评测工具'],
    ['agent 检测', '发现重复/危险/超时等异常行为'],
    ['退化检测', '发现指标低于基线的变化'],
  ],
  ['评测靠人肉跑，无法重复、无法告警。', '只测对错不做异常检测，漏掉「结果对但乱来」的问题。'],
)
