# 00002 · 文件名统一 kebab-case

> 2026-11-13 ｜ 由原 `overview.md`「文件命名统一」章节 + 当日记忆日志拆出 ｜ [索引](../README.md)

## 目标

用户要求「文件命名统一使用烤串式，不用驼峰」。审计出 9 个不合规文件并全部改名，同步 15 个文件的引用。

## 变更

| 原名 | 现名 |
|---|---|
| `useCourse.ts` / `useLearning.ts` | `use-course.ts` / `use-learning.ts` |
| `CourseWidget.vue` / `LessonBlock.vue` / `QuizCard.vue` / `RadarChart.vue` / `TimelineChart.vue` | `course-widget.vue` / `lesson-block.vue` / `quiz-card.vue` / `radar-chart.vue` / `timeline-chart.vue` |
| `docs/MIGRATION.md` | `docs/migration.md` |
| `scripts/cdp_client.py` | `scripts/cdp.py` |

`default.vue` 补了 `useCourse` 的显式 import，不再依赖 Nuxt 按文件名猜测自动导入名——**改名会改变自动导入名**，这是本次最容易漏的一步。

## 约定与例外

- 项目内新增文件统一 **kebab-case**（全小写 + 连字符）。
- 例外：Nuxt / 工具强制文件名（`nuxt.config.ts`、`content.config.ts`、`app.vue`、`index.vue`、`default.vue`、`[slug]` / `[id]` 动态路由段、`tsconfig.json`、`package.json`、`pnpm-lock.yaml`）、全大写标准名（`README.md`、`AGENTS.md`、`SKILL.md`）。
- Python 模块名不能含连字符（`from cdp-client import ...` 非法），用单词名 `cdp.py`，不引入 importlib 绕路。
- 约定只约束**文件名**；文件内 TS / Vue 标识符仍按语言惯例用 camelCase / PascalCase。

现行完整口径见仓库根目录 `AGENTS.md`。

## 验证

- 命名合规 / 残留旧引用 / 失效 `~/` import 三项静态检查全绿。
- `pnpm verify`、`pnpm build` 通过。
- 一次性 3199 端口临时服务跑 `smoke.py`：11 条 SSR 路由 + 3 页客户端渲染 + 4 种视口 13 组布局全绿，跑完即关，未重启用户停掉的 3100 预览服务。
