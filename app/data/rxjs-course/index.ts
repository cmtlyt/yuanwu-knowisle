import type { CourseData } from '~/types/course'

import { STAGES } from './stages.ts'
import { CONCEPTS } from './concepts.ts'
import { LESSONS } from './lessons/index.ts'
import { META } from './meta.ts'
import { DESIGN } from './design.ts'

export const RXJS_COURSE: CourseData = { STAGES, CONCEPTS, LESSONS, META, DESIGN }
