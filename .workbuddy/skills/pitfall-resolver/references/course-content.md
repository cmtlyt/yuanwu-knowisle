# 课程内容 / 数据迁移 / 学情引擎

交互式课程构建的实测坑；流程与契约见 `course-builder`，这里只记「怎么修」。

## 版本与内容

| 症状 | 根因 | 处理 |
|---|---|---|
| 正文 API 在最新版不存在 | 凭记忆 / 旧博客，未查 dist-tags 与当前文档 | 先核实再写：交叉 `npm registry` 的 `latest` / `dist-tags`、官方公告、当前文档入口；差异清单写进设计文档，正文只用 `META.version` 对应 API |
| 跨版本 API 混用（旧名新名并存） | 边写边补资料 | 先抓全核心抽象再动笔；每课标版本口径；版本信息只存 `META`，正文不硬编码 |
| 迁移后内容丢失 | 手抄 60KB+ 数据 | 写一次性脚本机械转换（`IIFE` → `ESM`、全局变量 → 工厂闭包），核对语法与首尾结构后删脚本；**不要手抄** |
| 新增课时后地图 / 侧栏 / 报表不出现 | 视图层硬编码课时列表 | 内容层作唯一数据源；新增课时 = `LESSONS` 追加 + `CONCEPTS` 登记 |
| 第二门课后首页 / 侧栏 / hero 仍显示第一门课文案 | 共享视图硬编码首课专属内容 | 文案数据驱动：hero 用 `course.tagline \|\| course.subtitle`、导航用 `availableCourses()`、正文用各课 `META` / `DESIGN`；smoke 断言本课文案出现在自己页面且不串页 |
| 新增课程后 `pnpm verify` 仍只查 Effect 一门 | verify 路径 / 变量名写死 | 动态扫描 `app/data/*-course/` 下每个 `index.ts` 跑结构 / 引用 / `DESIGN` / 学情 / 隔离检查，新目录放对即纳入 |

## 引用完整性

| 症状 | 根因 | 处理 |
|---|---|---|
| 测验归因不到薄弱点 | `quiz[].concept` 指向不存在的概念 | 自检校验阶段 / 概念 / 前置 / 题目概念 / widget / 答案索引，悬空即失败 |
| 答案索引越界 | `answer` 不在 `options` 范围 | 断言 `Number.isInteger(answer) && answer >= 0 && answer < options.length` |
| 学习路径成环或前置在后 | DAG 未校验 | 同时检查「课时前置顺序单调」「概念前置不跨阶段」「两类依赖无环」 |
| 批量补第 N 题后 `check-course` 报「题目概念引用有效 ✗ / 选项与答案索引有效 ✗」，`text`/`options` 变 undefined、`answer` 是 explain、`concept` 变 undefined | 题行顶格（col 0）且漏尾逗号；`q('题目'['选项数组'],…)` 被当**字符串下标**（逗号表达式取末项），整个 `q(...)` 坍缩、字段左移 | 题干 / 选项 / 答案 / explain / 概念五行缩进一致（8 空格）且行尾逗号齐全；跑覆盖审计 + `check-course`。诊断：脚本遍历题目标出 `!conceptIds.has(q.concept)` 或越界 `answer`，再看源码是否顶格 |
| 整课重写后 `pnpm verify` 报「课时 / 题目概念引用有效 ✗」，新写的 `concepts` 含 `concepts.ts` 不存在的 id | 凭标题自造 id（如把 `version-lock` 写成 `dependency-lock`），三题 `quiz[].concept` 沿用一个错 id；`content-gate` 不查概念 | 重写前 `git show HEAD:app/data/<course>/lessons/lNN.ts \\| sed -n '5,16p'` 或 `grep` `concepts.ts` 该阶段 id；改 id 时 `concepts` 与全部 `quiz[].concept` 一起 `replace_all`。新增概念按 `docs/00075` 注册。落地 `docs/00075`（`mastra-obs`）、`docs/00082`（`version-lock`） |

自检脚本（两参数都可传**目录**，自动补 `index.ts`）：

```bash
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  app/data/effect-course app/lib/widgets
```

退出码 0 全绿 / 1 有失败 / 2 参数错误；只读数据。它是通用数据校验，与 `pnpm verify`（内容一致性 + 学情全轨迹）互补，两者都要跑。**多课程逐门跑** `check-course.mjs`（`rxjs-course` 同理），`pnpm verify` 已动态扫描全量。

## 题目密度：覆盖驱动，不按难度一刀切

| 症状 | 根因 | 处理 |
|---|---|---|
| 高难课 3 题全考同一概念，低难课漏标注概念 | 题数按 `difficulty` 定死，与覆盖脱节 | 题数由覆盖驱动：① `concepts` 每概念至少 1 题；② `weight≥3` 概念补 1 道换角度题（陷阱 / 选型 / 语义对比）。课时数同理动态化，「6×4=24」只是起点。改题后审计：每课 `concepts ⊆ quiz 概念集合`，全课程无漏覆盖 |
| `verify` 硬编码「累计正确率 75%」因题数变化失败（74%） | 旧课时结构下的魔法数字 | 按轨迹自洽计算（`verify-course.mjs`：`i%4!==0` 全对 / 其余全错 → 期望 = `round(对题/总题)`） |

## 重编号技巧（课时 id 全局调整）

| 症状 | 根因 | 处理 |
|---|---|---|
| 手改 `L01…L24` → `L01…L26`，prereqs / `DESIGN` 引用改漏或改出环 | 多行手替换易漏、易级联（先改 L04→L03 撞旧 L03） | 单次扫描映射：`/L([0-2][0-9])/g` 查 `{旧id→新id}` 一次性替换（新 id 与旧重叠无碍，单遍不回读），随后 `check-course` 验 DAG 无环、prereqs 有效，再插新课 |

## Node ESM 运行时导入

| 症状 | 根因 | 处理 |
|---|---|---|
| `node --experimental-strip-types` import `courses.ts` 报 `ERR_MODULE_NOT_FOUND`（找不到 `./effect-course`） | Node ESM 不推断扩展名；Nuxt / Vite 构建期能补全 | 校验脚本不要 import `courses.ts`，直接扫 `app/data/*-course/` 按 `.../index.ts` **显式路径**逐个 import（目录内兄弟值导入也显式 `.ts`）；`app/lib/widgets/index.ts` 同理 |
| 把 `effect-course.ts` 改成目录（`effect-course/index.ts` + `stages.ts`）后 Node import 目录报 `ERR_MODULE_NOT_FOUND`，或 `import './stages'` 找不到 | Node ESM 不解析目录 `index.ts`、不补相对扩展名 | ① 脚本入口显式 `.../index.ts`；② 目录内兄弟**值**导入显式 `.ts`，靠 Nuxt `allowImportingTsExtensions` + Node strip-types 放行；③ `verify-course.mjs` 从 `filter(f=>f.endsWith('-course.ts'))` 改为扫 `*-course` 目录 + import `index.ts`；④ 外部 `courses.ts` 仍用 `./effect-course`（仅 Nuxt 侧）。落地 `docs/00027` |

## 类型收窄（composable 层）

| 症状 | 根因 | 处理 |
|---|---|---|
| `useRequiredCourse()` 的 `course.value` 仍是 `ComputedRef<CourseEntry \| undefined>`，`learning.stateOf(course.value)` 报「类型 `CourseEntry \| undefined` 不能赋给 `CourseEntry`」 | 内部虽 404 拦截，返回类型未收窄，消费侧逐处 `!` 或 `if` 兜底易漏 | composable 层显式返回类型 `RequiredCourseContext = ReturnType<typeof useCourse> & { course: ComputedRef<CourseEntry>; data: ComputedRef<EffectCourseData> }`，用类型守卫 `isCourseReady(ctx): ctx is RequiredCourseContext` 拦截 + 收窄；**不用 `as`**（触发 `no-unsafe-type-assertion`）；消费页 `course!` 也可去掉 |

## 学情引擎

| 症状 | 根因 | 处理 |
|---|---|---|
| 导出导入后档案不一致 | `importState` 未校验版本 / 未深拷贝 | 校验版本字段、拒绝非法备份；断言 `overall(importState(exportState(s)))` 与原始一致 |
| 30 天未复习的概念没进队列 | 遗忘公式 / 阈值错 | `retention = exp(-Δt / max(0.5, stability))`，队列 `total > 0 && retention < 0.82`，按 retention 升序 |
| 另一门课进度被串改 | 全局课程对象 / 固定 key | 工厂闭包捕获 `course` 与 `storageKey`，断言另一 key 引擎进度为 0 |
| 教师报表行数忽多忽少 | 报表遍历运行时动态集合 | 断言报表行数恒等于课时数 |

## 演练

| 症状 | 根因 | 处理 |
|---|---|---|
| widget 标识都能解析，但切课后定时器还在跑 | 只验映射没验生命周期 | 每个演练返回 `cleanup()` 回收定时器 / 监听 / RAF；宿主 `onMounted` 挂载、`onBeforeUnmount` 清理 |
| 用户把演练当真实运行时 | 没标边界 | 写明「原理模拟」，真实代码指向官方 Playground |
| `widgets.ts` 拆成 `widgets/` 后 `check-course.mjs` 报 `ERR_MODULE_NOT_FOUND`，文档仍传 `app/lib/widgets.ts` | Node ESM 不解析目录 index，旧路径失效 | ① 第二参数传目录 `app/lib/widgets`（`load()` 补 `index.ts`）；② `verify-course.mjs` 显式 import `app/lib/widgets/index.ts`；③ 目录内值导入显式 `.ts`；④ Nuxt 侧 `~/lib/widgets` 省略扩展名不变。同步校正根 README / `design.ts` 正文 / 组件注释 / skill 文档的路径与数量（11 → 24）。落地 `docs/00035`、`docs/00036` |

## 正文渲染（Markdown-in-TS 容器）

| 症状 | 根因 | 处理 |
|---|---|---|
| `:::deep/warn/tip` 内表格显示成一串 `\|`、列表挤成一段 | `app/lib/markdown.ts` 的 `callout_open` 用 `renderInline` 输出正文，只解行内语法；`.filter(l => l.trim() !== '')` 又吃掉段间空行 | 三处同改：正文用 `mdInstance.render(normalizeFenceInfo(body))`；只去首尾空行；补 `.callout p + p / ul / table` 间距。防回归：`scripts/verify-content-stats.mjs` 第三段 5 条断言（表格 / 无序 / 有序 / 多段落 / 真实课程扫描）。落地 `docs/00062` |
| `npx tsx scripts/content-gate.mjs` 报 `TransformError: Expected ")" but found "<某个正文词>"`，行号指向自然语言正文 | `Lesson.md` 是模板串，正文行内代码 `` `refs` `` 用裸反引号提前结束模板串 | 模板串内任何行内代码写 `` \`x\` ``（含正文、`goals` 之外的说明文字）；告警：报错落在中文串中间、`Expected ")" but found "中文"` 即搜裸反引号。同类异位是 00058 的 ` ```ts title="…` 围栏。落地 `docs/00067`（L68） |
| `pnpm lint` / `typecheck` 报 `no-useless-escape: Unnecessary escape character 'd'`，行号落在 `lessons/lNN.ts` 代码块内；页面正则显示 `\b1[3-9]d{9}\b`（`\b` 退格、`\d` 变 `d`） | 代码块也在模板串内，`\d` `\b` `\s` `\w` `\n` `\t` 被当字符串转义（`\n` 变真实换行，lint 不报只静默破坏） | 代码块每个反斜杠双写：`/\\d+/`、`'a\\nb'`；检查脚本 `tmp-escape.mjs` 扫 `(?<!\\)\\[dbswnt]`。**2026-11-15 全量扫出 5 处历史遗留**（`l47` 的 `` `OK\n…` ``、`l82` 的 `join('\n')` 与 `SYS + '\n\n'`），已修双反斜杠并复查。落地 `docs/00074`（L102） |
| 代码块 JS 串显示 `'status = 'PAID''`（引号塌陷、不可编译），但 esbuild / lint / typecheck / 双扫描全不报 | `\'` 在 TS 模板串里是**合法转义**，直接输出 `'`、吞掉反斜杠；`tmp-backtick.mjs` 只查反引号、`tmp-escape.mjs` 只查 `\\[dbswnt]` | 代码块单引号串内不要用 `\\'`：外层改双引号 `"status = 'PAID'"` 最省事，确需保留写 `\\\\'`。用 `npx tsx -e "import('./app/data/agent-course/lessons/lNN.ts').then(m=>console.log(m.LNN.md.split('\\\\n').filter(l=>/关键字/.test(l)).join('\\\\n')))"` **打印渲染后的 md** 核对——统计脚本只看块数看不出字符被吞。落地 `docs/00079`（L117） |
| 代码块正则 `/\.run\(\s*parsed/` 渲染成 `/.run(s*parsed/`，正则失效；`tmp-escape.mjs` 只报 `\s` | `\.` `\(` `\)` `\{` 也被模板串吞（无效转义输出后一个字符），扫描正则 `(?<!\\)\\[dbswnt]` **只覆盖六字符** | 课程代码块尽量不写正则，改用 `text.includes('.run(parsed')` / `startsWith`；确需保留则每个反斜杠双写。补一次全量扫描：截取模板串逐行找后跟非反引号 / 反斜杠 / `$` / `{` 的单反斜杠（`node -e` 内联即可）。落地 `docs/00085`（L129） |

## 跨课接口一致性（Capstone 链）

| 症状 | 根因 | 处理 |
|---|---|---|
| 下游初稿调用 `gatewayLevelOf()`、`Executor.runReadOnly()`，但上游 L129 没有；正文还写「只消费不改」 | 凭「听起来应该有」补方法名，没摊开上游公开接口；代码块只是文本不参与编译，gate / lint / typecheck 全查不出 | 动笔前 `grep -n "export \|  [a-zA-Z]*("` 上游文件列真实接口；正文写**接缝表**（上游交付 / 本课用法 / 不许改什么），下游只调用表内方法。常量表漂移时加 `assertLevelTableMatchesGateway()` 比对网关 `describe()`。落地 `docs/00085`（L130） |
| Capstone 初稿代码 9433–10852 字符、正文仅 2868 / 2825 字（<3000），且在豁免名单里 gate 只提示「已达标但仍列在豁免名单」 | 长代码块给人「内容够了」错觉；`proseWords` 不数代码，豁免课 gate 不下限断言 | 补**接缝表 / 不变量表 / 完整运行事件表 / 采样分层口径**这类讲清代码间约束的正文，不是堆示例；跑 `--only=LNN --verbose` 看 raw 与余量（>50）。落地 `docs/00085`（L130、L131） |

## 收官段：范围对齐、默认关闭补丁与结构自检（L139–L142）

| 症状 | 根因 | 处理 |
|---|---|---|
| 表格为显示 `[number, number]` 写 `\[number, number\]`，渲染丢反斜杠、代码块同类写法失效；`tmp-escape.mjs` / lint / typecheck 都不报 | `\[` 是 JS 无效转义、反斜杠被吞；扫描正则只覆盖 `[dbswnt]` | 表格用行内代码包裹 `` \`[number, number]\` ``；跑修正版单反斜杠扫描：遇反斜杠后跟反斜杠 / 反引号 / `$` 则跳过两字符（否则合法 `\\n` 的第二条会被误报）。落地 `docs/00087`（L137） |
| 流水线把整份 `html`（含文末参考文献）回喂 `assertNoRenderBypass()`，闸门天天报 `render-only sentence` 终被关掉 | 断言检查正文事实，喂进去的却混了非正文，数据范围与语义范围不对齐 | 拆出 `bodyHtml`（只含章节正文），`createReportService()` 与测试统一喂 `stripTags(rendered.bodyHtml)`；`html` 仍用于导出与锚点。**回喂闸门前先问「这段数据是不是断言要管的那部分」**，误判比漏判更易让闸门下线。落地 `docs/00088`（L141） |
| 下游 `segmentedSynthesize()` 需上游 `synthesize()` 支持全局编号映射，但 L138 已达标、正文与断言锁死当前行为 | 改上游签名会破坏已达标课；重写一套又造第二份真相 | 上游加**默认关闭的可选参数** `numberById?: Map<string, number>`，不传逐字不变，仅下游传入；正文与坑库写明「补丁默认关闭」。落地 `docs/00087` / `docs/00088`（L138 → L140） |
| 结构自检写「A/B 两支禁止互相依赖」把收束课也判错；放宽例外后 B 支偷依赖 A 支无人发现 | 凭直觉写规则未用真实数据跑不变量；例外只写「可以不做」未写「必须做成什么样」 | 先用 `node --experimental-strip-types -e` import `AGENT_COURSE` 实测：概念图 / 课时图成环、悬空引用、课号连续、overview 分布、跨分叉引用（实测唯一跨支是 L142 自身 `prereqs = L134 + L141`）。规则三段：支内可依赖 / 跨支禁止 / **收束课必须连住两支末端**；两侧各测一次。**规则有例外，两侧都要断言**。落地 `docs/00088`（L142） |
| 代码块验收断言写死 `assert.equal(r.stats.lessons, 142)`，新增一课测试先挂 | 把当前快照当结构不变量，断言依赖会变的数字 | 改用 `AGENT_COURSE.LESSONS.length` / `AGENT_COURSE.CONCEPTS.length`，规模快照只进报表；正文写死的数字标注「只作本次记录」。与 00054 删 `minutes` 同源：**别让会变的数字成第二份真相**。落地 `docs/00088`（L142） |
| 最后一课初稿正文 2835/3000，仍在豁免名单里 gate 只提示并显示「✅ 体量闸门通过」 | 豁免课不下限断言，7560 字符长代码块造成「够了」错觉 | 补实质节不堆示例：本例补「交付之后：把一次验收变成可回归的资产」表与 L142 交接，正文到 3412。**gate 绿 ≠ 达标**，收官批次手动跑 `--only=LNN --verbose` 看 raw 与余量。落地 `docs/00088`（L141） |

> **临时脚本已清理（Wave 1 收官）**：根目录 `tmp-backtick.mjs` / `tmp-escape.mjs` / `tmp-fix-backtick.mjs` / `tmp-sample.mjs` 与 `.wrangler/tmp` 下 68 个 Wrangler bundle 缓存已删；上文对脚本的引用是**历史做法记录**，不是可执行指引。142 课已达标，无需再跑批量扫描；复现时用一次性 `node -e` 内联脚本，或把脚本正式落 `scripts/` 纳入门禁。

## 整门课全量重建：闸门接入、API 白名单与生成器（00089 Effect）

| 症状 | 根因 | 处理 |
|---|---|---|
| 给无 `Lesson.kind` 的课一次标完课型，`pnpm verify` 立刻红（26 课全不达标） | 标注瞬间整门课被 `content-gate` 纳入体量闸门，旧正文远低于下限 | Step 0 同时写 `baseline.<course> = ["L01"…"L26"]` 全量豁免，标完 verify 仍为 0；每批后 `--update-baseline` 收缩（实测 `26 → 4 → 0`），收官清零。豁免是接入手段非降档，阈值不动 |
| 按记忆写 `Effect.async` / `runSyncExit` / `Effect.retry(call,{times,while,schedule})` / `Schedule.fixed("1 second",5)` / `catchAll`，发布后跑不起来 | `node_modules` 未装 `effect`，无法本地 import 核验；跨版本印象写 API | 从原课程 `.md` 正则提 `Effect.xxx` 形状、排序去重成白名单（00089 原文 85 个），正文只沿用；差异里只剩 `Exit.Exit<...>` / `Stream.Stream<...>` 类型别名安全。`catchAll` 全换 `Effect.catch`，自造签名换已验证组合 `Schedule.compose(Schedule.recurs(3), Schedule.exponential("100 millis"))`；拿不准的签名写注释不进代码块。**版本锁定课靠原文白名单，不靠记忆** |
| 整门重写反复撞模板串转义坑（裸反引号、`\'`、`\.` `\(` `\s`、`\[`、`\n` 变真换行），双扫描还要人眼兜底 | `Lesson.md` 是 TS 模板串，反斜杠 / 反引号 / `${` 全要手工转义 | 改为**纯 Markdown 草稿 → 一次性生成脚本**：草稿写 `.md`，脚本双写反斜杠、转义反引号与 `${`，再序列化 `quiz / terms / pitfalls`；结构化字段从当前课时模块读出避免自造概念 id，写 `lNN.ts`。四类转义坑从根因消除。**补写草稿后必须重新 apply**（00089 L17 只改草稿余量仍 +26，重生成后 +187） |
| `--only=L01 --verbose` 同一课号出现两行 | 多门课都用 `LNN`，`--only` 全局匹配 | 跨课程同名时改用全量 `content-gate` + 自建逐课检查器，别靠单行 verbose 判定 |
| 代码块字符数达标但状态迁移不闭合：`range()` cursor 每批重置重复生产、成功路径子任务没标 done、快照签名凭空造、检查顺序误报浮动版本 | 代码块不参与编译，gate / lint / typecheck 看不出；只看字数漏逻辑错 | 每课末尾补**可失败断言**走完状态变化（前后 `deepEqual`、负例测冲突 / 浮动版本 / 重复生产）+ 渲染抽查；正文「验收清单」与断言一一对应 |
| 给某课标 overview 复核站不住 | 课型是身份非字数：交付「搭工程 + 跑通」且已含代码，overview 免实现代码不成立 | 按 00058「看交付物」逐节复核；simple 课程 `STAGES` 无 `module`，多节 overview 挤进 `undefined` 组触发护栏。00089 最终 0 节 overview，口径写进**新** overview 不改历史 |

## 第二门简单课程全量重建：版本口径、时序代码块与生成器复用（00090 RxJS）

| 症状 | 根因 | 处理 |
|---|---|---|
| 锁 `rxjs@7.8.2` 的课原文混有 `empty()` / `never()` / `publish().refCount()` / `share({ refCount })` / `retryWhen` 等 6.x 与弃用写法，照抄新代码块跑不起来 | 原稿「历史对照 + 当时可用写法」混排，`META.version` 锁当前主线；只沿用白名单会连旧版一起抄 | 白名单只**排除自造名**，版本按 `META.notes` + `DESIGN` 已核对的 7.x 事实校准：`retryWhen` → `retry({ count, delay })`；`throwIfEmpty("...")` → error 工厂；`EMPTY()` / `NEVER()` → 常量；`publish` / `multicast` / `share({ refCount })` 只留历史对照正文表，代码块只用 `share()` / `shareReplay({ bufferSize, refCount })`；导入按 `rxjs` / `rxjs/operators` / `rxjs/testing` 分组，不混 9.0-beta 统一导入。**先定版本再定白名单** |
| 重构后 import 多 3 个操作符（`subscribeOn` / `observeOn` / `withLatestFrom`），无法判断自造；扫旧写法 `flatMap(` 命中 1 处 | 只按「名字在不在旧 import」/「字符串命中」判，没看语境；`Array.prototype.flatMap` 与 RxJS 同名必误报 | 新增名逐个回原文核对（分别在「三种常见调度器」「subscribeOn vs observeOn」「四种组合」段，属原文已验证语义、import 漏列可补）；旧写法命中**逐处看上下文**：`flatMap(` 是 L08 JS 数组方法，`empty()` / `never()` / `publish(` / `share({ refCount` 落在历史表或 callout，代码块调用 0 处。结论写「代码块调用 0 处 + 命中位置说明」，不写「全文 0 命中」 |
| marble / 有界并发 / 背压 / Subject 重放代码字数达标但断言跑不通、状态不闭合：`flatten` merge 分支只排序不交错、`MiniSubject` complete 不通知、`fixedWindowDebounce` 负例期望错、分批 cursor 重置重复生产、`buggyBatch()` 丢值 | 时序错在「值到达时刻」与「状态持久化」；代码块不编译，gate / lint / typecheck 查不出，`codeChars` 更误导 | 每课写**可失败断言 + 明确负例**走时间序列：marble 支持同帧分组（`--ab\|` 三事件共享帧）配 `naiveParse` 负例；`runBounded()` 持久化 `pending` 队列、断言 `peak === limit` 且「不丢不重」；背压 `assert.deepEqual(r.flat, producer)`；Subject 用 `Map` 存 complete 回调并触发；错误期望改实测 `["a","c","d"]`。**时序课正确性判据是断言不是长度** |
| 00089 生成器复用到第二门课，`check` 动态 import 相对路径不稳；三门课都用 `LNN`，`--only=L01` 输出三行 | 复用脚本保留单门课假设，没按「同名课号已存在」重设计 | `check` 用 `pathToFileURL(path.join(ROOT, 'app', 'lib', ...)).href` 绝对路径 import，且**只 import 目标单门课程模块**；草稿目录与原稿备份分离（先归档再清空，避免 `Write` 报「File has not been read yet」）；`META` 集中 `kind/goals`，其余字段从当前课时模块读。达标以**全量 `content-gate`** 为准，自建 `check` 只看 raw / 余量 / 渲染 |
| 结果段写「生成器、草稿、原稿备份已清理不入库」，但打断时 `?? tmp-*` 仍在工作区 | 先回填结果后清理，把「计划」写成「已完成」 | **收官顺序固定「清理 → 复核 `git status` → 回填结果段」**；已先写文档的立刻补清再核。未提交任务记录是活文档可直接校正，已落盘历史记录不改写只在新建记录说明。`pnpm build` + `wrangler dev` 会重生 `.wrangler/tmp`（本次 13M），连它一起清，保留 `.wrangler/deploy` 与 `state` |
| 收官复跑 `node --experimental-strip-types scripts/check-course.mjs app/data/rxjs-course app/lib/widgets` 报 `Error: Cannot find module '.../scripts/check-course.mjs'`（`requireStack: []`），但 `pnpm verify` / `content-gate` 全绿 | 脚本不在项目根 `scripts/`（只有 `verify-course.mjs` / `content-gate.mjs`），它是 skill 资产 `.workbuddy/skills/course-builder/scripts/check-course.mjs`；简写命令复跑时凭习惯补了 `scripts/`。`requireStack: []` 是入口没解析到，与课程引用无关 | 用 `AGENTS.md` §2 现行完整命令：`node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs app/data/rxjs-course app/lib/widgets`，两参传**目录**（`load()` 补 `index.ts`）。2026-11-15 实测 exit=0，13 种 widget / 前置 DAG / `DESIGN` 全通过。**简写命令复跑前先查 AGENTS.md 完整路径**；同类「命令仍指向已删除的 `widgets.ts`」也见 §2 |

## 调研型多系统课程：草稿管线与体量补齐（00091 Agent Harness）

| 症状 | 根因 | 处理 |
|---|---|---|
| `pnpm verify` 报「课时前置顺序有效」失败 20+ 项（如「缺失前置: h-harness-def -> L02」），但概念 / 题目引用全过 | frontmatter `prereqs` 填了**概念 id**，`Lesson.prereqs` 契约是**课时 id**（如 `['L04']`）且在本课之前；概念依赖应写 `Concept.prereqs` | 脚本机械映射：对每个前置概念找「更早讲授该概念的最后一课」（`teach[c]` 按 LESSONS 顺序、取 `lid < 本课 id` 末位），映射不出丢弃；回写 frontmatter 再 apply。**语义规则与结构规则是两张表，分别校验**。落地 `docs/00091` |
| 按「追加字符数 ≈ 词数」估算补齐（每课 ~1000 字符）仍剩 10 项缺口；追加 1080 字符 → +353 词 | `proseWords` 的 CJK 计数与字符数不是 1:1，标点 / 行内代码 / URL 折算更低；首轮缺口只是估算 | 按**闸门实测余量**逐项分配（每项 2–3 倍余量）、追加后立刻复跑；残余 10 项用第二轮小补丁（每项 200–500 字符 + 独立代码块）清零。**闸门数字是唯一可信余量表** |
| 00092 用 `git diff --stat app/data/... && echo IDEMPOTENT_OK` 验「逻辑逐行等价」得假阳性（diff +236/−2010 仍打 OK） | 生成器紧凑输出 ≠ oxfmt 展开的已提交 lessons，中间隔一道 fmt；且 `git diff` 有差异也返回 0，`&& echo` 只证明执行 | 管线固化 **gen → `pnpm fmt` → 断言**，幂等判据 `git diff --quiet <path>`（差异时退出 1）。实测 gen + fmt 后逐字节一致，口径写进 `scripts/gen-course.mjs` 头注释。**输出会被格式化工具加工的管线，等价验证必须放在格式化之后**。落地 `docs/00092` |
