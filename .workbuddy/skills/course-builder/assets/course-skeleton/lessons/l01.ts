// 一个课时一个文件。落到目标仓库时：构造器改 `import { L, withKind } from '<shared>/course-builders.ts'`
// （quiz 直接内联为对象字面量），占位内容替换为真实课程数据。
// 课型用 `withKind(L(...), 'theory'|'practice'|...)` 就地标注——它是课时自己的元数据，不从阶段继承。
// 正文是 `md` 模板串（00053 起）：### 标题、- 列表、```ts title= note= 围栏、:::warn/deep/tip 容器。
import { L, withKind } from '../builders.ts'

export const L01 = withKind(
  L(
    'L01',
    1,
    '示例课时：从值到执行',
    1,
    [],
    ['c-core', 'c-exec'],
    ['理解「描述」与「执行」的分离', '能写出最小可运行示例'],
    `
### 为什么需要它

<用本版本真实 API 写讲解，禁止混用跨版本名称>

\`\`\`ts title="最小示例" note="演练是原理模拟，跑真实代码请用 Playground"
// <官方 Playground 可运行的最小代码片段>
\`\`\`

### 本节要点

- 要点一
- 要点二

:::warn

### 常见误区

<一句话点破最易混淆的概念>

:::
`,
    null,
    [
      {
        text: '<题干>',
        options: ['<选项 A>', '<选项 B>', '<选项 C>', '<选项 D>'],
        answer: 1,
        explain: '<解析说明为何选 B>',
        concept: 'c-core',
      },
      {
        text: '<题干>',
        options: ['<选项 A>', '<选项 B>'],
        answer: 0,
        explain: '<解析>',
        concept: 'c-exec',
      },
    ],
    [
      ['核心抽象', '<释义>'],
      ['执行模型', '<释义>'],
    ],
    ['<常见误区：把描述当成已执行>'],
  ),
  'practice',
)
