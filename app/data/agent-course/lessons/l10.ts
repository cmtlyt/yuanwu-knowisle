import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 1 ========== */

export const L10 = withKind(
  L(
    'L10',
    1,
    '实战：调通你的第一个 LLM 调用（裸 fetch vs 官方 SDK）',
    2,
    ['L04', 'L05'],
    ['llm-call'],
    [
      '用裸 fetch 打通一次 OpenAI 兼容的 chat 调用并显式处理超时与错误',
      '写出对照的 SDK 版本，把默认超时、默认重试逐项覆盖成显式配置',
      '跑通温度、超时、429 三类回归断言，能区分三类不确定性',
    ],
    `
### 调通第一次只要五分钟，第二次却不一样了

照着文档发出第一个请求、拿到一句「你好」，大家都很有成就感。麻烦从第二次开始：同样的输入，换了段措辞；挂了几秒没返回，不知道该不该重试；换成官方 SDK 之后，一次 429 居然被自动重试了两回，日志里却只看见最终成功。于是有人得出结论「模型就是不稳定」，然后把 temperature 调到 0 就以为解决了。

真正的问题不在模型，在**第一次调用里有一堆没被声明的默认行为**：裸 fetch 没有超时、没有重试、错误就是一个 HTTP 状态码；SDK 则自带超时、自带重试、自带错误类型与响应解析。两边「都能跑」，但跑出来的行为完全不同。这一课要把这些默认值逐项摊开、显式写死，让第一次调用成为一个**可复现、可断言**的基线。

### 六项默认行为对照

| 维度 | 裸 fetch | 官方 SDK | 不显式写死会怎样 |
|---|---|---|---|
| 请求构造 | 自己拼 URL / headers / body | 一行方法调用 | 拼错字段只得到含糊的 400 |
| 超时 | **默认没有** | 有默认值（各版本不同） | 请求挂住，占住连接 |
| 重试 | 没有 | 默认重试若干次 | 自己再加重试 → 重试放大 |
| 错误结构 | \`res.status\` + 原始文本 | 结构化异常类型 | 无法按类型判断「该不该重试」 |
| 响应解析 | 自己取 \`choices[0]\` | 已解析的对象 | 字段缺失时拿到 undefined |
| 流式 / 类型 | 自己处理 SSE / 自己写类型 | 内建 | 后续 L106 对照时无从比较 |

第四行是 L05 事件日志能落地的前提：只有把错误分成「瞬态 / 永久 / 内容问题」三类，\`tool.result\` 的 \`ok\` 与 \`error.retryable\` 才有意义。而最后一列也解释了为什么 L03 要锁 SDK 版本——**这些默认值会随版本变化**。

:::deep
### 三类不确定性要分开处理

「结果不一样」其实混着三件完全不同的事：

1. **模型随机性**：\`temperature\`、采样参数、模型版本（L122）。处理方式是固定 \`temperature: 0\` + 固定模型别名，并接受「结构可断言、措辞不可断言」。
2. **网络与配额**：超时、连接重置、429 / 503。处理方式是显式超时 + 按错误类型分类重试，且重试次数整轮共享（L124）。
3. **SDK 隐式行为**：默认重试、默认超时、默认解析。处理方式是**把每一项都显式写出来**，哪怕写成和默认值一样的数字。

把它们混成一句「模型不稳定」，会导出错误的动作：有人去调提示词，有人去换更贵的模型，而真正该做的是给 fetch 加一个 \`AbortController\`。后面 L94 做对照实验要锁五个变量，其中「模型」与「超时重试」两把锁，第一次调用时就得先拧上。
:::

### 裸 fetch：每一项都自己写清楚

\`\`\`ts title="src/llm-fetch.ts" note="要点：显式超时、显式温度、显式错误分类、显式响应校验；没有任何隐藏默认值。"
export type CallResult = { text: string; usage?: { total_tokens: number } }
export class LlmError extends Error {
  constructor(public kind: 'timeout' | 'rate-limit' | 'server' | 'permanent' | 'shape',
              public status: number, msg: string) { super(msg) }
}

export async function callByFetch(cfg: Config, prompt: string): Promise<CallResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), 8_000)   // 显式超时
  try {
    const res = await fetch(cfg.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,                                        // 显式固定采样
      }),
      signal: ctrl.signal,
    })
    if (res.status === 429) throw new LlmError('rate-limit', 429, 'quota')
    if (res.status >= 500) throw new LlmError('server', res.status, 'upstream')
    if (!res.ok) throw new LlmError('permanent', res.status, await res.text())
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new LlmError('shape', 200, 'missing choices[0]')
    return { text, usage: data.usage }
  } catch (e) {
    if (e instanceof LlmError) throw e
    if (ctrl.signal.aborted) throw new LlmError('timeout', 0, 'aborted by deadline')
    throw new LlmError('permanent', 0, String(e))             // 网络错误单独兜底
  } finally {
    clearTimeout(timer)
  }
}
\`\`\`

注意 \`shape\` 这一类：HTTP 200、JSON 合法、但 \`choices[0]\` 不存在，是换供应商或模型改版时最常见的「静默失败」。不显式校验，它会以 \`undefined\` 的形式一路流到 L05 的事件里，排查时完全看不出是哪一步丢的。

### SDK 版本：把默认值逐项覆盖

\`\`\`ts title="src/llm-sdk.ts" note="要点：显式 timeout / maxRetries；按错误类型分类；两个版本返回同一个 CallResult 结构。"
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: cfg.apiKey,
  baseURL: cfg.baseUrl,
  timeout: 8_000,        // 覆盖默认超时，与裸 fetch 对齐
  maxRetries: 0,         // 关掉 SDK 自带重试，统一由 L124 的整轮预算管
})

export async function callBySdk(cfg: Config, prompt: string): Promise<CallResult> {
  try {
    const res = await client.chat.completions.create({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    })
    const text = res.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new LlmError('shape', 200, 'missing choices[0]')
    return { text, usage: { total_tokens: res.usage?.total_tokens ?? 0 } }
  } catch (e) {
    const status = Number((e as { status?: number }).status ?? 0)
    if (status === 429) throw new LlmError('rate-limit', 429, 'quota')
    if (status >= 500) throw new LlmError('server', status, 'upstream')
    if ((e as Error).name === 'APIConnectionTimeoutError') throw new LlmError('timeout', 0, 'sdk timeout')
    throw new LlmError('permanent', status, String(e))
  }
}
\`\`\`

\`maxRetries: 0\` 是这段代码最反直觉的一行。不是「不要重试」，而是**让重试只在一个地方发生**：SDK 默认重试两次，若业务层再包一层三次，一次 429 最多会打出九次请求——这正是 L124 讲的重试放大。把 SDK 的重试关掉，重试策略由整轮预算统一管理，行为才可预测。

### 可重试分类与回归断言

\`\`\`ts title="tests/llm-call.test.ts" note="要点：用假 fetch 驱动；断言结构一致、429 可重试、超时不重试、形状错误可检出。"
const RETRYABLE = new Set(['rate-limit', 'server', 'timeout'])
function isRetryable(e: LlmError): boolean { return RETRYABLE.has(e.kind) }

async function callWithBudget(fn: () => Promise<CallResult>, retries = 2): Promise<CallResult> {
  for (let i = 0; ; i++) {
    try { return await fn() } catch (e) {
      if (!(e instanceof LlmError) || !isRetryable(e) || i >= retries) throw e
      await new Promise((r) => setTimeout(r, 100 * Math.pow(2, i)))
    }
  }
}

test('temperature=0 时结构可断言，措辞不做硬断言', async () => {
  const a = await callByFetch(fakeConfig, '用一句话介绍自己')
  const b = await callByFetch(fakeConfig, '用一句话介绍自己')
  assert.equal(typeof a.text, 'string')
  assert.ok(typeof b.text === 'string' && b.text.length > 0)
  // 不断言 a.text === b.text：模型输出不写硬字符串断言（L31 的分层）
})

test('429 可重试，400 永久失败不再试', async () => {
  fakeFetch.queue(429, 200)
  const out = await callWithBudget(() => callByFetch(fakeConfig, 'hi'))
  assert.equal(typeof out.text, 'string')
  assert.equal(fakeFetch.calls(), 2)
  fakeFetch.queue(400)
  await assert.rejects(callWithBudget(() => callByFetch(fakeConfig, 'hi')), /permanent/)
  assert.equal(fakeFetch.calls(), 3)   // 400 只打了一次
})

test('响应缺 choices[0] 时必须报 shape，而不是返回 undefined', async () => {
  fakeFetch.queue(200, { choices: [] })
  await assert.rejects(callByFetch(fakeConfig, 'hi'), /missing choices/)
})
\`\`\`

三条断言把「第一次调用」变成可以进 CI 的基线：结构可复现、错误可分类、形状错误不会静默流过。它们和 L04 的 \`FakeLlm\` 一样不连真模型——真实模型只做人工抽检，不写硬字符串断言（L31 已定过这个分层）。

:::warn
### 两个必踩的坑

- **把 temperature 留默认，然后抱怨不可复现**。即使设为 0，也只保证「结构可断言」，不保证逐字相同；想靠断言固定一句话，方向从一开始就错了。
- **SDK 默认重试 + 自己再包一层重试**。两边都不知道对方在重试，一次抖动被放大成近十次请求，还会把 L92 的 \`L = λ × W\` 推到队列上限。关掉一边的默认值，策略只留一处。
:::

### 第一次调用就要记下的三个数

「调通」之后最容易漏的一步是把用量记下来。三个数必须在第一版就有：\`usage.total_tokens\`、从发请求到拿到完整响应的耗时、以及错误类型。原因很实际——L88 算三档路由的盈亏平衡点、L125 按峰值估容量、L127 配成本告警，输入全都来自这三个数。等功能写完再补，历史调用就只剩一串没有分母的成功率。

把它们直接写进 L05 的 \`llm.call\` 事件里，字段一次对齐，后面换 SDK、换供应商都不用重设计：

\`\`\`ts title="用量归一化与事件落点" note="要点：不同供应商 usage 字段命名可能不同；缺失记 0 并告警，不要静默当没花钱。"
function normalizeUsage(raw: unknown): { prompt: number; completion: number; total: number } {
  const u = (raw ?? {}) as Record<string, number>
  return {
    prompt: Number(u.prompt_tokens ?? u.input_tokens ?? 0),
    completion: Number(u.completion_tokens ?? u.output_tokens ?? 0),
    total: Number(u.total_tokens ?? 0),
  }
}

function emitCall(sink: EventSink, ctx: RunContext, startedAt: number,
                  usage: ReturnType<typeof normalizeUsage>, error?: LlmError) {
  sink.emit({ type: 'llm.call', at: Date.now(), ctx,
    alias: ctx.profileAlias, promptVersion: ctx.promptVersion,
    inputChars: 0, latencyMs: Date.now() - startedAt })
  metrics.record('llm.tokens', usage.total, { alias: ctx.profileAlias, ok: !error })
  if (usage.total === 0 && !error) metrics.increment('llm.usage_missing')  // 兼容接口缺字段
}
\`\`\`

\`normalizeUsage\` 里两套命名不是多余的：OpenAI 兼容接口在不同供应商处的 \`usage\` 字段并不完全一致，有的只给 \`input_tokens\` / \`output_tokens\`。L122 会把它作为能力契约的一部分，但第一次调用就该意识到——**「兼容」保证的是请求能收发，不保证每个可选字段都在**。

### 从这一课往后怎么演进

L88 会把 \`client\` 换成按请求选模型的路由器，L106 会把 \`text\` 换成 schema 校验过的结构化对象，L120 会把 \`res.json()\` 换成 SSE 增量流。三处都会变，但有四样不变：显式超时、显式温度、错误分类、响应形状校验。它们是**基线而不是阶段产物**——任何一版实现少了其中一项，L94 的对照实验就锁不住变量。

反过来说，这一课刻意不做流式、不做结构化输出、不做工具调用，正是为了让这四样能被单独看见。等后面往上面叠能力时，如果哪天发现「换了个 SDK 结果超时行为变了」，回来看这段裸 fetch，就能立刻指出是哪一层把默认值偷偷改了。

### 验收清单

| 检查项 | 怎么验 | 失败说明什么 |
|---|---|---|
| 超时显式 | 假 fetch 永不返回，8s 内抛 \`timeout\` | 请求会无限挂住 |
| 温度显式 | 请求体里 \`temperature: 0\` | 结果波动被误判成模型问题 |
| 错误可分类 | 429 / 5xx / 400 / shape 四类断言 | 无法决定该不该重试 |
| 重试只有一处 | \`maxRetries: 0\` + 业务层 \`callWithBudget\` | 重试放大 |
| 两版本同结构 | 都返回 \`CallResult\` | L94 对照实验无法替换 |

最后一行是这一课的长期价值：\`callByFetch\` 与 \`callBySdk\` 对外结构一致，L94 才能把「用不用 SDK」当成一个可切换变量去量差异，而不是两套互不兼容的代码。

### 与相邻课的分工

- **L04 / L05**：\`HttpLlmClient\` 与事件日志，本课把其中「一次调用」这段补成显式、可断言的实现。
- **L92 / L124**：有界并发、整轮预算与熔断，本课的 \`maxRetries: 0\` 是为它们让出唯一的控制点。
- **L94**：对照实验五锁，本课的 \`temperature\` / \`timeout\` / \`retries\` 是其中两把锁的具体形态。
- **L106 / L122**：AI SDK 的结构化输出与供应商能力契约，本课只给最原始的一端作对照。

**一句话收束**：第一次调用的难点不是「发出去」，是**把超时、温度、重试、错误、响应形状这些默认行为逐项写死**，让它成为后面所有对照实验的基线。
`,
    null,
    [
      {
        text: 'SDK 版本里为什么要显式写 maxRetries: 0？',
        options: ['为了更快', '避免 SDK 默认重试与业务层重试叠加造成放大', '省 token', 'SDK 不支持重试'],
        answer: 1,
        explain: '重试策略只留一处，行为才可预测。',
        concept: 'llm-call',
      },
      {
        text: '「结果不一样」混着哪三类不确定性？',
        options: [
          '网络、磁盘、内存',
          '模型随机性 / 网络与配额 / SDK 隐式行为',
          '提示词、模型、框架',
          '温度、token、延迟',
        ],
        answer: 1,
        explain: '三者处理动作完全不同，混成一句「模型不稳定」会导出错误动作。',
        concept: 'llm-call',
      },
      {
        text: 'HTTP 200 但响应里没有 choices[0]，正确处理是？',
        options: ['返回 undefined 让上层兜底', '显式抛 shape 错误', '重试三次', '当成成功'],
        answer: 1,
        explain: '静默失败会一路流进事件日志，排查时看不出哪一步丢了。',
        concept: 'llm-call',
      },
    ],
    [
      ['默认行为', 'SDK 未显式配置就替你决定的超时、重试、错误与解析方式'],
      ['错误分类', '瞬态（timeout / 429 / 5xx）与永久（400 / shape）分开，决定要不要重试'],
      ['CallResult', '裸 fetch 与 SDK 共用的返回结构，是对照实验可切换的前提'],
    ],
    [
      '把 temperature 留默认却要求逐字可复现，方向从一开始就错了。',
      'SDK 默认重试 + 业务层再包一层，一次抖动被放大成近十次请求。',
    ],
  ),
  'practice',
)
