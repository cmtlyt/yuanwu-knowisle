import { L } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L140 = L(
  'L140',
  27,
  '实战 Capstone B：从零加安全（防幻觉 / 溯源校验）+ 成本优化（长文 token）',
  22,
  4,
  ['L139'],
  ['cap-b-safety'],
  [
    '从零为研究型 Agent 加防幻觉与溯源校验',
    '从零实现长文场景的 token 成本优化',
    '理解研究型 Agent 的安全重点（防幻觉）与执行型（副作用隔离）的区别',
  ],
  `
### 研究型 Agent 的安全重点是「防幻觉」

Capstone B 不产生副作用，所以安全重点不是「危险动作」，而是「防止编造内容与引用」：溯源校验兜底、不确定就明说、长文 token 优化。不复用 L84/L89，思路不同侧重。

\`\`\` title="防幻觉 + 长文 token 优化（从零）" note="关键：防幻觉靠「无证据不下结论 + 溯源校验」，省 token 靠「分层综合」。"
// ① 防幻觉：不确定就明说 + 溯源校验兜底
async function safeClaim(claim, evidence) {
  if (!evidence) return "未找到足够证据，不作结论"   // 不硬编
  const support = await citationSupported(claim, evidence)  // L139 校验
  return support ? claim : "该结论缺乏证据支持"
}

// ② 长文 token 优化：分层综合，不一次性塞全文
//   ❌ 把 100 段证据全塞进上下文
//   ✅ 先「分块总结」→ 再「跨块综合」→ 最后「精炼成稿」
async function synthesizeLong(sources) {
  const chunks = split(sources, 10)                    // 分块
  const summaries = await Promise.all(chunks.map(summarize))  // 块级总结
  return refine(await synthesize(summaries))           // 跨块综合 + 精炼
}
\`\`\`

:::deep

### 「无证据不下结论」是研究型的护栏核心

执行型 Agent 的护栏是「危险动作要确认」（人在回路），研究型 Agent 的护栏是「无证据不下结论」（证据门槛）。这两者都是「把不可靠的事挡在系统外」，只是挡的对象不同：前者挡副作用，后者挡幻觉。

:::

### 安全 + 成本验收点

- 证据不足时，明确说「未找到足够证据」，不硬编。
- 每条结论都过溯源校验（L139），不支持就明说。
- 长文场景用分层综合，控制单次上下文长度。
- token 成本可度量，长报告不会爆上下文。

:::warn

### 「分层综合」会丢失细节，要平衡

长文 token 优化的「分块总结 → 跨块综合」会牺牲细节。对需要精确引用的关键结论，必须回到原始证据核对（溯源校验），不能只信「块级总结」——否则会把「总结的失真」当成「原文结论」。

:::

`,
  null,
  [
    {
      text: '研究型 Agent 的安全重点是？',
      options: ['副作用隔离', '防幻觉（无证据不下结论 + 溯源校验）', '权限控制', '沙箱'],
      answer: 1,
      explain: '研究型防幻觉。',
      concept: 'cap-b-safety',
    },
    {
      text: '「无证据不下结论」是研究型的？',
      options: ['性能优化', '护栏核心（挡幻觉）', 'UI 设计', '部署'],
      answer: 1,
      explain: '证据门槛是护栏。',
      concept: 'cap-b-safety',
    },
    {
      text: '长文 token 优化的风险是？',
      options: ['太快', '分层综合丢失细节，关键结论须回到原文核对', '太贵', '没必要'],
      answer: 1,
      explain: '总结失真不能当原文。',
      concept: 'cap-b-safety',
    },
  ],
  [
    ['证据门槛', '无证据不下结论'],
    ['分层综合', '分块总结 → 跨块综合 → 精炼'],
    ['防幻觉', '防止编造内容与引用'],
  ],
  ['证据不足也硬编结论，把「可能」写成「确定」。', '分层综合后不回到原文核对，把总结失真当原文结论。'],
)
