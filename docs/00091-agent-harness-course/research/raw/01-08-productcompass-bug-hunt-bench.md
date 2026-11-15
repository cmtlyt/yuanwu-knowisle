# 批次 01 · 第 08 条 · WebFetch

- 暂存文件：`research/raw/01-08-productcompass-bug-hunt-bench.md`
- 来源：会话记录 `9471105c-…jsonl` 中该工具调用的原始返回文本，机械导出、未经改写
- 核实日期：2026-11-15
- 可信级别：页面抽取（模型对原文的提取，可能含摘要误差）
- 调用参数：{   "url": "https://www.productcompass.pm/p/deepseek-harness-vs-claude-code",   "prompt": "提取 DeepSeek Harness 与其他 harness（Claude Code / OpenCode / Codex CLI / Hermes Agent / Pi / Grok Build / Kilo Code）的实测对比数据：分数、effort 档位、每次运行成本、耗时、许可证、模型接入方式，以及测试方法说明。保留具体数字与出处。" }

---
**返回原文**

````text
## 简要结论

已提取到同一模型 **DeepSeek V4.1 Flash 1017（DeepSeek's `deepseek-flash`）** 在 **Bug Hunt Bench** 上、九个 harness 的 **89 次有效运行** 对比。核心结果是：

- **DeepSeek Harness 在 max effort 得分最高**：`42.7 / 105`，7 runs，62 分钟，`$1.84 / run`。
- **Claude Code**：`39.1 / 105`，7 runs，58 分钟，`$1.01 / run`；差距 `3.6` 分，但 **p = 0.14**，文中判定为 **run-to-run noise**。
- **Pi**：max `42.2`，`$0.83 / run`， cheapest at every effort level，并被文中称为 **score per dollar** 领先者。
- **DeepSeek Harness 成本约为 Claude Code 的 1.8 倍**，且读/写 token 更多。
- 文中明确给出的许可证：DeepSeek Harness、OpenCode、Hermes Agent、Pi 为 MIT；Codex CLI 为 Apache-2.0；Claude Code 为 proprietary；**Grok Build CLI 与 Kilo Code 未给出许可证**。
- 接入方式：DeepSeek Harness 与 Claude Code 走 **DeepSeek's Anthropic-compatible endpoint**；Pi / OpenCode / OpenCode 2.0 / Hermes Agent / Kilo Code / Grok Build CLI 走 **OpenAI-compatible endpoint**；Codex CLI 走 **Responses endpoint**。

> **原文短结论**："The short answer: the gap is inside run-to-run noise, and on the same model DeepSeek Harness cost about 1.8 times as much per run."

---

## 出处代号与文中日期

文中给出的日期与读档信息：

- **Last updated: November 5, 2026.**
- 图注原文：`DeepSeek V4.1 Flash 1017 on Bug Hunt Bench in nine harnesses, October 17-20, 2026. Every number is also in the text below.`
- 功能对比出处：`From each vendor's own pages, read November 5, 2026.`
- `DeepSeek's own Claude Code guide (read November 5, 2026)`
- `Remote Control docs, read November 5, 2026`

为便于核对，下文使用这些出处代号；完整链接见文末「完整出处清单」：

- **[结果-方法]**：《The Bench: One Model, Nine Harnesses》《At max/high/low effort》《What It Costs to Run the Same Model》；核验链接为 [bughunt.productcompass.pm](https://bughunt.productcompass.pm/)、[runs.csv](https://github.com/phuryn/bug-hunt-bench/blob/main/results/runs.csv)、[my October 20 write-up](https://x.com/PawelHuryn/status/2112571119412646370)。
- **[统计]**：《Is the Gap Real?》；并引用 [my October 18 post](https://x.com/PawelHuryn/status/2111730046691836064) 中的 `"2-3 points on average"`。
- **[接入]**：《How Claude Code Ran on a DeepSeek Model》；[DeepSeek's own Claude Code guide](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code)；[Remote Control docs](https://code.claude.com/docs/en/remote-control)。
- **[特性]**：《DeepSeek Harness vs Claude Code, Feature by Feature》；链接含 [GitHub](https://github.com/deepseek-ai/deepseek-harness)、[providers guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)、[product page](https://www.deepseek.com/en/harness/)、[overview](https://code.claude.com/docs/en/overview)、[plugins docs](https://code.claude.com/docs/en/plugins)、[DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing)、[Claude pricing](https://claude.com/pricing)。
- **[其他]**：《OpenCode, Codex CLI, Hermes and Pi on the Same Model》；链接含 [Codex](https://api-docs.deepseek.com/quick_start/agent_integrations/codex)、[OpenCode](https://api-docs.deepseek.com/quick_start/agent_integrations/opencode)、[Hermes](https://api-docs.deepseek.com/quick_start/agent_integrations/hermes)。
- **[FAQ]**：《FAQ》。

---

## 实测结果总表：分数、effort 档位、成本、耗时

分数均为 **planted bugs fixed of 105, per run**。成本均为 **per run at DeepSeek's off-peak rates**。

### At max effort

| harness | effort | 分数 | 运行数 / 范围 | 耗时 | 每次运行成本 | 文内出处 / 核验 |
|---|---:|---:|---|---:|---:|---|
| **DeepSeek Harness** | max | **42.7 / 105** | `over 7 runs (worst 39, best 47)` | **62 分钟** | **$1.84** | 《At max effort》；[结果-方法]，公开 board / runs.csv |
| **Pi** | max | **42.2 / 105** | `over 5 runs (41 to 44)` | **54 分钟** | **$0.83** | 《At max effort》；[结果-方法] |
| **Claude Code** | max | **39.1 / 105** | `over 7 runs (34 to 46)` | **58 分钟** | **$1.01** | 《At max effort》；[结果-方法] |
| **OpenCode** | max | **37.6 / 105** | `over 5 runs (35 to 40)` | **56 分钟** | **$0.96** | 《At max effort》；[结果-方法] |

### At high effort

> 文中说明：`Five runs per row at high and low.` 因此下表 high effort 每行均为 5 runs。

| harness | effort | 分数 / 范围 | 耗时 | 每次运行成本 | 备注 / 文内出处 |
|---|---:|---:|---:|---:|---|
| **Pi** | high | **40.4 (38 to 44)** | **48 分钟** | **$0.64** | 《At high effort》；[结果-方法] |
| **Grok Build CLI** | high | **40.4 (34 to 44)** | **93 分钟** | **$1.36** | 《At high effort》；`DeepSeek's default, high, applied`；[结果-方法] |
| **DeepSeek Harness** | high | **39.2 (32 to 45)** | **53 分钟** | **$1.27** | 《At high effort》；[结果-方法] |
| **OpenCode 2.0** | high | **38.6 (35 to 43)** | **50 分钟** | **$1.04** | 补充行；`Anomaly's rebuilt OpenCode 2.0`；[结果-方法] / [其他] |
| **OpenCode** | high | **36.6 (28 to 43)** | **42 分钟** | **$0.79** | 《At high effort》；[结果-方法] |
| **Claude Code** | high | **36.4 (30 to 42)** | **54 分钟** | **$0.82** | 《At high effort》；[结果-方法] |
| **Codex CLI** | high | **33.2 (30 to 35)** | **232 分钟** | **$3.97** | `Four of its five runs hit the bench's three-hour limit on one repository and were scored as they stood, so its score is a floor and its minutes are mostly that limit.`；[结果-方法] / [FAQ] |
| **Hermes Agent** | high | **32.0 (24 to 38)** | **70 分钟** | **$0.97** | 《At high effort》；[结果-方法] / [其他] |
| **Kilo Code** | high | **31.8 (24 to 35)** | **92 分钟** | **$1.07** | 《At high effort》；[结果-方法] / [其他] |

### At low effort

| harness | effort | 分数 / 范围 | 耗时 | 每次运行成本 | 文内出处 / 核验 |
|---|---:|---:|---:|---:|---|
| **DeepSeek Harness** | low | **34.8 (34 to 36)** | **34 分钟** | **$1.06** | 《At low effort》；[结果-方法] |
| **Claude Code** | low | **34.4 (32 to 40)** | **44 分钟** | **$0.71** | 《At low effort》；[结果-方法] |
| **Pi** | low | **33.8 (25 to 38)** | **33 分钟** | **$0.46** | 《At low effort》；[结果-方法] |
| **OpenCode** | low | **32.8 (27 to 38)** | **41 分钟** | **$0.66** | 《At low effort》；[结果-方法] |

### 版本、运行数与成本口径

- **Versions**: `dsh 0.2.1-rc.2`, `Claude Code 2.1.302`, `Pi (pi-coding-agent) 1.3.0`, `OpenCode 1.19.3`, `OpenCode 2.0.32`, `Codex CLI 0.159.0`, `Hermes Agent 0.22.2`, `Kilo Code 7.8.12`, `Grok Build CLI 1.0.62`。出处：《The Bench: One Model, Nine Harnesses》末段。
- **Minutes are wall clock on a shared machine, where runs often ran side by side.**
- **Costs are per run at DeepSeek's off-peak rates.**
- `For the four harnesses on the public board (DeepSeek Harness, Claude Code, Pi and OpenCode 1.19.3), the means, minutes and costs are the board's own figures, so you can check them against every run in its runs.csv.`
- `For the other five, cost is DeepSeek's list price on DeepSeek's own token counts, which matched the account balance within about 1%; they ran in the same wave and are in my October 20 write-up.`
- `At DeepSeek's peak hours (01:00-04:00 and 06:00-10:00 UTC on weekdays) the same runs cost twice as much.`
- 有效运行数：max `7+5+7+5 = 24`，high `9 × 5 = 45`，low `4 × 5 = 20`，合计 **89 clean runs**；文中原句：`The 89 runs and every mean here count clean runs only.`

---

## 统计显著性、差异方向与成本解释

### DeepSeek Harness vs Claude Code

| 项目 | 具体数字 / 结论 | 出处 |
|---|---|---|
| max effort 差距 | `3.6 points`；`42.7` vs `39.1` | 《Is the Gap Real?》；[统计] |
| 原始 7 次分数 | Claude Code：`34, 37, 45, 46, 35, 39 and 38`；DeepSeek Harness：`42, 41, 47, 47, 40, 43 and 39` | 《Is the Gap Real?》；[统计] |
| 重叠情况 | `Two Claude Code runs beat DeepSeek Harness's average.` | [统计] |
| exact permutation test | `a gap of 3.6 or more, either way, comes up 14% of the time (an exact permutation test, p = 0.14)` | [统计] |
| bootstrap | `95% range at −0.4 to +7.3 points` | [统计] |
| 结论 | `Seven runs a side cannot separate them.` | [统计] |
| 三个 effort 的方向 | DeepSeek Harness 领先 Claude Code：`0.4 points at low`, `2.8 at high`, `3.6 at max` | 《Is the Gap Real?》；[统计] |
| max 稳定性 | `a standard deviation of 3.2 points against 4.7`；`Its worst max run, 39, is level with Claude Code's max average of 39.1.` | [统计] |
| pooled test | `with a permutation test within each level, the edge is borderline (p = 0.09)`；`a consistent lean, not a proven gap.` | [统计] / [October 18 post] |
| 与 OpenCode 的显著差异 | `DeepSeek Harness and Pi both beat OpenCode outside the noise (p = 0.02 and p = 0.01)`；`every Pi run, 41 to 44, scored above OpenCode's best, 40.` | 《Is the Gap Real?》；[统计] |
| 设置差异 | `Claude Code ran with its subagent tool switched off, the bench's setting for every Claude Code row, while DeepSeek Harness ran with subagents on as shipped and launched 35 of them across its seven max runs. Pi has no subagents at all and scored 42.2, so subagents alone do not explain the gap.` | 《Is the Gap Real?》；[统计] |

### 成本、token 与 extras

- `At max effort DeepSeek Harness cost $1.84 a run and Claude Code $1.01: 1.8 times as much for 3.6 more planted bugs.`
- `Per run it sent 2.55 million uncached input tokens against Claude Code's 1.04 million and 316.5 million cached against 207.5 million, and got back 0.85 million output tokens against 0.41 million. Both served over 99% of their input from DeepSeek's cache.`
- `It also fixed about twice as many real bugs nobody planted: 44 a run against 23 at max. The bench shows those as extras and never adds them to the score.`
- `Pi was the cheapest harness at every effort level, at $0.83, $0.64 and $0.46 a run.`
- `Codex CLI was the outlier the other way: $3.97 a run at high, with 94.1% of its input cached against 98.7% or more for every other harness, and 232 minutes a run, mostly the three-hour limit it hit on four of five runs.`
- `This measures harnesses on one model, not the vendors' own models. For scale, on the same board and at API list price, Claude Code running Anthropic's Sonnet 5.5 at max effort scored 51.3 at $154.03 a run, and Codex CLI with OpenAI's GPT-6 Astra at max scored 45 at $33.03.`

以上均出自《What It Costs to Run the Same Model》；[结果-方法]。

---

## 许可证与产品状态

| harness | 开发方 / 许可证 | 产品状态 / 关键数字 | 出处 |
|---|---|---|---|
| **DeepSeek Harness** | **DeepSeek**；`open source under the MIT license` | `developer preview`；`All 37 of its GitHub releases are prereleases, the latest 0.2.2-rc.1 on November 4, 2026`；README 警告：`"THERE WILL BE COMPATIBILITY-BREAKING CHANGES."`；FAQ：`open source (MIT) and in developer preview` | [特性]：[GitHub]；[FAQ] |
| **Claude Code** | **Anthropic**；`proprietary`；`its repository's license reads "© Anthropic PBC. All rights reserved."` | `a released product whose native installs update themselves`；FAQ：`proprietary and runs on more surfaces` | [特性]；[FAQ] |
| **OpenCode** | **Anomaly, MIT** | FAQ：`both are open source under MIT`（指 DeepSeek Harness 与 OpenCode）；另：`OpenCode costs less per run ($0.96 against $1.84 at max)` | [其他]；[FAQ] |
| **OpenCode 2.0** | 文中称 `Anomaly's rebuilt OpenCode 2.0`；**未单独给出许可证** | high effort `38.6` | [其他]；[结果-方法] |
| **Codex CLI** | **OpenAI, Apache-2.0** | `33.2 at high`，`$3.97`，`232 minutes`；引用 FAQ：`not Codex on OpenAI's own models` | [其他]；[FAQ] |
| **Hermes Agent** | **Nous Research, MIT** | `32.0 at high (24 to 38), 70 minutes and $0.97 a run, through its built-in DeepSeek provider.` | [其他] |
| **Pi** | **earendil-works, MIT** | `a minimal agent with four tools (read, bash, edit, write) and no subagents. 42.2 at max for $0.83: 0.5 points behind DeepSeek Harness at under half the cost, and the cheapest at every effort level.` | [其他] |
| **Grok Build CLI** | **文中未给出许可证** | high effort `40.4 (34 to 44), 93 minutes, $1.36`；另有 `two Grok Build CLI` 运行因越界查找被作废重跑 | [结果-方法]；[其他] |
| **Kilo Code** | **文中未给出许可证** | high effort `31.8 (24 to 35), 92 minutes, $1.07` | [结果-方法]；[其他] |

> 说明：Grok Build CLI、Kilo Code、OpenCode 2.0 的许可证在提供内容中未明确写出，因此不按外部常识补充。

---

## 模型接入方式

### Bench 统一接入口径

《The Bench: One Model, Nine Harnesses》原文：

- `For this comparison the harness was the variable. The model was DeepSeek V4.1 Flash 1017 (DeepSeek's deepseek-flash), on DeepSeek's own API and one account, on the same two repositories, with web search and fetch off in every harness.`
- `Claude Code and DeepSeek Harness both called DeepSeek's Anthropic-compatible endpoint.`
- `Pi, OpenCode, OpenCode 2.0, Hermes Agent, Kilo Code and Grok Build CLI used its OpenAI-compatible endpoint, and Codex CLI its Responses endpoint.`
- `I read the effort on the wire for every request in eight of the nine harnesses. For Claude Code, an earlier capture shows its --effort flag becomes the request's effort field, and DeepSeek's endpoint validated the tier before every run.`
- `Grok Build CLI, for one, sends no effort to a custom model, so DeepSeek's default, high, applied.`

《OpenCode, Codex CLI, Hermes and Pi on the Same Model》还列出：`DeepSeek's API docs list nine agent tools under Agent Integrations, each with a setup guide: DeepSeek Harness, Claude Code, [Codex], [OpenCode], OpenClaw, [Hermes], Reasonix, WorkBuddy/CodeBuddy and Qoder.`

### 各 harness 接入方式汇总

| harness | Bench 中的 endpoint / route | vendor docs / 其他接入信息 | 出处 |
|---|---|---|---|
| **DeepSeek Harness** | `DeepSeek's Anthropic-compatible endpoint` | `DeepSeek's models first, plus built-in providers such as Anthropic, OpenAI, Kimi and GLM, and any custom endpoint`；`built in` subagents，且 `can hand tasks to Claude Code or Codex as subagents (installable bundles since 0.1.0-rc.8; a preview subagent_oar plugin for local Codex and Claude CLIs in 0.2.2-rc.1)` | [结果-方法]；[特性]：[providers guide] |
| **Claude Code** | `DeepSeek's Anthropic-compatible endpoint`；`https://api.deepseek.com/anthropic` | `Claude Code works with any server that speaks Anthropic's Messages API`；`Anthropic's Claude models`；`its CLI, VS Code and JetBrains surfaces also take third-party providers and compatible endpoints such as DeepSeek's`；`Remote Control is off`；bench 中 `--model deepseek-flash[1m] and --effort set per row` | [结果-方法]；[接入]；[特性]：[overview] |
| **OpenCode** | `OpenAI-compatible endpoint` | `OpenCode (Anomaly, MIT)`；`37.6 at max, 36.6 at high and 32.8 at low`；`level with Claude Code at high`；`At max its 5.1-point gap to DeepSeek Harness is outside the noise` | [结果-方法]；[其他]：[OpenCode] |
| **OpenCode 2.0** | `OpenAI-compatible endpoint` | `Anomaly's rebuilt OpenCode 2.0 scored 38.6 at high` | [结果-方法]；[其他] |
| **Codex CLI** | `its Responses endpoint` | `the route DeepSeek documents for Codex`；`not Codex on OpenAI's own models`；`Codex CLI (OpenAI, Apache-2.0)` | [结果-方法]；[其他]：[Codex]；[FAQ] |
| **Hermes Agent** | `OpenAI-compatible endpoint` | `through its built-in DeepSeek provider`；`Hermes Agent (Nous Research, MIT)` | [结果-方法]；[其他]：[Hermes] |
| **Pi** | `OpenAI-compatible endpoint` | `a minimal agent with four tools (read, bash, edit, write) and no subagents`；`Pi (earendil-works, MIT)` | [结果-方法]；[其他]；[统计] |
| **Grok Build CLI** | `OpenAI-compatible endpoint` | `sends no effort to a custom model, so DeepSeek's default, high, applied`；文中未给出许可证 | [结果-方法]；[其他] |
| **Kilo Code** | `OpenAI-compatible endpoint` | 文中未给出许可证；`Kilo Code: 31.8 at high` | [结果-方法]；[其他] |

### Claude Code 指向 DeepSeek 的具体变量

《How Claude Code Ran on a DeepSeek Model》给出，`DeepSeek's own Claude Code guide (read November 5, 2026)` 在 macOS / Linux 设置：

```bash
export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_AUTH_TOKEN=<your DeepSeek API key>
export ANTHROPIC_MODEL=deepseek-flash[1m]
export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-flash[1m]
export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-flash[1m]
export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-flash
export CLAUDE_CODE_SUBAGENT_MODEL=deepseek-flash
export CLAUDE_CODE_EFFORT_LEVEL=max
export CLAUDE_CODE_AUTO_COMPACT_WINDOW=786432
claude
```

- Windows：`set the same variables in PowerShell, as $env:ANTHROPIC_MODEL="deepseek-flash[1m]" and so on.`
- **Name the model**：`DeepSeek maps any claude-opus model name to DeepSeek V4 Pro, billed at V4 Pro's price, and claude-sonnet and claude-haiku names to deepseek-flash. Setting every tier to deepseek-flash, as above, keeps the session on V4.1 Flash.`
- **You pay DeepSeek**：`Usage bills to your DeepSeek account per token, at the prices further down, not to a Claude plan.`
- **Remote Control is off**：`Anthropic's Remote Control needs a claude.ai subscription sign-in and does not work when ANTHROPIC_BASE_URL points at a host other than api.anthropic.com.`
- `The bench used this endpoint with --model deepseek-flash[1m] and --effort set per row.`
- 《Feature by Feature》另给出：`They are not either-or: DeepSeek Harness can run Claude Code inside it, and Claude Code can run DeepSeek's models.`

---

## 费用口径与原文价格

- `DeepSeek Harness is free; you pay the model provider.`
- `On DeepSeek's API that is pay-as-you-go: deepseek-flash costs $0.15 per million input tokens on a cache miss, $0.003 on a cache hit and $0.60 per million output tokens off-peak, twice that at peak.`
- `Claude Code is included in Claude Pro ($20 a month, or $17 billed annually), Max ($100) and Ultra ($200), not in Free, or runs on an API key billed per token, with Opus 5.5 at $4 in and $20 out per million.`
- FAQ：`Both harnesses are free to run on a DeepSeek API key; you pay DeepSeek per token, at half price off-peak. Claude Code with Anthropic's models needs a Claude plan, from $17 a month billed annually ($20 monthly), or an Anthropic API key. Pi was cheaper than both, at $0.83 a run.`
- `At DeepSeek's peak hours (01:00-04:00 and 06:00-10:00 UTC on weekdays) the same runs cost twice as much.`
- `If score per dollar on this model is the question, Pi led. If you want DeepSeek's own stack, DeepSeek Harness scored at least level with Claude Code on this model, at a higher cost per run.`

出处：[特性]：[DeepSeek pricing]、[Claude pricing]；[FAQ]；[其他]。

---

## 测试方法说明

### Bench 设计

- `Bug Hunt Bench hides 105 real bugs in two production codebases, 45 in one and 60 in the other.`
- `An agent gets one round per codebase to find and fix what it can, a judge grades every diff blind against an answer key the agent never sees, and the score counts planted bugs only.`
- `The board, the method and the per-run receipts are public at bughunt.productcompass.pm.`
- `For this comparison the harness was the variable. The model was DeepSeek V4.1 Flash 1017 (DeepSeek's deepseek-flash), on DeepSeek's own API and one account, on the same two repositories, with web search and fetch off in every harness.`

出处：《The Bench: One Model, Nine Harnesses》；[结果-方法]。

### Effort 与运行清洗

- `I read the effort on the wire for every request in eight of the nine harnesses.`
- `For Claude Code, an earlier capture shows its --effort flag becomes the request's effort field, and DeepSeek's endpoint validated the tier before every run.`
- `Grok Build CLI, for one, sends no effort to a custom model, so DeepSeek's default, high, applied.`
- `Five runs were voided and rerun because they looked for the answers outside their own folder: two Claude Code, one DeepSeek Harness and two Grok Build CLI.`
- `The 89 runs and every mean here count clean runs only.`
- `An integrity warning was added to the task after the first three of those; Claude Code carried it on only 4 of 7 runs at max and 3 of 5 at high and at low, and its runs with and without it differ in no consistent direction.`

出处：《The Bench: One Model, Nine Harnesses》；[结果-方法]。

### 统计检验与设置差异

- `Not on its own. At max effort the gap is 3.6 points, and the runs overlap.`
- `shuffle those 14 scores between the two labels, and a gap of 3.6 or more, either way, comes up 14% of the time (an exact permutation test, p = 0.14).`
- `A bootstrap puts the gap's 95% range at −0.4 to +7.3 points.`
- `Seven runs a side cannot separate them.`
- `Pooled across the three effort levels, with a permutation test within each level, the edge is borderline (p = 0.09).`
- `Claude Code ran with its subagent tool switched off, the bench's setting for every Claude Code row, while DeepSeek Harness ran with subagents on as shipped and launched 35 of them across its seven max runs. Pi has no subagents at all and scored 42.2, so subagents alone do not explain the gap.`

出处：《Is the Gap Real?》；[统计]。

### 成本、时间与核验口径

- `Minutes are wall clock on a shared machine, where runs often ran side by side.`
- `Costs are per run at DeepSeek's off-peak rates.`
- `For the four harnesses on the public board (DeepSeek Harness, Claude Code, Pi and OpenCode 1.19.3), the means, minutes and costs are the board's own figures, so you can check them against every run in its runs.csv.`
- `For the other five, cost is DeepSeek's list price on DeepSeek's own token counts, which matched the account balance within about 1%; they ran in the same wave and are in my October 20 write-up.`

出处：《The Bench: One Model, Nine Harnesses》末段；[结果-方法]。

---

## 关键原文引用

- `"The short answer: the gap is inside run-to-run noise, and on the same model DeepSeek Harness cost about 1.8 times as much per run."`（文首《The short answer》）
- `"Not on its own. At max effort the gap is 3.6 points, and the runs overlap."`（《Is the Gap Real?》）
- `"Seven runs a side cannot separate them."`（《Is the Gap Real?》）
- `"a consistent lean, not a proven gap."`（《Is the Gap Real?》）
- `"Grok Build CLI, for one, sends no effort to a custom model, so DeepSeek's default, high, applied."`（《The Bench: One Model, Nine Harnesses》）
- `"If score per dollar on this model is the question, Pi led."`（《OpenCode, Codex CLI, Hermes and Pi on the Same Model》）
- `"They are not either-or: DeepSeek Harness can run Claude Code inside it, and Claude Code can run DeepSeek's models."`（《DeepSeek Harness vs Claude Code, Feature by Feature》）
- `"Everything is a plugin."`（《DeepSeek Harness vs Claude Code, Feature by Feature》）
- `"THERE WILL BE COMPATIBILITY-BREAKING CHANGES."`（《DeepSeek Harness vs Claude Code, Feature by Feature》）

---

## 完整出处清单

1. [bughunt.productcompass.pm](https://bughunt.productcompass.pm/) — `The board, the method and the per-run receipts are public`。
2. [runs.csv](https://github.com/phuryn/bug-hunt-bench/blob/main/results/runs.csv) — 公开 board 四项 harness 的逐 run 核验。
3. [my October 20 write-up](https://x.com/PawelHuryn/status/2112571119412646370) — `the other five` 成本与同一 wave 说明。
4. [my October 18 post](https://x.com/PawelHuryn/status/2111730046691836064) — `"2-3 points on average"` 来源。
5. [DeepSeek's own Claude Code guide](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code) — `read November 5, 2026`，含环境变量配置。
6. [Remote Control docs](https://code.claude.com/docs/en/remote-control) — `read November 5, 2026`。
7. [GitHub](https://github.com/deepseek-ai/deepseek-harness) — DeepSeek Harness MIT、37 个 prereleases、README 警告。
8. [providers guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md) — DeepSeek Harness 内置 providers / custom endpoint。
9. [product page](https://www.deepseek.com/en/harness/) — DeepSeek Harness 产品页。
10. [overview](https://code.claude.com/docs/en/overview) — Claude Code 运行面概览。
11. [plugins docs](https://code.claude.com/docs/en/plugins) — Claude Code plugins 文档。
12. [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing) — `deepseek-flash` 价格。
13. [Claude pricing](https://claude.com/pricing) — Claude Pro / Max / Ultra 价格。
14. [Codex](https://api-docs.deepseek.com/quick_start/agent_integrations/codex) — DeepSeek Agent Integrations 中 Codex 设置指南。
15. [OpenCode](https://api-docs.deepseek.com/quick_start/agent_integrations/opencode) — OpenCode 设置指南。
16. [Hermes](https://api-docs.deepseek.com/quick_start/agent_integrations/hermes) — Hermes 设置指南。
17. 文内《FAQ》 — 许可证、成本、OpenCode / Codex / Hermes 对比、Claude Code 使用 DeepSeek models、`DeepSeek Harness vs Claude Code` 结论汇总。
````
