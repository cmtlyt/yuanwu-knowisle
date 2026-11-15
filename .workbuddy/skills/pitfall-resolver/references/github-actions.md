# GitHub Actions（workflow 表达式 / 触发 / 排障）

## `if` 引用 `secrets`（job 级或 step 级）→ 解析失败、0 job

| 症状 | 根因 | 处理 |
|---|---|---|
| push 后运行**全部** `failure`：「`created == started == updated` 同秒 + `0 个 job` + `run_completed_at=null`」；`gh run view` 提示 "This run likely failed because of a workflow file issue" | **任何 `if`（job 级与 step 级）都不能引用 `secrets`**，否则 workflow 在解析 / 编译期报错、0 job。`if` 可用 `github`/`inputs`/`needs`/`vars`/`env`/`matrix`，唯独 `secrets` 不可解析。⚠️ 已实测纠正「step 级 `if` 可用 secrets」是错的（`gh workflow run` 第二次 422 报 `Line 88: Unrecognized named-value: 'secrets'` 证伪） | **哨兵值模式（sentinel pattern）**：① secret 经 **job 级 `env:`** 映射加兜底 `CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN \|\| 'not-set' }}`（`env` 允许引用 secrets）；② deploy step 写 `if: ${{ env.CLOUDFLARE_API_TOKEN != 'not-set' }}`（`env` 可用于 `if`）；③ job 级 `if` 只查 `github.ref` / `github.event_name`。未配密钥时 step 跳过非失败，不会误上线 |

定位手段（本地 `js-yaml`/`yaml@2` 只查语法不查表达式上下文，会漏判）：

- **最权威**：`gh workflow run <file>`，GitHub 直接返回解析错误，如 `failed to parse workflow: (Line: N, Col: M): Unrecognized named-value: 'secrets'. Located at position K within expression: <expr>`，精确到行。
- `gh run list` / `gh run view <id>` 看 0 job、同秒完成；`gh api repos/<owner>/<repo>/actions/runs/<id>` 看 `run_completed_at` 是否 `null`。
- 0 job 的运行无日志 / annotations / check-runs（REST 端点 404），只能靠 `gh workflow run` 解析阶段或浏览器 Actions 页。

> 本项目实例 `00023-github-actions-secrets-if`：deploy job 首版 job 级 `if` 含 `secrets.CLOUDFLARE_API_TOKEN != ''`（Line 61 报 422）→ 误改 step 级（Line 88 仍 422）→ 最终改哨兵值模式。

## 0 job / 同秒 failure 的排障顺序

| 症状 | 根因 | 处理 |
|---|---|---|
| 运行 `0s` 完成、`conclusion=failure`、`0 job` | workflow 在解析 / 编译期失败（表达式、不存在的 context、YAML 缩进 / 结构） | `gh workflow run <file>` 拿解析错误；`gh api .../actions/workflows` 看 `state`（`active`/`disabled_*`）；本地严格校验别只用 js-yaml |
| 只有部分 job 跑、其余 skipped | `needs` 依赖失败或 `if` 为假 | 正常行为，看 `gh run view` 各 job conclusion；`if: false` 显示 skipped 不计入 failure |
