# 00005 · 按用户手动删除结果收敛迁入范围

> 2026-11-13 ｜ 由原 `overview.md`「项目级 Skill 与迁入范围」章节拆出 ｜ [索引](../README.md) ｜ [范围映射](migration.md)

## 目标

用户确认：`archive/effect-course/` 归档目录与 `.gitignore` 中的 `dist` 例外（5 行）是其**手动删除**的，非误丢；当前工作区状态即最终意图。要求按当前状态修订文档。

## 最终口径

工作区 `C:/Users/cmtlyt/WorkBuddy/学习` 的内容**未整体并入**本仓库。曾短暂迁入的归档目录与分发包已移除，最终只保留项目级 skill：

| 内容 | 最终处理 |
|---|---|
| course-builder 项目级 skill（6 文件） | `.workbuddy/skills/course-builder/`，纳入仓库、随仓库共享 |
| 原始静态课程应用（11 文件） | 不归档，仓库内无 `archive/` 目录 |
| skill 分发包 `course-builder.zip` | 不纳入；`dist/` 整体忽略 |
| 本机记忆日志 | 按行合并，保持忽略、不入库 |

`.gitignore` 最终规则为 `.workbuddy/*` + `!.workbuddy/skills/`，`dist` 保持整目录忽略、不设单文件例外。旧静态应用与站内课程内容重复，不再保留第二套代码；需要分发 skill 时从 `.workbuddy/skills/` 现场打包。

## 修订的文档（当时）

`README.md`（「项目级 Skill」章节）、`overview.md`（「项目级 Skill 与迁入范围」）、`docs/migration.md`（「范围调整」章节）移除 SHA-256 比对、归档 `package.json` 的 commonjs 修复、zip 重新打包提醒等失效描述，改为描述当前状态而非历史流水。这三份文件现已按任务拆分，见 [索引](../README.md)。

## 验证

`pnpm verify`、`pnpm build` 与 skill 的 `check-course.mjs` 全绿；`git check-ignore` 确认 `.workbuddy/skills/` 可追踪、`memory/` 与 `dist/` 均忽略。仓库**尚无提交历史**，源码仍为未跟踪状态。

## 后续

索引中仍残留 13 个已删除的 `archive/` 条目，于 [00006 取消暂存](../00006-unstage-all/overview.md) 一并清除。
