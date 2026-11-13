# 00006 · 取消所有暂存

> 2026-11-13 ｜ 由当日记忆日志拆出 ｜ [索引](../README.md)

## 目标

用户要求「取消所有暂存」，目标是清空 Git 索引、保留工作区全部文件。

## 处理

仓库 `main` 分支尚无提交、不存在 `HEAD`，因此 `git reset HEAD` / `git restore --staged` 无法解析目标。改用把索引直接置为空树的等效操作（`git read-tree --empty`），只改索引、不触碰工作区。

## 结果

| | 执行前 | 执行后 |
|---|---|---|
| 索引文件数 | 32 | 0 |
| 暂存改动 | 12 `A` + 13 `AD` + 7 `AM` | 无（`git diff --cached` 为空） |
| 状态码分布 | 11 `??` + 32 暂存项 | 全部 `??` |

顺带消除了 [00005](../00005-migration-scope-adjustment/overview.md) 遗留的两处索引残留：13 个磁盘上已不存在的 `archive/effect-course/` 条目，以及暂存区中仍含 `dist` 例外的旧 `.gitignore`。索引与工作区口径恢复一致。

## 验证

- 关键文件均在：`README.md`、`overview.md`、`docs/migration.md`、`.gitignore`、`nuxt.config.ts`、`app/data/effect-course.ts`、`dist/course-builder.zip`（19,741 字节）——注意 zip 后来不再纳入仓库范围。
- `archive/` 仍不存在，与用户手动删除的结果一致。
- 未跟踪的 `.gitignore` 规则照常生效：`dist/course-builder.zip` 与 `.workbuddy/memory/` 被忽略，`.workbuddy/skills/` 可追踪。
- 仓库仍无提交历史，真实索引 0 文件、无 stash 残留。
