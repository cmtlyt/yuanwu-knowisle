# 00004 · 工作区迁入映射（历史状态）

> 2026-11-13 ｜ [索引](../README.md) ｜ [任务总览](overview.md)
>
> **以下映射已部分失效**：`archive/` 与 `dist/course-builder.zip` 均由用户手动删除，最终状态见 [00005](../00005-migration-scope-adjustment/migration.md)。

源：`C:/Users/cmtlyt/WorkBuddy/学习/`（工作区全部内容，336 KB / 20 个文件）
目标：`D:/code/@cmtlyt/yuanwu-knowisle/`

## 当时的决策

- **全部迁入 + 归档去重**：旧静态应用与站内 Nuxt 课程内容重复，归档而非并列摆放，避免两套课程代码混淆。
- **复制并保留源**：源工作区原样保留，迁移完全可逆。
- **放开 skill 忽略并 git add**：`.workbuddy` 原本被整体忽略，改为只忽略 `memory/`，让 skill 与分发包可随仓库共享；`git add` 但不 commit。

## 映射表（当时）

| 源 | 目标 | 处理 |
|---|---|---|
| `effect-course/`（11 文件） | `archive/effect-course/` | 完整复制 + 新增 `README.md` 说明归档状态、运行方式与不同源限制 |
| `.workbuddy/skills/course-builder/`（6 文件） | `.workbuddy/skills/course-builder/` | 完整复制，项目级 skill 随仓库共享 |
| `course-builder.zip` | `dist/course-builder.zip` | 完整复制；因 `dist` 原被忽略，在 `.gitignore` 加单文件例外 |
| `.workbuddy/memory/2026-11-13.md` | 同名文件 | 按行合并：两份日志前 34 行一致，仅把工作区独有的 6 行追加到仓库版 |
| — | `.gitignore` | `.workbuddy` → `.workbuddy/*` + `!.workbuddy/skills/`；新增 `!dist/` + `dist/*` + `!dist/course-builder.zip` |
| — | `README.md` | 增补「工作区归档与项目 Skill」章节与 skill 自检命令 |
| — | `docs/migration.md` | 追加二次迁移章节（该文件现已按任务拆分） |

## 验证（当时）

- 逐文件 SHA-256 比对：旧静态应用 11/11、skill 6/6、zip 均一致，无遗漏无损坏。
- 记忆日志合并后 8205 字节，仓库原有 30+ 行全部保留，只追加独有段落。
- `git check-ignore` 逐项验证：`memory/` 仍忽略、`skills/` 与 `dist/course-builder.zip` 可追踪、`dist/` 其余内容仍忽略。
- 新增目录不参与 Nuxt 构建；`pnpm verify`、`pnpm build` 回归通过。
- 源工作区未删除、未修改。

## 已被 00005 推翻的结论

- 「归档应用与站内课程不同源，进度需用 JSON 导出导入转移」——归档目录已不存在。
- 「修改 skill 后需重新打包 `dist/course-builder.zip`」——仓库不保存分发包，需要时现场打包。
- 「`.gitignore` 为 zip 加单文件例外」——例外已删除，`dist/` 整体忽略。
