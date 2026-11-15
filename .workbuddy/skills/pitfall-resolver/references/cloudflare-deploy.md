# Cloudflare Workers 部署

Nuxt 以 Workers Static Assets（非 Pages）部署的实测坑；通用流程见 `.workbuddy/skills/frameworks-on-cloudflare` 与 `wrangler` 官方 skill。

## pnpm 安装 wrangler 后写入无效 workerd 占位值

- **症状**：`pnpm add -D wrangler` 后 `pnpm-workspace.yaml` 的 `allowBuilds` 出现 `workerd: set this to true or false`，后续 `pnpm install` 报错或无法构建 workerd。
- **根因**：pnpm 11 需显式授权带 build 脚本的包（workerd 是 wrangler 依赖）；非交互安装无法提问就塞字面占位串。
- **处理**：改成 `workerd: true`（本地 `wrangler dev` 需要），再跑 `pnpm install` 确认。

## Nuxt → Cloudflare Workers 最小配置

- **症状**：`wrangler deploy` 失败，或 `nuxt dev` 在 Cloudflare 集成下拿不到 bindings。
- **根因**：缺 Nitro preset、`compatibilityDate` 过早、或 `wrangler.jsonc` 写了 `main`/`assets` 与 Nitro 生成物冲突。
- **处理**（本项目 `nuxt.config.ts` + `wrangler.jsonc` 已落地，可照抄）：
  - `nuxt.config.ts`：`nitro: { preset: 'cloudflare_module', cloudflare: { deployConfig: true, nodeCompat: true } }`，`compatibilityDate` 必须 **≥ 2025-07-17**（本项目 `2026-11-13`）。低于该日期官方排错文档明确：*"nuxt dev has no bindings. Your compatibilityDate is earlier than 2025-07-17."*
  - `wrangler.jsonc`：写 `"name"` / `"compatibility_date"`（当天）/ `"observability": { "enabled": true }`，**不写 `main` 与 `assets`**——Nitro 生成 `.output/server/wrangler.json` 与 `.wrangler/deploy/config.json`，根配置仅作基准。自定义域名用 `routes: [{ pattern: "yuanwu-knowisle.cmtlyt.top", custom_domain: true }]` 并设 `"workers_dev": false` 关掉默认 `*.workers.dev` 子域；Nitro `writeWranglerConfig` 用 `defu(overrides, ctxConfig, userConfig, defaults)` 合并，`routes`/`workers_dev` 只在 `userConfig`，会被完整带进生成物，改根配置即可。
  - 原生模块（如 `better-sqlite3`）**不能进 Worker**：import 即构建 / 运行报错。本项目已移除该依赖（Nuxt Content 删除后无引用），验证 `.output` 无 `*.node` 且产物不引用它。

## wrangler dev 首启报 Workers runtime crashed

- **症状**：`pnpm exec wrangler --cwd .output dev` 打印 `The Workers runtime crashed unexpectedly and is being restarted (crash #1)`，随后 `Ready on http://...`。
- **根因**：workerd 首次加载模块的一次性重启，正常现象。
- **处理**：`curl` 各路由验证 200 即可（本项目 `/`、`/courses/effect-ts`、`/design`、`/dashboard`、`/lessons/L18` 均 200）；非 200 才是真问题。本地 `wrangler dev` 不需 `wrangler login`（用重定向配置 `server/wrangler.json`），可离线验证。

## 自定义域名（custom_domain）部署的 Token 权限

- **症状**：`wrangler deploy` 绑定自定义域名时报 zone 权限错误。
- **根因（已核实，纠正旧结论）**：`routes` 的 `custom_domain: true` 由 **Workers 自定义域 API** 绑定，**不需要 `DNS:Edit`**。官方文档：Worker Route / Custom Domain → `Zone: Workers Routes: Edit`（目标 zone）；`DNS:Edit` 仅在「同套自动化管理原始 DNS 记录」时需要。旧记「需 `Zone:DNS:Edit` / `Zone:Zone:Read`」不准确——`Zone:Zone:Read` 资源名就是 `Zone`（Read 级），只用于解析 zone id；真正绑定的是 `Workers Routes: Edit`。
- **正确权限清单**（账户级 + zone 级，范围 `cmtlyt.top`）：
  - 账户：`Workers Scripts: Edit/Write`（部署）、`Account Settings: Read`（发现）。
  - zone：`Workers Routes: Edit/Write`（**绑定域名就是它**）、`Zone: Read`（wrangler 解析 zone id，建议补）。
  - 控制台「Zone」大类显示名 `Zone` / `Workers Routes` / `DNS`，与 API scope 名（`Zone:Zone:Read` 等）不同；按友好名勾选。
  - **无需 `DNS:Edit`**；`Account DNS Settings: Write` 是账户级、与 CNAME 无关，留着无碍。
- **处理**：给 `CLOUDFLARE_API_TOKEN` 补 `Zone → Read`（Zone 大类、资源 `Zone`、Read、范围 `cmtlyt.top`），确认 `Workers Routes: Write` 在 zone 分组内，`cmtlyt.top` 与 `CLOUDFLARE_ACCOUNT_ID` 同账户。若想零 zone 权限，可在控制台手动加自定义域名（Worker → Settings → Custom Domains）并删 `wrangler.jsonc` 的 `routes`。最权威验证是实际 `wrangler deploy`，报错会给精确 scope。
