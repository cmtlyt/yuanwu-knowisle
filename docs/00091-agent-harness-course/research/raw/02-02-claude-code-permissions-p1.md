# 批次 02 · Claude Code 官方权限文档 · 完整第 1/3 片

- 核实日期：2026-11-15
- 暂存目录：`research/raw/`
- URL：https://code.claude.com/docs/en/permissions
- 级别：A（官方文档）
- 来源：工具大输出被折叠后的持久化文件 `chatcmpl-tool-8b31fc00a8a649e1.txt`，按二级标题机械切分，内容未改写
- 注意：会话记录里只留了 `<persisted-output>` 占位与 2048 字节预览，本文件是完整恢复

---
**返回原文**

`````text
以下提取**仅基于你提供的页面文本**；页首提示可通过 `https://code.claude.com/docs/llms.txt` 发现完整文档索引，但本次未展开链接页面。**关键边界**：该页没有出现名为 `PermissionRequest` 的 hook 事件；它明确描述的是 `PreToolUse` hooks、`--permission-prompt-tool` / Agent SDK `canUseTool` callback，以及 mod 的 `tool.check` 事件。

## 简要结论

Claude Code 权限模型是多层组合：

1. **permission modes** 控制整体是否提示、是否自动接受编辑、是否由 classifier 审核。
2. **allow / ask / deny 规则**由 Claude Code 强制执行，优先级固定为 `deny > ask > allow`，且不受规则具体程度影响。
3. **settings.json** 可承载 `permissions.allow`、`permissions.deny` 等规则，并受 settings precedence、workspace trust、managed settings 约束。
4. **工具白名单语法**以 `Tool` 或 `Tool(specifier)` 为基础，Bash、Read/Edit、WebFetch、MCP、Agent、Cd 各有特定匹配规则。
5. **sandboxing** 是 OS 级限制，补充权限规则；权限规则和沙箱配置会合并到最终 sandbox configuration。
6. **hooks** 中 `PreToolUse` 在权限提示前运行，但不能绕过 deny/ask；`PermissionRequest` 本页未定义。
7. **managed policy** 位于最高优先级，命令行参数也不能覆盖 managed permission rule；`--disallowedTools` 只能追加限制。

---

## 1. Permission modes 清单

页面说明：Claude Code 支持多种 permission modes 控制 tool calls 如何获批。要在新会话中改默认模式，可在 settings files 中设置 `defaultMode`。

| Mode | 官方描述提取 |
| :- | :- |
| `default` | 每个工具首次使用时提示权限。CLI、VS Code、JetBrains extensions、desktop app 中标注为 Manual；Claude Code 接受 `manual` 作为别名。 |
| `acceptEdits` | 自动接受文件编辑，以及 working directory 或 `additionalDirectories` 内路径上的常见文件系统命令，如 `mkdir`、`touch`、`mv`、`cp`。 |
| `plan` | Claude 可读取文件、运行 read-only shell commands 进行探索，但不编辑源文件；若会话可用 auto mode，classifier-approved commands 也会运行。CLI 和 VS Code extension 中标注为 Plan。 |
| `auto` | 运行时不做例行提示；在 shell commands、network requests 等动作执行前，由后台 classifier 检查其是否符合用户请求。 |
| `dontAsk` | 自动拒绝所有本来会提示的调用，但已安装的 mod 仍可批准其中一些。working directories 内的文件读取、无需批准的动作，以及通过 `/permissions` 或 `permissions.allow` 预批准的工具仍可运行。`AskUserQuestion`、标记 `requiresUserInteraction` 的 MCP tools、network paths 读取、组织设置为 `ask` 的 connector tools，即使 allow 也会在 `dontAsk` 中被拒绝。 |
| `bypassPermissions` | 跳过权限提示，但 `actions no mode auto-approves` 除外。 |

`bypassPermissions` 警告要点：

> 在 `bypassPermissions` mode 中，Claude Code 会跳过权限提示，包括对 `.git`、`.claude` 等 protected paths 的写入；cross-session messaging safeguards 仍适用。官方强调只应在 containers 或 VMs 等隔离环境使用。

相关禁用/替代设置：

- 阻止 `bypassPermissions` 或 `auto` mode：在任意 settings file 中将 `permissions.disableBypassPermissionsMode` 或 `permissions.disableAutoMode` 设为 `"disable"`。文档指出这些设置最适合放在 managed settings，因为那里不能被覆盖。
- 让无人值守会话不等待权限提示：在 user 或 managed settings 中将 `permissions.denyInsteadOfPrompting` 设为 `true`。文档特别说明：`dontAsk` 是独立的 permission mode，而这个 key 与当前所处的 permission mode 配合工作。
- auto mode 可用时，`/permissions` 对话框还会显示 auto mode classifier rules，可在 **Auto mode** tab 查看。

---

## 2. Permission system 与 allow / ask / deny 规则

### 2.1 分层权限系统：哪些动作会提示

原始表格描述的是 **Manual mode 是否在运行动作前询问**；其他 permission modes 会改变哪些动作需要询问，auto mode 则由 classifier 代替用户审核。

| Tool type | Example | Approval required | `"Yes, and don't ask again"` behavior |
| :- | :- | :- | :- |
| Read-only | File reads, Grep | 不提示，限于 working directory 和 additional directories 内 | N/A |
| Bash commands | Shell execution | 提示，内置 read-only commands 除外 | 按 repository 和 command 永久保存 |
| File modification | Edit/write files | 提示 | 仅持续到 session end |
| Web fetch | WebFetch | 提示，内置 preapproved documentation domains 除外 | 按 repository 和 domain 永久保存 |
| Web search | WebSearch | 提示 | 按 repository 永久保存 |

补充细节：

- 权限提示会展示 Claude 即将做什么及选项。
- 第三个选项 **Yes, and switch to auto mode** 不会出现在每个提示里。
- 当 `"Yes, and don't ask again"` 会永久保存时，如 Bash command 或 WebFetch domain，Claude Code 会把规则保存到 git repository 根目录下的 `.claude/settings.local.json`，并通过 worktrees 解析到 main checkout。规则适用于该 repository 未来所有会话，包括子目录和 worktrees。
- file-modification approval 不写入文件，只持续到 session end。
- 在 git repository 之外或 Windows 等情况下，Claude Code 可能不用 repository root，而改用其他保存位置。
- 有时提示只提供一次性批准，没有 `"don't ask again"` 或 session-wide 选项；原因是 Claude Code 只在提示能完整展示规则会允许什么时才提供这些选项。
- 对 `watch` 这类 exec wrapper，或 `find -delete` 这类动作，需参考 Exec wrappers and `find` actions。

### 2.2 `/permissions` 中的规则类型

可通过 `/permissions` 查看和管理 tool permissions。对话框列出所有 permission rules 及每条规则来自的 `settings.json`。Claude 正在工作时也可打开；添加或删除规则后，从同一 turn 的下一个 tool call 开始生效。v2.1.234 之前会把命令排队到 turn 结束。

- **Allow** rules：让 Claude Code 使用指定工具，无需手动批准。
- **Ask** rules：Claude 尝试使用指定工具时要求确认。
- **Deny** rules：阻止 Claude Code 使用指定工具。

核心顺序，原文：

> "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome, and rule specificity doesn't change the order."

含义：

- 宽泛 deny，如 `Bash(aws *)`，会阻断所有匹配调用，即使同时有更窄的 allow，如 `Bash(aws s3 ls)`。
- allow 规则不能从 deny 规则中挖例外。
- ask 与 allow 同理：只要匹配的 ask 规则存在，即使更具体的 allow 也匹配，仍会提示。
- deny 规则是否移除整个工具取决于写法：
  - bare tool name，如 `Bash`：把工具从 Claude 的 context 中完全移除，Claude 看不到它。
  - scoped rule，如 `Bash(rm *)`：工具仍可用，只在 Claude 尝试匹配调用时阻止。
- bare-name removal 适用于除 `EndConversation` 外所有工具；只要还有其他工具存在，deny 不能移除 `EndConversation`，ask 也不会为它提示。

强制边界，原文：

> "Permission rules are enforced by Claude Code, not by the model."

也就是：`prompt` 或 `CLAUDE.md` 只能影响 Claude 尝试做什么，不能改变 Claude Code 允许什么。授权/撤销应使用 `/permissions`、规则、permission mode 或 `PreToolUse` hook。

---

## 3. settings.json 配置形状与优先级

### 3.1 配置形状

页面给出的 JSON 示例可归纳为：顶层对象包含 `permissions`，其中 `allow`、`deny` 是字符串规则数组。规则类型层面有 Allow / Ask / Deny，但该页**没有给出 `permissions.ask` 的 JSON 示例**，也没有 managed policy 的 JSON 示例。所有页面中的 JSON 示例原文见文末附录。

页面明确提到的相关 settings / keys：

- `defaultMode`：改变新会话默认 permission mode。
- `permissions.allow`：allow 规则；项目中的该规则需 workspace trust 后才生效。
- `permissions.deny`：deny 规则。
- `permissions.additionalDirectories`：在 settings file 中列出 additional directories；只授予文件访问，不加载配置。
- `permissions.disableBypassPermissionsMode`、`permissions.disableAutoMode`：设为 `"disable"`。
- `permissions.denyInsteadOfPrompting`：设为 `true`，用于拒绝会等待权限提示的调用。
- `permissions.blockReadsOutsideWorkingDirectories`：为 `true` 时，file tools 拒绝读取 working directories 外路径。
- `permissions.blockWritesOutsideWorkingDirectories`：为 `true` 时，`Write`、`Edit`、`NotebookEdit` 拒绝写入 working directories 外路径；不限制 shell commands、MCP tools 或 hooks 启动的程序。需 v2.1.314+。
- `allowManagedPermissionRulesOnly`：使 managed settings 成为 permission rules 的唯一来源。
- `sandbox.autoAllowBashIfSandboxed`：开启 sandboxing 并设为 `true` 时，sandboxed Bash commands 免提示运行。
- `allowManaged*Only` locks：影响 embedder 通过 SDK `managedSettings` 提供 permission allow rules 的能力。

### 3.2 规则写入位置与 settings source

- 永久 `"Yes, and don't ask again"` 规则通常写入 git repository 根目录的 `.claude/settings.local.json`。
- `/permissions` 添加规则时，规则锚定到保存它的 settings file 对应的 source。
- Read/Edit path patterns 中 `/path` 的锚点取决于设置来源：

| Rule defined in | `/path` resolves to |
| :- | :- |
| Project settings at `.claude/settings.json` | `<primary working directory>/path` |
| Local settings at `.claude/settings.local.json` | `<primary working directory>/path` |
| User settings at `~/.claude/settings.json` | `~/.claude/path` |
| A file passed with `--settings <file>` | `<directory of file>/path` |
| CLI flags or session rules | `<primary working directory>/path` |

要点：

- local settings 规则锚定 session 的 primary working directory，而不是保存文件的 repository root。
- 在 worktree 会话中，共享规则如 `Edit(/src/**)` 匹配该 worktree 自己的 `src/`。
- user settings 中的 `Read(/secrets/**)` 阻断 `~/.claude/secrets/**`，不是项目内 `secrets`。
- Windows 路径会先规范化为 POSIX：`C:\Users\alice` 变成 `/c/Users/alice`；匹配该盘任意 `.env` 用 `//c/**/.env`，跨盘用 `//**/.env`。

### 3.3 settings precedence

原文明确：

> "Permission rules follow the same settings precedence as all other Claude Code settings, with managed settings highest: no other level, including command line arguments, can override a managed permission rule."

要点：

- managed settings 最高；包括 command line arguments 在内，其他层级都不能覆盖 managed permission rule。
- 如果工具在任意层级被 deny，其他层级不能 allow。
- managed settings 的 deny 不能被 `--allowedTools` 覆盖。
- `--disallowedTools` 可以在 managed settings 之上追加限制。
- 跨 settings scopes：
  - user settings allow、project settings deny：deny 阻断。
  - user settings deny、project settings allow：user deny 仍阻断。
  - 原因仍是 deny rules from any scope 在 allow rules 之前评估。
- 文档说明这种 precedence 是 settings files 与 command line arguments 之间；deny 是否对 mod 生效需看 hooks/mods 部分。

### 3.4 Workspace trust 对项目 allow 的影响

项目的 `.claude/settings.json` 中：

- `permissions.allow` rules
- `permissions.additionalDirectories` entries

会授予能力，因此只有在用户接受 workspace trust dialog 后才应用。对话框会列出会授予的规则和目录。`deny` 和 `ask` 不受影响，因为它们只限制能力。

trust 存储与作用范围：

- 在 repository 中：trust 以 git repository root 为 key，覆盖整个 repository，嵌套 git repository 如 submodule 除外。
- 在 worktree 中：使用 main checkout 的 root。
- 在 repository 外：以启动目录为 key，覆盖其子目录，嵌套 git repository 除外。
- 从 home directory 启动：trust 仅当前 session 有效，不写磁盘。
- VS Code extension 会以 `Trust this folder in Claude Code?` 对话框询问。
- interactive terminal sessions 显示 trust dialog；`claude -p` 或 SDK sessions 不显示。
- 父目录被信任不等于这些规则已获信任。
- background session 启动/重启前也会检查 trust；无对话框的脚本环境会以 `Workspace not trusted` 错误退出。

`.claude/settings.local.json` 的 trust：

- 通常视为用户自己的文件，其 allow rules / additional directories 无需 trust。
- 若该文件被 git 跟踪，或 `.claude` 是 symlink，则视为 repository-supplied，规则会保留到用户信任该 folder。
- configuration home 例外会跳过 trust 检查，但 `~/.claude/settings.local.json` 仍是 local scope，只在 home directory 自身启动的 session 中读取；跨项目规则应放在 `~/.claude/settings.json` 或 `$CLAUDE_CONFIG_DIR/settings.json`。

未信任 folder 前，页面表格的关键分类：

| 仓库提供的内容 | 只信任了父目录 | `claude -p` / SDK，folder 从未信任 |
| :- | :- | :- |
| settings files 中的 Hooks、`env`、helper commands 如 `apiKeyHelper`，project skill 的 hooks 和 `allowed-tools` | Used | Used |
| `.claude/settings.json` 中 `permissions.allow` 与 `additionalDirectories` | 直到再次接受 trust dialog 才使用 | 不使用，并输出 `this workspace has not been trusted` 警告到 stderr |
| project subagent frontmatter hooks、project `@skills-dir` plugin、`extraKnownMarketplaces`、subagent frontmatter 中 inline `mcpServers` | 不使用，也不提供 dialog | 不使用 |
| `.mcp.json` 中 servers | 连接前询问；仓库自己的 approvals 不算 | 不问直接连接；SDK 仅在 `settingSources` 包含 project settings 时加载 |
| `.mcp.json` server 的 `headersHelper` | 信任前不运行，仅使用 static `headers` | 不运行，仅使用 static `headers`，并输出 `headersHelper not run` |

手动信任方式：在 `~/.claude.json` 中设置 `projects["<path>"].hasTrustDialogAccepted` 为 `true`，其中 `<path>` 是 repository root 或 repository 外的 folder 本身。

在未写过的 repository 中运行 `claude -p` 前，文档建议考虑：

- `--setting-sources user`，或 SDK 的 `settingSources` 不包含 project settings；
- `--bare`，跳过项目的 hooks、skills、custom commands、subagents、plugins、`.mcp.json` servers；但 project `env` 和 helpers 仍适用，`apiKeyHelper` 只从 `--settings` 读取；
- `--settings '{"disableAllHooks": true}'` 关闭该次运行的 hooks；只在 user settings 设置不够，因为 project settings 可覆盖回 `false`；
- 添加 `disabledMcpjsonServers` 条目，按名称拒绝 `.mcp.json` server。

---
`````
