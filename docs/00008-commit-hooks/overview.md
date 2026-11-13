# 00008 · 提交门禁：commitlint + lint-staged

> 2026-11-13 ｜ 由原 `overview.md`「提交门禁」章节拆出 ｜ [索引](../README.md) ｜ [配置映射](migration.md)

## 目标

用户要求「补充仓库基本的 commitlint 和 lint-stage」，用 husky 把检查接入 Git hooks。

## 变更

- devDependencies：`husky@^9.1.7`、`@commitlint/cli@^21.2.4`、`@commitlint/config-conventional@^21.2.4`、`lint-staged@^17.6.0`（用 `^` 范围，实际版本由 `pnpm-lock.yaml` 锁定；版本口径的后续微调见 [00009](../00009-dependency-version-ranges/overview.md)）。
- `prepare: husky` 让 `pnpm install` 后自动设置 `core.hooksPath=.husky/_`。
- 配置：`.commitlintrc.json`（conventional + 显式 type 白名单 + header ≤100，**不限制 scope**）、`.lintstagedrc.json`（代码文件 `oxfmt` + `oxlint`，JSON 只 `oxfmt`）；`.husky/pre-commit` 与 `.husky/commit-msg` 随仓库共享，`.husky/_/` 由 husky 生成并自忽略。

## 设计口径

- hooks 只跑毫秒级暂存检查，`typecheck` / `verify` / `build` 仍由手动或 CI 承担。
- 初版加过 `scope-enum` 白名单，因易挡住 `site` / `a11y` 等合法模块名而移除；scope 可选且取值不限。
- 仓库无初始提交时 lint-staged 跳过备份 stash 并给出警告，属预期行为。

## 验证

- commitlint 合法 / 非法消息分别退出 0 / 1，merge 等消息默认忽略；`git hook run` 验证两条 hook 链路。
- 用 `GIT_INDEX_FILE` 隔离的临时索引（不触碰真实索引）对 5 个暂存文件跑 `pre-commit`：oxfmt / oxlint 任务全绿并自动重新暂存，工作区文件 hash 未变；注入语法错误的探针文件后 hook 正确退出 1 阻断，探针已删除。
- `pnpm fmt:check`（32 文件）/ lint / typecheck / verify 复跑全绿；`pnpm install --frozen-lockfile` 与 `pnpm run prepare` 正常。真实索引仍为 0 文件、无 stash 残留。
