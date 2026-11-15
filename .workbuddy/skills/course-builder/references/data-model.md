# 内容数据契约与学情模型

以下结构可直接作为新课程的类型契约骨架。已验证参考实例：Effect 4.1.4 深度课（6 阶段 / 26 课 / 27 概念 / 59 题 / 11 演练）与 RxJS 7.8.2 深度课（6 阶段 / 26 课 / 28 概念 / 69 题 / 13 演练）。**这些数字是「按复杂度落出来的结果」，不是目标或下限**——新课的课时/概念/题数应随其内容动态浮动（见下文「数量动态化原则」），不要反向去凑这些整数。

## 分层原则

```
<topic>-course/            一门课一个目录，唯一内容源，不 import 任何视图
├── index.ts               唯一对外导出面：export const <TOPIC>_COURSE
├── stages.ts / concepts.ts / meta.ts / design.ts
├── lessons/
│   ├── index.ts           聚合 LESSONS
│   └── lNN.ts            一课时一文件
        │
        ├── course-builders.ts   跨课程共享构造器 L（正文为 md 串，不与单课耦合）
        ├── analytics.ts        纯计算，零 DOM；createAnalytics(course, storageKey) 工厂
        ├── widgets/            演练目录：index.ts 注册表 + dom.ts helper + effect/ + rxjs/，一演练一文件
        └── types/*.ts          共享类型契约
                │
          pages / components / composables  ← 只消费，不硬编码课时列表
```

新增课时 = 新建 `<topic>-course/lessons/lNN.ts` 并在 `lessons/index.ts` 与 `concepts.ts` 登记；地图、侧栏、测验、复习队列、诊断、教师报表全部自动接入。

## 文件组织（课程数据层目录化布局，标准实现）

一门课 = 一个同名目录，巨型单文件拆成章节文件；`index.ts` 是唯一对外导出面。

```
app/data/
├── courses.ts            # 注册表：import { TOPIC_COURSE } from './<topic>-course'（省略扩展名，不变）
├── course-builders.ts    # 共享构造器 L（正文为 md 串，跨课程复用，不与单课耦合）
└── <topic>-course/
├── index.ts          # export const TOPIC_COURSE = { STAGES, CONCEPTS, LESSONS, META, DESIGN }
├── stages.ts         # export const STAGES: Stage[]
├── concepts.ts       # export const CONCEPTS: Concept[]
├── modules.ts        # [仅 complex 模式] export const MODULES: Module[]（simple 课不建此文件）
├── meta.ts           # export const META: CourseMeta
├── design.ts         # export const DESIGN: CourseDesign
    └── lessons/
        ├── index.ts      # export const LESSONS: Lesson[] = [L01, …]
        └── lNN.ts        # 一课时一文件：export const LNN = L('LNN', …)
```

**导入规范（关键——保证 Nuxt 与 Node 校验脚本两侧都能加载）：**

| 导入位置 | 写法 | 原因 |
|---|---|---|
| 目录内兄弟**值**导入（`index.ts`→`stages.ts`、`lessons/index.ts`→`lNN.ts`、`lNN.ts`→`../../course-builders.ts`） | **显式 `.ts`**：`import { STAGES } from './stages.ts'` | Node `--experimental-strip-types` 要求显式扩展名；Nuxt `allowImportingTsExtensions` 放行 |
| 类型导入 | `import type { Lesson } from '~/types/course'`（type-only） | 运行时擦除，Node 不解析；两侧安全 |
| 外部消费方 `courses.ts` | `import { TOPIC_COURSE } from './<topic>-course'`（**省略扩展名，不变**） | 仅 Nuxt/Vite 浏览器侧用，自动解析到 `index.ts`；Node 侧不走这条路 |
| 校验脚本入口 | `import('…/<topic>-course/index.ts')`（**显式 `index.ts`**） | Node 侧显式路径 |

- 课时文件命名 `lNN.ts`（小写，对应课时 id `LNN`），符合 kebab-case。
- 巨型单文件已难维护（近 2000 行）；**新增课程直接按目录布局生成**，不要再生成巨型单文件。
- 校验脚本 `check-course.mjs` 支持传**目录**（自动补 `index.ts`）；`verify-course.mjs` 按 `*-course/` 目录动态发现课程。演练内核目录化后，`check-course.mjs` 第二参数传 `app/lib/widgets`（目录），`verify-course.mjs` 内部按 `app/lib/widgets/index.ts` 显式路径 import。
- **仓库级共享 vs 课程级**：`types`（`~/types/course`）与 `course-builders.ts`（构造器）是**仓库级、每个仓库只存一份**，所有课程共用；**新建课程只建课程级文件**（`index.ts` + 各章节 + `lessons/`），不要往课程目录里再拷 `types.ts` / `builders.ts`（各课各带一份会分叉、改签名要改 N 处）。skeleton 里自包含的 `types.ts` / `builders.ts` 只是**落地种子**：目标仓库尚无共享层时才把它们落成 `~/types/course` + `app/data/course-builders.ts`，**落一次**，之后每门课都复用这份共享层。

## 内容层契约

```ts
interface Stage   { id: number; name: string; en: string; summary: string; color: string; goal: string
                   // 复杂模式专属（simple 课不填）：
                   module?: number                                              // 所属模块 id
                   subStages?: Array<{ id: string; name: string; summary?: string }> }  // 阶段内子阶段分组（可选）
interface Module  { id: number; name: string; en: string; summary: string; color: string; goal: string }  // 复杂模式顶层分组维度，形状与 Stage 对齐
interface Concept { id: string; name: string; stage: number; weight: number; prereqs: string[] }
interface CourseMeta {
  version: string; verifiedAt: string; lts: string; docs: string
  release: string; playground: string; source: string; notes: string[]
}

type LessonKind =
  | 'theory'     // 理论 / 范式：机制与边界，代码只作印证
  | 'practice'   // 实战 / 实现：完整可跑实现 + 递进代码
  | 'framework'  // 框架对照：手写版 ↔ 框架版逐项对照
  | 'scenario'   // 专项 Agent：单一场景的落地实现
  | 'capstone'   // Capstone：端到端交付 + 可执行验收断言
  | 'overview'   // 导航 / 收束：整节职责就是导览，不写实现代码、不设题

interface QuizQuestion {
  text: string; options: string[]; answer: number; explain: string; concept: string
}
interface Lesson {
  id: string; stage: number; title: string; difficulty: number   // 无 minutes：用时按 md 体量现算
  prereqs: string[]; concepts: string[]; goals: string[]
  md: string; widget: string | null          // 正文 Markdown（00053 起取代 blocks）
  quiz: QuizQuestion[]; terms: string[][]; pitfalls: string[]
  subStage?: string | null     // 复杂模式专属：所属子阶段 id（如 '3.1'）；simple 或不归子阶段时缺省
  kind?: LessonKind            // 课时课型（见下）：用 withKind() 标注，不从阶段继承
  kindReason?: string          // kind: 'overview' 时必填，说明为何本节不需要实现代码
}
interface CourseData {
  STAGES: Stage[]; CONCEPTS: Concept[]; LESSONS: Lesson[]; META: CourseMeta
  DESIGN?: CourseDesign
  renderMode?: 'simple' | 'complex'   // 缺省 'simple'（既有课零改动）；'complex' 必须提供 MODULES 与 Stage.module
  MODULES?: Module[]                 // 复杂模式专属：课程顶层模块列表
}
```

> 上面的接口块即 `app/types/course.ts` 的形状（`~/types/course` 为单一源）；`CourseData.renderMode`/`MODULES` 与 `Stage.module`/`subStages`/`Lesson.subStage` 均为**可选**，simple 课不填。

### 课时用时（`minutes`）：不落数据，渲染时现算

`Lesson` **没有 `minutes` 字段**，`L()` 也没有这个形参。用时由 `lessonMinutes(lesson)` 按正文体量现算（宿主仓库 `app/lib/lesson-time.ts`），页面在需要的地方调用（如 `{{ lessonMinutes(l) }} min`）。单课约 0.02 ms，142 课全量约 4 ms。

- **为什么不存**：存下来就有两份真相（数字 vs 正文），正文一改数字不跟，就出现「写着 20 分钟、内容只够读 8 分钟」；而且得在**所有课时创建时**都算一遍，而这些课时大部分在本次访问里根本不会打开。
- **口径**：正文 1/320 分钟/**字符**（`proseChars`）、代码 1/200 分钟/字符、提示框 0.6/个、每题 1.2、每条术语 0.25、每条误区 0.5、每个交互演练 5；总时长 = 各项之和（下限 3 分钟）。`lessonTime()` 另返回分项占比，可解释「为什么是这个时长」。
- **正文字数 vs 字符数**：`proseWords` 是汉字数 + 英文词数（不含标点），`proseChars` 是字符数（含标点、段间空格、英文按字母），二者比值约 **1.58**。**闸门量字数**（按 theory / practice / framework / scenario / capstone / overview 依次 1200 / 1800 / 1500 / 1800 / 3000 / 400，防刷、可复核），**时长量字符数**（标点也占停顿；1/320 每字符 ≈ 200 汉字/分钟，是技术叙述的合理速度）。
- **下限是绝对量级，不随口径折算**：换度量方式只换 `contentStats` 的实现，不动阈值表。00054 曾按 1.58 把旧字符阈值折成 500/750/650/750/1250，数学等价但读数把门槛降了 37%，00055 已撤销并上浮 1.5×——写课的时候按 1200/1800 这样的量级准备正文，不要拿折算后的旧数字当目标。
- **「正文」含提示框内的字**：统计时只剥离代码，`:::deep / :::warn / :::tip` 容器**脱壳保留正文**——容器里的「框架对照」「注意事项」一样要读，不算会漏掉近一半阅读量。md 结构记号（标题 `#`、列表 bullet 与序号、表格管道 `|---|`、强调符）一律不计，链接只保留可见文字。口径由 `scripts/verify-content-stats.mjs`（`pnpm verify` 第三段）钉成断言，改坏了会直接失败。
- **写课时只管内容**：不估时间。内容薄，显示的时间自然就短——这正是想要的信号，也是体量闸门存在的理由。

### 课型（`kind`）：课程元数据，不是脚本配置

课型决定体量闸门（`scripts/content-gate.mjs`，`pnpm verify` 第四段）用哪一档正文 / 代码下限、是否允许 0 题，取值见上面的 `LessonKind`。

- **标在课时上**：每节课在自己的 `lNN.ts` 里用 `withKind(L(...), 'theory')` 标注，一个课时一个值，没有继承、没有优先级。`overview`（整节职责就是导览 / 收束）必须配 `kindReason`。
- **为什么不是阶段级**：课型回答「这一节该多厚」，判定单位本来就是课。阶段级默认会带来三笔代价：看单课文件看不出课型、要额外校验「阶段漏标 / 越权覆盖」、以及假设「阶段内 5 节课同课型」——而现实里阶段内确实会混（导览课就是阶段内的异类）。
- **闸门零配置读取**：判定式就是 `lesson.kind`，脚本里没有「阶段 → 课型」映射表，新增课程 / 新增阶段 / 重划阶段都不需要改脚本。
- **不标 = 不纳入**：整门课一节都没标 `kind`，闸门打印「未标注课型，跳过」（simple 课如 effect / rxjs）；但只要标了一节就得标全——漏标任一课、取值非法，直接判失败。
- **`overview` 课型护栏**：理由必填、每模块 ≤1 节、总量 ≤8%、Capstone 阶段禁用（阶段是否为 Capstone 区按阶段名 / `en` 识别）。
- `L()` 构造器不含 `kind` 形参，所以课时文件导出时包一层：`export const L01 = withKind(L(...), 'overview', '课程地图：全课导览')`。`withKind` 与 `L` 同在 `course-builders.ts`（仓库级共享），一起 import。

### 课型判定（00058 起为强制约束）

课型是**课时的身份**，不是「以后想写多厚」的愿望。判定只看「这节课的交付物是理解还是可运行物」，**不看当前正文字数**——体量是待办、课型是身份，用体量反推会把「还没重写」误判成「标错了」。

| 课型 | 判定条件 |
|---|---|
| `theory` | 交付**理解**：机制、为什么、辨析、选型。`goals` 用「理解 / 掌握 / 认识 / 区分 / 了解」 |
| `practice` | 交付**可运行物**：`goals` 至少一个实现类动词（实现 / 写出 / 搭 / 构建 / 跑通 / 调通 / 部署 / 编码 / 接入 / 从零 / 埋点 / 打通 / 串成 / 产出） |
| `framework` | 交付**对照结论**：手写版 vs 框架版双实现 + 差异度量 |
| `scenario` | 交付**某个真实场景的端到端系统**（编码 / 数据 / 研究 / GUI / 语音 / 生产运维） |
| `capstone` | 交付**完整项目**（含验收断言） |
| `overview` | 整节职责是**地图 / 全景 / 收束**，不产实现 |

`content-gate.mjs` 有两条硬校验，违反直接失败（不是警告）：

- **H1**：标题含「实战」→ 禁止 `theory` / `overview`（标题自己承诺了要动手）。
- **H2**：`kind === 'practice'` → `goals` 必须含实现类动词（否则是知识课冒充实战课，会把下限抬到 1800 字 + 1500 字符代码，诱导为了过闸门堆无关示例）。

判定顺序：先看标题与 goals 的**动词**，再看有没有「对照 / 场景 / Capstone」的结构特征，最后才考虑 overview（它有四道护栏，不能当逃生口）。改标后必须重跑 `--update-baseline`，因为下限随课型变化。


### 草稿管线（纯 Markdown → 课时 TS，00092 起 skill 资产）

大课（十几课以上）推荐「**纯 Markdown 草稿 → 生成器**」管线，从根因消除 `md` 模板串的四类手工转义坑
（裸反引号、`\'`、`\.`、`\[`、`${`、换行）：

- **草稿格式**（`<drafts-dir>/LNN.md`，`---` 包围 JSON frontmatter + markdown 正文）：

  | 字段 | 约束 |
  |---|---|
  | `id` | 必须匹配 `L\d{2}` |
  | `stage` / `title` / `difficulty` | 必填 |
  | `prereqs` | **课时 id**（如 `["L04"]`）且必须在本课之前——**不是概念 id**；概念级依赖写 `Concept.prereqs`。两表填反只有 verify 的「课时前置顺序」能拦住 |
  | `concepts` | 概念 id，至少 1 个 |
  | `goals` | 至少 2 条；kind=practice 时须含实现类动词（H2 硬校验） |
  | `kind` | 六值之一（见「课型判定」）；可用 `kindReason` 附判定理由 |
  | `quiz` | 至少 1 题（theory 不允许 0 题）；每题 `options ≥ 2`、`answer` 越界即拒、`concept` 必填 |
  | `terms` / `pitfalls` | 各至少 1 条 |

- **生成命令**（在仓库根执行，相对路径以 cwd 为基准；草稿与 out-dir 需满足 `<course>/lessons` 布局）：

  ```bash
  node --experimental-strip-types .workbuddy/skills/course-builder/scripts/gen-course.mjs \
    <drafts-dir> <course>/lessons [--check]
  ```

- **固定两步管线：gen → `pnpm fmt`**。生成器输出是紧凑格式，oxfmt 会把它展开为门禁格式；
  幂等性/等价性断言必须在 fmt **之后**用 `git diff --quiet <path>`（`git diff` 带差异时也返回 0，
  `&& echo` 会给出假阳性）。手动编辑生成的 `lNN.ts` 会在下次生成时被覆盖——改内容只改草稿再重生成。
- id 连续性、stage/concept 引用、前置 DAG、体量闸门**不在生成器里校验**：由 `verify-course.mjs`
  与 `content-gate.mjs` 统把关（生成器只保证草稿可解析、可生成）。

### 课程设计说明书（绑定课程的数据，非独立文件）

```ts
type DesignBlock =
  | { type: 'prose';   title?: string; text: string }
  | { type: 'list';    title?: string; items: string[] }
  | { type: 'callout'; tone: 'tip' | 'warn' | 'deep'; title: string; text: string }
  | { type: 'kv';      title?: string; rows: Array<{ k: string; v: string }> }
  | { type: 'table';   title?: string; columns: string[]; rows: string[][] }
  | { type: 'code';    title?: string; code: string; note?: string }
  | { type: 'lessons' }                               // 从 LESSONS 动态生成学习路径总表
interface DesignSection { id: string; title: string; intro?: string; blocks: DesignBlock[] }
interface CourseDesign  { title: string; summary: string; sections: DesignSection[] }
```

- 说明书是 `CourseData.DESIGN`，随内容层一起维护；由「教学设计」视图渲染，**不要写成独立的 Markdown / Nuxt Content 文件**（否则删除内容模块后说明书会悬空）。
- `type: 'lessons'` 区块不写死行：视图按 `LESSONS` + 概念名渲染学习路径总表，新增课时自动出现。
- 其他区块都是纯静态结构（`prose` / `list` / `callout` / `kv` / `table` / `code`），视图按 `type` 分发渲染。

**约束**

- `answer` 是 `options` 的 0-based 索引，必须落在范围内。
- `quiz[].concept` 必须存在于 `CONCEPTS`；这是学情归因能定位薄弱点的唯一依据。
- `lesson.prereqs` 指向的课时必须在数组中且**顺序更早**（保证 DAG 可线性学习）。
- `lesson.widget` 必须能在演练注册表中解析；允许 `null`。
- 每课 `md`（正文 Markdown，非空）/ `goals` / `pitfalls` / `terms` 非空。
- `META.version` 是唯一版本源，正文不得散落硬编码版本号。
- **数量动态化（禁止用固定个数约束生成）**：课时数、概念数、阶段数随知识复杂度浮动——铺垫阶段可少（如 3 课）、核心/难点阶段可多（如 5 课），「6 阶段 × 4 课 = 24 课」只是经验起点而非硬约束，**不得为凑整而拆碎知识点或硬塞课时**。题目数由**该课涉及知识点的完整性**驱动：先列出每个知识点要被讲透的**各个面向**（定义 / 语义、常见陷阱、选型对比、边界与例外、典型用法、易混淆点……），每个面向至少 1 题；同一知识点面向多时**可以有更多题**（哪怕一个知识点出 10 题来覆盖它的全部面向），面向少则题少——**换角度补题是常态手段，与难度高低、weight 大小无关**。禁止按 `difficulty` 一刀切定「每课 N 题」，也**不**把「题数 = 概念数」当成下限或上限，更**不**把同一个面向反复堆题。改题后必跑覆盖审计：该课每个知识点需覆盖的各面向都有题、全课程无「未被任何题覆盖」的知识点。

### 复杂模式（4 层结构）

simple 是 2 层（`Stage → Lesson`）；**complex 是 4 层**（`Module → Stage → SubStage → Lesson`），用于体量大的「系统课」（如 Agent 系统课：11 模块 / 28 阶段 / 部分阶段含子阶段 / 140+ 课）。complex 数据全部落在同一 `CourseData` 上，靠 `renderMode` 切换渲染分支，simple 课零改动。

```
MODULES (模块)          ← 课程顶层分组，渲染成模块手风琴 / 模块主轴雷达
  └─ Stage (阶段) .module = <module id>
       ├─ subStages? (子阶段，仅部分阶段用，如「范式全景」拆 3.1/3.2/3.3)
       │    └─ Lesson.subStage = <subStage id>     ← 子阶段下的课时
       └─ Lesson (无 subStage / subStage=null)      ← 该阶段直接挂的课时
```

**complex 专属契约（simple 课不填这些字段）**

- `CourseData.renderMode: 'complex'` + `CourseData.MODULES: Module[]`（非空数组）。`Module` 形状与 `Stage` 对齐（`id/name/en/summary/color/goal`），便于复用同一套渲染。
- 每个 `Stage` 必须有 `module?: number` 指向有效模块 id（`MODULES.some(m => m.id === stage.module)`）。
- `Stage.subStages?` 可选；一旦某阶段定义了 `subStages`，该阶段的**每一个课时必须显式声明 `subStage`**（`'3.1'` 之类）或 `null`（表示直接挂阶段、不属子阶段）。**不允许遗漏**——子阶段课与阶段直挂课靠 `lesson.subStage` 区分，缺失会被 verify 判为「子阶段归属无效」。
- `Lesson.subStage?: string | null`：simple 课缺省；complex 且该阶段有子阶段时必填（值 ∈ 该阶段 `subStages` 的 id，或 `null`）。

**`withSubStage` 聚合模式（关键坑：`L()` 构造器没有 subStage 字段）**

共享构造器 `L(id, stage, title, …)`（`course-builders.ts`）**不含 `subStage` 形参**，所以不能把子阶段写进课时文件。正确做法是在 `lessons/index.ts` 聚合时**逐个补**：

```ts
// lessons/index.ts（complex 课）
const L01 = withSubStage(L('L01', 3, …), '3.1')   // 第 3 阶段「范式全景」的子阶段 3.1
const L04 = withSubStage(L('L04', 3, …), '3.2')   // 同一阶段另一子阶段
const L05 = L('L05', 4, …)                         // 第 4 阶段无子阶段 → 不补，subStage 缺省
export const LESSONS: Lesson[] = [L01, L04, L05, …]
```

`withSubStage(l, id)` 是薄封装（返回 `{ ...l, subStage: id }`），把 `L()` 缺的字段在聚合层补齐——课时文件保持与 simple 完全相同的写法（仍 `import { L, … } from '../../course-builders.ts'`），只有 complex 课的 index.ts 多这一步。

**导入深度（关键坑）**：课时文件在 `<topic>-course/lessons/` 下，引用仓库共享构造器须 `../../course-builders.ts`（**两层**回 `app/data/`），不是 `../../../`。这是目录化布局的固有层级，与 simple 课一致。

**verify 的 complex 引用完整性校验**（`scripts/verify-course.mjs` 按 `renderMode === 'complex'` 分支自动执行）：

- `MODULES` 非空数组；
- 每个 `Stage.module` 落在 `MODULES` 的 id 集内；
- 每个 `Lesson.subStage` 落在其所属 `Stage.subStages` 的 id 集内（缺省 / `null` 放行）。

> verify 只校验上述**引用完整性**，**不约束每课题数**（题量是否讲透由「数量动态化」规则与覆盖审计负责）。complex 课的题量同样由知识点完整性驱动，不靠模块/子阶段数量定死。

## 数量动态化原则（贯穿各阶段）

生成课程时，以下数字一律由内容复杂度决定，**不得作为生成约束或验收目标**：

| 量 | 决定因素 | 反模式（禁止） |
|---|---|---|
| 阶段数 | 官方 learning spine 的深度 + 是否叠加「底层原理」层 | 为凑 6 阶段而硬拆或硬并 |
| 每阶段课时数 | 该阶段知识点的密度与难点（铺垫少、核心多） | 固定「每阶段 4 课 / 每课 2 题」 |
| 概念数 | 实际可独立归因的知识点数 | 为凑整数拆碎或合并概念 |
| 每课题目数 | 该课涉及**各知识点的要讲透面向**（定义 / 陷阱 / 选型 / 边界 / 易混淆…）是否全覆盖；单知识点面向多就多出题，面向少就少出题 | 按 `difficulty` / `weight` 定死题数、把「题数 = 概念数」当上下限、同一面向反复堆题 |

判断「讲没讲透」看的是**该课涉及的每个知识点是否都按它要讲透的面向被题目覆盖**（换角度补题是常态手段，对每个知识点一视同仁，不区分难易），而不是课时数或题目总数是否等于某个预设值。


## 多课程注册表

```ts
interface CourseEntry {
  slug: string; title: string; subtitle: string; description: string
  icon: string; color: string; tags: string[]
  status: 'available' | 'soon'
  storageKey: string      // 课程间学情隔离的关键
  data?: CourseData
}
```

路由 `/courses/[slug]/...` 由注册表驱动；`storageKey` 形如 `knowisle:effect-ts:v1`，带版本号以便未来迁移档案。complex 课也走同一 `CourseEntry.data`（`CourseData.renderMode: 'complex'` + `MODULES`），注册表本身无需改动，只是该课程的 `data` 多了模块字段。

## 学情状态结构

```ts
interface LearningState {
  version: number
  profile: { name: string; dailyGoal: number; startDate: string; theme: 'light' | 'dark' }
  lessons: Record<string, { visited: number; seconds: number; quiz: Record<string, QuizProgress>;
                            widgetDone: boolean; completedAt: number | null; lastVisited?: number }>
  concepts: Record<string, { stability: number; lastReview: number | null;
                             correct: number; wrong: number; reps: number }>
  attempts: Array<{ ts: number; lessonId: string; qIndex: number;
                    correct: boolean; concept: string; review: boolean }>
  sessions: Record<string, { seconds: number; quizzes: number; lessons: number }>
  reviewHistory: Array<{ ts: number; concept: string; correct: boolean }>
  lastActive: number
}
```

## 核心公式

**概念掌握度**（0–100，四项加权）

```
mastery = 100 × (0.30 × recent + 0.20 × accuracy + 0.25 × retention + 0.25 × exposure)
```

- `recent`：最近 5 次作答按时间衰减加权（无记录时退化为 `accuracy`）
- `accuracy`：`correct / total`
- `retention = exp(-daysSince / max(0.5, stability))`；从未复习记 0
- `exposure`：练习覆盖度（该题所属概念的作答次数归一化）

分档：`≥80 扎实` / `≥60 发展中` / `<60 薄弱`。阶段与总体掌握度按 `Concept.weight` 加权平均。

**记忆稳定性更新**（每次作答后）

```
答对：stability = min(90, stability × (1 + 0.8 × (1 - retention)) + 0.6)
答错：stability = max(0.5, stability × 0.55)
```

**复习队列**：已练习过（`total > 0`）且 `retention < 0.82` 的概念，按 retention 升序；`retention < 0.5` 标注「记忆明显衰退」。

**薄弱点归因**（`mastery < 68`，取前 6 条），按优先级给出原因与行动：

1. 前置概念掌握度 `< 70` → 「前置缺口」，回到前置课
2. `retention < 0.6` 且 `accuracy ≥ 0.65` → 「遗忘」，安排复习
3. `accuracy` 低 → 「理解偏差」，重做讲解与演练
4. `exposure` 低 → 「练习不足」，追加同概念题目

**推荐下一课**：按依赖顺序取首个未完成课时；若有复习队列到期，优先插入复习建议。

## 必测断言（引擎自检）

| 场景 | 期望 |
|---|---|
| 空状态 | 进度 0%、推荐首课、教师报表行数 = 课时数 |
| 完整轨迹 | 逐课访问/答题/演练/完成 → 进度 100%、掌握度 > 60、**正确率 = 按模拟轨迹自洽计算**（期望值由「每课对/错分布 × 各课题数」推得，不硬编码魔法数字——题目数动态浮动时仍能稳定通过）、报表行数不变 |
| 遗忘 | 把某概念 `lastReview` 回拨 30 天 → 进入复习队列 |
| 导出导入 | `overall(importState(exportState(s)))` 与原始一致 |
| 非法备份 | `importState('{"version":9}')` 抛错 |
| 多课程隔离 | 另一 `storageKey` 的引擎进度为 0 |

## 扩展机制

- 内容层新增课时不改任何视图或引擎代码。
- 课时质量标记：内容块/目标/题目/术语缺失时在「教学准备」页标「需修订」，由自检脚本驱动。
- 版本升级：改 `META` 与 `storageKey` 版本号；旧档案通过导入导出迁移，不做隐式数据迁移。
- 教师视图：教师报表按课时一行，含完成状态、停留时长、正确率、薄弱概念，供长期教学复盘。
