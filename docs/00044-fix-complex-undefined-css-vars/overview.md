# 00044 · 修正 complex 组件误用未定义 CSS 变量

> **补记说明**：本任务代码改动已随 `d4d91d4` 落地，但 docs 目录当时漏建，序号出现缺口。本记录为依据 `.workbuddy/memory/2026-11-14.md` 与 `d4d91d4` diff 的**事后补记**。

分支 `feat/agent-course-outline`。

## 目标

用户指出 complex 组件误用了仓库未定义的 CSS 变量（如 `--color-background-primary`）。仓库真实变量是 `main.css` 里的 `--bg/--surface/--surface-2/--border/--text/--muted/--primary/--ok/--warn/--danger/--radius`，**没有 `--color-*` 一族**。未定义变量会 fallback 到初始值 → 背景透明 / 边框色失效。

## 变更

`app/components/course/complex/{map,dashboard}.vue`：把误用的变量映射到真实 token——

- `--color-background-primary` → `--surface`
- `--color-border-tertiary` → `--border`
- `--color-text-secondary` → `--muted`
- `--border-radius-md` → `--radius`（map.vue）
- dashboard.vue 的 `var(--mod, var(--color-text-primary))` → `var(--text)`

## 验证

- complex 两组件 `var()` 全部落在 `main.css` 已定义变量集。
- `pnpm fmt` / `pnpm build` 全绿；`wrangler dev --port 3199` 确认未定义变量清零。

## 教训

新写组件前先 grep `main.css` 的 `^\s*--[a-z-]+:` 确认真实变量名，别凭「常见设计系统变量名」猜。
