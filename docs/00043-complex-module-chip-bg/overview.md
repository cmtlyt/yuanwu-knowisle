# 00043 · complex 地图模块导航条补模块色背景

> **补记说明**：本任务代码改动已随 `d4d91d4` 落地，但 docs 目录当时漏建，序号出现缺口。本记录为依据 `.workbuddy/memory/2026-11-14.md` 与 `d4d91d4` diff 的**事后补记**。

分支 `feat/agent-course-outline`。

## 目标

complex 地图页顶部「学习路径 · N 个模块」的模块导航条（`.mod-chip`）只有「左侧 3px 色条 + 白底」，色条太细、白底与页面背景对比低，显单薄。

## 变更

`app/components/course/complex/map.vue`：`.mod-chip` 背景改为 `color-mix(in srgb, var(--mod-color) 10%, var(--surface))`，hover 加深到 18%，保留左侧色条与过渡。`--mod-color` 是 inline 传入的 hex，`color-mix` 可直接混合。

## 验证

- `pnpm fmt` / `pnpm build` 全绿。
- `wrangler dev --port 3199` SSR 见 `.mod-chip` 背景为模块色淡底（color-mix）。
- 仅 complex 组件改动，simple 课与既有课零变化。
