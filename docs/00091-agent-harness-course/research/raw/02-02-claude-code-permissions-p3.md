# 批次 02 · Claude Code 官方权限文档 · 完整第 3/3 片

- 核实日期：2026-11-15
- 暂存目录：`research/raw/`
- URL：https://code.claude.com/docs/en/permissions
- 级别：A（官方文档）
- 来源：工具大输出被折叠后的持久化文件 `chatcmpl-tool-8b31fc00a8a649e1.txt`，按二级标题机械切分，内容未改写
- 注意：会话记录里只留了 `<persisted-output>` 占位与 2048 字节预览，本文件是完整恢复

---
**返回原文**

`````text
## 5. 沙箱机制

原文定位：

> "Permissions and sandboxing are complementary security layers:"

两层职责：

- **Permissions**：控制 Claude Code 可以使用哪些工具，以及可访问哪些 files 或 domains；适用于 Bash、Read、Edit、WebFetch、MCP 及其他工具，例外是 deny / ask 在还有其他工具时不能阻断 `EndConversation`。
- **Sandboxing**：提供 OS-level enforcement，限制 shell commands 的 filesystem 和 network access；适用于 Bash、PowerShell、Monitor tool commands 及其 child processes。

关键结论：

- 应同时使用两者做 defense-in-depth；即使 prompt injection 绕过 Claude 的决策，sandbox restrictions 仍生效。
- sandbox settings 与 permission rules 中的 paths / domains 会 merged into final sandbox configuration。
- 启用 sandboxing 且 `sandbox.autoAllowBashIfSandboxed` 为 `true` 时，sandboxed Bash commands 免提示运行；即使有 bare `Bash` ask rule 或等价 `Bash(*)`，sandbox boundary 也替代整个工具的提示。
- plan mode 会跳过这种 substitution：
  - 没有 ask rule 时，内置 read-only commands 仍免提示；
  - 其他 shell command 在 planning 期间走常规 permission flow；
  - 有 bare `Bash` ask rule 时，每条 Bash command 都提示，包括 sandboxed read-only commands。
- 仍生效的检查：
  - content-scoped ask rules，如 `Bash(git push *)`，仍强制提示；
  - 其他 sandboxed commands 也可能走常规 permission flow；
  - 不会在 sandbox 中运行的 commands，如 excluded commands，仍按 bare `Bash` ask rule 处理。

WebFetch 与 sandbox network isolation 的关系：

- `WebFetch(domain:*)` 在 allow 中让 sandboxed commands 可访问任意 host；在 deny 中让 sandboxed commands 无法访问任何 host。
- bare `WebFetch` 不改变 sandboxed commands 可达 hosts。
- `WebFetch(domain:github.com)` 等 domain rule 会加入 sandbox allowed / denied domain list。
- 若限制必须可靠成立，不能只靠 Bash deny 或 WebFetch；应配合 sandbox network allowlist。
- `WebFetch` alone 不阻止 network access；若 Bash 可用，Claude 仍可用 `curl`、`wget` 等访问任意 URL。

Working directories 相关：

- 默认 Claude 可访问启动目录，即 primary working directory，直到用 `/cd` 移动 session。
- 扩展访问方式：
  - startup：`--add-dir <path>`
  - session：`/add-dir`
  - persistent：`additionalDirectories` in settings files
- additional directories 中文件遵循与原 working directory 相同的 permission rules：除 network path 检查外可读且免提示，编辑权限遵循当前 permission mode。
- 大多数 network paths 不能作为 working directories，因为查找会联系 host；Windows 应先映射为 drive letter 并用 `--add-dir`。
- `permissions.blockReadsOutsideWorkingDirectories` 为 `true`：file tools 在所有 mode 中拒绝工作目录外读取，包括 `bypassPermissions`，但 Claude Code 自身需要的文件除外。auto mode 中首次读取工作目录外时，Claude Code 会提议开启。
- `permissions.blockWritesOutsideWorkingDirectories` 为 `true`：`Write`、`Edit`、`NotebookEdit` 拒绝工作目录外写入，Claude Code 自身部分文件如 plan files 除外。该 key 不限制 shell commands、MCP tools 或 hooks 启动的程序；限制 shell writes 应使用 sandboxing。需 v2.1.314+。
- 若任一 block key 为 `true`，要让某个外部目录仍可达，应把它 add as a working directory。

Additional directories 与配置加载：

- 添加目录扩展 read/edit 文件访问，但不使该目录成为完整 configuration root；大多数 `.claude/` configuration 不会从 additional directories 发现。
- 例外只适用于用 `--add-dir` 或 `/add-dir` 添加的目录，包括 Agent SDK 通过 flag 添加的目录。settings file 中 `permissions.additionalDirectories` 列出的目录只授予文件访问，不加载配置。
- Agent SDK 的 TypeScript `additionalDirectories`、Python `add_dirs` 也获得例外，因为 SDK 会把每个 entry 作为 `--add-dir` 传给 Claude Code。
- 从 flag-added directory 加载的配置类型：

| Configuration | Loaded from `--add-dir` |
| :- | :- |
| Skills in `.claude/skills/` | Yes, with live reload |
| Command files in `.claude/commands/` | Yes, without live reload；added directory 与 project 同名 command 冲突时运行 project command |
| Subagents in `.claude/agents/` | Yes, without live reload |
| Settings in `.claude/settings.json` and `.claude/settings.local.json` | 仅 `enabledPlugins` 和 `extraKnownMarketplaces` keys |
| `CLAUDE.md` files, `.claude/rules/`, `CLAUDE.local.md` | 仅当 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`；`CLAUDE.local.md` 还需 `local` setting source，默认启用 |

- Skills、commands、subagents 从 flag-added directory 通过 `project` setting source 加载；若用 `--setting-sources` 或 SDK `settingSources` 排除 project 则不加载；bare mode 会跳过其中的 commands 和 subagents。
- 从 primary working directory 的子目录加载 skills / commands / subagents，可在 session 中用 `/add-dir` 指向该子目录；因为子目录本就可读，不会额外提示或新增 working directory。需 v2.1.257+。
- output styles 从 current working directory 及 parents、`~/.claude/`、managed settings 发现；hooks 和其他 `.claude/settings.json` keys 从 current working directory 的 `.claude/` folder 加载，无 parent-directory fallback，并与 user `~/.claude/settings.json`、managed settings 一起加载。
- `.claude/settings.local.json` 从 git repository root 加载，即使从子目录启动 Claude Code，除非落在文档所列不使用 repository root 的情况。

---

## 6. Hooks 在权限判定链中的位置（PreToolUse / PermissionRequest）

### 6.1 `PermissionRequest` 的提取边界

**该页没有出现 `PermissionRequest` hook 事件名称**，也没有给出其触发时机、输入输出或与 `PreToolUse` 的先后关系。因此不能从本页提取 `PermissionRequest` 的官方定义。

本页可确认的相关机制是：

- `PreToolUse` hooks；
- `--permission-prompt-tool`；
- Agent SDK `canUseTool` callback；
- mod 的 `tool.check` event；
- 权限提示本身。

### 6.2 `PreToolUse` 的位置与能力

原文：

> "When Claude Code makes a tool call, PreToolUse hooks run before the permission prompt, for every tool except `EndConversation`."

以及：

> "The hook output can deny the tool call, force a prompt, or skip the prompt to let the call proceed."

即：

1. Claude Code 发起 tool call。
2. `PreToolUse` hooks 在 permission prompt 之前运行，除 `EndConversation` 外覆盖每个工具。
3. hook 输出可：
   - deny tool call；
   - force a prompt；
   - skip the prompt，让 call 继续。

### 6.3 规则、hooks、mods 的优先级

原文：

> "PreToolUse hook decisions don't bypass permission rules."

具体：

- Claude Code 不管 `PreToolUse` hook 返回什么，都会评估 deny / ask rules：
  - 匹配 deny rule：阻断调用；
  - 匹配 ask rule：仍提示，即使 hook 返回 `"allow"` 或 `"ask"`。
- 这保留了 deny-first precedence，包括 managed settings 中的 deny rules。
- 该 precedence 覆盖 settings files 和 plugin `hooks/hooks.json` 中的 hooks。
- mod 处理 `tool.check` event 时，是在 `PreToolUse` hooks 运行之后给出答案。

有 managed settings、`managed-mcp.json` file，或 Team / Enterprise `/login` 作为 session credential 时，mod 批准调用后以下结果默认仍保持：

- deny rule 拒绝的调用仍拒绝；
- ask rule 本应提示的调用仍提示；
- `PreToolUse` hook 或 `permissions.blockReadsOutsideWorkingDirectories` 本应提示的调用仍提示；
- `PreToolUse` hook 阻断的调用仍阻断，无论 hook 来自哪个 settings file；
- `--permission-prompt-tool` 或 Agent SDK `canUseTool` callback 本应被询问的调用仍交给该 tool / callback。

若 setup 缺少 managed settings、`managed-mcp.json`，且没有 Team / Enterprise `/login` 作为 session credential，则：

- mod 可以批准一个 deny rule 拒绝或 `PreToolUse` hook 阻断的调用；
- mod 批准时，ask rule、`PreToolUse` hook 或 `permissions.blockReadsOutsideWorkingDirectories` 本应提示的调用不再提示；
- `--permission-prompt-tool` 或 `canUseTool` callback 也不会被询问。
- 文档特别提醒：用 API key 或 long-lived `CLAUDE_CODE_OAUTH_TOKEN` 不算使用该 login，即使该 login 已存储。

Auto / plan / `dontAsk` 与 mod：

- **Auto mode**：mod 批准的调用无需 classifier check 即可运行，除非 mod 不能绕过 permission prompt tool 或 Agent SDK permission callback；那里 classifier 先检查。
- **Plan mode**：mod 不能批准非 read-only 调用，如 file edit 或写 shell command。
- **`dontAsk` mode**：mod 可以批准一个“仅因该 mode 才会被拒绝”的调用。

用户交互工具：

- `AskUserQuestion` 或标记 `requiresUserInteraction` 的 MCP tool，mod 的 `tool.check` approval 不跳过提示。需 v2.1.292+。
- 标记 `requiresUserInteraction` 的 MCP tools 在 hook 返回 `"allow"` 时仍提示；network paths 读取、组织设为 `ask` 的 connector tools 也如此。

Blocking hook 与 allow rules：

> A blocking hook also takes precedence over allow rules.

- hook 以 code 2 退出时，会在 permission rules 评估前停止 tool call，因此即使 allow rule 原本会放行，block 仍生效。
- 文档给出的模式：要运行所有 Bash commands 免提示但阻断少数命令，可把 `"Bash"` 加入 allow list，并注册 `PreToolUse` hook 拒绝那些具体命令。

### 6.4 Hook approvals in plan mode

- plan mode 中，除 `ExitPlanMode` 外，`PreToolUse` hook 的 `"allow"` 对 file edit 或其他非 read-only calls 无效；调用会得到与没有 hook 时相同的 prompt、block 或 approval。
- Claude Code 仍会应用 hook 返回的任何 `updatedInput`。
- 若 hook 对 `ExitPlanMode` 返回 `"allow"` 且带 `updatedInput`，该 tool 仍可无提示运行。
- plan mode 中 mod 的 `tool.check` 也不能批准 file edit 或其他非 read-only call，但仍能 block。要解除该限制，可 approve the plan 或切换到其他 permission mode。

---

## 7. Managed policy 的覆盖关系

### 7.1 Managed settings 总体覆盖

文档说明：管理员可部署 managed settings 做集中控制，user 和 project settings 不能覆盖它们，**除少数 security-sensitive keys 外**。

- `allowManagedPermissionRulesOnly`：让 managed settings 成为 permission rules 的唯一 settings source；其条目会列出 Claude Code 随后忽略的每个 source。
- `disableBypassPermissionsMode`：通常放在 managed settings 以执行组织策略，但在任意 scope 都有效；用户也可在自己的 settings 中设置它，把自己锁在 bypass mode 之外。
- 交付机制、managed tier 内部 precedence、只能由 managed settings 设置的 keys，由 Deploy managed settings 相关页面覆盖。

### 7.2 Settings precedence 与 deny 的全局性

- managed settings 最高。
- 其他层级，包括 command line arguments，不能覆盖 managed permission rule。
- 任意层级 deny，其他层级不能 allow。
- managed deny 不能被 `--allowedTools` 覆盖。
- `--disallowedTools` 可在 managed settings 定义之外追加限制。
- user allow / project deny：deny 生效。
- user deny / project allow：user deny 生效，因为 deny rules from any scope 都先于 allow rules 评估。
- 该 precedence 是 settings files 与 command line arguments 之间；deny rule 是否对 mod 生效，要看 `Extend permissions with hooks` 中 managed settings / mod 的规则。

### 7.3 Embedding hosts 与 SDK managed policy

- Embedding hosts 可通过 SDK `managedSettings` option 提供额外 managed policy，包括 permission allow rules，除非 admin 设置了 `allowManaged*Only` locks。
- `Deliver policy to Claude Desktop sessions` 相关页面覆盖 embedder policy 何时适用。

### 7.4 Managed policy 与 hooks / mods 的交叉关系

有 managed settings、`managed-mcp.json`，或 Team / Enterprise `/login` 作为 session credential 时，mod 的批准默认不能越过：

- deny rule；
- ask rule；
- `PreToolUse` hook 或 `permissions.blockReadsOutsideWorkingDirectories` 导致的提示；
- `PreToolUse` hook 的阻断；
- `--permission-prompt-tool` / `canUseTool` callback 的询问。

没有这些 managed / login 条件时，mod 在文档所述 setup 中可以批准被 deny rule 或 hook 阻断的调用，也可跳过部分提示或 callback。

### 7.5 Workspace trust 与 project allow

- project `.claude/settings.json` 的 `permissions.allow` 和 `permissions.additionalDirectories` 是授予能力的规则，因此必须经 workspace trust dialog 后才应用。
- `deny` 和 `ask` 不受 trust 影响，因为它们只限制。
- managed settings 位于最高 precedence；trust 本身不等于覆盖 managed permission rules。

---

## 8. 官方配置示例原文（逐字保留）

以下为该页面中与权限配置相关的 JSON 示例原文，保留代码围栏中的 `theme={null}`。页面未提供 `permissions.ask` 数组或 managed policy 的 JSON 示例。

### 8.1 Bash wildcard allow / deny

```json theme={null}
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git commit *)"
    ],
    "deny": [
      "Bash(git push *)"
    ]
  }
}
```

### 8.2 Deny every MCP tool

```json theme={null}
{
  "permissions": {
    "deny": [
      "mcp__*"
    ]
  }
}
```

### 8.3 PowerShell allow / deny

```json theme={null}
{
  "permissions": {
    "allow": [
      "PowerShell(Get-ChildItem *)",
      "PowerShell(git commit *)"
    ],
    "deny": [
      "PowerShell(Remove-Item *)"
    ]
  }
}
```

### 8.4 Bare `WebFetch` allow，保持 sandbox allowlist 不变

```json theme={null}
{
  "permissions": {
    "allow": ["WebFetch"]
  }
}
```

### 8.5 Disable Explore agent

```json theme={null}
{
  "permissions": {
    "deny": ["Agent(Explore)"]
  }
}
```
`````
