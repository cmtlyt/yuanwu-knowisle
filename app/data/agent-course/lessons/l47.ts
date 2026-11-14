import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 6 ========== */

export const L47 = withKind(
  L(
    'L47',
    6,
    '接入一个 MCP Server 并让 Agent 用起来（手写 Client → SDK Client）',
    3,
    ['L46'],
    ['mcp-integration'],
    [
      '实现一个 MCP Client，把远程工具接进自己的 Agent',
      '理解「工具发现 → 转成 Function Calling 工具 → 调用」的桥接',
      '对照手写 Client 与 SDK Client 的差异',
    ],
    `
### 让 Agent 用上 MCP 工具

MCP Server 只是「提供工具」，要让 Agent 真正用它，需要一个 Client 把 MCP 工具**桥接**成 Agent 认识的 Function Calling 工具。

\`\`\` title="手写 Client：发现 + 调用 + 桥接" note="关键桥接：\\\`tools/list\\\` 的 inputSchema 直接喂给 Function Calling，\\\`tools/call\\\` 包装成 \\\`run\\\`。"
// ① 启动 Server 子进程，建立 stdio 通道
const proc = spawn("node", ["weather-server.mjs"], { stdio: ["pipe", "pipe", "inherit"] })

// ② tools/list 发现工具
const toolsList = await rpc(proc, "tools/list", {})
//   → [{ name: "search_weather", inputSchema: {...} }]

// ③ 桥接：把 MCP 工具转成 Agent 的 Function Calling 工具
const agentTools = toolsList.tools.map((t) => ({
  name: t.name,
  parameters: t.inputSchema,               // 直接复用 inputSchema
  run: async (args) => {
    const res = await rpc(proc, "tools/call", { name: t.name, arguments: args })
    return res.content[0].text              // 取回文本结果
  },
}))

// ④ 交给 L42 的 FC 运行时，Agent 即可调用
runWithTools(client, agentTools, prompt)
\`\`\`

:::deep

### Client 的职责

Client 要处理：进程生命周期（启动/关闭）、JSON-RPC 的请求响应匹配、tools/list 与 tools/call 的封装、把 MCP 工具「翻译」成 Agent 工具。SDK 的 \\\`Client\\\` 类把这些都封装了。

:::

### 桥接的三个映射

- MCP \\\`tools/list\\\` → Agent 工具的声明（name + schema）。
- MCP \\\`tools/call\\\` → Agent 工具的 run 函数。
- MCP \\\`content[]\\\` → Agent 的 Observation 文本。

:::warn

### 进程生命周期要管好

stdio Server 是子进程：Agent 不用它时要关闭进程、释放句柄，否则会泄漏。SDK Client 有 \\\`close()\\\`，手写版要自己记得。

:::

`,
    null,
    [
      {
        text: '让 Agent 用上 MCP 工具，Client 的核心工作是？',
        options: ['写 UI', '把 MCP 工具桥接成 Agent 认识的 Function Calling 工具', '训练模型', '存数据'],
        answer: 1,
        explain: '发现 + 调用 + 桥接。',
        concept: 'mcp-integration',
      },
      {
        text: '桥接中，MCP `tools/call` 对应 Agent 工具的？',
        options: ['名字', 'run 函数', 'schema 声明', '文档'],
        answer: 1,
        explain: 'tools/call 包装成 run 函数。',
        concept: 'mcp-integration',
      },
      {
        text: 'stdio Server 不用时要做什么？',
        options: ['留着不管', '关闭子进程、释放句柄，防止泄漏', '重启', '删除'],
        answer: 1,
        explain: '进程生命周期要管理，否则泄漏。',
        concept: 'mcp-integration',
      },
    ],
    [
      ['Client 桥接', '把 MCP 工具翻译成 Agent Function Calling 工具'],
      ['tools/list', 'MCP 的工具发现方法'],
      ['tools/call', 'MCP 的工具调用方法'],
    ],
    [
      '不管理子进程生命周期，反复接入导致句柄/进程泄漏。',
      '把 MCP 工具与 Agent 工具当成两套，忘了桥接这一层。',
    ],
  ),
  'practice',
)
