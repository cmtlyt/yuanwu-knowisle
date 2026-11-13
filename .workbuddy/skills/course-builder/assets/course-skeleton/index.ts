// 课程数据入口：聚合并导出这门课。这是对外唯一命名导出面。
//
// 导入规范（关键，保证 Nuxt 与 Node 两侧都能加载）：
//   - 目录内兄弟值导入一律带显式 .ts 扩展名（如 './stages.ts'）：
//       · Nuxt/Vite 侧 tsconfig 的 allowImportingTsExtensions 放行；
//       · Node 校验脚本（--experimental-strip-types）侧也能直连解析。
//   - 类型导入走共享类型模块的 type-only 导入（运行时擦除，Node 不解析）：
//       · 本骨架自包含用 './types.ts'；落到目标仓库改 '~/types/course'。
//   - 外部消费方（如 courses.ts 注册表）用省略扩展名的相对导入指向本目录：
//       `import { TOPIC_COURSE } from './<topic>-course'` —— Nuxt 自动解析到 index.ts，
//       该导入语句一个字都不用改；Node 侧校验脚本则按 `.../index.ts` 显式路径 import。
//
// 落到目标仓库时，把 TOPIC_COURSE 改名（如 EFFECT_COURSE / RXJS_COURSE），
// CourseData 可换成该课程的具体类型别名。
import type { CourseData } from './types.ts'

import { STAGES } from './stages.ts'
import { CONCEPTS } from './concepts.ts'
import { LESSONS } from './lessons/index.ts'
import { META } from './meta.ts'
import { DESIGN } from './design.ts'

export const TOPIC_COURSE: CourseData = { STAGES, CONCEPTS, LESSONS, META, DESIGN }
