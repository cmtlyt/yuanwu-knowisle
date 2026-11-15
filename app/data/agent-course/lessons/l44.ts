import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 6 ========== */

export const L44 = withKind(
  L(
    'L44',
    6,
    'MCP 三件套：Host / Client / Server，transport',
    2,
    ['L43'],
    ['mcp-triad'],
    [
      '厘清 Host / Client / Server 三个角色的职责与配比',
      '理解 initialize 握手与能力协商的作用',
      '区分 stdio 与远程 transport 的适用场景与坑',
    ],
    `
### 为什么不是「Host 直接连 Server」

第一次看 MCP 架构图会有个疑问：既然 Host 是应用、Server 是工具提供方，为什么要中间夹一个 Client？

答案在「配比」上：**一个 Host 可以同时连多个 Server，而每个 Client 与一个 Server 一一对应**。Client 是「连接器」，它持有单条连接的状态、负责协议编解码、管理这条连接的生命周期。

这个设计的收益有三点：

1. **命名空间隔离**。A Server 有个工具叫 \`search\`，B Server 也有一个。Client 层把「哪个 Server 的 search」区分开，Host 侧看到的是 \`jira:search\` 与 \`wiki:search\`。
2. **故障隔离**。一个 Server 崩了，只影响它对应的 Client，Host 与其它连接照常。
3. **能力协商独立**。不同 Server 支持的能力不同（有的支持 resources、有的只有 tools），Client 各自记录。

如果去掉这一层，Host 里就会长出一堆「哪条连接、哪个 Server、支持什么」的分支判断——这正是 MCP 想避免的耦合。

### 三个角色

| 角色 | 是谁 | 职责 | 典型实现 |
|---|---|---|---|
| Host | 用户-facing 的应用 | 决定「用哪个模型、给用户看什么、要不要接某个 Server」 | IDE、桌面 Agent、聊天客户端 |
| Client | Host 内部的一个连接器 | 与单个 Server 的协议通信、能力记录、工具名映射 | Host 代码里的一个实例 |
| Server | 能力提供方 | 暴露 tools / resources / prompts，执行实际动作 | 独立进程或远程服务 |

一个具体的场景：在一个 IDE 里装了两个 MCP Server（Jira 与内部 Wiki）。Host 是 IDE，Client 有两个实例，Server 两个。用户在对话框里问「这个需求对应的 wiki 页面说了什么」，Host 把两个 Server 的工具都放进模型上下文，模型选了 Wiki 的 \`get_page\`，Host 通过对应 Client 发出 \`tools/call\`。

注意「Host 决定要不要接某个 Server」这一点：这是**用户可控**的（配置文件里加条目）。这条设计把「工具能否被模型使用」的最终决定权留给了人，而不是模型。

### 生命周期：握手先于做事

MCP 连接建立后第一件事不是调工具，而是 \`initialize\`：双方交换协议版本与能力声明。

\`\`\`json
// → Client
{ "jsonrpc": "2.0", "id": 0, "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "sampling": {}, "roots": { "listChanged": true } },
    "clientInfo": { "name": "acme-ide", "version": "1.4.0" }
  } }

// ← Server
{ "jsonrpc": "2.0", "id": 0,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "subscribe": true }
    },
    "serverInfo": { "name": "jira-mcp", "version": "0.9.2" }
  } }
\`\`\`

握手之后 Client 发 \`notifications/initialized\`，之后才能用 \`tools/list\`、\`tools/call\` 等方法。

能力协商的实际价值在两处：

**第一，避免「调了不支持的方法」。** Server 没声明 \`resources\`，Client 就不该发 \`resources/list\`。硬发会得到 \`-32601 Method not found\`，而这个错误在运行时的表现是「某个功能莫名不可用」。

**第二，版本兼容有据可依。** 协议在演进，字段会变。握手时确认 \`protocolVersion\`，双方按同版本解释字段，比「猜对方支持什么」可靠。

\`\`\`ts title="Client 侧：握手与能力记录" note="把 capabilities 存下来，后续按需判断，而不是每次都试探性调用。"
interface ServerCaps {
  tools?: { listChanged?: boolean }
  resources?: { subscribe?: boolean; listChanged?: boolean }
  prompts?: { listChanged?: boolean }
  sampling?: Record<string, never>
}

async function handshake(rpc: Rpc, clientName: string): Promise<{ caps: ServerCaps; version: string }> {
  const res = await rpc.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: { sampling: {}, roots: { listChanged: true } },
    clientInfo: { name: clientName, version: '1.0.0' },
  })
  await rpc.notify('notifications/initialized')
  return { caps: res.capabilities ?? {}, version: res.protocolVersion }
}

export function canUse(caps: ServerCaps, feature: 'tools' | 'resources' | 'prompts'): boolean {
  return Boolean(caps[feature])
}
\`\`\`

握手还有一个容易忽略的细节：**\`notifications/initialized\` 是通知，没有响应**。有些 Server 会等这条通知之后才接受其它请求，漏发会导致后续调用被拒或挂起。

### transport：stdio 与远程

MCP 定义了两种主要传输方式，适用场景差别很大：

| 维度 | stdio | 远程（HTTP / SSE 演进版） |
|---|---|---|
| Server 位置 | 与 Host 同机，作为子进程 | 独立部署，跨网络 |
| 通信 | 标准输入输出，一行一条 JSON | HTTP POST + 流式响应 |
| 权限模型 | 继承 Host 的操作系统权限 | 独立鉴权（token / OAuth） |
| 启动方式 | Host 拉起进程（\`command\` + \`args\`） | Host 连接 URL |
| 适合 | 本地工具：文件、Git、本地数据库 | 团队共享服务：内部 wiki、SaaS 集成 |
| 主要问题 | 日志污染、进程残留 | 鉴权、超时、网络抖动 |

stdio 是「本地工具」的默认选择，原因很实际：**它天然共享用户的操作系统权限**。用户在 IDE 里装了文件系统 Server，它能读的文件就是这个用户能读的文件——不需要额外设计一套权限系统。这条「权限复用」是 stdio 最被低估的优势。

远程 transport 解决的是「共享」问题：一个团队内部的 wiki MCP Server，不可能让每个人的机器上都跑一份。此时它需要自己的鉴权（谁在调、能读哪些页面），这部分的复杂度与做一个普通后端服务相当。

:::deep

### stdio 下最容易踩的三个坑

**坑一：往 stdout 写日志。** stdio transport 把 stdout 当作 JSON-RPC 通道。任何一行非 JSON 的输出（\`console.log('started')\`、某个依赖库的 banner）都会让 Client 的解析器报错，而错误通常表现为「连接莫名断开」。

正确的做法是：**所有日志写 stderr**。stderr 是给人和 Host 看的，不参与协议。这条纪律在 Server 的第一行代码就要立好，因为依赖库往往会自己往 stdout 打印。

**坑二：进程残留。** Host 退出时如果没有正确关闭子进程，Server 会变成孤儿进程继续占着端口或文件锁。修法是在 Host 侧监听退出事件、显式 \`kill\`；Server 侧监听 \`stdin\` 的 \`end\`/\`close\`，主动退出。

**坑三：启动超时。** \`npx\` 拉包、\`uvx\` 装依赖都可能耗时几十秒。Host 若用一个固定的短超时等待 \`initialize\`，会误判「Server 启动失败」。这类问题在第一次运行（无缓存）时必然出现，之后又消失——非常难排查。

三条坑的共同点是：**它们都不是协议问题，而是「把协议跑在真实进程里」的问题**。这也解释了为什么 L45 要手写一遍——只有自己实现过一次 stdio 的读写循环，才知道这些边界在哪。

:::

### 一个常见的误解：Client 不是「客户端应用」

术语容易混淆：MCP 里的 **Client** 不是「用户用的那个客户端」，而是「Host 内部负责一条连接的组件」。

所以「我要做一个 MCP Client」这句话有两种意思：

- 做一个 Host（用户-facing 应用，内部含 Client 组件）—— 比如一个支持 MCP 的聊天工具。
- 做一个可复用的 Client 库（给别的 Host 用）—— 官方 SDK 就是这一类。

多数情况下你要做的是前者：在自己的应用里引入 SDK，创建 Client 实例，连上若干 Server。L47 会做这件事。

:::warn

### 让用户看见「接了哪些 Server」

一个安全上的实践：Host 应该**显式展示**当前连接的 Server 及其工具，并允许用户逐个禁用。

理由是「工具即权限」：连上一个能执行 shell 的 Server，等于把 shell 权限交给了模型。用户有权知道这件事，也有权在不需要时关掉它。

这个设计还有调试价值——当模型调用了意料之外的工具时，第一个要确认的问题就是「这个工具来自哪个 Server、是不是我装的」。

:::

### 收束：三件套的核心是「配比」

记住三个配比关系，整个架构就清楚了：

- **Host : Client = 1 : N**（一个应用连多个 Server）
- **Client : Server = 1 : 1**（一条连接对一个服务）
- **Server : 工具 = 1 : N**（一个服务暴露多个工具）

这个结构让「增加一个工具来源」变成「增加一个 Client」，而不需要改动 Host 的核心逻辑。这也是 MCP 在工程上的真正价值：**扩展点是连接，而不是代码分支**。

L45 开始手写：用一个 JSON-RPC 的读写循环 + stdio，实现一个能被真实 Host 连上的最小 Server。

`,
    null,
    [
      {
        text: 'MCP 中 Client 与 Server 的配比是？',
        options: ['1:N', '1:1', 'N:1', 'N:N'],
        answer: 1,
        explain: '每个 Client 对应一条连接、一个 Server；Host 可以有多个 Client。',
        concept: 'mcp-triad',
      },
      {
        text: 'initialize 握手的主要作用是？',
        options: ['鉴权', '交换协议版本与能力声明，避免调用不支持的方法', '压缩上下文', '选择模型'],
        answer: 1,
        explain: '能力协商让后续调用有据可依。',
        concept: 'mcp-triad',
      },
      {
        text: 'stdio transport 最被低估的优势是？',
        options: ['速度快', '天然复用用户的操作系统权限，不必另建权限系统', '支持流式', '跨平台'],
        answer: 1,
        explain: '本地工具继承 Host 进程权限，权限模型即 OS 权限。',
        concept: 'mcp-triad',
      },
      {
        text: 'stdio 下往 stdout 打印日志会导致？',
        options: ['日志丢失', '污染 JSON-RPC 通道，Client 解析失败、连接断开', '性能下降', '无影响'],
        answer: 1,
        explain: 'stdout 是协议通道，日志必须写 stderr。',
        concept: 'mcp-triad',
      },
      {
        text: '「做一个 MCP Client」通常指的是？',
        options: [
          '做一个 Server',
          '做一个 Host（内部含 Client 组件），引入 SDK 连多个 Server',
          '写一个 transport',
          '实现 JSON-RPC 库',
        ],
        answer: 1,
        explain: 'Client 是 Host 内部的连接组件，不是用户-facing 应用。',
        concept: 'mcp-triad',
      },
    ],
    [
      ['Host', '用户-facing 应用，决定接哪些 Server、给模型哪些工具'],
      ['Client', 'Host 内与单个 Server 一一对应的连接器'],
      ['能力协商', '握手中交换 capabilities，决定可用方法'],
      ['transport', 'stdio（本地子进程）或远程 HTTP，决定权限与部署形态'],
    ],
    [
      '让 Host 直接管多条连接，命名空间与故障隔离全挤在应用层。',
      '往 stdout 写日志污染协议流，表现为「连接莫名断开」。',
      '忽略 notifications/initialized，后续请求被拒或挂起。',
    ],
  ),
  'theory',
)
