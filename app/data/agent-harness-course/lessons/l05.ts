import { L, withKind } from '../../course-builders.ts'

export const L05 = withKind(
  L(
    'L05',
    2,
    'Codex CLI（上）：沙箱优先——三档模式与平台原生强制',
    2,
    [],
    ['h-codex-sandbox'],
    [
      '配置 sandbox_mode × approval_policy 的组合，并说出每组组合的适用场景',
      '解释沙箱的平台原生实现差异（Seatbelt / bubblewrap / Windows sandbox）与网络默认受限的含义',
      '说出 config.toml 的层级结构（用户级 / 项目级 / profile）与项目级不可覆盖键清单的作用',
    ],
    `### 与 Claude Code 相反的答案：先给笼子，再谈信任

Claude Code 的权限哲学是「逐次提示 + 规则漏斗」（L03）；Codex CLI 把顺序反过来——**大多数动作先放进操作系统强制的沙箱里自动执行，只有越界才需要人批**。官方文档给了一句精确的概括：*sandbox defines technical boundaries. The approval policy decides when the agent must stop and ask before crossing them.*（沙箱定义技术边界，审批策略决定何时必须停下越过边界。）本课事实全部来自官方文档 [Sandboxing](https://learn.chatgpt.com/docs/sandboxing.md) 与 [Config reference](https://learn.chatgpt.com/docs/config-file/config-reference.md)（原 developers.openai.com/codex 已重定向，全文已存档核实，快照 2026-11-15）。

### 三档沙箱 × 审批策略：一张决策表

| sandbox_mode | 能做什么 | 不能做什么 | 典型组合 |
|---|---|---|---|
| \`read-only\` | 查看文件 | 未经审批不能编辑文件或运行命令 | 代码审查、只读调研 |
| \`workspace-write\` | 读任意文件、workspace 内编辑、边界内跑常规命令 | 边界外写入与出站网络（默认受限） | **官方推荐默认**：+ \`on-request\` |
| \`danger-full-access\` | 无沙箱限制 | 无 | + \`never\` = Full access，仅限全权委托场景 |

审批侧现行取值是 \`on-request\`（默认在沙箱内，越界才问）、\`never\`（不会因审批停下）与新的 \`granular\` 对象（可按 sandbox_approval / rules / mcp_elicitations / request_permissions / skill_approval 细分开关）；\`approvals_reviewer\` 还能取 \`auto_review\`，把符合条件的审批提示交给 reviewer agent 处理。沙箱内的动作不需要任何审批——这正是「减少 approval fatigue」的机制：信任的不是 agent 的意图，而是**被强制执行的边界**（官方原话：*You aren't just trusting the agent's intentions; you are trusting that the agent is operating inside enforced limits.*）。

### 平台原生强制：一个 harness，三套笼子

\`\`\`toml
# ~/.codex/config.toml（官方 config-reference 与 sandboxing 页要点汇总）
model = "gpt-5.1-codex"
approval_policy = "on-request"          # 现行：on-request | never | { granular = {...} }
sandbox_mode = "workspace-write"        # read-only | workspace-write | danger-full-access

[sandbox_workspace_write]
writable_roots = ["~/side-project"]     # 跨目录写入用这个，别整体解除沙箱
network_access = false                  # workspace-write 内默认禁出站网络

[windows]
sandbox = "mxc"                         # mxc | elevated | unelevated
\`\`\`

沙箱是**平台原生强制**，不是模拟：macOS 用内置 **Seatbelt**（开箱即用）；Linux/WSL2 依赖 **bubblewrap**（\`bwrap\`，Ubuntu 24.04 需手动加载 AppArmor profile，缺失 user namespace 时启动告警）；Windows 原生 sandbox（\`windows.sandbox = mxc | elevated | unelevated\`）。这意味着沙箱强度随操作系统变化——同一份 config.toml 在三台机器上的实际隔离等级并不相同，安全评审时必须逐平台核对。网络默认受限是另一条容易忽略的边界：出站访问要么走审批，要么显式开 \`network_access = true\`（或 ChatGPT Work 云端在设置里开 public internet access）。

### 配置层级与 AGENTS.md

Codex 的配置分三层：用户级 \`~/.codex/config.toml\`；项目级 \`.codex/config.toml\`（**仅信任的项目加载**）；Profile 文件 \`$CODEX_HOME/<name>.config.toml\`（\`--profile\` 选择）。项目级有一批**不可覆盖键**——\`model_provider\`、\`model_providers\`、\`notify\`、\`profile\`、\`otel\` 等在项目配置里直接被忽略，防止仓库自带配置劫持模型路由与遥测。AGENTS.md 作为项目指令载体有三个专属键：\`project_doc_max_bytes\`（读取上限）、\`project_doc_fallback_filenames\`（缺失时备选文件名）、\`project_root_markers\`（项目根判定）；另有 \`model_instructions_file\` 可整体替换内置指令。

上下文压缩有两档触发：\`model_auto_compact_token_limit\`（token 阈值，scope 可选 total / body_after_prefix）与 \`model_post_turn_compact_threshold_percent\`（回合末按上下文窗口百分比触发，0 为禁用），\`compact_prompt\` 可内联覆盖压缩提示词。

### 横向定位：与 L03 对照

| 维度 | Claude Code（L03） | Codex CLI |
|---|---|---|
| 默认姿态 | 逐次提示，规则漏斗过滤 | 沙箱内自动执行，越界才问 |
| 强制机制 | settings 规则 + hooks（提示层） | OS 原生沙箱（系统层） |
| 项目配置门控 | workspace trust 对 allow 生效 | 信任项目才加载 + 不可覆盖键清单 |
| 确定性拦截 | PreToolUse hook（exit 2） | rules（允许/提示/禁止 command prefixes） |

两条路线没有绝对优劣：需要细粒度「谁能用什么工具」的团队适合 Claude Code 的规则漏斗；需要「无人值守批量跑」的自动化场景适合 Codex 的沙箱默认执行。下一课我们看 Codex 的许可、生态接入与基准表现，并检查一个反直觉结论：**厂商自家 harness 未必是自家模型的最优搭档**。

### 追问与辨析：沙箱边界的三条细则

**细则一：read-only 不等于零风险。** read-only 档限制的是「写」与「执行」，但 agent 仍可读取工作区内的所有文件并把内容带进上下文——\`.env\`、密钥文件、客户数据都会进入模型请求。所以 read-only 适合的是「代码审查与调研」，不适合「处理敏感数据的只读任务」；后者要么收紧工作区路径，要么干脆不要让 agent 接触。

**细则二：writable_roots 是最小授权原则的落点。** 需要跨目录写入时的第一反应不该是 \`danger-full-access\`，而是 \`sandbox_workspace_write.writable_roots\` 追加具体路径——官方把这个键定位为「扩展可写位置而不必完全移除沙箱」。配套的还有 \`exclude_tmpdir_env_var\` / \`exclude_slash_tmp\` 两个细粒度开关。对比 Claude Code 的 \`additionalDirectories\`（同样经 trust 门控），两家对「多目录写入」都选择了白名单扩展而不是整体放权——这是跨厂商的共识设计。

**细则三：文档站迁移期的核实的义务。** 本课的参数名全部来自 learn.chatgpt.com 的现行文档（developers.openai.com/codex 已重定向），而 \`untrusted\`、\`on-failure\` 等旧参数在全网旧教程里仍然泛滥。 adopting Codex 的团队要给自己立一条规矩：**所有 config.toml 片段以现行 config-reference 为准，旧博客参数一律对照后再用**——这不是 OpenAI 特有的问题，而是快节奏 harness 生态的通病（对照：Pi 的 MCP 立场反转、OpenCode 的 2.0 断代）。

补一组完整的审查/自动化两套 preset，覆盖 L05 的三个典型场景：

\`\`\`toml
# ~/.codex/config.toml —— 两套 preset 的完整形状（对照官方 config-reference）

# 代码审查场景：只读 + 例外放行常用读类命令
[profiles.review]
approval_policy = "on-request"
sandbox_mode = "read-only"
model_reasoning_effort = "high"

# 无人值守批跑场景：workspace 沙箱 + 免提示，网络显式关闭
[profiles.batch]
approval_policy = "never"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
writable_roots = ["./out", "./tmp"]
network_access = false
exclude_slash_tmp = true
\`\`\`

用 \`codex --profile review\` / \`--profile batch\` 切换。这个例子的价值在于展示「档位 × 策略 × 目录白名单」的三层组合方式：审查场景宁可严（read-only），批跑场景把审批关掉但把网络也关掉（\`never\` + \`network_access=false\` 是比 \`danger-full-access\` 更负责任的「无人值守」姿势）。Profile 机制本身（\`$CODEX_HOME/<name>.config.toml\` + \`--profile\`）在 L05 正文已交代，这里补的是可直接落盘的形状。
`,
    null,
    [
      {
        text: 'Codex 官方推荐的「低摩擦本地自动化」组合是？',
        options: [
          'danger-full-access + never',
          'workspace-write + on-request（CLI 对应 --sandbox workspace-write --ask-for-approval on-request）',
          'read-only + never',
          'workspace-write + untrusted',
        ],
        answer: 1,
        explain:
          '官方 sandboxing 文档给出的低摩擦本地自动化预设就是 workspace-write 沙箱 + on-request 审批：agent 在 workspace 边界内自主工作，越界时询问。danger-full-access + never 是 Full access 组合，read-only 用于只读审查，untrusted 已不再支持。',
        concept: 'h-codex-sandbox',
      },
      {
        text: 'Codex 沙箱在 macOS 上用什么实现？Linux/WSL2 呢？',
        options: [
          '都是 Docker',
          'macOS 用系统内置 Seatbelt；Linux/WSL2 依赖 bubblewrap（bwrap），需要 user namespace 支持',
          '都是自研内核模块',
          'macOS 用 bubblewrap，Linux 用 Seatbelt',
        ],
        answer: 1,
        explain:
          '官方文档：Codex 使用平台原生强制——macOS Seatbelt 开箱即用；Linux/WSL2 用 PATH 上的第一个 bwrap（缺失时回退 bundled helper，需 unprivileged user namespace；Ubuntu 24.04 还要手动加载 AppArmor profile）。',
        concept: 'h-codex-sandbox',
      },
      {
        text: 'approval_policy 现行取值里，哪些已被弃用或移除？',
        options: [
          'on-request 与 never',
          'untrusted（已不再支持）与 on-failure（已弃用）；现行是 on-request / never / granular',
          'granular',
          '全部都还在',
        ],
        answer: 1,
        explain:
          '官方 config-reference 明确：untrusted 不再支持、on-failure 弃用（交互式用 on-request、非交互式用 never）；granular 是新的细粒度对象（sandbox_approval/rules/mcp_elicitations/request_permissions/skill_approval）。旧文章里的参数名要按这个口径校正。',
        concept: 'h-codex-sandbox',
      },
      {
        text: '项目级 .codex/config.toml 被加载的前提与限制是？',
        options: [
          '无条件加载且可覆盖一切',
          '仅在项目被信任时加载，且 model_provider / model_providers / notify / profile / otel 等键被忽略（不可覆盖）',
          '只允许放模型名',
          '只在 Windows 上生效',
        ],
        answer: 1,
        explain:
          'config-reference：项目级配置仅在 trust 时加载；openai_base_url、model_provider、model_providers、notify、profile、profiles、otel 等键在项目级被忽略。这与 Claude Code 的 workspace trust 门控（L03）思路一致。',
        concept: 'h-codex-sandbox',
      },
    ],
    [
      ['sandbox_mode', '沙箱档位：read-only / workspace-write / danger-full-access，写在 config.toml'],
      [
        'approval_policy',
        '越过沙箱边界的时机决策：on-request / never / granular；「沙箱定义技术边界，审批决定何时停下问人」',
      ],
      ['writable_roots', 'sandbox_workspace_write 下的额外可写根目录数组，跨多目录写入时不必整体解除沙箱'],
      ['Profile', '$CODEX_HOME/<name>.config.toml 的预置配置组，--profile 选择'],
    ],
    [
      '把旧文章的 approval_policy: untrusted / on-failure 抄进 config.toml——两者已分别移除/弃用，现行取值以官方 config-reference 为准',
      '以为 read-only 模式下 agent 完全无害——它仍可查看文件与网络状态，敏感信息可能经上下文外泄',
      '把 danger-full-access 当「性能更好」的选项——它移除的是 filesystem 与 network 边界，不是加速器',
    ],
  ),
  'theory',
)
