import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L135 = withKind(
  L(
    'L135',
    27,
    '实战 Capstone B：需求拆解与架构设计（从零）',
    4,
    ['L19', 'L50', 'L68'],
    ['cap-b-arch'],
    [
      '把「写一份行业调研报告」拆成「分解 → 检索 → 综合 → 溯源」四段可独立验收的管线',
      '实现 claim / citation 数据结构，让「无引用的结论」在类型层面无法产出',
      '设计 Graph RAG 的一跳扩展与去重，避免多源检索退化成同一段文字反复引用',
      '定义研究型 Agent 的三个评测指标：引用准确率、无支撑结论率、来源多样性',
    ],
    `
### 场景：与 Capstone A 面对的是两种失败

Capstone A 的失败是「动错了东西」——不可逆、立刻可见。Capstone B 的失败是「写了一段看起来对的话」——可读、通顺、无从核对，而且往往在发布之后才被发现。这类失败不会被测试抓住，因为没有任何断言能判断「这句话是否被来源支撑」。所以 Capstone B 的第一性问题是：**如何让「没有出处的结论」在系统里根本写不出来**。

这就是为什么 Capstone B 不能从「写得好不好」入手，而必须从数据结构入手。一份报告不是一段长文本，而是一组 claim 的集合，每个 claim 携带一个或多个 citation；合成器的职责是把 claim 组织成连贯叙述，而不是自由发挥。

### 与 Capstone A 的关系：同一棵树的另一条分支

两个 Capstone 共享同一套横切骨架（追踪 / 评测 / 安全 / 成本 / 部署），差别在主轴的竖线不同：A 的主轴是「动作 → 权限 → 回滚」，B 的主轴是「问题 → 证据 → 结论」。因此 B 复用了 A 的很多**判断**（状态机、审计事件、评测负例），但代码必须从零写——理由与 L128 相同。

### 第一步：先定 claim / citation 契约

这是整个 Capstone B 的地基，也是唯一一处必须在写任何检索代码之前定下来的东西。claim 是「一句可被支撑的陈述」，citation 是「该陈述的出处片段」。两者用 id 关联，且**合成器只能消费 claim，不能直接拼接检索到的原文**。这条限制看起来束手束脚，实际是唯一能防住「模型顺手编一句」的机制。

\`\`\`ts title="① claim / citation 契约：无引用的句子无法构造" note="关键：claims 是空数组也不允许——必须显式标记为 unverified，让「没证据」成为可见状态而不是默认通过。"
export interface Citation {
  id: string
  sourceId: string // 文档 / 网页 / 内部知识库条目
  url?: string
  quote: string // 原文片段（用于人工复核）
  span?: [number, number]
}

export interface Claim {
  id: string
  text: string // 一句可独立成立、可被证伪的陈述
  citations: Citation[]
  /** 证据等级：多源一致 > 单源 > 未验证（未验证的 claim 不允许出现在正文） */
  support: 'multi' | 'single' | 'unverified'
}

export function makeClaim(text: string, citations: Citation[]): Claim {
  const support = citations.length >= 2 ? 'multi' : citations.length === 1 ? 'single' : 'unverified'
  return { id: hash(text), text, citations, support }
}

/** 合成器的前置断言：正文只允许消费已验证的 claim。 */
export function assertPublishable(claims: Claim[]) {
  const bad = claims.filter((c) => c.support === 'unverified')
  if (bad.length) throw new Error('E_UNSUPPORTED: ' + bad.length + ' 条结论缺少出处')
}
\`\`\`

### 第二步：问题分解要有「可停」的判据

研究型 Agent 最容易失控的地方不是检索，而是分解。一个宽泛的主题（「AI 编程助手市场」）可以被无限拆成子问题，每个子问题又能再拆，最后既不收敛、也不产生结论。可行的约束是给分解设三个判据：子问题能被一次检索回答、子问题之间有明确归属、总层数不超过三层。

\`\`\`ts title="② 分解：广度优先 + 层次上限 + 可检索性判断" note="可检索性由「能否构造出检索词」判定，而不是让模型自我感觉「这个子问题够具体」。"
const MAX_DEPTH = 3

export async function decompose(topic: string, depth = 0): Promise<SubQuestion[]> {
  if (depth >= MAX_DEPTH) return []
  const raw = await llm.json(PLAN_PROMPT, { topic })
  const usable = raw.subQuestions.filter((q) => q.queries?.length > 0) // 无法构造检索词的丢掉
  const children = await Promise.all(usable.map((q) => decompose(q.text, depth + 1)))
  return usable.map((q, i) => ({ ...q, children: children[i] }))
}
\`\`\`

### 第三步：混合检索与一跳扩展

只做向量检索的研究 Agent 会有一个典型症状：报告里五句话引用了同一段文字。原因是向量召回倾向于返回「语义最相近」的一小簇文档，多源多样性反而丢失。修补办法是混合策略：向量召回保证相关性，图扩展保证覆盖面——对命中的实体做一跳邻居扩展，再按来源域名去重。

\`\`\`ts title="③ 混合检索：向量召回 + 一跳图扩展 + 来源去重" note="去重键用 sourceId 而非文本相似度：同一段文字的镜像站会骗过相似度阈值。"
export async function hybridRetrieve(q: SubQuestion, k = 8) {
  const hits = await vectorStore.search(q.queries.join(' '), k)

  const expanded = []
  for (const h of hits) {
    expanded.push(h)
    const neighbors = await graph.neighbors(h.entityId, { hops: 1 })
    expanded.push(...neighbors)
  }

  const bySource = new Map<string, Hit>()
  for (const h of expanded) if (!bySource.has(h.sourceId)) bySource.set(h.sourceId, h)
  return [...bySource.values()].slice(0, k * 2)
}
\`\`\`

### 第三步半：多 Agent 分工与一条禁令

Capstone B 的编排不是「角色越多越好」。三个角色足够：**研究员**按子问题检索并产出 claim；**评审员**做两件事——找反例、校验 citation 是否真的支撑该 claim；**合成员**只组织不发挥。禁令只有一条：**评审员不得改写 claim 文本**。

这条禁令看起来苛刻，但它决定了校验是否有效。一旦允许评审员顺手把句子改通顺，被校验过的文本与最终发布的文本就不是同一句，校验记录随之失效——事故复盘时会发现「日志里通过的句子」和「报告里的句子」不一样。评审发现问题时的正确动作是打回给研究员重新取证，而不是自己动笔修一句。

\`\`\`ts title="④ 三角色编排：评审只判定、不改写" note="评审返回 verdict（accepted / rejected + 原因）而不是新文本——这是「校验过的文本 = 发布的文本」能成立的前提。"
export async function researchLoop(topic: string) {
  const subs = await decompose(topic)
  const claims: Claim[] = []

  for (const sub of subs.flat()) {
    const hits = await hybridRetrieve(sub)
    const drafted = await researcher.draftClaims(sub, hits) // 生成 claim + 候选 citation
    const verdict = await reviewer.review(drafted) // 只判定，不改写

    claims.push(...verdict.accepted)
    for (const rej of verdict.rejected) {
      // 打回重新取证，而不是就地改一句
      const retry = await researcher.redraft(rej.claim, rej.reason)
      if (retry.support !== 'unverified') claims.push(retry)
    }
  }
  return synthesize(claims, OUTLINE)
}
\`\`\`

### 第四步：合成器只做「组织」，不做「发挥」

这是最容易写错的一段。很多人把合成器写成「把检索到的段落喂给模型，让它写一篇报告」——这等于把溯源责任交给了模型，而模型没有能力承担。正确做法是：每个 claim 单独生成并绑定 citation，合成器只负责排序、去重、加过渡句，且**过渡句不允许包含新的事实性内容**。

\`\`\`ts title="⑤ 合成：从 claim 生成正文，逐句可回溯" note="每个 [n] 都是可点开的引用；没有 citation 的 claim 在进入正文前已被 assertPublishable 拦下。"
export async function synthesize(claims: Claim[], outline: string[]) {
  assertPublishable(claims) // 先拦，再写

  const sections = []
  for (const heading of outline) {
    const group = claims.filter((c) => c.section === heading)
    const body = group
      .map((c, i) => {
        const marks = c.citations.map((x) => '[' + x.id + ']').join('')
        return c.text + marks + (c.support === 'single' ? '（单一来源）' : '')
      })
      .join('\\n\\n')
    sections.push({ heading, body })
  }
  return { sections, citations: dedupe(claims.flatMap((c) => c.citations)) }
}
\`\`\`

### 第五步：把「溯源质量」变成可计算的指标

研究型 Agent 的评测不能只看「报告是否通顺」。三个指标可以在一天内搭出来，且直接对应真实风险：

| 指标 | 定义 | 不合格信号 |
|---|---|---|
| 引用准确率 | 抽检的 citation 中，原文确实支撑该 claim 的比例 | < 0.9 说明在「引用了但不支撑」 |
| 无支撑结论率 | 正文中不带 citation 的事实性句子占比 | > 0.05 说明合成器在自由发挥 |
| 来源多样性 | 引用的独立 sourceId 数量 / claim 数 | 接近 0.2 说明多源检索退化成单源 |

引用准确率必须靠人工抽检建立基线（每次抽 20 条），因为「这句原文是否支撑这个结论」本身需要判断力。这也是为什么本课的验收断言只覆盖可机械判定的部分：无支撑结论率与来源多样性可以自动算，引用准确率必须人工。

\`\`\`ts title="⑥ 两个可自动化的评测函数" note="无支撑率与多样性都可以在 CI 里跑；引用准确率留人工抽检，不进 CI（判定本身需要人）。"
export function unsupportedRate(report: Section[]) {
  const sentences = report.flatMap((s) => s.body.split('。').filter(Boolean))
  const facts = sentences.filter((s) => !/^\\s*(综上|因此|本章)/.test(s))
  const noCite = facts.filter((s) => !/\\[\\w+\\]/.test(s))
  return noCite.length / Math.max(1, facts.length)
}

export function sourceDiversity(citations: Citation[], claimCount: number) {
  return new Set(citations.map((c) => c.sourceId)).size / Math.max(1, claimCount)
}
\`\`\`

### 成本结构：钱主要花在「重搜」与「重写」

研究型 Agent 的账单结构与执行型完全不同：检索与重排只占小头，长文合成与多轮评审才是大头。因此两个优化最有效——按 sourceId 缓存检索结果（跨子问题复用，避免同一文档被反复召回与重排），以及把合成按章节分段、失败只重跑该段而不是整篇重写。

反过来，最无效的优化是「用更便宜的小模型做检索相关性判断」。判断错了会导致整份报告的 claim 建立在无关证据上，返工成本远超省下的那点推理费。这类「省钱反而更贵」的决策在研究型 Agent 里非常常见，因为错误不会立刻暴露，而是在引用准确率抽检时才浮现。

### 冲突与时效：两个被忽略的溯源问题

前面的设计隐含一个假设：多个来源说的是同一件事。真实调研里更常见的是来源互相矛盾——两家机构给出不同的市场规模，两份报告对同一政策的解读相反。此时「多源一致即可信」直接失效：两条 claim 都有引用、都能通过评审，合成器把它们并列写进正文，读者看到的是一段自相矛盾的结论。

正确做法是给 claim 增加第三种状态：**contested**（有证据，但证据互相冲突）。它既不是 unverified（没证据），也不允许直接进正文，必须显式处理：要么并列两种说法并标注分歧来源，要么降级成脚注，要么由研究员补第三方证据做裁决。三种处理都必须留痕，因为「这里为什么有两个数字」是读者最先追问的地方。

\`\`\`ts title="⑥ contested：冲突不是噪声，是必须显式处理的结论" note="冲突检测放在评审之后、合成之前；同一章节内主题重叠且结论不一致的 claim 标为 contested。"
export function markConflicts(claims: Claim[]): Claim[] {
  const bySection = new Map<string, Claim[]>()
  for (const c of claims) bySection.set(c.section, [...(bySection.get(c.section) ?? []), c])

  return claims.map((c) => {
    const peers = (bySection.get(c.section) ?? []).filter((p) => p.id !== c.id && overlaps(p, c))
    const clash = peers.some((p) => contradicts(p, c)) // 数值区间不重叠 / 极性相反
    return clash ? { ...c, support: 'contested' as const } : c
  })
}
\`\`\`

第二个容易漏的是**时效**。一份 2019 年的报告在 2026 年的调研里依然「有出处、能引用、原文支持」，但它支撑的结论可能早已失效。这件事不能靠人肉判断：给 citation 带上发布时间，在合成时按主题设新鲜度窗口——市场数据短（约 12 个月），技术原理长（约 5 年），政策法规介于两者之间。超出窗口的引用不要删，而是标注「数据截至某年」，把时效判断交给读者，而不是替读者默默擦掉。

这里有个反直觉的地方：并非所有旧数据都该降权。趋势类结论（五年变化）恰恰需要旧数据，一刀切窗口会毁掉纵向分析。所以窗口应该绑在 **claim 的类型**上，而不是绑在引用上——同一个来源在趋势 claim 里有效，在「当前市场份额」claim 里就该标注截止时间。

### 引用在正文里怎么落地

claim 绑上 citation 只解决了「能不能溯源」，还没解决「读者能不能查」。渲染层要满足三条：编号稳定（同一 citation 在全文中只有一个编号，不随章节重排漂移）、可点开（锚点跳到文末参考文献并高亮原文片段）、可导出（离线 PDF 里锚点仍然有效）。

编号稳定最容易被破坏：按出现顺序临时编号，任何一次章节调整都会让全文编号漂移，历史版本之间无法对照，抽检记录也对不上。做法是先给 citation 分配持久 id（sourceId 与 span 的哈希），渲染时才映射为序号——序号可以变，id 不变，数据库与审计日志只存 id。

### 风险登记表

| 风险 | 触发信号 | 缓解 |
|---|---|---|
| 引用张冠李戴 | 抽检发现原文与结论方向相反 | 抽取与匹配拆成两次调用，匹配侧不生成文本 |
| 单源伪装多源 | 独立 sourceId 数远低于引用条数 | 按 sourceId 去重，多样性进评测 |
| 冲突被抹平 | 正文出现两个互斥数字却无说明 | contested 状态 + 合成前强制处理 |
| 时效过期 | 引用发布时间早于该主题窗口 | citation 带时间，超窗标注截止日期 |
| 报告注水 | 每千字 claim 数低于阈值 | 评审按 claim 密度打回 |

五项里，前两项能在 CI 自动发现，后三项依赖人工抽检——所以抽检频率必须固定（每份报告抽 20 条），不能等出了事故再回头抽。

### 交付物与验收清单

Capstone B 的交付物同样不是「跑出一份报告」，而是四样东西：

1. **管线代码**：分解 / 检索 / 取证 / 合成四段独立可测，每段有自己的输入输出契约（子问题、命中、claim、章节）。
2. **claim 数据集**：至少 40 条，其中 10 条来自冲突来源（用于验证 contested 路径）、10 条是单源（用于验证「单一来源」标注）。
3. **一份真实报告**：1500 字以上，全文引用可点开，关键数据带「数据截至」标注。
4. **一次抽检记录**：20 条引用的逐条核对结论（支撑 / 部分支撑 / 不支撑），作为引用准确率的第一份基线。

验收四条断言：无支撑结论率为 0（合成前已被拦）、来源多样性不低于 0.5、contested 的 claim 全部在正文或脚注里有对应处理、任意一句正文都能在 3 秒内定位到原文片段。

最后一条看着像体验指标，其实完全可测：从渲染后的 HTML 里取出所有引用锚点，逐个断言目标节点存在且带原文片段。做不到这一点，前面所有溯源设计就只是内部字段，读者依然无从核对。

:::warn

### 研究型 Agent 的四个真实事故

**事故一：引用张冠李戴**。现象是「报告结论正确，但点开引用发现原文说的是反例」。根因是 claim 与 citation 是模型在一个 prompt 里一起生成的，绑定关系靠模型自觉。修复：把「抽取 claim」与「为 claim 找证据」拆成两次调用，后者只做匹配、不做生成。

**事故二：单源伪装成多源**。现象是参考资料列了 8 条，实际全部来自同一篇稿件的转载。根因是去重键用了文本相似度。修复：按 sourceId / 域名去重，并把「独立来源数」当评测指标。

**事故三：报告越写越长、信息密度下降**。现象是 8000 字报告，实际 claim 只有 20 条，其余是过渡与复述。根因是没有「claim 密度」约束。修复：把「每千字 claim 数」纳入评审，低于阈值直接打回。

**事故四：成本随篇幅失控**。现象是单份报告几十美元。根因是每个子问题都重新检索全量文档。修复：检索结果按 sourceId 缓存，跨子问题复用；合成长文时分段生成而非一次生成。

:::

:::deep

### 为什么溯源要「设计进去」而不是「最后补上」

最后补溯源的典型结局是：正文已经生成，需要为每句话回头找证据，于是变成「为已写好的结论找支撑」——这是确认偏误的机器版本。反过来，先有 claim 再有正文，是「有证据才说话」。两种顺序在工程上差别巨大：前者需要事后对齐（且往往找不到），后者在构造时就保证了不变量。这与 L128 里「权限进类型」是同一条原则——**把约束放在结构里，而不是放在流程的最后一道检查里**。

:::
`,
    null,
    [
      {
        text: 'Capstone B 把报告建模成 claim 集合而不是一段长文本，核心目的是？',
        options: [
          '便于统计字数',
          '让「没有出处的结论」在构造时就不可能出现',
          '减少 token 消耗',
          '方便多语言翻译',
        ],
        answer: 1,
        explain: '结论必须绑定 citation，溯源因此成为结构不变量而非事后检查。',
        concept: 'cap-b-arch',
      },
      {
        text: '只做向量检索的研究 Agent 常出现「五句话引用同一段文字」，根本原因是？',
        options: [
          '向量维度太低',
          '向量召回倾向返回语义相近的一小簇文档，缺少多源覆盖',
          '模型在偷懒',
          '引用格式不对',
        ],
        answer: 1,
        explain: '需要图扩展 + 按来源去重来补多样性。',
        concept: 'cap-b-arch',
      },
      {
        text: '去重键应该用什么，才能避免「镜像站伪装成多源」？',
        options: ['文本相似度', 'sourceId / 域名', '发布时间', '标题长度'],
        answer: 1,
        explain: '同文转载的镜像站文本几乎一致，相似度去重会漏；必须按来源身份去重。',
        concept: 'cap-b-arch',
      },
      {
        text: '以下合成器实现有一个会破坏溯源的缺陷，问题在哪？\\n\\nasync function synth(hits) { return await llm.write("基于以下资料写一份报告：\\n" + hits.join("\\n")) }',
        options: [
          'hits.join 效率低',
          '把整段资料交给模型自由写作，claim 与 citation 的绑定完全由模型自觉，无法保证',
          '应改为流式输出',
          '缺少 format 参数',
        ],
        answer: 1,
        explain: '正确做法是先抽 claim 并逐条绑定证据，合成器只组织不发挥。',
        concept: 'cap-b-arch',
      },
      {
        text: '三个评测指标里，哪一个不适合放进 CI 自动判定？',
        options: ['无支撑结论率', '来源多样性', '引用准确率', '三者都适合'],
        answer: 2,
        explain: '「原文是否支撑该结论」需要判断力，只能人工抽检建基线。',
        concept: 'cap-b-arch',
      },
    ],
    [
      ['claim', '一句可独立成立、可被证据支撑或证伪的陈述'],
      ['citation', '绑定到 claim 的来源片段，用于人工复核'],
      ['support 等级', 'multi / single / unverified，决定是否允许进正文'],
      ['一跳图扩展', '对命中实体取邻居，补足多源覆盖'],
      ['无支撑结论率', '正文中不带引用的陈述所占比例'],
      ['来源多样性', '独立 sourceId 数与 claim 数之比'],
    ],
    [
      '把「写报告」交给模型自由发挥，事后再补引用（等于为结论找证据）。',
      '用文本相似度去重，镜像站被当成多源。',
      '分解无层次上限，子问题无限膨胀且有始无终。',
      '只评「通顺度」不评溯源质量，报告看起来很专业但不可信。',
    ],
  ),
  'capstone',
)
