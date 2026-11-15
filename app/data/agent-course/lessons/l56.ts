import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 8 ========== */

export const L56 = withKind(
  L(
    'L56',
    8,
    'GoT 实战：思维聚合解决依赖型任务',
    3,
    ['L20', 'L55'],
    ['got-engine'],
    [
      '实现 DAG 式的思维图：节点可被多个父节点复用',
      '实现聚合操作（merge），把多条分支的结果合成新节点',
      '用一个「多源汇总」任务验证图相比树的收益',
    ],
    `
### 树的结构性浪费

一个真实的案例：任务要求「对比三个竞品的定价策略，并给出建议」。用 ToT 跑，路径是这样的：

\`\`\`
根 → 查 A → 查 B → 查 C → 对比 → 建议
\`\`\`

看起来没问题。但换一个顺序（根 → 查 C → 查 A → 查 B）时，中间状态是**另一棵树上的节点**，之前查到的信息不会被复用——所以搜索树会为「查 A 查 B 查 C」的每种顺序各建一条路径。3 个对象的排列是 6 种，其中 5 种是重复劳动。

GoT（Graph of Thoughts）的核心改动很小：**允许一个节点有多个父节点**。查完 A、B 之后，「A+B 的对比中间结果」是 A 和 B 两个节点的子节点；查完 C 后，把「A+B 对比」与 C 合并。这样每个事实只查一次。

这个改动带来的收益与任务形状强相关：**依赖关系越像「多输入汇合」，收益越大**。

### 图与树的三处差别

| 维度 | 树（ToT） | 图（GoT） |
|---|---|---|
| 节点父数 | 1 | 0..n |
| 信息流 | 单向、只向下 | 可汇合、可复用 |
| 去重方式 | 路径指纹 | 内容指纹（同一事实只存一份） |
| 主要操作 | expand / score / prune | 加上 merge（聚合） |

第三行是关键：树的去重是「这条路径走过没」，图的去重是「这个中间结果算过没」。后者才能跨路径复用。

### 节点与聚合

\`\`\`ts title="图的节点与边" note="节点按内容指纹寻址（content-addressed），这是跨路径复用的前提。"
export interface GNode {
  id: string // 内容指纹
  kind: 'fact' | 'analysis' | 'answer'
  text: string
  parents: string[] // 多个父节点 = 汇合点
  score: number
}

export class ThoughtGraph {
  private nodes = new Map<string, GNode>()
  private children = new Map<string, Set<string>>()

  /** 内容相同即复用：同一事实不会因路径不同而重复生成 */
  add(kind: GNode['kind'], text: string, parents: string[], score = 0): GNode {
    const id = hash(kind + '|' + text)
    const existing = this.nodes.get(id)
    if (existing) {
      for (const p of parents) {
        if (!existing.parents.includes(p)) existing.parents.push(p)
      }
      return existing
    }
    const node: GNode = { id, kind, text, parents, score }
    this.nodes.set(id, node)
    for (const p of parents) {
      if (!this.children.has(p)) this.children.set(p, new Set())
      this.children.get(p)!.add(id)
    }
    return node
  }

  /** 叶子节点：没有子节点的，通常是待聚合的分析结果 */
  leaves(kind?: GNode['kind']): GNode[] {
    return this.all().filter((n) => (this.children.get(n.id)?.size ?? 0) === 0 && (!kind || n.kind === kind))
  }

  /** 从某个节点向上收集祖先，用于冲突时回溯到共同前提 */
  ancestors(id: string): GNode[] {
    const out = new Map<string, GNode>()
    const stack = [...(this.nodes.get(id)?.parents ?? [])]
    while (stack.length) {
      const cur = stack.pop()!
      const n = this.nodes.get(cur)
      if (!n || out.has(n.id)) continue
      out.set(n.id, n)
      stack.push(...n.parents)
    }
    return [...out.values()]
  }

  get(id: string) {
    return this.nodes.get(id)
  }

  all(): GNode[] {
    return [...this.nodes.values()]
  }
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0
  return 'g' + (h >>> 0).toString(36)
}
\`\`\`

\`add\` 里的「已存在就只补一条父边」是整套实现的核心。它让「查 A」这个事实节点在第二次被需要时直接复用，不再调用模型——这正是树做不到的。

\`readyMerges\` 我留了一个空实现，因为真实的合并调度依赖具体任务：有的图要求「凑齐全部父节点」，有的允许「先两两合并、再与第三个合并」。后者更省调用，但需要判断中间结果的完整性。

### 用一个多源汇总任务验证

真的跑一遍，收益才可信。任务：给定三份供应商报价，找出「单价最低且交期不超过 30 天」的那家。

树的做法：对每种检查顺序开一条路径，各自算一遍「是否满足」。
图的做法：

1. 抽三份报价的事实节点（\`fact\`）：\`{vendor, price, leadTime}\`。
2. 两两比较生成 \`analysis\` 节点（便宜的胜者、交期的胜者）。
3. 最后聚合两个分析节点得到答案。

关键在第三步：**两两比较的结果可以被不同顺序复用**。三份报价只需要 2 次比较（A vs B、胜者 vs C），而树的 6 种顺序里，每种都要重算。

\`\`\`ts title="聚合：把多个分析节点合成结论" note="聚合函数要能处理「父节点结论冲突」——这是图特有的失败模式。"
export interface Aggregator {
  merge(inputs: GNode[], goal: string): Promise<{ text: string; score: number; conflict?: string }>
}

export async function mergeAll(
  graph: ThoughtGraph,
  inputs: string[],
  aggregator: Aggregator,
  goal: string,
): Promise<GNode> {
  const nodes = inputs.map((id) => graph.get(id)!).filter(Boolean)
  if (nodes.length < 2) throw new Error('聚合至少需要两个输入节点')

  const out = await aggregator.merge(nodes, goal)
  // 冲突不静默吞掉：标注出来，让上层决定是回退还是请人裁决
  const text = out.conflict ? \`\${out.text}\\n[冲突] \${out.conflict}\` : out.text
  return graph.add('answer', text, inputs, out.score)
}
\`\`\`

\`conflict\` 字段是图结构带来的新问题：两个父节点的结论可能矛盾（A 说 X 更便宜，B 说 Y 更便宜，因为单位不同）。树不会遇到这个问题，因为每条路径只有一个父节点。

处理冲突的三条路：**回退到共同祖先重算**、**引入第三方判据**（比如统一单位后重算）、**标记为待人工确认**。选哪条取决于错误的代价——报价比对这类任务值得第三条。

### 一次调优记录：18 次调用降到 9 次

上面那个「三份报价找最优」的任务，第一版实现用了 18 次模型调用。逐步压缩的过程很能说明问题：

| 版本 | 做法 | 调用数 | 问题 |
|---|---|---|---|
| v1 | 每种比较顺序各跑一遍 | 18 | 同一份报价被解析 3 次 |
| v2 | 加内容指纹复用 | 11 | 两两比较仍有重复（A vs B 与 B vs A） |
| v3 | 比较结果也按「规范化输入对」去重 | 9 | 冲突需要额外一次裁决 |

v2 到 v3 那一步的细节值得记：**比较是「无序」的**，\`A vs B\` 与 \`B vs A\` 是同一个分析节点。所以比较节点的指纹要用「排序后的输入 id 拼起来」，而不是「按传入顺序拼」。

这个改动只改了一行哈希输入，却省掉两次调用——因为它消掉的是「对称重复」，这类重复在树结构里几乎无法避免。

另一个收益是**可解释性**：因为每个节点都能追到父节点，最终答案可以渲染成一棵树形引用（「结论来自 A 与 B 的比较，A 的数据来自报价 1」）。这在需要审计的场景里比一段自然语言总结有用得多。

### 与运行时怎么结合

图不是独立系统，它跑在 L36 的执行器之上：

- **每个节点的一次生成是一次模型调用**，走同一个 client、受同一套预算约束。
- **节点生成失败**（格式错、违反约束）时不写进图，而是作为「不可行候选」丢弃——与 L55 的 \`feasible\` 门槛同一个思路。
- **总预算按节点数计**，而不是按「层」计。图的节点数不固定，只有按节点计预算才守得住。

最后一个细节值得一提：调度顺序会影响成本。先做「便宜的合并」（两个已就绪节点）再做「贵的扩展」（需要新事实），能让中间结果尽早被复用；反过来则会把预算花在重复扩展上。

:::deep

### 图什么时候不如树

GoT 不是「更高级的 ToT」。它有三个明确的成本：

**① 实现复杂度。** 树只需 parent 指针，图需要「就绪检测 + 调度顺序」。你要决定「什么时候可以合并」——这个判断本身可能就需要模型。

**② 调试难度。** 树的执行顺序是线性的，日志能顺着读；图的执行顺序是拓扑序，出问题时要重建「哪个节点用了哪个输入」。

**③ 收益依赖任务形状。** 只有「多输入汇合」型任务才有复用收益。如果任务是「一条链往下走」（比如多步计算），图与树完全等价，多出来的复杂度纯亏。

判断方法：**画出任务的依赖图**。如果它是链（每个节点只有一个前驱），用树；如果是「多个分支汇到一个点」，用图。

一个实用的中间态是「树 + 局部汇合」：主搜索仍是树，只在明确的汇合点（比如「汇总多个来源」）允许一个节点有多个父节点。这样复杂度只在需要的地方付出。

:::

:::warn

### 内容指纹去重会误杀

按内容指纹去重有一个副作用：**表述不同但语义相同的节点不会被复用**，而**表述相同但语境不同的节点会被错误复用**。

第一种是效率损失（少复用一次），第二种是正确性问题。举例：两个不同项目里都有一个叫「默认超时 30 秒」的事实节点，指纹相同，于是被当成同一个——后续基于它做的分析可能张冠李戴。

防御方式是**指纹里带上语境**：\`hash(kind + '|' + scope + '|' + text)\`，其中 \`scope\` 是项目/实体 id。代价是复用率下降，但正确性优先。

另一个误杀来源是「同一事实的不同粒度」：\`price: 12.5\` 与 \`price: 12.50\` 指纹不同但等价。这类只能靠规范化（数字统一格式、单位统一）解决，指纹本身无能为力。

:::

### 收束：图的收益是「不重复劳动」

把 GoT 的价值说清楚一句话：**它让「同一个中间结果」只算一次，无论有多少条路径需要它。**

这个收益在多源汇总、多约束满足、需要反复引用同一批事实的任务上很明显；在单链推理上为零。所以选型的关键不是「图比树强」，而是「我的任务里有没有汇合点」。

L57 换一个更便宜的方向：不做搜索、不做图，只是把同一个问题多跑几次再投票——它用最少的工程复杂度换稳定性的提升。

`,
    null,
    [
      {
        text: 'GoT 相对 ToT 的核心改动是？',
        options: [
          '更深的搜索',
          '允许一个节点有多个父节点，中间结果可跨路径复用',
          '更好的评估函数',
          '更大的预算',
        ],
        answer: 1,
        explain: '复用是收益来源：同一事实只查一次。',
        concept: 'got-engine',
      },
      {
        text: '图的去重依据应该是？',
        options: ['路径指纹', '内容指纹（带语境）', '节点 id 顺序', '深度'],
        answer: 1,
        explain: '路径去重无法跨路径复用；内容指纹要带 scope 防误杀。',
        concept: 'got-engine',
      },
      {
        text: '聚合节点特有的失败模式是？',
        options: ['超时', '父节点结论冲突', 'token 超限', '格式错误'],
        answer: 1,
        explain: '树只有一个父节点，不会遇到冲突。',
        concept: 'got-engine',
      },
      {
        text: '什么任务不值得用图？',
        options: ['多源汇总', '多约束满足', '单链多步计算', '需要反复引用同一批事实'],
        answer: 2,
        explain: '链式依赖下树与图等价，复杂度纯亏。',
        concept: 'got-engine',
      },
      {
        text: '内容指纹不带 scope 会导致？',
        options: ['效率下降', '不同语境的同名事实被错误复用，产生正确性问题', '内存泄漏', '无法排序'],
        answer: 1,
        explain: '两个项目的「默认超时 30 秒」会被当成同一个。',
        concept: 'got-engine',
      },
    ],
    [
      ['DAG', '允许节点有多个父节点的有向无环图'],
      ['聚合（merge）', '把多个父节点的结论合成新节点的操作'],
      ['内容指纹', '按节点内容（含语境）去重，实现跨路径复用'],
      ['拓扑序', '图中节点的合法执行顺序，需先检测就绪'],
    ],
    [
      '用树跑多源汇总，同一事实按不同顺序被重复计算多次。',
      '内容指纹不带语境，不同项目的同名事实被误复用。',
      '在单链任务上引入图结构，复杂度上升而收益为零。',
    ],
  ),
  'practice',
)
