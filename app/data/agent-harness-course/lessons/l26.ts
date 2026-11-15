import { L, withKind } from '../../course-builders.ts'

export const L26 = withKind(
  L(
    'L26',
    16,
    '横向对比（三）：四大架构流派与工程旋钮',
    3,
    ['L24'],
    ['h-x-arch-schools'],
    [
      '把 15 个系统归纳为四大架构流派（极简内核 / 插件树 / 平台化 / 记忆优先）并说出每派的代价',
      '用四控制面逐维对照流派间的工程旋钮差异',
      '识别跨流派的两个趋同点（AGENTS.md 标准、Codemode）与它们的含义',
    ],
    `### 四大流派：把 15 个系统压成四个模式

四控制面框架（L01）在本课程的 15 个系统上运行了 15 次，现在可以收束了。按「对四个控制面做出同构取舍」的标准，15 个系统归入四个流派：

| 流派 | 成员 | 核心取舍 | 代表代价 |
|---|---|---|---|
| **极简内核** | mini-swe-agent、Pi | 减法到极限：少工具、短提示、无内置保障 | 安全与开箱体验交还用户；行为分布最宽（泄漏环境里 89%/7.2% 的 key 使用率） |
| **插件树** | DeepSeek Harness、OpenCode 2.0 | 一切可插拔：配置可自省、行为可重写 | preview/重写期的破坏性变更（DSH 警告 / OpenCode 生态断代） |
| **平台化** | OpenHands、Kilo、Qwen Code（1.0）、Hermes（入口面）、Grok Build（形态面） | 从工具变基础设施：常驻服务、多端、自动化、管控层 | 重写与运维成本；治理面复杂 |
| **记忆优先** | Letta Code、Hermes（内核面）、Kimi Code（轻量复用 pi-tui） | 会话临时、agent 持久；经验复利 | 记忆治理、agent 自改提示的审计负担；一次性任务成本收不回 |

注意两个系统跨流派（Hermes 同时是平台化与记忆优先的代表，Grok Build 的全屏 TUI 属形态创新而其 plan/allowlist 属审批优先权限派），以及 Kimi Code 的特殊位置——它复用 pi-tui 说明**流派之间可以组装**：极简内核 + 商业产品化。流派不是公司的护城河，是架构取舍的坐标系。

### 逐旋钮对照：同一旋钮的四种答案

**主循环旋钮**：线性 while 循环（mini-swe-agent 100 行）→ 可编程循环（Pi，运行时 \`/reload\` 自改）→ 插件化循环（DSH：agent loop 也是插件）→ 常驻服务循环（OpenCode 2.0：TUI/Web/桌面共享进程）→ 状态化 AIAgent 循环（Hermes/Letta：跨会话持久）。演进方向清晰：**循环的「寿命」在变长**——从单任务到单进程到跨会话。

**上下文旋钮（压缩触发点）**：阈值摘要（Claude Code 接近上限自动摘要 / Codex 双档：token 阈值 + 回合末百分比）→ 可替换压缩（Pi：扩展可完全替换，主题式/代码感知/换模型）→ 记忆替代压缩（Letta 三层记忆改写 / Hermes stable→context→volatile 分层）。这是流派分歧最深的旋钮：**压缩派**相信「摘要后继续」，**记忆派**相信「不该丢的先固化」。两者的分界其实是任务时长假设——短任务压缩够了，长任务必须记忆。

**权限旋钮**（L24 已列四象限）：规则漏斗（Claude Code：deny>ask>allow 固定序 + managed settings）→ 沙箱强制（Codex：Seatbelt/bwrap/Windows 原生）→ 审批优先（Cline：Plan/Act + checkpoint；Grok Build：plan 步骤级 + 逐段 allowlist）→ 交还用户（Pi：无 popups，容器自建；mini-swe-agent：bash 全开放）。旋钮的深层变量是**「谁为安全负责」**：harness（前两类）还是人与流程（后两类）。

**终止与介入旋钮**：跑完为止（mini-swe-agent）→ diff 审查（Claude Code/Cline 的变更展示）→ checkpoint 回滚（Cline \`/undo\`：文件/任务/两者）→ 步骤级计划审批（Grok Build：批准/评论/重写）→ 双粒度插话（Pi：steering 中断排队 vs follow-up 完成后送达）。介入粒度从「能不能打断」进化为「**何时、以什么粒度、事后能不能反悔**」三参数。

### 趋同点与差异点：选型精力的分配

两个跨流派趋同值得钉死：**AGENTS.md 标准**（L24 已列，8+ 家兼容）与 **Codemode 组合工具**（Pi/OpenCode 独立同构）。趋同点的选型含义：这些格子上各系统差不多，**不值得花决策精力**；选型精力应该全部投向差异点——权限姿态（安全团队发声）、记忆策略（项目时长决定）、扩展模型（团队工程能力决定）、许可例外（法务发声）。这也是 L27 决策表的结构：场景约束先过滤差异点，趋同点默认通过。

### 流派与基准数据的回环

把 L25 的数据折回流派坐标系：头部并列五家恰好横跨三个流派（极简的 mini-swe/Pi、记忆的 Hermes、专有平台化的 Claude Code、商业内核的 Kimi Code）——**流派与榜单成绩没有因果关系**，印证 L01 的结论：harness 差异是工程取舍，不是能力等级。断层之下的 OpenCode/OpenClaw 也各有非能力解释（重写期版本因素 / 配置伪影）。流派的真正用途是 L27 的场景匹配：你的约束（合规、运维、任务时长、团队工程力）会先淘汰一整个流派。

下一课是全课的终点：场景化选型决策表。

### 追问与辨析：把 15 个系统钉进流派的三问

流派归属不靠自我宣传，靠三个判别问题：**动作接口**——唯一 bash（mini-swe-agent）、结构化工具面（多数）、插件树注册（DSH「Everything is a Plugin」、OpenCode 2.0 的 80+ 内部插件）；**状态归属**——无状态线性消息史（mini-swe）、持久化 agent（Letta）、SQLite/云端会话（OpenClaw、平台系）；**权限哲学**——人在环逐项审批（Cline Plan/Act）、沙箱自动执行（Codex workspace-write）、配置兜底（OpenClaw 的 maxTokens fallback 教训）。用三问过一遍 15 个系统，比记「谁是什么流派」的结论更耐久——新系统出现时，三问直接给出归属与迁移成本。

\`\`\`yaml
# 流派判别三问 x 代表系统（依据各章 A 级事实整理）
extreme-core:   { action: 唯一 bash,  state: 线性消息史,    members: [mini-swe-agent, Pi] }
plugin-tree:    { action: 插件注册,   state: 运行时组合,    members: [DSH, OpenCode 2.0, Qwen 1.0] }
platform-suite: { action: 托管工具面, state: 云端/本地会话, members: [Claude Code, OpenHands, Codex] }
memory-first:   { action: 记忆块+技能, state: 持久 agent,   members: [Letta, Hermes] }
# 边界案例自行标注: OpenClaw(网关即控制面) / Kilo(IDE 集成) / Grok Build(全屏 TUI)
\`\`\`

\`\`\`yaml
# 三问的评估顺序：新系统出现时按此定归属（教学脚手架，非官方分类）
# 1) 动作接口 -> 决定模型兼容面（唯一 bash 几乎兼容任何模型，F-S2）
# 2) 状态归属 -> 决定长期任务上限（持久 agent 有复利，无状态每次重置）
# 3) 权限哲学 -> 决定无人值守可行性（人在环审批拖慢自动化，沙箱自动执行要求信任边界）
# 注意：流派是理解工具不是阵营标签——头部并列五家横跨三个流派（本课正文）
\`\`\`
`,
    null,
    [
      {
        text: '四大流派的「代价」配对正确的是？',
        options: [
          '极简派没代价',
          '极简派：安全与开箱体验交还用户；插件树派：preview 期破坏性变更与配置面复杂；平台化派：重写代价大（OpenCode 生态断代）与运维重；记忆优先派：记忆治理与自改提示的审计负担',
          '平台化派没代价',
          '四派都没代价',
        ],
        answer: 0,
        explain:
          '每派的代价都来自它的核心设计：减法（极简）失去内置保障；插件树（DSH）尝鲜期 API 不稳；平台化（OpenCode/OpenHands/Kilo）重写与运维成本；记忆（Hermes/Letta）需要治理 agent 自改行为。',
        concept: 'h-x-arch-schools',
      },
      {
        text: '「压缩触发点」这个旋钮上，各流派的不同答案是？',
        options: [
          '全部一样',
          '阈值触发摘要（Claude Code 近上限自动摘要 / Codex token 阈值 + 回合末百分比）/ 可完全替换（Pi 扩展）/ 记忆替代压缩（Letta 三层记忆改写 / Hermes 分层提示）',
          '只有一种压缩算法',
          '都不压缩',
        ],
        answer: 1,
        explain:
          '四控制面之「上下文」：主流是阈值触发的摘要压缩；Pi 把它做成可替换扩展；Letta/Hermes 干脆用「记忆」替代「压缩」——这是流派间最深刻的分歧之一。',
        concept: 'h-x-arch-schools',
      },
      {
        text: '「终止与人工介入」旋钮上最细的两档设计是？',
        options: [
          '没有差异',
          'Pi 的 steering（当前工具后立即送达并中断排队工具）vs follow-up（完成后送达）双粒度；Grok Build 的 plan 步骤级（批准/评论/重写）——介入粒度被做成了明确的产品参数',
          '全部只有打断一种',
          '都不能介入',
        ],
        answer: 1,
        explain:
          'Pi F-P8 与 Grok Build 官方公告：人工介入从「能不能打断」进化成「什么时候、以什么粒度打断」。Cline 的 checkpoint /undo（L18）是事后回滚维度的补充。',
        concept: 'h-x-arch-schools',
      },
      {
        text: '两个跨流派趋同点（AGENTS.md 标准、Codemode 组合工具）说明什么？',
        options: [
          '行业在抄袭',
          '生态收敛：仓库级指令文件已是行业默认约定；「模型写代码组合工具」由两个独立项目同时做出（Pi Codemode / OpenCode Code Mode）——趋同点是新选型的安全区，差异点才是评估重点',
          '说明没创新',
          '说明要淘汰旧系统',
        ],
        answer: 1,
        explain:
          '趋同点上的选择成本低（大家都有）、风险小（标准成熟）；选型精力应放在差异点上：权限姿态、记忆策略、扩展模型、许可例外。',
        concept: 'h-x-arch-schools',
      },
    ],
    [
      ['工程旋钮', '四控制面下可独立调节的设计决策（压缩触发点、介入粒度、权限层级等）'],
      ['流派', '对四控制面做出同构取舍的系统群；同流派系统 interchangeable 程度高，跨流派则需重新评估'],
    ],
    [
      '把流派当质量等级——四派是四种取舍，不是四个段位',
      '在同流派内横向比较时忽略了流派内差异（如同为平台化，OpenHands 面向管控、Kilo 面向 IDE 全栈）',
      '把趋同点当差异化卖点——AGENTS.md 兼容已是默认，不值得作为决策理由',
    ],
  ),
  'theory',
)
