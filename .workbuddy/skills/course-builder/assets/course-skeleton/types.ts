/**
 * 课程数据骨架 · 类型契约（自包含版）。
 * 落到目标仓库时，把本文件的类型并入该仓库的共享类型模块（如 `~/types/course`），
 * 其余各文件改用 `import type { ... } from '~/types/course'`（type-only，运行时擦除）。
 */

/**
 * 课时课型。决定体量闸门（`scripts/content-gate.mjs`）用哪一档正文/代码下限、是否允许 0 题。
 * 课型是**课时自己的元数据**：每节课在自己的 `lNN.ts` 里用 `withKind()` 标注，不从阶段继承。
 */
export type LessonKind = 'theory' | 'practice' | 'framework' | 'scenario' | 'capstone' | 'overview'

export interface Stage {
  id: number
  name: string
  en: string
  summary: string
  color: string
  goal: string
  /** 复杂模式专属：所属模块 id；simple 模式课程不填。 */
  module?: number
  /** 复杂模式专属：阶段内的子阶段分组（仅部分阶段用到，如「范式全景」拆 3.1/3.2/3.3）；缺省表示无子阶段。 */
  subStages?: Array<{ id: string; name: string; summary?: string }>
}

export interface Concept {
  id: string
  name: string
  stage: number
  weight: number
  prereqs: string[]
}

export interface CourseMeta {
  version: string
  verifiedAt: string
  lts: string
  docs: string
  release: string
  playground: string
  source: string
  notes: string[]
}

export interface QuizQuestion {
  text: string
  options: string[]
  answer: number
  explain: string
  concept: string
}

export interface Lesson {
  id: string
  stage: number
  title: string
  // 刻意不含 minutes：时长由 lessonMinutes(lesson) 按 md 体量现算，不落数据。
  difficulty: number
  prereqs: string[]
  concepts: string[]
  goals: string[]
  /** 课程正文 Markdown 源（00053 起取代 blocks：markdown-in-TS，见 markdown-article.vue）。 */
  md: string
  widget: string | null
  quiz: QuizQuestion[]
  terms: string[][]
  pitfalls: string[]
  /** 复杂模式专属：所属子阶段 id（如 '3.1'）；simple 模式或不属于任何子阶段时为空。
   *  注意：共享构造器 L() 不含该形参，complex 课在 lessons/index.ts 用 withSubStage(l, id) 补齐。 */
  subStage?: string | null
  /** 课时课型，用 `withKind()` 标注。complex 课程每节课都必须标（漏标闸门直接失败）；simple 课程可不填。 */
  kind?: LessonKind
  /** kind: 'overview' 时必填：说明为什么这节课不需要实现代码。 */
  kindReason?: string
}

export type DesignBlock =
  | { type: 'prose'; title?: string; text: string }
  | { type: 'list'; title?: string; items: string[] }
  | { type: 'callout'; tone: 'tip' | 'warn' | 'deep'; title: string; text: string }
  | { type: 'kv'; title?: string; rows: Array<{ k: string; v: string }> }
  | { type: 'table'; title?: string; columns: string[]; rows: string[][] }
  | { type: 'code'; title?: string; code: string; note?: string }
  | { type: 'lessons' }

export interface DesignSection {
  id: string
  title: string
  intro?: string
  blocks: DesignBlock[]
}

export interface CourseDesign {
  title: string
  summary: string
  sections: DesignSection[]
}

/** 复杂模式渲染所需的模块（课程顶层分组维度）。形状与 Stage 对齐，便于复用渲染。 */
export interface Module {
  id: number
  name: string
  en: string
  summary: string
  color: string
  goal: string
}

/** 课程渲染模式。simple = 扁平的 Stage→Lesson（既有课）；complex = 含模块的 4 层结构（系统课）。缺省 simple。 */
export type RenderMode = 'simple' | 'complex'

/** 通用课程体：STAGES / CONCEPTS / LESSONS / META + 可选 DESIGN 说明书。任意课程共用。 */
export interface CourseData {
  STAGES: Stage[]
  CONCEPTS: Concept[]
  LESSONS: Lesson[]
  META: CourseMeta
  DESIGN?: CourseDesign
  /** 渲染模式。缺省 'simple'（既有课零改动）；'complex' 课程需提供 MODULES 与 Stage.module。 */
  renderMode?: RenderMode
  /** 复杂模式专属：课程顶层模块列表。simple 模式课程不填。 */
  MODULES?: Module[]
}
