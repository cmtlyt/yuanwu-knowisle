import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 22 ========== */

export const L115 = withKind(
  L(
    'L115',
    22,
    'Python 生态对照：AutoGen / CrewAI 的架构思路（不写 Python）',
    1,
    ['L112'],
    ['python-ecosystem'],
    [
      '理解 Python 多 Agent 生态（AutoGen / CrewAI）的核心架构思想',
      '掌握「取架构思想、在目标语言重实现」的跨语言借鉴方法，而不是引入 Python 依赖',
      '用 TS 各复现一个最小示例，验证思想可迁移',
    ],
    `
### 我们想学的是思想，不是依赖

项目是 TS 栈，但 Python 侧的多 Agent 生态（AutoGen 的群聊、CrewAI 的角色编排）有几个想法确实比当时 TS 侧成熟。第一反应是「引个 Python 服务进来」——这会把跨语言调用、部署、版本对齐的债全背上来。后来我们改了思路：**只借架构思想，用 TS 重实现，不引 Python 依赖**。这一节就讲两个最值得借的思想，以及怎么在 TS 里落地。

### 思想一：群聊（AutoGen 的 GroupChat）

AutoGen 的核心是「多个 agent 在同一个对话里轮流发言，由一个主持人决定下一句谁说」。这本质是 L66「多 Agent 对话协议」的一种具体编排——把「谁接话」从硬编码路由变成「主持人 + 可见对话历史」。

\`\`\`ts title="用 TS 复现 GroupChat（不写 Python）" note="要点：主持人在每轮看历史决定下一个发言者；思想可迁移，实现用 TS 现有 LLM 调用。"
type Speaker = { name: string; system: string }
const speakers: Speaker[] = [
  { name: 'planner', system: '你拆解任务并分派' },
  { name: 'coder', system: '你写代码' },
  { name: 'reviewer', system: '你审查并指出问题' },
]

async function groupChat(question: string, maxRounds = 6) {
  const history: { role: string; content: string }[] = [{ role: 'user', content: question }]
  for (let i = 0; i < maxRounds; i++) {
    const next = await pickNextSpeaker(history, speakers) // 主持人：看历史决定下一个
    const reply = await chat({ system: next.system, history })
    history.push({ role: next.name, content: reply })
    if (reply.includes('[DONE]')) break
  }
  return history
}
\`\`\`

这段和 L67 的对话协议是同一个问题的两种解法：AutoGen 用「主持人看历史」，L67 用「显式路由表」。借的是「轮转 + 可见历史」这个思想，代码全是我们自己的——**没有一行 Python**。

### 思想二：角色编排（CrewAI 的 Crew）

CrewAI 的核心是「给每个 agent 一个角色与工具，规定一个协作流程（顺序 / 层级），让 Crew 像团队一样把任务跑完」。这本质是 L69「编排选型」里「固定流程用顺序、动态用 supervisor」的另一种表达。

\`\`\`ts title="用 TS 复现 Crew 角色编排（不写 Python）" note="要点：角色=system+tools，流程=显式顺序；复用 L42 的 tool 调用与 L69 的编排思路。"
type Agent = { role: string; system: string; tools: Tool[] }
const crew: Agent[] = [
  { role: 'researcher', system: '只做检索汇总', tools: [search] },
  { role: 'writer', system: '基于检索结果写稿', tools: [draft] },
  { role: 'editor', system: '审校并定稿', tools: [polish] },
]

async function runCrew(task: string) {
  let ctx = task
  for (const a of crew) ctx = await runAgent(a, ctx) // 顺序流程：角色接力
  return ctx
}
\`\`\`

注意这里用的是 L42 的 \`runAgent\`（工具调用）和 L69 的「顺序流程」——**CrewAI 给我们的是编排形态的语言（role / crew / flow），不是新能力**。一旦看清这一点，它就不是「要引入的框架」，而是「可以照着写的模式」。

### 两个思想的对照

| 思想 | 解决什么 | 对应本课前面的内容 | TS 落地要点 |
|---|---|---|---|
| GroupChat（轮转 + 历史） | 谁接话动态不定 | L66 多 Agent / L67 对话协议 | 主持人看历史选发言者 |
| Crew（角色 + 流程） | 任务要多人接力 | L69 编排选型 | 角色=system+tools，流程=顺序/层级 |

:::deep
### 为什么「取思想不取依赖」几乎总是更优

跨语言引依赖有三笔常被低估的债：部署要维护两套运行时、调试要跨进程追、版本对齐要在两边同步。而大多数 Python 多 Agent 的「新思想」，落地到 TS 往往只是「一个循环 + 一段路由」——也就是上面那两段代码。

所以借鉴的正确姿势是：**先问「它解决的是哪类问题、对应我已有的哪个模式」**，找到对应（GroupChat→L67、Crew→L69）后，用自己栈里已有的能力实现。只有当某个能力 TS 侧真的没有（比如某个独有推理优化）时，才考虑引依赖，且最好隔离成独立服务而非混入主栈。这也呼应 L112 矩阵里的「抽象层数 / 生态绑定」维度：借思想是零绑定，引依赖是重绑定。
:::

:::warn
### 两个必踩的坑

- **以为「借鉴 Python 生态」就必须引 Python**。表现是硬塞一个 Python 微服务，只为用某个编排 API，背上双运行时维护债。先问「这思想用自己栈能不能写」，答案通常是能。
- **照抄 Python API 而不是迁移思想**。表现是试图在 TS 里 1:1 复刻 AutoGen 的类结构，而不是提取「轮转 + 主持人」这个模式。照抄把别人框架的抽象成本也搬过来了，却没拿到它的生态。
:::

### TS 落地时的三个注意点

借思想用 TS 重实现，有三个坑比「写不出来」更常见：

1. **别照抄类名**：AutoGen 的 \`GroupChat\`、CrewAI 的 \`Crew\` 是它们的抽象命名，搬到 TS 也起同名类，会把它们的抽象成本一起搬来。我们上面用的是 \`groupChat\` / \`runCrew\` 这种和自己栈一致的命名——思想在，包袱不在。
2. **复用已有能力而非新建**：\`chat()\` 用 L36 的运行时、\`runAgent\` 用 L42 的工具调用、流程用 L69 的编排。多数「新思想」落地只是把已有零件换种接法，不该引出新依赖。
3. **给主持人/流程加边界**：群聊容易无限轮转，必须像上面那样有 \`maxRounds\` 和 \`[DONE]\` 终止；Crew 的顺序流程要能在任一步失败时不污染后续。这些边界是生产必需，借思想时一并借来。

### 完整一点的 GroupChat 主持人

前面的 \`pickNextSpeaker\` 只写了签名。真实主持人要判断「是不是该结束了、该谁接、有没有跑偏」，它本身就是个小 agent：

\`\`\`ts title="主持人：看历史决定下一句（补全）" note="要点：主持人读完整历史输出下一个发言者；这是 GroupChat 的核心，也是它比硬编码路由灵活的地方。"
async function pickNextSpeaker(history: { role: string; content: string }[], speakers: Speaker[]) {
  const decision = await chat({
    system: '你是主持人。根据对话历史，从候选里选下一个发言者，或输出 [DONE] 结束。',
    messages: [...history, { role: 'system', content: '候选：' + speakers.map((s) => s.name).join(', ') }],
  })
  if (decision.includes('[DONE]')) return null
  return speakers.find((s) => decision.includes(s.name)) ?? speakers[0]
}
\`\`\`

这段没有任何 Python，却完整复现了 GroupChat 的灵魂：**把「谁接话」从静态路由变成「看上下文的动态决策」**——这正是 L67 对话协议想解决的核心问题，只是换了个生态的说法。

### 什么不该借

不是 Python 生态的一切都该搬。两类要警惕：

- **依赖特定推理优化的「黑盒能力」**：某些框架的强项是背后某个模型/服务的独有能力，思想可学、能力不可学。这种情况要么接受「TS 侧没有」，要么隔离成独立服务调用，而不是试图在 TS 里复刻。
- **过度封装的「便捷语法糖」**：比如把多步流程压成一行的 DSL。它省的是作者写的字，不是你理解的成本，迁过来只会增加团队学习债。

:::deep
### 借鉴的边界一句话

**借「编排形态」不借「依赖」，借「决策结构」不借「实现细节」。** GroupChat 值得借的是「动态主持人」这个结构，Crew 值得借的是「角色 + 流程」这个结构；至于它们用什么类、什么装饰器、什么配置键，一概不借。这恰好呼应 L112 矩阵里的「抽象层数 / 生态绑定」维度——借思想是零绑定，照抄依赖是重绑定，后者在跨语言场景里代价尤其高。
:::

借完之后还要能验。一个可操作的自检是：把借来的形态写成一张「状态 + 决策规则」表——GroupChat 的状态是「当前发言者、剩余轮次、已发言集合」，规则是「主持人依据什么选下一位、什么条件结束」。写不出来，说明你只抄了个类名，并没理解那个结构。写出来之后先用 L95 的确定性假模型把每条分支跑通（谁连续发言两次、无人可发言、达到轮次上限），再换真模型验质量；顺序反了，模型的随机性会把结构缺陷盖住，你会误以为「思想已经搬过来了」。

### 与相邻课的分工

- **L66 / L67** 是多 Agent 与对话协议基线，本课的 GroupChat 是它们的另一种编排形态。
- **L69** 是编排选型，本课的 Crew 顺序流程直接复用它的结论。
- **L112** 矩阵里的「生态绑定」维度，是本课「取思想不取依赖」的理论依据。
`,
    null,
    [
      {
        text: '「借鉴 Python 多 Agent 生态」最推荐的做法是？',
        options: [
          '直接引 Python 依赖进来',
          '取架构思想、在目标语言用已有能力重实现，不引依赖',
          '完全无视 Python 生态',
          '把 Python 代码逐行翻译',
        ],
        answer: 1,
        explain: '思想是零绑定；多数新思想落地只是「循环+路由」，自己栈能写就别引双运行时债。',
        concept: 'python-ecosystem',
      },
      {
        text: 'AutoGen 的 GroupChat 对应本课前面的哪块内容？',
        options: [
          '单 Agent 运行时（L36）',
          '多 Agent 对话协议（L66/L67）',
          'RAG 检索（L49）',
          '向量索引（L108）',
        ],
        answer: 1,
        explain: 'GroupChat 是「轮转 + 可见历史」的编排，与 L67 对话协议是同一问题两种解法。',
        concept: 'python-ecosystem',
      },
      {
        text: 'CrewAI 的 Crew 本质是？',
        options: [
          '全新的推理能力',
          '角色=system+tools、流程=顺序/层级，对应 L69 编排选型',
          '一个向量数据库',
          '一种流式输出协议',
        ],
        answer: 1,
        explain: '它给的是编排形态的语言（role/crew/flow），不是新能力；复用 L42 tool 调用与 L69 编排。',
        concept: 'python-ecosystem',
      },
      {
        text: '下列哪种做法最该避免？',
        options: [
          '先问「它对应我已有的哪个模式」再实现',
          '为用某个编排 API 硬塞 Python 微服务，背双运行时债',
          '用 TS 复现轮转 + 主持人',
          '把思想当零绑定借鉴',
        ],
        answer: 1,
        explain: '跨语言引依赖的部署/调试/版本三笔债常被低估；多数思想自己栈能写。',
        concept: 'python-ecosystem',
      },
    ],
    [
      ['GroupChat', '多 agent 轮转发言 + 主持人看历史决定下一句；对应 L67 对话协议'],
      ['Crew', '角色=system+tools、流程=顺序/层级；复用 L42 与 L69'],
      ['取思想不取依赖', '借鉴零绑定；引依赖是重绑定，除非能力 TS 侧真缺'],
      ['对照', 'GroupChat→动态接话，Crew→任务接力，各对应前面已有模式'],
    ],
    [
      '以为借鉴就必须引 Python，背双运行时维护债。',
      '照抄 Python API 而非迁移思想，搬来别人框架的抽象成本。',
      '不分清「思想」与「能力」，为已有能力硬引依赖。',
      '忽略 L112 矩阵「生态绑定」维度，低估跨语言债。',
    ],
  ),
  'framework',
)
