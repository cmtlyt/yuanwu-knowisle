/**
 * 最小可扩充的课程数据骨架。复制到目标项目后：
 * 1. 先按阶段 0 的结论填 META（版本 / 核实日期 / 官方文档）。
 * 2. 用 STAGES / CONCEPTS / LESSONS 登记真实内容；本文件是唯一内容源。
 * 3. 跑 `node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs <本文件路径>` 自检
 *    （若已把脚本复制到目标项目的 scripts/，改成 scripts/check-course.mjs）。
 * 新增课时只追加 L(...) 并在 CONCEPTS 登记，视图与学情引擎无需改动。
 */

export interface Stage {
  id: number
  name: string
  en: string
  summary: string
  color: string
  goal: string
}
export interface Concept {
  id: string
  name: string
  stage: number
  weight: number
  prereqs: string[]
}
export interface QuizQuestion {
  text: string
  options: string[]
  answer: number
  explain: string
  concept: string
}
export type LessonBlock =
  | { type: 'prose'; title?: string; text: string }
  | { type: 'code'; title?: string; code: string; note: string }
  | { type: 'callout'; tone: string; title: string; text: string }
  | { type: 'list'; title?: string; items: string[] }
export interface Lesson {
  id: string
  stage: number
  title: string
  minutes: number
  difficulty: number
  prereqs: string[]
  concepts: string[]
  goals: string[]
  blocks: LessonBlock[]
  widget: string | null
  quiz: QuizQuestion[]
  terms: string[][]
  pitfalls: string[]
}
export interface CourseData {
  META: Record<string, unknown>
  STAGES: Stage[]
  CONCEPTS: Concept[]
  LESSONS: Lesson[]
}

// 构造器：避免手写重复对象字面量
const prose = (title: string, text: string): LessonBlock => ({ type: 'prose', title, text })
const code = (title: string, body: string, note: string): LessonBlock => ({
  type: 'code',
  title,
  code: body,
  note,
})
const call = (tone: string, title: string, text: string): LessonBlock => ({
  type: 'callout',
  tone,
  title,
  text,
})
const list = (title: string, items: string[]): LessonBlock => ({ type: 'list', title, items })
const L = (
  id: string,
  stage: number,
  title: string,
  minutes: number,
  difficulty: number,
  prereqs: string[],
  concepts: string[],
  goals: string[],
  blocks: LessonBlock[],
  widget: string | null,
  quiz: QuizQuestion[],
  terms: string[][],
  pitfalls: string[],
): Lesson => ({
  id,
  stage,
  title,
  minutes,
  difficulty,
  prereqs,
  concepts,
  goals,
  blocks,
  widget,
  quiz,
  terms,
  pitfalls,
})

export const COURSE: CourseData = {
  META: {
    version: '<pkg>@<version>', // 阶段 0 核实后填写，唯一版本源
    verifiedAt: 'YYYY-MM-DD',
    lts: '',
    docs: '',
    release: '',
    playground: '',
    source: '',
    notes: ['正文只使用本版本 API；旧版内容另设对照层'],
  },

  STAGES: [
    {
      id: 1,
      name: '第一阶段',
      en: 'Foundations',
      color: '#6366f1',
      summary: '建立核心心智模型',
      goal: '能说清抽象的三个通道与执行时机',
    },
  ],

  CONCEPTS: [
    { id: 'c-core', name: '核心抽象', stage: 1, weight: 1.0, prereqs: [] },
    { id: 'c-exec', name: '执行模型', stage: 1, weight: 1.2, prereqs: ['c-core'] },
  ],

  LESSONS: [
    L(
      'L01',
      1,
      '示例课时：从值到执行',
      25,
      1,
      [],
      ['c-core', 'c-exec'],
      ['理解「描述」与「执行」的分离', '能写出最小可运行示例'],
      [
        prose('为什么需要它', '<用本版本真实 API 写讲解，禁止混用跨版本名称>'),
        code(
          '最小示例',
          '<官方 Playground 可运行的最小代码片段>',
          '演练是原理模拟，跑真实代码请用 Playground',
        ),
        call('info', '关键区分', '<一句话点破最易混淆的概念>'),
        list('本节要点', ['要点一', '要点二']),
      ],
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
  ],
}
