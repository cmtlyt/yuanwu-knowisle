# 00023 · 修复 CI/CD 工作流「if 引用 secrets」导致 0 job（哨兵值模式）

- **日期**：2026-11-13
- **任务**：CI/CD（00020）推送后多次运行全部 `failure`，且表现为「同秒完成 + 0 job + `run_completed_at=null`」。定位并修复。

## 目标

让 `.github/workflows/ci-cd.yml` 能被 GitHub Actions 正常解析并生成 job，门禁能跑、部署在配好密钥后才触发。

## 根因（用 `gh workflow run` 定位，两次实证）

**GitHub Actions 的 `if` 条件（无论 job 级还是 step 级）都不能引用 `secrets` 上下文**，否则整个 workflow 在**解析/编译阶段**直接报错、**一个 job 都不生成**（表现为 `conclusion=failure` + 0 job + `run_completed_at=null`）。

两次实证（都是 `gh workflow run ci-cd.yml` 立即返回的 422 解析错误）：

```
# 第一次：job 级 if 引用 secrets（Line 61）
failed to parse workflow: (Line: 61, Col: 9): Unrecognized named-value: 'secrets'.
expression: github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && secrets.CLOUDFLARE_API_TOKEN != ''

# 第二次：误以为「step 级 if 允许引用 secrets」，下沉到 step 级（Line 88）仍报同样错误
failed to parse workflow: (Line: 88, Col: 13): Unrecognized named-value: 'secrets'.
expression: secrets.CLOUDFLARE_API_TOKEN != ''
```

> **纠正 00023 首版结论**：首版曾写「step 级 `if:` 允许引用 `secrets`」——**这是错的**。`gh workflow run` 的第二次 422 直接证伪：step 级 `if` 同样不能写 `secrets.`。规则是「**任何 `if` 表达式（job 级 + step 级）都不能引用 `secrets` 上下文**」。

> 本地 `js-yaml` / `yaml@2` 校验通过是假阳性：它们只查 YAML 语法，不校验 Actions 的表达式上下文规则。

## 变更（`.github/workflows/ci-cd.yml`，哨兵值模式）

把 secret 经 **job 级 `env`** 映射（`env` 上下文**允许**引用 `secrets`，加 `not-set` 兜底），再在 **step 级 `if`** 检查 `env`（`env` 上下文**允许**出现在 `if` 里）：

```yaml
deploy:
  if: >-
    github.ref == 'refs/heads/main' &&
    github.event_name != 'pull_request'   # job 级 if 无 secrets
  runs-on: ubuntu-latest
  env:                                       # env 允许引用 secrets，带 not-set 兜底
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN || 'not-set' }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID || 'not-set' }}
  steps:
    - name: Deploy (build + wrangler deploy)
      if: ${{ env.CLOUDFLARE_API_TOKEN != 'not-set' }}   # 检查 env，非 secrets
      run: pnpm deploy
```

未配 `CLOUDFLARE_API_TOKEN` 时 `env` 值为哨兵 `'not-set'`，deploy step 跳过（非失败），仍符合「先别部署」约束；配好 secret 后哨兵被真实值覆盖、step 正常执行。

## 验证

- `js-yaml` 解析确认结构：`deploy.if` 只含 ref/event；`deploy.env` 映射两个 secret（`|| 'not-set'`）；deploy step `if` = `${{ env.CLOUDFLARE_API_TOKEN != 'not-set' }}`、无内联 `env`。
- **权威验证**：`gh workflow run ci-cd.yml` 不再返回 422 解析错误、能创建 dispatch 运行并生成 `test` + `deploy` 两个 job；未配密钥时 deploy step 显示 skipped。
- 门禁全绿（本地 `pnpm fmt:check/lint/typecheck/verify/build` 同口径）。

## 注意事项

- 这是 00020 的缺陷修复，不改其它门禁逻辑；配好两个 secret 后照常自动部署到 `yuanwu-knowisle.cmtlyt.top`（见 00021）。
- 踩坑回写：`.workbuddy/skills/pitfall-resolver/references/github-actions.md` 已按「job 级与 step 级 if 都不能引用 secrets + 哨兵值模式」更正，SKILL.md 速查表与关键词同步。

## 相关

- 工作流来源见 `00020-github-actions-ci-cd/overview.md`；自定义域名见 `00021-cloudflare-custom-domain/overview.md`。
- 踩坑回写见 `.workbuddy/skills/pitfall-resolver/references/github-actions.md`。
