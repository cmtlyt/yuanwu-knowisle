import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 8 ========== */

export const L54 = L(
  'L54',
  8,
  'CoT 与零样本推理链',
  12,
  2,
  ['L26'],
  ['cot-engineering'],
  [
    '把 CoT 从「技巧」升级为「工程化组件」',
    '掌握零样本 CoT 的工程写法与边界',
    '理解何时值得显式 CoT、何时纯浪费',
  ],
  [
    prose(
      '把 CoT 做成可复用的工程组件',
      'L26 讲了 CoT 的原理，本课讲工程化：怎么把「逐步推理」稳定地嵌进 Agent 流程，而不是靠 prompt 里的几句话碰运气。',
    ),
    code(
      '工程化 CoT 的三种形态',
      '// ① 显式分步：把「想」和「答」拆成两步调用\nconst reasoning = await client.chat([{ role: "user", content: "问题：" + q + "。先分析，不急着给答案。" }])\nconst answer = await client.chat([\n  { role: "assistant", content: reasoning },\n  { role: "user", content: "基于以上分析，给出最终答案。" },\n])\n\n// ② 结构化 CoT：让模型输出 JSON 的「步骤 + 结论」\nconst cot = await client.chat([{ role: "user", content: "输出 JSON：{ steps: [...], conclusion }" }])\n\n// ③ 零样本 CoT：一句话触发逐步推理\nconst ans = await client.chat([{ role: "user", content: "问题：" + q + "。让我们一步一步想。" }])',
      '三种形态的取舍：① 最可控但两次调用；② 结构化可解析；③ 最省事但不可控。',
    ),
    call(
      'deep',
      'CoT 什么时候值得',
      'CoT 对「需要多步推理」的任务（数学、逻辑、复杂决策）收益大；对「事实问答、简单生成」纯浪费 token。工程判断：问题越需要「中间步骤」，CoT 越值。',
    ),
    list('CoT 工程化的三个注意点', [
      '分离「推理」与「答案」：推理可丢弃，答案要保留。',
      '控制推理长度：CoT 过长会稀释关键信息。',
      '可观测：把推理步骤记进 trace，便于调试（呼应 L05）。',
    ]),
    call(
      'warn',
      '别迷信「一步一步想」',
      '对简单问题强行 CoT，不仅浪费，还可能出现「想得越多错得越多」的现象。CoT 是工具，不是仪式。',
    ),
  ],
  null,
  [
    q(
      '工程化 CoT 中「分离推理与答案」的目的是？',
      ['代码更好看', '推理可丢弃，答案要保留，控制上下文', '更快', '省内存'],
      1,
      '推理与答案分离，推理不进最终结果。',
      'cot-engineering',
    ),
    q(
      'CoT 最值得用的任务是？',
      ['事实问答', '需要多步推理的任务（数学/逻辑/复杂决策）', '简单生成', '格式转换'],
      1,
      '多步推理任务 CoT 收益大。',
      'cot-engineering',
    ),
    q(
      '对简单问题强行 CoT 的后果是？',
      ['更准确', '浪费 token，甚至想得越多错得越多', '更快', '无影响'],
      1,
      'CoT 是工具不是仪式。',
      'cot-engineering',
    ),
  ],
  [
    ['显式 CoT', '把推理与答案拆成两步调用'],
    ['结构化 CoT', '让模型输出可解析的步骤+结论结构'],
    ['零样本 CoT', '一句话触发逐步推理'],
  ],
  ['对简单问题强行 CoT，浪费且可能更错。', '把推理和答案混在一起，无法丢弃中间步骤。'],
)
