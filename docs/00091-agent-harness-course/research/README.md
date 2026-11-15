# 资料暂存索引 · Agent Harness 深度比较课程

## 现行暂存约定（2026-11-15 19:21 用户纠正后生效）

用户要求：**查询到的资料必须先落盘暂存，避免上下文压缩丢失信息，然后再继续查询；可以多文件暂存，单文件体量过大也不好。**

落地规则：

1. **一条检索一个文件**：`raw/<批次>-<序号>-<来源短名>.md`，仅含该次 `WebSearch` / `WebFetch` 的原始返回全文 + 调用参数 + 核实日期 + 可信级别提示。
2. **单文件上限约 32 KB**：超过则按页面小节再切分；不再产生合并档。
3. **证据台账按主题分片**：`evidence/<批次>-<主题>.md`，每条事实编号 `F-*`，绑定来源 ID（`S*`）与可信级别；正文写作只从台账取数。
4. **只新建、不改写、不追加已落盘文件**：新增批次用新文件；发现旧结论失真时在新批次文件里写明更正，不回填旧分片。
5. **查询节奏**：每批检索 → 立即机械导出到分片（不等到任务收尾）→ 读分片提炼台账 → 再发起下一批查询。上下文压缩后一律从分片恢复，禁止凭记忆补写数字。
6. 原始工具返回可能是搜索摘要或模型对页面的抽取，**不等于官方原文**；引用前按 `evidence/00-discipline.md` 定级，关键结论须升级到 A/B 级。

### 与 `overview.md` 表述的关系

`overview.md` 里写的是初版「`raw-NN.md` / `evidence-NN.md` 合并档」方案，并记录了 `raw-01.md` 238 KB。按「历史记录不可矫正」约定**不改写该文件**；自上述用户纠正起，现行口径以本索引为准：合并档已拆分为分片并移除，内容零丢失。

## 批次 01（截至 2026-11-15 19:18）

来源：本会话记录中 12 条完整 `WebSearch` / `WebFetch` 调用；另有 6 条被中断的调用无返回结果，已列入待补清单。

### 原始返回全文（`raw/`）

| 文件 | 大小 | 工具 | 内容 |
|---|---:|---|---|
| `01-01-harness-comparison-search.md` | 19.2 KB | WebSearch | 五系统对比：FeatureBench 事故文档、四控制面文章、Leaderboard 概述、Composio 转述、Product Compass |
| `01-02-pi-official-search.md` | 20.8 KB | WebSearch | pi.dev 官方能力、Pi 作者与 monorepo 第三方资料 |
| `01-03-dsh-open-source-search.md` | 31.9 KB | WebSearch | DSH Creator Mode、Super-agent、Harness 定义与四种模式中文长文 |
| `01-04-leaderboard-method-search.md` | 16.8 KB | WebSearch | Leaderboard 方法论、28,849 trials、DSH 上榜、bokonon 复算 |
| `01-05-hermes-official-search.md` | 14.0 KB | WebSearch | Hermes 官方站点、生态目录、中文介绍 |
| `01-06-claude-code-docs-search.md` | 28.0 KB | WebSearch | Claude Code 官方博客 / hooks / Agent SDK / subagents |
| `01-07-juejin-four-control-planes.md` | 13.9 KB | WebFetch | 六套 Harness 架构对照与四个工程旋钮（二手） |
| `01-08-productcompass-bug-hunt-bench.md` | 26.4 KB | WebFetch | Bug Hunt Bench 全表、统计检验、许可证、接入方式、完整出处清单 |
| `01-09-bokonon-leaderboard-recompute.md` | 7.0 KB | WebFetch | Leaderboard 独立复算、噪声仪表、作弊与输出上限 |
| `01-10-codex-cli-docs-search.md` | 25.8 KB | WebSearch | AGENTS.md、Codex 权限/沙箱（多个 fork 镜像）、官方最佳实践 |
| `01-11-opencode-docs-search.md` | 8.3 KB | WebSearch | OpenCode 官网、permission 三态与细粒度规则 |
| `01-12-dsh-architecture-search.md` | 28.3 KB | WebSearch | DSH 架构文档 Chapter 16、Cordis、profile/bundle/patch、四种模式 |

### 证据台账（`evidence/`）

| 文件 | 大小 | 内容 |
|---|---:|---|
| `00-discipline.md` | 1.6 KB | A/B/C 可信级别、五条引用纪律 |
| `01-sources.md` | 5.4 KB | S01–S40 来源清单与用途 |
| `02-benchmark-facts.md` | 11.4 KB | F-B1–F-B17：两套基准设计、全表、统计检验、成本口径冲突、作弊与配置伪影 |
| `03-architecture-facts.md` | 10.8 KB | F-A1–F-A9：六套系统架构、官方机制、易变指标处理 |
| `04-open-items.md` | 1.9 KB | 12 项待补检索清单（批次 02+） |

## 批次 02+

按 `evidence/04-open-items.md` 推进；每批新建 `raw/02-NN-*.md` 与 `evidence/02-*.md`，并在本文件末尾的「批次登记」追加一行 —— **追加索引是本文件唯一允许的写操作**（它是活索引，不是历史结论记录）。

### 批次登记

| 批次 | 时间 | 新增文件 | 备注 |
|---|---|---|---|
| 01 | 2026-11-15 19:18 | `raw/01-01…01-12`（12）+ `evidence/00…04`（5） | 首批；19:21 由 238 KB 合并档拆分为分片，零丢失校验通过 |
| 02 | 2026-11-15 19:26 | `raw/02-01…02-04`（6 片）+ `evidence/02-official-facts.md`、`02-corrections.md` | 官方一手资料：pi.dev、Claude Code permissions、DSH Chapter 16、Codex 官方 README。permissions 文档 53.8 KB 被折叠，已从持久化文件完整恢复并切成 3 片（最大 26.9 KB） |
| 03 | 2026-11-15 19:31 | `raw/03-01…03-04`（4）+ `evidence/03-official-facts.md`、`03-benchmark-facts.md`、`03-open-items.md` | Hermes 官方 README、DSH 上榜缺陷全文、Composio 基准全文；Harness Lens 为 SPA 只抓到外壳，已列入待补 |
| 04 | 2026-11-15 19:38 | `raw/04-01…04-05`（5）+ `evidence/04-decisions.md`、`04-survey-plan.md`、`04-landscape-leaderboard-systems.md`、`04-open-items.md` | 用户决策落盘（扩覆盖 / 规模后定 / 纳入闸门）+ 5 个基准系统（mini-swe-agent、Kimi Code、Qwen Code、OpenClaw、Cline） |
| 05 | 2026-11-15 19:45 | `raw/05-01…05-06`（6）+ `evidence/05-landscape-more-systems.md` | Grok Build、Kilo Code（首查被安全检查扣留，换词重查成功）、OpenCode 2.0、Letta Code、OpenHands |
| 06 | 2026-11-15 19:52 | `raw/06-01…06-09`（9，含 3 条 404/重定向记录）+ `evidence/06-official-upgrades.md` | Codex 官方 sandboxing/config-reference（learn.chatgpt.com 新文档站）、DSH 官方仓库 README、Hermes docs 根页+架构页、Claude Code steering 博客。期间修复两次导出 slug 误配（覆盖/跳过），已按 callId 重写 |
| 07 | 2026-11-15 19:58 | `raw/07-01…07-02`（2）+ `evidence/07-methodology-anchors.md` | FeatureBench 事故文档全文（15× 差异=fetch 率、秩相关 0.36）+ arXiv 2610.00917 摘要（66 配置、+7.94/−30.16、6,204 轨迹）；校正 F-B28 的「36% schema」失真 |

**研究阶段收尾（19:58）**：7 批共 44 条检索全部落盘；10+ 系统有 A 级官方事实；3 套横向基准 + 2 份方法论一手材料。剩余未查项（Harness Lens 字段字典、榜单 CHANGELOG、Composio 原始 thread、DSH 上榜公告、super-agent 原型）降级为「写课时视需要再查」，见 `evidence/07-methodology-anchors.md` §3。
