# 证据台账 04 · 扩展调研计划（用户要求「调研尽可能多的 agent」）

## 收录标准（避免无限扩张）

一个系统进入全景清单，至少满足两条：

1. 有**可点击的官方来源**（仓库 / 文档 / 产品页）或**公开基准记录**；
2. 能说清它作为 **Harness** 的至少一个工程维度（主循环 / 工具 / 权限 / 上下文 / 终止 / 人工介入 / 运行形态）。

只有营销页、无架构信息、无实测数据的产品，只记名字与链接并标「资料不足，不成章」。

## 每个系统要提取的字段（写进全景清单）

| 字段 | 说明 |
|---|---|
| 开发方 / 许可证 | 官方仓库为准；许可证不明就写「未给出」，不按常识补 |
| 运行形态 | CLI / TUI / IDE 扩展 / 桌面 / Web / 常驻网关 / 云端沙箱 |
| 主循环 | 单线程 while / 状态机 + Runner / Turn loop / 插件化 loop / 事件驱动 |
| 工具与扩展 | 内置工具数（有官方口径才写）、MCP、插件、skills、subagents |
| 权限与沙箱 | allow/ask/deny、approval policy、OS 沙箱、容器隔离 |
| 上下文管理 | 压缩触发、会话持久化、会话树 / 分支、跨会话记忆 |
| 模型接入 | 绑定自家模型 / 多供应商 / endpoint 兼容方式 |
| 可复核表现 | 属于哪套基准、分数、成本口径、噪声与限制 |
| 证据级别 | A / B / C，以及来源 ID 与核实日期 |

## 分层清单与批次

**第 1 层 · 已有公开基准记录（证据最强，优先）**

| 批次 | 系统 | 已知线索 |
|---|---|---|
| 01–03 ✅ | Claude Code / DeepSeek Harness / Hermes Agent / Pi / Codex CLI / OpenCode | 详见 `02-benchmark-facts.md`、`03-benchmark-facts.md` |
| 04 | mini-swe-agent、Kimi Code、Qwen Code、OpenClaw、Cline | Leaderboard 前五 / 尾部断层 / changelog 下一个加入 |
| 05 | Grok Build CLI、Kilo Code、OpenCode 2.0、Letta Code、OpenHands | Bug Hunt Bench 与 code404zero 的对照系统 |
| 06 | SWE-agent / mini-swe-agent 的上游、Devin、Factory Droid、Augment、Sourcegraph Amp | 商业编码 agent 与 SWE-bench 系谱 |

**第 2 层 · 主流但基准未覆盖（补生态版图）**

| 批次 | 系统 |
|---|---|
| 07 | Gemini CLI、GitHub Copilot CLI / coding agent、Aider、Cline/Roo Code、Amazon Q Developer CLI / Kiro |
| 08 | Mistral Vibe、Qoder、WorkBuddy / CodeBuddy、Antigravity、Cursor CLI / Windsurf、Zed / Warp |
| 09 | 国产阵营：Kimi CLI、MiniMax Code、Z.ai ZCode / GLM Code、通义灵码 Lingma、百度 Comate、Trae、CodeGeeX |

**第 3 层 · 形态特殊（决定是否单独成章）**

| 批次 | 系统 |
|---|---|
| 10 | OpenClaw 的宿主形态、Reasonix、Kimi Code 的 CLI/IDE 形态、以及 ChatGPT Codex Web / Claude Code Remote Control 等「云端/远程」变体 |

## 每批执行规则

1. 一批 4–5 个查询；**返回后立即**按 `research/README.md` 逐条导出 `raw/0N-*.md` 分片（≤32 KB）。
2. 读分片，把可证实事实写进 `evidence/0N-landscape-<主题>.md`，每条带来源 ID 与 A/B/C 级别。
3. 只在这批全部落盘 + 台账写完后才发起下一批查询。
4. 查不到官方资料的系统，在台账里写「资料不足 + 已尝试的检索词」，不做推测。

## 调研收尾方法

- 汇总一张**系统全景表**（`evidence/0N-system-landscape.md`），按「架构流派」而非按厂商聚类：极简可扩展型、插件化运行时型、权限/沙箱强管控型、常驻自进化型、IDE/云端托管型、基准对照型。
- 章节划分建议按聚类给，每章至少 2 个可对照系统或 1 个证据充分的系统；**证据不足的系统合并进「生态版图」一章**，不硬凑独立章。
- 用户确认章节与课数后，才进入 `app/data/agent-harness-course/` 数据实施（每课标 `Lesson.kind`）。
