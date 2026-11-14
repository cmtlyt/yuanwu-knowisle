import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 9 ========== */

export const L59 = L(
  'L59',
  9,
  '任务分解与计划执行分离：从拆解技巧到工程结构',
  12,
  2,
  ['L14'],
  ['task-decomposition'],
  [
    '理解「任务分解」与「计划执行分离」的关系',
    '掌握子目标表示与 plan/execute 分离的工程结构',
    '认识「分解粒度」对计划质量的影响',
  ],
  [
    prose(
      '分解是技巧，分离是结构',
      '任务分解（把大任务拆成子任务）是「技巧」；计划执行分离（plan 与 execute 是独立组件）是「工程结构」。前者决定计划好不好，后者决定计划能不能独立演进。',
    ),
    code(
      '子目标表示 + plan/execute 分离',
      '// 子目标表示：每个子任务有状态、依赖、产出\ninterface SubGoal {\n  id: string\n  desc: string\n  status: "pending" | "doing" | "done" | "failed"\n  dependsOn: string[]       // 依赖其他子目标\n  output?: string           // 产出，供后续子目标使用\n}\n\n// plan 与 execute 分离：两个独立组件\nconst plan = await planner.decompose(goal)   // ① 规划组件：产出 SubGoal[]\nfor (const sg of topologicalOrder(plan)) {   // ② 执行组件：按依赖拓扑序执行\n  sg.output = await executor.run(sg, collectOutputs(sg.dependsOn))\n}',
      '关键：planner 只负责「拆」，executor 只负责「做」，两者通过 SubGoal 结构解耦。',
    ),
    call(
      'deep',
      '为什么分离',
      '分离后，plan 可以换（换更好的拆解策略）、execute 可以换（换执行范式）、两者独立测试、独立演进。这也是 P&E 引擎（L60）与动态重规划（L61）的地基。',
    ),
    list('分解的三个粒度陷阱', [
      '太粗：子任务仍是「大任务」，没拆到位。',
      '太细：子任务碎成琐碎步骤，计划冗长难维护。',
      '无依赖：子任务之间没有依赖关系标注，执行顺序混乱。',
    ]),
    call(
      'warn',
      '依赖标注不可省',
      '不标依赖，执行组件只能盲目串行（慢）或盲目并行（错）。依赖图是 plan/execute 分离的隐形骨架。',
    ),
  ],
  null,
  [
    q(
      '「任务分解」与「计划执行分离」的关系是？',
      ['同一回事', '分解是技巧，分离是工程结构', '分离是技巧', '互不相关'],
      1,
      '一个管计划质量，一个管结构。',
      'task-decomposition',
    ),
    q(
      '子目标表示应包含？',
      ['只含描述', '状态、依赖（dependsOn）、产出（output）', '只含 id', '只含时间'],
      1,
      '子目标要有状态、依赖、产出。',
      'task-decomposition',
    ),
    q(
      '不标依赖关系的后果是？',
      ['更灵活', '执行只能盲目串行或盲目并行，要么慢要么错', '更快', '更省 token'],
      1,
      '依赖图是执行顺序的骨架。',
      'task-decomposition',
    ),
  ],
  [
    ['子目标', '拆解出的、带状态与依赖的子任务'],
    ['拓扑序', '按依赖关系排列的执行顺序'],
    ['plan/execute 分离', '规划与执行作为独立组件解耦'],
  ],
  ['分解粒度不当，计划冗长或没拆到位。', '不标依赖，执行顺序混乱。'],
)
