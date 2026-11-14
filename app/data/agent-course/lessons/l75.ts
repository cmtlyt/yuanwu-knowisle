import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 12 ========== */

export const L75 = L(
  'L75',
  12,
  '实战：从零用 TS 实现 span 追踪中间件（OpenTelemetry 原生手写）',
  20,
  4,
  ['L73'],
  ['span-middleware'],
  [
    '用 TS 手写一个 span 追踪中间件（traceId / parentSpanId / 起止时间）',
    '理解 OpenTelemetry 的核心抽象（Tracer / Span / Context）',
    '对照 OpenTelemetry SDK 与 LangSmith 的等价埋点',
  ],
  [
    prose(
      '手写一个最小 OpenTelemetry',
      'OpenTelemetry 的核心抽象其实很简单：Tracer 创建 Span，Span 记录起止与属性，Context 传递 traceId/parentSpanId。手写一遍，你就懂了 SDK 在干什么。',
    ),
    code(
      '手写 span 追踪中间件',
      'interface Span {\n  name: string; traceId: string; spanId: string; parentId: string | null\n  start: number; end: number; attrs: Record<string, unknown>\n}\n\nclass Tracer {\n  constructor(private exporter: (s: Span) => void) {}\n\n  startSpan(name: string, ctx?: Span): Span {\n    return {\n      name,\n      traceId: ctx?.traceId ?? randomId(),       // 继承 traceId\n      spanId: randomId(),\n      parentId: ctx?.spanId ?? null,             // 继承 parentId\n      start: performance.now(),\n      end: 0,\n      attrs: {},\n    }\n  }\n\n  async withSpan<T>(name: string, fn: (s: Span) => Promise<T>, parent?: Span): Promise<T> {\n    const span = this.startSpan(name, parent)\n    try { return await fn(span) }\n    finally { span.end = performance.now(); this.exporter(span) }\n  }\n}\n\n// 用法：嵌套调用自动构成 span 树\ntracer.withSpan("agent.run", async (root) => {\n  tracer.withSpan("llm.chat", async () => {...}, root)\n  tracer.withSpan("tool.call", async () => {...}, root)\n}, undefined)',
      '关键：`startSpan` 继承父的 traceId、设置 parentId，`withSpan` 保证结束必导出（finally）。',
    ),
    call(
      'deep',
      '对照 OpenTelemetry SDK / LangSmith',
      'OpenTelemetry SDK 的 `trace.getTracer().startActiveSpan()` 与你的 `withSpan` 等价，还加了采样、批处理、跨进程传播（W3C Trace Context）。LangSmith 则在此之上做 Agent 专属的 span 串联（自动识别 tool / llm 调用）。',
    ),
    list('手写版要留意的三个点', [
      'finally 导出：span 一定要在异常时也 end + export，否则丢数据。',
      'traceId 继承：同一条链路的 span 共享 traceId。',
      '异步上下文：并发下要正确传递 parent，避免串 span。',
    ]),
    call(
      'warn',
      '并发下 parent 容易串',
      '如果两个 span 并发执行，把 parent 传错会导致 span 树错乱。生产环境用 AsyncLocalStorage 绑定上下文，手写版要留意。',
    ),
  ],
  null,
  [
    q(
      '手写 Tracer 中 `withSpan` 用 finally 导出 span 的原因是？',
      ['好看', '异常时也要 end + export，否则丢数据', '更快', '省内存'],
      1,
      'finally 保证异常也导出。',
      'span-middleware',
    ),
    q(
      '同一条链路的 span 共享什么？',
      ['spanId', 'traceId', 'parentId', 'name'],
      1,
      '共享 traceId。',
      'span-middleware',
    ),
    q(
      '并发下 span 串错的原因是？',
      ['内存不够', 'parent 传递错误，需 AsyncLocalStorage 绑定上下文', '网络慢', '代码太长'],
      1,
      '并发下 parent 易串。',
      'span-middleware',
    ),
  ],
  [
    ['Tracer', '创建 Span 的入口对象'],
    ['Span', '一次操作的追踪记录'],
    ['AsyncLocalStorage', 'Node 中绑定异步上下文的机制'],
  ],
  ['span 不在 finally 导出，异常时丢追踪数据。', '并发下不绑定上下文，span 树错乱。'],
)
