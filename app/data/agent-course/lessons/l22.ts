import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L22 = L(
  'L22',
  2,
  'Voyager：会「攒技能」的终身智能体',
  12,
  2,
  ['L17'],
  ['voyager'],
  [
    '理解 Voyager 的「技能库 + 终身学习」机制',
    '掌握技能生成、验证、复用的闭环',
    '认识 Voyager 在开放式环境探索上的价值',
  ],
  [
    prose(
      '不止从失败学，还把经验变成可复用的技能',
      'Voyager（《我的世界》里自学的智能体）的核心是：每次解决新问题，就**把解题过程沉淀成一个可复用的「技能」**（一段代码），存进技能库。以后遇到类似问题，直接调用技能，而不是从头推理。',
    ),
    code(
      'Voyager 的技能闭环',
      '// ① 尝试：遇到新任务，先查技能库有无现成技能\nconst skill = skillLibrary.findRelevant(task)\nif (skill) return await run(skill.code)\n\n// ② 生成：没有就现写一个技能（代码）\nconst code = await generateSkill(task)\n\n// ③ 验证：在环境里跑，失败则反思修正\nwhile (!(await verify(code))) {\n  code = await refine(code, lastError)\n}\n\n// ④ 入库：验证通过后，把技能（含描述）存进库\nskillLibrary.add({ desc: describe(task), code })',
      '关键差异：Voyager 存的是「可执行代码」而非「文字经验」，且入库前强制验证。',
    ),
    call(
      'deep',
      'Voyager vs Reflexion',
      'Reflexion 存「为什么失败」的文字；Voyager 存「怎么做成功」的**代码**。代码可复用、可组合、可验证，比文字经验的复用性更强；代价是代码生成与验证的成本高，且只适合「技能可被代码化」的环境。',
    ),
    list('Voyager 适合 / 不适合', [
      '适合：开放式环境、任务可被代码化（游戏、API 操作、工具组合）。',
      '不适合：纯对话、无执行环境、技能难以代码化的场景。',
    ]),
    call(
      'warn',
      '技能入库前必须验证',
      '不验证就把代码入库，错误技能会污染后续所有调用它的任务。Voyager 的「验证-修正」循环是质量保证，不是可选项。',
    ),
  ],
  null,
  [
    q(
      'Voyager 与 Reflexion 的关键区别是？',
      [
        'Voyager 不反思',
        'Voyager 存「可执行代码」技能，Reflexion 存「为什么失败」的文字',
        'Voyager 不用模型',
        'Voyager 没有记忆',
      ],
      1,
      'Voyager 沉淀可复用、可验证的代码技能。',
      'voyager',
    ),
    q(
      'Voyager 技能闭环的正确顺序是？',
      ['生成→入库→验证', '查库→生成→验证（失败则修正）→入库', '入库→查库→生成', '验证→入库→生成'],
      1,
      '先查库，没有则生成，验证通过（失败修正）才入库。',
      'voyager',
    ),
    q(
      '为什么技能入库前必须验证？',
      ['为了更快', '错误技能会污染后续所有调用它的任务', '为了省 token', '框架要求'],
      1,
      '验证是质量保证，防止错误技能扩散。',
      'voyager',
    ),
  ],
  [
    ['技能库', '存储「描述 + 可执行代码」的可复用技能集合'],
    ['终身学习', '持续把新经验沉淀为技能、不断扩充能力'],
    ['技能验证', '入库前在环境里跑通、失败则修正的质量保证'],
  ],
  ['跳过验证就把技能入库，错误技能污染后续任务。', '在无执行环境的纯对话场景硬套 Voyager，技能无法代码化。'],
)
