# 批次 03 · WebFetch · https://code404zero.com/?p=502

- 核实日期：2026-11-15
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写
- 调用参数：{"url": "https://code404zero.com/?p=502", "prompt": "提取 Composio 对比基准的完整设置与结果：同一模型名称、26 个任务的类型、六个 harness 名单、每个 harness 的解出任务数 / 每任务成本 / 中位耗时、超时情况、以及文章列出的三条主要结论与其数据来源（是否给出原始 X thread 或仓库链接）。保留具体数字。"}
- callId：chatcmpl-tool-92ee6433c67896dc

---

**返回原文**

`````text
**标题**: AI Coding Agents Compared: Which Harness Wins in 2026?
**发布时间**: September 19, 2026

# AI Coding Agents Compared: Which Harness Delivers the Best Success Rate?

One model, six different outcomes: with the identical AI called Kimi K3, the success rate across 26 identical coding tasks ranged from 17 to 21 solved tasks, and costs varied by a factor of 3.8. That is the central finding of a recent benchmark test by AI agent provider Composio, which pitted six coding harnesses against each other. Anyone searching for an AI coding agent comparison today usually ends up asking which model is best. The study shows the real question is which execution environment, the so-called harness, was built around that model.

For developer teams working daily with autonomous coding assistants, this is an uncomfortable but valuable insight. Before expensively switching models, it is worth first looking at the framework that drives them.

## Table of Contents

01. [Key Takeaways](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#key-takeaways)
02. [What Was Tested: The Composio Benchmark in Detail](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#what-was-tested-the-composio-benchmark-in-detail)
03. [AI Coding Agents Compared: The Results in a Table](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#ai-coding-agents-compared-the-results-in-a-table)
04. [What Is a Harness? An Explanation for Beginners](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#what-is-a-harness-an-explanation-for-beginners)
05. [Why the Harness Matters More Than the Model](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#why-the-harness-matters-more-than-the-model)
06. [Codex and the 900-Second Limit: A Case Study](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#codex-and-the-900-second-limit-a-case-study)
07. [AI Coding Agents Compared: What It Means for Developer Teams](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#ai-coding-agents-compared-what-it-means-for-developer-teams)
08. [Context: The Broader Market in 2026](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#context-the-broader-market-in-2026)
09. [Conclusion](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#conclusion)
10. [References](https://code404zero.com/en/ai-coding-agents-compared-which-harness-delivers-the-best-success-rate/#references)

## Key Takeaways

- With an identical model (Kimi K3), the success rate ranged from 17/26 (Codex) to 21/26 (Kimi Code), purely due to the harness.
- Cost per task ranged from $0.39 (Hermes Agent) to $1.47 (Claude Code), a factor of 3.7.
- Pi Agent was fastest at a median 161.7 seconds per task, while Claude Code at 347.6 seconds was more than twice as slow.
- Codex twice hit the 900-second time limit on a task that Pi Agent solved in 446 seconds.
- For tool selection: test a harness switch before considering expensive model upgrades.

## What Was Tested: The Composio Benchmark in Detail

Provider Composio, which specializes in infrastructure for AI agents, published the comparison via an X thread. Six harnesses were tested: Kimi Code, Hermes Agent, Pi Agent, Claude Code, OpenCode, and Codex, each with the same underlying model, Kimi K3. All six combinations had to solve the same 26 agentic tasks: real, multi-step coding and automation workflows, including a complex expense-audit task with multiple intermediate steps.

![What Was Tested: The Composio Benchmark in Detail](https://zsxkvszxbhpwnvzxdydv.supabase.co/storage/v1/object/public/generated-images/kie/b97a39b7-f990-44fd-854f-aa21a49b3274/slot-1-1789817067815.webp)

The methodological core matters here: the model stayed constant. Only the software layer that gives the model tools, file access, and terminal permissions differed. This isolates the effect of the harness without model differences distorting the result. It is exactly this controlled test setup that makes the Composio comparison so informative for a well-founded AI coding agent comparison.

## AI Coding Agents Compared: The Results in a Table

The following overview summarizes all three measured metrics: success rate, average cost, and median runtime per task.

Harness Success Rate (of 26) Cost per Task (USD) Median Time per Task Kimi Code 21/26 0.54 297.1 s Hermes Agent 20/26 0.39 179.5 s Pi Agent 19/26 0.40 161.7 s Claude Code 19/26 1.47 347.6 s OpenCode 18/26 0.51 271.1 s Codex 17/26 0.47 236.2 s

Three patterns stand out immediately. First: the success-rate leader, Kimi Code, is neither the cheapest nor the most expensive harness. Second: Pi Agent delivers the best balance of speed and cost without falling far behind on success rate. Third: Claude Code, at $1.47 per task, is about 3.7 times more expensive than Pi Agent yet achieves a lower success rate than Kimi Code and Hermes Agent. Anyone choosing purely on name recognition might end up with the worse choice for their own use case.

[...]

## Why the Harness Matters More Than the Model

The core message of the Composio study can be summarized like this: before teams switch models to cut costs or improve reliability, they should first test a different harness. On identical tasks with an identical model, harness choice alone changed the cost per task by a factor of 3.8 and the success rate from 17 to 21 out of 26 tasks.

This observation aligns with independent analyses from the broader market. A detailed harness-bench study with 106 tasks, six harnesses, and eight models reached a similar conclusion: the best harness configuration scored 76.2 points, the worst only 52.4, a gap of 23.8 points on identical models and tasks [14]. Notably, around 36 percent of observed failures were not due to poor model reasoning but to schema and output-contract violations, i.e., weaknesses in the harness itself [14].

> “On identical tasks with an identical model, harness choice alone changed the success rate from 17 to 21 out of 26 tasks.”

If you’re also looking for free alternatives alongside commercial coding agents, check out our overview of [Open Source GitHub Tools](https://code404zero.com/en/development-coding/10-kostenlose-open-source-github-tools-als-alternativen-zu-teuren-entwickler-tools/) for more options. A comparison of several coding harnesses with the same Claude model (Opus 4.5) on the Terminal-Bench-2.0 benchmark confirms the pattern too: Letta Code reached a 59.1 percent success rate, while Claude Code with the same model only reached 41.6 percent, a difference attributed entirely to harness architecture [13]. Analysts expect that the biggest performance leaps through the end of 2026 will come less from new base models than from specialized harnesses with stricter output contracts and finer memory orchestration [13][14].

[...]

## AI Coding Agents Compared: What It Means for Developer Teams

Several actionable conclusions emerge from the data for practical tool selection:

1. Test harness before model: Anyone wanting to cut costs or improve reliability should first check whether a different harness with the existing model delivers better results, before expensive model upgrades.
2. Use case decides: For short, frequent tasks, a cheap, fast harness like Pi Agent or Hermes Agent pays off. For complex, rare workflows with high demands on success rate, a pricier harness like Kimi Code can be more economical despite higher cost per task, because fewer retries are needed.
3. Check time limits: Fixed timeout thresholds in a harness can become the limiting factor on large workflows, regardless of model quality.
4. Calculate cost per successful task, not just cost per attempt: a cheap harness with a low success rate can end up more expensive overall than a somewhat pricier harness with a high hit rate.

These principles hold regardless of the current market leader. Similar effects show up in other benchmarks too: on Terminal-Bench 2.1, the Codex CLI harness with the GPT-5.6 Sol model reached a top score of 89.5 percent [11], while Claude Code with the Fable 5.1 model and a 1-million-token context window achieved a 57.9 percent success rate on Terminal-Bench 4.0 and was rated leading for repository-adjacent work there [3]. Rankings shift depending on benchmark, model pairing, and task type, further evidence that a blanket “best agent” claim without context carries little weight.

[...]

## Conclusion

The Composio benchmark offers a rare, methodically cleaner look at a question often overlooked in practice: not just the model, but above all the harness, determines how reliably, quickly, and cheaply an AI coding agent actually works. With an identical model, the success rate fluctuated between 17 and 21 out of 26 tasks, costs varied by a factor of 3.8, and runtimes differed by more than double.

For developer teams, this means: before the next expensive model upgrade, a systematic harness test with your existing model and your typical tasks is worthwhile. Such an internal AI coding agent comparison, even with a smaller set of ten to twenty representative tasks, often delivers more meaningful results than any general leaderboard. Anyone who additionally documents fixed time limits, cost per successful task, and error types gains a solid basis for the next tool decision, regardless of which model currently leads the market.

## Frequently Asked Questions

n

### What was the success rate range across harnesses in the Composio benchmark?

n

With the identical model Kimi K3, the success rate across 26 identical coding tasks ranged from 17/26 for Codex to 21/26 for Kimi Code, purely due to the harness.

n

### How much did cost per task vary between harnesses?

n

Cost per task ranged from $0.39 for Hermes Agent to $1.47 for Claude Code, a factor of about 3.7 to 3.8, even though the underlying model was identical.

n

### Which harness was fastest in the benchmark?

n

Pi Agent was fastest at a median 161.7 seconds per task, while Claude Code at 347.6 seconds was more than twice as slow.

n

### What is a harness in the context of AI coding agents?

n

A harness is the software environment that connects an AI language model to the real work environment, providing tools such as file access, terminal commands, memory and context management, and error handling, so the model itself can only generate text but cannot act without it.

n
`````
