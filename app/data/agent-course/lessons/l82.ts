import { L } from '../../course-builders.ts'

/* ========== Stage 13 ========== */

export const L82 = L(
  'L82',
  13,
  'LLM-as-Judge：用模型评模型（评分维度设计、偏差与缓解）',
  14,
  3,
  ['L81'],
  ['llm-as-judge'],
  [
    '理解 LLM-as-Judge 的机制与适用场景',
    '掌握评分维度设计、位置/自我偏好偏差与缓解',
    '用 TS 实现一个最小评审器',
  ],
  `
### 让模型当评委

有些质量（流畅、忠实、有帮助）难以用规则判定，只能让模型「读一读、打个分」。LLM-as-Judge 就是用模型评判另一个模型的输出。

\`\`\` title="最小 LLM 评审器" note="关键：维度明确、要求输出 JSON、用独立评审角色，避免「护短」。"
async function judge(response: string, criteria: string[]): Promise<number[]> {
  const prompt = [
    { role: "system", content: "你是评审。严格按以下维度打分（1-5），只输出 JSON。" },
    { role: "user", content: \\\`维度：\\\${criteria.join(", ")}\\\\n回答：\\\${response}\\\` },
  ]
  const raw = await client.chat(prompt)
  return JSON.parse(raw).scores   // [4, 5, 3] 对应各维度
}

// 评分维度示例：忠实性、相关性、简洁性
\`\`\`

:::deep

### 两大偏差与缓解

① 位置偏差：评审可能偏爱「排在前面的答案」。缓解：多次交换位置打分取平均。② 自我偏好偏差：模型偏爱「自己生成的」文本。缓解：用**不同的模型**当评审，或评审时屏蔽来源信息。

:::

### LLM-as-Judge 的三个注意点

- 维度要具体：打分维度要可操作（忠实性/相关性），不能是「好不好」。
- 要校准：用人工标注的样本校准评审器，避免评审器本身有偏。
- 不替代硬校验：事实对错仍要用规则/测试，LLM 评审只做「软质量」。

:::warn

### 评审器不是万能的

LLM-as-Judge 对「事实是否正确」不可靠（模型自己也会错）。事实校验用硬校验（L65），LLM 评审只用于「流畅、相关、有帮助」这类软质量。

:::

`,
  null,
  [
    {
      text: 'LLM-as-Judge 适合评什么？',
      options: ['事实对错', '流畅、忠实、有帮助等软质量', '数值精确', '格式合规'],
      answer: 1,
      explain: '软质量用 LLM 评审，硬事实用规则。',
      concept: 'llm-as-judge',
    },
    {
      text: '「位置偏差」指什么？',
      options: ['评审太快', '评审偏爱排在前面的答案', '评审太慢', '评审太贵'],
      answer: 1,
      explain: '位置偏差：偏爱前面的答案。',
      concept: 'llm-as-judge',
    },
    {
      text: '缓解「自我偏好偏差」的方法是？',
      options: ['用自己的模型', '用不同的模型评审，或屏蔽来源信息', '多评审几次', '忽略偏差'],
      answer: 1,
      explain: '换模型评审或屏蔽来源。',
      concept: 'llm-as-judge',
    },
  ],
  [
    ['LLM-as-Judge', '用模型评判另一个模型输出的质量'],
    ['位置偏差', '评审偏爱排前面的答案'],
    ['自我偏好偏差', '模型偏爱自己生成的文本'],
  ],
  ['用 LLM 评审「事实对错」，模型自己也会错。', '评审维度写成「好不好」，无法一致打分。'],
)
