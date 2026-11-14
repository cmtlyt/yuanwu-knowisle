import { L } from '../../course-builders.ts'

/* ========== Stage 20 ========== */

export const L106 = L(
  'L106',
  20,
  'Vercel AI SDK 核心概念：ai 包 / provider / tool / streaming',
  14,
  3,
  ['L93'],
  ['ai-sdk-core'],
  [
    '掌握 Vercel AI SDK 的核心概念：ai 包 / provider / tool / streaming',
    '理解「聚焦模型交互层」的定位',
    '认识它与其它框架的分工差异',
  ],
  `
### 只做「模型交互」这一层

Vercel AI SDK（\\\`ai\\\` 包）定位「模型交互层」：provider（统一多供应商）、tool（工具调用）、streaming（流式）。它**不管**多 Agent 编排、记忆、RAG——那些由其它框架或你自己做。

\`\`\` title="AI SDK 核心概念" note="关键：\\\`tool()\\\` 与 L42 的 zod schema + run 对应；\\\`streamText\\\` 与 L37 的 async iterator 对应。"
import { generateText, streamText, tool } from "ai"
import { openai } from "@ai-sdk/openai"

// ① provider：统一多供应商（openai/anthropic/自定义）
const model = openai("gpt-4o-mini")

// ② tool：声明工具（zod 校验）
const weather = tool({
  description: "查天气",
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => "晴 18°C",
})

// ③ streaming：流式输出
const { textStream } = streamText({ model, prompt: "..." })
for await (const chunk of textStream) { /* 边生成边消费 */ }
\`\`\`

:::deep

### 分工的边界

AI SDK 是「模型交互层」，不是「Agent 框架」。它做得好的是：provider 切换、流式、工具调用。多 Agent 编排（L68）、记忆（L48）、可观测（L72）它都不做——这些你手写或用其它框架。

:::

### AI SDK 的定位

- 聚焦：provider / tool / streaming 三件事做到极致。
- 轻量：不强制编排范式，你可自由组合。
- 边界清晰：不碰多 Agent、记忆、RAG。

:::warn

### 别期待它「什么都有」

AI SDK 不提供多 Agent 编排、记忆、RAG。如果你需要这些，要么手写，要么配合其它框架（如 LangGraph / Mastra）。认清边界，避免「用了 AI SDK 又缺这缺那」。

:::

`,
  null,
  [
    {
      text: 'Vercel AI SDK 的核心概念是？',
      options: [
        'agent/workflow/memory',
        'ai 包 / provider / tool / streaming',
        '图/状态/reducer',
        'Agent/run/handoff',
      ],
      answer: 1,
      explain: 'ai/provider/tool/streaming。',
      concept: 'ai-sdk-core',
    },
    {
      text: 'AI SDK 的定位是？',
      options: ['多 Agent 编排框架', '模型交互层（provider/tool/streaming）', 'RAG 框架', '记忆框架'],
      answer: 1,
      explain: '聚焦模型交互层。',
      concept: 'ai-sdk-core',
    },
    {
      text: 'AI SDK 的 `tool()` 对应 L42 的什么？',
      options: ['runWithTools 整个', 'zod schema + run 的声明', '消息总线', 'Tracer'],
      answer: 1,
      explain: 'tool() 对应 zod schema + run。',
      concept: 'ai-sdk-core',
    },
  ],
  [
    ['provider', '统一多供应商的模型抽象'],
    ['tool()', '声明式工具（zod 校验 + execute）'],
    ['streamText', '流式文本生成'],
  ],
  ['期待 AI SDK 提供多 Agent/记忆/RAG，结果缺这缺那。', '把 AI SDK 当完整 Agent 框架用。'],
)
