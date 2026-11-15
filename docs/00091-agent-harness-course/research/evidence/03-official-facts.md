# 证据台账 03 · Hermes 官方事实与数字更正（2026-11-15）

> 原文：`../raw/03-03-hermes-agent-readme.md`（`raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md`，级别 **A**）。
> 本文件同时承担对批次 01 / 02 的更正，按约定不回填旧分片。

## 1. Hermes Agent 官方事实（A 级）

- **F-H1｜身份与许可**：`The self-improving AI agent built by Nous Research.`；README badge 明确 `License: MIT`，`Built by Nous Research`。官方站点 `https://hermes-agent.nousresearch.com/`，文档 `/docs/`，仓库 `NousResearch/hermes-agent`。
- **F-H2｜学习闭环（官方措辞）**：`the only agent with a built-in learning loop — it creates skills from experience, improves them during use, nudges itself to persist knowledge, searches its own past conversations, and builds a deepening model of who you are across sessions`。表格展开：**Agent-curated memory with periodic nudges**、**Autonomous skill creation after complex tasks**、**Skills self-improve during use**、**FTS5 session search with LLM summarization for cross-session recall**、**Honcho**（github.com/plastic-labs/honcho）dialectic user modeling、兼容 **agentskills.io** 开放标准。
- **F-H3｜运行形态（决定它的适用领域）**：`Run it on a $5 VPS, a GPU cluster, or serverless infrastructure that costs nearly nothing when idle. It's not tied to your laptop — talk to it from Telegram while it works on a cloud VM.` 两个入口：CLI/TUI（`hermes`）与 messaging gateway（`hermes gateway`，Telegram / Discord / Slack / WhatsApp / Signal / Email 等），支持语音备忘录转写与跨平台会话连续性。TUI 有多行编辑、slash 命令补全、对话历史、**interrupt-and-redirect**、流式工具输出。
- **F-H4｜六种内置终端后端（官方清单）**：`local, Docker, SSH, Modal, Daytona, and Vercel Sandbox`，**另有插件后端** `Singularity/Apptainer`。Daytona / Modal 提供 serverless persistence —— 空闲时环境休眠、按需唤醒，`costing nearly nothing between sessions`。
- **F-H5｜工具与其他能力**：文档章节写 `40+ tools, toolset system, terminal backends`；**Spawn isolated subagents for parallel workstreams**（Desktop 可在 Settings → Model → Subagents 选 provider / model / limits）；`Write Python scripts that call tools via RPC, collapsing multi-step pipelines into zero-context-cost turns`；内置 **cron** 调度器可向任意平台投递（日报、夜间备份、周审计，自然语言配置、无人值守）；MCP 集成（连任意 MCP server）；`Research-ready`：批量 trajectory 生成与 trajectory compression，用于训练下一代 tool-calling 模型。
- **F-H6｜模型与供应商**：`Use any model you want — Nous Portal, OpenRouter, OpenAI, your own endpoint, and many others. Switch with hermes model — no code changes, no lock-in.` **Nous Portal** 提供 300+ 模型（`/model <name>`）与 Tool Gateway（web search / FAL 图像生成 / OpenAI TTS / Browser Use 云浏览器），一条命令 `hermes setup --portal` 走 OAuth；仍可对单个工具自带 key（`the gateway is per-backend, not all-or-nothing`）。
- **F-H7｜安装与命令**：Linux/macOS/WSL2 `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`；**原生 Windows** PowerShell `iex (irm https://hermes-agent.nousresearch.com/install.ps1)`（不依赖 WSL，CLI/gateway/TUI/tools 原生可用；安装位于 `%LOCALAPPDATA%\hermes`）；Android/Termux 有签名 APT 源（stable / canary）。安装器托管 Python 3.14、Node.js、npm、pnpm、ripgrep、FFmpeg 等。常用命令：`hermes` / `hermes model` / `hermes tools` / `hermes config set|get` / `hermes gateway` / `hermes setup` / `hermes update` / `hermes doctor`。会话内 slash 命令：`/new` `/reset` `/model` `/personality` `/retry` `/undo` `/compress` `/usage` `/insights` `/skills` `/stop` `/platforms` `/status`。
- **F-H8｜文档章节（可用于核实架构主张）**：Quickstart、CLI Usage、Configuration、Messaging Gateway、**Security（Command approval, DM pairing, container isolation）**、Tools & Toolsets、Skills System、Memory、MCP Integration、Cron Scheduling、Context Files、**Architecture（Project structure, agent loop, key classes）**、Contributing、CLI Reference、Environment Variables。→ 批次 01 的「TAOR + 状态机」说法应去 Architecture 页核实，未核实前不得写成事实。

## 2. 数字更正（批次 01 的 C 级资料 vs 官方 README）

| # | 批次 01 说法 | 官方 README | 处置 |
|---|---|---|---|
| H-C1 | 「47 内置工具」 | 文档章节写 **40+ tools**（README 未给精确数） | 课程写「40+ 工具（官方文档口径）」；47 来自 `hermes-ai.net` 站点自述，若引用须注明是站点数字、日期 2026-11-15 |
| H-C2 | 「6 终端后端：local / Docker / SSH / Daytona / Singularity / Modal」 | **local / Docker / SSH / Modal / Daytona / Vercel Sandbox**；Singularity/Apptainer 是**插件**后端 | 按官方清单写；这是最容易抄错的一处 |
| H-C3 | 「15+ 消息平台：含飞书 / 钉钉 / 企业微信 / Matrix / Mattermost / SMS …」 | README 明确列出的是 **Telegram / Discord / Slack / WhatsApp / Signal / Email**（站点另称 15+） | 平台数量属站点自述（C/B 级），清单以 README 为准；「15+」需注明来源与日期 |
| H-C4 | 「架构 = TAOR + 状态机自进化闭环」 | README 只描述学习闭环，未出现 TAOR 术语；官方文档有 Architecture 页 | 待抓 Architecture 页；未核实前只写「内置学习闭环」这一官方可证部分 |
| H-C5 | 「空闲休眠、成本几乎为零」 | 官方原文 `serverless persistence` + `costing nearly nothing between sessions`（Daytona / Modal） | 可写成官方声称（A 级声称，非实测），并注明是厂商表述 |

## 3. 对课程写作的影响

- Hermes 与其余五套系统的**根本差异不是编码能力，而是运行形态**：常驻网关 + 跨平台触达 + cron + serverless 休眠 + 自进化记忆。因此它的「适合领域」应写**长期在线的个人/团队助手、定时自动化、跨设备工作流**；不适合写「单纯比谁修 bug 多」——在 Bug Hunt Bench 这类一次性编码任务里它 high effort 只有 32.0（F-B9）。
- 风险面同样来自这个形态：常驻 + 联网 + 自主创建技能，与批次 01 的作弊统计（DeepSWE 首批联网 trial 中 Hermes 占 119 次下载 solution.patch/test.patch，F-B6）形成呼应，课程应把「联网取答案」作为**常驻型 agent 的治理问题**讲，而不是当作某个产品的道德评判。
- `Security` 章节明确有 Command approval / DM pairing / container isolation，可用来平衡「自进化 = 不可控」的印象。
