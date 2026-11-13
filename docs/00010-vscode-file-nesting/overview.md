# 00010 · VSCode 文件嵌套：配置合并到 nuxt.config.ts

> 2026-11-13 ｜ 由当日记忆日志拆出 ｜ [索引](../README.md)

## 目标

用户要求「修订 vscode 的 explorer.fileNesting.patterns，合并几个 rc 和 config 文件到 nuxt.config.ts」。目标文件是**用户级** `C:/Users/cmtlyt/AppData/Roaming/Code/User/settings.json`（项目内无 `.vscode/`），非仓库文件；改动前备份到 `/tmp/vscode-settings-backup-20261113.json`。

## 变更

新增一条父规则（原有 `vite.config.ts` / `tsconfig.json` / `package.json` 等全局规则保留，其他项目仍要用）：

```jsonc
"nuxt.config.ts": "content.config.ts, tsconfig.json, tsconfig.*.json, .oxlintrc.*, .oxfmtrc.*, .commitlintrc.*, .lintstagedrc.*, .prettierrc.*, .editorconfig, eslint.config.*, *.d.ts"
```

## 源码核实结论

查本机 VSCode 打包源码（`D:/software/Microsoft VS Code/69047191fc/resources/app/out/vs/workbench/workbench.desktop.main.js`）确认两点：

1. patterns 按 `Object.entries` 顺序建 trie，**所有匹配的父规则合并生效**（不是首个匹配优先），再做传递闭包归到根。所以通配的 `*.ts` 不会吃掉新规则。
2. schema 限制 parent / child 每个模式最多 1 个 `*`（`^[^*]*\*?[^*]*$`），故不能用 `*.config.*` 这种两段通配，改用明确文件名 + 单星号的 `.oxlintrc.*` 等；且只有目录中**实际存在**的父文件才产生嵌套（本项目没有 `vite.config.ts`）。

## 验证

用等价 Python 算法模拟项目根目录：15 条规则全部通过 schema 校验；`nuxt.config.ts` 收 6 个文件（4 个 rc + `content.config.ts` + `tsconfig.json`），`package.json` 收 `pnpm-lock.yaml` / `pnpm-workspace.yaml`，顶层文件只剩 `.gitignore`、`README.md`、`overview.md`。注意 `expand: false`，配置默认折叠；若 `tsconfig.json` / `content.config.ts` 需要常驻，从 children 里删掉即可。

## 注意事项

- 以后若新建项目级 `.vscode/settings.json`，workspace 设置会**整体覆盖**用户级 patterns，需复制全部 15 条规则才能保持一致。
- 后来新增的 `AGENTS.md`（[00014](../00014-readme-agents-split/overview.md)）与 `docs/` 任务目录（[00015](../00015-scripts-and-docs-reorg/overview.md)）不在该嵌套规则内，会显示在资源管理器顶层。
