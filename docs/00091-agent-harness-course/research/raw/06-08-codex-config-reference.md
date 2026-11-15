# 批次 06 · WebFetch · https://learn.chatgpt.com/docs/config-file/config-reference.md

- 核实日期：2026-11-15
- 服务器时间：2026-11-15 19:45 GMT+8
- URL：https://learn.chatgpt.com/docs/config-file/config-reference.md
- callId：call_3fa7f973dbb0487a8277d5ed
- 来源：会话记录中该工具调用的原始返回文本，机械导出、未经改写

---

**返回原文**

`````text
# Codex 官方 Config Reference 关键参数提取

以下是页面中**确实出现**的参数与取值汇总。

## 1. `approval_policy`（审批策略）

- **类型/取值**：`on-request | never | { granular = { ... } }`
- `untrusted` **不再支持**，`on-failure` 已弃用（交互式用 `on-request`，非交互式用 `never`）
- **granular 子项**（均为 boolean）：
  - `approval_policy.granular.sandbox_approval`
  - `approval_policy.granular.rules`
  - `approval_policy.granular.mcp_elicitations`
  - `approval_policy.granular.request_permissions`
  - `approval_policy.granular.skill_approval`
- 相关：`approvals_reviewer` = `user | auto_review`；用户级 `~/.codex/config.toml` 中项目条目 `trust_level = "untrusted"` 仍受支持。

## 2. `sandbox_mode`（沙箱模式）

- **取值**：`read-only | workspace-write | danger-full-access`
- `sandbox_workspace_write.*` 子项：
  - `writable_roots`（array\<string\>，额外可写根目录）
  - `network_access`（boolean，workspace-write 沙箱内允许出站网络）
  - `exclude_tmpdir_env_var`（boolean）
  - `exclude_slash_tmp`（boolean）
- Windows 相关：`windows.sandbox` = `mxc | elevated | unelevated`

## 3. `model_providers`（自定义模型提供方）

- `model_providers.<id>`：内置 ID `openai`、`ollama`、`lmstudio` 为保留名，不可覆盖
- 关键子项：
  - `name`、`base_url`、`model_catalog_url`
  - `env_key`（API key 环境变量）、`env_key_instructions`
  - `experimental_bearer_token`（不推荐，建议用 `env_key`）
  - `requires_openai_auth`（默认 false）
  - `wire_api` = `responses`（唯一支持的值）
  - `capabilities.external_web_access`、`capabilities.remote_compaction` = `unsupported | v2`
  - `query_params`、`http_headers`、`env_http_headers`
  - `request_max_retries`（默认 4）、`stream_max_retries`（默认 5）、`stream_idle_timeout_ms`（默认 300000）
  - `supports_websockets`、`supports_standalone_web_search`
  - `auth.command` / `auth.args` / `auth.timeout_ms`（默认 5000）/ `auth.refresh_interval_ms`（默认 300000）/ `auth.cwd`（不得与 `env_key`、`experimental_bearer_token`、`requires_openai_auth` 组合）
- **内置 gcp 提供方**：`model_providers.gcp.base_url`、`project_id`、`location`（默认 `global`）、`credential_file`
- **内置 amazon-bedrock 提供方**：`model_providers.amazon-bedrock.aws.profile`、`.aws.region`
- 顶层相关：`model_provider`（默认 `openai`）、`openai_base_url`

## 4. Profile 配置

- 用户级配置位于 `~/.codex/config.toml`；项目级覆盖在 `.codex/config.toml`（仅在信任项目时加载）
- **Profile 文件**位置：`$CODEX_HOME/profile-name.config.toml`（与 `config.toml` 同目录），用 `--profile profile-name` 选择
- 项目级配置**不可覆盖**（会被忽略）的键：`openai_base_url`、`chatgpt_base_url`、`apps_mcp_product_sku`、`model_provider`、`model_providers`、`notify`、`profile`、`profiles`、`experimental_realtime_ws_base_url`、`otel`
- 顶层 `profile` 键存在，但项目本地配置中被忽略；相关：`projects.<path>.trust_level` = `"trusted" | "untrusted"`

## 5. AGENTS.md 相关配置

- `project_doc_max_bytes`（number）：构建项目指令时从 `AGENTS.md` 读取的最大字节数
- `project_doc_fallback_filenames`（array\<string\>）：`AGENTS.md` 缺失时的备选文件名
- `project_root_markers`（array\<string\>）：搜索项目根目录时的标记文件
- `model_instructions_file`：替代内置指令的文件（取代旧的 `experimental_instructions_file`，后者需重命名）；`instructions` 键保留，建议用 `model_instructions_file` 或 `AGENTS.md`
- `developer_instructions`：注入会话的额外开发者指令（可选）

## 6. 通知与压缩（Compaction）参数

**通知：**
- `notify`：接收 Codex JSON 载荷的通知命令（项目级配置中被忽略）
- `tui.notifications`：boolean | array\<string\>
- `tui.notification_method` = `auto | osc9 | bel`
- `tui.notification_condition` = `unfocused | always`（默认 unfocused）

**历史压缩（auto-compact）：**
- `model_auto_compact_token_limit`：触发自动历史压缩的 token 阈值
- `model_auto_compact_token_limit_scope` = `total | body_after_prefix`
- `model_post_turn_compact_threshold_percent`：整数 0–100，回合结束时按可用上下文窗口百分比触发压缩；`0` 或省略则禁用
- `compact_prompt`：内联覆盖压缩提示词
- `experimental_compact_prompt_file`：从文件加载压缩提示词覆盖（实验性）

## 备注

- 沙箱/审批键的详细行为需配合 "Sandbox and approvals"、"Protected paths"、"Network access" 等文档页。
- 最新 JSON Schema：`https://learn.chatgpt.com/docs/config-schema.json`；可在 VS Code/Cursor 中配合 Even Better TOML 扩展实现自动补全。
`````
