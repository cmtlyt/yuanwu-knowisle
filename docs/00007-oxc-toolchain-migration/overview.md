# 00007 · 工具链迁移：ESLint → oxlint + tsgolint + oxfmt

> 2026-11-13 ｜ 由原 `overview.md`「工具链迁移」章节拆出 ｜ [索引](../README.md) ｜ [迁移映射](migration.md)

## 目标

用户先问「当前仓库如何 lint 和 type-check」，实测发现两者都跑不通；随后要求「直接做完整迁移，然后 oxfmt 也需要」。结论是保持 TypeScript 7，整体迁到 Oxc 工具链。

## 诊断

- `npx eslint .` 退出码 2：`typescript-eslint does not support TS 7.0`。
- `npx nuxi typecheck` 退出码 1：缺 `vue-tsc` / `golar`。
- 根因：`typescript@7.0.2` 是原生 Go 编译器，不提供 programmatic Compiler API，`@typescript-eslint/parser@8.72.2` 的 peer 要求 `<6.1.0` 且加载时主动拒绝；`@oxlint/migrate` 读 flat config 时同样撞上该错误。
- 反向优势：oxlint 的 type-aware 后端 `tsgolint` 基于 typescript-go，**恰好要求 TS 7.0+**，因此保持 TS 7 反而能同时拿到 lint 与类型检查，无需降级。

## 变更

- 移除 `eslint`、`@nuxt/eslint`、`eslint.config.mjs`、`.nuxt` 生成配置与 `nuxt.config.ts` 中的模块注册。
- 新增 devDependencies：`oxlint@1.93.0`、`oxlint-tsgolint@7.0.2007`、`oxfmt@0.78.0`（精确锁定）。
- 手写 `.oxlintrc.json`（typescript / unicorn / oxc / import / vue 插件，correctness=error / suspicious=warn）与 `.oxfmtrc.json`（单引号、无分号、printWidth 110）。
- 新增脚本 `lint`、`lint:fix`、`typecheck`、`fmt`、`fmt:check`。`lint` 只跑快速规则；`typecheck` 用 `--type-aware --type-check` 一并输出 TS 编译器诊断。
- 为让 `typecheck` 归零修了 3 处代码：`use-learning.ts` 在 composable 边界把 `defaultState()` / `load()` 收口为 `LearningState`；`highlight.ts` 的 `esc()` 改显式类型窄化；`widgets.ts` 给定时器回调加函数类型注解消除 `no-implied-eval` 误报。随后 `pnpm fmt` 全量格式化 24 个代码文件。

## 验证

- `pnpm lint` 0 errors / 19 warnings、`pnpm typecheck` 0 errors / 21 warnings、`pnpm fmt:check` 全绿、`pnpm verify` 全绿、`pnpm build` 成功（30.3s）。
- `python scripts/smoke.py --base http://127.0.0.1:3199`：11 条 SSR 路由 + 3 页客户端渲染 + 13 组真实视口全绿，3199 临时服务跑完即关。

## 踩坑与限制

- `pnpm smoke -- --base ...` 在 pnpm 11 下把 `--` 透传给 Python 导致参数错误，应直接 `python scripts/smoke.py --base ...`；该 script 后于 [00015](../00015-scripts-and-docs-reorg/overview.md) 移除。
- `pnpm build` 撞上残留 Nuxt 构建锁（PID 已复用为 chrome），用 `NUXT_IGNORE_LOCK=1` 绕过。
- pnpm 11 自动往 `pnpm-workspace.yaml` 写了 7 条 `minimumReleaseAgeExclude`，需保留。
- oxlint 只检查 `.vue` 的 `<script>` 块，模板类型检查仍缺位；tsgolint 版本绑定 TS 小版本。
