import { L, prose, code, call, list, q } from '../../course-builders.ts'

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
  [
    prose(
      '把评测做成可重复的 harness',
      'Eval harness 是把「跑样本 → 评测 → 汇总 → 告警」固化成可重复执行的工具。它让你每次改动都能一键回归。',
    ),
    code(
      'Eval harness',
      'interface EvalResult { task: string; correct: boolean; steps: number; cost: number; anomaly: boolean }\n\nasync function runEval(agent, evalSet, evaluator): Promise<EvalSummary> {\n  const results: EvalResult[] = []\n  for (const c of evalSet) {\n    const { output, trace } = await agent.run(c.task)\n    const correct = evaluator(output, c.expected)\n\n    // ① 轨迹评测：步数、冗余\n    const steps = trace.spans.filter((s) => s.name.startsWith("tool.")).length\n\n    // ② agent 检测：异常行为\n    const anomaly = detectAnomaly(trace)   // 危险动作/重复调用/超时\n\n    results.push({ task: c.task, correct, steps, cost: trace.tokens, anomaly })\n  }\n  return summarize(results)   // ③ 汇总：正确率/平均步数/异常数\n}\n\nfunction detectAnomaly(trace) {\n  const tools = trace.spans.map((s) => s.name)\n  const repeated = new Set(tools).size < tools.length * 0.5   // 重复调用\n  const danger = tools.some((t) => DANGEROUS.includes(t))       // 危险动作\n  return repeated || danger\n}',
      '关键：一次运行同时产出「结果对错 + 轨迹质量 + 异常检测」，三合一。',
    ),
    call(
      'deep',
      'agent 检测 = 异常/退化检测',
      '「agent 检测」本质是发现「不该发生的行为」：重复调用、危险动作、超时、结果格式异常。它和「正确性评测」互补——正确性看「对不对」，检测看「有没有乱来」。',
    ),
    call(
      'tip',
      '框架对照：LangSmith Evals / Ragas',
      'LangSmith Evals 提供「数据集 + evaluator + 在线评估」的托管；Ragas 专注 RAG 质量（忠实度、相关性）。你手写的 harness 是它们的「最小自建版」——核心逻辑相同。',
    ),
    list('harness 的三个能力', [
      '自动化：一键跑完整样本集。',
      '可重复：同样的样本、同样的 evaluator，结果可复现。',
      '可告警：退化或异常时明确报出，而非靠人肉看。',
    ]),
  ],
  null,
  [
    q(
      'Eval harness 的核心价值是？',
      ['好看', '把「跑样本→评测→汇总→告警」固化为可重复工具', '省 token', '更快'],
      1,
      '可重复、自动化、可告警。',
      'eval-harness',
    ),
    q(
      '「agent 检测」本质是？',
      ['评测正确性', '发现不该发生的行为（重复/危险/超时）', '选模型', '写 prompt'],
      1,
      '检测异常与退化。',
      'eval-harness',
    ),
    q(
      '一次 harness 运行同时产出？',
      ['只对错', '结果对错 + 轨迹质量 + 异常检测', '只轨迹', '只异常'],
      1,
      '三合一。',
      'eval-harness',
    ),
  ],
  [
    ['Eval harness', '可重复执行的评测工具'],
    ['agent 检测', '发现重复/危险/超时等异常行为'],
    ['退化检测', '发现指标低于基线的变化'],
  ],
  ['评测靠人肉跑，无法重复、无法告警。', '只测对错不做异常检测，漏掉「结果对但乱来」的问题。'],
)
