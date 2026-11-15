import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L05 = withKind(
  L(
    'L05',
    0,
    '可观测与评估的「预埋」',
    2,
    ['L04'],
    ['observability-priming'],
    [
      '接入结构化事件日志与运行上下文，把四个版本号在第一版就记下来',
      '写出循环插桩与评测采样钩子，让冒烟断言能校验事件完整性',
      '跑通「无 PII、事件成对、字段齐全」三类验收断言',
    ],
    `
### 功能写完了才想起接监控，历史已经补不回来

第一版 Agent 跑顺之后，团队准备「下一步接可观测」。真到动手才发现，日志里只有 \`console.log('calling llm')\` 这类文本，想回答几个再普通不过的问题全都答不上：这轮用的是哪个模型别名、哪一版提示词、工具调用了几次、有没有重试、是不是走了降级。于是有人提议「把历史会话重跑一遍补上字段」，可一部分会话已经超过留存期被清掉，另一部分依赖的外部数据早就变了，重跑出来的也不是当时的结果。

更麻烦的是评测：L81 要搭 Eval harness，需要按「失败的那一步」把轨迹切出来做归因，而当时的日志压根没记步骤边界。**日志是当时那一刻的唯一记录，事后补写只能得到一份虚构的历史**。这一课因此放在所有功能之前：趁工程还只有四个文件，把观测与评测需要的字段**预埋**进去。

### 事件表：谁消费，决定了必须记什么

| 事件 | 必录字段 | 后续谁消费 | 缺了会怎样 |
|---|---|---|---|
| \`turn.start\` | traceId、tenantId、sessionId、四个版本号 | L73 链路、L126 RunManifest | 无法复现「当时跑的是哪套配置」 |
| \`llm.call\` | model alias、promptVersion、输入长度、耗时、首 token 时延 | L88 路由、L77 评测、L120 预算 | 成本与延迟差异无法归因 |
| \`tool.call\` / \`tool.result\` | 工具名、参数摘要、耗时、结果状态、重试序号 | L78 轨迹评测、L124 熔断 | 说不清「23 次调用花在哪」 |
| \`loop.end\` | 轮次数、退出原因、降级标记、总 token | L80 回归基线、L81 harness | 通过率相同但代价不同，看不出来 |
| \`error\` | 错误类型、是否可重试、预算剩余 | L124 降级、L127 告警 | 重试放大只能靠猜 |

第一行的「四个版本号」是这张表的地基：模型能力契约、提示词版本、工具清单版本、状态 schema 版本。它们就是 L126 的 \`RunManifest\` 在最小工程里的雏形——**不记版本，后面所有「这次和上次有什么不同」的问题都没有答案**。

:::deep
### 预埋几乎免费，补埋要重跑历史

在 \`runLoop\` 只有二十行的时候加埋点，改动是几个 \`emit()\` 调用；等工程长到两千行、有六个框架适配层、三类工具之后再加，就要逐层找入口、补上下文传递、处理异步边界，最后还得面对「历史数据补不回来」这个无解问题。成本差不是几倍，是两个数量级。

还有一层区别常被忽略：**结构化事件和文本日志不是一回事**。"日志"给人读，格式随意、可以改；"事件"给程序消费，字段固定、有 schema、能进 harness。L81 的 Eval harness 要按 traceId 聚合、按事件类型切片、按版本号分组，这些动作对 \`console.log('calling llm')\` 完全做不了。所以第一版就要定事件结构，哪怕实现只是一个往数组里 push 的内存 sink。

这也解释了为什么 L118 的引用绑定要在检索阶段就让 \`[S#]\` 随文本流动——**归属信息必须在产生的那一刻绑定，不能指望事后从结果里反推**。观测字段同理。
:::

### 事件结构与上下文

\`\`\`ts title="src/events.ts：结构化事件与运行上下文" note="要点：四版本号随 RunContext 一路传递；事件有固定类型与必填字段；默认脱敏。"
export type RunContext = {
  traceId: string
  tenantId: string
  sessionId: string
  promptVersion: string
  profileAlias: string
  toolManifestVersion: string
  stateSchemaVersion: number
}

type Base = { at: number; ctx: RunContext }

export type AgentEvent =
  | (Base & { type: 'turn.start'; questionLen: number })
  | (Base & { type: 'llm.call'; alias: string; promptVersion: string; inputChars: number; latencyMs: number })
  | (Base & { type: 'tool.call'; tool: string; argsDigest: string; attempt: number })
  | (Base & { type: 'tool.result'; tool: string; ok: boolean; latencyMs: number })
  | (Base & { type: 'loop.end'; turns: number; exit: 'answer' | 'max-turns' | 'error'; degraded: boolean; tokens: number })
  | (Base & { type: 'error'; kind: string; retryable: boolean; budgetLeftMs: number })

export interface EventSink { emit(e: AgentEvent): void | Promise<void> }

// 参数只记摘要，不记原文：避免把用户手机号/身份证写进日志（L87）
function digest(args: unknown): string {
  const text = JSON.stringify(args ?? {})
  const masked = text
    .replace(/1[3-9]\\d{9}/g, '[PHONE]')
    .replace(/\\d{17}[\\dXx]/g, '[ID]')
  return 'sha256:' + stableHash(masked).slice(0, 12)
}

export class MemorySink implements EventSink {
  events: AgentEvent[] = []
  emit(e: AgentEvent) {
    if (!e.ctx.traceId) throw new Error('事件缺 traceId')
    this.events.push(e)
  }
  byTrace(id: string) { return this.events.filter((e) => e.ctx.traceId === id) }
}
\`\`\`

\`digest\` 里的两行脱敏不是可选项。Agent 日志最容易泄的正是工具参数——用户把手机号念给模型，模型原样填进 \`args\`，一行 \`console.log\` 就把它落到了磁盘上。**记录「有没有这个参数」和「参数长什么样」是两件事**，评测只需要前者。

### 循环插桩：只加几行

\`\`\`ts title="src/loop.ts（在 L04 骨架上预埋）" note="要点：sink 作为依赖注入；start/end 必成对；错误分支也要记录；ctx 一路透传。"
export type LoopDeps = {
  llm: LlmClient; tools: ToolRegistry; maxTurns: number; sink: EventSink; ctx: RunContext
}

export async function runLoop(deps: LoopDeps, question: string): Promise<string> {
  const { sink, ctx } = deps
  const at = () => Date.now()
  sink.emit({ type: 'turn.start', at: at(), ctx, questionLen: question.length })

  const messages: Message[] = [{ role: 'user', content: question }]
  let tokens = 0
  try {
    for (let turn = 0; turn < deps.maxTurns; turn++) {
      const t0 = at()
      const reply = await deps.llm.chat(messages)
      sink.emit({ type: 'llm.call', at: at(), ctx, alias: ctx.profileAlias,
        promptVersion: ctx.promptVersion, inputChars: JSON.stringify(messages).length,
        latencyMs: at() - t0 })
      tokens += Math.ceil(JSON.stringify(reply).length / 4)

      if (reply.toolCalls.length === 0) {
        sink.emit({ type: 'loop.end', at: at(), ctx, turns: turn + 1,
          exit: 'answer', degraded: false, tokens })
        return reply.text
      }
      for (const call of reply.toolCalls) {
        sink.emit({ type: 'tool.call', at: at(), ctx, tool: call.name,
          argsDigest: digest(JSON.parse(call.args)), attempt: 1 })
        const t1 = at()
        try {
          const result = await deps.tools.dispatch(call)
          sink.emit({ type: 'tool.result', at: at(), ctx, tool: call.name,
            ok: true, latencyMs: at() - t1 })
          messages.push({ role: 'tool', content: result })
        } catch (e) {
          sink.emit({ type: 'tool.result', at: at(), ctx, tool: call.name,
            ok: false, latencyMs: at() - t1 })
          throw e
        }
      }
    }
    sink.emit({ type: 'loop.end', at: at(), ctx, turns: deps.maxTurns,
      exit: 'max-turns', degraded: false, tokens })
    throw new Error('max turns exceeded')
  } catch (e) {
    sink.emit({ type: 'error', at: at(), ctx, kind: String(e),
      retryable: /timeout|429|503/i.test(String(e)), budgetLeftMs: 0 })
    sink.emit({ type: 'loop.end', at: at(), ctx, turns: deps.maxTurns,
      exit: 'error', degraded: true, tokens })
    throw e
  }
}
\`\`\`

注意 \`catch\` 里补了一条 \`loop.end\`：如果只记 \`error\` 而不记结束事件，按「start/end 成对」做完整性校验的评测脚本会把所有失败轨迹当成残缺数据丢掉，而失败恰恰是最该被评测的那批。**失败路径也要有完整轨迹**，这是预埋最常被漏掉的一处。

### 评测钩子与冒烟断言

\`\`\`ts title="tests/events.test.ts：把预埋变成可执行验收" note="要点：按 traceId 聚合；断言事件成对、字段齐全、无 PII；采样落盘供 L81 复用。"
import { test } from 'node:test'
import assert from 'node:assert/strict'

function goldenFrom(sink: MemorySink, traceId: string) {
  const events = sink.byTrace(traceId)
  return {
    traceId,
    versions: {
      prompt: events[0].ctx.promptVersion,
      profile: events[0].ctx.profileAlias,
      tools: events[0].ctx.toolManifestVersion,
      schema: events[0].ctx.stateSchemaVersion,
    },
    toolCalls: events.filter((e) => e.type === 'tool.call').length,
    exit: events.find((e) => e.type === 'loop.end')?.exit,
    events: events.map((e) => ({ type: e.type, at: e.at })),
  }
}

test('一次成功运行必须 start/end 成对且四版本号齐全', async () => {
  const sink = new MemorySink()
  const ctx: RunContext = {
    traceId: 't-smoke-1', tenantId: 't1', sessionId: 's1',
    promptVersion: 'p1', profileAlias: 'agent-main',
    toolManifestVersion: 'tm1', stateSchemaVersion: 1,
  }
  const llm = new FakeLlm([{ text: '完成', toolCalls: [] }])
  await runLoop({ llm, tools: makeTools(), maxTurns: 3, sink, ctx }, '你好')

  const golden = goldenFrom(sink, 't-smoke-1')
  assert.equal(golden.exit, 'answer')
  assert.equal(golden.events[0].type, 'turn.start')
  assert.equal(golden.events.at(-1)?.type, 'loop.end')
  assert.ok(Object.values(golden.versions).every(Boolean))
})

test('工具参数不得把手机号写进事件', () => {
  const d = digest({ phone: '13812345678' })
  assert.ok(!d.includes('13812345678'), 'digest 里出现原始手机号')
})

test('失败轨迹也必须有一条 loop.end', async () => {
  const sink = new MemorySink()
  const ctx: RunContext = { traceId: 't-fail', tenantId: 't1', sessionId: 's1',
    promptVersion: 'p1', profileAlias: 'agent-main', toolManifestVersion: 'tm1', stateSchemaVersion: 1 }
  const llm = new FakeLlm([{ text: '', toolCalls: [{ name: 'missing', args: '{}' }] }])
  await assert.rejects(runLoop({ llm, tools: makeTools(), maxTurns: 3, sink, ctx }, 'x'))
  assert.equal(sink.byTrace('t-fail').filter((e) => e.type === 'loop.end').length, 1)
})
\`\`\`

\`goldenFrom\` 产出的结构就是 L81 Eval harness 的最小输入：有版本号、有工具调用数、有退出原因、有事件序列。第一版就把这个函数写好，后面接真评测集时只需换数据源，不必重新设计字段——**预埋的真正收益在这里**。

:::warn
### 两个必踩的坑

- **把完整提示词与用户原文直接写进日志**。它同时踩中隐私（L87）与成本（长上下文日志很快把存储吃满）两个坑。记长度、摘要、哈希，不记原文；确需排查时按 traceId 去受控存储里单独取。
- **只有文本日志，没有结构化事件**。人能读懂的文本，程序聚合不了；等 L81 要做分组、切片、回归时，只能靠正则从日志里捞，脆弱且无法验收。事件要有固定类型与必填字段，且**写入时就用断言保证**。
:::

### 事件体积、采样与 sink 的替换路径

一轮对话大约产生五到八条事件，长会话跑上两百轮就是上千条。预埋阶段就要想清楚**哪些全量记、哪些抽样记**，否则第一版虽然干净，三个月后存储先被日志吃满。一个够用的分层是：\`turn.start\` / \`loop.end\` / \`error\` / \`tool.result\` 全量记（它们是评测与告警的骨架）；\`llm.call\` 与 \`tool.call\` 这类高频明细按 1–5% 采样；**失败轨迹一律 100% 保留**，因为最该被归因的就是它们。采样率要写进 \`RunContext\` 或配置，并在事件里带标记，避免事后把「采样后的数量」误当成真实调用次数。

还有一条硬约束：**事件写入不能进关键路径**。\`EventSink.emit\` 失败时只记一条内部告警，绝不能让 \`emit\` 抛错打断 \`runLoop\`——观测系统的故障不该变成业务故障。上面 \`MemorySink.emit\` 里那条 \`throw\` 只是教学用的自检，换成文件 sink 或远端 collector 时要改成 try/catch + 本地缓冲 + 异步批量上报。

\`\`\`ts title="从 MemorySink 到生产 sink 的替换" note="要点：emit 失败不冒泡；批量异步上报；采样率进配置；runLoop 一行不改。"
export class BufferedSink implements EventSink {
  private buf: AgentEvent[] = []
  constructor(private flushTo: (e: AgentEvent[]) => Promise<void>, private sampleRate = 0.05) {}

  emit(e: AgentEvent) {
    const keep = e.type === 'error' || e.type === 'loop.end' || e.type === 'turn.start'
      || Math.random() < this.sampleRate
    if (!keep) return
    this.buf.push(e)
    if (this.buf.length >= 50) void this.flush()
  }

  private async flush() {
    const batch = this.buf.splice(0, this.buf.length)
    try { await this.flushTo(batch) } catch (err) {
      // 观测故障不冒泡到 Agent；这里只留一条内部计数，由 L127 的告警单独发现
      metrics.increment('event_sink_failed', batch.length)
    }
  }
}
\`\`\`

\`runLoop\` 的 \`sink: EventSink\` 参数在这里兑现了价值：换实现只需在 \`main.ts\` 里换一行构造，循环代码一个字不动。等 L75 讲 span 中间件、L73 讲链路追踪时，把 \`BufferedSink\` 再换成基于 \`AsyncLocalStorage\` 的 tracer 也是同一处替换——**预埋阶段定的是接口与字段，不是某个具体库**。

### 验收清单

| 检查项 | 怎么验 | 失败说明什么 |
|---|---|---|
| 四版本号随上下文透传 | \`goldenFrom\` 四个字段非空 | 事后无法复现配置 |
| start/end 成对（含失败路径） | 冒烟第三条断言 | 评测会丢掉最该看的轨迹 |
| 事件字段齐全 | schema 校验 / 类型检查 | harness 无法消费 |
| 无 PII | 手机号 digest 断言 | 隐私风险（L87） |
| \`MemorySink\` 可替换 | 换成文件 sink 不改 \`runLoop\` | 埋点与实现耦合了 |

最后一行和 L04 的 \`LlmClient\` 接口是同一个设计原则：**依赖注入进来，才能在不改业务逻辑的前提下换实现**。

### 与相邻课的分工

- **L04**：提供四段骨架，本课只在其 \`loop.ts\` 上插桩，不改变循环逻辑。
- **L72 / L73 / L75**：仪表盘、链路追踪与 span 中间件；本课给的是它们要消费的**字段**，不画 UI、不实现 tracer。
- **L77 / L78 / L81**：评测维度、轨迹评测与 Eval harness；本课的 \`goldenFrom\` 是它们的最小输入结构。
- **L87**：多租户与脱敏，本课的 \`digest\` 是它的第一道落地。
- **L126 / L127**：RunManifest 与告警规则，本课的四版本号与 \`degraded\` 字段是它们的源头。

**一句话收束**：可观测不是功能做完后补的一层皮，**字段必须在第一版就埋好**——日志是当时唯一的记录，事后只能虚构历史。
`,
    null,
    [
      {
        text: '功能写完才接监控，为什么说「重跑历史补字段」行不通？',
        options: [
          '太慢',
          '部分会话已过留存期、外部数据已变，重跑出来的不是当时的结果',
          '没有模型了',
          '日志太大',
        ],
        answer: 1,
        explain: '日志是当时那一刻的唯一记录，事后补写等于虚构历史。',
        concept: 'observability-priming',
      },
      {
        text: '事件表里「四个版本号」指的是？',
        options: ['四个依赖包版本', '模型契约 / 提示词 / 工具清单 / 状态 schema', '四次发布', '四种日志级别'],
        answer: 1,
        explain: '不记版本，就无法回答「这次和上次有什么不同」。',
        concept: 'observability-priming',
      },
      {
        text: '工具参数为什么应该记摘要而不是原文？',
        options: [
          '省磁盘而已',
          '避免把用户手机号等 PII 写进日志，评测只需要「有没有这个参数」',
          '原文不好解析',
          '模型不允许',
        ],
        answer: 1,
        explain: '记录参数存在性与记录参数内容是两件事。',
        concept: 'observability-priming',
      },
    ],
    [
      ['预埋', '在第一版代码里就记录后续观测与评测需要的字段'],
      ['结构化事件', '有固定类型与必填字段、能被 harness 聚合的事件，区别于文本日志'],
      ['RunContext', '随请求透传的 traceId 与四个版本号，RunManifest 的雏形'],
    ],
    [
      '把完整提示词与用户原文写进日志，同时踩中隐私与存储成本。',
      '只有 console.log 文本日志，L81 harness 无法按 traceId 聚合与切片。',
    ],
  ),
  'practice',
)
