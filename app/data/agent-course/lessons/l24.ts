import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L24 = withKind(
  L(
    'L24',
    2,
    '分解与自适应：Least-to-Most 与 ADaPT',
    2,
    ['L14'],
    ['least-to-most'],
    [
      '理解 Least-to-Most 的「由易到难」分解策略',
      '理解 ADaPT 的「按难度自适应抽象层级」',
      '认识两者在复合问题分解上的价值',
    ],
    `
### 把难题拆成「先易后难」的台阶

Least-to-Most 的洞察是：直接解难题容易失败，但**先解一个简单子问题，再用它的解去解更难的问题**，成功率更高。它分两阶段：分解（decompose）与逐阶求解（solve in order）。

\`\`\` title="Least-to-Most 两阶段" note="经典例子：先学「反转单词」，再学「反转句子」，最后解「反转句子但保持词序」。"
// 阶段一：把难题拆成「由易到难」的子问题序列
subProblems = decompose(problem)
//   ["反转一个单词", "反转一句话", "反转一句话但保持每个单词内部顺序"]

// 阶段二：逐个求解，每个子问题的解喂给下一个
context = []
for (const sub of subProblems) {
  const ans = await solve(sub, context)   // 前面的解作为上下文
  context.push({ sub, ans })
}
\`\`\`

:::deep

### ADaPT：抽象层级自适应

ADaPT（Adaptive-Plan-to-Task）的洞察是：任务难度不同，需要的「抽象层级」也不同。简单任务直接执行，复杂任务先提升到高层规划、再逐层细化。它把「分解技巧」和「工程结构」合并——按难度动态决定该用哪一层抽象。

:::

### 两者对比

- Least-to-Most：关注「问题序列」——由易到难排列子问题。
- ADaPT：关注「抽象层级」——按任务难度动态升降规划粒度。
- 共同点：都反对「一刀切」地用同一种粒度处理所有任务。

:::warn

### 分解顺序很关键

Least-to-Most 要求子问题「由易到难」且「每个是下一个的台阶」。如果分解出来的子问题没有递进关系，就退化成普通的多步求解。

:::

`,
    null,
    [
      {
        text: 'Least-to-Most 的核心洞察是？',
        options: [
          '直接解难题最快',
          '先解简单子问题，用其解去解更难问题，成功率更高',
          '跳过简单问题',
          '只解简单问题',
        ],
        answer: 1,
        explain: '由易到难、逐阶递进。',
        concept: 'least-to-most',
      },
      {
        text: 'ADaPT 关注的核心维度是？',
        options: ['代码风格', '抽象层级——按任务难度动态升降规划粒度', '模型温度', '工具数量'],
        answer: 1,
        explain: 'ADaPT 按难度自适应抽象层级。',
        concept: 'least-to-most',
      },
      {
        text: 'Least-to-Most 分解成立的前提是？',
        options: ['子问题越多越好', '子问题由易到难、每个是下一个的台阶', '子问题互不相关', '只用一个子问题'],
        answer: 1,
        explain: '没有递进关系就退化成普通多步求解。',
        concept: 'least-to-most',
      },
    ],
    [
      ['Least-to-Most', '把难题拆成由易到难的子问题序列，逐阶求解'],
      ['ADaPT', '按任务难度自适应抽象层级的规划方式'],
      ['递进分解', '子问题间存在「简单→困难」台阶关系的分解'],
    ],
    [
      '分解出无递进关系的子问题，Least-to-Most 退化成普通多步。',
      '用同一粒度处理所有任务，忽视「按难度自适应」的价值。',
    ],
  ),
  'theory',
)
