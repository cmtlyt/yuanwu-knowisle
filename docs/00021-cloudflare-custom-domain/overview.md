# 00021 · 绑定自定义域名 yuanwu-knowisle.cmtlyt.top

- **日期**：2026-11-13
- **任务**：用户在 Cloudflare 上已绑定域名 `cmtlyt.top`，要求把 Worker 部署到子域 `yuanwu-knowisle.cmtlyt.top`。

## 目标

让 `pnpm deploy`（= `nuxt build && wrangler deploy`）在上线时自动把 Worker 挂到自定义域名，而不是默认的 `*.workers.dev` 子域。

## 变更

- **`wrangler.jsonc`**（根配置，作为 Nitro 生成配置的基准）：
  - 新增 `"workers_dev": false`：关闭默认的 `*.workers.dev` 子域，使自定义域名成为唯一入口（也避免 CI 非交互部署时弹出 `workers.dev` 子域名的交互询问）。
  - 新增 `"routes": [{ "pattern": "yuanwu-knowisle.cmtlyt.top", "custom_domain": true }]`：声明自定义域名。`custom_domain: true` 让 wrangler 在部署时于本账户内的 `cmtlyt.top` zone 自动建 CNAME 并把 Worker 绑上去。

## 验证

- `pnpm build` 通过（16.5s，637 kB / 226 kB gzip）。
- 重建后检查生成的 `.output/server/wrangler.json`，确认根 `wrangler.jsonc` 的 `workers_dev` 与 `routes` 被 Nitro 的 `writeWranglerConfig`（`defu(overrides, ctxConfig, userConfig, defaults)` 合并）完整带进生成配置：
  ```json
  {
    "workers_dev": false,
    "routes": [{ "pattern": "yuanwu-knowisle.cmtlyt.top", "custom_domain": true }],
    "main": "index.mjs",
    "assets": { "binding": "ASSETS", "directory": "../public" },
    "compatibility_flags": ["no_nodejs_compat_v2"]
  }
  ```
- 因环境无法出网到 Cloudflare API，未做 `wrangler deploy` 真部署；配置正确性由构建产物合并结果佐证。

## 注意事项（上线前置）

- **API Token 权限（已核实纠正）**：自定义域名走 Workers 自定义域 API，**不需要 `DNS:Edit`**。实际只需：账户级 `Workers Scripts:Edit/Write` + `Account Settings:Read`；zone 级（作用范围选 `cmtlyt.top`）`Workers Routes:Edit/Write`（**绑定自定义域名就是它**）+ `Zone:Read`（解析 zone id，建议补）。控制台「Zone」大类里资源名为 `Zone` / `Workers Routes` / `DNS`，与 API scope 名（`Zone:Zone:Read` 等）不同。详见 `pitfall-resolver/references/cloudflare-deploy.md` 的「自定义域名部署的 Token 权限」。
- **账户一致性**：`cmtlyt.top` 必须在本 `CLOUDFLARE_ACCOUNT_ID` 账户下；跨账户会因找不到 zone 而失败。
- **未真部署**：按先前约定（「别真部署上去」）只改配置、不执行 `wrangler deploy`。本次改动（含 00019/00020 的其余未提交项）仍在工作区。

## 相关

- 部署基础配置见 `00019-cloudflare-workers-deploy-config/overview.md`。
- 自动部署流水线见 `00020-github-actions-ci-cd/overview.md`。
- 踩坑回写见 `.workbuddy/skills/pitfall-resolver/references/cloudflare-deploy.md`。
