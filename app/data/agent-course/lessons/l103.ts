import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 19 ========== */

export const L103 = L(
  'L103',
  19,
  'Mastra 核心概念：agent / workflow / memory / rag / observability',
  14,
  3,
  ['L93'],
  ['mastra-core'],
  [
    '掌握 Mastra 的核心概念：agent / workflow / memory / rag / observability',
    '理解 Mastra「TS 原生全栈」的定位',
    '认识它与 LangGraph / OpenAI Agents 的差异',
  ],
  [
    prose(
      'TS 原生的一站式框架',
      'Mastra（`@mastra/core`）定位「TypeScript 原生」的 Agent 框架：把 agent（智能体）、workflow（工作流）、memory（记忆）、rag（检索）、observability（可观测）打包成一套 TS 生态。',
    ),
    code(
      'Mastra 五概念',
      'import { Agent } from "@mastra/core/agent"\nimport { Workflow } from "@mastra/core/workflows"\nimport { Memory } from "@mastra/memory"\n\n// ① agent：角色 + 工具\nconst agent = new Agent({ name: "assistant", instructions: "...", model: "gpt-4o-mini" })\n\n// ② workflow：显式步骤编排（类似图，但更「函数式」）\nconst wf = new Workflow({ name: "report" })\n  .step(fetchData).then(analyze).then(writeReport)\n\n// ③ memory：内置持久化记忆（可接向量库）\nconst memory = new Memory({ storage: ... })\n\n// ④ rag：内置 RAG 管线\n// ⑤ observability：内置追踪与可视化',
      '关键：Mastra 不是「库」，而是「一套 TS 原生生态」——agent、workflow、memory、rag、obs 一体。',
    ),
    call(
      'deep',
      '三者定位对比',
      'LangGraph：图编排、状态 agent，可控性强、概念多。OpenAI Agents：轻量多 Agent、handoff，上手快。Mastra：TS 原生全栈，把「构建 Agent 应用」需要的全套（含 memory/rag/obs）打包，追求「开箱即用」。',
    ),
    list('Mastra 的定位', [
      'TS 原生：不用学 Python，全栈 TypeScript。',
      '一站式：agent + workflow + memory + rag + obs 都在一套里。',
      'workflow：比「图」更函数式的编排（step.then(step)）。',
    ]),
    call(
      'warn',
      '全栈打包 = 锁定',
      'Mastra 的「一站式」意味着你依赖它的整套生态，迁移成本高。如果只需要「一个循环」，用 OpenAI Agents 或手写更轻。',
    ),
  ],
  null,
  [
    q(
      'Mastra 的五大核心概念是？',
      [
        'agent、workflow、memory、rag、observability',
        '图、状态、reducer、checkpoint',
        'Agent、run、handoff、guardrail',
        '类、对象、方法、属性',
      ],
      0,
      'agent/workflow/memory/rag/obs。',
      'mastra-core',
    ),
    q(
      'Mastra 的定位是？',
      ['纯图编排库', 'TS 原生全栈（agent+workflow+memory+rag+obs）', '只做 RAG', '只做追踪'],
      1,
      'TS 原生全栈。',
      'mastra-core',
    ),
    q(
      'Mastra 的 workflow 编排风格是？',
      ['图节点', '函数式 step.then(step)', '消息总线', 'while 循环'],
      1,
      '函数式 step 链。',
      'mastra-core',
    ),
  ],
  [
    ['workflow', 'Mastra 的步骤式编排'],
    ['memory', '内置持久化记忆'],
    ['一站式', 'agent+workflow+memory+rag+obs 一体'],
  ],
  ['只需要一个循环却引入 Mastra 全栈，过重且锁定。', '把 Mastra 的 workflow 当图（它是函数式 step 链）。'],
)
