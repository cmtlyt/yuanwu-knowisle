import { L } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L141 = L(
  'L141',
  27,
  '实战 Capstone B：从零部署 + 研究报告交付 + 全链路复盘',
  22,
  4,
  ['L140'],
  ['cap-b-deploy'],
  [
    '把 Capstone B 从零部署，交付研究报告产物',
    '完成 Capstone B 的全链路复盘',
    '输出一份「带引用、可溯源、可部署」的完整交付物',
  ],
  `
### Capstone B 的收口：交付一份可信的研究报告

把 L135–L140 从零构建的组件组装成可部署服务，交付一份「带引用、可溯源」的研究报告，并做全链路复盘。不复用 L127/L134，部署清单思想一致。

\`\`\` title="Capstone B 交付物组装（从零）" note="关键：交付物的核心是「可信」——每句结论有据可查、可溯源、可复现。"
export async function research(topic) {
  const plan = await reason(topic)          // L136 推理 → 子问题
  const evidence = await retrieve(plan)      // L137 RAG+Graph RAG（带 sourceId）
  const draft = await team(evidence)         // L138 研究小组（研究员/评审/合成）
  const verified = await verify(draft)       // L139 溯源校验
  const final = await refine(verified)       // L140 长文精炼 + 防幻觉
  await trace.replayable(topic, final)       // 可回放
  return final                               // 带引用的报告
}

// 部署：状态外置 + 灰度 + 监控（L123/L125 思路）
// 交付物 = 报告产物 + 代码 + 架构图 + 溯源评测基线 + 复盘文档
\`\`\`

:::deep

### 研究型交付物的「可信」高于「篇幅」

一份短但每句都有据可查的报告，远胜一份长但引用编造的报告。Capstone B 的交付标准是「可信」：引用可溯源、结论可复现、推理可回放。这是研究型 Agent 区别于「会写长文的模型」的本质。

:::

### Capstone B 交付物清单

- 报告产物：带引用、可溯源、经校验的研究报告。
- 核心代码：推理 + RAG/Graph RAG + 研究小组 + 追踪 + 溯源校验 + 部署。
- 溯源评测基线：引用存在性/支持性的基线分数。
- 部署配置：状态外置 + 灰度 + 监控。
- 复盘文档：设计决策、踩坑、改进方向。

:::tip

### 双 Capstone 复盘：互为对照

如果你 A、B 都做了，复盘时对比两者：同一套核心知识（运行时/工具/多Agent/追踪/评测/安全/成本/部署），如何在「执行」和「认知」两个切面下长得不同。这份对照是最有价值的沉淀。

:::

`,
  null,
  [
    {
      text: 'Capstone B 交付物的核心标准是？',
      options: ['篇幅长', '可信：引用可溯源、结论可复现、推理可回放', '模型大', '速度快'],
      answer: 1,
      explain: '可信高于篇幅。',
      concept: 'cap-b-deploy',
    },
    {
      text: '研究型 Agent 区别于「会写长文的模型」的本质是？',
      options: ['写得更长', '可信（可溯源、可复现、可回放）', '更贵', '更快'],
      answer: 1,
      explain: '可信是本质。',
      concept: 'cap-b-deploy',
    },
    {
      text: '双 Capstone 复盘最有价值的沉淀是？',
      options: ['代码量', '同一核心知识在「执行 vs 认知」两个切面的对照', 'PPT', '日志'],
      answer: 1,
      explain: '互为对照最珍贵。',
      concept: 'cap-b-deploy',
    },
  ],
  [
    ['可信', '可溯源、可复现、可回放'],
    ['溯源评测基线', '引用存在性/支持性的基线分数'],
    ['复盘', '沉淀设计决策与改进方向'],
  ],
  [
    '把研究型交付物当「写长文」，忽视溯源与可复现。',
    '部署不接状态外置/灰度/监控，交付「本地能跑」的半成品。',
  ],
)
