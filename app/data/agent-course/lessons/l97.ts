import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 17 ========== */

export const L97 = withKind(
  L(
    'L97',
    17,
    '对照：用 LangGraph 重写 ReAct / Plan-and-Execute（对比 L13 / L15 手写版）',
    3,
    ['L96', 'L13', 'L15'],
    ['langgraph-react'],
    [
      '用 LangGraph 重写 ReAct 与 P&E，对比 L13 / L15 手写版',
      '理解「循环」与「计划」在图上的表达差异',
      '度量代码量、可控性、运行时位置的差异',
    ],
    `
### 同一需求，图上重写

把 L13 的 ReAct 和 L15 的 P&E 用 LangGraph 重写，直接对比：循环怎么变成图、状态怎么管理。

\`\`\` title="ReAct 的图实现（对照 L13 手写版）" note="核心差异：手写版「循环 + 解析 + 终止」三件事，LangGraph 变成「节点 + 条件边 + 环」。"
// 手写版（L13）：while 循环 + parseReAct + 工具注册表
// LangGraph 版：
const graph = new StateGraph({ messages: { reducer: append } })
  .addNode("agent", async (state) => ({
    messages: [await model.invoke(state.messages)],  // 模型决定
  }))
  .addNode("tools", async (state) => ({
    messages: [await executeTools(state.messages.at(-1))],  // 执行工具
  }))
  .addConditionalEdges("agent", (s) => (hasToolCall(s) ? "tools" : "__end__"))
  .addEdge("tools", "agent")   // 工具结果 → 回到 agent（环）

// 对比：手写版 parseReAct 的正则解析，被 LangGraph 的工具绑定替代
//       手写版的 maxSteps 终止，被图的 __end__ 条件边替代
\`\`\`

\`\`\` title="P&E 的图实现（对照 L15）" note="重规划（L61 的手写钩子）在 LangGraph 里就是一条「executor → planner」的条件边。"
// 手写版（L15）：plan 一次 + 逐步 reactLoop
// LangGraph 版：
const graph = new StateGraph({ plan: ..., results: ... })
  .addNode("planner", planNode)      // 生成计划
  .addNode("executor", execNode)     // 逐步执行
  .addConditionalEdges("executor", (s) => (s.needsReplan ? "planner" : "__end__"))
  .addEdge("planner", "executor")
\`\`\`

:::deep

### 度量对比

代码量：LangGraph 版更短（工具绑定、条件边省去手写解析）。可控性：手写版更高（你能改每一个字节）。运行时位置：LangGraph 引入了 checkpoint 与图运行时，状态管理被框架接管——这正是「让渡」的部分。

:::

### 三个对照结论

- 循环 = 环：手写 while 对应图的「边回到节点」。
- 终止 = 条件边：手写 maxSteps 对应「__end__ 条件边」。
- 重规划 = 边：手写重规划钩子对应「executor → planner」边。

`,
    null,
    [
      {
        text: 'LangGraph 里 ReAct 的「终止」对应手写版的什么？',
        options: ['parseReAct', 'maxSteps 终止 → 图的 __end__ 条件边', '工具注册表', 'while'],
        answer: 1,
        explain: '终止对应条件边。',
        concept: 'langgraph-react',
      },
      {
        text: 'P&E 的「重规划」在 LangGraph 里是？',
        options: ['一个 while', 'executor → planner 的条件边', '一个节点', '一个 reducer'],
        answer: 1,
        explain: '重规划是一条边。',
        concept: 'langgraph-react',
      },
      {
        text: 'LangGraph 版「可控性」相对手写版？',
        options: ['更高', '更低（状态管理被框架接管）', '相同', '无关'],
        answer: 1,
        explain: '框架接管了状态管理，可控性让渡。',
        concept: 'langgraph-react',
      },
    ],
    [
      ['条件边', '根据状态决定下一节点的边'],
      ['环', '图中的循环（边回到节点）'],
      ['让渡', '框架接管的部分（状态/运行）'],
    ],
    ['以为 LangGraph 只是「换写法」，忽视可控性让渡。', '把重规划硬写进节点逻辑，而非用条件边。'],
  ),
  'framework',
)
