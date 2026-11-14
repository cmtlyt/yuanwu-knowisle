# 00045 · complex 模块块头部信息重排

> **补记说明**：本任务代码改动已随 `d4d91d4` 落地，但 docs 目录当时漏建，序号出现缺口。本记录为依据 `.workbuddy/memory/2026-11-14.md` 与 `d4d91d4` diff 的**事后补记**。

分支 `feat/agent-course-outline`。

## 目标

complex 地图页模块块头部原先 4 行竖排（标题 / summary / 🎯goal / 掌握度条）堆得太密、显乱，需重新整理。

## 变更

`app/components/course/complex/map.vue`：模块头部改为**两层**——

```
<div class="mod-head">            标题行
  模块名 + <span class="en">      + 右侧模块色掌握度徽章 .mod-mastery（pill）
</div>
<div class="mod-desc">            摘要与目标各一行紧凑排布
  summary + <span class="mod-goal">🎯 goal</span>
</div>
```

移除旧的 `module-summary` 与「掌握度条 `.mbar`」竖排结构。

## 验证

- `pnpm fmt` / `pnpm build` 全绿。
- `wrangler dev --port 3199` 确认 `mod-head / mod-mastery / mod-desc / mod-goal` 渲染、旧 `module-summary` 已移除。
- 仅 complex 组件改动。
