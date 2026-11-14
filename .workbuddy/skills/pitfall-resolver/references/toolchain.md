# 工具链 / 依赖 / 类型检查

按「症状 → 根因 → 处理」记录。命令均以本仓库（Node 22.22.2、pnpm 11.3.0、TypeScript 7.0.2）实测为准。

## TypeScript 7 与 ESLint 生态

| 症状 | 根因 | 处理 |
|---|---|---|
| `npx eslint .` 退出码 2，报 `typescript-eslint does not support TS 7.0` | TS 7 是原生 Go 编译器，**不提供 programmatic Compiler API**（`require('typescript')` 只剩 `version` / `versionMajorMinor`）；`@typescript-eslint/parser@8.72.2` 的 peer 要求 `typescript >=4.8.4 <6.1.0`，且加载时主动检测版本并拒绝 | 不要用 `--force` / `--legacy-peer-deps`，只会把失败推迟到运行期。二选一：① 降级 TS 6 + 保留 ESLint + `vue-tsc`（SFC 模板类型检查完整）；② 迁 **oxlint + oxlint-tsgolint**（保持 TS 7，推荐） |
| `nuxi typecheck` 提示需安装 `vue-tsc` 或 `golar + @golar/vue` | Nuxt 4 把类型检查外包给外部 checker，仓库两者都没装；`@nuxt/cli` 的优先级是 `vue-tsc` → `golar`，装好即自动选中 | 走 oxlint 路线则改用 `oxlint --type-aware --type-check`；否则 `pnpm add -D vue-tsc`（需 TS 6 API）或 `pnpm add -D golar @golar/vue`（首次运行生成 `golar.config.ts`） |
| `@oxlint/migrate --details` 退出 1，报同一个 `typescript-eslint does not support TS 7.0` | 迁移工具要读取 ESLint flat config，仍会加载 TS parser | 手写 `.oxlintrc.json`；若原 `eslint.config.mjs` 只有空的 `withNuxt()`、无自定义规则，成本极低且无规则丢失 |
| `require('esbuild')` / `require('typescript')` 拿不到 API | pnpm 隔离未 hoist，且 TS 7 无 JS API | 不要依赖 `esbuild.transformSync` 做语法检查；用 `node --check <file>` 或 `pnpm lint` / `pnpm typecheck` |
| 导入 `.ts` 数据模块报未知扩展名 | Node 22 需要 type stripping | 显式写 `node --experimental-strip-types script.mjs data.ts`。Node 22.18+ 默认启用 type stripping，实测不带 flag 也能跑，但显式写法更保险 |

### 迁移到 Oxc 的落地口径

- 依赖：`oxlint`（Rust 原生解析，**不依赖 TS API**）+ `oxlint-tsgolint`（基于 typescript-go，**要求 TS 7.0+**，所以 TS 7 是前提而非障碍）+ `oxfmt`。移除 `eslint`、`@nuxt/eslint`、`eslint.config.mjs`、`nuxt.config.ts` 里的 `'@nuxt/eslint'`，并清理 `.nuxt/eslint.config.mjs` 等残留生成物。
- 脚本分层：`lint` 只跑快速规则（毫秒级）；`typecheck` 用 `--type-aware --type-check` 同时给出类型感知规则与 TS 编译器诊断；`fmt` / `fmt:check` 交 oxfmt。`typeAware` / `typeCheck` **不要写进 `.oxlintrc.json`**，由 CLI 开启。
- `oxlint-tsgolint` 版本与 TS 小版本绑定（`7.0.2007` ↔ TS 7.0.2），升级 TS 时必须同步更换；Oxc 迭代快，三个包建议精确锁定。
- 已知边界：oxlint 只检查 `.vue` 的 `<script>` 块，`--type-check` **不等价于** `vue-tsc` 的模板类型检查；tsgolint 无 Vue 语言服务。本项目模板以简单 `v-for` / `:class` 为主，代价可接受；若必须覆盖模板，需做 TS 6 / TS 7 双版本并存。

## 类型检查归零时的三类典型修复

| 症状 | 根因 | 处理 |
|---|---|---|
| `TS2322`：`theme: string` 不满足 `'light' \| 'dark'` 字面量联合；把 `as LearningState` 换成「带类型的局部变量注解」后立即报错 | 带 `@ts-nocheck` 的机械迁移引擎让 `defaultState()` 推断出 `theme: string`，与 `LearningProfile` 的字面量联合不兼容；局部变量注解要求结构可赋值，而 `as` 允许宽→窄 | 在 composable 边界**保留** `as LearningState`（`defaultStateOf()` / `load()` 两处），别改迁移内核、也别改用局部变量注解。此处 `no-unsafe-type-assertion` 是 warning 且属必要类型契约，不要为归零而替换。00032 实测：替换后 `typecheck` 1 error，恢复断言后 0 error。真正可安全替换的是 `JSON.parse` / `res.json()` 这类**可运行时校验**的断言（用 `unknown` + `isRecord` + 字段守卫） |
| `typescript/no-base-to-string`：`String(unknown)` 仍可能被视为 object | `unknown` 未窄化就字符串化 | 显式分支窄化：`typeof s === 'string' ? s : s == null ? '' : typeof s === 'object' ? JSON.stringify(s) ?? '' : String(s)`，再用 `ESCAPE_MAP[c] ?? c` 替代不安全的类型断言 |
| `typescript/no-implied-eval` 对 `setTimeout(fn, ms)` 误报 | 定时器回调参数是隐式 any | 给 `later` / `every` 的回调参数标注 `() => void` |
| `TS2532 Object is possibly 'undefined'`：遍历 `Uint8ClampedArray`（canvas `getImageData().data`）时 `data[i]`、`data[i+1]`… 逐个报错 | Nuxt/TS 7 的 `.nuxt/tsconfig` 开了 `noUncheckedIndexedAccess`，索引访问一律返回 `number \| undefined` | 每个下标用 `?? 0` 显式收口：`(Math.imul(h, 31) + (data[i] ?? 0)) \| 0`。不要写 `data[i]!` 断言（会触发 `no-unsafe-type-assertion` 警告） |
| `TS2769 No overload matches this call`：`crypto.subtle.decrypt/encrypt({ name:'AES-GCM', iv }, ...)` 的 `iv` 报错 | TS 5.7+ 起 TypedArray 泛型化，`Uint8Array`（默认 `Uint8Array<ArrayBufferLike>`）不满足 WebCrypto `BufferSource` 要求的 `ArrayBufferView<ArrayBuffer>` | 构造函数返回 `Uint8Array<ArrayBuffer>`：`new Uint8Array(new ArrayBuffer(len))`，并把返回类型标为 `Uint8Array<ArrayBuffer>`；`TextEncoder().encode()` / `crypto.getRandomValues(new Uint8Array(12))` 本身就是该类型，无需改 |
| `TS2339 Property 'getDirectory' does not exist on type 'FileSystemDirectoryHandle'`（OPFS） | `getDirectory()` 是 `navigator.storage` 的方法；目录句柄取子目录用 `getDirectoryHandle(name, { create })`，另有 `getFileHandle` / `removeEntry` / `createWritable` | 改 `root.getDirectoryHandle('tutor', { create: true })`。这是**真实运行时 bug**（不只是类型错），typecheck 能提前拦住 |
| `TS2345`：把 `@ts-nocheck` 迁移内核 `createAnalytics()` 返回对象传给自定义最小接口（如 `NavEngine`）报不可赋值 | 迁移内核推断出的字段更宽：`prereqBlocked` 由 `next && ...` 得出（next 为 null 时值是 `null`）、`lessonId` 由 `(x \|\| {}).id` 得出（可能 `undefined`），与自拟接口的 `boolean` / `string \| null` 不符 | 在**消费方边界**把接口字段按真实形状放宽（`boolean \| null`、`string \| null \| undefined`），并同步放宽内部 helper 参数；别改 `@ts-nocheck` 内核、也别用 `as` 强转（会触发 `no-unsafe-type-assertion`）。实测 2026-11-14 |
| `typecheck` 报大量 `no-unsafe-type-assertion` / `no-unnecessary-type-assertion`（`JSON.parse(...) as T`、`err as Error`、`x as SomeType`） | tsgolint 的 type-aware 规则把「从 any/unknown 收窄」判为 warning（不阻塞，通过线是 0 errors） | 这些是 **warnings 不是 errors**，不必为归零而大改；但同批新增文件应尽量不留新 warning。真正阻塞的是 TS 编译器诊断（`TSxxxx`），优先按上面几条修 |

## TS target 与现代 JS API（00032，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 想「提升 TS target 到 ESNext」，但根 `tsconfig.json` 没有 `compilerOptions`；改 `.nuxt/tsconfig.*.json` 下次 `nuxt prepare` 又被覆盖 | Nuxt 4 根配置是 solution-style（`files: []` + `references`），实际 target 由生成的 4 份 `.nuxt/tsconfig.*.json` 决定，**默认已是 `ESNext`** 且不 `extends` 根；生成目录被 gitignore | 持久化意图写进 `nuxt.config.ts`：`typescript: { tsConfig: { compilerOptions: { target: 'ESNext' } } }`，**只设 target 不覆盖 `lib`**（app / server 的 lib 各自生成，合并会出错）；产物不降级另加 `vite: { build: { target: 'esnext' } }`（Vite 8 默认 `baseline-widely-available`）。改完跑 `pnpm exec nuxt prepare` 复验 4 份生成配置，再 `pnpm build` 看产物 |
| 为消除 `unicorn/no-array-reverse` / `no-array-sort` 把 `.reverse()` / `.sort()` 改成 `toReversed()` / `toSorted()`，担心旧环境运行时报错 | 这两个是 **ES2023 运行时 API，不是语法**；构建 target 不会转译也不会 polyfill，只影响语法降级 | 先逐处 grep 确认都是「先 `.slice()` / spread 复制再变异」（否则原地变异语义会变）；替换后跑真实浏览器 CDP + SSR 冒烟确认无 `xxx is not a function`。明确接受基线 Chrome 110+ / Safari 16.4+ / Firefox 115+ / Node 20+ / workerd；旧浏览器需特性检测或保留原写法 |

## pnpm / 依赖

| 症状 | 根因 | 处理 |
|---|---|---|
| `pnpm smoke -- --base http://...` 参数解析失败 | pnpm 11 把 `--` 原样透传给 Python 脚本 | 直接调用 `python scripts/smoke.py --base http://127.0.0.1:3199`，不要经 pnpm 转发参数 |
| `pnpm-workspace.yaml` 里莫名多了若干 `minimumReleaseAgeExclude` | pnpm 11 为新发布的平台二进制包自动放行安装策略 | **保留**，删掉会导致后续 `pnpm install` 受阻 |
| `pnpm peers check` 报 `unctx` 期望 `oxc-parser>=0.140`、`unplugin^3.3.0` | 既有 Nuxt 依赖的 peer，与新增工具链无关 | 记录为已知限制，不阻塞 `verify` / `build`，不要为此降级 Nuxt |
| `pnpm install --frozen-lockfile` 失败 | `package.json` 的 specifier 与 lockfile 不一致（常见于手动改版本范围） | 先 `pnpm install` 同步 lockfile 的 `specifier`，再用 `--frozen-lockfile` 复验；可复现性由 lockfile 保证，`^` 范围不会破坏它 |

## 版本口径与调试

- 纯工具依赖（husky / commitlint / lint-staged 等）与 TS 版本无绑定，用 `^` 语义化范围即可；精确锁定只会挡住补丁更新。
- 调试 commitlint 用 stdin：`printf 'feat: 示例' | pnpm exec commitlint --quiet`。
- 校验忽略规则用 `git check-ignore -v <path>`；判断「可追踪」而非「被忽略」时用 `if git check-ignore -q <path>; then ... fi`。
- 影子运行工具而不改项目：`npx --yes oxlint@latest app`（探测输出指向系统临时目录，不写仓库）。

## 手工编辑后的格式差异

| 症状 | 根因 | 处理 |
|---|---|---|
| `pnpm fmt:check` 只列出一个文件（如 `nuxt.config.ts (0ms)`）后报 `Format issues found in above 1 files`，退出 1 | 手工增删数组 / 对象成员后，oxfmt 按 `printWidth: 110` 重新判断换行：元素变少时原本多行的数组应压成单行，反之展开 | 不要手猜格式，直接 `pnpm fmt`（`oxfmt --write`）写回，再按门禁顺序重跑**全部**回归；`lint-staged` 会在提交时对暂存的 TS/Vue/JSON 自动 oxfmt，但本地门禁应先自行归零。实测 2026-11-13：删 Nuxt modules 数组两项、删 verify 静态资源数组一项，两次都触发，一次改动可能不止一个文件，改完统一 `pnpm fmt` 一次即可 |

## oxlint 结构化统计口径（00034 探查，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 用 `oxlint -f json` 统计 warnings、按 `labels[0].span` 的「规则+文件+行+列」去重，得出「唯一 8 条、`consistent-function-scoping` 有 2 个位置各重复报 3 次」，但 `pnpm typecheck` 明明输出 12 条 | `unicorn/consistent-function-scoping` 的诊断有 **2 个 label**：`labels[0]` 是 `Outer scope where this function is defined`（父函数，例如 `useTutor()` 在 L85），`labels[1]` 才是 `This function does not use any variables from the parent function`（真实函数位置，例如 `nextId` L232 / `toLlmError` L378 / `goSettings` L494）。取 `labels[0]` 会把同一父作用域下的多个**不同函数**压成一条，制造「重复报 3 次」的假象；`analytics.ts` 的 `createAnalytics()` 下 3 个函数同理 | 统计一律取 **`labels[-1].span`**（主标签），或把全部 label 的 span 一起作为去重 key。交叉验证：唯一条目数应等于 `typecheck` 输出条数（type-aware 只额外加规则、不会重复报同一诊断）；本例实为 **12 条独立诊断、零重复**，`lint` 10 = 12 − 2 条仅 tc 的 `no-unsafe-type-assertion`。写 `AGENTS.md` / overview 的 warnings 数字前，务必用文本输出或打印全部 labels 复核，别把「父函数位置」当成函数位置。注意判断函数能否外提时还要看它是否引用**模块级**变量（如 `use-tutor.ts:48` 的 `feedSeq`），模块级变量不算父作用域捕获，外提仍安全 |

## no-unused-vars 分类清理（00033，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 想清理 `no-unused-vars` 让 warnings 归零，却可能误删零调用但完整可用的 helper | 该规则同时覆盖三类：`catch (e)` 这类无信息量的语法占位、被最终实现抛弃的残留声明/计算、**有效但暂无调用点的公共工具**；只看数量会删错 | 按「实现是否完整且可复用」分类：`catch` 体不读错误对象 → 改 `catch {}`（ES2019 optional catch binding，在 `@ts-nocheck` 内核里不触发新规则、异常降级路径逐字不变）；从未被读的残留标志 / 残留计算 → 直接删；完整实现且零调用的 helper → **保留**并接受 warning。实测 `lint 16→10` / `tc 18→12`，当时唯一剩余 `app/lib/widgets.ts:114 svg()` 是有意保留，不要顺手删。**2026-11-14 更新（00035 目录化后，旧路径已失效）**：`svg()` 搬到 `app/lib/widgets/dom.ts` 并成为 `export`，该 warning 自动消失，函数体逐字保留；现行基线 `lint 3` / `tc 5`。原 `widgets.ts:2208` 的 `catch (err)` 会读 `err.message`，不能一起改 |
| 删除「多变量声明」里的某一项（如 `running = false`）时担心破坏同组变量 | 大型演练内核里同名变量常属于**另一个函数作用域**，只凭名字判断会误判 | 先 `grep -nE "\\b名字\\b"` 列出全部出现，确认哪些行在同一函数内被读写（本例 203–269 行的 `running` 属于另一个 widget、有完整读写，与 423 行无关），再只删无读取点的那一项；删除后跑 `lint` / `typecheck` / SSR 冒烟验证同组其余变量仍被使用 |

## 验证脚本与依赖锁定（00029，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| 新增 `scripts/verify-tutor.mjs` 后 `pnpm typecheck` 报 3 errors：`no-base-to-string`（`'want' may use Object's default stringification`）/ `restrict-template-expressions`（`string[]` 插进模板） | 用例表写成 `[route对象, '期望串']` 元组数组，JS 把 `want` 推断为 `string \| route对象` 的联合，进模板字面量即报错 | 改成对象数组 `{ route: {...}, want: '...' }` 再取 `kase.want`；数组用 `leaked.join(', ')` 而非直接插值。不要用 `String(want)` 掩盖，也不要加 `as` 断言（触发 `no-unsafe-type-assertion`）。实测归零 |
| `python -c "import ast; ast.parse(open(f).read())"` 显示语法 OK，运行探针却报 `SyntaxError: name 'SITE' is used prior to global declaration` | `ast.parse` 不做符号表 / 作用域检查；`main()` 里 `ap.add_argument(..., default=SITE)` 在 `global SITE` 声明之前引用了模块级变量 | 语法自检改用内置 `compile(source, filename, 'exec')`（会跑编译期作用域检查），并把 `global` 声明放到函数第一行。实测修复后探针正常 |
| 把 `package.json` 里的 `^3.4.17` 等改成精确版本后，发现 `pnpm-lock.yaml` 的 `importers` 段**根本没有** `dompurify` / `markdown-it` / `@types/markdown-it` 的 specifier（上一轮 `pnpm add` 只补了 packages/snapshots），CI `--frozen-lockfile` 会失败 | `pnpm add` 与手工改 manifest 未同步 lock 的 importer 清单 | 改完依赖版本跑 `pnpm install --lockfile-only`（本例补 87 行），再 `git diff pnpm-lock.yaml` 确认三条 `specifier:` 已出现；随后重跑 `fmt:check → lint → typecheck → verify`。`@types/markdown-it` 最新只有 14.2.0（无 15.x），配 `markdown-it@15` 的兼容性由 `typecheck` 0 errors 验证 |

## skill 加载与活文档口径（00036，实测 2026-11-14）

| 症状 | 根因 | 处理 |
|---|---|---|
| `Skill` 工具调用项目级 skill 报 `Can not find skill: "pitfall-resolver"` | 项目级 skill 只存在于 `{workspace}/.workbuddy/skills/`，未注册到插件市场；`Skill` 工具只解析已注册 skill | 直接 `Read` `.workbuddy/skills/<name>/SKILL.md` 加载指令，再按速查表 `Read` 命中的 `references/*.md`；不要因加载失败跳过「先查库 → 再修 → 后回写」闭环 |
| 拆分 / 迁移后文档里的路径、数量、命令仍然指向旧结构，不知道该不该改 | 把「历史记录不可矫正」误应用到所有文档 | 保护范围只有 `docs/NNNNN-*/` 与 `AGENTS.md`/`docs/README.md` 已落盘的历史基线表述；根 `README`、代码注释、课程正文、skill 文档是活文档，直接校正并在新任务 overview 声明会修复哪些旧结论。`AGENTS.md` 本身只能**追加新行**给出现行口径 |
