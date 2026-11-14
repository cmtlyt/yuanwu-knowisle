import { L } from '../../course-builders.ts'

/* ========== Stage 1 ========== */

export const L06 = L(
  'L06',
  1,
  'Agent 到底是什么：用三个反例说清边界',
  12,
  1,
  ['L01'],
  ['agent-boundary'],
  [
    '用「反例」精确划出 Agent 与普通程序 / 单次 LLM 调用的边界',
    '理解 Agent 的本质特征：自主地「决定下一步」',
    '避免把任何用到 LLM 的东西都叫 Agent',
  ],
  `
### 三个反例，划出边界

「Agent」这个词被用滥了。最有效的定义方式是反例：什么东西**不是** Agent。

### 反例一：一次普通 LLM 调用

- 你把 prompt 发过去，拿回一个回答，用完即止。
- 没有循环、没有工具、没有「模型决定下一步」——它只是一次函数调用。
- 即便它用了 function calling 返回一个工具名，只要你手动执行、手动回填，也不是 Agent。

### 反例二：写死流程的「自动化」

- 脚本固定地「查数据库 → 调模型 → 发邮件」，每一步顺序由代码写死。
- 模型只是流程中的一个组件，不决定「下一步做什么」。
- 它是 automation（自动化），不是 agent。

### 反例三：不带工具的固定循环

- 一个 \\\`while(true) { reply = chat(history); history.push(reply) }\\\` 的死循环。
- 有循环，但没有任何目标判断与工具能力，模型只能自说自话。
- 它缺失了「能对世界产生动作」的闭环，也不是完整意义上的 Agent。

:::deep

### Agent 的正向定义

Agent = 一个能**在循环中自主决定下一步动作**、并**通过工具与环境交互**、**朝着目标收敛**的系统。三个关键词：循环（loop）、工具（tools）、目标（goal）。缺任何一个，都退化为普通程序或单次调用。

:::

\`\`\` title="一个最小 Agent 的形状（伪码）" note="注意 \\\`model.decideNextStep\\\` 是这个形状的灵魂——它区别于「代码写死流程」的自动化。"
while (!goalReached(state)) {
  const action = await model.decideNextStep(context)   // 模型决定下一步
  const observation = await tools[action.tool](action.args)  // 工具产生观测
  context.push({ action, observation })                // 观测回填上下文
}
// 关键：决定「下一步做什么」的是模型，不是写死的 if-else
\`\`\`

`,
  null,
  [
    {
      text: '下面哪个**不是** Agent？',
      options: [
        '在循环中自主决定下一步并用工具交互的系统',
        '一次用完即止的 LLM 调用',
        '带工具与目标判断的循环系统',
        '能通过工具与环境交互的循环',
      ],
      answer: 1,
      explain: '单次 LLM 调用没有循环、没有工具、没有「模型决定下一步」，不是 Agent。',
      concept: 'agent-boundary',
    },
    {
      text: 'Agent 的三个关键词是？',
      options: [
        '模型、prompt、token',
        '循环（loop）、工具（tools）、目标（goal）',
        '训练、推理、部署',
        '输入、输出、反馈',
      ],
      answer: 1,
      explain: '循环、工具、目标，缺一个都退化为普通程序或单次调用。',
      concept: 'agent-boundary',
    },
    {
      text: '「查数据库 → 调模型 → 发邮件」的写死流程脚本是 Agent 吗？',
      options: [
        '是，因为它用了 LLM',
        '不是，它是 automation，模型不决定下一步',
        '是，因为有多个步骤',
        '取决于模型大小',
      ],
      answer: 1,
      explain: '顺序由代码写死，模型只是流程组件、不决定下一步，是自动化而非 Agent。',
      concept: 'agent-boundary',
    },
  ],
  [
    ['Agent', '在循环中自主决定下一步、通过工具与环境交互、朝目标收敛的系统'],
    ['automation', '流程写死、模型不决定下一步的自动化脚本'],
    ['下一步决策', '由模型（而非代码）决定要采取的动作'],
  ],
  [
    '把任何用到 LLM 的东西都叫 Agent，导致概念混乱、选型失误。',
    '以为「有 while 循环」就是 Agent，忽略了目标判断与工具能力。',
  ],
)
