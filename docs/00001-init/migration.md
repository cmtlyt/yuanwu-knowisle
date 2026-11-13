# 00001 · 迁移映射：静态课程应用 → 知识岛中的一门课

> 2026-11-13 ｜ 由原 `docs/migration.md` 首节拆出 ｜ [索引](../README.md) ｜ [任务总览](overview.md)

源：`C:/Users/cmtlyt/WorkBuddy/学习/effect-course/`（零依赖静态 SPA，IIFE + DOM）
目标：`D:/code/@cmtlyt/yuanwu-knowisle/`（Nuxt 4 知识岛站点）

## 目标形态

站点首页 `/` 是「知识岛」课程列表；Effect 教学整体重构为**一门课程实体** `/courses/effect-ts`，内部保留 6 阶段 24 课、交互演练、测验、学情分析、教学准备。新增课程只需在 `app/data/courses.ts` 注册。

## 迁移映射

| 源 | 目标 | 方式 |
|---|---|---|
| `assets/course-data.js` (66 KB) | `app/data/effect-course.ts` | 机械转 ESM + 类型化辅助函数，内容零改写 |
| `assets/analytics.js` (14 KB) | `app/lib/analytics.ts` | 包成 `createAnalytics(course, storageKey)` 工厂，按课程隔离 localStorage |
| `assets/widgets.js` (35 KB) | `app/lib/widgets.ts` | 转 ESM，由 `course-widget.vue` 托管挂载与 cleanup |
| `assets/app.js` (36 KB) | `app/pages/*` + `app/components/course/*` + `app/layouts/default.vue` + `app/composables/*` | 拆成 Vue 路由/组件/组合式函数 |
| `assets/style.css` (27 KB) | `app/assets/css/main.css` | 原样迁移（含移动端适配），增补知识岛与文档排版 |
| `index.html` | `app/app.vue` + `nuxt.config.ts` | viewport / theme-color 移入 Nuxt head 配置 |
| `docs/课程设计.md` | `content/docs/effect-course-design.md` | 加 frontmatter，由 Nuxt Content 渲染于 `/docs/effect-course-design` |
| `overview.md` | `README.md` + 本文件 | 合并进项目文档（本文件现已拆入本目录） |
| `scripts/verify.js` | `scripts/verify-course.mjs` | 改用 Node 22 `--experimental-strip-types` 直接加载 TS |
| `scripts/smoke.py`、`scripts/mobile-check.py` | `scripts/smoke.py` + `scripts/cdp.py` | 改用 CDP 构造真实 320/390/768/1440 视口 |

## 关键改造

- **学情按课程隔离**：`createAnalytics` 工厂让 `COURSE` 与 storage key 由闭包捕获，多课程互不串数据；`useLearning` 用 `useState` 保证 SSR 首屏一致，真实档案在 `onMounted` 载入，避免 hydration mismatch。
- **演练内核保留 DOM 实现**：11 个演练含大量定时器与 SVG 动画，整体重写风险高。改由 Vue 组件在 `onMounted` 挂载、`onBeforeUnmount` 调用 `cleanup()` 回收，交互能力 100% 保留。
- **NuxtLink 兼容**：原 CSS 面向 `<button>`，已把 `.btn` / `.nav` / `.lesson-item` / `.brand` 选择器扩展到 `<a>`，保持视觉一致。
- **响应式成果沿用**：底部标签栏、抽屉、独立横滑容器、触控目标、安全区规则整体迁入，并在 CDP 真实视口下重验。

## 验证结果

- `pnpm verify`：结构（6/24/26/48）、引用完整性、答案索引、组件映射、引擎全轨迹（进度 100% / 掌握度 70 / 正确率 75%）、遗忘入队、导出导入、多课程隔离 —— 全绿。
- `pnpm build`：Nuxt 4.6.4 生产构建成功，`@nuxt/content` 处理 1 篇文档、无配置警告。
- `python scripts/smoke.py`：11 条路由 SSR 状态与关键内容、3 个页面的客户端渲染与演练挂载、4 种视口共 13 组布局检查 —— 全绿。
- 交互冒烟：课程卡片跳转、抽屉开合与 aria、答题写入 localStorage、即时反馈、主题切换、雷达图、ContentRenderer 文档、桌面导航 —— 全绿。
- 视觉复核：390px 首页/课程地图/课时/仪表盘/抽屉与 1440px 桌面截图均无溢出、重叠或错位。

## 注意事项

- 新旧应用不同源，旧 localStorage 进度不会自动带过来：在旧应用「设置」导出 JSON，再在新站课程设置页导入。
- 演练仍是**原理模拟**，不是真实 Effect runtime。
