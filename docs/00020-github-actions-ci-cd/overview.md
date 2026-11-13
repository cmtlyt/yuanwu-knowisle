# 00020 · GitHub Actions 接管门禁与部署

日期：2026-11-13

## 目标

把原本需要**本地手动执行**的两类命令迁移到 GitHub Actions：

1. 质量门禁：`fmt:check` → `lint` → `typecheck` → `verify` → `build`
2. 部署：`pnpm deploy`（`nuxt build && wrangler deploy` → Cloudflare Workers）

让「push 到 GitHub」这一动作自动完成校验与上线，本地不再需要手敲这些命令。

## 变更

- 新增 `.github/workflows/ci-cd.yml`：
  - `test` job：`push`/`pull_request` 到 `main`、以及手动 `workflow_dispatch` 时运行全部门禁 + 构建（`pnpm install --frozen-lockfile` 锁定依赖）。
  - `deploy` job：`needs: test`，job 级 `if` 仅查 `github.ref == main && 非 PR`；secret 经 job 级 `env` 映射（`|| 'not-set'` 兜底），**未配置 `CLOUDFLARE_API_TOKEN` 时由 deploy step 级 `if: ${{ env.CLOUDFLARE_API_TOKEN != 'not-set' }}` 跳过**。
  - `concurrency` 按分支串行，避免重叠部署。
  - `permissions: contents: read`，最小权限；部署凭据走 Cloudflare API Token，不写仓库。
- **修正（00023）**：首版把 secret 判空写在 job 级 `if`（`... && secrets.CLOUDFLARE_API_TOKEN != ''`），被 GitHub 解析期拒绝——**任何 `if` 条件（job 级与 step 级）都不能引用 `secrets` 上下文**，导致整个 workflow 解析失败、**0 job 生成**（运行表现为「同秒完成 + 0 job + `run_completed_at=null` + failure」）。改为**哨兵值模式**：secret 经 job 级 `env` 映射（`|| 'not-set'` 兜底），deploy step 级 `if` 检查 `env`。详见 `00023-github-actions-secrets-if`。
- README.md：在「部署到 Cloudflare Workers」后新增「CI/CD（GitHub Actions）」小节，说明门禁/部署触发条件与所需密钥。
- AGENTS.md：命令速查与提交规范处补充「门禁与部署已交给 CI」的说明。

## 验证

- 工作流 YAML 语法由 GitHub 在 push 时解析；本地无法 dry-run，需在仓库 Actions 页确认。
- **门禁**：push 任意提交或开 PR 到 `main`，`test` job 应全绿（与本地 `pnpm fmt:check/lint/typecheck/verify/build` 同口径）。
- **部署默认不触发**：未配置 Cloudflare 密钥时 `deploy` job 标记为 skipped（非失败），不会误上线。
- 本地复现命令不变：`pnpm fmt:check && pnpm lint && pnpm typecheck && pnpm verify && pnpm build`，部署 `pnpm deploy`（需 `wrangler login` 或本机环境变量）。

## 注意事项

- 上线前必须在仓库 **Settings → Secrets and variables → Actions** 添加：
  - `CLOUDFLARE_API_TOKEN`：具备 `Workers Scripts:Edit` + `Workers Scripts:Delete` + `Account Settings:Read` 等权限的 API Token。
  - `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。
  - 两者齐备后，每次 push 到 `main` 即自动部署；也可在 Actions 页用 `workflow_dispatch` 手动触发。
- `pnpm deploy` 内含 `nuxt build`，`deploy` job 会重新构建（与 `test` job 的构建相互独立，符合各 job 干净隔离的约定）。
- `wrangler deploy` 在 CI 环境（`CI=true`）下自动非交互，无需 `wrangler login`。
- CI 用 Node 22 + pnpm 11.3.0，与本地一致；`pnpm-workspace.yaml` 的 `allowBuilds.workerd: true` 已提交，保证 workerd 二进制可构建。
- 不修改 `package.json`、不引入 `packageManager` 字段；pnpm 版本在 workflow 中显式锁定为 `11.3.0`。
