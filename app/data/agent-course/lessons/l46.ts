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
      '用官方 TS SDK 重写 L45 的手写 Server，并逐段对照',
      '度量两版在代码量、启动、可调试性上的真实差异',
      '识别 SDK 没有替你解决的问题（超时 / 裁剪 / 权限 / 日志纪律）',
    ],
    `
### 同一个 Server，两版代码

L45 手写了一个 \`word_count\` Server：transport + dispatch + 注册表 + 入口，约 120 行。

用官方 SDK 重写，核心部分是这样：

\`\`\`ts title="SDK 版本：完整 Server" note="对照 L45：transport、JSON-RPC、能力协商、inputSchema 字段名，全部消失了。"
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'acme-demo', version: '0.1.0' })

server.registerTool(
  'word_count',
  {
    description: '统计一段文本的字符数与词数',
    inputSchema: { text: z.string().describe('待统计的文本') },
  },
  async ({ text }) => {
    const words = (text.match(/[一-鿿]|[A-Za-z0-9]+/g) ?? []).length
    return { content: [{ type: 'text', text: JSON.stringify({ chars: text.length, words }) }] }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)

// 下面这两行在 SDK 里通常不需要：SDK 已在 transport 关闭时处理退出
process.stdin.on('end', () => process.exit(0))
\`\`\`

从 120 行变成 25 行。**消失的 95 行不是「被优化了」，而是「被搬进了 SDK」**——这一节的任务就是把它们逐条对上，看清楚自己交出了什么、留下了什么。

### 逐段对照

| 职责 | L45 手写 | SDK | 差异性质 |
|---|---|---|---|
| 行读写 | \`readline\` + 逐行 parse | \`StdioServerTransport\` | 完全替代 |
| 坏行处理 | 自己 try/catch 丢弃 | transport 内部处理 | 完全替代 |
| id 回显 / 通知不回 | 自己判断 | 协议层处理 | 完全替代 |
| \`inputSchema\` 字段名 | 手写，易错 | 从 zod 自动生成 | 消除了一类 bug |
| 能力协商 | 手写 initialize 返回 | 自动，按注册内容推导 | 完全替代 |
| 错误码 | 自己映射 | 内部映射，业务错误用 \`isError\` | 部分替代 |
| 生命周期 | 自己监听 stdin end | SDK 处理 | 完全替代 |
| 参数校验 | 自己写 \`validateArgs\` | zod 自动校验，失败自动回 \`isError\` | 完全替代且更强 |
| 工具注册 | 自己的 Map + 手写 schema | \`registerTool\` + zod | 等价，SDK 更省 |
| 超时 | 自己加 | **不提供** | 仍要自己写 |
| 结果裁剪 | 自己加 | **不提供** | 仍要自己写 |
| 权限自检 | 自己加 | **不提供** | 仍要自己写 |
| stdout 日志纪律 | 自己守 | **仍需自己守** | 仍要自己写 |

前九行是「SDK 真替你做了」，后四行是「SDK 不管」。这条分界线决定了选型：**如果你的 Server 只是「把几个函数暴露出去」，SDK 几乎全部代劳；如果它要处理不可信输入、大结果、长任务，那些部分仍然是你自己的工程。**

### 差异度量：不只是行数

先说一个具体到字段的例子。同一个工具的参数声明，两版差多少：

\`\`\`ts title="同一个工具的两份声明" note="右边不是「更简洁」，而是「唯一真实来源」——schema 由类型推导，不会与校验逻辑脱节。"
// L45 手写：JSON Schema 是唯一来源，校验函数要另外写一份
const manual = {
  type: 'object',
  properties: { text: { type: 'string', description: '待统计的文本' } },
  required: ['text'],
}

// SDK：zod 是唯一来源，JSON Schema 与运行时校验都由它推导
const zodSchema = { text: z.string().describe('待统计的文本') }
\`\`\`

这个差异的实际影响是：手写版里「声明」与「校验」是两份代码，容易漂移（L39 提过 schema 不等于校验）；SDK 版里它们同源，漂移不可能发生。这类「结构性消除 bug」比「少写几行」有价值得多。

行数是最直观的指标，但不是最该看的。四个维度一起看：

| 维度 | 手写 | SDK | 说明 |
|---|---|---|---|
| 核心代码行数 | ~120 | ~25 | 差 5 倍，但这是一次性成本 |
| 依赖数 | 0（只用 node 内置） | 2（SDK + zod） | 依赖要跟着协议版本升级 |
| 首次启动 | 快（无额外模块） | 略慢（加载 zod 与 SDK） | 对本地工具几乎无感 |
| 可调试性 | 高（每一步都能打点） | 中（要理解 SDK 的抽象） | 出协议问题时手写更好查 |
| 协议演进跟进 | 自己改 | 升级 SDK | 这是 SDK 最大的长期价值 |

最后一行是最容易被低估的：MCP 协议仍在演进（新增 elicitation、tasks 等），手写实现需要自己跟进每个变更；用 SDK 时大部分变更是「升级一个版本号」。

### SDK 版本里那些「看起来多余」的代码

上面 SDK 版本末尾我留了两行注释掉的逻辑，值得解释：

\`\`\`ts
// SDK 通常在 transport 关闭时自动退出；如果你的运行时环境不触发，
// 显式监听仍然必要——这是「抽象不一定覆盖你的环境」的典型例子。
process.stdin.on('end', () => process.exit(0))
\`\`\`

类似的情况还有几个，都是「SDK 假设了一种运行环境，而你的环境略有不同」：

- **打包工具**：SDK 用 ESM，某些打包配置会把它打成 CJS 后出现 \`require of ESM\` 错误。修法通常是调整构建目标，而不是改代码。
- **进程信号**：SDK 处理 \`stdin end\`，但对 \`SIGTERM\` 的处理取决于你的部署方式（容器里通常需要显式处理）。
- **日志**：SDK 内部可能往 stderr 打一些信息，与你的日志格式混在一起。要统一日志出口时，得把 SDK 的 debug 开关关掉。

这些不是 SDK 的缺陷，而是「任何抽象都会在某些边界泄漏」的常态。

:::deep

### SDK 的抽象在哪里泄漏

三个已知的泄漏点，遇到时不用怀疑自己：

**① zod 版本绑定。** SDK 的 \`inputSchema\` 接受 zod schema，而 zod 有 v3 / v4 两代，API 有差异。SDK 某个小版本可能只支持其中一代，于是「升级 zod 导致 Server 起不来」成为常见事故。**建议把 zod 锁在与 SDK 兼容的版本上，不与业务代码共用同一份依赖声明**。

**② 错误语义被压平。** SDK 会把工具回调里抛出的异常统一转成 \`isError: true\`（这是对的），但你无法再区分「参数不合法」与「下游服务挂了」——除非自己在返回值里编码。想保留细分，就在 \`content\` 里带上错误类型字段：

\`\`\`ts
// 保留细分：类型写在文本前缀里，模型和日志都能读到
const fail = (kind: 'invalid' | 'upstream' | 'timeout', msg: string) => ({
  content: [{ type: 'text' as const, text: \`[\${kind}] \${msg}\` }],
  isError: true,
})
\`\`\`

**③ transport 能力不对等。** stdio 与远程 transport 在 SDK 里的支持程度不同（比如 session 管理、resumability 只在远程侧有意义）。写「两种都能跑」的 Server 时，要按最低能力设计，否则会在某个 transport 上缺功能。

理解这三个泄漏点的价值是：**出问题时能快速判断「是我的代码还是抽象边界」**，而不是在 SDK 源码里翻半天。

:::

:::warn

### 别把「升级 SDK」当成例行公事

MCP 的协议版本是带日期的（如 \`2025-06-18\`），SDK 大版本通常对应协议大版本。升级时有三件事必须验证：

1. **握手能否完成**：协议版本不匹配时，某些实现会静默降级、某些会直接拒绝。用 \`initialize\` 的返回版本号确认实际协商结果。
2. **\`inputSchema\` 的生成是否仍符合预期**：zod 升级或 SDK 升级都可能改变生成的 JSON Schema 结构（比如 \`additionalProperties\` 的默认值）。
3. **错误返回的形状**：\`isError\` 的位置、\`content\` 的类型在新版本里可能变化，客户端解析会因此失败。

这三条都能用 L45 那套「喂 JSON 看输出」的方法验证，不需要真实 Host。**升级前后各跑一遍，diff 输出**，比读 changelog 可靠。

:::

### 选型：什么时候手写、什么时候用 SDK

给一个可操作的判断：

- **用 SDK**：单一用途的本地 Server、需要跟进协议演进、团队不熟悉 JSON-RPC 细节。
- **手写**：需要极致控制（自定义 transport、特殊进程模型）、依赖不能增加（嵌入式环境）、或需要在不支持 ESM 的环境里跑。
- **混合（最常见）**：用 SDK 做协议层，自己包一层「工具执行器」——把超时、裁剪、权限、审计加在这一层，SDK 只负责「说得对」。

第三种在实践中效果最好：SDK 处理它擅长的（协议一致性），你处理它不擅长的（业务边界）。而这一层的形状，正是 L40 那个 \`ToolGuard\`。

### 收束：抽象的价值是「让你只操心剩下的事」

对照完两版，结论不是「SDK 更好」或「手写更好」，而是：**SDK 把「协议正确性」变成默认，于是你可以把注意力放在「工具该不该这么设计」上**。

而 L45 手写那一遍的价值也没有消失——它让你知道 SDK 到底替你做了什么。不知道这一点的人，会在「SDK 没做的事」上翻车：以为有超时、以为会裁剪、以为权限有保护。

L47 换到客户端侧：把已经写好的 Server 接进 Agent，让模型真的能用上它。

`,
    null,
    [
      {
        text: 'SDK 版本消失的 95 行主要去了哪里？',
        options: [
          '被优化掉了',
          '搬进了 SDK：transport、JSON-RPC、能力协商、schema 生成',
          '移到了配置文件',
          '移到了服务端',
        ],
        answer: 1,
        explain: '消失的是「协议正确性」这部分重复劳动。',
        concept: 'mcp-sdk',
      },
      {
        text: '以下哪项是 SDK 通常不提供的？',
        options: ['行分隔读写', 'inputSchema 生成', '能力协商', '工具超时与结果裁剪'],
        answer: 3,
        explain: '超时、裁剪、权限、日志纪律仍要自己写。',
        concept: 'mcp-sdk',
      },
      {
        text: 'SDK 里「错误语义被压平」指的是？',
        options: [
          '错误码丢失',
          '所有异常统一成 isError，无法区分参数非法与下游故障',
          '错误不返回',
          '错误被日志吞掉',
        ],
        answer: 1,
        explain: '想保留细分，需在 content 里编码错误类型。',
        concept: 'mcp-sdk',
      },
      {
        text: '升级 SDK 时必须验证的三件事不包括？',
        options: [
          '握手能否完成、协商到什么版本',
          'inputSchema 生成结构是否变化',
          '错误返回形状是否变化',
          '工具的业务逻辑是否需要重写',
        ],
        answer: 3,
        explain: '升级动的是协议层，业务逻辑不该受影响。',
        concept: 'mcp-sdk',
      },
      {
        text: '实践中最推荐的形态是？',
        options: [
          '全部手写',
          'SDK 做协议层，自己包一层工具执行器加边界',
          '全部用 SDK，不加额外层',
          '不用 MCP',
        ],
        answer: 1,
        explain: 'SDK 管协议一致性，执行器管业务边界。',
        concept: 'mcp-sdk',
      },
    ],
    [
      ['McpServer', 'SDK 里的 Server 抽象，负责协议与能力协商'],
      ['StdioServerTransport', 'SDK 提供的 stdio 传输实现'],
      ['抽象泄漏', '抽象未能覆盖的边界情况，如 zod 版本绑定'],
      ['协议版本', '带日期的 MCP 版本标识，决定字段语义'],
    ],
    [
      '以为用了 SDK 就有了超时、裁剪与权限控制。',
      'zod 与 SDK 版本不匹配，导致 Server 启动即失败。',
      '升级 SDK 不验证握手与 schema 形状，客户端静默失败。',
    ],
  ),
  'framework',
)
