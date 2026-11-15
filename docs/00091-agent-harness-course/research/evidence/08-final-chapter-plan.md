# 证据台账 08 · 最终章节方案（用户 2026-11-15 19:45 决策后定稿）

> 用户决策原文：「不一定要六章，收集到信息的 agent 系统都应该有独立章节，不用限制章节数」「章节扩充之后自行抉择，能够完整介绍对应 agent 即可」。
> 体量闸门已确认纳入（04-decisions.md）：每课理论 ≥1200 正文字 + 400 代码字符，标 Lesson.kind。
> 本文件是章节结构与课量分配的**权威口径**；`overview.md` 的 8 章 18 课草案按「历史不可矫正」约定不改写，以本文件为准。

## 一、15 个系统全部独立成章（依据：每系统已有 A 级官方事实）

| 章 | 系统 | 课数 | 证据密度 | 主要事实编号 |
|---|---|---:|---|---|
| S1 | 方法论与证据口径 | 2 | A（事故文档+论文+榜单） | FB-1~8、AX-1~7、F-B*、00-discipline |
| S2 | Claude Code（Anthropic） | 2 | A（permissions 全文+steering 博客） | CC-1~5、02 批 permissions |
| S3 | OpenAI Codex CLI | 2 | A（README+sandboxing+config-reference） | CX-1~9、01 批 README |
| S4 | DeepSeek Harness（DSH） | 2 | A（仓库 README+架构指南站） | DS-1~6、C 系列、F-A 系列 |
| S5 | Hermes（Nous Research） | 2 | A（docs 根页+架构页+README） | HE-1~7、H 系列 |
| S6 | Pi（badlogic / pi-mono） | 2 | A（pi.dev 官网） | 02 批 pi.dev、C-1、F-A 系列 |
| S7 | OpenCode（Anomaly） | 2 | A（官方发布说明+权限三态文档） | O-1~6、F-A1/F-A4 |
| S8 | Grok Build（xAI） | 1 | A（官方公告+仓库） | G-1~5 |
| S9 | mini-swe-agent（Princeton/Stanford） | 1 | A/B（官网+榜单第一） | F-S1~S6 |
| S10 | Kimi Code（Moonshot AI） | 1 | B（README 镜像+官方文档站） | F-S7~S11 |
| S11 | Qwen Code（阿里） | 1 | B/C（仓库+1.0 发布稿转述） | F-S12~S16 |
| S12 | Cline | 1 | A（官网+CLI 2.0 博客） | F-S23~S28 |
| S13 | Kilo Code | 1 | A（官网+开放页+博客） | K-1~K-6 |
| S14 | Letta Code | 1 | A（官方博客×2+README） | L-1~L-5 |
| S15 | OpenHands | 1 | A（官网+官方对比文） | H2-1~H2-5 |
| S16 | OpenClaw（反面案例） | 1 | B/C（榜单伪影+安全事件报道） | F-S17~S22、F-B6 |
| S17 | 横向对比与选型 | 4 | A/B（三套基准+论文） | 全部 |

**合计：17 章 27 课**；正文预估 3.5~4 万字。

## 二、单课系统的取舍说明（1 课 vs 2 课）

- 6 个主流系统（S2–S7）2 课：第 1 课架构与运行机制，第 2 课优缺点与适用领域。
- 9 个单课系统：材料密度或生态位较窄，1 课内完成「定位→机制→优缺点→适用领域」，避免为凑字数注水。
- OpenClaw（S16）单课但定位特殊：作为「配置伪影 + 安全边界」的反面教材（8,192-token 上限翻 289 次 trial；宿主机执行与近千暴露实例）。

## 三、横向章（S17）4 课结构

1. **全景对照表**：15 系统按形态（终端 TUI/IDE/平台/网关）、许可、模型接入、扩展机制、权限模型一张大表（数据全部来自台账，标快照日期）。
2. **基准数据横向**：Harness Leaderboard / Bug Hunt / Composio / arXiv 四套数据的交叉读法——分数、成本口径、统计噪声、秩相关 0.36、p=0.14 不写成「更强」。
3. **架构流派与工程旋钮**：极简内核（mini-swe/Pi）vs 插件树（DSH/OpenCode）vs 平台化（OpenHands/Kilo/Qwen）vs 记忆优先（Letta/Hermes）；四控制面（主循环/上下文/权限/终止）逐维对照。
4. **选型决策表**：按场景（个人日常/企业合规/研究基线/消息平台助手/多 IDE 团队/本地隐私）给出候选与排除项，每条挂证据链接。

## 四、实施口径（继承 00089/00090）

- 纯 Markdown 草稿 `docs/00091-agent-harness-course/drafts/` → 生成脚本产出 `app/data/agent-harness-course/lessons/lNN.ts`，避免模板串转义坑。
- 每课正文夹带可点击链接（A 级官方 URL 优先）；所有数字带「快照 2026-11-15」或来源标注。
- 写作陷阱清单（必须遵守）：见 `02-corrections.md` C-1/C-2、`03-official-facts.md` H-C1~C-3、`05-landscape-more-systems.md` G-5/K-6/L-4/H2-5、`06-official-upgrades.md` HE-5/HE-7/CX-8、`07-methodology-anchors.md` AX-6/AX-7。
