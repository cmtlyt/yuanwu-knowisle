import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L23 = L(
  'L23',
  2,
  '自主智能体谱系：AutoGPT / BabyAGI / Generative Agents',
  12,
  2,
  ['L12'],
  ['autogpt-lineage'],
  [
    '了解自主智能体谱系的三位代表及其机制',
    '理解「目标自驱动循环」的核心与风险',
    '认识为何纯自主 Agent 风险高、可控性低',
  ],
  [
    prose(
      '「自主」到极致的谱系',
      'AutoGPT、BabyAGI、Generative Agents 都试图让 Agent 在给定大目标后**长期自主运行**，自己拆目标、自己调度、自己推进。它们开启了「自主智能体」的想象，也暴露了纯自主的风险。',
    ),
    list('三位代表', [
      'AutoGPT：给定一个总目标，自己拆解成子任务、自己调度工具、自己循环推进，追求「全自主」。',
      'BabyAGI：任务队列 + 执行 + 结果反馈的最小自主循环，强调「任务优先级」与「结果驱动的任务生成」。',
      'Generative Agents：用「记忆 + 反思 + 计划」让多个虚拟角色自主互动，是「多 Agent 社会」的开山之作。',
    ]),
    code(
      '目标自驱动循环的骨架',
      'tasks = decompose(goal)          // 拆解大目标\nwhile (tasks.notEmpty()) {\n  task = tasks.highestPriority()    // 取最高优先级任务\n  result = execute(task)            // 执行\n  tasks.push(...deriveNewTasks(result))  // 结果派生新任务\n  tasks = tasks.dedupe().sortByPriority()\n}',
      '核心：任务队列自增长、优先级自排序、结果驱动新任务。风险也在「自增长」。',
    ),
    call(
      'warn',
      '纯自主的高风险',
      '没有人工闸门的自主循环会：① 无限烧 token；② 在错误方向上越走越远；③ 执行危险动作（发邮件、扣款）。这也是本课程反复强调「人在回路」（L71）与「工具最小权限」（L85）的原因。',
    ),
    call(
      'tip',
      '吸取思想，而非照搬',
      '谱系的价值是「任务拆解 + 优先级 + 结果驱动」的思想。生产环境几乎不用「完全自主」，而是加约束：步数上限、人工确认、工具白名单。',
    ),
  ],
  null,
  [
    q(
      'BabyAGI 的最小自主循环核心是？',
      ['树搜索', '任务队列 + 执行 + 结果反馈（结果派生新任务）', '技能库', '多路径投票'],
      1,
      'BabyAGI 强调任务队列、优先级、结果驱动新任务。',
      'autogpt-lineage',
    ),
    q(
      'Generative Agents 的开创性在于？',
      [
        '第一个用 GPU 的 Agent',
        '记忆 + 反思 + 计划让虚拟角色自主互动（多 Agent 社会）',
        '第一个用 Python 的 Agent',
        '第一个能编码的 Agent',
      ],
      1,
      '它开创了「多 Agent 社会」的研究方向。',
      'autogpt-lineage',
    ),
    q(
      '纯自主 Agent 最大的风险是？',
      ['太慢', '无限烧 token、方向失控、执行危险动作', '代码太长', '不兼容'],
      1,
      '无人工闸门的自主循环有成本、方向、安全三重风险。',
      'autogpt-lineage',
    ),
  ],
  [
    ['自主智能体', '给定大目标后长期自主运行、自拆自调度的 Agent'],
    ['任务队列', '自增长、按优先级排序的任务池'],
    ['结果驱动', '执行结果派生新任务、推进循环'],
  ],
  [
    '把「完全自主」当生产目标，忽视成本、方向与安全风险。',
    '只见谱系的噱头，不见「拆解 + 优先级 + 结果驱动」的可复用思想。',
  ],
)
