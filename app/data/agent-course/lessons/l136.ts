import { L } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L136 = L(
  'L136',
  27,
  '实战 Capstone B：从零实现深度推理与规划引擎（ToT / GoT / 规划）',
  22,
  4,
  ['L135'],
  ['cap-b-reasoning'],
  [
    '从零实现 ToT / GoT 深度推理与规划引擎',
    '掌握「把研究问题拆成可探索子问题」的工程做法',
    '理解深度推理如何为后续检索提供「好问题」',
  ],
  `
### 研究型 Agent 的「想」发生在「查」之前

研究型 Agent 不是「拿到主题就检索」，而是先「深度推理」：把复杂主题拆成多个子问题、对每个子问题探索、聚合结论。本课从零实现 ToT / GoT 的推理与规划引擎，不复用 L55/L60。

\`\`\` title="从零实现深度推理引擎（不复用 L55/L60）" note="关键：深度推理的产物不是「答案」，而是一组「高质量的检索子问题」。"
// ① 规划：把大主题拆成可探索的子问题树
const plan = await generatePlan(topic)
//   → { root: topic, children: ["市场现状", "技术趋势", "竞争格局"] }

// ② ToT 探索：对每个子问题生成多条候选思路，评估 + 剪枝
async function explore(node) {
  const candidates = await generateThoughts(node)   // 多条候选
  const scored = candidates.map(c => ({ c, s: evaluate(c) }))
  return keepTopK(scored, 3)                        // 保留前 3，剪枝
}

// ③ GoT 聚合：把不同子问题的结论合并、去重、找关联
const merged = aggregate(exploreResults)             // 思维聚合

// ④ 输出「研究问题清单」：交给 L137 的 RAG 去检索
return toResearchQuestions(merged)
\`\`\`

:::deep

### 推理引擎的产出是「问题」不是「结论」

在 Capstone B 里，深度推理引擎（ToT/GoT/规划）的职责是「把一个模糊主题，变成一组结构清晰、可检索、可验证的子问题」。真正的「结论」要等检索到证据后才能下——这避免了「先射箭再画靶」的幻觉。

:::

### 推理引擎的验收点

- 能把主题拆成树状子问题，覆盖充分。
- ToT 对关键子问题生成多候选并剪枝。
- GoT 能聚合不同分支的结论、找关联。
- 产出的「研究问题清单」能直接喂给 RAG 检索。

:::warn

### 推理引擎不负责「下结论」

如果把推理引擎设计成「直接产出结论」，它就会在没有任何证据的情况下编造。正确的分工是：推理引擎产「问题」，检索（L137）产「证据」，综合（L138）才产「结论」。

:::

`,
  null,
  [
    {
      text: '深度推理引擎的产出是？',
      options: ['最终结论', '一组结构清晰、可检索、可验证的子问题', '代码', '报告'],
      answer: 1,
      explain: '推理产问题，不产结论。',
      concept: 'cap-b-reasoning',
    },
    {
      text: 'ToT 的「剪枝」做的是？',
      options: ['删除代码', '保留评分前 K 的候选思路', '压缩报告', '加速网络'],
      answer: 1,
      explain: '多候选评估 + 剪枝。',
      concept: 'cap-b-reasoning',
    },
    {
      text: '为什么推理引擎不该直接下结论？',
      options: ['太慢', '会在无证据情况下编造（幻觉）', '太贵', '没必要'],
      answer: 1,
      explain: '证据未到先下结论 = 幻觉。',
      concept: 'cap-b-reasoning',
    },
  ],
  [
    ['ToT', '多候选探索 + 评估剪枝'],
    ['GoT', '跨分支思维聚合'],
    ['研究问题清单', '推理引擎产出的可检索子问题'],
  ],
  ['让推理引擎直接产出结论，跳过检索证据环节。', '主题不拆解，直接整题检索，遗漏关键子问题。'],
)
