import { L } from '../../course-builders.ts'

/* ========== Stage 1 ========== */

export const L10 = L(
  'L10',
  1,
  '实战：调通你的第一个 LLM 调用（裸 fetch vs 官方 SDK）',
  16,
  2,
  ['L04', 'L05'],
  ['llm-call'],
  [
    '用裸 fetch 打通一次 OpenAI 兼容的 chat 调用',
    '对比官方 SDK 的封装差异，理解「不确定性」来自哪里',
    '学会观察并处理超时、重试与温度带来的不确定性',
  ],
  `
### 第一次调用，先裸后 SDK

和「先手写后框架」一致：先用裸 fetch 亲手拼一次请求，看清协议长什么样，再用官方 SDK 感受它帮你省掉了什么。

\`\`\` title="裸 fetch：亲手拼请求" note="这就是「协议本体」：一个 POST + 一段 JSON。所有 SDK 最终都在干这件事。"
const res = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "用一句话解释什么是 Agent" }],
    temperature: 0.2,
  }),
})
const data = await res.json()
console.log(data.choices[0].message.content)
\`\`\`

\`\`\` title="官方 SDK：封装了什么" note="SDK 帮你处理了：鉴权、重试、错误类型、流式、类型定义。裸 fetch 里这些都要自己写。"
import OpenAI from "openai"

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const completion = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "用一句话解释什么是 Agent" }],
})
console.log(completion.choices[0].message.content)
\`\`\`

:::deep

### 不确定性来自哪里

同一个 prompt 连调两次，答案可能不同——这是模型的采样特性（受 temperature 影响）。Agent 工程要接受这一点：把「可能的偏差」交给执行层校验，而不是追求模型永远给同一个答案。

:::

### 观察三个不确定性来源

- 采样随机性：temperature 越高，输出越随机。
- 网络与限流：超时、429 限流、5xx，需要重试与退避。
- 内容漂移：模型版本或输入细节变化，输出分布随之漂移。

:::warn

### 重试不等于无限重试

网络错误可以重试，但内容错误重试未必有用（可能得到同样的错误）。重试要配退避（exponential backoff）和上限，并区分「可重试错误」与「不可重试错误」。

:::

\`\`\` title="带退避的最小重试" note="500ms → 1s → 2s 的指数退避；第 3 次仍失败才抛出。"
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; i < tries; i++) {
    try { return await fn() }
    catch (e) {
      if (i === tries - 1) throw e
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))  // 指数退避
    }
  }
  throw new Error("unreachable")
}
\`\`\`

`,
  null,
  [
    {
      text: '裸 fetch 与官方 SDK 的本质关系是？',
      options: [
        'SDK 是另一套协议',
        'SDK 最终也在发 POST + JSON，只是封装了鉴权/重试/类型',
        'SDK 完全不用 HTTP',
        '裸 fetch 无法调 LLM',
      ],
      answer: 1,
      explain: '协议本体就是一个 POST + JSON；SDK 封装了鉴权、重试、错误、流式、类型。',
      concept: 'llm-call',
    },
    {
      text: '同一个 prompt 连调两次答案不同，主要原因是？',
      options: ['模型坏了', '采样随机性（受 temperature 影响）', '网络抖动', '鉴权过期'],
      answer: 1,
      explain: '这是模型的采样特性，temperature 越高越随机；Agent 工程要接受并靠执行层校验。',
      concept: 'llm-call',
    },
    {
      text: '关于重试，正确的做法是？',
      options: [
        '无限重试直到成功',
        '内容错误也无限重试',
        '配指数退避与上限，区分可重试/不可重试错误',
        '不重试',
      ],
      answer: 2,
      explain: '重试要配退避和上限，并区分网络错误（可重试）与内容错误（重试未必有用）。',
      concept: 'llm-call',
    },
  ],
  [
    ['temperature', '控制采样随机性的参数，越高输出越随机'],
    ['指数退避', '重试间隔按 2 的幂递增（500ms→1s→2s）的退避策略'],
    ['OpenAI 兼容接口', '遵循 OpenAI chat/completions 协议的 API 形态'],
  ],
  ['对内容错误无脑重试，既烧钱又得不到更好结果。', '在裸 fetch 里忘了处理 429 / 5xx，第一次遇到限流就崩溃。'],
)
