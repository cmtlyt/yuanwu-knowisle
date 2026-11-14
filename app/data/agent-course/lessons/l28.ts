import { L } from '../../course-builders.ts'

/* ========== Stage 3 ========== */

export const L28 = L(
  'L28',
  3,
  '混合范式实战：Plan + ReAct + Reflexion 怎么串',
  14,
  2,
  ['L27', 'L15', 'L18'],
  ['hybrid-paradigm'],
  [
    '理解范式如何组合成更健壮的系统',
    '掌握「P&E 骨架 + ReAct 执行 + Reflexion 纠错」的串法',
    '知道混合的收益与复杂度代价',
  ],
  `
### 三种范式各取所长

真实系统很少只用一种范式。经典组合：P&E 做**骨架**（先列计划、流程可控）、ReAct 做**执行**（边做边看、灵活应变）、Reflexion 做**纠错**（失败后反思重试）。

\`\`\` title="混合范式的编排" note="注意职责分离：plan 管「做什么」、reactLoop 管「怎么做」、reflect 管「做错了怎么办」。"
async function hybridAgent(client, memory, task) {
  // ① P&E：先规划
  let plan = await plan(client, task)

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const results = []
      // ② ReAct：逐步骤执行（边做边看）
      for (const step of plan) {
        results.push(await reactLoop(client, step, { memory }))
      }
      // ③ 校验：结果是否满足评估
      const ok = evaluate(results)
      if (ok) return synthesize(results)

      // ④ Reflexion：失败则反思并重规划
      const insight = await reflect(results, feedback)
      await memory.add(insight)
      plan = await replan(client, plan, insight)  // 重规划（L61）
    } catch (e) {
      await memory.add({ task, insight: "步骤失败：" + e.message })
    }
  }
  throw new Error("混合 Agent 多次尝试失败")
}
\`\`\`

:::deep

### 混合的收益

单一范式各有盲区：P&E 僵化、ReAct 贵、Reflexion 依赖评估信号。组合后：P&E 让流程可控，ReAct 补灵活性，Reflexion 补纠错，整体健壮性远超任一单范式。

:::

### 混合的代价

- 复杂度：三套机制要协调（计划、执行、反思的状态管理）。
- 成本：每一层都是模型调用，叠加后 token 更高。
- 调试：出问题时要知道是「计划错」还是「执行错」还是「反思错」。

:::warn

### 按需混合，不要堆砌

混合的前提是「每层都有明确职责且真的需要」。如果一个任务 ReAct 就够，硬加 P&E 和 Reflexion 只是徒增复杂度。

:::

`,
  null,
  [
    {
      text: '经典混合组合中，P&E / ReAct / Reflexion 各司什么职？',
      options: ['都不重要', 'P&E 做骨架、ReAct 做执行、Reflexion 做纠错', '都做执行', '都做反思'],
      answer: 1,
      explain: 'P&E 管做什么、ReAct 管怎么做、Reflexion 管做错了怎么办。',
      concept: 'hybrid-paradigm',
    },
    {
      text: '混合范式的代价是？',
      options: ['更简单', '复杂度、成本、调试难度都上升', '更便宜', '不需要模型'],
      answer: 1,
      explain: '三套机制协调，复杂度与成本都更高。',
      concept: 'hybrid-paradigm',
    },
    {
      text: '混合范式的正确使用原则是？',
      options: ['堆越多越好', '按需混合，每层有明确职责且真的需要', '只用一种', '不用反思'],
      answer: 1,
      explain: '按需混合，避免堆砌。',
      concept: 'hybrid-paradigm',
    },
  ],
  [
    ['混合范式', '组合多种范式、各取所长的编排方式'],
    ['职责分离', '计划 / 执行 / 纠错各有独立模块'],
    ['重规划', '失败反思后修正计划再执行'],
  ],
  ['为混合而混合，把不需要的范式硬塞进系统，徒增复杂度。', '混合后出问题分不清是计划错、执行错还是反思错。'],
)
