import type { Stage } from '~/types/course'

/* ---------------- 阶段 ---------------- */
export const STAGES: Stage[] = [
  {
    id: 0,
    name: '心智模型与准备',
    en: 'Mental Model',
    summary: '先换脑子，再写代码。理解「程序即值」与三通道类型。',
    color: '#5b8def',
    goal: '能解释为什么 Effect 不是 Promise 包装器',
  },
  {
    id: 1,
    name: '核心值与组合',
    en: 'Core & Composition',
    summary: '构造子、组合子、类型累积、运行边界。',
    color: '#3fb984',
    goal: '能独立写出并运行一段完整的 Effect 流水线',
  },
  {
    id: 2,
    name: '错误与诊断',
    en: 'Errors & Cause',
    summary: '预期错误 / 缺陷 / 中断，Cause 与恢复策略。',
    color: '#e8a33d',
    goal: '能为领域错误设计类型化恢复路径',
  },
  {
    id: 3,
    name: '依赖与资源',
    en: 'Services & Resources',
    summary: 'Context.Service、Layer 依赖图、Scope 与 finalizer。',
    color: '#a878e6',
    goal: '能把一个应用拆成可替换的服务层',
  },
  {
    id: 4,
    name: '并发与运行时底层',
    en: 'Runtime Internals',
    summary: 'Fiber、runLoop 指令解释、Scheduler、结构化中断。课程核心。',
    color: '#e46a70',
    goal: '能讲清一个 Effect 从蓝图到 Exit 的完整执行链',
  },
  {
    id: 5,
    name: '流、调度与工程化',
    en: 'Streams & Production',
    summary: 'Stream 背压、Schedule 重试、并发原语、生态与落地。',
    color: '#38a9c4',
    goal: '能把 Effect 渐进引入真实项目',
  },
]
