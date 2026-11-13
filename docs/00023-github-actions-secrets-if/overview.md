# 00023 · 修复 CI/CD 工作流「job 级 if 引用 secrets」导致 0 job

- **日期**：2026-11-13
- **任务**：CI/CD（00020）推送后三次运行全部 `failure`，且表现为「同秒完成 + 0 job + `run_completed_at=null`」。定位并修复。

## 目标

让 `.github/workflows/ci-cd.yml` 能被 GitHub Actions 正常解析并生成 job，门禁能跑、部署在配好密钥后才触发。

## 根因（用 `gh` 定位）

`gh workflow run ci-cd.yml` 触发时，GitHub 返回精确解析错误：

```
failed to parse workflow: (Line: 61, Col: 9): Unrecognized named-value: 'secrets'.
Located at position 75 within expression:
github.ref == 'refs/heads/main' && github.event_name != 'pull_request' && secrets.CLOUDFLARE_API_TOKEN != ''
```

**GitHub Actions 的 job 级 `if:` 表达式不能引用 `secrets` 上下文**（只有 step 级 `if:` 可以，以及 job 的 `runs-on`/`env`/`steps[].env` 等可引用 secrets）。00020 首版把 secret 判空写进了 `deploy` job 的 job 级 `if`，导致整个 workflow 在**编译/解析阶段就报错、一个 job 都没生成**——这正是「同秒完成 + 0 job + `run_completed_at=null` + conclusion=failure」的成因。

> 本地 `js-yaml` / `yaml@2` 校验通过是假阳性：它们只查 YAML 语法，不校验 Actions 的表达式上下文规则。

## 变更（`.github/workflows/ci-cd.yml`）

- `deploy` job 的 job 级 `if` 去掉 `secrets` 判空，只保留：
  ```yaml
  if: >-
    github.ref == 'refs/heads/main' &&
    github.event_name != 'pull_request'
  ```
- 「未配密钥则跳过」的判断**下沉到 deploy step 级 `if`**（step 级允许引用 `secrets`）：
  ```yaml
  - name: Deploy (build + wrangler deploy)
    if: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}
    run: pnpm deploy
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  ```
- 未配 `CLOUDFLARE_API_TOKEN` 时该 step 跳过（非失败），仍符合「先别部署」约束。

## 验证

- `js-yaml` 解析确认结构：`deploy.if` 只含 ref/event；deploy step `if` = `${{ secrets.CLOUDFLARE_API_TOKEN != '' }}`。
- 推送后用 `gh workflow run ci-cd.yml` 手动触发：应能**正常创建运行并生成 `test` + `deploy` 两个 job**（不再 0 job）；未配密钥时 deploy 的 step 显示 skipped。
- 门禁全绿（本地 `pnpm fmt:check/lint/typecheck/verify/build` 同口径）。

## 注意事项

- 这是 00020 的缺陷修复，不改其它门禁逻辑；deploy 的 `env` 注入方式不变，配好两个 secret 后照常自动部署到 `yuanwu-knowisle.cmtlyt.top`（见 00021）。
- 踩坑回写：`.workbuddy/skills/pitfall-resolver/references/github-actions.md` 新增条目，SKILL.md 速查表与关键词登记。

## 相关

- 工作流来源见 `00020-github-actions-ci-cd/overview.md`；自定义域名见 `00021-cloudflare-custom-domain/overview.md`。
- 踩坑回写见 `.workbuddy/skills/pitfall-resolver/references/github-actions.md`。
