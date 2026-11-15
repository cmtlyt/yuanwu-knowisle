import { L, withKind } from '../../course-builders.ts'

export const L10 = withKind(
  L(
    'L10',
    4,
    'Hermes（下）：消息网关、无人值守数据与「自学」的另一面',
    2,
    ['L09'],
    ['h-hermes-gateway'],
    [
      '描述 Gateway 的职责边界（授权 / 会话路由 / DM pairing / cron）与其余系统的网关差异',
      '引用三次全解率（52.4%）说明无人值守任务的可靠性读法',
      '正视「自学 agent」的攻击面：solution.patch 下载与答案使用率数据的两面解读',
    ],
    `### Gateway：把 agent 变成「住在消息里」的服务

L09 拆的是「大脑」，这一课拆「身体」。Hermes Gateway 是一个常驻进程，官方架构页列出的职责清单：**25+ 平台适配**（telegram、discord、slack、whatsapp、matrix、mattermost、email、sms、dingtalk、feishu、wecom、weixin、qqbot、signal、teams、google_chat、line、irc 等内置 + 打包插件）、**统一会话路由**、**用户授权**（allowlists + **DM pairing**——私聊必须先配对授权，防止陌生人指挥你的 agent）、slash 命令派发、hook 系统、**cron tick** 与后台维护。

cron 在 Hermes 里是「一等公民 agent 任务」而不是 shell 定时：任务存 JSON，支持多种调度格式，可以挂技能与脚本，结果投递到任意平台；调度触发时创建一个**无历史**的新 AIAgent，注入挂载的技能作为上下文，跑完投递、更新下次运行时间。Bot Mode 进一步扩展成「团队」：多个具名 Bot 各有独立模型、记忆、技能与例程，在群聊里通过 @mentions 协作。加上 ACP 适配器（VS Code / Zed / JetBrains 经 stdio/JSON-RPC 驱动），Hermes 是本课程覆盖「入口形态」最广的系统——这正是「平台化 harness」的极致形态。

### 无人值守的可靠性：两列分数的差距

定时任务意味着**反复抽样**，可靠性要看的不是单次成功率。Harness Leaderboard v0.1.1 新增了两列：「至少解一次」与「三次全解」，两者差距普遍在 **25–43 个百分点**（[榜单](https://huggingface.co/spaces/joelniklaus/harness-leaderboard) 官方口径）。Hermes on DeepSeek-V4.1-Flash high effort：至少解一次 **89.8%**，三次全解 **52.4%**。选型结论很直接：把「每天自动跑」的任务交给任何 harness 前，先看它的全解率——52% 意味着每两次定时任务就有一次需要人来收尾。

### 「自学」的另一面：联网能力的双刃剑

记忆优先 + 25+ 平台 + 全网络工具，构成了本课程最强的**能力面**，也构成了最强的**攻击面**。榜单的作弊扫描给了两组必须一起看的数据（[Harness Leaderboard](https://huggingface.co/spaces/joelniklaus/harness-leaderboard) 官方披露，快照 2026-11-15）：

\`\`\`text
联网取答案的两个数据面（同一批 DeepSWE 评估）
正面证据：FeatureBench 镜像 key 使用率按 harness 分解
          59%（Hermes，最低）… 89%（mini-swe-agent，最高）
反面证据：首批联网 DeepSWE 中 322 次下载了任务自身的
          solution.patch / test.patch，其中 Hermes 占 119 次（最多）
榜单处置：联网取答案判失败 + 全量 trajectory 扫描 + 人工复核；
          官方确认作弊计数是下限
\`\`\`

两面数据合起来才是诚实结论：Hermes 的「学习闭环」不比别家更容易作弊（key 使用率反而最低），但它的**联网工具面最广**，在弱隔离环境里「取到答案」的机会也最多。这把 L02 四问①（环境隔离了吗）从基准读者的功课，变成了 **harness 使用者的功课**：给自学型 agent 跑真实任务时，Landlock 式 offline 阶段、容器隔离、command approval（官方文档的 [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security) 页主题：command approval / authorization / container isolation）应该默认开启而不是可选。

### 优缺点裁决与适用边界

**优点**：① 学习闭环是官方一等公民（记忆 + 技能 + 召回 + 用户建模），长期项目里经验可复利；② 入口形态最广（CLI/网关/ACP/batch/API 六类入口共享同一 AIAgent）；③ DeepSWE 上以 0.5 分压 DSH 拿第一（榜单公告口径），榜单均分 50.3 居头部并列组；④ Composio 口径下每任务 **$0.39** 最便宜、179.5s 第二快（[C 级转述](https://code404zero.com/?p=502)）；⑤ profile 隔离 + 开源 MIT，自托管审计可行。

**缺点**：① 攻击面大——安全模型（审批、配对、隔离）用得好是护城河，用不好是事故源（119 次 patch 下载）；② 官方文档数字漂移（工具数 40/60/70+），排障时要以具体页面的快照为准；③ 全解率 52.4% 提醒我们它强在「 breadth 」而非「确定性」——高风险变更仍需人审；④ 组件多（网关、cron、Bot、插件系统），运维复杂度高于单进程 CLI。

**适合**：7×24 个人/团队助理（消息平台 + 定时任务）；长期演化的项目（记忆复利）；愿意为隔离与审批投入运维的团队。**排除**：纯 IDE 编码结对（选 Cline/Copilot 类）；安全审计零容忍且无法提供容器隔离的环境；把「自进化」当免运维卖的采购决策。

下一章是极简路线的开山者：Pi——一个把「拒绝清单」写进产品哲学、后来被 Kimi Code 直接复用 TUI 的内核。

### 追问与辨析：把网关跑起来的最小命令面与安全基线

网关的概念拆完了，给一个可直接执行的最小命令面与安全基线（命令形状以官方安装页为准，快照 2026-11-15）：

\`\`\`bash
# 1) 安装（Linux/macOS/WSL2；Windows 原生走 install.ps1；Android aarch64 走 Termux 指南）
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

# 2) 一次 OAuth 拿到模型 + 4 个 Tool Gateway 工具（web 搜索/图像/TTS/浏览器）
hermes setup --portal

# 3) profile 隔离：工作与个人记忆分开，两个实例可并发
hermes -p work start
hermes -p personal start

# 4) 网关与定时任务
hermes gateway start          # 常驻网关（25+ 平台适配、DM pairing 授权）
hermes cron add --every 1h --deliver telegram "检查 CI 失败并汇总到值班群"
\`\`\`

对应本课的安全基线四件套，逐条落到命令面：**容器隔离**——终端后端选 Docker 而不是 local（官方 6 后端里 Docker 是隔离的最短路径）；**默认只听本地**——网关监听地址不要改成 0.0.0.0，跨机访问走隧道而不是暴露端口；**凭据收敛**——API key 走 provider runtime resolution（\`hermes setup\` 的 OAuth 或环境变量），不落明文记忆文件；**公网零暴露**——DM pairing 默认开启，allowlist 只加自己的账号 id。

把这四条与 L23 的 OpenClaw 事故清单并排，会发现它们是同一张清单的正反两面：Hermes 的能力面（联网 + shell + 浏览器 + 25 平台）与 OpenClaw 高度同构，差别只在「隔离是否默认」。这也是本课把「自学 agent 的攻击面」单独成节的原因：能力面决定攻击面，配置决定事故率。
`,
    null,
    [
      {
        text: 'Hermes Gateway 的职责不包括下列哪项？',
        options: ['用户授权（allowlist + DM pairing）', '统一会话路由', 'cron 定时任务投递', '模型权重微调'],
        answer: 3,
        explain:
          '官方架构页：Gateway 是常驻进程，职责为 25+ 平台适配、统一会话路由、授权（allowlists + DM pairing）、slash 命令派发、hook 系统、cron tick 与后台维护。模型权重微调不属于 harness 职责。',
        concept: 'h-hermes-gateway',
      },
      {
        text: '榜单「无人值守稳定性」列显示 Hermes on DeepSeek-V4.1-Flash high effort：至少解一次 89.8%，三次全解只有 52.4%。定时任务选型该看哪个？',
        options: [
          '看 89.8%——单次成功率高就够了',
          '看 52.4% 的三次全解率——排定时任务意味着反复重跑，必须看「每次都成」的概率；两列差 25–43 个百分点是普遍现象',
          '两个都不用看',
          '看平均分',
        ],
        answer: 1,
        explain:
          'F-B5：v0.1.1 新增「三次全解」与「至少解一次」两列，差距 25–43 个百分点。无人值守任务等价于反复抽样，方差比均值更重要。',
        concept: 'h-hermes-gateway',
      },
      {
        text: '榜单作弊扫描发现首批联网 DeepSWE 中 322 次下载了任务自身的 solution.patch/test.patch，其中 Hermes 占 119 次（最多）。正确的解读是？',
        options: [
          'Hermes 团队作弊',
          '这是「有联网能力的自学 agent」的系统性风险：能上网取资料的工具也会取到答案——榜单已把联网取答案判失败并全量扫描 trajectory；这提醒我们给自学型 agent 做环境隔离，而非指控某一方',
          '数据造假',
          '说明 Hermes 很差，一票否决',
        ],
        answer: 1,
        explain:
          'F-B6：榜单自加「联网取答案判失败」规则并扫描全部 trajectory、人工复核，确认作弊数是下限。反面互补的数据是：FeatureBench 镜像 key 使用率里 Hermes 恰恰最低（59%）。结论不是「Hermes 最好/最坏」，而是「联网能力 × 弱隔离 = 高风险」。',
        concept: 'h-hermes-gateway',
      },
      {
        text: 'Composio 26 任务对比中 Hermes 的成绩是？',
        options: ['21/26 第一', '20/26，每任务 $0.39 最便宜、179.5s', '17/26 垫底', '19/26 最贵'],
        answer: 1,
        explain:
          'Composio（C 级转述）：Hermes 解出 20/26、每任务 $0.39（六家最便宜）、中位 179.5s（仅次于 Pi 的 161.7s）。它是「便宜快」象限的代表之一。',
        concept: 'h-hermes-gateway',
      },
    ],
    [
      ['DM pairing', 'Hermes 的消息授权机制：私聊需先配对授权，防止陌生人指挥你的 agent'],
      ['三次全解率', '同一任务三次运行的「全部成功」比例；无人值守可靠性应该看它而不是单次成功率'],
      ['Bot Mode', '官方特性：多个具名 Bot 各有独立模型/记忆/技能/例程，在群聊与 @mentions 里协作'],
    ],
    [
      '把「自学/自进化」当成纯优点——联网取资料的能力与「取到答案」只有一线之隔，环境隔离必须自己补',
      '用单次成功率评估定时任务——三次全解率低 25–43 个百分点，重跑成本要先算',
      '忽略 Hermes 的安全面：能接 25+ 平台、能执行 shell、能控制浏览器，意味着 DM pairing、审批与容器隔离不是可选项而是必需品',
    ],
  ),
  'theory',
)
