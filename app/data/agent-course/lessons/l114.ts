import { L } from '../../course-builders.ts'

/* ========== Stage 22 ========== */

export const L114 = L(
  'L114',
  22,
  '综合对照：用 4 种框架各实现同一个 Agent 并对比',
  18,
  3,
  ['L112'],
  ['framework-benchmark'],
  [
    '用 LangGraph / OpenAI Agents / Mastra / AI SDK 各实现同一个「天气查询 + 工具调用」Agent',
    '对比四者的代码量 / 可维护性 / 运行时位置',
    '形成「同一需求多实现」的选型直觉',
  ],
  `
### 同一需求，四种写法

选定一个最小需求：一个能调「查天气」工具的 Agent，跑一个「查明天北京的天气」的任务。用四种框架各写一遍，逐行对比。需求小，但足以暴露框架的「默认哲学」。

\`\`\` title="同一需求 × 4 框架（骨架对照）" note="同一个「查天气」任务，代码量从「几行」（OpenAI Agents / Mastra）到「几十行」（LangGraph / AI SDK 手写循环）不等。"
// ① LangGraph：显式图 + 状态 + 条件边
const graph = new StateGraph({ channels: { messages: reducer } })
graph.addNode("agent", callModel)
graph.addNode("tools", toolNode)
graph.addConditionalEdges("agent", shouldContinue) // 显式路由

// ② OpenAI Agents：run 把循环包起来
const agent = new Agent({ instructions, tools: [weather] })
const result = await run(agent, "查明天北京的天气") // 循环内置

// ③ Mastra：agent + tool，声明式
const weatherAgent = new Agent({ model, tools: { getWeather } })
const res = await weatherAgent.generate("查明天北京的天气")

// ④ AI SDK：最薄，只给 tool + 流式，循环自己写
const res = streamText({ model, tools: { getWeather } })
// 循环 / 回填 / 停止条件 = 你手写
\`\`\`

:::deep

### 代码量 ≠ 简单，可控性才是关键

OpenAI Agents 的 \\\`run()\\\` 一行把循环、工具执行、会话都包了——代码量最少，但你想改循环策略（比如加一个自定义停止条件）时就得钻进它的 session / run 抽象。AI SDK 代码量多，但每一行都是你的，改起来零阻力。

:::

### 四者对比结论

- LangGraph：最可控、最陡；适合复杂状态流。
- OpenAI Agents：最少代码、偏 OpenAI 生态；多 Agent handoff 是亮点。
- Mastra：全栈均衡、内置部署；想「少写胶水又不想被绑死」的中间态。
- AI SDK：最薄、最通用；适合自己掌控循环、只要流式 + tool 的场景。

:::warn

### 别用「代码量」当唯一指标

代码量少可能意味着框架替你做了很多决定——这些决定在简单需求下是福音，在定制需求下是枷锁。永远结合「需求复杂度」和「可控性需求」一起看。

:::

`,
  null,
  [
    {
      text: '这个综合对照用了哪个最小需求？',
      options: ['写一个网站', '天气查询 + 工具调用', '训练模型', '爬虫'],
      answer: 1,
      explain: '「查天气」工具 Agent。',
      concept: 'framework-benchmark',
    },
    {
      text: '代码量最少的通常是？',
      options: ['OpenAI Agents（run 包循环）', 'LangGraph（显式图）', 'AI SDK（手写循环）', '手写'],
      answer: 1,
      explain: 'OpenAI Agents / Mastra 把循环内置，代码最少。',
      concept: 'framework-benchmark',
    },
    {
      text: '「代码量少」可能意味着？',
      options: ['一定更好', '框架替你做了很多决定，定制时可能变枷锁', '没有抽象', '运行更快'],
      answer: 1,
      explain: '代码少 = 让渡更多决定。',
      concept: 'framework-benchmark',
    },
  ],
  [
    ['同一需求多实现', '选型方法论：用真实需求对比框架'],
    ['代码量', '实现同一需求的代码行数'],
    ['默认哲学', '框架替你做决定的倾向'],
  ],
  ['只比代码量，忽略可控性与需求匹配度。', '把「少代码」等同于「简单」，忽视背后的抽象成本。'],
)
