# 00047 · 修 dashboard TS7053（cmap 空对象索引）

> **补记说明**：本任务代码改动已随 `d4d91d4` 落地，但 docs 目录当时漏建，序号出现缺口。本记录为依据 `.workbuddy/memory/2026-11-14.md` 与 `d4d91d4` diff 的**事后补记**。

分支 `feat/agent-course-outline`。

## 目标

simple / complex 两个 dashboard 模板里 `overall.cmap[c.id].mastery` 报 TS7053（「元素隐式 any，string 不能索引类型 `{}`」）。

## 根因

`analytics.ts` 的 `conceptMap` 用 `const out = {}` 再动态 `out[c.id] = …` 填充，TS 把 `out` 推断为 `{}`（无 string 索引签名）。引擎是 `@ts-nocheck` 不查自身，但 `ReturnType<typeof createAnalytics>` 把该形状传导给 type-aware 消费方（dashboard 组件），暴露报错。

## 变更

贴合「类型在 composable 边界收口」的架构：`app/lib/analytics.ts` 把 `conceptMap` 的 `out` 标注为 `Record<string, any>`（原 `const out = {}`）。标注经 `ReturnType` 传导出去，`cmap[c.id]` 即合法，且不影响 `@ts-nocheck` 引擎内部。

## 验证

- `pnpm typecheck` 仍 5w 基线（TS7053 消失；5w 为 use-learning 内核边界断言预期项）、`pnpm lint` 3w、`pnpm build` 全绿。
