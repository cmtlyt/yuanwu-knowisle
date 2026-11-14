import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L25 = L(
  'L25',
  2,
  '多路径投票：Self-Consistency 提升鲁棒性',
  12,
  2,
  ['L11'],
  ['self-consistency'],
  [
    '理解 Self-Consistency 的「多次采样 + 投票」机制',
    '认识它与 ToT / 多数投票的异同',
    '掌握它「用并行成本换单点鲁棒性」的取舍',
  ],
  [
    prose(
      '一个问题，多解几条，投票定答案',
      'Self-Consistency（自洽性）的机制很简单：对同一个问题**采样多条推理链**，各自得到答案，然后**投票**选出出现最多的答案。它假设「正确答案在多条采样里会反复出现」。',
    ),
    code(
      'Self-Consistency 三步',
      '// ① 采样：同一问题、调高温度，生成 N 条独立推理链\nconst chains = await Promise.all(\n  Array.from({ length: 5 }, () => chainOfThought(problem, { temperature: 0.7 })),\n)\n\n// ② 提取：从每条链里抽出最终答案\nconst answers = chains.map(extractAnswer)   // ["42", "42", "43", "42", "42"]\n\n// ③ 投票：取出现次数最多的答案\nconst winner = mode(answers)                // "42"',
      '温度调高是为了让多条链「各想各的」，避免高度重复；投票取众数。',
    ),
    call(
      'deep',
      'Self-Consistency vs ToT',
      '两者都用「多条路径」，但 ToT 是**搜索**（评估、剪枝、回溯，路径有依赖），Self-Consistency 是**独立采样 + 投票**（路径互不依赖，只比最终答案频率）。后者更简单、天然可并行，代价是「并行成本」——N 条链就是 N 倍 token。',
    ),
    list('适用与边界', [
      '适合：单点推理的鲁棒性提升（数学、逻辑、需要「对/错」明确答案的任务）。',
      '边界：自由文本任务难以「投票」（答案不唯一、无法比众数）。',
      '关键前提：问题有多数正确答案，且采样间有足够多样性。',
    ]),
    call(
      'warn',
      '多样性是前提',
      '如果温度太低，多条链高度重复，投票就失去意义；如果问题本身没有「多数正确答案」（如开放式创作），投票也无效。',
    ),
  ],
  null,
  [
    q(
      'Self-Consistency 的机制是？',
      ['单次推理', '多次采样多条推理链 + 投票取众数', '树搜索剪枝', '失败反思'],
      1,
      '采样 N 条链、提取答案、投票取众数。',
      'self-consistency',
    ),
    q(
      'Self-Consistency 相比 ToT 的关键差异是？',
      [
        'ToT 更简单',
        'Self-Consistency 是独立采样+投票，ToT 是带评估剪枝的搜索',
        'Self-Consistency 不能并行',
        '无差异',
      ],
      1,
      '一个独立投票、一个搜索剪枝。',
      'self-consistency',
    ),
    q(
      'Self-Consistency 失效的场景是？',
      ['数学题', '开放式创作（答案不唯一、无法比众数）', '逻辑题', '代码题'],
      1,
      '自由文本任务答案不唯一，投票无意义。',
      'self-consistency',
    ),
  ],
  [
    ['采样多样性', '调高温度让多条链「各想各的」，避免重复'],
    ['众数投票', '取出现次数最多的答案作为最终结果'],
    ['并行成本', 'N 条链带来的 N 倍 token 与延迟'],
  ],
  ['温度太低导致多条链高度重复，投票退化为单次推理。', '对开放式创作任务硬做投票，答案不唯一无法比众数。'],
)
