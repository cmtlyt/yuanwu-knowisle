import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 7 ========== */

export const L49 = withKind(
  L(
    'L49',
    7,
    '实战：实现一个最小向量 RAG 管线（embedding + 检索 + 重排）',
    3,
    ['L48'],
    ['vector-rag'],
    [
      '实现「切块 → 嵌入 → 检索 → 重排」四段管线',
      '用召回率与命中率量化检索质量，而不是靠感觉',
      '处理向量归一化、块大小、重排阈值三类工程细节',
    ],
    `
### 关键词检索的三个必然失败

一个内部文档问答最初用 \`includes\` 匹配，效果还行——直到用户开始问真实问题：

- 「报销要多久到账」→ 文档里写的是「费用结算周期」，零命中。
- 「how to request GPU」→ 文档是中文的「申请显卡资源」，零命中。
- 「SSO 怎么接」→ 文档里写「单点登录（Single Sign-On）接入」，只有部分命中。

三类失败对应三个问题：**同义词、跨语言、缩写与全称**。它们都不是「匹配算法不够好」，而是「字面匹配」这个前提本身不成立——用户表达与文档表达之间没有共享的字面符号。

向量检索换了一个前提：**语义相近的文本，向量也相近**。它不要求字面重合，只要求在嵌入空间里距离够近。

这一节把这条管线做出来，四段：切块、嵌入、检索、重排。

### 四段各自解决什么

| 阶段 | 输入 | 输出 | 主要决策 |
|---|---|---|---|
| 切块 | 长文档 | 400–800 字的块 | 块大小、重叠、是否按标题切 |
| 嵌入 | 块文本 | 向量 | 用哪个模型、是否归一化 |
| 检索 | 查询向量 | top-k 候选 | k 取多少、是否加关键词兜底 |
| 重排 | 候选 + 查询 | 排序后的少量结果 | 用 cross-encoder 还是 LLM |

四段里，**切块的影响最大却最容易被忽略**。块切得不好，后面三步都救不回来：一个「报销周期」的答案如果被切成了两半，前半在块 A、后半在块 B，检索出来的任何一块都不完整。

### 切块：优先按结构，其次按长度

三种常见策略：

- **固定长度**（每 500 字一刀）：最简单，但会把句子切断。
- **按结构**（标题、段落、列表项）：语义完整，但块长不可控（可能 50 字，也可能 5000 字）。
- **结构优先 + 长度兜底**：先按标题/段落切，超长的再按句子切，并保留 10%–15% 重叠。

第三种在实践中效果最好。重叠的作用是「防止边界丢信息」：答案跨段时，重叠部分能保证至少有一块包含完整语义。

\`\`\`ts title="chunk：结构优先 + 长度兜底 + 重叠" note="overlap 用「取尾部若干字符」实现即可，不必精确到句子——它的作用是防边界丢失，不是语义完美。"
export interface Chunk {
  id: string
  docId: string
  text: string
  heading?: string
}

export function chunkDoc(docId: string, markdown: string, maxLen = 600, overlap = 80): Chunk[] {
  // 先按标题切大段
  const sections = markdown.split(/^##\\s+/m).map((s, i) => ({ heading: i === 0 ? '' : s.split('\\n')[0]!, body: s }))
  const out: Chunk[] = []

  for (const sec of sections) {
    const paras = sec.body.split(/\\n\\s*\\n/).map((p) => p.trim()).filter(Boolean)
    let buf = ''
    const flush = () => {
      if (!buf.trim()) return
      out.push({ id: \`\${docId}#\${out.length}\`, docId, text: buf.trim(), heading: sec.heading })
      buf = buf.slice(-overlap) // 保留尾部作为重叠
    }
    for (const p of paras) {
      if ((buf + p).length > maxLen) flush()
      buf += (buf ? '\\n\\n' : '') + p
    }
    flush()
  }
  return out
}
\`\`\`

\`flush\` 里那一行 \`buf = buf.slice(-overlap)\` 是重叠的实现：把刚发出去的块的最后 80 个字符留给下一块当开头。这样跨块边界的句子至少在一处是完整的。

### 嵌入与检索：归一化必须一致

\`\`\`ts title="embed + search：余弦相似度的两个前提" note="embed 时归一化，查询时也必须归一化；两边不一致会让打分整体偏移。"
export type Vec = number[]

export interface Embedder {
  embed(texts: string[]): Promise<Vec[]>
}

export function normalize(v: Vec): Vec {
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1
  return v.map((x) => x / n)
}

export function dot(a: Vec, b: Vec): number {
  let s = 0
  for (let i = 0; i < a.length; i += 1) s += a[i]! * b[i]!
  return s
}

export class VectorIndex {
  private items: { chunk: Chunk; vec: Vec }[] = []

  async build(chunks: Chunk[], embedder: Embedder) {
    const vecs = await embedder.embed(chunks.map((c) => c.text))
    this.items = chunks.map((c, i) => ({ chunk: c, vec: normalize(vecs[i]!) }))
  }

  async search(query: string, embedder: Embedder, k = 20): Promise<{ chunk: Chunk; score: number }[]> {
    const [qv] = await embedder.embed([query])
    const q = normalize(qv!)
    return this.items
      .map((it) => ({ chunk: it.chunk, score: dot(q, it.vec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }
}
\`\`\`

两个容易错的地方：

**第一，归一化必须两边都做。** 只归一化文档向量、查询不归一化，点积就退化成「带长度的相似度」，长查询会系统性得分偏高。这个 bug 的表现是「短查询召回差」——很容易被误判成「嵌入模型不行」。

**第二，k 要取大一点再重排。** 检索阶段取 20 条，重排后留 3–5 条。只取 3 条会让重排失去意义；取 100 条会增加重排成本。20 是个常用起点。

### 重排：为什么值得多花一次调用

向量检索用的是 **bi-encoder**：文档与查询分别编码，再算距离。它快，能扫百万条，但有个结构性缺陷——**编码时两者互不知道对方**，所以「查询里的关键限定词」对文档向量的影响是间接的。

重排用 **cross-encoder**（或直接用模型）：把「查询 + 文档」拼在一起送进模型，输出一个相关性分数。它慢（每个候选一次推理），但准确率高得多。

这就是两阶段的原因：**用便宜的方法把候选从百万缩到二十，用贵的方法把这二十排好。**

\`\`\`ts title="rerank：阈值 + 兜底" note="关键不是排序，而是「低于阈值就不要」——把不相关的内容喂给模型，比不给更糟。"
export interface Reranker {
  score(query: string, docs: string[]): Promise<number[]>
}

export async function rerank(
  query: string,
  candidates: { chunk: Chunk; score: number }[],
  reranker: Reranker,
  opts: { topN?: number; minScore?: number } = {},
): Promise<{ chunk: Chunk; score: number }[]> {
  const { topN = 4, minScore = 0.3 } = opts
  if (candidates.length === 0) return []

  const scores = await reranker.score(query, candidates.map((c) => c.chunk.text))
  return candidates
    .map((c, i) => ({ chunk: c.chunk, score: scores[i] ?? 0 }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}
\`\`\`

\`minScore\` 这个参数比 \`topN\` 更重要。没有阈值时，即使所有候选都不相关，你也会把 top-4 塞给模型——而模型会努力从无关材料里「找出答案」，产出看似有据、实则编造的回答。**空结果比错误结果好**，这是 RAG 的第一原则。

### 量化：别靠感觉说「检索变好了」

改完管线后必须有指标，否则你无法判断「重排到底有没有用」。三个够用的指标：

| 指标 | 定义 | 说明 |
|---|---|---|
| recall@k | 正确块出现在前 k 条的比例 | 检索阶段的核心指标 |
| hit@1 | 排第一的就是正确块的比例 | 重排阶段的指标 |
| 空答率 | 返回空结果的比例 | 阈值是否过严 |

做法很朴素：准备 20 条真实问题，人工标注每条对应哪个块，然后跑指标。20 条足够看出「改前 0.55、改后 0.80」这种量级的差异，不需要几百条。

\`\`\`ts title="评测：20 条就够起步" note="标注成本是关键——20 条人工标注不到半小时，但能拦住 80% 的「感觉变好了」。"
interface Case {
  query: string
  expectedChunkId: string
}

export function evaluate(
  cases: Case[],
  run: (q: string) => Promise<{ chunk: Chunk }[]>,
  k = 4,
): Promise<{ recallAtK: number; hitAt1: number }> {
  return (async () => {
    let hitK = 0
    let hit1 = 0
    for (const c of cases) {
      const got = await run(c.query)
      if (got.slice(0, k).some((g) => g.chunk.id === c.expectedChunkId)) hitK += 1
      if (got[0]?.chunk.id === c.expectedChunkId) hit1 += 1
    }
    return { recallAtK: hitK / cases.length, hitAt1: hit1 / cases.length }
  })()
}
\`\`\`

:::deep

### 重排为什么能显著提升，而不是「微调」

bi-encoder 的工作方式是：把查询压成一个向量、把文档压成一个向量，然后比较。两个向量各自独立生成，**查询里的「限定词」只能通过训练时学到的模式影响文档选择**。

一个具体例子：查询「2026 年的退款政策」，文档 A 是「退款政策（2026 版）」，文档 B 是「2025 年的退款政策变更说明」。两者的向量都可能与查询很近，因为主题词完全重合。bi-encoder 很难捕捉「年份必须匹配」这种细粒度约束——它把整句压成一个点，细节被平均掉了。

cross-encoder 不做压缩：它把「查询 + 文档」一起送进模型，注意力可以直接对齐「2026」与「2026 版」。这就是为什么它贵但准。

代价也很明确：每个候选一次前向，20 个候选就是 20 次推理。所以它只能用在「候选已经很少」的第二阶段——这也解释了为什么两阶段结构几乎是必然的，而不是一种可选优化。

:::

### 三个工程坑

| 坑 | 现象 | 修法 |
|---|---|---|
| 块太大 | 召回准但答案分散、引用不精确 | 降到 400–600 字，加重叠 |
| 只在建索引时归一化 | 短查询召回差 | 查询也归一化 |
| 无阈值 | 无关问题也强行回答 | 设 \`minScore\`，空结果允许 |

第三条在实践中收益最大。RAG 系统最伤用户信任的不是「答不出来」，而是「答得很像但错了」——后者用户要花更久才发现。

:::warn

### 不要让模型「自己判断相关性」

有人会想：反正后面要调模型，干脆把 20 条都塞给它，让它自己挑相关的。

三个代价：token 成本（20 条可能几万字符）、注意力稀释（L33）、以及**它挑得并不比 cross-encoder 准**。模型在长上下文里对「哪条真正相关」的判断力，弱于一个专门训练过的重排模型。

正确分工是：重排模型负责「选出 3–5 条」，生成模型负责「在这几条里组织答案」。让每个环节做它擅长的事，比让一个大模型包办所有环节更便宜也更准。

:::

### 收束：RAG 的瓶颈通常在检索，不在生成

调这套系统时，一个经验规律：**答错的案例里，大多数是「正确的块根本没被检索出来」，而不是「模型没组织好」。**

所以优化顺序应该是：切块 → 检索（含关键词兜底）→ 重排 → 最后才是提示词。很多人反过来，先改十版提示词，而问题在切块时就已经注定了。

L50 处理一个向量检索的结构性盲区：多跳问题。「A 公司的 CEO 毕业于哪所大学」需要先查 CEO 是谁、再查他的学历——两跳之间没有语义相似性，向量检索一次只能找到一跳。

`,
    null,
    [
      {
        text: '向量检索相对关键词检索的根本差别是？',
        options: ['更快', '不要求字面重合，只要求语义相近', '更便宜', '支持中文'],
        answer: 1,
        explain: '同义词、跨语言、缩写三类失败都源于字面匹配前提。',
        concept: 'vector-rag',
      },
      {
        text: '切块策略中实践效果最好的是？',
        options: ['固定长度', '结构优先 + 长度兜底 + 重叠', '一句一块', '整篇不切'],
        answer: 1,
        explain: '结构保证语义完整，长度兜底控制大小，重叠防边界丢信息。',
        concept: 'vector-rag',
      },
      {
        text: '归一化不一致会导致？',
        options: ['报错', '点积退化成带长度的相似度，长查询系统性得分偏高', '内存泄漏', '索引损坏'],
        answer: 1,
        explain: '建索引与查询两边都要归一化。',
        concept: 'vector-rag',
      },
      {
        text: '重排阶段 `minScore` 阈值为什么比 `topN` 更重要？',
        options: [
          '性能更好',
          '没有阈值时会把无关材料塞给模型，迫使它编造有据的答案',
          '便于调参',
          '减少 token',
        ],
        answer: 1,
        explain: '空结果比错误结果好，是 RAG 第一原则。',
        concept: 'vector-rag',
      },
      {
        text: '为什么两阶段（检索 + 重排）结构几乎是必然的？',
        options: [
          '实现简单',
          'bi-encoder 快但粗、cross-encoder 准但贵，只能用便宜的先缩小候选',
          '协议要求',
          '模型限制',
        ],
        answer: 1,
        explain: '百万条不可能逐条 cross-encode。',
        concept: 'vector-rag',
      },
    ],
    [
      ['bi-encoder', '查询与文档分别编码再比距离，快但粗'],
      ['cross-encoder', '查询与文档拼接后联合编码，准但每个候选一次推理'],
      ['recall@k', '正确块出现在前 k 条的比例'],
      ['重叠切块', '相邻块保留部分重复内容，防边界丢信息'],
    ],
    [
      '块切得过大或过小，后面三步都救不回来。',
      '只归一化文档向量，短查询召回明显变差。',
      '无相关性阈值，对无关问题也强行给出有据的错答案。',
    ],
  ),
  'practice',
)
