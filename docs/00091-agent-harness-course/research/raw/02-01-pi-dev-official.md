# 批次 02 · WebFetch · https://pi.dev/

- 核实日期：2026-11-15
- 暂存目录：`research/raw/`
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写
- 调用参数：{"url": "https://pi.dev/", "prompt": "提取 Pi coding agent 官方页面上的全部能力清单与明确「不做」的功能：内置工具数量与名称、系统提示词大小、扩展机制（extensions/skills/prompt templates）、AGENTS.md 与 SYSTEM.md、compaction、会话树与分支、steering 与 follow-up、支持的模型供应商数量、运行模式、以及官方声明刻意不提供的功能（MCP、subagents、plan mode、permission popups、todos、background bash 等）。保留原文具体数字与措辞。"}
- callId：chatcmpl-tool-a3da97da75e82e7f

---
**返回原文**

`````text
**标题**: Pi

# There are many agent harnessesbut this one is yours

Pi is a minimal agent harness.Adapt Pi to your workflows, not the other way around.

curlPowerShellnpmpnpmbun

`powershell -c "irm https://pi.dev/install.ps1 | iex"`Copy

## Why Pi?

Pi is a minimal agent harness. Adapt Pi to your workflows, not the other way around. Customize Pi with [extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#extensions), [skills](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#skills), [prompt templates](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#prompt-templates), and [themes](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#themes). Bundle them as [Pi packages](https://pi.dev/packages) and share via npm or git.

Pi ships with powerful defaults but skips features like sub-agents and plan mode. Ask Pi to build what you want, or install a package that does it your way.

Four modes: interactive, print/JSON, [RPC, and SDK](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#programmatic-usage). See [OpenClaw](https://github.com/OpenClaw/OpenClaw) for a real-world integration.

[Read the documentation](https://docs.pi.dev/latest)

## Change the harness, not your workflow

Pi isn't a sealed product. If you need a command, tool, provider, workflow, or UI tweak, just ask Pi to build it. It will customize itself on the fly.

Have Pi manipulate itself in place, hit `/reload`, and keep going. If you think others will find what you built useful, share it!

## 15+ providers, hundreds of models

Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, Groq, Cerebras, xAI, Hugging Face, Kimi For Coding, MiniMax, NVIDIA, OpenRouter, Ollama, and more. Authenticate via API keys or OAuth.

Switch models mid-session with `/model` or `Ctrl+L`. Cycle through your favorites with `Ctrl+P`.

Add custom providers and models via [models.json](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs/models.md) or [extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs/custom-provider.md).

## Tree-structured, shareable history

Sessions are stored as trees. Use `/tree` to navigate to any previous point and continue from there. All branches live in a single file. Filter by message type, label entries as bookmarks.

Export to HTML with `/export`, or upload to a GitHub gist with `/share` and get a shareable URL that renders it. [Example session](https://pi.dev/session/#0ea51497613daf7e1de28ee99950b074).

## Context engineering

Pi's [minimal system prompt](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/system-prompt.ts) and extensibility let you do actual context engineering. Control what goes into the context window and how it's managed.

**AGENTS.md:** Project instructions loaded at startup from `~/.pi/agent/`, parent directories, and the current directory.

**SYSTEM.md:** Replace or append to the default system prompt per-project.

**Compaction:** Auto-summarizes older messages when approaching the context limit. Fully customizable via [extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/custom-compaction.ts): implement topic-based compaction, code-aware summaries, or use different summarization models.

**Skills:** Capability packages with instructions and tools, loaded on-demand. Progressive disclosure without busting the prompt cache. See [skills](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#skills).

**Prompt templates:** Reusable prompts as Markdown files. Type `/name` to expand. See [prompt templates](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#prompt-templates).

**Dynamic context:** [Extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#extensions) can inject messages before each turn, filter the message history, implement RAG, or build long-term memory.

## Steer or follow up

Submit messages while the agent works. `Enter` sends a steering message (delivered after current tool, interrupts remaining tools). `Alt+Enter`sends a follow-up (waits until the agent finishes).

## Four modes

**Interactive:** The full TUI experience.

**Print/JSON:** `pi -p "query"` for scripts, `--mode json` for event streams.

**RPC:** JSON protocol over stdin/stdout for non-Node integrations. See [docs/rpc.md](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs/rpc.md).

**SDK:** Embed Pi in your apps. See [OpenClaw](https://github.com/OpenClaw/OpenClaw) for a real-world example.

## Primitives, not features

Features that other agents bake in, you can build yourself. Extensions are TypeScript modules with access to tools, commands, keyboard shortcuts, events, and the full TUI.

[Sub-agents](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent/), [plan mode](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/plan-mode/), [permission gates](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/permission-gate.ts), [path protection](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/protected-paths.ts), [SSH execution](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/ssh.ts), [sandboxing](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/sandbox/), MCP integrations (still supported alongside built-in MCP), custom editors, status bars, overlays.

Don't want to build it? Ask Pi to build it for you. Or install a [package](https://pi.dev/packages) that does it your way. See the [50+ examples](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/).

Bundle extensions, skills, prompts, and themes as packages. Install from npm or git:

`$ pi install npm:@foo/pi-tools $ pi install git:github.com/badlogic/pi-doom`

[Browse packages](https://pi.dev/packages)

[and it can play doom](#)

## What we didn't build

Pi is aggressively extensible so it doesn't have to dictate your workflow. Features that other tools bake in can be built with [extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#extensions), [skills](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#skills), or installed from third-party [Pi packages](https://pi.dev/packages). This keeps the core minimal while letting you shape Pi to fit how you work.

[Read the blog post](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)

- ### No MCP Now with MCP+Codemode
  
  MCP is built in, and Codemode lets agents compose tool calls in a JavaScript sandbox. MCP extensions are still supported too. [Why we changed our minds](https://earendil.com/posts/you-said-no-mcp/)
- ### No sub-agents
  
  Spawn Pi instances via tmux, or build your own with [extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#extensions), or install a package that does it your way.
- ### No permission popups
  
  Run in a container, or build your own confirmation flow with [extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#extensions) inline with your environment and security requirements.
- ### No plan mode
  
  Write plans to files, or build it with [extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#extensions), or install a package.
- ### No built-in to-dos
  
  Use a TODO.md file, or build your own with [extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent#extensions).
- ### No background bash
  
  Use tmux. Full observability, direct interaction.

## Get involved with Pi

- ### Issues
  
  [GitHub](https://github.com/earendil-works/pi/issues) for bugs and features.
- ### Discord
  
  [Community server](https://discord.com/invite/nKXTsAcmbT) for discussion and sharing.
- ### Documentation
  
  [Read the documentation](https://docs.pi.dev/latest) or browse the [source on GitHub](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/docs).
`````
