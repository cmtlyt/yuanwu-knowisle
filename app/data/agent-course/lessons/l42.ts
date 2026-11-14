import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 5 ========== */

export const L42 = withKind(
  L(
    'L42',
    5,
    '实战：不依赖框架实现 Function Calling 运行时',
    4,
    ['L39', 'L41'],
    ['fc-runtime'],
    [
      '写出可直接运行的 FC 运行时（schema 生成 → 解码 → 并行执行 → 回填）',
      '用一份 zod schema 同时承担「给模型看」与「校验入参」两个职责',
      '把未知工具 / 参数非法 / 工具抛错三类失败统一转成 tool 消息回填',
      '用假 client 对运行时做确定性验证，不依赖真实模型',
    ],
    `
### 需求：运行时必须守住的四条不变量

框架替你封装的 FC（Function Calling）能力，本质上只是一段几十行的循环。但要写得能用，必须先说清它承诺什么——这四条不变量是后面所有代码的验收标准：

1. **单一事实来源**：工具的参数定义只能有一份。给模型看的 JSON Schema 与运行时的入参校验必须从同一份定义派生，否则两者漂移时会出现「模型按 A 传参、校验按 B 拒绝」的诡异 bug。
2. **失败即消息**：未知工具、参数非法、工具内部抛错，都不允许冒泡成进程异常，必须转成 \`role: 'tool'\` 消息回填给模型，让它有机会自我修正。
3. **不丢信息**：模型可能在同一轮里既返回文本又返回 tool_calls，两者都要原样进上下文。
4. **有界终止**：必须有步数上限，否则工具之间可以互相触发形成死循环。

第 4 条最容易被忽略。开发期「模型总是很快就收敛」会让人误以为不需要上限，而线上的死循环一旦发生，就是按分钟计费的账单事故。

### 接口：运行时只依赖三个最小契约

先定接口再写实现，好处是运行时不绑定任何 SDK。下面三个类型就是全部依赖面：工具定义、对话客户端、消息。把 \`ChatClient\` 做成接口，意味着测试时可以用假 client 替换真实模型，运行时的每条分支都能被确定性验证。

\`\`\`ts title="① 三个最小契约" note="ToolDef.schema 是唯一事实来源：既派生出给模型看的 JSON Schema，又用来校验模型返回的入参。"
import type { ZodType } from 'zod'

export interface ToolDef<A = any, R = unknown> {
  name: string
  description: string
  schema: ZodType<A>          // 唯一事实来源
  run: (args: A) => Promise<R>
}

export interface ChatClient {
  chat(req: { messages: Msg[]; tools: ToolSchema[] }): Promise<{ message: AssistantMsg }>
}

export type Msg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
\`\`\`

### 步骤一：从 zod 派生 tool schema

不变量 1 的落地就是这一行——\`z.toJSONSchema(t.schema)\`。手写两份定义（一份 JSON Schema 给模型、一份校验函数）在工具数量一多必然漂移，而漂移的表现往往不是报错，而是「模型永远传不对某个可选字段」，排查成本极高。

\`\`\`ts title="② schema 生成：反射而非手抄" note="zod v4 内置 toJSONSchema；zod v3 需 zod-to-json-schema 之类的适配层。"
import { z } from 'zod'

export function toToolSchemas(tools: ToolDef[]): ToolSchema[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: z.toJSONSchema(t.schema),
    },
  }))
}
\`\`\`

### 步骤二：主循环——唯一的装配点

循环只做四件事，且顺序不可调换：**装配请求 → 追加 assistant 消息 → 执行 tool_calls → 追加 tool 消息**。这里有个容易被「优化」掉的细节：assistant 消息必须原样 \`push\` 进上下文，包括它的 \`content\` 字段。很多实现在有 tool_calls 时只保存 tool_calls、丢掉同时返回的文本，导致模型下一轮「忘了自己刚说过什么」，表现为反复解释同一件事。

\`\`\`ts title="③ 主循环：有界、可失败、不吞消息" note="终止条件只有两个：模型不再要工具，或撞上 maxSteps。后者抛错而不是静默返回，避免把死循环伪装成正常结果。"
export async function runWithTools(
  client: ChatClient,
  tools: ToolDef[],
  prompt: string,
  opt: { maxSteps?: number; system?: string } = {},
) {
  const maxSteps = opt.maxSteps ?? 10
  const byName = new Map(tools.map((t) => [t.name, t]))
  const messages: Msg[] = [
    { role: 'system', content: opt.system ?? DEFAULT_SYSTEM },
    { role: 'user', content: prompt },
  ]

  for (let step = 0; step < maxSteps; step++) {
    const { message } = await client.chat({ messages, tools: toToolSchemas(tools) })
    messages.push(message) // 原样保留：content 与 tool_calls 都不丢

    const calls = message.tool_calls ?? []
    if (calls.length === 0) return { text: message.content ?? '', steps: step + 1 }

    const results = await Promise.all(calls.map((c) => execOne(c, byName)))
    messages.push(...results)
  }
  throw new Error('E_MAX_STEPS: 超出最大步数 ' + maxSteps + '，疑似工具死循环')
}
\`\`\`

### 步骤三：单次调用——三类失败都变成消息

\`execOne\` 是整个运行时最有价值的部分。它把三种失败**全部降级成消息**：未知工具名、参数不合法、工具执行抛错。这样模型拿到的不是异常栈，而是一段可读的失败原因，下一轮就能自己纠正参数或换工具。反过来，如果在这里 \`throw\`，一次模型幻觉就能让整个请求 500。

\`\`\`ts title="④ 三类失败统一降级" note="JSON.parse 也要包进 try：模型确实会产出被截断的 arguments 字符串。"
async function execOne(call: ToolCall, byName: Map<string, ToolDef>): Promise<Msg> {
  const tool = byName.get(call.function.name)
  if (!tool) return reply(call.id, { error: 'UNKNOWN_TOOL', got: call.function.name })

  let raw: unknown
  try {
    raw = JSON.parse(call.function.arguments || '{}')
  } catch {
    return reply(call.id, { error: 'BAD_ARGS', reason: 'arguments 不是合法 JSON' })
  }

  const parsed = tool.schema.safeParse(raw)
  if (!parsed.success) {
    return reply(call.id, { error: 'BAD_ARGS', issues: parsed.error.issues })
  }

  try {
    return reply(call.id, await tool.run(parsed.data))
  } catch (e) {
    return reply(call.id, { error: 'TOOL_FAILED', message: (e as Error).message })
  }
}

const reply = (id: string, data: unknown): Msg => ({
  role: 'tool',
  tool_call_id: id,
  content: JSON.stringify(data),
})
\`\`\`

### 步骤四：用假 client 做确定性验证

不接真实模型也能验证运行时——\`ChatClient\` 是接口，写一个按预设剧本返回的假 client 就够了。下面三条路径分别覆盖「正常闭环」「参数非法被回填」「死循环被上限拦住」。这类测试跑在 CI 里只需要毫秒，而且永不 flaky。

\`\`\`ts title="⑤ 三条路径的验证脚本" note="跑法：node --experimental-strip-types verify.ts。断言失败即抛错，可直接进 CI。"
import assert from 'node:assert/strict'
import { z } from 'zod'

const add: ToolDef = {
  name: 'add',
  description: '两数相加',
  schema: z.object({ a: z.number(), b: z.number() }),
  run: async ({ a, b }) => ({ sum: a + b }),
}

const scripted = (msgs: AssistantMsg[]) => ({ chat: async () => ({ message: msgs.shift()! }) })
const callAdd = (args: string): AssistantMsg => ({
  role: 'assistant',
  tool_calls: [{ id: 'c1', function: { name: 'add', arguments: args } }],
})

// 1) 正常闭环：调一次工具 → 回填 → 给最终答复
const ok = await runWithTools(scripted([callAdd('{"a":1,"b":2}'), { role: 'assistant', content: '3' }]), [add], '1+2?')
assert.equal(ok.text, '3')
assert.equal(ok.steps, 2)

// 2) 参数非法：不抛异常，而是把 BAD_ARGS 回填给模型
const bad = await runWithTools(scripted([callAdd('{"a":"x","b":2}'), { role: 'assistant', content: '参数错了' }]), [add], 'q')
assert.equal(bad.text, '参数错了')

// 3) 死循环：模型一直要调工具 → 撞上限抛 E_MAX_STEPS
await assert.rejects(
  () => runWithTools(scripted(Array.from({ length: 20 }, () => callAdd('{"a":1,"b":2}'))), [add], 'q', { maxSteps: 3 }),
  /E_MAX_STEPS/,
)
\`\`\`

### 边界：这套实现不解决什么

- **跨轮依赖**：\`Promise.all\` 假设同一轮内的调用互不依赖。若 B 需要 A 的结果，模型应该在下一轮再发起 B，运行时不该替它猜依赖顺序。
- **非幂等副作用**：并行的写操作（下单、转账）必须由工具自身做幂等键，运行时无法保证。
- **超大结果**：工具返回整个表会被塞进上下文，几轮就撑爆窗口。应在工具内做截断 + 分页。
- **流式**：真实产品要边生成边展示，需要在 \`chat\` 层做流式解析，循环结构不变。

:::warn

### 三个线上真踩过的坑

**坑一：把 tool 消息的 \`tool_call_id\` 写错**。现象是模型报「找不到对应调用」或行为混乱。根因是并行执行后结果顺序与调用顺序不一致，或复制粘贴时没改 id。修复：始终从 \`call.id\` 构造，绝不自己编号。

**坑二：只保留 tool_calls、丢掉 content**。现象是模型反复重复已说过的解释。根因是不变量 3 被违反。修复：assistant 消息原样 push，不做「清洗」。

**坑三：把工具异常直接 throw 到外层**。现象是偶发 500，重试也没用。根因是不变量 2 被违反。修复：\`execOne\` 内 catch 全部失败，只返回消息。

:::

:::deep

### 与框架的对应关系

OpenAI Agents SDK 的 \`tool()\`、Vercel AI SDK 的 \`tool()\`、LangChain 的 \`DynamicStructuredTool\` 都在这套结构上做加法：自动生成 schema（对应步骤一）、自动并行（步骤二）、内置错误包装（步骤三）、再加 tracing 与重试。手写过一遍之后，框架报错信息里那些字段名（\`tool_call_id\`、\`safeParse\`、\`maxSteps\`）就不再是黑盒。

:::
`,
    null,
    [
      {
        text: '运行时里「参数校验」与「给模型看的 tool schema」应来自？',
        options: [
          '两份独立维护的定义',
          '同一份 zod schema 派生（单一事实来源）',
          '只校验不生成',
          '只生成不校验',
        ],
        answer: 1,
        explain: '两份定义必然漂移，漂移后表现为「模型永远传不对某个字段」。',
        concept: 'fc-runtime',
      },
      {
        text: '某工具调用返回了非法参数，运行时的正确行为是？',
        options: [
          '抛出异常中断请求',
          '把 BAD_ARGS 与具体 issues 作为 tool 消息回填，让模型下一轮修正',
          '静默返回空结果',
          '自动重试同一参数三次',
        ],
        answer: 1,
        explain: '失败即消息：模型需要看到失败原因才能自我修正。',
        concept: 'fc-runtime',
      },
      {
        text: '同一轮返回 5 个互不依赖的 tool_calls，最合适的执行方式是？',
        options: ['严格串行', 'Promise.all 并行', '只执行第一个', '按字母序执行'],
        answer: 1,
        explain: '无依赖并行，总延迟从「和」降为「最大值」。',
        concept: 'fc-runtime',
      },
      {
        text: '下面这段实现有一个致命缺陷，问题在哪？\\n\\nif (msg.tool_calls?.length) { messages.push({ role: "assistant", tool_calls: msg.tool_calls }) }',
        options: [
          '不该在 assistant 消息里带 tool_calls',
          '重建了一个只含 tool_calls 的对象，丢掉了同轮返回的 content',
          'messages.push 应该用 unshift',
          'tool_calls 必须先转成字符串',
        ],
        answer: 1,
        explain: '应原样 push 模型返回的 message；丢掉 content 会让模型下一轮「忘了自己说过什么」。',
        concept: 'fc-runtime',
      },
      {
        text: '要支持「下单」这类非幂等副作用工具，运行时层的合理设计是？',
        options: [
          '靠运行时保证只执行一次',
          '由工具自身携带幂等键，运行时只负责传参与回填',
          '禁用并行即可',
          '把重试次数设为 0',
        ],
        answer: 1,
        explain: '运行时无法感知业务语义，幂等必须由工具（领域层）保证。',
        concept: 'fc-runtime',
      },
    ],
    [
      ['toToolSchemas', '把工具定义反射成模型可理解的 tool 列表'],
      ['tool_call_id', '把 tool 结果与某次调用配对的唯一键'],
      ['safeParse', '不抛异常的校验入口，失败返回 issues'],
      ['E_MAX_STEPS', '步数上限触发的终止信号，用于拦截工具死循环'],
      ['幂等键', '让重复执行同一副作用只生效一次的业务标识'],
    ],
    [
      '手写两份参数定义（一份给模型、一份校验），随后静默漂移。',
      '在 execOne 里直接 throw，一次模型幻觉导致整个请求 500。',
      '有 tool_calls 时重建 assistant 消息，丢掉同轮 content。',
      '不设 maxSteps，工具互触发形成死循环，账单按分钟增长。',
    ],
  ),
  'practice',
)
