import type { CourseMeta } from '~/types/course'

/* ---------------- 版本与资源 ---------------- */
export const META: CourseMeta = {
  version: 'rxjs@7.8.2',
  verifiedAt: '2026-11-13',
  lts: '7.x 为长期维护主线；9.0.0-beta.1 已在 next 通道，未用于正文',
  docs: 'https://rxjs.dev/guide/overview',
  release: 'https://github.com/ReactiveX/rxjs/releases/tag/7.8.2',
  playground: 'https://stackblitz.com/edit/rxjs-quickstart',
  source: 'https://github.com/ReactiveX/rxjs',
  notes: [
    '单包 rxjs；约定：创建函数与单值操作符从 rxjs 导入，单一参数操作符从 rxjs/operators 导入。',
    '7.x 中 flatMap 是 mergeMap 的别名；exhaustMap / exhaustMapTo 已回归 7.x。',
    'Subject 家族：Subject（无状态）/ BehaviorSubject（需初始值，发最近）/ ReplaySubject（缓存 N 个）/ AsyncSubject（complete 时发最后）。',
    'Scheduler 注入时间：asyncScheduler（宏任务）/ queueScheduler（微任务）/ animationFrameScheduler（渲染帧）/ asapScheduler。',
    '9.0.0-beta 破坏性变更（仅记于此与 DESIGN，正文不混用）：统一从 rxjs 导入操作符、废弃 rxjs/operators、Subscription 由接口改为类。',
  ],
}
