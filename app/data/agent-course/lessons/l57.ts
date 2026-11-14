import { L } from '../../course-builders.ts'

/* ========== Stage 8 ========== */

export const L57 = L(
  'L57',
  8,
  '多路径投票的工程实现（Self-Consistency）',
  16,
  3,
  ['L25'],
  ['voting-impl'],
  [
    '用 TS 实现 Self-Consistency 的采样 + 投票',
    '处理「答案提取」与「并行采样」的工程细节',
    '理解投票失效的边界与改进手段',
  ],
  `
### 把 L25 的投票写成代码

Self-Consistency 的工程难点在「如何从自由文本里可靠提取答案」和「如何高效并行采样」。

\`\`\` title="投票实现" note="关键：\\\`extractFinalAnswer\\\` 用「最后一行」约定来可靠提取答案，避免把中间推理当答案。"
async function selfConsistency(problem: string, { n = 5 } = {}) {
  // ① 并行采样 n 条独立推理链（调高温度增加多样性）
  const chains = await Promise.all(
    Array.from({ length: n }, () =>
      client.chat([{ role: "user", content: problem + "\\\\n请逐步推理，最后一行单独给出最终答案。" }], { temperature: 0.7 }),
    ),
  )

  // ② 提取：从每条链取「最终答案」
  const answers = chains.map(extractFinalAnswer)  // 用「最后一行」或结构化标记

  // ③ 投票：取众数
  const winner = mode(answers)
  return { answer: winner, votes: countOf(winner), chains, answers }
}
\`\`\`

:::deep

### 答案提取是隐藏难点

模型可能把答案写在中间、写在一句话里、或用不同措辞表达同一答案。可靠的提取策略：① 约定「最后一行是答案」；② 用结构化标记 \\\`<answer>42</answer>\\\`；③ 对措辞差异做归一化（"四十二" 与 "42" 归一）。

:::

### 投票失效的两种场景

- 答案不唯一：开放式创作无法比众数。
- 多样性不足：温度太低导致 n 条链几乎相同，投票退化为单次。

:::warn

### 投票对错是「多数对」的假设

Self-Consistency 隐含假设「正确答案在多数采样中出现」。如果模型系统性都错（如都没理解题意），投票只会「一致地错」。

:::

`,
  null,
  [
    {
      text: 'Self-Consistency 工程实现的隐藏难点是？',
      options: ['并行采样', '从自由文本里可靠提取最终答案', '调温度', '写 prompt'],
      answer: 1,
      explain: '答案提取是最容易踩坑的环节。',
      concept: 'voting-impl',
    },
    {
      text: '可靠提取答案的策略不包括？',
      options: ['约定最后一行是答案', '结构化标记 <answer>', '措辞归一化', '随机取一行'],
      answer: 3,
      explain: '随机取一行不可靠。',
      concept: 'voting-impl',
    },
    {
      text: '投票失效的场景是？',
      options: ['数学题', '答案不唯一（开放式）或多样性不足', '逻辑题', '代码题'],
      answer: 1,
      explain: '答案不唯一或采样重复时投票失效。',
      concept: 'voting-impl',
    },
  ],
  [
    ['众数投票', '取出现次数最多的答案'],
    ['答案提取', '从推理链中可靠取出最终答案'],
    ['归一化', '把不同措辞的同一答案归并'],
  ],
  ['答案提取不可靠，把中间推理当最终答案去投票。', '模型系统性错误时仍信投票，「一致地错」。'],
)
