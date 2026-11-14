# 00049 · 删除 complex 渲染测试课程 agent-test

## 背景

`agent-test-course`（#00041）是为端到端验证 complex 渲染模式而建的临时夹具。complex 渲染（`course/complex/{map,dashboard}.vue`）已在 #00039 落地并验证，测试课使命完成，按用户要求删除。

## 变更计划

1. 删除 `app/data/agent-test-course/` 整个目录（meta / design / stages / concepts / index.ts + lessons/*）。
2. `app/data/courses.ts`：移除 `import { AGENT_TEST_COURSE }` 与 `slug: 'agent-test'` 条目。
3. **不改** `docs/00041`（历史任务记录，按「已落盘记录不可改写」约定）；本记录即为删除的现行口径。

## 验证方案

- `pnpm verify`：动态扫描 `app/data/*-course/`，删目录后只剩 effect / rxjs，complex 分支不再被触发（无 complex 课），全课程通过。
- `pnpm fmt / lint / typecheck / build` 全绿。
- 既有 effect-ts / rxjs 零变化。

## 不变量

- complex 渲染**组件**（`course/complex/`、types 的 Module/RenderMode、analytics 的 moduleRows、verify 的 complex 校验）全部保留——删的只是「测试数据」，渲染能力仍在，正式 agent-course 落地时直接复用。
- 不改动 `course-builders.ts`、既有课目录。
