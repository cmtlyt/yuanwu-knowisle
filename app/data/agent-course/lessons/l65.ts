import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 10 ========== */

export const L65 = L(
  'L65',
  10,
  '实战：实现 Self-Critique + 验证回路闭环',
  20,
  4,
  ['L64'],
  ['verification-loop'],
  [
    '用 TS 实现「生成→批评→修正→验证」闭环',
    '把验证回路（可执行校验）与自我批评结合',
    '对照 @openai/guardrails 的生成/评审护栏',
  ],
  [
    prose(
      '批评要有「硬验证」兜底',
      '纯 LLM 自我批评是「软」的（模型自己说好不算数）。验证回路加上**可执行校验**（规则 / 测试 / 类型检查），让「对不对」有硬标准。',
    ),
    code(
      'Self-Critique + 验证闭环',
      'async function critiqueLoop(generate, critique, verify, task, { maxRounds = 3 } = {}) {\n  let output = await generate(task)                 // ① 生成\n  for (let i = 0; i < maxRounds; i++) {\n    const check = await verify(output)              // ② 硬验证（规则/测试）\n    if (check.ok) return output                     // 通过即返回\n\n    const feedback = await critique(output, check.reasons)  // ③ 批评（带验证失败原因）\n    output = await generate(task, { feedback })     // ④ 修正后重新生成\n  }\n  throw new Error("多轮批评后仍未通过验证")\n}\n\n// verify 示例：回答必须满足的硬约束\nasync function verify(answer: string) {\n  if (answer.length < 10) return { ok: false, reasons: ["回答过短"] }\n  if (/我(不知道|不确定)/.test(answer)) return { ok: false, reasons: ["包含回避表述"] }\n  return { ok: true }\n}',
      '关键：`verify` 是**可执行**的硬校验（不是模型打分），批评以验证失败原因为依据。',
    ),
    call(
      'deep',
      '软批评 + 硬验证',
      '自我批评（软）擅长「发现语义问题」；验证回路（硬）擅长「判定硬性对错」。两者结合：硬验证先给出「确定错在哪」，软批评再据此改进，比单用任何一种都强。',
    ),
    call(
      'tip',
      '框架对照：@openai/guardrails',
      '`@openai/guardrails` 提供生成/评审护栏：生成阶段用 guardrail 拦截，评审阶段用 check 校验输出。它把你手写的 `verify` 封装成可声明的护栏规则（详见 L102）。',
    ),
    list('验证回路的三种硬校验', [
      '规则校验：长度、格式、关键词（如本课 verify）。',
      '类型/测试校验：生成的代码能否编译、测试能否通过。',
      '事实校验：引用是否真实存在、数值是否合理。',
    ]),
  ],
  null,
  [
    q(
      'Self-Critique + 验证闭环相比纯自我批评，多了什么？',
      ['更慢', '可执行硬校验（verify），让对错有硬标准', '更贵', '更多模型'],
      1,
      '硬验证兜底，对错有硬标准。',
      'verification-loop',
    ),
    q(
      '`verify` 的角色是？',
      ['模型打分', '可执行硬校验（规则/测试/类型检查）', '美化输出', '存数据'],
      1,
      '可执行校验，不是模型打分。',
      'verification-loop',
    ),
    q(
      '验证回路的三种硬校验是？',
      ['规则、类型/测试、事实', '快、稳、省', '增、删、改', '读、写、执行'],
      0,
      '规则、类型测试、事实校验。',
      'verification-loop',
    ),
  ],
  [
    ['验证回路', '用可执行校验判断对错的闭环'],
    ['硬校验', '规则/测试/事实等可程序化判定的校验'],
    ['软批评', '模型对语义问题的审查'],
  ],
  ['只靠模型自我批评（软），无硬校验，对错不可靠。', '验证失败后不把失败原因喂给批评，修正无从下手。'],
)
