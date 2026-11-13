// 教学设计说明书（绑定到课程的数据，由「教学设计」视图渲染，不写独立 Markdown）。
// 落到目标仓库时，类型改 `import type { CourseDesign } from '~/types/course'`。
import type { CourseDesign } from './types.ts'

export const DESIGN: CourseDesign = {
  title: '<课程名> · 教学设计说明书',
  summary: '<一两句概括设计取向与学习路径>',
  sections: [
    {
      id: 'baseline',
      title: '0. 版本基线（先钉死，再设计）',
      blocks: [
        {
          type: 'kv',
          rows: [
            { k: '课程主线', v: '<pkg>@<version>' },
            { k: '官方文档', v: '<docs url>' },
          ],
        },
      ],
    },
    {
      id: 'path',
      title: '1. 平缓学习路径',
      blocks: [{ type: 'lessons' }],
    },
  ],
}
