import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 8 ========== */

export const L55 = withKind(
  L(
    'L55',
    8,
    '实战：工程化实现 ToT 搜索树（节点评估 + 回溯 + 剪枝）',
    3,
    ['L19', 'L54'],
    ['tot-engine'],
    [
      '实现 ToT 的四个部件：节点、扩展、评估、剪枝与回溯',
      '对比 BFS+beam 与 DFS+backtrack 两种搜索策略的适用场景',
      '用节点预算与去重控制搜索爆炸',
    ],
    `
### 4 倍成本，零提升

第一次自己实现 ToT 的团队常常遇到同一个结果：调用次数涨了 4 倍，正确率几乎没变。

复盘时发现三处问题，每一个都很典型：

1. **评估函数太弱**：用「这句话看起来合理吗」打分，结果是所有候选分数都在 0.7–0.8 之间，剪枝等于随机剪。
2. **没有回溯**：搜索树只往下长，走到死路也不回头——这其实是「多次采样」而不是 ToT。
3. **没有去重**：同一个中间状态被不同路径反复生成，预算全花在重复探索上。

ToT 的收益几乎全部来自「评估 + 回溯」这两个部件，而它们恰好是最容易被做成摆设的部分。这一节把四个部件都写成可运行的代码，并说明每个部件的失效模式。

### 四个部件

| 部件 | 职责 | 失效后果 |
|---|---|---|
| 节点（Node） | 保存一个中间状态与到达它的路径 | 状态不完整 → 无法回溯 |
| 扩展（expand） | 从一个节点生成 b 个候选下一步 | b 太小搜索不足、太大爆炸 |
| 评估（score） | 给候选打分，决定优先级 | 分数无区分度 → 剪枝变随机 |
| 剪枝 + 回溯 | 保留前 k 个、走不通时回退 | 缺失 → 退化成多次采样 |

一个关键的设计决定是**节点里存什么**。存「完整状态」最灵活但最占内存；存「路径 + 可重放的操作」更省，但要求状态可重放。

工程上常用「路径 + 摘要」：节点保存到当前步为止的完整路径文本（用于评估与最终输出），以及一个轻量的 \`facts\` 摘要（用于去重）。

\`\`\`ts title="节点与评估器" note="评估返回「分数 + 是否可行」两个值——可行性是硬门槛，分数只在可行集合里排序。"
export interface Node<S> {
  id: string
  state: S
  path: string[] // 每一步的自然语言描述，用于评估与输出
  score: number
  depth: number
  parent?: Node<S>
}

export interface Evaluator<S> {
  /** 返回 0~1 的分数；feasible=false 表示这条路走不通（直接剪掉） */
  score(state: S, path: string[]): Promise<{ score: number; feasible: boolean; reason?: string }>
}

export interface Expander<S> {
  /** 生成最多 b 个候选下一步；返回空数组表示无法继续 */
  expand(state: S, path: string[], b: number): Promise<{ state: S; step: string }[]>
}
\`\`\`

评估结果分成「分数」与「可行性」两个维度，是这套实现里最重要的设计：

- **可行性是硬门槛**。一个候选如果算错了数、违反了约束、引用了不存在的实体，无论「看起来多合理」都该被剪掉。
- **分数只在可行集合里排序**。这样即使分数区分度不高，至少不会选出明显错误的路径。

很多实现只有一个 0–1 分数，于是「可行但平庸」与「不可行但表述漂亮」混在一起排序——这就是「4 倍成本零提升」的主因之一。

### 策略一：BFS + beam（宽而浅）

每层扩展所有节点、统一评估、只保留 top-k。适合「步数不多、每步候选多」的任务（比如写方案的多个方向）。

\`\`\`ts title="beamSearch：层进式扩展 + 保留 top-k" note="maxNodes 是硬预算：没有它，b=5、d=6 就是 15625 次扩展。"
export async function beamSearch<S>(
  root: S,
  expander: Expander<S>,
  evaluator: Evaluator<S>,
  opts: { breadth: number; depth: number; beam: number; maxNodes: number },
): Promise<{ best: Node<S>; nodes: Node<S>[][] }> {
  const { breadth, depth, beam, maxNodes } = opts
  const levels: Node<S>[] = [{ id: 'n0', state: root, path: [], score: 0, depth: 0 }]
  const trace: Node<S>[][] = [levels]
  let created = 1

  for (let d = 0; d < depth; d += 1) {
    const next: Node<S>[] = []
    for (const node of levels) {
      if (created >= maxNodes) break
      const cands = await expander.expand(node.state, node.path, breadth)
      for (const c of cands) {
        if (created >= maxNodes) break
        const judged = await evaluator.score(c.state, [...node.path, c.step])
        created += 1
        if (!judged.feasible) continue // 硬门槛：直接丢弃
        next.push({
          id: 'n' + created,
          state: c.state,
          path: [...node.path, c.step],
          score: judged.score,
          depth: d + 1,
          parent: node,
        })
      }
    }
    if (next.length === 0) break // 全部不可行：提前结束
    next.sort((a, b) => b.score - a.score)
    levels.length = 0
    levels.push(...next.slice(0, beam)) // 剪枝：只留 top-beam
    trace.push([...levels])
  }

  const best = levels.reduce((a, b) => (b.score > a.score ? b : a))
  return { best, nodes: trace }
}
\`\`\`

三个细节：

**\`created\` 计数在扩展与评估都算。** 它统计的是「我们实际付了几次调用」，不是「树上有几个节点」。这样预算与实际成本对得上。

**不可行候选不进入 \`next\`，也不占 beam 名额。** 如果先收集再过滤，\`beam=3\` 可能全是不可行项，整层就废了。

**提前结束条件有两个**：\`next.length === 0\`（全不可行）与 \`maxNodes\` 用尽。前者说明这条路走不通，后者说明预算到顶——两者的语义不同，日志里要分开记。

### 策略二：DFS + 回溯（窄而深）

一次只走一条路，走不通就退回来试下一个候选。适合「步数多、每步候选少、且存在明确失败信号」的任务（比如代码修复：编译通过与否是硬信号）。

\`\`\`ts title="dfsSearch：深度优先 + 回溯 + 状态去重" note="visited 用「路径指纹」去重，避免不同顺序走到同一状态。"
export async function dfsSearch<S>(
  root: S,
  expander: Expander<S>,
  evaluator: Evaluator<S>,
  fingerprint: (s: S) => string,
  opts: { breadth: number; maxDepth: number; maxNodes: number; minScore?: number },
): Promise<{ best: Node<S> | null; visits: number }> {
  const { breadth, maxDepth, maxNodes, minScore = 0 } = opts
  const visited = new Set<string>([fingerprint(root)])
  let visits = 0
  let best: Node<S> | null = null

  async function dfs(node: Node<S>): Promise<boolean> {
    if (visits >= maxNodes) return false
    if (node.depth >= maxDepth) {
      if (node.score >= minScore && (!best || node.score > (best as Node<S>).score)) best = node
      return Boolean(best && (best as Node<S>).score >= 0.9) // 足够好：停止搜索
    }

    const cands = await expander.expand(node.state, node.path, breadth)
    // 先评估再排序，优先走高分分支（best-first within DFS）
    const judged = []
    for (const c of cands) {
      const fp = fingerprint(c.state)
      if (visited.has(fp)) continue // 去重：这条路已经走过
      const j = await evaluator.score(c.state, [...node.path, c.step])
      visits += 1
      if (!j.feasible) continue
      judged.push({ c, j })
    }
    judged.sort((a, b) => b.j.score - a.j.score)

    for (const { c, j } of judged) {
      const child: Node<S> = {
        id: 'n' + visits,
        state: c.state,
        path: [...node.path, c.step],
        score: j.score,
        depth: node.depth + 1,
        parent: node,
      }
      visited.add(fingerprint(c.state))
      if (await dfs(child)) return true // 找到足够好的解：一路向上返回
    }
    return false
  }

  const rootNode: Node<S> = { id: 'n0', state: root, path: [], score: 0, depth: 0 }
  await dfs(rootNode)
  return { best, visits }
}
\`\`\`

回溯的本质就是那行 \`if (await dfs(child)) return true\`——如果子树里没找到解，循环继续试下一个兄弟节点。这里没有显式的「撤销」操作，因为状态是不可变的（每次扩展产生新 \`state\`），回溯天然安全。

如果状态是可变的（比如直接改了一个对象），回溯就必须手工恢复——这也是「状态不可变」在搜索场景里的实际价值。

### 选哪种策略

| 维度 | BFS + beam | DFS + backtrack |
|---|---|---|
| 适合步数 | 少（3–6 步） | 多（8+ 步） |
| 每步候选 | 多 | 少 |
| 失败信号 | 弱（只能靠打分） | 强（编译/测试通过与否） |
| 内存 | 每层保留 beam 个 | 只保留当前路径 |
| 典型场景 | 方案构思、文案多方向 | 代码修复、多步规划 |

一个实用判断：**如果失败是可判定的（有硬信号），用 DFS；如果失败只能靠打分，用 BFS + beam。** 因为 DFS 依赖「走不通就退」的信号，没有信号时它会在一棵坏树上反复深入。

:::deep

### 为什么评估函数是真正的瓶颈

ToT 论文里的收益，几乎全部来自「评估 + 剪枝」的质量，而不是「扩展」的数量。

一个思想实验：如果评估完全准确（能精确判断哪条路通向正确答案），那 \`beam=1\` 就够——每步只走最优分支，等于一个完美的贪心搜索。反过来，如果评估完全随机，那无论扩展多少分支，都只是「随机采样更多次」，收益等同于自洽性投票（L57），却贵得多。

所以调 ToT 的正确顺序是：**先把评估做准，再考虑加大 breadth**。具体做法：

- **用可验证信号做评估**。代码能否编译、SQL 能否执行、数字能否用计算器核对——这些比「让模型打分」可靠得多。
- **评估要「看路径」而不只看「当前步」**。同一个中间步骤，在不同路径上下文里合理性不同。
- **分数要能区分**。如果所有候选都在 0.7–0.8，说明评估粒度不够；可以考虑改成「排序」而不是「打分」（让模型从 b 个候选里选前 k 个，通常比给绝对分更准）。

最后一条是实践中的常用技巧：**相对排序比绝对打分稳定**。模型对「哪个更好」的判断力，明显强于「这个有多好」。

:::

:::warn

### ToT 在无搜索空间的任务上是纯浪费

三种不该用 ToT 的任务：

- **答案唯一且直接**。「这份合同的甲方是谁」——没有分支可展开。
- **每步只有一个合理动作**。步骤被流程锁死时，扩展出来的候选都是噪声。
- **评估无法判断中间步骤**。比如「写一首诗」，中间步骤的好坏没有客观标准，打分只会引入随机性。

第二类最隐蔽：它看起来「有多个选择」，但实际只有一个是符合约束的。此时扩展 b=5，其中 4 个必然不可行，等于把 80% 的预算花在生成废稿上。判断方法很简单：**先看 \`feasible=false\` 的比例**，如果长期高于 60%，说明扩展策略有问题（该用规则约束候选，而不是让模型自由生成）。

:::

### 收束：搜索的三个旋钮

ToT 的可调参数只有三个：**breadth（每步几个候选）、beam（保留几条）、depth（走多深）**。它们的组合决定了成本，而**评估质量决定了收益**。

一个可用的起点是 \`breadth=3, beam=2, depth=4\`：总共约 24 次扩展，成本可控，比单链 CoT 多花 3–5 倍。跑通之后再按「评估能不能区分」决定要不要加宽——而不是一开始就 \`breadth=5, depth=6\`（那是 15000+ 次调用）。

L56 处理 ToT 的结构性局限：树的分支永远不汇合。当任务需要「把多个分支的结果合并」时，需要的是图而不是树。

`,
    null,
    [
      {
        text: 'ToT 的收益主要来自哪两个部件？',
        options: ['扩展与深度', '评估与回溯（剪枝）', '节点与路径', '预算与去重'],
        answer: 1,
        explain: '没有评估与回溯，ToT 退化成多次采样。',
        concept: 'tot-engine',
      },
      {
        text: '评估返回「分数 + 可行性」两个维度的好处是？',
        options: ['代码更短', '可行性做硬门槛，避免「表述漂亮但算错」的候选进入排序', '减少调用', '便于日志'],
        answer: 1,
        explain: '单一分数会让明显错误的路径混进排序。',
        concept: 'tot-engine',
      },
      {
        text: '什么任务更适合 DFS + backtrack？',
        options: ['方案构思', '文案多方向生成', '代码修复（有编译/测试硬信号）', '开放性调研'],
        answer: 2,
        explain: '失败可判定时，回溯才有依据。',
        concept: 'tot-engine',
      },
      {
        text: '如果评估分数长期集中在 0.7–0.8，说明？',
        options: ['模型很强', '评估粒度不够、区分度低，剪枝近似随机', '预算不够', '需要加大 breadth'],
        answer: 1,
        explain: '可改成相对排序（让模型选前 k 个）而非绝对打分。',
        concept: 'tot-engine',
      },
      {
        text: '扩展出的候选长期 60% 以上不可行，说明？',
        options: ['评估太严', '扩展策略有问题，应用规则约束候选而非自由生成', '需要更深', '模型太小'],
        answer: 1,
        explain: '大部分预算花在生成废稿上。',
        concept: 'tot-engine',
      },
    ],
    [
      ['breadth / beam / depth', 'ToT 的三个成本旋钮：候选数、保留数、深度'],
      ['可行性门槛', '评估的硬判据，先于分数排序'],
      ['状态指纹', '用于去重的状态哈希，避免重复探索'],
      ['相对排序', '让模型选前 k 个而非打绝对分，通常更稳'],
    ],
    [
      '无回溯地多层扩展，实为多次采样，成本翻倍收益为零。',
      '用单一分数排序，把不可行候选排在可行候选前面。',
      '评估无区分度时仍加大 breadth，只增加随机性与成本。',
    ],
  ),
  'practice',
)
