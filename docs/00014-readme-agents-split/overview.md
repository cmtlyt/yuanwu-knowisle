# 00014 · README 收敛与 AGENTS.md 拆分

> 2026-11-13 ｜ 由原 `overview.md`「README 收敛」章节拆出 ｜ [索引](../README.md) ｜ [文档分工](migration.md)

## 目标

用户要求「清理 README 里无效内容、专注项目介绍，其余 agent 注意事项移到 AGENTS.md」。

## 变更

- README 由 179 → 92 行：只留项目定位 / 特性 / 技术栈 / 运行 / 课程路由 / 目录结构 / 架构 / 版本基线 / 文档索引 / 使用须知，并新增指向 `AGENTS.md` 的链接与文档表。
- 新建根目录 `AGENTS.md`（128 行，10 节）：问题闭环（强制）、命令速查、质量门禁与覆盖范围、提交规范与 hooks、文件命名、TS 7 + Oxc 工具链约束、内容与架构约束、项目级 skill 与仓库范围、已知限制、收尾纪律。
- 三段历次「实测」流水账从 README **删除**（结论已在当时的 `overview.md`、`docs/migration.md` 与记忆日志留存），不搬进 `AGENTS.md`。
- 同步：`overview.md` 的「命名约定写进 README」改指 `AGENTS.md`；`course-builder/SKILL.md` 与 `pitfall-resolver/references/git-hooks-editor.md` 的命名例外补 `AGENTS.md`；项目级 `MEMORY.md` 新增「文档分工」约定。

## 验证

`AGENTS.md` 可追踪；md 被 oxfmt 忽略且不在 lint-staged 扩展名 glob 内。`fmt:check`（34 文件）/ `lint` 0e19w / `typecheck` 0e21w / `verify` 复跑全绿；真实索引仍 0、无 stash、无提交。

## 后续

[00015](../00015-scripts-and-docs-reorg/overview.md) 把 `overview.md` 与 `docs/migration.md` 也按任务拆进 `docs/` 编号目录，README 文档表随之改指向 `docs/README.md`。
