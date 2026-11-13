# 课程构建流程详解

按阶段顺序执行。每阶段列出输入、动作、产出、验收标准；验收不通过不得进入下一阶段。

---

## 阶段 0 · 核实版本基线（强制第一步）

**输入**：课程主题（某个库 / 框架 / 语言 / 协议）。

**动作**

1. 查权威源，至少三处交叉：
   - npm registry `https://registry.npmjs.org/<pkg>/latest` 与 `/-/package/<pkg>/dist-tags`，取 `latest` 与 `prev`。
   - 官方发布公告（稳定发布日期、LTS 承诺、破坏性变更、包结构变化）。
   - 当前官方文档入口 URL（确认是 `/docs/`、`/docs/v3/` 还是 `/docs/v4/`）。
2. 抓官方文档核实核心抽象与 API 名（类型定义、错误模型、并发算子、运行时组成、资源管理等）。
3. 列出「旧资料会教错」的差异清单：改名/删除的 API、包路径、类型结构、调度机制。
4. 把结论写成 `META`：`version` / `verifiedAt` / `lts` / `docs` / `release` / `playground` / `source` / `notes`。

**产出**：版本核实表 + 差异清单 + `META`。
**验收**：能回答「当前 latest 是哪个版本、何时 stable、官方文档根路径是什么、哪些 API 已经不能用了」；正文与代码全部以该版本为准。

> 反例：先按记忆里的 v3 API 写完 24 课正文，再发现 latest 是 v4 且 `Context.Tag` → `Context.Service`、树形 Cause → 扁平 Reason 数组、`@effect/platform` 并入核心，整批内容作废。

---

## 阶段 1 · 确认关键决策

**输入**：阶段 0 的版本结论 + 用户的原始请求。

**动作**：用提问确认两个最影响返工量的选项（一次最多 3 个问题）：

1. **课程主线口径**：纯最新版 / 最新版 + 旧版差异附录 / 旧版为主 + 迁移章。
2. **内容载体**：TS 结构化数据 + Vue(React) 组件 / Markdown + MDC / 混合。
3. **落地形态**（涉及现有项目时）：整站就是一门课 / 站点中的一门课（课程注册表） / 单个长页面。

结构化数据优先：讲解块、代码块、提示、术语、误区、题目、演练标识都需被测验、概念图谱、学情归因消费；Markdown 会丢失粒度。**课程设计说明书（版本基线 / 路径 / 依赖图 / 学情公式 / 扩展机制 / 验证方式）必须作为绑定课程的数据（`DESIGN`，类型见 `data-model.md`）写入内容层，由「教学设计」视图渲染，不另存独立的 Markdown / Nuxt Content 文件**——否则内容与渲染会分叉，删除内容模块后说明书会悬空。

**产出**：已确认方案。
**验收**：方案写入设计文档，后续不再改变内容载体。

---

## 阶段 2 · 课程体系结构

**输入**：确认后的主线与载体。

**动作**

1. 定阶段数 × 每阶段课时数（经验值：6 阶段 × 4 课 = 24 课，认知负荷平缓），对齐官方 learning spine，再叠加「底层原理」层。
2. 抽取知识点（概念）并登记 `id` / `name` / `stage` / `weight` / `prereqs`，构成 DAG；每课标注 `prereqs`（课时）与 `concepts`（概念）。
3. 给每课定 `title` / `minutes` / `difficulty` / `goals`，标出原理重课（★）。
4. 设计统一课时结构：目标 → 讲解块 → 代码块 → 提示/误区 → 关键术语 → 交互演练 → 随堂测验（每题绑定一个概念 ID，附解析）。
5. 设计学情模型（公式见 `data-model.md`）：掌握度、遗忘曲线、薄弱点归因、复习队列、推荐下一课。
6. 写课程设计说明书：**作为绑定到课程的数据（`DESIGN` 字段）写入内容数据模块**，覆盖版本基线、路径与依赖图、每阶段目标、学情公式、扩展机制、验证方式；由「教学设计」视图渲染，不要写成独立的 Markdown / Nuxt Content 文件。学习路径总表用「从课程数据动态生成」的区块类型，避免与 `LESSONS` 重复维护。

**产出**：课程设计说明书 + 知识点依赖图。
**验收**：前置关系无环且顺序单调；每个概念至少被一道题覆盖；每阶段有明确目标与验收口径。

---

## 阶段 3 · 内容数据层

**输入**：阶段 2 的结构设计。

**动作**

1. 建类型契约（见 `data-model.md`），再建唯一内容源模块，导出 `META` / `STAGES` / `CONCEPTS` / `LESSONS`。
2. 用小型构造器函数生成块（`prose` / `code` / `callout` / `list`），避免手写重复对象字面量。
3. 从既有材料迁移时，写一次性脚本做机械转换（IIFE → ESM、全局变量 → 工厂闭包），**不手抄**；转换后立刻做语法检查与首尾结构核对，再删脚本。
4. 版本信息只存在于 `META`，正文里不得散落硬编码版本号。

**产出**：`<topic>-course.ts` + `types/course.ts`。
**验收**：通用数据自检全绿；新增一个虚拟课时后地图/侧栏/报表自动出现该课。脚本随 skill 提供，命令要写**完整路径**并带 type stripping flag：

```bash
node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs \
  <course-data.ts> [widgets.ts]
```

它是通用的数据一致性校验；落地到具体项目后，还需跑项目自带的引擎全轨迹自检（本仓库为 `pnpm verify`），两者互补，缺一不可。

---

## 阶段 4 · 交互演练层

**输入**：课时里的 `widget` 标识清单。

**动作**

1. 每个演练做成独立注册项 `(host, ctx) => cleanup`，返回清理函数以回收定时器、事件监听与 RAF。
2. 演练要「可操作」：单步执行、参数可调、状态可视化（SVG 时间轴 / 栈 / 依赖图），而不是静态截图。
3. 明确标注演练是**原理模拟**，不是真实运行时；真实代码指向官方 Playground。
4. 用宿主组件托管生命周期：`onMounted` 挂载、`onBeforeUnmount` 调 `cleanup()`；切换课时用 `:key` 强制重建。

**产出**：演练注册表 + 宿主组件。
**验收**：所有 `widget` 标识都能解析；每个演练可实例化且无未捕获异常；切换课时不残留定时器。

> 大体积 DOM 演练内核（定时器 + SVG 动画）迁移时优先「机械转 ESM + Vue 托管」，整体重写成声明式组件风险高且易丢交互。

---

## 阶段 5 · 学情引擎

**输入**：课程数据对象 + storage key。

**动作**

1. 做成工厂 `createAnalytics(course, storageKey)`，让课程数据与 key 由闭包捕获，实现多课程隔离。
2. 实现纯计算函数：`defaultState` / `visitLesson` / `recordAttempt` / `markWidgetDone` / `completeLesson` / `overall` / `conceptStats` / `stageMastery` / `reviewQueue` / `diagnose` / `recommend` / `teacherReport` / `exportState` / `importState`。
3. 持久化：localStorage + 版本字段；`importState` 校验版本，非法备份抛错；提供 JSON 导入导出 UI。
4. 视图层用 composable 包一层：SSR 首屏用默认态，`onMounted` 载入真实档案，避免 hydration mismatch。

**产出**：`analytics.ts` + `use-learning.ts`。
**验收**：引擎全轨迹冒烟（空状态 → 逐课访问/答题/演练/完成 → 进度 100%、正确率符合预期、教师报表行数不变）；30 天未复习概念进入复习队列；导出导入还原一致；非法备份被拒；另一 storage key 的进度互不干扰。

---

## 阶段 6 · 视图与响应式

**输入**：内容层 + 引擎层。

**动作**

1. 至少 6 个视图：课程地图、课时详情、学情仪表盘、复习中心、教学准备、设置与数据。多课程站点再加首页课程列表与课程详情。
2. 路由含 404 守卫（未知课程 slug / 课时 id）。
3. 移动端规则：≤780px 顶栏只留菜单/版本/主题，5 个主视图移到底部标签栏；24 课目录改左侧抽屉（遮罩 / Esc / 切页自动收起）；卡片单列或两列；代码块、SVG 图示、课时表、时间轴各自独立横滑并给提示；输入框 16px 防 iOS 缩放；`viewport-fit=cover` + `env(safe-area-inset-*)`；横屏矮视口与 `prefers-reduced-motion` 规则。
4. 防溢出根因：栅格列用 `minmax(0, 1fr)` 且 `.grid > * { min-width: 0 }`；滚动容器 `min-width: 0; max-width: 100%`。
5. 用户输入展示统一转义（防 XSS），代码块高亮后 `v-html` 的内容必须来自受信任的静态数据。

**产出**：可运行应用。
**验收**：320 / 360 / 390 / 768 / 1440 视口无横向溢出、无越界元素；底部标签栏与抽屉开合正常；触控目标 ≥40px。

---

## 阶段 7 · 全量验证

**输入**：完整应用。

**动作**（按顺序，任一失败即停）

1. **代码门禁**：按目标项目的现行工具链跑，本仓库为 `pnpm fmt:check` → `pnpm lint`（0 errors）→ `pnpm typecheck`（`--type-aware --type-check`，0 errors）。没有这些脚本时才退回逐个 `node --check`；不要用 `esbuild.transformSync`（pnpm 隔离下拿不到）或 `tsc --noEmit`（TS 7 无 programmatic Compiler API，项目也未把它设为门禁）。
2. **数据一致性**：`check-course.mjs`（引用、答案索引、前置顺序、widget 映射、版本锁定）+ 项目自带的 `pnpm verify`（内容一致性 + 学情引擎全轨迹）。
3. **引擎冒烟**：空状态与完整学习轨迹、遗忘/复习/导出导入、多课程隔离。
4. **构建**：`pnpm build` / `npm run build`，确认无新增错误。
5. **路由冒烟**：每条 SSR 路由返回预期状态码与关键内容标记；未知路由返回 404。
6. **客户端渲染**：逐个课时页检查演练挂载、无未捕获异常。
7. **真实视口**：用 CDP `Emulation.setDeviceMetricsOverride` 构造精确宽度，检查 `scrollWidth`、`getBoundingClientRect` 越界、导航可见性、触控尺寸。不要用 `--window-size` 假装手机（见 `pitfall-resolver` skill 的 `references/browser-viewport.md`）。
8. **交互冒烟**：真实点击课程跳转、抽屉开合、答题写入 localStorage 与即时反馈、主题切换、图表渲染、文档渲染。
9. **视觉复核**：截图后检查对齐、溢出、对比度。
10. **清理**：删临时脚本、探针文件、截图，关闭临时服务。

**提交门禁**（工程化项目）：`pre-commit` 由 lint-staged 对暂存文件跑 `oxfmt` + `oxlint`，`commit-msg` 由 commitlint 校验 Conventional Commits。提交前确认这两条链路可用（可用临时索引 + `git hook run` 验证，不触碰真实索引）；`typecheck` / `verify` / `build` 不在 hook 内，仍需手动或交给 CI。

**产出**：`verify.*` 与 `smoke.py` 等可长期回归的脚本。
**验收**：全部通过；断言不得把「元素缺失」当成通过（假阳性）。遇到任何问题（不限于环境或验证异常）先加载 `pitfall-resolver` skill 按症状查已验证解法，不要重复试错；解决并回归通过后必须更新或新增其中的解决方案条目。

---

## 阶段 8 · 工程化迁移与长期准备（可选）

**输入**：既有静态课程应用 + 目标框架项目。

**动作**

1. 先只读探查目标项目：技术栈、目录、路由约定、数据模型、构建命令，跑一次基线构建确认环境。
2. 内容层机械转 ESM TS；引擎转工厂；演练内核转模块由宿主组件托管；视图拆成 `pages/` + `components/` + `composables/` + `layouts/`。
3. 多课程抽象：课程注册表（slug / 元数据 / storageKey / data），新增一门课只追加注册项。
4. 原 CSS 面向 `<button>` 的规则要扩展到框架链接组件（`.btn`、`.nav a`、`.lesson-item`、`.brand`）；`display: inline-flex` + `text-decoration: none` 避免锚点错位。
5. 课程设计说明书随内容层一起以数据形式维护（已绑定 `DESIGN`），无需迁到 Content 集合；框架自动导入的函数改显式 import，避免文件名变化后按名字猜测失效。
6. 写迁移映射文档（旧文件 → 新文件、关键决策、验证记录）。
7. 统一文件命名为 kebab-case 并写进项目 README。

**产出**：工程化课程模块 + 迁移文档 + 命名约定。
**验收**：构建通过；全路由 SSR/客户端冒烟通过；多课程学情互不串数据。

---

## 交付清单模板

```
📦 交付清单：
- [x] 版本基线 — <pkg>@<version>（核实日期 / LTS / 官方文档路径）
- [x] 课程体系 — N 阶段 × M 课、K 个概念、Q 道题、知识点依赖图
- [x] 交互演练 — W 个原理可视化，均可操作且可清理
- [x] 学情分析 — 掌握度 / 遗忘曲线 / 薄弱点诊断 / 复习队列 / 导入导出
- [x] 视图与响应式 — 桌面/平板/手机三档，真实视口回归通过
- [x] 长期准备 — 加课时只改内容层、版本集中在 META、课时质量标记、教学准备页
- [x] 文档与自检 — 设计说明书、交付总览、verify + smoke 脚本
- [x] 质量门禁 — fmt:check / lint / typecheck / verify / build 全绿，提交符合 hooks 规范
- 运行方式：<具体命令>
- 已知限制：演练是原理模拟而非真实 runtime；学情仅存本机需定期导出
```
