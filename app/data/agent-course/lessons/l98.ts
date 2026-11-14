import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 17 ========== */

export const L98 = L(
  'L98',
  17,
  '对照：用 LangGraph 实现多 Agent 与 subgraph / human-in-loop',
  18,
  3,
  ['L96', 'L68'],
  ['langgraph-multi'],
  [
    '用 LangGraph 实现多 Agent（subgraph）与人机协作（human-in-loop）',
    '对比 L68 手写的消息总线 + supervisor',
    '理解 subgraph 与 interrupt 的价值',
  ],
  [
    prose(
      '多 Agent 的图化表达',
      'L68 手写的多 Agent 是「消息总线 + supervisor 函数」。LangGraph 用 **subgraph**（子图）把每个 Agent 封装成独立子图，用 **interrupt**（中断）实现 human-in-loop。',
    ),
    code(
      'subgraph + human-in-loop',
      '// ① subgraph：每个 Agent 是独立子图\nconst researcher = buildResearcherGraph()   // 子图\nconst reviewer = buildReviewerGraph()       // 子图\n\n// ② 主图：supervisor 编排，把子图当节点\nconst supervisor = new StateGraph(State)\n  .addNode("research", researcher)\n  .addNode("review", reviewer)\n  .addConditionalEdges("research", (s) => (s.approved ? "review" : "__end__"))\n\n// ③ human-in-loop：用 interrupt 在关键节点挂起\nconst app = supervisor.compile({ checkpointer })\nawait app.invoke(input, { interruptBefore: ["approve"] })  // 停在 approve 前\n// ... 等人工审批后，再 resume\nawait app.invoke(null, { resume: { approved: true } })',
      '关键：subgraph 封装角色、interrupt 实现「挂起等人工」，对应手写版的「角色函数」与「人工审批」。',
    ),
    call(
      'deep',
      'interrupt 的机制',
      'LangGraph 的 `interrupt` 让图在指定节点前「挂起」，把控制权交还外部（人工）。配合 checkpoint，挂起的状态可持久化、可恢复。这就是「人在回路」（L71）在图框架里的原生实现。',
    ),
    list('手写 vs LangGraph 多 Agent', [
      '手写版：消息总线 + supervisor 函数，灵活但人工介入要自己实现。',
      'LangGraph 版：subgraph + interrupt，人工介入是原生能力。',
      '代价：subgraph 嵌套与 interrupt 机制有学习成本。',
    ]),
    call(
      'warn',
      'subgraph 别拆太碎',
      '每个小功能都拆成 subgraph，图会变得难懂难维护。subgraph 应拆在「职责边界清晰」处（如「研究员」「评审」），不是「每个工具」都拆。',
    ),
  ],
  null,
  [
    q(
      'LangGraph 中多 Agent 的「角色」用什么表达？',
      ['消息总线', 'subgraph（子图）', 'prompt', 'reducer'],
      1,
      '每个 Agent 是独立子图。',
      'langgraph-multi',
    ),
    q(
      'LangGraph 实现 human-in-loop 靠？',
      ['while', 'interrupt（在节点前挂起等人工）', 'checkpoint', 'reducer'],
      1,
      'interrupt 挂起等人工。',
      'langgraph-multi',
    ),
    q(
      'subgraph 的拆分原则是？',
      ['每个工具都拆', '在职责边界清晰处拆（研究员/评审）', '不拆', '随机拆'],
      1,
      '按职责边界拆。',
      'langgraph-multi',
    ),
  ],
  [
    ['subgraph', '封装独立 Agent 的子图'],
    ['interrupt', '在节点前挂起、交还控制权的机制'],
    ['resume', '人工审批后继续执行'],
  ],
  ['每个工具都拆成 subgraph，图难懂难维护。', '人工介入仍用手写轮询，忽视 interrupt 原生能力。'],
)
