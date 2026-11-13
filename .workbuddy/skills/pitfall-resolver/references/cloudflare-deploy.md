# Cloudflare Workers 部署

Nuxt 项目以 Workers Static Assets 方式部署（非 Pages）时踩到的坑。通用流程见 `.workbuddy/skills/frameworks-on-cloudflare` 与 `wrangler` 两个官方 skill；本文件只记本项目实测过的坑。

## pnpm 安装 wrangler 后写入无效的 workerd 占位值

- **症状**：`pnpm add -D wrangler` 后 `pnpm-workspace.yaml` 的 `allowBuilds` 里出现 `workerd: set this to true or false`；之后全新 `pnpm install` 可能因该占位串报错或无法构建 workerd。
- **根因**：pnpm 11 的 `allowBuilds` 需要显式授权有 build 脚本的包（workerd 是 wrangler 的依赖）；非交互安装无法就授权提问，就塞了一个字面占位串。
- **处理**：把该行改成 `workerd: true`（允许构建，本地 `wrangler dev` 需要）。改完跑 `pnpm install` 确认不再报占位错误。

## Nuxt → Cloudflare Workers 的最小配置

- **症状**：`wrangler deploy` 失败，或 `nuxt dev` 在 Cloudflare 集成下拿不到 bindings。
- **根因**：缺 Nitro preset、或 `compatibilityDate` 早于集成要求、或 `wrangler.jsonc` 写了 `main`/`assets` 与 Nitro 生成物冲突。
- **处理**（已在本项目 `nuxt.config.ts` + `wrangler.jsonc` 落地，可照抄）：
  - `nuxt.config.ts`：`nitro: { preset: 'cloudflare_module', cloudflare: { deployConfig: true, nodeCompat: true } }`，且 `compatibilityDate` 必须 **≥ 2025-07-17**（本项目用 `2026-11-13`）。低于该日期 Cloudflare 官方排错文档明确：*"nuxt dev has no bindings. Your compatibilityDate is earlier than 2025-07-17."*
  - `wrangler.jsonc`：只写 `"name"` / `"compatibility_date"`（用当天日期）/ `"observability": { "enabled": true }`，**不写 `main` 与 `assets`**——Nitro 构建时会生成 `.output/server/wrangler.json` 与 `.wrangler/deploy/config.json`，根 `wrangler.jsonc` 仅作基准。
  - 原生模块（如 `better-sqlite3`）**不能打进 Worker**：一旦 `import` 会在构建或运行时报错。本项目已移除 `better-sqlite3` 依赖（Nuxt Content 删除后无引用），验证 `.output` 无 `*.node` 且产物不引用该包。

## wrangler dev 首次启动报 Workers runtime crashed

- **症状**：`pnpm exec wrangler --cwd .output dev` 启动后打印 `The Workers runtime crashed unexpectedly and is being restarted (crash #1)`，随后 `Ready on http://...`。
- **根因**：workerd 首次加载模块的一次性重启，属正常现象。
- **处理**：直接 `curl` 各路由验证返回 200 即可（本项目 `/`、`/courses/effect-ts`、`/design`、`/dashboard`、`/lessons/L18` 均 200）。若请求返回非 200 才是真问题。本地 `wrangler dev` 不需要 `wrangler login`（用重定向配置 `server/wrangler.json`），可离线预览验证运行时行为。
