import { L } from '../../course-builders.ts'

/* ========== Stage 6 ========== */

export const L44 = L(
  'L44',
  6,
  'MCP 三件套：Host / Client / Server，transport',
  12,
  2,
  ['L43'],
  ['mcp-triad'],
  [
    '厘清 MCP 的 Host / Client / Server 三者角色',
    '理解 transport（stdio / SSE / 流式）的差异',
    '掌握 JSON-RPC 在 MCP 中的基础地位',
  ],
  `
### 三个角色，两种传输

MCP 架构里有三个角色：**Host**（宿主应用，如 Claude Desktop）、**Client**（协议客户端，通常内嵌在 Host 里）、**Server**（提供工具/资源的服务）。它们之间用 JSON-RPC 通信，通过 transport 连接。

\`\`\` title="三件套与 JSON-RPC" note="JSON-RPC 是 MCP 的「语言」：method 表示要做什么（tools/list、tools/call），id 关联请求与响应。"
Host (Claude Desktop)
  └─ Client ── JSON-RPC ── Server (提供工具)
       │
       └─ 通过 transport 连接

// JSON-RPC 消息形态
// 请求：{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
// 响应：{ "jsonrpc": "2.0", "id": 1, "result": { "tools": [...] } }
\`\`\`

### 三种 transport

- stdio：通过标准输入输出通信，Server 作为子进程启动，本地进程内最常用。
- SSE：通过 HTTP + Server-Sent Events，适合远程 Server。
- 流式 HTTP：更现代的流式 HTTP 传输，支持双向流。

:::deep

### 为什么先讲 stdio

stdio 最简单、最可靠（本地子进程、无网络），是理解 MCP 协议的最佳起点。L45 手写协议就用 stdio；SSE / 流式只是「把同样的 JSON-RPC 消息换个传输管道」。

:::

:::warn

### Host 与 Client 别混

Host 是「应用」（有界面、有交互），Client 是「协议客户端」（发 JSON-RPC 消息）。实际中 Client 常作为 Host 的一个模块存在，但协议层面它们是两个概念。

:::

`,
  null,
  [
    {
      text: 'MCP 的三个角色是？',
      options: ['模型、工具、用户', 'Host / Client / Server', '前端、后端、数据库', '请求、响应、缓存'],
      answer: 1,
      explain: 'Host、Client、Server。',
      concept: 'mcp-triad',
    },
    {
      text: 'MCP 的「语言」是什么？',
      options: ['SQL', 'JSON-RPC', 'GraphQL', 'gRPC'],
      answer: 1,
      explain: 'JSON-RPC：method 表示动作，id 关联请求响应。',
      concept: 'mcp-triad',
    },
    {
      text: '三种 transport 中最简单、最适合入门的是？',
      options: ['SSE', 'stdio（本地子进程、无网络）', '流式 HTTP', 'WebSocket'],
      answer: 1,
      explain: 'stdio 最可靠，适合理解协议本体。',
      concept: 'mcp-triad',
    },
  ],
  [
    ['Host', '宿主应用（有界面与交互，如 Claude Desktop）'],
    ['Client', '协议客户端，发 JSON-RPC 消息'],
    ['Server', '提供工具与资源的服务'],
    ['transport', 'Client 与 Server 之间的通信管道（stdio/SSE/流式）'],
  ],
  ['把 Host 与 Client 混为一谈。', '以为 SSE 与 stdio 是不同的协议——只是不同的 transport 管道。'],
)
