import type { CourseMeta } from '~/types/course'

/* ---------------- 版本与资源 ---------------- */
export const META: CourseMeta = {
  version: 'effect@4.1.4',
  verifiedAt: '2026-11-13',
  lts: '4.x bug 修复至 2029-09（或 5.0 后 1 年），安全修复至 2029-09（或 5.0 后 2 年）',
  docs: 'https://effect.website/docs/v4/',
  release: 'https://effect.website/blog/releases/effect/40',
  playground: 'https://effect.website/play',
  source: 'https://github.com/Effect-TS/effect',
  notes: [
    '单包零运行时依赖；effect/* 子路径提供 http / schema / sql / rpc / ai / workflow 等模块。',
    'Cause 为扁平 reasons 数组（Fail / Die / Interrupt）。',
    'Scheduler 默认 MixedScheduler，MaxOpsBeforeYield 默认 2048。',
    '服务用 Context.Service 定义，Fiber 用 forkChild / forkDetach / forkScoped / forkIn。',
    '全生态版本锁步；模块带 @stability stable / unstable / experimental 标记。',
  ],
}
