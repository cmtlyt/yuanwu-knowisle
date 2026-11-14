# 00051 · Agent 系统课落地（课程数据层）

## 目标

按 `agent-course-outline.md`（大纲 v7，已归档至本目录）把「AI Agent 工程」系统课**正式落地为课程数据**，接入知识岛多课程架构。大纲此前标注「暂不实施」，本任务为首次实施。

产出：`app/data/agent-course/` 目录（complex 4 层课程数据）+ `app/data/courses.ts` 注册一项，通过 `pnpm verify` 与 `pnpm build`，站点出现 `/courses/agent` 课程。

## 变更计划

### 1. 课程数据目录 `app/data/agent-course/`（complex 模式，`renderMode: 'complex'`）

按 course-builder skill 目录化布局：

- `index.ts` —— 唯一导出面 `AGENT_COURSE = { STAGES, CONCEPTS, LESSONS, META, DESIGN, renderMode, MODULES }`
- `modules.ts` —— 11 个模块（模块一 ~ 模块十一）
- `stages.ts` —— 28 个阶段（阶段一 ~ 阶段二十八），每阶段带 `module`；阶段三带 `subStages`（3.1 / 3.2 / 3.3）
- `concepts.ts` —— 知识点 DAG（约 160 概念，`id/name/stage/weight/prereqs`）
- `meta.ts` —— 版本基线（TS 7 + Node 24 + 框架版本锁定表）
- `design.ts` —— 教学设计说明书（绑定课程的数据）
- `lessons/l01.ts … l142.ts` + `lessons/index.ts` —— 一课一文件，聚合时用 `withSubStage` 补阶段三的子阶段归属

### 2. 课程注册 `app/data/courses.ts`

追加一项 `slug: 'agent'`、`storageKey: 'knowisle:agent:v1'`、`data: AGENT_COURSE`。

### 3. 关键口径（实施决策）

- **渲染层零改动**：complex 渲染基础设施（类型 / composable / analytics.moduleRows / complex 视图 / verify 分支）已在 00039–00050 就绪，本任务只写数据。
- **widget 全部 `null`**：Agent 课是全新课程，按「课程解耦」硬性规则不得复用 Effect/RxJS 的 24 个演练；为 142 课新做交互演练属后续增量任务，不在本次落地。`verify` 对 `null` widget 放行（只校验非空 widget 映射）。
- **L142 归阶段二十八**：大纲「收尾·课程总览」L142 归入模块十一（Capstone B）阶段二十八作为最后一课，维持「28 阶段」口径（不新增第 29 阶段）。
- **框架版本以本次联网核实为准**（修正大纲附录 B 的 ⚠️ 估算值，见「验证方案」附的版本核实表）。

## 验证方案

1. `node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs app/data/agent-course app/lib/widgets`（数据一致性 + 引用完整性）
2. `pnpm verify`（三课全轨迹 + complex 引用完整性分支）
3. `pnpm fmt:check` → `pnpm lint` → `pnpm typecheck` → `pnpm build`（质量门禁）

### 版本核实表（2026-11-15 联网 npm registry dist-tags）

| 包 | 大纲附录 B 值 | 本次核实 latest | 结论 |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | 1.x ⚠️ | **1.32.2** | 落地锁定 1.x |
| `langchain` | 0.3.x ⚠️ | **1.6.6** | ⚠️ 已升 major 1，正文按 1.x 写 |
| `llamaindex` | 0.9.x / 1.x ⚠️ | **0.12.1** | 落地锁定 0.12.x |
| `@opentelemetry/api` | 1.9.x ⚠️ | **1.10.0** | 落地锁定 1.x |
| `langsmith`（LangSmith TS 客户端，**非** `@langchain/langsmith`） | 0.3.x ⚠️ | **0.12.0** | 包名 + 版本修正 |
| `@langchain/langgraph` | 1.4.x ✅ | **1.7.4** | 落地锁定 1.x |

## 注意事项

- 目录内兄弟值导入显式 `.ts`；类型走 `~/types/course` type-only；课时文件引用共享构造器 `../../course-builders.ts`（两层）。
- `withSubStage` 只在 `lessons/index.ts` 聚合时对阶段三课时使用（`L()` 构造器无 subStage 形参）。
- 阶段三含子阶段，其每个课时必须显式 `subStage`（3.1/3.2/3.3）或 `null`；其余阶段不填。
- 正文不硬编码小版本号，版本集中在 `META`；框架对照课 API 用 major 版本表述。

## 完成状态（2026-11-15）

已全部落地并通过验证：

- `app/data/agent-course/` 数据层完整：`index.ts` / `modules.ts`（11 模块）/ `stages.ts`（28 阶段）/ `concepts.ts`（142 概念）/ `meta.ts` / `design.ts` / `lessons/l01.ts…l142.ts`（一课一文件）+ `lessons/index.ts`（聚合，`withSubStage` 补阶段三 3.1/3.2/3.3 归属）。
- `app/data/courses.ts` 注册 `slug: 'agent'`、`storageKey: 'knowisle:agent:v1'`。
- 阶段 0–27 全部课时就位（L01–L142），widget 全部 `null`（后续增量任务补充交互演练）。

### 验证结果

| 检查 | 结果 |
|---|---|
| `check-course.mjs`（course-builder skill） | ✅ 全部校验通过（28 阶段 / 142 课 / 142 概念 / 426 题） |
| `pnpm verify`（verify-course + verify-tutor） | ✅ 三课全轨迹 + complex 引用完整性 + 助学 Agent 自检通过 |
| `pnpm fmt:check` | ✅ 通过（`pnpm fmt` 已统一格式） |
| `pnpm lint` | ✅ 0 error（3 个 warning 均为 `app/lib/analytics.ts` 既有代码，非本任务引入） |
| `pnpm typecheck` | ✅ 0 error（5 个 warning 均为既有 `analytics.ts` / `use-learning.ts`，非本任务引入） |
| `pnpm build` | ✅ 构建成功（13.8s） |

### 实施期修复（相对计划）

- `lessons/l29.ts` 代码块内 `\"` 冗余转义（`no-useless-escape`）→ 去掉反斜杠。
- `lessons/l01.ts` / `l13.ts` / `l18.ts` / `l79.ts` 存在未使用的构造器导入（`code` 或 `list`）→ 从 import 移除，消除 lint warning。

### 待后续（不在本任务）

- 为 142 课补充交互演练（widget）——独立增量任务，按课程解耦规则不复用 Effect/RxJS 的既有演练。
