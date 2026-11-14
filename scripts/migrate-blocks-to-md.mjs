/**
 * 课程内容 blocks → md 迁移脚本（00053）。
 *
 * 用法：
 *   node --experimental-strip-types scripts/migrate-blocks-to-md.mjs --check
 *     - 干跑：扫描所有 *-course/lessons/*.ts，加载并生成 md，断言 blocks/md 非空，统计，不写文件。
 *   node --experimental-strip-types scripts/migrate-blocks-to-md.mjs --pilot <file>
 *     - 试点：在指定文件 L() 末尾追加 md（blocks 保留作兜底），用于先在真实课时页验证。
 *   node --experimental-strip-types scripts/migrate-blocks-to-md.mjs
 *     - 全量：把所有未迁移课时重写为最终形态（md 取代 blocks 为第 9 个参数，去掉末尾 md 形参与 blocks）。
 *
 * 安全：全量模式写完每个文件后立即重新 import，逐项比对非 blocks 字段与 md，任一不符即报错并跳过，保证只搬运 blocks→md，
 *       quiz / terms / pitfalls / meta 零失真。已迁移（无 blocks）的文件自动跳过，可幂等重跑。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { blocksToMarkdown, escBacktick } = await import(
  pathToFileURL(path.join(ROOT, 'app/lib/markdown-md.ts')).href
)

const args = process.argv.slice(2)
const mode = args[0] === '--check' ? 'check' : args[0] === '--pilot' ? 'pilot' : 'full'

/* ---------- 字符串感知的 L() 实参扫描（处理括号嵌套与字符串内的逗号/括号）---------- */
function findCallArgs(src) {
  const start = src.indexOf('L(')
  if (start < 0) return null
  let i = start + 2
  let depth = 1
  let argStart = i
  let inStr = null
  const args = []
  while (i < src.length && depth > 0) {
    const c = src[i]
    if (inStr) {
      if (c === '\\') {
        i += 2
        continue
      }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c
      i++
      continue
    }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    if (depth === 1 && c === ',') {
      args.push([argStart, i])
      argStart = i + 1
    }
    i++
  }
  if (depth !== 0) return null
  args.push([argStart, i - 1])
  return { callStart: start, callEnd: i, args }
}

/* ---------- 序列化（输出合法 TS；oxfmt 会重新格式化）---------- */
function q(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"
}
function qArray(arr) {
  return '[' + arr.map((x) => q(x)).join(', ') + ']'
}
function quizArr(quiz) {
  return (
    '[' +
    quiz
      .map(
        (qq) =>
          `{ text: ${q(qq.text)}, options: ${qArray(qq.options)}, answer: ${qq.answer}, explain: ${q(
            qq.explain,
          )}, concept: ${q(qq.concept)} }`,
      )
      .join(', ') +
    ']'
  )
}
function termsArr(terms) {
  return '[' + terms.map((r) => '[' + q(r[0]) + ', ' + q(r[1]) + ']').join(', ') + ']'
}
function mdLiteral(md) {
  return '`\n' + escBacktick(md) + '\n`'
}

/* ---------- 加载课时模块，取出 Lesson 对象 ----------
 * bust>0 时给 URL 追加查询串以绕过 Node ESM 模块缓存（同一文件写完后再 import 校验时需拿到新内容）。 */
async function loadLesson(file, bust = 0) {
  const href = pathToFileURL(file).href + (bust ? `?bust=${bust}` : '')
  const mod = await import(href)
  const lesson =
    mod.default && Array.isArray(mod.default?.quiz)
      ? mod.default
      : Object.values(mod).find((v) => v && Array.isArray(v.quiz) && typeof v.id === 'string')
  if (!lesson) throw new Error('未找到导出的 Lesson: ' + file)
  return lesson
}

/* ---------- 全量：把 L() 调用重写成最终形态 ----------
 * 注意：本脚本在「L() 签名已翻转为 md 在第 9 位、无 blocks」之后运行。
 * 未迁移文件的旧 blocks 数组会落在 md 槽位（before.md 为数组）；
 * 已迁移文件 before.md 为字符串。故 blocks 从 before.md（数组）取出。 */
function rewriteFinal(src, lesson, blocks) {
  const found = findCallArgs(src)
  if (!found) throw new Error('未找到 L() 调用')
  const md = blocksToMarkdown(blocks)
  const mdLit = mdLiteral(md)
  const parts = [
    q(lesson.id),
    String(lesson.stage),
    q(lesson.title),
    String(lesson.minutes),
    String(lesson.difficulty),
    qArray(lesson.prereqs),
    qArray(lesson.concepts),
    qArray(lesson.goals),
    mdLit,
    lesson.widget ? q(lesson.widget) : 'null',
    quizArr(lesson.quiz),
    termsArr(lesson.terms),
    qArray(lesson.pitfalls),
  ]
  const newCall = 'L(' + parts.join(', ') + ')'
  let out = src.slice(0, found.callStart) + newCall + src.slice(found.callEnd + 1)
  // 更新构造器导入：迁移后 quiz 已内联为对象字面量、不再调用 q，blocks 构建器也不再使用，故只保留 L
  out = out.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/\.\.\/course-builders\.ts['"]/,
    "import { L } from '../../course-builders.ts'",
  )
  return { out, md }
}

/* ---------- 试点：在 L() 末尾追加 md（blocks 保留）---------- */
function rewritePilot(src, lesson) {
  const found = findCallArgs(src)
  if (!found) throw new Error('未找到 L() 调用')
  const md = blocksToMarkdown(lesson.blocks)
  const mdLit = mdLiteral(md)
  // callEnd 指向 L() 的 ')' 之后；插到 ')' 之前作为新的末尾实参。
  // 若 ')' 前已有逗号（如 `],\n)`），则不重复加逗号，避免 `], ,`。
  let k = found.callEnd - 2
  while (k >= 0 && /\s/.test(src[k])) k--
  const hasComma = src[k] === ','
  const sep = hasComma ? '' : ', '
  return src.slice(0, found.callEnd - 1) + sep + mdLit + src.slice(found.callEnd - 1)
}

/* ---------- 校验：重新 import 比对非 blocks 字段零失真 ---------- */
function assertNoLoss(before, after, file) {
  const keys = ['id', 'stage', 'title', 'minutes', 'difficulty', 'prereqs', 'concepts', 'goals', 'widget']
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) throw new Error(`${file}: 字段 ${k} 失真`)
  }
  if (JSON.stringify(before.quiz) !== JSON.stringify(after.quiz)) throw new Error(`${file}: quiz 失真`)
  if (JSON.stringify(before.terms) !== JSON.stringify(after.terms)) throw new Error(`${file}: terms 失真`)
  if (JSON.stringify(before.pitfalls) !== JSON.stringify(after.pitfalls))
    throw new Error(`${file}: pitfalls 失真`)
  if (!after.md || after.md.trim().length === 0) throw new Error(`${file}: md 为空`)
}

/* ---------- 主流程 ---------- */
const lessonDir = path.join(ROOT, 'app/data')
const files = []
for (const d of fs.readdirSync(lessonDir, { withFileTypes: true })) {
  if (!d.isDirectory() || !d.name.endsWith('-course')) continue
  const ld = path.join(lessonDir, d.name, 'lessons')
  if (!fs.existsSync(ld)) continue
  for (const f of fs.readdirSync(ld)) {
    if (f.match(/^l\d+\.ts$/)) files.push(path.join(ld, f))
  }
}
files.sort((a, b) => a.localeCompare(b))

if (mode === 'check') {
  let total = 0
  for (const f of files) {
    const lesson = await loadLesson(f)
    // 翻转签名后：未迁移文件 before.md 为旧 blocks 数组；已迁移为字符串。
    const blocks = Array.isArray(lesson.md) ? lesson.md : null
    if (!blocks) {
      console.log('  skip(已迁移): ' + path.relative(ROOT, f))
      continue
    }
    const md = blocksToMarkdown(blocks)
    if (!md.trim()) throw new Error('md 为空: ' + f)
    total++
  }
  console.log(`✓ --check 通过：${total} 个课时 blocks→md 可生成且非空`)
  process.exit(0)
}

if (mode === 'pilot') {
  const target = args[1]
  if (!target) {
    console.error('✗ --pilot 需要指定文件')
    process.exit(1)
  }
  const abs = path.resolve(target)
  const lesson = await loadLesson(abs)
  if (lesson.md) {
    console.log('  skip(已有 md): ' + target)
    process.exit(0)
  }
  const out = rewritePilot(fs.readFileSync(abs, 'utf8'), lesson)
  fs.writeFileSync(abs, out)
  console.log('✓ pilot 已追加 md: ' + target)
  process.exit(0)
}

// full
let okCount = 0
let skipCount = 0
for (const f of files) {
  const before = await loadLesson(f)
  // 翻转签名后：未迁移文件的旧 blocks 数组落在 md 槽位；已迁移文件 md 为字符串。
  const blocks = Array.isArray(before.md) ? before.md : null
  if (!blocks) {
    skipCount++
    continue
  }
  const src = fs.readFileSync(f, 'utf8')
  const { out, md } = rewriteFinal(src, before, blocks)
  fs.writeFileSync(f, out)
  // 重新 import 校验（bust 绕过 ESM 缓存，必须读到刚写入的新内容）
  const after = await loadLesson(f, Date.now())
  assertNoLoss(before, after, f)
  // mdLiteral 在模板字符串首尾各加了一个换行（源可读性），故运行时值为 '\n' + md + '\n'
  if (after.md !== '\n' + md + '\n') throw new Error('md 回写不一致: ' + f)
  okCount++
}
console.log(`✓ 全量迁移完成：${okCount} 个重写，${skipCount} 个跳过（已迁移）`)
console.log(
  '  说明：本脚本运行前 L() 签名已翻转为（…, goals, md, widget, quiz, terms, pitfalls），故 md 落在第 9 位；',
)
console.log(
  '  迁移已写入 md 并内联 quiz/terms/pitfalls。收尾（手写）：删除 lesson-block.vue、移除 course-builders 中已死的 blocks 构造器、更新 00053 文档。',
)
process.exit(0)
