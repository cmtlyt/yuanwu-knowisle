# 00011 · course-builder skill 校验流程盘点（只读）

> 2026-11-13 ｜ 由当日记忆日志拆出 ｜ [索引](../README.md)

## 目标

用户要求「检查 course-builder 这个 skill 中是否有 lint/check 等流程」。本次只读检查，未改仓库文件；修复在 [00012](../00012-pitfall-skill-and-gates/overview.md) 落地。

## 结论：有 check、没有 lint

- skill 共 6 文件 / 640 行：`scripts/check-course.mjs`（126 行）做数据一致性 / 引用完整性 / DAG / widget 映射，实测对 `app/data/effect-course.ts` + `app/lib/widgets.ts` 全绿；`references/workflow.md` 阶段 7 有 10 步全量验证；`data-model.md` 有 6 条引擎必测断言；`pitfalls.md` 有验证纪律。
- **口径过时**：全库 grep 不到 oxlint / oxfmt / typecheck / husky / commitlint / lint-staged 字样；阶段 7 第 1 步仍写 `node --check` / `esbuild.transformSync` / `tsc --noEmit`（本项目 esbuild 无法直接 require，tsc 为 7.0.2 native CLI 但非门禁），未提 `pnpm lint` / `typecheck` / `fmt:check` / `verify` 与提交门禁。阶段 3 与 `assets/course-skeleton.ts` 注释里的脚本路径写成目标项目的 `scripts/`，与实际位置不符。
- Node 22.22 默认启用 type stripping，不带 `--experimental-strip-types` 也能跑 check 脚本，属冗余而非错误。

## 实测发现的提交阻断

`.oxlintrc.json` 与 `.oxfmtrc.json` 均忽略 `.workbuddy/**`，但 skill 文件可被 git 跟踪（`.gitignore` 放行 skills/）。把 `check-course.mjs` 暂存到临时索引跑 `pre-commit`：

```
*.{ts,vue,mjs,js,cjs} — 1 file
  ✖ oxfmt → Expected at least one target file. All matched files may have been excluded by ignore rules.
husky - pre-commit script failed (code 1)
```

全库受此影响的文件仅 skill 的 `check-course.mjs` 与 `assets/course-skeleton.ts`；`content/**`、`public/**`、`dist/**` 暂未命中。用 /tmp 临时配置强制检查：这两个文件 oxlint 0w/0e（代码干净），oxfmt `--check` 均报格式差异（从未格式化过）；`node --check` 通过。

测试全程用 `GIT_INDEX_FILE` 临时索引，真实索引仍为 0、无 stash、无提交。

## 当时的修复方向（已在 00012 落地）

① 解除 lint-staged 与工具 ignore 的冲突；② 更新 workflow 阶段 7 / 硬性规则 8 的现行命令与 hooks 说明；③ 修正脚本路径注释；④ 格式化 skill 代码并把踩坑清单拆成独立 skill。
