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
      '理解用「上下文成本 / 可靠性 / 可控性 / 典型场景」四维区分范式',
      '掌握把矩阵当筛选器而不是排行榜的用法',
      '能用可运行筛选函数按任务约束给出候选范式',
    ],
    `
### 十二个名字都背下来了，选型时还是只会用 ReAct

模块二讲完，团队能把 CoT、ReAct、ReWOO、LATS、Voyager 这些名字挨个说一遍。可真到了新需求评审——「给客服做一个能查订单、能解释原因、成本别太高的助手」——讨论还是从「要不先上 ReAct 吧」开始。问为什么不用 ReWOO，答不上来；问 ToT 贵在哪，也说不清。

问题出在**记住的是名字，不是差异维度**。名字是标签，选型需要的是可比较的量：这一范式会往上下文里塞多少东西、结果稳不稳、人能不能控制它、适合哪类任务。把十二种范式摊到同一张四维表上，它们才从「一堆术语」变成一张速查表。

### 十二范式四维矩阵

| 范式（对应课） | 核心动作 | 上下文成本 | 可靠性 | 可控性 | 典型场景 |
|---|---|---|---|---|---|
| CoT（L26） | 先写推理再给答案 | 低 | 中 | 高 | 单步推理、可解释的短任务 |
| ReAct（L12/13） | 观察—推理—动作循环 | 中 | 中 | 高 | 通用基线、工具调用 |
| Plan-and-Execute（L14/15） | 先出计划再逐步执行 | 中 | 中高 | **很高** | 步骤可预判、要可审查 |
| ReWOO（L16） | 一次性规划、批量取证据 | **低** | 中 | 高 | 成本敏感、证据可预取 |
| Reflexion（L17/18） | 失败写进记忆再试 | 中高 | 高 | 中 | 可判成败、允许重试 |
| Tree-of-Thoughts（L19） | 展开分支并评估 | **很高** | 高 | 中 | 需要搜索的推理题 |
| Graph-of-Thoughts（L20） | 分支可聚合与合并 | 很高 | 高 | 中 | 子结果能合并的任务 |
| LATS（L21） | 蒙特卡洛树搜索选路径 | **很高** | **很高** | 中 | 有可打分的环境 |
| Voyager（L22） | 攒技能库的终身智能体 | 高（跨会话） | 中高 | 中 | 长期开放环境 |
| 自主智能体谱系（L23） | 自主拆任务 + 长循环 | 高 | 中低 | **低** | 探索性、容许失控 |
| Least-to-Most / ADaPT（L24） | 按难度渐进分解 | 中 | 中高 | 高 | 长问题、难度不均 |
| Self-Consistency（L25） | 多路径投票 | 高（多次采样） | 高 | 中 | 答案可投票、要求稳 |

四个维度各自在问一件事：**上下文成本**问「要往 prompt 里塞多少、要跑几轮模型」，直接连到 L88 的成本与 L91 的裁剪；**可靠性**问「同一任务重复跑，结果波动多大」；**可控性**问「人能不能在事前写清路径、事中介入」；**典型场景**是前三项的落地条件，不是推荐语。

注意到没有任何一行在四项上全优：LATS 可靠性最高但上下文成本也最高，自主智能体谱系最自由也最不可控，ReWOO 最省却要求证据能事先预取。**范式之间的差异是取舍，不是强弱**。

:::deep
### 矩阵是筛选器，不是排行榜

如果把矩阵读成「谁更好」，会得出「LATS 最可靠，那就都上 LATS」这种结论——而它的上下文成本足以让一个普通客服查询贵上几十倍。正确用法是**按约束逐列筛**：先砍掉付不起的，再在剩下的里挑最贴合场景的。

示范一：约束是「成本敏感、单次查询、证据可预取」。先用上下文成本筛，留下 CoT / ReWOO / ReAct；再用「证据可预取」这一条，ReWOO 最贴合，ReAct 作为基线备选。ToT / LATS / Self-Consistency 在这一步就被砍掉，不是它们不好，是代价付不起。

示范二：约束是「结果必须稳、有可自动打分的验证器、预算宽松」。可靠性列留下 LATS / Self-Consistency / ToT；再因为「有验证器」优先 LATS，Self-Consistency 作为更便宜的兜底。可控性在这里不是第一约束，所以不拿它去否掉这几个。

两次筛选的共同点：**先写清约束，再查表**。反过来「先挑个喜欢的范式，再找理由」就是开头那间会议室里发生的事。
:::

### 把矩阵写成可运行的筛选函数

\`\`\`ts title="paradigm-matrix.ts" note="要点：四个维度显式建模；先按硬约束过滤，再按代价排序；返回候选与理由。"
type Cost = 'low' | 'mid' | 'high' | 'very-high'
type Level = 'low' | 'mid' | 'high' | 'very-high'

type Paradigm = {
  id: string
  lesson: string
  cost: Cost
  reliability: Level
  controllability: Level
  needs: string[]          // 适用前提，缺一不可
  scene: string
}

const COST_RANK: Record<Cost, number> = { low: 1, mid: 2, high: 3, 'very-high': 4 }

const PARADIGMS: Paradigm[] = [
  { id: 'cot', lesson: 'L26', cost: 'low', reliability: 'mid', controllability: 'high', needs: [], scene: '单步推理' },
  { id: 'react', lesson: 'L12', cost: 'mid', reliability: 'mid', controllability: 'high', needs: [], scene: '通用工具循环' },
  { id: 'rewoo', lesson: 'L16', cost: 'low', reliability: 'mid', controllability: 'high', needs: ['evidence-prefetch'], scene: '成本敏感' },
  { id: 'pne', lesson: 'L14', cost: 'mid', reliability: 'high', controllability: 'very-high', needs: ['predictable-steps'], scene: '可审查流程' },
  { id: 'reflexion', lesson: 'L17', cost: 'high', reliability: 'high', controllability: 'mid', needs: ['verifiable', 'allow-retry'], scene: '可判成败' },
  { id: 'tot', lesson: 'L19', cost: 'very-high', reliability: 'high', controllability: 'mid', needs: ['branchable'], scene: '搜索型推理' },
  { id: 'got', lesson: 'L20', cost: 'very-high', reliability: 'high', controllability: 'mid', needs: ['mergeable'], scene: '结果可合并' },
  { id: 'lats', lesson: 'L21', cost: 'very-high', reliability: 'very-high', controllability: 'mid', needs: ['scoreable-env'], scene: '有打分环境' },
  { id: 'voyager', lesson: 'L22', cost: 'high', reliability: 'high', controllability: 'mid', needs: ['long-running'], scene: '终身智能体' },
  { id: 'autonomous', lesson: 'L23', cost: 'high', reliability: 'mid', controllability: 'low', needs: ['tolerant-to-drift'], scene: '探索性任务' },
  { id: 'adapt', lesson: 'L24', cost: 'mid', reliability: 'high', controllability: 'high', needs: ['decomposable'], scene: '长问题' },
  { id: 'self-consistency', lesson: 'L25', cost: 'high', reliability: 'high', controllability: 'mid', needs: ['votable'], scene: '可投票答案' },
]

function selectParadigm(c: { maxCost: Cost; minReliability: Level; available: string[] }): Paradigm[] {
  const rank = (v: string) => ({ low: 1, mid: 2, high: 3, 'very-high': 4 })[v] ?? 0
  return PARADIGMS
    .filter((p) => COST_RANK[p.cost] <= COST_RANK[c.maxCost])
    .filter((p) => rank(p.reliability) >= rank(c.minReliability))
    .filter((p) => p.needs.every((n) => c.available.includes(n)))  // 前提不满足直接淘汰
    .sort((a, b) => COST_RANK[a.cost] - COST_RANK[b.cost])
}

// 示范一：成本敏感 + 证据可预取 -> rewoo / cot / react
const cheap = selectParadigm({ maxCost: 'mid', minReliability: 'mid',
  available: ['evidence-prefetch'] })
// 示范二：要求高可靠 + 有打分环境 -> lats（成本最高但唯一满足）
const solid = selectParadigm({ maxCost: 'very-high', minReliability: 'very-high',
  available: ['scoreable-env'] })
\`\`\`

\`needs\` 这一列比四个分数更重要：它记的是「这个范式成立的前提」。ReWOO 要求证据能预取，LATS 要求环境可打分，Reflexion 要求结果可判成败——前提不满足时，再漂亮的分数也不该入选。把前提写成数据而不是记在脑子里，选型才不会因为某次「感觉可以」而失效。

:::warn
### 两个必踩的坑

- **把矩阵当排行榜**。四维里没有全优项，脱离约束谈「哪个最好」没有意义；尤其别把可靠性最高的范式用在一次普通查询上。
- **忽略「可以组合」**。真实系统常常不是单选：L28 会把规划、执行、反思分层串起来。矩阵的用途是看清每层该用谁，不是逼自己只挑一个。
:::

### 与相邻课的分工

- **L11**：给四组分类与一条主线（地图），本课把它摊成可比较的四维表（速查表）。
- **L12–L26**：各范式专论，本课不重复其实现与推导，只做横向对齐。
- **L28**：混合范式实战，回答「矩阵里的几行怎么叠」。
- **L59–L65**：规划、重规划、ADaPT、失败经验与自我批评的进阶实现，是矩阵中规划/反思两组的工程展开。
- **L112**：框架对比矩阵，维度是「能力/成本/可控性/抽象层数」等框架属性；本课的维度是**范式属性**，两张表不要混用。

**一句话收束**：记名字没有用，记**上下文成本 / 可靠性 / 可控性 / 适用前提**才有用；矩阵是筛选器，不是排行榜。
`,
    null,
    [
      {
        text: '把 12 范式矩阵当排行榜用，最典型的错误是？',
        options: [
          '漏掉某个范式',
          '因为 LATS 可靠性最高就什么任务都上它，忽略上下文成本',
          '没有按课号排序',
          '维度太少',
        ],
        answer: 1,
        explain: '没有全优项，正确用法是先写清约束再逐列筛。',
        concept: 'paradigm-matrix',
      },
      {
        text: '矩阵里 needs（适用前提）为什么比四个分数更重要？',
        options: ['它更长', '前提不满足时范式根本不成立，分数再好也不该入选', '方便排序', '它是文档要求'],
        answer: 1,
        explain: '如 ReWOO 要证据可预取、LATS 要环境可打分。',
        concept: 'paradigm-matrix',
      },
      {
        text: '本课矩阵与 L112 框架矩阵的关系是？',
        options: [
          '同一张表',
          '本课比的是范式属性，L112 比的是框架属性，不要混用',
          'L112 是本课的简化版',
          '互相替代',
        ],
        answer: 1,
        explain: '一个回答「循环怎么转」，一个回答「用哪个框架」。',
        concept: 'paradigm-matrix',
      },
    ],
    [
      ['四维矩阵', '上下文成本 / 可靠性 / 可控性 / 典型场景，用来筛范式'],
      ['适用前提', '范式成立的条件（可预取 / 可打分 / 可判成败），不满足即淘汰'],
      ['筛选器', '先按硬约束过滤，再按代价排序，而非挑「最好」的那个'],
    ],
    [
      '脱离约束谈「哪个范式最好」，把高成本范式用在普通查询上。',
      '把矩阵当单选题，忘了真实系统常把规划/执行/反思分层组合。',
    ],
  ),
  'theory',
)
