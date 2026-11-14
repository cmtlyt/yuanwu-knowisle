import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 8 ========== */

export const L58 = L(
  'L58',
  8,
  'Scratchpad：让 Agent「写下来」再思考',
  12,
  2,
  ['L54'],
  ['scratchpad'],
  [
    '理解 Scratchpad 的「草稿区」机制与价值',
    '掌握「先写草稿、再给正式答案」的工程实现',
    '认识 Scratchpad 与 CoT 的联系与区别',
  ],
  [
    prose(
      '给模型一块「草稿纸」',
      'Scratchpad（草稿区）是给模型一个**明确的工作区**，让它先在草稿区写下思路与中间结果，再基于草稿给正式答案。它把 CoT 的「逐步想」显式化成了一个可管理、可清理的空间。',
    ),
    code(
      'Scratchpad 的两阶段',
      'const scratch = await client.chat([\n  { role: "system", content: "你有一个草稿区。先在 <scratch> 标签内写下思路、计算、中间结论，然后在 <answer> 标签内给正式答案。" },\n  { role: "user", content: problem },\n])\n\nconst draft = extract(scratch, "<scratch>", "</scratch>")   // 草稿：可丢弃\nconst answer = extract(scratch, "<answer>", "</answer>")   // 答案：要保留\n\n// 草稿的价值：\n// ① 可观测：draft 写进 trace，便于调试\n// ② 可清理：draft 不进入最终上下文，省 token\n// ③ 可约束：草稿区限制了「想到哪写到哪」，避免污染答案',
      '关键：草稿区与答案区分离，草稿可丢弃、可观测，答案干净可控。',
    ),
    call(
      'deep',
      'Scratchpad vs CoT',
      'CoT 是「先想再答」的技巧；Scratchpad 是它的**工程化容器**——给「想」一个明确边界（标签、字段、可清理）。它尤其适合多轮任务：每轮把草稿清掉、只保留结论，避免上下文被草稿塞满。',
    ),
    list('Scratchpad 的三个收益', [
      '可观测：草稿进 trace，能回看模型「怎么想的」。',
      '省上下文：草稿不长期保留，避免累积膨胀。',
      '边界清晰：草稿与答案分离，不互相污染。',
    ]),
    call(
      'warn',
      '草稿也要防注入',
      '草稿区的内容可能被外部输入影响（如用户消息里塞了伪造的「草稿结论」）。对草稿要像对待不可信输入一样，别让它绕过你的校验直接成为决策依据。',
    ),
  ],
  null,
  [
    q(
      'Scratchpad 与 CoT 的关系是？',
      [
        '完全无关',
        'Scratchpad 是 CoT 的工程化容器（明确边界、可清理）',
        'Scratchpad 不用模型',
        'CoT 是 Scratchpad 的子集',
      ],
      1,
      'Scratchpad 给「想」一个明确边界。',
      'scratchpad',
    ),
    q(
      'Scratchpad 的三个收益是？',
      ['快、稳、省', '可观测、省上下文、边界清晰', '增、删、改', '读、写、执行'],
      1,
      '可观测、省上下文、边界清晰。',
      'scratchpad',
    ),
    q(
      '草稿区的安全注意点是？',
      ['无需注意', '草稿可能被外部输入污染，别让它绕过校验成为决策依据', '草稿不能删除', '草稿要加密'],
      1,
      '草稿按不可信输入对待。',
      'scratchpad',
    ),
  ],
  [
    ['Scratchpad', '给模型的明确草稿工作区'],
    ['草稿区/答案区分离', '草稿可丢弃、答案干净可控'],
    ['草稿清理', '每轮清掉草稿、只保留结论'],
  ],
  ['让草稿无限累积，上下文被中间过程塞满。', '信任草稿区内容，忽略外部注入污染。'],
)
