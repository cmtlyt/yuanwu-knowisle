import type { Stage } from '~/types/course'

/* ---------------- 阶段 ---------------- */
export const STAGES: Stage[] = [
  {
    id: 0,
    name: '心智模型与准备',
    en: 'Mental Model',
    summary: '先换脑子：把「一段时间里的数据序列」当作一个值来传递、组合、取消。',
    color: '#6366f1',
    goal: '能解释为什么 RxJS 不是 Promise 的替代品，而是另一种时间维度的抽象',
  },
  {
    id: 1,
    name: '可观察与发射',
    en: 'Observables & Emission',
    summary: '自定义源、观察者协议、纯变换、过滤与归约。',
    color: '#3fb984',
    goal: '能独立写出并订阅一段完整的变换管道',
  },
  {
    id: 2,
    name: '扁平化',
    en: 'Flattening',
    summary: '嵌套流的展开：concatMap / mergeMap / switchMap / exhaustMap。课程核心。',
    color: '#e8a33d',
    goal: '能按交互模式正确选择扁平化操作符，讲清四者的时序差异',
  },
  {
    id: 3,
    name: '错误与生命周期',
    en: 'Errors & Lifecycle',
    summary: 'next / error / complete 的不可逆语义、重试、错误传播与防御式订阅。',
    color: '#e46a70',
    goal: '能为一条流设计完整的错误恢复路径，并做到零静默失败',
  },
  {
    id: 4,
    name: '多播与热流',
    en: 'Multicast & Hot',
    summary: 'Subject 家族、状态型 Subject、publish / share 与引用计数。',
    color: '#a878e6',
    goal: '能把一条冷流变成多订阅者共享的热连接，避免重复请求',
  },
  {
    id: 5,
    name: '调度、时间与落地',
    en: 'Scheduling & Production',
    summary: '把时间注入系统、时间算子、组合多源、背压与测试框架落地。',
    color: '#38a9c4',
    goal: '能把 RxJS 渐进引入真实项目（含 Angular），并能用虚拟时间测试',
  },
]
