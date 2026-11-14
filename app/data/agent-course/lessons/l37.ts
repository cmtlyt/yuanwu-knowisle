import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L37 = withKind(
  L(
    'L37',
    4,
    '实战：给运行时加上流式输出（SSE / async iterator）',
    4,
    ['L36'],
    ['streaming'],
    [
      '理解「边生成边消费」对流式输出的意义',
      '用 async iterator 实现 token 级流式读取',
      '对照 Vercel AI SDK 的 streamText / toDataStream',
    ],
    `
### 为什么要流式

一次完整回答可能要几秒甚至几十秒。如果不流式，用户只能盯着空白等全部生成完；流式则让 token **边生成边显示**，体验大幅提升。底层是 SSE（Server-Sent Events）或 HTTP 流。

\`\`\` title="用 async iterator 消费流" note="关键：\\\`stream: true\\\` + 逐块解析 SSE，把「一次大响应」变成「token 流」。"
// 流式客户端：返回 async iterable，逐个产出 token
async function* streamChat(client: LlmClient, messages: Message[]) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer ..." },
    body: JSON.stringify({ model, messages, stream: true }),
  })
  for await (const chunk of res.body) {        // 逐块读取
    for (const delta of parseSSE(chunk)) {      // 解析 SSE 增量
      if (delta.content) yield delta.content    // 逐 token 产出
    }
  }
}

// 消费方：边生成边处理
for await (const token of streamChat(client, messages)) {
  process.stdout.write(token)  // 或实时推给前端
}
\`\`\`

:::deep

### 流式对 Agent 意味着什么

流式不只改善体验，还影响运行时设计：循环里的「观测回填」在流式下要等一个完整 Action 结束才能解析，不能拿到半个 token 就执行。因此运行时通常「边流式显示边缓冲」，缓冲完整 Action 后再执行。

:::

:::tip

### 框架对照：Vercel AI SDK

AI SDK 的 \\\`streamText()\\\` 返回一个流，\\\`toDataStream()\\\` 把它转成前端可消费的协议。它把你手写的「逐块读 + 解析 SSE + yield」封装成一行 API，但底层机制完全一致。

:::

### 流式的三个要点

- SSE 是传输层，async iterator 是消费模型。
- 「边流式显示」与「完整 Action 再执行」要分开缓冲。
- 断流要处理：网络中断时给用户明确的「生成中断」提示。

:::warn

### 别在流未结束时执行 Action

拿到半个 Action 就执行，可能拿到「search_wea」（不完整工具名）就去调用，直接失败。流式下必须缓冲到完整结构再解析。

:::

`,
    null,
    [
      {
        text: '流式输出底层通常基于什么？',
        options: ['WebSocket 唯一', 'SSE（Server-Sent Events）或 HTTP 流', '轮询', 'UDP'],
        answer: 1,
        explain: 'SSE 或 HTTP 流。',
        concept: 'streaming',
      },
      {
        text: '流式下「观测回填」的正确做法是？',
        options: [
          '拿到半个 token 就执行',
          '边流式显示边缓冲，缓冲完整 Action 再执行',
          '等全部结束',
          '不执行',
        ],
        answer: 1,
        explain: '缓冲到完整 Action 再解析执行。',
        concept: 'streaming',
      },
      {
        text: 'Vercel AI SDK 的 streamText / toDataStream 与你手写的对应关系是？',
        options: ['完全无关', '把逐块读 + 解析 SSE + yield 封装成 API', '是另一套协议', '只用于 Python'],
        answer: 1,
        explain: '封装了同样的流式机制。',
        concept: 'streaming',
      },
    ],
    [
      ['SSE', 'Server-Sent Events，服务端单向推送事件的协议'],
      ['async iterator', '`for await...of` 可逐个消费的异步可迭代对象'],
      ['缓冲解析', '流式累积直到完整结构再解析'],
    ],
    ['拿到半个 Action 就去执行，工具名不完整导致失败。', '断流不处理，用户卡在「生成中」无提示。'],
  ),
  'practice',
)
