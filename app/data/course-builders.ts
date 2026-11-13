// 跨课程共享的课时内容构造器（prose/code/call/list/q/L）。
// 新增课程直接 import 复用；签名变更须同步所有 *-course/ 目录。
import type { LessonBlock, QuizQuestion, Lesson } from '~/types/course'

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
