import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L139 = withKind(
  L(
    'L139',
    27,
    '实战 Capstone B：从零接入链路追踪 + 评测 + 溯源质量校验',
    4,
    ['L138'],
    ['cap-b-trace'],
    [
      '从零实现 questionId → sourceId → claim 三层证据追踪树与纯数据回放器',
      '写出 20 条人工抽检记录与只增不改的引用准确率基线',
      '实现可机械判定的溯源质量校验器与发布前断言',
      '给出研究型评测与执行型评测的四维对照，回填 L135 抽检基线',
    ],
    `
### 抽检第 14 条时，发现历史版本对不上

L135 定过一条规矩：每份报告人工抽检 20 条引用，逐条记「支撑 / 部分支撑 / 不支撑」，作为引用准确率的第一份基线。第一次认真执行这条规矩时就卡住了——抽检表按渲染序号 \`[14]\` 存档，而报告后来调过一次章节顺序，\`[14]\` 现在指向了另一条引用。想对比「上一版这条引用是不是也被判过」，只能靠人回忆。

同一周还发现第二个问题：报告里有一句结论，追踪系统能查到它属于哪个章节、引用了哪些来源，却查不到**当初评审对照过哪几段原文**。原来 \`Verdict.checkedAgainst\` 在日志里打了，但没进追踪树，于是「评审当时看了什么」和「报告最终写了什么」是两份对不上的记录。L138 的接缝表里已经写明：研究型 Agent 的追踪对象不是动作，是**证据的来历**，树的骨架是 \`questionId → sourceId → claim\` 三层。本课就是把这三层真正建起来，并把人工抽检接到稳定的持久 id 上。

### 本课唯一要回答的问题

**如何让一份报告的每一句结论，都能被回放成「哪个子问题 → 哪批来源 → 哪段原文 → 谁判定过 → 最终写在哪一行」。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 运行时 → 工具 → 动作的两层追踪树 | L131 | A 分支，形状不同 |
| 调用图、沙箱、降级阶梯 | L133 | 保护对象是不可逆副作用 |
| 防幻觉闸门与长文 token 优化 | L140 | 本课只提供事件与指标，不改语义 |
| 引用锚点渲染与 PDF 导出 | L141 | 本课保证持久 id 稳定，渲染在那边 |
| claim / citation 契约与合成 | L135 / L138 | 已交付，本课只消费 |

### 第一件事：树的主干是证据，不是调用

L131 的 span 树按「运行时循环 → 工具调用」组织父子关系，因为那里要回答「谁执行了什么」。研究型 Agent 没有动作，父子关系必须换成**证据的聚合方向**：一个子问题引出多个来源，一个来源切出多个 span，多个 span 共同支撑一条 claim，claim 再落进某个章节的正文句子。

| 层 | 节点 | 关键字段 | 回答的问题 |
|---|---|---|---|
| 1 | \`question\` | \`questionId\` / \`queries\` / \`section\` | 这句话最初是为了回答什么 |
| 2 | \`source\` | \`sourceId\` / \`publishedAt\` | 证据来自哪个独立来源、什么时候的 |
| 3 | \`span\` | \`sid\` / \`quote\` / \`offset\` | 原文的哪一段 |
| 4 | \`claim\` | \`claimId\` / \`text\` / \`checkedAgainst\` | 结论是什么、评审对照过哪些 span |
| 5 | \`sentence\` | \`section\` / \`line\` / \`claimIds\` | 最终写在哪一行、读者点开的是哪几条 |

表里写了五行而不是三层，是因为「三层」指的是**证据主干**（question / source / claim），span 与 sentence 是两端的挂载点。把 span 单列成节点很重要：L138 的 \`Verdict.checkedAgainst\` 存的是 \`sid\`，只有 span 成为一等节点，评审记录才能和正文句子挂在同一棵树上。

\`\`\`ts title="observability/tree.ts：证据追踪节点与构建器" note="关键：所有节点用持久 id，不存渲染序号；树从报告数据算出，不单独维护。"
export type TraceKind = 'question' | 'source' | 'span' | 'claim' | 'sentence'

export type TraceNode = {
  id: string
  kind: TraceKind
  parentId: string | null
  children: string[]
  at: number
  payload: Record<string, unknown>
}

export type EvidenceTree = {
  reportId: string
  nodes: Map<string, TraceNode>
  roots: string[]
  orphans: string[]
}

export function buildEvidenceTree(args: {
  reportId: string
  plan: PlanResult
  packs: EvidencePack[]
  verdicts: Verdict[]
  report: Report
}): EvidenceTree {
  const nodes = new Map<string, TraceNode>()
  const put = (id: string, kind: TraceKind, parentId: string | null,
    payload: Record<string, unknown>) => {
    const prev = nodes.get(id)
    nodes.set(id, { id, kind, parentId,
      children: prev?.children ?? [], at: 0, payload: { ...prev?.payload, ...payload } })
    if (parentId) {
      const p = nodes.get(parentId)
      if (p && !p.children.includes(id)) p.children.push(id)
    }
  }
  const packByQuestion = new Map(args.packs.map((p) => [p.questionId, p]))

  for (const q of args.plan.flat) {
    put('q:' + q.id, 'question', null, { queries: q.queries, section: q.section })
    const pack = packByQuestion.get(q.id)
    if (!pack) continue
    for (const sourceId of pack.sources) {
      const sid = 'src:' + q.id + ':' + sourceId
      put(sid, 'source', 'q:' + q.id, { sourceId })
      for (const span of pack.spans.filter((s) => s.sourceId === sourceId)) {
        put('sp:' + span.sid, 'span', sid, { quote: span.quote, offset: span.offset })
      }
    }
  }
  const verdictByClaim = new Map(args.verdicts.map((v) => [v.claimId, v]))
  const allClaims = args.report.sections.flatMap((s) => s.claimIds)
  for (const claimId of allClaims) {
    const v = verdictByClaim.get(claimId)
    put('cl:' + claimId, 'claim', null, { checkedAgainst: v?.checkedAgainst ?? [] })
    for (const sid of v?.checkedAgainst ?? []) {
      const spanNode = nodes.get('sp:' + sid)
      if (spanNode) {
        spanNode.children.push('cl:' + claimId)
        const c = nodes.get('cl:' + claimId)!
        if (!c.parentId) c.parentId = spanNode.parentId
      }
    }
  }
  args.report.sections.forEach((s, i) => {
    put('ln:' + i, 'sentence', null, { section: s.heading, claimIds: s.claimIds })
    for (const cid of s.claimIds) {
      const c = nodes.get('cl:' + cid)
      if (c && !c.children.includes('ln:' + i)) c.children.push('ln:' + i)
    }
  })
  const orphans = [...nodes.values()]
    .filter((n) => n.parentId !== null && !nodes.has(n.parentId))
    .map((n) => n.id)
  const roots = [...nodes.values()].filter((n) => n.kind === 'question').map((n) => n.id)
  return { reportId: args.reportId, nodes, roots, orphans }
}
\`\`\`

\`buildEvidenceTree()\` 里 claim 节点先以 \`parentId: null\` 创建，再按 \`checkedAgainst\` 挂到它核对过的第一个 span 上。这不是偷懒：一条 claim 可能由多个来源共同支撑，硬选一个「父」会丢掉多源信息，所以 \`children\` 里保留全部边，\`parentId\` 只用于画树时选一根主干。**多源是事实，父节点只是视图**——L136 合并节点时保留 \`incoming\` 也是同一个道理。

\`\`\`ts title="observability/replay.ts：纯数据回放，不重新检索也不重新生成" note="关键：树缺了边就是缺了，回放器当场报错，不指望下游检查补上。"
export type ReplayView = {
  reportId: string
  questions: string[]
  sources: string[]
  claims: string[]
  sentences: number
}

export function replayEvidence(tree: EvidenceTree): ReplayView {
  if (tree.orphans.length) throw new Error('orphan trace nodes: ' + tree.orphans.join(','))
  const nodes = [...tree.nodes.values()]
  const claims = nodes.filter((n) => n.kind === 'claim')
  const missing = claims.filter((n) =>
    ((n.payload.checkedAgainst as string[]) ?? []).length === 0).map((n) => n.id)
  if (missing.length) {
    throw new Error('claims without reviewed spans: ' + missing.join(','))
  }
  return {
    reportId: tree.reportId,
    questions: nodes.filter((n) => n.kind === 'question').map((n) => n.id),
    sources: [...new Set(nodes.filter((n) => n.kind === 'source')
      .map((n) => String(n.payload.sourceId)))],
    claims: claims.map((n) => n.id),
    sentences: nodes.filter((n) => n.kind === 'sentence').length,
  }
}

export function assertTraceComplete(tree: EvidenceTree, report: Report): void {
  const view = replayEvidence(tree)
  const claimed = report.sections.flatMap((s) => s.claimIds)
  if (view.claims.length !== claimed.length) {
    throw new Error('trace/report claim count mismatch')
  }
  for (const cit of report.citations) {
    const found = [...tree.nodes.values()]
      .some((n) => n.kind === 'span' && n.payload.quote === cit.quote)
    if (!found) throw new Error('citation quote not found in trace: ' + cit.id)
  }
}
\`\`\`

\`assertTraceComplete()\` 把两类「看起来跑通了」的问题判成硬失败：树里的 claim 数与报告不一致、某条 citation 的 \`quote\` 在树里找不到对应 span 节点。第二条尤其关键——它正是 L137 \`assertNoFreeText()\` 在追踪侧的复核：即便合成时通过了，若追踪树里没有那段原文，说明证据来自树外，报告依然不可核对。

### 第二件事：抽检记录按持久 id 存档

开头那次「历史版本对不上」的根因，是抽检表把渲染序号当主键。修复方式很直接：抽检记录的 key 只能是 \`citation.id\`（由 \`sourceId\` 与 \`offset\` 拼出的持久 id），序号只在展示时映射。同时把 20 条抽检写成固定结构，结论分三档，只增不改。

\`\`\`ts title="evals/sampling.ts：20 条抽检表与只增不改的准确率基线" note="关键：sheet 以 citation.id 为键；章节重排不影响历史对照。"
export type SampleVerdict = 'supported' | 'partial' | 'unsupported'

export type SampleRow = {
  citationId: string
  claimId: string
  quote: string
  verdict: SampleVerdict
  reviewer: string
  note: string
  at: number
}

export type SamplingSheet = {
  reportId: string
  rows: SampleRow[]
  accuracy: number
}

export function assertSamplingSheet(sheet: SamplingSheet): void {
  if (sheet.rows.length !== 20) {
    throw new Error('each report requires exactly 20 sampled citations, got ' + sheet.rows.length)
  }
  const ids = sheet.rows.map((r) => r.citationId)
  if (new Set(ids).size !== ids.length) throw new Error('duplicate sampled citation id')
  for (const r of sheet.rows) {
    if (!r.citationId.startsWith('c:')) throw new Error('sampling key must be a persistent id')
    if (!r.reviewer.trim()) throw new Error('sample without reviewer')
    if (r.verdict === 'unsupported' && !r.note.trim()) {
      throw new Error('unsupported sample requires a note: ' + r.citationId)
    }
  }
}

export function sampleAccuracy(rows: SampleRow[]): number {
  const score = rows.reduce((m, r) => m + (r.verdict === 'supported' ? 1
    : r.verdict === 'partial' ? 0.5 : 0), 0)
  return score / Math.max(1, rows.length)
}

export class CitationBaseline {
  constructor(private store: { read(): Promise<SamplingSheet[]>;
    append(s: SamplingSheet): Promise<void> }) {}
  async check(sheet: SamplingSheet): Promise<{ ok: boolean; reasons: string[] }> {
    assertSamplingSheet(sheet)
    const accuracy = sampleAccuracy(sheet.rows)
    const history = await this.store.read()
    const best = history.reduce((m, s) => Math.max(m, s.accuracy), 0)
    const reasons: string[] = []
    if (accuracy < 0.9) reasons.push('citation accuracy below 0.9: ' + accuracy)
    if (history.length && accuracy < best - 0.05) {
      reasons.push('accuracy regressed from best ' + best + ' to ' + accuracy)
    }
    await this.store.append({ ...sheet, accuracy })
    return { ok: reasons.length === 0, reasons }
  }
}
\`\`\`

\`sampleAccuracy()\` 把「部分支撑」记 0.5 分，而不是简单算通过率。这一档很重要：原文给了数据但没给结论方向、或者只支撑了句子的一半，都不该和「完全不支撑」等价，也不该混进「支撑」。L135 说引用准确率必须靠人工判断，判断的粒度就体现在这三档上。基线用「不低于历史最优减 0.05」而不是「不低于上一次」，与 L132 的棘轮同源：上一次可能恰好是一份特别难的报告，拿它当基准会把正常波动误判成倒退。

### 第三件事：机械校验与人工抽检的分工

可自动判定的部分要在发布前全部跑完，人工抽检负责剩下的语义判断。把两者混在一起的典型后果是「CI 全绿 = 引用没问题」，抽检被慢慢省掉。

| 维度 | 执行型（Capstone A） | 研究型（Capstone B） |
|---|---|---|
| 评测对象 | 动作轨迹 \`action.committed\` | 证据链 \`questionId → span → claim\` |
| 核心指标 | 动作正确率、越权硬失败 | 无支撑率、来源多样性、引用准确率 |
| 负例形态 | 「不该动的时候动了」 | 「不该写的时候写了」 |
| 不可自动化部分 | 真实模型质量抽检 | 「原文是否支撑结论」的人工判断 |
| 事实源 | 唯一执行入口产出的事件 | 评审 \`checkedAgainst\` 与持久 citation id |

\`\`\`ts title="evals/quality-gate.ts：可机械判定的溯源质量校验" note="关键：五检查全部硬失败；语义支撑交给 SamplingSheet，不在这里打分。"
export function assertTraceQuality(args: {
  tree: EvidenceTree
  report: Report
  sheet: SamplingSheet
  kind: ClaimKind
  now: number
}): { ok: boolean; checks: Record<string, boolean> } {
  const checks: Record<string, boolean> = {}
  assertTraceComplete(args.tree, args.report)
  checks.treeComplete = true
  assertSamplingSheet(args.sheet)
  checks.samplingComplete = true
  const rate = unsupportedRate(args.report.sections)
  if (rate !== 0) throw new Error('unsupported sentences: ' + rate)
  checks.unsupportedRateZero = true
  const claimCount = args.report.sections.flatMap((s) => s.claimIds).length
  const diversity = sourceDiversity(args.report.citations, claimCount)
  if (diversity < 0.5) throw new Error('source diversity: ' + diversity)
  checks.diversity = true
  for (const cit of args.report.citations) {
    const f = freshness(cit, args.kind, args.now)
    if (!f.fresh && !args.report.sections.some((s) => s.body.includes(f.label ?? ''))) {
      throw new Error('stale citation without cutoff label: ' + cit.id)
    }
  }
  checks.freshnessLabelled = true
  return { ok: Object.values(checks).every(Boolean), checks }
}
\`\`\`

:::deep

### 为什么引用准确率不能自动化，而「无支撑率」可以

两者的差别不在技术难度，在**判定对象有没有精确定义**。「一句话有没有带引用」可以写成 \`includes('[')\`，边界清晰，机器判和人判结果一致；「这段原文是否足以支撑这个结论」需要理解数值口径、时间范围、因果关系，甚至需要知道作者有没有省略限定条件。同一个句子，两个资深审稿人也可能给出「支撑」与「部分支撑」的不同判断。

硬把它自动化通常有两种结局。一是用一个模型当 judge，把判断包装成分数——L82 讲过 judge 的三类偏差，系统性偏移不能靠平均消除，而且它同样会漏掉「引用真实存在但方向相反」这类错误。二是把阈值降到机器能判的粒度，例如只检查「quote 是否出现在原文」，于是「引用张冠李戴」全部通过，指标看起来很漂亮。

所以本课把边界划得很死：\`assertTraceQuality()\` 的五检查全部是**有无问题**（树是否完整、抽检是否 20 条、无支撑率是否为 0、多样性是否够、时效是否标注），一个语义判断都不做；语义判断集中在 \`SamplingSheet\`，由人填、按持久 id 存档、进只增不改的基线。**自动化负责不漏，人工抽检负责不偏**——这是 L138 接缝表里那句话在评测层的落地。

:::

### 一次抽检实际怎么走

「每份报告抽 20 条」写起来只有一句话，落到操作上却有六个动作，任何一步省掉都会让基线失真：

| 步 | 动作 | 产物 | 常见偏差 |
|---|---|---|---|
| 1 | 按持久 \`citation.id\` 随机抽 20 条，不按章节挑 | 抽样清单 | 只挑读起来顺眼的句子 |
| 2 | 沿树反查 \`quote\` 对应的 \`span\` 节点与原文段落 | 逐条对照材料 | 只看标题和摘要，没读被引的那一段 |
| 3 | 判 supported / partial / unsupported，unsupported 必须写原因 | \`SampleRow\` | 把「部分支撑」算成「支撑」，准确率虚高 |
| 4 | 以 \`citation.id\` 为键写入 \`SamplingSheet\`，附复核人与时间 | 抽检表 | 用 \`[n]\` 存档，章节一调就对不上 |
| 5 | 与**历史最优**（减 0.05 容差）比较，不是与上一次比 | 基线检查结论 | 上一份恰好特别难，把正常波动误判成倒退 |
| 6 | 把 unsupported 的成因回写到 L137 的匹配规则与 L138 的评审提示 | 规则修订记录 | 只改这份报告，下次同样错误重现 |

第六步最容易被跳过，却决定了「基线」是不是真的只增不改。若连续三份报告都在同一类引用上判 unsupported（例如都栽在方向词相反、或都栽在数值口径不同），问题不在研究员，而在 \`matchCitation()\` 的方向词表或 \`polarity()\` 的覆盖不足。把抽检结论回写成规则修订，基线才会随系统改进单调上升；只把报告里那句话改掉，数字好看了，缺陷还在。**抽检不是给报告打分，是给系统找规则漏洞**——这也是它不能自动化的另一个理由：机器能判「这条不支撑」，但判不了「这类不支撑说明哪条规则该改」。

### 接缝：L140 的闸门该消费哪些字段

L140 要做防幻觉闸门，最省事也最危险的写法是「把本课所有函数串起来跑一遍，绿了就发布」。危险在于它会把人工判断也当成一道自动检查。把边界写清楚：

| 本课交付 | L140 的用法 | 不允许改什么 |
|---|---|---|
| \`assertTraceQuality()\` 五检查 | 闸门机械层，逐项硬失败 | 不得往里加语义判断或 judge 打分 |
| \`SamplingSheet\` / \`CitationBaseline\` | 闸门只检查「20 条做了没有、基线有没有倒退」 | 不得把人工结论固化成阈值后自动放行 |
| \`EvidenceTree\` | 校验 quote 是否来自树内 span，而非只在 report 里 | 不得退化成只读 \`report.citations\` |
| \`citation.id\` | 冲突记录、时效标注、抽检主键的统一标识 | 不得换成渲染序号 |
| \`ReplayView\` | 安全演练里「证据链完整」的断言输入 | 不得省略 \`checkedAgainst\` 检查 |

关键在第二行：闸门能检查的是「这次有没有做抽检、抽检结果有没有倒退」，不是「这 20 条判得对不对」。把人工判断伪装成一个数字阈值，再让 CI 自动放行，等于把判断力从流程里删掉了——表面上是自动化，实质是让没人负责的部分自动通过。L140 会把机械层与人工层**并排**跑，任一不过都不发布，但两层之间不互相代替。

### 五条验收断言

\`\`\`ts title="evals/l139-trace.test.ts：树、回放、抽检与基线四类断言" note="关键：全部用手工节点与固定报告，不联网、不调模型。"
import assert from 'node:assert/strict'

function dated(id: string, sourceId: string, quote: string): DatedCitation {
  return { id, sourceId, quote, publishedAt: Date.UTC(2025, 0, 1) }
}
function row(i: number): SampleRow {
  return { citationId: 'c:' + i, claimId: 'cl:' + i, quote: '原文片段',
    verdict: 'supported', reviewer: 'human-1', note: '', at: 0 }
}
function sheet(reportId: string): SamplingSheet {
  return { reportId, rows: Array.from({ length: 20 }, (_, i) => row(i)), accuracy: 1 }
}

function t1_treeHasThreeEvidenceLayers() {
  const q: SubQuestion = { id: 'q1', text: '国内市场规模与增速',
    queries: ['市场规模', '增速'], section: '市场', depth: 0, parentId: null, children: [] }
  const span: Span = { sid: 's1', sourceId: 'src-a', quote: '市场规模为 120 亿',
    offset: [0, 9], publishedAt: Date.UTC(2025, 0, 1), entityIds: ['e1'] }
  const pack: EvidencePack = { questionId: q.id, section: '市场', queries: q.queries,
    hits: [], spans: [span], sources: ['src-a'], diversity: 1, budgetUsed: 1 }
  const cit = dated('c:src-a:0-9', 'src-a', span.quote)
  const report: Report = { sections: [{ heading: '市场',
    body: '市场规模为 120 亿[1]', claimIds: ['cl1'] }],
    citations: [cit], conflictRecords: [], density: 1 }
  const verdicts: Verdict[] = [{ claimId: 'cl1', outcome: 'accepted',
    reason: 'ok', checkedAgainst: [span.sid] }]
  const tree = buildEvidenceTree({ reportId: 'R1',
    plan: { topic: 'T', roots: [], flat: [q], stopReason: 'converged',
      expanded: 0, pruned: 0, merged: 0, retrievalBudget: 1 },
    packs: [pack], verdicts, report })
  assert.equal(tree.orphans.length, 0)
  for (const id of ['q:q1', 'src:q1:src-a', 'sp:s1', 'cl:cl1', 'ln:0']) {
    assert.ok(tree.nodes.has(id), 'missing node ' + id)
  }
  assertTraceComplete(tree, report)
}

function t2_replayRejectsClaimWithoutReviewedSpan() {
  const tree: EvidenceTree = { reportId: 'R2', roots: [], orphans: [],
    nodes: new Map([['cl:cl1', { id: 'cl:cl1', kind: 'claim', parentId: null,
      children: [], at: 0, payload: { checkedAgainst: [] } }]]) }
  assert.throws(() => replayEvidence(tree), /claims without reviewed spans/)
}

function t3_samplingKeyIsPersistentId() {
  assert.doesNotThrow(() => assertSamplingSheet(sheet('R3')))
  const bad = sheet('R3')
  bad.rows[0] = { ...bad.rows[0]!, citationId: '[14]' }
  assert.throws(() => assertSamplingSheet(bad), /persistent id/)
  const partial = sheet('R3')
  for (let i = 0; i < 4; i++) partial.rows[i] = { ...partial.rows[i]!, verdict: 'partial' }
  assert.equal(sampleAccuracy(partial.rows), 0.9)
}

async function t4_baselineRatchetUsesBestNotLast() {
  const rows: SamplingSheet[] = []
  const base = new CitationBaseline({ read: async () => rows,
    append: async (s) => { rows.push(s) } })
  assert.equal((await base.check(sheet('R4'))).ok, true)
  const weak = sheet('R5')
  for (let i = 0; i < 6; i++) {
    weak.rows[i] = { ...weak.rows[i]!, verdict: 'unsupported', note: '原文方向相反' }
  }
  const blocked = await base.check(weak)
  assert.equal(blocked.ok, false)
  assert.ok(blocked.reasons.some((x) => x.includes('below 0.9')))
  assert.equal(rows.length, 2)
}

function t5_qualityGateIsMechanicalOnly() {
  const cit = dated('c:src-a:0-9', 'src-a', '市场规模为 120 亿')
  const report: Report = { sections: [{ heading: '市场',
    body: '市场规模为 120 亿[1]', claimIds: ['cl1'] }],
    citations: [cit], conflictRecords: [], density: 1 }
  const tree: EvidenceTree = { reportId: 'R6', roots: [], orphans: [],
    nodes: new Map([
      ['cl:cl1', { id: 'cl:cl1', kind: 'claim', parentId: null, children: [],
        at: 0, payload: { checkedAgainst: ['s1'] } }],
      ['sp:s1', { id: 'sp:s1', kind: 'span', parentId: null, children: [],
        at: 0, payload: { quote: cit.quote } }],
    ]) }
  const r = assertTraceQuality({ tree, report, sheet: sheet('R6'),
    kind: 'market', now: Date.UTC(2026, 0, 1) })
  assert.equal(r.ok, true)
  assert.ok(r.checks.samplingComplete && r.checks.freshnessLabelled)
}

t1_treeHasThreeEvidenceLayers()
t2_replayRejectsClaimWithoutReviewedSpan()
t3_samplingKeyIsPersistentId()
await t4_baselineRatchetUsesBestNotLast()
t5_qualityGateIsMechanicalOnly()
console.log('L139 trace: 5/5 passed')
\`\`\`

第二条断言把「某条 claim 没有任何评审对照过的 span」判成**回放失败**而不是「报告扣一分」：树缺了这条边，就没法回答「这句话当初核对过什么」，其余部分再完整也不构成可复盘的运行。这与 L131 把孤儿 span 判硬错误是同一种严格度。

:::warn

### 三个研究型追踪的翻车点

**一、把渲染序号当抽检主键。** 章节一调，\`[14]\` 就指向另一条引用，历史对照全部失效。抽检表、审计日志、冲突记录一律只存 \`citation.id\`，序号只在渲染时映射。

**二、把 \`checkedAgainst\` 只打在日志里。** 评审当时看过哪几段原文，是回答「这条结论凭什么」的核心证据；不进树，追踪就只能查到「引用了谁」，查不到「核对过谁」。

**三、给多源 claim 硬选一个父节点。** 一条结论由三家来源共同支撑，画树时只挂一根主干会丢掉多源事实。\`children\` 保留全部边，\`parentId\` 只是视图选择——L136 的 \`incoming\` 同理。

:::

### 风险登记表回填与分工

| L135 风险项 | 本课进展 | 状态 |
|---|---|---|
| 引用张冠李戴 | 20 条人工抽检 + 只增不改基线 + 三层树把 quote 挂到 span 节点 | 已闭合（语义侧） |
| 单源伪装多源 | \`sourceDiversity()\` 进发布前五检查 | 与 L137/L138 共同闭合 |
| 冲突被抹平 | \`ConflictRecord\` 可由树反查，导出核对在 L141 | 与 L138 共同闭合 |
| 时效过期 | \`freshness()\` 标注检查进五检查 | 与 L137 共同闭合 |
| 报告注水 | \`unsupportedRate()\` 判 0、抽检固定 20 条 | 与 L138 共同闭合 |

与相邻课的边界：L136 提供 \`PlanResult\` 与 \`questionId\`，L137 提供 \`EvidencePack.sources / spans\`，L138 提供 \`Verdict.checkedAgainst\`、\`Report.sections[].claimIds\` 与 \`ConflictRecord\`，本课不改任何一个，只新增 \`observability/\` 与 \`evals/\` 下的树、回放器、抽检表与基线。L140 消费 \`assertTraceQuality()\` 的五检查作为防幻觉闸门的输入，L141 消费持久 \`citation.id\` 做锚点渲染与导出，L142 把「三层证据树」收进全课知识地图。

一句话记住本课：**执行型追踪回答「谁做了什么」，研究型追踪回答「这句话凭什么」；前者用序号记不住，后者必须用持久 id 存下来。**

:::tip

### 判断追踪是否真的能复盘的两个问题

把报告章节顺序整体调换，20 条抽检记录还能不能逐条对回原来的引用；随便挑一句正文，能不能沿树反查出「哪个子问题、哪批来源、哪段原文、评审对照过没有」。两个都成立，L140 的防幻觉闸门才有可信的输入。只看到一棵漂亮的调用图，什么都还没证明。

:::
`,
    null,
    [
      {
        text: '研究型 Agent 的追踪树为什么是 questionId → sourceId → claim 三层？',
        options: [
          '因为数据库只有三张表',
          '要回答「这句话凭什么写进报告」，父子关系应按证据聚合方向而非执行顺序组织',
          '三层比两层性能好',
          '模型要求这样',
        ],
        answer: 1,
        explain: 'A 分支追踪动作执行，B 分支追踪证据来历，形状不同。',
        concept: 'cap-b-trace',
      },
      {
        text: '抽检记录的主键应该是什么？',
        options: [
          '渲染序号 [1]、[2]',
          '持久的 citation.id（由 sourceId 与 offset 拼出）',
          '章节名加行号',
          '报告标题',
        ],
        answer: 1,
        explain: '章节一调序号就漂移，历史版本无法对照。',
        concept: 'cap-b-trace',
      },
      {
        text: '为什么引用准确率必须人工抽检，而不能进 CI 自动判定？',
        options: [
          '人工更便宜',
          '「原文是否支撑结论」没有精确定义，需要理解口径、时间与因果；自动化只能判有无',
          'CI 不能读文件',
          '模型不支持长文本',
        ],
        answer: 1,
        explain: '自动化负责不漏，人工抽检负责不偏。',
        concept: 'cap-b-trace',
      },
      {
        text: 'Verdict.checkedAgainst 必须进追踪树，理由是？',
        options: [
          '为了增加节点数量',
          '它记录评审当时对照过哪几段原文，缺了就只能查到「引用了谁」而查不到「核对过谁」',
          '方便统计字数',
          '渲染需要',
        ],
        answer: 1,
        explain: 'span 成为一等节点，评审记录才能与正文挂在同一棵树上。',
        concept: 'cap-b-trace',
      },
    ],
    [
      ['证据链', 'questionId → sourceId → span → claim → 正文句子的逐层回溯'],
      ['三层树', 'question / source / claim 为主干，span 与 sentence 为两端挂载点'],
      ['持久 id', 'citation.id 由 sourceId 与 offset 拼出，序号只在渲染时映射'],
      ['抽检基线', '每份报告固定 20 条、三档结论、只增不改、与历史最优比'],
      ['纯数据回放', '只读 TraceNode，不重新检索也不重新生成'],
      ['机械与人工分工', '五检查判有无，语义支撑交给人工抽检'],
    ],
    [
      '把渲染序号当抽检主键，章节调整后历史抽检记录全部对不上。',
      '把 checkedAgainst 只打在日志里，追踪树查不到评审当时核对过哪些原文。',
      '用模型当 judge 给引用准确率打分，系统性偏移靠平均消除不了。',
      '给多源 claim 硬选一个父节点，丢掉多家来源共同支撑的事实。',
      '把「原文是否支撑结论」塞进 CI 自动判定，抽检被慢慢省掉。',
    ],
  ),
  'capstone',
)
