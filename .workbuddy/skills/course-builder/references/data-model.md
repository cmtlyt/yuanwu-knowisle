# 内容数据契约与学情模型

以 Effect 4.1.4 深度课（6 阶段 / 24 课 / 26 概念 / 48 题 / 11 演练）为已验证实例。下列结构可直接作为新课程的类型契约骨架。

## 分层原则

```
course-data.ts  ── 唯一内容源，不 import 任何视图
      │
      ├── analytics.ts  纯计算，零 DOM；createAnalytics(course, storageKey) 工厂
      ├── widgets.ts    演练注册表，(host, ctx) => cleanup
      └── types/*.ts    共享类型契约
              │
        pages / components / composables  ← 只消费，不硬编码课时列表
```

新增课时 = 往 `LESSONS` 追加一项并在 `CONCEPTS` 登记；地图、侧栏、测验、复习队列、诊断、教师报表全部自动接入。

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
}
```

**约束**

- `answer` 是 `options` 的 0-based 索引，必须落在范围内。
- `quiz[].concept` 必须存在于 `CONCEPTS`；这是学情归因能定位薄弱点的唯一依据。
- `lesson.prereqs` 指向的课时必须在数组中且**顺序更早**（保证 DAG 可线性学习）。
- `lesson.widget` 必须能在演练注册表中解析；允许 `null`。
- 每课 `blocks` / `goals` / `pitfalls` / `terms` 非空。
- `META.version` 是唯一版本源，正文不得散落硬编码版本号。

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
| 完整轨迹 | 逐课访问/答题/演练/完成 → 进度 100%、掌握度 > 60、正确率 = 预设值、报表行数不变 |
| 遗忘 | 把某概念 `lastReview` 回拨 30 天 → 进入复习队列 |
| 导出导入 | `overall(importState(exportState(s)))` 与原始一致 |
| 非法备份 | `importState('{"version":9}')` 抛错 |
| 多课程隔离 | 另一 `storageKey` 的引擎进度为 0 |

## 扩展机制

- 内容层新增课时不改任何视图或引擎代码。
- 课时质量标记：内容块/目标/题目/术语缺失时在「教学准备」页标「需修订」，由自检脚本驱动。
- 版本升级：改 `META` 与 `storageKey` 版本号；旧档案通过导入导出迁移，不做隐式数据迁移。
- 教师视图：教师报表按课时一行，含完成状态、停留时长、正确率、薄弱概念，供长期教学复盘。
