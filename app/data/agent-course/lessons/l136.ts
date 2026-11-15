import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L136 = withKind(
  L(
    'L136',
    27,
    '实战 Capstone B：从零实现深度推理与规划引擎（ToT / GoT / 规划）',
    4,
    ['L135'],
    ['cap-b-reasoning'],
    [
      '从零实现 ToT 分支展开与确定性打分剪枝，产出可检索的子问题集',
      '实现 GoT 重复节点合并与三类停止判据，把检索预算锁在规划层',
      '写出可检索性硬校验、子问题不相交与深度上限的验收断言',
      '回填 L135 风险表「报告注水」在问题粒度上的成因',
    ],
    `
### 拆了 200 个子问题，报告里只有 20 条 claim

L135 定下「分解 → 检索 → 综合 → 溯源」四段管线时，最早跑通的一版规划器很漂亮：把一个主题展开成一棵三层的树，每层再让模型提几个角度，最后得到 200 多个子问题。检索器老老实实跑了 200 多次，缓存命中率却接近零——因为「国内市场规模」「我国市场体量」「中国市场有多大」是同一个问题的三种说法。最后报告 8000 字、只有 20 条 claim，其余全是过渡与复述。

复盘时发现两个独立的错。第一，**规划层没有可检索性判据**：它只问「这个子问题是不是有意义」，而模型对任何问法都会说有意义。第二，**树结构把重复当成了分支**：同一个事实在两条路径下被问了两遍，检索预算直接翻倍，L135 强调的「按 sourceId 缓存跨子问题复用」也就无从生效。L19 的 ToT、L20 的 GoT 讲过分支与图合并的范式，但那两课关心的是推理质量；在研究型 Agent 里，规划器真正要交付的是**一份能被检索器一次回答、彼此不相交、且能停下来**的问题集。

### 本课唯一要回答的问题

**如何让分解在「问得够全」和「问得能答、不重复、会停」之间收敛，并把结果交给 L137 当作可缓存的输入。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| ToT / GoT 的范式原理与适用边界 | L19 / L20 | 本课只把分支与合并用于产出问题集 |
| 向量索引、图扩展、去重实现 | L137 | 本课只保证问题可检索、不重复 |
| 角色分工、评审与合成 | L138 | 本课不产出 claim，只产出子问题 |
| claim / citation 契约 | L135 | 已定，本课不触碰 |
| 长文 token 与合成成本 | L140 | 本课的预算是检索次数，不是 token |

### 第一件事：可检索性必须是硬校验，不是模型自评

L135 的图纸里写过「可检索性由能否构造出检索词判定，而不是让模型自我感觉够具体」。落地时要把这句话变成一个不依赖模型的函数：每个子问题必须自带至少两个检索词，词不能是主题本身，也不能全是停用词，且词与词的字符重合度不能太高。三条都不通过，这个节点直接丢弃，不进入检索队列。

| 判据 | 具体检查 | 为什么需要 |
|---|---|---|
| 检索词非空且 ≥2 | \`queries.length >= 2\` | 一个词往往就是主题原样回填 |
| 不含主题原串 | 检索词不得等于或包含完整主题 | 防止「AI 助手市场 → 查 AI 助手市场」的空分解 |
| 词间差异 | 两两字符集合的 Jaccard 低于阈值 | 「市场规模」「市场体量」算两个词但几乎同义 |
| 归属明确 | \`section\` 必须属于大纲已有章节 | 无归属的子问题无法被 L138 合成 |
| 深度有界 | \`depth <= MAX_DEPTH\`（3） | 无限拆分是规划器最常见失控方式 |

\`\`\`ts title="planning/types.ts：子问题契约与三类停止原因" note="关键：queries 是检索器唯一输入；没有检索词的节点在类型上仍可构造，但会被 assertSearchable 拦下。"
export const MAX_DEPTH = 3

export type SubQuestion = {
  id: string
  text: string
  queries: string[]
  section: string
  depth: number
  parentId: string | null
  children: SubQuestion[]
}

export type StopReason = 'depth-limit' | 'low-marginal-gain' | 'budget-exhausted' | 'converged'

export type PlanResult = {
  topic: string
  roots: SubQuestion[]
  flat: SubQuestion[]
  stopReason: StopReason
  expanded: number
  pruned: number
  merged: number
  retrievalBudget: number
}

export type Outline = { sections: string[]; claimDensityMin: number }

const STOP_WORDS = new Set(['的', '了', '和', '与', '及', '在', '对', '是', '有', '如何', '什么', '哪些'])

export function isSearchable(q: SubQuestion, topic: string, outline: Outline): boolean {
  if (q.queries.length < 2) return false
  if (!q.queries.every((s) => s.trim().length >= 2)) return false
  if (q.queries.some((s) => s.includes(topic) || topic.includes(s))) return false
  if (!outline.sections.includes(q.section)) return false
  for (let i = 0; i < q.queries.length; i++) {
    for (let j = i + 1; j < q.queries.length; j++) {
      if (jaccard(q.queries[i]!, q.queries[j]!) > 0.75) return false
    }
  }
  return true
}

export function jaccard(a: string, b: string): number {
  const sa = new Set(a.split('').filter((c) => !STOP_WORDS.has(c)))
  const sb = new Set(b.split('').filter((c) => !STOP_WORDS.has(c)))
  let inter = 0
  for (const c of sa) if (sb.has(c)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 1 : inter / union
}
\`\`\`

\`isSearchable()\` 里最容易被删掉的是「不含主题原串」这一条。它看着很严，却挡住了分解最常见的退化：模型把一个宽泛主题换几种说法重述一遍，每个子问题的检索词都还是主题本身，检索器于是把同一批文档召回 N 次。Jaccard 检查则是第二道网——中文里「市场规模」和「市场体量」只差两个字，字符重合度极高，判成同一个检索意图比放过去更省预算。这两个函数都是确定性的，不调用模型，因此规划结果能进评测集复现。

### 第二件事：ToT 展开，剪枝用确定性分数

展开用模型，剪枝不用。理由与 L132 的评测基线一样：如果打分也交给模型，同一主题两次规划会给出不同问题集，L137 的检索缓存与 L138 的评测集都无法复现。模型只负责「提出候选角度」，剪枝分数由结构属性算出来：检索词质量、与已有节点的独立性、预期证据可得性（由章节与检索词是否指向可查实体近似）。

\`\`\`ts title="planning/expand.ts：ToT 展开与确定性剪枝" note="关键：模型只产出候选文本；是否保留由 score() 算，同输入必得同结果。"
export type Candidate = { text: string; queries: string[]; section: string }

export type LlmJson = (prompt: string, vars: Record<string, unknown>) => Promise<{ candidates: Candidate[] }>

export function score(c: Candidate, topic: string, existing: SubQuestion[], outline: Outline): number {
  const probe: SubQuestion = { id: 'probe', text: c.text, queries: c.queries,
    section: c.section, depth: 1, parentId: null, children: [] }
  if (!isSearchable(probe, topic, outline)) return -1
  const overlap = existing.reduce((m, e) => Math.max(m, jaccard(c.text, e.text)), 0)
  const independence = 1 - overlap
  const queryQuality = Math.min(1, c.queries.length / 3)
  const sectionFit = outline.sections.includes(c.section) ? 1 : 0
  return 0.5 * independence + 0.3 * queryQuality + 0.2 * sectionFit
}

export async function expand(opts: {
  topic: string
  parent: SubQuestion | null
  existing: SubQuestion[]
  outline: Outline
  llm: LlmJson
  width: number
}): Promise<{ kept: SubQuestion[]; pruned: number }> {
  const depth = opts.parent ? opts.parent.depth + 1 : 0
  if (depth >= MAX_DEPTH) return { kept: [], pruned: 0 }
  const raw = await opts.llm('PLAN_PROMPT', { topic: opts.topic,
    parent: opts.parent?.text ?? null, depth })
  const ranked = raw.candidates
    .map((c) => ({ c, s: score(c, opts.topic, opts.existing, opts.outline) }))
    .filter((x) => x.s >= 0.45)
    .sort((a, b) => b.s - a.s || a.c.text.localeCompare(b.c.text))
    .slice(0, opts.width)
  const kept = ranked.map((x, i) => ({
    id: [opts.topic, depth, i, x.c.section].join(':'),
    text: x.c.text, queries: x.c.queries, section: x.c.section,
    depth, parentId: opts.parent?.id ?? null, children: [],
  }))
  return { kept, pruned: raw.candidates.length - kept.length }
}
\`\`\`

\`sort()\` 里用 \`localeCompare\` 做稳定的次级排序，是为了让同分候选的顺序也不依赖模型返回顺序。这类细节看着琐碎，但 L137 的检索缓存按 \`sourceId\` 与查询词建键，问题集顺序一变，缓存键跟着变，命中率就会无端波动。**规划层的确定性不是洁癖，是下游缓存能生效的前提。**

### 第三件事：GoT 合并重复节点，把树压成图

ToT 展开天然会产生重复：不同父节点下的子节点可能问的是同一件事。若不合并，L137 会为它们各做一次混合检索与一跳扩展，预算翻倍还拿不到新证据。做法是给每个节点算一个**规范化键**（检索词排序后拼接 + 章节），同键节点合并成一个「代表节点」，并把被合并节点的父引用记录为额外的入边——树因此变成图，但对外仍然暴露一份扁平的问题清单。

\`\`\`ts title="planning/merge.ts：规范化键与等价类合并" note="关键：合并保留所有入边，L138 才知道这条结论被哪几个章节共同需要。"
export type MergedNode = SubQuestion & { incoming: string[]; mergedFrom: string[] }

export function normalizeKey(q: SubQuestion): string {
  const terms = [...q.queries].map((s) => s.trim().toLowerCase()).sort()
  return q.section + '|' + terms.join('|')
}

export function mergeEquivalent(flat: SubQuestion[]): { nodes: MergedNode[]; merged: number } {
  const buckets = new Map<string, MergedNode>()
  for (const q of flat) {
    const key = normalizeKey(q)
    const found = buckets.get(key)
    const incoming = q.parentId ? [q.parentId] : []
    if (found) {
      found.mergedFrom.push(q.id)
      found.incoming.push(...incoming)
      continue
    }
    buckets.set(key, { ...q, incoming: [...incoming], mergedFrom: [q.id] })
  }
  const nodes = [...buckets.values()]
  for (const n of nodes) n.incoming = [...new Set(n.incoming)]
  return { nodes, merged: flat.length - nodes.length }
}

export function assertDisjoint(nodes: MergedNode[]): void {
  const keys = nodes.map(normalizeKey)
  if (new Set(keys).size !== keys.length) throw new Error('duplicate normalized keys remain')
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i]!.section === nodes[j]!.section
        && jaccard(nodes[i]!.text, nodes[j]!.text) > 0.8) {
        throw new Error('overlapping subquestions: ' + nodes[i]!.id + ' / ' + nodes[j]!.id)
      }
    }
  }
}
\`\`\`

\`normalizeKey()\` 用**排序后的检索词**而不是问题文本，这是刻意的：「国内市场规模」与「我国市场体量」文本不同，但检索词若都归一到「市场规模 / 份额」这类词，就能判为同一检索意图。反过来，若用文本相似度做键，两个问法略有差异但检索词相同的节点合并不掉，预算照样浪费。这也延续了 L135 的一条判据：**来源身份与检索意图都要用稳定标识，不要用表面文本**。

\`incoming\` 保留所有入边，是因为 L138 的合成器需要知道「这条证据被哪几个章节共同需要」。只留一个父节点会让某个章节突然失去它应有的引用，评审时看起来像漏取证。合并的目的是省检索，不是省归属。

### 第四件事：三类停止判据，且必须有明确原因

无限拆分通常不是因为深限没设，而是因为「每轮都还有新东西」——模型总能再提几个角度。所以除了 \`MAX_DEPTH\`，还要有边际收益判据：新一轮候选与已有集合的平均重合度超过阈值就停。第三种是预算：检索次数上限在规划层就锁死，不留给检索器自己决定。

\`\`\`ts title="planning/decompose.ts：主循环与三类停止" note="关键：停止原因写进 PlanResult，评测才能断言「是因为收敛停的，不是因为没钱硬停」。"
export async function decompose(opts: {
  topic: string
  outline: Outline
  llm: LlmJson
  width: number
  retrievalBudget: number
}): Promise<PlanResult> {
  const all: SubQuestion[] = []
  let frontier: SubQuestion[] = []
  let expanded = 0
  let pruned = 0
  let stopReason: StopReason = 'converged'

  const first = await expand({ topic: opts.topic, parent: null, existing: [],
    outline: opts.outline, llm: opts.llm, width: opts.width })
  frontier = first.kept
  all.push(...frontier)
  pruned += first.pruned

  while (frontier.length > 0) {
    if (frontier[0]!.depth + 1 >= MAX_DEPTH) { stopReason = 'depth-limit'; break }
    if (all.length + frontier.length * opts.width > opts.retrievalBudget) {
      stopReason = 'budget-exhausted'; break
    }
    const nextRound: SubQuestion[] = []
    let marginal = 0
    for (const parent of frontier) {
      const r = await expand({ topic: opts.topic, parent, existing: all,
        outline: opts.outline, llm: opts.llm, width: opts.width })
      pruned += r.pruned
      expanded += r.kept.length
      for (const child of r.kept) {
        marginal = Math.max(marginal,
          all.reduce((m, e) => Math.max(m, jaccard(child.text, e.text)), 0))
      }
      parent.children = r.kept
      nextRound.push(...r.kept)
    }
    if (marginal > 0.72 || nextRound.length === 0) {
      stopReason = marginal > 0.72 ? 'low-marginal-gain' : 'converged'
      break
    }
    all.push(...nextRound)
    frontier = nextRound
  }

  const { nodes, merged } = mergeEquivalent(all)
  assertDisjoint(nodes)
  for (const n of nodes) {
    if (!isSearchable(n, opts.topic, opts.outline)) {
      throw new Error('unsearchable node survived: ' + n.id)
    }
  }
  return { topic: opts.topic, roots: all.filter((q) => q.parentId === null),
    flat: nodes, stopReason, expanded, pruned, merged,
    retrievalBudget: nodes.length }
}
\`\`\`

\`retrievalBudget: nodes.length\` 是这套设计最实在的产出：**规划结束时，检索次数就是合并后的节点数**，可以在启动检索前精确报价。L135 的成本段说过「钱主要花在重搜与重写」，其中「重搜」的根源正是重复子问题；把它压在规划层，比在检索层加缓存更根本——缓存只能省掉已经发生的重复，合并则让重复根本不产生。

\`\`\`ts title="planning/report.ts：规划层的可验收输出" note="关键：report 不含任何 claim，只回答「要查什么、查几次、为什么停」。"
export function planReport(p: PlanResult): {
  questions: number
  bySection: Record<string, number>
  estimatedRetrievals: number
  stopReason: StopReason
  prunedRatio: number
} {
  const bySection: Record<string, number> = {}
  for (const q of p.flat) bySection[q.section] = (bySection[q.section] ?? 0) + 1
  const totalCandidates = p.expanded + p.pruned + p.merged
  return {
    questions: p.flat.length,
    bySection,
    estimatedRetrievals: p.retrievalBudget,
    stopReason: p.stopReason,
    prunedRatio: totalCandidates === 0 ? 0 : p.pruned / totalCandidates,
  }
}
\`\`\`

:::deep

### 规划器的产出是问题集，不是答案，也不是计划文本

一个常见的跑偏是让规划器顺手给出「初步结论」或「研究思路」，觉得这样 downstream 更省事。这在研究型 Agent 里是危险的：一旦规划层写下了带事实性的句子，它就会以「上下文」的身份流进合成器，而它没有 citation、没有经过评审，L135 的 \`assertPublishable()\` 也管不到它——因为它不是 claim。**溯源体系最怕的不是错误结论，而是绕过体系的正确句子**。

所以本课把 \`PlanResult\` 的字段限死：子问题、检索词、章节、深度、停止原因、计数。全都是「要查什么」的元数据，没有一个字段能承载事实陈述。规划层给出的 \`bySection\` 统计还要被 L138 用来做 claim 密度约束：某个章节若分到 8 个子问题却只产出 1 条 claim，说明这一章要么问得太碎、要么证据不足，评审应当把它单独打回，而不是让它静静占着篇幅。

换个角度说，ToT 与 GoT 在这里的价值也不是「推理更深」，而是**把检索预算变成可规划的对象**：分支决定覆盖面，剪枝决定不浪费，合并决定不重复，停止判据决定不会无限摊开。这四个动作合起来，才是 L137 能稳定复用的输入。

:::

### 接缝：L137 到底该消费哪几个字段

规划器与检索器之间最容易出问题的不是接口缺失，而是**下游自作主张地重新解释上游字段**。把接缝钉死，后面三课才不会互相猜：

| 本课交付 | L137 的用法 | 不允许改什么 |
|---|---|---|
| \`flat\`（合并后的节点） | 每个节点恰好触发一次混合检索 | 不得再自行拆词或补一轮子问题 |
| \`queries\` | 向量召回的查询串与缓存键来源 | 不得改写成自由文本让模型临场发挥 |
| \`section\` | 证据包的章节归属，供 L138 按章分组 | 不得按检索结果重新映射章节 |
| \`retrievalBudget\` | 检索次数上限与缓存命中核对 | 不得因召回不足就静默扩容 |
| \`incoming\` | 同一证据被多个章节共享的入边 | L138 引用时不得只挂一个章节 |

第三条尤其值得展开：检索回来的文档可能同时谈到市场与技术，若 L137 按内容把 \`section\` 改成「技术」，L138 合成时「市场」章节就会少一条本该有的 claim，评审只会看到证据不足，根因却藏在检索层。**章节归属是规划时定下的意图，不是检索后的分类结果**——这两者混淆，是「报告注水」最隐蔽的一种成因：不是写得多，而是问了却没落到该落的章节。

### 五条验收断言

\`\`\`ts title="evals/l136-planning.test.ts：确定性、可检索性、不相交与停止四类断言" note="关键：用固定假模型，规划结果必须逐字可复现；任何一层交给模型打分都会让断言失效。"
import assert from 'node:assert/strict'

const outline: Outline = { sections: ['市场', '技术', '政策'], claimDensityMin: 4 }

const fakeLlm: LlmJson = async (_prompt, vars) => {
  const depth = Number(vars.depth ?? 0)
  if (depth === 0) return { candidates: [
    { text: '国内市场规模与增速', queries: ['市场规模', '增速'], section: '市场' },
    { text: '主流技术路线对比', queries: ['技术路线', '架构对比'], section: '技术' },
    { text: '监管政策演进', queries: ['监管政策', '合规要求'], section: '政策' },
  ] }
  return { candidates: [
    { text: '按区域拆分的份额', queries: ['区域份额', '地区分布'], section: '市场' },
    { text: '开源实现活跃度', queries: ['开源项目', '提交活跃度'], section: '技术' },
  ] }
}

function t1_searchableRejectsTopicEcho() {
  const bad: SubQuestion = { id: 'b', text: 'AI 编程助手市场如何',
    queries: ['AI 编程助手市场', '市场'], section: '市场',
    depth: 0, parentId: null, children: [] }
  assert.equal(isSearchable(bad, 'AI 编程助手市场', outline), false)
  const good: SubQuestion = { ...bad, queries: ['市场规模', '增速'] }
  assert.equal(isSearchable(good, 'AI 编程助手市场', outline), true)
}

function t2_scoreIsDeterministicAndPrunes() {
  const c: Candidate = { text: '国内市场规模与增速',
    queries: ['市场规模', '增速'], section: '市场' }
  const existing: SubQuestion[] = []
  assert.equal(score(c, 'AI 编程助手市场', existing, outline),
    score(c, 'AI 编程助手市场', existing, outline))
  const dup: Candidate = { ...c, text: '国内市场规模以及增速' }
  assert.ok(score(dup, 'AI 编程助手市场', [ {
    id: 'x', text: c.text, queries: c.queries, section: c.section,
    depth: 0, parentId: null, children: [],
  } ], outline) < score(c, 'AI 编程助手市场', existing, outline))
}

function t3_mergeCollapsesDuplicateRetrievalIntent() {
  const base: SubQuestion = { id: 'a', text: '国内市场规模与增速',
    queries: ['市场规模', '增速'], section: '市场', depth: 0,
    parentId: null, children: [] }
  const twin: SubQuestion = { ...base, id: 'b', text: '我国市场体量及增长',
    parentId: 'root-1' }
  const r = mergeEquivalent([base, twin])
  assert.equal(r.nodes.length, 1)
  assert.equal(r.merged, 1)
  assert.equal(r.nodes[0]!.mergedFrom.length, 2)
  assert.deepEqual(r.nodes[0]!.incoming, ['root-1'])
  assertDisjoint(r.nodes)
}

async function t4_decomposeStopsWithExplicitReason() {
  const p = await decompose({ topic: 'AI 编程助手市场', outline, llm: fakeLlm,
    width: 3, retrievalBudget: 5 })
  assert.ok(p.flat.length > 0)
  assert.equal(p.retrievalBudget, p.flat.length)
  assert.ok(['depth-limit', 'low-marginal-gain', 'budget-exhausted', 'converged']
    .includes(p.stopReason))
  for (const q of p.flat) {
    assert.ok(q.depth < MAX_DEPTH)
    assert.ok(isSearchable(q, 'AI 编程助手市场', outline))
  }
  assertDisjoint(p.flat as MergedNode[])
}

function t5_planReportCarriesNoFactualText() {
  const p: PlanResult = { topic: 'T', roots: [], flat: [], stopReason: 'converged',
    expanded: 0, pruned: 0, merged: 0, retrievalBudget: 0 }
  const r = planReport(p)
  assert.deepEqual(Object.keys(r).sort(),
    ['bySection', 'estimatedRetrievals', 'prunedRatio', 'questions', 'stopReason'].sort())
  assert.equal(r.questions, 0)
}

t1_searchableRejectsTopicEcho()
t2_scoreIsDeterministicAndPrunes()
t3_mergeCollapsesDuplicateRetrievalIntent()
await t4_decomposeStopsWithExplicitReason()
t5_planReportCarriesNoFactualText()
console.log('L136 planning: 5/5 passed')
\`\`\`

第五条断言用字段白名单把「规划输出不含事实文本」写成可失败检查。它防的是最隐蔽的那种退化：有人为了调试方便往 \`planReport()\` 里加一个 \`summary\` 字段，里面写一句「市场预计增长」，这句话随后被塞进合成提示词，L135 的 \`assertPublishable()\` 完全看不见它。**溯源体系的漏洞常常不是被攻破的，是被一个「方便」字段绕开的。**

:::warn

### 三个分解翻车点

**一、让模型给候选打分。** 同一主题两次规划得到不同问题集，缓存键漂移、评测无法复现、停止原因也没法断言。模型只负责提出候选文本，剪枝分数必须确定性计算。

**二、用文本相似度做合并键。** 「国内市场规模」与「我国市场体量」文本差异不小，但检索意图相同；反过来两个不同章节的问题可能措辞相近却被误合并。用排序后的检索词加章节做规范化键，比相似度稳定得多。

**三、合并时只留一个父节点。** 省了检索却丢了归属，某个章节会突然失去应有的引用，L138 的评审只会看到「证据不足」，查不到根因在规划层。\`incoming\` 必须保留所有入边。

:::

### 风险登记表回填与分工

| L135 风险项 | 本课进展 | 状态 |
|---|---|---|
| 报告注水 | 问题粒度受可检索性与独立性约束，合并后按 \`bySection\` 交给 L138 做 claim 密度校验 | 规划层已闭合，合成层待 L138 |
| 单源伪装多源 | 重复检索意图被合并，减少同一文档的反复召回 | 与 L137 的 sourceId 去重共同闭合 |
| 引用张冠李戴 | 本课不产出 claim，检索词明确化降低歧义召回 | 主要靠 L137/L138 |

与相邻课的边界：L135 给出 \`decompose()\` 的图纸与 \`MAX_DEPTH = 3\`、可检索性判据，本课把它实现为 \`planning/\` 下的展开、剪枝、合并与停止四段，产出 \`PlanResult\`，**不产出任何 claim 或 citation**。L137 消费 \`flat\` 节点与 \`queries\` 作为混合检索输入，并用 \`retrievalBudget\` 做缓存与预算核对；它不需要知道树或图是怎么长出来的。L138 消费 \`bySection\` 与章节归属做 claim 密度与合成大纲，不关心剪枝分数。

再往后，L139 会把本课「确定性打分」的思路扩到评测与追踪，L140 处理长文成本，L141 负责交付与复盘。本课不复用 Capstone A 的任何组件——执行型 Agent 的预算单位是「动作次数」，研究型的预算单位是「检索次数」，两者的门禁不能互相套用；但「把约束写进类型」「评测以负例为主」这两条方法是一致的。

一句话记住本课：**规划器交付的不是更深的推理，而是一份能被检索器一次回答、彼此不相交、且知道为什么停下来的问题集。**

:::tip

### 判断规划引擎是否做完的三个问题

把主题原样回填成检索词，\`isSearchable()\` 有没有拒绝；造两个措辞不同但检索词相同的子问题，\`mergeEquivalent()\` 有没有把它们并成一个节点并保留两条入边；用同一个假模型跑两次 \`decompose()\`，\`PlanResult\` 有没有逐字一致且带明确停止原因。三个都成立，L137 的缓存才有稳定输入。只看到一棵漂亮的分支树，什么都还没证明。

:::
`,
    null,
    [
      {
        text: '为什么规划层的剪枝打分必须是确定性的？',
        options: [
          '模型打分太慢',
          '同一主题两次规划若给出不同问题集，下游缓存键漂移、评测无法复现',
          '确定性函数代码更短',
          '模型不支持打分',
        ],
        answer: 1,
        explain: '模型只提候选文本，剪枝由结构属性算，结果才能进评测集。',
        concept: 'cap-b-reasoning',
      },
      {
        text: 'GoT 合并重复节点时，规范化键应该用什么？',
        options: ['问题文本的相似度', '排序后的检索词拼接章节归属', '模型生成的摘要向量', '节点创建时间'],
        answer: 1,
        explain: '文本措辞会变，检索意图不会；用稳定标识而非表面文本。',
        concept: 'cap-b-reasoning',
      },
      {
        text: '为什么 PlanResult 里不能带「初步结论」这类事实性字段？',
        options: [
          '会占太多存储',
          '它不是 claim、没有 citation，会以上下文身份绕过 assertPublishable 流进合成器',
          '模型写不出来',
          '会影响排序',
        ],
        answer: 1,
        explain: '溯源体系最怕的不是错误结论，而是绕过体系的正确句子。',
        concept: 'cap-b-reasoning',
      },
      {
        text: '规划结束时把 retrievalBudget 设为合并后的节点数，意义是？',
        options: [
          '方便统计字数',
          '检索次数在启动检索前就能精确报价，重复意图在规划层已被消灭',
          '让检索器自己决定预算',
          '减少向量维度',
        ],
        answer: 1,
        explain: '缓存只能省已发生的重复，合并让重复根本不产生。',
        concept: 'cap-b-reasoning',
      },
    ],
    [
      ['可检索性', '至少两个检索词、不含主题原串、词间差异与章节归属的硬校验'],
      ['确定性剪枝', '模型只提候选，分数由独立性、检索词质量、章节归属算出'],
      ['GoT 等价类合并', '按规范化键合并重复检索意图，保留所有 incoming 入边'],
      ['三类停止', '深度上限、边际收益过低、检索预算耗尽，原因写进结果'],
      ['检索预算', '规划结束时等于合并后节点数，可在启动检索前报价'],
      ['无事实输出', 'PlanResult 只含「要查什么」的元数据，不含任何事实陈述'],
    ],
    [
      '让模型给候选打分，同一主题两次规划得到不同问题集，缓存与评测全部失效。',
      '用文本相似度做合并键，同义问法合并不掉、不同章节却被误并。',
      '合并时只留一个父节点，省了检索却丢了章节归属。',
      '往规划输出里加一个 summary 字段写「初步结论」，绕过 assertPublishable 流进合成器。',
      '只设深度上限、不设边际收益与预算停止判据，模型总能再提几个角度。',
    ],
  ),
  'capstone',
)
