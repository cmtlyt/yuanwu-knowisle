import { L, withKind } from '../../course-builders.ts'

export const L21 = withKind(
  L(
    'L21',
    13,
    'Letta Code：memory-first 与分层记忆的登顶样本',
    2,
    ['L09'],
    ['h-letta-memory-tier'],
    [
      '画出 Letta 的三层记忆（Core/Recall/Archival）与 OS 式类比',
      '解释「会话绑定持久 agent」与每会话独立会话的本质区别',
      '引用 Terminal-Bench 数据评估「记忆优先」路线的能力上限',
    ],
    `### 出身：从 MemGPT 论文到「记忆即产品」

Letta Code 的团队出自 UC Berkeley 的 **MemGPT** 研究项目（把 LLM 当操作系统进程管理记忆的论文），这个出身决定了它的设计第一性：**session 是临时的，agent 是持久的**。官方博客（[Letta Code: A Memory-First Coding Agent](https://letta.one/blog/letta-code)）把行业现状命名为 *stateless agent problem*：每次会话从零开始，团队花几个月建立的约定、上周讲过的架构决策、报过的 bug 模式全部归零；CLAUDE.md 文件是给「失忆工程师」反复重读的便签。Letta 的答案：每个会话绑定一个**持久 agent**，越用越有上下文。

### 三层记忆：OS 式的工程化

| 层 | OS 类比 | 内容 | 谁来管理 |
|---|---|---|---|
| Core Memory | RAM | pinned 在上下文内的 blocks（任务、用户偏好、repo 约定、agent 自己的工作笔记），有大小上限 | **agent 自己改写**（memory_replace / memory_insert） |
| Recall Memory | 交换区/归档 | 每条交互自动持久化、可检索的对话历史 | 自动 + \`/search\`（向量/全文/混合） |
| Archival Memory | 磁盘 | 处理与索引过的长期知识（架构决策、调试方案、跨 repo 模式） | 检索工具按需召回 |

官方 Terminal-Bench 实现是这套机制的极致简化演示：agent 只有两个 memory blocks（只读 task description + 读写 todo list），40k token 阈值触发递归摘要压缩，**不到 200 行代码**拿下 42.5%（总榜第 4、开源第一，快照为官方博文发布时点）。注意口径：这是 Terminal-Bench 早期时代的成绩，与 Harness Leaderboard 的 TB 2.1 数字**不可直接比较**——L02 四问在这里再次生效。

### 技能学习：记忆的产品化出口

记忆沉淀的出口是**技能**：复杂任务被教练式带过一遍后，可触发 agent 从经验中提炼技能——技能就是 \`.md\` 文件（\`.skills/\` 目录的 SKILL.MD，frontmatter 带 name/description/category/tags），可以进 git 版本管理，甚至被其他 agent 引用。官方例子：DB migration 生成、PostHog 面板创建、API 变更最佳实践。跨会话检索靠 \`/search\`（Letta API 的向量/全文/混合搜索），能找回三周前「payment service 的重试逻辑用什么 pattern」这类对话。\`/init\` 则让 agent 对本地代码库做深研并**重写自己的系统提示**（经 memory blocks）——agent 修改自己的提示词在这里不是噱头，而是记忆固化的机制载体。

### 工程现实：research preview 与层级配置

两个使用侧的现实：其一，官方明确 research preview（*may have bugs or unexpected issues*），Apache-2.0，模型无关（Sonnet 4.5 / GPT-5 / Gemini 2.5 / GLM-4.6 等）；其二，记忆配置是**层级化**的：全局 \`~/.letta/settings.json\`（persona block 定行为、human block 存用户偏好）+ 项目 \`.letta/settings.local.json\`（记录上次 agent id，自动恢复，gitignore 个人化）+ 项目共享 \`settings.json\`（project block，可提交共享给团队）——记忆的共享粒度被做成了配置项，团队可以选择「个人记忆私有、项目记忆共享」。

### 适用与排除

**适合**：长期演化的项目（记忆复利最大化的场景）；多会话、多成员共享项目知识（project block 共享）；把「个人助理越用越懂你」当核心诉求的用户。**排除**：一次性任务（记忆初始化成本收不回）；强审计环境（agent 自改系统提示需要额外治理）；需要生产稳定性的团队（research preview 自述）。

**与 Hermes 的流派对照**（L26 的伏笔）：两家同属记忆优先，但 Hermes 的记忆长在**全功能 agent**里（25+ 平台、cron、Bot 团队），Letta 的记忆长在**纯编码外壳**里（CLI harness 包 stateful agents API）——前者是「全能管家记性好」，后者是「编码专家带着笔记本」。同一个流派，两种产品化深度。

下一课的平台是本课程「转型」叙事的代表：OpenHands——从「自主 coding agent」到「Agent 控制中心」。

### 追问与辨析：分层记忆的落盘形状与技能自动发现

Letta 的「记忆优先」落到磁盘上是三份配置文件与一个技能目录的分工（对照 GitHub README，L-3）：全局 \`~/.letta/settings.json\` 持有 persona/human blocks——跨项目共享的「我是谁/用户是谁」；项目级 \`.letta/settings.local.json\` 负责 agent 的自动恢复——回到仓库即接上上次会话的持久 agent；项目共享 \`settings.json\` 则让团队成员复用同一套项目记忆。会话内还有运行时分层（L-2）：Core Memory 是上下文内可编辑的 blocks，Recall Memory 把对话自动落盘供检索，Archival Memory 存向量/图库级的长期知识，40k token 阈值触发递归摘要——三条线合起来解释了它为什么自称「每个会话绑定持久化 agent」而非独立会话。

技能系统是记忆的另一半：\`.skills/\` 目录下每个技能一个目录，\`SKILL.MD\` 的 frontmatter（name/description/category/tags）被自动发现，全文只在调用时载入——这正是 Claude Code 七载体（CC-1）里 skills 的同款「名称常驻、按需全文」设计，说明这个上下文经济学在流派之间已经趋同。核查资料时注意 L-4 的镜像陷阱：引用一律走 letta.one / letta.com 官方域。

\`\`\`markdown
<!-- .skills/release-checklist/SKILL.MD（frontmatter 由系统自动发现，L-3） -->
---
name: release-checklist
description: 发布前逐项核对：lint、类型检查、回归测试、变更日志
category: workflow
tags: [release, qa]
---

发布前按顺序执行以下步骤……（正文只在 agent 调用本技能时载入全文）
\`\`\`

\`\`\`text
# 三份配置的分工（L-3，文件名以官方 README 为准）
# ~/.letta/settings.json             -> persona / human blocks（全局共享）
# <repo>/.letta/settings.local.json  -> 本项目 agent 自动恢复
# <repo>/.letta/settings.json        -> 项目共享记忆配置
\`\`\`

\`\`\`bash
# Letta Code 会话内命令面（L-1/L-2，官方博客）
/init       # 对代码库深研并重写系统提示（重写 memory blocks）
/remember   # 显式触发反思：把本轮经验固化进记忆
/search     # 消息级检索：向量 / 全文 / 混合（经 Letta API）
# 压缩：40k token 阈值触发递归摘要（L-2）
# Terminal-Bench 42.5%：开源第一、总榜第 4、Claude 4 Sonnet 档第 2（L-2）
\`\`\`
`,
    null,
    [
      {
        text: 'Letta Code 的三层记忆类比操作系统的是？',
        options: [
          '磁盘/内存/缓存',
          'Core Memory = RAM（context 内可编辑 blocks）/ Recall Memory = 对话归档（自动落盘、可检索）/ Archival Memory = 磁盘（向量/图库存长期知识，按需检索）',
          'L1/L2/L3 CPU 缓存',
          '只有一层',
        ],
        answer: 1,
        explain:
          '官方博客 + 第三方详解：Core（context 内 pinned blocks，agent 可改写）/ Recall（每条交互自动持久化、可搜索）/ Archival（处理过的长期知识，向量/图库检索）。agent 主动管理三层之间的流动。',
        concept: 'h-letta-memory-tier',
      },
      {
        text: '「会话绑定持久 agent」与主流「每会话独立」的本质区别是？',
        options: [
          '没有区别',
          '每个会话绑定一个跨会话存在的 agent——它带着 Core blocks、技能与历史继续工作；`/init` 触发对代码库深研并重写自己的系统提示，`/remember` 显式触发反思',
          '只是把历史存文件',
          '需要联网同步',
        ],
        answer: 1,
        explain:
          '官方博客：Rather than working in independent sessions, each session is tied to a persisted agent that learns. 项目级持久化自动恢复上次 agent（.letta/settings.local.json）。',
        concept: 'h-letta-memory-tier',
      },
      {
        text: 'Letta 官方公布的 Terminal-Bench 成绩与实现规模是？',
        options: [
          '42.5%、总榜第 4、开源第一；agent 实现不足 200 行（stateful agents SDK）',
          '51.4% 第一；10 万行',
          '27.3%；100 行',
          '未参加',
        ],
        answer: 0,
        explain:
          '官方博客（letta.com/blog/terminal-bench）：42.5% overall、#1 open-source、总榜第 4、Claude 4 Sonnet 档第 2；实现 <200 行。注意这是 Terminal-Bench 早期时代的成绩——与 Harness Leaderboard 的 TB 2.1 分数不可直接比（口径与时代不同）。',
        concept: 'h-letta-memory-tier',
      },
      {
        text: 'Letta Code 当前处于什么状态？许可证是？',
        options: [
          '稳定版，MIT',
          'research preview（官方自述可能有 bug 与意外行为），Apache-2.0；模型无关（Sonnet 4.5/GPT-5/Gemini 2.5/GLM-4.6 等）',
          'beta，专有',
          '已停止维护',
        ],
        answer: 1,
        explain:
          '官方 README：research preview in active development；Apache-2.0。⚠️ 引用仓库时警惕镜像站（git-hub.com/actuallyrizzn/letta-code 是镜像不是官方）。',
        concept: 'h-letta-memory-tier',
      },
    ],
    [
      ['memory-first', '以记忆为第一设计原则的 harness 路线：会话是临时的，agent 是持久的'],
      ['memory blocks', 'pinned 在上下文内、可被 agent 自己改写的记忆块——agent 重写系统提示的机制载体'],
      ['stateless agent problem', 'Letta 提出的问题命名：每会话从零开始、团队经验零沉淀的行业现状'],
    ],
    [
      '把不同时代的 Terminal-Bench 分数直接比较——42.5% 是早期榜单（89 任务时代），与 TB 2.1/Harness Leaderboard 不可混排（L02 口径纪律）',
      '以为记忆是自动变好——`/init`、`/remember`、技能触发都是显式动作，放任不管的记忆会漂移',
      '引用镜像仓库——letta.one / letta.com / letta-ai 官方渠道为准',
    ],
  ),
  'theory',
)
