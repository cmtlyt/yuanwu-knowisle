import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L19 = withKind(
  L(
    'L19',
    2,
    'Tree-of-Thoughts：把推理变成搜索树',
    2,
    ['L12'],
    ['tot'],
    [
      '理解 ToT 如何把「单条推理链」扩展成「多条候选的搜索树」',
      '掌握 ToT 的展开、评估、回溯、剪枝四步',
      '认识 ToT 适合需要探索的规划 / 创意任务',
    ],
    `
### 一条链走不通，就分叉探索

CoT / ReAct 都是「一条推理链往下走」。ToT 在每一步**同时展开多个候选思路**，评估每个候选的潜力，好的继续展开、差的剪掉，必要时回溯——把推理变成一棵搜索树。

\`\`\` title="ToT 的四步循环" note="关键：① 展开多个候选 → ② 评估打分 → ③ 剪枝淘汰 → ④ 递归深入或回溯。"
// 节点 = 一个「部分解 + 已走路径」
function* explore(node) {
  const candidates = await generateCandidates(node)  // ① 展开：生成多个下一步
  const scored = await evaluate(candidates)           // ② 评估：给每个候选打分
  const kept = scored.filter((c) => c.score > threshold)  // ③ 剪枝：淘汰低分
  for (const c of kept) {
    if (isSolution(c)) yield c                         // 找到解
    else yield* explore(c)                             // ④ 回溯/递归深入
  }
}
\`\`\`

:::deep

### ToT vs CoT 的本质

CoT 是「深度优先、只走一条」的链；ToT 是「广度优先 + 评估剪枝」的树。ToT 的收益来自「评估」——每一步都能放弃明显走偏的分支，把计算集中在有希望的方向。代价是每展开一个分支都要一次模型调用，token 与延迟都成倍。

:::

### ToT 适合 / 不适合

- 适合：需要探索多解、有明显「好/坏」可评估的任务（解谜、规划、创意）。
- 不适合：答案只有一条、无法中间评估的任务（ToT 的分叉纯浪费）。

:::warn

### 评估器决定 ToT 成败

ToT 的「评估」可以是规则、测试、或 LLM 打分。如果评估器不准，ToT 会剪掉好分支、保留坏分支，比 CoT 更差。

:::

`,
    null,
    [
      {
        text: 'ToT 的四步循环是？',
        options: [
          '推理-行动-观测-回填',
          '展开 → 评估 → 剪枝 → 回溯/深入',
          '规划-执行-汇总',
          '尝试-反思-重试',
        ],
        answer: 1,
        explain: '展开多候选、评估打分、剪枝淘汰、递归深入或回溯。',
        concept: 'tot',
      },
      {
        text: 'ToT 相对 CoT 的收益来自？',
        options: [
          '更长的推理',
          '每一步评估并剪掉走偏分支，集中计算在有希望方向',
          '更少的 token',
          '不需要模型',
        ],
        answer: 1,
        explain: '收益来自「评估 + 剪枝」。',
        concept: 'tot',
      },
      {
        text: 'ToT 的代价是？',
        options: [
          '需要更多工具',
          '每展开一个分支都要模型调用，token 与延迟成倍',
          '无法回溯',
          '只能处理数学题',
        ],
        answer: 1,
        explain: '分支展开成本高，token 与延迟成倍增加。',
        concept: 'tot',
      },
    ],
    [
      ['搜索树', '以部分解为节点、以候选分支为边的树结构'],
      ['剪枝', '根据评估分数淘汰低潜力的分支'],
      ['回溯', '当前分支走不通时返回上层尝试其他分支'],
    ],
    [
      '在「答案唯一、无法中间评估」的任务上硬用 ToT，分叉纯浪费 token。',
      '评估器不准却仍依赖剪枝，反而把好分支剪掉。',
    ],
  ),
  'theory',
)
