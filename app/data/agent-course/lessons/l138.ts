import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L138 = withKind(
  L(
    'L138',
    27,
    '实战 Capstone B：从零实现多 Agent 研究小组（研究员 / 评审 / 合成）',
    4,
    ['L137'],
    ['cap-b-multi'],
    [
      '从零实现研究员 / 评审 / 合成三角色与只判定不改写的 verdict 契约',
      '写出打回重新取证、contested 三种处理与留痕机制',
      '实现只组织不发挥的合成器与逐句可回溯的引用编号',
      '写出 claim 密度、无支撑率、来源多样性与四条验收断言',
    ],
    `
### 日志里通过的句子，和报告里的不是同一句

第一次把三角色跑起来时，评审员被提示词要求「输出通过或驳回，并说明原因」。它照做了，但顺手把一句拗口的 claim 改成了更通顺的表达——「份额自 2022 年起持续上升」被改成「近年来市场份额稳步增长」。改动看起来无害，却把整个溯源体系撕开一道口子：日志里记录的是被校验过的原句，报告里出现的是改写后的新句，两者都没有独立的 citation 绑定。事故复盘时想查「这句话当初是谁批准的」，只能查到一句报告里根本不存在的文本。

第二份报告出了另一类问题：正文里同时出现「市场规模 120 亿」和「市场规模 85 亿」，各自都带引用、都通过了评审。多源一致在这里反而帮了倒忙——两条 claim 都有证据，合成器把它们并列写进同一段，读者看到的是一段自相矛盾的结论。L135 的图纸把这两种情况分别写成「评审员不得改写 claim 文本」和「\`contested\` 状态必须显式处理」，本课就是把这两条禁令落成能拦住发布的代码。

### 本课唯一要回答的问题

**如何让质量对抗发生在「校验过的文本 = 发布的文本」这个不变量之内，且冲突不会被通顺的叙述抹平。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 子问题拆分、剪枝与合并 | L136 | 已交付，本课只消费 \`PlanResult\` |
| 索引、混合检索、证据包构造 | L137 | 已交付，本课只消费 \`spans\` 与 \`sources\` |
| 引用准确率人工抽检与基线 | L139 | 本课只做可机械判定的断言 |
| 长文分段缓存与 token 账单 | L140 | 本课的成本是重取次数，不是 token |
| 渲染锚点、导出与交付复盘 | L141 | 本课保证 citation 有持久 id 与 quote |

### 第一件事：三角色的接口，把「能写什么」钉死

角色不是三段提示词，而是**三个不同的返回类型**。研究员的产物是 \`SectionedClaim\`，评审的产物是 \`Verdict\`（只有判定与原因，没有文本字段），合成员的产物是 \`Section[]\`（只由已有 claim 拼装）。类型上就不存在「评审顺手改一句」的可能——\`Verdict\` 里根本没有地方放新句子。

| 角色 | 输入 | 输出 | 被禁止的事 |
|---|---|---|---|
| 研究员 | \`EvidencePack\` + 子问题 | \`SectionedClaim[]\` | 不得自己写没有 span 支撑的句子 |
| 评审员 | \`SectionedClaim[]\` | \`Verdict[]\`（accepted / rejected + reason） | **不得改写 claim 文本**，不得自行取证 |
| 合成员 | 已接受的 claim + 大纲 | \`Section[]\`（排序 / 去重 / 过渡） | 不得引入新事实，过渡句不含数据 |

\`\`\`ts title="team/types.ts：三角色返回类型与扩展后的 claim" note="关键：Verdict 没有 text 字段，评审在类型上无法改写；support 补 contested。"
export type Support = 'multi' | 'single' | 'unverified' | 'contested'

export type SectionedClaim = Omit<Claim, 'support'> & {
  support: Support
  section: string
  kind: ClaimKind
  questionId: string
}

export type Verdict = {
  claimId: string
  outcome: 'accepted' | 'rejected'
  reason: string
  checkedAgainst: string[]   // 评审看过的 span sid，留痕用
}

export type ConflictHandling = 'parallel-with-note' | 'footnote-only' | 'third-source-arbitration'

export type ConflictRecord = {
  claimIds: string[]
  handling: ConflictHandling
  note: string
  resolvedBy: string
}

export type Section = { heading: string; body: string; claimIds: string[] }

export type Report = {
  sections: Section[]
  citations: DatedCitation[]
  conflictRecords: ConflictRecord[]
  density: number
}
\`\`\`

\`checkedAgainst\` 记录评审看过的 span id，是为了让 L139 的追踪能回答「这条结论当初对照了哪几段原文」。没有它，评审就只是一个布尔值，出事时无法区分「评审没看」和「看了但判断错」。这与 L131 的「事件同源」是同一个思路，只是研究型 Agent 里被记录的对象从动作变成了证据。

\`\`\`ts title="team/researcher.ts：两次调用分离在角色层的落点" note="关键：研究员先写 claim 文本，再从 spans 匹配 citation；匹配侧只返回 Citation 或 null。"
export async function draftClaims(opts: {
  pack: EvidencePack
  llm: (p: string, v: Record<string, unknown>) => Promise<{ sentences: string[] }>
}): Promise<SectionedClaim[]> {
  const drafted = await opts.llm('EXTRACT_CLAIMS', {
    questionId: pack.questionId, quotes: pack.spans.map((s) => s.quote),
  })
  const claims: SectionedClaim[] = []
  for (const text of drafted.sentences) {
    const citations: DatedCitation[] = []
    for (const span of pack.spans) {
      const c = matchCitation(text, span)
      if (c) citations.push(c)
    }
    const support: Support = citations.length >= 2 ? 'multi'
      : citations.length === 1 ? 'single' : 'unverified'
    claims.push({
      id: 'cl:' + pack.questionId + ':' + claims.length,
      text, citations, support,
      section: pack.section, kind: 'market',
      questionId: pack.questionId,
    })
  }
  return claims
}

export function assertNoFreeText(claims: SectionedClaim[], pack: EvidencePack): void {
  const quotes = new Set(pack.spans.map((s) => s.quote))
  for (const c of claims) {
    if (c.citations.some((x) => !quotes.has(x.quote))) {
      throw new Error('citation quote is not an original span: ' + c.id)
    }
  }
}
\`\`\`

\`assertNoFreeText()\` 检查每一条 citation 的 \`quote\` 都确实来自证据包的原文片段。它堵的是「研究员为了让 claim 通过，自己编一句看起来像引用的话」。注意这里没有检查「quote 是否支撑 text」——那是评审与人工抽检的职责，机械层只保证出处真实存在。

### 第二件事：评审只判定，打回重取而不是就地改写

评审做三件事：找反例（原文方向相反或数值冲突）、校验 citation 是否真的来自 spans、发现同章节内互斥的两条 claim 并标记 \`contested\`。它发现问题时的唯一合法动作是 \`rejected + reason\`，由研究员拿着 reason 重新取证；**绝不返回新文本**。

\`\`\`ts title="team/reviewer.ts：只产 Verdict 的评审与硬禁令" note="关键：review() 的返回类型里没有任何文本字段；改写只能来自重新取证。"
export async function review(claims: SectionedClaim[], packs: EvidencePack[]): Promise<Verdict[]> {
  const allSpans = new Map<string, Span>()
  for (const p of packs) for (const s of p.spans) allSpans.set(s.sid, s)
  const out: Verdict[] = []
  for (const c of claims) {
    const checked: string[] = []
    const reasons: string[] = []
    for (const cit of c.citations) {
      const span = [...allSpans.values()].find((s) => s.quote === cit.quote)
      if (!span) { reasons.push('citation not found in evidence pack'); continue }
      checked.push(span.sid)
    }
    if (c.support === 'unverified') reasons.push('no citation attached')
    if (c.citations.length === 0) reasons.push('claim has zero evidence')
    const stale = c.citations.find((cit) =>
      freshness(cit, c.kind, Date.now()).fresh === false)
    if (stale) reasons.push('stale evidence without cutoff label: ' + stale.id)
    out.push({ claimId: c.id,
      outcome: reasons.length ? 'rejected' : 'accepted',
      reason: reasons.join('; ') || 'evidence consistent',
      checkedAgainst: checked })
  }
  return out
}

export function assertReviewerDidNotRewrite(
  before: SectionedClaim[], verdicts: Verdict[], after: SectionedClaim[],
): void {
  const beforeById = new Map(before.map((c) => [c.id, c.text]))
  for (const c of after) {
    const original = beforeById.get(c.id)
    if (original !== undefined && original !== c.text) {
      throw new Error('reviewer rewrote a claim: ' + c.id)
    }
  }
  for (const v of verdicts) {
    if ('text' in v || 'sentences' in v) {
      throw new Error('verdict carries text: ' + v.claimId)
    }
  }
}

export async function redraft(opts: {
  claim: SectionedClaim
  reason: string
  pack: EvidencePack
  llm: (p: string, v: Record<string, unknown>) => Promise<{ sentences: string[] }>
}): Promise<SectionedClaim[]> {
  const fresh = await opts.llm('RETAKE_EVIDENCE', {
    text: opts.claim.text, reason: opts.reason,
    quotes: opts.pack.spans.map((s) => s.quote),
  })
  const rebuilt = await draftClaims({ pack: opts.pack,
    llm: async () => ({ sentences: fresh.sentences }) })
  return rebuilt.filter((c) => c.support !== 'unverified')
}
\`\`\`

\`assertReviewerDidNotRewrite()\` 用 \`before / after\` 逐 id 比对文本，并用 \`'text' in v\` 挡住有人偷偷往 \`Verdict\` 里塞字段。前者防「通过类型绕过」，后者防「通过运行时对象绕过」——两条合起来，才让 L135 那条禁令从文档条款变成可失败断言。

\`review()\` 里关于时效的那段检查写得比较克制：它只在「有 citation 且明显超窗」时打回，具体窗口判定交给 L137 的 \`freshness()\`。角色之间不重复实现同一套规则，否则窗口一改就要改两处，L133 那种「常量表漂移」的问题会在研究型分支里重演。

### 第三件事：冲突必须有名字，且处理要留痕

\`contested\` 既不是 \`unverified\`（没证据），也不能直接进正文。L135 给了三种处理：并列两种说法并标注分歧来源、降级成脚注、补第三方证据裁决。本课把「选了哪一种、为什么、谁裁决」写成 \`ConflictRecord\`，并要求正文或脚注里能找到对应痕迹。

\`\`\`ts title="team/conflicts.ts：contested 三种处理与留痕" note="关键：任何 contested claim 没有 ConflictRecord 就判失败，不允许「顺手只写一边」。"
export function markConflicts(claims: SectionedClaim[]): SectionedClaim[] {
  return claims.map((c) => {
    const peers = claims.filter((p) => p.id !== c.id && p.section === c.section)
    const clash = peers.some((p) => contradicts(p, c))
    return clash ? { ...c, support: 'contested' as Support } : c
  })
}

export function contradicts(a: SectionedClaim, b: SectionedClaim): boolean {
  const na = numbersIn(a.text)
  const nb = numbersIn(b.text)
  if (na.length && nb.length && na[0] !== nb[0]) return true
  const UP = ['增长', '上升', '扩大']
  const DOWN = ['下降', '下滑', '收缩']
  const aUp = UP.some((w) => a.text.includes(w)) && !DOWN.some((w) => a.text.includes(w))
  const aDown = DOWN.some((w) => a.text.includes(w)) && !UP.some((w) => a.text.includes(w))
  const bUp = UP.some((w) => b.text.includes(w)) && !DOWN.some((w) => b.text.includes(w))
  const bDown = DOWN.some((w) => b.text.includes(w)) && !UP.some((w) => b.text.includes(w))
  return (aUp && bDown) || (aDown && bUp)
}

export function numbersIn(text: string): number[] {
  const out: number[] = []
  let buf = ''
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') buf += ch
    else { if (buf) out.push(Number(buf)); buf = '' }
  }
  if (buf) out.push(Number(buf))
  return out
}

export function resolveConflict(ids: string[], handling: ConflictHandling,
  note: string, resolvedBy: string): ConflictRecord {
  if (!note.trim()) throw new Error('conflict handling requires a note')
  return { claimIds: ids, handling, note, resolvedBy }
}

export function assertConflictsHandled(report: Report): void {
  for (const r of report.conflictRecords) {
    if (r.claimIds.length < 2) throw new Error('conflict record needs at least two claims')
    if (!report.sections.some((s) => s.body.includes(r.note))) {
      throw new Error('conflict note missing from report body')
    }
  }
}
\`\`\`

这一版看起来完全合理：记录格式对、分歧说明在正文里能找到。但它有一个致命缺口——**它只遍历已有的 \`conflictRecords\`**。若某条 claim 被标成了 \`contested\` 却根本没生成任何记录，循环一次都不执行，检查安静通过。这与 L132 里「12 条用例全是正例」是同一类错误：只检查了「存在的东西对不对」，没检查「该存在的东西有没有缺」。

正确的实现必须把 \`contested\` 的 id 集合作为参数传进来，与 \`recorded\` 做**双向比对**：既不能漏处理，也不能给非冲突 claim 凭空编一条处理记录。下面这版才是该进 CI 的：

\`\`\`ts title="team/conflicts.ts（修订）：contested 与记录双向比对" note="关键：单向检查会放过「标了 contested 但没人处理」的 claim；必须双向。"
export function assertConflictsHandledV2(args: {
  contestedIds: string[]
  records: ConflictRecord[]
  body: string
}): void {
  const recorded = new Set(args.records.flatMap((r) => r.claimIds))
  for (const id of args.contestedIds) {
    if (!recorded.has(id)) throw new Error('contested claim without handling: ' + id)
  }
  for (const id of recorded) {
    if (!args.contestedIds.includes(id)) throw new Error('handling for a non-contested claim: ' + id)
  }
  for (const r of args.records) {
    if (r.claimIds.length < 2) throw new Error('conflict needs at least two claims')
    if (!args.body.includes(r.note)) throw new Error('conflict note missing from body: ' + r.note)
  }
}
\`\`\`

\`t2\` 专门构造了「两条 contested、零记录」的场景，验证第二版会报 \`without handling\`。第一版之所以留在课文里，是为了让人看清「检查了记录格式」和「检查了记录没缺」是两件事；把这类反例写进评测集，比在代码评审里提醒一句「记得检查缺失」可靠得多。**断言要对着失败的那一侧写**——这是 Capstone B 从 A 借来的方法之一，也是 L132 负例思想在认知型任务上的版本。

:::deep

### 为什么「评审不得改写」比「评审要严格」重要得多

直觉上，评审越主动越好：发现句子拗口就顺手改、发现证据弱就顺手补一句。但研究型 Agent 的可信度来自一条链：原文片段 → citation → claim 文本 → 正文句子。链上每一环都必须与上一环是同一个东西，读者点开引用才能核对。评审一旦改写，链就断在第三环与第四环之间，而且断得毫无痕迹——日志里那句「已通过」指的还是旧文本。

更隐蔽的是，改写会污染抽检基线。L135 要求每份报告人工抽检 20 条引用，抽检记录按 claim id 存档；若文本被改过，下次复盘拿旧记录对新正文，会得出「引用准确率下降」的错误结论，团队于是去调检索器，真正的问题却在评审提示词里。

所以三角色的价值不是「多几个模型互相检查」，而是**把生成权与判定权分开**：只有研究员能产生文本，只有评审能判定，只有合成员能组织顺序。这与 L130 的「supervisor 不持网关」是同一条结构原则在认知型任务上的版本——执行型靠隔离副作用，研究型靠隔离文本生成权。

:::

### 第四件事：合成只组织，不发挥

合成器拿到的必须是已接受的 claim，且每一步都可机械检查：先 \`assertPublishable()\` 拦掉 \`unverified\` 与 \`contested\`，再按 \`section\` 分组、按持久 id 生成引用编号、加过渡句。过渡句只能是不含事实的连接词，正文里每一句事实性陈述都必须来自某个 claim 的 \`text\`。

\`\`\`ts title="team/synthesize.ts：只组织不发挥的合成器" note="关键：正文句子 = claim.text + 引用编号；没有第五种来源。"
const CONNECTORS = ['综上', '此外', '与之相对', '需要说明的是']

export function synthesize(args: {
  claims: SectionedClaim[]
  outline: string[]
  conflicts: ConflictRecord[]
  densityMin: number
  // L140 分段合成时传入全局映射，避免各章节都从 [1] 开始；不传时行为与本课完全一致
  numberById?: Map<string, number>
}): Report {
  const usable = args.claims.filter((c) => c.support !== 'unverified'
    && c.support !== 'contested')
  assertPublishable(usable as Claim[])
  assertNoNewFacts(usable)
  const citations = dedupeById(usable.flatMap((c) => c.citations as DatedCitation[]))
  const numberById = args.numberById
    ?? new Map(citations.map((c, i) => [c.id, i + 1]))
  const sections: Section[] = args.outline.map((heading, idx) => {
    const group = usable.filter((c) => c.section === heading)
    const body = group.map((c) => {
      const marks = c.citations.map((x) => '[' + (numberById.get(x.id) ?? 0) + ']').join('')
      const single = c.support === 'single' ? '（单一来源）' : ''
      return c.text + marks + single
    }).join('。')
    const lead = idx > 0 ? CONNECTORS[idx % CONNECTORS.length] + '，' : ''
    return { heading, body: lead + body, claimIds: group.map((c) => c.id) }
  })
  const totalChars = sections.reduce((m, s) => m + s.body.length, 0)
  const density = usable.length / Math.max(1, totalChars / 1000)
  if (density < args.densityMin) {
    throw new Error('report padding: claim density ' + density + ' < ' + args.densityMin)
  }
  return { sections, citations, conflictRecords: args.conflicts,
    density }
}

export function assertNoNewFacts(claims: SectionedClaim[]): void {
  for (const c of claims) {
    if (CONNECTORS.some((x) => c.text.startsWith(x))) {
      throw new Error('claim text looks like a connector, not a fact: ' + c.id)
    }
    if (c.citations.length === 0) throw new Error('claim without citation: ' + c.id)
  }
}

export function dedupeById(cs: DatedCitation[]): DatedCitation[] {
  const seen = new Map<string, DatedCitation>()
  for (const c of cs) if (!seen.has(c.id)) seen.set(c.id, c)
  return [...seen.values()]
}

export function unsupportedRate(sections: Section[]): number {
  const lines = sections.flatMap((s) => s.body.split('。').filter(Boolean))
  const facts = lines.filter((l) => !CONNECTORS.some((x) => l.startsWith(x)))
  const noCite = facts.filter((l) => !l.includes('['))
  return noCite.length / Math.max(1, facts.length)
}

export function sourceDiversity(cs: DatedCitation[], claimCount: number): number {
  return new Set(cs.map((c) => c.sourceId)).size / Math.max(1, claimCount)
}
\`\`\`

\`unsupportedRate()\` 用 \`includes('[')\` 与 \`startsWith\` 代替 L135 图纸里的正则版本，理由在 L133 已经讲过：课程正文是模板字符串，正则里的反斜杠会被吞掉，粘出去的代码块必须是能直接跑的。语义完全一致——带 \`[\` 的句子视为有引用，以连接词开头的过渡句不算事实性陈述。编号由 \`numberById\` 在渲染时映射，**持久 id 不变、序号可变**，这正是 L135 对「编号稳定」的要求。

\`\`\`ts title="evals/l138-team.test.ts：禁令、冲突、密度与四条验收断言" note="关键：断言用固定假模型与手工证据包；真实模型输出只做人工抽检，不进 CI。"
import assert from 'node:assert/strict'

function dated(quote: string, sourceId: string): DatedCitation {
  return { id: 'c:' + sourceId, sourceId, quote, publishedAt: Date.UTC(2025, 0, 1) }
}
function claim(id: string, text: string, citations: DatedCitation[]): SectionedClaim {
  return { id, text, citations,
    support: citations.length >= 2 ? 'multi' : 'single',
    section: '市场', kind: 'market', questionId: 'q1' }
}

function t1_verdictCarriesNoText() {
  const c = claim('cl1', '份额自 2022 年起持续上升', [dated('份额持续上升', 's-a')])
  const v: Verdict = { claimId: c.id, outcome: 'accepted', reason: 'ok', checkedAgainst: ['s1'] }
  assertReviewerDidNotRewrite([c], [v], [c])
  const tampered = { ...c, text: '近年来市场份额稳步增长' }
  assert.throws(() => assertReviewerDidNotRewrite([c], [v], [tampered]),
    /reviewer rewrote a claim/)
}

function t2_conflictDetectedAndHandled() {
  const a = claim('cl-a', '市场规模为 120 亿', [dated('规模 120 亿', 's-a')])
  const b = claim('cl-b', '市场规模为 85 亿', [dated('规模 85 亿', 's-b')])
  const marked = markConflicts([a, b])
  assert.equal(marked.filter((c) => c.support === 'contested').length, 2)
  const record = resolveConflict([a.id, b.id], 'parallel-with-note',
    '两家机构统计口径不同，数值不可直接比较', 'reviewer-1')
  const body = '两家机构统计口径不同，数值不可直接比较：一方为 120 亿，另一方为 85 亿。'
  assert.doesNotThrow(() => assertConflictsHandledV2({
    contestedIds: [a.id, b.id], records: [record], body,
  }))
  assert.throws(() => assertConflictsHandledV2({
    contestedIds: [a.id, b.id], records: [], body,
  }), /without handling/)
}

function t3_synthesizeHasNoFreeText() {
  const cs = [
    claim('cl1', '市场规模为 120 亿', [dated('规模 120 亿', 's-a')]),
    claim('cl2', '增速高于行业均值', [dated('增速高于均值', 's-b')]),
  ]
  const report = synthesize({ claims: cs, outline: ['市场'], conflicts: [], densityMin: 0.1 })
  assert.equal(report.sections.length, 1)
  assert.ok(report.sections[0]!.body.includes('[1]'))
  assert.equal(unsupportedRate(report.sections), 0)
  assert.ok(report.density >= 0.1)
}

function t4_fourAcceptanceAssertions() {
  const cs = [
    claim('cl1', '市场规模为 120 亿', [dated('规模 120 亿', 's-a')]),
    claim('cl2', '增速高于行业均值', [dated('增速高于均值', 's-b')]),
    claim('cl3', '渠道集中在华东', [dated('渠道集中华东', 's-c')]),
  ]
  const report = synthesize({ claims: cs, outline: ['市场'], conflicts: [], densityMin: 0.1 })
  assert.equal(unsupportedRate(report.sections), 0, '断言①：无支撑结论率为 0')
  assert.ok(sourceDiversity(report.citations, cs.length) >= 0.5, '断言②：多样性 ≥ 0.5')
  assert.equal(report.conflictRecords.length, 0, '断言③：无未处理冲突')
  for (const c of report.citations) {
    assert.ok(c.quote.length > 0 && c.id.length > 0, '断言④：可 3 秒定位原文片段')
  }
}

function t5_paddingRejected() {
  const cs = [claim('cl1', '市场规模为 120 亿', [dated('规模 120 亿', 's-a')])]
  assert.throws(() => synthesize({ claims: cs, outline: ['市场'],
    conflicts: [], densityMin: 999 }), /report padding/)
}

t1_verdictCarriesNoText()
t2_conflictDetectedAndHandled()
t3_synthesizeHasNoFreeText()
t4_fourAcceptanceAssertions()
t5_paddingRejected()
console.log('L138 team: 5/5 passed')
\`\`\`

第四条把 L135 的四条验收断言逐条写成可失败检查，其中「任意一句 3 秒定位原文」被具体化为「citation 有非空 \`quote\` 与持久 \`id\`」——真正的锚点渲染在 L141 落地，本课先保证数据侧不缺字段。第五条则把「报告注水」变成硬失败：密度低于阈值直接抛错，而不是给报告打个低分。

:::warn

### 三个研究小组翻车点

**一、让评审返回「改进后的文本」。** 只要 \`Verdict\` 里出现 \`text\` 字段，校验过的文本与发布的文本就分叉，抽检记录也随之失效。评审发现问题只能打回重新取证。

**二、把 contested 当成噪声过滤掉。** 冲突不是错误，是读者最先追问的地方；删掉一边会让报告看起来更干净，却把真实分歧藏了起来。三种处理都必须留 \`ConflictRecord\`，并在正文或脚注里能找到痕迹。

**三、合成器「顺便润色一下」。** 一旦允许它把两句 claim 合并成一句更顺的话，新句子既不属于任何 claim，也没有独立 citation，\`unsupportedRate()\` 还会因为过渡句过滤而漏报。正文句子的唯一来源必须是 \`claim.text + 引用编号\`。

:::

### 接缝：L139 的追踪对象不是动作，是证据的来历

Capstone A 的追踪树按「运行时 → 工具 → 动作」组织，因为那里要回答「谁执行了什么」。研究型 Agent 里没有动作，要回答的是「这句话凭什么写进报告」，所以树的骨架必须换成 \`questionId → sourceId → claim\` 三层。本课留下的字段正好撑起这三层：

| 本课交付 | L139 的用法 | 不允许改什么 |
|---|---|---|
| \`Verdict.checkedAgainst\` | \`claim → span\` 的边，说明当时对照了哪几段原文 | 不得只存一个「通过」布尔 |
| \`Section.claimIds\` | 报告回溯索引，任意一句能反查到 claim | 合成重排后不得丢弃 |
| \`ConflictRecord\` | 冲突处理节点，记录选了哪种方式与理由 | 不得只记「已解决」不记选择 |
| \`citation.id\`（持久 id） | 抽检记录与历史版本对照的主键 | 不得用渲染序号 \`[1]\` 存档 |
| \`density\` | 报告注水的趋势指标 | 不得当作唯一质量结论 |

第三条最容易被省：冲突处理若只留一个「已解决」，下次有人问「为什么这两个数字并列写着」，系统答不上来，只能靠人回忆当时的判断。把 \`handling\` 与 \`note\` 一起持久化，复盘才能区分「当时确实发现了分歧」和「根本没检测到分歧」。

还要说清一件事：本课的五条断言全部是**机械可判定**的，它们能保证「引用真实存在、方向没反、正文没有自由发挥、冲突没被漏掉」，但保证不了「这段原文真的足以支撑这个结论」。后者需要判断力，只能靠 L135 定的每份报告抽检 20 条建立基线。把这两类检查混在一起很危险——一旦团队以为「CI 全绿 = 引用没问题」，人工抽检就会被慢慢省掉，而事故恰恰发生在抽检停掉之后。**自动化负责不漏，人工抽检负责不偏**，两者不能互相替代。

### 风险登记表回填与分工

| L135 风险项 | 本课进展 | 状态 |
|---|---|---|
| 冲突被抹平 | \`markConflicts()\` + 三种 \`ConflictHandling\` + 双向留痕断言 | 已闭合 |
| 报告注水 | claim 密度硬失败 + 过渡句不含事实 + 无支撑率判 0 | 已闭合 |
| 引用张冠李戴 | 评审校验 quote 来自证据包、\`assertNoFreeText()\` | 与 L137 共同闭合，语义支撑待 L139 抽检 |
| 单源伪装多源 | \`sourceDiversity()\` 进四条断言 | 与 L137 共同闭合 |
| 时效过期 | 评审把「超窗无标注」判为 rejected | 与 L137 共同闭合 |

与相邻课的边界：L135 给出 \`Claim\` / \`Citation\` 契约、三角色禁令与四验收断言；L136 给出 \`PlanResult\` 与章节归属；L137 给出 \`EvidencePack\` / \`Span\` / \`DatedCitation\` / \`freshness()\`。本课不改任何一个，只新增 \`team/\` 下的三角色接口、\`Verdict\`、冲突处理、合成器与密度检查，产出 \`Report\`。L139 消费 \`Verdict.checkedAgainst\` 与 \`Report\` 做追踪树与抽检基线，L140 处理 \`redraft()\` 的重取成本与长文分段，L141 负责引用锚点渲染、导出与交付复盘。

一句话记住本课：**多 Agent 的价值不是互相检查，而是把「谁能产生文本」和「谁能判定文本」隔开；隔开之后，读者点开的引用才指向当初被校验过的那一句。**

:::tip

### 判断研究小组是否真的可信的三个问题

把一条 claim 的文本在评审后偷偷改两个字，\`assertReviewerDidNotRewrite()\` 有没有报红；造两条数值互斥的 claim，\`assertConflictsHandledV2()\` 在没有任何 \`ConflictRecord\` 时有没有失败；往合成器里塞一条 \`unverified\` claim，\`assertPublishable()\` 有没有在写正文之前拦下。三个都成立，L139 才有能建立基线的报告。只看到三个角色都跑起来了，什么都还没证明。

:::
`,
    null,
    [
      {
        text: '为什么 Verdict 类型里不能有任何文本字段？',
        options: [
          '为了省 token',
          '校验过的文本必须与发布的文本是同一句，评审改写会让溯源链与抽检记录同时失效',
          '模型不擅长写长文本',
          '类型太长不好维护',
        ],
        answer: 1,
        explain: '生成权与判定权必须隔离，评审发现问题只能打回重新取证。',
        concept: 'cap-b-multi',
      },
      {
        text: 'contested claim 的正确处理是？',
        options: [
          '直接删掉其中一条让报告更干净',
          '并列标注分歧 / 降级脚注 / 补第三方裁决，三选一且必须留 ConflictRecord',
          '当成 unverified 丢弃',
          '交给合成器自行润色合并',
        ],
        answer: 1,
        explain: '冲突是读者最先追问的地方，不能藏起来。',
        concept: 'cap-b-multi',
      },
      {
        text: '合成器里「正文句子的唯一来源」指的是？',
        options: [
          '检索到的原文片段',
          'claim.text 加引用编号，过渡句不含新事实',
          '模型根据大纲自由生成的段落',
          '评审的建议文本',
        ],
        answer: 1,
        explain: '任何润色合并都会产生没有独立 citation 的新句子。',
        concept: 'cap-b-multi',
      },
      {
        text: '为什么冲突检查必须双向比对 contestedIds 与 ConflictRecord？',
        options: [
          '为了减少计算量',
          '单向检查会放过「标了 contested 但没人处理」的 claim，与只测正例同类',
          '记录格式要求',
          '方便排序',
        ],
        answer: 1,
        explain: '断言要对着失败的那一侧写。',
        concept: 'cap-b-multi',
      },
    ],
    [
      ['三角色', '研究员产文本、评审只判定、合成员只组织'],
      ['Verdict', '只有 outcome / reason / checkedAgainst，没有文本字段'],
      ['评审禁令', '不得改写 claim 文本，发现问题打回重新取证'],
      ['contested', '有证据但互相冲突，三种处理且必须留痕'],
      ['claim 密度', '每千字 claim 数，低于阈值判报告注水'],
      ['引用编号', '渲染时由持久 id 映射为序号，id 不变序号可变'],
      ['四条验收断言', '无支撑率 0 / 多样性 ≥0.5 / 冲突全处理 / 引用可定位'],
    ],
    [
      '让评审顺手把句子改通顺，日志里通过的句子和报告里的不是同一句。',
      '把两条数值互斥的 claim 并列写进正文却不标分歧，读者看到自相矛盾的结论。',
      '只检查 ConflictRecord 格式，放过「标了 contested 却没处理」的 claim。',
      '合成器把两句 claim 润色合并成一句新话，产生没有 citation 的事实陈述。',
      '报告越写越长、claim 密度下降，却只给低分不当硬失败。',
    ],
  ),
  'capstone',
)
