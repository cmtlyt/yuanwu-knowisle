import { L } from '../../course-builders.ts'

/* ========== Stage 17 ========== */

export const L96 = L(
  'L96',
  17,
  'LangGraph 核心概念：图 / 状态 / reducer / checkpoint',
  14,
  3,
  ['L93', 'L31'],
  ['langgraph-core'],
  [
    '掌握 LangGraph 四大核心概念：图 / 状态 / reducer / checkpoint',
    '理解「把循环显式化成图」的思想',
    '认识 State 累加器与 checkpoint 的价值',
  ],
  `
### 把循环画成图

LangGraph 的核心思想：把 Agent 的循环显式化成一张**图**——节点（node，做什么）+ 边（edge，往哪走）+ 状态（State，记什么）。循环不再是 \\\`while\\\`，而是图上的「环」。

\`\`\` title="LangGraph 四概念" note="关键：\\\`addEdge("tool", "model")\\\` 就是「循环」——图上的环替代了 while。"
import { StateGraph } from "@langchain/langgraph"

// ① 状态 State：跨节点共享，定义 reducer（如何合并）
const State = { messages: { reducer: (a, b) => a.concat(b) } }  // 追加

// ② 图：节点 + 边
const graph = new StateGraph(State)
  .addNode("model", modelNode)       // 节点：调模型
  .addNode("tool", toolNode)         // 节点：调工具
  .addEdge("__start__", "model")     // 边：起点 → model
  .addConditionalEdges("model", route)  // 条件边：有工具→tool，否则→end
  .addEdge("tool", "model")          // 边：tool → 回到 model（环！）

// ③ 编译 + checkpoint
const app = graph.compile({ checkpointer: new MemorySaver() })  // ④ checkpoint
\`\`\`

:::deep

### reducer 与 checkpoint 解决什么

reducer 定义「状态如何合并」（如 messages 追加、字段覆盖），解决并发节点写同一状态的问题。checkpoint 持久化每个节点的状态快照，支持**断点续跑**与**时间旅行调试**（回到任意节点）。

:::

### 图 vs 手写循环

- 手写循环：\\\`while\\\` + 状态变量，灵活但流程不直观。
- 图：节点+边显式化流程，可读、可断点、可恢复。
- 代价：概念多（State/reducer/checkpoint），学习曲线陡。

:::warn

### 别把简单循环也画成图

LangGraph 适合「流程复杂、需要断点/恢复/可视化」的场景。一个 5 行的 ReAct 循环，用图是过度设计。

:::

`,
  null,
  [
    {
      text: 'LangGraph 的四大核心概念是？',
      options: ['类、对象、方法、属性', '图、状态、reducer、checkpoint', '快、慢、中、大', '增、删、改、查'],
      answer: 1,
      explain: '图、状态、reducer、checkpoint。',
      concept: 'langgraph-core',
    },
    {
      text: 'LangGraph 里「循环」如何表达？',
      options: ['while 循环', '图上的环（如 addEdge("tool", "model")）', '递归', 'for 循环'],
      answer: 1,
      explain: '图上的环替代 while。',
      concept: 'langgraph-core',
    },
    {
      text: 'reducer 解决什么问题？',
      options: ['美化代码', '定义状态如何合并，解决并发节点写同一状态', '加快', '省内存'],
      answer: 1,
      explain: 'reducer 定义状态合并方式。',
      concept: 'langgraph-core',
    },
  ],
  [
    ['StateGraph', 'LangGraph 的图构建器'],
    ['reducer', '定义状态合并方式的函数'],
    ['checkpoint', '节点状态快照，支持断点续跑'],
  ],
  ['把简单循环也画成图，过度设计。', '忽略 reducer，并发节点写状态冲突。'],
)
