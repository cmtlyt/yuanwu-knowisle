# Wave 1 第二十九批：Capstone B 前三课（L136–L138）

## 目标

按 L135 定下的图纸，落地 Capstone B 前三块：**深度推理与规划引擎**（L136）、**RAG + Graph RAG 知识库**（L137）、**多 Agent 研究小组**（L138）。三课都是 `capstone`，按 00055 下限：正文 **3000 字** / 代码 **2500 字符**，余量 >50；每课 ≥1 表格、≥2 独立 `:::deep` / `:::warn` callout、≥1 可运行代码块。

必须延续 L135 的既定事实，不得另起炉灶：

- 主轴是「问题 → 证据 → 结论」，第一性问题：**让「没有出处的结论」在系统里根本写不出来**。
- `Citation { id, sourceId, url?, quote, span? }`、`Claim { id, text, citations, support }`，`support` 为 `multi / single / unverified`（L135 后半新增 `contested`）；`makeClaim()`、`assertPublishable()`。
- 分解三判据：子问题能被一次检索回答、归属明确、总层数 ≤ 3（`MAX_DEPTH = 3`）。
- 混合检索：向量召回 + 一跳图扩展 + **按 sourceId 去重**（不用文本相似度）。
- 三角色：研究员 / 评审 / 合成；禁令 **评审员不得改写 claim 文本**，只返回 verdict。
- 合成器只排序、去重、加过渡句，过渡句不得含新事实；正文逐句可回溯。
- 三指标：引用准确率（人工抽检 20 条）、无支撑结论率、来源多样性；四验收断言（无支撑率 0 / 多样性 ≥0.5 / contested 全处理 / 任意句 3 秒定位原文）。
- 风险表五项：引用张冠李戴、单源伪装多源、冲突被抹平、时效过期、报告注水。
- 组件从零写，**不复用 Capstone A 的工具网关与审批票据**；但复用「约束写进类型 / 事件流做事实源 / 评测以负例为主」三条方法。

本批的特殊风险是**把三课写成 L19/L50/L68 的复述**。统一定位：L136 交付「可被检索回答的好问题」，L137 交付「带出处的证据包」，L138 交付「只组织不发挥的成文链」。每课开头只引一行 L135 图纸结论，随即进入实现。

| 课 | 本批唯一要回答的问题 | 明确不讲 | 必须回填的风险项 |
|---|---|---|---|
| L136 | 分解如何收敛成可检索、不重叠、可停的子问题集 | 向量检索与索引结构（L137） | 报告注水（问题粒度） |
| L137 | 证据包怎么保证多源、可去重、可回溯到原文片段 | 角色分工与评审（L138） | 引用张冠李戴、单源伪装多源、时效过期 |
| L138 | 三角色怎么在「评审不改写」的禁令下形成质量对抗 | 检索与规划实现（L136/L137） | 冲突被抹平、报告注水 |

## 现状

| 课 | 标题 | 正文 / 下限 | 代码 / 下限 |
|---|---|---|---|
| L136 | 实战 Capstone B：从零实现深度推理与规划引擎（ToT / GoT / 规划） | 300 / 3000 | 420 / 2500 |
| L137 | 实战 Capstone B：从零实现 RAG + Graph RAG 知识库 | 315 / 3000 | 420 / 2500 |
| L138 | 实战 Capstone B：从零实现多 Agent 研究小组（研究员 / 评审 / 合成） | 310 / 3000 | 488 / 2500 |

## 课型复核

三课交付物都是可运行物 + 验收断言 → `capstone` ✓，沿用原标注。标题含「实战」不触犯 00058 H1。goals 全部改写为实现类动词。

概念 id 从原骨架抄：`cap-b-reasoning` / `cap-b-rag` / `cap-b-multi`（`concepts.ts` 已注册），`quiz[].concept` 全部沿用同一 id。

## 术语统一

- **可检索性**：子问题能构造出具体检索词，而不是模型自称「够具体」。
- **证据包（EvidencePack）**：一个 claim 及其候选 citation 的集合，抽取与匹配分两次调用。
- **来源身份**：以 `sourceId` / 域名为准，文本相似度不能作为去重键。
- **评审禁令**：评审只产出 verdict，不产出新文本；打回重新取证而非就地改写。
- **claim 密度**：每千字 claim 数，低于阈值判报告注水。

## 变更计划

1. L136：`SubQuestion` 类型 + ToT 分支展开与打分剪枝 + GoT 合并重复节点 + `MAX_DEPTH` 与三类停止判据 + 可检索性硬校验 + 问题集不相交断言。
2. L137：`VectorIndex` / `GraphIndex` / `hybridRetrieve()` + 一跳扩展 + 按 sourceId 去重 + 多样性自检 + 抽取/匹配两次调用分离构造 `Citation` + 新鲜度窗口按 claim 类型绑定。
3. L138：三角色接口与 `verdict` 类型 + `researchLoop()` 打回重取 + `assertReviewerDidNotRewrite()` + `markConflicts()` 的 contested 三种处理 + `synthesize()` 只组织不发挥 + claim 密度与四条验收断言。
4. 每课末尾单列「与相邻课的分工」，并明确本课回填 L135 风险登记表的哪几行。
5. 双扫描（含修正版全量反斜杠扫描）、渲染抽查、`--update-baseline`、三门禁。

## 验证方案

- `content-gate --only=L136,L137,L138` 三课 ✓，正文余量 >50 字、代码余量 >50 字符。
- 渲染：table≥1 / callout≥2 / code≥1 / leftover=0 / fenceLeak=0。
- `pnpm verify` / `lint` / `typecheck` 全绿。

## 实测（实施后回填）

<section id="result">

### 最终体量（content-gate --only=L136,L137,L138 --verbose）

| 课 | 正文 / 下限 | 余量 | 代码 / 下限 | 推导用时 |
|---|---|---|---|---|
| L136 | 3429 / 3000 | +429 | 8444 / 2500 | 68 min |
| L137 | 3164 / 3000 | +164 | 8033 / 2500 | 66 min |
| L138 | 3393 / 3000 | +393 | 9997 / 2500 | 78 min |

### 实现落点

- **L136**：以「拆了 200 个子问题、报告只有 20 条 claim」开场。\`isSearchable()\` 五条硬校验（≥2 检索词 / 不含主题原串 / 词间 Jaccard / 章节归属 / 深度有界）；\`score()\` 确定性剪枝，模型只提候选；\`expand()\` ToT 展开 + 稳定次级排序；\`mergeEquivalent()\` 用「排序后检索词 + 章节」做规范化键，GoT 合并重复检索意图并保留全部 \`incoming\` 入边；\`decompose()\` 三类停止（深度 / 边际收益 / 预算）且原因写进 \`PlanResult\`；\`retrievalBudget = 合并后节点数\`，检索次数在启动检索前可报价；\`planReport()\` 字段白名单断言，禁止规划输出携带事实文本。补「与 L137 的接缝表」五条。
- **L137**：以「点开第 7 条引用，原文说的是反例」+「8 条参考 6 条转载」双事故开场。\`DatedCitation\` 用交叉类型扩展 L135 的 \`Citation\`，不改图纸；\`VectorIndex\` / \`GraphIndex\` 同一 \`Hit\` 形状；\`hybridRetrieve()\` 顺序固定为「召回 → 一跳扩展降权 → 按 sourceId 去重 → 截断」，\`assertDiversity()\` 当场自检；\`SourceCache\` 按「章节 + 检索词」分桶（宁可多一次检索也不让证据贴错章节）；\`extractSpans()\` 确定性切原文，\`matchCitation()\` 只返回 \`DatedCitation | null\`、绝不生成文本，方向词冲突判不匹配；\`freshness()\` 窗口绑 \`ClaimKind\`，超窗标注「数据截至」而非删除；补「与 L138 的接缝表」，说明 \`hits\` 全量保留以便打回重取时知道看过哪些来源。
- **L138**：以「日志里通过的句子和报告里不是同一句」+「正文两个互斥数字」双事故开场。三角色用**不同返回类型**分离生成权与判定权：\`Verdict\` 没有文本字段；\`draftClaims()\` 两次调用分离 + \`assertNoFreeText()\`；\`review()\` 只产判定并把「超窗无标注」判 rejected；\`assertReviewerDidNotRewrite()\` 双向堵类型绕过与运行时塞字段；\`markConflicts()\` + 三种 \`ConflictHandling\` + \`ConflictRecord\`，并刻意摆出「只遍历已有记录」的错误版与双向比对的 V2 版；\`synthesize()\` 只组织不发挥，引用编号由持久 id 映射、\`unsupportedRate()\` / \`sourceDiversity()\` 改用无反斜杠字符串判断、claim 密度硬失败；五条断言含 L135 四条验收断言。补「与 L139 的接缝表」，明确追踪树是 \`questionId → sourceId → claim\` 三层，并区分「自动化负责不漏、人工抽检负责不偏」。

三课末尾都单列「风险登记表回填 + 与相邻课的分工」，明确哪些项已闭合、哪些仍需 L139/L140/L141 接手。

### 验证结果

- 双扫描干净；另用修正版全量反斜杠扫描（正确处理合法双写）复核三课无异常单反斜杠。
- 渲染抽查：L136 table=4 / callout=3 / code=6；L137 table=4 / callout=3 / code=7；L138 table=4 / callout=3 / code=7；三课 \`leftover=0 / fenceLeak=0\`，均为 \`capstone\`。
- \`oxfmt\` → \`--update-baseline\` → \`pnpm verify\` / \`lint\` / \`typecheck\`：全绿（verify 概念引用与题目引用通过、lint 0e/4w、typecheck 0e/9w）。
- 全局达标 **135 → 138/142**，baseline 豁免 **7 → 4**（剩余 L139–L142）。

### 本批踩到并修掉的问题

1. L136 初稿余量仅 +68，补「与 L137 的接缝表」五条后到 +429。L137 初稿 2689 / L138 初稿 2889 低于 3000，且因在豁免名单里 gate 只提示不报红；补的分别是「与 L138 的接缝表 + hits 全量保留的理由」和「与 L139 的接缝表 + 人工抽检不可替代」，都是真实约束而非灌水。
2. L137 表格里为显示 \`[number, number]\` 写了 \`\[number, number\]\`，\`\[\` 在模板串里会被吞、`tmp-escape.mjs` 又不覆盖 \`[\`。改为行内代码 \`\`[number, number]\`\`。**第四种转义坑再添一个变体**：方括号前的多余反斜杠同样是漏网字符。
3. L138 冲突检查第一版初稿满是 \`void contested\` 占位代码，不像真实错误；改成「看起来完全合理、但只遍历已有 \`conflictRecords\`」的版本，与双向比对的 V2 形成有效对照。\`review()\` 里用 \`{ ...c.citations[0]!, publishedAt: 0 }\` 做时效判断也是自伤写法，改为 \`c.citations.find(...freshness(...))\`。
4. L138 \`unsupportedRate()\` 没有照抄 L135 图纸里的正则版本，改用 \`includes('[')\` 与 \`startsWith\`，并在正文说明原因：课程正文是模板字符串，正则反斜杠会被吞，粘出去的代码块必须能直接跑。

**规律**：Capstone B 三课的接口链比 A 更长（\`PlanResult → EvidencePack → Report\`），每课补正文时最有效的方向都是「接缝表」——它同时解决字数、跨课自洽与「本课不讲什么」三件事。

**改动未提交。**

</section>
