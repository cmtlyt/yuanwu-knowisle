import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L139 = L(
  'L139',
  27,
  '实战 Capstone B：从零接入链路追踪 + 评测 + 溯源质量校验',
  22,
  4,
  ['L138'],
  ['cap-b-trace'],
  [
    '从零为研究型 Agent 接入链路追踪',
    '从零实现「溯源质量 / 引用准确性」的评测',
    '理解研究型 Agent 评测与执行型评测的区别',
  ],
  [
    prose(
      '研究型 Agent 评测「溯源」而非「动作」',
      'Capstone B 的评测核心是「溯源质量」：引用是否真实存在？引用内容是否真的支持结论？有没有编造？同时用链路追踪记录「推理 → 检索 → 综合」全过程。不复用 L75/L81，思路一致但切面不同。',
    ),
    code(
      '溯源质量评测（不复用 L81）',
      '// ① 引用存在性：报告里每个 sourceId 是否真的在证据库里\nfunction citationExists(report, evidenceStore) {\n  return report.citations.every(c => evidenceStore.has(c.sourceId))\n}\n\n// ② 引用准确性：每条 claim 是否真的被其 source 支持（LLM-as-Judge，L82 思路）\nasync function citationSupported(claim, sourceText) {\n  const judge = await llmAsJudge(`\n    结论: ${claim}\n    证据: ${sourceText}\n    该证据是否支持此结论？(支持/部分支持/不支持)`)\n  return judge !== "不支持"\n}\n\n// ③ 溯源得分 = 存在且支持的引用 / 总引用\nasync function citationScore(report) {\n  let ok = 0\n  for (const c of report.citations) {\n    if (citationExists(c) && await citationSupported(c.claim, c.sourceText)) ok++\n  }\n  return ok / report.citations.length\n}',
      '关键：溯源评测分两层——「引用存在」和「引用支持」，后者要用 LLM-as-Judge。',
    ),
    call(
      'deep',
      '溯源评测的「两层」缺一不可',
      '第一层「引用存在」是确定性的：sourceId 在不在库里，一查便知。第二层「引用支持」是模糊的：需要判断「证据是否真的支持结论」，这必须用 LLM-as-Judge（L82）。只做第一层，会漏掉「引用存在但内容对不上」的隐蔽幻觉。',
    ),
    list('追踪 + 评测验收点', [
      '追踪覆盖「推理 → 检索 → 综合」全过程，可回放。',
      '引用存在性：100% 的 sourceId 都在证据库里。',
      '引用准确性：LLM-as-Judge 逐条判断 claim 是否被 source 支持。',
      '溯源得分可量化，能据分数发现「编造引用」。',
    ]),
    call(
      'warn',
      '只查「引用存在」不够',
      '模型最会「引用真实论文但写错内容」。只验证「这个 sourceId 存在」会漏掉最隐蔽的幻觉。必须做第二层「引用支持」判断，才能真正守住研究型 Agent 的可信度。',
    ),
  ],
  null,
  [
    q(
      '研究型 Agent 评测的核心是？',
      ['动作正确率', '溯源质量（引用存在 + 引用支持）', '响应速度', 'UI'],
      1,
      '研究型看溯源。',
      'cap-b-trace',
    ),
    q(
      '溯源评测的两层是？',
      ['存在性 + 支持性', '速度 + 成本', '长度 + 数量', '格式 + 排版'],
      1,
      '引用存在 + 引用支持。',
      'cap-b-trace',
    ),
    q(
      '为什么只查「引用存在」不够？',
      ['太慢', '会漏掉「引用存在但内容对不上」的隐蔽幻觉', '太贵', '没必要'],
      1,
      '需要第二层支持性判断。',
      'cap-b-trace',
    ),
  ],
  [
    ['引用存在性', 'sourceId 是否在证据库中'],
    ['引用支持性', '证据是否真的支持结论（LLM-as-Judge）'],
    ['溯源得分', '存在且支持的引用 / 总引用'],
  ],
  ['只验证引用存在，漏掉「引用存在但内容对不上」。', '研究型 Agent 用「动作正确率」这类执行型指标来评测。'],
)
