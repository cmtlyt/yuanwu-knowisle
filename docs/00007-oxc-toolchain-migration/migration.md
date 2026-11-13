# 00007 · 迁移映射：ESLint → Oxc

> 2026-11-13 ｜ 由原 `docs/migration.md`「工具链迁移」章节拆出 ｜ [索引](../README.md) ｜ [任务总览](overview.md)

## 根因

`typescript@7.0.2` 是原生 Go 编译器，不提供 programmatic Compiler API。`@typescript-eslint/parser@8.72.2` 的 peer 要求 `typescript >=4.8.4 <6.1.0`，且在加载时主动检测版本并抛错，因此 `npx eslint .` 直接以退出码 2 失败；`nuxi typecheck` 则因 `vue-tsc` / `golar` 均未安装而无法运行。降级 TS 到 6 可以修 ESLint，但 oxlint 的 type-aware 后端 `tsgolint` 恰好基于 typescript-go、要求 TS 7.0+，保持 TS 7 反而能同时拿到 lint 与类型检查。

## 映射

| 原 | 现 |
|---|---|
| `eslint@10.14.0`、`@nuxt/eslint@1.17.0`（dependencies） | 移除 |
| `eslint.config.mjs` + `.nuxt/eslint.config.mjs`（生成物） | 删除；生成物一并清理 |
| `nuxt.config.ts` 的 `'@nuxt/eslint'` 模块注册 | 删除 |
| — | `oxlint@1.93.0`、`oxlint-tsgolint@7.0.2007`、`oxfmt@0.78.0`（devDependencies） |
| — | `.oxlintrc.json`、`.oxfmtrc.json` |
| — | 脚本 `lint` / `lint:fix` / `typecheck` / `fmt` / `fmt:check` |

`@oxlint/migrate` 实测不可用：它加载 flat config 时仍会触发 `typescript-eslint does not support TS 7.0`。所幸原 `eslint.config.mjs` 里 `withNuxt()` 没有任何自定义规则，手写配置的成本很低。

## 配置口径

- `.oxlintrc.json`：启用 `typescript` / `unicorn` / `oxc` / `import` / `vue` 插件，`correctness: error`、`suspicious: warn`；`typeAware` / `typeCheck` **不写进配置**，由 `typecheck` 脚本通过 CLI 开启，保证 `pnpm lint` 保持毫秒级。
- `.oxfmtrc.json`：单引号、无分号、`printWidth: 110`、`tabWidth: 2`、`trailingComma: all`、`sortPackageJson: false`；忽略 Markdown、CSS、YAML 与所有生成目录，只格式化 TS / Vue / MJS / JSON 配置。
- 忽略范围后于 [00012](../00012-pitfall-skill-and-gates/migration.md) 调整：去掉 `.workbuddy/**`、`content/**`、`public/**`，只保留不可追踪目录，避免 lint-staged 传入的暂存文件被工具排除。

## 为 type-check 归零做的代码修复

| 文件 | 改动 | 原因 |
|---|---|---|
| `app/composables/use-learning.ts` | 新增 `defaultStateOf()`，并在 `load()` 处收口为 `LearningState` | `analytics.ts` 是 `@ts-nocheck` 迁移内核，`defaultState()` 推断出 `theme: string`，不满足 `LearningProfile.theme` 字面量联合类型（TS2322 ×2） |
| `app/lib/highlight.ts` | `esc()` 改为显式类型窄化 + `ESCAPE_MAP` | 消除 `no-base-to-string` 与 `no-unsafe-type-assertion` |
| `app/lib/widgets.ts` | `later` / `every` 的回调参数标注 `() => void` | 隐式 any 让 `no-implied-eval` 对 `setTimeout(fn, ms)` 误报 |

## 验证

- 全量格式化 24 个代码文件后：`pnpm lint` 0 errors / 19 warnings、`pnpm typecheck` 0 errors / 21 warnings、`pnpm fmt:check` 全绿。
- `pnpm verify` 全绿、`pnpm build` 成功（30.3s）。
- `python scripts/smoke.py --base http://127.0.0.1:3199`：11 条 SSR 路由、3 个页面客户端渲染、13 组真实视口布局全绿；一次性 3199 端口临时服务跑完即关。

## 已知限制

- oxlint 对 `.vue` 只检查 `<script>` 块，`--type-check` 也不等价于 `vue-tsc` 的模板类型检查；如需模板级检查，须另配 `vue-tsc` 并解决 TS 6 API 与 TS 7 的双版本并存。
- `oxlint-tsgolint` 版本与 TS 小版本绑定（`7.0.2007` 对应 TS 7.0.2），升级 TS 时需同步更换。
- 剩余 warnings 主要是机械迁移的演练内核里的未使用变量与 `Array#reverse()` 等风格项，不阻塞构建。
