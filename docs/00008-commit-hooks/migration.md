# 00008 · 配置映射：husky + commitlint + lint-staged

> 2026-11-13 ｜ 由原 `docs/migration.md`「提交门禁」章节拆出 ｜ [索引](../README.md) ｜ [任务总览](overview.md)

在 [00007 Oxc 迁移](../00007-oxc-toolchain-migration/overview.md) 完成后补齐提交规范与暂存检查。用 husky 9 承载 hook（随仓库共享、`pnpm install` 自动接入），commitlint 校验 Conventional Commits，lint-staged 把 oxfmt / oxlint 限定在暂存文件。

## 映射

| 新增 | 版本 / 作用 |
|---|---|
| `husky@^9.1.7` | `prepare: husky` 设置 `core.hooksPath=.husky/_` |
| `@commitlint/cli@^21.2.4`、`@commitlint/config-conventional@^21.2.4` | Conventional Commits 校验（两个包保持同主版本） |
| `lint-staged@^17.6.0` | 暂存文件任务编排（要求 Node ≥22.22.1，本机 22.22.2 满足） |
| `.husky/pre-commit`、`.husky/commit-msg` | 两个 hook 命令 |
| `.commitlintrc.json`、`.lintstagedrc.json` | 规则与任务配置（点文件，符合命名约定） |

`package.json` 新增 `prepare` 脚本；`pnpm-lock.yaml` 同步更新。

## 配置口径

- commitlint 沿用 conventional 默认，只显式化 type 白名单与 `header-max-length: 100`；**不启用 `scope-enum`**，scope 可选且取值不限。`Merge` / `Revert` / `fixup!` 等消息由 CLI 默认忽略规则放行。
- lint-staged 按扩展名分流：`.ts/.vue/.mjs/.js/.cjs` 先 `oxfmt` 写回、再 `oxlint` 快速检查；`.json/.jsonc` 只 `oxfmt`。点开头的配置文件也能命中（实测 `.commitlintrc.json` 匹配 `*.{json,jsonc}`）。
- hook 内不跑 `typecheck` / `verify` / `build`，保持提交速度；重检查仍由手动命令或 CI 承担。

## 验证

- `git hook run commit-msg -- <msgfile>`：合法消息退出 0，非法消息输出 `type-empty` / `subject-empty` 并退出 1；`git hook run pre-commit` 在空索引下正常提示「无暂存文件」并退出 0。
- 用 `GIT_INDEX_FILE` 指向临时索引（不触碰真实索引）暂存 5 个文件跑 pre-commit：oxfmt / oxlint 三个任务全绿、自动重新暂存，工作区文件 hash 未变。
- 故障注入：暂存一个语法错误的 `.ts`，oxfmt 报 `Expected ) but found EOF`，hook 退出 1 阻断；探针文件已删除。
- 回归：`pnpm fmt:check`（32 文件）、`pnpm lint` 0e/19w、`pnpm typecheck` 0e/21w、`pnpm verify` 全绿；`pnpm install --frozen-lockfile` 与 `pnpm run prepare` 正常。真实索引始终 0 文件、`git stash list` 为空。

## 依赖版本口径

四个 hooks 依赖是纯工具链、与 TypeScript 版本无绑定，统一用 `^` 语义化范围（与其余 devDependencies 一致），不写精确版本：`pnpm install` 已同步 `pnpm-lock.yaml` 的 `specifier`，解析出的 `version` 仍为 `9.1.7` / `21.2.4` / `21.2.4` / `17.6.0`，`pnpm install --frozen-lockfile` 通过。可复现性由 lockfile 承担，精确锁定只会挡住补丁更新。

Oxc 三个包（`oxlint@1.93.0`、`oxfmt@0.78.0`、`oxlint-tsgolint@7.0.2007`）仍**保持精确锁定**：`oxlint-tsgolint` 的版本与 TS 7 小版本绑定，且 Oxc 迭代较快，随意升级会破坏已验证的规则与格式基线。版本的最终调整见 [00009](../00009-dependency-version-ranges/overview.md)。

## 注意事项

- 仓库尚无初始提交时 lint-staged 会输出 `Skipping backup because there's no initial commit yet` 并跳过备份 stash；首次提交后即恢复常规备份机制。
- Windows 上 `.husky/` 下的 hook 文件不依赖可执行位（husky wrapper 以 `sh -e` 执行）；从 GUI 客户端提交需保证 `pnpm` 在 PATH 中。
- `.husky/_/` 由 husky 生成，通过自身的 `.gitignore`（内容为 `*`）忽略，不入库。
- `pnpm peers check` 仍有两条 unmet peer（`unctx` 期望 `oxc-parser>=0.140`、`unplugin^3.3.0`），来自既有 Nuxt 依赖，不阻塞构建。
