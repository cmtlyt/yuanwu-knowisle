import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 12 ========== */

export const L75 = withKind(
  L(
    'L75',
    12,
    '实战：从零用 TS 实现 span 追踪中间件（OpenTelemetry 原生手写）',
    4,
    ['L73'],
    ['span-middleware'],
    [
      '用 TS 手写一个 span 追踪中间件（traceId / parentSpanId / 起止时间）',
      '理解 OpenTelemetry 的核心抽象（Tracer / Span / Context）',
      '对照 OpenTelemetry SDK 与 LangSmith 的等价埋点',
    ],
    `
### 手写一个最小 OpenTelemetry

OpenTelemetry 的核心抽象其实很简单：Tracer 创建 Span，Span 记录起止与属性，Context 传递 traceId/parentSpanId。手写一遍，你就懂了 SDK 在干什么。

\`\`\` title="手写 span 追踪中间件" note="关键：\\\`startSpan\\\` 继承父的 traceId、设置 parentId，\\\`withSpan\\\` 保证结束必导出（finally）。"
interface Span {
  name: string; traceId: string; spanId: string; parentId: string | null
  start: number; end: number; attrs: Record<string, unknown>
}

class Tracer {
  constructor(private exporter: (s: Span) => void) {}

  startSpan(name: string, ctx?: Span): Span {
    return {
      name,
      traceId: ctx?.traceId ?? randomId(),       // 继承 traceId
      spanId: randomId(),
      parentId: ctx?.spanId ?? null,             // 继承 parentId
      start: performance.now(),
      end: 0,
      attrs: {},
    }
  }

  async withSpan<T>(name: string, fn: (s: Span) => Promise<T>, parent?: Span): Promise<T> {
    const span = this.startSpan(name, parent)
    try { return await fn(span) }
    finally { span.end = performance.now(); this.exporter(span) }
  }
}

// 用法：嵌套调用自动构成 span 树
tracer.withSpan("agent.run", async (root) => {
  tracer.withSpan("llm.chat", async () => {...}, root)
  tracer.withSpan("tool.call", async () => {...}, root)
}, undefined)
\`\`\`

:::deep

### 对照 OpenTelemetry SDK / LangSmith

OpenTelemetry SDK 的 \\\`trace.getTracer().startActiveSpan()\\\` 与你的 \\\`withSpan\\\` 等价，还加了采样、批处理、跨进程传播（W3C Trace Context）。LangSmith 则在此之上做 Agent 专属的 span 串联（自动识别 tool / llm 调用）。

:::

### 手写版要留意的三个点

- finally 导出：span 一定要在异常时也 end + export，否则丢数据。
- traceId 继承：同一条链路的 span 共享 traceId。
- 异步上下文：并发下要正确传递 parent，避免串 span。

:::warn

### 并发下 parent 容易串

如果两个 span 并发执行，把 parent 传错会导致 span 树错乱。生产环境用 AsyncLocalStorage 绑定上下文，手写版要留意。

:::

`,
    null,
    [
      {
        text: '手写 Tracer 中 `withSpan` 用 finally 导出 span 的原因是？',
        options: ['好看', '异常时也要 end + export，否则丢数据', '更快', '省内存'],
        answer: 1,
        explain: 'finally 保证异常也导出。',
        concept: 'span-middleware',
      },
      {
        text: '同一条链路的 span 共享什么？',
        options: ['spanId', 'traceId', 'parentId', 'name'],
        answer: 1,
        explain: '共享 traceId。',
        concept: 'span-middleware',
      },
      {
        text: '并发下 span 串错的原因是？',
        options: ['内存不够', 'parent 传递错误，需 AsyncLocalStorage 绑定上下文', '网络慢', '代码太长'],
        answer: 1,
        explain: '并发下 parent 易串。',
        concept: 'span-middleware',
      },
    ],
    [
      ['Tracer', '创建 Span 的入口对象'],
      ['Span', '一次操作的追踪记录'],
      ['AsyncLocalStorage', 'Node 中绑定异步上下文的机制'],
    ],
    ['span 不在 finally 导出，异常时丢追踪数据。', '并发下不绑定上下文，span 树错乱。'],
  ),
  'practice',
)
