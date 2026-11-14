/**
 * 本地导航层（零 LLM）：基于学情引擎产出「下一步导航卡」与「薄弱概念卡」。
 *
 * 数据来源（全部复用既有纯计算层，不新增课程数据字段）：
 * - engine.recommend(state)  → next 课时 + 一句话 advice + prereqBlocked + reviewCount
 * - engine.reviewQueue(state)→ 遗忘区概念（含 lessonId / reason / mastery / retention）
 *
 * 引擎层不碰 DOM / 路由：课时跳转路径由调用方传入的 base（如 `/courses/effect-ts`）拼出。
 */
import type { CourseEntry, LearningState } from '~/types/course'
import type { NavItem, TutorNavCards, WeakItem } from '~/types/tutor'

/**
 * 学情引擎（analytics.ts）中本层用到的纯计算方法之最小契约。
 * analytics.ts 是 @ts-nocheck 的迁移内核，字段真实类型较宽：
 * - recommend 的 prereqBlocked 由 `next && ...` 得出，next 为 null 时值为 null；
 * - reviewQueue 的 lessonId 由 `(lessonForConcept(cid) || {}).id` 得出，可能取不到。
 * 在边界按真实形状收口，避免改动迁移内核。
 */
export interface NavEngine {
  recommend(state: LearningState): {
    next: { lesson: { id: string; title: string } } | null
    prereqBlocked: boolean | null
    reviewCount: number
    advice: string
  }
  reviewQueue(state: LearningState): Array<{
    cid: string
    name: string
    lessonId: string | null | undefined
    mastery: number
    retention: number
    reason: string
  }>
}

/**
 * 组装本地导航卡。
 * @param course 当前课程（取 slug 作上下文，不强依赖）
 * @param state  学情档案
 * @param engine 学情引擎（analytics.ts 返回对象）
 * @param base   课程基础路径（`${courseBase(slug)}`），必传；缺省会拼出 `/lessons/<id>` 这种错路径
 */
export function buildNavCards(
  course: CourseEntry,
  state: LearningState,
  engine: NavEngine,
  base: string,
): TutorNavCards {
  void course
  const lessonLink = (id: string): string => `${base}/lessons/${id}`
  const weakLink = (id: string | null | undefined): string | null => (id ? `${base}/lessons/${id}` : null)

  const rec = engine.recommend(state)
  const next: NavItem | undefined = rec.next
    ? {
        label: `下一步：${rec.next.lesson.title}`,
        detail: rec.prereqBlocked ? '有前置课时未完成，建议先补齐' : rec.advice,
        path: lessonLink(rec.next.lesson.id),
      }
    : undefined

  const weaks: WeakItem[] = engine
    .reviewQueue(state)
    .slice(0, 5)
    .map((w) => ({
      name: w.name,
      mastery: w.mastery,
      reason: w.reason,
      path: weakLink(w.lessonId),
    }))

  return {
    next,
    weaks,
    advice: rec.advice,
  }
}
