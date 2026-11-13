/**
 * 课程内容 + 学情引擎自检：pnpm verify
 * 依赖 Node 22 的 --experimental-strip-types，直接加载 app/ 下的 TS 模块。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { EFFECT_COURSE: C } = await import('../app/data/effect-course.ts')
const { createAnalytics } = await import('../app/lib/analytics.ts')
const { Widgets } = await import('../app/lib/widgets.ts')

let failed = 0
const ok = (cond, label, extra = '') => {
  if (cond) console.log('  ✓ ' + label + (extra ? ' — ' + extra : ''))
  else {
    console.log('  ✗ ' + label + (extra ? ' — ' + extra : ''))
    failed++
  }
}

console.log('=== 课程结构 ===')
console.log('  版本基线：' + C.META.version + '（核实 ' + C.META.verifiedAt + '）')
ok(C.STAGES.length === 6, '阶段数 6', String(C.STAGES.length))
ok(C.LESSONS.length === 24, '课时数 24', String(C.LESSONS.length))
ok(C.CONCEPTS.length === 26, '知识点数 26', String(C.CONCEPTS.length))
const quizTotal = C.LESSONS.reduce((n, l) => n + l.quiz.length, 0)
ok(quizTotal === 48, '题目总数 48', String(quizTotal))

const conceptIds = new Set(C.CONCEPTS.map((c) => c.id))
const lessonIds = new Set(C.LESSONS.map((l) => l.id))
const stageIds = new Set(C.STAGES.map((s) => s.id))
const widgetIds = new Set(C.LESSONS.map((l) => l.widget).filter(Boolean))

ok(
  C.LESSONS.every((l) => stageIds.has(l.stage)),
  '课时阶段引用有效',
)
ok(
  C.LESSONS.every((l) => l.concepts.every((c) => conceptIds.has(c))),
  '课时概念引用有效',
)
ok(
  C.CONCEPTS.every((c) => c.prereqs.every((p) => conceptIds.has(p))),
  '概念前置引用有效',
)
ok(
  C.LESSONS.every((l) => l.quiz.every((q) => conceptIds.has(q.concept))),
  '题目概念引用有效',
)
ok(
  C.LESSONS.every((l) =>
    l.quiz.every((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length),
  ),
  '选项与答案索引有效',
)
ok(
  C.LESSONS.every(
    (l) => l.blocks.length > 0 && l.goals.length > 0 && l.pitfalls.length > 0 && l.terms.length > 0,
  ),
  '课时内容块完整',
)
const order = new Map(C.LESSONS.map((l, i) => [l.id, i]))
ok(
  C.LESSONS.every((l) => l.prereqs.every((p) => lessonIds.has(p) && order.get(p) < order.get(l.id))),
  '课时前置顺序有效',
)
ok(
  [...widgetIds].every((w) => Widgets.has(w)),
  '演练组件映射有效',
  [...widgetIds].join(', '),
)
ok(C.META.version === 'effect@4.1.4', '版本基线锁定')

console.log('\n=== 教学设计（DESIGN）===')
const design = C.DESIGN
ok(!!design, 'DESIGN 已绑定到课程')
if (design) {
  ok(!!design.title && !!design.summary, 'DESIGN 标题与摘要完整')
  const secIds = new Set(design.sections.map((s) => s.id))
  ok(secIds.size === design.sections.length, `章节 id 唯一（${design.sections.length} 节）`)
  const known = new Set(['prose', 'list', 'callout', 'kv', 'table', 'code', 'lessons'])
  let blockOk = true
  for (const s of design.sections) {
    if (!s.id || !s.title || !Array.isArray(s.blocks)) blockOk = false
    for (const b of s.blocks) {
      if (!known.has(b.type)) blockOk = false
      if (b.type === 'kv' && !Array.isArray(b.rows)) blockOk = false
      if (b.type === 'table' && (!Array.isArray(b.columns) || !Array.isArray(b.rows))) blockOk = false
      if (b.type === 'callout' && (!b.tone || !b.title || !b.text)) blockOk = false
      if (b.type === 'list' && !Array.isArray(b.items)) blockOk = false
    }
  }
  ok(blockOk, 'DESIGN 区块结构有效')
}

console.log('\n=== 静态资源 ===')
;['app/assets/css/main.css', 'app/lib/widgets.ts', 'app/lib/analytics.ts'].forEach((f) => {
  ok(fs.existsSync(path.join(ROOT, f)), f)
})

console.log('\n=== 学情引擎：空状态 ===')
const engine = createAnalytics(C, 'knowisle:verify:v1')
let s = engine.defaultState()
ok(engine.overall(s).progress === 0, '空状态进度 0%')
ok(engine.recommend(s).next.lesson.id === 'L01', '空状态推荐 L01')
ok(engine.teacherReport(s).length === 24, '教师报表 24 行')

console.log('\n=== 学情引擎：完整学习轨迹 ===')
C.LESSONS.forEach((l, i) => {
  engine.visitLesson(s, l.id)
  l.quiz.forEach((q, qi) => engine.recordAttempt(s, l.id, qi, i % 4 !== 0, q.concept, false))
  engine.markWidgetDone(s, l.id)
  engine.completeLesson(s, l.id)
})
const o = engine.overall(s)
ok(o.progress === 100, '进度 100%', String(o.progress) + '%')
ok(o.mastery > 60, '综合掌握度 > 60', String(o.mastery))
ok(o.accuracy === 75, '累计正确率 75%', String(o.accuracy) + '%')
ok(engine.teacherReport(s).length === 24, '教师报表仍为 24 行')

console.log('\n=== 遗忘 / 复习 / 导出导入 ===')
const cid = C.CONCEPTS[0].id
s.concepts[cid].lastReview = Date.now() - 30 * 86400000
ok(
  engine.reviewQueue(s).some((r) => r.cid === cid),
  '30 天未复习的概念进入复习队列',
)
const json = engine.exportState(s)
const restored = engine.importState(json)
ok(engine.overall(restored).progress === 100, '导出/导入还原一致')
let bad = false
try {
  engine.importState('{"version":9}')
} catch {
  bad = true
}
ok(bad, '非法备份被拒绝')

console.log('\n=== 多课程学情隔离 ===')
const other = createAnalytics(C, 'knowisle:other:v1')
const otherState = other.defaultState()
ok(other.overall(otherState).progress === 0, '另一门课不共享进度')

console.log('\n' + (failed === 0 ? '✅ 全部校验通过' : `❌ 校验失败 ${failed} 项`))
process.exit(failed === 0 ? 0 : 1)
