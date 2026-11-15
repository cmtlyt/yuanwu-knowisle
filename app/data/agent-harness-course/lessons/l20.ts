import { L, withKind } from '../../course-builders.ts'

export const L20 = withKind(
  L(
    'L20',
    12,
    'Grok Build：Rust 全屏 TUI、plan mode 与 allowlist auto mode',
    2,
    ['L01'],
    ['h-grok-tui'],
    [
      '描述 Grok Build 的形态差异（全屏鼠标 TUI vs 聊天滚动流）与三种运行形态',
      '解释 auto mode 的 allowlist 语义（每段都匹配才免审）与 worktree 审批复用',
      '评估高频发版（每周数次）对自动化 pin 版本的要求',
    ],
    `### 定位：xAI 亲自下场，选择了一个不同的形态

Grok Build（命令 \`grok\`，[x.ai/cli](https://x.ai/cli) 官方页，仓库 [xai-org/grok-build](https://github.com/xai-org/grok-build)）是 xAI 的终端 coding agent：**Rust 实现、全屏鼠标可交互 TUI**。官方公告（[Introducing Grok Build](https://x.ai/news/grok-build-cli)）的时间线：early beta（面向 SuperGrok 与 X Premium Plus 订阅者）→ 2026-07-15 开源（Apache-2.0）→ 2026-08-07 v1.0.0 → 快照时最新 1.0.70（2026-10-23）。仓库 27.6k stars / 5.2k forks（快照），源码从 xAI monorepo **周期性同步**（根目录 SOURCE_REV 记录对应 commit）——「大仓切片发行」是它与社区原生项目的发行差异。台账 G-5 专门登记了一个措辞陷阱：仓库 About 出现「SpaceXAI」字样，官方新闻页自称 xAI，引用以官方页为准。

### 形态即架构：全屏 TUI 改变了什么

大多数终端 agent 是「聊天框 + 滚动文本」；Grok Build 是**像 vim/htop/lazygit 那样的全屏程序**：理解代码库、改文件、执行 shell、联网搜索、管理长任务全在同一个面板化界面里完成。形态差异不是皮肤，而是交互模型：

\`\`\`text
形态谱系（本课程 15 系统的界面形态分布）
滚动流（绝大多数）  输入→输出逐行追加；适合脚本、管道、远程 SSH
全屏 TUI（Grok Build）  面板/焦点切换/鼠标点选/快捷键；适合交互密度高的日常驾驶
Web/桌面（OpenCode 2.0 / Qwen / Kilo）  跨设备会话与可视化
浏览器平台（OpenHands Agent Canvas）  多 agent 管控与自动化编排
\`\`\`

同一二进制的三种形态：交互 TUI、headless（脚本/CI，支持 JSON 输出）、ACP server（嵌入编辑器）。这个「一三形态」结构与 Codex CLI 的 headless 哲学（L05）兼容，但把交互端做到了密度上限。

### 权限控制面：plan mode + 逐段 allowlist

Grok Build 的权限答案是「计划级审批 + 命令级 allowlist」的组合。**Plan mode**：复杂任务先出计划，人可以批准、对单条步骤评论、或整体重写；批准后**每处变更显示为干净 diff**。**Auto mode 的 allowlist 语义**：近期版本改为 *a shell command runs without review only when every segment matches an allowlist entry*——复合命令逐段匹配，任何一段不过就回审批。配合 OS sandbox、worktree **复用主 checkout 的已保存审批**（切换工作树不用重新批准一遍），这套组合在「自动化吞吐」与「人审粒度」之间找了一个精细的平衡点。

生态兼容面上，官方公告明确：**AGENTS.md、plugins、hooks、skills、MCP servers 开箱兼容**——新入场的 harness 直接采纳了行业已形成的约定（AGENTS.md 标准、hooks 模式、MCP 协议），这是 2026 年后发者的典型策略：不再发明概念，直接兼容生态。

### 高频发版的工程后果

Releases arrive several times a week（第三方核实口径）——对个人用户是持续改进，对自动化是**版本漂移风险**。CI/无人值守的标准动作是 pin 版本 + headless + 沙箱。与 OpenCode 的 1.x/2.0 断代（L13）相比，Grok Build 的高频小版本策略对生态更温和，但「本周的行为可能与上周不同」的隐忧要求自动化场景永远显式锁版本。

### 适用与排除

**适合**：偏好 vim/htop 式全屏交互的重度终端用户；xAI/Grok 模型生态用户（订阅即用）；需要 plan mode 粒度审批 + allowlist 自动化组合的团队；CI/CD 场景（pin + headless + 沙箱三件套）。**排除**：非 xAI 模型的深度用户（模型生态绑定 SuperGrok/订阅体系）；把仓库措辞或第三方目录当官方文档的场景（官方文档站 docs.x.ai/build 是权威源）；对「SpaceXAI」式命名混乱敏感的采购文档（以 x.ai 口径为准）。

下一课进入「记忆优先」流派的最纯粹样本：Letta Code——出身为 MemGPT 研究、agent 实现不到 200 行、却登顶开源 Terminal-Bench 的记忆机器。

### 追问与辨析：发布节奏、pin 纪律与三层口径的排序

Grok Build 的自动化风险主要来自发布节奏：第三方目录记录发布频率一周数次（G-3），1.0.70（2026-10-23）与 Bug Hunt 使用的 1.0.62（F-B17）之间隔了近两个月的小版本；任何 CI 都应 pin 到具体版本并在升级窗口重跑回归。仓库层面的 pin 信号更有意思：G-2 显示源码从 SpaceXAI monorepo 周期性同步，\`SOURCE_REV\` 记录 commit SHA——读源码排查行为之前，先核对 \`SOURCE_REV\` 与你 pin 的 release 是否一致，否则你审的代码可能不是你跑的代码。

口径排序也要练熟：官方新闻页（x.ai/news/grok-build-cli）定义产品承诺（plan mode、diff 展示、AGENTS.md/plugins/hooks/skills/MCP 开箱兼容，G-1）；官方仓库（github.com/xai-org/grok-build）定义形态与技术栈（Rust、全屏鼠标 TUI、headless、ACP，G-2）；第三方目录（G-3）定义行为细节（auto mode 改为 shell 命令每一段都匹配 allowlist 才免审执行、worktree 可复用主 checkout 的已保存审批）。而 G-5 记录的「SpaceXAI」措辞陷阱提醒我们：仓库 About 一行不构成官方口径，引用一律回 x.ai 官方页自称。

\`\`\`bash
# Grok Build 自动化基线（语义示意；具体 flag 以 grok-build --help 与官方 docs.x.ai/build 为准）
grok-build --version          # 1) 确认版本并 pin：CI 中禁止浮动
#    参照：Bug Hunt 用 1.0.62（F-B17）；第三方目录快照最新 1.0.70（2026-10-23）
cat SOURCE_REV                # 2) 源码审查前先核对同步点 commit SHA（G-2）
grok-build --headless --json  # 3) CI 形态：JSON 输出供流水线解析（G-2/G-3）
# 4) auto mode 免审条件：shell 命令「每一段」都命中 allowlist（G-3）
#    allowlist 须按命令段粒度维护；worktree 可复用主 checkout 的已保存审批
\`\`\`
`,
    null,
    [
      {
        text: 'Grok Build 与大多数终端 agent 的形态差异是？',
        options: [
          '没有差异',
          '全屏、鼠标可交互的 TUI 应用（像 vim/htop/lazygit），而不是「聊天框 + 滚动文本」；同一二进制还支持 headless（脚本/CI）与 ACP（嵌入编辑器）',
          '纯 Web 应用',
          '只有 IDE 插件',
        ],
        answer: 1,
        explain:
          '官方仓库与第三方评测一致：Rust 实现的全屏 TUI + headless + ACP 三形态。形态影响交互模型——全屏 TUI 支持面板/快捷键/鼠标点选，滚动流更适合脚本与管道。',
        concept: 'h-grok-tui',
      },
      {
        text: 'Grok Build 近期版本把 auto mode 改成了什么语义？',
        options: [
          '全部自动执行',
          'shell 命令**每一段**都匹配 allowlist 条目时才免审执行——分段匹配，任何一段不匹配就走审批',
          '全部人工审批',
          '按命令长度决定',
        ],
        answer: 1,
        explain:
          '第三方目录核实（ithub.directory，B 级）：recent releases changed auto mode so a shell command runs without review only when every segment matches an allowlist entry。复合命令（如 a && b）不能因为 a 安全就放行 b——这是对管道注入的最小防御。',
        concept: 'h-grok-tui',
      },
      {
        text: 'Grok Build 的 plan mode 交互是？',
        options: [
          '没有 plan mode',
          '复杂任务先出 plan，可批准、可对单条步骤评论、可整体重写；批准后每处变更显示为干净 diff',
          '只能看不能改',
          '需要付费解锁',
        ],
        answer: 1,
        explain:
          '官方公告（x.ai/news/grok-build-cli）：plan mode 三种操作（approve / comment / rewrite）+ 批准后 diff 展示。与 Cline 的 Plan/Act（L18）同属「审批优先」家族，但 Grok 的粒度是「计划步骤级」。',
        concept: 'h-grok-tui',
      },
      {
        text: '把 Grok Build 用于 CI 自动化，官方与第三方共同的提醒是？',
        options: [
          '随便跑',
          '发布频率一周数次——自动化必须 pin 版本；headless 模式 + JSON 输出是给 CI 的正确入口',
          '只能交互使用',
          'CI 不支持',
        ],
        answer: 1,
        explain:
          'ithub.directory 核实：Releases arrive several times a week, so pin a version in automation。加上 headless JSON 输出与 OS sandbox，CI 场景的三件套是 pin 版本 + headless + 沙箱。',
        concept: 'h-grok-tui',
      },
    ],
    [
      ['全屏 TUI', '占用整个终端、支持鼠标与快捷键的界面形态；与聊天滚动流是终端 agent 的两大界面范式'],
      [
        'SOURCE_REV',
        'Grok Build 仓库根目录记录同步自 xAI monorepo 哪个 commit 的文件——「大仓周期性同步」的发行痕迹',
      ],
      ['allowlist auto mode', 'shell 命令逐段匹配 allowlist 才免审的自动执行语义'],
    ],
    [
      '把仓库 About 的「SpaceXAI」当官方自称——官方新闻页自称 xAI，仓库措辞存疑（台账 G-5），引用以 x.ai 为准',
      '把 allowlist 当全有或全无——它是逐段匹配，复合命令的每一段都要过',
      '从第三方站给许可证「补常识」——F-B13 明确警告 Grok Build 等该文未给许可证时不要按外部常识补写（本课已按官方仓库核实为 Apache-2.0）',
    ],
  ),
  'theory',
)
