# 00039 · 多模式课程渲染重构

## 目标

当前课程渲染层只有 2 层结构（Stage → Lesson），所有页面假设单一扁平阶段列表。Agent 系统课（大纲见 `docs/agent-course-outline.md` 附录 D）是 4 层（Module > Stage > SubStage > Lesson），需要不同渲染形态（模块手风琴、模块主轴雷达、子阶段三级头）。

本次**只重构渲染代码，不落地任何课程数据**（Agent 课 `app/data/agent-course/` 暂不创建）。采用**多模式渲染**：简单课走现有 simple 模式、系统课走新 complex 模式，由 `renderMode` 分派，后续可注册更多模式。方案依据大纲附录 D v2。

## 变更计划

1. `app/types/course.ts`：加 `RenderMode` 类型、`CourseData.renderMode?`、`Module` 接口、`Stage.module? / subStages?`、`Lesson.subStage?`。simple 课缺省 `'simple'`。
2. `app/composables/use-course.ts`：加 `renderMode` / `modules` computed 及 `moduleById` / `moduleName` / `stagesOfModule` / `subStageOf` 辅助。
3. 抽组件：`app/components/course/map-simple.vue`（原 `index.vue` 逻辑原样搬入）、`dashboard-simple.vue`（原 `dashboard.vue` 原样搬入）。
4. 写组件：`map-complex.vue`（模块手风琴 + 子阶段三级头 + 模块导航条）、`dashboard-complex.vue`（模块主轴雷达 + 模块下钻，复用 `RadarChart`）。
5. 页面薄壳：`pages/courses/[slug]/index.vue`、`dashboard.vue` 改为按 `renderMode` 分派上述组件。
6. `lessons/[id].vue` 面包屑、`design.vue` 的 lessons 表：complex 时显示 module / subStage。
7. `app/lib/analytics.ts`：`overall()` 加 `moduleRows`（按 `MODULES` / `Stage.module` 聚合；无 MODULES 时为空数组）。
8. `scripts/verify-course.mjs`：按 `renderMode` 分支——complex 额外校验 `MODULES` / `stage.module` / `lesson.subStage` 引用完整性。

## 验证方案

- `pnpm fmt` 写回 + `pnpm lint` + `pnpm typecheck` 全绿（complex 组件首次进入类型检查，需确保类型正确）。
- `pnpm verify` 全课程校验通过（dynamic scan，Effect / RxJS 仍 simple 模式、零改动）。
- `pnpm build` 通过（构建会编译所有组件，抓模板 / 导入错误）。
- 起独立端口生产服务 + `python scripts/smoke.py --base http://127.0.0.1:3199`：现有 simple 课（effect-ts / rxjs）SSR + 客户端渲染零回归，证明 simple 路径行为不变。
- complex 路径因无真实课程数据无法端到端跑；以类型检查 + 构建编译 + 逻辑审查兜底，并在 complex 组件中做空数据降级（moduleRows 为空时显示占位而非崩溃），保证现有门禁全绿。

## 风险

- 既有两门课零代码改动、零行为变化（`renderMode` 缺省 simple，仍走原逻辑）。
- `analytics.ts` 带 `// @ts-nocheck`，加 `moduleRows` 不触发类型校验，但需保证对象结构正确（`dashboard-complex` 依赖）。
- 不创建任何课程数据；agent-course 落地在后续任务。

## 不变量（不可破）

- 既有 Effect / RxJS 课在地图 / 仪表盘 / 单课时 / 教学设计四处的行为与重构前逐字节一致。
- 不引入任何 `if (hasModule)` 分支到 simple 组件；simple 与 complex 各自独立。

## 组件目录重组（按渲染模式分组）

4 个 mode 变体组件由平铺 `course/{map,dashboard}-{simple,complex}.vue` 重组为**按模式分组**：

```
app/components/course/
├── simple/{map,dashboard}.vue     # 简单模式（原 map-simple/dashboard-simple）
├── complex/{map,dashboard}.vue    # 系统课模式（原 map-complex/dashboard-complex）
├── course-widget.vue
├── lesson-block.vue
├── quiz-card.vue
├── radar-chart.vue
└── timeline-chart.vue             # 共享叶子组件留根，不随模式变
```

- 动机：新增渲染模式只需新建一个模式目录实现 `map.vue` / `dashboard.vue`，不必在每个组件目录下散加 `-xxx` 后缀文件。
- 影响面：仅 2 个页面 import 路径更新（`[slug]/index.vue`、`dashboard.vue`）；叶子组件路径不变，变体内部 import 不变。
- 门禁：fmt / lint(3w) / typecheck(5w) / verify / build 全绿，既有两门课零行为变化。
