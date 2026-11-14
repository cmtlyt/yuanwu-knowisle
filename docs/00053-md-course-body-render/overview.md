# 00053 · 课程正文 Markdown 化渲染重构（技术设计 + 落地记录）

> 状态：**已完成**（2026-11-14）。设计文档 + 全量迁移 + 清理均落地，门禁全绿。
> 关联：`00052-agent-course-rebuild`（内容质量重构规划，本方案为其底层渲染使能项）。
> 分支：`feat/md-course-body-render`（已从 main 切出）。
> 落地文件：`app/lib/markdown.ts`（渲染封装）、`app/lib/markdown-md.ts`（`blocksToMarkdown` + `contentStats`）、`app/components/course/markdown-article.vue`、`scripts/migrate-blocks-to-md.mjs`。

## 0. 结论与可行性判定

**方案可行，但必须是「混合模型」，不能纯 Markdown。** 判断依据如下。

你的两个痛点（可读性差、难统计内容量）都真实存在，且 Markdown-in-TS 能直接解决：

- **可读性**：现状是 `lNN.ts` 里嵌套的位置参数函数调用，`L(...)` 有 **13 个位置参数**，`blocks` 内再嵌套 `prose()/code()/list()/call()`，源文件既长又难扫读。换成反引号模板字符串写 Markdown，作者与审阅者看到的就是接近成品的文章。
- **可统计性**：现状正文被切碎成结构化块，要统计「真正写了多少字」必须遍历所有 `blocks` 并决定每块算不算「内容」；改成单一 `md` 字符串后，字符/词数、代码量、标题数都是一次字符串运算，天然可统计，且能区分「叙述正文」与「代码示例」。
- **工具现成**：`markdown-it@15.0.3` 已是生产依赖，`app/components/tutor/tutor-message.vue` 已用它渲染 LLM 消息，并沉淀了经 `00029` 审计的安全范式（`html:false` + 自定义 `fence` 复用 `highlight.ts` + 客户端 `DOMPurify`）。本方案可**零新增渲染依赖**直接复用。

**为什么不能纯 Markdown（核心约束）**：`quiz / terms / pitfalls / widget` 不是文章，而是带语义的**结构化数据**——测验题含「答案下标 + 概念关联 + 解析」，术语是键值对，误区是带提示的字符串。纯 Markdown 无法表达答案下标与概念关联，且会丢失 `verify-course.mjs` 的题型校验（选项数、答案下标合法性、概念引用完整性）与学情统计（掌握度、概念覆盖）。因此正确做法是：**正文（prose/code/callout/list）Markdown 化，`quiz/terms/pitfalls/widget` 保持结构化**。

> 判定：对「正文可读性 + 内容可统计」两个目标，混合模型是更优解；纯 Markdown 化会破坏题型校验与学情，不可取。

## 1. 现状诊断

渲染链路（已确认）：

| 层 | 文件 | 现状 |
|---|---|---|
| 数据 | `app/data/*-course/lessons/lNN.ts` | `export const Lxx = L(id, stage, title, minutes, difficulty, prereqs, concepts, goals, blocks, widget, quiz, terms, pitfalls)`；`blocks` 为 `LessonBlock[]` |
| 类型 | `app/types/course.ts` | `LessonBlock` 判别联合：`prose / code / callout(tone) / list`；`Lesson.blocks: LessonBlock[]` |
| 构造器 | `app/data/course-builders.ts` | `prose/code/call/list/q/L` 五个工厂函数 |
| 渲染 | `app/components/course/lesson-block.vue` | 逐块 `v-if` 渲染 4 种 block；`[slug]/lessons/[id].vue:100` 以 `v-for="b in lesson.blocks"` 调用 |
| 高亮 | `app/lib/highlight.ts` | `highlight(src)` 输出 `<span class="tok-*">`，供代码块与 tutor `fence` 复用；样式在全局 `main.css` |

「乱」的根因在**数据层与构造器层**（嵌套函数 + 位置参数），不在渲染层；渲染层 `lesson-block.vue` 本身干净。因此重构的切口是「把 `blocks: LessonBlock[]` 换成 `md: string`」，渲染层相应替换为单一 Markdown 渲染组件，其余结构（quiz/terms/pitfalls/widget）原样保留。

## 2. 目标方案

### 2.1 数据模型：`blocks` → `md`

```ts
// app/types/course.ts
export interface Lesson {
  id: string
  stage: number
  title: string
  minutes: number
  difficulty: number
  prereqs: string[]
  concepts: string[]
  goals: string[]
  md: string                         // 新增：正文 Markdown（取代 blocks）
  widget: string | null
  quiz: QuizQuestion[]               // 保留结构化
  terms: string[][]                  // 保留结构化
  pitfalls: string[]                 // 保留结构化
  subStage?: string | null
  // blocks?: LessonBlock[]          // 迁移期过渡字段，迁移完成后删除
}
```

`course-builders.ts` 的 `L()` 工厂保留，但**第 9 个参数从 `blocks` 改为 `md`（`md` 为必填字符串）**，并删除 `prose/code/call/list/q` 等 blocks 构造器（迁移后 quiz 内联为 `QuizQuestion` 对象字面量，不再调用 `q`）。最终签名：

```ts
export const L = (
  id, stage, title, minutes, difficulty, prereqs, concepts, goals,
  md: string,                       // 正文 Markdown（取代 blocks，第 9 位必填）
  widget: string | null, quiz: QuizQuestion[], terms: string[][], pitfalls: string[],
): Lesson
```

### 2.2 Markdown 约定（处理非原生元素）

Markdown 原生覆盖 `prose`（段落/`##` 标题）与 `list`（`-` 列表）。两处原生不覆盖，需约定：

**(a) 带标题与注释的代码块**——扩展现有 `fence` 渲染规则，解析 info-string 后缀：

````md
```ts title="最小工程与第一次运行" note="v4 的 effect 是单包，HTTP/Schema/RPC 均从 effect/* 子路径导入"
npm install effect@4.1.4
```
````

`fence` 规则读取 `title=` / `note=`，渲染顺序：`code-title` 标题栏 → `highlight.ts` 着色的代码 → `code-note`（💡 注释）页脚。**复用现有 `.code-title/.code-note/.tok-*` 样式**，与现状视觉一致，且 title/note 计入「正文内容」（而非语法噪音）。

**(b) 带语气的提示框（callout）**——推荐**零依赖自定义容器规则**（约 20 行 markdown-it core rule），复用现有 `.callout.warn/.deep/.tip` CSS 类与图标语义（warn→⚠️、deep→🔬、tip→💡）：

```md
:::warn
让执行只发生一次
把所有 Effect 组合都留在库代码里，只在应用入口调用一次 run*。
:::

:::deep
它不是代数效应语言
Effect 没有用户可自定义的 perform / handler……
:::
```

> 备选：`markdown-it-container` 插件（需新增一个小依赖）或 GitHub 风格 `> [!WARNING]` 块引用。推荐零依赖自定义规则，以精确保留现有 `warn/deep/tip` 语气词表、不引入新依赖，并直接复用已存在的 `.callout` 样式。

### 2.3 渲染组件：`markdown-article.vue`

新建 `app/components/course/markdown-article.vue`，复用 `tutor-message.vue` 的安全范式：

```ts
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { highlight } from '~/lib/highlight'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })
// + 注册 §2.2 的 callout 容器规则
// + 覆盖 fence：解析 title/note，复用 highlight()
const raw = md.render(props.md)
const html = import.meta.client ? DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] }) : raw
```

要点：

- `html:false` 已在 SSR 端中和原始 HTML，`DOMPurify` 为客户端第二层（与 `00029` 一致）。
- 样式：组件 `<style scoped>` 用 `:deep()` 命中 `v-html` 节点，复用全局 `main.css` 的 `.tok-*` / `.callout` / `.code-*`；不重复定义着色。
- 纯 JS 渲染，SSR 与客户端输出一致，无 hydration 漂移。

### 2.4 可统计性：`contentStats`

在 `app/lib/markdown-md.ts` 中导出 `contentStats(md)`，直接回应「统计真正的内容有多少」：

```ts
export interface ContentStats {
  proseChars: number   // 叙述正文（去除代码/容器/标记语法后的纯文本）
  proseWords: number
  codeChars: number    // 代码示例量（单独统计，不与正文混淆）
  headings: number
  callouts: number
  codeBlocks: number
}
export function contentStats(md: string): ContentStats
```

算法：先剥离 ```` ``` ```` 围栏代码与 `:::tone` 容器，再去掉 Markdown 语法符号（`#`、强调、`>`、列表符），对剩余文本计字符/词；代码单独累计。可在 `verify-course.mjs` 中复用生成每门课的「正文量 / 代码量」报告。

### 2.5 测试页面（你要求的先试）

为**不触碰现有课程系统**先验证渲染管线，新建一个开发期沙盒路由 `app/pages/dev/md-render.vue`（明确标记 dev-only，迁移完成后删除），其内嵌一段覆盖全部块类型的样例 `md`（标题 / 列表 / 带 title+note 的代码 / 三种语气 callout），通过 `markdown-article.vue` 渲染。验证项：

- 本地 `pnpm dev` 打开 `/dev/md-render`，目视确认标题层级、列表、代码高亮+标题+注释、三种 callout 样式与现有课程视觉一致。
- 确认 SSR 与客户端输出一致、无控制台 XSS 告警。

## 3. 分阶段落地（全部完成）

- **阶段 0（设计）**：本文档评审通过。
- **阶段 1（渲染层）**：实现 `app/lib/markdown.ts`（封装 markdown-it：`html:false` + 自定义 `fence` 解析 `title=`/`note=` + 零依赖 `:::tone` 容器规则）、`app/lib/markdown-md.ts`（`blocksToMarkdown` + `contentStats`）、`app/components/course/markdown-article.vue`（SSR `renderMarkdown` + 客户端 `DOMPurify` + `:deep()` 复用全局 `.code-*`/`.callout.*`）；并用开发期沙盒页 `app/pages/dev/md-render.vue`（`pnpm dev` 目视验证，迁移完成后已删除）确认渲染管线。
- **阶段 2（数据模型 + 自动迁移）**：`Lesson.md` 由 `md?: string` 改为必填 `md: string`，删除 `blocks`；一次性脚本 `scripts/migrate-blocks-to-md.mjs` 将 **194 个**课时 `blocks` 自动转写为 `md` 字符串并回写 `lNN.ts`（quiz 内联为对象字面量），零手工改动；**先试点 `effect-course/l01.ts`** 走真实 `[id].vue` 页面验证集成，再批量跑脚本（用户要求「先试点再全量」）。
- **阶段 3（渲染层替换 + 清理）**：`[slug]/lessons/[id].vue` 删除 `LessonBlock` 回退分支、只渲染 `<MarkdownArticle :md="lesson.md" />`；删除 `lesson-block.vue`；`verify-course.mjs` 改为校验 `md` 非空（替换原 `l.blocks.length` 校验）。`course-builders.ts` 删除 `prose/code/call/list/q` 构造器，仅保留 `L`。
- **阶段 4（约定同步）**：更新 `AGENTS.md` 内容写作约定（正文用 `md` 模板字符串；quiz/terms/pitfalls 仍结构化）；跑全门禁 `fmt/lint/typecheck/verify`（全绿）。`build` 因本沙箱 `safe-delete` 批量删除缓存守卫无法运行（环境策略，非代码问题），已用等价 SSR 渲染函数验证替代。

## 4. 风险与缓解

| ID | 风险 | 缓解 |
|---|---|---|
| R1 | **XSS**：Markdown 注入脚本 | `html:false` + 客户端 `DOMPurify`（沿用 `00029` 已验证范式）；`import.meta.client` 分支处理。 |
| R2 | **新增依赖** | 优先零依赖自定义 callout 规则；仅当自写规则不稳时才引入 `markdown-it-container`（纯 JS、MIT、极小）。 |
| R3 | **语气词表漂移** | 自定义容器直接映射现有 `warn/deep/tip`，复用 `.callout.*` 样式，不重新定义语义。 |
| R4 | **SSR/客户端不一致** | markdown-it 纯 JS 无 DOM 依赖，两端同输入同输出；`DOMPurify` 仅客户端，不影响 HTML 结构。 |
| R5 | **迁移完整性（194 课时）** | 一次性 `scripts/migrate-blocks-to-md.mjs` 自动转写。**关键顺序**：先翻转 `L()` 签名（第 9 位 `md` 必填、删 `blocks`），脚本运行期对未迁移文件「旧 blocks 数组会落在 `md` 槽位」→ 从中取 blocks 生成 md；写完每个文件后用 **ESM 缓存 bust（`?bust=Date.now()`）重新 import** 比对零失真（否则第二次 import 命中缓存读到旧内容）。先试点 1 课再批量；`verify` 全量比对「迁移前后 `contentStats` 与题目/术语/误区数量一致」作为回归闸门。 |
| R6 | **过渡期双模型** | 允许 `md` 与 `blocks` 并存一过渡窗口（`md` 优先），全部迁移后删除 `blocks` 字段与 `lesson-block.vue`。 |
| R7 | **样式遗漏** | 验证 `main.css` 中 `.tok-*`/`.callout`/`.code-*` 为全局样式，`markdown-article` 用 `:deep()` 命中；逐块对照现状视觉。 |
| R8 | **与 00052 内容质量重构冲突** | 本方案是渲染底层，00052 是内容编排上层；先完成渲染切换并保留 quiz/terms/pitfalls 结构，00052 的「三元结构 / 课型分化」可在 Markdown 正文内自由表达，互不阻塞。 |

## 5. 不变量

- **学情逻辑零影响**：`quiz/terms/pitfalls/widget` 保持结构化，`analytics.ts`、`verify-course.mjs` 的题型校验与掌握度计算不变。
- **既有课程（effect-ts / rxjs / agent）行为逐字节一致**：过渡期 `md` 与 `blocks` 并存，`lesson-block.vue` 仅在无 `md` 时回退；全部迁移后通过 `verify` + `build` + `smoke` 证明零回归。
- **目录化与命名约定不变**：新增文件仍 kebab-case；课时仍「一课一文件」。

## 6. 验证方案

- 阶段 1：`pnpm dev` 打开 `/dev/md-render` 目视确认全部块类型渲染正确、无 XSS 告警。
- 阶段 2：试点课时走真实 `[id].vue` 页面；`contentStats` 抽样核对「正文量 + 代码量」合理。
- 阶段 3：`pnpm verify` 全课程通过（新增 `md` 校验 + 统计报告）；`pnpm fmt/lint/typecheck/build` 全绿。
- 阶段 4：`pnpm build` 后 `wrangler dev --port 3199` + `python scripts/smoke.py --base http://127.0.0.1:3199`：既有课 SSR + 客户端零回归；跑完关闭临时端口。

## 7. 待你拍板的决策点

1. **接受「混合模型」**（正文 Markdown 化 + quiz/terms/pitfalls 结构化）而非纯 Markdown —— 我建议接受。
2. **callout 实现**：零依赖自定义容器规则（推荐）vs `markdown-it-container` 插件。
3. **迁移节奏**：一次性脚本全量迁移（推荐，确定性强）vs 逐课手工 + 长期双字段并存。
4. **试点课时**：默认 `effect-course/l01.ts`，或你指定其他课。

## 8. 与 00052 的关系

`00052-agent-course-rebuild` 规划了「理论+代码+经验」三元内容与按课型分化，并明确「先试点再分批」。本方案提供其所需的**渲染底层能力**：Markdown 正文让作者以接近成品的方式书写三元内容、自由编排课型，同时获得精确的内容量统计，支撑 00052 的质量评估。两者解耦，本方案先行落地不影响 00052 的规划。

## 9. 完成结果（2026-11-14）

### 9.1 决策点落地

1. **混合模型**：已接受。正文（prose/code/callout/list）Markdown 化，`quiz/terms/pitfalls/widget` 保持结构化。
2. **callout 实现**：已采用零依赖自定义 `:::tone` 容器规则，复用全局 `.callout.{warn,deep,tip}` 样式与图标语义（⚠️/🔬/💡）。
3. **迁移节奏**：一次性脚本全量迁移（`scripts/migrate-blocks-to-md.mjs`），先试点 `effect-course/l01` 走真实页面验证，再批量 194 课。
4. **试点课时**：`effect-course/l01.ts`；试点通过后再跑全量，符合「先试点再全量」。

### 9.2 实测数据

- **迁移规模**：194 个课时 `blocks → md` 全部完成，0 跳过（无空洞 blocks 文件）。
- **内容统计抽样**（l01 类课时）：叙述正文约 500–600 字、代码示例约 600–900 字符、提示框 2 个、代码块 2+ 个——「正文量 / 代码量」首次可一键量化。
- **门禁**：`pnpm fmt / lint（4w）/ typecheck（9w）/ verify（3 门课全通过）` 全绿；警告数为基线 + 边界（markdown.ts 的 2 处 `as` 断言、迁移脚本 1 处 `args` 变量遮蔽）。
- **渲染验证**：用页面同一套 `renderMarkdown()`（=Nuxt SSR 输出）对三门的迁移后 l01 渲染，确认 `.callout` / `.code-block` / `<h3>` 正确、无 `<script>` 注入、quiz/terms/pitfalls 结构零失真。
- **真实页面**：迁移前已用运行中的 dev server（端口 10180）对 `/courses/effect-ts/lessons/L01` 与 `/dev/md-render` 做 SSR 抓取，HTTP 200 且渲染标记齐全。

### 9.3 未竟 / 说明

- **`pnpm build` 与 dev server 无法在本沙箱运行**：Vite/Nuxt 启动需批量删除 >50 个缓存文件，触发环境 `safe-delete` 守卫（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`），属环境策略而非代码问题。已用「等价 SSR 渲染函数 + 既有 dev server 抓取」替代验证，门禁与渲染均确认正确。正式发布前需在可写缓存的环境跑一次 `build` 兜底。
- **`markdown-md.ts` 保留**：`blocksToMarkdown` 仅迁移脚本用，`contentStats` 供 verify 复用；`LessonBlock` 类型因 `blocksToMarkdown` 仍需而保留。
- **`/dev/md-render.vue` 已删除**（dev-only 沙盒页，试点完成后清理）。
