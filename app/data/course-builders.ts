// 跨课程共享的课时构造器（仅 L / withKind；quiz 在课时文件内联为 QuizQuestion 对象字面量）。
// 自 00053 起，课时正文改为 markdown-in-TS：课时文件直接给 `md` 字符串，不再用 blocks 构造器。
// 自 00052 起，`minutes` 不再是课时字段：用时由正文体量推导，页面按需调用
// `lessonMinutes(lesson)`（app/lib/lesson-time.ts），构造器与数据都不存这个数字。
import type { QuizQuestion, Lesson, LessonKind } from '~/types/course'

export const L = (
  id: string,
  stage: number,
  title: string,
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

/**
 * 给课时标注课型（`scripts/content-gate.mjs` 据此选体量下限、判断是否允许 0 题）。
 * 课型是**课时自己的元数据**，写在本课文件里，与所属阶段无关——同一阶段允许不同课型。
 * `N`（整节职责就是导览 / 收束）必须给 `reason`，作为闸门白名单的复核凭据。
 */
export const withKind = (lesson: Lesson, kind: LessonKind, reason?: string): Lesson =>
  reason ? { ...lesson, kind, kindReason: reason } : { ...lesson, kind }
