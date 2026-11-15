# 批次 02 · WebFetch · https://deepseekharness.online/en/guide/architecture

- 核实日期：2026-11-15
- 暂存目录：`research/raw/`
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写
- 调用参数：{"url": "https://deepseekharness.online/en/guide/architecture", "prompt": "提取 DeepSeek Harness 架构文档全章细节：Cordis 插件内核与可逆副作用、Everything is a plugin 的含义、启动时的配置叠加顺序（profile/bundle/patch/--patch）与 dump-config 自省、四种运行模式各自加载什么与适用场景、append-only 会话日志记录哪些内容、turn/step 边界与工具执行三段管线、以及文档中关于安全或预览版状态的说明。保留具体术语与命令。"}
- callId：chatcmpl-tool-92bbd5f406be2e7c

---
**返回原文**

`````text
**标题**: Chapter 16 Everything Is a Plugin: Inside the Skeleton | Handbook | DeepSeek Harness

[Skip to content](https://deepseekharness.online/en/guide/architecture#VPContent)

# Chapter 16 Everything Is a Plugin: Inside the Skeleton

For the first fifteen chapters you just drove. This chapter opens the hood to show you why it can swap parts — and what to watch out for when you do.

**Difficulty** ★★★**Time** 30 minutes**Prerequisites** Chapters 9 and 12

- What "everything is a plugin" does and does not mean
- How the configuration layers stack up at startup
- Which situations each of the four run modes suits

## [In one sentence: the product is a plugin tree](https://deepseekharness.online/en/guide/architecture#in-one-sentence-the-product-is-a-plugin-tree)

Most software is one solid whole: to change a feature, you edit the source and recompile.

dsh is not like that. At startup it hangs plugins onto a tree one by one, and the product is what that tree looks like when it runs. Models, tools, sessions, the sandbox, storage, the interface — all of them are nodes on the tree.

So "modding" is not patching; it is **hanging another plugin alongside**. Mount it and it takes effect; take it off and things go back — there is no state where you broke it and cannot return.

This design principle is called "everything is a plugin." Its benefit is direct: swap a model, swap a sandbox, swap a whole interface, and you do not have to touch the rest.

## [What happens at startup](https://deepseekharness.online/en/guide/architecture#what-happens-at-startup)

At startup, dsh stacks four layers of configuration in order, and each one has higher priority than the last:

```text
bundles in the profile
      ↓
the profile's own patch
      ↓
the home-level patch
      ↓
temporary overrides from the command line --patch
```

Three terms, briefly:

- **profile**: a named assembly, such as `web` or `headless`. It lists which bundles to use, and it also stores your own changes.
- **bundle**: a distributable set of configuration plus mount code. Install it and you have added a string of nodes to the tree.
- **patch**: writes only "which item I want to change," not the whole configuration.

To see what your machine actually stacks up, run:

```sh
dsh --profile web --dump-config
```

Every item it prints can be overridden by your own patch. That is also what Chapter 19 covers.

## [Four run modes](https://deepseekharness.online/en/guide/architecture#four-run-modes)

ModeWhat's loadedGood forStandard modeThe full tool setEveryday work; the default choicePTC modeProgrammatic tool calling, where the model writes a piece of code that combines several rounds of callsBatch tasks with many tool calls and fixed stepsMinimal modeJust one shell tool plus one file-editing toolComparing model capabilities, testing in a minimal environmentCreative modeTry plugins in memory and compose new modesDeveloping plugins, experimenting with new setups

For most readers, standard mode is enough. Once you start feeling that it has "too many steps and is too slow," then go try PTC.

## [Every run leaves a trail](https://deepseekharness.online/en/guide/architecture#every-run-leaves-a-trail)

dsh writes everything the model sees into an **append-only** session log: the system prompt, the thinking process, tool calls and their results, sub-agent dispatch, every context injection.

"Append-only" means: write forward only, never rewrite history. So you can replay in full how a task got to where it is today.

In the interface's trajectory view, you can browse these records by source. Resuming a session, forking, retrieval, and replay all use the same event stream — not four sets of data each stored separately.

Chapter 18 covers how to use it to track down problems.

## [The seam: swap one provider and the whole product changes](https://deepseekharness.online/en/guide/architecture#the-seam-swap-one-provider-and-the-whole-product-changes)

The seam is the most valuable concept in dsh, but it is easy to understand: **a replaceable capability.**

A capability has three roles:

1. **Definition**: states clearly what this capability looks like (the interface)
2. **Provider**: actually implements it (for example, the local filesystem or a remote sandbox)
3. **Consumer**: the tools that use it (for example, shell and file editing)

Here is an example: the filesystem and processes share the same "execution world." Switch the provider from local to a remote sandbox, and the shell, the terminal, and the language service all move over together — no need to write a separate remote version of every tool.

That is what "swap one provider and the whole product changes" means.

## [Who's in the core packages](https://deepseekharness.online/en/guide/architecture#who-s-in-the-core-packages)

PackageWhat it handles`core/session`The append-only session log and storage`core/system-prompt`How prompt sections and tool descriptions are assembled`core/tools`The tool registry plus a gated execution pipeline`core/agent` / `core/agent-loop`The Agent interface and the default loop driver`llm/llm`Messages and streaming output, and where model adapters live

It's fine if this doesn't sink in yet — you'll come back to this table when you write plugins in Chapter 20.

## [Three common misconceptions](https://deepseekharness.online/en/guide/architecture#three-common-misconceptions)

Don't mistake the metaphor for the fact

- **"A plugin tree = microservices."** It isn't. It runs in one process, and plugins cooperate through services and events, not over the network.
- **"Everything is a plugin = you have to install everything yourself."** It doesn't. The distribution ships a complete set of assemblies, and it works out of the box.
- **"Modding means changing source code."** It doesn't. Mount a plugin and write a patch; the source can stay untouched, not a single line changed.

## [Further reading for developers](https://deepseekharness.online/en/guide/architecture#further-reading-for-developers)

- Official architecture doc: [docs/architecture.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- List of capability seams: [docs/capability-seams.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)
- Cordis primer: [docs/cordis-primer.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)

## [Next chapter](https://deepseekharness.online/en/guide/architecture#next-chapter)

Now that you understand the skeleton, the next step is bolting parts other people have already made onto the car.

[Next chapterChapter 17 The Plugin Marketplace and Themes: Bolting On Capabilities Others Have Built→](https://deepseekharness.online/en/guide/plugins-and-themes/)
`````
