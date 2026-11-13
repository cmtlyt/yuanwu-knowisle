# GitHub Actions（workflow 表达式 / 触发 / 排障）

## job 级 `if` 引用 `secrets` 上下文 → workflow 解析失败、0 job 生成

| 症状 | 根因 | 处理 |
|---|---|---|
| 工作流 push 后运行**全部** `failure`，且表现为「`created == started == updated` 同秒 + `0 个 job` + `run_completed_at=null`」；`gh run view` 提示 "This run likely failed because of a workflow file issue" | **GitHub Actions 的 job 级 `if:` 表达式不能引用 `secrets` 上下文**（`github`/`inputs`/`needs`/`vars`/`env`/`matrix` 可以，`secrets` 在 job 级 `if` 里不可解析）。把 `secrets.X != ''` 写进 job 的 `if` 会让整个 workflow 在编译/解析阶段直接报错，一个 job 都不会被创建 | ① job 级 `if` 去掉 secrets 判空，只查 `github.ref` / `github.event_name`；② 「未配密钥则跳过」的判断**下沉到 step 级 `if`**（step 的 `if:` 允许引用 `secrets`），如 `if: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}`，配合该 step 的 `env:` 注入 token。未配密钥时该 step 显示 skipped（非失败），不会误上线 |

定位手段（本地 `js-yaml`/`yaml@2` 只查语法、不查表达式上下文，会漏判）：

- **最权威**：`gh workflow run <file>`（手动触发），GitHub 会直接返回解析错误，例如
  `failed to parse workflow: (Line: N, Col: M): Unrecognized named-value: 'secrets'. Located at position K within expression: <expr>`——精确到行与表达式。
- `gh run list` / `gh run view <id>` 看是否 0 job、同秒完成；`gh api repos/<owner>/<repo>/actions/runs/<id>` 看 `run_completed_at` 是否为 `null`。
- 0 job 的运行没有日志 / annotations / check-runs 可读（相关 REST 端点返回 404），报错只能靠 `gh workflow run` 的解析阶段或浏览器 Actions 页获取。

> 本项目实例：`00023-github-actions-secrets-if`。`deploy` job 首版 `if` 含 `secrets.CLOUDFLARE_API_TOKEN != ''` → 改为 job 级只查 ref + step 级判空。

## 0 job / 同秒 failure 的排障顺序

| 症状 | 根因 | 处理 |
|---|---|---|
| 运行 `0s` 完成、`conclusion=failure`、`0 job` | workflow 文件在解析/编译期就失败（表达式、引用了不存在的 context、YAML 缩进/结构） | `gh workflow run <file>` 拿解析错误；`gh api .../actions/workflows` 看 `state`（`active`/`disabled_*`）；本地严格校验前**别只用 js-yaml**（不查表达式上下文） |
| 只有部分 job 跑、其余被 skipped | `needs` 依赖的 job 失败或 `if` 为假 | 属正常行为，看 `gh run view` 里各 job 的 conclusion；`if: false` 的 job 显示 skipped 不计入 failure |
