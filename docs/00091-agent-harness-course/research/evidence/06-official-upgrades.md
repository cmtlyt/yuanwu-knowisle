# 证据台账 06 · 官方一手资料升级（Codex / DSH / Hermes / Claude Code）

> 批次 06（2026-11-15 19:45 GMT+8 前后检索并落盘）。原文分片见 `../raw/06-*.md`。
> 本批把多处 B/C 级事实升级为 A 级，并修正若干此前数字。

## 1. Codex CLI（OpenAI）—— 事实升级

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| CX-1 | **sandbox_mode** 三档：`read-only` / `workspace-write` / `danger-full-access`（config.toml）。macOS 用 Seatbelt、Linux/WSL2 用 bubblewrap（`bwrap`，需 user namespace；Ubuntu 24.04 需手动装 AppArmor profile）、Windows 原生 sandbox（`windows.sandbox` = `mxc \| elevated \| unelevated`） | A | learn.chatgpt.com/docs/sandboxing.md（`raw/06-07`） |
| CX-2 | **approval_policy** 现行取值：`on-request` / `never` / `{ granular = {...} }`；`untrusted` 已不再支持、`on-failure` 已弃用；`approvals_reviewer` = `user \| auto_review`（可交 reviewer agent）。信任模型原话：「你信任的不是 agent 的意图，而是它在被强制执行的边界内运行」 | A | 同上 + config-reference（`raw/06-08`） |
| CX-3 | 低摩擦本地自动化推荐组合：`sandbox_mode="workspace-write"` + `approval_policy="on-request"`（CLI 对应 `--sandbox workspace-write --ask-for-approval on-request`）；Full access = `danger-full-access` + `never`；`sandbox_workspace_write.writable_roots` / `.network_access`（workspace-write 内默认禁出站网络，可开） | A | `raw/06-07` |
| CX-4 | config 架构：用户级 `~/.codex/config.toml`；项目级 `.codex/config.toml` 仅在信任项目时加载；Profile 文件 `$CODEX_HOME/<name>.config.toml` 用 `--profile` 选；项目级**不可覆盖**键清单（model_provider/model_providers/notify/profile/otel 等）；`projects.<path>.trust_level = "trusted" \| "untrusted"` | A | `raw/06-08` |
| CX-5 | AGENTS.md 相关键：`project_doc_max_bytes`（读取上限）、`project_doc_fallback_filenames`（缺失时备选名）、`project_root_markers`；`model_instructions_file` 取代 `experimental_instructions_file`；`developer_instructions` 可注入额外指令 | A | `raw/06-08` |
| CX-6 | 压缩参数：`model_auto_compact_token_limit`（+scope = `total \| body_after_prefix`）、`model_post_turn_compact_threshold_percent`（0–100，回合末按窗口百分比触发）、`compact_prompt` / `experimental_compact_prompt_file` | A | `raw/06-08` |
| CX-7 | model_providers：内置保留 ID `openai`/`ollama`/`lmstudio`；`wire_api` 仅支持 `responses`；GCP 与 amazon-bedrock 内置 provider；`env_key` 推荐于 bearer token | A | `raw/06-08` |
| CX-8 | ⚠️ 文档站迁移：developers.openai.com/codex/* 现重定向到 learn.chatgpt.com/docs/*（301 跨域）；`/codex/config` 与 `/codex/sandboxing`（无 `.md`）返回 404/导航壳。引用一律用 learn.chatgpt.com 现行 URL 或官方仓库 | — | `raw/06-02`/`raw/06-03-hermes-arch-404.md` 无关；见 `raw/06-02-codex-config-redirect-404.md`、`raw/06-04-codex-config-md-404.md` |
| CX-9 | 与既有 F-A3 的关系：此前 approval/sandbox 参数来自 fork 镜像 README（B 级）——CX-1~CX-7 为官方 A 级取代；若镜像名与新文档冲突（如 `untrusted`、`on-failure`），以本批官方页为准 | — | 综合 |

## 2. DeepSeek Harness（DSH）—— 官方仓库（A 级）

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| DS-1 | 仓库 `deepseek-ai/deepseek-harness`：开源 agent harness，**Everything is a Plugin** 架构，由 **Cordis** 驱动（设计出自论文《A Programming Paradigm for Spatiotemporal Composability》）；官方文档 deepseek-harness.github.io/deepseek-harness | A | README（`raw/06-05`） |
| DS-2 | **developer preview** 状态自述：「iterating rapidly. THERE WILL BE COMPATIBILITY-BREAKING CHANGES.」运行前需读 SAFETY.md（仓库有 SAFETY.md / SAFETY.zh.md / SAFETY.i18n.yaml，2026-08-23 加入） | A | README + 仓库文件树（`raw/06-05`） |
| DS-3 | 运行方式：`npx @deepseek-ai/dsh web`（Node.js），Web UI 默认 `http://127.0.0.1:3080`，`--no-open`；或源码构建 `pnpm install && pnpm run build && pnpm dsh web`；SSH 启动只打印 host URL | A | README（`raw/06-05`） |
| DS-4 | **License：MIT**（README 明示；第三方依赖清单 THIRD_PARTY_NOTICES.md）；monorepo 结构：native/packages/python/scripts/snapshots/vendor/website，pnpm workspace；活跃开发（2026-11-13 最近提交，release/dsh-0.2.2 分支合入 master，版本 0.2.2-rc.3） | A | README + 文件树（`raw/06-05`） |
| DS-5 | 生态信号：反馈走 GitHub Discussions；插件仓库加 `dsh-plugin` topic；Discord 社区；AGENTS.md 供 agent 贡献者使用 | A | README（`raw/06-05`） |
| DS-6 | 与既有 C-6/F-A 系列关系：官方 README **未列**四种模式名与 profile 数——这些仍只能引 deepseekharness.online 架构文档（02 批已 A 化为官方指南站？待核：deepseekharness.online 域名归属未证实，课程引用时须标注「第三方架构文档，与官方仓库不一致处以仓库为准」） | — | 对照 |

## 3. Hermes Agent（Nous Research）—— 官方文档（A 级）

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| HE-1 | 官方定位：「self-improving AI agent」，自述唯一内置学习闭环（从经验创建技能、使用中改进技能、自我提醒持久化知识、跨会话用户建模）；非 IDE coding copilot、非 chatbot wrapper | A | docs 根页（`raw/06-06`） |
| HE-2 | 架构页（A 级，2026-11-15 快照）：入口 6 类（CLI/Gateway/ACP/Batch Runner/API Server/Python Library）→ 统一 `AIAgent`（`agent/conversation_loop.py` + `agent/turn_*.py`）；**3 API 模式**（chat_completions / codex_responses / anthropic_messages）；工具注册表 **70+ tools / ~28 toolsets**；会话存储 SQLite + FTS5；上下文分层 system prompt（stable→context→volatile）+ 有损摘要压缩 + Anthropic prompt caching | A | developer-guide/architecture（`raw/06-09`） |
| HE-3 | 终端后端：**6 内置**（local/Docker/SSH/Daytona/Modal/Vercel Sandbox）+ 插件后端（Singularity）；浏览器 5 后端、Web 4 后端、MCP 动态；消息平台 **25+ adapters**（telegram/discord/slack/whatsapp/matrix/mattermost/email/sms/dingtalk/feishu/wecom/weixin/qqbot/signal/teams/google_chat/line/irc…）；DM pairing 授权；cron 是 agent 任务（存 jobs.json、可挂 skills、投递到任意平台）；ACP 适配 VS Code/Zed/JetBrains | A | `raw/06-09` + docs 根页 |
| HE-4 | 设计原则六条：Prompt stability（会话中系统提示不变，防缓存破坏）、Observable execution（每条工具调用可见）、Interruptible、Platform-agnostic core、Loose coupling（registry + check_fn）、Profile isolation（`hermes -p <name>` 独立 HERMES_HOME/配置/记忆/会话，可并发） | A | `raw/06-09` |
| HE-5 | ⚠️ 官方数字内部不一致：docs 根页 Key Features 说「60+ built-in tools」「20+ platforms」；架构页说「70+ tools」「25+ platform adapters」；README（03 批）说「40+ tools」。**写作口径：写「官方文档在 40→70+ 间随版本增长，快照 2026-11-15 架构页为 70+/28 toolsets」，给两个链接**；terminal 后端 6（架构正文）vs 图中 7（含插件 Singularity）同理 | — | 对照 HE-2/HE-3 与 `raw/06-06` |
| HE-6 | 安装：Hermes Desktop 安装包；或 curl install.sh（Linux/macOS/WSL2）/ PowerShell（Windows 原生）/ Termux（Android aarch64）；`hermes setup --portal` 一次 OAuth 得模型 + 4 个 Tool Gateway 工具；提供 llms.txt（~17 KB）与 llms-full.txt（~1.8 MB）机器可读文档入口；模型接入 Nous Portal/OpenRouter/OpenAI/任意 endpoint；18+ providers（架构页） | A | `raw/06-06`/`raw/06-09` |
| HE-7 | 修正此前台账：03 批 H-C1~C-3 的「40+ vs 47 冲突」结论需按 HE-5 重述——不是站点笔误，而是**文档体系间快照不同步**；「TAOR 循环」命名在官方架构页未出现（循环在 `conversation_loop.py`/`turn_*.py`），课程正文避免使用未经官方确认的 TAOR 缩写 | — | 对照 |

## 4. Claude Code —— 七种指令载体（官方博客，A 级）

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| CC-1 | 官方博客《Steering Claude Code》（2026-06-18）列**七种**：CLAUDE.md / rules（`.claude/rules/`，支持 `paths` frontmatter 路径域）/ skills / subagents / hooks / output styles / `append-system-prompt` flag。核心权衡 = 每种的「上下文成本 vs 权威性」；三维度 = 何时加载、compaction 后是否保留、权威性 | A | claude.com/blog/steering-claude-code-*（`raw/06-01`） |
| CC-2 | 各载体加载时机：CLAUDE.md 会话开始加载、全程保留、compaction 后重读（建议 ≤200 行）；skills 只载名称+描述、调用时载全文；subagents body 进**独立隔离上下文**、只回传最终消息、最多嵌套 5 层；hooks 挂生命周期事件（command/HTTP/mcp_tool/prompt/agent 五类）、完全绕过 compaction、`PreToolUse` exit 2 阻断；output styles 注入 system prompt、**永不压缩**、权威性最高、⚠️ 默认**替换**系统提示（除非 `keep-coding-instructions: true`） | A | `raw/06-01` |
| CC-3 | 官方反模式表：CLAUDE.md 写「Every time X always Y」→ 改用 hooks；「Never do this」→ hooks + permissions + managed settings；30 行流程 → skills；API 规则未加 paths → path-scoped rule；个人偏好进项目 CLAUDE.md → 用户级文件 | A | `raw/06-01` |
| CC-4 | 企业机制：组织级 CLAUDE.md 可经 MDM/config management 集中部署且不可被个人排除；skills/subagents/hooks/output styles 可打包为 plugin 分发 | A | `raw/06-01` |
| CC-5 | 与 02 批 permissions 文档（`raw/02-02-*`）合并使用：permissions 页讲运行时权限链，steering 博客讲指令注入体系；两者正交，课程 Claude Code 章按「权限运行时 + 指令载体 + hooks 确定性」三层组织 | — | 综合 |

## 5. 批次 06 覆盖核对与剩余待补

- 已完成 `03-open-items.md` #4（Codex 官方 config/sandbox → CX-1~CX-7）、#5（steering 博客 → CC-1~CC-4；hooks-guide 事件细节未单独抓，但博客已含 hooks 五类与 PreToolUse）、#6（DSH 官方仓库 → DS-1~DS-5）、#7（Hermes 架构与安全 → HE-1~HE-6；/security 子页未单独抓，DM pairing/审批细节已在架构页与根页）。
- 仍未完成：#1 Harness Lens 字段字典、#2 FeatureBench 事故文档全文（15× 结论）、#3 榜单 Space/CHANGELOG 原文、#10 Composio 原始 thread、#11 arXiv 2610.00917、#12 DSH 上榜原始公告、#13 super-agent 原型。→ 批次 07 处理 #1/#2/#11（方法论锚点），其余降级为「写课时如需再查」。
