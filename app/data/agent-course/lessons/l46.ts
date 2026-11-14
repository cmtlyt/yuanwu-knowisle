import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 6 ========== */

export const L46 = withKind(
  L(
    'L46',
    6,
    '对照：用官方 TS SDK 重写同一个 Server',
    3,
    ['L45'],
    ['mcp-sdk'],
    [
      '用 @modelcontextprotocol/sdk 重写 L45 的同一个 Server',
      '对比手写版与 SDK 版的代码量与健壮性',
      '理解 SDK 补上了哪些工程细节',
    ],
    `
### 同一个 Server，两种写法

用官方 SDK 重写 L45 的天气 Server，直接对比：同样的 tools/list、tools/call，SDK 替你处理了分帧、并发、错误分类、类型。

\`\`\` title="SDK 版 Server" note="对比手写版：\\\`server.tool(name, schema, handler)\\\` 一句就完成「声明工具 + zod 校验 + 注册 handler」。"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const server = new McpServer({ name: "weather", version: "1.0.0" })

server.tool("search_weather",
  { city: z.string().describe("城市名") },
  async ({ city }) => ({ content: [{ type: "text", text: await searchWeather(city) }] }),
)

await server.connect(new StdioServerTransport())
\`\`\`

:::deep

### SDK 补上了什么

① 分帧：长度前缀 + 转义，内容含换行也不会坏。② 并发：request id 自动匹配，并发请求不乱。③ 错误分类：标准 JSON-RPC 错误码。④ 类型：zod 直接生成 inputSchema。⑤ 更多 transport：一行换成 SSE 或流式 HTTP。

:::

### 手写 vs SDK 对比

- 代码量：手写 ~50 行、SDK ~10 行。
- 健壮性：SDK 处理了分帧/并发/错误/类型，手写版要自己补。
- 可控性：手写版你完全掌握每个字节；SDK 是黑盒（但开箱即用）。

:::tip

### 这正是「先手写、后框架」的价值

先手写让你知道 SDK 内部在干什么、坑在哪（如换行分帧）；再用 SDK 享受它的工程细节。出了问题你不会对着 SDK 文档干瞪眼。

:::

`,
    null,
    [
      {
        text: 'SDK 版 `server.tool(name, schema, handler)` 一句完成了什么？',
        options: ['只注册名字', '声明工具 + zod 校验 + 注册 handler', '只生成文档', '只连数据库'],
        answer: 1,
        explain: '一句完成声明、校验、注册。',
        concept: 'mcp-sdk',
      },
      {
        text: 'SDK 相比手写版补上的工程细节不包括？',
        options: ['分帧（长度前缀/转义）', '并发 request id 匹配', '错误分类', '工具的实际业务逻辑'],
        answer: 3,
        explain: '业务逻辑（查天气）仍要你自己写。',
        concept: 'mcp-sdk',
      },
      {
        text: '换一种 transport（如 SSE）时，SDK 版需要？',
        options: ['重写整个 Server', '一行换成新的 Transport 类', '改协议', '换语言'],
        answer: 1,
        explain: 'transport 可插拔，一行切换。',
        concept: 'mcp-sdk',
      },
    ],
    [
      ['McpServer', 'SDK 的 Server 构建器'],
      ['server.tool', '声明工具 + schema + handler 的便捷方法'],
      ['可插拔 transport', '同一 Server 可换 stdio/SSE/流式'],
    ],
    [
      '跳过手写直接上 SDK，出问题时对内部机制一无所知。',
      '以为 SDK 连业务逻辑都替你写了——工具实际逻辑仍需自己实现。',
    ],
  ),
  'practice',
)
