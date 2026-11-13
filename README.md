# 源悟的知识岛 · yuanwu-knowisle

以「课程」为单位的交互式学习空间，基于 Nuxt 4。当前上线一门课：**Effect 4.1.4 深度课**，从「程序即值」讲到 fiber runtime 的指令解释器。

站点由 Nuxt 欢迎页重构而来；原先独立的静态课程应用 `effect-course/` 已重构为知识岛里的**一门课程实体**。

## 特性

- **结构化课程**：6 阶段 / 24 课时 / 26 概念 / 48 题 / 11 个交互演练。课时用类型化 TS 数据描述，测验、概念图谱与学情归因自动联动。
- **学情引擎**：掌握度 = 近期表现 30% + 历史正确率 20% + 记忆保持 25% + 练习覆盖 25%，记忆保持采用 R = e^(−Δt/S)；含遗忘复习队列、错题本、雷达诊断。
- **原理演练**：11 个零依赖 DOM 内核（并发、Cause、Retry、Layer、Scope、Fiber、Scheduler、Stream 等），由 Vue 组件托管挂载与清理。
- **多课程就绪**：新增课程只需在 `app/data/courses.ts` 追加一项，提供 `EffectCourseData` 与独立 `storageKey`，页面、侧栏与学情模型按数据自动生成，不改视图代码。
- **纯前端**：零额外运行时依赖；学情数据只存浏览器 localStorage，不上传，支持 JSON 导入导出。
- **响应式与主题**：浅深双主题，≤780px 底部标签栏 + 抽屉导航，图表与代码块独立横滑。

## 技术栈

Nuxt 4.6.4 · Vue 3.5 · TypeScript 7.0.2 · Nuxt Content 3 · Nuxt UI 4 · Tailwind 4 · Tiptap 3。代码质量用 oxlint + oxfmt + tsgolint，提交门禁用 husky + lint-staged + commitlint。

## 运行

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm build               # 生产构建
PORT=3100 node .output/server/index.mjs   # 生产预览
```

需要 Node 22+ 与 pnpm 11。**质量检查、提交规范、命名约定与协作规则见 [`AGENTS.md`](AGENTS.md)**。

## 课程路由

```
/                                  知识岛首页（课程卡片 / 总进度）
/courses/effect-ts                 课程地图（6 阶段 · 24 课时 · 学情建议）
/courses/effect-ts/lessons/L01…L24 课时详情（讲解 / 演练 / 术语 / 误区 / 测验）
/courses/effect-ts/dashboard       学情仪表盘（KPI / 雷达 / 掌握度 / 归因）
/courses/effect-ts/review          复习中心（遗忘曲线队列 / 错题本）
/courses/effect-ts/teacher         长期教学准备（版本基线 / 课时质量表）
/courses/effect-ts/settings        设置与 JSON 导入导出
/docs/effect-course-design         课程设计说明书（Nuxt Content）
```

## 目录结构

| 路径 | 职责 |
|---|---|
| `app/data/effect-course.ts` | **唯一内容源**：24 课、26 概念、48 题、6 阶段、版本基线 META |
| `app/data/courses.ts` | 课程注册表（多课程扩展入口） |
| `app/types/course.ts` | 内容 / 学情类型契约 |
| `app/lib/analytics.ts` | 学情引擎：掌握度、遗忘曲线、诊断、复习、导入导出 |
| `app/lib/widgets.ts` | 11 个零依赖原理演练内核（定时器 / SVG / DOM） |
| `app/lib/highlight.ts` | 代码高亮与 HTML 转义 |
| `app/composables/use-learning.ts` | 全站学情单例，按课程隔离，SSR 安全 |
| `app/composables/use-course.ts` | 当前课程、课时查询、404 守卫 |
| `app/components/course/*` | 内容块、测验、演练宿主、雷达图、时间轴 |
| `app/layouts/default.vue` | 顶栏 / 底部标签栏 / 课程目录抽屉 / 主题 |
| `app/pages/*` | 上述路由的页面 |
| `app/assets/css/main.css` | 浅深双主题 + 桌面/平板/手机三档响应式 |
| `content/docs/*.md` | 课程设计说明书等长文档（Nuxt Content） |
| `docs/NNNNN-*/` | 按任务编号组织的历史记录，入口 `docs/README.md` |
| `scripts/verify-course.mjs` | 数据一致性 + 学情引擎冒烟 |
| `scripts/cdp.py` / `scripts/smoke.py` | 真实视口 CDP 客户端 / 路由与视口冒烟 |
| `.workbuddy/skills/` | 随仓库共享的 `course-builder` 与 `pitfall-resolver` 两个项目级 skill |
| `.*rc.json`、`.husky/` | lint / 格式 / 提交规范 / Git hooks 配置 |

## 架构

- **内容用类型化 TS 数据，不用 Markdown**：课时含讲解块、代码块、提示框、术语、误区、题目与演练标识，结构化数据才能联动测验、概念图谱与学情归因；长篇说明书走 `content/docs/` 由 Nuxt Content 渲染。
- **演练内核由 Vue 托管**：35KB 的 DOM 演练逻辑机械迁移为 ESM 模块，`course-widget.vue` 在 `onMounted` 挂载、`onBeforeUnmount` 调用 `cleanup()` 回收定时器，交互能力完整保留。
- **学情按课程隔离**：`createAnalytics(course, storageKey)` 用闭包捕获课程与 localStorage key，多课程互不串数据；`useLearning` 用 `useState` 保证 SSR 首屏一致，真实档案在 `onMounted` 载入，避免 hydration mismatch。
- **内容 / 引擎 / 视图三层解耦**：引擎不引用 DOM，内容不 import 视图，视图不硬编码课时列表。

## 版本基线

`effect@4.1.4`（npm latest，核实于 2026-11-13）；4.0 于 2026-09-30 stable，LTS 至少到 2029-09，官方文档 `/docs/v4/`。课程按**纯 v4 主线**编写：`Context.Service`、`Effect.run*With`、扁平 `Cause.reasons`、`forkChild / forkDetach`、单包 `effect/*` 子路径、重写后的 fiber runtime 与 MixedScheduler。

## 文档

| 文件 | 内容 |
|---|---|
| `README.md` | 项目介绍（本文件） |
| `AGENTS.md` | AI agent 与维护者的协作约定：命令、门禁、提交规范、命名与工具链约束 |
| `docs/README.md` | 任务记录索引：一次任务一个编号目录，含各任务总览与迁移映射 |
| `content/docs/effect-course-design.md` | 课程设计说明书，渲染于 `/docs/effect-course-design` |

## 使用须知

- 交互演练是**原理模拟**，不是真实 Effect runtime；要跑真实代码请用官方 Playground 或本地安装 `effect@4.1.4`。
- 原静态课程应用与本站不同源，旧进度不会自动带过来：在旧应用「设置」导出 JSON，再到本站课程设置页导入。
- 学情数据只存本机浏览器，清理浏览器数据会丢失，建议定期导出备份。
- 文档基于 2026-11-13 核实的 v4.1.4；`unstable / experimental` 模块未来可能变化。
