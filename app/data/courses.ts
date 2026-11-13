import { EFFECT_COURSE } from './effect-course'
import { RXJS_COURSE } from './rxjs-course'
import type { CourseEntry } from '~/types/course'

/**
 * 知识岛课程注册表。
 * 新增一门课：追加一项、提供 CourseData 与独立 storageKey，页面/侧栏/学情自动接入。
 */
export const COURSES: CourseEntry[] = [
  {
    slug: 'effect-ts',
    title: 'Effect 深度课',
    subtitle: 'effect@4.1.4 · TypeScript',
    tagline: '从「程序即值」到「运行时指令解释」',
    description:
      '从「程序即值」讲到 fiber runtime 的指令解释器：三通道类型、Cause、Layer、Scope、结构化并发与 Stream 背压。6 阶段 24 课，每课配原理演练与即时反馈测验。',
    icon: '🌀',
    color: '#4b6fe0',
    tags: ['TypeScript', '函数式', '运行时原理', '架构设计'],
    status: 'available',
    storageKey: 'knowisle:effect-ts:v1',
    data: EFFECT_COURSE,
  },
  {
    slug: 'rxjs',
    title: 'RxJS 深度课',
    subtitle: 'rxjs@7.8.2 · 响应式',
    tagline: '从「一段时间里的数据序列」到「把时间注入系统」',
    description:
      '从「一段时间里的数据序列」讲到调度器把时间注入系统：冷/热、观察者协议、map 流水线、concatMap/mergeMap/switchMap/exhaustMap 时序、catchError/retry、Subject 多播、share 引用计数、背压与虚拟时间测试。6 阶段 24 课，每课配可操作原理演练与即时反馈测验。',
    icon: '📡',
    color: '#3fb984',
    tags: ['JavaScript', '响应式', '时间模型', '异步组合'],
    status: 'available',
    storageKey: 'knowisle:rxjs:v1',
    data: RXJS_COURSE,
  },
  {
    slug: 'more',
    title: '更多课程在路上',
    subtitle: 'Coming soon',
    description: '知识岛按课程组织，新增课程只需在 data/courses.ts 注册即可接入统一的学习路径与学情模型。',
    icon: '🧭',
    color: '#94a1b5',
    tags: ['规划中'],
    status: 'soon',
    storageKey: 'knowisle:more:v1',
  },
]

export function getCourse(slug: string): CourseEntry | undefined {
  return COURSES.find((c) => c.slug === slug && c.status === 'available')
}

export function availableCourses(): CourseEntry[] {
  return COURSES.filter((c) => c.status === 'available' && !!c.data)
}

export function courseBase(slug: string): string {
  return `/courses/${slug}`
}
