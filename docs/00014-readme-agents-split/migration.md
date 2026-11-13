# 00014 · 文档分工调整：README 收敛为项目介绍

> 2026-11-13 ｜ 由原 `docs/migration.md`「文档分工调整」章节拆出 ｜ [索引](../README.md) ｜ [任务总览](overview.md)

原 `README.md` 混入了提交规范、hooks、文件命名、项目级 skill、工具链决策、历次回归实测等内容，共 179 行，已不适合作为项目入口。

| 处理 | 内容 |
|---|---|
| 保留在 `README.md` | 项目定位、特性、技术栈、运行命令、课程路由、目录结构、架构分层、版本基线、文档索引、使用须知；新增指向 `AGENTS.md` 的链接与文档表 |
| 新增 `AGENTS.md` | 问题闭环、命令速查、质量门禁与覆盖范围、提交规范与 hooks、文件命名、TS 7 + Oxc 工具链约束、内容与架构约束、项目级 skill 与仓库范围、已知限制、收尾纪律 |
| 直接删除（无效内容） | 三段历次「实测」流水账（工具链迁移后 / hooks 落地后 / skill 拆分后）与重复的回归数字——这些结论已在当时的 `overview.md`、本文件与记忆日志中留存，不再是 README 的职责 |
| 同步引用 | `overview.md` 的「命名约定写进 README」改指 `AGENTS.md`；`course-builder/SKILL.md` 与 `pitfall-resolver/references/git-hooks-editor.md` 的命名例外补 `AGENTS.md`；项目级 `MEMORY.md` 新增「文档分工」约定 |

`AGENTS.md` 为全大写标准文件名，属命名约定例外；md 文件被 oxfmt 忽略，也不在 lint-staged 的扩展名 glob 内，不影响任何门禁。

## 后续

`overview.md` 与本文件（原 `docs/migration.md`）于 [00015](../00015-scripts-and-docs-reorg/overview.md) 按任务拆入 `docs/NNNNN-*/`，本目录即 00014 的对应记录。
