# 00022 · lint/格式化门禁忽略 `.vscode`，并把 `.vscode` 纳入版本库

- **日期**：2026-11-13
- **任务**：用户要求「`.vscode` 也需要推送，lint 类的应该忽略这个目录」。即 ① 让 `.vscode/**` 不被 `fmt:check` / `lint` 扫到（否则 `.vscode/settings.json` 的格式问题会让 CI 门禁失败）；② 把 `.vscode/` 提交并推送到 GitHub。

## 变更

- **`.oxfmtrc.json`**：`ignorePatterns` 增加 `".vscode/**"`。
- **`.oxlintrc.json`**：`ignorePatterns` 增加 `".vscode/**"`（oxfmt 写回时把该数组拆成多行）。
- **`.vscode/settings.json`**：项目级编辑器设置（`js/ts.experimental.useTsgo: false`），随本次提交入库。
- 未改 `.lintstagedrc.json`：本项目 `*.{json,jsonc}` 是单层 `*` glob，不匹配嵌套路径 `.vscode/settings.json`，故该文件本就不会被 pre-commit 的 oxfmt 任务选中，无需在 lint-staged 侧额外排除（曾误加顶级 `ignores` 键，已回退——lint-staged v17 object 配置不支持该键）。

## 验证

- `pnpm fmt:check`：exit 0（`.vscode/settings.json` 被 oxfmt 忽略；`.oxlintrc.json` 因加项被 oxfmt 自动写回为多行，已 `pnpm fmt` 归零）。
- `pnpm lint`：exit 0，19 条存量 warning、0 error（`.vscode` 被 oxlint 忽略，不影响结果）。
- 门禁顺序与回归结果见 `verification.md`。

## 注意事项

- **CI 影响**：`.vscode` 入库后，GitHub Actions 克隆到的 `.vscode/settings.json` 也在 `ignorePatterns` 覆盖范围内，`fmt:check` / `lint` 不会因它失败。
- **回写**：lint-staged 误加 `ignores` 的反复试错已记入 `pitfall-resolver/references/git-hooks-editor.md`（「lint/格式化门禁忽略 `.vscode`」条目）。

## 相关

- 门禁与部署见 `00020-github-actions-ci-cd/overview.md`。
- 踩坑回写见 `.workbuddy/skills/pitfall-resolver/references/git-hooks-editor.md`。
