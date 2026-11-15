import { L, withKind } from '../../course-builders.ts'

export const L16 = withKind(
  L(
    'L16',
    8,
    'Kimi Code：站在 pi-tui 上的商业内核复用样本',
    2,
    ['L12'],
    ['h-kimi-pi-tui'],
    [
      '描述 Kimi Code 的产品形态（二进制单文件、TUI 毫秒就绪）与官方特性清单',
      '解释「极简内核 + 商业产品」的分层复用路径（pi-tui 致谢）',
      '引用榜单与 Composio 数据评估其在多模型基准与真实任务里的位置',
    ],
    `### 定位：Moonshot AI 的官方开源终端 agent

Kimi Code CLI（[github.com/MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code)，文档 [moonshotai.github.io/kimi-code](https://moonshotai.github.io/kimi-code/zh/)）是月之暗面（Moonshot AI）官方开源的终端 AI 编程 agent：MIT 许可、TypeScript 实现。产品形态上有一个明确的差异化决策——**二进制单文件发行，不需预装 Node.js**，TUI 毫秒级就绪；本地开发才要求 Node ≥ 24.15.0 + pnpm 10.33.0（\`pnpm lint\` 用 oxlint）。鉴权两通道：\`/login\` 选 Kimi Code OAuth 或 Moonshot Open Platform API Key，也可指向其他兼容厂商。Windows 有明确的依赖声明：需要 Git for Windows 的 Git Bash，非标准路径用 \`KIMI_SHELL_PATH\` 指定——这延续了 L15 提到的「bash 生态是终端 agent 的隐含地基」。

### 官方特性清单：五个值得注意的点

- **视频输入**：把录屏/参考片拖进对话——多模态输入在编码 agent 里仍属少数派；
- **对话式 MCP 配置**：\`/mcp-config\` 用对话添加与认证 MCP server，不用手写 JSON；
- **插件信任级别**：插件市场安装 skills / MCP / 数据源时**每次安装标明来源信任级别**——把供应链安全信号做进安装流程，这在 15 个系统里独一份；
- **三子代理并行**：内置 \`coder\` / \`explore\` / \`plan\` 三个子 Agent 在**隔离上下文并行**——注意与 Bug Hunt 复测里「subagent 数量不能解释分数」的结论（F-B11）对照，这是产品能力而非基准优势；
- **生命周期 hooks + ACP**：hooks 可拦截高风险工具调用、审计决策、桌面通知、接自动化脚本；\`kimi acp\` 让 Zed / JetBrains 等编辑器经 stdio 驱动会话。

### 内核复用：pi-tui 致谢的产业含义

官方 README 自述 *Our TUI is built on top of pi-tui*，并致谢 \`earendil-works/pi-mono\`。这条致谢链的产业含义大于技术细节：Pi 的极简内核（L11）证明了「最小 harness」的可行性，而 Kimi Code 证明了**这条内核可以直接托起商业产品**——MIT 内核 + 商业发行（二进制单文件、官方订阅、插件市场）分层共存，互不冲突。横向流派表（L26）里这叫「内核即基础设施」：harness 的终点不一定是终端应用，也可以是别人产品里的组件库。对照另一组复用案例：OpenClaw 用 Pi 的 RPC/SDK 模式做网关（L23），Kimi Code 用 pi-tui 做 TUI——同一个内核，两种上层形态。

### 数据：两套基准里的「第二」

| 数据源 | 结果 | 口径提醒 |
|---|---|---|
| Harness Leaderboard | 三模型均分 **50.5**，头部并列组第二位（快照 2026-11-15） | 与第一 mini-swe-agent（51.4）差距不显著（L02 四问②） |
| Composio 26 任务 | 解出 **21/26 第一**、$0.54/task、中位 297.1 s | C 级转述（[媒体报道](https://code404zero.com/?p=502)）；原始 X thread 未公开 |
| FeatureBench key 使用率 | **2.8%**（九家第三低） | 长而规范性的提示词家族（与 Claude Code/Codex 同模式） |

Composio 团队对自己数据的解读值得原样引用：*复杂稀有且成功率要求高的任务用贵的（Kimi Code，重试更少）；短频任务用便宜快的（Pi / Hermes）*。也就是说 Kimi Code 的生态位不是「最便宜」，而是「**最稳的单发命中率**」——重试次数少在真实工程里等价于等待时间与 token 双省。

### 适用与排除

**适合**：以 Kimi 系模型为主的团队（官方 OAuth 无缝）；要二进制发行、零依赖安装的终端用户；看重插件供应链透明度的安全敏感团队；JetBrains/Zed 用户（ACP）。**排除**：需要完整官方架构文档做安全评审的采购（文档尚薄：主循环/权限/压缩暂无官方文档页，本课事实以 README 为限——这也是它在本课程里拿 B 级而非 A 级的原因）；深度绑定其他厂商模型的工作流。

下一章还是中国厂商：阿里的 Qwen Code——它演示了另一种成长路径：**从分叉别人的 CLI，到把自己重写成「运行基座」**。

### 追问与辨析：从安装到 ACP 的命令面与发行形态的取舍

Kimi Code 的「二进制单文件」决策值得展开成一条完整的命令面（官方 README 形状，快照 2026-11-15）：

\`\`\`bash
# 1) 用户侧：单文件二进制，无 Node 依赖（发行态）
#    从官方 release 下载对应平台二进制，或按仓库指引安装
kimi                     # 毫秒级 TUI 就绪

# 2) 鉴权：OAuth 或平台 API Key，也可指向兼容厂商
/login                   # 选 Kimi Code OAuth / Moonshot Open Platform key

# 3) Windows：Git Bash 是硬依赖，非标路径显式声明
export KIMI_SHELL_PATH="/c/Program Files/Git/bin/bash.exe"

# 4) MCP 与插件：对话式配置 + 信任分级
/mcp-config              # 对话式添加并认证 MCP server（免手写 JSON）
#   插件市场安装 skills/MCP/数据源，每次安装标明来源信任级别

# 5) 编辑器集成：ACP 让 Zed / JetBrains 驱动同一 agent
kimi acp                 # stdio/JSON-RPC，编辑器侧即插即用
\`\`\`

发行形态的取舍可以对照三家：**Kimi 的二进制单文件**（用户零依赖，但发行管线要自己维护多平台构建）、**Cline 的 npm/VSIX**（依赖 Node 生态，升级轻）、**Grok Build 的 monorepo 同步切片**（SOURCE_REV 可追溯，但版本节奏绑定大仓）。三家的选择都与其生态位匹配——Kimi 面向终端用户分发，Cline 面向 IDE 市场，Grok Build 面向自家大仓。选型时发行形态不是小事：**「怎么装」决定了「谁能用」**——没有 Node 环境的运维团队装不了 npm 系，合规团队则会先看二进制的构建可复现性。

信任分级标注（每次安装插件标明来源信任级别）值得在横向维度再提一次：L24 全景表的扩展机制列里，Kimi 是唯一把「供应链信任信号」做进安装流程的系统。在 MCP 服务器数量爆炸（OpenCode 官方称可挂 1000 台）的行业背景下，这个格子的权重会随时间上升。

\`\`\`bash
# Kimi Code 的接入口（F-S8，官方 README/文档）
kimi acp                  # ACP 服务：Zed / JetBrains 经 stdio 驱动会话
/mcp-config               # 对话式添加与认证 MCP server，无需手写 JSON
KIMI_SHELL_PATH=...       # Windows 指定 Git Bash 之外的 shell 路径
# 子代理：coder / explore / plan 三个内置 agent 在隔离上下文并行（F-S8）
# 插件市场安装 skills/MCP/数据源时标明来源信任级别（F-S8）
\`\`\`
`,
    null,
    [
      {
        text: 'Kimi Code 官方 README 明确自述 TUI 建立在什么之上？',
        options: ['自研 Electron', 'pi-tui（并致谢 earendil-works/pi-mono）', 'React Ink', 'Textual'],
        answer: 1,
        explain:
          '官方致谢写明 Our TUI is built on top of pi-tui——Pi 的极简内核路线（L11/L12）被下游商业产品直接复用，是「内核即基础设施」的最直接证据。',
        concept: 'h-kimi-pi-tui',
      },
      {
        text: 'Kimi Code 的插件市场有一个少见的特性是？',
        options: [
          '全部插件免费',
          '每次安装标明来源信任级别——skills/MCP/数据源安装时显式标注可信程度',
          '插件必须审核后上架',
          '不允许第三方插件',
        ],
        answer: 1,
        explain:
          '官方特性清单：插件市场安装 skills/MCP/数据源且每次安装标明来源信任级别。在「插件供应链攻击」成为真实风险的 2026 年，这是把安全信号做进安装流程的设计。',
        concept: 'h-kimi-pi-tui',
      },
      {
        text: 'Kimi Code 在两套对比数据里的位置是？',
        options: [
          '榜单垫底、Composio 第一',
          '榜单三模型均分 50.5（并列第一组第二位）；Composio 26 任务解出 21/26 第一、$0.54/task、中位 297.1 s',
          '榜单第一、Composio 垫底',
          '两项都没有参加',
        ],
        answer: 1,
        explain:
          '榜单 50.5 落在头部并列组（与 mini-swe 51.4 等 2.2 分内）；Composio（C 级转述）21/26 第一。注意 Composio 团队自己的解读是「复杂稀有且成功率要求高的任务用贵的（Kimi Code，重试更少）」。',
        concept: 'h-kimi-pi-tui',
      },
      {
        text: 'Kimi Code 的发行形态有什么特别之处？',
        options: [
          '必须先装 Node.js 24',
          '二进制单文件发行、不需预装 Node.js，TUI 毫秒级就绪（本地开发才需要 Node ≥24 + pnpm）',
          'Docker 镜像发行',
          'Web 应用',
        ],
        answer: 1,
        explain:
          '官方 README：二进制单文件发行；本地开发要求 Node ≥ 24.15.0 + pnpm 10.33.0。发行态与开发态分离，降低了普通用户门槛。',
        concept: 'h-kimi-pi-tui',
      },
    ],
    [
      ['信任级别标注', '插件安装时显式标明来源可信程度的安全设计'],
      ['三子代理', 'coder / explore / plan 三个内置子 Agent 在隔离上下文并行'],
      ['视频输入', '把录屏/参考片拖进对话的多模态输入，Kimi Code 的差异化能力之一'],
    ],
    [
      'Windows 上直接跑——官方要求 Git for Windows 的 Git Bash，非标准路径用 KIMI_SHELL_PATH 指定',
      '把「榜单第二」与「Composio 第一」混成一个排名——两套基准口径不同（L02 四问），结论不能互相替换',
      '假设架构细节都有官方文档——截至目前主循环/权限/压缩尚无官方文档页，本课事实以 README 与官方文档站为限',
    ],
  ),
  'theory',
)
