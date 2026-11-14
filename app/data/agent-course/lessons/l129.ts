import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L129 = withKind(
  L(
    'L129',
    26,
    '实战 Capstone A：从零实现核心运行时 + 工具 + 手写 MCP',
    4,
    ['L128'],
    ['cap-a-runtime'],
    [
      '从零实现一个带终止条件、可错误恢复的核心运行时',
      '从零实现工具层与 Function Calling 运行时',
      '从零手写 MCP 协议并接入外部系统',
    ],
    `
### 运行时是 Capstone A 的心脏

本课从零实现三件事：核心运行时（循环 + 终止 + 错误恢复）、工具层（FC 运行时）、MCP 接入（手写协议）。不复用 L36/L42/L45，但在思路上与之一脉相承。

\`\`\` title="从零实现核心运行时 + 工具（不复用前期代码）" note="关键：终止条件、错误回填、工具执行——这三件事从零手写，可控性拉满。"
type LoopState = { messages: Msg[]; steps: number }

async function run(tools: ToolMap, mcp: McpClient, task: string) {
  const state: LoopState = { messages: [user(task)], steps: 0 }
  while (true) {
    if (state.steps >= MAX_STEPS) throw new Error("超过步数上限")  // 终止
    const resp = await callModel(state.messages, toolSchemas(tools))

    if (resp.toolCalls.length === 0) return resp.text        // 无工具调用 = 结束
    for (const tc of resp.toolCalls) {
      try {
        const out = await exec(tools, mcp, tc)   // 执行工具 / MCP 工具
        state.messages.push(toolResult(tc.id, out))
      } catch (e) {
        state.messages.push(toolResult(tc.id, \\\`错误: \\\${e}\\\`))  // 错误回填，不崩
      }
    }
    state.steps++
  }
}
\`\`\`

:::deep

### 手写 MCP：只写「够用」的协议子集

Capstone A 只需 MCP 的「工具发现 + 调用」能力，不需要完整协议。手写一个最小 JSON-RPC：\\\`tools/list\\\` 发现工具、\\\`tools/call\\\` 调用工具，走 stdio transport（对照 L45）。够用、可控、无框架依赖。

:::

### 本课三个交付物的验收点

- 运行时：能跑通「多步工具调用 → 返回结果」，步数上限生效，工具报错不崩。
- 工具层：模型输出能解析成工具调用，执行后正确回填。
- MCP：能发现并调用一个外部 Server 的工具，与本地工具无差别。
- 错误恢复：任一工具失败，Agent 能据错误信息调整再试。

:::tip

### 先把「最小闭环」跑通，再扩展

不要一开始就实现完整运行时 + 完整 MCP。先跑通「一个工具 + 一次调用 + 一次回填」的最小闭环，再逐步加终止条件、错误恢复、MCP 接入。这是所有从零实战的正确节奏。

:::

`,
    null,
    [
      {
        text: 'Capstone A 核心运行时的三件事是？',
        options: ['渲染/存储/网络', '循环 + 终止 + 错误恢复', 'UI/路由/鉴权', '训练/评测/部署'],
        answer: 1,
        explain: '循环、终止、错误恢复。',
        concept: 'cap-a-runtime',
      },
      {
        text: '手写 MCP 时，Capstone A 只需哪两个能力？',
        options: ['鉴权 + 计费', '工具发现（tools/list）+ 调用（tools/call）', '文件 + 网络', '日志 + 监控'],
        answer: 1,
        explain: '够用即可，无需完整协议。',
        concept: 'cap-a-runtime',
      },
      {
        text: '「错误回填」的做法是？',
        options: ['让程序崩溃', '把错误信息作为工具结果回填，让模型据错调整', '忽略错误', '记录后退出'],
        answer: 1,
        explain: '错误回填、不崩、可恢复。',
        concept: 'cap-a-runtime',
      },
    ],
    [
      ['工具调用解析', '把模型输出解析成结构化工具调用'],
      ['错误回填', '工具失败时把错误信息回填给模型'],
      ['最小闭环', '一个工具一次调用一次回填的可运行骨架'],
    ],
    [
      '一步到位实现「完整运行时」，而不是先跑通最小闭环。',
      '工具失败直接抛异常崩溃，而不是错误回填让 Agent 自愈。',
    ],
  ),
  'capstone',
)
