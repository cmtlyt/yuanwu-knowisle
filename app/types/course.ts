/** 课程内容与学情档案的类型契约。内容层、引擎层、视图层共用。 */

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

export type LessonBlock =
  | { type: 'prose'; title?: string; text: string }
  | { type: 'code'; title?: string; code: string; note: string }
  | { type: 'callout'; tone: string; title: string; text: string }
  | { type: 'list'; title?: string; items: string[] }

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
  minutes: number
  difficulty: number
  prereqs: string[]
  concepts: string[]
  goals: string[]
  /** 课程正文 Markdown 源（markdown-in-TS 渲染路径，取代原 blocks 结构；见 00053）。 */
  md: string
  widget: string | null
  quiz: QuizQuestion[]
  terms: string[][]
  pitfalls: string[]
  /** 复杂模式专属：所属子阶段 id（如 '3.1'）；simple 模式或不属于任何子阶段时为空。 */
  subStage?: string | null
}

/**
 * 课程设计说明书（绑定到课程的数据，而非独立 Markdown / Nuxt Content 文件）。
 * 用数据渲染「教学设计」视图；新增章节只改数据，视图自动接入。
 */
export type DesignBlock =
  | { type: 'prose'; title?: string; text: string }
  | { type: 'list'; title?: string; items: string[] }
  | { type: 'callout'; tone: 'tip' | 'warn' | 'deep'; title: string; text: string }
  | { type: 'kv'; title?: string; rows: Array<{ k: string; v: string }> }
  | { type: 'table'; title?: string; columns: string[]; rows: string[][] }
  | { type: 'code'; title?: string; code: string; note?: string }
  /** 从课程数据动态生成「学习路径总表」，避免与 LESSONS 重复维护 */
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

/** 通用课程体形状：STAGES / CONCEPTS / LESSONS / META + 可选 DESIGN 说明书。任意课程共用。 */
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

/** Effect 深度课的数据类型。等价于通用 CourseData（保留名以兼容既有引用）。 */
export type EffectCourseData = CourseData

/** 知识岛中的一门课。新增课程只需往 COURSES 追加一项并提供 data。 */
export interface CourseEntry {
  slug: string
  title: string
  subtitle: string
  /** 课程主标语，供地图页 hero 渲染（可选；缺省回退到 subtitle）。 */
  tagline?: string
  description: string
  icon: string
  color: string
  tags: string[]
  status: 'available' | 'soon'
  storageKey: string
  data?: EffectCourseData
}

export interface LearningProfile {
  name: string
  dailyGoal: number
  startDate: string
  theme: 'light' | 'dark'
}

export interface QuizProgress {
  tries: number
  correct: number
  lastTs: number
  lastCorrect: boolean | null
}

export interface LessonProgress {
  visited: number
  seconds: number
  quiz: Record<string, QuizProgress>
  widgetDone: boolean
  completedAt: number | null
  lastVisited?: number
}

export interface ConceptProgress {
  stability: number
  lastReview: number | null
  correct: number
  wrong: number
  reps: number
}

export interface Attempt {
  ts: number
  lessonId: string
  qIndex: number
  correct: boolean
  concept: string
  review: boolean
}

export interface DaySession {
  seconds: number
  quizzes: number
  lessons: number
}

export interface LearningState {
  version: number
  profile: LearningProfile
  lessons: Record<string, LessonProgress>
  concepts: Record<string, ConceptProgress>
  attempts: Attempt[]
  sessions: Record<string, DaySession>
  reviewHistory: Array<{ ts: number; concept: string; correct: boolean }>
  lastActive: number
}
