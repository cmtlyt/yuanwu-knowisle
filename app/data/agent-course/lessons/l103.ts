import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 19 ========== */

export const L103 = withKind(
  L(
    'L103',
    19,
    'Mastra 核心概念：agent / workflow / memory / rag / observability',
    3,
    ['L93'],
    ['mastra-core'],
    [
      '说清五件套各自抽象了哪一层，以及它们替你还的债、泄漏时怎么绕',
      '理解 Mastra「TS 原生成套件」与 LangGraph（范式）/ OpenAI Agents（SDK）的形态差异',
      '建立「成套件 vs 拼装件」的选择判据，按你要几件而不是谁功能全',
    ],
    `
### 五个包一起装上，第三个逼我们降级另一个

第一次在团队里推 Mastra 是在一个 TS 后端项目上。我们想得很顺：agent 做客服、memory 记上下文、rag 接知识库、observability 看链路，五个全要。\`npm i\` 跑完，启动报错——\`@mastra/rag\` 要求 \`@mastra/core\` 降到某个次版本，而我们给 workflow 用的新 API 正好在那个次版本之上。

那一刻我才真正理解 Mastra 的卖点不是「五个功能」，而是**五个包共享同一套版本约束**。装上越多，被这把锁锁住的部分就越多：一处降级，你用新 core 写好的 workflow 要么重写、要么一起降；一个包有 CVE，你可能被迫动整条依赖链。

这个代价在「手写拼装」（L36 运行时 + L73 追踪 + 自己选向量库）里不会出现，因为你每个零件独立选型、独立升级。**所以成套件真正的账不在代码量，而在「绕行成本」**：抽象层数本身不是好坏，你被它限制住之后想换、想绕、想降级时有多难，才是。

### 五件套各自抽象了哪一层

| 包 | 抽象了哪一层 | 替你还的债 | 泄漏时怎么绕 |
|---|---|---|---|
| \`Agent\` | 角色配置（指令 + 模型 + 工具） | 手写一个配置对象 | 直接用原生 chat 接口调 |
| \`Workflow\` | 步骤与数据流（状态机） | 手写 \`switch\`/状态表 + 错误恢复 | 拆回普通 async 函数 |
| \`Memory\` | 对话历史的存取与裁剪 | 手写消息拼装（L91） | 自己管数组 + 摘要 |
| \`RAG\` | 检索增强的接入与切片 | 手写向量库 + 召回 + 重排 | 直接调向量库 SDK |
| \`Observability\` | 链路采集与导出 | 手写 span（L75） | 用 OpenTelemetry |

五个里抽象层数最深的不是 agent，是 \`Workflow\` 和 \`Memory\`——前者替你把「步骤之间的数据怎么传」也包了，后者替你把「上下文多长怎么裁」也包了。包得越深，泄漏时绕起来越费劲：workflow 状态卡死，你很难在不改图的前提下塞一个调试断点；memory 的裁剪策略不合你意，你可能得替换整个 memory 实现。

:::deep
### 抽象层数不是越少越好

一个有意思的反直觉：**层数多不代表慢，层数「不对齐」才致命**。

Mastra 的五个包是围绕「TS 原生、一体开发」对齐的：类型从 agent 一直贯通到 workflow 的 step 入参，IDE 补全能顺着点下去。这种对齐带来的收益，是「手写拼装」要花大量样板才能换来的。所以衡量一个成套件值不值，不是数它有几层，而是看这层**是不是正好落在你和模型之间的那道缝上**。

对多数应用，缝在「agent 配置」与「memory 存取」这两层，Mastra 的抽象刚刚好。缝在「workflow 要支持人在回路的动态分支」时，它的抽象就开始变成约束——因为 workflow 假设步骤是预先声明的，而人在回路意味着步骤可能运行时才出现（L71）。

判据写下来是：

- 你的流程是**声明式、步骤已知** → 用 workflow，抽象正好
- 你的流程要**运行时由模型决定下一步** → 那是 P&E（L42/L60），workflow 的抽象会挡路
- 你只是要一个会调工具的聊天 → 只用 Agent，其余四个包先不装
:::

### 只装你要用的两件，而不是全套

上面那次降级事故的根因是「一把梭装五个」。更稳的做法是先只装当前要用的两个包，再按依赖树决定升级顺序：

\`\`\`json title="先装两件，再看依赖树决定升级顺序" note="要点：不要 @mastra/core @mastra/memory @mastra/rag 一把梭；逐个装能立刻定位到『刚加的那一件』。"
{
  "dependencies": {
    "@mastra/core": "0.4.2",         // 先固定一个能跑的版本
    "@mastra/memory": "0.4.2"        // 只装这一件，验证通过再加下一件
    // "@mastra/rag": "0.4.2"        // 第二批再加，单独验证 peer 约束
  }
}
\`\`\`

逐个装的好处不是慢，是**出问题能立刻定位到「刚加的那一件」**。一把梭时五个包一起进来，peer 冲突的报错只告诉你「core 要降级」，不告诉你「是 rag 拖的」——你得自己拆开才能找到元凶。这正好印证了开头那句话：成套件的账在绕行成本，而「逐个装、逐个验证」是把这笔账摊薄到每加一件时立刻结清。

所以「按你要几件选」不是一句口号，它有一套可操作的动作：列清楚这次上线到底要 agent + memory 还是连 rag + obs 都要，只把清单上的装进来，其余包哪怕文档说「很方便」也先不碰。

### 与另两个框架的形态差异

L93 给过框架的三形态：范式型（图）、SDK 型（进程内库）、成套件型（生态）。Mastra 是第三种。

| 维度 | LangGraph（范式） | OpenAI Agents（SDK） | Mastra（成套件） |
|---|---|---|---|
| 运行时位置 | 有状态执行机 | 进程内库 | 进程内库 + 服务层 |
| 抽象单位 | 节点 / 边 / 状态 | Agent / run / handoff | agent / workflow / memory / rag / obs |
| 跨请求续跑 | 内建 checkpointer | 无（L100） | 无（同 SDK 形态） |
| 你被锁住的部分 | 图结构 | 概念模型 | 整条依赖链 + 版本 |
| 最适合 | 长任务、需断点 | 短任务、代码少 | TS 一站开发、要全套 |

关键差异在最后一行：**Mastra 把「服务」也包进来了**（它自带一个 server，能把 agent/workflow 暴露成 HTTP 端点）。这既是便利也是另一种锁——你不止在用一个库，你在用它定义的部署形态。

### 最小五件套（与手写版对照）

下面这段把所有抽象都摆出来，对照 L36（手写运行时）、L91（手写 memory 裁剪）、L75（手写 span）看，差异很直观：手写版每一行都是你自己写的，Mastra 版每一行都是「声明一下让框架替你做」。

\`\`\`ts title="Mastra 五件套最小可运行骨架" note="要点：Agent/Workflow/Memory/RAG/Obs 五个 import 来自不同子包，共享同一套类型；这既是便利也是版本约束的来源。"
import { Agent } from '@mastra/core/agent'
import { Workflow, step } from '@mastra/core/workflows'
import { Memory } from '@mastra/memory'
import { MDocument } from '@mastra/rag'
import { Metrics } from '@mastra/core/observability'

// ① Agent：角色配置
const agent = new Agent({
  name: 'support',
  instructions: '你是客服，先查知识库再回答，禁止编造。',
  model: MODEL_ID, // 带快照日期，禁止 latest（L95）
  tools: [lookupOrder],
})

// ② Memory：对话历史存取（替你还 L91 的裁剪债）
const memory = new Memory({ /* 窗口策略、摘要策略在此声明 */ })

// ③ Workflow：步骤与数据流（替你还状态机的债）
const wf = new Workflow({ name: 'onboard' })
  .step(step({ name: 'verify', run: async () => ({ ok: true }) }))
  .step(step({ name: 'provision', run: async () => ({ id: 'u_1' }) }))
wf.commit()

// ④ RAG：检索增强（替你还向量库接入的债）
const doc = MDocument.fromText('退货政策：7 天内未拆封可退。')
const chunks = await doc.chunk()
await embedAndStore(chunks)

// ⑤ Observability：链路采集（替你还 L75 手写 span 的债）
const metrics = new Metrics({ /* 导出到 OTLP 或平台 */ })
metrics.track(agent) // 一条声明，agent 的每次调用都被采集
\`\`\`

\`\`\`ts title="Memory 的窗口与摘要策略声明" note="要点：memory 把 L91 的裁剪债收成配置；策略不合你意时这块就是你要绕的抽象层。"
const memory = new Memory({
  options: {
    lastMessages: 20,             // 保留最近 20 条原文
    semanticRecall: { topK: 3 },  // 语义召回最近的 3 段
    workingMemory: { enabled: true },
  },
})
\`\`\`

注意第五段 \`metrics.track(agent)\`：这一行就等价于 L75 里我们手写的 Tracer + 中间件。**代价是粒度与字段由框架决定**（L99 同款问题）——你想加一个自定义 span 属性时，得看框架给不给你钩子，而不是像手写版那样随手加。

:::warn
### 三个必踩的坑

- **装全套不问版本**。表现是 \`npm i\` 后启动报 peer 冲突，卡在某个包要求 core 降级。解法是先只装你要用的那两个包，再按依赖树决定升级顺序，而不是 \`i @mastra/core @mastra/memory @mastra/rag\` 一把梭。
- **把 Workflow 当 P&E 用**。表现是步骤里塞 \`if (模型说下一步是 X)\` 这种运行时分支，然后发现 workflow 的 step 必须预先声明、数据靠编译期类型贯通。需求是动态规划就该用 P&E（L42），workflow 的抽象会挡路。
- **以为 Obs 开了就有用**。表现是链路里只有 agent 级 span、看不到工具内部；或者数据默认发到平台、区域/保留期没确认（L99/L102）。开了不等于能定位问题，必须按 L99 的三项验证查一次。
:::

### 与相邻课的分工

- **L93** 给框架三形态与运行时位置，本课把 Mastra 定位在「成套件」这一形态。
- **L96 / L100** 是另两个框架的专论；本课只讲 Mastra 的五个包，不做三方度量对照（对照在 L104/L105 内部做）。
- **L91 / L75 / L36** 是本课五个包各自的手写对照基线，本课只讲「声明化之后省了什么、被锁了什么」。
`,
    null,
    [
      {
        text: 'Mastra 这类成套件真正的账在哪？',
        options: [
          '代码写得比手写多',
          '被整条依赖链与版本约束锁住，想换想绕想降级都更难',
          '运行速度明显更慢',
          '只能用于单 Agent',
        ],
        answer: 1,
        explain: '抽象层数不是好坏，绕行成本才是。五个包共享版本约束，一处降级可能牵连整条链。',
        concept: 'mastra-core',
      },
      {
        text: 'Workflow 与 P&E（计划执行）的本质区别是？',
        options: [
          'Workflow 更快',
          'Workflow 是声明式步骤与数据流，P&E 的下一步由模型运行时决定',
          'P&E 不能调工具',
          '两者完全一样',
        ],
        answer: 1,
        explain: '需求是动态规划（下一步由模型决定）就该用 P&E，workflow 的 step 必须预先声明会挡路。',
        concept: 'mastra-core',
      },
      {
        text: 'Mastra 的 Observability 开了之后，最该立刻做的一件事是？',
        options: [
          '什么都不用做',
          '按 L99 的三项验证查一次：层级/截断/归因与数据去向',
          '关掉它省资源',
          '只保留 agent 级 span',
        ],
        answer: 1,
        explain: '开了不等于能定位问题，粒度与字段由框架决定，且数据可能默认外发，必须主动验证。',
        concept: 'mastra-core',
      },
      {
        text: '下列哪种做法最符合「成套件 vs 拼装件」的选择判据？',
        options: [
          '谁功能全就用谁',
          '按「你要几件」选：只聊天就只用 Agent，其余先不装',
          '永远装全套最省心',
          '抽象层数越少越好',
        ],
        answer: 1,
        explain: '选判据是「你要几件」而非「谁功能全」；装全套等于把整条依赖链一次性锁死。',
        concept: 'mastra-core',
      },
    ],
    [
      ['成套件（suite）', '把 agent/workflow/memory/rag/obs 打包在一起的框架形态，与前两框架相对'],
      ['抽象层数', '从业务代码到模型调用之间隔了几层；好坏看绕行成本而非层数本身'],
      ['WorkFlow', '声明式步骤与数据流，step 需预先声明，与 P&E 的运行时规划相反'],
      ['Memory / RAG', '分别替你还上下文裁剪债与向量库接入债，代价是策略不合时难绕'],
      ['Observability', '声明式链路采集；粒度与字段由框架决定，数据可能默认外发'],
    ],
    [
      '装全套不问版本，npm i 后 peer 冲突卡在 core 降级。',
      '把 Workflow 当 P&E 用，运行时分支塞进 step，发现 step 必须预先声明。',
      '以为 Obs 开了就有用，结果只有 agent 级 span 或数据默认外发。',
      '五个包共享版本约束，一处 CVE 被迫动整条依赖链。',
    ],
  ),
  'framework',
)
