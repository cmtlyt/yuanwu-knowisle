// 跨课程共享的课时构造器（仅 L；quiz 在课时文件内联为 QuizQuestion 对象字面量）。
// 自 00053 起，课时正文改为 markdown-in-TS：课时文件直接给 `md` 字符串，不再用 blocks 构造器。
import type { QuizQuestion, Lesson } from '~/types/course'

export const L = (
  id: string,
  stage: number,
  title: string,
  minutes: number,
  difficulty: number,
  prereqs: string[],
  concepts: string[],
  goals: string[],
  md: string,
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
  md,
  widget,
  quiz,
  terms,
  pitfalls,
})
