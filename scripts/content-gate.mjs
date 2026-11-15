/**
 * 课程正文体量闸门（00052）：pnpm verify 的第四段。
 *
 * 做三件事：
 *  ① 用 contentStats(md) 统计每课「正文字数 / 代码字符数」，与课型**下限**阈值比对（只设 min，不设 max）；
 *     正文量取 `proseWords`（汉字 1 字 = 1 词、英文按整词算，不含标点），不是 `proseChars`：
 *     字符数含标点、段间空格与英文单词的每个字母，比实际字数虚高约 1.58 倍，而且能靠
 *     堆标点 / 拉长标识符刷量。正文量含 `:::deep/warn/tip` 容器内的正文（只排除代码），
 *     口径由 scripts/verify-content-stats.mjs 钉住；
 *  ② 用与页面同一个入口（`lessonTime(lesson)`）算出课时用时，供人工核对体量是否撑得起时长；
 *  ③ 用 baseline（scripts/content-gate-baseline.json）做棘轮：**未重构的课进豁免名单**，
 *     重构完成后自动不再豁免；若某课已达标却仍在名单里，提示删除（防名单腐化）。
 *
 * 课型不在这里维护——它是课程数据的一部分：每节课用自己的 `Lesson.kind` 标注
 * （课程数据层用 `withKind()` 写），与所属阶段无关，同一阶段允许不同课型。
 * 本脚本只负责「读取 + 校验 + 度量」。新增课时忘标 kind 会直接失败，不会静默逃检；
 * 整门课一节都没标注的（如 effect / rxjs 等 simple 课程）视为「不纳入闸门」，打印一行提示后跳过。
 *
 * 用法：
 *   node --experimental-strip-types scripts/content-gate.mjs            # 全量（CI / pnpm verify）
 *   node --experimental-strip-types scripts/content-gate.mjs --verbose  # 打印每课明细
 *   node --experimental-strip-types scripts/content-gate.mjs --only=L26,L42
 *   node --experimental-strip-types scripts/content-gate.mjs --update-baseline
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { contentStats } = await import('../app/lib/markdown-md.ts')
const { lessonTime, formatShares } = await import('../app/lib/lesson-time.ts')

const BASE_FILE = path.join(ROOT, 'scripts', 'content-gate-baseline.json')
const args = process.argv.slice(2)
const onlyArg = args.find((a) => a.startsWith('--only='))
const ONLY = onlyArg
  ? new Set(
      onlyArg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim()),
    )
  : null
const VERBOSE = args.includes('--verbose')
const UPDATE_BASELINE = args.includes('--update-baseline')

/* ---------- 课型阈值（00052 §2，00055 上调）----------
 * 只设下限，不设上限：课时写得多、代码给得全是好事，卡 max 只会逼人为了「不超」而砍掉
 * 有价值的实现细节与真实踩坑。上限本身也判不准——同一课型的深浅差异可达数倍。
 *
 * **`wordsMin` 是绝对量级，不是按「字数 vs 字符数」折算来的。** 00054 曾按比值 1.58 把旧字符阈值
 * 折成 500/750/650/750/1250，数学上等价、管理上却把门槛悄悄降了 37%：读到的数字小了，Wave 重写的
 * 目标就跟着放低。00055 撤销折算，改回旧字符口径的量级（800/1200/1000/1200/2000）再上浮 1.5×。
 * 要换度量口径时只换 `proseChars` / `proseWords` 的实现，**不要回到这张表里"顺手折算"**。
 *
 * overview（导览 / 收束）是唯一例外：正文 400 字（沿用旧值，不上浮）、代码 0。导览课的交付物是
 * 「地图与路径」而不是实现，400 字足够铺开要点与依赖关系；再往上抬只会逼出注水的地图。
 * 放宽阈值不靠自我声明兜底——想占这个口子，仍要过 overview 的四道护栏（理由必填、每模块 ≤1 节、
 * 总量 ≤8%、Capstone 禁用），避免把「写不动」伪装成「这节是导览」。
 *
 * 键集合即合法课型集合（与 app/types/course.ts 的 LessonKind 对齐）——用语义名而不是
 * A/B/C/D 代号，读报错和读课程数据都不需要查映射表。
 */
const THRESHOLDS = {
  theory: { wordsMin: 1200, codeMin: 400, label: '理论 / 范式' },
  practice: { wordsMin: 1800, codeMin: 1500, label: '实战 / 实现' },
  framework: { wordsMin: 1500, codeMin: 1000, label: '框架对照' },
  scenario: { wordsMin: 1800, codeMin: 1500, label: '专项 Agent 场景' },
  capstone: { wordsMin: 3000, codeMin: 2500, label: 'Capstone 综合交付' },
  overview: { wordsMin: 400, codeMin: 0, label: '导览 / 收束' },
}

/* ---------- overview 课型护栏 ----------
 * 导览课是「免实现代码 + 免测验」的口子，必须可复核：理由必填、每模块最多 1 节、
 * 总量不超过总课时 8%、Capstone 阶段禁用（复盘课也得有真实实现与验收断言）。
 */
const NAV_LIMITS = { perModule: 1, ratio: 0.08 }

/* ---------- 载入 baseline ---------- */
let baseline = {}
if (fs.existsSync(BASE_FILE)) baseline = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'))

/* ---------- 动态发现课程（与 verify-course.mjs 同策略）---------- */
const dataDir = path.join(ROOT, 'app', 'data')
const dirs = fs
  .readdirSync(dataDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.endsWith('-course'))
  .map((d) => d.name)
  .toSorted()

/** overview（导览 / 收束）课：免实现代码、免随堂测验，理由必填。 */
const isNavLesson = (l) => l.kind === 'overview'

let failed = 0
const nextBaseline = {}
const rows = []
const isKind = (k) => Object.hasOwn(THRESHOLDS, k)

for (const dir of dirs) {
  const label = dir.replace(/-course$/, '')
  const mod = await import(pathToFileURL(path.join(dataDir, dir, 'index.ts')).href)
  const C = [mod.default, ...Object.values(mod)].find(
    (v) => v && Array.isArray(v.LESSONS) && Array.isArray(v.STAGES),
  )
  if (!C) continue

  /* ---- 课型来源：每节课自己的 Lesson.kind ----
   * 一节都没标 → 本课程不纳入闸门（effect / rxjs 等 simple 课程）。
   * 只要有一处标了，就必须标全：漏标、写错值都直接失败，
   * 而不是像旧版「阶段映射表」那样把整段课时静默跳过。
   */
  if (!C.LESSONS.some((l) => l.kind)) {
    console.log('— ' + label + '：未在课程数据标注课型（Lesson.kind），跳过体量闸门')
    continue
  }

  const missingKind = C.LESSONS.filter((l) => !l.kind)
  if (missingKind.length > 0) {
    console.log(
      '  ✗ 以下课时未标注 kind（每节课都必须标，闸门不接受「漏配逃检」）：' +
        missingKind.map((l) => l.id).join('、'),
    )
    failed++
  }
  const badLessonKind = C.LESSONS.filter((l) => l.kind && !isKind(l.kind))
  if (badLessonKind.length > 0) {
    console.log(
      '  ✗ 课时 kind 取值非法（合法值：' +
        Object.keys(THRESHOLDS).join(' / ') +
        '）：' +
        badLessonKind.map((l) => l.id + '=' + l.kind).join('、'),
    )
    failed++
  }

  /* ---- 课型自洽硬校验（00058）：课型是「身份」，不是「体量」 ----
   * H1：标题写「实战」就不能标成纯知识课——标题已承诺交付可运行物，标 theory / overview 会让
   *     阈值、题目策略与学习路径同时失真（00058 审计中这类错标共 9 节）。
   * H2：标 practice 就必须有「可运行物」的学习目标——goals 全是「理解 / 掌握 / 认识」说明这是
   *     知识课冒充实战课：它会把下限抬到 1800 字 + 1500 字符代码，诱导后续重写为了过闸门
   *     而堆与主题无关的示例（00058 审计中这类错标共 39 节）。
   * 两条判据都只看标题与 goals，**不看当前正文字数**：体量是待办、课型是身份，
   * 用体量反推课型会把「还没重写」误判成「标错了」。
   */
  const IMPL_VERB = /实现|写出|写一个|搭|搭建|构建|跑通|调通|部署|编码|改造|接入|从零|埋点|打通|串成|产出/
  const fakeTheory = C.LESSONS.filter(
    (l) => (l.kind === 'theory' || l.kind === 'overview') && String(l.title).includes('实战'),
  )
  if (fakeTheory.length > 0) {
    console.log(
      '  ✗ 标题含「实战」的课不能标 theory / overview（标题承诺了可运行物，应标 practice / ' +
        'framework / scenario / capstone）：' +
        fakeTheory.map((l) => l.id + '=' + l.kind).join('、'),
    )
    failed++
  }
  const fakePractice = C.LESSONS.filter(
    (l) => l.kind === 'practice' && !IMPL_VERB.test((l.goals || []).join(' ')),
  )
  if (fakePractice.length > 0) {
    console.log(
      '  ✗ 标 practice 的课，goals 必须含实现类动词（全是「理解 / 掌握」说明是知识课，应标 ' +
        'theory）：' +
        fakePractice.map((l) => l.id).join('、'),
    )
    failed++
  }

  /* ---- 围栏 info-string 禁含反引号（00058 审计附带发现）----
   * CommonMark 规定：反引号围栏的 info-string 里不能再出现反引号。一旦出现，**整行不会被识别
   * 成代码块**——代码被当段落渲染，紧跟其后的 `:::` 容器与标题全部错位，页面看起来像「正文里
   * 混进了 md 源码」。00058 审计时全仓有 24 节命中（历史迁移留下的 `note="… `x` …"` 写法），
   * 数据已批量改为中文引号；这条校验负责守住，别让重写时再写回去。
   */
  const badFence = []
  for (const l of C.LESSONS) {
    String(l.md || '')
      .split('\n')
      .forEach((line, i) => {
        const m = line.match(/^ {0,3}(`{3,})(.*)$/)
        if (m && m[2].includes('`')) badFence.push(l.id + ' 第 ' + (i + 1) + ' 行')
      })
  }
  if (badFence.length > 0) {
    console.log(
      '  ✗ 代码围栏的 info（title= / note=）里不能出现反引号，否则整块不会被识别成代码块（改用「」）：' +
        badFence.join('、'),
    )
    failed++
  }

  /* ---- overview 课型护栏（按整门课校验，不受 --only 影响）---- */
  const navLessons = C.LESSONS.filter(isNavLesson)
  if (navLessons.length > 0) {
    const stageModule = new Map(C.STAGES.map((s) => [s.id, s.module]))
    /* 「阶段是不是 Capstone 区」属于教学定位，不是课型（课型已按课时标注）：
     * 按阶段名 / 英文名识别，数据改了就跟着变，不需要再维护一张阶段课型表。 */
    const capstoneStages = new Set(
      C.STAGES.filter((s) => /capstone/i.test(s.name + ' ' + s.en)).map((s) => s.id),
    )
    const capNav = navLessons.filter((l) => capstoneStages.has(l.stage))
    if (capNav.length > 0) {
      console.log(
        '  ✗ Capstone 阶段的课不允许标 overview（复盘课也要有真实实现与验收断言）：' +
          capNav.map((l) => l.id).join('、'),
      )
      failed++
    }
    const noReason = navLessons.filter((l) => !String(l.kindReason || '').trim())
    if (noReason.length > 0) {
      console.log(
        '  ✗ overview 课必须写 kindReason（说明为什么整节课不需要实现代码）：' +
          noReason.map((l) => l.id).join('、'),
      )
      failed++
    }
    const perModule = new Map()
    for (const l of navLessons) {
      const m = stageModule.get(l.stage)
      perModule.set(m, (perModule.get(m) || 0) + 1)
    }
    for (const [m, n] of perModule) {
      if (n > NAV_LIMITS.perModule) {
        console.log(
          '  ✗ 模块' +
            (m === undefined ? '?' : m + 1) +
            ' 有 ' +
            n +
            ' 节导览课，超过每模块 ' +
            NAV_LIMITS.perModule +
            ' 节上限',
        )
        failed++
      }
    }
    const navCap = Math.ceil(C.LESSONS.length * NAV_LIMITS.ratio)
    if (navLessons.length > navCap) {
      console.log(
        '  ✗ 导览课 ' +
          navLessons.length +
          ' 节，超过总课时 ' +
          NAV_LIMITS.ratio * 100 +
          '% 上限（' +
          navCap +
          ' 节）',
      )
      failed++
    }
    if (VERBOSE) {
      for (const l of navLessons) console.log('  · overview ' + l.id + '：' + l.kindReason)
    }
  }

  if (VERBOSE) {
    const summary = Object.entries(THRESHOLDS)
      .map(([k, th]) => {
        const n = C.LESSONS.filter((l) => l.kind === k).length
        return n > 0 ? k + '（' + th.label + '）' + n + ' 课' : null
      })
      .filter(Boolean)
    console.log('  · 课型分布（来自课程数据）：' + summary.join(' · '))
  }

  const exempt = new Set(baseline[label] || [])
  nextBaseline[label] = []

  for (const l of C.LESSONS) {
    if (ONLY && !ONLY.has(l.id)) continue
    const type = l.kind
    if (!type) continue
    // 题目规则：overview 导览课允许 0 题（只做指路，不做考核）；其余课型至少 1 题，不允许「没题算过」
    if (type !== 'overview' && l.quiz.length === 0) {
      console.log('  ✗ ' + l.id + ' 非导览课但没有题目（只有 overview 导览课允许 0 题）')
      failed++
    }
    const th = THRESHOLDS[type]
    const stats = contentStats(l.md)
    // 与页面共用同一个入口函数（lessonTime 内部也会算一次 stats），保证「闸门看到的时长」
    // 就是「用户看到的时长」，不会出现两条推导路径漂移。
    const time = lessonTime(l)
    const belowProse = stats.proseWords < th.wordsMin
    const belowCode = stats.codeChars < th.codeMin
    const below = belowProse || belowCode
    const isExempt = exempt.has(l.id)

    rows.push({
      id: l.id,
      type,
      words: stats.proseWords,
      code: stats.codeChars,
      below,
      isExempt,
      estimate: time.minutes,
      shares: formatShares(time.shares),
    })

    // 棘轮：豁免名单只保留「仍不达标」的课；--update-baseline 时把当前所有不达标课收进名单
    if (below && (isExempt || UPDATE_BASELINE)) nextBaseline[label].push(l.id)
    if (below && !isExempt) {
      console.log(
        '  ✗ ' +
          l.id +
          '（' +
          th.label +
          '）体量未达标：正文 ' +
          stats.proseWords +
          '/' +
          th.wordsMin +
          ' 字' +
          ' · 代码 ' +
          stats.codeChars +
          '/' +
          th.codeMin,
      )
      failed++
    }
    if (!below && isExempt) {
      console.log(
        '  ! ' + l.id + ' 已达标但仍列在 baseline 豁免名单，请从 ' + path.basename(BASE_FILE) + ' 移除',
      )
    }
  }
}

/* ---------- 输出 ---------- */
if (VERBOSE || ONLY) {
  console.log('\n课型  课次   正文字数/下限   代码/下限   推导用时   用时占比')
  for (const r of rows) {
    const th = THRESHOLDS[r.type]
    const mark = r.below && !r.isExempt ? '✗' : r.isExempt ? '·' : '✓'
    console.log(
      mark +
        ' ' +
        r.type.padEnd(6) +
        ' ' +
        r.id.padEnd(5) +
        ' ' +
        String(r.words).padStart(5) +
        '/' +
        String(th.wordsMin).padEnd(5) +
        ' ' +
        String(r.code).padStart(5) +
        '/' +
        String(th.codeMin).padEnd(5) +
        ' ' +
        String(r.estimate).padStart(3) +
        ' min   ' +
        r.shares,
    )
  }
}

const passing = rows.filter((r) => !r.below).length
const exemptCount = rows.filter((r) => r.isExempt).length
console.log(
  '\n体量闸门：' +
    passing +
    '/' +
    rows.length +
    ' 课达标（' +
    exemptCount +
    ' 课在 baseline 豁免，待 Wave 重构）',
)

if (UPDATE_BASELINE) {
  fs.writeFileSync(BASE_FILE, JSON.stringify(nextBaseline, null, 2) + '\n', 'utf8')
  console.log('已回写 baseline：' + path.relative(ROOT, BASE_FILE))
  process.exit(0)
}

console.log(failed === 0 ? '✅ 体量闸门通过' : '❌ 体量闸门失败 ' + failed + ' 项')
process.exit(failed === 0 ? 0 : 1)
