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
| 批量用脚本给某批课「补第 N 题」后，`check-course` 报「题目概念引用有效 ✗ / 选项与答案索引有效 ✗」，诊断发现该课第 N 题 `text`/`options` 变 undefined、`answer` 位置是 explain 文本、`concept` 变 undefined | 追加题时该题干行**顶格（col 0）且行尾漏逗号**；JS 把 `q('题干'['选项数组'],…)` 解析成**字符串下标访问**（逗号表达式取最后一个元素），整个 `q(...)` 坍缩、字段整体左移 | 批量加题务必保证题干/选项/答案/explain/概念五行的**缩进一致（8 空格）且每行尾逗号齐全**；加完立刻跑覆盖审计 + `check-course`，别只跑一次就收工。诊断：写脚本遍历每课每题，标出 `!conceptIds.has(q.concept)` 或 `answer` 越界的题，再看其源码行是否顶格 |


通用自检脚本（接受数据模块与可选演练模块路径；课程数据层目录化后可直接传**目录**，脚本自动补 `index.ts`）：

```bash
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  app/data/effect-course app/lib/widgets.ts
```

退出码 0 = 全绿，1 = 有失败项，2 = 参数错误。脚本只读数据，不写文件。**注意**：它是通用数据校验，与项目自带的 `pnpm verify`（内容一致性 + 学情引擎全轨迹）是互补关系，两者都要跑。

**多课程时逐门跑**：`check-course.mjs` 是单门脚本，每加一门课就对它的 `*-course/` 目录单独跑一次（`rxjs-course` 同理传 `app/lib/widgets.ts`）。项目自带的 `pnpm verify` 已改为动态扫描 `app/data/*-course/` 目录全量跑，无需逐门改。

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
| `node --experimental-strip-types` 直接 import `courses.ts` 报 `ERR_MODULE_NOT_FOUND`（找不到 `./effect-course`） | Node 原生 ESM 不做扩展名推断，`import './effect-course'` 这种**省略扩展名的相对导入**在 Node 运行时解析不到；Nuxt/Vite 构建期能补全，Node 直跑不能 | 校验脚本**不要 import 走 `courses.ts`**（它内部有省略扩展名的运行时导入），改为直接扫描 `app/data/*-course/` 目录、按 `.../index.ts` **显式路径**逐个 import（目录内兄弟值导入也须显式 `.ts`，见 course-builder 的导入规范）；`app/lib/widgets.ts` 同理 |
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
