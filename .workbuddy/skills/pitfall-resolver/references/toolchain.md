# 工具链 / 依赖 / 类型检查

按「症状 → 根因 → 处理」记录。命令以本仓库实测为准（Node 22.22.2、pnpm 11.3.0、TypeScript 7.0.2）。

## TypeScript 7 与 ESLint 生态

| 症状 | 根因 | 处理 |
|---|---|---|
| `npx eslint .` 退出 2，报 `typescript-eslint does not support TS 7.0` | TS 7 是 Go 原生编译器，**无 programmatic Compiler API**（`require('typescript')` 只剩 `version` / `versionMajorMinor`）；`@typescript-eslint/parser@8.72.2` peer 要 `typescript >=4.8.4 <6.1.0` 且加载时主动拒版 | 不要 `--force` / `--legacy-peer-deps`（只把失败推迟到运行期）。二选一：① 降级 TS 6 + ESLint + `vue-tsc`（SFC 模板类型完整）；② 迁 **oxlint + oxlint-tsgolint**（保 TS 7，推荐） |
| `nuxi typecheck` 提示装 `vue-tsc` 或 `golar + @golar/vue` | Nuxt 4 把类型检查外包给外部 checker，仓库两者都没装；`@nuxt/cli` 优先级 `vue-tsc` → `golar` | oxlint 路线改用 `oxlint --type-aware --type-check`；否则 `pnpm add -D vue-tsc`（需 TS 6 API）或 `pnpm add -D golar @golar/vue`（首次生成 `golar.config.ts`） |
| `@oxlint/migrate --details` 退出 1，报同一 `typescript-eslint does not support TS 7.0` | 迁移工具读 flat config 仍加载 TS parser | 手写 `.oxlintrc.json`；原 `eslint.config.mjs` 若只有空 `withNuxt()` 无自定义规则，成本极低 |
| `require('esbuild')` / `require('typescript')` 拿不到 API | pnpm 隔离未 hoist，且 TS 7 无 JS API | 不要依赖 `esbuild.transformSync` 做语法检查；用 `node --check <file>` 或 `pnpm lint` / `pnpm typecheck` |
| 导入 `.ts` 数据模块报未知扩展名 | Node 22 需 type stripping | `node --experimental-strip-types script.mjs data.ts`。Node 22.18+ 默认启用但显式更保险 |

### 迁移到 Oxc 的落地口径

- 依赖：`oxlint`（Rust 原生，不依赖 TS API）+ `oxlint-tsgolint`（基于 typescript-go，**要求 TS 7.0+**）+ `oxfmt`；移除 `eslint`、`@nuxt/eslint`、`eslint.config.mjs`、`nuxt.config.ts` 里的 `'@nuxt/eslint'`，清 `.nuxt/eslint.config.mjs` 残留。
- 脚本分层：`lint` 只跑快速规则；`typecheck` 用 `--type-aware --type-check` 给类型感知规则 + TS 诊断；`fmt` / `fmt:check` 交 oxfmt。`typeAware` / `typeCheck` **不写进 `.oxlintrc.json`**，由 CLI 开启。
- `oxlint-tsgolint` 版本随 TS 小版本绑定（`7.0.2007` ↔ TS 7.0.2），升级同步换；三个包精确锁定。
- 边界：oxlint 只查 `.vue` 的 `<script>`，`--type-check` **不等于** `vue-tsc` 模板检查；tsgolint 无 Vue 语言服务。本项目模板以 `v-for` / `:class` 为主，代价可接受；必须覆盖模板则需 TS 6 / 7 双版本并存。

## 类型检查归零时的典型修复

| 症状 | 根因 | 处理 |
|---|---|---|
| `TS2322`：`theme: string` 不满足 `'light' \| 'dark'`；把 `as LearningState` 换成带类型局部变量注解后报错 | `@ts-nocheck` 迁移引擎让 `defaultState()` 推断 `theme: string`，与 `LearningProfile` 的字面量联合不兼容；局部变量注解要求可赋值，`as` 允许宽→窄 | composable 边界**保留** `as LearningState`（`defaultStateOf()` / `load()` 两处），别改内核；这里 `no-unsafe-type-assertion` 是必要契约的 warning，别为归零替换。00032 实测：替换后 1 error，恢复后 0。可安全替换的是 `JSON.parse` / `res.json()` 这类可运行时校验的断言（`unknown` + `isRecord` + 字段守卫） |
| `typescript/no-base-to-string`：`String(unknown)` 仍被视为 object | `unknown` 未窄化就字符串化 | 分支窄化 `typeof s === 'string' ? s : s == null ? '' : typeof s === 'object' ? JSON.stringify(s) ?? '' : String(s)`，再用 `ESCAPE_MAP[c] ?? c` 替代断言 |
| `typescript/no-implied-eval` 对 `setTimeout(fn, ms)` 误报 | 回调参数隐式 any | 给 `later` / `every` 回调标注 `() => void` |
| `TS2532 Object is possibly 'undefined'`：`Uint8ClampedArray`（canvas `getImageData().data`）下标逐个报错 | `.nuxt/tsconfig` 开了 `noUncheckedIndexedAccess` | 每处 `?? 0` 收口：`(Math.imul(h, 31) + (data[i] ?? 0)) \| 0`；不要 `data[i]!`（触发 `no-unsafe-type-assertion`） |
| `TS2769 No overload matches this call`：`crypto.subtle.decrypt/encrypt({ name:'AES-GCM', iv }, ...)` 的 `iv` 报错 | TS 5.7+ TypedArray 泛型化，`Uint8Array<ArrayBufferLike>` 不满足 WebCrypto `BufferSource` 的 `ArrayBufferView<ArrayBuffer>` | 构造 `new Uint8Array(new ArrayBuffer(len))` 并返回 `Uint8Array<ArrayBuffer>`；`TextEncoder().encode()` / `crypto.getRandomValues(new Uint8Array(12))` 已是该类型 |
| `TS2339 Property 'getDirectory' does not exist on type 'FileSystemDirectoryHandle'`（OPFS） | `getDirectory()` 属于 `navigator.storage`；目录句柄用 `getDirectoryHandle(name, { create })`，另有 `getFileHandle` / `removeEntry` / `createWritable` | 改 `root.getDirectoryHandle('tutor', { create: true })`。这是**真实运行时 bug**，typecheck 提前拦住 |
| `TS2345`：`@ts-nocheck` 内核 `createAnalytics()` 返回对象不满足最小接口（如 `NavEngine`） | 内核推断更宽：`prereqBlocked` 可为 `null`、`lessonId` 可为 `undefined`，与自拟 `boolean` / `string \| null` 不符 | 在**消费方边界**按真实形状放宽（`boolean \| null`、`string \| null \| undefined`）并同步放宽内部 helper；别改内核、别 `as` 强转。实测 2026-11-14 |
| 大量 `no-unsafe-type-assertion` / `no-unnecessary-type-assertion`（`JSON.parse(...) as T`、`err as Error`、`x as SomeType`） | tsgolint 把「从 any/unknown 收窄」判为 warning | 是 warnings 不是 errors（通过线 0 errors），不必为归零大改；阻塞项优先按上面修 `TSxxxx` |

## TS target 与现代 JS API（00032，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 想提 target 到 ESNext，但根 `tsconfig.json` 无 `compilerOptions`；改 `.nuxt/tsconfig.*.json` 下次 `nuxt prepare` 被覆盖 | 根配置 solution-style（`files: []` + `references`），实际 target 由生成的 4 份 `.nuxt/tsconfig.*.json` 决定，**默认已是 ESNext** 且不 extends 根，生成目录被 gitignore | 意图写进 `nuxt.config.ts`：`typescript: { tsConfig: { compilerOptions: { target: 'ESNext' } } }`，**只设 target 不覆盖 `lib`**（app / server 的 lib 各自生成，合并会出错）；产物不降级另加 `vite: { build: { target: 'esnext' } }`（Vite 8 默认 `baseline-widely-available`）。跑 `pnpm exec nuxt prepare` 复验再 `pnpm build` |
| 为消除 `unicorn/no-array-reverse` / `no-array-sort` 把 `.reverse()` / `.sort()` 改成 `toReversed()` / `toSorted()`，担心旧环境报错 | 是 **ES2023 运行时 API 不是语法**，target 不转译不 polyfill | grep 确认先 `.slice()` / spread 复制再变异（否则语义变）；替换后跑真实浏览器 CDP + SSR 冒烟确认无 `xxx is not a function`。接受基线 Chrome 110+ / Safari 16.4+ / Firefox 115+ / Node 20+ / workerd；旧浏览器需检测或保留原写法 |

## pnpm / 依赖

| 症状 | 根因 | 处理 |
|---|---|---|
| `pnpm smoke -- --base http://...` 参数解析失败 | pnpm 11 把 `--` 原样透传给 Python | 直接 `python scripts/smoke.py --base http://127.0.0.1:3199` |
| `pnpm-workspace.yaml` 多出 `minimumReleaseAgeExclude` | pnpm 11 为新发布二进制放行安装策略 | **保留**，删了后续 `pnpm install` 受阻 |
| `pnpm peers check` 报 `unctx` 期望 `oxc-parser>=0.140`、`unplugin^3.3.0` | 既有 Nuxt 依赖的 peer | 记录为已知限制，不阻塞 `verify` / `build`，不要为此降级 Nuxt |
| `pnpm install --frozen-lockfile` 失败 | `package.json` specifier 与 lockfile 不一致 | 先 `pnpm install` 同步 lock 的 `specifier`，再 `--frozen-lockfile` 复验；`^` 范围不破坏可复现性 |

## 版本口径与调试

- 纯工具依赖（husky / commitlint / lint-staged）与 TS 无绑定，用 `^` 即可。
- 调试 commitlint：`printf 'feat: 示例' | pnpm exec commitlint --quiet`。
- 忽略规则用 `git check-ignore -v <path>`；判断「可追踪」用 `if git check-ignore -q <path>; then ... fi`。
- 影子运行不改项目：`npx --yes oxlint@latest app`（输出到系统临时目录，不写仓库）。

## 手工编辑后的格式差异

| 症状 | 根因 | 处理 |
|---|---|---|
| `pnpm fmt:check` 只列一个文件（如 `nuxt.config.ts (0ms)`）后报 `Format issues found in above 1 files`，退出 1 | 手工增删数组 / 对象成员后 oxfmt 按 `printWidth: 110` 重判换行：元素变少应压单行，反之展开 | 直接 `pnpm fmt`（`oxfmt --write`）写回，再按门禁重跑**全部**回归。`lint-staged` 提交时对暂存的 TS/Vue/JSON 自动 oxfmt，但本地门禁先归零。实测 2026-11-13：删 Nuxt modules 两项、删 verify 静态资源一项均触发；一次改动可能不止一个文件，统一 `pnpm fmt` 一次即可 |

## oxlint 结构化统计口径（00034 探查，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| `oxlint -f json` 按 `labels[0].span` 去重得出「唯一 8 条、`consistent-function-scoping` 2 个位置各重复 3 次」，但 `pnpm typecheck` 输出 12 条 | `unicorn/consistent-function-scoping` 有 2 个 label：`labels[0]` 是 `Outer scope where this function is defined`（父函数，如 `useTutor()` L85），`labels[-1]` 才是 `This function does not use any variables from the parent function`（真实位置，如 `nextId` L232 / `toLlmError` L378 / `goSettings` L494）。取 `labels[0]` 把同父作用域不同函数压成一条，制造「重复 3 次」假象；`analytics.ts` 的 `createAnalytics()` 下 3 函数同理 | 统计取 **`labels[-1].span`**（主标签）或全部 label 的 span 作 key。交叉验证：唯一条目数 = `typecheck` 输出条数；本例实为 **12 条独立诊断、零重复**，`lint` 10 = 12 − 2 条仅 tc 的 `no-unsafe-type-assertion`。写 `AGENTS.md` / overview 的 warnings 数字前复核全部 labels。判断函数能否外提还要看是否引用**模块级**变量（如 `use-tutor.ts:48` 的 `feedSeq`），模块级不算父作用域捕获 |

## no-unused-vars 分类清理（00033，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 清 `no-unused-vars` 想让 warnings 归零，却可能误删零调用但可用的 helper | 规则覆盖三类：`catch (e)` 语法占位、被抛弃的残留声明 / 计算、**有效但暂无调用点的公共工具** | 按「实现完整且可复用」分类：`catch` 体不读错误对象 → `catch {}`（ES2019 optional binding，在 `@ts-nocheck` 内核不触发新规则、降级路径逐字不变）；残留 → 删；完整零调用 helper → **保留**并接受 warning。实测 `lint 16→10` / `tc 18→12`，当时剩余 `app/lib/widgets.ts:114 svg()` 有意保留。**00035 目录化后该 warning 消失**：`svg()` 搬到 `app/lib/widgets/dom.ts` 并 export，函数体逐字保留；旧基线 `lint 3` / `tc 5` 已失效，**现行 5 / 10 见 AGENTS.md §3**（00093 实测）。原 `widgets.ts:2208` 的 `catch (err)` 读 `err.message`，不能一起改 |
| 删「多变量声明」某一项（如 `running = false`）担心破坏同组变量 | 大演练内核里同名变量常属**另一个函数作用域** | 先 `grep -nE "\\b名字\\b"` 列出全部出现，确认同函数内的读写（本例 203–269 行 `running` 属另一 widget，与 423 行无关），只删无读取点那项；删后跑 `lint` / `typecheck` / SSR 冒烟 |

## 验证脚本与依赖锁定（00029，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 新增 `scripts/verify-tutor.mjs` 后 `pnpm typecheck` 报 3 errors：`no-base-to-string`（`'want' may use Object's default stringification`）/ `restrict-template-expressions`（`string[]` 插进模板） | 用例表写成 `[route对象, '期望串']` 元组数组，`want` 推断为 `string \| route对象` | 改对象数组 `{ route: {...}, want: '...' }` 取 `kase.want`；数组用 `leaked.join(', ')` 插值。不要 `String(want)` 掩盖，也不要 `as`（触发 `no-unsafe-type-assertion`）。实测归零 |
| `python -c "import ast; ast.parse(open(f).read())"` 语法 OK，探针却报 `SyntaxError: name 'SITE' is used prior to global declaration` | `ast.parse` 不做符号表 / 作用域检查；`main()` 里 `ap.add_argument(..., default=SITE)` 在 `global SITE` 之前 | 自检改用 `compile(source, filename, 'exec')`，`global` 声明放函数第一行。实测修复后正常 |
| 把 `package.json` 的 `^3.4.17` 改精确版本后，`pnpm-lock.yaml` 的 `importers` 段没有 `dompurify` / `markdown-it` / `@types/markdown-it` 的 specifier，CI `--frozen-lockfile` 失败 | `pnpm add` 与手改 manifest 未同步 importer（上一轮只补了 packages/snapshots） | 跑 `pnpm install --lockfile-only`（本例补 87 行），`git diff pnpm-lock.yaml` 确认三条 `specifier:`，重跑 `fmt:check → lint → typecheck → verify`。`@types/markdown-it` 最新 14.2.0（无 15.x），配 `markdown-it@15` 由 `typecheck` 0 errors 验证 |

## skill 加载与活文档口径（00036，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| `Skill` 工具调用项目级 skill 报 `Can not find skill: "pitfall-resolver"` | 项目级 skill 在 `{workspace}/.workbuddy/skills/`，未注册到插件市场；`Skill` 工具只解析已注册 skill | 直接 `Read` `.workbuddy/skills/<name>/SKILL.md`，再按速查表 `Read` 命中的 `references/*.md`；不要因加载失败跳过「先查库 → 再修 → 后回写」 |
| 拆分 / 迁移后文档路径、数量、命令仍指向旧结构，不知该不该改 | 把「历史记录不可矫正」误应用到所有文档 | 保护范围只有 `docs/NNNNN-*/` 与 `AGENTS.md`/`docs/README.md` 已落盘历史基线；根 `README`、代码注释、课程正文、skill 文档是活文档，直接校正并在新任务 overview 声明。**AGENTS.md 口径（00093 起）**：不再「只能追加新行」，改为现行口径结构，修订 / 重排须新建任务记录登记被替换表述（旧口径已失效） |

## skill 文档自身占用上下文（00094，实测 2026-11-15）

| 症状 | 根因 | 处理 |
|---|---|---|
| 项目级 skill 加载吃大量上下文：`pitfall-resolver` 的 `SKILL.md` 17,353 B，其中 `description` 单行 4,537 B（逐条枚举错误码 / 工具名）、速查表 30 行约 5 KB | 把「可检索性」实现为「所有关键词堆进每次必加载文件」；description 在发现阶段进上下文，SKILL.md 全文每次展开，真正需要明细的 references 反而按需读 | ① description 只留触发规则 + 少量高信号关键词（4,537 → 546 B）；② 正文按 references 文件分组做主题路由，每组 6–8 关键词，明确「只读命中文件、不全量展开」；③ references 按需检索，**00095 起已精简用词（知识零丢失校验）**。实测 SKILL.md 17,353 → 4,158 B（−76%），正文 12,765 → 3,561 B，强制闭环语义全保留。落地 `docs/00094-pitfall-resolver-slim/` |
