// 版本与资源信息（唯一版本源；正文不得散落硬编码版本号）。
// 落到目标仓库时，类型改 `import type { CourseMeta } from '~/types/course'`。
import type { CourseMeta } from './types.ts'

export const META: CourseMeta = {
  version: '<pkg>@<version>', // 阶段 0 核实后填写
  verifiedAt: 'YYYY-MM-DD',
  lts: '',
  docs: '',
  release: '',
  playground: '',
  source: '',
  notes: ['正文只使用本版本 API；旧版内容另设对照层'],
}
