import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 19 ========== */

export const L104 = withKind(
  L(
    'L104',
    19,
    '对照：用 Mastra 重写工具型 Agent + workflow 编排（对比 L42 / L60）',
    3,
    ['L103', 'L42', 'L60'],
    ['mastra-workflow'],
    [
      '用 Mastra 重写工具型 Agent 与 workflow 编排',
      '对比 L42 的 FC 运行时与 L60 的 P&E 引擎',
      '理解 workflow 与「计划执行」的关系',
    ],
    `
### 工具 Agent 与 P&E 的 Mastra 版

L42 的 Function Calling 运行时、L60 的 P&E 引擎，用 Mastra 重写，看「工具」和「计划」如何被框架表达。

\`\`\` title="工具型 Agent 重写（对照 L42）" note="关键：L42 手写的 schema/parse/回填，Mastra 的 tools 声明替代；L60 的 plan→execute，Mastra 的 step 链表达。"
// 手写版（L42）：runWithTools 约 40 行（schema/parse/执行/回填）
// Mastra 版：
const agent = new Agent({
  name: "assistant",
  model: "gpt-4o-mini",
  tools: { search_weather: { ... } },   // 工具直接挂
})
const result = await agent.generate("查天气")  // FC 循环内置

// workflow 编排（对照 L60 P&E 引擎）
const wf = new Workflow({ name: "plan-execute" })
  .step(planStep)      // 规划
  .then(executeStep)   // 执行
  .then(reviewStep)    // 审查
  .commit()            // 显式 commit 才生效
\`\`\`

:::deep

### workflow vs P&E 引擎

手写 P&E 引擎（L60）的「规划→执行→重规划钩子」，在 Mastra 里是「workflow 的 step 链 + 条件 step」。workflow 更「函数式」，但重规划这类「动态跳转」表达力不如 LangGraph 的图（需要显式条件 step）。

:::

### 对照结论

- 工具调用：Mastra 的 tools 声明替代手写 schema/parse/回填。
- 计划执行：Mastra 的 workflow step 链替代手写 P&E 引擎。
- 重规划：Mastra 用条件 step，不如 LangGraph 的图灵活。

:::warn

### workflow 是「声明式」不是「图」

Mastra workflow 的 step 链更适合「线性 + 分支」流程，复杂的「环」（如 ReAct 循环）不如 LangGraph 的图直观。别硬套。

:::

`,
    null,
    [
      {
        text: 'L42 手写的 schema/parse/回填，在 Mastra 里被什么替代？',
        options: ['workflow', 'Agent 的 tools 声明', 'memory', 'rag'],
        answer: 1,
        explain: 'tools 声明替代。',
        concept: 'mastra-workflow',
      },
      {
        text: 'L60 的 P&E 引擎在 Mastra 里对应？',
        options: ['memory', 'workflow 的 step 链', 'rag', 'observability'],
        answer: 1,
        explain: 'workflow step 链。',
        concept: 'mastra-workflow',
      },
      {
        text: '复杂「环」（ReAct 循环）在 Mastra 里的表达力？',
        options: ['很强', '不如 LangGraph 的图直观，别硬套', '完全相同', '无法表达'],
        answer: 1,
        explain: 'workflow 适合线性+分支，环不如图。',
        concept: 'mastra-workflow',
      },
    ],
    [
      ['step 链', 'Mastra workflow 的步骤编排'],
      ['commit()', 'workflow 显式提交才生效'],
      ['条件 step', 'Mastra 里表达分支的步骤'],
    ],
    ['把复杂循环硬套 workflow，表达力不足。', '忽视 commit()，workflow 修改不生效。'],
  ),
  'framework',
)
