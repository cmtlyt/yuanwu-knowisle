/**
 * 通用课程内容自检：数据一致性 + 引用完整性 + 前置 DAG。
 *
 * 用法（Node 22+，加载 TS 模块需要 strip-types）：
 *   本仓库：node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs <course-data.ts> [widgets.ts]
 *   复制到目标项目 scripts/ 后：node --experimental-strip-types scripts/check-course.mjs <course-data.ts> [widgets.ts]
 *
 * 课程数据模块需导出 META / STAGES / CONCEPTS / LESSONS（命名导出或 default 均可）。
 * 演练模块可选，需导出 Widgets（Map / Set / 对象 / 数组均可）。
 * 退出码 0 = 全绿，1 = 存在失败项。
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [, , dataArg, widgetsArg] = process.argv
if (!dataArg) {
  console.error('用法: node --experimental-strip-types check-course.mjs <course-data.ts> [widgets.ts]')
  process.exit(2)
}

const load = async (p) => {
  const url = pathToFileURL(path.resolve(p)).href
  return import(url)
}

let failed = 0
const ok = (cond, label, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failed++
}
const warn = (label) => console.log('  ! ' + label)

const mod = await load(dataArg)
const candidate = [mod.COURSE, mod.EFFECT_COURSE, mod.COURSE_DATA, mod.default, mod].find(
  (v) => v && Array.isArray(v.STAGES) && Array.isArray(v.LESSONS),
)
if (!candidate) {
  console.error('✗ 未在模块中找到课程数据（需要 META / STAGES / CONCEPTS / LESSONS）')
  process.exit(1)
}
const C = candidate

console.log('=== 版本基线 ===')
ok(!!C.META, 'META 存在')
ok(!!C.META?.version, '版本已锁定', C.META?.version || '缺失')
ok(!!C.META?.verifiedAt, '核实日期已记录', C.META?.verifiedAt || '缺失')

console.log('\n=== 课程结构 ===')
ok(C.STAGES.length > 0, '阶段非空', String(C.STAGES.length))
ok(C.CONCEPTS.length > 0, '概念非空', String(C.CONCEPTS.length))
ok(C.LESSONS.length > 0, '课时非空', String(C.LESSONS.length))
const quizTotal = C.LESSONS.reduce((n, l) => n + (l.quiz?.length || 0), 0)
ok(quizTotal > 0, '题目非空', String(quizTotal))
console.log(
  `  · ${C.STAGES.length} 阶段 / ${C.LESSONS.length} 课时 / ${C.CONCEPTS.length} 概念 / ${quizTotal} 题`,
)

const unique = (arr, key) => new Set(arr.map((x) => x[key])).size === arr.length
ok(unique(C.STAGES, 'id'), '阶段 id 唯一')
ok(unique(C.CONCEPTS, 'id'), '概念 id 唯一')
ok(unique(C.LESSONS, 'id'), '课时 id 唯一')

const stageIds = new Set(C.STAGES.map((s) => s.id))
const conceptIds = new Set(C.CONCEPTS.map((c) => c.id))
const lessonIds = new Set(C.LESSONS.map((l) => l.id))
const lessonOrder = new Map(C.LESSONS.map((l, i) => [l.id, i]))
const conceptStage = new Map(C.CONCEPTS.map((c) => [c.id, c.stage]))

console.log('\n=== 引用完整性 ===')
ok(
  C.STAGES.every((s) => stageIds.has(s.id)),
  '阶段自引用有效',
)
ok(
  C.LESSONS.every((l) => stageIds.has(l.stage)),
  '课时阶段引用有效',
)
ok(
  C.CONCEPTS.every((c) => stageIds.has(c.stage)),
  '概念阶段引用有效',
)
ok(
  C.LESSONS.every((l) => (l.concepts || []).every((c) => conceptIds.has(c))),
  '课时概念引用有效',
)
ok(
  C.CONCEPTS.every((c) => (c.prereqs || []).every((p) => conceptIds.has(p))),
  '概念前置引用有效',
)
ok(
  C.LESSONS.every((l) => (l.prereqs || []).every((p) => lessonIds.has(p))),
  '课时前置引用有效',
)
ok(
  C.LESSONS.every((l) => (l.quiz || []).every((q) => conceptIds.has(q.concept))),
  '题目概念引用有效',
)
ok(
  C.LESSONS.every((l) =>
    (l.quiz || []).every(
      (q) =>
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < q.options.length,
    ),
  ),
  '选项与答案索引有效',
)
ok(
  C.LESSONS.every((l) => (l.quiz || []).every((q) => !!q.explain)),
  '题目解析完整',
)

console.log('\n=== 前置顺序与 DAG ===')
ok(
  C.LESSONS.every((l) => (l.prereqs || []).every((p) => lessonOrder.get(p) < lessonOrder.get(l.id))),
  '课时前置均排在当前课之前',
)
ok(
  C.CONCEPTS.every((c) => (c.prereqs || []).every((p) => conceptStage.get(p) <= conceptStage.get(c.id))),
  '概念前置不跨到后续阶段',
)
const hasCycle = (nodes, getPre) => {
  const state = new Map()
  const visit = (id) => {
    if (state.get(id) === 1) return true
    if (state.get(id) === 2) return false
    state.set(id, 1)
    for (const p of getPre(id) || []) if (visit(p)) return true
    state.set(id, 2)
    return false
  }
  return nodes.some((n) => visit(n.id))
}
ok(!hasCycle(C.LESSONS, (id) => C.LESSONS.find((l) => l.id === id)?.prereqs), '课时依赖无环')
ok(!hasCycle(C.CONCEPTS, (id) => C.CONCEPTS.find((c) => c.id === id)?.prereqs), '概念依赖无环')

console.log('\n=== 课时内容块 ===')
ok(
  C.LESSONS.every((l) => (l.blocks || []).length > 0),
  '讲解块非空',
)
ok(
  C.LESSONS.every((l) => (l.goals || []).length > 0),
  '学习目标非空',
)
ok(
  C.LESSONS.every((l) => (l.pitfalls || []).length > 0),
  '常见误区非空',
)
ok(
  C.LESSONS.every((l) => (l.terms || []).length > 0),
  '关键术语非空',
)
ok(
  C.LESSONS.every((l) => Number.isFinite(l.minutes) && l.minutes > 0),
  '课时时长有效',
)
const covered = new Set(C.LESSONS.flatMap((l) => (l.quiz || []).map((q) => q.concept)))
const uncovered = [...conceptIds].filter((c) => !covered.has(c))
if (uncovered.length) warn(`未被题目覆盖的概念（${uncovered.length}）：${uncovered.join(', ')}`)

console.log('\n=== 演练映射 ===')
const widgetIds = [...new Set(C.LESSONS.map((l) => l.widget).filter(Boolean))]
if (!widgetsArg) {
  warn(`未提供演练模块，跳过 ${widgetIds.length} 个 widget 标识的解析检查`)
} else {
  const wm = await load(widgetsArg)
  const W = wm.Widgets || wm.widgets || wm.default
  // 注册表可能是 Map/Set、带自定义 has() 的门面对象、数组或普通对象
  const has = (id) => {
    if (!W) return false
    if (typeof W.has === 'function') return !!W.has(id)
    if (Array.isArray(W)) return W.includes(id)
    return Object.hasOwn(W, id)
  }
  ok(widgetIds.every(has), '演练组件映射有效', widgetIds.join(', ') || '无 widget')
}

console.log('\n' + (failed === 0 ? '✅ 全部校验通过' : `❌ 校验失败 ${failed} 项`))
process.exit(failed === 0 ? 0 : 1)
