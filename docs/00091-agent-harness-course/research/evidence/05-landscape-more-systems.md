# 证据台账 05 · 扩展系统事实（Grok Build / Kilo / OpenCode 2.0 / Letta / OpenHands）

> 批次 05（2026-11-15 19:45 GMT+8 检索并落盘）。原文分片见 `../raw/05-*.md`。
> 级别：**A** = 官方页面/仓库原文；**B** = 可信第三方实测或详细转述；**C** = 仅搜索摘要、未读原文。

## 1. Grok Build（xAI / SpaceXAI）—— 系统 G

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| G-1 | xAI 官方公告「Introducing Grok Build」：终端编码 agent，early beta 面向 SuperGrok 与 X Premium Plus 订阅者；plan mode（批准前可评论/重写计划步骤）；批准后每处变更显示为 diff；`AGENTS.md`、plugins、hooks、skills、MCP servers 开箱兼容 | A | x.ai/news/grok-build-cli（`raw/05-01` §1） |
| G-2 | GitHub 仓库 `xai-org/grok-build`：Rust 源码；全屏鼠标可交互 TUI + headless（脚本/CI）+ ACP 嵌入编辑器三种形态；27.6k stars / 5.2k forks（快照 2026-11-15）；Apache-2.0；从 SpaceXAI monorepo 周期性同步（`SOURCE_REV` 记录 commit SHA） | A | github.com/xai-org/grok-build（`raw/05-01` §4） |
| G-3 | 第三方目录：early beta 2026-05-25 公告、2026-07-15 开源、2026-08-07 v1.0.0；截至核查时最新 1.0.70（2026-10-23）；auto mode 改为「shell 命令每一段都匹配 allowlist 才免审执行」；worktree 可复用主 checkout 的已保存审批；发布频率一周数次，自动化需 pin 版本；带 OS sandbox、plan mode、subagents、worktrees、MCP、skills、hooks、headless JSON 输出、ACP server | B | ithub.directory/ai-coding-assistants/grok-build（`raw/05-01` §5） |
| G-4 | 第三方文章：全屏鼠标 TUI（对比「聊天框+滚动文本」形态）；Rust 实现（区别于 Node/Python 系）；2.6 万星（截至 2026-08-28）；依赖无（预编译二进制，三平台）；首次启动浏览器登录 xAI 账号 | B | blog.csdn.net/Number241/article/details/164147106（`raw/05-01` §3） |
| G-5 | ⚠️ 检索陷阱：`raw/05-01` §4 仓库 About 一行出现「SpaceXAI」措辞（G-3/G-4 同样出现），官方新闻页自称 xAI。写作时以 x.ai 官方页自称「xAI」为准，仓库措辞存疑、不引用 | — | 对照 §1/§4 |

## 2. Kilo Code —— 系统 K

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| K-1 | 官网：开源编码 agent，VS Code / JetBrains / CLI / Cloud 多端；Apache-2.0；「最流行开源编码 agent」（官方自述）；5 个 agent modes（Code/Architect/Debug/Ask/Custom）；KiloClaw = 托管版 OpenClaw（Telegram/Discord/Slack 接入、定时任务、500+ 模型经 Kilo Gateway 零加价） | A | kilo.ai（`raw/05-06` §1） |
| K-2 | VS Code Marketplace：1,725,485 installs；行内补全 + 浏览器自动化 + 自动重构；MCP Server Marketplace；500+ 模型（GPT-5.5、Claude Opus 4.7、Claude Sonnet 4.6、Gemini 3.1 Pro Preview 等，与 provider 费率一致定价） | A | kilo.ai/vscode-marketplace（`raw/05-06` §2） |
| K-3 | 官方博客：2026-02-06 起 Gateway 与 Cloud 后端（Session 管理、Cloud Agents、Code Reviewer、Kilo for Slack）source-available；唯一保持私有的是滥用防护系统；VS Code 扩展/JetBrains/CLI 的 Apache-2.0 **不可撤销**；co-founder Sid Sijbrandij（GitLab 联创、Open Core Ventures） | A | blog.kilo.ai/p/kilo-cloud-source-available（`raw/05-06` §3） |
| K-4 | 中文评测：GitHub 1.95 万星；VS Code/JetBrains 扩展 Apache-2.0、CLI **MIT**；60+ provider / 500+ 模型 + Ollama/LM Studio 本地推理；MCP 有专门概述与用法文档；定价三档（免费+BYOK / 团队 $15/人/月 / 企业 $150/人/月，SSO/OIDC/SCIM/审计日志），推理费零加价 | B | kilo.org.cn/articles/open-source-cursor-alternatives（`raw/05-06` §4，中文站但引官方文档） |
| K-5 | 官网「开放」页：开源组件清单（kilocode/src、kilo-jetbrains、kilocode/cli）+ 网关/云后端源码已开放（不含滥用防护）；承诺「今天开源的明天依然开源」；1.9 万+ stars、300 万+ 开发者、40T+ token 处理量（官方自述快照） | A | kilo.org.cn/open（`raw/05-06` §5） |
| K-6 | ⚠️ 第一次检索返回 `[SENSITIVE_CONTENT_UNAVAILABLE]`（`raw/05-02`，内容被安全检查扣留），换英文关键词重查成功（`raw/05-06`）。写作引用一律走 K-1~K-5 的官方/评测链接 | — | `raw/05-02` |

## 3. OpenCode 2.0（Anomaly）—— 系统 O（更新既有事实）

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| O-1 | 官方发布说明：2.0 为 major overhaul；单一后台常驻服务，TUI/Web/桌面共享同一进程；重写 API + `@opencode/client`（含 vanilla JS 与 Effect 客户端）；`@opencode/codemode` 自研极简 JS 解释器把 MCP/OpenAPI 转成脚本函数，单轮往返组合多工具调用；所有 MCP 默认启用 Code Mode（官方称可接 1000 台服务器而上下文膨胀极小）；后台 subagent + 后台 shell；80+ 功能改为内部插件 + 热重载；TUI 插件转稳定 | A | anoma.ly/notes/opencode-2-0（`raw/05-03` §1） |
| O-2 | 发布日期 2026-10-12（aicoder 双语新闻 + InfoQ 中文报道一致）；此时 21.4 万星 / 近 3 万 fork；三个月 Beta 后 2.x 成主线 | B | aicoder.com/news/news-20261012-*、mp.weixin.qq.com InfoQ（`raw/05-03` §2/§3/§4） |
| O-3 | 破坏性变更三项：1.x 插件全部失效；服务端 API 重写；`tui.json` → 全局 `cli.json`（自动迁移）。另两项移除：**不再启动 LSP**（无 LSP 工具/诊断，官方建议改用 lint/类型检查器）；**只读 AGENTS.md 不再读 CLAUDE.md** | A/B | 官方说明（O-1）+ InfoQ 详细转述（`raw/05-03` §2） |
| O-4 | 运行时从 Bun → Node.js（Windows 稳定性、Electron 嵌入、Deno 探索），桌面从 Tauri → Electron；背景：2026 年 1 月 Anthropic 封禁第三方订阅凭据后承接「难民潮」走红；小米 MiMo Code 等基于 1.x 的分叉面临同步重构难题 | B | InfoQ（`raw/05-03` §2） |
| O-5 | 后台 subagent `background: true` 默认嵌套深度 1；后台 shell 无默认超时；Ctrl+B 把前台任务挪后台；`codemode: false` 可关 Code Mode；升级命令 `opencode upgrade --major` | B | aicoder.com（`raw/05-03` §3/§4，引官方 Tools/MCP 文档） |
| O-6 | 与既有 F-A1/F-A4 的关系：2.0 官方 docs 入口为 opencode.ai/v2/docs（aicoder 给出 tools/mcp-servers/migrate-v1 子页链接）；「状态机+Runner」的 1.x 架构描述仍属掘金二手（F-A1），2.0 后需注明版本界限 | — | 综合 |

## 4. Letta Code —— 系统 L

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| L-1 | 官方博客：memory-first coding agent；每个会话绑定持久化 agent（跨会话学习）而非独立会话；自称 Terminal-Bench 上 **#1 model-agnostic OSS harness**、与厂商自家 harness（Claude Code/Gemini CLI/Codex CLI）表现相当；显著超越前任 model-agnostic 首名 Terminus 2；`/init` 触发对代码库的深研并重写系统提示（memory blocks）；`/remember` 显式触发反思；技能学习（skills = .md 文件，可进 git、可被其他 agent 引用）；`/search` 命令 + Letta API 对消息做向量/全文/混合检索 | A | letta.one/blog/letta-code（`raw/05-04` §1） |
| L-2 | Terminal-Bench 42.5%（#1 开源、总榜第 4、Claude 4 Sonnet 档第 2）；agent 实现不足 200 行（Letta stateful agents SDK）；分层记忆 = Core Memory（context 内、可编辑 blocks）+ Recall Memory（自动落盘可检索对话）+ Archival Memory（向量/图库长期知识）；40k token 阈值递归摘要压缩；出自 UC Berkeley MemGPT 项目 | A/B | letta.com/blog/terminal-bench（官方）+ agentmarketcap.ai 详解（`raw/05-04` §2/§5） |
| L-3 | GitHub：research preview 状态自述；Apache-2.0；CLI harness 包着 stateful Letta Agents API；模型无关（Sonnet 4.5 / GPT-5 / Gemini 2.5 / GLM-4.6 等）；层级记忆配置（全局 ~/.letta/settings.json 的 persona/human blocks + 项目 .letta/settings.local.json 自动恢复 agent + 项目共享 settings.json）；技能从 `.skills/` 目录的 SKILL.MD 自动发现（frontmatter name/description/category/tags） | A | GitHub README（`raw/05-04` §3） |
| L-4 | ⚠️ 仓库镜像陷阱：搜索结果 §3 的 URL 是 `git-hub.com/actuallyrizzn/letta-code`（镜像站，非 letta-ai 官方仓库）；引用时用 letta.one / letta.com 官方域或核实 `letta-ai` 组织下的真实仓库 | — | `raw/05-04` §3 |
| L-5 | agentmarketcap 文章提供与 Claude Code/Cursor 对比叙事（stateless agent 问题、团队 10 会话零共享记忆）；属于第三方分析观点，写作时标注为观点而非事实 | B | `raw/05-04` §5 |

## 5. OpenHands —— 系统 H2

| 编号 | 事实 | 级别 | 来源 |
|---|---|---|---|
| H2-1 | 官网定位已转变：开源 AI coding agent **平台**；automation 触发（GitHub/Slack/Jira/Linear/定时）；多后端支持跑 Claude Code、Codex、Gemini CLI、OpenHands 或自研 stack；支持闭源与开源权重模型（Kimi/DeepSeek/Qwen），本地/云/VPC | A | openhands.dev（`raw/05-05` §1） |
| H2-2 | 官方对比文：企业选型维度表 —— OpenHands（MIT、VPC/air-gapped、100+ providers）vs OpenCode（MIT、75+ providers）vs Cline（Apache-2.0、30+）vs Aider（Apache-2.0）等；行业背景：Continue.dev 被 Cursor 收购、Roo Code 2026-05 归档；Gemini CLI 免费档 2026-06-18 退役（个人用户转 Antigravity CLI） | A | openhands.dev/blog/open-source-ai-coding-agents、/blog/best-ai-for-coding（`raw/05-05` §2/§4） |
| H2-3 | 第三方深评：前身 OpenDevin（2024 末）→ 2025 改名；All Hands AI → 仓库迁至 `OpenHands/OpenHands`；82.2k stars / 10.5k forks / 7082 commits；**License 混合：MIT + enterprise/ 目录独立许可（open-core）**，商用前必须读 enterprise/LICENSE；转型「Agent Control Center」：跑自家 agent + ACP 兼容 agent（Claude Code/Codex/Gemini）；双轨发布 OSS 1.11.0（2026-07-09）/ Cloud 1.47.1（2026-07-21）；组件拆分迁移中（software-agent-sdk / agent-canvas / automation / openhands-cloud，issue #14841）；Agent Server REST API 单端口多 agent；Python(agent/server) + TS(frontend)；弱点：默认 npm install 路径无 sandbox | B | github.com/gameworkerkim/vibe-investing TechDoc（`raw/05-05` §3） |
| H2-4 | opensourcesoftware.ai 摘要：Agent Canvas 浏览器界面；一个会话一历史、可从任意消息分支；BYO model（litellm 任意模型 + 自定义 base URL）；Automation Server 定时/事件触发；MIT（无商业目录），Cloud/Enterprise 为独立付费服务；默认 agent 可访问整台机器（官方文档要求防火墙 + 强 API key + 共享服务器开 public mode） | B | opensourcesoftware.ai/projects/openhands（`raw/05-05` §5） |
| H2-5 | ⚠️ License 陷阱：官网宣传「MIT」，但 H2-3 指出仓库存在 enterprise/ 独立许可目录；而 opensourcesoftware.ai 说「MIT licensed with no commercial folder」（两说冲突，可能对应不同时点）。课程引用时写「核心 MIT（open-core，企业目录许可另计），以仓库 LICENSE 为准」并给仓库链接 | — | 对照 §2/§3/§4 |

## 6. 批次 05 覆盖核对

- 系统 G（Grok Build）、K（Kilo）、O（OpenCode 2.0）、L（Letta）、H2（OpenHands）各有 ≥1 条 A 级事实。
- `03-open-items.md` #14「扩章候选」已全部有官方一手资料：mini-swe-agent / Kimi / Qwen / OpenClaw / Cline（批次 04）+ 本批 5 个。
- 仍未完成（继承自 `03-open-items.md`）：#1 Harness Lens 字段字典（SPA 外壳）、#2 FeatureBench 事故文档全文、#3 榜单 Space/CHANGELOG 原文、#4 Codex 官方 config 页、#5 Claude Code steering 博客 + hooks-guide、#6 DSH 官方仓库、#7 Hermes 官方 docs 子页、#10 Composio 原始 thread、#11 arXiv 2610.00917、#12 DSH 上榜原始公告、#13 super-agent 原型。
