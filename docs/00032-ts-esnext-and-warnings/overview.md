# 00032 · TS target 显式固化与高价值 / 高风险 warnings 修订

> **状态：已完成（2026-11-14）。** 先建本文件再动代码，遵循 `AGENTS.md` §11；§1–§6 保留计划阶段原文，最终结论以 §7 为准。
> 关联：00028（助学 Agent 落地）、00029（审计修复）、00031（意图路由与提示词）、上一轮「全部 lint warn 统计」。未使用变量统计见 `unused-vars.md`。

## 1. 目标

1. 把「TS target = ESNext、允许最新 JS 特性」这层意图**写进受版本控制的配置文件**，并放开构建产物的语法降级。
2. 修订上一轮统计出的 **高价值 / 高风险 warnings**；`no-unused-vars` 按用户要求**不修**，单独产出「未使用项的功能与成因」统计表。
3. 全链路回归，确认行为等价、门禁数字与产物可用。

## 2. 关键发现：target 本来就是 ESNext

| 项 | 实测 |
|---|---|
| 根 `tsconfig.json` | solution-style：`files: []` + 4 条 `references`，**无 `compilerOptions`**；不参与实际编译 |
| `.nuxt/tsconfig.app.json` | `target: "ESNext"`，`lib: ["ESNext","dom","dom.iterable","webworker"]`，`extends` 为 `None` |
| `.nuxt/tsconfig.server.json` | `target: "ESNext"`，`lib: ["esnext","webworker","dom.iterable"]` |
| `.nuxt/tsconfig.shared.json` / `node.json` | `target: "ESNext"` |
| 生成目录 | `.nuxt/` 被 `.gitignore` 忽略，直接改会在下次 `nuxt prepare` 被覆盖 |
| Vite 8.3.8 默认 | `build.target = "baseline-widely-available"`（会把较新语法转译到兼容基线） |

因此本步**不是「升级」，而是「固化 + 放开降级」**：

- `nuxt.config.ts` 加 `typescript.tsConfig.compilerOptions.target = "ESNext"`（Nuxt 4.6.4 schema 提供 `typescript.tsConfig` / `appTsConfig` / `serverTsConfig`），让意图持久化且不被 Nuxt 默认值变化影响；**只设 `target`，不覆盖 `lib`**，避免把 app / server 各自的 lib 合并错。
- `nuxt.config.ts` 加 `vite.build.target = "esnext"`，让客户端产物保留现代语法。
- 说明：`Array.prototype.toReversed` / `toSorted` 是 **ES2023 运行时 API，不是语法**，构建 target 不会 polyfill 它们；运行可用性依赖浏览器基线（Chrome 110+ / Safari 16.4+ / Firefox 115+）、Node 22 与 Cloudflare Workers（`compatibilityDate: 2026-11-13`）。本项目「移动优先 + 现代运行时」接受该基线。

## 3. warnings 分类与取舍

上一轮实测：`pnpm lint` 27 条、`pnpm typecheck` 36 条；按「规则+文件+行+列」去重后 **32 条独立 warning、8 种规则、0 errors**。
其中 `consistent-function-scoping` 在 `use-tutor.ts:85` / `analytics.ts:34` 各重复报 3 次（27→23、36→32 的差额）。

| 类别 | 规则 | 条数 | 决策 | 理由 |
|---|---|---:|---|---|
| **高风险** | `typescript/no-unsafe-type-assertion` | 8（修 6 / 保留 2） | **部分修** | 6 条 `JSON.parse` / `res.json()` / WebGL 断言改运行时守卫；`use-learning.ts` 2 条按踩坑库既有结论保留（§7.2） |
| **高风险** | `typescript/consistent-return` | 1 | **修** | `pageTone()` switch 无 default，理论上可返回 `undefined` 拼进 system prompt |
| **高风险** | `eslint/no-unmodified-loop-condition` | 1 | **修** | SSE 读取循环 `while (!stopped)` 的修改发生在闭包 `feed()` 里，静态分析不可见；改成显式 break |
| **高价值** | `unicorn/no-array-reverse` 7 + `no-array-sort` 2 | 9 | **修** | 全部是「先复制再变异」，改 `toReversed()` / `toSorted()` 语义等价；是 ESNext 基线的直接收益 |
| **高价值** | `unicorn/prefer-add-event-listener` | 1 | **修** | `FileReader.onload` 赋值会覆盖已有 handler，改 `addEventListener('load')` |
| 低价值 | `unicorn/consistent-function-scoping` | 5（输出 9） | 不修 | 纯风格「函数可外提」，且同一位置重复报 3 次；改动面大、收益低 |
| 用户指定 | `eslint/no-unused-vars` | 7 | **不修** | 单独统计功能与成因，见 `unused-vars.md` |

合计：**修 18 条 / 保留 14 条**（7 未使用 + 5 函数作用域 + 2 边界断言）。修完 `lint` 16 条、`typecheck` 18 条输出（去重 14 条）。计划阶段写的「修 20 条」在实施中被踩坑库纠正，详见 §7.2。

## 4. 变更计划（文件级）

| 文件 | 动作 |
|---|---|
| `nuxt.config.ts` | 加 `typescript.tsConfig` 与 `vite.build.target` |
| `app/lib/tutor/llm.ts` | `res.json()` / SSE 帧解析改类型守卫；`while (!stopped)` 改显式 break 循环 |
| `app/lib/tutor/config.ts` | 两处 `JSON.parse(...) as` 改字段守卫，保持 `stale` / `absent` 契约 |
| `app/lib/tutor/history.ts` | `CourseFile` 解析改守卫，保持 `{ groups: [] }` 兜底 |
| `app/lib/tutor/context.ts` | `pageTone()` 补穷尽返回，**不改 `dashboard` / `review` 档文案**（00029 B1 边界） |
| `app/lib/tutor/fingerprint.ts` | WebGL 上下文断言改 `instanceof` 窄化 |
| `app/lib/tutor/guards.ts` | **新增**：`isRecord()` 共享运行时守卫（实施中新增，计划阶段未列） |
| `app/composables/use-learning.ts` | 两处 `as LearningState` **保留**并补注释（TS2322 约束，见 §7.2） |
| `app/components/tutor/tutor-drawer.vue` | `[...feed].reverse()` → `toReversed()` |
| `app/lib/analytics.ts` | 2 处 `.sort()` → `.toSorted()`（`@ts-nocheck` 内核，纯替换） |
| `app/lib/widgets.ts` | 6 处 `.slice().reverse()` → `toReversed()`（同上） |
| `app/pages/courses/[slug]/review.vue` | `.slice(-12).reverse()` → `.toReversed()` |
| `app/pages/courses/[slug]/settings.vue` | `reader.onload` → `addEventListener('load')` |
| `docs/00032-*/` | `overview.md`（本文）、`unused-vars.md`（统计表） |
| `AGENTS.md` / `docs/README.md` / 踩坑库 / 工作记忆 | 收尾回写 |

## 5. 验证方案

1. 快门禁：`pnpm fmt` → `fmt:check` → `lint` → `typecheck`，比对 warnings 数量（预期 27→16、36→16）。
2. `pnpm verify`（课程数据 + 助学 Agent 纯计算自检）。
3. `pnpm build`（Workers 产物，需 `CODEBUDDY_SAFE_DELETE_ENABLED=0 NUXT_IGNORE_LOCK=1`）；**额外核对 `.nuxt/tsconfig.*.json` 的 target 仍为 ESNext、`vite.build.target` 生效**。
4. `wrangler --cwd .output dev --port 3199` + `python scripts/smoke.py`（18 SSR + 6 客户端 + 22 视口）。
5. 动态探针：`scripts/tutor-mock.py`(3210) + `scripts/tutor-probe.py`，63 条断言 0 FAIL —— 重点确认 SSE 解析、`pageTone` 文案、导出/导入路径未被守卫改写坏。
6. 逐项对照：改前的 32 条明细与改后输出，确认消失的正是本表「修」的 20 条，没有误伤。
7. 收尾：停服务、删临时文件、更新本文 §7 结果、登记索引、回写踩坑库与记忆。

## 6. 不改动边界

- 不动 `app/data/**`、`types/tutor.ts`、课程契约、CI workflow、`package.json` 依赖版本。
- **不改 7 条 `no-unused-vars`**（用户明确要求）、不改 `consistent-function-scoping`、不改旧 docs 目录。
- 保持 00028/00029/00031 核心约定：`feed` 是 LLM 请求体唯一真实来源；`askAi()` 直接调 `runLlm()`；`dashboard` / `review` 档文案不含「学情摘要」；配置解密失败归 `stale`；OPFS 读写失败兜底 `{ groups: [] }`。
- `toReversed` / `toSorted` 只替换「已有 `.slice()` / spread 复制」的位置，绝不替换依赖原地变异的代码（已逐处核对，9 处全部安全）。
- 未经指示不 `git add` / `git commit` / `git push`。

## 7. 实施结果（2026-11-14）

### 7.1 配置与改动落地

- `nuxt.config.ts` 新增 `typescript.tsConfig.compilerOptions.target = "ESNext"` 与 `vite.build.target = "esnext"`。`pnpm exec nuxt prepare` 复验：4 份 `.nuxt/tsconfig.*.json` 的 `target` 仍为 `ESNext`，`lib` 未被覆盖（app / server 各自保留原值）。产物 `.output/public/_nuxt/*.js` 中可直接检索到 `toReversed`，证明未被降级。
- 新增 `app/lib/tutor/guards.ts`（`isRecord()`）；`config.ts` / `history.ts` / `llm.ts` / `fingerprint.ts` 的 6 处 `as` 改为运行时守卫，`pageTone()` 补 `default` 兜底，SSE 循环改 `for (;;) + 显式 break`。
- 9 处数组变异改 `toReversed()` / `toSorted()`（逐处确认均为「先复制再变异」，无依赖原地变异的位置）；`settings.vue` 的 `reader.onload` 改 `addEventListener('load')`。
- **未动**：7 条 `no-unused-vars`、5 条 `consistent-function-scoping`、`app/data/**`、`types/tutor.ts`、CI workflow、依赖版本、旧 docs 目录；未经指示未执行任何 git 写操作。

### 7.2 计划偏差：两处断言必须保留（踩坑库命中）

实施中把 `use-learning.ts` 的 `as LearningState` 换成「带类型的局部变量注解」后，`pnpm typecheck` 报 `TS2322`：`@ts-nocheck` 内核 `defaultState()` 把 `theme` 推断为 `string`，而 `LearningProfile.theme` 是 `'light' | 'dark'`。按 `pitfall-resolver/SKILL.md` 查库**直接命中** `references/toolchain.md` 既有条目（「在 composable 边界收口、别改迁移内核」），恢复断言并补注释。因此实际修 18 条而非 20 条，`typecheck` warnings 为 18 而非预期 16。

> 结论：`no-unsafe-type-assertion` 不是都能「消掉」；迁移内核边界的断言是类型契约的一部分，强行替换会引入编译错误。该条已回写踩坑库。

### 7.3 门禁数字（全部实测）

| 阶段 | 结果 |
|---|---|
| 快门禁 | `FMT=0` / `LINT=0`（**16 warnings**）/ `TC=0`（**18 warnings**） |
| warnings 前后 | `lint 27 → 16`、`typecheck 36 → 18`；唯一条目 `32 → 14`，消失的 18 条逐一对上 §3「修」的范围 |
| 内容门禁 | `VERIFY=0`（课程两门 + 助学 Agent 纯计算自检，含 00031 语境约束断言） |
| 构建 | `BUILD_EXIT=0`，14.1s（`CODEBUDDY_SAFE_DELETE_ENABLED=0 NUXT_IGNORE_LOCK=1`） |
| SSR / 视口 | `SMOKE_EXIT=0`，18 SSR + 6 客户端 + 22 视口无横向溢出（review 页 computed 已执行 `toReversed`） |
| 动态回归 | `PROBE_EXIT=0`，**63 PASS / 0 FAIL**（SSE 解析、配置解密、OPFS 降级、意图路由、system 首帧全绿） |
| 运行时 API | 真实 Chrome CDP 探针 + SSR 冒烟均未出现 `toReversed is not a function` |

### 7.4 收尾与未覆盖

- `docs/README.md` 登记 00032；`AGENTS.md` §3 的 warnings 基线由 `19 / 21` 更新为 `16 / 18`（并补「去重 14」口径）；踩坑库 `toolchain.md` 命中条目补充新解法、`SKILL.md` 速查表补关键词；工作记忆已追加。
- 3199 / 3210 服务已停、端口释放；临时 JSON 已删。
- **未覆盖**：`toReversed` / `toSorted` 在旧浏览器（Chrome <110 / Safari <16.4）会直接抛错且不会被 polyfill；本项目按「现代运行时」基线接受，未做特性检测或降级。真实 LLM 端点仍受 00030 的 CORS 预检限制，与本次改动无关。
- 7 条未使用变量按用户要求未修，功能与成因见 `unused-vars.md`。
