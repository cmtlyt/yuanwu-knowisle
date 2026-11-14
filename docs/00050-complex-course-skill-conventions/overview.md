# 00050 · complex 课程数据规范写入 course-builder skill

分支 `feat/agent-course-outline`。

## 目标

把 00039–00041 落地、00049 保留渲染层后沉淀下来的「**complex（4 层）课程数据规范**」写进项目级 skill `course-builder`，使后续生成 / 迁移复杂系统课（如 Agent 系统课，11 模块 / 28 阶段 / 子阶段 / 142 课）时可直接照做，不必再重蹈 00041 踩的坑。

skill 目前只描述 simple 的 2 层模型（`Stage → Lesson`），完全没有 `Module` / `renderMode` / `Stage.subStages` / `Lesson.subStage`。本任务补齐这一半。

## 背景（依据）

- 00039 多模式渲染：`CourseData.renderMode?: 'simple' | 'complex'`（缺省 simple）、`Module` 接口、`Stage.module?`/`subStages?`、`Lesson.subStage?`、`analytics.moduleRows`、`verify-course.mjs` complex 分支校验。
- 00041 创建 complex 测试课程 `agent-test`（3 模块 / 3 阶段含子阶段 2.1/2.2 / 5 课 / 4 概念 / 15 题），踩出 3 个关键坑：
  1. lesson 文件在 `<topic>-course/lessons/` 下，引用 `course-builders.ts` 须 `../../`（回 `app/data/`），不是 `../../../`。
  2. `L()` 构造器**无 `subStage` 字段**，子阶段课须在 `lessons/index.ts` 用 `withSubStage(l, '2.1')` 显式补齐。
  3. verify 的 complex 校验只查「引用完整性」，不约束每课题数（题量设计问题见 00041）。
- 00049 删除该测试课程数据，**保留 complex 渲染层**（组件 / 类型 / 引擎聚合 / verify 校验）。

## 变更计划

1. `references/data-model.md`
   - 「文件组织」目录树：simple 的 `STAGES/CONCEPTS/LESSONS/META/DESIGN` 下，新增可选的 `modules.ts`（`export const MODULES: Module[]`）一行，标注「复杂模式专属」。
   - 「内容层契约」接口块：`Stage` 加 `module?`/`subStages?`，`Lesson` 加 `subStage?`，新增 `Module`、`RenderMode` 接口，`CourseData` 加 `renderMode?`/`MODULES?`（与 `app/types/course.ts` 现状一致）。
   - 新增「### 复杂模式（4 层结构）」小节：层级图 + complex 专属契约 + `withSubStage` 聚合模式 + lesson 导入深度 + verify 的 complex 引用完整性校验。
   - 「多课程注册表」`CourseEntry.data` 说明补一句 complex 也走同一 `CourseData`。
2. `SKILL.md`
   - 资源区 `references/data-model.md` 描述补「含 complex（4 层）课程数据契约与模块聚合模式」。
3. `assets/course-skeleton/types.ts`（自包含种子）
   - 与 `app/types/course.ts` 对齐：加 `Module`/`RenderMode`/`Stage.module?/subStages?`/`Lesson.subStage?`/`CourseData.renderMode?/MODULES?`，使骨架可支撑 complex 课。
4. 回写：`SKILL.md`（本 skill 的 resources 描述）。
5. 记录：本 overview + `docs/README.md` 登记 00050 + 当日记忆日志。

## 不改的边界

- **不动产品代码**：`app/`、`scripts/verify-course.mjs`、既有 effect/rxjs 课——它们的 complex 契约与校验在 00039 已落地，本任务只写「文档 / 规范」。
- **不改 simple 课**与已落盘历史记录（docs/00039–00049、AGENTS.md 历史基线行）。

## 验证方案

- `references/data-model.md` 的接口与 `app/types/course.ts` **逐字段一致**（人工对照，重点 `Module`/`RenderMode`/可选字段）。
- `assets/course-skeleton/types.ts` 与 `app/types/course.ts` 的 complex 类型**逐字段一致**。
- 门禁不受影响（skill 文档非 ts/vue，不进 lint/typecheck；`pnpm fmt:check` 仍 0、`pnpm lint` 0e、`pnpm typecheck` 0e、`pnpm verify` 全绿）。
- `docs/README.md` 正确登记 00050；记忆日志追加。
