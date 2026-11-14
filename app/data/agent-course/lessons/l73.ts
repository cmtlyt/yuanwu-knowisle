import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 12 ========== */

export const L73 = withKind(
  L(
    'L73',
    12,
    '链路追踪：一次请求穿过多少工具',
    3,
    ['L72'],
    ['tracing'],
    [
      '理解 span 与 trace 的层级关系',
      '掌握「一次请求穿过多少工具」的追踪方法',
      '认识分布式追踪在 Agent 场景的价值',
    ],
    `
### span 是原子，trace 是整棵树

一次工具调用、一次模型调用，各是一个 **span**（带起止时间、属性）。一次完整的 Agent 请求，从「收到用户消息」到「返回答案」，是一条 **trace**，由一棵 span 树组成。

\`\`\` title="span 树：一次请求的完整轨迹" note="这棵树回答「一次请求穿过多少工具、每步花了多久」——正是定位瓶颈的依据。"
trace: "用户问天气"                       ← 根 span
├─ span: llm.chat (200ms)                    ← 第 1 次模型调用
├─ span: tool.search_weather (80ms)          ← 工具调用
│     └─ span: http.get (70ms)               ← 工具内部 HTTP
├─ span: llm.chat (180ms)                    ← 第 2 次模型调用
└─ span: finish (5ms)                        ← 收尾

// 关键信息：每个 span 记录 name / 起止时间 / 属性 / 父 span
\`\`\`

:::deep

### trace context 如何传递

分布式追踪的关键是 **trace context**：每个 span 带 traceId（整条链路）和 parentSpanId（父节点）。这样即便跨进程、跨服务，也能拼回一棵完整的树。标准是 OpenTelemetry（L75）。

:::

### 链路追踪的三个价值

- 定位瓶颈：哪一步最慢一目了然。
- 还原现场：出问题时能回放整条链路。
- 成本归因：每个工具 / 每次调用花了多少 token。

:::warn

### span 属性要「结构化」

span 的属性（输入输出、工具名、token 数）要结构化存储，不能是自由文本，否则无法按维度过滤聚合。

:::

`,
    null,
    [
      {
        text: 'span 与 trace 的关系是？',
        options: ['无关', 'span 是原子操作记录，trace 是 span 组成的整棵树', 'trace 是 span 的子集', '等同'],
        answer: 1,
        explain: 'span 组成 trace 树。',
        concept: 'tracing',
      },
      {
        text: '跨进程拼回一棵树靠什么？',
        options: ['日志', 'trace context（traceId + parentSpanId）', '内存', '文件名'],
        answer: 1,
        explain: 'traceId + parentSpanId 关联。',
        concept: 'tracing',
      },
      {
        text: 'span 属性为什么要结构化？',
        options: ['好看', '才能按维度过滤聚合（工具名/token数等）', '更快', '省空间'],
        answer: 1,
        explain: '结构化才能过滤聚合。',
        concept: 'tracing',
      },
    ],
    [
      ['span', '一次操作的起止时间与属性记录'],
      ['trace', '一次请求的 span 树'],
      ['trace context', 'traceId + parentSpanId 的传递机制'],
    ],
    ['span 属性写成自由文本，无法按维度聚合。', '不传 parentSpanId，跨进程无法拼回链路。'],
  ),
  'practice',
)
