import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L137 = withKind(
  L(
    'L137',
    27,
    '实战 Capstone B：从零实现 RAG + Graph RAG 知识库',
    4,
    ['L136'],
    ['cap-b-rag'],
    [
      '从零实现向量检索、一跳图扩展与按 sourceId 去重的混合检索器',
      '写出抽取与匹配两次调用分离的 Citation 构造器与证据包',
      '实现来源多样性自检、按 sourceId 跨子问题复用缓存与检索预算核对',
      '实现按 claim 类型绑定的新鲜度窗口，回填 L135 三项溯源风险',
    ],
    `
### 点开第 7 条引用，原文说的是反例

第一份能跑通的调研报告交出去时，客户只做了一件事：随机点开三条引用。第 7 条指向一份行业白皮书，报告里写「该厂商份额持续上升」，原文那一段写的却是「受监管影响，份额在报告期内出现下滑」。另外两条都能对上。复盘时发现，claim 与 citation 是模型在**同一次调用**里一起生成的：它先写了一句结论，再顺手「配上」一个看起来相关的出处。绑定关系完全靠模型自觉，而模型并没有真的读原文。

同一份报告还有第二个问题：参考文献列了 8 条，其中 6 条是同一篇稿件在不同站的转载。去重键用了文本相似度，可镜像站的正文几乎逐字一致、标题与域名不同，相似度脚本反而认为「内容一致所以该保留一条」——方向没错，却按错误的身份去判断，最终把 6 条都算成了独立来源。L135 的风险登记表里，「引用张冠李戴」「单源伪装多源」「时效过期」三项全在这一次事故里出现了。本课就是把这三项从纸面落到检索与证据构造的代码里。

### 本课唯一要回答的问题

**如何让「一段证据」在被写入报告之前，就带上可核对的原文片段、独立的来源身份与明确的时效标记。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 子问题怎么拆、怎么合并、怎么停 | L136 | 已交付，本课只消费 \`flat\` 与 \`queries\` |
| 三角色分工、评审 verdict、合成 | L138 | 本课只产出证据包，不产出 claim 文本 |
| 引用准确率的人工抽检基线 | L139 | 本课只保证可机械判定的部分 |
| 长文合成的分段缓存与 token 账单 | L140 | 本课的缓存单位是 sourceId，不是章节 |
| 报告渲染与 PDF 锚点 | L141 | 本课只保证 citation 有持久 id 与 span |

### 第一件事：证据包先定契约，再谈检索

L135 的 \`Citation\` 是最小契约（\`id / sourceId / url? / quote / span?\`），\`Claim\` 靠 \`citations\` 数组绑定出处。本课不改这两个类型，只在其上补两类信息：**证据包**（一次检索的全部命中与片段）与**时效**（发布时间）。用交叉类型扩展，避免在图纸层动刀。

| 字段 | 类型 | 谁写 | 谁读 | 不变量 |
|---|---|---|---|---|
| \`sourceId\` | string | 索引入库时 | 去重、多样性、缓存 | 同一文档的镜像站必须映射到同一 id |
| \`quote\` | string | \`extractSpans()\`（确定性） | 人工抽检、渲染锚点 | 必须是原文子串，不由模型生成 |
| \`span\` | \`[number, number]\` | \`extractSpans()\` | 3 秒定位断言 | 与 quote 在段落中的起止一致 |
| \`publishedAt\` | number | 索引元数据 | 新鲜度窗口 | 缺失时不得默认「足够新」 |
| \`section\` | string | L136 规划 | 合成分组 | 检索层不得改写 |

\`\`\`ts title="retrieval/types.ts：证据包契约与扩展的时效字段" note="关键：DatedCitation 用交叉类型扩展 L135 的 Citation，不改图纸层定义。"
export type DatedCitation = Citation & { publishedAt: number }

export type Span = {
  sid: string
  sourceId: string
  quote: string
  offset: [number, number]
  publishedAt: number
  entityIds: string[]
}

export type Hit = {
  sourceId: string
  url?: string
  text: string
  publishedAt: number
  entityId: string
  section: string
  score: number
}

export type EvidencePack = {
  questionId: string
  section: string
  queries: string[]
  hits: Hit[]
  spans: Span[]
  sources: string[]
  diversity: number
  budgetUsed: number
}

export function makeCitation(span: Span, quoteLength = 120): DatedCitation {
  const quote = span.quote.slice(0, quoteLength)
  if (quote.length === 0) throw new Error('empty quote: citation cannot be anchored')
  return {
    id: 'c:' + span.sourceId + ':' + span.offset.join('-'),
    sourceId: span.sourceId, quote, span: span.offset,
    publishedAt: span.publishedAt,
  }
}
\`\`\`

\`makeCitation()\` 里的 \`id\` 由 \`sourceId\` 与 \`offset\` 拼出，不用出现顺序编号。L135 讲过「编号稳定」的理由：渲染时映射成 \`[1]\` \`[2]\` 可以变，持久 id 不能变，否则历史版本与抽检记录对不上。这里把 id 的生成放在证据构造阶段，正是为了让审计日志只存 id。

\`\`\`ts title="retrieval/index.ts：向量索引与一跳图索引" note="关键：两种索引返回同一个 Hit 形状，混合检索才能按来源身份统一去重。"
export class VectorIndex {
  constructor(private docs: Hit[]) {}
  async search(query: string, k: number): Promise<Hit[]> {
    const terms = query.split('').filter((c) => c.trim().length > 0)
    return this.docs
      .map((d) => ({ d, s: overlapScore(terms, d.text) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.d.sourceId.localeCompare(b.d.sourceId))
      .slice(0, k)
      .map((x) => ({ ...x.d, score: x.s }))
  }
}

export function overlapScore(terms: string[], text: string): number {
  const body = new Set(text.split(''))
  const hit = terms.filter((t) => body.has(t)).length
  return terms.length === 0 ? 0 : hit / terms.length
}

export type Edge = { from: string; to: string; relation: string }

export class GraphIndex {
  constructor(private edges: Edge[], private docs: Map<string, Hit>) {}
  async neighbors(entityId: string, hops = 1): Promise<Hit[]> {
    if (hops !== 1) throw new Error('Capstone B 只用一跳扩展')
    const ids = this.edges
      .filter((e) => e.from === entityId || e.to === entityId)
      .map((e) => (e.from === entityId ? e.to : e.from))
    return [...new Set(ids)]
      .map((id) => this.docs.get(id))
      .filter((d): d is Hit => Boolean(d))
  }
}
\`\`\`

\`overlapScore()\` 用字符重合率只是一个可跑通的最小实现，重点不在检索质量，而在**排序必须确定性**：同分按 \`sourceId\` 排，保证同一查询两次召回顺序一致，缓存键才稳定。真实系统里换成向量相似度或 BM25 都不影响本课后续逻辑——\`Hit\` 形状不变，去重与证据构造就不变。这也是 L114 那条「业务契约锁死，实现可换」在检索层的版本。

### 第二件事：混合检索的三步，去重键只能是来源身份

L135 的图纸给过 \`hybridRetrieve()\` 的骨架：向量召回 → 一跳图扩展 → 按 \`sourceId\` 去重。本课补上三件图纸里没写的事：**扩展结果要降权**（否则邻居会淹没原始召回）、**多样性要当场自检**（不能等 L139 评测才发现全是单源）、**检索次数要对齐 L136 的预算**。

\`\`\`ts title="retrieval/hybrid.ts：混合检索、扩展降权与来源去重" note="关键：去重发生在扩展之后、截断之前；先截断再去重会把独立来源挤掉。"
export async function hybridRetrieve(opts: {
  question: SubQuestion
  vector: VectorIndex
  graph: GraphIndex
  k: number
}): Promise<Hit[]> {
  const raw: Hit[] = []
  for (const q of opts.question.queries) {
    raw.push(...await opts.vector.search(q, opts.k))
  }
  const expanded: Hit[] = [...raw]
  for (const h of raw) {
    const neighbors = await opts.graph.neighbors(h.entityId, 1)
    for (const n of neighbors) expanded.push({ ...n, score: n.score * 0.6 })
  }
  const bySource = new Map<string, Hit>()
  for (const h of expanded) {
    const prev = bySource.get(h.sourceId)
    if (!prev || h.score > prev.score) bySource.set(h.sourceId, h)
  }
  return [...bySource.values()]
    .sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId))
    .slice(0, opts.k * 2)
}

export function assertDiversity(hits: Hit[], min = 0.5): number {
  const sources = new Set(hits.map((h) => h.sourceId))
  const ratio = sources.size / Math.max(1, hits.length)
  if (ratio < min) {
    throw new Error('source diversity too low: ' + ratio + ' < ' + min)
  }
  return ratio
}
\`\`\`

去重键用 \`sourceId\` 而不是文本相似度，是开头那次「8 条参考 6 条转载」的直接修复。镜像站文本几乎一致，按相似度去重会把**原始站**留下去掉转载——听起来对，但如果这些镜像站的 \`sourceId\` 在入库时没归一，它们仍然是 6 个独立来源，多样性指标照样虚高。所以真正的动作在入库：\`sourceId\` 必须按规范化域名或文档指纹归一，检索层只负责信任这个字段。L135 说「按 sourceId / 域名去重」，两个词指的是同一件事。

\`\`\`ts title="retrieval/cache.ts：按 sourceId 跨子问题复用" note="关键：缓存键含 queries 的规范化结果，但不改 section；检索层不重新解释规划意图。"
export class SourceCache {
  private store = new Map<string, Hit[]>()
  private hits = 0
  private misses = 0

  private key(q: SubQuestion): string {
    return q.section + '|' + [...q.queries].sort().join('|')
  }
  get(q: SubQuestion): Hit[] | undefined {
    const v = this.store.get(this.key(q))
    if (v) this.hits++
    else this.misses++
    return v
  }
  set(q: SubQuestion, hits: Hit[]): void { this.store.set(this.key(q), hits) }
  stats(): { hits: number; misses: number; rate: number } {
    const total = this.hits + this.misses
    return { hits: this.hits, misses: this.misses,
      rate: total === 0 ? 0 : this.hits / total }
  }
}

export async function buildEvidencePacks(opts: {
  nodes: SubQuestion[]
  vector: VectorIndex
  graph: GraphIndex
  cache: SourceCache
  budget: number
}): Promise<{ packs: EvidencePack[]; overBudget: boolean }> {
  if (opts.nodes.length > opts.budget) {
    throw new Error('retrieval budget exceeded by planning layer')
  }
  const packs: EvidencePack[] = []
  for (const q of opts.nodes) {
    const cached = opts.cache.get(q)
    const hits = cached ?? await hybridRetrieve({ question: q,
      vector: opts.vector, graph: opts.graph, k: 8 })
    if (!cached) opts.cache.set(q, hits)
    const diversity = assertDiversity(hits)
    const spans = extractSpans(hits)
    packs.push({ questionId: q.id, section: q.section, queries: q.queries,
      hits, spans, sources: [...new Set(hits.map((h) => h.sourceId))],
      diversity, budgetUsed: cached ? 0 : 1 })
  }
  return { packs, overBudget: packs.reduce((m, p) => m + p.budgetUsed, 0) > opts.budget }
}
\`\`\`

注意缓存键带 \`section\`：同一个检索意图若被两个章节共享（L136 的 \`incoming\` 记录了这种节点），按 query 单独缓存会命中，但证据包的 \`section\` 只能有一个值。这里让缓存按「章节 + 检索词」分桶，是刻意的：宁可多一次检索，也不让某个章节的证据被贴上另一个章节的标签。**归属正确比省一次检索重要**。

:::deep

### 为什么「抽取」和「匹配」必须是两次调用

开头那次张冠李戴的根因，是模型在同一次生成里既写结论又配出处。它并不是「故意编造」，而是任务本身要求它在没有读原文的情况下建立绑定关系——这在结构上就不可能可靠。

拆成两次之后，两侧的职责完全不同。\`extractSpans()\` 是**确定性函数**：把命中的原文按句号切成片段、算 offset、附 \`sourceId\` 与发布时间，全程不调用模型，因此 \`quote\` 一定是原文子串。\`matchCitation()\` 只做**判定**：给定一句已存在的 claim 与一组 span，逐条检查方向词、数值区间、主题词是否一致，返回匹配或不匹配，不生成任何新文本。绑定关系由代码算出来，模型没有机会「顺手配一个」。

这也解释了为什么引用准确率必须人工抽检：\`matchCitation()\` 能挡住明显的方向相反与数值冲突，但「这段原文是否足以支撑这个结论」仍需要判断力。机械化部分进 CI，判断部分留给人——L135 的三指标分工就是这个意思，本课把它落到了函数边界上。

:::

\`\`\`ts title="retrieval/evidence.ts：确定性抽取与只判定的匹配" note="关键：匹配侧不生成文本；方向词冲突直接判不匹配，避免「结论正确但引用是反例」。"
export function extractSpans(hits: Hit[]): Span[] {
  const out: Span[] = []
  for (const h of hits) {
    let cursor = 0
    const parts = h.text.split('。')
    for (const part of parts) {
      const quote = part.trim()
      if (quote.length < 8) { cursor += part.length + 1; continue }
      out.push({
        sid: 's:' + h.sourceId + ':' + cursor,
        sourceId: h.sourceId, quote,
        offset: [cursor, cursor + quote.length],
        publishedAt: h.publishedAt,
        entityIds: [h.entityId],
      })
      cursor += part.length + 1
    }
  }
  return out
}

const UP = ['增长', '上升', '扩大', '提高']
const DOWN = ['下降', '下滑', '收缩', '减少']

function polarity(text: string): 'up' | 'down' | 'none' {
  const up = UP.some((w) => text.includes(w))
  const down = DOWN.some((w) => text.includes(w))
  if (up && down) return 'none'
  return up ? 'up' : down ? 'down' : 'none'
}

export function matchCitation(claimText: string, span: Span): DatedCitation | null {
  const p = polarity(span.quote)
  const c = polarity(claimText)
  if (p !== 'none' && c !== 'none' && p !== c) return null
  const chars = new Set(span.quote.split(''))
  const overlap = claimText.split('').filter((ch) => chars.has(ch)).length
    / Math.max(1, claimText.length)
  if (overlap < 0.35) return null
  return makeCitation(span)
}
\`\`\`

\`polarity()\` 只是最小可跑版本，用方向词表挡住「原文下滑 / 结论上升」这类最刺眼的错误。真实系统可以换成数值区间比对或 entailment 模型，但**接口不变**：输入一句已存在的 claim 与一个原文 span，输出 \`DatedCitation | null\`，绝不输出新句子。这一点比算法精度更重要，因为 L138 的评审禁令「不得改写 claim 文本」依赖的正是「被校验的文本就是最终文本」。

\`\`\`ts title="retrieval/freshness.ts：窗口绑在 claim 类型上" note="关键：超窗引用不删，标注「数据截至」；趋势类 claim 反而需要旧数据。"
export type ClaimKind = 'market' | 'policy' | 'principle' | 'trend'

const WINDOW_DAYS: Record<ClaimKind, number> = {
  market: 365, policy: 900, principle: 1825, trend: 3650,
}

export function freshness(c: DatedCitation, kind: ClaimKind, now: number): {
  fresh: boolean
  label?: string
} {
  const ageDays = (now - c.publishedAt) / 86_400_000
  if (ageDays <= WINDOW_DAYS[kind]) return { fresh: true }
  const year = new Date(c.publishedAt).getUTCFullYear()
  return { fresh: false, label: '数据截至 ' + year + ' 年' }
}

export function assertFreshnessHandled(citations: DatedCitation[], kind: ClaimKind,
  now: number, reportText: string): void {
  for (const c of citations) {
    const f = freshness(c, kind, now)
    if (!f.fresh && !reportText.includes(f.label ?? '___missing___')) {
      throw new Error('stale citation without cutoff label: ' + c.id)
    }
  }
}
\`\`\`

窗口绑在 \`ClaimKind\` 而不是绑在引用上，是 L135 特意强调过的反直觉点：同一份 2019 年报告，在「五年趋势」claim 里是必需证据，在「当前市场份额」claim 里就必须标注截止时间。若把窗口挂在 citation 上，这条引用会在入库时被一刀切降权，趋势分析直接失去数据。\`assertFreshnessHandled()\` 也不删除旧引用，只检查正文有没有带上「数据截至」——**把时效判断交给读者，而不是替读者默默擦掉**。

### 接缝：证据包怎么变成 L138 的 claim

检索层与合成层之间隔着一个研究员角色，但**证据包的字段语义不该由角色重新解释**。把接缝写死，L138 的评审禁令才有落点：

| 本课交付 | L138 的用法 | 不允许改什么 |
|---|---|---|
| \`spans\` | 研究员逐条调 \`matchCitation()\` 生成 citation | 不得重新检索、不得让模型改写 quote |
| \`sources\` | 多样性指标与 \`contested\` 冲突检测的输入 | 不得把多个来源合并成一条「综合参考」 |
| \`section\` | 合成器按章节分组、按 \`bySection\` 核对密度 | 不得按检索内容重映射章节 |
| \`publishedAt\` | \`ClaimKind\` 窗口与「数据截至」标注 | 不得在缺失时默认「足够新」 |
| \`hits\` 全量 | 评审打回重新取证时查「已经看过哪些来源」 | 不得只保留最终被采用的命中 |

最后一行最容易被当成浪费。实际上 \`hits\` 与 \`spans\` 故意分开保存：\`spans\` 是切好、可引用的原文片段，\`hits\` 是这一轮**看过的全部文档**。评审若判「证据不足、打回重新取证」，研究员需要知道哪些来源已经排除过，否则会在同一批文档里反复打转，把「重搜」成本又付一遍——这正是 L135 成本段里最贵的那一项。把「看过了但没用」也留成数据，重取才有方向。

还有一处与 L136 的呼应：\`EvidencePack.questionId\` 直接取自 \`SubQuestion.id\`，\`section\` 原样透传，\`budgetUsed\` 与 \`retrievalBudget\` 对齐。三者合起来让 L139 能回答「这条证据是哪个子问题、哪一章、第几次检索带回来的」，而不必再从报告正文倒推。研究型 Agent 的追踪对象不是动作，而是**证据的来历**；这个区别决定了 L139 的 span 树要按 \`questionId → sourceId → claim\` 三层来组织，而不是照搬 Capstone A 的「运行时 → 工具」两层。

### 五条验收断言

\`\`\`ts title="evals/l137-retrieval.test.ts：去重、多样性、溯源与时效四类断言" note="关键：断言只用内存索引与手工文档，不依赖真实向量库或模型。"
import assert from 'node:assert/strict'

function hit(sourceId: string, text: string, publishedAt: number,
  entityId = 'e1', section = '市场'): Hit {
  return { sourceId, text, publishedAt, entityId, section, score: 1 }
}

function t1_dedupeBySourceNotByText() {
  const docs = [
    hit('s-a', '原文说份额出现下滑，受监管影响明显。', 1_700_000_000_000),
    hit('s-a-mirror', '原文说份额出现下滑，受监管影响明显。', 1_700_000_000_000, 'e2'),
    hit('s-b', '另一家机构给出不同的统计口径与区间。', 1_700_000_000_000, 'e3'),
  ]
  const bySource = new Map<string, Hit>()
  for (const d of docs) if (!bySource.has(d.sourceId)) bySource.set(d.sourceId, d)
  assert.equal(bySource.size, 3, '镜像站入库时未归一，仍被算作独立来源')
  const normalized = new Map<string, Hit>()
  for (const d of docs) {
    const id = d.sourceId.replace('-mirror', '')
    if (!normalized.has(id)) normalized.set(id, { ...d, sourceId: id })
  }
  assert.equal(normalized.size, 2, 'sourceId 归一后镜像站被合并')
}

function t2_quoteIsAlwaysOriginalSubstring() {
  const docs = [hit('s-a', '该厂商份额持续上升，主要来自渠道扩张。第二季度数据已复核。', 1_700_000_000_000)]
  const spans = extractSpans(docs)
  assert.ok(spans.length >= 1)
  for (const s of spans) assert.ok(docs[0]!.text.includes(s.quote))
  const c = makeCitation(spans[0]!)
  assert.ok(c.id.startsWith('c:s-a:'))
}

function t3_polarityMismatchRejected() {
  const span: Span = { sid: 's1', sourceId: 's-a',
    quote: '受监管影响，份额在报告期内出现下滑', offset: [0, 18],
    publishedAt: 1_700_000_000_000, entityIds: ['e1'] }
  assert.equal(matchCitation('该厂商份额持续上升', span), null)
  assert.ok(matchCitation('该厂商份额出现下滑', span))
}

async function t4_budgetAndCache() {
  const docs = [hit('s-a', '市场规模与增速的统计口径说明。', 1_700_000_000_000, 'e1'),
    hit('s-b', '技术路线与架构对比的说明文字。', 1_700_000_000_000, 'e2', '技术')]
  const vector = new VectorIndex(docs)
  const graph = new GraphIndex([{ from: 'e1', to: 'e2', relation: 'related' }],
    new Map(docs.map((d) => [d.entityId, d])))
  const cache = new SourceCache()
  const q: SubQuestion = { id: 'q1', text: '国内市场规模与增速',
    queries: ['市场规模', '增速'], section: '市场', depth: 0, parentId: null, children: [] }
  const first = await buildEvidencePacks({ nodes: [q, q], vector, graph, cache, budget: 2 })
  assert.equal(first.overBudget, false)
  assert.equal(cache.stats().hits, 1, '第二个相同节点应命中缓存')
  assert.ok(first.packs[0]!.diversity >= 0.5)
}

function t5_freshnessBoundToClaimKind() {
  const c: DatedCitation = { id: 'c1', sourceId: 's-a', quote: '旧数据',
    publishedAt: Date.UTC(2019, 0, 1) }
  const now = Date.UTC(2026, 0, 1)
  assert.equal(freshness(c, 'market', now).fresh, false)
  assert.equal(freshness(c, 'trend', now).fresh, true)
  assert.throws(() => assertFreshnessHandled([c], 'market', now, '没有标注的正文'),
    /stale citation/)
}

t1_dedupeBySourceNotByText()
t2_quoteIsAlwaysOriginalSubstring()
t3_polarityMismatchRejected()
await t4_budgetAndCache()
t5_freshnessBoundToClaimKind()
console.log('L137 retrieval: 5/5 passed')
\`\`\`

第一条断言故意先展示「未归一就是 3 个来源」再展示「归一后是 2 个」，把「去重键用 sourceId」和「sourceId 本身必须可信」这两层分开。很多人只做前者，结果多样性指标依然虚高——指标算对了，输入身份是错的。

:::warn

### 三个检索层翻车点

**一、先截断再去重。** 向量召回取 top-k 后直接截断，镜像站占满名额，真正的独立来源被挤掉，扩展与多样性检查都救不回来。顺序必须是：召回 → 扩展 → 按来源去重 → 再截断。

**二、扩展结果不降权。** 一跳邻居往往数量远大于原始命中，若与原始命中同权重排序，报告会被「相关实体」带偏到主题之外。本课给邻居乘 0.6，数值可调，但**降权这个动作不能省**。

**三、让匹配侧生成文本。** 只要 \`matchCitation()\` 返回的是「模型改写后更通顺的一句话」，被校验文本与发布文本就不再是同一句，L138 的评审禁令立刻失效。匹配侧只能返回 \`Citation | null\`。

:::

### 风险登记表回填与分工

| L135 风险项 | 本课进展 | 状态 |
|---|---|---|
| 引用张冠李戴 | 抽取与匹配两次分离，\`quote\` 是原文子串，方向词冲突判不匹配 | 机械部分闭合，语义支撑仍待 L139 人工抽检 |
| 单源伪装多源 | 按 \`sourceId\` 去量 + 入库归一 + \`assertDiversity()\` 当场自检 | 已闭合 |
| 时效过期 | 窗口绑 \`ClaimKind\`，超窗不删而标注「数据截至」 | 已闭合 |
| 冲突被抹平 | 证据包保留多源命中，为 L138 的 \`contested\` 提供输入 | 待 L138 |
| 报告注水 | \`budgetUsed\` 与 L136 预算对齐，避免无效重搜 | 与 L136/L138 共同闭合 |

与相邻课的边界：L135 给出 \`Citation\` / \`Claim\` 契约与 \`hybridRetrieve()\` 图纸，L136 给出 \`SubQuestion\` / \`PlanResult\` / \`retrievalBudget\`，本课不改任何一个，只新增 \`retrieval/\` 下的索引、混合检索、缓存、证据构造与时效窗口，产出 \`EvidencePack\`。L138 消费 \`packs\` 里的 \`spans\` 与 \`sources\` 来生成 claim 并做评审，**不重新检索、不改 \`section\`、不自行拆词**；它拿到的每个 span 都已经是可点开的原文片段。L139 消费 \`sourceDiversity()\` 与抽检记录做质量门禁，L140 把 \`SourceCache\` 的命中率接进成本看板。

一句话记住本课：**证据在进报告之前就要有原文片段、独立来源身份和时效标签；任何一步交给模型「顺手配上」，溯源就退化成装饰。**

:::tip

### 判断检索层是否真的可信的三个问题

把同一篇稿件换个 \`sourceId\` 塞进索引，多样性指标有没有被 \`sourceId\` 归一拦下；造一条「原文下滑 / 结论上升」，\`matchCitation()\` 有没有返回 null；把一份 2019 年来源分别放进「当前份额」与「五年趋势」两种 claim，前者有没有强制标注「数据截至」而后者没有。三个都成立，L138 才有能拿去评审的证据包。只看到「召回了很多文档」，什么都还没证明。

:::
`,
    null,
    [
      {
        text: '为什么引用准确率只能人工抽检，不能进 CI 自动判定？',
        options: [
          '人工更便宜',
          '「这段原文是否足以支撑这个结论」需要判断力；机械部分只能挡住方向相反与数值冲突',
          'CI 不能读文件',
          '抽检更省时间',
        ],
        answer: 1,
        explain: '机械化部分进 CI，判断部分留给人，这是 L135 三指标的分工。',
        concept: 'cap-b-rag',
      },
      {
        text: '混合检索的正确顺序是？',
        options: [
          '截断 → 去重 → 扩展',
          '召回 → 一跳扩展（降权）→ 按 sourceId 去重 → 截断',
          '去重 → 召回 → 截断',
          '扩展 → 截断 → 去重',
        ],
        answer: 1,
        explain: '先截断会让镜像站占满名额，独立来源被挤掉。',
        concept: 'cap-b-rag',
      },
      {
        text: '新鲜度窗口为什么绑在 claim 类型而不是引用上？',
        options: [
          '引用字段太少',
          '同一份旧报告在趋势 claim 里是必需证据，在「当前份额」claim 里才需标注截止时间',
          '方便缓存',
          '模型要求这样',
        ],
        answer: 1,
        explain: '一刀切降权会毁掉纵向分析。',
        concept: 'cap-b-rag',
      },
      {
        text: '抽取与匹配两次调用分离，最关键的不变量是？',
        options: [
          '匹配侧速度更快',
          'quote 必须是原文子串，匹配侧只返回 Citation 或 null，绝不生成新文本',
          '减少模型调用次数',
          '让检索结果更相关',
        ],
        answer: 1,
        explain: '被校验的文本必须等于最终发布的文本。',
        concept: 'cap-b-rag',
      },
    ],
    [
      ['证据包', '一次检索的命中、原文片段、独立来源与多样性自检结果'],
      ['来源身份', 'sourceId 在入库时归一，镜像站不得算独立来源'],
      ['两次调用分离', '确定性抽取原文片段 + 只判定的匹配，杜绝顺手配出处'],
      ['扩展降权', '一跳邻居乘 0.6，避免相关实体淹没原始召回'],
      ['新鲜度窗口', '按 ClaimKind 设窗口，超窗标注「数据截至」而非删除'],
      ['检索预算', '与 L136 的 retrievalBudget 对齐，缓存按章节加检索词分桶'],
    ],
    [
      '让模型在同一次调用里既写结论又配出处，绑定关系靠自觉，出现「结论上升、原文下滑」。',
      '用文本相似度做去重键，镜像站被当成多源，多样性指标虚高。',
      '先 top-k 截断再去重，独立来源被镜像站挤出候选集。',
      '匹配侧顺手把句子改通顺，被校验文本与发布文本不再是同一句。',
      '把新鲜度窗口挂在引用上，趋势分析所需的旧数据被一刀切降权。',
    ],
  ),
  'capstone',
)
