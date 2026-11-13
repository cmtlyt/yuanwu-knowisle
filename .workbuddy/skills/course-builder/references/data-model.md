# 内容数据契约与学情模型

以下结构可直接作为新课程的类型契约骨架。已验证参考实例：Effect 4.1.4 深度课（6 阶段 / 26 课 / 27 概念 / 59 题 / 11 演练）与 RxJS 7.8.2 深度课（6 阶段 / 26 课 / 28 概念 / 69 题 / 13 演练）。**这些数字是「按复杂度落出来的结果」，不是目标或下限**——新课的课时/概念/题数应随其内容动态浮动（见下文「数量动态化原则」），不要反向去凑这些整数。

## 分层原则

```
<topic>-course/            一门课一个目录，唯一内容源，不 import 任何视图
├── index.ts               唯一对外导出面：export const <TOPIC>_COURSE
├── stages.ts / concepts.ts / meta.ts / design.ts
├── lessons/
│   ├── index.ts           聚合 LESSONS
│   └── lNN.ts            一课时一文件
        │
        ├── course-builders.ts   跨课程共享构造器 prose/code/call/list/q/L（不与单课耦合）
        ├── analytics.ts        纯计算，零 DOM；createAnalytics(course, storageKey) 工厂
        ├── widgets.ts          演练注册表，(host, ctx) => cleanup
        └── types/*.ts          共享类型契约
                │
          pages / components / composables  ← 只消费，不硬编码课时列表
```

新增课时 = 新建 `<topic>-course/lessons/lNN.ts` 并在 `lessons/index.ts` 与 `concepts.ts` 登记；地图、侧栏、测验、复习队列、诊断、教师报表全部自动接入。

## 文件组织（课程数据层目录化布局，标准实现）

一门课 = 一个同名目录，巨型单文件拆成章节文件；`index.ts` 是唯一对外导出面。

```
app/data/
├── courses.ts            # 注册表：import { TOPIC_COURSE } from './<topic>-course'（省略扩展名，不变）
├── course-builders.ts    # 共享构造器 prose/code/call/list/q/L（跨课程复用，不与单课耦合）
└── <topic>-course/
    ├── index.ts          # export const TOPIC_COURSE = { STAGES, CONCEPTS, LESSONS, META, DESIGN }
    ├── stages.ts         # export const STAGES: Stage[]
    ├── concepts.ts       # export const CONCEPTS: Concept[]
    ├── meta.ts           # export const META: CourseMeta
    ├── design.ts         # export const DESIGN: CourseDesign
    └── lessons/
        ├── index.ts      # export const LESSONS: Lesson[] = [L01, …]
        └── lNN.ts        # 一课时一文件：export const LNN = L('LNN', …)
```

**导入规范（关键——保证 Nuxt 与 Node 校验脚本两侧都能加载）：**

| 导入位置 | 写法 | 原因 |
|---|---|---|
| 目录内兄弟**值**导入（`index.ts`→`stages.ts`、`lessons/index.ts`→`lNN.ts`、`lNN.ts`→`../../course-builders.ts`） | **显式 `.ts`**：`import { STAGES } from './stages.ts'` | Node `--experimental-strip-types` 要求显式扩展名；Nuxt `allowImportingTsExtensions` 放行 |
| 类型导入 | `import type { Lesson } from '~/types/course'`（type-only） | 运行时擦除，Node 不解析；两侧安全 |
| 外部消费方 `courses.ts` | `import { TOPIC_COURSE } from './<topic>-course'`（**省略扩展名，不变**） | 仅 Nuxt/Vite 浏览器侧用，自动解析到 `index.ts`；Node 侧不走这条路 |
| 校验脚本入口 | `import('…/<topic>-course/index.ts')`（**显式 `index.ts`**） | Node 侧显式路径 |

- 课时文件命名 `lNN.ts`（小写，对应课时 id `LNN`），符合 kebab-case。
- 巨型单文件已难维护（近 2000 行）；**新增课程直接按目录布局生成**，不要再生成巨型单文件。
- 校验脚本 `check-course.mjs` 支持传**目录**（自动补 `index.ts`）；`verify-course.mjs` 按 `*-course/` 目录动态发现课程。
- **仓库级共享 vs 课程级**：`types`（`~/types/course`）与 `course-builders.ts`（构造器）是**仓库级、每个仓库只存一份**，所有课程共用；**新建课程只建课程级文件**（`index.ts` + 各章节 + `lessons/`），不要往课程目录里再拷 `types.ts` / `builders.ts`（各课各带一份会分叉、改签名要改 N 处）。skeleton 里自包含的 `types.ts` / `builders.ts` 只是**落地种子**：目标仓库尚无共享层时才把它们落成 `~/types/course` + `app/data/course-builders.ts`，**落一次**，之后每门课都复用这份共享层。

## 内容层契约

```ts
interface Stage   { id: number; name: string; en: string; summary: string; color: string; goal: string }
interface Concept { id: string; name: string; stage: number; weight: number; prereqs: string[] }
interface CourseMeta {
  version: string; verifiedAt: string; lts: string; docs: string
  release: string; playground: string; source: string; notes: string[]
}

type LessonBlock =
  | { type: 'prose';   title?: string; text: string }
  | { type: 'code';    title?: string; code: string; note: string }
  | { type: 'callout'; tone: string; title: string; text: string }
  | { type: 'list';    title?: string; items: string[] }

interface QuizQuestion {
  text: string; options: string[]; answer: number; explain: string; concept: string
}
interface Lesson {
  id: string; stage: number; title: string; minutes: number; difficulty: number
  prereqs: string[]; concepts: string[]; goals: string[]
  blocks: LessonBlock[]; widget: string | null
  quiz: QuizQuestion[]; terms: string[][]; pitfalls: string[]
}
interface CourseData {
  STAGES: Stage[]; CONCEPTS: Concept[]; LESSONS: Lesson[]; META: CourseMeta
  DESIGN?: CourseDesign
}
```

### 课程设计说明书（绑定课程的数据，非独立文件）

```ts
type DesignBlock =
  | { type: 'prose';   title?: string; text: string }
  | { type: 'list';    title?: string; items: string[] }
  | { type: 'callout'; tone: 'tip' | 'warn' | 'deep'; title: string; text: string }
  | { type: 'kv';      title?: string; rows: Array<{ k: string; v: string }> }
  | { type: 'table';   title?: string; columns: string[]; rows: string[][] }
  | { type: 'code';    title?: string; code: string; note?: string }
  | { type: 'lessons' }                               // 从 LESSONS 动态生成学习路径总表
interface DesignSection { id: string; title: string; intro?: string; blocks: DesignBlock[] }
interface CourseDesign  { title: string; summary: string; sections: DesignSection[] }
```

- 说明书是 `CourseData.DESIGN`，随内容层一起维护；由「教学设计」视图渲染，**不要写成独立的 Markdown / Nuxt Content 文件**（否则删除内容模块后说明书会悬空）。
- `type: 'lessons'` 区块不写死行：视图按 `LESSONS` + 概念名渲染学习路径总表，新增课时自动出现。
- 其他区块都是纯静态结构（`prose` / `list` / `callout` / `kv` / `table` / `code`），视图按 `type` 分发渲染。

**约束**

- `answer` 是 `options` 的 0-based 索引，必须落在范围内。
- `quiz[].concept` 必须存在于 `CONCEPTS`；这是学情归因能定位薄弱点的唯一依据。
- `lesson.prereqs` 指向的课时必须在数组中且**顺序更早**（保证 DAG 可线性学习）。
- `lesson.widget` 必须能在演练注册表中解析；允许 `null`。
- 每课 `blocks` / `goals` / `pitfalls` / `terms` 非空。
- `META.version` 是唯一版本源，正文不得散落硬编码版本号。
- **数量动态化（禁止用固定个数约束生成）**：课时数、概念数、阶段数随知识复杂度浮动——铺垫阶段可少（如 3 课）、核心/难点阶段可多（如 5 课），「6 阶段 × 4 课 = 24 课」只是经验起点而非硬约束，**不得为凑整而拆碎知识点或硬塞课时**。题目数由**该课涉及知识点的完整性**驱动：先列出每个知识点要被讲透的**各个面向**（定义 / 语义、常见陷阱、选型对比、边界与例外、典型用法、易混淆点……），每个面向至少 1 题；同一知识点面向多时**可以有更多题**（哪怕一个知识点出 10 题来覆盖它的全部面向），面向少则题少——**换角度补题是常态手段，与难度高低、weight 大小无关**。禁止按 `difficulty` 一刀切定「每课 N 题」，也**不**把「题数 = 概念数」当成下限或上限，更**不**把同一个面向反复堆题。改题后必跑覆盖审计：该课每个知识点需覆盖的各面向都有题、全课程无「未被任何题覆盖」的知识点。

## 数量动态化原则（贯穿各阶段）

生成课程时，以下数字一律由内容复杂度决定，**不得作为生成约束或验收目标**：

| 量 | 决定因素 | 反模式（禁止） |
|---|---|---|
| 阶段数 | 官方 learning spine 的深度 + 是否叠加「底层原理」层 | 为凑 6 阶段而硬拆或硬并 |
| 每阶段课时数 | 该阶段知识点的密度与难点（铺垫少、核心多） | 固定「每阶段 4 课 / 每课 2 题」 |
| 概念数 | 实际可独立归因的知识点数 | 为凑整数拆碎或合并概念 |
| 每课题目数 | 该课涉及**各知识点的要讲透面向**（定义 / 陷阱 / 选型 / 边界 / 易混淆…）是否全覆盖；单知识点面向多就多出题，面向少就少出题 | 按 `difficulty` / `weight` 定死题数、把「题数 = 概念数」当上下限、同一面向反复堆题 |

判断「讲没讲透」看的是**该课涉及的每个知识点是否都按它要讲透的面向被题目覆盖**（换角度补题是常态手段，对每个知识点一视同仁，不区分难易），而不是课时数或题目总数是否等于某个预设值。


## 多课程注册表

```ts
interface CourseEntry {
  slug: string; title: string; subtitle: string; description: string
  icon: string; color: string; tags: string[]
  status: 'available' | 'soon'
  storageKey: string      // 课程间学情隔离的关键
  data?: CourseData
}
```

路由 `/courses/[slug]/...` 由注册表驱动；`storageKey` 形如 `knowisle:effect-ts:v1`，带版本号以便未来迁移档案。

## 学情状态结构

```ts
interface LearningState {
  version: number
  profile: { name: string; dailyGoal: number; startDate: string; theme: 'light' | 'dark' }
  lessons: Record<string, { visited: number; seconds: number; quiz: Record<string, QuizProgress>;
                            widgetDone: boolean; completedAt: number | null; lastVisited?: number }>
  concepts: Record<string, { stability: number; lastReview: number | null;
                             correct: number; wrong: number; reps: number }>
  attempts: Array<{ ts: number; lessonId: string; qIndex: number;
                    correct: boolean; concept: string; review: boolean }>
  sessions: Record<string, { seconds: number; quizzes: number; lessons: number }>
  reviewHistory: Array<{ ts: number; concept: string; correct: boolean }>
  lastActive: number
}
```

## 核心公式

**概念掌握度**（0–100，四项加权）

```
mastery = 100 × (0.30 × recent + 0.20 × accuracy + 0.25 × retention + 0.25 × exposure)
```

- `recent`：最近 5 次作答按时间衰减加权（无记录时退化为 `accuracy`）
- `accuracy`：`correct / total`
- `retention = exp(-daysSince / max(0.5, stability))`；从未复习记 0
- `exposure`：练习覆盖度（该题所属概念的作答次数归一化）

分档：`≥80 扎实` / `≥60 发展中` / `<60 薄弱`。阶段与总体掌握度按 `Concept.weight` 加权平均。

**记忆稳定性更新**（每次作答后）

```
答对：stability = min(90, stability × (1 + 0.8 × (1 - retention)) + 0.6)
答错：stability = max(0.5, stability × 0.55)
```

**复习队列**：已练习过（`total > 0`）且 `retention < 0.82` 的概念，按 retention 升序；`retention < 0.5` 标注「记忆明显衰退」。

**薄弱点归因**（`mastery < 68`，取前 6 条），按优先级给出原因与行动：

1. 前置概念掌握度 `< 70` → 「前置缺口」，回到前置课
2. `retention < 0.6` 且 `accuracy ≥ 0.65` → 「遗忘」，安排复习
3. `accuracy` 低 → 「理解偏差」，重做讲解与演练
4. `exposure` 低 → 「练习不足」，追加同概念题目

**推荐下一课**：按依赖顺序取首个未完成课时；若有复习队列到期，优先插入复习建议。

## 必测断言（引擎自检）

| 场景 | 期望 |
|---|---|
| 空状态 | 进度 0%、推荐首课、教师报表行数 = 课时数 |
| 完整轨迹 | 逐课访问/答题/演练/完成 → 进度 100%、掌握度 > 60、**正确率 = 按模拟轨迹自洽计算**（期望值由「每课对/错分布 × 各课题数」推得，不硬编码魔法数字——题目数动态浮动时仍能稳定通过）、报表行数不变 |
| 遗忘 | 把某概念 `lastReview` 回拨 30 天 → 进入复习队列 |
| 导出导入 | `overall(importState(exportState(s)))` 与原始一致 |
| 非法备份 | `importState('{"version":9}')` 抛错 |
| 多课程隔离 | 另一 `storageKey` 的引擎进度为 0 |

## 扩展机制

- 内容层新增课时不改任何视图或引擎代码。
- 课时质量标记：内容块/目标/题目/术语缺失时在「教学准备」页标「需修订」，由自检脚本驱动。
- 版本升级：改 `META` 与 `storageKey` 版本号；旧档案通过导入导出迁移，不做隐式数据迁移。
- 教师视图：教师报表按课时一行，含完成状态、停留时长、正确率、薄弱概念，供长期教学复盘。
