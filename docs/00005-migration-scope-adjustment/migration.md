# 00005 · 范围调整映射：工作区迁入收敛为仅项目级 Skill

> 2026-11-13 ｜ 由原 `docs/migration.md`「范围调整」章节拆出 ｜ [索引](../README.md) ｜ [任务总览](overview.md)

曾尝试把 `C:/Users/cmtlyt/WorkBuddy/学习/` 的全部内容并入本仓库，经仓库所有者确认后收敛范围：归档目录与分发包已从工作区手动移除，**最终仅保留项目级 skill**。本节记录调整后的最终状态，[00004](../00004-workspace-migration/migration.md) 的「整体迁入」描述已失效。

## 最终状态

| 内容 | 处理 |
|---|---|
| `.workbuddy/skills/course-builder/`（6 文件） | 纳入仓库，随仓库共享 |
| `.workbuddy/memory/` | 按行合并的本机记忆，保持忽略、不入库 |
| 旧静态课程应用 `effect-course/`（11 文件） | 不归档，仓库内无 `archive/` 目录 |
| `course-builder.zip` | 不纳入仓库；`dist/` 整体忽略 |
| `.gitignore` | `.workbuddy/*` + `!.workbuddy/skills/`；`dist` 保持整目录忽略，不设单文件例外 |
| `README.md` | 增补「项目级 Skill」章节与 skill 自检命令（该章节后于 00014 移入 `AGENTS.md`） |

## 调整理由

- 旧静态应用与站内 Nuxt 课程内容重复，保留两套课程代码易造成混淆；源副本若仍需对照，不属于本仓库职责。
- `dist/` 是构建产物目录，仓库不保存 skill 分发包；需要分发时从 `.workbuddy/skills/course-builder/` 现场打包，避免分发包与 skill 不同步。
- 项目级 skill 有跨会话复用价值，故单独放行；本机记忆含个人上下文，保持私有。

## 验证

- `pnpm verify` 全绿、`pnpm build` 成功；skill 的 `check-course.mjs` 对真实课程数据与骨架均通过。
- `git check-ignore` 确认：`.workbuddy/skills/` 可追踪；`.workbuddy/memory/` 与 `dist/` 下所有文件均忽略。
- 上述目录均不参与 Nuxt 构建，移除后不影响站点运行。

## 注意事项

- 若曾把 `archive/` 或 `dist/course-builder.zip` 加入过暂存区，需从索引移除残留条目，避免首次提交带入磁盘上已不存在的文件（[00006](../00006-unstage-all/overview.md) 已处理）。
- `.workbuddy/memory/` 为个人本机记忆，保持忽略，不要提交。
- 仓库目前仍无提交历史。
