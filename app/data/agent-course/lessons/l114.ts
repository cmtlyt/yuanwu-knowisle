import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 22 ========== */

export const L114 = withKind(
  L(
    'L114',
    22,
    '综合对照：用 4 种框架各实现同一个 Agent 并对比',
    3,
    ['L112'],
    ['framework-benchmark'],
    [
      '用 LangGraph / OpenAI Agents / Mastra / Vercel AI SDK 各实现同一个「天气查询 + 工具调用」Agent',
      '从多个维度对照四种实现，而非只比「代码行数」',
      '识别「只比代码量」会漏掉的可控性与需求匹配度',
    ],
    `
### 同一个需求，四种写法，差异不在行数

选框架时最容易陷入的误区是「谁写起来短用谁」。我们用同一个需求——「用户问城市天气，Agent 调一个天气工具回答」——分别用四个框架实现，再横向比。结论先放这：**代码最短的那个，在「要加一步人工确认」时改起来最贵。** 长度和能力是两条独立的轴。

### 四个框架的实现

LangGraph（图，状态在节点间流转）：

\`\`\`ts title="LangGraph 版" note="要点：plan/tool/answer 三个节点 + 条件边；状态显式，加一步只需加一个节点。"
import { StateGraph } from '@langchain/langgraph'

const g = new StateGraph({ channels: { input: '', output: '' } })
  .addNode('plan', planNode)
  .addNode('tool', weatherToolNode)
  .addNode('answer', answerNode)
  .addEdge('plan', 'tool')
  .addEdge('tool', 'answer')
const app = g.compile()
await app.invoke({ input: '北京天气？' })
\`\`\`

OpenAI Agents（进程内循环，代码最短）：

\`\`\`ts title="OpenAI Agents 版" note="要点：Agent + run 内建循环；最短，但跨请求续跑要自己管（L100）。"
import { Agent, run, tool } from '@openai/agents'

const weatherAgent = new Agent({
  name: 'weather',
  instructions: '用天气工具回答',
  tools: [weatherTool],
})
await run(weatherAgent, '北京天气？', { maxTurns: 4 })
\`\`\`

Mastra（成套件，声明式）：

\`\`\`ts title="Mastra 版" note="要点：Agent + 工具声明即服务；最「产品化」，但生态绑定最重（L103）。"
import { Agent } from '@mastra/core/agent'

const mAgent = new Agent({
  name: 'weather',
  instructions: '用天气工具回答',
  tools: [weatherTool],
})
await mAgent.generate('北京天气？') // 自带 obs / 服务层
\`\`\`

Vercel AI SDK（只调模型，最薄）：

\`\`\`ts title="Vercel AI SDK 版" note="要点：generateText + tool 声明；不管循环不管状态，最贴合「只调模型」（L106）。"
import { generateText } from 'ai'

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: '北京天气？',
  tools: { weather: { description: '查天气', parameters: z.object({ city: z.string() }), execute: getWeather } },
})
\`\`\`

### 多维度对照

| 维度 | LangGraph | OpenAI Agents | Mastra | AI SDK |
|---|---|---|---|---|
| 代码量 | 多 | 最少 | 少 | 中 |
| 加一步人工确认 | 加节点 | 套状态机 | 改 workflow | 自己写循环 |
| 跨请求续跑 | 内建 checkpoint | 无 | 无 | 无 |
| 生态绑定 | 中 | 低 | 重 | 最轻 |
| 调试可见性 | 节点级 | 循环级 | 黑盒（服务层） | 自己控制 |

关键看「加一步人工确认」那一行：代码最短的 OpenAI Agents 要在 \`run()\` 外再套一层业务状态机才能挂确认（L100 已讲），而 LangGraph 加一个节点就行。**代码短 ≠ 改起来简单**，因为「短」来自框架替你藏了循环，藏起来的那部分恰恰是你日后要改的部分。

:::deep
### 「只比代码量」漏掉了什么

长度这个维度太容易被量化，所以被过度依赖。它至少漏掉三件事：

- **可控性**：代码短往往因为框架接管了控制流（循环 / 状态 / 重试）。接管得越多，你日后想微调那部分越难。L113 说的「重抽象」就是这里。
- **需求匹配度**：你的需求真落在它的甜区吗？L112 矩阵说的——短代码的框架可能根本不在你的甜区，省下的行数在第一次需求偏移时就加倍奉还。
- **失败可逆性**：选错了重写的成本。薄封装（AI SDK）弃起来几行；成套件（Mastra）弃起来要动依赖链。这维度最难量化，却最该问。

所以正确对比姿势是：**先用 L112 矩阵 narrow down 到 2 个候选，再用本课的「加一步」「续跑」「生态绑定」三行做差异分析，最后用 L94 实测验证**。代码量只是入场券，不是评判标准。
:::

:::warn
### 两个必踩的坑

- **只比代码行数选框架**。表现是选了最短的，结果第一次需求加「调用前人工确认」时发现要重写控制流，成本反超。比长度更要比「变化成本」。
- **拿「演示代码」当「生产代码」比**。演示里四个都短；生产里要加超时、重试、取消、审计、降级，这些在四个框架里的成本天差地别。对比要基于你会真实写的那版，不是 README 示例。
:::

### 生产化改造：示例到可用的真实差距

上面四个都是「能跑」的演示版。真实生产要在每个实现上加超时、重试、取消、审计、降级——这些在四框架里的成本天差地别，正是 L94 强调「对比要基于真实会写的版本」的原因。把 AI SDK 版生产化看看要加多少：

\`\`\`ts title="生产化：超时 + 重试 + 审计" note="要点：这些胶水每框架都要写但接法不同；公平对比要把这一段算进去，而非只看示例行数。"
const result = streamText({
  model: openai('gpt-4o-mini'),
  prompt: q,
  tools: { weather },
  maxSteps: 4,                              // 限制工具轮次，等价于手写 MAX
  abortSignal: AbortSignal.timeout(8000),   // 单次超时（L36 手写同款）
  onStepFinish: (s) => audit('weather.step', s), // 审计（L73 同款）
})
for await (const d of result.textStream) ui.append(d)
if (await result.isAborted) fallbackToCache(q)  // 降级
\`\`\`

同样的生产化在 LangGraph 要动节点里的 try/catch 与 checkpointer 配置，在 OpenAI Agents 要在 \`run()\` 外包状态机。**加的东西差不多，但「加在哪、谁来管」完全不同**：AI SDK 把超时/重试暴露成参数，LangGraph 把续跑藏进 checkpointer，Agents 要求你自己在循环外管。这正是只比示例行数会漏掉的成本——演示里 AI SDK 最短，生产化后它的「短」其实是你把超时重试写在了外面，而 LangGraph 自带了一部分。公平的对比必须把这层算进去。

### 决策：四框架怎么选

把前面所有维度收成一张可操作的决策表：

| 如果你的需求… | 优先 | 理由 |
|---|---|---|
| 只调模型、无循环 | Vercel AI SDK | 边界最小、最薄 |
| 进程内短任务、代码要短 | OpenAI Agents | run() 内建循环 |
| TS 一站开发、要服务层 | Mastra | 成套件省拼装 |
| 多步骤、要动态决策 | P&E / LangGraph 节点 | 控制流可见 |
| 要断点续跑的长任务 | LangGraph | 唯一内建 checkpoint |
| 多组件线性管线 | LangChain | pipe 组合顺手 |

这张表不是「谁最好」，是「谁在你的甜区」。它和 L112 矩阵是同一句话的两面：矩阵给维度，这张表给路径。两者都指向同一个结论——**选型的第一步是定位需求落在哪个框架的甜区，而不是挑功能最多的**。

:::deep
### 为什么「同一需求四实现」值得写四遍

这一节的写法看似冗余：同一个天气 Agent 写四遍。但它的教学价值正在「冗余」里——把四个框架并排放，差异从「文档里的形容词」变成「代码里的具体结构」：循环在哪、状态在哪、重试谁管。只读单框架专论（L96–L110）你看到的是「它怎么做」，读这四遍对照你看到的是「它们为什么不一样」。

这也解释了为什么模块七要「先专论、后对比」：没有前面的单点认知，对比就没有锚点；没有后面的横向收口，单点认知容易变成「我只会这一个」。L112 给维度、L113 给反面（何时弃）、L114 给实例、L115 给跨语言视角——四课合起来才是一个完整的「框架素养」，而不是「又会四个 API」。
:::

### 四版里真正没变的东西

把四份代码叠起来看，会发现变的只有「循环怎么组织、状态放哪、谁管重试」，四项业务契约一个字都没改：工具的输入输出 schema、退出条件（拿到答案或触到 \`maxTurns\`）、幂等键、以及评测用的那 30 条用例。这不是巧合，而是判断一个框架是否侵入业务的好办法——**如果换框架必须改这四项，说明耦合已经越过编排层，钻进领域逻辑了**。

所以做四实现对照时要锁死这四项，再让框架差异自由显现；否则你量到的「框架 A 通过率更高」很可能只是 A 版顺手改了退出条件。度量口径也一并固定：同一评测集跑三次取中位数、剔除每轮第一次调用的冷启动、超时与重试上限四版完全一致。这正是 L94「五锁」在具体场景里的落地：不锁住业务契约，对照实验就没有归因资格。

### 与相邻课的分工

- **L112** 给矩阵（横向维度），本课给同一需求的四个实现（纵向实例）。
- **L94** 的对照实验可用于「四实现」的实测对比，而非只比代码。
- **L113** 是「什么时候弃框架」，本课是「怎么比才公平」。
`,
    null,
    [
      {
        text: '四个框架实现同一需求，最该比的维度是？',
        options: ['代码行数', '变化成本（加一步/续跑/生态绑定）+ 需求匹配度', 'GitHub star 数', '文档页数'],
        answer: 1,
        explain: '代码短常因框架藏了控制流，藏起来的部分恰是你日后要改的；比长度更要比变化成本。',
        concept: 'framework-benchmark',
      },
      {
        text: '「只比代码量」最会漏掉哪类信息？',
        options: ['功能多少', '可控性 / 需求匹配度 / 失败可逆性', '运行速度', '包体积'],
        answer: 1,
        explain: '长度易量化被过度依赖；它漏掉控制流被接管程度、甜区匹配与重写成本三件要事。',
        concept: 'framework-benchmark',
      },
      {
        text: '四个实现里，加「调用前人工确认」最贵的是哪个？',
        options: [
          'LangGraph（加节点即可）',
          'OpenAI Agents（最短，但要在 run 外套状态机）',
          'Mastra',
          'AI SDK',
        ],
        answer: 1,
        explain: '最短的代码把循环藏进 run()，加确认要自己重建控制流，变化成本最高。',
        concept: 'framework-benchmark',
      },
      {
        text: '公平的框架对比应该基于什么？',
        options: [
          'README 示例代码的行数',
          '你会真实写的生产版（含超时/重试/审计/降级）',
          '官方 benchmark',
          '社区热度',
        ],
        answer: 1,
        explain: '演示都短；生产要的胶水在四框架成本天差地别，对比要基于真实会写的版本。',
        concept: 'framework-benchmark',
      },
    ],
    [
      ['同一需求四写法', 'LangGraph 图 / Agents 循环 / Mastra 声明 / AI SDK 薄调用'],
      ['变化成本', '加一步/续跑/生态绑定的改动代价，比代码量更该比'],
      ['只比行数漏三事', '可控性 / 需求匹配度 / 失败可逆性'],
      ['对比基础', '基于真实生产版而非 README 示例'],
    ],
    [
      '只比代码行数选框架，加确认时发现要重写控制流。',
      '拿 README 演示当生产代码比，结论失真。',
      '忽视需求匹配度，短代码框架不在自己甜区。',
      '以为最短即最简单，忽略藏起来的控制流。',
    ],
  ),
  'framework',
)
