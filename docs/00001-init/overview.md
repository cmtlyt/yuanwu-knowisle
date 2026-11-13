# 00001 · 初始化：静态课程应用迁入知识岛

> 2026-11-13 ｜ 由原根目录 `overview.md` 前半部分拆出 ｜ [索引](../README.md) ｜ [迁移映射](migration.md)

## 目标

把独立静态课程应用 `effect-course/`（零依赖 SPA，IIFE + DOM）的代码整体迁入 `D:/code/@cmtlyt/yuanwu-knowisle`，重构为知识岛里的**一门课程实体** `/courses/effect-ts`。目标仓库当时是 Nuxt 4.6.4 空壳（`app.vue` 仍是 NuxtWelcome、git 无提交），已装 Nuxt Content 3.16 / Nuxt UI 4 / Tailwind 4 / Tiptap / @nuxtjs/device。

用户确认两项：① 知识岛中的一门课（首页课程列表 + 课程实体，预留多课程）；② TS 结构化数据 + Vue 组件，不把 24 课重写为 Markdown。

## 做了什么

- 站点首页 `/` 改为知识岛课程列表；Effect 教学成为 `/courses/effect-ts` 课程实体，内含 6 阶段 24 课、26 概念、48 题、11 个交互演练。
- 项目从 `NuxtWelcome` 空壳变成完整 Vue 应用：`pages/` 8 个路由、`components/course/` 5 个组件、统一 layout（顶栏 / 底部标签栏 / 抽屉 / 主题）。
- 内容用类型化 TS 数据（`app/data/effect-course.ts`），课程注册表 `app/data/courses.ts` 预留多课程扩展；学情引擎按课程隔离 storage key。
- 课程设计说明书迁到 Nuxt Content，可在 `/docs/effect-course-design` 在线阅读。
- 新增 `scripts/verify-course.mjs`（Node 22 `--experimental-strip-types` 直接加载 TS）、`scripts/cdp.py`（纯标准库 CDP 客户端）与 `scripts/smoke.py`。

## 关键决策

| 决策 | 原因 |
|---|---|
| 内容层 TS 结构化数据而非 Markdown | 讲解块 / 题目 / 术语 / 演练标识需要结构化，才能让测验、概念图谱、学情归因自动联动 |
| 11 个演练内核保留 DOM 实现，由 `course-widget.vue` 托管 | 35KB 定时器 + SVG 逻辑整体重写风险高；Vue 管挂载与 cleanup，交互 100% 保留 |
| `createAnalytics(course, key)` 工厂 | 闭包捕获 COURSE 与 localStorage key，多课程学情互不串数据 |
| `useState` + `onMounted` 载入档案 | SSR 首屏与客户端一致，避免 hydration mismatch |
| 沿用已验证的移动端 CSS | 底部标签栏 / 抽屉 / 独立横滑 / 安全区，CDP 真实视口重验 |
| CDP 构造真实视口，不用 iframe | Nitro 生产服务器用 build 时的静态清单，运行时新增 public 文件返回 404，iframe 探针无法托管 |

## 验证

- `pnpm verify` — 结构 6/24/26/48、引用完整性、答案索引、组件映射、引擎全轨迹（100% 进度 / 70 掌握度 / 75% 正确率）、遗忘入队、导出导入、多课程隔离，全绿。
- `pnpm build` — Nuxt 4.6.4 生产构建成功，Nuxt Content 处理 1 篇文档、无配置警告。
- `python scripts/smoke.py --base http://127.0.0.1:3100` — 11 条 SSR 路由、3 个页面客户端渲染、4 种视口 13 组布局检查，全绿。
- 交互冒烟 — 课程卡片跳转、抽屉开合、答题写入 localStorage、即时反馈、主题切换、雷达图、文档渲染、桌面导航，全绿。
- 视觉复核 — 390px 首页 / 课程地图 / 课时 / 仪表盘 / 抽屉与 1440px 桌面截图正常。

## 运行方式

```bash
pnpm dev          # http://localhost:3000
# 或
pnpm build && PORT=3100 node .output/server/index.mjs
```

## 已知限制

- 新旧应用不同源，旧进度需在旧应用导出 JSON 后于新站课程设置页导入。
- 演练是原理模拟，不是真实 Effect runtime。
- 学情数据仅存本机，建议定期导出备份。
- 构建时有一条 Nuxt 4.6.4 自身的 Nitro 内部模块解析警告（基线构建即存在），不影响运行。

## 当时的踩坑

- 布局里的抽屉按钮漏了 `id="menuBtn"`（class 在、功能正常），冒烟脚本按 id 探测出现假阴性；原检查把 `missing` 当通过是假阳性，两处均已修。
- 后续任务：[00002 命名统一](../00002-kebab-case-naming/overview.md)、[00004 工作区迁入](../00004-workspace-migration/overview.md)。
