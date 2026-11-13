# 00027 · 课程数据层目录化（巨型单文件 → 同名目录 + index.ts + 章节拆分）

- 日期：2026-11-13
- 状态：**已实施完成，全门禁通过**
- 关联：`docs/00024-rxjs-course-multicourse`、`docs/00026-course-restructure-dynamic-quantity`、`app/data/effect-course.ts`（1959 行）、`app/data/rxjs-course.ts`（1978 行）、`.workbuddy/skills/course-builder/`

## 决策记录（用户拍板）

1. **构造器跨课程共享**：`prose/code/call/list/q/L` 两门课逐字一致，抽成 `app/data/course-builders.ts`（与 `courses.ts` 同级的共享层），不与任何课程耦合。
2. **导入写法（方案①，带 `.ts`）**：目录内兄弟**值**导入一律显式 `.ts`（`./stages.ts`、`../course-builders.ts`）——Nuxt 侧 `allowImportingTsExtensions` 放行、Node 侧 strip-types 直连加载，两侧同规则；放弃「省略后缀 + loader hook」方案（会破坏 verify/check 零依赖直连约定）。类型导入仍走 `~/types/course`（type-only，运行时擦除）。
3. **粒度**：一课时一文件（`lessons/l01.ts`…`l26.ts`）。
4. **迁移方式**：直接新建目录 + 删旧单文件（不用 `git mv` 保留 blob，git 识别为 delete+add）。

## 目录结构（定稿）

```
app/data/
├── courses.ts               # import { EFFECT_COURSE } from './effect-course'（省略扩展名，不变）
├── course-builders.ts       # 新增：共享构造器 prose/code/call/list/q/L
├── effect-course/
│   ├── index.ts             # 唯一对外导出面：export const EFFECT_COURSE
│   ├── stages.ts            # export const STAGES: Stage[]
│   ├── concepts.ts          # export const CONCEPTS: Concept[]
│   ├── meta.ts              # export const META: CourseMeta
│   ├── design.ts            # export const DESIGN: CourseDesign
│   └── lessons/
│       ├── index.ts         # export const LESSONS: Lesson[] = [L01, …, L26]
│       └── l01.ts … l26.ts  # 一课时一文件：export const L01 = L('L01', …)
└── rxjs-course/             # 同构，export const RXJS_COURSE
```

## 目标

两个课程数据文件各近 2000 行，单文件难以维护（课时、概念、DESIGN 说明书堆在一起）。本次把它们改造成**同名目录 + `index.ts` 聚合导出**，并把各章节拆成独立文件。两条硬约束：

1. **导入方零改动**：`courses.ts` 里 `import { EFFECT_COURSE } from './effect-course'` 保持原样——Nuxt/Vite 会自动把 `./effect-course` 解析到 `effect-course/index.ts` 的命名导出，导入语句一个字不用改。
2. **Node 校验脚本仍能加载**：`verify-course.mjs` / `check-course.mjs` 走 `--experimental-strip-types`，Node ESM **不推断扩展名、不解析目录 index**，因此目录内兄弟导入必须写**显式 `.ts` 扩展名**，脚本入口按 `.../index.ts` 显式路径 import。

## 探查结论（已实测确认）

- 两门课**完全同构**：都有 `prose/code/call/list/q/L` 构造器 + `STAGES / CONCEPTS / LESSONS / META / DESIGN` + 单一命名导出（`EFFECT_COURSE` / `RXJS_COURSE`）。
- `courses.ts` 是唯一值导入方，用 `./effect-course`（省略扩展名）→ 目录化后浏览器侧自动解析到 `index.ts`。
- 生成的 tsconfig（`.nuxt/tsconfig.*.json`）：`allowImportingTsExtensions: true` + `module: preserve` + `moduleResolution: Bundler` → 目录内 `import ... from './stages.ts'` 在 Nuxt 与 Node 两侧都合法。
- `verify-course.mjs` 靠 `readdirSync(app/data).filter(f=>f.endsWith('-course.ts'))` 发现课程 → **需改为扫子目录**。
- `check-course.mjs` 由 CLI 传路径显式 `import(pathToFileURL(p))` → 调用方传 `.../index.ts` 即可；脚本可加「目录自动补 `index.ts`」增强。
- `smoke.py` 只引用 slug / 路由，**不碰文件路径，无需改**。
- `analytics.ts` 的 `createAnalytics(C)` 收的是数据对象而非文件导入，**不受影响**。

## 导入规范（定稿实现）

| 位置 | 写法 | 原因 |
|---|---|---|
| 目录内兄弟值导入（`index.ts`→`stages.ts`、`lessons/index.ts`→`l01.ts`、`l01.ts`→`../../course-builders.ts`） | **显式 `.ts`** `import { STAGES } from './stages.ts'` | Node strip-types 要求显式扩展名；Nuxt `allowImportingTsExtensions` 放行 |
| 类型导入 | `import type { Lesson } from '~/types/course'`（type-only） | 运行时擦除，Node 不解析；两侧安全 |
| 外部值导入（`courses.ts`） | `import { EFFECT_COURSE } from './effect-course'`（**省略扩展名，不变**） | 仅 Nuxt/Vite 侧使用，解析到 `index.ts`；Node 侧不走这条路 |
| 校验脚本入口 | `import('.../effect-course/index.ts')`（**显式 `index.ts`**） | Node 侧显式路径 |

- 构造器放在**课程数据层的共享文件** `app/data/course-builders.ts`（跨课程复用、不与单课耦合），课时文件 `import { L, prose, … } from '../../course-builders.ts'`。
- 课时文件命名 `l01.ts`（对应课时 id `L01`）……`l26.ts`，符合 kebab-case。
- `index.ts` 是**唯一对外命名导出面**，内容与原 `export const EFFECT_COURSE: EffectCourseData = { STAGES, CONCEPTS, LESSONS, META, DESIGN }` 一致（改为从子模块导入成员再聚合）。

## 变更计划

### 一、Effect 课程目录化

- 删 `app/data/effect-course.ts`，建 `app/data/effect-course/`。
- 构造器 `prose/code/call/list/q/L` 抽到**共享层** `app/data/course-builders.ts`（跨课程复用、不与单课耦合），课时文件 `import { L, prose, … } from '../../course-builders.ts'`。
- `stages.ts` / `concepts.ts` / `meta.ts` / `design.ts` 各放对应常量（内容照搬，`const X` → `export const X`，类型改 type-only 导入）。
- `lessons/l01.ts`…`l26.ts` 各放一课（`export const L01 = L('L01', …)`），`lessons/index.ts` 聚合成 `LESSONS`。
- `index.ts` 从子模块导入并 `export const EFFECT_COURSE`。

### 二、RxJS 课程目录化

- 同构操作：`app/data/rxjs-course/` + `RXJS_COURSE`。

### 三、验证脚本调整

- **`scripts/verify-course.mjs`**：发现逻辑从 `filter(f=>f.endsWith('-course.ts'))`（文件）改为「`readdirSync` 取**目录**且 `name.endsWith('-course')`」，逐个 `import(path.join(dataDir, dir, 'index.ts'))`。鸭子类型识别（含 `STAGES/LESSONS/META` 的对象）不变。
- **`.workbuddy/skills/course-builder/scripts/check-course.mjs`**：`load(p)` 增强——若 `p` 是目录，自动补 `p/index.ts`（`fs.statSync` 判目录）；用法文档与调用示例改为 `app/data/effect-course/index.ts`。
- `smoke.py`、`analytics.ts`、`widgets.ts` 确认无需改。

### 四、skill 标准同步（把「目录化布局」写成标准）

- **`assets/course-skeleton.ts`（单文件）→ `assets/course-skeleton/`（目录模板）**：拆成 `index.ts / types.ts / stages.ts / concepts.ts / meta.ts / design.ts / builders.ts / lessons/index.ts / lessons/l01.ts`，各文件注释写明「目录内值导入带 `.ts`、外部 `courses.ts` 省略扩展名、类型走 `~/types/course`」规范。占位符只放字符串字面量与注释（不碰标识符），保证骨架本身过 oxfmt/oxlint 门禁（`.workbuddy/skills/**/*.ts` 在门禁范围内）。
- **`assets/course-skeleton/README.md`（新增）落地说明**：区分「仓库级共享种子（`types.ts`/`builders.ts`，每仓只落一次）」与「课程级文件（`index.ts` + 章节 + `lessons/`，每门课各一份）」；新建课程只建课程级文件、复用仓库共享层，**不逐课复制** types/builders。两种场景（本仓库已有共享层 → 跳过落种子；新项目 → 先落一次共享层）都写明。
- **`references/workflow.md` 阶段 3**：产出描述由 `<topic>-course.ts` 改为「`<topic>-course/` 目录」，动作 1 加「仓库级 vs 课程级」文件分类规则，动作 2 强调构造器复用不逐课拷，并加「目录内值导入必须显式 `.ts`；`courses.ts` 仍用省略扩展名 `./<topic>-course`」硬约束。
- **`references/data-model.md`**：「文件组织」小节说明标准目录布局 + 导入规范 + 「仓库级共享 vs 课程级」区分（`types`/`course-builders` 仓库级一份、课程目录内不重复）。
- **`SKILL.md`**：资源描述指向 `course-skeleton/`（目录 + README），硬性规则新增目录化布局条目（原第 3 条起顺延重编号）。

### 五、文档与记忆

- 本 overview（已建）补全「变更 / 验证」。
- **pitfall-resolver 已回写**：`references/course-content.md` 新增「Node 不解析目录 `index.ts`、不补相对导入扩展名」条目（目录化后旧脚本按文件路径 / 省略扩展名 import 即失效 → 显式 `.../index.ts` + 目录内显式 `.ts`），并把 `*-course.ts` 的文件路径示例改为目录；`SKILL.md` 索引加一条目录化检索关键词。
- `docs/README.md` 索引已追加 00027；工作区记忆 `.workbuddy/memory/MEMORY.md` 的「相关项目」已更新为目录化布局与导入规范。

## 验证结果（实测全部 exit 0）

1. `pnpm fmt` + `pnpm fmt:check`：全绿（106 文件）
2. `pnpm lint` 0 error（21 warning = HEAD 基线，零新增）；`pnpm typecheck` 0 error（23 warning = HEAD 基线，零新增）
3. `pnpm verify`：双课程全绿（effect 71% / rxjs 74% 自洽），发现逻辑改扫目录后正常
4. `node --experimental-strip-types …/check-course.mjs app/data/effect-course app/lib/widgets.ts`（传**目录**，自动补 index.ts）与 rxjs 各跑一遍全绿
5. `pnpm build`：成功（16.4s，Nuxt/Vite 解析 `./effect-course` → `index.ts`）
6. `python scripts/smoke.py --base http://127.0.0.1:3199`：SSR/客户端/视口全绿

**顺手修正的遗留项**：`smoke.py` 里 effect-ts 的 `lessons/L18`（runLoop 指令解释器）断言是 **00026 重编号前遗留**——重编号后该课已移到 **L19**（标题「★ 指令解释器：Effect 蓝图与 runLoop」），smoke 仍按旧编号断言 L18，首跑报「缺 runLoop」。已把 `ROUTES`/`CLIENT_ROUTES`/`VIEWPORTS` 里 5 处 `effect-ts/lessons/L18` 全改为 `L19`，复跑全绿。与目录化无关（HEAD 单文件态 L18 就已是 Fiber），属「检查验证脚本」任务范围内的修正。

## 风险与注意

- **构造器共享层**：`app/data/course-builders.ts` 跨课程复用；签名变更须同步所有 `*-course/lessons/lNN.ts` 的 import。
- **`~` 别名**：目录内**只允许 type-only** 走 `~/types/course`（运行时擦除）；任何值导入必须用相对 `.ts`，不能用 `~` 别名（Node 侧解析不了 `~`）。
- **粒度已定稿**：一课时一文件（`lessons/lNN.ts`），按 stage 合并更粗的粒度不采用。
- **迁移方式已定稿**：直接新建目录 + 删旧单文件（git 识别为 delete+add，未用 `git mv` 保留 blob）。
