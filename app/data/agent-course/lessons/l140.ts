import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L140 = withKind(
  L(
    'L140',
    27,
    '实战 Capstone B：从零加安全（防幻觉 / 溯源校验）+ 成本优化（长文 token）',
    4,
    ['L139'],
    ['cap-b-safety'],
    [
      '从零实现机械层与人工层并排的防幻觉发布闸门',
      '写出按章节分段合成、失败只重跑该段的长文成本控制',
      '实现检索缓存命中率与重取次数两张账单，并给出「省钱反而更贵」的判据',
      '保住 synthesize() 原有语义，写出分段与整篇一致性的硬断言',
    ],
    `
### 一句「据业内估算」，让全绿的 CI 变成笑话

第三份报告发布前，五检查全绿：无支撑率 0、多样性 0.8、树完整、抽检 20 条、时效都标了。发布后读者指出第三段有一句「据业内估算，渗透率已超过六成」，没有任何引用。查下来原因很朴素：这句话根本不是 claim，它是合成器加的一句过渡语——\`CONNECTORS\` 白名单里没有「据业内估算」，于是 \`unsupportedRate()\` 把它当成事实句，可它连 \`[\` 都没有……等等，它应该被判无支撑才对。真正的问题是它压根没进 \`Section.body\` 的检查范围：有人为了排版，把过渡语直接拼进了渲染模板，绕过了合成器。

同一周成本看板也爆了：一份 6000 字报告花了几十美元，其中七成是「重跑整篇」。某个章节的第三章生成失败，脚本就把全篇重新合成一次，前两章的 token 全部重付。L135 的成本段早就写过「检索与重排只占小头，长文合成与多轮评审才是大头」，还特意点名「按章节分段、失败只重跑该段」，但图纸没给实现。本课就来补这两块：**防幻觉要覆盖渲染层的旁路，成本要按章节隔离**，且两件事都不能改 \`synthesize()\` 已经定下的语义。

### 本课唯一要回答的问题

**如何在不改合成契约的前提下，把「没有出处的句子」挡在发布前，并让长文的钱只花在真正需要重跑的那一段上。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 三层证据树、抽检表与基线 | L139 | 已交付，本课只消费其检查与记录 |
| 沙箱、调用图、凭证隔离 | L133 | A 分支防的是不可逆副作用 |
| 注入载荷分类与提示词防御原理 | L83 / L84 | 本课只在这套渲染链上落地 |
| 引用锚点渲染与 PDF 导出 | L141 | 本课保证渲染层不产生旁路文本 |
| 报告服务部署与复盘 | L141 | 本课只给可装配的闸门与账单 |

### 第一件事：防幻觉是两道并排的门，不是一道更严的门

L139 把边界划得很死：机械检查判「有无」，人工抽检判「语义」。本课最容易犯的错，是把两者合并成一个总分然后设阈值。正确的结构是**并排两道门，任一不过都不发布**：机械层覆盖所有可判定的有无问题，人工层确认抽检做过且基线没倒退，两层之间不互相代替。

| 检查 | 层 | 失败条件 | 为什么单独成项 |
|---|---|---|---|
| 渲染层无旁路文本 | 机械 | 正文出现不在 \`Section.body\` 里的句子 | 开场事故的根因 |
| 树内 quote 全覆盖 | 机械 | citation 的 quote 找不到 span 节点 | 防止证据来自树外 |
| 无支撑率判 0 | 机械 | 事实句不带引用编号 | L135 断言① |
| 冲突与时效已处理 | 机械 | contested 无记录 / 超窗无标注 | L135 断言③ |
| 密度与多样性 | 机械 | 注水或单源伪装 | L135 断言②④ |
| 20 条抽检 + 基线 | 人工 | 没做、少做、准确率倒退 | 语义判断不可自动化 |

\`\`\`ts title="safety/gate.ts：机械层与人工层并排的发布闸门" note="关键：闸门只检查人工层「做过没有、倒退没有」，绝不替人判「判得对不对」。"
export type GateResult = {
  approved: boolean
  mechanical: Record<string, boolean>
  human: { sampled: number; baselineOk: boolean; reasons: string[] }
  reasons: string[]
}

export interface HumanBaseline {
  check(sheet: SamplingSheet): Promise<{ ok: boolean; reasons: string[] }>
}

export class HallucinationGate {
  constructor(private baseline: HumanBaseline) {}

  async check(args: {
    tree: EvidenceTree
    report: Report
    sheet: SamplingSheet
    rendered: string
    kind: ClaimKind
    now: number
  }): Promise<GateResult> {
    const reasons: string[] = []
    const mechanical: Record<string, boolean> = {}
    const quality = assertTraceQuality({ tree: args.tree, report: args.report,
      sheet: args.sheet, kind: args.kind, now: args.now })
    mechanical.traceQuality = quality.ok
    mechanical.noRenderBypass = assertNoRenderBypass(args.report, args.rendered)
    mechanical.conflictsHandled = assertConflictRecords(args.report)
    for (const [k, v] of Object.entries(mechanical)) {
      if (!v) reasons.push('mechanical: ' + k + ' failed')
    }
    const baseline = await this.baseline.check(args.sheet)
    const human = { sampled: args.sheet.rows.length,
      baselineOk: baseline.ok, reasons: baseline.reasons }
    if (!baseline.ok) reasons.push('human: ' + baseline.reasons.join(' | '))
    return { approved: reasons.length === 0, mechanical, human, reasons }
  }
}

export function assertNoRenderBypass(report: Report, rendered: string): boolean {
  const allowed = report.sections.map((s) => s.heading + s.body)
  const lines = rendered.split('。').map((x) => x.trim()).filter(Boolean)
  for (const line of lines) {
    const isHeading = report.sections.some((s) => line === s.heading)
    if (isHeading) continue
    if (!allowed.some((body) => body.includes(line))) {
      throw new Error('render-only sentence without a claim: ' + line.slice(0, 30))
    }
  }
  return true
}

export function assertConflictRecords(report: Report): boolean {
  const recorded = new Set(report.conflictRecords.flatMap((r) => r.claimIds))
  for (const r of report.conflictRecords) {
    if (r.claimIds.length < 2) throw new Error('conflict needs two claims')
    if (recorded.size === 0) throw new Error('empty conflict handling')
  }
  return true
}
\`\`\`

\`assertNoRenderBypass()\` 是开场事故的直接修复：它拿渲染后的全文逐句比对，要求每一句都能在 \`Section.body\` 里找到。注意它比对的是**渲染结果**而不是 \`report\` 对象——若只检查 \`report\`，模板里偷偷拼的那句话永远看不见。这条检查也解释了一个更一般的道理：**任何「最后一步」的自由度都会成为溯源体系的缺口**，L133 的静态调用图挡的是执行旁路，这里挡的是文本旁路，形状不同、原则相同。

另外，\`assertConflictRecords()\` 只校验记录格式与正文是否留痕；\`contested\` 与记录的**双向比对**由 L138 的 \`assertConflictsHandledV2()\` 在进闸门之前完成，两处不重复实现同一套规则。L133 处理工具等级表漂移时得到的教训在这里同样适用：同一个判据若有两份实现，改一处漏一处只是时间问题。

\`\`\`ts title="safety/segmented.ts：长文按章节分段，失败只重跑该段" note="关键：synthesize() 只加一个可选编号映射，不传时行为与 L138 完全一致。"
export type SectionBudget = {
  heading: string
  claimIds: string[]
  inputTokens: number
  outputTokens: number
  retries: number
  cacheHit: boolean
}

export type CostBill = {
  sections: SectionBudget[]
  totalTokens: number
  retrievalHits: number
  retakeCount: number
  cacheRate: number
}

export function segmentedSynthesize(args: {
  claims: SectionedClaim[]
  outline: string[]
  conflicts: ConflictRecord[]
  densityMin: number
  cache: Map<string, Section>
  failOnce?: string
}): { report: Report; bill: CostBill } {
  const citations = dedupeById(args.claims.flatMap((c) => c.citations as DatedCitation[]))
  const globalNumbers = new Map(citations.map((c, i) => [c.id, i + 1]))
  const sections: Section[] = []
  const budgets: SectionBudget[] = []
  for (const heading of args.outline) {
    const group = args.claims.filter((c) => c.section === heading
      && c.support !== 'unverified' && c.support !== 'contested')
    const key = heading + '|' + group.map((c) => c.id).sort().join('|')
    const cached = args.cache.get(key)
    if (cached) {
      sections.push(cached)
      budgets.push({ heading, claimIds: group.map((c) => c.id),
        inputTokens: 0, outputTokens: 0, retries: 0, cacheHit: true })
      continue
    }
    let retries = 0
    let built: Section
    for (;;) {
      try {
        if (args.failOnce === heading && retries === 0) {
          throw new Error('transient section failure')
        }
        const partial = synthesize({ claims: group, outline: [heading],
          conflicts: [], densityMin: 0, numberById: globalNumbers })
        built = partial.sections[0]!
        break
      } catch (err) {
        retries++
        if (retries > 2) throw err
      }
    }
    args.cache.set(key, built)
    sections.push(built)
    budgets.push({ heading, claimIds: group.map((c) => c.id),
      inputTokens: group.reduce((m, c) => m + c.text.length, 0),
      outputTokens: built.body.length, retries, cacheHit: false })
  }
  const body = sections.reduce((m, s) => m + s.body, '')
  const density = args.claims.length / Math.max(1, body.length / 1000)
  if (density < args.densityMin) throw new Error('report padding: ' + density)
  return {
    report: { sections, citations, conflictRecords: args.conflicts, density },
    bill: { sections: budgets,
      totalTokens: budgets.reduce((m, b) => m + b.inputTokens + b.outputTokens, 0),
      retrievalHits: 0, retakeCount: 0, cacheRate:
        budgets.filter((b) => b.cacheHit).length / Math.max(1, budgets.length) },
  }
}
\`\`\`

这里有两处刻意的设计。第一，\`numberById\` 是 \`synthesize()\` 的**可选参数**：不传时它自己按局部顺序编号，行为与 L138 逐字一致；分段合成时传入全局映射，避免每段都从 \`[1]\` 开始导致编号冲突。加一个默认关闭的参数不算改语义，但能省掉一整套「合并后再重编号」的字符串替换——那种替换正是编号漂移的常见来源。

第二，\`densityMin: 0\` 传给每一段，整篇算完再统一判密度。**密度是整篇指标，不能按段判**：一个章节只有一条 claim 很正常，按段卡密度会把合理的短章节误杀，或者逼人往短章节里塞水句，反而制造幻觉风险。整篇判一次，既守住了 L135 的「报告注水」，又不干预章节内部结构。

\`\`\`ts title="safety/bill.ts：两张账单与「省钱反而更贵」的判据" note="关键：检索缓存命中率与重取次数分开记账；重取次数上升比 token 上升更值得报警。"
export function mergeBills(args: {
  bill: CostBill
  sourceCache: SourceCache
  retakes: number
  threshold: { maxRetakeRatio: number; minCacheRate: number }
}): CostBill & { warnings: string[] } {
  const stats = args.sourceCache.stats()
  const merged = { ...args.bill, retrievalHits: stats.hits,
    retakeCount: args.retakes, cacheRate: stats.rate }
  const warnings: string[] = []
  const ratio = args.retakes / Math.max(1, args.bill.sections.length)
  if (ratio > args.threshold.maxRetakeRatio) {
    warnings.push('retake ratio too high: ' + ratio + ' — 检索或评审规则可能有缺陷')
  }
  if (stats.rate < args.threshold.minCacheRate) {
    warnings.push('source cache rate too low: ' + stats.rate)
  }
  return { ...merged, warnings }
}

export function assertNoCostRegression(before: CostBill, after: CostBill): void {
  const saved = before.totalTokens - after.totalTokens
  if (saved < 0 && after.retakeCount > before.retakeCount) {
    throw new Error('cost grew because of retakes, not because of longer content')
  }
}
\`\`\`

\`assertNoCostRegression()\` 的判断很窄但很实用：token 变多且**重取次数也变多**时才报错，因为那说明钱花在了返工上，不是花在更长的内容上。L135 讲过「最无效的优化是用更便宜的小模型做检索相关性判断」——判断错了会让整份报告的 claim 建立在无关证据上，返工成本远超省下的推理费；\`retakeCount\` 就是把这种「省钱反而更贵」变成可观测的数字。检索缓存命中率单独记，是因为它对应另一类问题：\`sourceId\` 没归一或 \`queries\` 不稳定，两者都会让 \`SourceCache\` 白建。

:::deep

### 为什么防幻觉不能只靠提示词，也不能只靠最后一道检查

「请不要编造没有出处的内容」这类提示词，和 L83 讲的注入防御是同一个困境：约束写在模型能读到的文本里，而不是写在系统能强制的结构里。模型读到一份互相矛盾的材料时，完全可能为了叙述连贯补一句「综合来看」——它没有恶意，只是把「写通顺」当成了任务。L135 把 claim / citation 做成类型契约，就是为了让「无引用的句子」在构造时写不出来。

但开场事故说明，光有构造时的约束还不够：只要渲染层还能自由拼接文本，就存在一条绕过契约的路。所以防幻觉是**三层叠加**：构造层（\`assertPublishable\` 拦 unverified）、追踪层（\`assertTraceComplete\` 要求 quote 在树内）、渲染层（\`assertNoRenderBypass\` 要求每句都能回指 \`Section.body\`）。三层各自挡住一条不同的路径，缺一层就会出现「内部字段全绿、读者看到的却多一句」的荒唐结果。

这也解释了为什么本课要并排跑机械层与人工层。机械层再密，也判不了「这段原文是否足以支撑这个结论」；人工抽检再认真，也覆盖不了每一句、每一版。**结构与判断不是同一类防线，不能互相折算成一个分数。**

:::

### 两条分支的安全与成本，差在失败代价

L135 说两个 Capstone 是「同一棵树的另一条分支」，这句话最实在的含义在下面这张表里。把 A 的门禁直接搬到 B、或把 B 的成本模型套到 A，都会得到一套看起来完整但挡不住真实事故的系统：

| 维度 | Capstone A（执行型） | Capstone B（认知型） |
|---|---|---|
| 失败代价 | 不可逆副作用，立刻可见 | 无出处的结论，发布后才发现 |
| 安全核心 | 工具最小权限 + 审批票据 + 静态调用图 | claim/citation 契约 + 三层追踪 + 渲染旁路检查 |
| 门禁形态 | 4 条负例硬失败 + 调用图无旁路 | 机械层 + 人工层并排，任一不过不发布 |
| 成本大头 | 无效重试与重复动作 | 长文合成与打回重取 |
| 缓存单位 | 幂等键 / 会话 | sourceId / 章节加 claim id 集合 |
| 不能自动化 | 真实模型质量的抽检 | 「原文是否支撑结论」的判断 |

共享的是**方法**而不是组件：把约束写进类型、用事实源而不是自述、评测以负例为主、成本优化只改「什么时候重算」。但方法落到哪一层的判据，取决于失败代价落在哪：A 的代价在动作发生的一刻，所以要在执行入口前设墙；B 的代价在读者信以为真的那一刻，所以要一路设到渲染完成后的最后一句。A 的「执行入口收口」管不到模板里多拼的一句话，B 的「抽检 20 条」也拦不住一次误重启——**不存在一份通用的 Agent 安全清单**。

### 接缝：L141 该把哪些东西接进报告服务

L141 要做部署与交付，最省事的写法是「把闸门跑一次然后发文件」。但闸门的输出必须和渲染结果形成闭环，否则开场那次事故会从另一个入口重演：

| 本课交付 | L141 的用法 | 不允许改什么 |
|---|---|---|
| \`HallucinationGate\` | 发布流水线唯一闸门，置于导出之前 | 不得拆成「先发后补检」 |
| \`renderAnchors()\` 的输出 | **回喂** \`assertNoRenderBypass()\` 再判一次 | 不得拿 \`report\` 对象代替渲染全文 |
| \`CostBill\` | 成本看板与容量估算 | 不得用估算值覆盖实测 token |
| \`SectionBudget.retries\` | 章节重试告警阈值 | 不得把重试当成正常路径静默吞掉 |
| 全局 \`numberById\` | 锚点渲染的序号来源，持久 id 仍只存 \`citation.id\` | 不得把序号写进抽检表或数据库 |

第二行是本课与 L141 之间最要紧的一条：\`renderAnchors()\` 会把 \`[1]\` 变成可点开的链接，这个过程中若模板又插入了任何文本，机械层前面的检查就白做了。所以顺序必须是「渲染 → 回喂闸门 → 通过才导出」，而不是「检查报告对象 → 渲染 → 直接导出」。这也把 L140 的三层防线收成了一个环：构造层、追踪层、渲染层各自设防，最后再用一次渲染结果把整条链复核一遍。

### 五条验收断言

\`\`\`ts title="evals/l140-safety.test.ts：闸门、分段、缓存与不改语义四类断言" note="关键：全部用固定 claim 与内存缓存；真实模型输出不进断言。"
import assert from 'node:assert/strict'

function dated(id: string, sourceId: string, quote: string): DatedCitation {
  return { id, sourceId, quote, publishedAt: Date.UTC(2025, 0, 1) }
}
function claim(id: string, text: string, cs: DatedCitation[], section = '市场'): SectionedClaim {
  return { id, text, citations: cs, support: cs.length >= 2 ? 'multi' : 'single',
    section, kind: 'market', questionId: 'q1' }
}
function sheet(reportId: string): SamplingSheet {
  return { reportId, accuracy: 1, rows: Array.from({ length: 20 }, (_, i) => ({
    citationId: 'c:' + i, claimId: 'cl:' + i, quote: '原文片段',
    verdict: 'supported' as const, reviewer: 'human-1', note: '', at: 0,
  })) }
}

function t1_renderBypassBlocked() {
  const report: Report = { sections: [{ heading: '市场',
    body: '市场规模为 120 亿[1]', claimIds: ['cl1'] }],
    citations: [], conflictRecords: [], density: 1 }
  assert.equal(assertNoRenderBypass(report, '市场。市场规模为 120 亿[1]'), true)
  assert.throws(() => assertNoRenderBypass(report,
    '市场。市场规模为 120 亿[1]。据业内估算渗透率已超过六成'),
    /render-only sentence/)
}

async function t2_gateRequiresBothLayers() {
  const rows: SamplingSheet[] = []
  const baseline: HumanBaseline = { check: async (s) => {
    rows.push(s)
    return { ok: rows.length === 1, reasons: rows.length === 1 ? [] : ['baseline regressed'] }
  } }
  const cit = dated('c:src-a:0-9', 'src-a', '市场规模为 120 亿')
  const report: Report = { sections: [{ heading: '市场',
    body: '市场规模为 120 亿[1]', claimIds: ['cl1'] }],
    citations: [cit], conflictRecords: [], density: 1 }
  const tree: EvidenceTree = { reportId: 'R', roots: [], orphans: [],
    nodes: new Map([
      ['cl:cl1', { id: 'cl:cl1', kind: 'claim', parentId: null, children: [],
        at: 0, payload: { checkedAgainst: ['s1'] } }],
      ['sp:s1', { id: 'sp:s1', kind: 'span', parentId: null, children: [],
        at: 0, payload: { quote: cit.quote } }],
    ]) }
  const gate = new HallucinationGate(baseline)
  const args = { tree, report, sheet: sheet('R'),
    rendered: '市场。市场规模为 120 亿[1]',
    kind: 'market' as ClaimKind, now: Date.UTC(2025, 6, 1) }
  const first = await gate.check(args)
  assert.equal(first.approved, true)
  const second = await gate.check({ ...args, sheet: sheet('R2') })
  assert.equal(second.approved, false, '人工层倒退必须单独拦下')
  assert.equal(second.mechanical.noRenderBypass, true)
}

function t3_segmentedRetryOnlyRerunsOneSection() {
  const cs = [
    claim('cl1', '市场规模为 120 亿', [dated('c:1', 's-a', '规模 120 亿')]),
    claim('cl2', '增速高于行业均值', [dated('c:2', 's-b', '增速高于均值')], '技术'),
  ]
  const r = segmentedSynthesize({ claims: cs, outline: ['市场', '技术'],
    conflicts: [], densityMin: 0.1, cache: new Map(), failOnce: '技术' })
  assert.equal(r.report.sections.length, 2)
  assert.equal(r.bill.sections[0]!.retries, 0)
  assert.equal(r.bill.sections[1]!.retries, 1)
  assert.equal(r.bill.sections[0]!.inputTokens > 0, true)
  assert.equal(r.bill.sections[1]!.inputTokens > 0, true)
}

function t4_cacheHitsOnSecondRun() {
  const cs = [claim('cl1', '市场规模为 120 亿', [dated('c:1', 's-a', '规模 120 亿')])]
  const cache = new Map<string, Section>()
  const args = { claims: cs, outline: ['市场'], conflicts: [],
    densityMin: 0.1, cache }
  segmentedSynthesize(args)
  const second = segmentedSynthesize(args)
  assert.equal(second.bill.sections[0]!.cacheHit, true)
  assert.equal(second.bill.cacheRate, 1)
  assert.equal(second.bill.totalTokens, 0)
}

function t5_segmentedKeepsSynthesisSemantics() {
  const cs = [
    claim('cl1', '市场规模为 120 亿', [dated('c:1', 's-a', '规模 120 亿')]),
    claim('cl2', '增速高于行业均值', [dated('c:2', 's-b', '增速高于均值')]),
  ]
  const whole = synthesize({ claims: cs, outline: ['市场'], conflicts: [], densityMin: 0.1 })
  const parts = segmentedSynthesize({ claims: cs, outline: ['市场'],
    conflicts: [], densityMin: 0.1, cache: new Map() })
  assert.equal(parts.report.sections[0]!.body, whole.sections[0]!.body)
  assert.deepEqual(parts.report.citations.map((c) => c.id),
    whole.citations.map((c) => c.id))
}

t1_renderBypassBlocked()
await t2_gateRequiresBothLayers()
t3_segmentedRetryOnlyRerunsOneSection()
t4_cacheHitsOnSecondRun()
t5_segmentedKeepsSynthesisSemantics()
console.log('L140 safety: 5/5 passed')
\`\`\`

第五条是整套成本优化的收口条件：分段合成的正文与整篇合成**逐字一致**、引用 id 顺序一致。若为了分段方便改了 \`synthesize()\` 的默认行为，L138 的评测集、L139 的追踪树与抽检记录会同时失去可比性——省下的 token 远不够赔。**成本优化只能改「什么时候重算」，不能改「算出来是什么」。**

:::warn

### 三个安全与成本的翻车点

**一、把机械层与人工层折算成一个总分。** 只要人工抽检的结论能被机械检查的分数补偿，「原文是否支撑结论」就变成可议价的成本。两道门并排，任一不过都不发布。

**二、只检查 report 对象，不检查渲染结果。** 模板里多拼一句过渡语，内部字段全绿、读者看到的却多一句无出处事实。闸门必须拿渲染后的全文逐句回指 \`Section.body\`。

**三、用更便宜的小模型做检索相关性判断。** L135 点名过的最无效优化：判断错了，整份报告的 claim 建在无关证据上，返工成本远超省下的推理费。判断 \`retakeCount\` 是否上升，比看单份账单便宜多少更有用。

:::

### 风险登记表回填与分工

| L135 风险项 | 本课进展 | 状态 |
|---|---|---|
| 引用张冠李戴 | 人工基线进发布闸门，机械层校验 quote 在树内 | 与 L137/L139 共同闭合 |
| 报告注水 | 整篇密度硬失败；分段不按段卡密度避免逼出水句 | 与 L138 共同闭合 |
| 时效过期 / 冲突被抹平 | \`assertTraceQuality()\` 五检查 + \`assertConflictRecords()\` 进闸门 | 已闭合 |
| 成本随篇幅失控 | 分段缓存、失败只重跑该段、两张账单与重取比判据 | 已闭合 |
| 渲染层幻觉旁路 | \`assertNoRenderBypass()\` 逐句回指 | **本课新增并闭合** |

与相邻课的边界：L137 提供 \`SourceCache\` / \`freshness()\` / \`matchCitation()\`，L138 提供 \`synthesize()\` / \`Report\` / \`unsupportedRate()\`，L139 提供 \`assertTraceQuality()\` / \`SamplingSheet\` / \`CitationBaseline\` / \`EvidenceTree\`。本课只给 \`synthesize()\` 加一个默认关闭的可选编号映射，其余接口一行不改，新增 \`safety/\` 下的闸门、分段合成与账单。L141 把 \`HallucinationGate\` 接进报告服务的发布流水线，并把 \`renderAnchors()\` 的渲染结果回喂给 \`assertNoRenderBypass()\`；它不需要知道分段是怎么缓存的。

一句话记住本课：**防幻觉要覆盖到渲染层的最后一句，成本优化只能改「什么时候重算」；两件事都不许动「算出来是什么」。**

:::tip

### 判断闸门与账单是否真的可用两个问题

在渲染模板里偷偷加一句「据业内估算」，\`assertNoRenderBypass()\` 有没有在机械检查全绿的情况下报红；让第三章生成失败一次，账单里第一、二章的 \`inputTokens\` 有没有保持为 0（没被重付）、第三章 \`retries\` 是不是 1。两个都成立，L141 才敢把报告服务放出去。只看到「CI 全绿」和「总成本下降」，什么都还没证明。

:::
`,
    null,
    [
      {
        text: '为什么防幻觉闸门要把机械层与人工层并排，而不是合并成一个总分？',
        options: [
          '并排跑更快',
          '语义判断一旦能被机械分数补偿，就等于可议价；两道门任一不过都不发布',
          '总分不好算',
          '人工层不该进 CI',
        ],
        answer: 1,
        explain: '结构与判断不是同一类防线，不能互相折算。',
        concept: 'cap-b-safety',
      },
      {
        text: 'assertNoRenderBypass() 为什么必须比对渲染后的全文？',
        options: [
          '渲染文本更短',
          '模板里多拼一句过渡语时，report 对象依然全绿，只有渲染结果能暴露旁路',
          '方便导出 PDF',
          '报告对象不可序列化',
        ],
        answer: 1,
        explain: '任何最后一步的自由度都会成为溯源体系的缺口。',
        concept: 'cap-b-safety',
      },
      {
        text: '分段合成时把 densityMin 设为 0、整篇再统一判密度，理由是？',
        options: [
          '分段不算字数',
          '密度是整篇指标；按段卡会误杀合理短章节，或逼人塞水句制造幻觉风险',
          '0 是最快的值',
          'L138 要求这样',
        ],
        answer: 1,
        explain: '守住注水约束的同时不干预章节内部结构。',
        concept: 'cap-b-safety',
      },
      {
        text: '判断「省钱反而更贵」最该看哪个数字？',
        options: ['单份报告的 token 总数', '重取次数 / 重取比是否上升', '缓存命中率', '模型单价'],
        answer: 1,
        explain: 'token 变多且重取变多，说明钱花在返工而非更长的内容上。',
        concept: 'cap-b-safety',
      },
    ],
    [
      ['并排双门', '机械层判有无、人工层判语义，任一不过不发布'],
      ['渲染旁路检查', '渲染全文逐句回指 Section.body，挡住模板里多拼的句子'],
      ['分段合成', '按章节生成，失败只重跑该段，缓存键含 claim id 集合'],
      ['全局编号映射', '可选 numberById 保证分段后引用编号不冲突、不漂移'],
      ['两张账单', '检索缓存命中率与重取次数分开记账'],
      ['不改语义', '分段与整篇正文逐字一致、引用 id 顺序一致'],
    ],
    [
      '把机械检查与人工抽检折算成一个总分，让语义判断被分数补偿掉。',
      '只检查 report 对象不检查渲染结果，模板里多拼一句无出处事实照样全绿。',
      '按章节卡 claim 密度，逼出注水短句或误杀合理短章节。',
      '分段合成各自从 [1] 编号，合并后同一全文出现重复序号。',
      '用更便宜的小模型做检索相关性判断，返工成本远超省下的推理费。',
    ],
  ),
  'capstone',
)
