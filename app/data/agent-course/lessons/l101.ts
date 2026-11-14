import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 18 ========== */

export const L101 = withKind(
  L(
    'L101',
    18,
    '对照：用 OpenAI Agents SDK 重写运行时 + 多 Agent handoffs（对比 L36 / L68）',
    3,
    ['L100', 'L36', 'L68'],
    ['oa-rewrite'],
    [
      '用 OpenAI Agents SDK 重写运行时与多 Agent handoffs',
      '对比 L36 手写运行时与 L68 手写多 Agent',
      '度量代码量与可控性的差异',
    ],
    `
### 同一运行时，SDK 版

把 L36 的 runAgent 和 L68 的 supervisor 用 OpenAI Agents SDK 重写，看代码量缩了多少、可控性让渡了多少。

\`\`\` title="运行时重写（对照 L36）" note="代码量：手写 runAgent 40 行 → SDK 5 行；supervisor 编排 → handoffs 声明。"
// 手写版（L36）：runAgent 约 40 行（循环+终止+错误恢复）
// SDK 版：
const agent = new Agent({
  name: "assistant",
  instructions: SYSTEM_PROMPT,
  tools: [searchTool],
})
const result = await run(agent, prompt, { maxTurns: 10 })  // maxSteps → maxTurns

// 多 Agent handoffs（对照 L68 supervisor）
const researcher = new Agent({ name: "researcher", ... })
const writer = new Agent({ name: "writer", ... })
researcher.handoffs = [writer]          // researcher 完成后交接给 writer
const result2 = await run(researcher, task)
\`\`\`

:::deep

### 度量的差异

代码量：SDK 版大幅缩短（循环/终止/回填都内置）。可控性：让渡明显——maxTurns 之外，循环细节、错误处理策略都由 SDK 决定，你只能通过配置微调。运行时位置：SDK 的 run() 是「请求内执行」，session 状态由 SDK 的 session 机制管理。

:::

### 对照结论

- SDK 版适合：快速原型、标准多 Agent 交接、不想管循环细节。
- 手写版适合：需要精细控制循环、错误策略、成本优化。
- handoffs 的「链式」与手写 supervisor 的「集中调度」是设计取舍，不是优劣。

:::warn

### handoffs 的隐式行为

handoff 时 SDK 会自动传递上下文，但「传了什么」由 SDK 决定。如果你需要精确控制交接内容（如 L68 的结果溯源），手写 supervisor 更可控。

:::

`,
    null,
    [
      {
        text: 'L36 手写的 `maxSteps` 在 SDK 里对应？',
        options: ['handoffs', 'run 的 maxTurns 参数', 'guardrail', 'session'],
        answer: 1,
        explain: 'maxSteps → maxTurns。',
        concept: 'oa-rewrite',
      },
      {
        text: 'SDK 版相比手写版的主要让渡是？',
        options: ['代码量', '循环细节、错误策略的精细控制', '工具数量', '模型选择'],
        answer: 1,
        explain: '循环与错误策略被 SDK 接管。',
        concept: 'oa-rewrite',
      },
      {
        text: '需要精确控制交接内容时，选？',
        options: ['SDK handoffs', '手写 supervisor（可精确控制传什么）', '无所谓', '随机'],
        answer: 1,
        explain: '精确控制用手写。',
        concept: 'oa-rewrite',
      },
    ],
    [
      ['maxTurns', 'SDK 中对应 maxSteps 的步数上限'],
      ['handoffs 声明', '用声明式交接替代手写编排'],
      ['控制让渡', '框架接管后失去的精细控制'],
    ],
    ['需要精细控制时仍用 SDK，被隐式行为坑。', '把 handoffs 的链式交接当集中调度，设计错位。'],
  ),
  'framework',
)
