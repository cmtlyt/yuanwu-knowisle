import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 12 ========== */

export const L76 = withKind(
  L(
    'L76',
    12,
    '实战：把链路追踪与回放接入 L68 的多 Agent 系统',
    44,
    ['L75', 'L68'],
    ['trace-integration'],
    [
      '把 L75 的 span 中间件接入 L68 的 MessageBus，实现跨角色的 trace 串联',
      '解决「消息因果」与「span 因果」不一致的问题，并用 resumes 恢复父上下文',
      '实现多 Agent 的录制与回放，含群聊顺序的固定',
    ],
    `
### 四个角色，四条 trace

把 L75 的中间件接进 L68 的多 Agent 系统后，追踪里出现了一个奇怪的现象：一次用户请求产生了四条互不相干的 trace，每条只有三四个 span，且每条都是完整的「模型 → 工具 → 模型」。

原因不是中间件有 bug，而是**每个角色的执行都从一条新消息开始**，而新消息进入 \`role.handle\` 时，当前上下文里没有父 span——AsyncLocalStorage 只在同一个异步树里传播，消息投递把树切断了。于是每个角色各自 \`withSpan\` 时都拿不到父节点，各自开了一棵新树。

这个现象正是 L73 说的「上下文不会自动穿过边界」在多 Agent 上的具体形态。修法不是换更好的追踪库，而是**让消息携带 span 上下文，并在消费端显式恢复**。

### 消息因果 ≠ span 因果

两者容易混淆，混了会导致树长得不对：

| 维度 | 消息 parentId | span parentSpanId |
| --- | --- | --- |
| 含义 | 这条消息在回复哪条消息 | 这段执行在谁的执行里发生 |
| 由谁决定 | 发送方（reply 时指定） | 当前上下文（创建 span 时取） |
| 典型数量 | 一条消息一个父 | 一次执行可能创建多个 span，共用一个父 |

一个具体例子：supervisor 收到一条 inform 后，连续调用两次工具再回复。这两次工具调用是**兄弟**（同一个 supervisor 执行 span 的子节点），而它们对外的消息 parentId 都指向那条 inform。如果强行让「消息父」等于「span 父」，两次工具调用就会被串成链，树形失真。

所以消息里要单独存一份 span 上下文：

\`\`\`ts title="消息携带 span 链接"
export interface SpanLink {
  traceId: string
  spanId: string
}

export interface TracedMessage {
  id: string
  traceId: string
  parentId?: string // 消息因果：回复谁
  span: SpanLink // 执行因果：在哪个 span 里产生
  from: string
  to: string
  type: 'request' | 'inform' | 'handoff' | 'done' | 'error'
  payload: unknown
  depth: number
}
\`\`\`

\`span\` 字段是 L67 schema 的一个增量。它符合当时定的演进原则——**只加可选字段**（对不追踪的实现在逻辑上可忽略），所以老角色不用改。

### 让 Tracer 支持恢复

L75 的 Tracer 只会「从当前上下文取父」，现在还需要「从一个已知 span 恢复上下文」。两个方法：

\`\`\`ts title="Tracer 的三个补充方法"
export class Tracer {
  // …（L75 的 startSpan / withSpan 不变）

  /** 取当前 span，供 bus.reply 自动填充 */
  current(): Span | undefined {
    return als.getStore()
  }

  /** 恢复：把 fn 放进指定 span 的上下文里执行（跨消息边界用） */
  resume<T>(span: Span | undefined, fn: () => Promise<T>): Promise<T> {
    if (!span) return fn()
    return als.run(span, fn)
  }
}
\`\`\`

\`resume\` 是这一课的关键增量。它不是「新建 span」，而是「把执行挂回已有的树」——语义上更接近 OpenTelemetry 的 \`context.with(ctx, fn)\`。

### 接入 MessageBus

\`\`\`ts title="TracedBus：投递时挂 span"
import type { Span, SpanData, Tracer } from './tracer'
import type { Sink } from './tracer'

export interface Role {
  name: string
  handles: TracedMessage['type'][]
  handle(m: TracedMessage, bus: TracedBus): Promise<TracedMessage[]>
}

export class TracedBus {
  private roles = new Map<string, Role>()
  private queue: TracedMessage[] = []
  private spans = new Map<string, Span>() // spanId → 活跃 Span，用于恢复
  history: TracedMessage[] = []
  private seq = 0

  constructor(
    private tracer: Tracer,
    private exportSpan: Sink,
  ) {}

  register(role: Role): this {
    this.roles.set(role.name, role)
    return this
  }

  reply(parent: TracedMessage, patch: Pick<TracedMessage, 'from' | 'to' | 'type'> & { payload: unknown }): TracedMessage {
    const cur = this.tracer.current()
    return {
      id: 'm' + ++this.seq,
      traceId: parent.traceId,
      parentId: parent.id,
      span: { traceId: cur?.data.traceId ?? parent.traceId, spanId: cur?.data.spanId ?? parent.span.spanId },
      depth: parent.depth + 1,
      ...patch,
    }
  }

  async run(
    seed: Omit<TracedMessage, 'span'>,
    opts: { maxRounds?: number; maxMessages?: number } = {},
  ): Promise<{ ok: boolean; reason: string; rounds: number; messages: TracedMessage[] }> {
    const maxRounds = opts.maxRounds ?? 8
    const maxMessages = opts.maxMessages ?? 40
    let rounds = 0

    return this.tracer.withSpan('request', async (root) => {
      this.spans.set(root.data.spanId, root)
      this.queue.push({ ...seed, span: { traceId: root.data.traceId, spanId: root.data.spanId } })

      while (this.queue.length > 0 && rounds < maxRounds) {
        const batch = this.queue.splice(0)
        rounds++
        for (const m of batch) {
          this.history.push(m)
          if (this.history.length > maxMessages) {
            return { ok: false, reason: 'message-budget', rounds, messages: this.history }
          }
          const parent = this.spans.get(m.span.spanId) ?? root
          const targets = m.to === '*' ? [...this.roles.keys()] : [m.to]

          for (const t of targets) {
            const role = this.roles.get(t)
            if (!role?.handles.includes(m.type)) continue

            // 关键：先把执行恢复到「产生这条消息的 span」下，再开本角色的 span
            const out = await this.tracer.resume(parent, () =>
              this.tracer.withSpan('agent:' + role.name, async (s) => {
                s.setAttr('depth', m.depth)
                s.setAttr('msg.type', m.type)
                this.spans.set(s.data.spanId, s)
                const list = await role.handle(m, this)
                for (const o of list) {
                  s.addEvent('emit', { to: o.to, type: o.type })
                  if (o.type === 'done' && o.from === 'supervisor') s.setAttr('terminal', true)
                }
                return list
              }),
            )

            for (const o of out) {
              if (o.type === 'done' && o.from === 'supervisor') {
                this.history.push(o)
                return { ok: true, reason: 'supervisor-done', rounds, messages: this.history }
              }
              this.queue.push(o)
            }
          }
        }
      }
      return { ok: false, reason: 'max-rounds', rounds, messages: this.history }
    })
  }
}
\`\`\`

三处细节决定树能不能连上：

1. **\`this.spans\` 索引**。消息只带 \`spanId\` 字符串，恢复时必须能拿回 \`Span\` 对象。索引在 span 创建时写入——所以任何忘记注册的 span 都会造成「找不到父，退回根」的静默降级。
2. **\`resume(parent, () => withSpan(...))\` 的嵌套顺序**。必须是先 resume 再 withSpan：反过来，\`withSpan\` 创建时会从（未恢复的）当前上下文取父，拿到的还是根。
3. **\`reply\` 里从 \`current()\` 取 span**。这一步让角色完全不用关心追踪——它照常调 \`bus.reply\`，span 链接被自动填上。

第 2 条是这一课最容易写错的地方。写成 \`withSpan(name, () => resume(parent, fn))\` 时，代码能跑、span 也会生成，但所有 \`agent:*\` 都挂在 \`request\` 下——**树变成一层扇形的假象**，看起来还挺整齐，实际丢失了角色间的调用关系。

### 群聊场景：树会变宽

supervisor 模式下每个角色的 span 深度相近，树是扁的。群聊模式下，\`manager.pickNext\` 每轮挑一个角色，如果 manager 自己也开了 span，树会长成「request → manager → agent → agent → …」，深度随轮数增长。

这里需要一个取舍：**manager 的决策要不要单独成 span**。建议要，但要标一个独立的名字（\`orchestrator:pick\`），因为它是群聊模式下最贵的调用之一——每轮一次模型调用，且它的输出决定了整个系统的走向。没有这个 span，「为什么这轮选了它」就无从查起。

### 录制与回放

多 Agent 的回放比单 Agent 多两个麻烦：**哪个角色在什么顺序被调用**，以及**消息投递顺序**。这两者在群聊模式下都不确定。

\`\`\`ts title="录制 tape 与回放"
export interface RecordedCall {
  kind: 'model' | 'tool'
  name: string
  inputDigest: string
  output: unknown
  meta: { agent: string; round: number; order: number }
}

export class Tape {
  calls: RecordedCall[] = []
  private idx = new Map<string, RecordedCall[]>()

  push(c: RecordedCall): void {
    this.calls.push(c)
    const k = c.kind + ':' + c.name + ':' + c.inputDigest
    if (!this.idx.has(k)) this.idx.set(k, [])
    this.idx.get(k)!.push(c)
  }

  /** 按 key + agent 命中；同一 agent 同 key 多次调用按出现顺序取 */
  take(kind: RecordedCall['kind'], name: string, inputDigest: string, agent: string): RecordedCall {
    const k = kind + ':' + name + ':' + inputDigest
    const list = this.idx.get(k) ?? []
    const hit = list.find((c) => c.meta.agent === agent && !(c as any)._used)
    if (!hit) throw new Error('replay miss: ' + k + ' @' + agent)
    ;(hit as any)._used = true
    return hit
  }
}

export function replayModel(tape: Tape, agent: string, name: string): ModelClient {
  return {
    async call(req) {
      const d = digestOf(req)
      const hit = tape.take('model', name, d, agent) // 未命中直接抛错，绝不降级
      return hit.output as ModelRes
    },
  }
}
\`\`\`

命中键里带 \`agent\` 是必须的：同一个 prompt 可能被两个角色各调一次（比如群聊里两个角色都问「这句话是否合规」），只按 \`name + digest\` 命中会把第二次错配成第一次的输出，回放结果看起来正常但角色行为错位。

同理，\`_used\` 标记保证同一份录制里的多次相同调用按顺序消费，而不是永远返回第一条。

:::deep

### 回放群聊：顺序也要录

群聊模式的不确定性不只来自模型采样，还来自**发言顺序**：\`manager.pickNext\` 的输出决定了下一轮谁说话，而它是模型调用——也就是说顺序本身是采样的结果。

这意味着回放必须把「顺序」也固定下来。两种做法：

**做法一：把 manager 的调用一起录。** manager 是模型调用，它的输入（当前 transcript）与输出（下一个 speaker）都可以录。回放时它自然返回同样的 speaker。这是最干净的做法，不需要额外机制。

**做法二：录一份发言序列，回放时跳过 manager。** 它更快（省掉一半模型调用），但会让「manager 的决策」在回放中不可验证——你无法回答「如果 manager 当时选了别人会怎样」。

推荐做法一，因为 L74 讲的「回放要能验证改动」在这里体现得最明显：如果你改了 manager 的 prompt，只有把 manager 也纳入回放，才能看出选择是否变了。

:::

:::warn

### 三个接入后才会暴露的问题

**第一，\`spans\` 索引只增不减。** 一个长驻服务处理十万次请求后，索引里堆了上百万个 Span 对象，内存不释放。修法是在 span \`end()\` 后延迟一段时间再删（比如 5 分钟），或用 LRU。删太早会导致「迟到的子 span 找不到父」。

**第二，跨进程时 \`resume\` 失效。** 如果某个角色跑在单独的 worker 或容器里，消息带上 \`spanId\` 也无法恢复 \`Span\` 对象——本进程没有那个对象。此时必须降级为「用 \`SpanData\` 重建一个只读 span」，并接受它不能 \`end()\`（它是父，早已结束）。这也正是需要 W3C \`traceparent\` 标准头的原因：标准方案传的是可重建的上下文，而不是对象引用。

**第三，\`done\` 事件的位置。** 在 \`agent:supervisor\` 的 span 里加 \`terminal\` 属性是对的，但不要把它当成「请求成功」的判断依据——它只说明「supervisor 认为完成了」，实际结果对不对要看回放或评测。追踪记录事实，不判断对错。

:::

### 与 LangSmith 的自动串联对照

| 能力 | 本课实现 | LangSmith |
| --- | --- | --- |
| 跨角色串联 | 消息带 \`spanId\`，消费端 \`resume\` | SDK 自动（拦截模型与工具调用） |
| 树形粒度 | 自定（request / agent / model / tool） | 内置 RunTree（chain / llm / tool / retriever） |
| 群聊顺序 | 把 manager 调用一起录 | 自动记录每次调用顺序 |
| 回放 | 自建 Tape + 命中键 | 平台侧数据集 + 重放 |
| 成本 | 自控（可只记 digest） | 全量上报（默认） |

自动串联省掉了「消息要带 span 上下文」这件事——因为它拦截的是模型与工具调用本身，不依赖你的消息协议。代价是你对「记什么」失去控制，且必须依赖平台。

判断标准还是那条：**追踪的断点在哪**。断在消息投递（本课场景），就自己带上下文；断在模型调用（单一进程的 Agent），自动拦截就够了。

### Stage 12 收束

五课构成一条链：L72 决定看什么，L73 把因果表达成树，L74 把失败现场冻结下来，L75 把抽象写成 150 行代码，L76 让它穿过角色边界。

一条贯穿的判断：**可观测性不是加日志，是让每个问题都有唯一指定的回答层**。问「系统正常吗」看指标，问「哪个环节」看树，问「为什么」看日志，问「改完还犯不犯」看回放。四层各司其职，缺一层就会有另一层被迫承担它不擅长的问题。
`,
    null,
    [
      {
        text: '接入追踪后出现「四个角色四条 trace」，根因是？',
        options: [
          'spanId 生成重复',
          '消息投递切断异步树，角色开 span 时上下文为空，各自成为根',
          '导出器丢失了 parentSpanId',
          'traceId 太长',
        ],
        answer: 1,
        explain: 'AsyncLocalStorage 只在同一异步树内传播，跨消息必须显式恢复。',
        concept: 'trace-integration',
      },
      {
        text: '正确的嵌套顺序是？',
        options: [
          '`withSpan(name, () => resume(parent, fn))`',
          '`resume(parent, () => withSpan(name, fn))`',
          '两者等价',
          '都不需要嵌套',
        ],
        answer: 1,
        explain: '先 resume 再 withSpan，否则创建 span 时取到的父仍是根。',
        concept: 'trace-integration',
      },
      {
        text: '回放命中键里为什么要带 agent 名？',
        options: [
          '方便排序',
          '同一 prompt 可能被多个角色各调一次，只按 name+digest 会错配输出',
          '减少存储',
          '用于采样',
        ],
        answer: 1,
        explain: '错配后回放看起来正常，但角色行为已错位。',
        concept: 'trace-integration',
      },
      {
        text: '回放群聊时为什么要把 manager 的调用也录下来？',
        options: [
          '节省 token',
          '发言顺序本身是 manager 采样的结果，不录就无法验证 manager 的改动',
          'manager 调用更慢',
          '为了对齐时间戳',
        ],
        answer: 1,
        explain: '做法二跳过 manager 会让它的决策在回放中不可验证。',
        concept: 'trace-integration',
      },
    ],
    [
      ['SpanLink', '消息携带的执行上下文（traceId + spanId），用于跨角色恢复父节点'],
      ['resume', '把执行放回指定 span 的上下文，等价于 OTel 的 context.with'],
      ['消息因果 / span 因果', '回复谁 / 在谁的执行里发生，两者通常一致但不必相同'],
      ['Tape', '录制下来的调用序列，回放时按 name + digest + agent 命中'],
    ],
    [
      '每个角色各自开 span，一次请求变成多条互不相干的 trace。',
      'written as withSpan(() => resume(...))，所有 agent span 都挂在根下，树形失真。',
      'spans 索引只增不减，长驻服务内存持续增长。',
      '回放命中键不带 agent，多个角色调用同一 prompt 时输出错配。',
    ],
  ),
  'practice',
)
