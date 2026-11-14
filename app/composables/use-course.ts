import type { ComputedRef } from 'vue'
import { COURSES, getCourse, courseBase } from '~/data/courses'
import type { CourseEntry, EffectCourseData, Lesson, Module, RenderMode } from '~/types/course'

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
  /** 渲染模式：缺省 'simple'（既有课零改动）；'complex' 课程提供 MODULES + Stage.module。 */
  const renderMode = computed<RenderMode>(() => data.value?.renderMode ?? 'simple')
  /** 复杂模式的模块列表；simple 模式为空数组。 */
  const modules = computed<Module[]>(() => data.value?.MODULES ?? [])

  const lessonById = (id: string) => lessons.value.find((l) => l.id === id)
  const stageById = (id: number) => stages.value.find((s) => s.id === id)
  const conceptName = (id: string) => concepts.value.find((c) => c.id === id)?.name || id
  const lessonPath = (id: string) => `${base.value}/lessons/${id}`
  const moduleById = (id: number | undefined) =>
    id == null ? undefined : modules.value.find((m) => m.id === id)
  const moduleName = (id: number | undefined) => moduleById(id)?.name ?? ''
  /** 某模块下的阶段（按 STAGES 原始顺序）。 */
  const stagesOfModule = (moduleId: number) => stages.value.filter((s) => s.module === moduleId)
  /** 阶段内的子阶段（无则空数组）。 */
  const subStagesOf = (stageId: number) => stageById(stageId)?.subStages ?? []
  /** 子阶段显示名（如 '3.1 基线范式'），找不到时回退原始 id。 */
  const subStageName = (stageId: number, subStageId: string | null | undefined) => {
    if (!subStageId) return ''
    return subStagesOf(stageId).find((s) => s.id === subStageId)?.name ?? subStageId
  }

  return {
    route,
    slug,
    course,
    base,
    data,
    lessons,
    stages,
    concepts,
    modules,
    renderMode,
    lessonById,
    stageById,
    conceptName,
    lessonPath,
    moduleById,
    moduleName,
    stagesOfModule,
    subStagesOf,
    subStageName,
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
