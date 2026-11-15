import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 23 ========== */

export const L118 = withKind(
  L(
    'L118',
    23,
    '研究 Agent：带溯源的综述',
    3,
    ['L49', 'L50'],
    ['research-agent'],
    [
      '实现「检索 → 原子事实卡 → 引用绑定 → 合成 → 溯源校验」的研究 Agent 管线',
      '写出可运行的溯源校验器，能检出无出处句、孤儿 id 与被改写的数字',
      '区分深度研究与 RAG 问答，能说明为什么「多塞几段」不能保证可溯源',
    ],
    `
### 三处「据统计」，两天没找回来

交付给客户的十二页行业综述里，有三处「据统计」被追问出处。团队翻了两天检索日志也没拼回去：检索阶段其实抓到了原始材料，但片段进上下文时被拼成了一整段纯文本，URL、文档 id、段落号全被丢掉；模型把三个来源揉成了一句读起来很顺的话，生成时上下文里已经没有任何东西能指回原文。最后只能把那三句删掉重发，客户对整份报告的信任度也一起没了。

最讽刺的是，这三句恰恰是全篇最流畅的句子——**因为它们综合了多个来源**。这就是研究 Agent 与普通 RAG 问答的分水岭：RAG 问答只要答案对就行，研究 Agent 交付的是「结论 + 每个结论的出处」，而「综合」这个动作本身会破坏归属。所以本课不可退让的约束是：**每条结论可溯源**，且溯源必须在生成之后校验，不能指望生成之前多塞几段材料。

### 三种「看起来有引用」但其实是假的

| 形态 | 表现 | 为什么骗得过人 | 检出方式 |
|---|---|---|---|
| 脚注错位 | 段末挂了三个来源，但段落里三句话分别来自其中不同的一个 | 引用总数对得上，逐句看才发现对不上 | 按句校验，不按段校验 |
| 孤儿 id | 正文写 \`[S7]\`，可本轮只检索到 S1–S5 | 读者不会去数 id 范围 | 校验器断言 id 必须存在于本轮片段表 |
| 数字改写 | 原文「约 37%」，综述写「近四成」或「超过 40%」 | 语义近似，人工扫读很难察觉 | 提取数字锚点，逐个回原文比对 |

第三行最危险：它不是幻觉，是**近似改写**。用文本相似度判定引用有效性会天然放过它，因为模型改写后余弦相似度依然不低。真正可靠的锚点是数字、专有名词、时间、单位这类不易被改写的硬信息——**校验要盯「不可替换的词」，不是「整体像不像」**。

### 让引用 id 随文本一起流动

第一步是把检索结果从「一段文本」改成「带身份证的片段」。每个片段有稳定 id、原文摘录、来源定位与版本号；这条 id 在后续所有环节里都不许被剥掉。

\`\`\`ts title="带 citation id 的片段结构" note="要点：id 与摘录、定位、版本绑成一体；从检索到生成到校验全程不许退化成纯文本。"
type SourceSpan = {
  sid: string            // 本轮稳定编号，如 S1 / S2
  docId: string          // 文档库里的永久 id
  locator: string        // 页码 / 段落号 / 时间戳，供人回查
  quote: string          // 原文摘录，不改写
  url: string
  version: string        // 文档版本，防止引用到已修订内容
  retrievedAt: string
}

type EvidencePack = {
  question: string
  spans: SourceSpan[]
  context: string        // 由 spans 机械拼出，每段前强制带 [sid]
}

function packEvidence(question: string, hits: Omit<SourceSpan, 'sid'>[]): EvidencePack {
  const spans = hits.map((h, i) => ({ ...h, sid: 'S' + (i + 1) }))
  const context = spans
    .map((s) => '[' + s.sid + '] ' + s.quote + '（来源：' + s.docId + ' ' + s.locator + '）')
    .join('\\n\\n')
  return { question, spans, context }
}

function allowedIds(pack: EvidencePack): Set<string> {
  return new Set(pack.spans.map((s) => s.sid))
}
\`\`\`

注意 \`context\` 是**机械拼装**的，不是模型生成的；\`[S1]\` 这种标记必须出现在摘录前面，模型改写时才能顺手带上。很多人只把 URL 塞进 prompt 就宣布「有溯源」，但 URL 只是个字符串，模型没有义务、也没有机制把它绑定到某一句结论上。

:::deep
### 为什么「多塞几段」反而更不利于溯源

直觉认为材料越全，引用越准。实测常常相反：上下文里来源一多，模型越倾向于「综合」——把两句不同来源的话合成一句更凝练的表述，此时任何一个单独来源都支撑不了新句子，归属就断了。这不是模型不听话，是「综述」这个任务的目标本来就是压缩与合并，而可溯源要求的是保留边界。

破解办法不是加约束词，是**改结构：先分后合**。先让模型针对每个片段各产出一张只依赖该片段的「原子事实卡」，每张卡自带一个 \`sid\`；再让模型只依据卡片集合写综述，卡片 id 随卡传递。这样「一句结论 → 一张卡 → 一个片段」是一条不会断的链，合并发生在卡片层而不是原文层，归属仍然保得住。
:::

### 两阶段生成：原子事实卡 → 综述

\`\`\`ts title="两阶段生成：事实卡绑定 sid，合成阶段只许引用卡" note="要点：第一阶段一卡一片段，第二阶段禁止引入卡外事实；sid 随卡传递，不靠模型记忆。"
type FactCard = { sid: string; claim: string; anchors: string[] }

async function buildFactCards(pack: EvidencePack): Promise<FactCard[]> {
  const cards: FactCard[] = []
  for (const s of pack.spans) {
    const out = await model.generateObject({
      schema: { claim: 'string', anchors: 'string[]' },
      prompt: '只依据下面这一段原文，写出一条不超过 40 字的客观陈述；'
        + '把原文里的数字、专名、时间原样列进 anchors，不要推断、不要补充常识。\\n'
        + '[' + s.sid + '] ' + s.quote,
    })
    cards.push({ sid: s.sid, claim: out.claim, anchors: out.anchors })
  }
  return cards
}

async function composeReport(question: string, cards: FactCard[]): Promise<string> {
  const cardText = cards
    .map((c) => '[' + c.sid + '] ' + c.claim + ' | 锚点: ' + c.anchors.join(', '))
    .join('\\n')
  return model.generate(
    '问题：' + question + '\\n'
    + '可用事实卡（每行末尾的 [S#] 必须原样带到引用它的句子后面）：\\n' + cardText + '\\n'
    + '规则：每句结论最多引用两张卡；不得引入卡外事实；'
    + '涉及数字时必须使用卡片 anchors 里的原值；无卡可依的内容直接不写。'
  )
}
\`\`\`

第二阶段的提示词里有一条容易被删掉的规则：**无卡可依的内容直接不写**。没有它，模型会用常识把卡片之间的缝补上，那些补出来的句子恰恰是最顺、也最没有出处的句子。

### 生成之后的溯源校验器

有了带 id 的文本，还必须有自动校验——人不会逐句数引用。下面这个校验器做四件事：按句切分、每句必须有 id、id 必须存在、数字锚点必须能在该 id 对应的原文里找到。

\`\`\`ts title="溯源校验器" note="要点：按句而非按段校验；孤儿 id、无出处句、被改写的数字三类都要能报出来。"
type CitationIssue = { sentence: string; kind: 'no-citation' | 'orphan-id' | 'anchor-mismatch' }

function verifyCitations(report: string, pack: EvidencePack): CitationIssue[] {
  const issues: CitationIssue[] = []
  const valid = allowedIds(pack)
  const bySid = new Map(pack.spans.map((s) => [s.sid, s.quote]))
  const sentences = report.split(/(?<=[。！？；])/).map((x) => x.trim()).filter(Boolean)

  for (const sentence of sentences) {
    const ids = [...sentence.matchAll(/\\[(S\\d+)\\]/g)].map((m) => m[1])
    if (ids.length === 0) {
      issues.push({ sentence, kind: 'no-citation' })
      continue
    }
    for (const id of ids) {
      if (!valid.has(id)) issues.push({ sentence, kind: 'orphan-id' })
    }
    const numbers = [...sentence.matchAll(/\\d+(?:\\.\\d+)?%?/g)].map((m) => m[0])
    if (numbers.length > 0) {
      const sourceText = ids.map((id) => bySid.get(id) ?? '').join(' ')
      for (const n of numbers) {
        if (n.length <= 2) continue // 「第一段」「3 条」这类序号不算数据锚点
        if (!sourceText.includes(n)) {
          issues.push({ sentence, kind: 'anchor-mismatch' })
          break
        }
      }
    }
  }
  return issues
}

function gate(report: string, pack: EvidencePack) {
  const issues = verifyCitations(report, pack)
  if (issues.length === 0) return { ok: true as const, report }
  // 处置：无出处句直接删；孤儿 id / 锚点不符的句子降级为「待人工复核」区块
  const bad = new Set(issues.map((i) => i.sentence))
  const clean = report.split(/(?<=[。！？；])/).filter((s) => !bad.has(s.trim())).join('')
  return { ok: false as const, report: clean + '\\n\\n【待人工复核】' + issues.length + ' 句未通过溯源校验。' }
}
\`\`\`

\`gate\` 的处置分两种，不能一律「让模型改一遍」：无出处句是结构缺失，重写很可能再编一个 id 出来，直接删最安全；锚点不符则保留原句但移到「待人工复核」区块，由人决定是原文有误还是模型改写过度。**自动修复引用是溯源系统里最危险的功能**——它会把「查不到」变成「查得到」，而后者是假的。

:::warn
### 两个必踩的坑

- **用「引用相似度」判定有效性**。模型改写后的句子与原文相似度天然不低，近义改写过的数字照样能混过去。校验必须盯数字、专名、时间、单位这些硬锚点，且要求原值命中。
- **把 URL 塞进 prompt 就算溯源**。URL 没有绑定到句子，模型也不会主动维护这层绑定；必须让 \`[S#]\` 成为上下文里的结构标记，并在生成后用代码逐句核对。
:::

### 深度研究与 RAG 问答不是同一件事

很多团队把「接了向量库」当成已经做了研究 Agent，直到第一次被客户追问出处才发现差别。两者的目标函数不同，因而流水线几乎每一层都不一样：

| 维度 | RAG 问答 | 深度研究 |
|---|---|---|
| 交付物 | 一个答案 | 结论 + 每句的出处 + 材料清单 |
| 检索 | 一次 topK | 多轮、按子问题展开、要覆盖反方材料 |
| 上下文形态 | 拼成一段相关文本 | 带稳定 id 的独立片段，不许合并 |
| 生成 | 一步出答案 | 先分（事实卡）后合（综述） |
| 质量判据 | 答案是否正确 | 逐句可溯源 + 覆盖是否均衡 |
| 失败代价 | 答错一次 | 整份报告的可信度归零 |

第六行解释了为什么本课要把校验器放在生成之后：RAG 答错可以重问，综述里一句没出处的话会让读者怀疑其余十一页。**信任是整份文档级的，不是句子级的**，所以判据必须逐句，处置必须整份一致。

### 溯源率怎么算才不自欺

有了校验器就该给一个指标，但这个指标极易被做高。分母只能取「含事实的陈述句」——小标题、过渡句、提问句不算；否则写十句「综上所述」就能把溯源率刷到 100%。分子是通过了 id 存在性、逐句覆盖、硬锚点三项的句子数。另设两个独立指标：**孤儿率**（引用了本轮不存在 id 的句子占比）与**锚点命中率**（数字/专名原值命中的比例），三者一起看，单看溯源率会被「每句都挂一个假 id」骗过去。

上线前还要做一次人工抽检：随机抽 20 句由人点回原文，记录「机器判可溯源但人判不成立」的比例。这个比例才是校验器本身的准确率，用 L77 的 Wilson 区间给个区间而不是一个点估计——样本只有 20 句时，一次分歧就能让百分比跳五个点。**校验器也需要被评测**，否则我们会把「校验通过」当成新的免检金牌。

### 验收：把「可溯源」变成三条断言

\`\`\`ts title="接进 L81 harness 的溯源断言" note="要点：断言的是结构性事实，不是「读起来像不像有出处」。"
const cases = [
  { q: '近三年该行业融资趋势', mustMention: ['2023', '2024', '2025'] },
  { q: '主要厂商的市场份额', mustMention: ['37%'] },
]

async function runCitationCase(c: typeof cases[number]) {
  const hits = await retrieve(c.q, { topK: 8 })
  const pack = packEvidence(c.q, hits)
  const cards = await buildFactCards(pack)
  const draft = await composeReport(c.q, cards)
  const result = gate(draft, pack)

  assert.equal(verifyCitations(result.report, pack).filter((i) => i.kind === 'orphan-id').length, 0)
  assert.equal(verifyCitations(result.report, pack).filter((i) => i.kind === 'no-citation').length, 0)
  for (const anchor of c.mustMention) {
    assert.ok(result.report.includes(anchor), '关键锚点丢失: ' + anchor)
  }
  return { kept: result.report.length, issues: verifyCitations(draft, pack).length }
}
\`\`\`

这三条断言分别盯住：id 真实性、逐句覆盖、硬锚点保全。注意它们校验的都是**结构性事实**，不依赖 judge 打分——这正好补上 L82 的一个盲区：LLM-as-Judge 能判断综述是否流畅、是否切题，但判断不了「这个 37% 是不是真的来自那篇 PDF」，因为它手上没有原文。凡是能靠确定性代码判的，就别交给模型判。

### 与相邻课的分工

- **L49 / L50**：向量检索与重排解决「找得到」，本课解决「找到之后归属不丢」。
- **L77 / L78**：评测维度与轨迹评测，本课的溯源率是其中一个新增维度。
- **L82**：judge 判断流畅与切题，判断不了引用真伪；两者互补而非替代。
- **L86**：输出护栏管「能不能说」，本课管「说了能不能点回原文」。
- **L90**：语义缓存，带版本号的片段意味着文档一改，缓存必须按 \`docId + version\` 失效。

**一句话收束**：研究 Agent 的产出不是一篇综述，是一篇**每句话都能被点回去**的综述；溯源靠生成后的校验器，不靠生成前的祈祷。
`,
    null,
    [
      {
        text: '综述里三处「据统计」找不到出处，根因最可能是？',
        options: [
          '检索没查到原文',
          '片段进上下文时丢了来源 id，模型综合后归属断裂',
          '模型温度太高',
          '文档已下线',
        ],
        answer: 1,
        explain: '综合多来源会破坏归属，必须在结构上让一句结论绑定一个片段。',
        concept: 'research-agent',
      },
      {
        text: '「原文约 37%，综述写成近四成」该用什么检出？',
        options: ['文本相似度', 'LLM-as-Judge 打分', '提取数字锚点逐个回原文比对', '提高 temperature 重跑'],
        answer: 2,
        explain: '近似改写的相似度依然不低，要盯数字/专名/时间这类硬锚点。',
        concept: 'research-agent',
      },
      {
        text: '先分后合的两阶段生成里，第一阶段的产物是？',
        options: ['完整综述草稿', '每个片段一张带 sid 的原子事实卡', '检索排序表', '引用相似度矩阵'],
        answer: 1,
        explain: '合并发生在卡片层而非原文层，一句→一卡→一片段的链才不断。',
        concept: 'research-agent',
      },
    ],
    [
      ['引用绑定（citation binding）', '每个检索片段携带稳定 id，生成时随文本一起进入上下文'],
      ['原子事实卡', '只依赖单个片段的客观陈述，自带 sid 与硬锚点'],
      ['溯源校验器', '按句核对 id 存在性、逐句覆盖与数字锚点命中的确定性代码'],
    ],
    [
      '把 URL 塞进 prompt 就宣布有溯源，URL 并没有绑定到具体句子。',
      '让模型自动修复未通过校验的引用，会把「查不到」伪装成「查得到」。',
    ],
  ),
  'scenario',
)
