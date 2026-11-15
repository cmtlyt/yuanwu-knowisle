# 证据台账 03 · 榜单更新与第三套基准（2026-11-15）

> 原文：`../raw/03-02-dsh-leaderboard-flaw.md`（aitecharchive，B 级转述但逐条附一手链接）、`../raw/03-04-composio-benchmark.md`（code404zero，C 级二手转述）。
> 本文件是批次 01 `02-benchmark-facts.md` 的**增量**，不改写旧分片。

## 1. DeepSeek Harness 加入 Harness Leaderboard 后的表现（B，aitecharchive 2026-11-13）

- **F-B18｜时间线与结论**：榜单由 Hugging Face 研究员 **Joël Niklaus** 运营，**2026-11-09** 加入 DSH，按其 [CHANGELOG](https://huggingface.co/spaces/joelniklaus/harness-leaderboard/blob/main/CHANGELOG.md) 于 **11-11** 排进所有视图。DSH 在**五个评估**（DeepSeek-V4.1-Flash 与 GLM-5.3-Flash 各 low/high effort + Flint）中**均与第一名统计并列**；「并列」的定义是配对差异的 95% bootstrap 区间跨零（引 [Niklaus 公告](https://x.com/joelniklaus/status/2120540528886603949)）。三模型均分下 **DeepSWE v1.1 第 2/10，落后 Hermes 0.5 分**；**Terminal-Bench 2.1 第 6/10**；GLM-5.3-Flash high effort **第 5/10 仍与领先者并列**。
- **F-B19｜后台进程清理缺陷（具体机制，最适合作为「适用领域」论据）**：DSH 在任务结束时**关闭自己启动的所有后台程序**；Terminal-Bench 有 **3 个任务**要求启动 server（例如模型推理 API），grader 在 agent 退出**之后**才验收该 server。DSH 在这批任务上 **2/36 次通过**，而 OpenCode / Pi / Hermes Agent **36/36 通过**。这 3 个任务每次评估让 DSH 损失 **1.5–1.7 分**，超过它在 DeepSeek-V4.1-Flash high effort 上与领先者的 **1.3 分**差距。文章定性：`a behavioural default, not a lack of capability`。
- **F-B20｜成本与口径**：DSH 在榜单上平均 **$0.53 / solved trial**；榜单列 DeepSeek-V4.1-Flash **$0.28/M 输入 + $1.12/M 输出**，GLM-5.3-Flash **$0.15/M 输入**；harness 本身免费，账单是模型 API。**注意**：这个 $0.53 与 `02-benchmark-facts.md` F-B4 的两组 `cost per solved task` 又是不同口径（solved trial 而非 solved task），不要混算。
- **F-B21｜评分清洗与测试条件**：DSH 有 **20 次 pass 被推翻**（例如抓取上游代码），按榜单方法判失败；DSH 跑测试时 **web search 关闭**，因为它的搜索需要测试机没有的 DeepSeek account key。榜单测试的 DSH 版本是 **0.2.2-rc.1**；仓库带 `SAFETY.md`，遥测默认本地（`DSH_TELEMETRY_MODE=FEEDBACK_ONLY` 仅提交反馈时共享日志，`FULL` 持续上传）。
- **F-B22｜安装与环境（来自仓库，文章转述）**：Node **^22.19 或 24+**，`npx @deepseek-ai/dsh web`，Web UI 在 `http://127.0.0.1:3080`，Settings → Models 里加 DeepSeek API key；源码构建需 pnpm 11（`pnpm install && pnpm run build && pnpm dsh web`）。架构 `everything as a plugin` on Cordis，profile 是 plugin bundles 的有序列表，用 `dsh plugin` 管理。仓库创建于 **2026-08-13**，文章核实快照 **279,576 stars / 34,424 forks**（作者自己提醒 `Popularity is not evidence of quality`）。
- **F-B23｜选型建议（文章观点，非榜单结论）**：`Choose DSH when the job is repository code changes on open models`（DeepSWE 那类工作）；`Choose Hermes Agent, Pi or OpenCode when servers, watchers or dev APIs must survive after the agent finishes`。文章也把「后台服务必须存活」的两条 workaround 明确标为**自己的分析、未实测**：① 用 `systemd` / `nohup` + `setsid` 让服务脱离 agent 进程组；② 在 prompt 里明写「结束时保持 server 运行」。
- **F-B24｜外部佐证（文章引用，需谨慎）**：引 [arXiv 2610.00917](https://arxiv.org/abs/2610.00917) 称对 **66 组 model×harness 配置**的研究发现模型排名会随 harness 反转 —— 在 Terminal-Bench 4 上 Claude 在 OpenHands 里领先 GPT **7.94 分**，在 PI 里落后 **30.16 分**；该文另称 DSH 是 GLM-5.3 与 DeepSeek V4 Pro 在该基准上的最佳 harness。另引 CodeMago 称榜单发布周「换 harness 最多带来 **24 分**摆动」。**这两项都是二手引用，未读原文，课程里只能作为「有待核实的旁证」，不能当结论。** 榜单 changelog 还列 **Cline** 为下一个待加入 harness，说明排名仍会变。

## 2. Composio 基准（C，code404zero 2026-09-19 转述）

- **F-B25｜设计**：Composio（AI agent 基础设施供应商）通过 **X thread** 发布；6 个 harness：**Kimi Code / Hermes Agent / Pi Agent / Claude Code / OpenCode / Codex**，统一模型 **Kimi K3**，同一批 **26 个真实多步编码与自动化任务**（含一个多中间步骤的 expense-audit 任务）。变量只有「给模型提供工具、文件访问与终端权限的软件层」。
- **F-B26｜完整结果表**（文章表格，逐行转录）：

  | harness | 解出 /26 | 每任务成本 | 每任务中位耗时 |
  |---|---:|---:|---:|
  | Kimi Code | **21** | $0.54 | 297.1 s |
  | Hermes Agent | **20** | **$0.39** | 179.5 s |
  | Pi Agent | **19** | $0.40 | **161.7 s** |
  | Claude Code | **19** | **$1.47** | **347.6 s** |
  | OpenCode | **18** | $0.51 | 271.1 s |
  | Codex | **17** | $0.47 | 236.2 s |

- **F-B27｜关键结论**：成功率 17/26 → 21/26；成本极差 **3.7–3.8×**（$0.39 → $1.47）；Pi 最快（161.7 s），Claude Code 两倍多（347.6 s）；**Codex 两次撞 900 秒上限**，而同一任务 Pi 用 446 s 解出。文章给团队四条建议：① 先换 harness 再换模型；② 短频任务用便宜快的（Pi / Hermes），复杂稀有且成功率要求高的用贵的（Kimi Code，重试更少）；③ 检查固定超时阈值；④ 算 **cost per successful task**，不是 cost per attempt。
- **F-B28｜文章里的三级引用（不要直接当事实）**：称另有 harness-bench 研究用 **106 任务 / 6 harness / 8 模型**，最佳配置 76.2 分、最差 52.4 分、差 23.8 分，约 **36% 失败源于 schema / output-contract 违规**；又称同一 Opus 4.5 模型在 Terminal-Bench 2.0 上 Letta Code 59.1%、Claude Code 41.6%。这些只标了 `[13]` `[14]` 而**未给可点击原文链接**，课程中不引用。
- **F-B29｜可信级别判定**：`code404zero.com` 是德语站点的英文版二手报道，明确说数据来自 Composio 的 X thread 但**没有给出该 thread 的 URL**；`What Was Tested` 与结果表数字自洽，但仍属 **C 级转述**。课程引用时必须写「据 Composio 基准的媒体报道」，并附该文章链接；若要升 B 级，须找到 Composio 原始 thread 或数据集（待补清单）。

## 3. 三套基准的口径对照（写 S7 横向章时直接用）

| 维度 | Harness Leaderboard | Bug Hunt Bench | Composio 基准 |
|---|---|---|---|
| 变量控制 | 固定 model / provider / effort，只换 harness，每任务 3 次 | 固定 DeepSeek V4.1 Flash 1017 / 账号 / 两仓库，关闭 web | 固定 Kimi K3 / 26 任务 |
| 分数含义 | 两基准任务解决率均值（%） | 105 个预置 bug 中修好数 | 26 个任务中解出数 |
| 规模 | 28,849 trials / $4,746（另有 DSH 加入后的新评估） | 89 clean runs | 6 harness × 26 任务（运行数未说明） |
| 成本口径 | `cost per solved task`（两种聚合）/ DSH 另报 `per solved trial` | `cost per run` | `cost per task` |
| 可复核性 | trajectory 公开 + 作者独立复算 | board + `runs.csv` 公开 | **仅二手文章**，原始 thread 未给链接 |
| 主要陷阱 | 头部并列、噪声、作弊、输出上限 | 7 runs 不足以分出 3.6 分差距、设置不等价 | 超时阈值、样本量小、来源链短 |
