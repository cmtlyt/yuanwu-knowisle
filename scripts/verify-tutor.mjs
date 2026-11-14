/**
 * 助学 Agent 纯计算自检（pnpm verify 的第二段）。
 *
 * 只 import 不碰 DOM / OPFS / WebCrypto / fetch 的模块：
 * ① 意图粗路由用例表（00029 B2 收紧正则的回归网）
 * ② 会话组键绑定表
 * ③ 学情导出边界（00028 D6：确认 exportState 不含 LLM 配置与对话）
 * ④ 冻结快照的学情摘要只在显式传入时进入 system prompt
 * ⑤ system prompt 课程语境约束（00031 B1/B2/B3：语境优先 / 歧义先澄清 / 短答对齐）
 *
 * 依赖 Node 22 的 --experimental-strip-types。
 * 浏览器侧交互回归见 scripts/tutor-probe.py（需 Chrome + wrangler，人工按需执行）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
const ok = (cond, label, extra = '') => {
  if (cond) console.log('  ✓ ' + label + (extra ? ' — ' + extra : ''))
  else {
    console.log('  ✗ ' + label + (extra ? ' — ' + extra : ''))
    failed++
  }
}

const { detectIntent, makeSnapshot, buildSystemPrompt, buildMessages } =
  await import('../app/lib/tutor/context.ts')
const { resolveLessonKey } = await import('../app/lib/tutor/history.ts')
const { createAnalytics } = await import('../app/lib/analytics.ts')

/* ---------- ① 意图粗路由用例表 ---------- */
console.log('\n=== 意图路由（nav = 本地零 LLM / llm = 交模型自决三姿态）===')
// 00031 A3：15 → 35 条。除「帮我导航一下」因 D1① 改期望外，原有用例判定不变。
// 保留元组写法（同类型 string，不会触发 no-base-to-string 的元组推断坑）。
const intentCases = [
  // 强导航信号：本地零 LLM
  ['下一步学什么', 'nav'],
  ['接下来学什么', 'nav'],
  ['学哪一门比较合适', 'nav'],
  ['学习路线', 'nav'],
  ['学习路径', 'nav'],
  ['按什么顺序学', 'nav'],
  ['下一步', 'nav'],
  ['帮我排一下学习路径', 'nav'],
  ['按顺序学', 'nav'],
  // 「学哪」是短语级强导航信号，「先学哪个」属于让助手推荐课时的导航语义
  ['先学哪个更合适', 'nav'],
  // 组合句：护栏让步（「下一步学什么，为什么」仍是导航）
  ['下一步学什么，为什么', 'nav'],
  // 已知边界（A1 明确接受的不完美）：强导航词压过答疑护栏，由导航卡 askAi() 兜底
  ['为什么下一步学这个', 'nav'],
  // 弱导航长尾：D1① 一律交 LLM 由三姿态自决
  ['帮我导航一下', 'llm'],
  ['我该从哪开始', 'llm'],
  ['接着往下看什么', 'llm'],
  ['帮我规划一下', 'llm'],
  ['从哪里入手比较好', 'llm'],
  ['有什么推荐的课程吗', 'llm'],
  // 裸词 / 贪婪匹配反例
  ['这个路由怎么导航', 'llm'],
  ['导航守卫的原理', 'llm'],
  ['这段代码按推荐顺序学会怎样', 'llm'],
  ['为什么按这个顺序学不对', 'llm'],
  ['按教材顺序学会不会更快', 'llm'],
  // 答疑护栏
  ['这两个操作符哪个先执行？', 'llm'],
  ['为什么顺序会错', 'llm'],
  ['讲讲 flatMap 的原理', 'llm'],
  ['switchMap 和 mergeMap 的区别是什么', 'llm'],
  ['这段代码为什么报错', 'llm'],
  ['为什么这么安排', 'llm'],
  ['flatMap 的含义', 'llm'],
  ['是不是该先学这个', 'llm'],
  ['这样写对不对', 'llm'],
  ['Semaphore 的用法', 'llm'],
  ['这段代码能不能用 pipe', 'llm'],
  ['map 会扁平数组吗', 'llm'],
  ['flatMap 和 map 的区别', 'llm'],
  // 追问 / 中英混排
  ['考考我，别直接给答案', 'llm'],
  ['直接告诉我这个概念的原理', 'llm'],
  ['what is flatMap', 'llm'],
]
for (const [text, want] of intentCases) {
  const got = detectIntent(text)
  ok(got === want, `${text} → ${want}`, got === want ? '' : `实际 ${got}`)
}

/* ---------- ② 会话组键绑定表 ---------- */
console.log('\n=== 会话组键 resolveLessonKey ===')
// 用对象而非 `[route, want]` 元组：元组数组会让 oxlint 把 want 推断成
// 「string | route 对象」的联合，进而在模板字面量里触发 no-base-to-string / restrict-template。
const keyCases = [
  { route: { path: '/', inCourse: false }, want: 'home' },
  { route: { path: '/settings/llm', inCourse: false }, want: 'home' },
  { route: { path: '/courses/effect-ts', inCourse: true, slug: 'effect-ts' }, want: 'effect-ts:course' },
  {
    route: { path: '/courses/effect-ts/dashboard', inCourse: true, slug: 'effect-ts' },
    want: 'effect-ts:course',
  },
  {
    route: {
      path: '/courses/effect-ts/lessons/L01',
      inCourse: true,
      slug: 'effect-ts',
      lessonId: 'L01',
      stage: 1,
    },
    want: 'effect-ts:1:L01',
  },
  // 缺 stage 时按课程级组兜底，不产生 `effect-ts:undefined:L01` 这类脏键
  {
    route: { path: '/courses/effect-ts/lessons/L01', inCourse: true, slug: 'effect-ts', lessonId: 'L01' },
    want: 'effect-ts:course',
  },
]
for (const kase of keyCases) {
  const got = resolveLessonKey(kase.route)
  const want = kase.want
  ok(got === want, `${kase.route.path} → ${want}`, got === want ? '' : `实际 ${got}`)
}

/* ---------- ③ 冻结快照的学情摘要边界 ---------- */
console.log('\n=== system prompt 学情摘要边界 ===')
const plain = makeSnapshot({ pageKind: 'dashboard', course: 'home' })
const withSummary = makeSnapshot({
  pageKind: 'dashboard',
  course: 'effect-ts',
  learningSummary: '进度 20%',
})
ok(!buildSystemPrompt(plain).includes('学情摘要'), '未传 learningSummary 时 system 不含学情摘要')
ok(buildSystemPrompt(withSummary).includes('学情摘要'), '显式传入时 system 含学情摘要')

/* ---------- ④ 学情导出边界（00028 D6）---------- */
console.log('\n=== 学情导出不含 LLM 配置 / 对话 ===')
const dataDir = path.join(ROOT, 'app', 'data')
const courseDirs = fs
  .readdirSync(dataDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.endsWith('-course'))
  .toSorted((a, b) => a.name.localeCompare(b.name))
ok(courseDirs.length > 0, '发现课程数据目录', `${courseDirs.length} 门`)
if (courseDirs.length) {
  const entry = path.join(dataDir, courseDirs[0].name, 'index.ts')
  const mod = await import(pathToFileURL(entry).href)
  const C = [mod.default, ...Object.values(mod)].find(
    (v) => v && Array.isArray(v.STAGES) && Array.isArray(v.LESSONS) && !!v.META,
  )
  if (!C) {
    ok(false, `${courseDirs[0].name}/index.ts 导出有效课程数据`)
  } else {
    const engine = createAnalytics(C, 'knowisle:verify:tutor:export')
    const json = engine.exportState(engine.defaultState())
    const parsed = JSON.parse(json)
    const forbidden = ['apiKey', 'baseUrl', 'fingerprintHash', 'messages', 'conversations', 'feed']
    const leaked = forbidden.filter((k) => Object.hasOwn(parsed, k))
    ok(
      leaked.length === 0,
      '导出 JSON 不含 LLM 配置 / 对话字段',
      leaked.length ? `泄漏 ${leaked.join(', ')}` : '',
    )
    ok(!!parsed.exportedAt && !!parsed.courseVersion, '导出含 exportedAt / courseVersion')
    ok(!json.includes('sk-'), '导出文本不含 key 样式明文')
  }
}

/* ---------- ⑤ system prompt 课程语境约束（00031 B1/B2/B3）---------- */
console.log('\n=== system prompt 语境约束 ===')
const tones = [
  { kind: 'dashboard', label: '首页 dashboard' },
  { kind: 'review', label: '学情 review' },
  { kind: 'lesson', label: '课时 lesson' },
  { kind: 'concept', label: '概念 concept' },
]
for (const t of tones) {
  const sys = buildSystemPrompt(makeSnapshot({ pageKind: t.kind, course: 'home' }))
  ok(sys.includes('语境优先'), `${t.label} 档含「语境优先」`)
  ok(sys.includes('歧义先澄清') && sys.includes('短答也要对齐语境'), `${t.label} 档含消歧与短答原则`)
}
const anchoring = '以本课时核心概念与常见误区为准'
for (const kind of ['lesson', 'concept']) {
  ok(
    buildSystemPrompt(makeSnapshot({ pageKind: kind, course: 'effect-ts' })).includes(anchoring),
    `${kind} 档要求锚定本课时概念与误区`,
  )
}
const dashboardSys = buildSystemPrompt(makeSnapshot({ pageKind: 'dashboard', course: 'home' }))
ok(!dashboardSys.includes(anchoring), 'dashboard / review 档文案未被改动')
ok(!dashboardSys.includes('学情摘要'), '首页空快照仍不含「学情摘要」（00029 B1 边界）')

const probeConv = {
  snapshot: makeSnapshot({ pageKind: 'lesson', course: 'effect-ts', lessonConcepts: ['Effect'] }),
  messages: [{ role: 'user', content: 'flatMap 和 map 的区别', ts: 1 }],
}
const probeMessages = buildMessages(probeConv)
ok(
  probeMessages[0].role === 'system' && probeMessages[0].content.includes('语境优先'),
  'messages[0] 仍为 system 且含消歧规则',
)
ok(probeMessages[0].content.includes('Effect'), 'system 仍携带冻结上下文')
ok(
  probeMessages[probeMessages.length - 1].content === 'flatMap 和 map 的区别',
  '末帧仍为用户问题（00029 D1 契约）',
)

console.log('')
if (failed) {
  console.error(`助学 Agent 自检失败：${failed} 项`)
  process.exit(1)
}
console.log('助学 Agent 自检全部通过')
