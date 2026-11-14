import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 19 ========== */

export const L105 = L(
  'L105',
  19,
  '对照：用 Mastra 的 MCP server 能力 + 内置可观测性（对比 L45 / L75）',
  18,
  3,
  ['L103', 'L45', 'L75'],
  ['mastra-mcp'],
  [
    '用 Mastra 的 MCP 能力与内置可观测性，对比 L45 / L75 手写版',
    '理解 MCP 工具如何声明式接入',
    '认识内置可观测性「零埋点」的收益',
  ],
  [
    prose(
      'MCP 与可观测，框架替你包了',
      'L45 手写的 MCP Server、L75 手写的 span 追踪，Mastra 分别用「MCP 工具声明」和「内置可观测」替代。',
    ),
    code(
      'Mastra MCP + 可观测',
      '// ① MCP 能力：声明式接入 MCP 工具\nconst agent = new Agent({\n  name: "assistant",\n  mcpServers: {\n    weather: { type: "stdio", command: "node", args: ["weather-server.mjs"] },\n  },\n})\n// Agent 自动发现 MCP 工具、自动桥接为可调用工具\n\n// ② 内置可观测：零埋点\n// 运行后自动生成 trace（每次 agent 调用、工具调用都是 span）\n// 可视化面板查看，无需手写 Tracer',
      '关键：L45 手写的 MCP Client 桥接（发现+调用+转换）、L75 手写的 span 中间件，Mastra 都内置了。',
    ),
    call(
      'deep',
      '「零埋点」的代价',
      '内置可观测「零埋点」省了手写 Tracer，但你失去了对 span 结构的精细控制（如自定义属性、采样策略）。这与 L99 的结论一致：框架自动化了「采集」，你仍要理解「语义」。',
    ),
    list('对照结论', [
      'MCP：Mastra 声明 mcpServers，替代手写 Client 桥接。',
      '可观测：Mastra 内置追踪，替代手写 span 中间件。',
      '代价：两者都失去精细控制，依赖框架的默认行为。',
    ]),
    call(
      'warn',
      'MCP 进程生命周期由框架管',
      'Mastra 声明 mcpServers 后，stdio Server 的启动/关闭由框架管理（呼应 L47 手写版要自己管进程）。框架管了省事，但也要理解它何时启动/关闭。',
    ),
  ],
  null,
  [
    q(
      'L45 手写的 MCP Client 桥接，在 Mastra 里被什么替代？',
      ['手写进程管理', '声明 mcpServers（自动发现+桥接）', 'workflow', 'rag'],
      1,
      '声明 mcpServers。',
      'mastra-mcp',
    ),
    q(
      'L75 手写的 span 中间件，在 Mastra 里是？',
      ['手写 Tracer', '内置可观测（零埋点）', '手动埋点', '不追踪'],
      1,
      '内置追踪。',
      'mastra-mcp',
    ),
    q(
      '内置可观测「零埋点」的代价是？',
      ['更快', '失去 span 精细控制（自定义属性/采样）', '更便宜', '更强'],
      1,
      '失去精细控制。',
      'mastra-mcp',
    ),
  ],
  [
    ['mcpServers 声明', '声明式接入 MCP 工具'],
    ['内置可观测', '零埋点的追踪能力'],
    ['零埋点', '框架自动采集、无需手写'],
  ],
  ['声明 mcpServers 却不懂进程何时启停。', '依赖内置追踪却不理解 span 语义。'],
)
