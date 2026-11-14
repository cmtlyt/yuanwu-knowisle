import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 6 ========== */

export const L43 = L(
  'L43',
  6,
  '为什么需要 MCP：告别「每家一套工具接口」',
  12,
  2,
  ['L39'],
  ['mcp-motivation'],
  [
    '理解「每家一套工具接口」造成的集成负担',
    '理解 MCP 想解决的 N×M 集成问题',
    '建立「统一协议 = 一次适配、处处复用」的心智',
  ],
  [
    prose(
      'N 个 Agent × M 个工具的集成爆炸',
      '没有统一协议时，每个 Agent 要接每个数据源/工具，都要写一套定制适配：N 个 Agent × M 个工具 = N×M 套集成。MCP（Model Context Protocol）把「工具/数据源」和「Agent」解耦，各自只需适配一次。',
    ),
    code(
      '集成问题的两种形态',
      '// 没有 MCP：每个 Agent 都要为每个工具写定制代码\nAgentA → 手写适配 → 数据库\nAgentB → 手写适配 → 数据库   // 重复劳动\nAgentC → 手写适配 → 文件系统 // 又一套\n\n// 有 MCP：工具暴露为统一协议，任何 Agent 都能接\n数据库   → MCP Server\n文件系统 → MCP Server\nAgentA / AgentB / AgentC → MCP Client → 任意 Server',
      '关键：MCP 把「N×M」降为「N + M」——每个 Agent 写一次 Client，每个工具写一次 Server。',
    ),
    call(
      'deep',
      'MCP 的定位',
      'MCP 是「模型上下文」的协议：统一 Agent 如何发现工具、调用工具、读取资源。它类比「USB-C」——不规定设备功能，只规定接口。你的 Agent（Client）通过一个标准口，接任何 MCP 工具（Server）。',
    ),
    list('MCP 解决的三个集成痛点', [
      '发现：Agent 如何知道有哪些工具可用？→ 统一 tools/list。',
      '调用：Agent 如何调用工具并拿结果？→ 统一 tools/call。',
      '接入：如何连接不同形态的数据源？→ 统一 Server 封装。',
    ]),
    call(
      'tip',
      'MCP 是协议，不是框架',
      'MCP 定义的是「消息格式与传输」，不是某个框架。你可以手写（L45），也可以用官方 SDK（L46），协议本身不变。',
    ),
  ],
  null,
  [
    q(
      'MCP 要解决的核心问题是？',
      ['模型太慢', 'N×M 的集成爆炸：每家一套工具接口', 'token 太贵', '内存泄漏'],
      1,
      '把 N×M 降为 N+M。',
      'mcp-motivation',
    ),
    q(
      'MCP 最恰当的类比是？',
      ['操作系统', 'USB-C：只规定接口，不规定设备功能', '编译器', '数据库'],
      1,
      '统一协议类比 USB-C。',
      'mcp-motivation',
    ),
    q(
      'MCP 的定位是？',
      ['一个框架', '一个协议（消息格式与传输）', '一个模型', '一门语言'],
      1,
      'MCP 是协议，不是框架。',
      'mcp-motivation',
    ),
  ],
  [
    ['MCP', 'Model Context Protocol，Agent 与工具/数据源之间的统一协议'],
    ['N×M 问题', '每个 Agent 为每个工具写定制适配的集成爆炸'],
    ['Client/Server', 'MCP 的调用方（Agent）与提供方（工具）'],
  ],
  ['把 MCP 当框架而非协议，忽略「手写协议也能通」的本质。', '为每个工具写定制适配，重复劳动。'],
)
