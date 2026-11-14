import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L11 = L(
  'L11',
  2,
  '范式总览：为什么需要这么多「玩法」',
  12,
  1,
  ['L08'],
  ['paradigm-taxonomy'],
  [
    '理解「范式」是解决 Agent 循环「怎么转」的可复用套路',
    '把握 12 种范式的分类脉络与一条主线',
    '建立「按问题选范式」而非「崇拜某一种」的心智',
  ],
  [
    prose(
      '范式 = 循环怎么转',
      'Agent 的循环骨架都一样（决定→执行→观测→回填），但「怎么决定、怎么规划、怎么从错误里学」有不同套路。这些套路就是范式（paradigm）。',
    ),
    code(
      '同一个骨架，不同的「决定方式」',
      'while (!done) {\n  const step = decide(context)   // ← 范式差异点\n  const obs = execute(step)\n  context.push({ step, obs })\n}',
      '所有范式共享这个骨架，差别在于 `decide` 怎么工作：是边想边做（ReAct）、先规划（P&E）、还是搜索多条路径（ToT）。',
    ),
    list('12 种范式的三条主线', [
      '基线范式：ReAct（边想边做）、Plan-and-Execute（先规划）、ReWOO（批量规划省往返）。',
      '反思与搜索：Reflexion（从失败学）、ToT / GoT（树/图搜索）、LATS（MCTS）、Voyager（攒技能）。',
      '谱系与分解：AutoGPT 谱系（自主驱动）、Least-to-Most / ADaPT（由易到难）、Self-Consistency（多路径投票）、CoT（思维链基石）。',
    ]),
    call(
      'deep',
      '一条主线：上下文成本 vs 可靠性的权衡',
      '几乎每种范式都是在「花多少 token（上下文成本）」和「结果多可靠」之间取平衡。ReWOO 省 token 但牺牲了边做边看的灵活性；ToT 更可靠但烧 token。理解这个权衡，就能理解为什么「没有银弹」。',
    ),
    call(
      'tip',
      '先记住三个词，后面逐个展开',
      'ReAct 是基线、ToT 是搜索、Reflexion 是学习。剩下的大多是从这三个衍生或组合出来的。',
    ),
  ],
  null,
  [
    q(
      '「范式」本质上是？',
      ['不同的模型', 'Agent 循环「怎么决定下一步」的可复用套路', '不同的编程语言', '不同的工具集'],
      1,
      '范式是循环中「怎么决定」的套路：边想边做 / 先规划 / 搜索多路径等。',
      'paradigm-taxonomy',
    ),
    q(
      '几乎所有范式都在权衡什么？',
      ['代码可读性与性能', '上下文成本与可靠性', '模型大小与速度', '工具数量与内存'],
      1,
      '范式核心是 token（上下文成本）与可靠性的平衡。',
      'paradigm-taxonomy',
    ),
    q(
      '「ReAct 是基线、ToT 是搜索、Reflexion 是学习」——ReWOO 属于哪类？',
      ['反思与搜索', '谱系与分解', '基线范式（批量规划省往返）', '学习类'],
      2,
      'ReWOO 与 ReAct、P&E 同属基线范式，通过批量规划省往返。',
      'paradigm-taxonomy',
    ),
  ],
  [
    ['范式', 'Agent 循环中「怎么决定下一步」的可复用套路'],
    ['基线范式', 'ReAct / Plan-and-Execute / ReWOO 等基础套路'],
    ['上下文成本', '一次推理消耗的 token 量'],
  ],
  [
    '把某一种范式奉为银弹——真实系统常按任务混合多种范式。',
    '只记名字不理解「成本 vs 可靠性」权衡，选型时无从下手。',
  ],
)
