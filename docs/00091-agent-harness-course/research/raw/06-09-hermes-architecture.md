# 批次 06 · WebFetch · https://hermes-agent.nousresearch.com/docs/developer-guide/architectur

- 核实日期：2026-11-15
- 服务器时间：2026-11-15 19:45 GMT+8
- URL：https://hermes-agent.nousresearch.com/docs/developer-guide/architecture
- callId：call_1ac7b1935642466eb6bbd639
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写

---

**返回原文**

`````text
**标题**: Architecture | Hermes Agent

# Architecture

This page is the top-level map of Hermes Agent internals. Use it to orient yourself in the codebase, then dive into subsystem-specific docs for implementation details.

## System Overview​

# Architecture
## System Overview​
```text

┌─────────────────────────────────────────────────────────────────────┐

│                        Entry Points                                  │

│                                                                      │

│  CLI (cli.py)    Gateway (gateway/run.py)    ACP (acp_adapter/)     │

│  Batch Runner    API Server                  Python Library          │

└──────────┬──────────────┬───────────────────────┬───────────────────┘

│              │                       │

▼              ▼                       ▼

┌─────────────────────────────────────────────────────────────────────┐

│                     AIAgent (run_agent.py)                          │

│                                                                     │

│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │

│  │ Prompt       │  │ Provider     │  │ Tool         │               │

│  │ Builder      │  │ Resolution   │  │ Dispatch     │               │

│  │ (prompt_     │  │ (runtime_    │  │ (model_      │               │

│  │  builder.py) │  │  provider.py)│  │  tools.py)   │               │

│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │

│         │                 │                 │                       │

│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐               │

│  │ Compression  │  │ 3 API Modes  │  │ Tool Registry│               │

│  │ & Caching    │  │ chat_compl.  │  │ (registry.py)│               │

│  │              │  │ codex_resp.  │  │ 70+ tools    │               │

│  │              │  │ anthropic    │  │ 28 toolsets  │               │

│  └──────────────┘  └──────────────┘  └──────────────┘               │

└─────────┴─────────────────┴─────────────────┴───────────────────────┘

│                                    │

▼                                    ▼

┌───────────────────┐              ┌──────────────────────┐
# Architecture
## System Overview​
│ Session Storage   │              │ Tool Backends         │

│ (SQLite + FTS5)   │              │ Terminal (7 backends) │

│ hermes_state.py   │              │ Browser (5 backends)  │

│ gateway/session.py│              │ Web (4 backends)      │

└───────────────────┘              │ MCP (dynamic)         │

│ File, Vision, etc.    │

└──────────────────────┘
```

## Directory Structure​

# Architecture
## Directory Structure​
```text

hermes-agent/

├── run_agent.py              # AIAgent facade — loop lives in agent/conversation_loop.py + agent/turn_*.py

├── cli.py                    # HermesCLI facade — mixins in hermes_cli/cli_*_mixin.py

├── model_tools.py            # Tool discovery, schema collection, dispatch

├── toolsets.py               # Tool groupings and platform presets

├── hermes_state.py           # SQLite session/state database facade (+ hermes_state_*.py siblings)

├── hermes_constants.py       # HERMES_HOME, profile-aware paths

├── batch_runner.py           # Batch trajectory generation

│

├── agent/                    # Agent internals

│   ├── prompt_builder.py     # System prompt assembly

│   ├── context_engine.py     # ContextEngine ABC (pluggable)

│   ├── context_compressor.py # Default engine — lossy summarization

│   ├── prompt_caching.py     # Anthropic prompt caching

│   ├── auxiliary_client.py   # Auxiliary LLM for side tasks (vision, summarization)

│   ├── model_metadata.py     # Model context lengths, token estimation

│   ├── models_dev.py         # models.dev registry integration

│   ├── anthropic_adapter.py  # Anthropic Messages API format conversion

│   ├── display.py            # KawaiiSpinner, tool preview formatting

│   ├── skill_commands.py     # Skill slash commands

│   ├── memory_manager.py    # Memory manager orchestration

│   ├── memory_provider.py   # Memory provider ABC

│   └── trajectory.py         # Trajectory saving helpers

│

├── hermes_cli/               # CLI subcommands and setup

│   ├── main.py               # Entry point — `hermes` subcommands (parsers in subcommands/, main_*.py)

│   ├── config.py             # DEFAULT_CONFIG, OPTIONAL_ENV_VARS, migration

│   ├── commands.py           # COMMAND_REGISTRY — central slash command definitions
# Architecture
## Directory Structure​
│   ├── auth.py               # PROVIDER_REGISTRY, credential resolution (+ auth_*.py siblings)

│   ├── runtime_provider.py   # Provider → api_mode + credentials

│   ├── models.py             # Model catalog, provider model lists

│   ├── model_switch.py       # /model command logic (CLI + gateway shared)

│   ├── setup.py              # Interactive setup wizard (+ setup_*.py siblings)

│   ├── skin_engine.py        # CLI theming engine

│   ├── skills_config.py      # hermes skills — enable/disable per platform

│   ├── skills_hub.py         # /skills slash command

│   ├── tools_config.py       # hermes tools — enable/disable per platform

│   ├── plugins.py            # PluginManager — discovery, loading, hooks

│   ├── callbacks.py          # Terminal callbacks (clarify, sudo, approval)

│   └── gateway.py            # hermes gateway start/stop

│

├── tools/                    # Tool implementations (one file per tool)

│   ├── registry.py           # Central tool registry

│   ├── approval.py           # Dangerous command detection

│   ├── terminal_tool.py      # Terminal orchestration

│   ├── process_registry.py   # Background process management

│   ├── file_tools.py         # read_file, write_file, patch, search_files

│   ├── web_tools.py          # web_search, web_extract

│   ├── browser_use_cli.py    # browser_exec — Python over CDP (browser-harness)

│   ├── browser_session.py    # Per-task browser sessions (+ browser_session_*.py siblings)

│   ├── browser_launcher.py   # Local Chromium launch, reuse and orphan reaping

│   ├── code_execution_tool.py # execute_code sandbox

│   ├── delegate_tool.py      # Subagent delegation

│   ├── mcp_tool.py           # MCP client facade (+ mcp_tool_*.py siblings)

│   ├── credential_files.py   # File-based credential passthrough

│   ├── env_passthrough.py    # Env var passthrough for sandboxes

# Architecture
## Directory Structure​
│   ├── ansi_strip.py         # ANSI escape stripping

│   └── environments/         # Terminal backends (local, docker, ssh, modal, daytona, vercel_sandbox)

│

├── gateway/                  # Messaging platform gateway

│   ├── run.py                # GatewayRunner facade — message dispatch (+ run_*.py siblings)

│   ├── session.py            # SessionStore — conversation persistence

│   ├── delivery.py           # Outbound message delivery

│   ├── pairing.py            # DM pairing authorization

│   ├── hooks.py              # Hook discovery and lifecycle events

│   ├── mirror.py             # Cross-session message mirroring

│   ├── status.py             # Token locks, profile-scoped process tracking

│   └── platforms/            # Core ingress adapters: api_server, webhook,

│                             #   msgraph_webhook

│

├── plugins/platforms/        # Bundled platform plugins: telegram, discord, slack,

│                             #   whatsapp, matrix, mattermost, email, sms, dingtalk,

│                             #   feishu, wecom, irc, line, teams, google_chat,

│                             #   buzz, ntfy, photon, raft, simplex, whatsapp_cloud,

│                             #   signal, weixin, bluebubbles, qqbot

│                             #   (Home Assistant: `homeassistant` catalog plugin;

│                             #    Yuanbao: `yuanbao` Hermes Labs plugin)

│

├── acp_adapter/              # ACP server (VS Code / Zed / JetBrains)

├── cron/                     # Scheduler (jobs.py, scheduler.py)

├── plugins/memory/           # Memory provider plugins

├── plugins/context_engine/   # Context engine plugins

├── skills/                   # Bundled skills (always available)

├── optional-skills/          # Official optional skills (install explicitly)

├── website/                  # Docusaurus documentation site

# Architecture
## Directory Structure​
└── tests/                    # Pytest suite (~25,000 tests across ~1,250 files)
```
```text

User input → HermesCLI.process_input()

  → AIAgent.run_conversation()

    → prompt_builder.build_system_prompt()

    → runtime_provider.resolve_runtime_provider()

    → API call (chat_completions / codex_responses / anthropic_messages)

    → tool_calls? → model_tools.handle_function_call() → loop

    → final response → display → save to SessionDB
```
```text

Platform event → Adapter.on_message() → MessageEvent

  → GatewayRunner._handle_message()

    → authorize user

    → resolve session key

    → create AIAgent with session history

    → AIAgent.run_conversation()

    → deliver response back through adapter
```
```text

Scheduler tick → load due jobs from jobs.json

  → create fresh AIAgent (no history)

  → inject attached skills as context

  → run job prompt

  → deliver response to target platform

  → update job state and next_run
```
If you are new to the codebase:

01. **This page** — orient yourself
02. **Agent Loop Internals** — how AIAgent works
03. **Prompt Assembly** — system prompt construction
04. **Provider Runtime Resolution** — how providers are selected
05. **Adding Providers** — practical guide to adding a new provider
06. **Tools Runtime** — tool registry, dispatch, environments
07. **Session Storage** — SQLite schema, FTS5, session lineage
08. **Gateway Internals** — messaging platform gateway
09. **Context Compression & Prompt Caching** — compression and caching
10. **ACP Internals** — IDE integration
The synchronous orchestration engine (`AIAgent`, exposed by the `run_agent.py` facade; the loop lives in `agent/conversation_loop.py` and `agent/turn_*.py`). Handles provider selection, prompt construction, tool execution, retries, fallback, callbacks, compression, and persistence. Supports three API modes for different provider backends.

→ Agent Loop Internals
Prompt construction and maintenance across the conversation lifecycle:

- **`system_prompt.py` + `prompt_builder.py`** — assembles the ordered system-prompt tiers (`stable` → `context` → `volatile`): identity/tool guidance/skills, context files, then memory/profile/timestamp blocks
- **`prompt_caching.py`** — Applies Anthropic cache breakpoints for prefix caching
- **`context_compressor.py`** — Summarizes middle conversation turns when context exceeds thresholds

→ Prompt Assembly, Context Compression & Prompt Caching
A shared runtime resolver used by CLI, gateway, cron, ACP, and auxiliary calls. Maps `(provider, model)` tuples to `(api_mode, api_key, base_url)`. Handles 18+ providers, OAuth flows, credential pools, and alias resolution.

→ Provider Runtime Resolution

## Major Subsystems​

### Tool System​

Central tool registry (`tools/registry.py`) with 70+ registered tools across ~28 toolsets. Each tool file self-registers at import time. The registry handles schema collection, dispatch, availability checking, and error wrapping. Terminal tools support 6 built-in backends (local, Docker, SSH, Daytona, Modal, Vercel Sandbox) plus plugin backends (e.g. Singularity).

→ Tools Runtime

[...]

### Messaging Gateway​

Long-running process with 25+ platform adapters (built-in + bundled plugins), unified session routing, user authorization (allowlists + DM pairing), slash command dispatch, hook system, cron ticking, and background maintenance.

→ Gateway Internals

### Plugin System​

Three discovery sources: `~/.hermes/plugins/` (user), `.hermes/plugins/` (project), and pip entry points. Plugins register tools, hooks, and CLI commands through a context API. Two specialized plugin types exist: memory providers (`plugins/memory/`) and context engines (`plugins/context_engine/`). Both are single-select — only one of each can be active at a time, configured via `hermes plugins` or `config.yaml`.

→ Plugin Guide, Memory Provider Plugin

### Cron​

First-class agent tasks (not shell tasks). Jobs store in JSON, support multiple schedule formats, can attach skills and scripts, and deliver to any platform.

→ Cron Internals

### ACP Integration​

Exposes Hermes as an editor-native agent over stdio/JSON-RPC for VS Code, Zed, and JetBrains.

→ ACP Internals

[...]

## Design Principles​

PrincipleWhat it means in practice**Prompt stability**System prompt doesn't change mid-conversation. No cache-breaking mutations except explicit user actions (`/model`).**Observable execution**Every tool call is visible to the user via callbacks. Progress updates in CLI (spinner) and gateway (chat messages).**Interruptible**API calls and tool execution can be cancelled mid-flight by user input or signals.**Platform-agnostic core**One AIAgent class serves CLI, gateway, ACP, batch, and API server. Platform differences live in the entry point, not the agent.**Loose coupling**Optional subsystems (MCP, plugins, memory providers, RL environments) use registry patterns and check_fn gating, not hard dependencies.**Profile isolation**Each profile (`hermes -p <name>`) gets its own HERMES_HOME, config, memory, sessions, and gateway PID. Multiple profiles run concurrently.

## File Dependency Chain​

```text

tools/registry.py  (no deps — imported by all tool files)

       ↑

tools/*.py  (each calls registry.register() at import time)

       ↑

model_tools.py  (imports tools/registry + triggers tool discovery)

       ↑

run_agent.py, cli.py, batch_runner.py, environments/
```

This chain means tool registration happens at import time, before any agent instance is created. Any `tools/*.py` file with a top-level `registry.register()` call is auto-discovered — no manual import list needed.
`````
