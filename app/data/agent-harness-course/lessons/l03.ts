import { L, withKind } from '../../course-builders.ts'

export const L03 = withKind(
  L(
    'L03',
    1,
    'Claude Code（上）：权限运行时——行业原型的完整拆解',
    2,
    [],
    ['h-cc-permission-runtime'],
    [
      '画出 Claude Code 权限判定的完整链路：permission modes → allow/ask/deny 规则 → 沙箱 → hooks',
      '解释 deny > ask > allow 固定求值顺序与 workspace trust 的安全含义',
      '把 managed settings、bypassPermissions 禁用等企业机制映射到自己团队的管控需求',
    ],
    `### 为什么先拆它：权限运行时的「原型定义者」

Claude Code 是 Anthropic 官方的终端 coding agent，也是本课程横向对比里**生态位最特殊**的选手：专有软件（其仓库 license 标注 \`© Anthropic PBC. All rights reserved.\`），绑定自家模型与订阅体系。但它在「权限控制面」上给出的答案，成了后来者反复引用的原型——因此把它放在 15 个系统的第一个。本课事实全部来自官方权限文档（[Permissions](https://code.claude.com/docs/en/permissions)，全文已存档核实，快照 2026-11-15）。

### 权限链路的四层结构

Claude Code 的权限判定不是一个开关，而是四层叠加的漏斗：

| 层 | 机制 | 关键事实 |
|---|---|---|
| ① 整体档位 | permission modes | \`default\`（逐次询问）、\`acceptEdits\`（自动接受文件编辑与工作目录内常见文件系统命令）、\`dontAsk\`（自动拒绝本会提示的调用，但预批准工具仍可运行）、\`bypassPermissions\`（跳过提示，官方警告只用于容器/VM） |
| ② 规则层 | allow / ask / deny | 固定求值顺序 **deny → ask → allow**，第一条匹配决定结果，规则具体程度不改变顺序；\`Bash(aws *)\` 的宽泛 deny 会压过 \`Bash(aws s3 ls)\` 的窄 allow |
| ③ 系统层 | sandboxing | OS 级限制，与权限规则**合并**成最终沙箱配置；\`sandbox.autoAllowBashIfSandboxed\` 可让已沙箱化的 Bash 免提示 |
| ④ 自动化层 | hooks | \`PreToolUse\` 在权限提示**之前**运行，但不能绕过 deny/ask；阻断性 hook 以 exit code 2 拦截命令 |

这四层的顺序解释了很多「为什么我配了 allow 还是要问」的疑惑：档位决定要不要走规则层，规则层决定要不要走到沙箱，hook 从头到尾只有加约束的权力。官方文档还特别强调一条边界：**prompt 或 CLAUDE.md 只能影响模型尝试做什么，不能改变 Claude Code 允许什么**——想改授权，只能用 \`/permissions\`、规则、permission mode 或 PreToolUse hook。

### 配置形状与作用域优先级

权限规则分布在多个 settings 文件里，作用域从个人到企业逐层覆盖：

\`\`\`jsonc
// .claude/settings.json（项目级，需 workspace trust 后 allow 才生效）
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": ["Bash(npm run test)", "WebFetch(domain:docs.example.com)"],
    "deny": ["Bash(aws *)", "Read(.env*)"],
    "disableBypassPermissionsMode": "disable"
  },
  "sandbox": { "autoAllowBashIfSandboxed": true }
}
\`\`\`

优先级要点：**任何层级的 deny 都先于 allow 求值**——user 层 deny + project 层 allow，仍被阻断；managed settings 的 deny 不能被 \`--allowedTools\` 覆盖。永久性「Yes, and don't ask again」规则写入仓库根的 \`.claude/settings.local.json\`（经 worktrees 解析到主 checkout），对仓库未来所有会话生效。企业侧有两个专门开关：\`permissions.disableBypassPermissionsMode\` / \`disableAutoMode\`（文档建议放 managed settings 因为那里不可覆盖）、\`permissions.denyInsteadOfPrompting\`（无人值守会话不等待提示，直接拒绝）。

### 两个容易踩的安全设计

**workspace trust 门控**：项目 \`.claude/settings.json\` 里的 \`permissions.allow\` 与 \`additionalDirectories\` 是「授予能力」的规则，必须等用户接受 trust 对话框后才生效；\`deny\` 和 \`ask\` 只「限制能力」，不受影响。这个不对称性防的是真实攻击：克隆一个陌生仓库，它自带的 allow 规则不该在用户知情前生效。

**\`"Yes, and don't ask again"\` 的保存条件**：只有当提示能**完整展示规则将允许什么**时，Claude Code 才提供永久记住的选项。这就是为什么有些提示只有一次性批准——模型这次调用的参数如果不足以推出一条完整规则，就不该让它变成永久授权。

### 横向定位：对照系即将建立

把 Claude Code 的答案压缩成一句话：**「权限是产品的一部分」**——四层漏斗、固定求值顺序、trust 门控、managed settings，全部内建，代价是封闭与绑定。下一课我们看它的另一个控制面：七种指令载体（CLAUDE.md/rules/skills/hooks/subagents/output styles/append-system-prompt）与上下文压缩规则，那是「上下文控制面」的代表作。之后每当别的系统在权限上「只给一个 sandbox 开关」（Pi）、或「沙箱优先」（Codex），你都可以回这张四层表对照。

### 本课的可复核数据

基准快照（详见 L02 的四问框架）：Harness Leaderboard 三模型均分 Claude Code **49.2**，落在与 mini-swe-agent（51.4）、Kimi Code（50.5）、Hermes（50.3）、Pi（49.4）互不显著的头部并列组（官方公告口径，快照 2026-11-15）；Composio 26 任务对比中它完成 **19/26**、每任务成本 **$1.47**（6 个 harness 中最贵）、中位耗时 347.6s（[第三方转述，C 级待原文](https://code404zero.com/?p=502)）。注意两点：一是 Claude Code + Sonnet 5.5 在同板拿下 51.3 分但 **$154.03/run**，与 harness 分离的商业绑定会改变成本量级；二是独立复测中 DSH 对它的 3.6 分差距 p=0.14，**不构成「更强」的证据**。这些数字怎么读，L02 的四个追问都还适用。

### 追问与辨析：权限链路的两个实战推论

**推论一：规则是代码，要进 code review。** 「Yes, and don't ask again」规则写入仓库根的 \`.claude/settings.local.json\` 后对全仓库会话生效——这意味着一条被匆忙批准的宽规则（比如为了赶工放开的 \`Bash(curl *)\`）会变成仓库的常驻攻击面。官方文档把它比作值得 review 的资产：规则变更应该和代码变更走同样的评审流程，\`/permissions\` 对话框则负责在会话中随时查看每条规则来自哪个文件。

**推论二：ask 规则不是「温和版 deny」。** 官方明确：只要存在匹配的 ask 规则，即使更具体的 allow 也匹配，仍然提示——ask 与 allow 之间没有具体度豁免。安全含义是：你无法用一条精确 allow「穿透」一条粗 ask；想让某个例外静默通过，唯一办法是保证没有任何 ask 规则覆盖它。设计规则集时要按「deny 全集 → ask 子集 → 其余 allow」的包含关系来规划，而不是想到一条加一条。

**推论三：managed settings 的位置决定它的效力。** \`disableBypassPermissionsMode\` 这类开关文档建议放 managed settings，因为那里不可被覆盖；同样的键写在项目 settings.json 里就形同虚设（本地可改）。企业部署的检查清单因此多一项：**验证强制项实际生效的层级**，而不是只验证「配置文件里写了」——层级写错的管理配置等于没有配置。

补一个可直接抄的规则集模板（形状对照官方文档附录示例，按「deny 全集 → ask 子集 → 其余 allow」规划）：

\`\`\`jsonc
// .claude/settings.json —— 分层规则集模板（对照 L03 各机制）
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "deny": [
      "Read(.env*)",
      "Read(**/secrets/**)",
      "Bash(aws *)",                          // 宽 deny：云凭据面整体封死
      "Bash(git push --force*)"               // 破坏性 git 操作
    ],
    "ask": [
      "Bash(npm publish*)",                   // ask 子集：发布类动作必须人批
      "WebFetch(domain:internal.example.com)"
    ],
    "allow": [
      "Bash(npm run test*)",
      "Bash(npm run lint)",
      "Edit(src/**)",                          // 只放行业务目录
      "WebFetch(domain:docs.example.com)"
    ],
    "additionalDirectories": ["../shared-libs"]
  },
  "sandbox": { "autoAllowBashIfSandboxed": true }
}
\`\`\`

模板里每一条都能对应到本课的机制：宽 deny 压过一切 allow（固定求值顺序）、ask 无法被更具体的 allow 穿透（推论二）、allow 只行业务目录（trust 门控 + 最小授权）、沙箱内 Bash 免提示（减少 approval fatigue）。抄走之前记得：企业强制项要挪进 managed settings，别留在项目文件里（推论三）。
`,
    null,
    [
      {
        text: '项目里同时存在 allow 规则 Bash(aws s3 ls) 与更宽的 deny 规则 Bash(aws *)。实际会发生什么？',
        options: [
          's3 ls 被允许，因为 allow 规则更具体',
          '所有 aws 命令被阻断——规则按 deny → ask → allow 固定顺序求值，allow 无法从 deny 里挖例外',
          '每次提示用户选择',
          '取决于规则在 settings.json 里出现的先后',
        ],
        answer: 1,
        explain:
          '官方文档明确：规则按 deny、ask、allow 的固定顺序求值，第一条匹配决定结果，规则具体程度不改变顺序。宽泛 deny 会阻断所有匹配调用，即使存在更窄的 allow。',
        concept: 'h-cc-permission-runtime',
      },
      {
        text: 'PreToolUse hook 在权限链路中的位置是？',
        options: [
          '在权限提示之前运行，可以替代 allow/ask/deny 规则',
          '在权限提示之前运行，但不能绕过 deny/ask 规则',
          '在工具执行之后运行',
          '与权限系统无关',
        ],
        answer: 1,
        explain:
          '官方权限文档明确 PreToolUse hooks 在权限提示前运行，但「不能绕过 deny/ask」——hooks 是确定性自动化层，不是权限豁免通道。要改授权应该用 /permissions、规则、permission mode 或 PreToolUse 阻断（exit 2）。',
        concept: 'h-cc-permission-runtime',
      },
      {
        text: '为什么项目的 permissions.allow 规则必须先过 workspace trust 才生效？',
        options: [
          '为了性能',
          '因为 allow 规则授予能力——克隆来的陌生仓库可能自带「放开一切」的 allow 规则，trust 对话框让用户先看到并确认会授予什么；deny/ask 只限制能力所以不受影响',
          '因为 allow 规则有语法错误',
          '为了让规则写入 settings.local.json',
        ],
        answer: 1,
        explain:
          '文档区分了「授予能力」与「限制能力」：allow 授予能力需要 trust；deny/ask 只限制，不受 trust 门控。这是「配置即攻击面」的典型防御设计。',
        concept: 'h-cc-permission-runtime',
      },
      {
        text: '关于 bypassPermissions 模式，下列说法正确的是？',
        options: [
          '它是日常开发的推荐默认值',
          '它会跳过权限提示（包括对受保护路径的写入），官方明确只应在容器/VM 等隔离环境使用，且可用 managed settings 的 disableBypassPermissionsMode 禁用',
          '它等价于 dontAsk 模式',
          '它只跳过文件编辑的提示',
        ],
        answer: 1,
        explain:
          'bypassPermissions 跳过权限提示（含 .git/.claude 等受保护路径写入），官方警告只应在隔离环境使用。企业可用 permissions.disableBypassPermissionsMode="disable"（最适合放 managed settings，不可被覆盖）禁掉它。',
        concept: 'h-cc-permission-runtime',
      },
    ],
    [
      [
        'permission mode',
        '整体审批姿态的档位：default / acceptEdits / dontAsk / bypassPermissions（另有 plan 等模式），用 settings 的 defaultMode 设新会话默认值',
      ],
      ['deny > ask > allow', '权限规则的固定求值顺序，第一条匹配生效，与规则具体程度无关'],
      ['workspace trust', '项目的 allow 规则与额外目录必须经 trust 对话框确认后才生效的安全门'],
      ['managed settings', '企业托管配置层，其 deny 不可被命令行参数或其他层级覆盖'],
    ],
    [
      '以为「更具体的 allow 规则」能突破宽泛 deny——求值顺序是固定的，具体程度不参与排序',
      '在 PreToolUse hook 里做「放行」逻辑——它只能加约束（exit 2 阻断）或提前提示，不能豁免 deny/ask',
      '把组织级强制策略写进项目 settings.json——它会被本地文件覆盖，强制项必须放 managed settings',
    ],
  ),
  'theory',
)
