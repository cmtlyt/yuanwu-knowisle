# 批次 01 · 第 12 条 · WebSearch

- 暂存文件：`research/raw/01-12-dsh-architecture-search.md`
- 来源：会话记录 `9471105c-…jsonl` 中该工具调用的原始返回文本，机械导出、未经改写
- 核实日期：2026-11-15
- 可信级别：搜索摘要（多为二手，须按 evidence 台账定级）
- 调用参数：{   "query": "DeepSeek Harness dsh GitHub 官方文档 Everything is a plugin Cordis 四种模式" }

---
**返回原文**

````text
# Search Results for "DeepSeek Harness dsh GitHub 官方文档 Everything is a plugin Cordis 四种模式"

## 1. [Chapter 16 Everything Is a Plugin: Inside the Skeleton](https://deepseekharness.online/en/guide/architecture)

Chapter 16 Everything Is a Plugin: Inside the Skeleton DeepSeek Harness。 take it off and things go back — there is no state where you broke it and cannot return. This design principle is called "everything is a plugin." Its benefit is direct: swap a model, swap a sandbox, swap a whole interface, and you do not have to touch the rest. What happens at startup At startup, dsh stacks four layers of configuration in order, and each one has higher priority than the last: bundles in the profile ↓ the profile's own patch ↓ the home-level patch ↓ temporary overrides from the command line --patch Three terms, briefly: profile: a named assembly, such as web or headless. It lists which bundles to use, and it also stores your own changes. bundle: a distributable set of configuration plus mount code. Install it and you have added a string of nodes to the tree. patch: writes only "which item I want to change," not the whole configuration. To see what your machine actually stacks up, run: dsh --profile web --dump-config Every item it prints can be overridden by your own patch. That is also what Chapter 19 covers. Four run modes Mode What's loaded Good for Standard mode The full tool set Everyday work; the default choice PTC mode Programmatic tool calling, where the model writes a piece of code that combines several rounds of calls Batch tasks with many tool calls and fixed steps Minimal mode Just one shell tool plus one file-editing tool Comparing model capabilities, testing in a minimal environment Creative mode Try plugins in memory and compose new modes Developing plugins, experimenting with new setups For most readers, standard mode is enough. Once you start feeling that it has "too many steps and is too slow," then go try PTC. Every run leaves a trail dsh writes everything the model sees into an append-only session log: the system prompt, the thinking process, tool calls and their results, sub-agent dispatch, every context injection. "Append-only" means: write forward only, never rewrite history. So you can replay in full how a task got to where it is today. In the interface's trajectory view, you can browse these records by source. Resuming a session, forking, retrieval, and replay all use the same event stream — not four sets of data each stored separately. Chapter 18 covers how to use it to track down problems. The seam: swap one provider and the whole product changes The seam is the most valuable concept in dsh, but it is easy to understand: a replaceable capability. A capability has three roles: Definition: states clearly what this capability looks like (the interface) Provider: actually implements it (for example, the local filesystem or a remote sandbox) Consumer: the tools that use it (for example, shell and file editing) Here is an example: the filesystem and processes share the same "execution world." Switch the provider from local to a remote sandbox, and the shell, the terminal, and the language service all move over together — no need to write a separate remote version of every tool. That is what "swap one provider and the whole product changes" means. Who's in the core packages Package What it handles core/session The append-only session log and storage core/system-prompt How prompt sections and tool descriptions are assembled core/tools The tool registry plus a gated execution pipeline core/agent/core/agent-loop The Agent interface and the default loop driver llm/llm Messages and streaming output, and where model adapters live It's fine if this doesn't sink in yet — you'll come back to this table when you write plugins in Chapter 20. Three common misconceptions Don't mistake the metaphor for the fact "A plugin tree = microservices." It isn't. It runs in one process, and plugins cooperate through services and events, not over the network. "Everything is a plugin = you have to install everything yourself." It doesn't. The distribution ships a complete set of assemblies, and it works out of the box. "Modding means changing source code." It doesn't. Mount a plugin and write a patch; the source can stay untouched, not a single line changed. Further reading for developers Official architecture doc: docs/architecture.md List of capability seams: docs/capability-seams.md Cordis primer: docs/cordis-primer.md Now that you understand the skeleton, the next step is bolting parts other people have already made onto the car.

**URL:** https://deepseekharness.online/en/guide/architecture

---

## 2. [DeepSeek Harness](https://repocloud.io/details/DeepSeek%20Harness/)

DeepSeek Harness RepoCloud。DeepSeek Harness DeepSeek Harness gained over 60,000 GitHub stars within hours of its August 2026 launch, establishing itself as the first fully modular open-source agent runtime where literally every component is a swappable plugin. Built on the Cordis framework—a programming paradigm for spatiotemporal composability—dsh decomposes the entire agent stack into independently replaceable pieces: model adapters for DeepSeek, Anthropic, OpenAI, AWS Bedrock, Azure, and Google Gemini; tool registries covering bash execution, file system operations, web search, subagent delegation, and todo management; plus session stores, sandboxes, approval policies, orchestration loops, and the user interface itself. Four operating modes serve different workflows: Standard provides the full toolset, Code mode uses model-generated code to compose multi-round tool calls, Minimal strips down to a shell and editor for benchmarking, and Creator mode lets developers inspect the running runtime and test Cordis plugins in memory. The kernel handles plugin mounting, unmounting, and dependency resolution while typed events and services coordinate between components. Profiles and bundles allow the same codebase to produce entirely different products—a terminal coding agent, a browser-based workspace, a headless automation service, or an ACP/JSON-RPC endpoint—by swapping YAML configuration layers. Session history is stored as an append-only event stream for full trajectory replay, and project-level hooks on agent lifecycle events enable fine-grained behavioral customization. MCP client integration connects to external tool servers, while Agent Client Protocol enables programmatic orchestration. Running on a dedicated VPS on RepoCloud with guaranteed CPU, RAM, and SSD, full root SSH access, and a browser serial console. MIT licensed. Benefits Fully Modular Plugin Architecture Every component—models, tools, sandboxes, sessions, loops, and UI—is a swappable Cordis plugin, enabling developers to replace or extend any capability without modifying core source code. Multi-Provider LLM Support Connect to DeepSeek, Anthropic, OpenAI, AWS Bedrock, Azure, Google Gemini, or custom API endpoints through a unified adapter layer with credential isolation and model catalog discovery. Configurable Operating Modes Switch between Standard, Code, Minimal, and Creator modes to match different development and evaluation workflows, from full-featured coding to minimal benchmarking environments. Append-Only Session Observability Every agent turn, step, tool invocation, and model request is logged to an append-only event stream, providing full trajectory replay and audit capability for debugging agent behavior. Features Cordis Plugin System Powered by the Cordis framework for spatiotemporal composability, enabling typed services, events, and reversible side effects across a shared plugin context. MCP Client Integration Connects to external Model Context Protocol servers, automatically discovering and registering tools from MCP endpoints into the agent's tool registry. Web UI and Headless Ships with a browser-based workspace served on port 3080 and a headless mode for one-off tasks, CI pipelines, and programmatic automation via ACP or JSON-RPC. Hook-Based Lifecycle Control Project-level and user-level hooks on session start, pre-step, request, tool execution, and turn stopping events enable fine-grained behavioral customization. Profile-Based Deployment Profiles and bundles compose different runtime configurations from the same codebase, producing terminal agents, web workspaces, or API services through YAML configuration layering. Apps Similar to DeepSeek Harness OpenHands With 83,000+ GitHub stars and $18.8M in Series A funding, OpenHands delivers the leading open-source platform for AI coding agents that scored 68.4% on SWE-bench Verified with... Deploy Mikka Instead of babysitting three coding agents in three terminal windows, you describe the work once and let Mikka run the team: its Coordinator bot plans the job, dispatches runs to... Deploy Vicoa A team of coding agents, run in parallel from your desk, your browser, and your phone: Vicoa is an agentic IDE and control center, so one developer can steer a whole fleet instead... Deploy Cezar Close the laptop; the agents keep shipping. Cezar is an open-source control center that runs Claude Code, Codex, OpenCode, Copilot, and eight other coding agents in parallel on... Deploy CodeRail Close the laptop, walk away, and your coding agents keep working;

**URL:** https://repocloud.io/details/DeepSeek%20Harness/

---

## 3. [DeepSeek Harness 开源:把 Agent 里"模型之外"的部分全做成插件](http://mp.weixin.qq.com/s?__biz=MzI1NjkzNDE3Mg==&mid=2247484562&idx=1&sn=79c21d7a62e0671ab42191602e65540a&chksm=ebacdbea7600311c1ef87405fccd1559f4c005fc865f1d4dfb87f6aaf48721e98f7ae0be4616#rd)

2026 年 8 月 13 日创建的 deepseek-ai/deepseek-harness,到 11 月 4 日最近一次提交时已有 27.8 万 star、3.4 万 fork,最新标签是 dsh-v0.2.2-rc.1。仓库自己的定位是一句话:Everything is a Plugin(一切都是插件)。它交付的不是模型,而是模型外面那一圈运行时。一、Deepseek Harness是什么DeepSeek Harness(命令行名 dsh)是 DeepSeek AI 开源的 Agent 运行时(agent harness)。"Harness" 在这个语境里指套在模型外面的那层工程结构:会话怎么记、系统提示词怎么拼、工具有哪些、在哪执行、出错怎么回滚、谁来批准。它建立在 Cordis 这个元框架之上。Cordis 的做法是让插件向共享上下文贡献三样东西:服务、带类型的事件、可撤销的副作用。按仓库文档的说法,模型适配器、工具注册表、会话日志,乃至 Agent 主循环本身,都是插件,都可以由配置替换。仓库里没有"需要打补丁的核心",扩展方式是把自己的插件挂在别人旁边;注册产生的效果在插件卸载时自动回退。Cordis 的设计写在论文《A Programming Paradigm for Spatiotemporal Composability》里,README 直接给了 arxiv 链接。这种取法带来的直接结果是:配置本身就是架构。一个跑起来的实例不是一个写死的应用,而是一张按顺序叠出来的插件清单,清单可以被配置文件逐行改写。图1　模型负责推理,会话、提示词、工具、沙箱、适配器都在运行时这一层安装方式是命令行一条:npx @deepseek-ai/dsh web,默认在 127.0.0.1:3080 起 Web UI 并打开浏览器;从源码跑是 pnpm install、pnpm run build、pnpm dsh web。仓库明确标注当前是 developer preview(开发者预览),后续会有破坏兼容性的改动,运行前要求先读 SAFETY.md。迭代节奏从标签能看出来:从 8 月 13 日建库到 11 月 4 日,仓库上排出的标签从 dsh-v0.1.6-alpha.2 一路走到 dsh-v0.2.2-rc.1,绝大多数是 alpha 与 rc,正式版标签少见。文档本身中英对照,docs 目录下每篇说明都带一个 .zh.md 版本,架构、事件、工具管线、配置目录都有独立章节。协作入口是 GitHub Discussions 与 Discord,插件仓库打 dsh-plugin 话题标签即可被检索到。二、解决的是什么问题企业里做 Agent 落地,卡点很少在模型,而在模型外面。同一个模型,接进不同业务系统,要重新解决的问题大致是四类。一是留痕。一次任务跑了十几个工具调用,中间改了什么、依据哪条数据,事后要能复述。二是边界。工具能读哪些目录、能调哪些接口、危险动作要不要人批。三是可替换。模型换供应商、工具换实现、入口从网页换到命令行换到自家系统,不希望每次都重写一遍。四是差异。不同岗位需要不同的工具集和不同的审批策略,而不是所有人共用一个配置。dsh 的做法是把这四类问题分别落成可插拔的部件,再用一层配置把部件组合起来。三、关键机制插件树与四层配置。 一个跑起来的 dsh 是启动时按顺序叠加出来的插件树。仓库用两个概念描述这件事:profile(配置档)是 Harness 主目录里的一个命名组合,列出它叠了哪些 bundle(分发包);bundle 是 Cordis 配置行及其对应代码的分发格式。官方自带五个档:web、headless、sdk、sdk-minimal、acp。web、headless、sdk、acp 共享第一层 dsh-base——模型适配器、工具、持久化、沙箱与审批策略、设置、凭据、遥测;web 档再加浏览器应用,headless 档加无服务端的一次性执行器,sdk 档加 JSON-RPC 服务端,acp 档加只面向自动化的入口。sdk-minimal 是刻意的例外:它不套 dsh-base,自带一棵完整的 SDK 树。层叠顺序是:profile 里排好序的 bundle、它的 cordis.patch.yml、主目录 patch,最后是命令行 --patch 覆盖。patch 按行的 id 定位,整段替换该行配置,或插入新行。想知道本机启动时到底叠了什么,跑 dsh --profile web --dump-config 就能打印出整棵树,打印出来的任何一行都可以被自己的 patch 换掉。图2　一个实例的叠加顺序,以及 dump-config 的自省方式三个核心包。 会话侧是 core/session,维护只追加的 SessionEvent 日志和内存里的存储;提示词侧是 core/system-prompt,负责分段拼装和工具 schema 的组装;执行侧是 core/tools,一个带作用域的工具注册表加一条受保护的执行管线。Agent 接口与默认驱动器分在 core/agent 和 core/agent-loop,模型与流式的词汇、适配器接口在 llm/llm。三类事件。 会话事件是会落盘的事实,通过 session/event 广播;Agent 事件(agent/*)携带活的 Agent,覆盖收件箱、单步、状态、请求、校验、续跑;能力事件(fs/*、tools/*、telemetry/*)用来在不引入主循环的前提下挂策略和适配器。文档特别点了两类监听器的差别:agent/pre-step、agent/request、llm/stream 以及三个 tools/* 是 waterfall(瀑布式)事件,监听器必须调用 next() 才会继续往下传;agent/turn-stopping 是串行事件,没有 next()。一轮是怎么跑的。 文档把"步"和"轮"分得很清楚:一步是一次模型请求加上它调起的工具;一轮是零到多步,从认领第一条输入开始,到没有任何欠账为止。流程上依次是 turn/start、认领输入、快照模型选择、组装提示词与工具 schema,然后 step/start;模型返回的工具调用走 tools/pre-execute、tools/execute、tools/post-execute 三段管线,结果写入 tool/result,进入 step/end;如果工具还欠一次请求,或者又来了新输入,就认领下一步;最后 agent/turn-stopping、turn/end 收口。失败的步骤会把缺失的工具结果记录下来,不会静默丢掉。图3　一轮里的步骤流转,工具调用走三段管线多入口。 除了 Web UI,还有 Electron 桌面应用,自带同一版本的 dsh 运行时,独占一个 desktop 配置档;还有 Python SDK,通过 stdio 上的换行分隔 JSON-RPC 驱动 dsh --profile sdk。桌面版与 npm 版共用产品数据,但包管理、激活状态和锁文件各自独立。图4　四种入口共用同一层底座仓库的 packages 目录下有五十多个包,除核心外还包括 sandbox、guard(护栏)、mcp、skill、subagent、team、browser-use、computer-use、terminal、jobs、schedule、lsp、compaction(上下文压缩)、plan、todo、workflow、workspace、credentials、telemetry 等。插件生态的发现方式是给仓库打上 dsh-plugin 话题标签。四、对应的企业场景这类运行时能力,对应的是企业把 Agent 接进现有系统时必须处理的几个动作。· 会话留痕 → 只追加的会话事件日志,对应一次作业的完整过程记录:谁发起、调了哪些工具、读了哪些数据、哪一步失败。· 工具与权限 → 带作用域的工具注册表加执行管线,对应"哪些岗位能用哪些工具、危险动作走不走审批"的策略落点;沙箱与审批策略是 dsh-base 的固定组成。· 系统集成 → mcp、api 等包,对应把 ERP、MES、OA 这类系统的接口注册成模型可调用的工具,而不是把接口逻辑写死在提示词里。· 差异化配置 → profile 与 patch 层叠,对应同一套底座在不同分公司、不同部门之间只改配置不改代码。· 入口选择 → 同一运行时对外提供 Web、桌面、SDK、无服务端四种入口,对应个人使用、内网部署、嵌进自有系统三种交付形态。五、现状数据项值仓库deepseek-ai/deepseek-harnessstar278,465fork34,237语言TypeScript许可MIT创建时间2026-08-13最近提交2026-11-04最新标签dsh-v0.2.2-rc.1话题标签ai-agents、cordis、dsh、dsh-plugin状态developer preview,声明会有破坏兼容性的变更文档站deepseek-harness.github.io/deepseek-harness项目地址:github.com/deepseek-ai/deepseek-harness
模型之外的那层结构:Harness
同一模型接不同系统,改的是这一层,不是提示词
Harness 运行时(dsh)
模型(LLM)
DeepSeek 或其它供应商
会话日志
提示词组装
只追加的事件记录
分段拼接与 schema
流式返回
推理与生成
工具调用意图
工具注册表
沙箱与审批
带作用域,受管线约束
危险动作走策略
流式返回
请求
模型适配器
设置/凭据/遥测
模型的边界到此为止
换供应商只换插件
随包下发
文档口径:模型适配器、工具注册表、会话日志,乃至Agent主循环本身,都是插件,
可由配置替换;仓库里没有需要打补丁的核心。
一个实例是怎么叠出来的
profile 里排好序的 bundlecordis.patch.yml主目录patch命令行-patch
装完之后自省
1 profile 里的 bundle
自带web/headless/sdk/sdk-minimal/acp五个档
$ dsh --profile web\
--dump-config
2该 profile 的 cordis.patch.yml
打印本机启动时叠加出
按行id替换或插入配置行
的整棵插件树,任何一
行都可以被自己的
patch 换掉
3主目录 patch
本机长期生效的覆盖
4命令行--patch
次性实验,改完即用
profile=一个命名组合,列出它叠了哪些bundle;bundle=Cordis配置行及其代码的分发格式。
一轮(turn)里怎么跑
一步=一次模型请求加上它调起的工具;一轮=零到多步
turn/start
认领输入
组装提示词与
step/start
模型请求
工具 schema
工具调用走三段管线
还有欠账就回去认领下一步
pre-execute
execute
post-execute
校验与拦截
实际执行
结果加工
一轮的边界:从认领第一条
输入开始,到没有任何欠账
为止。
step/end
agent/turn-stoppingturn/end
同一套运行时的四种入口
入口不同,底座是同一棵树
Web Ul
Electron 桌面
headless
Python SDK
默认127.0.0.1:3080
自带同版本运行时
无服务端一次性执行
stdio 上的JSON-RPC
dsh-base:模型适配器·工具·持久化·沙箱与审批策略·设置·凭据·遥测
web/headless/sdk/acp四档都叠这一层;sdk-minimal 是刻意的例外,不套dsh-base。
会话事件日志·插件树·工具执行管线

**URL:** http://mp.weixin.qq.com/s?__biz=MzI1NjkzNDE3Mg==&mid=2247484562&idx=1&sn=79c21d7a62e0671ab42191602e65540a&chksm=ebacdbea7600311c1ef87405fccd1559f4c005fc865f1d4dfb87f6aaf48721e98f7ae0be4616#rd

---

## 4. [DeepSeek把战场搬到了“驾驭层”,大模型竞争的真正战场正在转移](https://news.china.com/socialgd/10000169/20261110/49856671_all.html)

DeepSeek把战场搬到了“驾驭层”,大模型竞争的真正战场正在转移 中华网。 对于普通用户而言,这样的技术安排可能并不容易直接感知,但对于需要长期使用人工智能工具的开发者来说,灵活性具有实际价值。 不同项目对人工智能的要求可能完全不同。 有的团队只希望模型帮助读取文件和修改代码,有的团队需要同时调用搜索工具、数据库和测试环境,还有的企业希望将人工智能接入内部业务系统,完成特定的自动化流程。 如果一款产品的所有功能都被固定在统一框架之中,用户想要增加新能力,往往需要等待官方更新。 而采用插件机制之后,开发者可以自行增加功能,也可以直接使用其他人已经制作好的插件,从而减少重复开发。 DeepSeek Harness的底层建立在名为Cordis的插件系统之上。Cordis负责组织各个功能模块,使插件之间能够通过统一的服务和事件机制协同运行。 这种设计使Harness更像一个可以自由组装的工作平台,而不仅是一款拥有固定功能的人工智能助手。 为了让不同类型的用户更容易上手,官方还准备了四种运行模式。 其中,标准模式提供较为完整的工具组合,能够支持文件编辑、命令执行、资料检索和多步骤工作流程;PTC模式则允许模型通过生成代码组织多次工具调用,适合需要连续操作的复杂任务;极简模式只保留少量基础工具,便于测试和比较模型在特定环境下的表现;创造模式则允许开发者检查系统运行状态、尝试不同插件组合,并建立适合自己需求的工作模式。 四种模式并不是四套相互独立的产品,而是在同一个插件体系上形成的不同配置。 用户既可以直接使用官方提供的方案,也可以根据项目要求进一步调整。 这种设计降低了开发者定制智能体的门槛,也让Harness拥有了更大的应用空间。 另一个值得关注的特点,是DeepSeek Harness在模型选择方面保持了相对开放的态度。 用户可以根据接口兼容情况和实际配置,接入不同厂商提供的大模型服务,包括Anthropic、OpenAI,以及国内月之暗面的Kimi、智谱的GLM等模型。 换句话说,使用DeepSeek Harness,并不意味着必须选择DeepSeek自己的模型。 这与Claude Code主要围绕Claude模型、Codex主要围绕OpenAI模型提供服务的产品路线有所不同。 从短期来看,允许用户接入竞争对手的模型,似乎会削弱DeepSeek自家模型的独占优势。但从长期生态建设的角度看,这种开放方式也可能带来更大的用户基础。 对于开发者来说,模型并不是一成不变的选择。

**URL:** https://news.china.com/socialgd/10000169/20261110/49856671_all.html

---

## 5. [DeepSeek Harness: Difference between revisions](https://primo.ai/w/index.php?diff=54940&oldid=45888)

DeepSeek Harness: Difference between revisions PRIMO.ai。 The model adapter, tool registry, agent loop, session storage, sandbox, scheduling, and even the Web UI are all plugins running on the Cordis framework, so developers can swap any part without patching a privileged core. DeepSeek's own shorthand for the idea is "Model + Harness = Agent": the model reasons, and the harness does everything else. DeepSeek Harness moves DeepSeek beyond the model itself: an open, swappable agent runtime that runs DeepSeek V4 by default, accepts rival models just as readily, and doubles as the reference environment for DeepSeek's own agentic benchmarks. The Mechanism: Cordis acts as a small kernel that loads and unloads plugins and manages the dependencies between them. Every registration a plugin makes is an effect that unwinds when the plugin unloads. Plugins add capabilities, and presets decide which of those capabilities a given agent can see. The monorepo ships 49 packages (including core, llm, mcp, sandbox, context, plan, and goal), and launch coverage counted more than 100 first-party plugins. Every run is recorded by Trajectory, an append-only session log stored as zstd-compressed JSONL. It captures system prompts, reasoning, tool calls and results, and subagent scheduling, and you can inspect, resume, fork, search, and replay any run. Cordis's design is described in the Peking University and DeepSeek paper "A Programming Paradigm for Spatiotemporal Composability," and the framework grew out of the Koishi bot ecosystem. The Physics: Every harness runs under three hard constraints: Tokens: Scaffolding costs tokens before any real work begins. In one hands-on test, a trivial "reply PONG" task consumed about 13,467 input tokens on its first request, because default system prompts, tool schemas, injected repository rules, and skill summaries all ride along. Isolation: The default sandbox keeps writes inside the workspace and temporary folders, but reads and network access are not confined. Footprint: One review measured an npm install of 531 packages and 306 MB on macOS. Pricing: Model costs compound all three, since DeepSeek moved V4 Flash and V4 Pro to peak and off-peak billing starting August 16, 2026. Why This Matters: Harness gives developers an open, MIT-licensed alternative to closed coding agents like Claude Code and Codex, without locking them into DeepSeek's models. Model-agnostic: Its providers guide also covers Anthropic, OpenAI, Moonshot AI, Z.ai, and any OpenAI-compatible gateway, and it can even spawn Claude Code or Codex as subagents. Checkable benchmarks: DeepSeek measured its own models inside this harness. The V4 Flash Terminal-Bench 2.1 score of 82.7 came from Minimal mode, so anyone can now try to reproduce or challenge it. Business model: Releasing a free harness on the same day as an API price increase signals a "free orchestration, paid inference" strategy. Agent Presets Harness ships with four presets, each loading a different set of plugins: Preset What It Loads Best Used For Standard Full coding agent: file editing, shell, file and web search, skills, planning, goals, subagents, and workflows. The default for most work. Code (PTC, "programmatic tool calling") Everything in Standard, plus a Code Mode SDK that lets the model write TypeScript programs chaining multi-step tool calls. Complex orchestration. It can also multiply side effects and tool calls. Minimal Persistent bash plusstr_replace_editoronly. Reproducing benchmark runs. DeepSeek used it for the V4 Flash Terminal-Bench 2.1 result. Creator (preset directory namedcordis) Standard plus runtime inspection, in-memory plugin experiments, and preset authoring. The agent can install, replace, or remove plugins mid-conversation. Building and testing plugins. Not a production approval layer. Getting Started Requirements: Node.js 22.19 or newer in the 22.x line, or Node.js 24 and later. Launch: Run npx @deepseek-ai/dsh web. The Web UI serves at http://127.0.0.1:3080 by default. Configure: Open Settings, then Models, paste a DeepSeek API key, and choose a workspace. The default model is DeepSeek V4 Flash, and the default permission policy is workspace-write with approval prompts for anything broader. Configuration home: Settings live in ~/.dsh unless you set DSH_HOME. Other entry points: headless one-shot runs (dsh --profile headless "task") an official Python SDK (pip install deepseek-harness-sdk) that drives the harness over JSON-RPC stdio --dump-config, which prints the assembled plugin tree Plugins: Add one with dsh plugin --profile web add "github:owner/repo#ref".

**URL:** https://primo.ai/w/index.php?diff=54940&oldid=45888

---

*Found 5 results • Provider: 1 • Search performed on 2026-11-15*
````
