# GitHub Actions（workflow 表达式 / 触发 / 排障）

## `if` 引用 `secrets` 上下文（job 级或 step 级）→ workflow 解析失败、0 job 生成

| 症状 | 根因 | 处理 |
|---|---|---|
| 工作流 push 后运行**全部** `failure`，且表现为「`created == started == updated` 同秒 + `0 个 job` + `run_completed_at=null`」；`gh run view` 提示 "This run likely failed because of a workflow file issue" | **任何 `if` 表达式（job 级与 step 级）都不能引用 `secrets` 上下文**，否则整个 workflow 在解析/编译阶段报错、0 job。`if` 里可用 `github`/`inputs`/`needs`/`vars`/`env`/`matrix`，唯独 `secrets` 不可解析。⚠️ 已实测纠正：「step 级 `if` 允许引用 secrets」是错的（`gh workflow run` 第二次 422 报 `Line 88: Unrecognized named-value: 'secrets'` 直接证伪） | **哨兵值模式（sentinel pattern）**：① 把 secret 经 **job 级 `env:`** 映射并加兜底——`CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN || 'not-set' }}`（`env` 上下文**允许**引用 `secrets`）；② 在 deploy step 级写 `if: ${{ env.CLOUDFLARE_API_TOKEN != 'not-set' }}`（`env` 上下文**允许**出现在 `if`）；③ job 级 `if` 只查 `github.ref` / `github.event_name`。未配密钥时 step 跳过（非失败），不会误上线 |

定位手段（本地 `js-yaml`/`yaml@2` 只查语法、不查表达式上下文，会漏判）：

- **最权威**：`gh workflow run <file>`（手动触发），GitHub 会直接返回解析错误，例如
  `failed to parse workflow: (Line: N, Col: M): Unrecognized named-value: 'secrets'. Located at position K within expression: <expr>`——精确到行与表达式。
- `gh run list` / `gh run view <id>` 看是否 0 job、同秒完成；`gh api repos/<owner>/<repo>/actions/runs/<id>` 看 `run_completed_at` 是否为 `null`。
- 0 job 的运行没有日志 / annotations / check-runs 可读（相关 REST 端点返回 404），报错只能靠 `gh workflow run` 的解析阶段或浏览器 Actions 页获取。

> 本项目实例：`00023-github-actions-secrets-if`。`deploy` job 首版 job 级 `if` 含 `secrets.CLOUDFLARE_API_TOKEN != ''`（Line 61 报 422）→ 误改到 step 级 `if`（Line 88 仍报 422，证伪「step 级可用」）→ 最终改**哨兵值模式**（job 级 `env` 映射 `|| 'not-set'` + step 级 `if` 检查 `env`）。

## 0 job / 同秒 failure 的排障顺序

| 症状 | 根因 | 处理 |
|---|---|---|
| 运行 `0s` 完成、`conclusion=failure`、`0 job` | workflow 文件在解析/编译期就失败（表达式、引用了不存在的 context、YAML 缩进/结构） | `gh workflow run <file>` 拿解析错误；`gh api .../actions/workflows` 看 `state`（`active`/`disabled_*`）；本地严格校验前**别只用 js-yaml**（不查表达式上下文） |
| 只有部分 job 跑、其余被 skipped | `needs` 依赖的 job 失败或 `if` 为假 | 属正常行为，看 `gh run view` 里各 job 的 conclusion；`if: false` 的 job 显示 skipped 不计入 failure |
