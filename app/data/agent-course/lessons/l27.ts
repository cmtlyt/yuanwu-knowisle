import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 3 ========== */

export const L27 = withKind(
  L(
    'L27',
    3,
    '一张对比矩阵看懂 12 种范式',
    2,
    ['L11', 'L12', 'L14', 'L19', 'L17'],
    ['paradigm-matrix'],
    [
      '用一张矩阵记住 12 种范式的核心差异',
      '掌握「上下文成本 / 可靠性 / 可控性 / 典型场景」四维',
      '能把矩阵当选型速查表使用',
    ],
    `
### 一张矩阵，选型速查

前面学了 12 种范式，现在把它们压成一张可操作的对比矩阵。四个维度：上下文成本（token 多少）、可靠性（结果多稳）、可控性（流程多可控）、典型场景。

\`\`\` title="12 范式速查矩阵" note="记规律：凡「高可靠」几乎都「高成本、低可控」；凡「可控」都牺牲了「自主探索」。"
范式               成本   可靠性  可控性  典型场景
ReAct              中     中      中      通用工具调用
Plan-and-Execute   低     中      高      长任务、可控流程
ReWOO              低     中      中      工具多、依赖少
Reflexion          高     高(迭代) 低      需反复试错的复杂任务
ToT                高     高      低      需探索的规划/创意
GoT                高     高      低      多依赖、需合并结果
LATS               高     很高    低      高价值决策搜索
Voyager            高     中      低      开放式环境探索
AutoGPT 谱系        高     低      低      自主探索（风险高）
Least-to-Most      中     中      中      复合问题分解
ADaPT              中     中      中      跨尺度任务
Self-Consistency   高(并行) 高    低      单点推理提鲁棒
\`\`\`

:::deep

### 矩阵背后的那条主线

所有范式的差异，几乎都能归结为「为可靠性付出多少 token」和「为可控性牺牲多少自主」。选型时先问：这个任务愿意为可靠性花多少 token？需要多强的流程可控？答案一对上，范式就自然浮现。

:::

### 选型三问

- 一问成本：token 预算紧吗？紧 → ReWOO / P&E。
- 二问可靠性：错了代价高吗？高 → ToT / LATS / Self-Consistency。
- 三问可控性：需要人工把关吗？要 → P&E（计划可审）+ 人在回路。

:::tip

### 矩阵是起点，混合是常态

这张矩阵给「单范式」的直觉。真实系统常混合（L28）：P&E 做骨架、ReAct 做执行、Reflexion 做纠错。

:::

`,
    null,
    [
      {
        text: '矩阵里「高可靠」范式普遍的特点是？',
        options: ['高成本、低可控', '低成本、高可控', '零成本', '不需要模型'],
        answer: 0,
        explain: '高可靠几乎都高成本、低可控。',
        concept: 'paradigm-matrix',
      },
      {
        text: 'token 预算紧、步骤相对确定的场景，优先选？',
        options: ['ToT', 'ReWOO / P&E', 'LATS', 'Voyager'],
        answer: 1,
        explain: 'ReWOO / P&E 成本低、流程可控。',
        concept: 'paradigm-matrix',
      },
      {
        text: '「错了代价极高」的任务，优先考虑？',
        options: ['ReAct', 'ToT / LATS / Self-Consistency', 'AutoGPT 谱系', '纯 CoT'],
        answer: 1,
        explain: '高可靠范式（搜索/投票）适合错误代价高的场景。',
        concept: 'paradigm-matrix',
      },
    ],
    [
      ['可靠性', '结果正确与稳定的程度'],
      ['可控性', '流程可人工干预、可审阅的程度'],
      ['选型三问', '成本 / 可靠性 / 可控性三问定位范式'],
    ],
    [
      '只背矩阵不理解「成本-可靠性-可控性」的权衡，换个任务就选错。',
      '认为矩阵是「二选一」——真实系统常混合多范式。',
    ],
  ),
  'theory',
)
