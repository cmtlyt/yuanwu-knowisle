import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 16 ========== */

export const L95 = withKind(
  L(
    'L95',
    16,
    '版本锁定表回顾 + TS 工程模板（框架无关骨架）',
    2,
    ['L03'],
    ['framework-template'],
    [
      '回顾全课框架版本锁定表（附录 B 落地口径）',
      '搭建一个「框架无关」的 TS 工程模板，便于各框架对照',
      '理解「骨架统一、实现可换」的对照基础',
    ],
    `
### 统一的骨架，可换的实现

对照各框架前，先有一个**框架无关的 TS 工程模板**：定义好 Agent 的核心接口（LlmClient、Tool、run），每个框架的对照实现都填进同一骨架。

\`\`\` title="框架无关骨架" note="关键：统一 \\\`Agent\\\` 接口，各框架实现它，对照才公平、可替换。"
// src/core.ts —— 框架无关的接口契约
interface Tool { name: string; schema: object; run(args: unknown): Promise<unknown> }
interface Agent {
  run(task: string, tools: Tool[]): Promise<{ ok: boolean; result?: string }>
}

// 每个框架的对照实现，都实现同一个 Agent 接口
// src/langgraph/agent.ts   → implements Agent（用 LangGraph）
// src/openai/agent.ts      → implements Agent（用 OpenAI Agents）
// src/mastra/agent.ts      → implements Agent（用 Mastra）
// src/ai-sdk/agent.ts      → implements Agent（用 AI SDK）

// 这样对照时，换框架只换实现，调用方不变
\`\`\`

:::deep

### 版本锁定表回顾（落地口径）

实现语言 TS 7、运行环境 Node 24；框架对照：@langchain/langgraph@1.x、langchain@1.x、@openai/agents@0.22.x、@mastra/core@1.82.x、ai@7.0.x、llamaindex@0.12.x、@modelcontextprotocol/sdk@1.x、langsmith@0.12.x。正文不硬编码小版本，统一以 META 为准。

:::

### 工程模板的三个约定

- 接口先行：核心接口（Tool / Agent）先定，实现后填。
- 按框架分目录：每个框架一个子目录，互不干扰。
- 统一入口：所有框架实现都从同一 main 调用，方便跑对照。

:::warn

### 别把框架装进核心

核心接口（core.ts）绝不能 import 任何框架。一旦核心耦合了某个框架，换框架就得改核心，失去对照的意义。

:::

`,
    null,
    [
      {
        text: '框架无关骨架的核心是？',
        options: ['多装框架', '统一 Agent/Tool 接口，各框架实现同一接口', '不写代码', '随机实现'],
        answer: 1,
        explain: '接口先行、实现可换。',
        concept: 'framework-template',
      },
      {
        text: '为什么核心接口不能 import 框架？',
        options: ['太慢', '核心耦合框架后，换框架就得改核心，失去对照意义', '太贵', '太复杂'],
        answer: 1,
        explain: '核心要框架无关。',
        concept: 'framework-template',
      },
      {
        text: '统一 Agent 接口的价值是？',
        options: ['好看', '换框架只换实现、调用方不变，对照公平可替换', '更快', '省 token'],
        answer: 1,
        explain: '实现可换、对照公平。',
        concept: 'framework-template',
      },
    ],
    [
      ['框架无关骨架', '统一接口、实现可换的工程模板'],
      ['接口先行', '先定 Tool/Agent 接口、后填实现'],
      ['按框架分目录', '每个框架一个子目录'],
    ],
    ['核心耦合框架，换框架要改核心。', '各框架实现不统一接口，对照不公平。'],
  ),
  'framework',
)
