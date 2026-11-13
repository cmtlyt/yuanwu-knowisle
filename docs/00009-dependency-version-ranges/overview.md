# 00009 · hooks 依赖改用 `^` 语义化范围

> 2026-11-13 ｜ 由当日记忆日志 + 原 `docs/migration.md`「依赖版本口径」拆出 ｜ [索引](../README.md)

## 目标

用户指出「这几个依赖不需要锁定版本」。[00008](../00008-commit-hooks/overview.md) 落地时 `pnpm add -D husky@9.1.7 ...` 带了精确版本号，pnpm 照原样写进 `package.json`，并非有意锁定。

## 变更

| 依赖 | 原 | 现 |
|---|---|---|
| `husky` | `9.1.7` | `^9.1.7` |
| `@commitlint/cli` | `21.2.4` | `^21.2.4` |
| `@commitlint/config-conventional` | `21.2.4` | `^21.2.4` |
| `lint-staged` | `17.6.0` | `^17.6.0` |

这四个是纯工具链、与 TypeScript 版本无绑定，用 `^` 与其余 devDependencies 风格一致。

## 保留精确锁定

Oxc 三个包（`oxlint@1.93.0`、`oxfmt@0.78.0`、`oxlint-tsgolint@7.0.2007`）不动：`oxlint-tsgolint` 版本绑定 TS 7 小版本，且 Oxc 迭代较快，放开容易破坏已验证的规则与格式基线。

## 验证

`pnpm install` 同步 `pnpm-lock.yaml` 的 `specifier`，解析出的 `version` 仍是 `9.1.7 / 21.2.4 / 21.2.4 / 17.6.0`；`pnpm install --frozen-lockfile` 通过。**可复现性一直由 lockfile 承担**，精确版本只是额外挡住了补丁更新。

复跑 `fmt:check`（32 文件）/ `lint` 0e19w / `typecheck` 0e21w / `verify` 全绿，commitlint 合法 / 非法仍为 0 / 1、pre-commit 空索引正常；真实索引仍 0、无 stash、无提交。

## 口径同步（当时）

`README.md`、`overview.md`、`docs/migration.md` 的版本描述同步为「精确锁定只保留 Oxc 三个包」；这三份文件现已按任务拆分，见 [索引](../README.md)。
