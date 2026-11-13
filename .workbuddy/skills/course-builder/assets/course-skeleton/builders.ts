// 跨课程共享的课时内容构造器（prose/code/call/list/q/L）。
// 放到课程数据层的共享位置（如 `app/data/course-builders.ts`），所有课程 import 复用，
// 不与任何单一课程耦合；签名变更须同步所有 *-course/ 目录。
// 落到目标仓库时，类型改用共享类型模块：`import type { LessonBlock, QuizQuestion, Lesson } from '~/types/course'`。
import type { LessonBlock, QuizQuestion, Lesson } from './types.ts'

export const prose = (title: string, text: string): LessonBlock => ({ type: 'prose', title, text })
export const code = (title: string, body: string, note?: string): LessonBlock => ({
  type: 'code',
  title,
  code: body,
  note: note || '',
})
export const call = (tone: string, title: string, text: string): LessonBlock => ({
  type: 'callout',
  tone,
  title,
  text,
})
export const list = (title: string, items: string[]): LessonBlock => ({ type: 'list', title, items })
export const q = (
  text: string,
  options: string[],
  answer: number,
  explain: string,
  concept: string,
): QuizQuestion => ({ text, options, answer, explain, concept })

// 课时构造器：避免手写 12 个字段的重复对象字面量
export const L = (
  id: string,
  stage: number,
  title: string,
  minutes: number,
  difficulty: number,
  prereqs: string[],
  concepts: string[],
  goals: string[],
  blocks: LessonBlock[],
  widget: string | null,
  quiz: QuizQuestion[],
  terms: string[][],
  pitfalls: string[],
): Lesson => ({
  id,
  stage,
  title,
  minutes,
  difficulty,
  prereqs,
  concepts,
  goals,
  blocks,
  widget,
  quiz,
  terms,
  pitfalls,
})
