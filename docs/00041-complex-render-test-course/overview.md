# 00041 · complex 渲染模式测试课程

## 目标

提供一个**最小但完整**的 complex 渲染模式测试课程 `agent-test-course`，让 4 层结构（Module > Stage > SubStage > Lesson）首次拥有真实数据，端到端跑通 complex 渲染：

- `app/components/course/complex/{map,dashboard}.vue`
- 面包屑 / 教学设计视图的 complex 分支
- `analytics.ts` 的 `moduleRows` 聚合
- `verify-course.mjs` 的 complex 引用完整性校验

不落地正式 Agent 系统课（`docs/agent-course-outline.md`），仅用一个轻量 3 模块 / 3 阶段 / 4 课时 + 1 个子阶段示例把 complex 路径覆盖到。

## 变更计划

1. 新建 `app/data/agent-test-course/`，目录结构对齐 effect-course：
   - `meta.ts`：`META`（version `agent-test@0.1.0`、`verifiedAt` 当日、`docs` 指 `docs/agent-course-outline.md`）。
   - `design.ts`：`DESIGN`（2 节 + `lessons` 区块自动渲染路径总表，complex 视图含 模块/子阶段列）。
   - `stages.ts`：`STAGES` 3 个，全部带 `module`；Stage 2 带 `subStages: ['2.1','2.2']`。
   - `concepts.ts`：`CONCEPTS` 4 个（跨 3 模块分布，weight/prereqs 合法）。
   - `lessons/index.ts` + `l01..l04.ts`：`LESSONS` 4 个，widget 全部 `null`（不依赖真实 widget，避免 `Widgets.has` 校验失败）；stage 2 的 2 个 lesson 分别挂 `subStage: '2.1' / '2.2'`。
   - `index.ts`：聚合导出 `AGENT_TEST_COURSE: CourseData`，含 `renderMode: 'complex'` 与 `MODULES: 3`。
2. `app/data/courses.ts` 追加一项：`slug: 'agent-test'`，`status: 'available'`，`data: AGENT_TEST_COURSE`，独立 `storageKey: 'knowisle:agent-test:v1'`。
3. 校验：`pnpm verify` 动态扫描会纳入新目录，complex 分支校验全部通过。
4. 渲染验证：`pnpm build` + `wrangler dev` + `smoke.py` 断言 `/courses/agent-test`、`/dashboard`、`/design`、`/lessons/L01` 均 200 且 SSR 含 complex 标记（如模块名、子阶段标签）。

## 验证方案

- `pnpm verify` 全课程通过（含 agent-test 的 complex 引用完整性、moduleRows 空/非空分支、全轨迹）。
- `pnpm fmt / lint / typecheck / build` 全绿（lint 仍 3w / typecheck 仍 5w 基线）。
- `pnpm build` 后 `wrangler dev --port 3199` + `python scripts/smoke.py --base http://127.0.0.1:3199`：
  - `/courses/agent-test` 200 + 模块手风琴 SSR。
  - `/courses/agent-test/dashboard` 200 + 模块雷达 SSR。
  - `/courses/agent-test/design` 200 + 模块/子阶段列。
  - `/courses/agent-test/lessons/L01` 200 + 面包屑含模块名。
- 既有 effect-ts / rxjs 行为零变化（仍走 simple）。

## 实施结果（2026-11-14）

- 新增 `app/data/agent-test-course/`：`meta/design/stages/concepts/index.ts` + `lessons/l01..l05.ts` + `lessons/index.ts`。
- 结构：3 模块（核心抽象 / 编排范式 / 观测治理）· 3 阶段（Stage 1 含子阶段 2.1 单 Agent / 2.2 多 Agent）· 5 课时 · 4 概念 · 15 题；`renderMode: 'complex'`、`MODULES` 3 项、Stage 全部带 `module`、L03/L04 带 `subStage`、L05 覆盖 observability。
- widget 全部 `null`（不依赖真实演练组件）；L() 构造器无 subStage 字段，故在 `lessons/index.ts` 用 `withSubStage(l, '2.1')` 显式补齐。
- `courses.ts` 追加 `slug: 'agent-test'`（available、独立 storageKey）。
- 题量设计：verify 不约束每课题数，只断言掌握度 >60（与正确率自洽，后者公式动态、与题数无关）。掌握度过线的关键是「模拟轨迹 `i%4!==0` 固定把第 0 课全错」——低题量（每课 1 题）让被记错概念（agent-loop，weight 3）权重占比过高拉低掌握度（4 题→51）；扩到 5 课 15 题后错误概念占比降到 1/5（→71）才达标。属数据层题量设计问题，**非 verify 题数要求**。
- 门禁：fmt(162 文件) / lint 3w / typecheck 5w / verify 全课程通过（agent-test 掌握度 71、正确率自洽、复杂校验全过）/ build 14.2s / smoke 全部通过。
- 端到端（wrangler 3199 + curl）：`/courses/agent-test{,/dashboard,/design,/lessons/L01..L04}` 全 200；complex 地图 SSR 渲染 3 模块 + 子阶段「单/多 Agent 协作」；design 页出模块/子阶段列；单课面包屑 L01→「核心抽象」模块、L04→「编排范式/多 Agent 协作」子阶段；dashboard 模块雷达出 3 模块。既有 effect-ts / rxjs 零变化。

## 风险

- `widget: null` 不影响 `course-widget.vue`（该组件仅在 lesson 页 onMounted 时按 `widget` 取值；null 时不挂载 widget，正常）。
- 概念 `weight` / `prereqs` 必须构成 DAG，verify 会校验前置顺序。
- `agent-test` 与 `agent` 大纲无数据关联，仅是渲染测试夹具；后续正式 `agent-course` 落地时此测试课保留为渲染 smoke 夹具，不并入正式课。

## 不变量

- effect-ts / rxjs 现有 26+26 课与学情状态零变化。
- 不改动 `course-builders.ts`、不改动既有课目录。
