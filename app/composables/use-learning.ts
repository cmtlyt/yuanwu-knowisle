import { createAnalytics } from '~/lib/analytics'
import { availableCourses } from '~/data/courses'
import type { CourseEntry, LearningState } from '~/types/course'

/**
 * 全站学情单例。
 * - 每门课程一个独立 Analytics 实例（闭包捕获 COURSE / localStorage key），互不串数据。
 * - useState 保证 SSR 与客户端首屏一致；真实档案在 mounted 后从 localStorage 载入。
 * - engine 内部函数会自行 save，mutate 额外触发一次响应式更新。
 */
type Engine = ReturnType<typeof createAnalytics>
const engines = new Map<string, Engine>()
let hydrationRegistered = false

function engineFor(course: CourseEntry): Engine {
  let e = engines.get(course.slug)
  if (!e) {
    e = createAnalytics(course.data!, course.storageKey)
    engines.set(course.slug, e)
  }
  return e
}

/** 对外暴露的引擎访问器（无父作用域捕获，提到模块级）。 */
function engineOf(course: CourseEntry): Engine {
  return engineFor(course)
}

/** analytics.ts 是 @ts-nocheck 的迁移内核，学情类型在 composable 边界收口。 */
function defaultStateOf(course: CourseEntry): LearningState {
  // 00032：内核 defaultState() 把 theme 推断为 string，与 LearningProfile 的
  // 'light' | 'dark' 不兼容。按 pitfall-resolver/toolchain.md 的既有结论，这里必须保留
  // 边界断言：改成局部变量类型注解会触发 TS2322，改迁移内核被明令禁止。
  return engineFor(course).defaultState() as LearningState
}

export function useLearning() {
  const store = useState<Record<string, LearningState>>('knowisle:learning', () => ({}))

  // 在 setup 阶段补齐默认态，保证 computed 读取 stateOf 时无副作用
  for (const course of availableCourses()) {
    if (!store.value[course.slug]) store.value[course.slug] = defaultStateOf(course)
  }

  if (import.meta.client && !hydrationRegistered) {
    hydrationRegistered = true
    onMounted(() => {
      for (const course of availableCourses()) {
        // 同 defaultStateOf：内核返回值在边界收口，保留断言以免触发 TS2322。
        store.value[course.slug] = engineFor(course).load() as LearningState
      }
      store.value = { ...store.value }
    })
  }

  const stateOf = (course: CourseEntry): LearningState => {
    if (!store.value[course.slug]) store.value[course.slug] = defaultStateOf(course)
    return store.value[course.slug]!
  }
  const mutate = (course: CourseEntry, fn: (s: LearningState) => void) => {
    const s = stateOf(course)
    fn(s)
    engineFor(course).save(s)
    store.value = { ...store.value }
  }

  const replace = (course: CourseEntry, next: LearningState) => {
    engineFor(course).save(next)
    store.value = { ...store.value, [course.slug]: { ...next } }
  }

  return { store, stateOf, engineOf, mutate, replace }
}
