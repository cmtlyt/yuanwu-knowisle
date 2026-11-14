# 00035 · 演练内核目录化（`app/lib/widgets.ts` → `app/lib/widgets/`）

- 日期：2026-11-14
- 状态：**已实施**
- 关联：`docs/00034-a-group-warnings-and-kernel-review` §4 / §6（评估与方案，用户以「拆分 widgets」审核通过并授权实施）、`docs/00027-course-dir-layout`（目录化标准与导入规范）、`docs/00033-cleanup-invalid-unused-vars`（`svg()` 保留决策）

---

## 0. 本次变更会修复的历史记录内容（按 00034 起的新约定声明）

> **不改写、不追加、不标注任何已落盘记录**：`docs/00001`–`docs/00034` 全部文件、`AGENTS.md` 既有行、`docs/README.md` 既有行、`.workbuddy/skills/` 下既有参考文档、课程 `design.ts` 正文，一律保持原样。本节只在新目录里声明本次会修复什么。

| 落盘位置 | 会被本次变更修复的内容 | 新口径 |
|---|---|---|
| `docs/00034-.../overview.md` §4 表格 | 「`app/lib/widgets.ts` 2217 行 / 24 个演练」与「值导入方 `import { Widgets } from '~/lib/widgets'`」 | 单文件已不存在；改为 `app/lib/widgets/` 目录，最大子文件约 150 行；`~/lib/widgets` 由 Nuxt/Vite 解析到 `widgets/index.ts` |
| `docs/00034-.../overview.md` §6.3 / §6.4 | 「`widgets.ts` 目录化：建议做（另起新任务，先审核方案）」「本次就动手拆分：不做」 | 用户已审核方案并授权，本次在 00035 正式实施；落地形态按 §6.4，另有微调见本文 §2 |
| `docs/00034-.../overview.md` §5.3、`AGENTS.md` §3 | 剩余 warnings 基线（`lint 5 / typecheck 7`，含 `widgets.ts:114 svg()` 与 `:131 sel` 两条） | 拆分后 `svg()` 成为 `dom.ts` 的**导出** helper、`sel` 提到 `effect/triple.ts` 模块级，两条警告自然消失；新基线见本文 §4。**`svg()` 函数体一字未删**，仍按 00033 决策保留 |
| `docs/00033-.../overview.md` §7 | 「唯一剩余未使用项是 `app/lib/widgets.ts:114` 的 `svg()`，不要顺手删」 | 仍不删；只是拆分后被 `export`，oxlint 不再视为未使用声明 |
| `AGENTS.md` §2 命令示例、`.workbuddy/skills/course-builder/references/*.md`、`pitfall-resolver/references/*.md` | 示例中旧路径 `app/lib/widgets.ts` / `app/data/effect-course.ts` | 按新约定**不改原文**。正确命令见本文 §6「遗留项」 |
| `app/data/effect-course/design.ts:226/251`、`app/data/rxjs-course/design.ts:196/221` | 课程正文写「`app/lib/widgets.ts` 是 11 个演练内核」 | 按 00034 §6.3 决策「不做（本次）」，正文不改；路径与数量失真作为遗留项在本文 §6 登记，另起任务处理 |

---

## 1. 目标

把 2217 行、`@ts-nocheck` 的机械迁移 DOM 演练内核改成**同名目录 + 子模块**，降低单文件规模、让每门课/每个演练可独立定位，同时满足：

1. **24 个演练函数体逐字不动**（纯机械搬运，不改行为、不改交互、不改样式类名）。
2. **Nuxt 消费方零改动**：`app/components/course/course-widget.vue` 的 `import { Widgets } from '~/lib/widgets'` 保持原样，由 Vite 解析到 `widgets/index.ts`（00027 已实测）。
3. **Node 校验脚本仍可直连**：`--experimental-strip-types` 不解析目录 index，入口必须显式 `.../widgets/index.ts`，目录内兄弟值导入必须写显式 `.ts`（00027 定稿规范）。
4. `Widgets.render/has` 门面契约不变，`W` 映射键（课程数据引用的 widget id）一个不改。

---

## 2. 变更计划

### 2.1 目录结构（定稿）

```
app/lib/widgets/
├── index.ts          # 唯一对外导出面：import 24 个演练 + esc → const W = {...} → export const Widgets = { render, has }
├── dom.ts            # 9 个共享 helper：esc/h/button/slider/makeCtx/row/group/box/svg（全部 export）
├── effect/           # 11 个 Effect 演练，一演练一文件
│   ├── triple.ts  blueprint.ts  runloop.ts  scheduler.ts  cause.ts  layer.ts
│   └── scope.ts   fiber.ts      concurrency.ts stream.ts   retry.ts
└── rxjs/             # 13 个 RxJS 演练，一演练一文件
    ├── rxjs-source.ts  rx-cold-hot.ts  rx-teardown.ts  rx-observer.ts rx-transform.ts
    ├── rx-filter.ts    rx-flatten.ts   rx-cross.ts     rx-retry.ts    rx-subject.ts
    └── rx-share.ts     rx-scheduler.ts rx-combine.ts
```

- 文件名 kebab-case；导出函数名沿用原 `W` 键（camelCase），如 `rxjsSource` → `rxjs/rxjs-source.ts`。
- 每个文件顶部带 `// @ts-nocheck`（与原单文件同），`index.ts` 亦然。
- 每个演练文件只 import 它实际用到的 `dom.ts` helper（用脚本扫描函数体生成，避免 `no-unused-vars`）。
- `W` 由 `index.ts` 用**对象字面量显式聚合**，取消原先 24 处 `W.xxx = function` 的副作用式注册，消除注册顺序依赖。

### 2.2 机械迁移规则

| 原结构 | 新结构 |
|---|---|
| `W.triple = function (root, onDone) { ... }` | `export function triple(root, onDone) { ... }`（函数体逐字复制） |
| 块前 `/* ---------- N. 标题 ---------- */` | 保留为该文件顶部说明 |
| 顶层 9 个 helper（L8–119） | `dom.ts`，逐个 `export` |
| 末尾 `export const Widgets = { render, has }`（L2203–2217） | `index.ts`，`render` 内 `W[name]` 与 `esc(err.message)` 不变 |
| `W.triple` 内的局部 `sel`（L131，唯一 B 组 cfs 警告） | 提到 `effect/triple.ts` 模块级（仅位置变化，函数体不变） |

### 2.3 引用点改动（只改运行代码 / 校验脚本）

| 文件 | 改动 |
|---|---|
| `scripts/verify-course.mjs:23` | `import('../app/lib/widgets.ts')` → `import('../app/lib/widgets/index.ts')` |
| `scripts/verify-course.mjs:65` | 静态资源数组 `'app/lib/widgets.ts'` → `'app/lib/widgets/index.ts'` |
| `app/components/course/course-widget.vue` | **零改动**（`~/lib/widgets` 由 Vite 解析目录 index，build 实测） |
| `.workbuddy/skills/course-builder/scripts/check-course.mjs` | **零改动**：`load()` 在 00027 已支持目录自动补 `index.ts`，调用方传 `app/lib/widgets` 即可 |
| `app/lib/widgets.ts` | **删除**（git 识别为 delete + add，同 00027 定稿迁移方式） |

### 2.4 明确不动

- 课程 `design.ts` 正文、`AGENTS.md` §2/§3、`docs/README.md` 既有行、`docs/00001`–`00034` 全部文件、`.workbuddy/skills/` 下全部 `.md` 参考文档。
- `app/lib/analytics.ts`（00034 §6.3 决策：不拆）。
- B 组 `analytics.ts` 三条 cfs、C 组 `use-learning.ts` 两条边界断言。
- `svg()` 函数体（00033 保留决策）。

---

## 3. 验证方案

1. 迁移前后**逐字比对**：脚本生成时校验 24 个函数体与原文件对应行完全一致（去掉首行签名与尾部空行后做字符串比较）。
2. 门禁顺序：`pnpm fmt` → `pnpm fmt:check` → `pnpm lint` → `pnpm typecheck` → `pnpm verify` → `pnpm build` → `python scripts/smoke.py --base http://127.0.0.1:3199`，全部记录退出码与关键数字；临时 3199 服务跑完立即关闭。
3. `pnpm verify` 必须包含「演练组件映射有效」断言（Effect 11 + RxJS 13 个 widget id 全部 `Widgets.has()` 为真）。
4. `node --experimental-strip-types .../check-course.mjs app/data/effect-course app/lib/widgets` 与 rxjs 各跑一遍（**传目录**，验证 `load()` 补 `index.ts`）。
5. `oxlint -f json` 取 `labels[-1].span` 复核剩余警告，确认 A 组已消失、`svg()`/`sel` 两条因拆分自然消失、`analytics.ts` 与 `use-learning.ts` 的 5 条原样保留。
6. `pnpm build` 产物里确认 `~/lib/widgets` 解析到目录 index、无运行时未定义。

---

## 4. 实施结果

### 4.1 变更文件

| 变更 | 数量 / 内容 |
|---|---|
| 删除 | `app/lib/widgets.ts`（2217 行） |
| 新增 | `app/lib/widgets/` 共 **26 个 .ts**：`index.ts`（74 行）+ `dom.ts`（118 行）+ `effect/` 11 个 + `rxjs/` 13 个 |
| 单文件规模 | 最大 `effect/layer.ts` **138 行**；目录合计 2323 行（多出的 ~106 行是 24 份文件头 / import / 签名开销） |
| 修改 | `scripts/verify-course.mjs` 两处（import 与静态资源数组改指 `app/lib/widgets/index.ts`） |
| 修改 | `docs/README.md` 追加 00035 一行；本 overview 新建 |
| 零改动 | `app/components/course/course-widget.vue`、`check-course.mjs`、`app/lib/analytics.ts`、课程 `design.ts` 正文、`AGENTS.md` 既有行、`docs/00001`–`00034` 全部文件、`.workbuddy/skills/` 全部参考文档 |

`course-widget.vue` 的 `import { Widgets } from '~/lib/widgets'` 保持原样，由 Vite 解析到 `widgets/index.ts`（build 实测通过，见 §4.3）。

### 4.2 门禁结果（全部 exit 0）

| # | 命令 | 退出码 | 关键数字 |
|---|---|---|---|
| 0 | 迁移脚本 | 0 | `BLOCKS=24 BODY_MATCH=24/24`，24 个函数体逐字一致 |
| 1 | `pnpm fmt` / `pnpm fmt:check` | 0 | 147 文件全部符合格式 |
| 2 | `pnpm lint` | 0 | **0 error / 3 warning**（原 5）：只剩 `analytics.ts` 三条 cfs |
| 3 | `pnpm typecheck` | 0 | **0 error / 5 warning**（原 7）：3 条 cfs + 2 条 `use-learning.ts` 边界断言 |
| 4 | `pnpm verify` | 0 | 双课程全轨迹（effect 71% / rxjs 74% 自洽）+ **演练组件映射有效：Effect 11 + RxJS 13 全部 `Widgets.has()` 为真** + 助学 Agent 自检全通过 |
| 5 | `check-course.mjs`（传 **目录**） | 0 | effect / rxjs 各一遍全绿，包括「演练映射」段；`load()` 自动补 `index.ts` 生效 |
| 6 | `pnpm build` | 0 | 56.0s（首次生成 26 个新模块类型，慢于常规 13s）；Nitro cloudflare-module |
| 7 | `python scripts/smoke.py --base http://127.0.0.1:3199` | 0 | 18 条 SSR 路由 + 6 条客户端渲染（演练挂载、无运行时异常）+ 21 条真实视口 |

临时 `wrangler dev --port 3199` 已按 §10 收尾纪律关闭（运行 35s，killed）。

### 4.3 打包覆盖抽查

读 `.output/public/_nuxt/*.js`（626320 字节）逐个比对 24 个演练的 `makeCtx` 标题：

```text
演练标题提取=24，命中 client bundle=24
缺失：(无)
门面字符串 演练加载失败: true
```

证明 `~/lib/widgets` 正确解析到目录 index，24 个子模块全部被 `W` 引用并打进客户端产物，没有被 tree-shake 误删。

### 4.4 剩余 warnings 新基线（按 `labels[-1]` 主标签复核，零重复）

| 组 | 位置 | 规则 | 说明 |
|---|---|---|---|
| B | `app/lib/analytics.ts:40` / `:112` / `:119` | `consistent-function-scoping` | 按 00034 决策保留，不动迁移内核 |
| C | `app/composables/use-learning.ts:34` / `:50` | `no-unsafe-type-assertion` | 内核边界断言，改注解会触发 TS2322 |

**自然消失的 2 条（非主动清理）**：
- `widgets.ts:114 svg()` 的 `no-unused-vars`：函数体一字未删，搬到 `dom.ts` 后成为 `export` helper，oxlint 不再视为未使用声明；仍按 00033 决策保留可复用实现。
- `widgets.ts:131 sel` 的 `consistent-function-scoping`：搬到 `effect/triple.ts` 模块级（仅位置变化）。

新基线：**`lint 3 / typecheck 5`，0 error**；26 个新文件零警告，说明每个文件的 helper import 精确且 `@ts-nocheck` 逐文件生效。

### 4.5 踩坑库闭环

本次未出现新的报错或门禁失败。实施前按 `AGENTS.md` §1 加载 `pitfall-resolver`，命中 `references/course-content.md`「Node 不解析目录 index、目录内值导入须显式 `.ts`」与 `references/verification.md` 的目录参数写法，直接采用 00027 定稿规范，**零返工**。按用户「历史记录不可矫正」约定，未修改任何已落盘文档；本次实证结论只记在本 overview 与工作日志。

### 4.6 验证覆盖边界（如实说明）

- `pnpm verify` / `check-course.mjs` 验证的是 24 个 widget id 的**注册映射**（`Widgets.has()`）。
- `smoke.py` 的客户端渲染断言实际挂载了 6 个页面对应的演练；并非 24 个演练逐个在浏览器里 render 一遍。
- 24 个演练函数体逐字未改（迁移脚本 `BODY_MATCH=24/24`），且全部进入 client bundle（§4.3），因此未逐演练重复跑浏览器断言。

---

## 5. 风险与注意

- **同名目录 + 删单文件**：Vite 对 `~/lib/widgets` 的解析需以 `pnpm build` 实测为准；若解析失败再显式改 `course-widget.vue` 的 import 为 `~/lib/widgets/index.ts`（不在计划内）。
- **`@ts-nocheck` 必须逐文件带上**：漏一个会让 type-aware 规则在该文件报大量隐式 any 诊断。
- **import 必须精确**：多 import 一个 helper 会触发 `no-unused-vars`（快速规则在 `@ts-nocheck` 文件里仍生效）；生成后以 `pnpm lint` 复核。
- 本次**不执行** `git add` / `git commit` / `git push`；HEAD 仍为 `1191467`。

---

## 6. 遗留项（本次按已审核方案不处理，需另起任务）

| 项 | 位置 | 说明 |
|---|---|---|
| 课程正文路径 / 数量失真 | `app/data/effect-course/design.ts:226/251`、`app/data/rxjs-course/design.ts:196/221` | 仍写 `app/lib/widgets.ts` 与「11 个演练内核」；实际已是 `app/lib/widgets/` 目录 + 24 个演练。属课程内容改动，需走 `check-course.mjs` + `pnpm verify` |
| `course-widget.vue` 注释 | `app/components/course/course-widget.vue:5` | 注释仍写「11 个零依赖 DOM 演练内核」 |
| 命令示例旧路径 | `AGENTS.md` §2、`course-builder/references/{data-model,workflow}.md`、`pitfall-resolver/references/{course-content,verification,toolchain}.md` | 按「历史记录不可矫正」约定不改原文；正确写法：`node --experimental-strip-types .workbuddy/skills/course-builder/scripts/check-course.mjs app/data/effect-course app/lib/widgets`（目录参数，`load()` 自动补 `index.ts`） |
| `analytics.ts` 目录化 | `app/lib/analytics.ts` | 00034 §6.3 决策「不建议现在做」，理由未变 |
