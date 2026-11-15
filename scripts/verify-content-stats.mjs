/**
 * `contentStats` 统计口径自检：pnpm verify
 * 依赖 Node 22 的 --experimental-strip-types，直接加载 app/lib/markdown-md.ts。
 *
 * 为什么单独一段：体量闸门（scripts/content-gate.mjs）与课时用时（app/lib/lesson-time.ts）
 * 都建立在 `contentStats` 上，口径错了下游全错，而且错得很安静——00054 之前
 * `:::deep/warn/tip` 容器内的正文被整段丢弃，导致 142 课漏统计 78.8% 的叙述量，
 * 闸门与时长都跟着失真。这里把口径钉成断言。
 *
 * 口径（见 ContentStats 字段注释）：
 *  · `proseChars` 含容器内正文，不含代码；
 *  · `codeChars` 只算围栏内非空白字符，不含 fence 的 info-string（title/note）；
 *  · 容器内代码只进 `codeChars`，不进 `proseChars`；
 *  · 容器内的 `### 标题` 计入 headings。
 * 注：proseChars 按「空白压缩为单空格 + trim」后的长度计，段间空格 +1 属既有口径。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const { contentStats } = await import('../app/lib/markdown-md.ts')

let failed = 0
const ok = (cond, label, extra = '') => {
  if (cond) console.log('  ✓ ' + label + (extra ? ' — ' + extra : ''))
  else {
    console.log('  ✗ ' + label + (extra ? ' — ' + extra : ''))
    failed++
  }
}

console.log('\n[1/3] contentStats 边界口径')
const CASES = [
  [
    '纯段落',
    '一二三四五\n\n六七八九十',
    { proseChars: 11, codeChars: 0, headings: 0, callouts: 0, codeBlocks: 0 },
  ],
  [
    '容器正文计入 prose',
    '```js\nconst a = 1\n```\n\n:::deep\n一二三四五\n:::',
    { proseChars: 5, codeChars: 8, headings: 0, callouts: 1, codeBlocks: 1 },
  ],
  ['容器内标题计入 headings', ':::warn\n### 标题\n正文\n:::', { proseChars: 5, headings: 1, callouts: 1 }],
  [
    '容器内代码只计 codeChars',
    ':::tip\n前言\n```ts\nconst x = 1\n```\n后记\n:::',
    { proseChars: 5, codeChars: 8, codeBlocks: 1, callouts: 1 },
  ],
  ['容器后接段落不粘连丢字', ':::tip\n甲\n:::\n\n乙乙', { proseChars: 4, callouts: 1 }],
  [
    'fence 的 title/note 不计入 codeChars',
    '```ts title="标题" note="说明"\nconst a = 1\n```',
    { codeChars: 8, codeBlocks: 1 },
  ],
  // md 结构字符不能算进正文量：漏掉它们会让字符数虚高，也能靠堆表格行 / 序号刷体量
  ['表格管道与分隔行不计', '| 甲 | 乙 |\n| --- | --- |\n| 丙 | 丁 |', { proseChars: 7, proseWords: 4 }],
  ['有序列表序号不计', '1. 甲\n2. 乙', { proseChars: 3, proseWords: 2 }],
  ['链接保留可见文字、丢 URL', '见[文档](https://x.com)，然后继续', { proseChars: 8, proseWords: 7 }],
  ['标题与列表 bullet 不计', '### 标题\n\n- 甲\n- 乙', { proseChars: 6, proseWords: 4, headings: 1 }],
]
for (const [label, md, expect] of CASES) {
  const got = contentStats(md)
  const miss = Object.entries(expect).filter(([k, v]) => got[k] !== v)
  ok(
    miss.length === 0,
    label,
    miss.length ? `期望 ${JSON.stringify(expect)}，实得 ${JSON.stringify(got)}` : JSON.stringify(got),
  )
}

console.log('\n[2/3] 真实课程抽样（容器正文必须计入）')
const dirs = fs
  .readdirSync(path.resolve(HERE, '../app/data'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.endsWith('-course'))
  .map((d) => d.name)

let totalLessons = 0
for (const dir of dirs) {
  const entry = path.resolve(HERE, '../app/data', dir, 'index.ts')
  if (!fs.existsSync(entry)) continue
  const mod = await import(pathToFileURL(entry).href)
  const course = [mod.default, ...Object.values(mod)].find((v) => v && Array.isArray(v.LESSONS))
  if (!course) continue
  const bad = []
  for (const l of course.LESSONS) {
    totalLessons++
    // 硬断言：md 里有容器，就必须识别到、且容器正文不能凭空消失
    if (!/:::[ \t]*[\w-]+/.test(l.md)) continue
    const stats = contentStats(l.md)
    if (stats.callouts === 0) bad.push(l.id + ' 容器未被识别')
    else if (stats.proseChars < 20) bad.push(l.id + ' 容器正文未计入（prose ' + stats.proseChars + '）')
  }
  ok(bad.length === 0, dir + '（' + course.LESSONS.length + ' 课）', bad.slice(0, 3).join('；'))
}

console.log('\n[3/3] 容器内块级内容渲染（00062）')
const { renderMarkdown } = await import('../app/lib/markdown.ts')
const RENDER_CASES = [
  ['容器内表格', ':::deep\n### 标题\n\n| a | b |\n|---|---|\n| 1 | 2 |\n:::', '<table>'],
  ['容器内无序列表', ':::warn\n### 标题\n\n- 一\n- 二\n:::', '<ul>'],
  ['容器内有序列表', ':::deep\n### 标题\n\n1. 一\n2. 二\n:::', '<ol>'],
  ['容器内多段落', ':::tip\n### 标题\n\n第一段\n\n第二段\n:::', '<p>第二段</p>'],
]
for (const [label, md, needle] of RENDER_CASES) {
  const html = renderMarkdown(md)
  ok(html.includes(needle), label, html.includes(needle) ? '' : '未生成 ' + needle)
}

// 真实课程：容器里写了表格行，就必须真的渲染出 <table>（防止再退回 renderInline）
let containerTables = 0
const badTables = []
for (const dir of dirs) {
  const entry = path.resolve(HERE, '../app/data', dir, 'index.ts')
  if (!fs.existsSync(entry)) continue
  const mod = await import(pathToFileURL(entry).href)
  const course = [mod.default, ...Object.values(mod)].find((v) => v && Array.isArray(v.LESSONS))
  if (!course) continue
  for (const l of course.LESSONS) {
    const re = /:::[ \t]*[\w-]+[ \t]*\n([\s\S]*?):::[ \t]*(?=\n|$)/g
    let m
    while ((m = re.exec(l.md))) {
      if (!/^\|.*\|$/m.test(m[1])) continue
      containerTables++
      if (!renderMarkdown(l.md).includes('<table>')) badTables.push(l.id)
    }
  }
}
ok(
  badTables.length === 0,
  '真实课程容器内表格（' + containerTables + ' 处）',
  badTables.slice(0, 3).join('；'),
)

console.log(
  '\n' +
    (failed === 0
      ? '✅ contentStats 口径与容器渲染自检通过（抽样 ' + totalLessons + ' 课，无容器正文丢失）'
      : '❌ contentStats 口径自检失败：' + failed + ' 项'),
)
process.exit(failed === 0 ? 0 : 1)
