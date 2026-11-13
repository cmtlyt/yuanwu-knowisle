# 00004 · WorkBuddy 工作区内容整体迁入（历史状态）

> 2026-11-13 ｜ 由当日记忆日志拆出 ｜ [索引](../README.md) ｜ [迁移映射](migration.md)
>
> **本节记录的是已被撤销的历史状态**：归档目录与 `dist` 例外随后由用户手动删除，最终范围见 [00005 范围调整](../00005-migration-scope-adjustment/overview.md)，**以 00005 为准**。

## 目标

用户要求「把整个工作区迁移到这个仓库」。确认三项：全部迁入 + 归档去重、复制保留源、放开 skill 忽略并 `git add`（不 commit）。

## 当时的处理

| 内容 | 当时的位置 |
|---|---|
| 旧静态课程应用 `effect-course/`（11 文件） | `archive/effect-course/`（历史归档，新增 `README.md` 说明） |
| course-builder 项目级 skill（6 文件） | `.workbuddy/skills/course-builder/` |
| skill 分发包 | `dist/course-builder.zip` |
| 本机记忆日志 | 与仓库已有版本按行合并（共同前缀 34 行，只追加工作区独有的 6 行） |

`.gitignore` 当时改为 `.workbuddy/*` + `!.workbuddy/skills/`，并新增 `!dist/` + `dist/*` + `!dist/course-builder.zip`。

## 当时的踩坑

归档应用的 `scripts/verify.js` 用 CommonJS `require`，根 `package.json` 带 `"type": "module"` 导致新位置报 `ReferenceError: require is not defined`；修法是在归档目录加 `package.json` 声明 `"type": "commonjs"` + `"private": true`。该归档目录现已不存在。

## 验证（当时）

- 逐文件 SHA-256 比对：旧静态应用 11/11、skill 6/6、zip 全一致。
- 归档 `verify.js`、`pnpm verify`、`pnpm build`、skill 的 `check-course.mjs` 全绿；32 个文件已 `git add`，未 commit，源工作区资产未改动。
- `git check-ignore` 确认 `memory/` 与 `dist/` 其它内容忽略、`skills/` 与 zip 可追踪。

## 后续

用户手动删除归档目录与 `.gitignore` 的 dist 例外 → [00005 范围调整](../00005-migration-scope-adjustment/overview.md)；随后取消全部暂存 → [00006 取消暂存](../00006-unstage-all/overview.md)。
