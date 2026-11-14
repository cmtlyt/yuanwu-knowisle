import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 8 ========== */

export const L55 = L(
  'L55',
  8,
  '实战：工程化实现 ToT 搜索树（节点评估 + 回溯 + 剪枝）',
  20,
  4,
  ['L19', 'L54'],
  ['tot-engine'],
  [
    '用 TS 实现可运行的 ToT 搜索树',
    '实现节点评估、回溯、剪枝三个核心机制',
    '对照 LangGraph 树搜索 / 自研节点图',
  ],
  [
    prose(
      '把 L19 的 ToT 概念写成代码',
      'ToT 的难点在「树的遍历 + 评估 + 剪枝」的控制。本课用一个最小但完整的实现把它落地。',
    ),
    code(
      'ToT 搜索树实现',
      'interface Node { id: string; thought: string; score: number; children: Node[]; parent: Node | null }\n\nasync function totSearch(root: Node, { beam = 3, depth = 4 }) {\n  let frontier: Node[] = [root]\n  for (let d = 0; d < depth; d++) {\n    const next: Node[] = []\n    for (const node of frontier) {\n      const candidates = await generateCandidates(node.thought)  // ① 展开\n      for (const c of candidates) {\n        const score = await evaluate(c)                          // ② 评估\n        if (score < THRESHOLD) continue                          // ③ 剪枝\n        const child = { id: uid(), thought: c, score, children: [], parent: node }\n        node.children.push(child)\n        next.push(child)\n      }\n    }\n    frontier = next.sort((a, b) => b.score - a.score).slice(0, beam)  // ④ 保留 topK（beam）\n    if (!frontier.length) break\n  }\n  return bestPath(root)   // 回溯：沿最高分路径取最终答案\n}',
      '四个机制：展开（多候选）、评估（打分）、剪枝（低于阈值淘汰）、beam（每层只留 topK）。',
    ),
    call(
      'deep',
      'beam search 是 ToT 的工程抓手',
      '纯穷举会指数爆炸，所以 ToT 几乎必配 beam：每层只保留 topK 个最有希望的分支。beam 越大越接近穷举（更准但更贵），越小越像贪婪（更快但可能漏解）。',
    ),
    list('三个关键参数', [
      'THRESHOLD（剪枝阈值）：低于它就淘汰，防止明显走偏的分支。',
      'beam（每层保留数）：权衡搜索广度与成本。',
      'depth（最大深度）：限制树高，防止无限展开。',
    ]),
    call(
      'tip',
      '框架对照：LangGraph 树搜索',
      'LangGraph 用自定义节点图实现 ToT：`expand` 节点生成候选、`score` 节点评估、条件边做剪枝、状态里的树结构做回溯。你手写的 `totSearch` 与它的节点图是一一对应的。',
    ),
  ],
  null,
  [
    q(
      'ToT 的四个核心机制是？',
      [
        '读、写、执行、删除',
        '展开、评估、剪枝、beam 保留',
        '加密、解密、签名、哈希',
        '训练、推理、部署、运维',
      ],
      1,
      '展开、评估、剪枝、beam。',
      'tot-engine',
    ),
    q(
      'beam 参数的作用是？',
      ['控制颜色', '每层只保留 topK 个分支，权衡广度与成本', '控制温度', '控制模型大小'],
      1,
      'beam 平衡搜索广度与成本。',
      'tot-engine',
    ),
    q(
      'beam 越小，搜索越接近？',
      ['穷举', '贪婪（更快但可能漏解）', '随机', 'BFS'],
      1,
      'beam 小接近贪婪，快但可能漏解。',
      'tot-engine',
    ),
  ],
  [
    ['beam search', '每层只保留 topK 分支的搜索策略'],
    ['剪枝阈值', '低于该分数即淘汰分支'],
    ['回溯', '沿最高分路径回溯取最终答案'],
  ],
  ['不设 beam，纯穷举导致指数爆炸。', '评估器不准仍依赖剪枝，把好分支剪掉。'],
)
