import { L } from '../../course-builders.ts'

/* ========== Stage 18 ========== */

export const L100 = L(
  'L100',
  18,
  'OpenAI Agents SDK 核心概念：Agent / run / handoff / guardrail / session / tracing',
  14,
  3,
  ['L93'],
  ['oa-core'],
  [
    '掌握 OpenAI Agents SDK 的六大核心概念',
    '理解 `run()` 内置的 agent loop',
    '认识 handoff 与 guardrail 的定位',
  ],
  `
### 轻量的多 Agent 工作流

OpenAI Agents SDK（\\\`@openai/agents\\\`）定位「轻量多 Agent」：核心是 \\\`Agent\\\`（角色 + 指令 + 工具），\\\`run()\\\` 内置 agent loop，\\\`handoff\\\` 让 Agent 交接，\\\`guardrail\\\` 做护栏。

\`\`\` title="六概念速览" note="关键：\\\`run(agent, ...)\\\` 就是 L36 手写的 \\\`runAgent\\\`——SDK 内置了循环/终止/工具回填。"
import { Agent, functionTool, run } from "@openai/agents"

// ① Agent：角色 + 指令 + 工具
const agent = new Agent({
  name: "assistant",
  instructions: "你是一个助手。",
  tools: [searchTool],
})

// ② run：内置 agent loop（对应你手写的 runAgent）
const result = await run(agent, "查天气")

// ③ handoff：把对话交给另一个 Agent
const support = new Agent({ name: "support", ... })
agent.handoffs = [support]

// ④ guardrail：输入/输出护栏（L102）
// ⑤ session：会话状态管理
// ⑥ tracing：内置追踪（自动成 span）
\`\`\`

:::deep

### run() 替你做了什么

\\\`run()\\\` 内部：循环、工具调用、finish 检测、错误回填、追踪、session 状态——这些你前面全部手写过（L36/L42/L75）。SDK 把它们打包了，这正是「先手写、后框架」让你能看懂它的底气。

:::

### 六概念职责

- Agent：角色 + 指令 + 工具 + handoffs。
- run：内置 agent loop，执行一次任务。
- handoff：链式交接给另一个 Agent。
- guardrail：输入/输出护栏。
- session：跨轮会话状态。
- tracing：内置追踪。

:::warn

### handoff 是「链式」不是「集中调度」

OpenAI Agents 的 handoff 是一个 Agent 把对话「交棒」给下一个（链式），与 L68 手写的 supervisor（集中调度）不同。两种编排模式的差异见 L69。

:::

`,
  null,
  [
    {
      text: '`run(agent, ...)` 对应你手写的什么？',
      options: ['parseReAct', 'runAgent（内置循环/终止/工具回填）', 'tool schema', 'Tracer'],
      answer: 1,
      explain: 'run() 内置 agent loop。',
      concept: 'oa-core',
    },
    {
      text: 'handoff 的编排模式是？',
      options: ['集中调度', '链式交接（一个交棒给下一个）', '群聊', '图 workflow'],
      answer: 1,
      explain: 'handoff 是链式交接。',
      concept: 'oa-core',
    },
    {
      text: 'SDK 的 run() 替你打包了哪些你已手写的能力？',
      options: ['只循环', '循环、工具调用、finish、错误回填、追踪、session', '只追踪', '只工具'],
      answer: 1,
      explain: '循环/工具/finish/回填/追踪/session。',
      concept: 'oa-core',
    },
  ],
  [
    ['Agent', '角色 + 指令 + 工具 + handoffs'],
    ['run', '内置 agent loop 的执行入口'],
    ['handoff', '把对话交接给另一个 Agent'],
  ],
  ['把 handoff 当集中调度，混淆编排模式。', '不理解 run() 内部，出问题时对着 SDK 干瞪眼。'],
)
