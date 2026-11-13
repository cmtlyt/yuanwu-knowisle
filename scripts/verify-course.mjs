/**
 * 课程内容 + 学情引擎自检：pnpm verify
 * 依赖 Node 22 的 --experimental-strip-types，直接加载 app/ 下的 TS 模块。
 *
 * 多课程化：动态扫描 app/data/*-course/ 目录（每门课一个目录，index.ts 为入口），
 * 对每门课做
 *  ① 数据一致性 + 引用完整性 ② 学情引擎全轨迹 ③ 遗忘/导出导入/多课程隔离。
 * 任意一门课失败即整体失败。新增课程目录会自动被本脚本纳入，无需改动。
 *
 * 说明：课程目录内 index.ts 对兄弟模块的相对值导入**带显式 .ts 扩展名**
 * （如 './stages.ts'），Node 的 --experimental-strip-types 可直接解析；
 * 而 index.ts 顶部的 `import type ... from '~/types/course'` 是 type-only 导入，
 * 运行时被擦除。因此本脚本可按 `.../index.ts` 显式路径 import。
 * （不要改去 import courses.ts——它内部是省略扩展名的相对导入，Node ESM strip-types 解析不了；
 *  课程清单本脚本直接扫描目录得到，与 courses.ts 注册解耦。）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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

/* ---------- 动态发现课程数据模块（课程数据层已目录化：每门课一个 *-course/ 目录）---------- */
const dataDir = path.join(ROOT, 'app', 'data')
const courseDirs = fs
  .readdirSync(dataDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.endsWith('-course'))
  .toSorted((a, b) => a.name.localeCompare(b.name))
if (!courseDirs.length) {
  console.error('✗ app/data 下未找到 *-course/ 课程数据目录（需含 index.ts）')
  process.exit(1)
}

const discovered = []
for (const d of courseDirs) {
  const entry = path.join(dataDir, d.name, 'index.ts')
  const mod = await import(pathToFileURL(entry).href)
  const C = [mod.default, ...Object.values(mod)].find(
    (v) => v && Array.isArray(v.STAGES) && Array.isArray(v.LESSONS) && !!v.META,
  )
  if (!C) {
    console.error('✗ ' + d.name + '/index.ts 未导出有效课程数据（需要 META / STAGES / CONCEPTS / LESSONS）')
    failed++
    continue
  }
  discovered.push({ label: d.name.replace(/-course$/, ''), C })
}

console.log('=== 可用课程数据模块（' + discovered.length + '）===')
console.log('  ' + discovered.map((d) => d.label).join(', '))

/* ---------- 静态资源 ---------- */
console.log('\n=== 静态资源 ===')
;['app/assets/css/main.css', 'app/lib/widgets.ts', 'app/lib/analytics.ts'].forEach((f) => {
  ok(fs.existsSync(path.join(ROOT, f)), f)
})

for (const { label, C } of discovered) {
  console.log('\n================ 课程数据：' + label + '（' + C.META.version + '） ================')

  const quizTotal = C.LESSONS.reduce((n, l) => n + l.quiz.length, 0)
  const conceptIds = new Set(C.CONCEPTS.map((c) => c.id))
  const lessonIds = new Set(C.LESSONS.map((l) => l.id))
  const stageIds = new Set(C.STAGES.map((s) => s.id))
  const widgetIds = new Set(C.LESSONS.map((l) => l.widget).filter(Boolean))

  console.log('--- 课程结构 ---')
  console.log(
    '  版本基线：' +
      C.META.version +
      '（核实 ' +
      (C.META.verifiedAt || '未记录') +
      '）· ' +
      C.STAGES.length +
      ' 阶段 / ' +
      C.LESSONS.length +
      ' 课 / ' +
      C.CONCEPTS.length +
      ' 概念 / ' +
      quizTotal +
      ' 题',
  )
  ok(!!C.META.version, '版本基线已锁定')
  ok(C.STAGES.length > 0 && C.LESSONS.length > 0 && C.CONCEPTS.length > 0 && quizTotal > 0, '结构非空')

  console.log('--- 引用完整性 ---')
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
    C.LESSONS.every((l) => l.quiz.every((qq) => conceptIds.has(qq.concept))),
    '题目概念引用有效',
  )
  ok(
    C.LESSONS.every((l) =>
      l.quiz.every((qq) => qq.options.length >= 2 && qq.answer >= 0 && qq.answer < qq.options.length),
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

  /* 每个概念至少被一道题覆盖（缺失只告警，不强判失败） */
  const covered = new Set(C.LESSONS.flatMap((l) => l.quiz.map((qq) => qq.concept)))
  const uncovered = [...conceptIds].filter((c) => !covered.has(c))
  if (uncovered.length) console.log('  ! 未被题目覆盖的概念：' + uncovered.join(', '))

  console.log('--- 教学设计（DESIGN） ---')
  if (C.DESIGN) {
    ok(!!C.DESIGN.title && !!C.DESIGN.summary, 'DESIGN 标题与摘要完整')
    const secIds = new Set(C.DESIGN.sections.map((s) => s.id))
    ok(secIds.size === C.DESIGN.sections.length, `DESIGN 章节 id 唯一（${C.DESIGN.sections.length} 节）`)
    const known = new Set(['prose', 'list', 'callout', 'kv', 'table', 'code', 'lessons'])
    let blockOk = true
    for (const s of C.DESIGN.sections) {
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
  } else {
    ok(false, 'DESIGN 未绑定到课程')
  }

  /* ---------- 学情引擎：空状态 ---------- */
  const engine = createAnalytics(C, 'knowisle:verify:' + label)
  let s = engine.defaultState()
  console.log('--- 学情引擎：空状态 ---')
  ok(engine.overall(s).progress === 0, '空状态进度 0%')
  ok(engine.recommend(s).next.lesson.id === C.LESSONS[0].id, '空状态推荐首课 ' + C.LESSONS[0].id)
  ok(engine.teacherReport(s).length === C.LESSONS.length, '教师报表 ' + C.LESSONS.length + ' 行')

  /* ---------- 学情引擎：完整学习轨迹 ---------- */
  C.LESSONS.forEach((l, i) => {
    engine.visitLesson(s, l.id)
    l.quiz.forEach((qq, qi) => engine.recordAttempt(s, l.id, qi, i % 4 !== 0, qq.concept, false))
    engine.markWidgetDone(s, l.id)
    engine.completeLesson(s, l.id)
  })
  const o = engine.overall(s)
  console.log('--- 学情引擎：完整学习轨迹 ---')
  ok(o.progress === 100, '进度 100%', String(o.progress) + '%')
  ok(o.mastery > 60, '综合掌握度 > 60', String(o.mastery))
  // 模拟轨迹：第 i 课（i%4!==0）全对、其余全错。正确率须与轨迹自洽，
  // 而非硬编码魔法数字——题目密度随复杂度动态变化时也能稳定通过。
  const simTotal = C.LESSONS.reduce((n, l) => n + l.quiz.length, 0)
  const simCorrect = C.LESSONS.reduce((n, l, i) => (i % 4 !== 0 ? n + l.quiz.length : n), 0)
  const expectedAccuracy = simTotal ? Math.round((simCorrect / simTotal) * 100) : 0
  ok(
    o.accuracy === expectedAccuracy,
    '累计正确率与模拟轨迹自洽',
    o.accuracy + '%（期望 ' + expectedAccuracy + '%）',
  )
  ok(engine.teacherReport(s).length === C.LESSONS.length, '教师报表仍为 ' + C.LESSONS.length + ' 行')

  /* ---------- 遗忘 / 复习 / 导出导入 ---------- */
  const cid = C.CONCEPTS[0].id
  s.concepts[cid].lastReview = Date.now() - 30 * 86400000
  console.log('--- 遗忘 / 复习 / 导出导入 ---')
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

  /* ---------- 多课程学情隔离 ---------- */
  const other = createAnalytics(C, 'knowisle:verify:isolated:' + label)
  const otherState = other.defaultState()
  ok(other.overall(otherState).progress === 0, '另一 storageKey 不共享进度')
}

console.log('\n' + (failed === 0 ? '✅ 全部课程校验通过' : `❌ 校验失败 ${failed} 项`))
process.exit(failed === 0 ? 0 : 1)
