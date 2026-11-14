# 00048 · 教学设计页表格 hover / 间距修复

> **补记说明**：本任务代码改动已随 `d4d91d4` 落地，但 docs 目录当时漏建，序号出现缺口。本记录为依据 `.workbuddy/memory/2026-11-14.md` 与 `d4d91d4` diff 的**事后补记**。

分支 `feat/agent-course-outline`。

## 目标

`design.vue` 教学设计页两个问题：① kv 表行 hover 时首列（`<th>`）无背景；② 上方表格块与下方 callout（绿色块）零间距。需求细化为：**竖表**（kv）整行 hover 含首列 th，**横表**（data-table）仅数据行 hover、表头不 hover。

## 根因（main.css）

① `table.tbl tr:hover td` 只给 `td` 上色，kv 表首列是 `th` 漏掉；② `.card.tbl-wrap` 无 `margin-bottom`、`.callout` 无 `margin-top`，相邻块贴死。

## 变更

`app/pages/courses/[slug]/design.vue` + `app/assets/css/main.css`：

- kv 块 `<table class="tbl kv-table">`；table / lessons 块 `<table class="tbl data-table">`。
- 删除旧全局 `tbl` hover，改为按表型精确 hover（**类必须加在 `<table>` 上**，否则选择器匹配不到、规则失效——这是本任务关键纠错点）：

```css
table.tbl.kv-table tr:hover td,
table.tbl.kv-table tr:hover th { background: var(--surface-2); }   /* 竖表整行含 th */
table.tbl.data-table tbody tr:hover td { background: var(--surface-2); } /* 横表仅数据行，thead 不 hover */
.card.tbl-wrap { margin-bottom: 16px; }
```

## 验证

CDP 用 `document.querySelector` 实测「选择器真命中元素」（而非只查规则文本存在）：

- `selKvRowTh / selKvRowTd / selDataBodyTd = true`
- `selDataHeadTd = false`（表头行是 th 不命中）
- 竖表含首列 th hover、横表仅数据行 hover、表头无 hover，全部真正生效。
- `pnpm build` 全绿；`wrangler dev --port 3199` smoke 全过（含 rxjs/design 无溢出）。
