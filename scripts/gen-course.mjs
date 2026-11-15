/**
 * 通用课程草稿 → 课时 TS 生成器（00092 通用化自 00091 的 gen-agent-harness-course.mjs）。
 *
 * 草稿格式（<drafts-dir>/LNN.md）：
 *   ---
 *   { JSON frontmatter：id / stage / title / difficulty / prereqs / concepts / goals / kind / quiz / terms / pitfalls }
 *   ---
 *   （markdown 正文，作为 Lesson.md）
 *
 * 用法：
 *   node --experimental-strip-types scripts/gen-course.mjs <drafts-dir> <out-dir>           # 生成全部
 *   node --experimental-strip-types scripts/gen-course.mjs <drafts-dir> <out-dir> --check   # 干跑校验，不写文件
 *
 *   例（00091 agent-harness）：
 *     node --experimental-strip-types scripts/gen-course.mjs \
 *       docs/00091-agent-harness-course/drafts app/data/agent-harness-course/lessons
 *
 * 设计：草稿是唯一内容源（资料与内容先落盘、防上下文压缩丢信息）；生成只做机械转换——
 * JSON.stringify 元数据（合法 TS 表达式）、md 走模板串并转义反引号与 ${。任何手动编辑 lNN.ts 都会在下次生成时被覆盖。
 * 生成后必须跑 `pnpm fmt`（oxfmt 会把紧凑输出展开为门禁要求的格式；gen → fmt 后与提交版本逐字节一致）。
 * 草稿与 out-dir 需满足 <course>/lessons 布局（lessonTs 里 course-builders 的相对导入深度依赖这一点）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2).filter((a) => a !== '--check')
const CHECK = process.argv.includes('--check')
if (args.length !== 2) {
  console.error(
    '用法: node --experimental-strip-types scripts/gen-course.mjs <drafts-dir> <out-dir> [--check]',
  )
  process.exit(2)
}
const DRAFTS = path.resolve(ROOT, args[0])
const OUT = path.resolve(ROOT, args[1])
if (!fs.existsSync(DRAFTS)) {
  console.error(`drafts 目录不存在: ${DRAFTS}`)
  process.exit(2)
}

const KINDS = new Set(['theory', 'practice', 'framework', 'scenario', 'capstone', 'overview'])

function parseDraft(file) {
  const raw = fs.readFileSync(file, 'utf8')
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) throw new Error(`${path.basename(file)}: 缺少 --- frontmatter 包围`)
  const meta = JSON.parse(m[1])
  const md = m[2].replace(/^\r?\n/, '').replace(/\s+$/, '') + '\n'
  const id = meta.id
  if (!/^L\d{2}$/.test(id)) throw new Error(`${id}: id 必须是 LNN`)
  if (!Array.isArray(meta.goals) || meta.goals.length < 2) throw new Error(`${id}: goals 至少 2 条`)
  if (!Array.isArray(meta.concepts) || meta.concepts.length < 1) throw new Error(`${id}: concepts 至少 1 个`)
  if (!KINDS.has(meta.kind)) throw new Error(`${id}: kind 非法 ${meta.kind}`)
  if (!Array.isArray(meta.quiz) || meta.quiz.length < 1)
    throw new Error(`${id}: quiz 至少 1 题（theory 课不允许 0 题）`)
  for (const [i, q] of meta.quiz.entries()) {
    if (!Array.isArray(q.options) || q.options.length < 2)
      throw new Error(`${id} quiz[${i}]: options 至少 2 项`)
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length)
      throw new Error(`${id} quiz[${i}]: answer 越界`)
    if (!q.concept) throw new Error(`${id} quiz[${i}]: 缺 concept 标签`)
  }
  if (!Array.isArray(meta.terms) || meta.terms.length < 1) throw new Error(`${id}: terms 至少 1 条`)
  if (!Array.isArray(meta.pitfalls) || meta.pitfalls.length < 1) throw new Error(`${id}: pitfalls 至少 1 条`)
  return { meta, md }
}

function escapeTemplate(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

function lessonTs(meta, md) {
  const j = (v) => JSON.stringify(v)
  return `import { L, withKind } from '../../course-builders.ts'

export const ${meta.id} = withKind(
  L(
    ${j(meta.id)},
    ${meta.stage},
    ${j(meta.title)},
    ${meta.difficulty},
    ${j(meta.prereqs || [])},
    ${j(meta.concepts)},
    ${j(meta.goals)},
    \`${escapeTemplate(md)}\`,
    null,
    ${j(meta.quiz)},
    ${j(meta.terms)},
    ${j(meta.pitfalls)},
  ),
  ${j(meta.kind)}${meta.kindReason ? ',\n  ' + j(meta.kindReason) : ''},
)
`
}

function indexTs(ids) {
  const imports = ids.map((id) => `import { ${id} } from './${id.toLowerCase()}.ts'`).join('\n')
  const list = ids.map((id) => `  ${id},`).join('\n')
  return `import type { Lesson } from '~/types/course'
${imports}

export const LESSONS: Lesson[] = [
${list}
]
`
}

const files = fs
  .readdirSync(DRAFTS)
  .filter((f) => /^L\d{2}\.md$/.test(f))
  .toSorted()
if (files.length === 0) throw new Error('drafts 目录为空')

const lessons = []
for (const f of files) {
  const { meta, md } = parseDraft(path.join(DRAFTS, f))
  lessons.push({ meta, md })
  const prose = md
  console.log(
    `  ${meta.id} stage=${meta.stage} kind=${meta.kind} quiz=${meta.quiz.length} md=${(prose.length / 1024).toFixed(1)}KB`,
  )
}

/* id 连续性与 stage/concept 引用由 verify-course.mjs 统一校验；这里只保证草稿可解析、可生成。 */
if (!CHECK) {
  fs.mkdirSync(OUT, { recursive: true })
  for (const { meta, md } of lessons) {
    fs.writeFileSync(path.join(OUT, `${meta.id.toLowerCase()}.ts`), lessonTs(meta, md), 'utf8')
  }
  fs.writeFileSync(path.join(OUT, 'index.ts'), indexTs(lessons.map((l) => l.meta.id)), 'utf8')
  console.log(`✅ 生成 ${lessons.length} 课 → ${path.relative(ROOT, OUT)}`)
} else {
  console.log(`✅ 干跑通过：${lessons.length} 份草稿可解析`)
}
