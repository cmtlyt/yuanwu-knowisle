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
  - `wrangler.jsonc`：写 `"name"` / `"compatibility_date"`（用当天日期）/ `"observability": { "enabled": true }`，**不写 `main` 与 `assets`**——Nitro 构建时会生成 `.output/server/wrangler.json` 与 `.wrangler/deploy/config.json`，根 `wrangler.jsonc` 仅作基准。自定义域名在根配置用 `routes: [{ pattern: "yuanwu-knowisle.cmtlyt.top", custom_domain: true }]` 声明，并设 `"workers_dev": false` 关掉默认 `*.workers.dev` 子域；Nitro 的 `writeWranglerConfig` 用 `defu(overrides, ctxConfig, userConfig, defaults)` 合并，`routes`/`workers_dev` 仅存在于 `userConfig`，会被完整带进生成的 `.output/server/wrangler.json`，故改根配置即可、无需碰生成物。
  - 原生模块（如 `better-sqlite3`）**不能打进 Worker**：一旦 `import` 会在构建或运行时报错。本项目已移除 `better-sqlite3` 依赖（Nuxt Content 删除后无引用），验证 `.output` 无 `*.node` 且产物不引用该包。

## wrangler dev 首次启动报 Workers runtime crashed

- **症状**：`pnpm exec wrangler --cwd .output dev` 启动后打印 `The Workers runtime crashed unexpectedly and is being restarted (crash #1)`，随后 `Ready on http://...`。
- **根因**：workerd 首次加载模块的一次性重启，属正常现象。
- **处理**：直接 `curl` 各路由验证返回 200 即可（本项目 `/`、`/courses/effect-ts`、`/design`、`/dashboard`、`/lessons/L18` 均 200）。若请求返回非 200 才是真问题。本地 `wrangler dev` 不需要 `wrangler login`（用重定向配置 `server/wrangler.json`），可离线预览验证运行时行为。

## 自定义域名（custom_domain）部署的 Token 权限

- **症状**：`wrangler deploy` 在绑定自定义域名这一步失败，报 zone 权限相关错误。
- **根因（已核实，纠正旧结论）**：`routes` 里 `custom_domain: true` 由 **Workers 自定义域 API** 完成绑定，**不需要 `DNS:Edit`**。Cloudflare 官方权限文档：*Worker Route 或 Custom Domain → `Zone: Workers Routes: Edit`（目标 zone）*；`DNS:Edit` 仅在「用同套自动化管理原始 DNS 记录」时才需要。旧记「需 `Zone:DNS:Edit` / `Zone:Zone:Read`」不准确——`Zone:Zone:Read` 在控制台 Zone 大类里资源名就是 `Zone`（Read 级），且只用于解析 zone id；真正绑定自定义域名的是 `Workers Routes: Edit`。
- **正确权限清单**（账户级 + zone 级，作用范围选 `cmtlyt.top`）：
  - 账户：`Workers Scripts: Edit/Write`（部署脚本）、`Account Settings: Read`（账户发现）。
  - zone：`Workers Routes: Edit/Write`（**绑定自定义域名就是它**）、`Zone: Read`（wrangler 解析 zone id，建议补）。
  - 控制台「Zone」大类里的资源显示名为 `Zone` / `Workers Routes` / `DNS`，与 API scope 名（`Zone:Zone:Read` 等）不同；编辑 Token 时在这些友好名里勾选。
  - **无需 `DNS:Edit`**；`Account DNS Settings: Write` 是账户级、与建 CNAME 无关，留着无碍。
- **处理**：给 `CLOUDFLARE_API_TOKEN` 补 `Zone → Read`（Zone 大类，资源 `Zone`，Read，作用范围 `cmtlyt.top`）；确认 `Workers Routes: Write` 已在 zone 分组内。确认 `cmtlyt.top` 与本 `CLOUDFLARE_ACCOUNT_ID` 同账户。若仍想零 zone 权限，可改在 Cloudflare 控制台手动加自定义域名（Worker → Settings → Custom Domains），并把 `wrangler.jsonc` 的 `routes` 去掉（控制台管理的自定义域名不再由配置驱动）。最权威验证是实际 `wrangler deploy`，报错会精确给出缺的 scope。
