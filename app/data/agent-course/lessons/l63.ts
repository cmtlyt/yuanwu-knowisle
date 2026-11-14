import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 10 ========== */

export const L63 = L(
  'L63',
  10,
  'Reflexion 机制：失败经验持久化',
  12,
  2,
  ['L17', 'L18'],
  ['reflexion-mech'],
  [
    '把 Reflexion 从「概念」升级为「可复用的机制组件」',
    '理解失败经验持久化的三种形态',
    '认识 Reflexion 机制与评测信号的关系',
  ],
  [
    prose(
      'Reflexion 是一个机制，不是一个 prompt',
      'L17 讲了 Reflexion 的概念，L18 实现了回路。本课把它抽象成**机制组件**：失败信号 → 反思生成 → 持久化 → 检索注入，四个环节可独立替换。',
    ),
    code(
      'Reflexion 机制组件化',
      'interface ReflexionMechanism {\n  signal(result: unknown): Feedback      // ① 失败信号（评估器）\n  reflect(trajectory: string, fb: Feedback): Promise<string>  // ② 反思生成\n  persist(insight: string): Promise<void>  // ③ 持久化\n  retrieve(task: string): Promise<string[]>  // ④ 检索注入\n}\n\n// 各环节可独立替换：\n//   signal 可用测试/规则/LLM 裁判\n//   persist 可用文件/向量库/DB\n//   retrieve 可用精确匹配/向量检索',
      '组件化后，每个环节都能独立演进与测试，这正是「机制」与「一次性 prompt」的区别。',
    ),
    call(
      'deep',
      '失败经验的三种持久化形态',
      '① 文字反思（L18）：存「为什么失败」的语义，通用但有损。② 结构化字段（L51）：存「什么场景、什么坑」的字段，可精确查。③ 技能代码（L22 Voyager）：存「怎么做成功」的可执行代码，复用性最强。',
    ),
    list('Reflexion 机制的三个前提', [
      '有评估信号：能判断成败（signal）。',
      '反思可执行：反思能指导下一次行动（不是空话）。',
      '记忆能注入：反思真正进入下一轮上下文（retrieve）。',
    ]),
    call(
      'warn',
      '反思质量取决于信号质量',
      '如果评估信号本身不准（把对判成错），反思会「学」到错误经验，反而越改越差。',
    ),
  ],
  null,
  [
    q(
      '「Reflexion 是机制不是 prompt」指什么？',
      ['它不用模型', '失败信号→反思→持久化→注入，四环节可独立替换', '它不持久化', '它只用一次'],
      1,
      '组件化、可独立演进。',
      'reflexion-mech',
    ),
    q(
      '失败经验的三种持久化形态是？',
      ['文字反思、结构化字段、技能代码', '文件、内存、缓存', '增、删、改', '读、写、执行'],
      0,
      '文字、字段、代码。',
      'reflexion-mech',
    ),
    q(
      'Reflexion 机制的三个前提是？',
      ['有 GPU、有数据、有模型', '有评估信号、反思可执行、记忆能注入', '快、稳、省', '增、删、改'],
      1,
      '信号、可执行反思、可注入记忆。',
      'reflexion-mech',
    ),
  ],
  [
    ['机制组件', '可独立替换、可测试的环节组合'],
    ['失败信号', '判断成败的评估输出'],
    ['反思注入', '把反思写进下一轮上下文'],
  ],
  ['评估信号不准仍靠 Reflexion，学到错误经验越改越差。', '把反思写成空话，注入后无帮助还占上下文。'],
)
