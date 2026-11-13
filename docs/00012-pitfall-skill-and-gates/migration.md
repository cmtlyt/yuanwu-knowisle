# 00012 · Skill 治理映射：踩坑知识库拆分 + 门禁范围对齐

> 2026-11-13 ｜ 由原 `docs/migration.md`「Skill 治理」主体拆出 ｜ [索引](../README.md) ｜ [任务总览](overview.md)

## 背景

盘点 `course-builder` 后确认：它有 `scripts/check-course.mjs`（数据一致性 / 引用完整性 / DAG / widget 映射，实测全绿）与 `workflow.md` 阶段 7 的 10 步全量验证，但**没有任何 lint 流程**，6 个文件里搜不到 oxlint / oxfmt / typecheck / husky / commitlint / lint-staged；阶段 7 第 1 步仍是 `node --check` / `esbuild.transformSync` / `tsc --noEmit`（本项目 `esbuild` 无法直接 require，`tsc` 为 7.0.2 native CLI 且未设为门禁）。阶段 3 与骨架注释里的脚本路径也写成目标项目的 `scripts/`，与 skill 实际位置不符。

## 拆分

| 变更 | 说明 |
|---|---|
| 新增 `.workbuddy/skills/pitfall-resolver/` | 独立项目级 skill：`SKILL.md` 用覆盖报错与异常关键词的 description + 症状速查表，AI 遇到对应问题时自动加载；`references/` 按 6 个主题拆分，全部采用「症状 → 根因 → 处理」并附实测命令 |
| 删除 `course-builder/references/pitfalls.md` | 原有 20 条踩坑全部迁入新 skill（课程 / 视口 / SSR / 工程细节 / 验证纪律），并补记工具链迁移、commitlint、VSCode 文件嵌套、Git 索引等本轮实测结论 |
| 更新 `course-builder/SKILL.md` | 资源列表与加载顺序改指向 `pitfall-resolver`；硬性规则 8 补现行质量门禁与 Git hooks 要求 |
| 更新 `references/workflow.md` | 阶段 7 第 1 步改为 `fmt:check` / `lint` / `typecheck`，第 2 步并列 `check-course.mjs` 与 `pnpm verify`；新增提交门禁段落；阶段 3 验收命令改完整路径 + strip-types；交付清单加质量门禁行 |
| 修正脚本注释 | `check-course.mjs` 与 `course-skeleton.ts` 区分「本仓库路径」与「复制到目标项目 scripts/ 后」两种调用方式 |

两个 skill 均随仓库共享（`.gitignore` 放行 `.workbuddy/skills/`）。项目级 skill 仅在当前工作区会话自动加载；如需跨项目生效，需复制到用户级 `~/.workbuddy/skills/`。

## 修复提交阻断

`.oxlintrc.json` 与 `.oxfmtrc.json` 原忽略 `.workbuddy/**`，但 `.gitignore` 放行了 skills 目录。用临时索引暂存 `check-course.mjs` 跑 `pre-commit` 实测：lint-staged 的 `*.{ts,vue,mjs,js,cjs}` 命中该文件 → oxfmt 因 ignore 规则排除 → 报 `Expected at least one target file` 退出 2 → hook 失败，即修改 skill 代码无法提交。lint-staged 官方文档亦指出「忽略应配置在任务工具本身」。

处理：两份配置的 `ignorePatterns` 只保留**不可追踪**目录（`.nuxt/`、`.output/`、`.data/`、`dist/`、`node_modules/`、oxlint 另留 `archive/`）；oxfmt 去掉 `content/**`、`public/**`。可追踪目录一律纳入门禁，从此 lint-staged 传入的暂存文件不会再被工具排除。

## 验证

- `pnpm fmt` 写回 3 个文件（`.oxlintrc.json` 与两个 skill 代码文件）；`fmt:check` 34 文件全绿、`lint` 0e/19w（28 文件）、`typecheck` 0e/21w（28 文件）、`verify` 全绿、`build` 31.8s 成功、skill 的 `check-course.mjs` 全绿。
- 临时索引（不触碰真实索引）暂存 `course-skeleton.ts` + `check-course.mjs` 跑 `pre-commit`：oxfmt / oxlint 全绿并自动重新暂存，两个文件 hash 未变；注入语法错误的探针后 oxfmt 报 `Expected ) but found EOF`、hook 退出 1 阻断，探针已删除。
- `git check-ignore` 确认新 skill 可追踪；真实索引仍为 0 文件、`git stash list` 为空、仓库仍无提交历史。

## 后续

描述触发条件的泛化与回写闭环见 [00013](../00013-skill-trigger-closure/migration.md)。
