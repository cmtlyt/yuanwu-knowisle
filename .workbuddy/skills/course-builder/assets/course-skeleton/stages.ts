// 阶段清单。落到目标仓库时，类型改 `import type { Stage } from '~/types/course'`。
import type { Stage } from './types.ts'

export const STAGES: Stage[] = [
  {
    id: 1,
    name: '第一阶段',
    en: 'Foundations',
    color: '#6366f1',
    summary: '建立核心心智模型',
    goal: '能说清核心抽象与执行时机',
  },
]
