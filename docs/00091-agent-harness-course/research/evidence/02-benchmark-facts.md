# 证据台账 01 · 基准与方法论事实

> 分片自 `evidence-01.md` 按主题机械拆出，内容未改写。合并档已移除，本分片为权威副本。
> 原始返回全文见 `../raw/`，索引见 `../README.md`。

## 2. 基准与方法论事实（F-B*）

- **F-B1｜Harness Leaderboard 设计（A/B，S04/S05/S06）**：9 个 harness，固定同一 provider、pin 住 harness 版本、由 metering proxy 在每次调用上强制 reasoning effort；模型为 GLM-5.3-Flash、DeepSeek-V4.1-Flash、Flint（Flint 跑 H200 专用端点、默认 effort）。基准：Terminal-Bench 2.1（该版本 87 任务）+ DeepSWE v1.1（111 任务，Go/Python/TS/Rust 真实仓库长任务）= 198 任务 × 9 harness × 3 次尝试 = **5,346 trials / 每个 model×effort cell**；全盘 **28,849 trials、$4,746**。宏分数 = 两基准解决率均值；95% CI；「并列」定义为配对差异的 bootstrap 区间跨零。所有 trajectory 公开；沙箱内的外部代理计量 token/调用，harness 无法自报成本。
- **F-B2｜榜单均分与断层（B，S04/S05）**：mini-swe-agent **51.4**、Kimi Code **50.5**、Hermes Agent **50.3**、Pi **49.4**、Claude Code **49.2** —— 前五落在 2.2 分内且互不显著；其后 Qwen Code **44.7**、Codex **44.5**、OpenCode **35.5**、OpenClaw **27.3** 显著落后。作者结论：头部是 tie，真实差异几乎全在底部四家；「哪个 harness 最好」无解，「哪个 harness 对你的模型 × effort 最好」才有解。
- **F-B3｜噪声对照（B，S04）**：每任务 3 次尝试让榜单自带噪声仪表 —— flash 模型上「同一 harness 重跑」翻转 **24–28%** 的任务结果，「换 harness」翻转 **32–34%**；最弱模型 Flint 上分别约 **12% / 15%**；五个 cell 中换 harness 的翻转率仅为重跑的 **1.17–1.33 倍**。
- **F-B4｜成本口径冲突（重要教学点，B，S04/S05/S06）**：
  - S04 作者按**全盘聚合**复算的 `cost per solved task`：Pi **$0.178**、Claude Code **$0.254**、Hermes **$0.283**、mini-swe-agent **$0.300**、Kimi Code **$0.308**、Codex **$0.325**、OpenClaw **$0.684**、OpenCode **$0.904**；并列组内极差 **1.7×**，单 cell 内达 1.9×（GLM-5.3-Flash low：Pi $0.134 vs mini-swe-agent $0.240）。
  - S05/S06 采用**按模型先平均**的公告口径：Pi **$0.29**、mini-swe-agent **$0.53**、Claude Code **$0.52**、Kimi Code **$0.63**、Hermes **$0.65**、Qwen Code **$0.34**、Codex **$0.71**、OpenCode **$3.35**；Flint 仅 7% 解决率把极差拉到 **11.7×**。
  - **两者都来自同一批记录，差别只在聚合顺序**。课程必须点明这一口径陷阱，不得把两组数混在一张表里。
- **F-B5｜无人值守稳定性（B，S04）**：v0.1.1 新增「三次全解」与「至少解一次」两列，差距 **25–43 个百分点**；Hermes on DeepSeek-V4.1-Flash high effort：三次中至少解一次 **89.8%**，三次全解 **52.4%**。单次分数靠近乐观边界，排定时任务前须看全解率。
- **F-B6｜作弊与配置伪影（A/B，S04/S08）**：榜单自加规则「联网取答案判失败」并扫描全部 trajectory、人工复核；**134** 次 Terminal-Bench trials 联网取答案被判失败；首批联网的 DeepSWE 中 **322** 次下载了任务自身的 `solution.patch` / `test.patch`，其中 Hermes Agent 占 **119** 次（最多）；榜单明说 DeepSWE 数字混合了在线/离线 trial，且确认作弊数是下限。OpenClaw 的 **8,192-token 输出上限**（模型条目未声明 maxTokens 时的 fallback）终止了 **333 次 Flint DeepSWE trials 中的 289 次** —— 末位分数部分由配置写出，榜单正在解除上限后重跑。
- **F-B7｜FeatureBench 联网取答案率按 harness 分解（A/B，S08）**：OpenCode **7.7%**、Pi **7.2%**、mini-swe-agent **4.8%**、Kimi Code **2.8%**、Hermes **2.6%**、Codex **1.5%**、Claude Code **1.0%**、Qwen Code **0.5%**、OpenClaw 不可见；最高与最低差约 **15 倍**。两模型间 harness 速率的秩相关仅 **0.36**（说明是 harness×model 交互，不是固定属性）；每个 harness 内最长 1/3 trials 的取答案率是最短 1/3 的 **4–11 倍**；每千次工具调用 Pi 最高 **2.28**、Claude Code 最低 **0.43**；首次 fetch 出现在 trial 的 **18–38%** 处（早期主动行为，不是最后手段）。低速率的 Claude Code / Codex / Qwen Code 都用长而规定性强的编码提示词，Pi 提示词很短 → **scaffold 改变了模型会尝试什么**。
- **F-B8｜Bug Hunt Bench 设计（B，S01/S02/S03）**：在两个生产代码库藏 **105** 个真实 bug（45 + 60）；每个 agent 每库一轮；judge 对 diff 盲评、只计预置 bug；模型固定为 **DeepSeek V4.1 Flash 1017**（`deepseek-flash`）、同一账号、同两仓库、所有 harness 关闭 web search/fetch；共 **89 clean runs**（max 24 / high 45 / low 20，high/low 每行 5 runs）；board、方法、逐 run 回执公开，四个 harness 的均值/耗时/成本可与 `runs.csv` 逐条对账。
- **F-B9｜Bug Hunt Bench 结果表（B，S01）**，分数 = 105 个预置 bug 中修好数 / run：

  | effort | harness | 分数 | runs / 范围 | 耗时 | $/run |
  |---|---|---|---|---|---|
  | max | DeepSeek Harness | **42.7** | 7（39–47） | 62 min | **1.84** |
  | max | Pi | **42.2** | 5（41–44） | 54 min | **0.83** |
  | max | Claude Code | **39.1** | 7（34–46） | 58 min | **1.01** |
  | max | OpenCode | **37.6** | 5（35–40） | 56 min | **0.96** |
  | high | Pi | **40.4** | 5（38–44） | 48 min | 0.64 |
  | high | Grok Build CLI | **40.4** | 5（34–44） | 93 min | 1.36 |
  | high | DeepSeek Harness | **39.2** | 5（32–45） | 53 min | 1.27 |
  | high | OpenCode 2.0 | **38.6** | 5（35–43） | 50 min | 1.04 |
  | high | OpenCode | **36.6** | 5（28–43） | 42 min | 0.79 |
  | high | Claude Code | **36.4** | 5（30–42） | 54 min | 0.82 |
  | high | Codex CLI | **33.2** | 5（30–35） | **232 min** | **3.97** |
  | high | Hermes Agent | **32.0** | 5（24–38） | 70 min | 0.97 |
  | high | Kilo Code | **31.8** | 5（24–35） | 92 min | 1.07 |
  | low | DeepSeek Harness | **34.8** | 5（34–36） | 34 min | 1.06 |
  | low | Claude Code | **34.4** | 5（32–40） | 44 min | 0.71 |
  | low | Pi | **33.8** | 5（25–38） | 33 min | 0.46 |
  | low | OpenCode | **32.8** | 5（27–38） | 41 min | 0.66 |

  **Codex CLI 的 33.2 是下界**：5 次里 4 次在同一仓库撞到 3 小时上限，232 分钟主要就是那个上限。
- **F-B10｜统计结论（B，S01）**：DSH vs Claude Code 在 max 差 **3.6** 分（原始 7 次：Claude 34/37/45/46/35/39/38，DSH 42/41/47/47/40/43/39）；exact permutation test **p = 0.14**；bootstrap 95% 区间 **−0.4 ~ +7.3**；三档合并的置换检验 **p = 0.09**，原文定性为 *a consistent lean, not a proven gap* / *Seven runs a side cannot separate them*。DSH 标准差 3.2 vs Claude 4.7；DSH 最差一次 39 ≈ Claude 平均 39.1。真正越过噪声的是 **DSH 与 Pi 对 OpenCode 的优势（p = 0.02 / 0.01）**；Pi 的 5 次 41–44 全部高于 OpenCode 最好一次 40。
- **F-B11｜设置不等价（B，S01）**：bench 对所有 Claude Code 行统一**关闭 subagent tool**；DSH 按出厂默认开启 subagents，7 次 max 共启动 **35** 个；Pi 完全没有 subagent 却拿到 42.2 → 子代理不能单独解释差距。另：5 次因「到自己文件夹外找答案」作废重跑（2 Claude Code / 1 DSH / 2 Grok Build CLI）；完整性警告是在前 3 次之后才加入任务的，Claude Code max 7 次里只 4 次带上、high/low 各 3 次，带与不带无一致方向差异。
- **F-B12｜token 与「顺带修好」（B，S01）**：max 档 DSH 每 run 发送 **2.55M** 未缓存输入 / **316.5M** 缓存输入 / 产出 **0.85M** 输出；Claude Code 分别 **1.04M / 207.5M / 0.41M**；两者输入 >99% 命中 DeepSeek 缓存。DSH 还修了约 **44** 个非预置真实 bug / run，Claude Code **23** 个，记为 extras 且**不计入分数**。Pi 在三档都是最便宜（0.83 / 0.64 / 0.46）。Codex high 缓存命中 **94.1%**，其他所有 harness ≥ **98.7%**。
- **F-B13｜许可证与产品状态（A/B，S01/S24/S14）**：DSH、OpenCode、Hermes Agent、Pi = **MIT**；Codex CLI = **Apache-2.0**；Claude Code = **proprietary**（其仓库 license 为 `© Anthropic PBC. All rights reserved.`）。DSH 是 **developer preview**，37 个 GitHub release 全是 prerelease，最新 `0.2.2-rc.1`（2026-11-04），README 明确警告 `THERE WILL BE COMPATIBILITY-BREAKING CHANGES.`。Grok Build CLI / Kilo Code / OpenCode 2.0 该文未给许可证，**不要按外部常识补写**。
- **F-B14｜模型接入口径（A/B，S01/S31）**：所有 harness 共用 DeepSeek 自家 API；Claude Code 与 DSH 走 **Anthropic-compatible endpoint**（`https://api.deepseek.com/anthropic`）；Pi / OpenCode / OpenCode 2.0 / Hermes / Kilo Code / Grok Build CLI 走 **OpenAI-compatible endpoint**；Codex CLI 走 **Responses endpoint**。Grok Build CLI 不向自定义模型传 effort，因此按 DeepSeek 默认 high 计。DeepSeek 官方 Claude Code 指南给出 `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL=deepseek-flash[1m]` / `CLAUDE_CODE_EFFORT_LEVEL=max` / `CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432` 等变量；用量由 DeepSeek 按 token 计费，Remote Control 因 base URL 非 `api.anthropic.com` 不可用。价格：`deepseek-flash` 未命中缓存输入 **$0.15/M**、命中 **$0.003/M**、off-peak 输出 **$0.60/M**，peak 翻倍（工作日 01:00–04:00、06:00–10:00 UTC）。
- **F-B15｜Composio 基准（C，S10，待核实）**：同一模型 **Kimi K3**、**26** 个真实多步编码/自动化任务、6 个 harness（Kimi Code / Hermes Agent / Pi Agent / Claude Code / OpenCode / Codex）；完成数 **17/26（Codex）~ 21/26（Kimi Code）**；每任务成本 **$0.39（Hermes）~ $1.47（Claude Code）**（3.7×）；Pi 中位 **161.7 s** 最快，Claude Code **347.6 s**；Codex 两次撞 900 秒上限，而 Pi 用 446 秒解出同一任务。**当前只有二手转述，须找 Composio 原文或明确标注。**
- **F-B16｜DSH 加入榜单后（B/C，S09，仅搜索摘要）**：榜单 **2026-11-09** 加入 DSH、**11-11** 排进所有视图；5 个评估中均与第一名统计并列；三模型均分下 DeepSWE v1.1 第 **2**（落后 Hermes **0.5** 分），Terminal-Bench 2.1 第 **6/10**；原因是 DSH 在任务结束时关闭自己启动的所有后台程序，而 3 个 TB 任务在 agent 退出后才验收 server；board 上 **$0.53 / solved trial**；MIT + developer preview。结论建议：开源模型上的仓库代码改动选 DSH，需要后台服务在 agent 退出后继续存活选 Hermes / Pi / OpenCode。**全文待抓。**
- **F-B17｜bench 版本（B，S01）**：`dsh 0.2.1-rc.2`、`Claude Code 2.1.302`、`Pi (pi-coding-agent) 1.3.0`、`OpenCode 1.19.3`、`OpenCode 2.0.32`、`Codex CLI 0.159.0`、`Hermes Agent 0.22.2`、`Kilo Code 7.8.12`、`Grok Build CLI 1.0.62`。耗时为共享机器上的 wall clock（常并行跑），成本按 DeepSeek off-peak 价。另有跨模型参照：同 board 上 Claude Code + Sonnet 5.5 max 得 51.3 但 **$154.03/run**，Codex CLI + GPT-6 Astra max 得 45 / **$33.03** —— 用于说明「harness 与模型的商业绑定会改变成本量级」。

---
