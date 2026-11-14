import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L15 = L(
  'L15',
  2,
  '实战：对比实现 Plan-and-Execute（与 ReAct 跑同一任务）',
  18,
  3,
  ['L14', 'L13'],
  ['plan-execute-impl'],
  [
    '用 TS 实现 P&E 循环，并与 ReAct 跑同一任务对比',
    '观察两种范式在「调用次数」与「可读性」上的差异',
    '对照 LangGraph 的 plan / execute 模板',
  ],
  [
    prose(
      '同一任务，两种范式',
      '我们用同一个「调研任务」分别跑 ReAct 和 P&E，对比它们的调用次数、上下文结构与可控性。',
    ),
    code(
      'P&E 实现：先规划',
      'async function planAndExecute(client: LlmClient, prompt: string) {\n  // 阶段一：生成计划\n  const planRaw = await client.chat([\n    { role: "system", content: "把任务拆成有序步骤，输出 JSON 数组" },\n    { role: "user", content: prompt },\n  ])\n  const plan: string[] = JSON.parse(planRaw).steps\n\n  // 阶段二：逐步执行，每步用 ReAct 风格完成\n  const results: string[] = []\n  for (const step of plan) {\n    const r = await reactLoop(client, "完成这一步：" + step)  // 复用 L13 的循环\n    results.push(r)\n  }\n  return synthesize(client, results)  // 汇总成最终答案\n}',
      '注意：执行阶段「逐步」复用了 L13 的 ReAct 循环——P&E 与 ReAct 不是互斥，而是可组合。',
    ),
    code(
      '对比：同一任务的两种轨迹',
      '// ReAct：边想边做，8 次调用\n//   think→act→obs → think→act→obs → ... → finish\n\n// P&E：先列 3 步，再逐步执行，5 次调用\n//   plan(1 次) → exec step1 → exec step2 → exec step3 → synthesize(1 次)',
      'P&E 省掉的是「执行阶段反复的思考」，代价是计划阶段需要一次额外调用。',
    ),
    call(
      'deep',
      '什么时候 P&E 更划算',
      '当任务步骤多、且步骤之间相对独立时，P&E 的「一次规划」能显著减少「边做边想」的 token。当任务高度依赖「做完一步才知道下一步」时，ReAct 的灵活性反而更省。',
    ),
    call(
      'tip',
      '框架对照：LangGraph plan / execute',
      'LangGraph 社区模板把 P&E 画成「planner 节点 → 循环执行器节点 → replan 节点」，replan 节点在计划落后于现实时重新规划。它与你手写的区别仅在于：图把状态与边显式化，重规划成为图上的一个节点。',
    ),
    list('本次实战要观察的三个点', [
      '模型调用总次数：P&E 通常更少。',
      '上下文结构：P&E 的计划是「显式可审阅」的中间产物。',
      '失败时的表现：计划错误时 P&E 如何暴露问题（引出 L61 重规划）。',
    ]),
  ],
  null,
  [
    q(
      'P&E 省 token 的根本原因是？',
      ['它不调用模型', '省掉执行阶段反复的「思考」', '它不用工具', '它只跑一步'],
      1,
      '一次规划省掉执行阶段反复的边想边做。',
      'plan-execute-impl',
    ),
    q(
      'P&E 与 ReAct 的关系是？',
      ['互斥，只能二选一', '可组合：执行阶段可复用 ReAct 循环', '完全等价', 'P&E 是 ReAct 的子集'],
      1,
      '执行阶段可复用 ReAct，两者可组合（如 L28 混合范式）。',
      'plan-execute-impl',
    ),
    q(
      'P&E 计划的价值还体现在？',
      ['计划是显式可审阅的中间产物', '计划能直接当最终答案', '计划不需要工具', '计划保证不失败'],
      0,
      '显式计划可人工审阅、可控放行，这是 P&E 在可控流程上的优势。',
      'plan-execute-impl',
    ),
  ],
  [
    ['synthesize', '把多步结果汇总成最终答案的收尾步骤'],
    ['可审阅计划', '作为中间产物、可人工检查的步骤列表'],
    ['plan/execute 模板', 'LangGraph 中 P&E 的图化实现'],
  ],
  [
    '把 P&E 和 ReAct 当互斥选择，错过「执行阶段复用 ReAct」的组合收益。',
    '计划生成后不做格式校验就 JSON.parse，格式抖动直接崩。',
  ],
)
