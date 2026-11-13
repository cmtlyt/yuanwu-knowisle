# 00015 · 清理无效 npm script + 任务记录目录化

> 2026-11-13 ｜ [索引](../README.md)

## 目标

用户提出两项：① 清理 `package.json` 中的无效 script；② 迁移记录与 overview 统一放到 `docs/` 下，按「一次任务一个目录」组织（目录名编号开头 + 任务名，如 `00001-init`），不再一直改同一份文件。

## 一、脚本清理

删除 3 个从未被文档 / 流程引用、且与实际工作流冲突的脚本：

| 移除 | 原命令 | 理由 |
|---|---|---|
| `generate` | `nuxt generate` | Nuxt 脚手架残留；本项目是 Nitro SSR 站点，不做静态生成，全库无引用 |
| `preview` | `nuxt preview` | 生产预览统一用 `PORT=3100 node .output/server/index.mjs`，两个入口重复且从未使用 |
| `smoke` | `python scripts/smoke.py` | pnpm 11 会把 `--` 原样透传给 Python，且脚本默认 base 是 3100，与实际 3199 临时服务不符；流程统一直接调用 `python scripts/smoke.py --base ...`。**脚本文件本身保留不变** |

保留 10 个：`build` / `dev` / `postinstall` / `prepare` / `verify` / `lint` / `lint:fix` / `typecheck` / `fmt` / `fmt:check`。`AGENTS.md` 第 2 节已同步说明。

## 二、任务记录目录化

- 把累积了历次任务的根目录 `overview.md`（110 行）与 `docs/migration.md`（231 行）**按任务切片**迁入 15 个编号目录：`00001-init` … `00015-scripts-and-docs-reorg`。
- 每个任务目录至少一份 `overview.md`（目标 / 变更 / 验证 / 注意事项）；涉及迁入、映射或工具链切换的 7 个任务另附 `migration.md`。
- 新增 `docs/README.md` 作为唯一索引与约定说明；目录间用相对链接互指，历史结论失效时在新目录标注（如 00004 → 00005、00011 → 00012）。
- 拆分前两份文件已备份到 `/tmp/knowisle-overview-before-reorg.md` 与 `/tmp/knowisle-migration-before-reorg.md`，随后从仓库删除。
- 约定写进 `AGENTS.md` 第 11 节与项目级 `MEMORY.md`：**新任务新建目录，不追加到旧文件或旧目录**；`README.md` 文档表改指向 `docs/README.md`。

## 验证

- `pnpm install --frozen-lockfile` 通过（scripts 不进 lockfile，删除不影响可复现性）。
- `pnpm fmt:check`（34 文件）、`pnpm lint` 0 errors / 19 warnings、`pnpm typecheck` 0 errors / 21 warnings、`pnpm verify` 全绿。
- `pnpm build` 成功（30.1s）；Nuxt Content 的 `_content_docs` 仍为 **1** 篇，确认 `content.config.ts` 的 `docs/**/*.md` 是相对 `content/`，仓库根 `docs/` 下 24 个 md 未被收录、未生成额外路由。
- `docs/` 内所有 Markdown 相对链接解析后均指向存在的文件；md 被 oxfmt 忽略、也不在 lint-staged 扩展名 glob 内，不影响任何门禁。
- 真实索引仍为 0 文件、无 stash、无提交，本次未执行 `git add`。
