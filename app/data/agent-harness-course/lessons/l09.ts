import { L, withKind } from '../../course-builders.ts'

export const L09 = withKind(
  L(
    'L09',
    4,
    'Hermes（上）：记忆优先的架构与官方学习闭环',
    2,
    [],
    ['h-hermes-memory-loop'],
    [
      '描述 Hermes 学习闭环的四个机制（记忆管理、技能创建、技能自改进、跨会话召回）',
      '画出官方架构页的分层：6 类入口 → 统一 AIAgent → 3 种 API 模式 → 工具注册表与后端',
      '解释 profile 隔离与「系统提示分层（stable→context→volatile）」的设计意图',
    ],
    `### 定位：「越用越强」的自主 agent，不是 IDE 插件

Hermes 是 Nous Research（Hermes 系列模型背后的实验室）出品的开源 agent（MIT），官方文档的第一句定位就是：*The self-improving AI agent*——不是「绑定 IDE 的 coding copilot」，也不是「单个 API 的 chatbot 壳」。它设计为「活在你放它的地方」：$5 的 VPS、GPU 集群、或空闲时近乎零成本的 serverless 基础设施（Daytona、Modal），你从 Telegram 对话，它在云上干活。官方文档入口 [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/)（快照 2026-11-15，全文已存档；它还贴心提供 \`llms.txt\` ~17 KB 与 \`llms-full.txt\` ~1.8 MB 的机器可读全文）。

### 学习闭环：四个机制 + 一个用户建模

官方 Key Features 把学习闭环写成一整段：**closed learning loop** = agent 自主管理记忆（含定期 **nudge** 提醒固化）、**从经验自主创建技能**、技能在使用中**自我改进**、FTS5 跨会话召回（配 LLM 摘要）、外加 [Honcho](https://github.com/plastic-labs/honcho) 辩证用户建模（对「你是谁、偏好什么」的模型随对话加深）。两点工程判断值得强调：其一，所有「学习」都发生在**模型权重之外**——记忆条目、技能 .md 文件、提示层内容，不涉及微调；其二，技能兼容 [agentskills.io](https://agentskills.io) 开放标准，可移植、可分享、可进 git 版本管理——记忆从私有资产变成可审查的工程产物。

\`/init\` 触发对本地代码库的深研并**重写自己的系统提示**（通过 memory blocks）；\`/remember\` 显式触发反思。跨会话检索不靠重新喂历史：SQLite + FTS5 全文检索 + 向量/全文/混合搜索（\`/search\` 命令），召回时用 LLM 摘要压缩再注入。

### 官方架构页：一张图拆完

架构页（[developer-guide/architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)）给出了完整的分层：

\`\`\`text
入口（6 类）          CLI / Gateway / ACP / Batch Runner / API Server / Python Library
        ↓ 全部汇入
统一 Agent            AIAgent（run_agent.py 门面；循环在 agent/conversation_loop.py + turn_*.py）
   ├ 提示组装          system_prompt 分层：stable → context → volatile
   ├ 提供方解析        runtime_provider：(provider, model) → (api_mode, key, base_url)，18+ providers
   ├ 三种 API 模式     chat_completions / codex_responses / anthropic_messages
   └ 工具派发          tools/registry.py：70+ 工具 / ~28 toolsets，import 时自注册
        ↓
会话存储              SQLite + FTS5（hermes_state.py；跨会话检索在此）
工具后端              终端 6 内置（local/Docker/SSH/Daytona/Modal/Vercel Sandbox）+ 插件
                      浏览器 5 后端 · Web 4 后端 · MCP 动态
\`\`\`

六条官方设计原则里有四条对本课程特别有用：**Prompt stability**（会话中系统提示不变，防缓存击穿，唯一的合法变更来自显式用户操作如 \`/model\`）；**Observable execution**（每条工具调用对用户可见）；**Platform-agnostic core**（同一个 AIAgent 服务 CLI/网关/ACP/batch/API，平台差异留在入口层）；**Profile isolation**（\`hermes -p <name>\` 独立 HERMES_HOME、配置、记忆、会话与网关 PID，可并发）。

### 数字漂移：一个诚实的陷阱

官方文档内部对「工具数」的表述并不统一：docs 根页 Key Features 写 **60+ built-in tools / 20+ platforms**，架构页写 **70+ tools / ~28 toolsets / 25+ platform adapters**，README 写 **40+ tools**。这不是谁错了，而是**文档体系间快照不同步**——工具在持续增加。本课程的口径：引用时写「官方文档随快照漂移」并附两个链接，绝不把单一数字当永久事实。这个陷阱在横向章（L24）的全景表里会再次出现——凡是没有版本锚点的数字，都要带快照日期。

### 与 pi-mono 的路线对照

Hermes 与 Pi（下一章）代表了「记忆优先」与「极简内核」两条路线，但它们有一个共同点：都把**插件式扩展**做进了核心设计（Hermes 的 plugin 三来源：用户目录 / 项目目录 / pip entry points，memory provider 与 context engine 是可替换的单选插件）。差异在于默认姿态：Hermes 默认记住一切、主动成长；Pi 默认忘记一切、按需装配。哪条路线更适合你，取决于任务是一次性的还是长期演化的——这正是 S16 流派归纳（L26）的伏笔。

下一课看 Hermes 的另一半：把 agent 接进 25+ 消息平台的网关，以及它的基准数据里那些**不太体面**的细节。

### 追问与辨析：记忆优先的三个工程追问

**追问一：记忆会不会把错误也记住？** 会，而且这是记忆优先路线的真实代价。Hermes 的闭环里 agent 自己整理记忆（nudge 提醒固化），意味着错误结论同样会被固化成「事实」。工程对策在官方文档里有对应物：技能与记忆都是**文件**（技能 .md 可进 git、记忆经 profile 隔离），所以错误记忆的修正流程可以完全照搬代码资产的治理——review、版本化、回滚。选型时问一句「谁有权改 agent 的记忆文件」，答案决定了这条路线的风险等级。

**追问二：跨会话召回的成本曲线是什么形状？** FTS5 全文检索 + 向量/混合检索（\`/search\`）意味着召回成本随记忆量增长是**亚线性**的（检索不重放全部历史），但**注入**侧的摘要成本随被召回内容长度线性增长。官方给出的两个机制把曲线压平：召回时用 LLM 摘要压缩再注入（只注入相关段），以及 Prompt stability 设计（系统提示会话中不变，前缀缓存全程命中）。对照 L26 的流派对照：这正是「记忆派」对「压缩派」的成本论反驳——压缩派每次会话都要重新付摘要成本，记忆派把成本前置到记忆整理。

**追问三：profile 隔离能隔离到什么粒度？** 官方架构页的答案：\`hermes -p work\` 与 \`hermes -p personal\` 各有独立的 HERMES_HOME、配置、记忆、会话与网关 PID，可并发运行。它能隔离的是**数据与进程**，不是权限——两个 profile 若用同一个模型 API key，账单与配额仍然共享。所以 profile 隔离解决的是「工作记忆不混入个人记忆」，不是「企业凭据与个人凭据分离」；后者要走官方的凭据解析层（auth + credential pools，架构页的 provider runtime resolution 职责）。

三个追问合成一句话：记忆优先路线的成熟度不取决于「有没有记忆」，而取决于**记忆资产的治理面**——谁能写、谁能审、怎么回滚。Hermes 把记忆做成文件与配置项，至少让治理有了落点；评价任何同类系统（包括下一章的 Letta）时，把这个三追问当 checklist 用。
`,
    null,
    [
      {
        text: 'Hermes 官方宣称的学习闭环包含哪些机制？',
        options: [
          '只有长期记忆存储',
          'agent 自主管理记忆（含定期 nudge）、从经验自主创建技能、技能在使用中自我改进、FTS5 跨会话召回 + LLM 摘要、Honcho 辩证用户建模',
          '只有 RAG 检索',
          '只有微调更新权重',
        ],
        answer: 1,
        explain:
          '官方文档 Key Features：closed learning loop = Agent-curated memory with periodic nudges、autonomous skill creation、skill self-improvement during use、FTS5 cross-session recall with LLM summarization、Honcho dialectic user modeling。注意是过程记忆与技能文件，不改模型权重。',
        concept: 'h-hermes-memory-loop',
      },
      {
        text: 'Hermes 官方架构页里，工具体系的正确描述是？',
        options: [
          '固定 47 个工具',
          '中央工具注册表，70+ 注册工具、约 28 个 toolsets，每个工具文件 import 时自注册；终端 6 种内置后端 + 插件后端（如 Singularity）',
          '只有 bash 一个工具',
          '工具必须经 MCP 提供',
        ],
        answer: 1,
        explain:
          '官方架构页：registry 70+ tools / ~28 toolsets，import-time self-registration；终端后端 6 内置（local/Docker/SSH/Daytona/Modal/Vercel Sandbox）+ 插件。注意官方文档内部数字随页面快照漂移（40+/60+/70+），引用时给链接并标快照（本课快照 2026-11-15）。',
        concept: 'h-hermes-memory-loop',
      },
      {
        text: 'Hermes 的「Prompt stability」设计原则指什么？',
        options: [
          '提示词永远不改',
          '系统提示在会话中不变化——除显式用户操作（如 /model）外不做破坏缓存的修改，配合分层 prompt（stable→context→volatile）与 Anthropic 前缀缓存',
          '提示词加密存储',
          '禁止用户改配置',
        ],
        answer: 1,
        explain:
          '官方架构页设计原则第一条：Prompt stability——会话中系统提示不变，不做 cache-breaking mutations（显式用户动作除外）。这是它成本与延迟可控的基础。',
        concept: 'h-hermes-memory-loop',
      },
      {
        text: '关于 Hermes 的 profile（hermes -p <name>），官方描述是？',
        options: [
          '只是换皮肤',
          '每个 profile 有独立的 HERMES_HOME、配置、记忆、会话与网关 PID，多个 profile 可并发运行',
          '只能建一个',
          '是企业付费功能',
        ],
        answer: 1,
        explain:
          '官方架构页设计原则：Profile isolation——每个 profile 独立 HERMES_HOME/config/memory/sessions/gateway PID，可并发。这是把「个人 agent」与「工作 agent」安全隔开的机制。',
        concept: 'h-hermes-memory-loop',
      },
    ],
    [
      [
        '学习闭环',
        'Hermes 的核心卖点：经验 → 记忆固化 → 技能创建 → 技能自改进 → 跨会话召回的循环，全部发生在模型权重之外',
      ],
      [
        '分层系统提示',
        'stable（身份/工具指引/技能）→ context（上下文文件）→ volatile（记忆/画像/时间戳）的三层组装顺序',
      ],
      ['nudge', 'agent 定期被提醒整理与固化记忆的机制——记忆管理是 agent 自己的职责而非用户手动维护'],
    ],
    [
      '把 Hermes 的「学习」理解成模型微调——它的一切学习都发生在记忆、技能文件与提示层，模型权重不变',
      '引用单一工具数当永久事实——官方文档在 40+/60+/70+ 间随页面漂移，必须带快照日期与链接',
      '以为 TAOR 是官方术语——官方架构页的循环落在 conversation_loop.py / turn_*.py，「TAOR」只是第三方文章的命名，正文不用',
    ],
  ),
  'theory',
)
