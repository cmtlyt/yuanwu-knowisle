# 00018 · 课程设计说明书转数据并渲染 + skill 补这一步

- 日期：2026-11-13
- 关联：docs/00017-*（移除 Nuxt Content 时一并删掉了 `content/docs/effect-course-design.md`）、`.workbuddy/skills/course-builder/`

## 目标

`00017` 移除了 `@nuxt/content` 与 `content/`，原先由 Nuxt Content 渲染的 `effect-course-design.md`（教学设计说明书）随之消失。用户要求：

1. 这份说明书的内容**转成数据形式、跟课程绑定并渲染出来**；
2. `course-builder` skill 中也**应该包含这一步**，即设计说明书本就以数据形式绑定课程、由专用视图渲染，而不是独立 Markdown / Content 文件。

## 变更

### 类型（app/types/course.ts）

新增绑定到课程的设计说明书契约：

- `DesignBlock`：联合类型 `prose / list / callout / kv / table / code / lessons`
  - `lessons` 为特殊块：视图按 `LESSONS` + 概念名**动态生成学习路径总表**，不与课时数据重复维护。
- `DesignSection { id, title, intro?, blocks }`、`CourseDesign { title, summary, sections }`
- `EffectCourseData` 增加可选字段 `DESIGN?: CourseDesign`

### 数据（app/data/effect-course.ts）

- 新增 `DESIGN` 常量，把 `effect-course-design.md` 的 9 个章节忠实转为数据：版本基线（kv）、教学目标与受众（含 L1/L2/L3 表）、平缓学习路径（prose + `lessons` 派生表 + 与官方 spine 关系）、知识点依赖图（含 ASCII 主干 `code` 块）、单课时结构、学情分析模型（掌握度/稳定度公式 `code`、诊断规则 `table`）、长期教学准备、运行与维护、已知边界。
- `EFFECT_COURSE` 增加 `DESIGN` 字段。学习路径总表改为从 `LESSONS` 派生，新增课时会自动出现。
- 同步 `import type` 加入 `CourseDesign`。

### 视图（app/pages/courses/[slug]/design.vue 新增）

- 渲染 `data.DESIGN`：按 `block.type` 分发到 `.block` / `.callout` / `.tbl` / `.code-block` 等既有样式；`lessons` 块动态生成 24 课总表（阶段 / 课时 / 标题 / 分钟 / 难度 / 核心概念 / 演练）。
- 顶部与 `teacher.vue` 一致的 `crumb` + `view-head`。

### 导航（app/layouts/default.vue）

- tabs 增加「教学设计」（📘 / 设计），指向 `${base}/design`；`isActive` 已通过 `startsWith` 覆盖，无需额外改动。

### 验证脚本

- `scripts/verify-course.mjs`：新增「教学设计（DESIGN）」段，校验 `DESIGN` 已绑定、标题摘要完整、章节 id 唯一、区块结构有效。
- `.workbuddy/skills/course-builder/scripts/check-course.mjs`：新增**可选** DESIGN 校验（存在时才验），保持通用性。
- `scripts/smoke.py`：`ROUTES` 增加 `/courses/effect-ts/design`；`CLIENT_ROUTES` 与 390/1440 视口集增加该路由。

### skill（.workbuddy/skills/course-builder/）

- `SKILL.md`：硬性规则 2 明确「课程设计说明书必须作为绑定课程的数据（DESIGN 字段）写在内容层、由教学设计视图渲染，不写成独立 Markdown / Nuxt Content 文件」；工作流表阶段 2 产出改为「绑定课程的数据 DESIGN」。
- `references/workflow.md`：阶段 1 去掉「长篇说明书走 Content 集合」，改为数据绑定；阶段 2 第 6 步写明 DESIGN 字段 + 教学设计视图 + `lessons` 派生块；阶段 8 第 5 步去掉 Content 集合表述。
- `references/data-model.md`：内容层契约补充 `DESIGN?: CourseDesign` 与 `CourseDesign` / `DesignBlock` 类型与约束。

### 文档

- `README.md` 课程路由表新增 `/courses/effect-ts/design`。

## 验证（全部 exit 0）

- `pnpm fmt:check`：33 文件全绿
- `pnpm lint`：0 error / 19 warning（warning 为预先存在的 `Array#reverse`、类型断言提示，本次无新增）
- `pnpm typecheck`：0 error / 21 warning（预存在）
- `pnpm verify`：全绿，含新增 DESIGN 校验（9 节、区块结构有效）
- `node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs app/data/effect-course.ts app/lib/widgets.ts`：全绿，含可选 DESIGN 校验
- `pnpm build`：10.9s，产物 2.93 MB
- `python scripts/smoke.py --base ...`：SSR 11 路由全 200（含 `/design`）、客户端渲染无异常、320/390/768/1440 视口无横向溢出

## 注意事项

- 说明书以数据形式绑定到课程，不再有独立 Markdown 文件；原文仍在 git 历史（`git show HEAD:content/docs/effect-course-design.md`）可恢复，但不再作为渲染来源。
- 新增/调整说明书内容只改 `app/data/effect-course.ts` 的 `DESIGN`，视图自动接入；新增课时会同时出现在学习路径总表。
- 本次改动**未提交**（沿用 00016 后的「改动先在工作区、按任务拆分提交」约定）；如需提交可再按主题分组。
