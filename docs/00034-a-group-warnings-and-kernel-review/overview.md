# 00034 · A 组函数作用域警告修复 + 两个迁移内核复杂度评估

- 日期：2026-11-14
- 状态：**A 组已实施 / 内核拆分仅评估、未实施（待用户审核）**
- 关联：`docs/00032-ts-esnext-and-warnings`、`docs/00033-cleanup-invalid-unused-vars`、`docs/00027-course-dir-layout`、`AGENTS.md` §3 / §11、`.workbuddy/skills/pitfall-resolver/references/toolchain.md`（「oxlint 结构化统计口径」条目，其标题已记为 00034 探查，与本次编号衔接）

---

## 0. 本次变更会修复的历史记录内容（按用户新约定声明）

> **用户新约定（00034 起生效，永久）**：永远不许矫正之前已经落盘的任务记录，只能在新的任务记录中明确指出「本次变更会修复 xx 任务的 xx 内容」。本节即依此约定声明。**下表所列文件与段落一律不改写、不追加、不标注**，包括 `AGENTS.md` §3、`docs/README.md` 既有行、00032 / 00033 目录内任何文件。
>
> 该约定**覆盖** `AGENTS.md` §11 与 `docs/README.md` 约定中「已失效的历史结论在原目录内标注『以 NNNNN 为准』」的旧做法：自 00034 起，连「在旧目录标注」也不做，只在新目录声明。

| 落盘位置 | 其中失真的内容 | 本次变更会修复什么 |
|---|---|---|
| `docs/00032-ts-esnext-and-warnings/overview.md` §2 L31–32、§3 L41/L44、§7 L104 | 「按规则+文件+行+列去重后 32 条独立 warning」「`consistent-function-scoping` 在两处各重复报 3 次」「修 18 / 保留 14」「唯一条目 32 → 14」 | 修复 **00032 的 warnings 去重口径**：`oxlint -f json` 的 `labels[0]` 是父函数位置、`labels[-1]` 才是函数位置；真实为「零重复，输出数即唯一数」。00032 当时 `lint 27 / typecheck 36` 是 27 / 36 条独立诊断，不是「去重 32」 |
| `docs/00033-cleanup-invalid-unused-vars/overview.md` §7 L72/L75、§7 尾部 L94 | 「按规则+文件+行+列去重唯一条目 14 → 8」「剩余 8 条唯一条目」「输出数大于唯一数仍是两处各重复报 3 次」 | 修复 **00033 的剩余 warnings 统计口径**：真实为 `lint 10 / typecheck 12` 共 **12 条独立诊断、零重复**，其中 10 条 lint + 2 条仅 typecheck 的 `no-unsafe-type-assertion`；不是「唯一 8 条」 |
| `AGENTS.md` §3 L60 | 「存量 warnings（lint 10、typecheck 12；按…去重后 8 条，00033 清理后基线）= 5 条函数作用域风格项 + 2 条… + 1 条…」「`consistent-function-scoping` 有 2 个位置各重复报 3 次」 | 修复 **AGENTS.md §3 的 warnings 基线与去重口径**：A 组修复后实际为 `lint 5 / typecheck 7`（均为独立诊断、零重复）；剩余项 = 5 条内核函数作用域 + 2 条内核边界断言 + 1 条有意保留的 `svg()`。按约定不改动 §3 原文，仅在此声明 |
| `AGENTS.md` §3 L60（同上） | 「00033 清理后基线」「唯一剩余未使用项…」 | A 组修复后基线数字前移，本文件 §5 给出新口径；原文保留不改 |

口径根因与实测解法已落在 `.workbuddy/skills/pitfall-resolver/references/toolchain.md`「oxlint 结构化统计口径（00034 探查）」条目，本次不改该条目。

---

## 1. 目标

1. 落地「历史记录不可矫正」长期约定（见 §0），写入 `AGENTS.md` 新增条款与工作记忆。
2. 修复上一轮清单中推荐的 **A 组 5 条** `unicorn/consistent-function-scoping` 警告，行为零变化。
3. **只读评估**两个机械迁移内核 `app/lib/widgets.ts`、`app/lib/analytics.ts` 的警告与复杂度，回答「能否用同名文件夹 + 子模块拆分降低复杂度」，给出做/不做表格与推荐；**评估不实施**，等用户审核。

---

## 2. 变更计划

### 2.1 A 组 5 条（实施）

统一手法：把「不捕获父作用域变量」的函数提到**模块级**，或在模块级定义 `noop` 常量复用；不改调用点、不改签名、不改行为。

| # | 位置 | 现状 | 改法 |
|---|---|---|---|
| A1 | `app/composables/use-tutor.ts:232` `nextId` | 定义在 `useTutor()` 内，仅引用模块级 `feedSeq`（L48） | 提到模块级 `function nextId(): string`，`feedSeq++` 不变 |
| A2 | `app/composables/use-tutor.ts:378` `toLlmError` | 定义在 `useTutor()` 内，仅用 import 的 `LlmRequestError` 与 `LlmError` 类型 | 提到模块级 `function toLlmError(err: unknown): LlmError` |
| A3 | `app/composables/use-tutor.ts:494` `goSettings` | 定义在 `useTutor()` 内，仅用 Nuxt auto-import 的 `navigateTo` | 提到模块级 `function goSettings(): void`，返回对象里引用不变 |
| A4 | `app/composables/use-learning.ts:55` `engineOf` | `useLearning()` 内的 `(course) => engineFor(course)` 别名 | 提到模块级 `function engineOf(course: CourseEntry): Engine`，返回对象引用不变 |
| A5 | `app/lib/tutor/llm.ts:85` `externalCleanup` | `let externalCleanup = () => {}` 的初始化箭头被规则标记 | 模块级 `const noop = (): void => {}`，改为 `let externalCleanup: () => void = noop` |

### 2.2 明确不动（沿用上一轮决策）

| 组 | 条目 | 不动原因 |
|---|---|---|
| B | `app/lib/analytics.ts:40/112/119`（`todayKey` / `lessonState` / `conceptState`）、`app/lib/widgets.ts:131`（`sel`） | `@ts-nocheck` 迁移内核，4 条纯风格外提收益≈0；且这些函数被内核内多处调用，外提会扩大改动面 |
| C | `app/composables/use-learning.ts:29/45` 两条 `no-unsafe-type-assertion` | 00032 已实测：换成局部变量注解触发 `TS2322`；踩坑库明令「迁移内核边界保留断言」 |
| D | `app/lib/widgets.ts:114` `svg()` | 00033 用户决策保留（完整可复用 helper），只接受 1 条 `no-unused-vars` warning |

### 2.3 文档与约定（实施）

- `AGENTS.md` §11 **追加**一条「历史记录不可矫正」条款（只新增，不修改任何已有行）。
- `docs/README.md` 目录表**追加** 00034 一行（只新增，不改旧行）。
- `.workbuddy/memory/MEMORY.md` 追加该长期约定。
- 本 overview 补全实施结果与验证。

### 2.4 内核拆分（**仅评估，不实施**）

见 §6。

---

## 3. 验证方案

按 `AGENTS.md` §2 顺序，全部记录退出码与关键数字：

1. `pnpm fmt:check`
2. `pnpm lint` → 预期 `0 error`，warnings `10 → 5`
3. `pnpm typecheck` → 预期 `0 error`，warnings `12 → 7`
4. `pnpm verify`（两段：课程内容/学情全轨迹 + 助学 Agent 自检）
5. `pnpm build`（必要时 `CODEBUDDY_SAFE_DELETE_ENABLED=0 NUXT_IGNORE_LOCK=1`）
6. 用 `oxlint -f json` 的 **`labels[-1].span`** 复核剩余诊断清单，确认 A 组 5 条消失、B/C/D 组逐条保留。
7. A 组改动集中在纯函数位置，无需重跑浏览器 CDP 动态探针；若 `verify` / `build` 异常则按 `pitfall-resolver` 闭环处理。

---

## 4. 两个内核的探查数据（实测，2026-11-14）

| 指标 | `app/lib/widgets.ts` | `app/lib/analytics.ts` |
|---|---|---|
| 行数 | **2217** | **506** |
| 头部标记 | `// @ts-nocheck` 机械迁移的 DOM 演练内核 | `// @ts-nocheck` 机械迁移的纯计算内核 |
| 顶层结构 | 共享 helper 11 个（`esc/h/button/slider/makeCtx/row/group/box/svg/sel`…）+ `const W = {}` + **24 个** `W.xxx = function` 演练 | `storage` 适配器 + `createAnalytics(course, storageKey)` 单闭包工厂，内部 **28 个**函数 |
| 导出面 | `export const Widgets = { render, has }`（注册表间接暴露 24 个演练） | `export function createAnalytics`，返回 22 个方法 |
| 分支关键词计数（`if/for/while/switch/case/&&/\|\|/?`） | 161 | 95 |
| 函数 / 箭头声明计数 | 214 | 63 |
| 定时器 | 4 处，全部经 `makeCtx().cleanup()` 回收 | 0 |
| 当前 warnings | 2（L114 `svg()` 未使用、L131 `sel` 函数作用域） | 3（L40/112/119 函数作用域） |
| 分组边界 | 天然按课程分：L124–1242 = Effect 11 个；L1243–2216 = RxJS 13 个 | 天然分层：状态存取（L40–131）/ 事件采集（L133–200）/ 统计诊断（L201–460）/ 导入导出（L461–480） |
| 值导入方 | `app/components/course/course-widget.vue` 用 `import { Widgets } from '~/lib/widgets'`（省略扩展名） | `app/composables/use-learning.ts` 用 `import { createAnalytics } from '~/lib/analytics'` |
| Node 直连方 | `scripts/verify-course.mjs:23` `import('../app/lib/widgets.ts')`；`check-course.mjs` 由 CLI 传路径 | `scripts/verify-course.mjs:22`、`scripts/verify-tutor.mjs:32` `import('../app/lib/analytics.ts')` |
| 硬编码路径 | `scripts/verify-course.mjs:65` 静态资源数组含 `'app/lib/widgets.ts'` / `'app/lib/analytics.ts'` | 同左 |
| 课程正文引用 | `app/data/effect-course/design.ts:226/251`、`app/data/rxjs-course/design.ts:196/221` 把两个文件写进正文（「widgets.ts 是 11 个演练内核」等描述已与 24 个不符） | 同左 |
| 文档引用 | `AGENTS.md` §7、`docs/00027` §「探查结论」、00032/00033 overview | 同左 |

结论：**两个文件确实是大文件，但复杂度来源不同**——`widgets.ts` 是「24 个同构、彼此零耦合的演练函数」堆叠（宽而不深）；`analytics.ts` 是「一个闭包工厂内 28 个互相调用的函数」（深而耦合）。

---

## 5. 实施结果

### 5.1 变更文件（A 组 5 条，全部为纯位置迁移）

| 文件 | 变更 |
|---|---|
| `app/composables/use-tutor.ts` | 新增模块级「纯函数」区块（`nextId` / `toLlmError` / `goSettings`），删除 `useTutor()` 内同三个定义；返回对象 `goSettings` 引用不变 |
| `app/composables/use-learning.ts` | 新增模块级 `function engineOf(course): Engine`，删除 `useLearning()` 内的别名箭头函数 |
| `app/lib/tutor/llm.ts` | 新增模块级 `const noop = (): void => {}`；`makeController()` 内改为 `let externalCleanup: () => void = noop` |
| `AGENTS.md` | §11 **追加**「历史记录不可矫正」条款一行（已有行零改动） |
| `docs/README.md` | 目录表 **追加** 00034 一行（旧行零改动） |
| `.workbuddy/memory/MEMORY.md` | 追加同一长期约定 |
| `docs/00034-*/overview.md` | 本文件（先于代码建立） |

**零改动**：`docs/00032-*/`、`docs/00033-*/` 内任何文件、`AGENTS.md` §3 及其他既有行、`docs/README.md` 既有行、`.workbuddy/skills/pitfall-resolver/` 下任何文件。

### 5.2 门禁结果（全部 exit 0）

| # | 命令 | 退出码 | 关键数字 |
|---|---|---|---|
| 1 | `pnpm fmt:check` | 0 | 122 文件全部符合格式 |
| 2 | `pnpm lint` | 0 | **0 error / 5 warning**（原 10） |
| 3 | `pnpm typecheck` | 0 | **0 error / 7 warning**（原 12） |
| 4 | `pnpm verify` | 0 | 双课程全轨迹（effect 71% / rxjs 74% 自洽）+ 助学 Agent 自检全通过 |
| 5 | `pnpm build` | 0 | 13.1s，Nuxt 4.6.4 / Nitro cloudflare-module，377 client + 317 server 模块 |
| 6 | `python scripts/smoke.py --base http://127.0.0.1:3199` | 0 | 18 条 SSR 路由 + 6 条客户端渲染 + 21 条真实视口，全绿 |

临时 `wrangler dev --port 3199` 已按 §10 收尾纪律关闭（运行 38s，killed）。

### 5.3 剩余警告复核（`oxlint -f json`，取 `labels[-1].span` 主标签）

`lint` 5 条、`typecheck` 7 条（= 5 条 lint + 2 条仅 type-aware 断言），**12 → 7 条独立诊断、零重复**，与 §0 声明的正确口径一致：

| 组 | 位置 | 规则 | 决策 |
|---|---|---|---|
| B | `app/lib/analytics.ts:40` / `:112` / `:119` | `consistent-function-scoping` | 不动（迁移内核） |
| B | `app/lib/widgets.ts:131` | `consistent-function-scoping` | 不动（迁移内核） |
| C | `app/composables/use-learning.ts:34` / `:50` | `no-unsafe-type-assertion` | 不动（内核边界断言，改注解会触发 TS2322） |
| D | `app/lib/widgets.ts:114` | `no-unused-vars` | 不动（00033 用户决策保留 `svg()`） |

> 注：`use-learning.ts` 的两条断言行号由 29/45 变为 34/50，是因为新增了 5 行模块级 `engineOf` 注释与函数体，断言本身与注释一字未改。

### 5.4 构建产物确认（模块级 auto-import）

`goSettings` 是唯一依赖 Nuxt auto-import 的外提函数，检查 `.output/server/chunks/build/use-tutor-C2jhjdlY.mjs`：

```text
import{h as n,n as e}from"../virtual/entry.mjs"; …
function goSettings(){e("/settings/llm")}function useTutor(){const e=n("knowisle:tutor",initialState); …
```

模块级 `goSettings` 里的 `e` 解析到 `virtual/entry.mjs` 的 auto-import 别名（`navigateTo`）；`useTutor()` 内同名的局部 `e` 是 `useState` 结果，二者分属不同词法作用域，不构成遮蔽或运行时未定义。产物中 `/settings/llm` 调用完整保留，构建与 SSR 冒烟均通过。

### 5.5 踩坑库闭环

本次未出现新的报错或门禁失败；实施前加载 `pitfall-resolver`，命中 `references/toolchain.md`「oxlint 结构化统计口径」条目中「模块级变量不算父作用域捕获」的结论（A1 `nextId` 引用模块级 `feedSeq`，外提安全），以及 `references/course-content.md` 的 00027 目录化布局结论（供 §6 评估）。**按用户新约定未回写或修改任何已落盘文件**，实测结论只记在本 overview。

---

## 6. 两个内核拆分的评估与建议（仅评估，不实施）

### 6.1 可行性结论

**技术上可行，且 00027 已验证过整套做法**：`app/lib/widgets.ts` → `app/lib/widgets/` 后，Nuxt/Vite 会把 `~/lib/widgets` 自动解析到 `widgets/index.ts`，`course-widget.vue` 的 import 一个字都不用改；Node `--experimental-strip-types` 不解析目录 index，因此校验脚本入口必须改成显式 `.../widgets/index.ts`，且目录内兄弟值导入必须写显式 `.ts`。

### 6.2 但是：两个内核的收益/风险不对称

| 维度 | `widgets.ts` → `widgets/` | `analytics.ts` → `analytics/` |
|---|---|---|
| 拆分依据 | **清晰**：24 个演练函数互不调用，只共享 11 个 helper；按课程分 2 组再一演练一文件即可 | **不清晰**：28 个函数共享 `COURSE / KEY / DAY / MAX_ATTEMPTS / memoryFallback` 闭包状态并互相调用（`todayKey` 被 6 处调用、`lessonState` 被 4 处调用、`defaultState()` 被 `load/reset/importState` 调用） |
| 拆分后单文件规模 | 共享 `dom.ts`（~120 行）+ 24 个演练文件（各 50–140 行）+ `index.ts`（~20 行） | 需先改成「显式传 state/ctx 参数」或建 context 对象，等于**重写内核状态模型** |
| 对 `@ts-nocheck` 的影响 | 无：每个子文件沿用同一标记，类型边界不变 | 有：拆闭包后参数类型全靠推断，`use-learning.ts` 边界断言（C 组 2 条警告 + `TS2322` 风险）会重新暴露 |
| 可直接消掉的 warnings | L131 `sel` 可在拆 `triple.ts` 时顺手外提（1 条）；L114 `svg()` 仍需按用户决策保留 | L40/112/119 三条 cfs 只有在「拆成模块级纯函数」时才消失，而这正是重写 |
| 改动面 | 3 个脚本/组件路径 + 课程 design.ts 正文 + `AGENTS.md` §2 命令示例 + `docs/00027` 探查结论（**按新约定不改旧记录，只在新目录声明**） | 同上，外加 `use-learning.ts` 契约与全部调用点 |
| 回归成本 | 中：`verify` 全轨迹 + `build` + SSR 冒烟 + 浏览器逐演练挂载 | 高：学情计算是站点核心，任一函数签名变化都会影响 dashboard/review/teacher 三页 |
| 风险等级 | **中低**（纯搬运，逐字不动函数体） | **高**（涉及状态模型与类型边界） |

### 6.3 推荐（做 / 不做表格）

| 项 | 做 / 不做 | 理由 |
|---|---|---|
| `widgets.ts` 同名目录化 + 按课程分子模块 | **建议做**（另起新任务，先审核方案） | 2217 行 / 24 个零耦合演练，收益最直接：单文件降到 ~150 行、新增一门课或改一个演练不再在巨型文件里翻找；与 00027 已验证的目录化模式完全同构，风险可控 |
| `analytics.ts` 同名目录化 | **不建议现在做** | 506 行虽不小，但是单闭包状态机；拆分等于重写内核，会动 `use-learning.ts` 边界断言与学情计算，收益（少翻 500 行）远小于回归风险 |
| 拆分时顺手修 B 组 4 条 cfs 警告 | **不做** | 纯风格项；`widgets/triple.ts` 里 `sel` 可就地外提（属拆分自然结果，不算额外清理），`analytics.ts` 三条保持不动 |
| 拆分时删 `svg()` | **不做** | 00033 用户明确决策保留 |
| 拆分时改课程 design.ts 正文里的「11 个演练内核」 | **不做（本次）** | 属课程内容改动，要走 `check-course.mjs` + `pnpm verify`；且按新约定「旧记录不改」，正文描述失真应另起任务处理 |
| 本次就动手拆分 | **不做** | 用户本次要求的是「评估」；且属大改动，按 `AGENTS.md` §11 需先给用户审核方案 |

### 6.4 若用户批准 `widgets` 拆分，建议的落地形态

```
app/lib/widgets/
├── index.ts          # 唯一导出面：export const Widgets = { render, has }
├── dom.ts            # 11 个共享 helper（esc/h/button/slider/makeCtx/row/group/box/svg/…）
├── registry.ts       # const W = {} + 全部注册（或由 index.ts 直接聚合）
├── effect/           # 11 个 Effect 演练，一演练一文件（triple.ts / blueprint.ts / …）
└── rxjs/             # 13 个 RxJS 演练，一演练一文件
```

配套必改（严格按 00027 规范）：目录内兄弟值导入**显式 `.ts`**；`scripts/verify-course.mjs:23` 与 `:65`、`scripts/verify-tutor.mjs` 不涉及 widgets、无需改；`.workbuddy/skills/course-builder/scripts/check-course.mjs` 的 CLI 路径参数改传 `app/lib/widgets/index.ts`；`AGENTS.md` §2 命令示例在新任务中声明更新（不覆写旧行）。

---

## 7. 风险与注意

- A 组外提后，`use-tutor.ts` 的 `nextId` 仍依赖模块级 `feedSeq`，`goSettings` 仍依赖 Nuxt auto-import；两者在模块顶层均可用，但需以 `pnpm build` 实际产物为准。
- `noop` 常量若在 `llm.ts` 里被多处复用，注意与外部传入的 `AbortSignal` 清理逻辑保持「覆盖一次」语义不变。
- 本次**不执行** `git add` / `git commit` / `git push`；HEAD 仍为 `1191467`。
- 内核拆分若获批，必须**另起新编号任务目录**并先建 overview，不得追加到 00034。
