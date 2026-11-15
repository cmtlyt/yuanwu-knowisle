import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L141 = withKind(
  L(
    'L141',
    27,
    '实战 Capstone B：从零部署 + 研究报告交付 + 全链路复盘',
    4,
    ['L140'],
    ['cap-b-deploy'],
    [
      '从零实现编号稳定、可点开、可导出的引用锚点渲染器',
      '写出装配七课组件的报告服务与「渲染 → 回喂闸门 → 导出」发布流水线',
      '实现四样交付物的自检器与 3 秒定位断言',
      '完成 Capstone B 七课全链路复盘与 A/B 分叉收口',
    ],
    `
### 导出 PDF 之后，引用全部点不开了

管线跑通、闸门全绿、报告 6000 字发到客户手里，第二天收到一句反馈：「网页上能点，PDF 里点不动」。排查下来是渲染层把引用做成了一个前端路由链接 \`/report/R1#cite-3\`，导出时链接原样保留，离线文件里自然没有这个路径。同一份报告还有第二个问题：客户把第三章提前后，全文编号重排，之前抽检记录里的 \`[14]\` 已经指向另一条引用——L139 明明把抽检主键改成了持久 \`citation.id\`，但渲染层仍在按出现顺序临时编号。

L135 的图纸里写过引用落地要满足三条：**编号稳定、可点开、可导出**。前两条在网页上容易做，第三条要求锚点在离线文件里依然有效；而编号稳定要求「序号可以变、持久 id 不变」，两者是同一件事的两面。L140 的接缝表也钉死了顺序：\`renderAnchors()\` 的输出必须**回喂** \`assertNoRenderBypass()\` 再判一次，通过才导出。本课就是把这套交付链真正装起来，并做全链路复盘。

### 本课唯一要回答的问题

**如何让「可核对」从一个内部字段，变成读者在网页和离线文件里都能实际完成的动作。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 状态外置、灰度分桶原理 | L123 / L125 | 本课只装配，不重新论证 |
| 三层证据树与抽检基线 | L139 | 已交付，本课只消费 |
| 防幻觉闸门与分段成本 | L140 | 已交付，本课接进流水线 |
| 工具网关、审批票据、调用图 | L129 / L133 | A 分支组件，不迁移 |
| 全课知识地图自检 | L142 | 那是整门课的收束，不是 B 分支的交付 |

### 第一件事：锚点的三个不变量

持久 \`citation.id\` 是数据库、抽检表、审计日志里唯一存的东西；渲染序号 \`[1]\` \`[2]\` 只是当下这次排版的一次映射。把两者分开，章节调整就不会破坏历史对照。可导出则要求锚点是**文档内链接**（\`#cite-<id>\`）而不是应用路由，且文末必须存在一个带原文片段的对应节点。

| 不变量 | 实现 | 违反症状 |
|---|---|---|
| 序号可变、id 不变 | \`numberById\` 每次渲染重算，\`data-cid\` 存持久 id | 抽检记录对不上历史版本 |
| 可点开 | 正文 \`<a href="#cite-...">\` 指向文末节点 | 读者无法核对 |
| 可导出 | 链接是文档内锚点，不依赖前端路由 | PDF 里点不动 |
| 文末有原文 | 每个锚点节点带 \`quote\` 全文 | 点开了但看不到被引的那段 |
| 无渲染旁路 | 渲染结果回喂 \`assertNoRenderBypass()\` | 模板多拼一句无出处事实 |

\`\`\`ts title="delivery/anchors.ts：编号稳定 + 文档内锚点 + 可导出" note="关键：href 不含路由前缀；data-cid 存持久 id，序号只出现在可见文本里。"
export type RenderedReport = {
  html: string
  bodyHtml: string   // 只含章节正文，供闸门回喂；参考文献区不算正文事实句
  anchors: { citationId: string; number: number; href: string }[]
  references: { citationId: string; quote: string; sourceId: string }[]
}

export function renderAnchors(report: Report): RenderedReport {
  const numbers = new Map(report.citations.map((c, i) => [c.id, i + 1]))
  const anchors: RenderedReport['anchors'] = []
  const references = report.citations.map((c) => ({
    citationId: c.id, quote: c.quote, sourceId: c.sourceId,
  }))
  const bodyParts: string[] = []
  const refParts: string[] = []
  for (const s of report.sections) {
    bodyParts.push('<h2>' + s.heading + '</h2>')
    let body = s.body
    for (const c of report.citations) {
      const n = numbers.get(c.id)
      if (n === undefined) continue
      const mark = '[' + n + ']'
      const href = '#cite-' + c.id
      if (body.includes(mark)) {
        body = body.split(mark).join('<a href="' + href + '" data-cid="'
          + c.id + '">' + mark + '</a>')
        anchors.push({ citationId: c.id, number: n, href })
      }
    }
    bodyParts.push('<p>' + body + '</p>')
  }
  for (const r of references) {
    refParts.push('<div id="cite-' + r.citationId + '"><span>' + r.sourceId
      + '</span><blockquote>' + r.quote + '</blockquote></div>')
  }
  return { html: [...bodyParts, ...refParts].join('\\n'),
    bodyHtml: bodyParts.join(''), anchors, references }
}

export function assertAnchorsUsable(rendered: RenderedReport, report: Report): void {
  for (const c of report.citations) {
    const a = rendered.anchors.find((x) => x.citationId === c.id)
    if (!a) throw new Error('citation without an anchor: ' + c.id)
    if (!a.href.startsWith('#')) throw new Error('anchor is not document-local: ' + a.href)
    if (!rendered.html.includes('id="cite-' + c.id + '"')) {
      throw new Error('anchor target missing: ' + c.id)
    }
    const ref = rendered.references.find((r) => r.citationId === c.id)
    if (!ref || !ref.quote.includes(c.quote.slice(0, 8))) {
      throw new Error('reference node lost the original quote: ' + c.id)
    }
  }
}
\`\`\`

\`assertAnchorsUsable()\` 把 L135 的第四条验收断言「任意一句正文都能在 3 秒内定位到原文片段」具体化成四个可失败检查：锚点存在、链接是文档内的、文末目标节点存在、节点里带着原文片段。最后一条最容易被省——只放一个来源标题的「参考文献」列表点开了也没用，读者要核对的是**被引的那一段**，不是那篇文档的标题。

\`\`\`ts title="delivery/service.ts：装配七课组件的报告服务" note="关键：闸门在渲染之后、导出之前再跑一次，喂的是渲染全文而不是 report 对象。"
export type ReportDeps = {
  plan: PlanResult
  packs: EvidencePack[]
  claims: SectionedClaim[]
  verdicts: Verdict[]
  sheet: SamplingSheet
  conflicts: ConflictRecord[]
  tree: EvidenceTree
  baseline: HumanBaseline
  now: () => number
}

export type Deliverable = {
  html: string
  report: Report
  anchors: RenderedReport['anchors']
  gate: GateResult
  manifest: { reportId: string; versions: string[]; builtAt: number }
}

export function createReportService(deps: ReportDeps) {
  const gate = new HallucinationGate(deps.baseline)
  return {
    async publish(reportId: string): Promise<Deliverable> {
      const report = synthesize({ claims: deps.claims,
        outline: deps.plan.roots.length ? deps.plan.roots.map((q) => q.section) : ['市场'],
        conflicts: deps.conflicts, densityMin: 1 })
      const rendered = renderAnchors(report)
      assertAnchorsUsable(rendered, report)
      const verdict = await gate.check({ tree: deps.tree, report,
        sheet: deps.sheet, rendered: stripTags(rendered.bodyHtml),
        kind: 'market', now: deps.now() })
      if (!verdict.approved) throw new Error('publish blocked: ' + verdict.reasons.join(' | '))
      return { html: rendered.html, report, anchors: rendered.anchors, gate: verdict,
        manifest: { reportId, versions: ['pipeline-1', 'prompt-7', 'tools-3'],
          builtAt: deps.now() } }
    },
  }
}

export function stripTags(html: string): string {
  return html.split('<').map((chunk) => {
    const end = chunk.indexOf('>')
    return end === -1 ? chunk : chunk.slice(end + 1)
  }).join('')
}
\`\`\`

\`stripTags()\` 用字符串切分而不是正则，理由与 L133 一致：课程正文是模板字符串，正则里的反斜杠会被吞掉，粘出去的代码块必须能直接跑。注意它喂的是 \`bodyHtml\` 而不是整份 \`html\`：文末参考文献区里的原文片段本来就不该被当成「正文事实句」，若把整份 HTML 交给 \`assertNoRenderBypass()\`，那些引文会被误判成渲染旁路，闸门天天误报、很快就会被关掉。**回喂的范围要和断言的语义对齐**——这一步是 L140 接缝表第二行要求的闭环，若跳过它，闸门检查的仍旧是 \`report\` 对象，模板里多拼的一句照样能溜进 PDF。

### 第二件事：四样交付物要能自检

L135 列的交付物不是四份文档，而是四项可验收的能力：管线代码四段独立可测、claim 数据集至少 40 条（10 条冲突、10 条单源）、真实报告 1500 字以上且全文引用可点开、一次 20 条抽检记录。把它们写成 \`assertDeliverables()\`，避免「做完了」变成口头结论。

\`\`\`ts title="delivery/checklist.ts：四样交付物的自检器" note="关键：冲突与单源各自至少 10 条，保证 contested 与「单一来源」两条路径真被测过。"
export function assertDeliverables(args: {
  claims: SectionedClaim[]
  html: string
  report: Report
  sheet: SamplingSheet
  anchors: RenderedReport['anchors']
}): { ok: boolean; stats: Record<string, number> } {
  const stats = {
    claims: args.claims.length,
    contested: args.claims.filter((c) => c.support === 'contested').length,
    single: args.claims.filter((c) => c.support === 'single').length,
    bodyChars: args.report.sections.reduce((m, s) => m + s.body.length, 0),
    anchors: args.anchors.length,
    sampled: args.sheet.rows.length,
  }
  if (stats.claims < 40) throw new Error('claim dataset too small: ' + stats.claims)
  if (stats.contested < 10) throw new Error('not enough contested cases')
  if (stats.single < 10) throw new Error('not enough single-source cases')
  if (stats.bodyChars < 1500) throw new Error('report too short: ' + stats.bodyChars)
  if (stats.anchors !== args.report.citations.length) {
    throw new Error('some citations have no anchor')
  }
  assertSamplingSheet(args.sheet)
  for (const a of args.anchors) {
    if (!args.html.includes('data-cid="' + a.citationId + '"')) {
      throw new Error('anchor lost its persistent id: ' + a.citationId)
    }
  }
  return { ok: true, stats }
}
\`\`\`

第三条「至少 10 条单源」常被当成凑数要求，其实它守的是 L135 合成器里 \`（单一来源）\` 这个标注：若数据集里没有单源 claim，这条渲染分支从未被跑过，上线后第一次遇到单源证据就可能漏标。冲突 10 条同理，它保证 \`contested\` 的三种处理路径都有真实输入。**数据集的形状决定哪些分支真的被验证过**，这和 L132「评测集必须含负例」是同一条原则。

### 第三件事：全链路复盘，写判断不写流水账

L134 做 A 分支复盘时定过格式：对了什么、走过什么弯路、重做会怎么改。B 分支七课按同一张表收口，不写「本课实现了 X」这类复述。

| 课 | 判断对了的地方 | 走过的弯路 | 如果重做会怎么改 |
|---|---|---|---|
| L135 | 先定 claim / citation 契约再写检索 | 图纸初版漏了 contested 与时效 | 第一版就把「证据冲突」当一等状态 |
| L136 | 可检索性硬校验 + 检索预算在规划层锁定 | 树结构把重复当成分支，缓存命中近零 | 从第一天就用规范化键合并 |
| L137 | 抽取与匹配两次调用分离 | 去重键曾想用文本相似度 | sourceId 归一放在入库，不放在检索 |
| L138 | 三角色用返回类型隔离生成权与判定权 | 评审曾顺手改写 claim 文本 | \`Verdict\` 从一开始就不设文本字段 |
| L139 | 抽检按持久 id 存档、树主干是证据 | 抽检表初版按 \`[n]\` 存档 | 持久 id 在 L135 就写进契约 |
| L140 | 机械层与人工层并排、分段只重跑该段 | 只查 \`report\` 不查渲染结果 | 渲染回喂闸门提前到图纸层 |
| L141 | 锚点用文档内链接、闸门置于导出前 | 曾把它做成前端路由链接 | 三条不变量写成渲染器前置断言 |

\`\`\`ts title="delivery/demo.ts：演示脚本必须包含一次核对动作" note="关键：演示终点是「读者点开引用看到原文」，不是「服务返回 200」。"
export type DemoStep = { label: string; action: string; expected: string }

export const DEMO: DemoStep[] = [
  { label: '一条宽泛主题进来', action: 'decompose()', expected: '问题集可检索、不相交、带停止原因' },
  { label: '按问题混合检索', action: 'hybridRetrieve()', expected: '多源命中、按 sourceId 去重、多样性达标' },
  { label: '生成 claim 并评审', action: 'draftClaims() + review()', expected: '引用来自原文片段，评审只判定不改写' },
  { label: '注入一句无出处结论', action: 'renderAnchors() → 闸门', expected: '机械层报 render-only sentence，发布被拦' },
  { label: '修正后重新发布', action: 'publish()', expected: '锚点可点开、文末带原文片段' },
  { label: '导出离线文件', action: 'exportPdf()', expected: '锚点仍是文档内链接，点开仍可核对' },
  { label: '换一台机器抽检', action: 'replayEvidence()', expected: '沿树反查证据来历，不重新检索' },
]

export function assertDemoEndsWithVerification(s: DemoStep[]): void {
  if (!s.some((x) => x.expected.includes('拦'))) {
    throw new Error('demo must show a blocked publication')
  }
  if (!s.some((x) => x.expected.includes('原文片段'))) {
    throw new Error('demo must show the reader reaching the original quote')
  }
  if (!s.some((x) => x.action.includes('exportPdf'))) {
    throw new Error('demo must cover offline export')
  }
}
\`\`\`

:::deep

### 交付物是「可核对的报告」，不是「能跑的管线」

七课写下来，代码量不少：规划、检索、三角色、追踪、闸门、分段、渲染。但客户拿到手的只有一份报告，他不会关心 \`EvidencePack\` 长什么样，只会做一件事——遇到一个可疑的数字，点开引用，看原文是不是这么说的。**整条链的价值全部压缩在「点开之后三秒内能不能看到那一段」这个动作上**。

这也是为什么 L135 把第四条验收断言写成体验指标，而本课把它落成 \`assertAnchorsUsable()\` 的四个检查。前面所有内部不变量（持久 id、quote 是原文子串、评审不改写、树内 span 存在）如果最后没有变成读者能完成的动作，就只是团队自己的洁癖。反过来，只要这个动作可靠，读者就能自己发现「引用张冠李戴」「时效过期」这类自动化判不了的问题——**人工抽检不必只由团队做，读者是最后一道也是规模最大的一道抽检**。

所以交付顺序不能反：先保证锚点与原文片段可达，再谈报告排版、章节顺序、篇幅。L140 的接缝表要求「渲染 → 回喂闸门 → 通过才导出」，本质上是把这条价值链的最后一环也纳入验证；少了这一步，前面六课的严格都会在一个模板字符串上失守。

:::

### 五条验收断言

\`\`\`ts title="evals/l141-delivery.test.ts：锚点、闸门顺序与四样交付物" note="关键：断言全部对渲染后的 HTML 与固定数据集跑，不需要浏览器。"
import assert from 'node:assert/strict'

function dated(id: string, quote: string, sourceId = 's-a'): DatedCitation {
  return { id, sourceId, quote, publishedAt: Date.UTC(2025, 0, 1) }
}
function reportFixture(): Report {
  const c = dated('c:1', '市场规模为 120 亿')
  return { sections: [{ heading: '市场', body: '市场规模为 120 亿[1]', claimIds: ['cl1'] }],
    citations: [c], conflictRecords: [], density: 1 }
}

function t1_anchorsAreDocumentLocal() {
  const r = renderAnchors(reportFixture())
  assert.equal(r.anchors.length, 1)
  assert.equal(r.anchors[0]!.href, '#cite-c:1')
  assert.ok(r.html.includes('data-cid="c:1"'))
  assert.ok(r.html.includes('id="cite-c:1"'))
  assertAnchorsUsable(r, reportFixture())
}

function t2_renderedTextStillPassesBypassCheck() {
  const r = renderAnchors(reportFixture())
  const text = stripTags(r.bodyHtml)
  assert.ok(text.includes('市场规模为 120 亿[1]'))
  assert.equal(assertNoRenderBypass(reportFixture(),
    '市场。市场规模为 120 亿[1]'), true)
  assert.throws(() => assertNoRenderBypass(reportFixture(),
    text + '。据业内估算渗透率已超过六成'), /render-only sentence/)
}

function t3_threeSecondLookupAssertion() {
  const r = renderAnchors(reportFixture())
  const c = reportFixture().citations[0]!
  const ref = r.references.find((x) => x.citationId === c.id)
  assert.ok(ref)
  assert.ok(ref!.quote.includes(c.quote.slice(0, 8)))
  assert.ok(r.html.includes('href="#cite-' + c.id + '"'))
}

function t4_deliverablesRequireBothEdgeCasePools() {
  const mk = (i: number, support: Support): SectionedClaim => ({
    id: 'cl' + i, text: '结论 ' + i, citations: [dated('c:' + i, '原文片段 ' + i)],
    support, section: '市场', kind: 'market', questionId: 'q1',
  })
  const claims = [
    ...Array.from({ length: 10 }, (_, i) => mk(i, 'contested')),
    ...Array.from({ length: 10 }, (_, i) => mk(i + 10, 'single')),
    ...Array.from({ length: 20 }, (_, i) => mk(i + 20, 'multi')),
  ]
  const report = reportFixture()
  const rendered = renderAnchors(report)
  const sheet: SamplingSheet = { reportId: 'R', accuracy: 1,
    rows: Array.from({ length: 20 }, (_, i) => ({ citationId: 'c:' + i,
      claimId: 'cl' + i, quote: '原文片段', verdict: 'supported' as const,
      reviewer: 'human-1', note: '', at: 0 })) }
  const body = { claims, html: rendered.html, report, sheet, anchors: rendered.anchors }
  const long = { ...body, report: { ...report, sections: [{ heading: '市场',
    body: '市场规模为 120 亿[1]。' + '补充论据。'.repeat(400), claimIds: ['cl1'] }] } }
  assert.doesNotThrow(() => assertDeliverables(long))
  assert.throws(() => assertDeliverables(body), /report too short/)
}

function t5_demoEndsWithReaderVerification() {
  assert.doesNotThrow(() => assertDemoEndsWithVerification(DEMO))
  const noExport = DEMO.filter((s) => !s.action.includes('exportPdf'))
  assert.throws(() => assertDemoEndsWithVerification(noExport), /offline export/)
}

t1_anchorsAreDocumentLocal()
t2_renderedTextStillPassesBypassCheck()
t3_threeSecondLookupAssertion()
t4_deliverablesRequireBothEdgeCasePools()
t5_demoEndsWithReaderVerification()
console.log('L141 delivery: 5/5 passed')
\`\`\`

第四条断言把「claim 数据集至少 40 条、10 冲突、10 单源」与「报告 1500 字以上」放在一起测，是因为这两项常被拆开应付：数据集凑够了但报告很短，或报告够长但分支没覆盖。\`repeat(400)\` 造长文只为测字数门槛，真实报告当然不能靠重复——所以 \`densityMin\` 仍由 \`synthesize()\` 在交付前单独判一次。

### 交付之后：把一次验收变成可回归的资产

发布通过不等于结束。客户拿到的是 HTML 与 PDF，团队留下的是一份能重跑的记录：这次渲染用了哪组 claim、锚点表长什么样、闸门判了几次、抽检基线是哪一版。下一次哪怕只改了模板里的一个标点，也应该能回答「和上一版比，读者能点开的引用有没有变少」。

| 交付物 | 落盘记录 | 下一次怎么验 |
|---|---|---|
| 锚点表 | \`anchors[].citationId / number / href\` 全量 | 与上一版按持久 id 求差集，只允许序号变 |
| 渲染全文 | \`bodyHtml\` 的摘要与章节顺序 | 同一 claim 集重渲，逐句比对是否冒出新事实 |
| 闸门结论 | 拒因数组与命中层（机械 / 人工） | 用固定负例重放，要求拒因逐条一致 |
| 抽检基线 | 20 条记录的持久 id 与判定 | 只增不改，重跑时按持久 id 对齐 |
| 运行清单 | 四版本号与构建时间 | 回滚时按清单定位可回退的版本 |

这里最容易偷懒的是锚点表：它只是渲染副产物，很多人不存。但只要存了，编号漂移就能在上线前被差集检查抓住，而不是等客户来问「为什么 \`[14]\` 换了内容」。同理，闸门拒因要连命中的层一起存——L140 把机械层与人工层并排，就是为了事后能定位「这次拦截到底是哪一层拦的」；只存一个布尔值，就分不清是规则生效还是抽检碰巧发现。**可回归的粒度要细到能归因，粗到「通过 / 不通过」的日志等于没记。**

与 L142 的交接也在这里收口：本课交付的是一条具体系统的发布流水线，L142 不复用任何 \`delivery/\` 下的组件，而是把「把约束写成可失败断言」这件事抬到整门课的高度，用一张可自检的知识地图验证 142 课的前置关系、模块归属与双 Capstone 分叉。换句话说，本课验的是一份报告敢不敢交，L142 验的是一整门课的结构有没有自相矛盾——两者的共同点是**都不接受口头结论**。

:::warn

### 三个交付翻车点

**一、把引用做成前端路由链接。** 网页上能点、离线文件里点不动，等于把「可导出」这条验收直接丢掉。锚点必须是文档内 \`#cite-<id>\`，文末带原文片段节点。

**二、按出现顺序临时编号。** 任何一次章节调整都会让全文编号漂移，抽检记录、审计日志、历史版本之间无法对照。序号可以变，\`citation.id\` 不能变。

**三、闸门只跑一次且跑在渲染前。** 渲染模板是最后一道自由度，多拼一句无出处事实就能绕过前面六课。顺序固定为「渲染 → 回喂 \`assertNoRenderBypass()\` → 通过才导出」。

:::

### 风险登记表最终收口与 A → B 对照

| L135 风险项 | 最终缓解 | 验证位置 |
|---|---|---|
| 引用张冠李戴 | 两次调用分离 + 三层树 + 20 条人工抽检基线 | L137 / L139 |
| 单源伪装多源 | 按 sourceId 归一去重 + 多样性进闸门与交付自检 | L137 / L140 |
| 冲突被抹平 | contested 三种处理 + 双向留痕 + 10 条冲突样本 | L138 / L141 |
| 时效过期 | 窗口绑 ClaimKind + 超窗标注「数据截至」 | L137 / L140 |
| 报告注水 | 整篇密度硬失败 + 无支撑率判 0 + 渲染旁路检查 | L138 / L140 / L141 |

五项全部闭合，且每项都同时具备结构约束与可失败断言。与 Capstone A 的分叉到此完整：A 的主轴「动作 → 权限 → 回滚」把不可逆副作用关进网关与票据，B 的主轴「问题 → 证据 → 结论」把无出处句子挡在 claim 契约与渲染闸门之外；**组件不迁移，方法可迁移**——把约束写进类型、用事实源而非自述、评测以负例为主、成本优化不改语义，这四条在两条分支里都成立。

与相邻课的边界：L136–L140 提供规划、证据、三角色、追踪、闸门与账单，本课不改任何接口，只新增 \`delivery/\` 下的锚点渲染、报告服务、交付自检与演示脚本。L142 是整门课的收束，消费的不是 B 分支的组件，而是这两条分支共同沉淀的方法论与全课知识地图；它不会复用 \`renderAnchors()\`，但会复用「把约束写成可失败断言」这件事。

一句话记住本课：**交付的终点不是服务返回 200，而是读者点开引用、三秒内看到被引的那一段——网页上如此，离线文件里也必须如此。**

:::tip

### 判断报告是否真的可交付的两个问题

把 HTML 里的 \`href\` 换成应用路由，\`assertAnchorsUsable()\` 有没有报「anchor is not document-local」；在渲染模板里多拼一句「据业内估算」，回喂 \`assertNoRenderBypass()\` 有没有在导出前拦下。两个都成立，Capstone B 才算从「能跑」走到「敢交」。只看到一份排版漂亮的报告，什么都还没证明。

:::
`,
    null,
    [
      {
        text: '引用锚点为什么必须是文档内链接（#cite-id），而不是前端路由？',
        options: [
          '文档内链接更短',
          '离线 PDF 里路由不存在，读者点不开；文档内锚点在导出后依然有效',
          '路由不利于 SEO',
          '前端框架不支持',
        ],
        answer: 1,
        explain: 'L135 三条要求里的「可导出」正是这一条。',
        concept: 'cap-b-deploy',
      },
      {
        text: '「序号可变、持久 id 不变」解决的是什么问题？',
        options: [
          '让编号更好看',
          '章节调整后抽检记录、审计日志与历史版本仍能逐条对照',
          '减少 HTML 体积',
          '加快渲染',
        ],
        answer: 1,
        explain: '按出现顺序临时编号会让 [14] 指向另一条引用。',
        concept: 'cap-b-deploy',
      },
      {
        text: '发布流水线的正确顺序是？',
        options: [
          '检查 report 对象 → 渲染 → 直接导出',
          '渲染 → 回喂 assertNoRenderBypass() → 通过才导出',
          '导出 → 补跑抽检 → 再渲染',
          '闸门跑一次即可，位置不限',
        ],
        answer: 1,
        explain: '渲染模板是最后一道自由度，必须在导出前复核。',
        concept: 'cap-b-deploy',
      },
      {
        text: '交付自检为什么要求数据集里至少 10 条冲突、10 条单源 claim？',
        options: [
          '为了凑够 40 条',
          '保证 contested 三种处理与「单一来源」标注这两条渲染分支真的被测过',
          '模型要求',
          '为了方便排序',
        ],
        answer: 1,
        explain: '数据集的形状决定哪些分支真的被验证过。',
        concept: 'cap-b-deploy',
      },
    ],
    [
      ['编号稳定', '序号每次渲染重算，持久 citation.id 不变'],
      ['文档内锚点', 'href 为 #cite-<id>，导出后依然可点开'],
      ['文末原文片段', '锚点节点必须带 quote 全文，不是只有来源标题'],
      ['渲染回喂闸门', 'stripTags 后用渲染全文再判一次旁路'],
      ['四样交付物', '管线 / 40 条 claim 集 / 1500 字报告 / 20 条抽检'],
      ['3 秒定位', '锚点存在、目标存在、文末带原文片段的可失败检查'],
    ],
    [
      '把引用做成前端路由链接，PDF 里全部点不开。',
      '按出现顺序临时编号，章节调整后抽检记录与历史版本对不上。',
      '闸门只跑一次且跑在渲染前，模板多拼一句无出处事实直接进 PDF。',
      '文末参考文献只列来源标题，点开了看不到被引的那一段。',
      '交付自检只查字数，不检查 contested 与单源分支有没有真实样本。',
    ],
  ),
  'capstone',
)
