# 课程内容 / 数据迁移 / 学情引擎

源自交互式课程构建的实测踩坑；流程与数据契约见 `course-builder` skill，这里只记「出问题时怎么修」。

## 版本与内容

| 症状 | 根因 | 处理 |
|---|---|---|
| 课程正文里的 API 在最新版根本不存在 | 按记忆或旧博客规划，没查 npm dist-tags 与当前文档树 | 强制「先核实版本、再规划」：交叉 npm registry `latest` / `dist-tags`、官方发布公告、当前文档入口；把差异清单写进设计文档，正文只用 `META.version` 对应 API |
| 跨版本 API 混用（旧名与新名同时出现） | 边写边补资料 | 先抓全核心抽象再动笔；每课标注版本口径；版本信息只存 `META`，正文不散落硬编码版本号 |
| 迁移后内容丢失 | 手抄大体量数据（60KB+） | 写一次性脚本做机械转换（IIFE → ESM、全局变量 → 工厂闭包），转完做语法与首尾结构核对，再删脚本；**不要手抄** |
| 新增课时后地图 / 侧栏 / 报表没出现 | 视图层硬编码了课时列表 | 内容数据层做唯一内容源，视图只消费数据；新增课时 = 往 `LESSONS` 追加一项并在 `CONCEPTS` 登记 |
| 新增第二门课后，首页 / 侧栏 / hero 仍只显示第一门课的专属文案（如 Effect 的标语、导航项写死） | 共享视图层硬编码了第一门课的专属内容，第二门课注册进去后这些文案不会自动切换 | 课程专属文案必须**数据驱动**：hero 用 `course.tagline \|\| course.subtitle`、导航用 `availableCourses()` 遍历、正文用各课 `META` / `DESIGN`；任何写死某门课标题 / 标语的共享组件都是隐患，加第二门课时立刻暴露。新增课程后用 smoke 断言该课专属文案出现在自己的页面、不串到别的页 |
| 新增课程后 `pnpm verify` 仍只检查 Effect 一门 | verify 脚本把 `effect-course` 路径 / 变量名写死了 | verify 改为**动态扫描 `app/data/*-course/` 目录**（课程数据层已目录化，每门课一个目录、`index.ts` 为入口），对每个目录的 `index.ts` 跑结构 / 引用 / DESIGN / 学情引擎 / 隔离性检查，新课程目录放对位置即自动纳入，无需逐门改脚本 |

## 引用完整性

| 症状 | 根因 | 处理 |
|---|---|---|
| 测验归因定位不到薄弱点 | `quiz[].concept` 指向不存在的概念 ID | 用自检脚本做自动校验：阶段 / 概念 / 前置 / 题目概念 / widget 标识 / 答案索引，任何悬空引用都让脚本失败 |
| 答案索引越界 | `answer` 不在 `options` 的 0-based 范围内 | 自检断言 `Number.isInteger(answer) && answer >= 0 && answer < options.length` |
| 学习路径出现环或前置排在后面 | DAG 未校验 | 自检同时检查「课时前置顺序单调」「概念前置不跨到后续阶段」「两类依赖无环」 |
| 批量用脚本给某批课「补第 N 题」后，`check-course` 报「题目概念引用有效 ✗ / 选项与答案索引有效 ✗」，诊断发现该课第 N 题 `text`/`options` 变 undefined、`answer` 位置是 explain 文本、`concept` 变 undefined | 追加题时该题干行**顶格（col 0）且行尾漏逗号**；JS 把 `q('题目'['选项数组'],…)` 解析成**字符串下标访问**（逗号表达式取最后一个元素），整个 `q(...)` 坍缩、字段整体左移 | 批量加题务必保证题干/选项/答案/explain/概念五行的**缩进一致（8 空格）且每行尾逗号齐全**；加完立刻跑覆盖审计 + `check-course`，别只跑一次就收工。诊断：写脚本遍历每课每题，标出 `!conceptIds.has(q.concept)` 或 `answer` 越界的题，再看其源码行是否顶格 |
| 整课重写后 `pnpm verify` 报「课时概念引用有效 ✗ / 题目概念引用有效 ✗」；或预检查发现新写的 `concepts` 数组里有个 `concepts.ts` 里根本不存在的 id | 重写时**凭标题自造概念 id**（例如把已注册的 `version-lock` 写成 `dependency-lock`），且三道测验的 `quiz[].concept` 沿用了同一个错 id。`content-gate` 只查体量与课型，不查概念；只有 verify 会暴露 | 重写前先抄原骨架：`git show HEAD:app/data/<course>/lessons/lNN.ts \\| sed -n '5,16p'`，或先 `grep` 目标阶段在 `concepts.ts` 里的 id 列表；改 id 时 `concepts` 数组与**全部** `quiz[].concept` 一起改（`replace_all`）。若确实要新增概念，按 `docs/00075` 的做法在 `concepts.ts` 对应阶段段补注册后再引用。落地见 `docs/00075`（`mastra-obs`）、`docs/00082`（`version-lock`） |


通用自检脚本（接受课程数据模块与可选演练模块路径；**两个参数都可传目录**，脚本自动补 `index.ts`）：

```bash
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  app/data/effect-course app/lib/widgets
```

退出码 0 = 全绿，1 = 有失败项，2 = 参数错误。脚本只读数据，不写文件。**注意**：它是通用数据校验，与项目自带的 `pnpm verify`（内容一致性 + 学情引擎全轨迹）是互补关系，两者都要跑。

**多课程时逐门跑**：`check-course.mjs` 是单门脚本，每加一门课就对它的 `*-course/` 目录单独跑一次（`rxjs-course` 同理传 `app/lib/widgets`）。项目自带的 `pnpm verify` 已改为动态扫描 `app/data/*-course/` 目录全量跑，无需逐门改。

## 题目密度：覆盖驱动，不按难度一刀切

| 症状 | 根因 | 处理 |
|---|---|---|
| 高难度课 3 题全考同一个概念（「单概念堆题」），低难度课 2 题但漏了该课标注的某些概念 | 题目数按 `difficulty` 定死（如难度≥3 配 3 题），与知识点覆盖脱节 | **题目数由知识点覆盖驱动**：① 每课 `concepts` 里每个概念至少被 1 题覆盖（题数 ≥ 概念数）；② 再对 weight≥3 的重点概念补 1 道**换角度**题（陷阱/选型/语义对比），同概念不重复考。课时数同理随复杂度动态化（铺垫阶段少、核心阶段多），「6×4=24」只是经验起点。改题后必跑覆盖审计：每课 `concepts ⊆ 该课 quiz 概念集合`，全课程无未被任何题覆盖的概念 |
| `verify` 里硬编码「累计正确率 75%」在题目数变化后失败（74%） | 模拟轨迹的期望值是旧课时结构下的魔法数字 | 期望正确率**按模拟轨迹自洽计算**（`verify-course.mjs`：`i%4!==0` 全对/其余全错 → 期望 = round(对题/总题)），任何题目密度都稳 |

## 重编号技巧（课时 id 全局调整）

| 症状 | 根因 | 处理 |
|---|---|---|
| 逐课手工改 `L01…L24` → `L01…L26`，prereqs/DESIGN 引用改漏、改出环 | 多行手工替换易漏、易级联（先改 L04→L03 又撞上旧 L03） | **单次扫描映射**：写 JS 正则 `/L([0-2][0-9])/g`，对匹配项查 `{旧id→新id}` 映射表一次性替换（映射表里新 id 若与旧 id 重叠无碍，因单遍不回读新文本），50 处命中一次完成；随后跑 `check-course` 验 DAG 无环、prereqs 全有效，再往空出的 id 插入新课 |

## Node ESM 运行时导入

| 症状 | 根因 | 处理 |
|---|---|---|
| `node --experimental-strip-types` 直接 import `courses.ts` 报 `ERR_MODULE_NOT_FOUND`（找不到 `./effect-course`） | Node 原生 ESM 不做扩展名推断，`import './effect-course'` 这种**省略扩展名的相对导入**在 Node 运行时解析不到；Nuxt/Vite 构建期能补全，Node 直跑不能 | 校验脚本**不要 import 走 `courses.ts`**（它内部有省略扩展名的运行时导入），改为直接扫描 `app/data/*-course/` 目录、按 `.../index.ts` **显式路径**逐个 import（目录内兄弟值导入也须显式 `.ts`，见 course-builder 的导入规范）；`app/lib/widgets/index.ts` 同理 |
| 课程数据层改成目录（`effect-course/index.ts` + `stages.ts` 等）后，Node 直跑 import 目录报 `ERR_MODULE_NOT_FOUND`，或 `import './stages'` 找不到 | Node ESM **不解析目录 `index.ts`、也不补相对导入扩展名**；把 `effect-course.ts` 拆成目录后，旧脚本若仍按文件路径 / 省略扩展名 import 就失效 | 目录化后：① 校验脚本入口显式 import `.../index.ts`（Node 不解目录 index）；② 目录内兄弟**值**导入一律显式 `.ts`（`./stages.ts`），靠 Nuxt `allowImportingTsExtensions` + Node strip-types 两侧放行；③ `verify-course.mjs` 发现逻辑由 `filter(f=>f.endsWith('-course.ts'))` 改为「扫 `*-course` 目录 + import 其 `index.ts`」；④ 外部 `courses.ts` 仍用省略扩展名 `./effect-course`（仅 Nuxt 侧，自动解析到 index.ts）。落地见 `docs/00027` |

## 类型收窄（composable 层）

| 症状 | 根因 | 处理 |
|---|---|---|
| `useRequiredCourse()` 返回的 `course.value` 类型是 `ComputedRef<CourseEntry \| undefined>`，页面里 `learning.stateOf(course.value)` 报「类型 `CourseEntry \| undefined` 不能赋给类型 `CourseEntry`」 | `useRequiredCourse` 内部虽已 404 拦截，但返回类型仍是 `useCourse()` 的原始类型（未收窄），消费侧必须逐处 `!` 断言或 `if (course.value)` 兜底，极易遗漏 | 在 composable 层收窄：加 `RequiredCourseContext = ReturnType<typeof useCourse> & { course: ComputedRef<CourseEntry>; data: ComputedRef<EffectCourseData> }` 作为显式返回类型，内部用**类型守卫函数** `isCourseReady(ctx): ctx is RequiredCourseContext` 做 404 拦截 + 收窄，**不用 `as` 断言**（`as` 宽→窄会触发 `no-unsafe-type-assertion` warning）；所有消费页面自动受益，模板里的 `course!` 非空断言也可去掉 |


## 学情引擎

| 症状 | 根因 | 处理 |
|---|---|---|
| 导出导入后档案不一致 | `importState` 没校验版本 / 没做深拷贝 | `importState` 校验版本字段并拒绝非法备份；断言 `overall(importState(exportState(s)))` 与原始一致 |
| 30 天未复习的概念没进复习队列 | 遗忘公式或阈值写错 | `retention = exp(-Δt / max(0.5, stability))`，队列取 `total > 0 && retention < 0.82`，按 retention 升序 |
| 另一门课的进度被串改 | 全局课程对象 / 固定 storage key | 工厂闭包捕获 `course` 与 `storageKey`，并断言另一 key 的引擎进度为 0 |
| 教师报表行数忽多忽少 | 报表遍历了运行时动态集合 | 断言报表行数恒等于课时数 |

## 演练

| 症状 | 根因 | 处理 |
|---|---|---|
| 所有 widget 标识都能解析，但切课后定时器还在跑 | 只验了映射、没验生命周期 | 每个演练返回 `cleanup()` 回收定时器 / 监听 / RAF；宿主 `onMounted` 挂载、`onBeforeUnmount` 清理 |
| 用户把演练当成真实运行时 | 没标注边界 | 明确写「原理模拟」，真实代码指向官方 Playground |
| 演练内核 `widgets.ts` 拆成 `widgets/` 目录后，`check-course.mjs` 报 `ERR_MODULE_NOT_FOUND`，或文档命令仍传 `app/lib/widgets.ts` | Node ESM 不解析目录 index；旧单文件删除后原路径直接失效 | ① `check-course.mjs` 第二参数传**目录** `app/lib/widgets`（其 `load()` 自动补 `index.ts`）；② `verify-course.mjs` 显式 import `app/lib/widgets/index.ts`；③ 目录内兄弟**值**导入显式 `.ts`；④ Nuxt 消费方 `~/lib/widgets` 省略扩展名不变，由 Vite 解析目录 index。拆分后同步校正根 README / 课程 `design.ts` 正文 / 宿主组件注释 / skill 文档中的路径与演练数量（11 → 24），落地见 `docs/00035`、`docs/00036` |

## 正文渲染（Markdown-in-TS 容器）

| 症状 | 根因 | 处理 |
|---|---|---|
| 课时正文写在 `:::deep/warn/tip` 容器里的表格显示成一长串竖线 `\|`，列表挤成一段 | `app/lib/markdown.ts` 的 `callout_open` 用 `renderInline` 输出容器正文——只解行内语法，表格 / 列表 / 多段落 / 围栏全部被压平；另外拆行时 `.filter(l => l.trim() !== '')` 把段间空行也吃了，多段落本来就无法分块 | 两处一起改：① 正文改 `mdInstance.render(normalizeFenceInfo(body))`；② 只去首尾空行、保留中间空行；③ 补 `.callout p + p / ul / table` 间距样式。防回归：`scripts/verify-content-stats.mjs` 第三段有 5 条断言（表格 / 无序 / 有序 / 多段落 / 真实课程扫描）。落地见 `docs/00062` |
| 改课时后 `npx tsx scripts/content-gate.mjs` 或渲染抽查报 `TransformError: Expected ")" but found "<某个正文词>"`，行号指向某句**自然语言正文**而非代码 | `Lesson.md` 是模板字符串，正文里写的行内代码 `` `refs` `` 用了裸反引号——它直接结束模板串，之后的中文被当 JS 解析。与 00058 的 fence info-string 反引号是**同类不同位置**：那个在 ` ```ts title="…` 里，这个在正文句子里 | 模板串内**任何**行内代码一律写 `` \`x\` ``（含正文、goals 之外的说明文字）。排查技巧：报错列号往往落在中文串中间，正常情况下中文不会出现在 JS 表达式里，看到 `Expected ")" but found "中文"` 就该直接搜该行有没有裸反引号。落地见 `docs/00067`（L68） |
| `pnpm lint` / `typecheck` 报 `no-useless-escape: Unnecessary escape character 'd'`，行号落在 `lessons/lNN.ts` 的**代码块内**；或课程页面里正则显示成 `\b1[3-9]d{9}\b`（`\b` 变成退格、`\d` 变成 `d`） | 同一根因的另一面：代码块也是模板串的一部分，代码里的 `\d` `\b` `\s` `\w` `\n` `\t` 会被 JS 当**字符串转义**处理。`\d`→`d`、`\b`→退格符、`\n`→真实换行（后者 lint 不报，只静默破坏渲染） | 模板串内代码块里的**每个**反斜杠都要双写：`/\\d+/`、`'a\\nb'`。检查脚本 `tmp-escape.mjs`（扫 `(?<!\\)\\[dbswnt]`）。**该脚本在 2026-11-15 全量扫出 5 处历史遗留**（`l47` 的 `` `OK\n…` `` 行内代码、`l82` 的 `join('\n')` 与 `SYS + '\n\n'`），均已修为双反斜杠并复查渲染。落地见 `docs/00074`（L102） |
| 课程页面代码块里的 JS 字符串显示成 `'status = 'PAID''`（内层引号成对塌陷、代码不可编译），但 **esbuild / lint / typecheck / 双扫描全部不报错** | 第三种模板串转义：源码里为在单引号字符串内放单引号写了 `\'`，而 `\'` 在 TS 模板串里是**合法转义**、直接输出 `'`，反斜杠被吞掉。`tmp-backtick.mjs` 只查反引号、`tmp-escape.mjs` 只查 `\\[dbswnt]`，都不覆盖 `\'` | 代码块里**不要在单引号字符串内用 `\\'`**：外层改双引号（`"status = 'PAID'"`）最省事；确需保留则写 `\\\\'`（模板串输出 `\\'`）。写完用 `npx tsx -e "import('./app/data/agent-course/lessons/lNN.ts').then(m=>console.log(m.LNN.md.split('\\\\n').filter(l=>/关键字/.test(l)).join('\\\\n')))"` **打印渲染后的 md 文本**核对代码块是否仍是合法代码——统计脚本只看块数，看不出块内字符被吞。落地见 `docs/00079`（L117） |
| 课程代码块里的正则 `/\.run\(\s*parsed/` 渲染成 `/.run(s*parsed/`，正则完全失效；`tmp-escape.mjs` 只报了 `\s`，lint / typecheck / 双扫描都没拦住 | `\.` `\(` `\)` `\{` 这类反斜杠同样被模板串吞掉（JS 无效转义直接输出后面的字符），但扫描脚本的正则是 `(?<!\\)\\[dbswnt]`，**只覆盖六个字符**；代码块里只要写正则，几乎必然带上这些漏网字符 | 课程代码块**尽量不写正则**，改用 `text.includes('.run(parsed')` / `startsWith` 之类无反斜杠判断；确需保留则每个反斜杠双写。补一次全量扫描：截取 md 模板串区间，逐行找后面不是 反引号 / 反斜杠 / `$` / `{` 的单反斜杠（本批用一条 `node -e` 内联脚本做了，结果干净）。落地见 `docs/00085`（L129） |

## 跨课接口一致性（Capstone 链）

| 症状 | 根因 | 处理 |
|---|---|---|
| 下游课初稿调用 `gatewayLevelOf()`、`Executor.runReadOnly()`，但上游 L129 根本没有这两个方法；正文还写着「本课只消费上游接口，一行不改」 | 写下游课时凭「听起来应该有」补方法名，没把上游文件的公开接口原文摊开对照。Capstone 六课是链，凭空接口会让整条链断裂；而代码块只是文本、不参与编译，`content-gate` / lint / typecheck 全都查不出来 | 动笔前先 `grep -n "export \|  [a-zA-Z]*("` 上游课文件，列出真实 `export` 与公开方法；正文里写一张**接缝表**（上游交付 / 本课用法 / 不允许改什么），下游只调用表内方法。常量表与上游注册容易漂移时加启动自检（如 `assertLevelTableMatchesGateway()` 比对网关 `describe()` 与常量表），既修 bug 又变成可讲的内容。落地见 `docs/00085`（L130） |
| Capstone 类课初稿代码一次过线（9433–10852 字符），正文却只有 2868 / 2825 字、低于 3000，且因在 baseline 豁免名单里 `content-gate` 只提示「已达标但仍列在豁免名单」不报红 | 长代码块会给人一种「内容够了」的错觉，但 `proseWords` 不统计代码；豁免名单里的课 gate 不施加下限断言 | 补的方向不是继续堆示例，而是补 **接缝表 / 不变量表 / 一次完整运行的事件表 / 采样分层口径** 这类把代码之间约束讲清楚的正文。写完固定跑 `--only=LNN --verbose` 看 raw 与余量（>50）。落地见 `docs/00085`（L130、L131） |

## 收官段：范围对齐、默认关闭补丁与结构自检（L139–L142）

| 症状 | 根因 | 处理 |
|---|---|---|
| Markdown 表格里为显示 `[number, number]` 写成 `\[number, number\]`，页面渲染丢反斜杠且代码块里的同类写法直接失效；`tmp-escape.mjs` 不报，lint / typecheck 也不报 | 第四种模板串转义坑的变体：`\[` 是 JS 无效转义，反斜杠被吞掉；`tmp-escape.mjs` 的正则只覆盖 `[dbswnt]` 六个字符 | 表格里一律用行内代码包裹（写 `` \`[number, number]\` ``），不在正文写转义方括号。补跑**修正版全量单反斜杠扫描**：逐字符扫模板串，遇到反斜杠后若跟反斜杠 / 反引号 / `$` 就跳过两个字符，否则记为异常；这个「跳过两个」的规则很关键，否则合法双写 `\\n` 的第二个反斜杠会被误报。落地见 `docs/00087`（L137） |
| 发布流水线把整份 `html`（含文末参考文献区）回喂 `assertNoRenderBypass()`，闸门天天报「render-only sentence」，很快被人关掉 | 参考文献区里的原文片段本来就不该被当成「正文事实句」；断言检查的是**正文事实**，喂进去的却混了非正文内容，语义范围与数据范围不对齐 | 给渲染结果拆出 `bodyHtml`（只含章节正文），`createReportService()` 与测试统一喂 `stripTags(rendered.bodyHtml)`；`html` 仍用于导出与锚点检查。通用规则：**回喂闸门前先问「这段数据是不是断言要管的那部分」**，范围不对齐会让正确实现被误判，误判比漏判更容易导致闸门被下线。落地见 `docs/00088`（L141） |
| 后段课的 `segmentedSynthesize()` 需要上游 `synthesize()` 支持全局编号映射，但上游 L138 已达标、正文与断言都锁死了当前行为 | 直接改上游签名会破坏已达标课的语义与它自己的验收断言；重新写一套合成又会制造第二份真相 | 用**默认关闭的可选参数**补上游：`numberById?: Map<string, number>`，不传时行为逐字不变，只在下游分段合成时传入。正文与坑库都要写明「补丁默认关闭」，让后续课知道旧路径仍有效。落地见 `docs/00087` / `docs/00088`（L138 → L140） |
| 结构自检课写「A/B 两支禁止互相依赖」时，把收束课自己也判成错误；或放宽例外后，B 分支某课偷偷依赖 A 分支却无人发现 | 凭直觉写规则，没先用真实数据跑一遍不变量；且例外只写了「可以不做」，没写「必须做成什么样」 | 动笔前用 `node --experimental-strip-types -e` 直接 import `AGENT_COURSE` 实测：概念图 / 课时图成环情况、悬空引用、课号连续性、overview 分布、跨分叉引用。实测发现唯一跨分叉引用正是 L142 自己（`prereqs = L134 + L141`）。规则写成三段：支内可依赖、跨支禁止、**收束课必须同时连住两支末端**；测试从两侧各测一次（注入跨支引用 / 砍掉一侧前置）。**一条规则若有例外，两侧都要有断言**。落地见 `docs/00088`（L142） |
| 课程代码块的验收断言里写死 `assert.equal(r.stats.lessons, 142)`，新增一节课后测试自己先挂 | 把「当前快照」当成「结构不变量」，测试依赖了会随时间变化的数字 | 断言改为 `AGENT_COURSE.LESSONS.length` / `AGENT_COURSE.CONCEPTS.length`，规模快照只进报表不参与判定；正文里写死的数字标注「只作本次记录，断言不依赖它」。与 00054 删 `minutes` 同源：**别让会变的数字变成第二份真相**。落地见 `docs/00088`（L142） |
| 收官最后一课初稿正文 2835/3000，因仍在 baseline 豁免名单里 `content-gate` 只提示「已达标但仍列在豁免名单」、显示「✅ 体量闸门通过」 | 豁免名单里的课 gate 不施加下限断言，长代码块（7560 字符）又给人「内容够了」的错觉 | 补实质节而不是堆示例：本例补「交付之后：把一次验收变成可回归的资产」表（交付物 / 落盘记录 / 下一次怎么验）与 L142 交接说明，正文到 3412。**gate 绿 ≠ 达标，收官批次也要手动跑 `--only=LNN --verbose` 看 raw 与余量。** 落地见 `docs/00088`（L141） |

> **临时脚本已清理（Wave 1 收官）**：收官提交时删除了项目根目录的 `tmp-backtick.mjs` / `tmp-escape.mjs` / `tmp-fix-backtick.mjs` / `tmp-sample.mjs`，以及 `.wrangler/tmp` 下 68 个 Wrangler bundle 缓存。上文对这些脚本的引用是**历史做法记录**，不是可执行指引；142 课已全部达标，无需再跑批量扫描。若后续新增课程要复现，用一次性 `node -e` 内联脚本（逻辑见各条目），或把脚本正式落到 `scripts/` 并纳入门禁。

## 整门课全量重建：闸门接入、API 白名单与生成器（00089 Effect）

| 症状 | 根因 | 处理 |
|---|---|---|
| 给一门此前没有 `Lesson.kind` 的课一次性标完课型，`pnpm verify` 立刻变红（26 课全部不达标） | 标注的瞬间整门课被 `content-gate` 纳入体量闸门，旧正文远低于绝对下限 | Step 0 **同时**写 `baseline.<course> = ["L01"…"L26"]` 全量豁免，标完 `verify` 仍为 0；每批重写后 `--update-baseline` 自动收缩（00089 实测 `26 → 4 → 0`），收官必须清零。豁免是接入手段不是降档，闸门阈值表不动 |
| 重写课程时按记忆写出 `Effect.async` / `runSyncExit` / `Effect.retry(call,{times,while,schedule})` / `Schedule.fixed("1 second",5)` / `catchAll`，发布后代码跑不起来 | 站点 `node_modules` 未安装目标库（`effect`），无法本地 import 核验；凭跨版本印象写 API，新版签名已变 | 从**原课程正文** `.md` 里用正则提取 `Effect.xxx` 形状的 API 名，排序去重成已验证白名单（00089 原文 85 个），新正文只沿用这些形状；差异里只剩 `Exit.Exit<...>` / `Stream.Stream<...>` 这类**类型别名**才算安全。旧名 `catchAll` 全量换 `Effect.catch`，自造签名换成已验证组合（如 `Schedule.compose(Schedule.recurs(3), Schedule.exponential("100 millis"))`）；拿不准的具体签名写成注释，不进代码块。**版本锁定的课程不能靠记忆写 API，原文白名单比模糊记忆可信** |
| 整门课重写反复撞模板串转义坑（裸反引号、`\'`、`\.` `\(` `\s`、`\[`、`\n` 变真换行），双扫描还要人眼兜底 | `Lesson.md` 是 TS 模板字符串，正文里的反斜杠 / 反引号 / `${` 全要手工转义，手写 26 课必然漏 | 改为**纯 Markdown 草稿 → 一次性生成脚本**：草稿写 `.md`，脚本先双写反斜杠、转义反引号与 `${`，再序列化 `quiz / terms / pitfalls`；结构化字段直接从当前课时模块读出，避免自造概念 id，最后写出 `lNN.ts`。四类转义坑从根因消除，抽查改为验证「生成结果 + 渲染结果」。**补写草稿后必须重新 apply**，否则 TS 仍是旧版（00089 L17 只改草稿，余量仍 +26，重新生成后才 +187） |
| `--only=L01 --verbose` 输出里同一课号出现两行、拿错行下结论 | 多门课都用 `LNN` 编号，`--only` 是全局匹配 | 跨课程同名时改用全量 `content-gate` + 自建逐课检查器分辨，别靠单行 verbose 输出判达标 |
| 示例代码块字符数达标，但状态迁移根本没闭合：`range()` cursor 每批重置导致重复生产、成功路径子任务没标 done、快照签名凭空造、检查顺序把浮动版本误报成未锁定 | 长代码块只是文本、不参与编译，gate / lint / typecheck 都看不出；只看字符数会漏掉逻辑错 | 每课末尾补一段**可失败断言**把状态变化完整走一遍（前后状态 `deepEqual`、负例测冲突 / 浮动版本 / 重复生产），再跑渲染抽查；正文「验收清单」要与代码块断言一一对应 |
| 方案里给某课标 overview，复核时站不住 | 课型是身份不是字数：交付物是「搭最小工程 + 跑通第一次运行」且正文已含代码，overview 免实现代码不成立 | 按 00058「看交付物」逐节复核；simple 课程 `STAGES` 无 `module`，多节 overview 还会全部挤进 `undefined` 组触发护栏误判。00089 最终 0 节 overview，并把口径修正写进**新**任务 overview，不改历史记录 |

## 第二门简单课程全量重建：版本口径、时序代码块与生成器复用（00090 RxJS）

| 症状 | 根因 | 处理 |
|---|---|---|
| 版本锁在 `rxjs@7.8.2` 的课程，原稿正文里同时出现 `empty()` / `never()` / `publish().refCount()` / `share({ refCount })` / `retryWhen` 等 6.x 与已弃用写法；照抄原文示例写进新代码块，发布后代码跑不起来 | 原稿是「历史对照 + 当时可用写法」混排，`META.version` 锁的是当前主线，原文并未按版本分层；只做「沿用原文 API 白名单」会把旧版示例一起沿用 | 白名单用来**排除自造名**，版本口径按 `META.notes` + `DESIGN` 的「已核对的 7.x 事实」校准：`retryWhen` → `retry({ count, delay })`，`throwIfEmpty("...")` → error 工厂函数，`EMPTY()` / `NEVER()` → 常量，`publish` / `multicast` / `share({ refCount })` 只留在「6.x 历史对照」正文表里、代码块只用 `share()` / `shareReplay({ bufferSize, refCount })`，导入按 `rxjs` / `rxjs/operators` / `rxjs/testing` 三处分组，不混 9.0-beta 的统一导入口径。**版本锁定课程要先定版本再定白名单，不能反过来** |
| 比对重构前后的 import 名，发现多了 3 个操作符（`subscribeOn` / `observeOn` / `withLatestFrom`），无法判断是不是自造；扫「旧写法」时 `flatMap(` 又命中 1 处，像是有 6.x 残留 | 只按「名字有没有在旧 import 里」或「字符串命没命中」判，没看正文语境。原文讲解段用过但 import 未列全的名字是合法的；`Array.prototype.flatMap` 与 RxJS 操作符同名，纯字符串扫描必然误报 | 新增名逐个回原文核对：三者分别出现在「三种常见调度器」「subscribeOn vs observeOn」「四种组合」段落，属原文已验证语义、只是 import 漏列，可显式补 import。旧写法扫描结果要**逐处看上下文**：`flatMap(` 是 L08 代码块里 JS 数组方法，不是 RxJS 操作符；`empty()` / `never()` / `publish(` / `share({ refCount` 的命中全部落在历史对照表或 callout 文本，代码块调用数为 0。结论口径写成「代码块调用 0 处 + 命中位置说明」，不写「全文 0 命中」这种会被反例推翻的话 |
| marble、有界并发、背压、Subject 重放这类**时序**代码块字符数达标，但断言跑不通或状态迁移不闭合：`flatten` 的 merge 分支只是排序不是交错、`MiniSubject` complete 不通知听众、`fixedWindowDebounce` 负例期望值写错、分批 cursor 每轮重置导致生产重复、`buggyBatch()` 丢值 | 时序语义错在「值到达的相对时刻」与「状态是否持久化」，代码块只是文本、不参与编译，gate / lint / typecheck 全查不出；只看 `codeChars` 更会给人「够了」的错觉 | 每课写**可失败断言 + 明确负例**把时间序列走一遍：marble 解析器要支持同帧分组（`--ab\|` 三事件共享帧）并配 `naiveParse` 负例；有界并发 `runBounded()` 持久化 `pending` 队列、断言 `peak === limit` 且「不丢不重」；背压用 `assert.deepEqual(r.flat, producer)` 验展平不变量；Subject 用 `Map` 保存 complete 回调并实际触发；错误期望值改成实测值 `["a","c","d"]`。**时序课的正确性判据是断言，不是代码块长度** |
| 00089 的生成器要复用到第二门课，`check` 里动态 import 相对路径不稳定；三门课都用 `LNN` 编号后 `--only=L01` 输出三行 | 复用脚本时保留了上一门课的假设（工作目录、单门课），没按「同名课号已存在」重新设计检查入口 | `check` 用 `pathToFileURL(path.join(ROOT, 'app', 'lib', ...)).href` 绝对路径 import，且**只 import 目标单门课程模块**，不遍历全部课程；草稿目录与原稿备份目录分离（先归档再清空，避免 `Write` 报「File has not been read yet」）；`META` 集中维护 `kind/goals`，其余结构化字段从当前课时模块读出。收官判达标以**全量 `content-gate`** 为准，自建 `check` 只用于逐课看 raw / 余量 / 渲染 |
| 收官文档结果段写了「一次性生成器、草稿、原稿备份已在收尾清理，不入库」，但打断时这些临时产物仍在工作区，`git status` 里还有 3 个 `?? tmp-*` | 先回填结果、后做清理，文档把「计划做的动作」写成了「已完成的事实」 | **收官顺序固定为「清理 → 复核 `git status` → 回填结果段」**；若已先写文档，必须在回填后立刻清理并再核一次，使事实一致。当前任务记录未提交前是**活文档**，可直接校正；已落盘的历史任务记录按约定不改写、不追加、不标注，只在新建记录里说明口径变化。另：`pnpm build` + `wrangler dev` 会重新生成 `.wrangler/tmp`（本次 13M），收官连它一起清，保留 `.wrangler/deploy` 与 `state` |
| 收官复跑 `node --experimental-strip-types scripts/check-course.mjs app/data/rxjs-course app/lib/widgets` 报 `Error: Cannot find module '.../scripts/check-course.mjs'`（`requireStack: []`），但 `pnpm verify` / `content-gate` 全绿 | 脚本**不在**项目根 `scripts/`（那里只有 `verify-course.mjs` / `content-gate.mjs` 等），它是项目级 skill `course-builder` 自带资产，路径为 `.workbuddy/skills/course-builder/scripts/check-course.mjs`；任务记录里只写「脚本名 + 参数」的简写，复跑时凭习惯补了 `scripts/` 前缀。`requireStack: []` 说明入口文件就没解析到，与课程数据引用无关 | 用 `AGENTS.md` §2 的**现行完整命令**：`node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs app/data/rxjs-course app/lib/widgets`，两个参数都传**目录**（`load()` 自动补 `index.ts`）。2026-11-15 实测 exit=0，13 种 widget 映射 / 前置 DAG / DESIGN 全通过。**文档里的简写命令复跑前先查 AGENTS.md 的完整路径，不要按文件名猜目录**；同类症状还有「命令仍指向已删除的 `widgets.ts`」，两者都在 `AGENTS.md` §2 有现行口径 |
