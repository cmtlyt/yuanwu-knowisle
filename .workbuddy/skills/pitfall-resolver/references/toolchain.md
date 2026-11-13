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
| `TS2322`：`theme: string` 不满足 `'light' \| 'dark'` 字面量联合 | 带 `@ts-nocheck` 的机械迁移引擎让 `defaultState()` 推断出宽泛类型 | 在 composable 边界收口：新增 `defaultStateOf()` 返回 `LearningState`，`load()` 结果同样标注，别改迁移内核 |
| `typescript/no-base-to-string`：`String(unknown)` 仍可能被视为 object | `unknown` 未窄化就字符串化 | 显式分支窄化：`typeof s === 'string' ? s : s == null ? '' : typeof s === 'object' ? JSON.stringify(s) ?? '' : String(s)`，再用 `ESCAPE_MAP[c] ?? c` 替代不安全的类型断言 |
| `typescript/no-implied-eval` 对 `setTimeout(fn, ms)` 误报 | 定时器回调参数是隐式 any | 给 `later` / `every` 的回调参数标注 `() => void` |

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
