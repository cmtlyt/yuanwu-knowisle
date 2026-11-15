# 证据台账 01 · 来源清单

> 分片自 `evidence-01.md` 按主题机械拆出，内容未改写。合并档已移除，本分片为权威副本。
> 原始返回全文见 `../raw/`，索引见 `../README.md`。

## 1. 来源清单

| ID | URL | 级别 | 用途 |
|---|---|---|---|
| S01 | https://www.productcompass.pm/p/deepseek-harness-vs-claude-code | B | Bug Hunt Bench：9 harness × 3 effort × 89 runs，含统计检验与逐项核验链接 |
| S02 | https://bughunt.productcompass.pm/ | B | 该 bench 公开 board |
| S03 | https://github.com/phuryn/bug-hunt-bench/blob/main/results/runs.csv | B | 逐 run 原始记录 |
| S04 | https://bokonon.ai/notes/2026-11-06-a-tie-a-tail-and-a-cap | B | 作者拉取 Harness Leaderboard 原始记录后独立复算，含噪声/翻转/作弊/输出上限分析 |
| S05 | https://pasqualepillitteri.it/en/news/30849/harness-leaderboard-coding-agent-harness-ranking | B | Leaderboard 方法论与排行表转述（198 任务、5,346 trials/cell、成本表） |
| S06 | https://badinfluence.news/items/gcbwpcoo4a6q9gy1a75897yzv | B | Joël Niklaus 发布公告的转载（28,849 trials / $4,746） |
| S07 | https://www.bestblogs.dev/en/status/2118863053001531676?entry=rss_article_item | B | 同一公告的转载，可交叉印证 S06 |
| S08 | https://huggingface.co/spaces/joelniklaus/harness-leaderboard/resolve/main/docs/incidents/2026-10-23-featurebench-answer-keys.md?download=true | A/B | 榜单官方事故文档：FeatureBench 联网取答案率按 harness 分解 |
| S09 | https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard | B | DSH 于 11/9 加入榜单、后台进程清理缺陷（**仅搜索摘要，全文待抓**） |
| S10 | https://code404zero.com/?p=502 | C | Composio 基准的二手转述（**全文待抓、原文待找**） |
| S11 | https://juejin.cn/post/7704502089116434432 | C | 中文「四个控制面」文章，内含六套 Harness 架构对照（二手，须与 A 级交叉验证） |
| S12 | https://pi.dev/ | A | Pi 官方产品页（**全文待抓**） |
| S13 | https://github.com/badlogic/pi-mono | A | Pi monorepo（**待抓 README**） |
| S14 | https://opencode.ai/ | A | OpenCode 官方首页 |
| S15 | https://opencode.ai/docs/zh-tw/permissions | A | OpenCode 官方权限文档 |
| S16 | https://code.claude.com/docs/en/permissions | A | Claude Code 官方权限文档（**全文待抓**） |
| S17 | https://code.claude.com/docs/en/hooks-guide | A | Claude Code hooks 生命周期清单 |
| S18 | https://code.claude.com/docs/en/agent-sdk/overview | A | Agent SDK：hooks / subagents / permission_mode |
| S19 | https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more | A | 官方博客：7 种指令载体的加载时机与压缩行为 |
| S20 | https://developers.openai.com/codex/learn/best-practices | A | Codex 官方最佳实践（prompt 四要素） |
| S21 | https://github.com/openai/codex | A | Codex CLI 官方仓库（**待抓，注意 S10 搜索结果是多个 fork 镜像，非官方**） |
| S22 | https://agents.md/ | A | AGENTS.md 开放格式官网 |
| S23 | https://deepseekharness.online/en/guide/architecture | A/B | DSH 架构文档 Chapter 16：插件树、四层配置、四种模式、append-only 日志 |
| S24 | https://github.com/deepseek-ai/deepseek-harness | A | DSH 官方仓库（**待抓 README / SAFETY.md**） |
| S25 | https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md | A | DSH providers 指南 |
| S26 | https://www.deepseek.com/en/harness/ | A | DSH 产品页 |
| S27 | https://hermes-ai.net/ | A/B | Hermes 官方站点（自述能力清单） |
| S28 | https://github.com/NousResearch/hermes-agent | A | Hermes 官方仓库（**待抓**） |
| S29 | https://hermes-agent.nousresearch.com/docs | A | Hermes 官方文档（**待抓**） |
| S30 | https://huggingface.co/spaces/harness-hub/harness-lens | A/B | Harness Lens：34 个 harness 的 prompt/tools/compaction 字典，每条结论带来源（**全文待抓**） |
| S31 | https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code | A | DeepSeek 官方：让 Claude Code 接 DeepSeek 模型的环境变量 |
| S32 | https://api-docs.deepseek.com/quick_start/pricing | A | deepseek-flash 价格 |
| S33 | https://news.aibase.com/zh/news/32001 | C | DSH Super-agent 原型报道（数字须以官方原文为准） |
| S34 | 微信公众号《DeepSeek 开源的 Harness 是什么?》（链接见 `raw-01.md` [03]-3） | C | DSH 架构/四种模式/时间线背景，细节丰富但属二手 |
| S35 | 微信公众号《DeepSeek Harness 开源:把 Agent 里"模型之外"的部分全做成插件》（链接见 `raw-01.md` [12]-3） | C | DSH 五个 profile、turn/step、工具三段管线，二手 |
| S36 | https://www.sohu.com/a/1096370734_130887 | C | DSH Creator Mode 报道（7 组演示、5 分 24 秒番茄钟） |
| S37 | https://github.com/deepseek-ai/dsh-superagent-prototype | A | Super-agent 研究原型（**待抓**） |
| S38 | https://ai.miraheze.org/wiki/Pi.dev | C | Pi 作者/许可/包结构的第三方百科 |
| S39 | http://pyshine.com/Pi-Mono-Full-Stack-AI-Agent-Toolkit | C | pi-mono 五个 npm 包结构 |
| S40 | https://corpusiq.github.io/corpusiq-docs/hermes/ecosystem | C | Hermes 生态目录（仓库、文档链接汇总） |

---
