import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L36 = withKind(
  L(
    'L36',
    4,
    '实战：从零实现一个最小可运行运行时（循环 + 终止 + 错误恢复）',
    4,
    ['L31', 'L34'],
    ['runtime-impl'],
    [
      '融合 L31 解剖，写出完整可运行的最小运行时',
      '实现循环、终止、错误恢复三件套',
      '对照官方 SDK 搭建等价循环',
    ],
    `
### 把解剖变成完整代码

L31 只画了骨架，本课把它写成完整可运行的最小运行时：循环 + 状态 + 终止 + 错误恢复，四个部件齐活。

\`\`\` title="最小运行时（完整实现）" note="返回值统一为 \\\`{ ok, reason?, result? }\\\`，调用方据此决定重试/降级/报错——这就是「回归」。"
interface RuntimeOpts { maxSteps?: number; timeoutMs?: number }

async function runAgent(
  client: LlmClient,
  tools: Record<string, Tool>,
  prompt: string,
  opts: RuntimeOpts = {},
) {
  const maxSteps = opts.maxSteps ?? 10
  const deadline = Date.now() + (opts.timeoutMs ?? 30000)
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ]
  let steps = 0

  while (steps < maxSteps) {                        // ① 步数终止
    if (Date.now() > deadline)                       // ② 超时终止
      return { ok: false, reason: "timeout", steps }

    const raw = await client.chat(messages)
    messages.push({ role: "assistant", content: raw })
    const parsed = parseReAct(raw)                   // 解析 Thought/Action

    if (parsed.action === "finish")                  // ③ 显式终止
      return { ok: true, result: parsed.args.answer, steps }

    const tool = tools[parsed.action]
    if (!tool)
      return { ok: false, reason: "unknown-tool:" + parsed.action, steps }

    try {
      const obs = await tool.run(parsed.args)        // ④ 错误恢复：工具失败
      messages.push({ role: "tool", content: obs })
    } catch (e) {
      messages.push({ role: "tool", content: "工具执行失败：" + (e as Error).message })
    }
    steps++
  }
  return { ok: false, reason: "max-steps", steps }
}
\`\`\`

:::deep

### 错误恢复的哲学：把错误喂回模型

工具失败时，本课选择「把错误信息作为 Observation 喂回模型」，让模型自己调整（换个工具、改参数）。这比直接抛异常更符合 Agent 精神——但前提是错误信息要结构化、可理解。

:::

:::tip

### 框架对照：官方 SDK 的等价循环

OpenAI Agents SDK 的 \\\`run()\\\` 内部就是这样一个循环：它替你处理了 step 上限、超时、工具错误回填、finish 检测。你手写的 \\\`runAgent\\\` 与它的差异只在「实现细节」，结构完全对应。

:::

### 这个运行时现在缺什么（后面补）

- 流式输出（L37）。
- 真正的 Function Calling（L42）。
- 记忆持久化（L49 / L53）。
- 链路追踪（L75）。

`,
    null,
    [
      {
        text: '最小运行时的返回值 `{ ok, reason?, result? }` 的作用是？',
        options: ['让日志好看', '统一「回归」：调用方据此决定重试/降级/报错', '加快速度', '省内存'],
        answer: 1,
        explain: '统一返回值是「回归」的落点。',
        concept: 'runtime-impl',
      },
      {
        text: '工具执行失败时，本课采用的错误恢复策略是？',
        options: ['直接抛异常', '把错误信息作为 Observation 喂回模型，让模型调整', '无限重试', '忽略错误'],
        answer: 1,
        explain: '把结构化错误喂回模型，让模型自己调整。',
        concept: 'runtime-impl',
      },
      {
        text: '手写 `runAgent` 与官方 SDK `run()` 的关系是？',
        options: ['完全不同', '结构对应，SDK 替你处理步数/超时/回填/finish', 'SDK 是另一个协议', '不能互通'],
        answer: 1,
        explain: '结构完全对应，只是 SDK 封装了细节。',
        concept: 'runtime-impl',
      },
    ],
    [
      ['最小运行时', '含循环/状态/终止/错误恢复的可运行骨架'],
      ['回归值', '统一的 { ok, reason?, result? } 返回结构'],
      ['错误回填', '把工具错误作为 Observation 喂回模型'],
    ],
    [
      '工具失败直接 throw，模型失去自我纠错的机会。',
      '返回值不统一，调用方无法区分「正常结束」「超时」「未知工具」。',
    ],
  ),
  'practice',
)
