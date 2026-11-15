import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L37 = withKind(
  L(
    'L37',
    4,
    '实战：给运行时加上流式输出（SSE / async iterator）',
    3,
    ['L36'],
    ['streaming'],
    [
      '把一次性返回的运行时改造成流式输出',
      '实现 async iterator 与 SSE 两种出口，并保持与同步结果等价',
      '处理分片聚合、心跳保活、客户端断开时中止上游三类工程问题',
    ],
    `
### 40 秒的白屏

一个文档问答产品上线首周，用户反馈集中在一点：「点了没反应」。

真实情况是有的：后端在 40 秒后返回了完整答案，质量也不错。但那 40 秒里前端只有一个加载圈，用户在第 8 秒就开始怀疑卡死，第 20 秒开始刷新页面——每次刷新都重新发起一次完整请求，于是服务端负载翻倍，延迟进一步上升。

这不是性能问题，是**反馈问题**。模型生成是一个 token 一个 token 产的，一次性返回等于把「已经产出的部分」全部藏起来。流式做的就是把它露出来：首字延迟从 40 秒降到 1 秒，用户就知道系统活着。

对 Agent 而言，流式还有两个更实在的价值：

- **可中断**：用户看到方向不对，可以立刻停，而不是等 40 秒后才发现白等。
- **可观测**：流式事件本身是轨迹的一半（thought 流、tool call 流），排查问题比读最终结果有用得多。

### 三种「流」的层次

先分清你在说哪一层：

| 层次 | 载体 | 谁消费 | 断线行为 |
|---|---|---|---|
| 模型流 | provider 的 \`on('text')\` 回调 / \`AsyncIterable\` | 你的服务端 | 抛错或静默截断 |
| 应用流 | \`AsyncGenerator\`（语义事件：delta / tool / done） | 你的运行时与前端 SDK | 生成器 \`return()\` 可清理 |
| 传输流 | SSE / WebSocket / NDJSON | 浏览器 | 需心跳与重连 |

三层的职责不同：模型流是字节，应用流是**语义**（哪些是文本、哪些是工具调用、哪些是状态变化），传输流是协议。**关键设计是中间那层**——把 provider 的差异吃掉，上层只认语义事件。

如果跳过应用流、直接把 provider 的字节透传给前端，你会付出三个代价：换模型要改前端、工具调用分片要靠前端拼、错误无法统一成结构化事件。

### 第一步：把 provider 包装成 AsyncIterable

多数 provider 提供的是回调式 API（\`on('text', cb)\`）或自带迭代器。统一成 \`AsyncGenerator\` 是最省事的做法，因为 \`for await\` 天然支持「消费到一半就退出」。

\`\`\`ts title="把回调式 provider 包装成异步迭代器" note="关键是 return() 里要 abort 上游——否则消费者提前退出时，请求还在后台跑着烧钱。"
export type Chunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; index: number; name?: string; argsDelta?: string }
  | { type: 'usage'; tokens: number }
  | { type: 'error'; message: string }

export async function* streamModel(
  input: { messages: unknown[] },
  signal: AbortSignal,
): AsyncGenerator<Chunk> {
  const queue: Chunk[] = []
  let notify: (() => void) | null = null
  let finished = false
  let failure: Error | null = null

  const ctrl = new AbortController() // 把外部 signal 与内部取消连起来
  signal.addEventListener('abort', () => ctrl.abort())

  const client = await getClient()
  client.on('text', (delta: string) => {
    queue.push({ type: 'text', delta })
    notify?.()
  })
  client.on('tool_call', (tc: { index: number; name?: string; argsDelta?: string }) => {
    queue.push({ type: 'tool_call', ...tc })
    notify?.()
  })
  client.on('error', (e: Error) => {
    failure = e
    notify?.()
  })
  client.on('end', () => {
    finished = true
    notify?.()
  })

  try {
    for await (const _ of client.run(input, { signal: ctrl.signal })) {
      // 驱动 provider 的执行；事件已通过回调进入 queue
      void _
      while (queue.length) yield queue.shift()!
    }
    while (queue.length) yield queue.shift()!
    if (failure) throw failure
  } finally {
    // 消费者提前退出（break / return / 客户端断开）时走到这里
    if (!finished) ctrl.abort()
  }
}
\`\`\`

\`finally\` 里那一行是整个包装的重点。异步迭代器被 \`break\` 掉时，会调用它的 \`return()\` 并执行 \`finally\`——这正是「客户端断开后停止上游生成」的挂钩点。少了它，用户关掉页面，服务端还在为一个没人看的回答付费。

### 第二步：在运行时里消费流，同时保持状态推进

流式最容易破坏的是 L36 那套「状态推进」的清晰度：文本是一段段来的，你不能每来一段就当作一次状态推进。正确做法是**流式只影响「呈现」，不影响「推进」**——一轮结束后，仍然用聚合好的完整文本走一次 \`applyObservation\`。

\`\`\`ts title="在 decide 里消费流：聚合后再推进状态" note="onDelta 只用于向前端透出；tokens 与 action 在流结束后才确定。"
export async function decideStreaming(
  s: State,
  deps: Deps,
  onDelta: (d: string) => void,
): Promise<{ action: Action; tokens: number }> {
  const parts: string[] = []
  const toolBuf = new Map<number, { name: string; args: string }>()
  let tokens = 0

  for await (const c of streamModel({ messages: s.msgs }, deps.signal)) {
    if (c.type === 'text') {
      parts.push(c.delta)
      onDelta(c.delta) // 只透出，不推进状态
    } else if (c.type === 'tool_call') {
      const cur = toolBuf.get(c.index) ?? { name: '', args: '' }
      toolBuf.set(c.index, {
        name: c.name ?? cur.name,
        args: cur.args + (c.argsDelta ?? ''), // 参数是分片到达的，必须拼
      })
    } else if (c.type === 'usage') {
      tokens += c.tokens
    }
  }

  if (toolBuf.size > 0) {
    const [index] = [...toolBuf.keys()]
    const tc = toolBuf.get(index)!
    return { action: { type: 'tool', tool: tc.name, args: JSON.parse(tc.args || '{}') }, tokens }
  }
  return { action: { type: 'finish', answer: parts.join('') }, tokens }
}
\`\`\`

两个细节：

**工具参数必须按 \`index\` 拼接。** 流式下 \`arguments\` 是一段段来的（\`{"q":\`、\`"北京"\`、\`}\`），每个分片单独看都不是合法 JSON。常见 bug 是「每收到一个分片就 \`JSON.parse\`」，必然失败——必须等流结束再拼一次。

**不要用「已收到的部分文本」做决策。** 有人为了「早点开始下一步」，在文本流到一半时就判断「它是不是想调工具」。这在 JSON 分片场景下必然误判，正确做法永远是等流结束、拿到结构化结果再决策。

### 第三步：SSE 出口

SSE 的优势是「单向、纯文本、浏览器原生支持、过代理友好」。实现上要注意三件事：事件格式、心跳、断开处理。

\`\`\`ts title="SSE 端点：格式 / 心跳 / 断开" note="每个事件以两个换行结束；注释行（以冒号开头）可当心跳，不被当作事件。"
export function toSSE(gen: AsyncGenerator<Chunk>, signal: AbortSignal): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(\`event: \${event}\\ndata: \${JSON.stringify(data)}\\n\\n\`))
      }
      // 心跳：代理（nginx / CDN）常在 30~60s 无数据时断连接
      const hb = setInterval(() => controller.enqueue(encoder.encode(': ping\\n\\n')), 15_000)

      try {
        for await (const c of gen) {
          if (signal.aborted) break
          send(c.type, c)
        }
        send('done', { ok: true })
      } catch (e) {
        send('error', { message: (e as Error).message })
      } finally {
        clearInterval(hb)
        controller.close()
      }
    },
    cancel() {
      // 客户端断开：让生成器 return()，触发上游 abort
      void gen.return(undefined)
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform', // no-transform 防止代理缓冲
      connection: 'keep-alive',
    },
  })
}
\`\`\`

三个点都是踩出来的：

**\`no-transform\` 不能省。** 某些 CDN 或压缩中间件会缓冲响应体，导致「服务端已经在发，浏览器还是一片空白」。加这个头是告诉它们「别动这个流」。

**心跳必须有。** 模型在思考时可能十几秒没有输出（尤其是长思考 + 工具调用之间），代理会判定连接空闲并断开。15 秒一次的注释行是最轻的心跳。

**\`cancel()\` 里要 \`gen.return()\`。** 只置一个布尔标记不够——生成器的 \`finally\` 只有在被 \`return()\` 或 \`throw()\` 时才执行，而那里才是 \`abort()\` 上游的位置。

### 三个必须处理的坑

**坑一：UTF-8 分片断裂。** 一个中文字符占 3 字节，网络分片可能把它切成两半。如果按字节解码再拼接，会出现乱码（\`�\`）。正确做法是用 \`TextDecoder\` 的流式模式（\`{ stream: true }\`），它会缓存不完整的字节序列。

**坑二：重连导致重复。** 浏览器 \`EventSource\` 会自动重连，重连后服务端会从头再发一遍。要么用 \`Last-Event-ID\` 做断点续传，要么在事件里带自增 \`seq\`，前端去重。对 Agent 来说更常见的做法是**不允许重连**：断开即终止，让前端重新发起整个请求（因为中途状态在服务端不好恢复）。

**坑三：错误被吞。** 流已经开始（HTTP 200 已发出），此时出错没法改状态码了。所以错误必须以 \`event: error\` 的形式作为**流内事件**发出，前端据此展示重试按钮。这也是为什么上面的 \`Chunk\` 里有 \`error\` 类型。

:::deep

### 流式的等价性怎么测

流式改造最容易引入的 bug 是「流式和一次性返回的结果不一致」——多一个字、少一个换行、工具没被调用。这类差异在小样本上看不出来，上线后在特定输入上才暴露。

可靠的测法是**等价性断言**：

\`\`\`ts
// 同一输入，分别走一次性路径与流式路径，聚合后必须逐字相等
const once = await runOnce(input)
const streamed = await drain(streamModel(input))
assert.equal(streamed.text, once.text)
assert.deepEqual(streamed.toolCalls, once.toolCalls)
\`\`\`

再加一条**分片不变性**：把同一个响应随机切成 1/2/3/7 字节的片段喂进聚合器，输出必须完全一致。这条能抓住绝大多数「分片边界」相关的 bug（UTF-8 断裂、JSON 半包、事件被拆开）。

分片测试不需要真实模型：用一段固定的 SSE 文本，按随机边界切片即可。这是投入产出比最高的一类测试。

:::

:::warn

### 不要在流中间做业务判断

流式给人一个诱惑：既然能边收边看，那也可以边收边判断——「看到『无法回答』就提前终止」「看到工具名就开始准备参数」。

这类优化几乎都会出错，因为**分片边界是不可控的**：你可能在 \`无法\` 时就判断，而完整句子是 \`无法确认，但可以推测\`。判断依据越依赖语义，越必须等完整。

正确的心智模型是：**流是「展示通道」，不是「决策通道」**。决策永远基于聚合后的完整结果；流只负责让用户早点看到东西。

:::

### 收束：流式是一次「契约改造」

流式不是「加个 \`on('text')\` 回调」，它改变了三处契约：

1. **HTTP 状态码失效**：200 之后出错只能走流内事件。
2. **错误处理位置变化**：从「返回值」变成「流内事件 + 生成器 finally」。
3. **生命周期变长**：请求从「发出去-等回来」变成了「持续占用连接」，取消与超时都要重新设计。

这三处变化解释了为什么很多项目「加了流式之后 bug 变多」——不是流式难，而是它把原本藏在「一次性返回」背后的边界条件全部暴露了出来。

L38 换到工具侧：Function Calling 的协议是怎么把「模型想调工具」翻译成结构化的调用请求的。它会解释上面那个「参数分片」的现象从哪来。

`,
    null,
    [
      {
        text: '三层「流」中，负责把 provider 差异吃掉、上层只认语义事件的是？',
        options: ['模型流', '应用流（AsyncGenerator）', '传输流', '日志流'],
        answer: 1,
        explain: '应用流承载语义事件（text / tool_call / error），是设计的核心层。',
        concept: 'streaming',
      },
      {
        text: '异步迭代器的 finally 里为什么要 abort 上游？',
        options: [
          '为了省内存',
          '消费者 break 或客户端断开时触发，否则请求还在后台跑着烧钱',
          '为了让日志完整',
          '避免类型错误',
        ],
        answer: 1,
        explain: 'return() 会执行 finally，这是取消上游的唯一挂钩点。',
        concept: 'streaming',
      },
      {
        text: '流式下工具参数为什么必须等流结束再解析？',
        options: [
          '解析更快',
          'arguments 是分片到达的，单个分片不是合法 JSON',
          '避免内存泄漏',
          'provider 要求',
        ],
        answer: 1,
        explain: '按 index 拼接完才能 JSON.parse。',
        concept: 'streaming',
      },
      {
        text: 'SSE 响应头里 `no-transform` 的作用是？',
        options: [
          '禁止压缩',
          '告诉 CDN / 中间件不要缓冲响应体，否则前端收不到即时数据',
          '开启缓存',
          '限制编码',
        ],
        answer: 1,
        explain: '缓冲会让「已在发送」看起来像「一片空白」。',
        concept: 'streaming',
      },
      {
        text: '流式等价性测试里「随机分片」主要抓什么 bug？',
        options: ['模型幻觉', '分片边界问题：UTF-8 断裂、JSON 半包、事件被拆开', '权限错误', '网络超时'],
        answer: 1,
        explain: '按 1/2/3/7 字节切同一段响应，输出必须一致。',
        concept: 'streaming',
      },
    ],
    [
      ['应用流', '承载语义事件的 AsyncGenerator，屏蔽 provider 差异'],
      ['SSE', '单向文本事件流，浏览器原生支持、过代理友好'],
      ['心跳', '定期发送注释行防止代理判定连接空闲'],
      ['等价性断言', '聚合后的流式结果必须与一次性返回逐字一致'],
    ],
    [
      '把 provider 字节直接透传前端，换模型就要改前端、参数分片靠前端拼。',
      '缺心跳导致代理在思考期间断连；缺 no-transform 导致响应被缓冲。',
      '在流中间基于部分文本做业务判断，分片边界必然误判。',
    ],
  ),
  'practice',
)
