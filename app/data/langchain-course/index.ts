import type { CourseData } from '~/types/course'

import { STAGES } from './stages.ts'
import { CONCEPTS } from './concepts.ts'
import { LESSONS } from './lessons/index.ts'
import { META } from './meta.ts'
import { DESIGN } from './design.ts'
import { MODULES } from './modules.ts'

export const LANGCHAIN_COURSE: CourseData = {
  STAGES,
  CONCEPTS,
  LESSONS,
  META,
  DESIGN,
  renderMode: 'complex',
  MODULES,
}
