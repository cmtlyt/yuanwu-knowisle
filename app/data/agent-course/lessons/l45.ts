import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 6 ========== */

export const L45 = L(
  'L45',
  6,
  '实战：不依赖框架用 TS 实现 MCP（手写 JSON-RPC + stdio）',
  20,
  4,
  ['L44'],
  ['mcp-handwritten'],
  [
    '手写一个可用的 MCP Server：JSON-RPC + stdio transport',
    '实现工具发现（tools/list）与工具调用（tools/call）',
    '理解协议本体，为 SDK 对照打基础',
  ],
  [
    prose(
      '手写协议，看清本质',
      'MCP 协议本体就是「通过 stdio 收发 JSON-RPC 消息」。手写一遍，你会清楚 SDK 帮你省掉了什么。',
    ),
    code(
      '手写 MCP Server（stdio）',
      '// ① 读 stdin 逐行，解析 JSON-RPC 请求\nprocess.stdin.on("data", (chunk) => {\n  for (const line of chunk.toString().split("\\n").filter(Boolean)) {\n    handle(JSON.parse(line))\n  }\n})\n\n// ② 分发 method\nasync function handle(req: any) {\n  let result: unknown\n  switch (req.method) {\n    case "tools/list":\n      result = { tools: [{ name: "search_weather", description: "查天气",\n        inputSchema: { type: "object", properties: { city: { type: "string" } } } }] }\n      break\n    case "tools/call":\n      const args = req.params.arguments\n      result = { content: [{ type: "text", text: await searchWeather(args.city) }] }\n      break\n    case "initialize":\n      result = { protocolVersion: "2024-11-05", capabilities: { tools: {} } }\n      break\n    default:\n      return respond(req.id, { error: { code: -32601, message: "method not found" } })\n  }\n  respond(req.id, { result })\n}\n\n// ③ 写回响应（同一条 stdio）\nfunction respond(id: number, payload: object) {\n  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...payload }) + "\\n")\n}',
      '整个 Server 就三件事：读行 → 按 method 分发 → 写回 JSON。这就是协议本体。',
    ),
    call(
      'deep',
      '三个核心 method',
      '`initialize`（握手、协商协议版本与能力）、`tools/list`（工具发现）、`tools/call`（工具调用）。真正的 MCP 还有 resources（资源）与 prompts（提示），但工具是主脉，其余是扩展。',
    ),
    list('手写版的粗糙处（SDK 会补）', [
      '没有 request/response 的超时与匹配（id 关联要靠自己维护）。',
      '没有并发保护、错误分类、流式增量。',
      '参数校验要自己写。',
    ]),
    call(
      'warn',
      'stdio 的换行分帧是坑',
      'stdio 传输用「换行分隔」分帧。如果工具返回的内容里含换行，分帧会被破坏。生产环境 SDK 会做长度前缀或转义，手写版要留意。',
    ),
  ],
  null,
  [
    q(
      '手写 MCP Server 的三个核心 method 是？',
      [
        'get/put/delete',
        'initialize / tools/list / tools/call',
        'start/stop/restart',
        'login/logout/register',
      ],
      1,
      '握手、工具发现、工具调用。',
      'mcp-handwritten',
    ),
    q(
      'stdio 传输的分帧方式是？',
      ['长度前缀', '换行分隔（\n）', '空格分隔', '逗号分隔'],
      1,
      '换行分隔，内容含换行会破坏分帧。',
      'mcp-handwritten',
    ),
    q(
      '手写版相比 SDK 缺什么？',
      ['协议本体', '超时匹配、并发保护、错误分类、流式', 'JSON-RPC', '工具调用'],
      1,
      '缺超时、并发、错误分类、流式等工程细节。',
      'mcp-handwritten',
    ),
  ],
  [
    ['JSON-RPC', 'method + id 的请求响应协议'],
    ['分帧', '在传输层划分消息边界的机制'],
    ['initialize', 'MCP 握手：协商协议版本与能力'],
  ],
  ['忽略换行分帧，工具返回多行内容时协议被破坏。', '忘了维护 request id 与响应的匹配，并发下结果错乱。'],
)
