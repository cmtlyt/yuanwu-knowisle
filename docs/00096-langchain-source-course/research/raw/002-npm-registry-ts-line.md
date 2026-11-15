# 检索 002 · TypeScript 线版本基线（npm registry 官方一手源）

- 日期：2026-11-15
- 来源：`https://registry.npmjs.org/langchain/latest`、`/@langchain/core/latest`、`/@langchain/langgraph/latest`
- 级别：**A 级**（官方 registry 元数据，`/_npmUser` 为 GitHub Actions trustedPublisher，带 SLSA provenance attestation）
- 关键结论：**TS 线版本与 Python 线（raw/001）完全不同，禁止混用**。

## langchain (JS) @ 1.6.6
- name `langchain`，version **1.6.6**，license MIT，type module，engines `node >=20`
- tarball `langchain-1.6.6.tgz`，fileCount 516，unpackedSize 3,422,987
- repository `git+ssh://git@github.com/langchain-ai/langchainjs.git`
- homepage `https://github.com/langchain-ai/langchainjs/tree/main/libs/langchain/`
- **dependencies**：`zod ^4.6.6`、`langsmith >=0.11.0 <1.0.0`、`@langchain/langgraph ^1.6.1`、`@langchain/langgraph-checkpoint ^1.1.5`
- **peerDependencies**：`@langchain/core ^1.4.1`
- 入口 `./dist/index.js`（源码输入 `./src/index.ts`）；子路径导出：`.` / `./hub` / `./load` / `./tools` / `./browser` / `./hub/node` / `./load/serializable` / `./storage/{in_memory,file_system,encoder_backed}` / `./chat_models/universal`
- devDeps 版本信号：`@langchain/openai 1.8.4`、`@langchain/anthropic 1.6.5`、`@langchain/langgraph-sdk ^1.12.0`、`typescript ~7.0.2`、`vitest ^5.0.5`

## @langchain/core @ 1.4.1
- version **1.4.1**，license MIT，engines `node >=20`
- dependencies：`@cfworker/json-schema ^4.1.4`、`@standard-schema/spec ^1.1.0`、`js-tiktoken ^1.0.12`、`langsmith >=0.11.0 <1.0.0`、`mustache ^4.2.0`、`p-queue ^6.6.2`、`zod ^4.6.6`
- 注意：core 的 latest 只有 `/package` 一个 exports，主入口元数据在此响应中被裁剪；以仓库源码为准。

## @langchain/langgraph @ 1.7.4
- version **1.7.4**，license MIT，engines `node >=18`
- repository `git+ssh://git@github.com/langchain-ai/langgraphjs.git`，directory `libs/langgraph-core`
- **dependencies**：`@langchain/protocol ^0.0.21`、`@standard-schema/spec 1.1.0`、`@langchain/langgraph-sdk ~1.16.0`、`@langchain/langgraph-checkpoint ^1.2.2`
- **peerDependencies**：`zod ^3.25.32 || ^4.2.0`、`@langchain/core ^1.3.4`
- 子路径导出揭示源码结构：`./`(`src/index.ts`)、`./web`、`./zod`(`src/graph/zod/`)、`./pregel`(`src/pregel/`)、`./remote`、`./stream`、`./channels`(`src/channels/`)、`./prebuilt`(`src/prebuilt/`)——**Pregel 运行时 / Channels / Prebuilt 是内核三大块**。
- 独立仓库 `langchain-ai/langgraphjs`（不在 langchainjs monorepo 主树内，需单独取证）。

## 版本基线锁定（用于课程 META）
- `langchain@1.6.6` + `@langchain/core@1.4.1` + `@langchain/langgraph@1.7.4` + `zod@4.6.6` + `node>=20`
- 快照日期：2026-11-15；后续所有源码取证以仓库**具体 commit** 为准（见 raw/003）。
