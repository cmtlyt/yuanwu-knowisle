# 批次 02 · Claude Code 官方权限文档 · 完整第 2/3 片

- 核实日期：2026-11-15
- 暂存目录：`research/raw/`
- URL：https://code.claude.com/docs/en/permissions
- 级别：A（官方文档）
- 来源：工具大输出被折叠后的持久化文件 `chatcmpl-tool-8b31fc00a8a649e1.txt`，按二级标题机械切分，内容未改写
- 注意：会话记录里只留了 `<persisted-output>` 占位与 2048 字节预览，本文件是完整恢复

---
**返回原文**

`````text
## 4. 工具白名单语法

### 4.1 基础语法

权限规则格式为：

- `Tool`
- `Tool(specifier)`

补充说明：

- specifier 内的括号是字面量，不需转义。
- 只写工具名匹配该工具所有使用：

| Rule | Effect |
| :- | :- |
| `Bash` | Matches all Bash commands |
| `WebFetch` | Matches all web fetch requests |
| `Read` | Matches all file reads |

- `Bash(*)` 等价于 `Bash`；作为 deny rule 时二者都会移除工具。
- transcript / permission dialog 中显示的 label 可能不同于 canonical name。例如 label `Stop Task` 的 canonical name 是 `TaskStop`；permission rules 和 hook matchers 不匹配 label，应使用 tools reference 中的 canonical names。
- specifier 示例：

| Rule | Effect |
| :- | :- |
| `Bash(npm run build)` | 精确匹配 `npm run build` |
| `Read(./.env)` | 匹配当前目录 `.env` 的读取 |
| `WebFetch(domain:example.com)` | 匹配对 example.com 的 fetch |

### 4.2 Match by input parameter

deny 和 ask 规则可用 `Tool(param:value)` 匹配任意 built-in tool 的 top-level input parameter。

MCP tool 的参数匹配需用 `--disallowedTools` 传 deny rule；settings file 加载时会跳过任何带括号的 `mcp__` 规则，并在 invalid-settings dialog 或 `claude doctor` 输出中列出。

示例：

| Rule | Matches |
| :- | :- |
| `Agent(model:opus)` | 请求 Opus model tier 的 Agent calls |
| `Agent(isolation:worktree)` | 请求 git worktree 的 Agent calls |
| `Bash(run_in_background:true)` | 后台运行的 Bash calls |

规则限制：

- 参数名必须是工具 input 的直接字段，如 Agent 的 `model`；对象或数组内嵌字段不可匹配。
- 每条规则只命名一个参数；要同时 gate `model` 与 `isolation`，写两条规则。
- value 支持 `*` 通配符；`Agent(isolation:*)` 匹配任何显式 isolation value；没有 `*` 时是精确匹配。
- 模型省略的参数不会被匹配，所以 `Agent(model:*)` 不匹配未设置 `model` 的调用。
- value 与 Claude 发送的字面 input 比较，发生在 normalization 之前；`Agent(model:opus)` 匹配别名 `opus`，不匹配完整 model ID。
- `Skill(skill:<name>)` deny rule 会匹配 skill 的任意名称形式，如 alias 或 display name。
- `--verbose` 可查看每次 tool call 的确切参数名和值。
- 冒号周围空白被忽略。
- 不能用这种方式匹配工具主要 content field：`command`、`file_path`、`path`、`notebook_path`、`url`。例如 `Bash(command:rm *)` 可被 compound command 绕过，因此会被忽略并产生 startup warning；应改用 `Bash(rm *)`、`Read(./path)`、`WebFetch(domain:host)`。

### 4.3 Bash 通配符与命令匹配

`*` 在 Bash rule 中匹配任意文本，包括空格；没有 `*` 的规则只匹配一个精确命令。

官方警告：把 `*` 放在 subcommand 之后。在 `git log --oneline main` 中，`git` 是 program，`log` 是 subcommand。Claude Code 按第一个 `*` 之前的文本匹配，所以：

- `Bash(git log *)` 只允许 `git log` commands；
- `Bash(git *)` 允许所有 git commands；
- `Bash(git * main)` 这类 allow rule 会在 startup 时警告。

匹配表：

| You write | Matches | Doesn't match |
| :- | :- | :- |
| `Bash(npm run build)` | `npm run build` | `npm run build --watch` |
| `Bash(npm run *)` | `npm run build`, `npm run test --watch`, `npm run` | `npm install` |
| `Bash(git log * main)` | `git log --oneline main`, `git log -5 main`, `git log --output=<file> main` | `git log main`, `git push origin main` |
| `Bash(git * main)` | `git merge main`, `git push origin main`, `git -c core.fsmonitor=<script> diff main` | `git log` |
| `Bash(* --version)` | `node --version`, `bash -c 'echo hi' --version` | `node -v` |
| `Bash(ls *)` | `ls -la`, `ls` | `lsof` |
| `Bash(ls*)` | `ls -la`, `lsof` | |
| `Bash(* --help *)` | `npm --help x` | `npm --help` |

三条关键规则：

- `*` 代表其所在位置的任意文本；`Bash(git * main)` 中它可能代表 subcommand 和 options，甚至 `-c`；`Bash(* --version)` 中它代表 program。
- 末尾 `*` 前有空格时，也会匹配 bare command，如 `Bash(ls *)` 匹配 `ls`；但仅当尾部 `*` 是唯一 wildcard 时成立，所以 `Bash(* --help *)` 不匹配 `npm --help`。
- 尾部 `*` 前的空格是规则的一部分：`Bash(ls *)` 要求 `ls` 后有空格，不匹配 `lsof`；`Bash(ls*)` 无空格，匹配 `lsof`。

补充：

- `:*` 后缀等价于 trailing wildcard：`Bash(ls:*)` 与 `Bash(ls *)` 匹配相同命令。
- 权限对话框选择 `"Yes, and don't ask again"` 时写 space-separated form。
- `:*` 只在 pattern 末尾被识别；`Bash(git:* push)` 中冒号按字面量处理。

### 4.4 Tool name wildcards

deny 和 ask 规则接受 tool-name 位置的 glob pattern，且必须匹配完整工具名：

- `"*"`：每个工具；
- `"mcp__*"`：所有 server 的所有 MCP tool。

bare-name glob deny 与 bare tool name 一样会移除工具 context；`EndConversation` 例外同样适用。

allow rules 只接受位于字面量 `mcp__<server>__` 前缀之后的 tool-name globs，且 server segment 必须无 glob：

- `mcp__puppeteer__*` 匹配 `puppeteer` server 的所有工具；
- `mcp__github__get_*` 匹配其 `get_` 工具；
- `"*"`、`"B*"`、`"mcp__*"` 这类未锚定 allow glob 会被跳过，不自动批准任何东西。

deny 或 ask 规则工具名不匹配任何已知工具时会产生 startup warning；包含 `_` 或 `*` 的工具名、以及 Claude Code 已移除的工具名如 `TaskOutput` 豁免该检查。

### 4.5 Bash 专属规则细节

#### Compound commands

Claude Code 识别 shell operators：`&&`、`||`、`;`、`|`、`|&`、`&`、newlines。复合命令中每个 subcommand 都必须被 allow，或本身是 read-only command，整条命令才能免提示运行。

- `Bash(safe-cmd *)` 不会批准 `safe-cmd && other-cmd`。
- deny / ask 只要任一 subcommand 匹配就生效，包括 subshell、command substitution、`for` loop 等 control-flow body 内的命令。
- `Bash(git clean *)` ask 仍会提示 `cd /tmp && git clean -f` 或 `echo "$(git clean -f)"`，即使 auto mode。
- `npm test &&` 这类 `&&` / `||` 后无内容的命令被视为不可解析，不拆分为 subcommands 做 allow 匹配，所以 `Bash(npm *)` 不批准。
- 对复合命令选 `"Yes, and don't ask again"` 时，Claude Code 会为每个需要批准的子命令分别保存规则。例如批准 `git status && npm test` 会保存 `npm test` 规则。最多可为单个复合命令保存 5 条规则。`cd` 到 working directories 外会生成该路径自己的 Read rule。

#### Wrappers

匹配 Bash rules 前会剥离固定 wrappers：

- `timeout`
- `time`
- `nice`
- `nohup`
- `stdbuf`
- shell builtins `command`、`builtin`
- zsh `noglob`

因此 `Bash(npm test *)` 也匹配 `timeout 30 npm test`。

不剥离的相关形式：

- `command -v`：查询命令而非运行命令；
- zsh `nocorrect`。

还会剥离某些已知安全环境变量的 leading assignment，因此 `Bash(npm test *)` 匹配 `NODE_ENV=test npm test`。allow rule 不会跨过其他变量 assignment；deny / ask 会跨过任意 leading assignment，所以 `Bash(rm *)` deny 仍匹配 `FOO=bar rm -rf tmp/`。

bare `xargs` 也会被剥离，所以 `Bash(grep *)` 匹配 `xargs grep pattern`；但 `xargs -n1 grep pattern` 按 `xargs` 命令匹配，内层命令规则不覆盖。

wrapper list 是内置且不可配置。以下 development environment runners 不在列表：

- `direnv exec`
- `devbox run`
- `mise exec`
- `npx`
- `docker exec`

因为它们会把参数当命令执行，`Bash(devbox run *)` 会匹配 `run` 后的任何内容，包括 `devbox run rm -rf .`。要批准环境内工作，应写包含 runner 与 inner command 的具体规则，如 `Bash(devbox run npm test)`，并为每个 inner command 添加一条规则。

#### Exec wrappers and `find` actions

prefix rule 如 `Bash(watch *)` 或 `Bash(find *)` 不能自动批准：

- Exec wrappers：`watch`、`setsid`、`ionice`、`flock`；
- `find` 带会运行命令、删除或写文件的 action：`-exec`、`-delete`、`-rm`、`-fprint`，或带 `-files0-from`。

要批准无 `*` 的具体调用，写完整字符串 exact-match rule：

`Bash(find build -type f -delete)`

若命令本身含 `*`，如 `find . -name '*.tmp' -delete`，Claude Code 会把规则按 wildcard pattern 而非 exact match 解读，仍会提示；可每次批准，或用返回 `"allow"` 的 `PreToolUse` hook。

#### What a Bash rule doesn't match

Bash rule 匹配 Claude 写出的 command text，且发生在拆分 compound commands、剥离 wrappers 之后。它不是围绕程序的安全边界，也不匹配同程序的其他调用形式。

| Rule | Stops | Doesn't stop |
| :- | :- | :- |
| `Bash(curl *)` | `curl https://example.com` | `/usr/bin/curl https://example.com`, `sh -c 'curl https://example.com'` |
| `Bash(rm *)` | `rm -rf build/` | `/bin/rm -rf build/`, `bash -c 'rm -rf build/'` |
| `Bash(git push *)` | `git push origin main` | `git -C . push origin main`, `git -c push.default=current push origin main` |

文档明确建议：对不依赖 command text 的 filesystem / network enforcement 使用 sandboxing；要在运行前用自定义逻辑检查完整 command text，使用 `PreToolUse` hook。

#### Read-only commands

内置只读 Bash 命令集合在所有 mode 下无需权限提示运行，除非 `permissions.blockReadsOutsideWorkingDirectories` 对 working directories 外路径改变行为。集合包括：

`ls`、`cat`、`echo`、`pwd`、`head`、`tail`、`grep`、`find`、`wc`、`which`、`diff`、`stat`、`du`、`cd`、read-only forms of `git`。

要点：

- 集合不可配置；若想让其中某个命令提示，添加 `ask` 或 `deny` rule。
- auto mode 中这些命令也可能等待 classifier review。
- `ls > out.txt` 这类 redirect 会额外检查 target。
- 对 every flag is read-only 的命令，未加引号的 glob 可免提示，如 `ls *.ts`、`wc -l src/*.py`。

Manual mode 中仍会提示的情况：

- 带 write-capable 或 exec-capable flags 的命令，如 `find`、`sort`、`sed`、`git`，遇到未加引号的 glob；
- `docker` 用 `-H`、`--context`、Podman 的 `--url`、`--connection` 指向其他 daemon；
- `file` 带 `-m` / `--magic-file` 或 `-f` / `--files-from`；
- `ps` 可能打印环境变量，如 `ps auxe`、`ps aux -e`；`ps aux`、`ps -ef` 免提示。dashed forms 检查需 v2.1.290+；
- `which` 带 `-i` / `--read-alias`、`--read-functions` 等；`which node`、`which -a node` 免提示；
- Windows network / UNC path，如 `\\server\share\file`；
- 设置、取消或循环特殊 shell variables，如 `PATH`、`IFS`；
- Claude Code 无法完整解析的命令；超过 10,000 字符的命令总是提示。

`cd` 到 working directory 或 additional directory 内也是 read-only，`cd packages/api && ls` 每个部分合格即可免提示。但以下组合仍提示：

- `cd` 与 `git`：当 `cd` 切换到不同目录，因为在新目录运行 `git` 可执行该目录 hooks；
- `cd` 与 redirect：Claude Code 无法确定 redirect target 在 `cd` 后相对哪个目录时提示；只重定向到 `/dev/null` 不提示。

URL 过滤警告：类似 `Bash(curl http://github.com/ *)` 的参数约束很脆弱，不匹配 options before URL、不同 protocol、redirects、variables 等变体。更可靠方式：

- 用 deny rules 停止 `curl`、`wget` 等 Bash network tools，再用 `WebFetch(domain:github.com)` 允许域名；若限制必须成立，还要配合 sandbox network allowlist，因为 deny 不匹配程序路径或 `sh -c` 内部形式；
- 用 `PreToolUse` hooks 验证 URLs 并阻断不允许域名；
- 在 `CLAUDE.md` 描述允许的 curl patterns，但这只塑造 Claude 尝试行为，不形成边界；
- 单靠 WebFetch 不阻止网络访问：若 Bash 可用，Claude 仍可用 `curl`、`wget` 等访问任意 URL。

#### Redirections

当命令重定向输出或输入时，Claude Code 会把 redirect target 当成 Claude 直接写/读该文件来检查：

- Output redirects：`> file`、`>> file`、`2> file`，检查 `Edit` allow/deny、protected paths、working directories。`Bash(git commit *)` 允许命令，但不覆盖 target。以 `~` 开头或包含 glob character 的 target 需要批准。
- Input redirects：`< file`，检查 `Read` allow/deny 和 working directories。working directories 外 target 需批准，除非 allow rule 覆盖；包含 glob pattern 或同一命令中跟在 `cd` 后的相对路径，即使 allow rule 覆盖也需批准。v2.1.257+ 检查 input targets。
- 不检查无文件实体的 targets：`/dev/null`、`2>&1`、`<&3`、here-docs、here-strings。
- 还检查 `tee` 写入文件，包括 `make | tee build.log`；检查 `Edit` allow/deny、protected paths、working directories。`Bash(tee *)` 不覆盖 working directories 外 destination。v2.1.269+ 检查 `tee` targets。

### 4.6 PowerShell

PowerShell permission rules 与 Bash rules 形状相同；bare `PowerShell` 或 `PowerShell(*)` 匹配每条命令。示例原文见附录。

要点：

- Common aliases 会在匹配前 canonicalized；`PowerShell(Get-ChildItem *)` 也匹配 `gci`、`ls`、`dir`。
- 匹配大小写不敏感。
- Claude Code 解析 PowerShell AST，并独立检查 compound command 中每条命令。
- `|`、`;`，以及 PowerShell 7+ 的 `&&`、`||` 会拆分 compound command；每个 subcommand 都必须被 allow，整条命令才免提示。

### 4.7 Read / Edit

#### 规则覆盖范围

- block file tools 读取文件或目录：`Read(./.env)`、`Read(./secrets/**)`。
- `.claudeignore` 无效；应把条目移入 `Read` deny rules。
- `Edit` rules 适用于所有编辑文件的 built-in tools。
- `Read(path)` deny rules 会 best-effort 应用于所有读取文件的 built-in tools，如 Grep、Glob，也应用于 `@file` mentions、连接的 IDE 共享的 selection / open-file context。
- `Read` deny 还适用于：
  - 粘贴到 prompt 的 image path；匹配时 Claude Code 不附加图片；若 paste 中没有其他图片，路径作为文本留在 prompt；
  - @-mention 的目录 listing 中被规则匹配的文件和目录名。
- 检查 pasted image paths 和 directory listings 需 v2.1.290+。
- `Read` deny 也阻断同路径的 Edit / Write，包括创建新文件；NotebookEdit 不被覆盖，因此需另加 `Edit` deny。Write tool 检查需 v2.1.228+。

原文警告要点：

> Read and Edit deny rules 应用于 Claude 的 built-in file tools、Claude Code 在 Bash 中识别的文件命令如 `cat`、`head`、`tail`、`sed`、`tee`，以及 Bash redirections 的 targets；不应用于不命名文件就读取文件的命令，如从含该文件的目录运行 `grep -r pattern .`，也不应用于 Python / Node script 等间接读写文件的任意 subprocesses。OS 级阻止所有进程访问路径应启用 sandbox。

#### `Write(path)`、`Glob(path)`、`Grep(path)` 不匹配

Claude Code 检查文件权限时依据 `Edit(path)` 和 `Read(path)` rules。以下工具可以写带路径规则但不会据此匹配：

- `Write`、`NotebookEdit`、legacy `MultiEdit`：改用 `Edit(docs/**)`；
- `Glob`、`Grep`：改用 `Read(docs/**)`。作为 ask rule，`Read(docs/**)` 会在 Claude 对匹配路径调用 Grep 或 Glob 时提示，但不会在其上层 working directory 的搜索返回匹配文件时提示。

要匹配某个工具的所有使用而不考虑路径，只写工具名。

#### Path pattern 类型

Read 和 Edit rules 使用 gitignore pattern syntax，四种类型：

| Pattern | Meaning | Example | Matches |
| - | - | - | - |
| `//path` | Absolute path from filesystem root | `Read(//Users/alice/secrets/**)` | `/Users/alice/secrets/**` |
| `~/path` | Path from home directory | `Read(~/Documents/*.pdf)` | `/Users/alice/Documents/*.pdf` |
| `/path` | Path relative to the settings source | `Edit(/src/**/*.ts)` | `<primary working directory>/src/**/*.ts` in project settings |
| `path` or `./path` | Path relative to current directory | `Read(*.env)` | `<cwd>/*.env` |

警告：`/Users/alice/file` 不是绝对路径；单个前导 `/` 锚定 settings source，不是 filesystem root。绝对路径应写 `//Users/alice/file`。

匹配深度：

- 规则只匹配其 anchor 下的文件。
- bare filenames 遵循 gitignore 语义，任意深度匹配；`Read(.env)` 与 `Read(**/.env)` 等价。
- `Read(//**/.env)` 匹配 filesystem 上任何 `.env`。
- 单目录段相对 pattern 的深度取决于规则类型：
  - allow：`Edit(src/**)` 只匹配 `<cwd>/src` 及其下文件；任意深度目录名需 `Edit(**/src/**)`。
  - deny / ask：`Read(secrets/**)` 匹配当前目录下任意深度名为 `secrets` 的目录。
- 其他 pattern shape 在所有规则类型中深度一致：`Edit(/src/**)`、`Edit(src/components/**)` 只在锚定位置匹配；`Edit(**/src/**)` 任意深度匹配。
- gitignore 中 `*` 匹配单个 path segment 内文本，`**` 跨目录匹配。

Special characters and `!` negation：

- 通过 `"Yes, and don't ask again"` 批准文件路径时，Claude Code 会转义路径中的 gitignore pattern 字符，如 `[`、`]`、`*`，让生成规则只匹配字面路径；手写规则不会被转义。
- 路径中的括号不需转义，`Edit(./Finance (2024)/**)` 匹配同名文件夹。
- deny / ask 中不可用作 gitignore pattern 的路径仍会保护该 exact path；allow 中不可用 pattern 不批准任何东西。
- 以 `!` 开头的 deny / ask pattern 是 gitignore negation，会从同一 settings file 中列在它之前的 `path` 或 `./path` rules 里挖出匹配路径。例如 `Read(*.env)` 后跟 `Read(!sample.env)`，阻断任意深度所有 `.env` 结尾文件，但 `sample.env` 除外。
- `!` 放在第一条不挖出任何内容。
- carve-out 只作用于同一 source，不能取消 managed settings 或其他 settings file 的 deny。
- `!` pattern 始终按 current directory 相对读取，即使 `!` 后是 `/`、`~/`、`//`；`Read(!~/notes/public/**)` 不能从 `Read(~/notes/**)` 中挖出路径。
- 不能重新打开被整目录规则阻断的目录内文件；`Read(secrets/**)` 加 `Read(!secrets/public/**)` 仍阻断 `secrets/public`。

#### Symlinks

当 Claude 请求的 file path 经过 symlink，权限检查覆盖两个路径：请求路径和解析后的文件。适用于 macOS、Linux、Windows symbolic links，以及 Windows directory junctions。

- Allow rules：只有请求路径和解析目标都匹配时才适用；允许目录内 symlink 指向外部时不匹配。
- Deny rules：请求路径或解析目标任一匹配即适用；指向被 deny 文件的 symlink 本身被 deny。
- macOS / Linux 上，通过 symlinked directory 写的、带 `//`、`~/` 或 `/` 的 deny / ask rule 也适用于目录 real location。例如 macOS `/etc` 解析到 `/private/etc`，`Read(//etc/**)` 也阻断 `/private/etc/hosts`。v2.1.268 之前不适用。
- Grep / Glob 搜索 `path` argument 解析后的目录，Claude Code 对该目录应用 `Read` deny rules。
- attachments 通过 symlink 时，`Read` deny 会检查 named path 或 resolved target，匹配则从 conversation 中移除：`@`-mentions、pasted images、changed files、IDE context。
- 若无法解析路径，例如 symlink loop，`@`-mention 会显示：

```text theme={null}
Referenced <path> (not read: could not be examined)
```

- 若 path symlinks 不 resolve，随后用 file tools 读取也会被 refused；需修复 link 或用能解析的路径 `@`-mention。
- 写入路径本身是 symlink 时，Edit / Write tools 拒绝写入并引导 Claude 使用 link target。目录路径中含 symlink，或 Bash / PowerShell command 执行写入时，仍可能穿过 symlink；结果取决于 resolved target 相对 working directories / protected paths 的位置。
- 工具打开已批准文件时会再次确认路径仍解析到权限检查批准的位置。

#### Network paths

network path 指可访问另一台计算机的路径：Windows UNC 如 `\\server\share\file`，macOS / Linux `/net` automount 如 `/net/fileserver/notes.txt`。读取会单独权限检查，因为查找路径可能联系 host，Windows 还可能发送 credentials。

v2.1.292+ 中，以下都不会移除该提示：

- Allow rules，包括整个工具规则如 `Read`；
- 返回 `"allow"` 的 `PreToolUse` hook；
- auto mode 不由 classifier 决定，而把提示交给用户。

`dontAsk` mode 会拒绝读取；`bypassPermissions` mode，以及 interactive terminal plan mode 中可用 bypass permissions 时，读取无此提示。

要免提示读取 network share，应先给 share 一个本地路径：

- Windows：映射为 drive letter，启动时用 `--add-dir` 传入，如 `claude --add-dir Z:\`；
- macOS / Linux：挂载到 `/mnt` 或 `/Volumes` 下本地路径再读取。

### 4.8 WebFetch

WebFetch rules 使用 `domain:` prefix，匹配 URL hostname；大小写不敏感，支持 `*`，并会去掉 rule 与 hostname 的 trailing `.`，所以 `example.com.` 与 `example.com` 等同。

- `WebFetch(domain:example.com)` 只匹配 `example.com`；要包含 `api.example.com`，另加 `WebFetch(domain:*.example.com)`。
- `WebFetch(domain:*.example.com)` 匹配任意深度子域，如 `api.example.com`、`a.b.example.com`，但不匹配 `example.com` 本身。
- `WebFetch(domain:*)` 匹配每个 domain；与 bare `WebFetch` 不同。
- 除 leading `*.` 或 bare `*` 外，wildcard 只匹配两个点之间的文本。`WebFetch(domain:example.*)` 匹配 `example.org`，不匹配 `example.evil.com`。
- WebFetch wildcards 需 v2.1.172+ 才匹配 fetches。

Allow / deny every fetch：

| Rule | In `allow` | In `deny` |
| :- | :- | :- |
| `WebFetch` | Claude fetch 时不提示；不改变 sandboxed commands 可访问的 hosts。 | Claude Code 移除 `WebFetch` tool，Claude 完全不能 fetch；不改变 sandboxed commands 可访问的 hosts。 |
| `WebFetch(domain:*)` | Claude fetch 时不提示；sandboxed commands 可访问任意 host。 | 保留 tool 但拒绝每次 fetch；sandboxed commands 不能访问任何 host。 |

要点：

- 只有 `domain:` 形式还会把 domain 加入 sandbox 的 allowed / denied domain list。
- bare `WebFetch` deny / ask 不适用于 artifacts reads；覆盖 `claude.ai` 或 `*.claudeusercontent.com` 的 `domain:` rule 会拒绝或提示每次 read。`Artifact` rule 同样如此。
- 规则阻断 read 时，denial 会命名该 rule。v2.1.268 之前，bare `WebFetch` deny 会阻断每个 artifact read，bare ask 会每次提示。
- 要让 Claude 自由 fetch 但保持 sandbox allowlist 不变，用 bare form，示例见附录。
- auto mode 中，Claude 会把 host 写入 command 的 per-command allowed domains，供 classifier review。

### 4.9 MCP

匹配 MCP server 的所有工具：

- `mcp__<server>__*`
- bare `mcp__<server>`

匹配单个工具：

- `mcp__<server>__<tool>`

示例：

- `mcp__puppeteer` 匹配 `puppeteer` server 的任意工具；
- `mcp__puppeteer__*` 用 wildcard syntax，也匹配所有工具；
- `mcp__puppeteer__puppeteer_navigate` 匹配具体工具。

补充：

- MCP allow rules 不要带 specifier / `ruleContent`；若为了只允许某工具的部分调用而加 specifier，规则不会匹配任何调用。要阻止部分调用，用 Match by input parameter。
- `<server>` 按 server tool names 中出现的形式写：
  - `.` 或 spaces 变 `_`；`my.server` 写 `mcp__my_server__*`；
  - plugin 提供的 server 用 plugin-scoped form，如 `mcp__plugin_my-plugin_database-tools__*`；
  - server 名含 `__` 或以 `_` 结尾时，用完整 wildcard form；`reports__v2` 写 `mcp__reports__v2__*`。bare `mcp__reports__v2` 和短形式 `mcp__reports` 作为 allow 不匹配；但作为 deny / ask 会覆盖 `reports__v2` 的所有工具。
- 若组织把 claude.ai connector tool 设为 `ask`，且该设置到达会话，allow rules 对该 tool 不生效；每次调用都提示，即使 `auto`、`bypassPermissions`。`dontAsk` 中改为拒绝。Claude Code 自己获取的 connectors tools 形如 `mcp__claude_ai_<server>__<tool>`。
- Cowork session 中，shell commands 通过 `mcp__workspace__bash`，web fetches 通过 `mcp__workspace__web_fetch`。deny rules 中命名整个 `Bash` 或 `WebFetch` tool 也会应用到这些 Cowork tools；managed `Bash` deny 会阻止 Cowork shell commands。allow rules 不会沿用，Claude Code 从不把 `Bash` allow rule 应用到 `mcp__workspace__bash`。

### 4.10 Agent、Cd

Agent rules：

- `Agent(Explore)` 匹配 Explore subagent；
- `Agent(Plan)` 匹配 Plan subagent；
- `Agent(my-custom-agent)` 匹配自定义 subagent。

可加入 `deny` array 或用 `--disallowedTools` 禁用指定 agents。配置示例原文见附录。

Cd rules：

- `Cd` rules 控制 `/cd` command 能把 session 移到哪些目录。
- `Cd` 不是 model-invocable tool：Claude 不能调用它，规则只在用户自己运行 `/cd` 时应用。
- bare `Cd` deny 完全禁用 `/cd`。
- `Cd(<path-pattern>)` deny 阻断匹配 targets；deny 检查 target 的每种拼写，包括 symlink hop 解析到的路径。
- 添加任意 `Cd` allow rule 会切换到 allowlist mode：resolved target directory 必须匹配 allow rules，否则 `/cd` 拒绝。
- 没有 `Cd` rules 时，`/cd` 保持默认行为，提示用户信任不熟悉目录。
- path patterns 共享 `//`、`~/`、`/` anchors，但匹配锚定整个目录路径，不是 gitignore-style；`*` 正好匹配一个 path segment，`**` 跨 segments；trailing `/**` 也匹配其 named root。

| Rule | Matches | Does not match |
| - | - | - |
| `Cd(~/code/*)` | `~/code/app` | `~/code/app/src`, `~/code` |
| `Cd(~/code/**)` | `~/code` and any directory under it | directories outside `~/code` |
| `Cd(**/node_modules)` | any `node_modules` directory at any depth under the current directory | `node_modules/pkg` |

---
`````
