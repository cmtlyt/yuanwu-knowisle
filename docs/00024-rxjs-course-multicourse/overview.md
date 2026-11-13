# 00024 · RxJS 深度课 + 多课程架构落地

- 日期：2026-11-13
- 关联：`app/data/effect-course.ts`（第一门课）、`.workbuddy/skills/course-builder/`、`.workbuddy/skills/pitfall-resolver/`

## 目标

用户要求「学习 RxJS，生成一个对应的课程」。确认三项决策：

1. **规模**：完整深度版——6 阶段 24 课，对标 Effect 课程；
2. **版本主线**：rxjs@7.8.x（`latest` 7.8.2，`next` 为 9.0.0-beta.1，不进正文）；
3. **交互演练**：每课配演练（约 11+ 个可操作原理演练）。

核心约束：不破坏「三层解耦」架构——内容层驱动页面、引擎纯计算、视图只渲染。新增课程 = 加数据 + 注册 + 演练，引擎与 composable 零改动。

## 变更

### 类型契约（app/types/course.ts）

- 抽出通用 `CourseData` 接口（`STAGES / CONCEPTS / LESSONS / META / DESIGN`）；`EffectCourseData` 改为 `CourseData` 的类型别名（向后兼容）。
- `CourseEntry` 增加可选 `tagline`（课程主标语，供地图页 hero 渲染；缺省回退 `subtitle`）。

### 数据层（app/data/rxjs-course.ts 新增）

- `RXJS_COURSE`：6 阶段（0 心智模型 / 1 可观察与发射 / 2 扁平化核心 / 3 错误与生命周期 / 4 多播与热流 / 5 调度时间落地）× 24 课 × 26 概念 × 48 题 × 13 个演练标识 + 9 节 DESIGN。
- `META.version = 'rxjs@7.8.2'`、`verifiedAt` 锁定；正文只用 7.8 API，不混用 9.x beta。
- ⚠️ 本节数字（24 课 / 26 概念 / 48 题）为首次交付状态；后续按「动态课时密度 + 面向完整性驱动题目数」原则重构为 **26 课 / 28 概念 / 69 题**，以 [00026](../00026-course-restructure-dynamic-quantity/overview.md) 为准。

### 课程注册（app/data/courses.ts）

- 导入 `RXJS_COURSE`，追加 `slug: 'rxjs'` 条目（`icon 📡`、`color #3fb984`、`storageKey: 'knowisle:rxjs:v1'`）。
- 学情按 `storageKey` 与 Effect 隔离；`availableCourses()` 自动驱动首页卡片与导航。

### 演练内核（app/lib/widgets.ts）

- 追加 13 个零依赖 DOM/SVG 演练（`rxjsSource / rxColdHot / rxTeardown / rxObserver / rxTransform / rxFilter / rxFlatten / rxCross / rxRetry / rxSubject / rxShare / rxScheduler / rxCombine`），沿用 `(host, ctx) => cleanup` 生命周期契约。
- 关键演练：`rxCross` 四泳道时序图对比 concatMap / mergeMap / switchMap / exhaustMap；`rxShare` refCount 生命周期。

### 共享视图层去硬编码（多课程正确性）

第二门课暴露出共享视图层写死 Effect 专属内容的隐患，逐一数据驱动化：

- `app/pages/courses/[slug]/index.vue`：hero 标题 `course!.tagline || course!.subtitle`（原写死 Effect 标语）。
- `app/layouts/default.vue`：导航 `tabs` 改由 `availableCourses()` 遍历生成（原写死 Effect 一项 + "更多"）。
- `app/pages/courses/[slug]/teacher.vue`：「官方文档 v4」→「官方文档」、「升级 Effect 版本」→「升级课程所基于的版本」等文案泛化。

### 校验脚本多课程化

- `.workbuddy/skills/course-builder/scripts/check-course.mjs`：候选检测改为鸭子类型（`STAGES / LESSONS / META` 全有即视为课程），自动发现任意课程导出，不再只认 `EFFECT_COURSE`。
- `scripts/verify-course.mjs`：从「单课程 Effect 硬编码」改为**动态扫描** `app/data/*-course.ts`、按完整 `.ts` 扩展名逐个 import（Node 原生 ESM 不推断扩展名，绕开 `courses.ts` 的省略扩展名运行时导入），对每门课跑结构 / 引用 / DESIGN / 学情引擎 / 隔离性检查。
- `scripts/smoke.py`：`ROUTES` / `CLIENT_ROUTES` / `VIEWPORTS` 补 `/courses/rxjs` 系列；首页标记加「RxJS 深度课」。

## 验证（全部 exit 0）

- `pnpm fmt:check`：35 文件全绿
- `pnpm lint`：0 error / 19 warning（存量，无新增）
- `pnpm typecheck`：0 error / 21 warning（存量基线）
- `pnpm verify`：双课程（effect@4.1.4 + rxjs@7.8.2）全绿——13 演练映射、学情引擎空态/完整轨迹/遗忘队列/导出导入/跨 storageKey 隔离
- `pnpm build`：成功（cloudflare_module → `.output`）
- `python scripts/smoke.py --base http://127.0.0.1:3199`：SSR + 客户端 + 视口全绿（3199 临时 Worker 服务，跑完即关）

## 注意事项

- 新增第三门课：只需 `app/data/<slug>-course.ts` + `courses.ts` 注册 + `widgets.ts` 演练，**引擎/composable/大部分视图零改动**；verify 自动纳入。
- 共享视图层任何课程专属文案都必须数据驱动（`tagline` / `availableCourses()` / `META` / `DESIGN`）；smoke 应断言「该课专属文案只出现在自己的页」防串场。
- 校验脚本不 import `courses.ts`（其内部省略扩展名相对导入在 Node 运行时解析不到），直接按 `.ts` 扩展名扫描数据层文件。
- 本次改动已随 `fd70ffa` 提交（多课程架构首批 8 文件）；后续重构见 [00026](../00026-course-restructure-dynamic-quantity/overview.md)。
