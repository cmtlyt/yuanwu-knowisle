# 00091 · 新增「Agent Harness 深度比较」课程

## 状态

**资料暂存与检索阶段，方案待用户审核；课程内容尚未实施、未提交。**
分支 `feat/agent-harness-course`，基点 `main@c6122ef`。

## 目标

新增一门独立课程，深度比较 2026 年主流的编码 Agent 运行时（Agent Harness）：

- 每个 Agent 系统**单独一章**，讲清架构机制与优缺点；
- **最后一章横向对比全部系统**，明确各自的适用领域；
- 全部论述**基于可证实资料**（官方文档 / 官方仓库 / 公开基准原始记录 / 带统计检验的第三方实测），不凭感觉；
- 正文中**夹带可点击的原文链接**。

## 用户新增的工作纪律（本任务起执行）

> 「查询到的资料必须先落盘暂存，避免上下文压缩丢失信息，然后再继续查询。」

落地方式（已执行）：

1. 任何网络检索的**原始返回全文**先机械导出到 `research/raw-NN.md`，再继续下一批查询；
2. 从原文提炼的**结构化证据台账**写 `research/evidence-NN.md`，所有数字带来源 ID、可信级别与核实日期；
3. 批次文件**只新建、不改写、不追加**（遵守「历史记录不可矫正」约定）；上下文压缩后一律从台账恢复，禁止凭记忆补写数字；
4. 台账末尾写「待补检索清单」，每批查询按清单推进并交叉验证。

当前进度：`raw-01.md`（12 条完整调用记录，238 KB）、`evidence-01.md`（40 个来源 ID / 26 条事实编号 / 12 项待补检索）。另有 6 个被中断的调用无返回结果，不算资料丢失，已列入待补清单。

## 证据口径（写进课程第 0 章，也约束全部正文）

| 级别 | 含义 | 正文写法 |
|---|---|---|
| A | 官方仓库 / 官方文档 / 官方产品页 / 基准发布者一手数据 | 直接陈述 + 官方链接 |
| B | 可复核第三方：公开 `runs.csv`、作者独立复算、带统计检验的实测 | 注明「第三方实测 / 复算」+ 链接 |
| C | 二手转述、社区文章、媒体报道、搜索摘要 | 只作背景与定性，必须写「据…报道」，不单独承担关键结论 |

**五条硬纪律**：

1. 不把 `p = 0.14` 的 3.6 分差距写成「A 比 B 强」；原文口径是 *a consistent lean, not a proven gap*。
2. 不混用两套基准：Bug Hunt Bench 分数 = 105 个预置 bug 中修好数；Harness Leaderboard 分数 = 两基准任务解决率均值。`cost per run` ≠ `cost per solved task`。
3. 「每解出一题成本」有全盘聚合与按模型先平均两种口径，两组数都真实但相差可达 11.7×，必须写明所用口径。
4. 官方自称（star 数、平台数、工具数）与第三方实测分开；易变指标带快照日期与来源。
5. 所有关键结论在正文里直接夹带原文链接。

## 章节结构（草案，待审核）

**8 章 / 18 课 / 约 24 个概念**，simple 渲染模式，`widget: null`（比较型课程不复用 Effect/RxJS 的原理演练），每课 2 题。

| 章 | 主题 | 课 | 每课交付 |
|---|---|---|---|
| S0 | 证据方法论：怎么比较 Harness | 2 | ① Harness 定义与四个控制面（`Agent = Model + Harness`）；② 两套公开基准的设计、统计显著性与口径陷阱 |
| S1 | Claude Code | 2 | ① 主循环、七种指令载体、hooks 生命周期、压缩；② 权限与子代理、proprietary 边界、优缺点与适用领域 |
| S2 | DeepSeek Harness | 2 | ① Cordis 插件树、四层配置、五种 profile；② 四种模式与 turn/step 管线、Super-agent 原型、预览版风险与适用领域 |
| S3 | Hermes Agent | 2 | ① 自进化学习闭环（记忆 / 技能 / FTS5 / Honcho）；② 15+ 平台网关、47 工具、6 后端、常驻场景优缺点与风险 |
| S4 | Pi | 2 | ① 极简内核（4 工具、短系统提示、明确不做清单）；② 会话树、上下文工程、steering/follow-up、成本优势与责任转移 |
| S5 | Codex CLI | 2 | ① Turn loop 与 AGENTS.md；② 双轴权限与 OS 沙箱、bench 下界与超时、优缺点与适用领域 |
| S6 | OpenCode | 2 | ① 状态机 + Runner 与插件生态；② permission 三态、v1.1.1 迁移与细粒度规则、榜单断层与适用领域 |
| S7 | 横向对比与选型 | 4 | ① 同一模型下两套基准全表；② 统计显著性、噪声仪表与设置不等价；③ 成本 / 稳定性 / 作弊 / 配置伪影；④ **领域适配决策表**（逐系统「适合 / 不适合 / 依据链接」） |

「等等」范围的候选（mini-swe-agent、Kimi Code、Qwen Code、OpenClaw）**不单独成章**，只在 S0 / S7 作为榜单对照与反例出现；理由：用户点名的 5 个 + 生态中必要补位的 OpenCode 已覆盖主要架构流派，其余单独成章会稀释证据密度。若用户要求扩大范围，按同一证据口径补章。

## 变更计划

| # | 文件 / 目录 | 动作 |
|---|---|---|
| 1 | `docs/00091-agent-harness-course/` | 新建：`overview.md`（本文件）、`research/raw-NN.md`、`research/evidence-NN.md`、收官 `result.md` |
| 2 | `app/data/agent-harness-course/` | 新建目录化课程：`index.ts`、`meta.ts`、`stages.ts`、`concepts.ts`、`design.ts`、`lessons/index.ts` + `lessons/l01.ts`…`l18.ts` |
| 3 | `app/data/courses.ts` | 追加一项注册：`slug: 'agent-harness'`、`storageKey: 'knowisle:agent-harness:v1'`、`status: 'available'`、独立 icon / color / tags |
| 4 | `META` | `version: 'harness-snapshot@2026-11-15'`（**证据快照**而非软件包版本），`verifiedAt`、`docs` 指向 Harness Leaderboard，`notes` 记录「所有版本/分数随快照变化，正文链接为准」 |
| 5 | `scripts/content-gate-baseline.json` | 若给课时标 `kind`，按 00090 经验同步写入全量豁免再逐批收缩；**或**按 `types/course.ts` 对 simple 课程的许可不标 `kind`（闸门整门跳过）。此项需用户决策 |

**生成方式**：沿用 00089 / 00090 已验证的「**纯 Markdown 草稿 → 一次性生成脚本**」：草稿写 `.md`，脚本统一转义反斜杠 / 反引号 / `${`，结构化字段（quiz / terms / pitfalls / concepts / prereqs）由脚本序列化，避免模板串转义坑；草稿与一次性脚本收尾清理，不入库。

**目录内导入规范**：兄弟值导入显式 `.ts`；类型走 `~/types/course` type-only；`courses.ts` 用省略扩展名 `./agent-harness-course`；Node 校验脚本按 `.../index.ts` 显式路径 import。文件名统一 kebab-case。

## 验证方案

| 检查 | 判据 |
|---|---|
| `pnpm fmt:check` → `lint` → `typecheck` → `verify` → `build` → `smoke` | 0 errors（沿用既有 warnings 基线） |
| `scripts/verify-course.mjs` 动态发现 | 新目录自动纳入：阶段 / 概念 / 课 / 题引用完整性、学情引擎全轨迹、多课程隔离、DESIGN 区块合法 |
| `content-gate.mjs` | 按用户决策：标 kind 则全量达标、豁免清零；不标则打印「跳过」且不影响既有 194/194 |
| `check-course.mjs app/data/agent-harness-course app/lib/widgets` | 引用完整性、答案索引、概念 DAG、DESIGN 通过 |
| `pnpm build` + Workers 预览（3199）SSR 抽查 | `/courses/agent-harness/lessons/L01` 与末课 HTTP 200，表格 / callout / 代码块 / 外链渲染正常，无残留围栏 |
| 链接与数字复核 | 逐课抽查正文 URL 与 `evidence-NN.md` 来源 ID 一致；数字与台账逐项对账 |

## 风险与边界

1. **时效性**：这是 2026-11 的快速迭代生态，DSH 仍是 developer preview（37 个 release 全是 prerelease、README 明确警告破坏性变更）。课程必须声明「证据快照日期」，避免把预览版当成品。
2. **来源质量不均**：部分关键数字目前只有搜索摘要或二手转述（Composio 基准、DSH 上榜表现、掘金架构对照）。批次 02 必须抓官方全文交叉验证；未升级到 A/B 级的内容不得写进「优缺点」结论。
3. **镜像仓库陷阱**：Codex CLI 的搜索结果落在多个 fork 镜像（`ReleasedGroup/codex` 等），不是 `openai/codex`；必须核实官方仓库后再引用权限模型。
4. **代码量天然偏少**：比较型课程不像 Effect/RxJS 有可运行实现，若纳入体量闸门，`theory` 档 400 代码字符下限需用配置片段 / 命令 / JSON / 伪代码满足，不得堆无关示例。
5. **历史记录不可矫正**：`docs/00001`–`00090` 与 `AGENTS.md` / `docs/README.md` 的历史基线行一律不改写、不追加、不标注；本次所有结论只写在新目录。

## 待用户审核项

1. 章节范围：6 个系统（Claude Code / DeepSeek Harness / Hermes Agent / Pi / Codex CLI / OpenCode）+ 方法论章 + 横向章，是否认可？是否要把 mini-swe-agent / Kimi Code / Qwen Code / OpenClaw 也单独成章？
2. 规模：8 章 18 课是否合适？
3. 体量闸门：标 `kind` 纳入（对齐 00089 / 00090 的精品课标准）还是按 simple 课程许可不标？
4. 提交边界：沿用 00089 / 00090 的「不擅自 commit / push / 合并」，收官后等明确指令。
