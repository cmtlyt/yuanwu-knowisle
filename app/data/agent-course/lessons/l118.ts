import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 23 ========== */

export const L118 = L(
  'L118',
  23,
  '研究 Agent：带溯源的综述',
  17,
  3,
  ['L49', 'L50'],
  ['research-agent'],
  [
    '理解研究 Agent 的「检索 → 综合 → 溯源」管线',
    '掌握引用与溯源校验的工程做法',
    '认识「深度研究」与「RAG 问答」的本质区别',
  ],
  [
    prose(
      '研究 Agent 不只是 RAG 问答',
      'RAG 问答是「一个问题 → 一段答案」；研究 Agent 是「一个开放主题 → 多轮检索 → 综合 → 一份带引用的综述」。区别在于：研究是多步、多源、需要综合与溯源，且中途要不断「发现新检索词」。',
    ),
    code(
      '深度研究循环（多步检索 + 溯源）',
      '// 研究循环：\nlet sources = []\nlet queries = seedQueries(topic)     // 初始检索词\nwhile (notEnough(sources)) {\n  for (const q of queries) {\n    const hits = await search(q)     // 检索\n    sources.push(...dedupe(hits))\n  }\n  queries = await generateNextQueries(sources) // 据已有发现扩展检索词\n}\n\n// 综合 + 溯源：\nconst report = await synthesize(topic, sources)\n// 每句结论都带 sourceId；溯源校验：claim → 对应 source 是否真的支持\nawait verifyCitations(report, sources)',
      '关键：研究是「迭代检索 + 多源综合 + 逐句溯源」，不是一次性问答。',
    ),
    call(
      'deep',
      '溯源校验是研究 Agent 的命门',
      '大模型会「一本正经地编造引用」。研究 Agent 必须做溯源校验：报告里每条 claim 都标注 sourceId，再校验「这条 claim 是否真的被该 source 支持」。这复用 L65 的验证回路，但验证对象是「引用真实性」。',
    ),
    list('研究 Agent 与 RAG 问答的区别', [
      'RAG：单轮、单一答案；研究：多轮、多源、长报告。',
      'RAG：检索一次；研究：据发现迭代扩展检索词。',
      'RAG：回答即可；研究：必须逐句带引用 + 溯源校验。',
      'RAG：上下文短；研究：需处理长上下文（L52 压缩 / 分层综合）。',
    ]),
    call(
      'warn',
      '幻觉从「编内容」变成「编引用」',
      '研究 Agent 最隐蔽的失败是「引用真实存在的论文、但内容对不上」。单纯「有引用」不够，必须「溯源校验」——验证 claim 与 source 的一致性。',
    ),
  ],
  null,
  [
    q(
      '研究 Agent 与 RAG 问答的本质区别是？',
      ['模型不同', '研究是多步、多源、带溯源的综合', '只是报告更长', '用 Python 写'],
      1,
      '研究强调迭代检索 + 综合 + 溯源。',
      'research-agent',
    ),
    q(
      '研究 Agent 最隐蔽的失败是？',
      ['检索太慢', '编造引用：引用存在但内容对不上', '报告太长', 'token 太贵'],
      1,
      '幻觉从编内容变成编引用。',
      'research-agent',
    ),
    q(
      '溯源校验做的是？',
      ['检查拼写', '验证每条 claim 是否真的被其 source 支持', '压缩上下文', '加速检索'],
      1,
      '验证引用真实性。',
      'research-agent',
    ),
  ],
  [
    ['溯源校验', '验证 claim 与 source 的一致性'],
    ['多步检索', '据已有发现迭代扩展检索词'],
    ['综合', '把多源信息融合成连贯结论'],
  ],
  [
    '把研究 Agent 当成「多问几句的 RAG」，忽略溯源校验。',
    '只要求「有引用」，不验证引用内容是否真的支持结论。',
  ],
)
