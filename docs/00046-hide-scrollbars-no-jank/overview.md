# 00046 · 全局隐藏滚动条 + 防布局抖动

> **补记说明**：本任务代码改动已随 `d4d91d4` 落地，但 docs 目录当时漏建，序号出现缺口。本记录为依据 `.workbuddy/memory/2026-11-14.md` 与 `d4d91d4` diff 的**事后补记**。

分支 `feat/agent-course-outline`。

## 目标

隐藏所有滚动条（保留滚动行为），并消除「滚动条出现 / 消失」造成的布局宽度跳变（抖动）。

## 变更

`app/assets/css/main.css`（全局，在 `* { box-sizing: border-box }` 之后加一组）：

```css
* { scrollbar-width: none; }          /* Firefox */
*::-webkit-scrollbar { display: none; } /* WebKit / Chrome */
html { scrollbar-gutter: stable; }     /* 根元素恒定预留槽位，隐藏后不跳变 */
```

## 验证

- `main.css` 在 oxfmt `**/*.css` ignore 内，`pnpm fmt` 不校验，需手工保证语法。
- `pnpm build` 产物 CSS 已含三条规则；`wrangler dev --port 3199` smoke 全过（各视口无溢出）。
- 影响所有 overflow 容器（侧栏 / 抽屉 / widget 日志 / 表格）：滚动条统一隐藏、可滚动行为不变。
