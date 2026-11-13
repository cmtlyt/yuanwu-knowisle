import { COURSES, getCourse, courseBase } from '~/data/courses'
import type { CourseEntry, EffectCourseData, Lesson } from '~/types/course'

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

/** 课程作用域页面使用；未注册的 slug 直接 404，避免 undefined 扩散。 */
export function useRequiredCourse() {
  const ctx = useCourse()
  if (!ctx.course.value || !ctx.data.value) {
    throw createError({ statusCode: 404, statusMessage: '这门课程不存在' })
  }
  return ctx
}
