# 00019 · 配置 Nuxt 部署到 Cloudflare Workers

## 目标

把项目接入 Cloudflare Workers（Static Assets，非 Pages），只做本地配置与构建验证，**不实际部署**。为后续 `pnpm deploy` 上线铺路。

## 变更

### 部署配置（核心）

- `nuxt.config.ts`：
  - 新增 `nitro: { preset: 'cloudflare_module', cloudflare: { deployConfig: true, nodeCompat: true } }`。
  - `compatibilityDate` 从 `2025-07-15` 升到 `2026-11-13`（Cloudflare 集成要求 ≥ `2025-07-17`，用当天日期即最新）。
- 新建 `wrangler.jsonc`：仅 `name` / `compatibility_date`(=2026-11-13) / `observability.enabled`，**不写 `main` 与 `assets`**（Nitro 构建时生成 `.output/server/wrangler.json` 与 `.wrangler/deploy/config.json`）。
- `package.json`：新增 `preview`(`nuxt build && wrangler dev`)、`deploy`(`nuxt build && wrangler deploy`)、`cf-typegen`(`wrangler types`)；移除未使用的 `better-sqlite3` 依赖（原生模块不能进 Worker，且 Nuxt Content 删除后已无引用）。
- `pnpm-workspace.yaml`：`allowBuilds.workerd: true`（安装 `wrangler` 引入；非交互安装曾误写占位串 `set this to true or false`，已改回 `true`）。
- `.gitignore`：追加 `.wrangler/`（构建/预览产物）。

### 验证与文档

- `scripts/smoke.py` 等既有门禁未改；`better-sqlite3` 移除经 `pnpm verify` 与 `pnpm build` 验证无回归。
- `README.md`：更新「运行」段（弃用 `node .output/server/index.mjs` 预览方式）、新增「部署到 Cloudflare Workers」说明。
- `AGENTS.md`：命令速查改用 `wrangler --cwd .output dev` 预览与冒烟；第 6 节补 `workerd` 构建授权说明。
- `pitfall-resolver`：新增 `references/cloudflare-deploy.md`（workerd 占位值、`compatibilityDate` 阈值、`wrangler.jsonc` 不写 main/assets、原生模块禁入 Worker、`wrangler dev` 首启 crash #1 一次性重启），速查表与关键词已登记。

## 验证

- `pnpm install` + `--frozen-lockfile` 通过（无占位值报错）。
- `pnpm fmt:check` 34 文件、`lint` 0e/19w、`typecheck` 0e/21w、`verify` 全通过。
- `pnpm build` 成功：`cloudflare_module` 产物 `.output`（637 kB / 226 kB gzip，较此前 Node server 的 2.93 MB 显著减小）；`.output` 无 `*.node`，产物不引用 `better-sqlite3`。
- **本地 `wrangler dev` 预览（非部署）**：`pnpm exec wrangler --cwd .output dev --port 8790`，请求 `/`、`/courses/effect-ts`、`/design`、`/dashboard`、`/lessons/L18` 全部 `200 OK`；首启 `Workers runtime crashed ... (crash #1)` 为 workerd 一次性重启，请求正常即无需处理。

## 注意事项 / 后续

- **尚未上线**：未执行 `wrangler login` 或 `pnpm deploy`，改动停在本地与提交。
- 上线前需 `pnpm exec wrangler login`（或注入 API Token），再 `pnpm deploy`；可选在 `wrangler.jsonc` 绑自定义域名。
- 若 `@nuxt/a11y` / `@nuxt/hints` / `@nuxtjs/device` 在 Workers 运行时发现异常，按 `pitfall-resolver` 闭环处理并更新本记录。
- `pnpm-workspace.yaml` 的 7 条 `minimumReleaseAgeExclude` 仍是 tsgolint 二进制放行项，保留。
