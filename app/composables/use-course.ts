import type { ComputedRef } from 'vue'
import { COURSES, getCourse, courseBase } from '~/data/courses'
import type { CourseEntry, EffectCourseData, Lesson } from '~/types/course'

/** useRequiredCourse 收窄后的返回类型：course / data 已 404 拦截，必然非 undefined。 */
export type RequiredCourseContext = ReturnType<typeof useCourse> & {
  course: ComputedRef<CourseEntry>
  data: ComputedRef<EffectCourseData>
}

/** 当前路由所属课程；首页返回 undefined。 */
export function useCourse() {
  const route = useRoute()
  const slug = computed(() => String(route.params.slug || ''))
  const course = computed<CourseEntry | undefined>(() => getCourse(slug.value))
  const base = computed(() => courseBase(slug.value))
  const data = computed<EffectCourseData | undefined>(() => course.value?.data)
  const lessons = computed<Lesson[]>(() => data.value?.LESSONS || [])
  const stages = computed(() => data.value?.STAGES || [])
  const concepts = computed(() => data.value?.CONCEPTS || [])

  const lessonById = (id: string) => lessons.value.find((l) => l.id === id)
  const stageById = (id: number) => stages.value.find((s) => s.id === id)
  const conceptName = (id: string) => concepts.value.find((c) => c.id === id)?.name || id
  const lessonPath = (id: string) => `${base.value}/lessons/${id}`

  return {
    route,
    slug,
    course,
    base,
    data,
    lessons,
    stages,
    concepts,
    lessonById,
    stageById,
    conceptName,
    lessonPath,
    courses: COURSES,
  }
}

/** 课程作用域页面使用；未注册的 slug 直接 404，避免 undefined 扩散。
 *  返回类型收窄：course / data 经 404 拦截后必然非 undefined。 */
export function useRequiredCourse(): RequiredCourseContext {
  const ctx = useCourse()
  if (!isCourseReady(ctx)) {
    throw createError({ statusCode: 404, statusMessage: '这门课程不存在' })
  }
  // 守卫已通过：ctx.course / ctx.data 收窄为非 undefined，直接返回，无需类型断言。
  return ctx
}

/** 判断课程上下文已就绪（course 与 data 均非 undefined），供 404 拦截与类型收窄使用。 */
function isCourseReady(ctx: ReturnType<typeof useCourse>): ctx is RequiredCourseContext {
  return !!ctx.course.value && !!ctx.data.value
}
