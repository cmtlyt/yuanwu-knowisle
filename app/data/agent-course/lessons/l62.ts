import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 9 ========== */

export const L62 = withKind(
  L(
    'L62',
    9,
    'ADaPT：按难度自适应抽象层级',
    3,
    ['L24', 'L61'],
    ['adapt'],
    [
      '理解 ADaPT 的「按任务难度自适应抽象层级」机制',
      '掌握「难任务升抽象、易任务直接做」的决策',
      '认识 ADaPT 与 Least-to-Most 的分工',
    ],
    `
### 难的任务，先站高一点看

ADaPT（Adaptive-Plan-to-Task）的核心：任务难度不同，需要的「抽象层级」不同。简单任务直接执行即可；复杂任务先提升到高层规划、再逐层细化。它反对「一刀切」地用同一种粒度处理所有任务。

\`\`\` title="ADaPT 的分层决策" note="关键：不是所有任务都值得「完整规划」，难度决定「该站在哪一层」。"
// ① 评估任务难度，决定起始抽象层级
const level = assessDifficulty(task)
//   easy   → 直接执行
//   medium → 简单规划后执行
//   hard   → 高层规划 → 逐层细化 → 执行

// ② 按层级处理
if (level === "easy") return await executor.run(task)
if (level === "hard") {
  const outline = await highLevelPlan(task)       // 高层：粗粒度大纲
  const detail = await refine(outline)             // 中层：逐层细化
  return await executor.run(detail)                // 低层：具体执行
}
\`\`\`

:::deep

### ADaPT vs Least-to-Most

Least-to-Most 关注「问题序列」——把难题拆成由易到难的子问题序列；ADaPT 关注「抽象层级」——按难度决定规划粒度。两者互补：一个管「怎么排子问题」，一个管「用什么粒度规划」。

:::

### ADaPT 的三个层级

- 低层（执行）：简单任务直接做，不规划。
- 中层（规划）：中等任务先列步骤再执行。
- 高层（元规划）：复杂任务先定大纲，再逐层细化。

:::warn

### 难度评估是前提

ADaPT 依赖「难度评估」来判断该站哪层。如果难度评估不准（把难任务当简单直接执行），ADaPT 的优势就没了。

:::

`,
    null,
    [
      {
        text: 'ADaPT 的核心机制是？',
        options: ['统一粒度', '按任务难度自适应抽象层级', '只做规划', '只做执行'],
        answer: 1,
        explain: '按难度自适应抽象层级。',
        concept: 'adapt',
      },
      {
        text: 'ADaPT 的三个层级是？',
        options: ['高、中、低（元规划/规划/执行）', '快、慢、中', '大、小、中', '深、浅、中'],
        answer: 0,
        explain: '元规划、规划、执行。',
        concept: 'adapt',
      },
      {
        text: 'ADaPT 与 Least-to-Most 的关系是？',
        options: ['互斥', '互补：一个管抽象层级，一个管问题序列', '等同', '无关'],
        answer: 1,
        explain: '一个管规划粒度，一个管子问题排序。',
        concept: 'adapt',
      },
    ],
    [
      ['ADaPT', '按任务难度自适应抽象层级的规划方式'],
      ['元规划', '复杂任务先定粗粒度大纲'],
      ['难度评估', '判断任务该站哪个抽象层级的依据'],
    ],
    ['难度评估不准，把难任务当简单任务直接执行。', '对简单任务也做完整多层规划，徒增开销。'],
  ),
  'practice',
)
