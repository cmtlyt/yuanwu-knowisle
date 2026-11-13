import type { Concept } from '~/types/course'

/* ---------------- 知识点图谱 ---------------- */
export const CONCEPTS: Concept[] = [
  { id: 'c-callbacks', name: '异步组合的缺口', stage: 0, weight: 1.5, prereqs: [] },
  { id: 'c-cold-hot', name: '冷流与热流', stage: 0, weight: 3, prereqs: ['c-callbacks'] },
  { id: 'c-triplet', name: '发射三态 next/error/complete', stage: 0, weight: 3, prereqs: ['c-cold-hot'] },
  { id: 'c-teardown', name: '订阅与资源回收', stage: 0, weight: 2, prereqs: ['c-triplet'] },

  { id: 'c-sources', name: '源操作符全景', stage: 1, weight: 2, prereqs: ['c-teardown'] },
  { id: 'c-new-observable', name: '观察者协议与自定义源', stage: 1, weight: 3, prereqs: ['c-sources'] },
  { id: 'c-transform', name: 'map 与纯变换（monad）', stage: 1, weight: 3, prereqs: ['c-new-observable'] },
  { id: 'c-filter', name: '过滤与取舍', stage: 1, weight: 2, prereqs: ['c-transform'] },
  { id: 'c-reduce', name: '归约与收集', stage: 1, weight: 2, prereqs: ['c-filter'] },

  { id: 'c-flatten', name: '扁平化心智模型', stage: 2, weight: 4, prereqs: ['c-transform'] },
  { id: 'c-concat', name: 'concatMap 顺序合并', stage: 2, weight: 3, prereqs: ['c-flatten'] },
  { id: 'c-merge', name: 'mergeMap 并发合并', stage: 2, weight: 4, prereqs: ['c-flatten'] },
  { id: 'c-switch', name: 'switchMap 取最新', stage: 2, weight: 3, prereqs: ['c-merge'] },
  { id: 'c-exhaust', name: 'exhaustMap 排空', stage: 2, weight: 2, prereqs: ['c-switch'] },
  { id: 'c-concurrency-limit', name: '有界并发与竞争 race', stage: 2, weight: 3, prereqs: ['c-merge'] },

  { id: 'c-terminal', name: '终结语义不可逆', stage: 3, weight: 3, prereqs: ['c-triplet'] },
  { id: 'c-retry', name: 'catchError 与 retry', stage: 3, weight: 3, prereqs: ['c-terminal'] },
  { id: 'c-error-prop', name: '错误传播与多订阅者', stage: 3, weight: 2, prereqs: ['c-retry'] },
  { id: 'c-safe', name: '安全订阅与空流', stage: 3, weight: 2, prereqs: ['c-retry'] },

  { id: 'c-subject', name: 'Subject 多播', stage: 4, weight: 3, prereqs: ['c-cold-hot'] },
  { id: 'c-state-subj', name: '状态型 Subject', stage: 4, weight: 3, prereqs: ['c-subject'] },
  { id: 'c-share', name: 'publish / share 与引用计数', stage: 4, weight: 3, prereqs: ['c-subject'] },
  { id: 'c-share-pitfall', name: 'share 的陷阱', stage: 4, weight: 2, prereqs: ['c-share'] },

  { id: 'c-scheduler', name: '调度器与时间注入', stage: 5, weight: 3, prereqs: ['c-sources'] },
  { id: 'c-time-ops', name: '时间算子', stage: 5, weight: 3, prereqs: ['c-scheduler'] },
  { id: 'c-combine', name: '组合多源', stage: 5, weight: 3, prereqs: ['c-transform'] },
  { id: 'c-backpressure', name: '背压与缓冲', stage: 5, weight: 2, prereqs: ['c-merge'] },
  { id: 'c-testing', name: 'marble 测试与 TestScheduler', stage: 5, weight: 3, prereqs: ['c-scheduler'] },
]
