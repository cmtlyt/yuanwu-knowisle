// 课时聚合：每个课时一个 lNN.ts，此处按学习顺序收集成 LESSONS。
// 新增课时：新建 lessons/lNN.ts 导出 LN，并在下方 import + 追加到数组。
// 落到目标仓库时，类型改 `import type { Lesson } from '~/types/course'`。
import type { Lesson } from '../types.ts'
import { L01 } from './l01.ts'

export const LESSONS: Lesson[] = [L01]
