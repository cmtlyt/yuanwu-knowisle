import { L } from '../../course-builders.ts'

/* ========== Stage 5 ========== */

export const L42 = L(
  'L42',
  5,
  '实战：不依赖框架实现 Function Calling 运行时',
  20,
  4,
  ['L39', 'L41'],
  ['fc-runtime'],
  [
    '用 TS 实现完整的 Function Calling 运行时（解析→执行→回填）',
    '处理 tool_calls 的解析、并行执行、结果回填',
    '对照 OpenAI Agents SDK 与 Vercel AI SDK 的 tool()',
  ],
  `
### 把 L38 的闭环写成完整运行时

本课把「声明工具 → 解析 tool_calls → 并行/串行执行 → 回填结果」整合成一个可运行的 Function Calling 运行时。

\`\`\` title="FC 运行时（完整）" note="关键：用同一份 zod schema 做参数校验（L39），tool_calls 并行执行（L41），错误作为 tool 消息回填。"
async function runWithTools(client, tools, prompt, { maxSteps = 10 } = {}) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]
  for (let i = 0; i < maxSteps; i++) {
    const res = await client.chat({ messages, tools: toToolSchemas(tools) })
    const msg = res.choices[0].message
    messages.push(msg)

    if (msg.content && !msg.tool_calls) return msg.content   // 纯文本结束
    if (!msg.tool_calls?.length) continue

    // 并行执行所有 tool_calls，回填结果
    const results = await Promise.all(msg.tool_calls.map(async (tc) => {
      const tool = tools[tc.function.name]
      if (!tool) return { tool_call_id: tc.id, content: "未知工具" }
      try {
        const args = tool.schema.parse(JSON.parse(tc.function.arguments))
        const out = await tool.run(args)
        return { tool_call_id: tc.id, content: JSON.stringify(out) }
      } catch (e) {
        return { tool_call_id: tc.id, content: "错误：" + (e as Error).message }
      }
    }))
    messages.push(...results.map((r) => ({ role: "tool", ...r })))
  }
  throw new Error("超出最大步数")
}
\`\`\`

:::deep

### 框架对照：SDK 的 tool()

OpenAI Agents SDK 的 \\\`tool()\\\` 装饰器自动生成 Schema、自动解析参数、自动回填；Vercel AI SDK 的 \\\`tool()\\\` 类似。你手写的 \\\`runWithTools\\\` 里每一步（schema、parse、执行、回填）都对应 SDK 替你封装的一环。

:::

### 这个运行时已具备的能力

- 结构化工具调用（不再靠正则）。
- zod 参数校验（不合法直接报错回填）。
- 并行执行无依赖工具。
- 错误作为 Observation 回填，模型可自我纠错。

:::warn

### content 与 tool_calls 可能同时存在

有些模型会在返回文本的同时附带 tool_calls。处理时要「先处理 tool_calls，文本也保留进上下文」，不要二选一丢了信息。

:::

`,
  null,
  [
    {
      text: 'FC 运行时中，工具参数校验用哪份 Schema？',
      options: ['给模型看的另一份', '同一份 zod schema（单一事实来源）', '不校验', '正则'],
      answer: 1,
      explain: '同一份 zod 定义，生成与校验共用。',
      concept: 'fc-runtime',
    },
    {
      text: '模型返回的 tool_calls 如何执行？',
      options: ['总是串行', '无依赖的并行执行（Promise.all），有依赖串行', '只执行第一个', '不执行'],
      answer: 1,
      explain: '无依赖并行、有依赖串行。',
      concept: 'fc-runtime',
    },
    {
      text: 'content 与 tool_calls 同时存在时，正确处理是？',
      options: [
        '只处理 tool_calls 丢掉文本',
        '先处理 tool_calls，文本也保留进上下文',
        '只处理文本',
        '都丢掉',
      ],
      answer: 1,
      explain: '两者都要保留，不要二选一丢信息。',
      concept: 'fc-runtime',
    },
  ],
  [
    ['toToolSchemas', '把工具定义转成模型可理解的 tool 列表'],
    ['tool_calls 回填', '把执行结果以 tool role 写回上下文'],
    ['zod 校验', '执行前用 schema 校验模型参数'],
  ],
  ['跳过参数校验直接执行，模型传错类型导致运行时崩溃。', '把无依赖的工具串行执行，白白增加延迟。'],
)
