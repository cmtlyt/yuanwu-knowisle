# 00042 · complex 地图子阶段网格间距修复

> **补记说明**：本任务代码改动已随 `d4d91d4` 落地，但 docs 目录当时漏建，序号出现 00041→00049 缺口。本记录为依据 `.workbuddy/memory/2026-11-14.md` 与 `d4d91d4` diff 的**事后补记**，用于补齐序号。

分支 `feat/agent-course-outline`。

## 目标

complex 地图页里 `stage-card` 与其下子阶段 / 无子阶段课时网格（`.grid.c2`）几乎贴死、无留白。simple 地图每块自带 `section-title{margin-top:20px}` 天然有间距，complex 缺这个视觉节奏。

## 变更

`app/components/course/complex/map.vue`：三处 `.grid.c2` 补 `margin-top`——

- 子阶段网格（`lessonsOfSub`）`margin-top: 10px`
- 无子阶段的孤儿课时（`orphanLessons`）`margin-top: 12px`
- 无子阶段直接列课时（`lessonsOfStage`）`margin-top: 12px`

拉开网格与上方 `stage-card` / `sub-title` 的距离。

## 验证

- `pnpm fmt` / `pnpm build` 全绿。
- `wrangler dev --port 3199` SSR 见三处 `.grid.c2` 均带 `margin-top`。
- 仅 complex 组件改动，simple 课与既有课零变化。
