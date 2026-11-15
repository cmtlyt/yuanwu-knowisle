import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 12 ========== */

export const L73 = withKind(
  L(
    'L73',
    12,
    '链路追踪：一次请求穿过多少工具',
    24,
    ['L72'],
    ['tracing'],
    [
      '用 span 树表达一次请求的因果结构，区分模型调用与工具调用的父子关系',
      '给出 span 的最小必要属性集，避免「有 trace 但查不出问题」',
      '掌握 traceId 跨进程 / 跨 Agent 的传播方式与断链排查顺序',
    ],
    `
### 「穿了 6 个工具」，实际是 23 次

一个数据分析 Agent 被问「为什么这个请求要 40 秒」。团队打开日志数了数：检索、SQL 查询、画图、再查一次、汇总 —— 六个工具，看起来不多。

接入追踪之后，同一个请求的 span 树是这样的：模型调用 8 次，工具调用 23 次，其中最深的子树有 5 层。多出来的 17 次全部来自重试与「补一次确认查询」——它们在日志里是散落的 \`INFO\` 行，没有任何东西把它们归到同一个请求上。

「一次请求穿过多少工具」这个问题，用日志几乎无法回答。它不是「数一下有几条工具日志」——而是「把属于同一因果链的调用组织成一棵树，然后数叶子」。这正是追踪要解决的事。

### span 是原子，trace 是树

- **span**：一段有起止时间的操作。它必须有 \`name\`、\`start\`、\`end\`、\`status\`，以及足够的属性来定位问题。
- **trace**：同一个 \`traceId\` 下所有 span 的集合。\`parentSpanId\` 决定它们构成什么形状的树。
- 树的**深度**反映调用的嵌套层数，**宽度**反映同一层的并行度。两者都是性能分析的一级指标：深树通常是「串行补步骤」，宽树通常是「并行扇出」。

一次 Agent 请求的典型形状是**阶梯状**的：模型调用 → 工具调用 → 模型调用 → 工具调用。每一轮模型调用是父，它调用的工具是子；下一轮的模型调用是上一轮模型调用的**兄弟**还是**子**，取决于实现——这个选择直接决定树能不能回答「第几轮开始变慢」。

\`\`\`ts title="span 的形状与父子选择"
interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string // 'model:plan' / 'tool:search' / 'step:3'
  startMs: number
  endMs: number
  status: 'ok' | 'error'
  attrs: Record<string, string | number>
}

// 方案 A：每轮模型调用是上一轮的子节点 —— 树是一条链
//   step1 ─ model1 ─ tool1
//          └ step2 ─ model2 ─ tool2
// 方案 B：所有 step 挂在同一个 trace 根下，step 之间是兄弟 —— 树是扇形
//   root ─ step1( model1 ─ tool1 )
//        ├ step2( model2 ─ tool2 )
//        └ step3( model3 ─ tool3 )

function buildTree(spans: Span[]): Map<string | undefined, Span[]> {
  const children = new Map<string | undefined, Span[]>()
  for (const s of spans) {
    const key = s.parentSpanId
    if (!children.has(key)) children.set(key, [])
    children.get(key)!.push(s)
  }
  return children
}
\`\`\`

两种形状的用途完全不同：

- 方案 A（链式）能回答「这个请求总共走了几轮」，但树的深度会随步数线性增长，深度告警会误报。
- 方案 B（扇形）把「轮次」提升为显式层级，能按 step 聚合耗时——L72 说的「按 step 统计延迟」就依赖这个形状。

生产上通常两者结合：根节点下挂 step 兄弟，step 内挂该轮的模型调用与工具调用。这样既能按 step 聚合，又能看到单轮内部的嵌套。

### span 的最小必要属性集

属性少了查不出问题，属性多了存储爆炸。下面这一组是「能定位绝大多数问题」的下限：

| 属性 | 适用 span | 为什么必需 |
| --- | --- | --- |
| \`step\` | 所有 | 把耗时归到第几轮，支持按 step 聚合 |
| \`model\` / \`tool\` | 模型 / 工具 span | 分组统计与退化对比的基础 |
| \`tokens.in\` / \`tokens.out\` | 模型 span | 成本归因；输入 token 突增常是上下文膨胀 |
| \`tool.args.digest\` | 工具 span | 入参摘要（哈希或前 N 字符），用于判断「是不是同一类调用」 |
| \`retry.count\` | 工具 span | 区分「一次慢调用」与「三次超时重试」 |
| \`error.type\` | 失败 span | 区分超时、限流、参数错误、业务错误 |
| \`handoff.to\` | 多 Agent 场景 | 跨角色时标注控制权转移目标（L68） |

其中 \`retry.count\` 是最容易漏、也最能解释「为什么工具数对不上」的属性。开头的案例里，23 次工具调用中有 17 次是重试，如果 span 只记「一次工具调用」，这 17 次就会消失，而且消失得毫无痕迹。

:::deep

### 为什么 span 不记录完整入参

直觉上「记全了才能复现」。但把完整 prompt 与工具返回值写进 span 会带来三个问题，且第三个最致命：

**体积**：单条 trace 从几 KB 涨到几百 KB，采样率被迫降低，反而看得更少（L72 讲过这个反噬）。

**隐私与合规**：prompt 里通常含用户数据。把全文写进追踪系统，等于把数据边界扩大到了追踪后端——那里往往权限更宽、保留更久。

**检索失真**：全文属性无法聚合。你没法对「prompt 全文」做 group by，只能做全文检索；而做摘要之后，\`tool.args.digest\` 可以按值分组，直接回答「今天有多少次调用传了空参数」。

正确做法是**双层记录**：span 里放摘要（哈希 + 长度 + 前 N 字符），全文按 \`spanId\` 存到可以按需回捞的地方（对象存储或专用日志），并设置短保留期。这样日常分析走摘要，专项排查才回捞全文。

:::

### traceId 的传播

这一点是追踪最容易断的地方。span 树能长起来的前提是：**子调用创建 span 时能拿到父 span 的上下文**。

三条传播路径，各自的断点不同：

| 路径 | 传播方式 | 常见断点 |
| --- | --- | --- |
| 进程内函数调用 | 显式传参或 AsyncLocalStorage | 用了不受管的第三方异步 API，上下文丢失 |
| 进程间（HTTP / 队列） | 请求头（如 \`traceparent\`） | 中间件没透传，或队列消息体没带 |
| 跨 Agent（多 Agent 系统） | 消息体字段（L67 的 \`traceId\` / \`parentId\`） | 消息重新构造时忘了带上 |

第三条正是 L67 在消息 schema 里放 \`traceId\` / \`parentId\` 的真正动机——不只是为了归因，是为了让追踪能在 Agent 之间接上。如果当时没放，追踪到第一个 handoff 就断了。

:::warn

### 「树断了」的排查顺序

打开追踪发现某个请求的 span 只到模型调用就没了，或者出现多个孤立根节点。按这个顺序查，能覆盖九成情况：

1. **有没有多个根**（\`parentSpanId\` 为空的 span 超过一个）？有，说明某处没拿到上下文——先查那条边是进程内还是跨进程。
2. **最后一个 span 的结束时间是否接近超时**？是，说明请求被上层取消，后续 span 根本没创建。
3. **是否在异步回调里创建 span**？\`setTimeout\`、事件监听、流式回调里如果要创建 span，必须显式带上捕获时的上下文，否则拿到的是「当前」上下文（可能是空的）。
4. **是否跨了队列 / 消息**？消息体里必须显式带 \`traceId\` 与 \`parentSpanId\`，消费端从消息体恢复，而不是从当前线程上下文恢复。

第 3、4 条的共同点是：**上下文不会自动穿过边界**。任何边界（异步、线程、进程、消息）都要显式搬运，指望「它自己会带上」是断链的第一原因。

:::

### 回答「穿过多少工具」

有了树之后，开头那个问题变成一次聚合查询：

\`\`\`ts title="从 span 树里算出关键数字"
interface TraceStats {
  toolCalls: number
  toolRetries: number
  distinctTools: string[]
  modelCalls: number
  deepest: number
  slowest: Span
  perStep: Record<number, number> // step → 总耗时
}

function stats(spans: Span[]): TraceStats {
  const tools = spans.filter((s) => s.name.startsWith('tool:'))
  const models = spans.filter((s) => s.name.startsWith('model:'))
  const calls = new Map<string, number>()
  const perStep: Record<number, number> = {}
  let retries = 0

  for (const s of tools) {
    const name = String(s.attrs.tool ?? s.name.slice(5))
    calls.set(name, (calls.get(name) ?? 0) + 1)
    retries += Number(s.attrs['retry.count'] ?? 0)
  }
  for (const s of spans) {
    const step = Number(s.attrs.step ?? 0)
    perStep[step] = (perStep[step] ?? 0) + (s.endMs - s.startMs)
  }

  const childCount = new Map<string | undefined, number>()
  for (const s of spans) childCount.set(s.parentSpanId, (childCount.get(s.parentSpanId) ?? 0) + 1)

  return {
    toolCalls: tools.length,
    toolRetries: retries,
    distinctTools: [...calls.keys()],
    modelCalls: models.length,
    deepest: Math.max(...spans.map((s) => Number(s.attrs.depth ?? 0))),
    slowest: spans.reduce((a, b) => (b.endMs - b.startMs > a.endMs - a.startMs ? b : a)),
    perStep,
  }
}
\`\`\`

关键在 \`distinctTools\` 与 \`toolCalls\` 的差别：前者是「用了几个工具」，后者是「调了多少次」。开头那个「六个工具 vs 23 次调用」的落差，就是这两个数字的差。只看前者的仪表盘会让人以为系统很简单。

\`perStep\` 则直接支撑 L72 的「按 step 看延迟」——它是把 span 树变成可聚合指标的那一步。

### 采样与追踪的冲突

采样会破坏追踪的一个基本假设：**同一 trace 的 span 应该一起被保留**。

如果按「每个 span 独立采样 5%」，一条 trace 只会有零星几个 span 留下，树永远是断的。所以采样必须在 **trace 粒度**做决定（用 \`traceId\` 做一致性哈希，或者在请求结束时按整条 trace 决定），而不是 span 粒度。

这条约束和 L72 的「优先采样」是同一件事的两面：优先采样本质上就是 trace 粒度的决定——一旦某个 span 触发保留条件，整条 trace 都保留。

下一课处理「trace 已经有了，然后呢」：怎么把一条失败轨迹变成可以反复重跑的现场。
`,
    null,
    [
      {
        text: '「一次请求穿过多少工具」这个问题的正确答案是？',
        options: [
          '数日志里有多少条工具日志',
          '把同一 traceId 的 span 组织成树，统计工具 span 的数量（含重试）',
          '看工具的注册数量',
          '看 prompt 里列了几个工具',
        ],
        answer: 1,
        explain: '工具数与调用次数是两回事，重试会让后者远大于前者。',
        concept: 'tracing',
      },
      {
        text: 'span 记录 `retry.count` 属性的价值是？',
        options: [
          '方便排序',
          '解释「工具数与调用次数对不上」，区分一次慢调用与多次超时重试',
          '减少存储',
          '用于采样',
        ],
        answer: 1,
        explain: '不记重试的话，那部分调用会在追踪里彻底消失。',
        concept: 'tracing',
      },
      {
        text: '采样与追踪的基本冲突是？',
        options: [
          '采样太慢',
          'span 粒度独立采样会让同一 trace 只剩零星 span，树永远断',
          '采样会增加延迟',
          '采样不支持跨进程',
        ],
        answer: 1,
        explain: '采样必须在 trace 粒度做决定，优先采样正是这个粒度。',
        concept: 'tracing',
      },
      {
        text: '异步回调里创建 span 为什么容易断链？',
        options: [
          '异步不支持 span',
          '上下文不会自动穿过异步边界，必须显式搬运捕获时的上下文',
          '回调里不能调用 API',
          '异步会丢失 traceId',
        ],
        answer: 1,
        explain: '所有边界（异步 / 线程 / 进程 / 消息）都要显式搬运上下文。',
        concept: 'tracing',
      },
    ],
    [
      ['span', '一段有起止时间的操作，追踪的原子单位'],
      ['trace', '同一 traceId 下全部 span 构成的因果树'],
      ['trace 粒度采样', '按整条 trace 决定保留与否，避免树被拆散'],
      ['上下文传播', '把父 span 上下文显式搬运过异步 / 进程 / 消息边界'],
    ],
    [
      'span 只记录一次工具调用、不记重试，导致调用次数被低估。',
      'span 粒度独立采样，trace 树只剩下零星几个节点。',
      '异步回调里创建 span 未带捕获上下文，出现多个孤立根节点。',
    ],
  ),
  'theory',
)
