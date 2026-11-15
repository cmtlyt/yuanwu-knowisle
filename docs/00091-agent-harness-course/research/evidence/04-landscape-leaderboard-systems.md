# 证据台账 04 · 扩展调研（一）：榜单内 5 个系统

> 原文：`../raw/04-01-mini-swe-agent.md` ~ `../raw/04-05-cline.md`。核实日期 2026-11-15。
> 级别说明：官方页面/仓库原文 = A；带源码分析或可复核基准 = B；百科、媒体报道、目录站 = C。

## mini-swe-agent（`SWE-agent/mini-swe-agent`）

- **F-S1｜官方定位（A，https://swe-agent.com）**：官网首句 `We recommend mini-swe-agent instead of SWE-agent`，`It matches the performance of SWE-agent, while being much simpler`；原 SWE-agent **已进入 maintenance-only mode**，当前开发重心全在 mini 版。SWE-agent 由 Princeton 与 Stanford 研究者构建维护，主打 `Free-flowing & generalizable: Leaves maximal agency to the LM`、`Configurable & fully documented: Governed by a single yaml file`、`Made for research: Simple & hackable by design`。
- **F-S2｜极简架构（B，followagents / agentindex 的源码摘要，待官方 README 升级 A）**：核心 agent class 约 **100 行 Python**，全部代码（含环境/模型/脚本）约 200 行；**Bash 是唯一的动作接口**，甚至不用模型的 tool-calling 接口（因此几乎兼容任何模型）；每步通过 `subprocess.run` **独立执行、不共享持久 shell 状态**；消息历史是**线性追加**、无 trajectory 管理；默认组合 `DefaultAgent` + `LitellmModel` + `LocalEnvironment`；安装 `uvx mini-swe-agent` / `pipx run mini-swe-agent` / `pip install mini-swe-agent`，CLI 命令 `mini`。
- **F-S3｜版本与生态（B/C）**：MIT；2025-06-28 首发，**v2.0.0（2026-02-11）引入原生 tool calling**（v1 完全走纯文本），最新 v2.4.6（2026-07-23），v2 有迁移指南。部署支持 local / Docker / Podman / Singularity / Apptainer / bubblewrap / contree；模型经 LiteLLM、OpenRouter、Portkey 接入。
- **F-S4｜分数口径冲突（重要）**：第三方站点称 `>74% on SWE-bench Verified`，而百度百科称「SWE-bench 验证集约 65%」——**两个数字都来自二手，且口径/版本不明**；课程不得二选一当事实。可复核的是榜单：Harness Leaderboard 三模型均分 **51.4% 第一**，与前四名统计并列；公告口径 **$0.53 / solved task**（F-B2/F-B4）。
- **F-S5｜适用与边界（B/C）**：适合**研究基线、批量 SWE-bench 推理、微调/RL 实验、需要极易读可改控制流的场景**；明确不适合「需要结构化工具集」「依赖跨命令 shell 状态」「想要开箱即用带完整 TUI 的日常驾驶」。第三方还提示：执行任意 bash 的系统在无人值守时必须沙箱化；v2 改了 API，旧脚本要迁移。
- **F-S6｜教学价值**：它是「极简也能打」的最强对照物 —— 51.4% 榜单第一，却是 100 行、无工具接口、无子代理的 bash-only agent；与 DSH 的插件树、Claude Code 的六档权限形成极端反差。

## Kimi Code CLI（`MoonshotAI/kimi-code`）

- **F-S7｜身份（B，官方 README 的镜像与目录站；仓库 https://github.com/MoonshotAI/kimi-code，文档 https://moonshotai.github.io/kimi-code/zh/）**：Moonshot AI（月之暗面）官方开源，MIT，TypeScript，终端里的 AI 编程 agent；**二进制单文件发行、不需预装 Node.js**，TUI 毫秒级就绪；`/login` 选 Kimi Code OAuth 或 Moonshot AI Open Platform API Key；可指向其他兼容厂商。Windows 需 Git for Windows 的 Git Bash，非标准路径用 `KIMI_SHELL_PATH` 指定。
- **F-S8｜官方特性清单（B）**：**视频输入**（把录屏/参考片拖进对话）；`/mcp-config` 对话式添加与认证 MCP server，无需手写 JSON；插件市场安装 skills / MCP / 数据源且**每次安装标明来源信任级别**；内置 `coder` / `explore` / `plan` **三个子 Agent 在隔离上下文并行**；**生命周期 hooks**（拦截高风险工具调用、审计决策、桌面通知、接自动化脚本）；**ACP**（`kimi acp` 让 Zed / JetBrains 等通过 stdio 驱动会话）。本地开发要求 Node ≥ 24.15.0 + pnpm 10.33.0，`pnpm lint` 用 oxlint。
- **F-S9｜与 Pi 生态的直接联系（B，官方致谢）**：README 明确 `Our TUI is built on top of pi-tui`，致谢 `earendil-works/pi-mono` —— 说明「极简内核 + 可扩展 TUI」这条路线被下游产品复用，是横向章讲「Harness 作为基础设施」的好材料。
- **F-S10｜可复核表现**：Harness Leaderboard 三模型均分 **50.5%**（并列第一组，Flint 上最优，F-B2）；Composio 基准 **21/26 第一**，$0.54/task、中位 297.1 s（C 级转述，F-B26）。
- **F-S11｜边界**：目前只有 README 镜像（第 2 条搜索结果来自他人 fork 的 `README.zh-CN.md`），**架构细节（主循环、权限、压缩）尚无官方文档页核实**；待补 `guides/interaction`（交互与审批）、`guides/sessions`（会话）、`configuration/config-files`。

## Qwen Code（`QwenLM/qwen-code`）

- **F-S12｜身份与版本（B/C）**：阿里 Qwen 团队开源，**Apache-2.0**；第三方称最早从 **Google Gemini CLI 分叉**，v0.1 起不再跟上游同步。稳定分支 `v0.27.2`（2026-11-10）；**1.0 Preview 于 2026-11-11 以独立分支 `v1.0.0-preview` 开放**，融合 Qoder 的 Harness 能力，现稳定分支继续保留、该阶段暂不接社区 PR，预计 12 月后开放。课程必须区分这两条版本线。
- **F-S13｜1.0 架构（B/C，官方发布稿经 IT之家 / UCloud / EOGEE 转述）**：从**进程内内存事件总线**起步，沿统一事件模型向分布式演进；「**手脑分离**」让推理编排与工具执行独立管理，从「一个进程、多个会话」走向「多个节点、更多会话」；模型接入、沙箱资源、MCP 配置/授权/连接改为**集中管控与按需复用**。定位是「可嵌入第三方产品的 **Agent 运行基座**」，提供 CLI 与 SDK。
- **F-S14｜能力面（B/C）**：开箱即提供 **Auto-Memory / Auto-Skills / SubAgents / Agent Teams / MCP**；多协议接 OpenAI、Anthropic、Gemini、Qwen API，任意第三方或 Ollama / vLLM 本地模型，**运行时切换**；终端 + macOS/Windows/Linux 桌面 + 实验性 Web UI（`qwen serve`，HTTP + SSE，多客户端共享会话）+ VS Code / Zed / JetBrains 插件 + TypeScript/Python/Java SDK + Telegram / 钉钉 / 微信 / 飞书。安装可用 npm（Node ≥22）或 Homebrew，`/auth` 设 provider 与 key。
- **F-S15｜可复核表现与边界**：Harness Leaderboard 三模型均分 **44.7%**，在「断层」之下但明显高于 OpenCode 35.5 / OpenClaw 27.3（F-B2）。第三方提醒：多端界面带来更多需要学习的部件；围绕 Qwen 模型调优，换其他 provider 可用但体验以其为中心；Web UI 标为实验性。
- **F-S16｜与 DSH 的可比点**：两者都在讲「统一事件 / 手脑分离 / 可嵌入基座」，但 Qwen Code 是**从 IDE 编码 agent 长成运行基座**，DSH 是**从零设计的插件树运行时**；横向章可用这条对照讲「架构趋同与起点差异」。

## OpenClaw（基金会项目）

- **F-S17｜身份沿革（C，百科/媒体）**：Peter Steinberger 于 **2025-11** 以 `Clawdbot` 发布；2026-01-27 因 Anthropic 商标问题改名 `Moltbot`，01-29/30 再改 `OpenClaw`；**2026-02-15 Sam Altman 宣布创始人加入 OpenAI，项目转由独立基金会运营并继续开源**；MIT、TypeScript。口号「让 AI 通过你已经在用的聊天 App 跟随你」。
- **F-S18｜架构（C，中文深度分析公众号，需官方核实）**：**Gateway 即控制面** —— 统一管理会话、工具解析、事件、通道连接、插件引导、Cron、节点/伴侣管理、MCP、认证与审批；Gateway 协议基于 WebSocket、版本 4，由 16 个 Schema 片段组合（Board / ProgressCard / Transport / AgentControl / Node / Integration / SessionCore / … / Approval / PluginLifecycle / Portal），原则是 `Additive first`；`src/gateway/` 约 1092 个条目、`packages/` 22 个内部包、250+ 子路径导出、`extensions/` **150+ 扩展 / 20+ IM 通道**（WhatsApp / Telegram / Slack / Discord / Signal / iMessage / Matrix / IRC / 飞书 / Zoom / MS Teams / SMS …）；**SQLite-First**（`state/openclaw.sqlite` + 每 Agent 一个 DB，明确禁止用 JSON/JSONL 存运行时状态）；伴侣应用可把语音/相机/屏幕/设备控制接到 Agent。
- **F-S19｜安全风险（C，澎湃新闻等）**：**不在浏览器沙盒中运行，直接在宿主机 OS 层执行 shell、读写文件、控制浏览器**；Gateway 旧版默认监听 `0.0.0.0:18789`，新版改 `localhost:18789`；长期记忆以**明文 Markdown / JSON** 存宿主机；2026-01 末 Shodan 扫出近千个无认证实例，卡巴斯基审计称 512 个漏洞（8 个严重），有研究员取得第三方 API key / Telegram token / 聊天记录；`CVE-2026-25253`（CNVD-2026-13289）在 v2026.1.29 修复。→ **这是「权限与沙箱」章最好的反面案例**，但必须注明来源为媒体报道。
- **F-S20｜榜单表现与配置伪影（B，F-B2/F-B6）**：三模型均分 **27.3% 末位**；其 **8,192-token 输出上限**（模型条目未声明 maxTokens 时的 fallback）终止了 **333 次 Flint DeepSWE trials 中的 289 次**，榜单已披露并在解除上限后重跑 —— 末位分数部分由**一个配置值**写出，不是纯能力结论。
- **F-S21｜适用与边界（C）**：适合本地优先的个人助手、需要跨多个 IM 通道触达、设备/伴侣应用控制；第三方评分指出**无多租户、无 SSO/RBAC、无内置知识库/RAG、单 Agent 架构、缺可观测性**，不适合企业 SaaS 底座与多 Agent 编排。
- **F-S22｜Pi 生态联系（A/B，pi.dev 官方）**：pi.dev 把 **OpenClaw 列为 Pi RPC / SDK 模式的真实世界集成**（`See OpenClaw for a real-world integration`），说明「Pi 作内核、OpenClaw 作网关」的分层关系，横向章可据此讲「Harness 可组合」。

## Cline（`cline/cline`）

- **F-S23｜身份（A，https://cline.bot 官方）**：`The collaborative coding agent for complex work`，官网自述 3.8M+ 安装、51.8k stars（易变快照）；**Apache-2.0**（官方 CLI 2.0 博客明确）；设计原则四条：**Open Source Everything**（agent loop 全部开源可审计）、**Not Profiting on Inference**（自带 API key、按供应商原价付费、无加价）、**Universal Model Access**、**Your Infrastructure Only**（纯客户端，代码不出本机）。企业侧宣称 SOC 2 Type I / GDPR、SSO / RBAC / 集中策略。
- **F-S24｜多形态（A/B）**：同一 agent core 交付为 VS Code 扩展（仍以 `claude-dev` 包名发布）、JetBrains 插件（**未开源**）、**CLI 2.0**（`npm install -g cline`，`cline auth`）、桌面应用（Tauri + Bun sidecar + Next.js）、`@cline/sdk`；SDK 拆 `@cline/core` / `@cline/agents`（agent loop）/ `@cline/llms` / `@cline/shared` / `@cline/ui`；多客户端会话可共享本地 background hub（`cline hub`）；CLI 2.0 还支持 ACP，可接 Neovim / Emacs / Zed。
- **F-S25｜七个 Harness 构件（B，innFactory 的 harness 拆解，非官方原文）**：① agent loop（CLI 可 headless，`--auto-approve` **默认 true**，`--json` 流式输出）；② 工具（文件编辑 / bash / 浏览器，MCP 用 `cline mcp`，SDK 自定义工具）；③ 上下文（`.clinerules/` 或 `.cline/rules/`，也认 `AGENTS.md` / `.cursorrules` / `.windsurfrules`）；④ 状态（`cline history` 恢复、`--team-name` 团队状态、`cline schedule` 定时任务跨重启）；⑤ 权限（`--auto-approve false` 逐调用确认，`CLINE_SANDBOX` 隔离到独立数据目录）；⑥ 验证反馈（**每次工具调用后创建 shadow Git checkpoint**，`/undo` 可还原文件/任务/两者）；⑦ 编排（coordinator agent 拆任务给 specialist agents，各自工具与上下文）。
- **F-S26｜Plan / Act（A，官网）**：`Plan Mode` 先探索代码库并与人共同产出完整计划，再写第一行代码；`See every file read and every diff before it's applied` —— 人工审批是其核心产品承诺，与 Pi「无 permission popups」、Codex「sandbox 内自动执行」构成鲜明对照。
- **F-S27｜模型（A）**：无固定默认模型，Claude / GPT / Gemini / Bedrock / Vertex / Mistral / DeepSeek / Cerebras / Grok / Qwen / LiteLLM / Ollama / LM Studio / 自定义 OpenAI 兼容 endpoint；官方明确**不索引/不嵌入仓库内容**，按需读文件。
- **F-S28｜基准位置（B，F-B24）**：Harness Leaderboard changelog 列 **Cline 为下一个待加入的 harness**，目前**没有榜单分数**；因此横向对比表里必须标「暂无可复核实测」，不能从 star 数或安装量推能力。

## 本批新增的可引用来源

| ID | URL | 级别 | 用途 |
|---|---|---|---|
| S41 | https://swe-agent.com | A | mini-swe-agent 取代 SWE-agent 的官方口径 |
| S42 | https://github.com/MoonshotAI/kimi-code | A/B | Kimi Code 官方仓库（README 待直接抓） |
| S43 | https://moonshotai.github.io/kimi-code/zh/ | A | Kimi Code 官方文档（交互审批 / 会话 / 配置） |
| S44 | https://github.com/QwenLM/qwen-code | A | Qwen Code 官方仓库 |
| S45 | https://qwenlm.github.io/qwen-code-docs/1.x/ | A | Qwen Code 1.0 Preview 文档 |
| S46 | https://m.ithome.com/html/1025393.htm、https://eogee.com/article/346 | C | Qwen Code 1.0「统一事件 / 手脑分离」发布稿转述 |
| S47 | https://m.thepaper.cn/newsDetail_forward_32763105 | C | OpenClaw 安全事件与架构风险 |
| S48 | https://cline.bot/、https://cline.bot/blog/introducing-cline-cli-2-0 | A | Cline 官方设计原则与 CLI 2.0 |
| S49 | https://docs.cline.bot/cline-cli | A | Cline CLI 官方文档（待抓） |
| S50 | https://innfactory.ai/en/ai-harness/cline | B | Cline 七构件 harness 拆解 |
