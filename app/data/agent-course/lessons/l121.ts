import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 24 ========== */

export const L121 = withKind(
  L(
    'L121',
    24,
    'MCP 生态与工具市场速览',
    1,
    ['L47'],
    ['mcp-ecosystem'],
    [
      '了解 MCP 生态的构成：官方服务器 / 社区服务器 / 市场',
      '掌握挑选第三方 MCP Server 的评估清单',
      '认识「用现成 MCP」与「自建 MCP」的取舍',
    ],
    `
### MCP 从「协议」长成了「生态」

MCP 的价值在 L43 讲的是「统一接口」。当协议被广泛采用后，就出现了生态：官方参考服务器、社区服务器、以及各种「MCP 市场 / 目录」。你可以直接接入现成的 MCP Server，而不是每个工具都自己写。

\`\`\` title="接入一个第三方 MCP Server（对照 L47 自建）" note="关键：协议统一后，「接入现成 Server」和「接入自建 Server」是同一套代码。"
// 以接入「文件系统」官方参考 Server 为例（stdio transport）
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/dir"]
    }
  }
}
// Agent 侧：连上后 tools/list 就能发现 read_file / write_file 等工具
// 与 L47 自建 Server 的发现/调用流程完全一致——这正是协议的价值
\`\`\`

:::deep

### 生态的复利：一次协议，处处复用

MCP 生态的复利在于：你的 Agent 学会「接 MCP」后，所有 MCP Server——不管是官方的、社区的、还是你自己写的——都能用同一套 client 接入。这就是 L43 说的「告别每家一套工具接口」在生态层的兑现。

:::

### 挑选第三方 MCP Server 的评估清单

- 来源可信度：官方 / 知名组织优先，社区小众需审慎。
- 权限范围：它要读哪些文件、访问哪些服务？最小权限可配吗？
- 沙箱边界：能否限定它可操作的目录 / 数据范围？
- 维护状态：更新频率、issue 响应、是否长期维护。
- 依赖面：引入它会带来多少传递依赖（安全审计）。

:::warn

### 第三方 MCP = 第三方「工具执行权限」

接入一个第三方 MCP Server，等于把一个「能执行工具」的程序接进了你的 Agent。它的代码会在你的机器 / 环境里运行。所以对第三方 Server 的安全评估，要比对普通依赖库更严格。

:::

`,
    null,
    [
      {
        text: 'MCP 生态的复利体现在？',
        options: ['工具更多', '协议统一后，接入任何 MCP Server 都是同一套代码', '模型更强', '更便宜'],
        answer: 1,
        explain: '一次协议、处处复用。',
        concept: 'mcp-ecosystem',
      },
      {
        text: '接入第三方 MCP Server，本质上是？',
        options: ['装一个插件', '把一个「能执行工具的程序」接进了你的 Agent', '换模型', '改 prompt'],
        answer: 1,
        explain: '第三方 Server 会在你的环境执行。',
        concept: 'mcp-ecosystem',
      },
      {
        text: '评估第三方 MCP Server 时，最不该忽略的是？',
        options: ['界面美观', '权限范围与沙箱边界、来源可信度', 'logo', '名字'],
        answer: 1,
        explain: '安全评估比普通依赖库更严格。',
        concept: 'mcp-ecosystem',
      },
    ],
    [
      ['MCP 市场', '集中发现 MCP Server 的目录 / 平台'],
      ['参考服务器', '官方提供的标准 Server 实现'],
      ['stdio transport', '通过标准输入输出通信的 MCP 传输方式'],
    ],
    [
      '无差别信任第三方 MCP Server，不评估其权限与来源。',
      '以为「用现成 MCP」就不需要理解 L45 手写的协议原理。',
    ],
  ),
  'scenario',
)
