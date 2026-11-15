# 批次 03 · WebFetch · https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard

- 核实日期：2026-11-15
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写
- 调用参数：{"url": "https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard", "prompt": "提取 DeepSeek Harness 在 Harness Leaderboard 上的完整表现：加入日期与排期日期、五个评估的并列情况、DeepSWE 与 Terminal-Bench 的具体名次与分数差、后台进程清理缺陷的机制与受影响任务数、每解出一题成本、许可证与预览版状态、以及文章给出的适用场景建议。保留具体数字与出处。"}
- callId：chatcmpl-tool-bc617b8f360a8a58

---

**返回原文**

`````text
**标题**: DeepSeek Harness vs Hermes Agent: Tied First, One Flaw
**发布时间**: Sham AI Engineer & Founder, The Tech Archive · 7 min read · 13 Nov 2026

[Skip to main content](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#main)

[Open Source](https://aitecharchive.com/topics/open-source)

# DeepSeek Harness vs Hermes Agent: Tied First, One Flaw

DeepSeek Harness ties for first in all five Harness Leaderboard evaluations, but one cleanup habit costs it Terminal-Bench. Verdict and setup.

![Portrait of Sham](https://aitecharchive.com/images/sham.jpg)ShamAI Engineer & Founder, The Tech Archive7 min read13 Nov 2026

DeepSeek Harness (DSH) is the better pick for repository code changes on open models, and Hermes Agent, Pi or OpenCode is the better pick when background services must keep running after the agent exits. The [Harness Leaderboard](https://huggingface.co/spaces/joelniklaus/harness-leaderboard) added DSH on 9 November 2026 and, per its [changelog](https://huggingface.co/spaces/joelniklaus/harness-leaderboard/blob/main/CHANGELOG.md), ranked it in every view on 11 November. It is statistically tied for first in all five evaluations, yet it places only 6th of 10 on Terminal-Bench 2.1 because of a single cleanup habit.

![DeepSeek Harness vs Hermes Agent: Tied First, One Flaw](https://aitecharchive.com/_next/image?url=https%3A%2F%2Fcdn.aitecharchive.com%2Fimages%2F2026%2F11%2F38fa5d5c6f0c4e97acf53b3cc31df8da.webp&w=3840&q=75)

Contents

[TL;DR](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#tldr)[How does DeepSeek Harness compare on the Harness Leaderboard?](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#how-does-deepseek-harness-compare-on-the-harness-leaderboard)[Why does DeepSeek Harness lose ground on Terminal-Bench?](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#why-does-deepseek-harness-lose-ground-on-terminal-bench)[What can you do if your server must outlive the agent?](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#what-can-you-do-if-your-server-must-outlive-the-agent)[Is DeepSeek Harness cheap to run?](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#is-deepseek-harness-cheap-to-run)[Does the harness matter as much as the model?](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#does-the-harness-matter-as-much-as-the-model)[How do you install and run DeepSeek Harness?](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#how-do-you-install-and-run-deepseek-harness)[Which harness should you choose?](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#which-harness-should-you-choose)[FAQ](https://aitecharchive.com/articles/deepseek-harness-dsh-open-source-coding-agent-leaderboard#faq)

Reading type

## TL;DR

- DSH is tied for first in all five board evaluations, where "tied" means the 95% bootstrap interval of the paired difference to the leader covers zero ([Niklaus announcement](https://x.com/joelniklaus/status/2120540528886603949)).
- Averaged over three models, DSH is 2nd on DeepSWE v1.1, 0.5 points behind Hermes Agent, and 6th on Terminal-Bench 2.1.
- The gap comes from DSH shutting down every background program it started when a task ends. Three Terminal-Bench tasks grade a server after the agent exits.
- DSH averaged $0.53 per solved trial on the board.
- The harness is MIT-licensed and still a developer preview, so expect breaking changes.
- Last verified: 13 November 2026.

## How does DeepSeek Harness compare on the Harness Leaderboard?

The board, run by Hugging Face researcher Joël Niklaus, holds the model and reasoning effort fixed and swaps only the harness. It scores Terminal-Bench 2.1 and DeepSWE v1.1 with three attempts per task, according to the [Space](https://huggingface.co/spaces/joelniklaus/harness-leaderboard). The five evaluations are DeepSeek-V4.1-Flash and GLM-5.3-Flash at low and high effort, plus Flint.

Where Result Five board evaluations Statistically tied for first in all 5 DeepSWE, averaged over 3 models 2nd of 10, 0.5 points behind Hermes Agent Terminal-Bench 2.1, averaged 6th of 10 GLM-5.3-Flash at high effort 5th of 10, tied with leader

Source for the table: the [board changelog](https://huggingface.co/spaces/joelniklaus/harness-leaderboard/blob/main/CHANGELOG.md) and [Niklaus's announcement](https://x.com/joelniklaus/status/2120540528886603949). A 5th-place rank that is still tied with the leader is a reminder that the field is tight. Before DSH arrived, the top five harnesses sat within 2.2 points of each other, according to [CodeMago's write-up](https://codemago.dev/news/en/news/harness-leaderboard-swapping-harness-moves-ai-score-24-points) of the launch week.

## Why does DeepSeek Harness lose ground on Terminal-Bench?

DSH shuts down every background program it started once it finishes a task, as [Niklaus reports](https://x.com/joelniklaus/status/2120540528886603949). Three Terminal-Bench tasks ask the agent to start a server, for example a model inference API, and the grader then tests that server after the agent has exited. DSH passed 2 of 36 attempts on those tasks, while OpenCode, Pi and Hermes Agent passed 36 of 36.

Those three tasks cost DSH between 1.5 and 1.7 points per evaluation. That is more than its 1.3-point gap to the leader on DeepSeek-V4.1-Flash at high effort ([announcement](https://x.com/joelniklaus/status/2120540528886603949)). In other words, the flaw is a behavioural default, not a lack of capability, and it is the whole reason DSH does not top the Terminal-Bench view.

Advertisement

[![Picture 360: show the whole place in one 360 tour](https://cdn.aitecharchive.com/images/2026/11/1d4953c9ee8e4007b87370ec79b52f81.jpg)](https://aitecharchive.com/api/v1/ads/click/147115fa-f909-40d9-b085-a81b66cba69d)

## What can you do if your server must outlive the agent?

This section is our own analysis, not a claim from the board or its author. Given the confirmed behaviour, there are two sensible workarounds:

1. Start long-lived services under `systemd` or with `nohup` and `setsid`, so they sit outside the agent's own process group and are not swept up at cleanup.
2. State the persistence requirement explicitly in the prompt, for instance "leave the server running after you finish".

We have not tested either against DSH, so treat them as a starting point and verify with a quick task before relying on them. If a workflow depends on this often, the simpler route is to choose a harness that already passes this class of task.

## Is DeepSeek Harness cheap to run?

DSH averaged $0.53 per solved trial on the board ([Niklaus](https://x.com/joelniklaus/status/2120540528886603949)). The board lists DeepSeek-V4.1-Flash at $0.28 per million input tokens and $1.12 per million output tokens, and GLM-5.3-Flash at $0.15 per million input tokens ([Space](https://huggingface.co/spaces/joelniklaus/harness-leaderboard)). The harness itself costs nothing, so your bill is the model API.

One caveat on scoring: 20 of DSH's passes were overturned, for example for fetching upstream code, which the board counts as a fail ([board method](https://huggingface.co/spaces/joelniklaus/harness-leaderboard)). DSH also ran with web search off, because its search needs a DeepSeek account key the test machines do not hold.

## Does the harness matter as much as the model?

Independent research suggests it does. An [arXiv study of 66 model-harness configurations](https://arxiv.org/abs/2610.00917) found model rankings reverse across harnesses. On Terminal-Bench 4, Claude leads GPT by 7.94 points in OpenHands but trails it by 30.16 points in PI. The same paper reports DSH as the best harness for GLM-5.3 and [DeepSeek V4 Pro on that benchmark](https://aitecharchive.com/articles/deepseek-api-search-ocr-tts-tools-pricing-benchmarks-2026).

The board's own launch data points the same way: swapping the harness moved scores by up to 24 points for weaker harnesses, per [CodeMago](https://codemago.dev/news/en/news/harness-leaderboard-swapping-harness-moves-ai-score-24-points). For more on how agent platforms differ in practice, see our [open-source coding agent platform comparison](https://aitecharchive.com/articles/best-open-source-ai-agent-platform-for-coding-in-2026-openmausbot-vs-alternatives) and the [Claude Code tool-calling comparison](https://aitecharchive.com/articles/claude-code-2-1-323-code-mode-vs-standard-tool-calls). For the model side of the same question, read [SWE-2 Flash vs GLM-5.3 Flash](https://aitecharchive.com/articles/swe-2-flash-vs-glm-5-3-flash-compared).

## How do you install and run DeepSeek Harness?

These steps come from the [DeepSeek Harness repository](https://github.com/deepseek-ai/deepseek-harness).

1. Install Node.js, version 22.19 or later, or 24 and above.
2. Run `npx @deepseek-ai/dsh web`.
3. Open the Web UI at `http://127.0.0.1:3080` and add a DeepSeek API key under Settings, then Models.
4. Start a session in the folder you want DSH to work in.
5. To build from source, you need Node ^22.19 or 24+ and pnpm 11, then run `pnpm install && pnpm run build && pnpm dsh web`.

Session logs stay local by default. Setting `DSH_TELEMETRY_MODE=FEEDBACK_ONLY` shares a log only when you submit feedback, and `FULL` uploads continuously. The repository carries a SAFETY.md notice that you should read before running an agent with file and shell access. DSH is a developer preview (the board tested 0.2.2-rc.1), and the repo warns that compatibility-breaking changes are expected. Its architecture treats everything as a plugin on Cordis, and profiles are ordered lists of plugin bundles managed with `dsh plugin`.

The project is MIT-licensed, with 279,576 stars and 34,424 forks at the time of checking, created on 13 August 2026 ([GitHub](https://github.com/deepseek-ai/deepseek-harness)). Popularity is not evidence of quality, which is why the independent board result matters more.

## Which harness should you choose?

Choose DSH when the job is repository code changes on open models, the kind of work DeepSWE measures. Choose Hermes Agent, Pi or OpenCode when servers, watchers or dev APIs must survive after the agent finishes. Whichever you pick, verify results before trusting them, as we argue in [verify-first vs build-first agentic engineering](https://aitecharchive.com/articles/agentic-engineering-verify-first-vs-build-first), and plan the task before handing it over, as in [this plan-first coding workflow](https://aitecharchive.com/articles/shadcn-improve-10423-stars-plan-first-coding).

The board is also still moving. Cline is listed as the next harness in preparation ([changelog](https://huggingface.co/spaces/joelniklaus/harness-leaderboard/blob/main/CHANGELOG.md)), so rankings may shift. For a week-one view of the board's totals and caveats, [bokonon.ai's analysis](https://bokonon.ai/notes/2026-11-06-a-tie-a-tail-and-a-cap/) is worth reading.

## FAQ

**Q: What is DeepSeek Harness?** **A:** DeepSeek Harness (DSH) is an open-source coding agent from DeepSeek AI, released under the MIT licence. It uses an "everything is a plugin" architecture built on Cordis, according to its [GitHub repository](https://github.com/deepseek-ai/deepseek-harness).

**Q: Is DeepSeek Harness free?** **A:** The harness is free and open source, but you pay for the model API. The Harness Leaderboard measured an average of $0.53 per solved trial ([Niklaus](https://x.com/joelniklaus/status/2120540528886603949)).

**Q: Why does DeepSeek Harness fail some Terminal-Bench tasks?** **A:** It shuts down background programs it started when it finishes, while three tasks grade a server after the agent exits. DSH passed 2 of 36 attempts on them, per the [announcement](https://x.com/joelniklaus/status/2120540528886603949).

**Q: Which models can run in DeepSeek Harness?** **A:** It talks to models through an OpenAI-compatible endpoint. The board used DeepSeek-V4.1-Flash, GLM-5.3-Flash and Flint, per the [Space](https://huggingface.co/spaces/joelniklaus/harness-leaderboard).

**Q: Should I use DeepSeek Harness or Hermes Agent, Pi or OpenCode?** **A:** Use DSH for repository code changes. Use Hermes Agent, Pi or OpenCode when background services must stay alive after the agent exits.

**Q: Does DeepSeek Harness send my data anywhere?** **A:** Not by default. Session logs stay local unless you set `DSH_TELEMETRY_MODE` to `FEEDBACK_ONLY` or `FULL`, as described in the [repository](https://github.com/deepseek-ai/deepseek-harness).

*Corrections: none yet. This article was researched and drafted with AI assistance and edited by a human; see our editorial policy for details.*

* * *

*Every claim here is traced to a primary source, dated, and listed under Sources. Research and drafting are AI-assisted; editing, verification and publication are human decisions, and a person is accountable for what appears on this page. [How we work →](https://aitecharchive.com/pages/how-we-work)*

## Tags

[#DeepSeek Harness](https://aitecharchive.com/tags/deepseek-harness)[#open source](https://aitecharchive.com/tags/open-source)[#Coding Agents](https://aitecharchive.com/tags/coding-agents)[#Harness Leaderboard](https://aitecharchive.com/tags/harness-leaderboard)[#Hermes Agent](https://aitecharchive.com/tags/hermes-agent)
`````
