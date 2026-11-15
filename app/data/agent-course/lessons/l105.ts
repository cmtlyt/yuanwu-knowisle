import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 19 ========== */

export const L105 = withKind(
  L(
    'L105',
    19,
    '对照：MCP server 能力 + 内置可观测性',
    3,
    ['L103', 'L104'],
    ['mastra-mcp', 'mastra-obs'],
    [
      '用声明式注册讲清 Mastra 的 MCP server 与 L45 手写协议的成本差异',
      '理解「零埋点」追踪的三项必验（层级 / 截断 / 归因）与它的锁定点',
      '认识「成套件的观测与运行时捆绑」这一选型约束',
    ],
    `
### 「零埋点」上线了，排查时却什么都看不到

我们把一个内部工具通过 Mastra 暴露成 MCP server，照文档写几行声明就跑通了——客户端能调、模型能用，一句 span 代码都没写。这就是它宣传的「零埋点可观测」。

两周后一个工具开始返回错误数据。我去翻 trace，发现只有一行 \`mcp.server.call\` 的 server 级 span，**工具名有、输入没有、内部每一步更没有**。也就是说，「零埋点」给了我一个层级，却没给我定位问题要的那一层。我又得回去给工具实现里手动加埋点——等于把当初省的那份活补回来，还得多花一次搞清楚框架给我留了什么钩子。

这个故事要先讲，因为它点破了一套件最容易被美化的词：**「零配置 / 零埋点」说的是接入成本低，不等于「够你排障」。** 省的是写第一行的成本，不是你理解系统的成本。

### MCP server 的声明式注册

L45 是手写 MCP 协议：你要自己实现 \`initialize\` / \`tools/list\` / \`tools/call\` 的 JSON-RPC 握手与路由。Mastra 把它收成一个声明式注册——你给工具，框架替你生成协议端点。

| 维度 | L45 手写协议 | Mastra MCP server |
|---|---|---|
| 握手 / 路由 | 自己实现 JSON-RPC | 框架托管 |
| 工具注册 | 自己写 dispatcher | 声明式 \`server.tool(name, schema, fn)\` |
| 暴露形态 | 自己选 transport | 框架给 stdio / HTTP |
| 你被锁的部分 | 无（全自己管） | 协议细节由框架决定 |
| 想换客户端 | 任意兼容客户端 | 任意兼容客户端（协议标准） |

注意最后一行的「协议标准」：Mastra 的 MCP server 仍然讲标准协议，所以客户端可替换——**这是它没锁死的部分**。被锁的是「工具怎么被托管、错误怎么被包装、trace 怎么被采集」这些实现细节。

\`\`\`ts title="声明式 MCP server（对比 L45 手写）" note="要点：server.tool 一次性声明名字/入参 schema/实现；握手与路由由框架托管，你只写业务逻辑。"
import { MCPServer } from '@mastra/mcp'

const server = new MCPServer({ name: 'internal-tools' })

server.tool(
  'lookup_order',
  { orderId: z.string() }, // 入参 schema，框架据此做校验与类型提示
  async ({ orderId }) => {
    const row = await db.orders.find(orderId)
    return { content: [{ type: 'text', text: JSON.stringify(row) }] } // 标准 MCP 返回形态
  },
)

server.tool(
  'create_refund',
  { orderId: z.string(), reason: z.string() },
  async ({ orderId, reason }) => {
    const id = await db.refunds.create(orderId, reason)
    return { content: [{ type: 'text', text: id }] }
  },
)

await server.listen({ transport: 'stdio' }) // 框架托管 transport
\`\`\`

对比 L45：那里每一行都是协议细节，这里每一行都是业务。这就是声明式注册的收益——**但代价是协议行为由框架定义**，一旦它某次升级改了错误包装方式，你的客户端解析逻辑可能要跟着动。

### 内置追踪的零埋点与三项必验

Mastra 的 observability（L103 第五段）对 MCP 同样生效：server 一旦 \`track\`，每次 \`tools/call\` 都被采集。但「零埋点」必须按 L99 的三项验证查一次，否则就是我前面那段事故：

| 验证项 | 要确认什么 | 不验的后果 |
|---|---|---|
| 层级 | trace 有几层？server 级 / 工具级 / 工具内部？ | 只有 server 级，看不到工具内部（我的事故） |
| 截断 | 长输入 / 长输出是否被截断？在哪一层截？ | 查问题时正好缺了那段被截的 payload |
| 归因 | 一次失败，能不能定位到「第几步、哪个字段」？ | 只能看到「调用失败」，定位不动 |

这三项里最容易被漏的是**层级**：框架默认给你的层级往往停在「一次 call」这一级，而真正要排障的「工具内部为什么算错」在更下一层。要拿到那一层，得在工具实现里用框架提供的钩子补 span——这又把「零埋点」省的那份活补回来了。

:::deep
### 成套件的观测与运行时捆绑：一个选型锁定点

Mastra 的观测不是独立组件，它和运行时是**捆绑**的：你用它的 agent / workflow / mcp，obs 才能零代码接入；一旦你想把 obs 换成自己的 OpenTelemetry collector 并保留全部字段，就得看框架给了多少导出钩子。这就是「成套件」的锁定点之一——**便利与锁定同源**。

对比一下三种形态在这点上的差别：

- **L75 手写 span**：完全自由，字段你想加就加，但每个组件都要自己接。
- **L99 托管平台**：零代码，但层级与字段由平台决定，想自定义得走平台的扩展机制。
- **Mastra obs**：介于两者之间——比手写省，比托管平台更贴运行时；代价是它和 Mastra 的运行时共生，换运行时就换观测。

所以选 Mastra 时要想清楚：你接的是它整条链（agent→workflow→mcp→obs），还是只想要其中一两件。只想要一两件，它 obs 的便利可能不值得你接受整条链的锁定。
:::

:::warn
### 三个必踩的坑

- **以为「零埋点」等于「够排障」**。表现是只有 server 级 span，工具内部不可见。必须按上面的三项验证查一次，缺哪层补哪层的钩子。
- **MCP 返回形态写错**。框架要求标准 \`content: [{type:'text', text}]\`，手写时容易直接 \`return row\` 导致客户端解析失败。协议标准由框架守，但你的返回值形态仍要符合。
- **transport 与客户端不匹配**。声明了 \`stdio\` 却用 HTTP 客户端连，或反之。框架托管 transport 不等于自动协商，客户端形态得和 \`listen\` 的参数一致。
:::

### 把可见性补到工具内部

回到开头的事故：只有 server 级 span。修法是**在工具实现里用框架提供的钩子补一层 span**，把「工具内部哪一步算错」也暴露出来。这等于把「零埋点」省的那份活补回来，但只补你真正要排障的那一层，而不是全手写：

\`\`\`ts title="用框架钩子在工具内部补 span" note="要点：零埋点给 server 级，工具内部这层要自己补；只补排障要的那一层，不是全手写。"
server.tool('lookup_order', { orderId: z.string() }, async ({ orderId }, ctx) => {
  const span = ctx.trace.span('lookup.db') // 框架钩子，非 L75 手写 Tracer
  span.setAttr('orderId', orderId)
  const row = await db.orders.find(orderId)
  if (!row) span.setStatus('not_found')
  span.end()
  return { content: [{ type: 'text', text: JSON.stringify(row) }] }
})
\`\`\`

注意这是 \`ctx.trace.span\`，不是 L75 手写的 \`AsyncLocalStorage\` Tracer——框架既然托管了运行时，就顺手给了钩子。你付出的代价是：这套 span 的字段与导出格式由框架定义（回到前文「观测-运行时捆绑」），想换成自己的 OTLP collector 得走框架的扩展机制。

所以「零埋点」的诚实说法是：**接入零代码，排障按需补一层。** 补的那一层就是你和框架之间真正的耦合点——它小，但它存在。三项验证里「层级」这项，本质上就是在问：你补的那一层，够不够你定位到「第几步、哪个字段」。

### 把 obs 导出到自己的 collector

前面说「观测-运行时捆绑」，那如果你已有 OTLP pipeline 怎么办？Mastra 的 Metrics 通常支持配置导出目标，把 trace 发到你的 collector 而不是平台：

\`\`\`ts title="把 trace 导出到自有 OTLP collector" note="要点：换导出目标是框架给的扩展点；字段形态仍由框架定义，这是捆绑的代价。"
const metrics = new Metrics({
  exporter: {
    type: 'otlp',
    endpoint: process.env.OTLP_ENDPOINT, // 你的 collector，而非平台默认地址
    headers: { Authorization: \`Bearer \${process.env.OTLP_TOKEN}\` }, // 自有 collector 的鉴权
  },
})
metrics.track(agent)
\`\`\`

这解决了「数据发去哪」的问题，但没解决「字段长什么样」的问题——span 的 attribute 名、层级命名仍由框架定。所以即使导出到自有 collector，你前面对齐告警与看板时，仍然依赖框架的那套语义。这层耦合不会因为换了导出目标就消失，它只是从「发去平台」变成了「发去你自己的后端，但字段还是框架的」。

### 与相邻课的分工

- **L45** 是手写 MCP 协议基线，本课只做「声明式注册的成本对照」，不重讲协议细节。
- **L99** 是托管追踪的验证清单，本课的「三项必验」直接复用它的层级 / 截断 / 归因。
- **L103** 讲五件套的抽象层，本课聚焦 mcp 与 obs 这两个包，及其与运行时的捆绑锁定点。
`,
    null,
    [
      {
        text: 'Mastra 的「零埋点可观测」真正省的是什么？',
        options: [
          '理解系统的成本',
          '写第一行接入代码的成本，不是排障要的那层可见性',
          '所有排障工作',
          '协议标准的兼容',
        ],
        answer: 1,
        explain: '零埋点降低接入成本，但默认层级往往停在 server 级，排障要的下一层得自己补钩子。',
        concept: 'mastra-obs',
      },
      {
        text: '按 L99 的三项验证，Mastra MCP 追踪最常被漏掉的是哪一项？',
        options: ['截断', '层级（默认只有 server 级，看不到工具内部）', '归因', '采样'],
        answer: 1,
        explain: '框架默认层级停在「一次 call」，工具内部那一层要自己补 span 钩子才能看到。',
        concept: 'mastra-obs',
      },
      {
        text: 'Mastra 的观测与运行时的关系是？',
        options: [
          '完全独立，可随意替换',
          '捆绑共生：用它的运行时才能零代码接入，换运行时就换观测',
          '只能发到第三方平台',
          '必须手写 span',
        ],
        answer: 1,
        explain: '这是成套件的锁定点之一：便利与锁定同源，选整条链还是只取一两件要想清楚。',
        concept: 'mastra-obs',
      },
      {
        text: 'Mastra MCP server 与 L45 手写协议相比，没有被锁死的是？',
        options: ['工具托管方式', '协议标准（仍讲标准 MCP，客户端可替换）', '错误包装方式', 'trace 采集方式'],
        answer: 1,
        explain: '协议标准保证了客户端可替换；被锁的是托管、错误包装、trace 这些实现细节。',
        concept: 'mastra-mcp',
      },
    ],
    [
      ['MCP server', '声明式注册工具，框架托管 JSON-RPC 握手与路由'],
      ['零埋点', '框架自动采集链路；省接入成本，不保证排障所需的层级'],
      ['三项必验', '层级 / 截断 / 归因，按 L99 查一次缺哪层补哪层'],
      ['观测-运行时捆绑', '用 Mastra 运行时才能零代码 obs，换运行时即换观测，是选型锁定点'],
    ],
    [
      '以为零埋点够排障，只有 server 级 span 看不到工具内部。',
      'MCP 返回值没写成标准 content 形态，客户端解析失败。',
      'transport 与客户端形态不匹配（stdio 对 HTTP）。',
      '只想要 obs 一件却接受了整条链的锁定。',
    ],
  ),
  'framework',
)
