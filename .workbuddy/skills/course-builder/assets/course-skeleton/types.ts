/**
 * 课程数据骨架 · 类型契约（自包含版）。
 * 落到目标仓库时，把本文件的类型并入该仓库的共享类型模块（如 `~/types/course`），
 * 其余各文件改用 `import type { ... } from '~/types/course'`（type-only，运行时擦除）。
 */

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

/** 通用课程体：STAGES / CONCEPTS / LESSONS / META + 可选 DESIGN 说明书。 */
export interface CourseData {
  STAGES: Stage[]
  CONCEPTS: Concept[]
  LESSONS: Lesson[]
  META: CourseMeta
  DESIGN?: CourseDesign
}
