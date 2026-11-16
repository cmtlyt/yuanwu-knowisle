import type { Lesson } from '~/types/course'
import { L01 } from './l01.ts'
import { L02 } from './l02.ts'
import { L03 } from './l03.ts'
import { L04 } from './l04.ts'
import { L05 } from './l05.ts'
import { L06 } from './l06.ts'
import { L07 } from './l07.ts'
import { L08 } from './l08.ts'
import { L09 } from './l09.ts'
import { L10 } from './l10.ts'
import { L11 } from './l11.ts'
import { L12 } from './l12.ts'
import { L13 } from './l13.ts'
import { L14 } from './l14.ts'

/**
 * 本文件只做**聚合**：课型（`kind`）是每节课自己的元数据，写在各 `lNN.ts` 里
 * （用 `withKind()` 标注），这里不再对课型做任何覆盖或继承。
 *
 * 全课连续编号 L01…L111，按模块顺序追加：
 *   M1 架构原理深挖 = L01–L14（本批已落地）
 *   M2 注意力演进   = L15–L26
 *   M3 MoE         = L27–L36
 *   M4 SSM/混合    = L37–L46
 *   M5 扩散 LLM    = L47–L53
 *   M6 横评选型    = L54–L61
 *   M7 DeepSeek    = L62–L72
 *   M8 预训练      = L73–L83
 *   M9 微调        = L84–L94
 *   M10 对齐       = L95–L102
 *   M11 打包部署   = L103–L111
 */
export const LESSONS: Lesson[] = [L01, L02, L03, L04, L05, L06, L07, L08, L09, L10, L11, L12, L13, L14]
