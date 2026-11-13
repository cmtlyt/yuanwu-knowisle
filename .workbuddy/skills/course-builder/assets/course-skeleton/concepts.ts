// 知识点图谱。落到目标仓库时，类型改 `import type { Concept } from '~/types/course'`。
// 数量动态化：概念数由「实际可独立归因的知识点」决定，不为凑整数拆碎或合并。
import type { Concept } from './types.ts'

export const CONCEPTS: Concept[] = [
  { id: 'c-core', name: '核心抽象', stage: 1, weight: 1.0, prereqs: [] },
  { id: 'c-exec', name: '执行模型', stage: 1, weight: 1.2, prereqs: ['c-core'] },
]
