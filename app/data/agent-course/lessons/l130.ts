import { L } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L130 = L(
  'L130',
  26,
  '实战 Capstone A：从零实现多 Agent 编排（supervisor + 专门角色）',
  22,
  4,
  ['L129'],
  ['cap-a-multi'],
  [
    '从零实现 supervisor + 专门角色的多 Agent 编排',
    '掌握角色定义、消息路由、结果汇总的从零实现',
    '理解「何时分工」与「避免过度编排」的平衡',
  ],
  `
### Capstone A 的多 Agent：监督者 + 专门角色

在运维助手场景里，单一 Agent 既诊断又执行容易「管不住」。从零实现一个 supervisor 编排：诊断 Agent（分析告警）、执行 Agent（调工具执行修复）。不复用 L68，但复用「supervisor 编排」这一思路。

\`\`\` title="从零实现 supervisor 编排（不复用 L68）" note="关键：supervisor 不干活，只做「分派 → 汇总 → 冲突仲裁」，这是编排的本质。"
type Role = { name: string; prompt: string; tools: ToolMap }

const roles: Role[] = [
  { name: "诊断Agent", prompt: "分析告警根因，输出诊断结论", tools: { 查日志, 查指标 } },
  { name: "执行Agent", prompt: "据诊断结论执行修复动作", tools: { 重启服务, 确认告警 } },
]

async function supervise(task: string) {
  const diag = await runAgent(roles[0], task)      // ① 诊断
  const plan = parsePlan(diag)                    // ② 把诊断转成执行计划
  for (const step of plan) {
    const result = await runAgent(roles[1], step)  // ③ 执行（复用 L129 运行时）
    if (result.failed) { /* 回退给诊断 Agent 重新分析 */ }
  }
  return summarize(plan, results)
}
\`\`\`

:::deep

### 编排的核心是「职责边界」而非「Agent 数量」

多 Agent 的价值在于「把不同职责 / 不同工具权限分给不同角色」，而不是「Agent 越多越好」。诊断 Agent 只有只读工具、执行 Agent 才有写工具——这天然实现了「最小权限」的隔离（对照 L85），比单 Agent 混用所有工具更安全。

:::

### 多 Agent 编排的从零实现要点

- 角色定义：每个角色有明确 prompt + 独立工具集。
- 消息路由：supervisor 决定「下一步该谁上」。
- 结果汇总：把各角色输出组装成最终结果。
- 失败回退：执行失败回退给诊断 Agent 重新分析。
- 避免过度编排：能用 2 个 Agent 就别拆 5 个。

:::warn

### 别为了「多 Agent」而多 Agent

如果诊断和执行天然串行、且工具集高度重叠，拆成多 Agent 只会增加通信开销。Capstone A 拆「诊断/执行」的合理性在于：两者工具权限不同（只读 vs 写）、职责边界清晰。这才是拆分的正当理由。

:::

`,
  null,
  [
    {
      text: 'supervisor 在编排中的职责是？',
      options: ['亲自干活', '分派 → 汇总 → 冲突仲裁', '只做诊断', '只做执行'],
      answer: 1,
      explain: 'supervisor 只编排，不干活。',
      concept: 'cap-a-multi',
    },
    {
      text: 'Capstone A 拆「诊断/执行」两个角色的正当理由是？',
      options: ['Agent 越多越好', '工具权限不同（只读 vs 写）+ 职责边界清晰', '更便宜', '更简单'],
      answer: 1,
      explain: '权限隔离 + 职责清晰。',
      concept: 'cap-a-multi',
    },
    {
      text: '多 Agent 拆分的反面是？',
      options: ['过度编排：能 2 个就别 5 个', '太少', '太快', '太贵'],
      answer: 1,
      explain: '避免为多而多。',
      concept: 'cap-a-multi',
    },
  ],
  [
    ['supervisor', '只做分派/汇总/仲裁的编排角色'],
    ['角色定义', '每个 Agent 的 prompt + 工具集'],
    ['职责边界', '不同角色承担不同职责与权限'],
  ],
  [
    '为「多 Agent」而多 Agent，职责不清、工具重叠也硬拆。',
    '把诊断和执行揉进一个 Agent，写权限与只读权限混用。',
  ],
)
