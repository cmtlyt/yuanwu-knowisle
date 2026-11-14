// 跨课程共享的课时构造器（仅 L / withKind；quiz 在课时文件内联为 QuizQuestion 对象字面量）。
// 放到课程数据层的共享位置（如 `app/data/course-builders.ts`），所有课程 import 复用，
// 不与任何单一课程耦合；签名变更须同步所有 *-course/ 目录。
// 落到目标仓库时，类型改用共享类型模块：`import type { QuizQuestion, Lesson } from '~/types/course'`。
//
// 自 00053 起课时正文改为 markdown-in-TS：第 9 位是 `md` 模板串，原 prose/code/call/list
// 构造器已删除。正文书写单位：### 标题、- 列表、```ts title= note= 围栏、:::warn/deep/tip 容器。
import type { QuizQuestion, Lesson, LessonKind } from './types.ts'

// 课时构造器：避免手写 12 个字段的重复对象字面量
// 不含 minutes：课时用时由正文体量推导，页面调 lessonMinutes(lesson) 现算
// （宿主仓库 app/lib/lesson-time.ts），数据里不存这个数字。
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

// 课型标注：课时自己的元数据（不从阶段继承），闸门据此选体量下限。
// 'overview'（整节职责就是导览 / 收束）必须给 reason，作为闸门白名单的复核凭据。
export const withKind = (lesson: Lesson, kind: LessonKind, reason?: string): Lesson =>
  reason ? { ...lesson, kind, kindReason: reason } : { ...lesson, kind }
