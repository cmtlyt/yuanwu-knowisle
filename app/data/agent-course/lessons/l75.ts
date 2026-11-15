import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 12 ========== */

export const L75 = withKind(
  L(
    'L75',
    12,
    '实战：从零用 TS 实现 span 追踪中间件（OpenTelemetry 原生手写）',
    43,
    ['L73'],
    ['span-middleware'],
    [
      '用 TypeScript 实现 Tracer / Span / Context 三个抽象，含嵌套、错误标记与属性收集',
      '用 AsyncLocalStorage 实现上下文自动传播，并用中间件包住模型与工具调用',
      '对照 OpenTelemetry SDK 与 LangSmith 的等价埋点，说清手写版的能力边界',
    ],
    `
### 接了 SDK，span 全是平的

一个团队给 Agent 接上了 OpenTelemetry SDK，接完发现追踪里所有 span 都是同一层的兄弟，看不出谁调了谁。

原因很常见：他们用了 \`tracer.startSpan('tool:search')\` 手动创建 span，但没有把父 span 的 context 传进去。OTel 的 \`startSpan\` 默认从**当前上下文**取父节点，而他们的调用是 \`await\` 链，SDK 不知道谁是谁的父。

修法是加 \`context.with(...)\` 包一层，或者让它自动传播。但这件事暴露了一个更根本的问题：**追踪的难点不是采集，是上下文在异步链里怎么活下去**。

这一课手写一遍，把这件事彻底看清楚。手写版不到 150 行，但它能覆盖绝大多数 Agent 场景，并且随时能加自定义属性。

### 三个抽象

| 抽象 | 职责 | 在 Agent 里的实例 |
| --- | --- | --- |
| Span | 记录一段操作的起止、属性、状态 | 一次模型调用、一次工具调用、一轮 step |
| Tracer | 创建 span 并决定父节点 | 全局单例，中间件通过它开 span |
| Context | 让子调用找到当前 span | AsyncLocalStorage 里的一个值 |

OpenTelemetry 也是这三个，只是名字与扩展点更多（\`TracerProvider\` / \`SpanProcessor\` / \`Exporter\`）。手写版把 provider 与 processor 合并成一个 sink，够用且好懂。

### Span：数据 + 生命周期

\`\`\`ts title="Span 与 sink"
export type SpanStatus = 'ok' | 'error'

export interface SpanData {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  startMs: number
  endMs?: number
  status: SpanStatus
  attrs: Record<string, string | number | boolean>
  events: Array<{ at: number; name: string; attrs?: Record<string, string | number> }>
}

export type Sink = (d: SpanData) => void

let seq = 0
const rand = () => Math.random().toString(36).slice(2, 10)
const newSpanId = () => 's' + ++seq + '-' + rand()

export class Span {
  constructor(
    private d: SpanData,
    private emit: Sink,
  ) {}

  get data(): SpanData {
    return this.d
  }

  setAttr(key: string, value: string | number | boolean): this {
    this.d.attrs[key] = value
    return this
  }

  addEvent(name: string, attrs?: Record<string, string | number>): this {
    this.d.events.push({ at: Date.now(), name, attrs })
    return this
  }

  setStatus(status: SpanStatus): this {
    this.d.status = status
    return this
  }

  /** 幂等：重复 end 只生效一次，避免中间件与 finally 重复调用时双写 */
  end(): void {
    if (this.d.endMs !== undefined) return
    this.d.endMs = Date.now()
    this.emit(this.d)
  }
}
\`\`\`

\`end()\` 的幂等性不是洁癖。中间件里 \`finally\` 会调用一次 \`end()\`，而某些错误路径里业务代码也可能主动 \`end()\`。没有幂等保护，同一条 span 会被写两次，导出后树里出现两个同名同 id 的节点——排查时会以为「这个工具被调了两次」。

### Context：让父节点自己找上来

\`\`\`ts title="Tracer + AsyncLocalStorage"
import { AsyncLocalStorage } from 'node:async_hooks'

const als = new AsyncLocalStorage<Span | undefined>()

export class Tracer {
  constructor(private emit: Sink) {}

  /** 创建 span：父节点从当前上下文取，取不到就是根 */
  startSpan(name: string, attrs: Record<string, string | number> = {}): Span {
    const parent = als.getStore()
    const d: SpanData = {
      traceId: parent?.data.traceId ?? 't-' + rand(),
      spanId: newSpanId(),
      parentSpanId: parent?.data.spanId,
      name,
      startMs: Date.now(),
      status: 'ok',
      attrs: { ...attrs },
      events: [],
    }
    return new Span(d, this.emit)
  }

  /** 在 span 作用域内执行：期间任何 startSpan 都会认它做父 */
  async withSpan<T>(name: string, fn: (s: Span) => Promise<T>, attrs?: Record<string, string | number>): Promise<T> {
    const span = this.startSpan(name, attrs)
    try {
      return await als.run(span, () => fn(span))
    } catch (e) {
      span.setStatus('error')
      span.setAttr('error.type', (e as Error)?.name ?? 'unknown')
      span.addEvent('exception', { message: String((e as Error)?.message ?? e).slice(0, 200) })
      throw e
    } finally {
      span.end() // 成功与失败都必须收尾，否则 span 永远没有 endMs
    }
  }
}
\`\`\`

\`als.run(span, () => fn(span))\` 是整个实现的核心。它在回调执行期间把 \`span\` 设为「当前上下文」，于是回调内部任何 \`startSpan\` 都会拿到它作为父节点——**不需要手动传参**。这也是为什么 L73 说的「异步边界要显式搬运」在这里被自动解决了：AsyncLocalStorage 会沿着 await 链传播。

它解决不了的是跨进程与跨消息的边界（L76 处理），因为那已经出了本进程的异步树。

### 中间件：包住模型与工具

\`\`\`ts title="wrapModel / wrapTool"
export interface ModelReq {
  messages: Array<{ role: string; content: string }>
  model: string
  temperature?: number
}
export interface ModelRes {
  text: string
  usage?: { in: number; out: number }
}
export interface ModelClient {
  call(req: ModelReq): Promise<ModelRes>
}

export function wrapModel(tracer: Tracer, client: ModelClient, step = 0): ModelClient {
  return {
    async call(req) {
      return tracer.withSpan(
        'model:' + req.model,
        async (s) => {
          s.setAttr('step', step)
          s.setAttr('model', req.model)
          if (req.temperature !== undefined) s.setAttr('temperature', req.temperature)
          s.setAttr('tokens.in.est', req.messages.reduce((n, m) => n + m.content.length, 0))
          const res = await client.call(req)
          if (res.usage) {
            s.setAttr('tokens.in', res.usage.in)
            s.setAttr('tokens.out', res.usage.out)
          }
          return res
        },
        { step },
      )
    },
  }
}

export interface ToolCall {
  name: string
  args: Record<string, unknown>
}
export interface ToolSet {
  call(c: ToolCall): Promise<unknown>
}

/** 入参摘要：dtrace 里只放可聚合的短值，不放全文（L73 的双层记录） */
const digest = (v: unknown): string => {
  const s = JSON.stringify(v ?? null)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16) + ':' + s.length
}

export function wrapTools(tracer: Tracer, tools: ToolSet, step = 0): ToolSet {
  return {
    async call(c) {
      return tracer.withSpan(
        'tool:' + c.name,
        async (s) => {
          s.setAttr('step', step)
          s.setAttr('tool', c.name)
          s.setAttr('tool.args.digest', digest(c.args))
          s.setAttr('retry.count', 0)
          return await tools.call(c)
        },
        { step },
      )
    },
  }
}
\`\`\`

两个中间件都只做一件事：**开 span、加属性、交给真实实现**。它们不改变调用语义，所以可以叠在任意实现上——这也是「中间件」与「框架」的区别：前者可拆卸，后者要求你重写代码。

\`digest\` 里同时保留哈希与长度，是因为单靠哈希无法判断「两次调用是不是同一类问题」——长度能区分「空参数」与「超长参数」，而这两个的处置完全不同。

### 导出：异步批量

\`\`\`ts title="批量导出 + 保留策略"
export class BatchExporter {
  private buf: SpanData[] = []
  private timer: NodeJS.Timeout | null = null
  readonly kept: SpanData[] = [] // 演示用，生产写到后端
  private keep = new Set<string>()

  constructor(
    private opts: { maxBatch?: number; flushMs?: number; sampleRate?: number } = {},
  ) {}

  sink: Sink = (d) => {
    // 优先采样（L72）：异常 span 立刻把整条 trace 加入保留集
    if (d.status === 'error' || (d.endMs ?? 0) - d.startMs > 20_000) this.keep.add(d.traceId)
    this.buf.push(d)
    if (this.buf.length >= (this.opts.maxBatch ?? 50)) this.flush()
    else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.opts.flushMs ?? 1000)
      this.timer.unref?.()
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const batch = this.buf.splice(0)
    for (const d of batch) {
      const keep = this.keep.has(d.traceId) || Math.random() < (this.opts.sampleRate ?? 0.05)
      if (keep) this.kept.push(d)
    }
  }
}
\`\`\`

导出必须是异步的（L72 讲过同步导出会把模型调用拖慢 15%）。这里的做法是「入队 + 定时/满批刷出」，\`timer.unref()\` 让定时器不阻止进程退出。

### 跑通一次

\`\`\`ts title="三步任务，观察 span 树"
const exporter = new BatchExporter({ sampleRate: 0 })
const tracer = new Tracer(exporter.sink)

const model: ModelClient = {
  async call(req) {
    return { text: 'need search', usage: { in: 120, out: 18 } }
  },
}
const tools: ToolSet = {
  async call(c) {
    if (c.name === 'search') return [{ id: 'doc:a', text: '协议 A 说明' }]
    return { ok: true }
  },
}

await tracer.withSpan('request', async () => {
  const m = wrapModel(tracer, model, 1)
  const t = wrapTools(tracer, tools, 1)
  await m.call({ messages: [{ role: 'user', content: '协议 A 什么时候发布' }], model: 'gpt-x', temperature: 0 })
  await t.call({ name: 'search', args: { q: '协议 A' } })
  await t.call({ name: 'fetch', args: { id: 'doc:a' } })
})

exporter.flush()
console.log(exporter.kept.map((d) => (d.parentSpanId ? '  └ ' : '') + d.name + ' ' + ((d.endMs ?? 0) - d.startMs) + 'ms').join('\\n'))
// request 3ms
//   └ model:gpt-x 0ms
//   └ tool:search 0ms
//   └ tool:fetch 0ms
\`\`\`

输出里的缩进是手工加的（只有一层），但它验证了三件事：三个子 span 都挂在 \`request\` 下、\`traceId\` 相同、每个 span 都有 \`endMs\`。

如果某个 span 缺 \`endMs\`，说明它的 \`end()\` 没被调用——通常是被 \`await\` 漏掉的 Promise，或者抛错后没有走 \`finally\`。

:::deep

### 为什么是中间件，而不是在运行时里埋点

最直接的写法是在 Agent 循环里加埋点：调模型前后各记一行，调工具前后各记一行。它比中间件短，但有三个代价。

**第一，埋点会分散。** 一个运行时里模型调用可能出现三处（主循环、重试、降级兜底），工具调用可能出现五处（并行、串行、重试、补查、批处理）。漏一处，树上就少一支，而且你看不出来少了——因为树是「按实际发生的调用」建的，缺的那支根本不存在。

**第二，测试无法复用。** 中间件是包装器，测试里可以直接用「记录型 sink」替换导出器，把 span 收集在内存里做断言。埋点散在业务代码里时，要测「是否记录了 step 属性」只能起一个真实请求再解析导出结果。

**第三，关闭追踪需要改代码。** 中间件模式下，不想要追踪就不包这层；埋点模式下要删很多行。前者是可拆卸的，后者是侵入的。

这也是 L36 讲的「运行时约束」在这里的体现：可观测性应当是一层可装卸的外壳，而不是散落在内核里的语句。

:::

### 属性设计：可聚合优先于可阅读

同一个事实可以记成两种属性，用途完全不同：

| 写法 | 可聚合 | 可阅读 | 建议 |
| --- | --- | --- | --- |
| \`message: 'tool=search status=ok ms=120'\` | 否 | 是 | 不推荐 |
| \`tool='search'; status='ok'; ms=120\` | 是 | 是 | 推荐 |
| \`args: {…完整对象…}\` | 否 | 是 | 只放摘要 |
| \`argsDigest: 'a3f1:42'\` | 是 | 弱 | 配合回捞使用 |

判断标准很简单：**这个属性会被用于 group by 或求分位数吗**。会，就必须是标量且低基数（工具名、错误类型、状态）；不会，可以放摘要字符串。

「低基数」这一条常被违反。把 \`userId\` 记成 span 属性看起来合理（排查某个用户的问题），但它会让后端做聚合时几乎每个值都是唯一的，成本飙升。正确做法是把它记在日志而非指标属性里，或者只在出现错误时才写入。

### 让追踪可关闭：一个开关的成本

生产环境里追踪本身也会成为问题源（导出队列积压、sink 抛错）。所以从第一天就该有一个开关：

\`\`\`ts title="可关闭的 tracer"
export function makeTracer(enabled: boolean, emit: Sink): Tracer {
  if (enabled) return new Tracer(emit)
  // 关闭时返回一个「空 tracer」：形状一样，但不创建 span、不导出
  const noop = new Tracer(() => {})
  noop.withSpan = async (_name, fn) => fn(new Span(
    { traceId: '', spanId: '', name: '', startMs: 0, status: 'ok', attrs: {}, events: [] },
    () => {},
  ))
  return noop
}
\`\`\`

关键点是**保持接口不变**：调用方不需要知道追踪是否开启，也不需要写 \`if (tracing)\` 分支。这类「空实现」模式比在每处埋点判断开关可靠得多——后者一定会漏，而漏掉的那处会在关闭追踪时抛 \`undefined\`。

一个反面做法是让 sink 内部静默丢弃。它看起来更简单，但空 tracer 仍然会创建对象、收集属性、走 finally，在大流量下这些开销并不为零。真正需要关闭时，应当是「不创建」。

### 与 OpenTelemetry SDK / LangSmith 对照

| 能力 | 本课手写版 | OpenTelemetry SDK | LangSmith |
| --- | --- | --- | --- |
| 三个抽象 | Span / Tracer / AsyncLocalStorage | Span / Tracer / Context | Run / RunTree |
| 上下文传播 | AsyncLocalStorage | ContextManager（可插拔） | 自动（SDK 拦截） |
| 导出 | 自写 sink | Exporter（OTLP / Jaeger / …） | 上报到平台 |
| 采样 | 自写（trace 粒度） | Sampler（可自定义） | 平台侧配置 |
| LLM 专用属性 | 自己加 | 需语义约定（GenAI semconv） | 内置（prompt / tokens / 成本） |
| 跨语言 / 跨进程 | 不支持 | 支持（W3C traceparent） | 支持（服务端串联） |

手写版的能力边界很清楚：**单进程内的树**。跨进程、跨语言、行业标准导出都不支持。所以它的定位不是替代 OTel，而是：

- 你想控制每个属性的粒度与成本（比如只记 digest 不记全文）；
- 你的部署环境不想引入 SDK 依赖；
- 你需要先搞清楚原理，再决定要不要上标准方案。

一旦需要跨服务，就该换 OTel —— 而且此时你已经知道 \`traceparent\` 头里该放什么（L73 讲的传播），迁移成本很低。

:::warn

### 三个手写版特有的坑

**第一，span 泄漏。** 用 \`startSpan\` 而不配 \`withSpan\` 时，任何抛错路径都会漏掉 \`end()\`。表现是导出后的 span 没有 \`endMs\`，树里出现「永远在跑」的节点。规则：**只用 \`withSpan\`，不用裸 \`startSpan\`**，除非你在 \`finally\` 里显式收尾。

**第二，\`als.run\` 里不要做长驻注册。** 在 \`als.run\` 内部注册的事件监听器（\`emitter.on\`、\`setInterval\`）会永久捕获当前 span 的上下文，之后每次触发都创建在这个已结束的 span 之下。表现是「一个早已结束的请求下面不断长出新的子节点」。

**第三，属性值必须是标量。** 把对象塞进 \`attrs\` 会让导出与聚合全部失效（多数后端只支持标量）。需要记录结构时用 \`JSON.stringify\` 且截断，或拆成多个 \`a.b\` 形式的键。

:::

### 收束

150 行覆盖了追踪的核心：span 的生命周期、上下文自动传播、中间件包装、异步导出、优先采样。缺的是跨进程传播与标准导出协议——那两块正是 L76 的起点，因为多 Agent 系统天然跨角色、跨可能的进程边界。
`,
    null,
    [
      {
        text: '手写版里 `als.run(span, fn)` 解决的核心问题是？',
        options: [
          '性能优化',
          '让 fn 执行期间创建的 span 自动认当前 span 为父，无需手动传参',
          '错误处理',
          '内存回收',
        ],
        answer: 1,
        explain: 'AsyncLocalStorage 沿 await 链传播，自动完成单进程内的上下文传递。',
        concept: 'span-middleware',
      },
      {
        text: '`Span.end()` 必须幂等的原因是？',
        options: [
          '节省 CPU',
          'finally 与业务代码可能各调一次，重复写会让树里出现同名同 id 的两个节点',
          '避免内存泄漏',
          '为了支持并发',
        ],
        answer: 1,
        explain: '双写会让排查时误以为「这个工具被调了两次」。',
        concept: 'span-middleware',
      },
      {
        text: '手写版相对 OpenTelemetry SDK 的能力边界是？',
        options: [
          '不支持嵌套',
          '只覆盖单进程内的树，不支持跨进程 / 跨语言 / 标准导出',
          '不能记录错误',
          '不支持采样',
        ],
        answer: 1,
        explain: '需要跨服务时应换 OTel，迁移成本低因为传播语义已理解。',
        concept: 'span-middleware',
      },
      {
        text: '在 `als.run` 内部注册长驻事件监听器会怎样？',
        options: [
          '监听器失效',
          '永久捕获当前 span 上下文，之后每次触发都长在已结束的 span 下',
          '内存立即泄漏崩溃',
          'span 无法 end',
        ],
        answer: 1,
        explain: '表现是「早已结束的请求下面不断长出新的子节点」。',
        concept: 'span-middleware',
      },
    ],
    [
      ['AsyncLocalStorage', 'Node 的异步上下文存储，让 span 沿 await 链自动传播'],
      ['withSpan', '在 span 作用域内执行回调，保证成功与失败都收尾'],
      ['入参摘要 digest', '工具入参的哈希 + 长度，可聚合且不泄漏全文'],
      ['BatchExporter', '入队 + 定时/满批刷出的异步导出器，含优先采样'],
    ],
    [
      '用裸 startSpan 不用 withSpan，抛错路径漏掉 end 造成 span 泄漏。',
      '在 als.run 内注册长驻监听器，新 span 长在已结束的请求下。',
      'attrs 里塞对象，导致导出与聚合全部失效。',
    ],
  ),
  'practice',
)
