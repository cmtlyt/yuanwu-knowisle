/** 课程内容与学情档案的类型契约。内容层、引擎层、视图层共用。 */

export interface Stage {
  id: number
  name: string
  en: string
  summary: string
  color: string
  goal: string
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
  blocks: LessonBlock[]
  widget: string | null
  quiz: QuizQuestion[]
  terms: string[][]
  pitfalls: string[]
}

export interface EffectCourseData {
  STAGES: Stage[]
  CONCEPTS: Concept[]
  LESSONS: Lesson[]
  META: CourseMeta
}

/** 知识岛中的一门课。新增课程只需往 COURSES 追加一项并提供 data。 */
export interface CourseEntry {
  slug: string
  title: string
  subtitle: string
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
