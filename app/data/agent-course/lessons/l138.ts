import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L138 = L(
  'L138',
  27,
  '实战 Capstone B：从零实现多 Agent 研究小组（研究员 / 评审 / 合成）',
  22,
  4,
  ['L137'],
  ['cap-b-multi'],
  [
    '从零实现「研究员 / 评审 / 合成」多 Agent 研究小组',
    '掌握角色分工、交叉评审、逐段合成的从零实现',
    '理解研究型多 Agent 的「质量对抗」机制',
  ],
  [
    prose(
      '研究小组：三个角色互为质量把关',
      'Capstone B 的多 Agent 是「研究员 / 评审 / 合成」三角色：研究员检索并草拟、评审挑错（尤其是引用错误）、合成把通过评审的段落拼成报告。不复用 L68/L130，思路一致但职责切面不同。',
    ),
    code(
      '从零实现研究小组（不复用 L68/L130）',
      'const researcher = role("研究员", "检索证据 + 草拟段落（带引用）")\nconst reviewer   = role("评审", "挑错：引用是否属实？逻辑是否成立？")\nconst synthesizer = role("合成", "把通过评审的段落拼成连贯报告")\n\nasync function research(topic) {\n  const outline = await generateOutline(topic)          // ① 定大纲\n  const sections = []\n  for (const sec of outline) {\n    const draft = await researcher.run(sec)             // ② 研究员草拟\n    const review = await reviewer.review(draft)          // ③ 评审挑错\n    if (review.rejected) {\n      sections.push(await researcher.revise(draft, review.feedback))  // 退回重写\n    } else {\n      sections.push(draft)\n    }\n  }\n  return synthesizer.run(sections)                       // ④ 合成终稿\n}',
      '关键：评审是「质量对抗」——专门负责挑错，尤其是引用真实性。',
    ),
    call(
      'deep',
      '研究型多 Agent 的核心是「对抗式评审」',
      '与 Capstone A 的「诊断/执行」分工（权限隔离）不同，研究型多 Agent 的核心是「质量对抗」：研究员负责「产生」，评审负责「挑战」。评审的存在让「编造的引用」「站不住的逻辑」在进入终稿前被拦下。',
    ),
    list('研究小组的验收点', [
      '研究员草拟段落时，每句带引用。',
      '评审能识别「引用不属实」和「逻辑不成立」。',
      '评审退回的段落，研究员能据反馈重写。',
      '合成把通过评审的段落拼成连贯、无重复的报告。',
    ]),
    call(
      'warn',
      '评审不能「走过场」',
      '如果评审只会说「写得好」，就没有起到质量对抗的作用。评审要有「挑错」的明确指令（尤其「逐条核对引用是否支持结论」），并且对不通过的段落给出具体反馈，而不是笼统打回。',
    ),
  ],
  null,
  [
    q(
      '研究小组的三个角色是？',
      ['前端/后端/运维', '研究员 / 评审 / 合成', '诊断/执行/汇总', '读/写/删'],
      1,
      '产生/挑战/合成。',
      'cap-b-multi',
    ),
    q(
      '研究型多 Agent 的核心机制是？',
      ['权限隔离', '对抗式评审（评审专门挑错）', '越快越好', '越多越好'],
      1,
      '质量对抗。',
      'cap-b-multi',
    ),
    q(
      '评审最关键的指令是？',
      ['写得更长', '逐条核对引用是否支持结论', '用更多模型', '加速'],
      1,
      '挑引用错误。',
      'cap-b-multi',
    ),
  ],
  [
    ['研究员', '检索证据并草拟段落'],
    ['评审', '挑错（引用/逻辑）的对抗角色'],
    ['合成', '拼装通过评审的段落'],
  ],
  ['评审走过场，只会说「写得好」，不起质量对抗作用。', '评审打回时不给具体反馈，研究员无法据之重写。'],
)
