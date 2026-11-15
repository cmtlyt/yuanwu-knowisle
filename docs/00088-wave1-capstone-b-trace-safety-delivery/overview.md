# Wave 1 第三十批：Capstone B 收官四课（L139–L142）

## 目标

完成整门课最后四课，把全局达标推到 **142/142**、baseline 豁免清零：**链路追踪 + 溯源质量校验**（L139）、**防幻觉 + 长文 token 成本**（L140）、**部署 + 报告交付 + 全链路复盘**（L141）、**课程总览与进阶路线**（L142）。四课都是 `capstone`，按 00055 下限：正文 **3000 字** / 代码 **2500 字符**，余量 >50；每课 ≥1 表格、≥2 独立 `:::deep` / `:::warn` callout、≥1 可运行代码块。

必须延续 L135–L138 的既定接口，不得另起炉灶：

- L136：`PlanResult` / `SubQuestion` / `retrievalBudget` / `bySection`。
- L137：`EvidencePack` / `Span` / `DatedCitation` / `hybridRetrieve()` / `extractSpans()` / `matchCitation()` / `freshness()` / `ClaimKind` / `SourceCache`。
- L138：`SectionedClaim` / `Verdict.checkedAgainst` / `ConflictRecord` / `Section.claimIds` / `Report` / `unsupportedRate()` / `sourceDiversity()` / `synthesize()` / 四条验收断言。
- L135：三指标（引用准确率人工抽检 20 条、无支撑结论率、来源多样性）、四项验收断言、五项风险表、交付物四样。
- L138 接缝表已明确：追踪树是 `questionId → sourceId → claim` 三层，**不是** Capstone A 的「运行时 → 工具 → 动作」。

本批的特殊风险是**把 L139/L140/L141 写成 L131/L133/L134 的复述**。统一定位：A 的横切保护「不可逆副作用」，B 的横切保护「可核对的证据链」；组件不迁移，方法可迁移。每课开头只引一行前课结论，随即进入本分支实现。

| 课 | 本批唯一要回答的问题 | 明确不讲 | 必须回填 |
|---|---|---|---|
| L139 | 一次报告的「证据来历」怎么变成可回放、可抽检、可回归的三层追踪 | 动作覆盖率、调用图（L131/L133） | 引用准确率基线 |
| L140 | 防幻觉闸门与长文成本怎么接进现有合成链而不改语义 | 注入载荷、沙箱（A 分支） | 时效与注水的发布前拦截 |
| L141 | 引用锚点怎么落地成读者能在 3 秒内核对的交付物 | 状态外置原理（A 分支） | 四样交付物 + B 七课复盘 |
| L142 | 142 课的知识地图怎么被机器验证，学完之后往哪走 | 逐课复述内容 | 全课收束 |

**L142 课型特别说明**：标题虽是「课程总览与进阶路线」，`content-gate` 明确禁止 Capstone 阶段的课标 `overview`（复盘课也要有真实实现与验收断言）。因此 L142 按 `capstone` 写，交付一个**可运行的课程知识地图自检器**：`assertKnowledgeMap()` 校验概念前置无环、每课归属有效模块、课型分布、双 Capstone 分叉、进阶路线清单可解析；并给出验收断言。goals 原本全是「回顾 / 建立 / 了解」，本批改为实现类动词。

## 现状

| 课 | 标题 | 正文 / 下限 | 代码 / 下限 |
|---|---|---|---|
| L139 | 实战 Capstone B：从零接入链路追踪 + 评测 + 溯源质量校验 | 309 / 3000 | 540 / 2500 |
| L140 | 实战 Capstone B：从零加安全（防幻觉 / 溯源校验）+ 成本优化（长文 token） | 316 / 3000 | 436 / 2500 |
| L141 | 实战 Capstone B：从零部署 + 研究报告交付 + 全链路复盘 | 320 / 3000 | 392 / 2500 |
| L142 | 课程总览与进阶路线：你已掌握的知识地图 | 351 / 3000 | 205 / 2500 |

## 课型复核

四课沿用原 `capstone` 标注。L142 难度原为 1，标题不含「实战」，但按 gate 规则仍是 capstone，下限不因标题放宽。概念 id 从原骨架抄：`cap-b-trace` / `cap-b-safety` / `cap-b-deploy` / `course-review`（`concepts.ts` 已注册），`quiz[].concept` 全部沿用同一 id。

## 术语统一

- **证据链**：`questionId → sourceId → span → claim → 正文句子` 的逐层可回溯关系。
- **抽检基线**：每份报告人工核对 20 条引用，结论分支撑 / 部分支撑 / 不支撑，只增不改。
- **防幻觉闸门**：发布前把「无出处、出处不真实、冲突未处理、时效未标注」判硬失败。
- **分段合成**：长文按章节生成，失败只重跑该段，缓存键含 claim id 集合。
- **引用锚点**：持久 `citation.id` 渲染为序号，可点开跳到文末原文片段。

## 变更计划

1. L139：`TraceNode` 三层树 + `buildEvidenceTree()` + 回放器 + `SamplingSheet`（20 条）+ `assertCitationBaseline()` + 与 A 评测的四维对照表。
2. L140：`HallucinationGate` 五检查 + 长文 `SectionBudget` / `segmentedSynthesize()` / `SourceCache` 命中率账单 + 不改动 `synthesize()` 语义的断言。
3. L141：`renderAnchors()` + 编号稳定 + PDF 导出断言 + `createReportService()` + 交付物四样 + B 七课复盘表 + A/B 对照 + 演示脚本。
4. L142：`assertKnowledgeMap()` 自检器 + 142 课图谱断言 + 进阶路线（社区 / 论文 / 深耕方向）+ 全课收束。
5. 双扫描（含修正版全量反斜杠扫描）、渲染抽查、`--update-baseline`、三门禁。

## 验证方案

- `content-gate --only=L139,L140,L141,L142` 四课 ✓，正文余量 >50 字、代码余量 >50 字符。
- 渲染：table≥1 / callout≥2 / code≥1 / leftover=0 / fenceLeak=0。
- `pnpm verify` / `lint` / `typecheck` 全绿；`content-gate-baseline.json` 的 `agent` 数组清空，全局 **142/142**。

## 实测（实施后回填）

<section id="result">

### 结果

四课全部重写为 `capstone`，下限 3000 字 / 2500 字符代码，正文余量均 >300 字。

| 课 | 正文 / 下限 | 代码 / 下限 | 渲染（table / callout / code / leftover / fenceLeak） |
|---|---|---|---|
| L139 | 3320 / 3000 | 9381 / 2500 | 6 / 3 / 5 / 0 / 0 |
| L140 | 3357 / 3000 | 8194 / 2500 | 5 / 3 / 4 / 0 / 0 |
| L141 | 3412 / 3000 | 7560 / 2500 | 5 / 3 / 5 / 0 / 0 |
| L142 | 3863 / 3000 | 10234 / 2500 | 4 / 3 / 5 / 0 / 0 |

### 实现落点

- **L139**：`questionId → sourceId → claim` 三层证据树 + `buildEvidenceTree()` 孤儿硬错误 + `replayEvidence()` + 20 条 `SamplingSheet` + 只增不改 `CitationBaseline` + `assertTraceQuality()` 五检查 + 研究型 vs 执行型评测对照 + 六步抽检表。
- **L140**：机械层 / 人工层并排 `HallucinationGate` + `assertNoRenderBypass()` + `assertConflictRecords()` + `segmentedSynthesize()` + `SectionBudget` / `CostBill` / `mergeBills()` + `assertNoCostRegression()` + 「成本优化只改什么时候重算，不改算出来是什么」。
- **L141**：`renderAnchors()` 文档内锚点（`#cite-<id>`）+ `assertAnchorsUsable()` 四检查 + `createReportService()` 的「渲染 → 回喂闸门 → 导出」+ `assertDeliverables()` 四样交付物 + `DEMO` 七步 / `assertDemoEndsWithVerification()` + B 七课复盘表 + L135 五项风险收口 + A/B 最终分叉。补「交付之后：把一次验收变成可回归的资产」表后正文从 2835 → 3412。
- **L142**：`assertKnowledgeMap()` 六组检查（概念图无环 / 模块归属与 kind / 导览课四护栏 / 引用完整性与课号连续 / 双 Capstone 分叉 / 规模快照）+ `findCycle()` 三色 DFS + `ROADMAP` 八条与 `assertRoadmap()` + 六条含负例断言。标题虽是「总览」，按 gate 规则维持 `capstone` 并交付真实自检器。

### 跨课接口处理

- L140 的 `segmentedSynthesize()` 需要 L138 `synthesize()` 支持全局编号映射；采用**默认关闭的可选参数** `numberById?: Map<string, number>` 补 L138，不传时行为逐字不变，未改动 L138 已达标语义。
- L141 的 `RenderedReport` 增 `bodyHtml`，`createReportService()` 与测试只把章节正文回喂 `assertNoRenderBypass()`，避免文末参考文献区的原文片段被误判为渲染旁路。
- L142 写 C5 分叉断言前先用真实数据实测：`142 课 / 143 概念 / 28 阶段 / 11 模块`，概念图与课时图均无环、引用无悬空、课号连续；**唯一跨分叉引用是 L142 自己**（`prereqs = L134 + L141`）。因此规则写成「支内可依赖、跨支禁止、收束课必须同时连住两支」，并在 `t5` 从两侧各测一次。

### 门禁

- 双扫描（裸反引号 / 反斜杠转义）+ 修正版全量单反斜杠扫描：四课干净。
- `node --experimental-strip-types scripts/content-gate.mjs --only=L139,L140,L141,L142 --verbose`：4/4 达标。
- `oxfmt` → `--update-baseline`：`content-gate-baseline.json` 的 `agent` 数组清空，**全局 142/142 达标、0 豁免**。
- `pnpm verify` 四段全绿（含 contentStats 抽样 194 课）、`pnpm lint` 0e / 4w、`pnpm typecheck` 0e / 9w。

**Wave 1 全部 30 批收官，剩余课程为 0；累计改动仍未提交。**

</section>
