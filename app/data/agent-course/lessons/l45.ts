import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 6 ========== */

export const L45 = withKind(
  L(
    'L45',
    6,
    '实战：不依赖框架用 TS 实现 MCP（手写 JSON-RPC + stdio）',
    3,
    ['L44'],
    ['mcp-handwritten'],
    [
      '用手写 JSON-RPC + stdio 实现一个可被真实 Host 连上的 MCP Server',
      '掌握行分隔协议的读写、id 关联与错误码约定',
      '写出不依赖网络的单测，覆盖握手、列工具、调工具、错误四类路径',
    ],
    `
### 40 行能跑，一上真 Host 就连不上

有人按文档写了个最小的 MCP Server，本地用 \`echo\` 喂一条 JSON 能正确返回，测试通过。接进真实 Host 后现象是：Host 显示「正在连接」，然后超时。

三个原因，每一个都很小：

1. \`tools/list\` 返回的 \`inputSchema\` 字段名写成了 \`schema\`——Host 侧解析不到参数定义，把工具当成了「无参数」，握手后校验失败。
2. 启动了但没处理 \`notifications/initialized\`，Host 认为初始化没完成，不往下走。
3. 某处 \`console.log\` 把一行调试信息打到了 stdout，协议流里混进非 JSON。

三条都不是「协议不会用」，而是「协议跑在真实进程里」的细节。手写一遍的价值就在这里：**这些细节只有你自己实现时才会浮出水面**。

### 四层结构

一个最小 Server 可以拆成四层，每层只做一件事：

\`\`\`
transport  ← 行分隔 JSON 的读写（stdin / stdout）
rpc        ← id 关联、请求/通知区分、错误码
dispatch   ← method 路由（initialize / tools/list / tools/call）
domain     ← 真正的业务实现（查、算、写）
\`\`\`

分层的好处是测试：\`domain\` 可以纯单元测，\`dispatch\` 可以喂 JSON 测，\`transport\` 只需测「拆行」与「不污染」。三层分开测，比端到端跑一个进程快得多。

### transport：一行一条，不能多行

stdio 的约定是「一行一个 JSON 对象」。这条约束带来两个直接要求：

- **不能 pretty print**。\`JSON.stringify(obj, null, 2)\` 会输出多行，Client 按行读会得到一堆碎片。
- **不能有任何非 JSON 输出**。日志必须走 stderr。

\`\`\`ts title="transport：行分隔读写 + 错误隔离" note="核心是 readline + 逐行 parse；单行解析失败只丢弃该行，不能让进程崩。"
import { createInterface } from 'node:readline'

export interface Rpc {
  request(method: string, params?: unknown): Promise<unknown>
  notify(method: string, params?: unknown): void
}

export function attachStdio(handler: (msg: unknown) => Promise<unknown | undefined>): Rpc {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg: { id?: number | string; method?: string; params?: unknown }
    try {
      msg = JSON.parse(trimmed)
    } catch {
      // 单行坏了只丢这一行，绝不退出进程
      process.stderr.write('bad json line: ' + trimmed.slice(0, 80) + '\\n')
      return
    }
    void handler(msg).then((result) => {
      // 通知（无 id）不回包
      if (msg.id === undefined) return
      const out = result instanceof Error
        ? { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: result.message } }
        : { jsonrpc: '2.0', id: msg.id, result: result ?? {} }
      process.stdout.write(JSON.stringify(out) + '\\n')
    })
  })

  return {
    request: async () => {
      throw new Error('Server 侧不发起请求（示例未实现 sampling）')
    },
    notify: (method, params) => {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\\n')
    },
  }
}
\`\`\`

两个细节值得强调：

**\`crlfDelay: Infinity\`** 让 \`\\r\\n\` 与 \`\\n\` 都被当作行结束。Windows 上不加这个参数会出现「最后一行丢一个 \`\\r\`」的诡异解析错误。

**\`id === undefined\` 判断通知**。JSON-RPC 里「有 id」表示要回包，「无 id」表示通知。用 \`if (!msg.id)\` 判断是错的——\`id: 0\` 是合法的，会被误判成通知。

### dispatch：method 路由与错误码

路由表很简单，但错误语义要想清楚：

\`\`\`ts title="dispatch：握手 + 列工具 + 调工具" note="方法不存在返回 -32601，参数问题返回 -32602，业务失败用 isError 而不是协议错误。"
interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run: (args: Record<string, unknown>) => Promise<string>
}

const tools = new Map<string, ToolDef>()

export function register(def: ToolDef) {
  tools.set(def.name, def)
}

export async function dispatch(msg: { method?: string; params?: unknown }): Promise<unknown> {
  const params = (msg.params ?? {}) as Record<string, unknown>

  switch (msg.method) {
    case 'initialize':
      return {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'acme-demo', version: '0.1.0' },
      }

    case 'notifications/initialized':
      return undefined // 通知，无返回

    case 'ping':
      return {}

    case 'tools/list':
      return {
        tools: [...tools.values()].map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema, // 字段名必须是 inputSchema
        })),
      }

    case 'tools/call': {
      const name = String(params.name ?? '')
      const def = tools.get(name)
      if (!def) {
        // 未知工具属于「业务失败」，用 isError 让模型看见，而不是协议错误
        return { content: [{ type: 'text', text: \`未知工具：\${name}\` }], isError: true }
      }
      const args = (params.arguments ?? {}) as Record<string, unknown>
      try {
        const text = await def.run(args)
        return { content: [{ type: 'text', text }], isError: false }
      } catch (e) {
        return { content: [{ type: 'text', text: (e as Error).message }], isError: true }
      }
    }

    default:
      throw Object.assign(new Error(\`Method not found: \${msg.method}\`), { code: -32601 })
  }
}
\`\`\`

三个设计决定：

**未知工具返回 \`isError: true\`，不抛协议错误。** 这条区分很重要：协议错误（\`-32601\`）意味着「你调了不存在的 RPC 方法」，是客户端 bug；\`isError\` 意味着「工具跑了但失败了」，是业务信息，应该让模型看到并自我修正（L38 的原则）。

**业务异常同样用 \`isError\`。** 工具内部抛错不该让整个 RPC 失败，否则 Host 会认为协议层出问题。

**\`tools/list\` 的字段名是 \`inputSchema\`。** 这是最容易被写错的一个字段——写成 \`schema\`、\`parameters\`（OpenAI 风格）都不会报错，只会让 Host 看不到参数定义。

### 组装与跑起来

\`\`\`ts title="server.ts：40 行的完整入口" note="注意最后两行：监听 stdin 关闭，避免成为孤儿进程。"
import { attachStdio } from './transport'
import { register, dispatch } from './dispatch'

register({
  name: 'word_count',
  description: '统计一段文本的字符数与词数',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: '待统计的文本' } },
    required: ['text'],
  },
  run: async ({ text }) => {
    const s = String(text ?? '')
    const words = (s.match(/[一-鿿]|[A-Za-z0-9]+/g) ?? []).length
    return JSON.stringify({ chars: s.length, words })
  },
})

attachStdio(async (msg) => {
  try {
    return await dispatch(msg as { method?: string })
  } catch (e) {
    const err = e as Error & { code?: number }
    return Object.assign(new Error(err.message), { code: err.code ?? -32603 })
  }
})

// 父进程关闭 stdin（Host 退出）时主动退出，避免孤儿进程
process.stdin.on('end', () => process.exit(0))
\`\`\`

### 不依赖网络的测试

手写实现的好处之一是「测试不需要起进程」。把 \`dispatch\` 当成纯函数测，四条断言就能覆盖主要路径：

\`\`\`ts title="dispatch 的单测：喂对象、断结果" note="不需要 spawn 子进程，也不需要真实 Host。"
import { dispatch, register } from './dispatch'

register({
  name: 'echo',
  description: '回显',
  inputSchema: { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] },
  run: async ({ v }) => 'echo:' + String(v),
})

// ① 握手返回能力声明
const init = (await dispatch({ method: 'initialize' })) as { capabilities: { tools?: unknown } }
console.assert(Boolean(init.capabilities.tools), '① initialize 必须声明 tools 能力')

// ② 列工具用 inputSchema 字段
const list = (await dispatch({ method: 'tools/list' })) as { tools: { inputSchema?: unknown }[] }
console.assert(list.tools.every((t) => 'inputSchema' in t), '② 字段名必须是 inputSchema')

// ③ 正常调用
const ok = (await dispatch({
  method: 'tools/call',
  params: { name: 'echo', arguments: { v: 'hi' } },
})) as { content: { text: string }[]; isError: boolean }
console.assert(ok.isError === false && ok.content[0]!.text === 'echo:hi', '③ 正常调用')

// ④ 未知工具走 isError，不抛协议错误
const miss = (await dispatch({ method: 'tools/call', params: { name: 'nope', arguments: {} } })) as {
  isError: boolean
}
console.assert(miss.isError === true, '④ 未知工具')
\`\`\`

第四条的语义值得再强调一次：如果这里抛了 \`-32601\`，Host 会认为「这个 Server 不认 tools/call」，可能直接把它标记为不可用；而返回 \`isError\` 时，Host 会把错误文本交给模型，模型下一轮换个工具名——这正是我们想要的自我修正。

### 联调：不装 Host 也能自测

手写实现的一个好处是「可以用管道自测」。把请求按行喂进去，看输出是否符合预期：

\`\`\`bash
# 一次握手 + 列工具，两行输入对应两条响应
printf '%s\\n' \\
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \\
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \\
  | node dist/server.js
\`\`\`

这种自测能覆盖 80% 的问题：字段名、错误码、通知是否回包（应该不回）、stdout 是否被污染（输出的每一行都该是 JSON）。剩下 20% 才需要真实 Host——通常是「生命周期」相关的问题，比如启动超时与进程残留。

错误码也值得固定下来，避免每次现场决定：

| 场景 | 码 | 含义 |
|---|---|---|
| 方法不存在 | \`-32601\` | 客户端调了未实现的 RPC 方法 |
| 参数结构不对 | \`-32602\` | 缺字段、类型不符（协议层） |
| 内部异常 | \`-32603\` | Server 自身 bug |
| 工具执行失败 | 无（用 \`isError\`） | 业务失败，交给模型处理 |

最后一行是这一节最需要记住的约定：**业务失败不占用协议错误码**。协议错误是「通信层面的问题」，\`isError\` 是「任务层面的结果」。

### Server 侧也要有边界

手写 Server 时常忘一件事：**它也是一个执行器，同样需要 L40 那套边界**。

三个最低要求：

- **超时**。工具实现里的 HTTP 调用、文件读取都要带超时。Server 侧的阻塞会让 Host 侧的整个会话卡住——因为 stdio 是单通道，一条消息没处理完，后面的都排队。
- **结果裁剪**。工具返回的内容直接进模型上下文，一个「读整个文件」的工具会一次塞进几万 token。Server 应当自己裁剪并标注「已省略」，而不是把原始内容全丢给 Host。
- **权限自检**。stdio 下 Server 继承 Host 进程权限，这意味着它能读用户能读的一切。工具实现应当自己限制路径范围（比如只允许读工作目录下的文件），而不是假设「Host 会拦」。

第三条尤其重要：**权限继承是便利，也是风险**。用户在 IDE 里装一个「文件系统 Server」，本意是让它改项目文件；如果它内部对路径不做限制，模型一句「读一下 \`~/.ssh/id_rsa\`」就能拿到私钥。这类边界不该指望模型自觉，也不该指望 Host 拦——Server 自己最清楚「哪些路径是合理的」。

:::deep

### 为什么要自己实现 transport 而不是用现成的

一个合理的疑问：既然有 SDK，为什么还要手写这一遍？

**因为 transport 是所有诡异问题的发生地。** 你迟早会遇到：Host 说「连接成功但看不到工具」（字段名）、「调工具没反应」（通知漏发）、「连接随机断」（stdout 被污染）、「进程越积越多」（没监听 stdin end）。

这些问题的共同点是：**它们不报协议错误，只表现为「行为不对」**。如果你没写过 transport，排查时只能靠猜；写过之后，你知道该看哪一行。

手写的第二个收益是「知道 SDK 帮你做了什么」。L46 会用官方 SDK 重写同一个 Server，那时你会清楚看到：SDK 把行读写的边界、错误码、能力协商、甚至 \`inputSchema\` 的字段校验都包了进去。**知道它包了什么，才知道它没包什么**（比如超时、权限、结果裁剪，SDK 通常不管）。

:::

:::warn

### 大结果与长任务：协议层的两个边界

**边界一：单条消息不能无限大。** Host 通常有单条消息的上限（几十 MB 量级），而工具可能返回一个大文件的内容。正确做法是**分页或截断**，并在结果里明确告诉模型「还有多少没返回」——不要指望协议层帮你分片。

**边界二：长任务不该阻塞响应。** 一个跑 5 分钟的查询，如果同步等结果再返回，Host 侧会超时（通常 60 秒）。MCP 提供了 progress 通知的机制：先回一个「已接受」，再用 \`notifications/progress\` 汇报进度。手写实现里至少要做到「先回响应，再在后台跑」，把结果通过后续通知或 \`tasks\` 类机制交付。

这两个边界在 demo 里不会遇到，在真实数据上必然遇到。

:::

### 收束：协议不难，边界难

手写一遍下来，JSON-RPC 本身只有「一行一条、id 回显、通知不回」三条规则。真正花时间的是边界：进程生命周期、stdout 污染、字段名、错误语义、大结果。

这也解释了为什么「协议很简单」的批评不影响它被采用——**协议的价值从来不在于复杂，而在于一致**。所有人都在同一批边界上踩过坑，于是这些坑的解法可以共享。

L46 用官方 SDK 重写同一个 Server，逐行对照：哪些代码消失了，哪些仍然要自己写。

`,
    null,
    [
      {
        text: 'stdio 下「一行一条 JSON」意味着不能做什么？',
        options: [
          '不能压缩',
          '不能 pretty print，也不能有任何非 JSON 输出（日志必须走 stderr）',
          '不能并发',
          '不能返回大结果',
        ],
        answer: 1,
        explain: '多行或杂输出都会让按行解析的 Client 失败。',
        concept: 'mcp-handwritten',
      },
      {
        text: '判断一条消息是不是通知，正确依据是？',
        options: ['id 是否为真值', 'id 是否为 undefined', 'method 是否存在', '有没有 params'],
        answer: 1,
        explain: 'id: 0 合法，用 `!id` 判断会误判。',
        concept: 'mcp-handwritten',
      },
      {
        text: '`tools/list` 返回中参数定义的字段名是？',
        options: ['schema', 'parameters', 'inputSchema', 'args'],
        answer: 2,
        explain: '写成 schema / parameters 不报错，但 Host 看不到参数定义。',
        concept: 'mcp-handwritten',
      },
      {
        text: '未知工具名应该怎么返回？',
        options: [
          '抛 -32601 协议错误',
          '返回 content + isError: true，让模型看见并自我修正',
          '静默返回空',
          '退出进程',
        ],
        answer: 1,
        explain: '协议错误会被 Host 当成 Server 不可用。',
        concept: 'mcp-handwritten',
      },
      {
        text: '长任务在 MCP 里该怎么处理？',
        options: [
          '同步等结果，让 Host 超时',
          '先回响应，再用 progress 通知汇报进度',
          '直接返回空',
          '拆成多个 Server',
        ],
        answer: 1,
        explain: '阻塞响应会触发 Host 侧超时。',
        concept: 'mcp-handwritten',
      },
    ],
    [
      ['行分隔 JSON', 'stdio transport 的约定：一行一个 JSON 对象'],
      ['inputSchema', 'MCP 工具参数定义的字段名，易与 schema/parameters 混淆'],
      ['isError', '业务失败的标记，与协议错误区分'],
      ['孤儿进程', 'Host 退出后仍存活的 Server 子进程'],
    ],
    [
      '往 stdout 打日志或 pretty print JSON，污染协议流。',
      '用 `!msg.id` 判断通知，把 id: 0 的请求当通知不回包。',
      '未知工具抛协议错误，Host 判定 Server 不可用。',
    ],
  ),
  'practice',
)
