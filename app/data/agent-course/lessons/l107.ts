import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 20 ========== */

export const L107 = withKind(
  L(
    'L107',
    20,
    '对照：用 AI SDK 重写工具调用 + 流式 + 模型路由（对比 L42 / L89）',
    3,
    ['L106', 'L42', 'L89'],
    ['ai-sdk-rewrite'],
    [
      '用 AI SDK 重写工具调用、流式输出、模型路由，并给出与 L42 / L89 的度量对照',
      '理解 provider 抽象如何让「模型路由」退化成「换一个字符串参数」',
      '认识这种重写省了什么、又在哪些地方锁住了你',
    ],
    `
### 200 行手写运行时，重写后 40 行

L42 那一章我们手写的 function-calling 运行时，到我接生产时已经滚到 200 多行：拼请求体、解析 tool_calls、按名字分发到工具函数、把结果回填、再判是否继续。同一段逻辑，用 AI SDK 重写后大概 40 行——因为「拼请求 / 解析 / 分发 / 回填」这四件最重复的事，\`generateText\` 全替你做了。

但重写最让我意外的是第三件事：**模型路由**（L89）也变得不一样了。L89 里路由是一套「判难度 → 选档位 → 拼不同供应商的请求」的逻辑；用 provider 抽象之后，路由退化成「换一个字符串参数」。这一节就围绕这三段对照展开。

### 对照一：工具调用（vs L42 手写 FC 运行时）

| 维度 | L42 手写运行时 | AI SDK 重写 |
|---|---|---|
| 请求构造 | 手写 JSON（model / messages / tools） | \`generateText({ model, tools, prompt })\` |
| tool_calls 解析 | 手写 \`JSON.parse\` + 字段判断 | SDK 内部解析，\`toolCalls\` 直接可用 |
| 工具分发 | 手写 \`switch(name)\` 路由到函数 | \`execute\` 写在工具声明里 |
| 回填 | 手写拼 \`tool\` 消息再调一次 | SDK 自动回填、自动决定是否继续 |
| 你仍要写的 | 工具实现本身 | 同左（这块省不掉） |

注意最后一行：**工具的实现逻辑省不掉**。SDK 替你省的是「胶水」，不是「业务」。如果一个工具要查库、要调第三方，那段代码原样保留，只是不再被那 200 行运行时包着。

\`\`\`ts title="工具调用重写（对比 L42 手写）" note="要点：tools 里 execute 写业务，分发/回填/续跑由 SDK 接管；你只声明不调度。"
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

const { text, toolCalls } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: '把订单 A1001 标记为已发货。',
  tools: {
    markShipped: {
      description: '标记订单已发货',
      parameters: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => db.orders.markShipped(orderId), // 业务在这
    },
  },
})
// toolCalls 已解析好，无需手写 JSON.parse 与 switch 分发
\`\`\`

### 对照二：流式输出（vs 手写 SSE / 分块拼接）

手写流式要把模型的 SSE 流逐块读出来、拼成完整文本、再决定什么时候算「结束」。AI SDK 把它收成 \`textStream\` 这个异步迭代器，你 \`for await\` 拿增量即可。

\`\`\`ts title="流式重写（对比手写分块拼接）" note="要点：streamText 返回的 textStream 是可迭代增量；partialObjectStream 还能流式吐结构化结果。"
const result = streamText({ model: openai('gpt-4o-mini'), prompt: '逐条解释退货政策' })
for await (const delta of result.textStream) {
  ui.append(delta) // 前端边收边渲染，无需自己拼块
}
\`\`\`

这里省的是「流的生命周期管理」：什么时候 flush、怎么处理中断、怎么把增量和最终文本对齐。这些在 L62 那种手写实现里都要自己处理，SDK 接管后基本不用想。

### 对照三：模型路由（vs L89 手写路由）

L89 的路由逻辑要「判难度 → 选档位 → 拼对应供应商的请求体」。用 provider 抽象后，**路由只剩选哪个 provider + 哪个模型名**：

\`\`\`ts title="路由退化成换字符串（对比 L89）" note="要点：路由不再是『拼不同请求体』，而是选 provider 与 model 两个参数；难度判定逻辑可原样复用。"
import { openai, anthropic } from '@ai-sdk/*'

function pickProvider(tier: 'cheap' | 'smart') {
  return tier === 'cheap' ? openai('gpt-4o-mini') : anthropic('claude-3-5-sonnet')
}

const model = pickProvider(decideTier(userText)) // decideTier 即 L89 的难度判据
const { text } = await generateText({ model, prompt: userText })
\`\`\`

L89 里那个「误路由盈亏平衡点 p≈0.21」的结论仍然成立——**选错模型的代价没变**，变的只是「切换模型」这个动作从几十行请求构造变成了一行参数。判定该用哪档的逻辑（L89 的判据）一个字没少，因为它属于「决策」不属于「胶水」。

:::deep
### 这种重写省了什么、锁了什么

三段对照合起来看，规律很清楚：

- **省的是「胶水」**：请求构造、响应解析、工具分发、回填、流生命周期——这些与「你到底要模型做什么」无关，纯属接入成本。
- **锁的是「供应商能力差异」**：provider 抽象统一的是「调用形态」，统一不了「能力」。某家独有的功能（比如某个工具的特定行为、某个输出模式）在另一家 provider 上可能不支持。一旦你的代码依赖了某家的独有能力，换 provider 就不是换字符串那么简单了。
- **没动的是「决策」**：难度判据（L89）、工具业务（L42）、要说什么（prompt）——这些 SDK 一律不碰。

所以 AI SDK 重写最适合「标准调模型」的场景。如果你的需求触碰到某家独有 API，抽象层会在那一处「漏水」，你还是得为那一家写特例。这跟 Mastra「成套件」的锁定同源，只是范围小得多——它只锁模型交互那一层。
:::

:::warn
### 三个必踩的坑

- **以为路由变成了零成本**。表现是代码里到处 \`openai('gpt-4o')\`，换 anthropic 时才发现某段用了 openai 独有参数，编译不报错运行才塌。解法是把 \`decideTier\` 与 provider 选择收口到一个函数（如上），别在业务里散落模型名。
- **依赖 provider 独有能力却不自知**。表现是「在 A 家跑得好好的，切 B 家某项崩了」。写工具时先用标准能力，独有功能单独隔离并标注依赖哪家。
- **把 \`generateText\` 当流式用**。表现是想要逐字输出却拿了完整 \`text\` 一次性渲染，用户等半天。要流式就必须 \`streamText\` + \`textStream\`，两者返回形态不同（L106 已讲）。
:::

### 对照四：结构化抽取（vs 手写 JSON.parse）

L42 那种手写版如果要从模型拿结构化数据，得让它吐 JSON 文本，再 \`JSON.parse\` + 手写字段校验（而且永远要防它吐出不是 JSON 的东西）。AI SDK 用 \`generateObject\` 把这件事也收了：

\`\`\`ts title="结构化抽取重写（对比手写解析）" note="要点：schema 同时是类型与校验；返回对象而非字符串，省掉 parse 与防御性判断。"
const { object } = await generateObject({
  model: openai('gpt-4o-mini'),
  schema: z.object({ intent: z.enum(['refund', 'track']), orderId: z.string().optional() }),
  prompt: '用户说：我要退 A1001。',
})
// object.intent 已是联合类型，无需 typeof 判断与兜底
if (object.intent === 'refund') queueRefund(object.orderId) // 直接消费，无需解析
\`\`\`

这段对照补上后，L42 手写的「请求构造 / 响应解析 / 工具分发 / 回填 / 结构化解析」五块几乎全部被 SDK 接管——唯一剩下的手工活是工具业务与决策，而这俩本就不该被框架接管。

### 重写不适用的几种情况

不是所有「调模型」都该用 AI SDK 重写，三种情况要退回去手写或换框架：

- **要用某家独有 API**：比如某供应商特有的长上下文模式或自定义采样参数，provider 抽象没有对应接口，硬用就得走 \`raw\` 透传，抽象当场漏水，省下的胶水又得手写补回。
- **要在图里跑带 checkpoint 的长任务**：AI SDK 不管状态机，这时候该上 LangGraph（L96）——它不是竞争对手，是互补层：AI SDK 跑「每个节点里调模型」，LangGraph 管「节点怎么连、怎么续跑」。
- **要一站式 memory / rag / obs**：那是 Mastra（L103）的地盘；AI SDK 只给「调模型」那一层，其余得自己拼，强行叠反而会重复造 Mastra 已经做好的轮子。

一句话收束：**AI SDK 接管的是「调模型」这个动词，不接管「为什么调、调完怎么办」这两个状语。** 凡是涉及流程控制、状态持久化、数据索引的需求，它都不是正确工具——这一点在选型时比「它多好用」更重要。

### 与相邻课的分工

- **L42** 是手写 FC 运行时基线，本课的 \`generateText\` 重写是它的框架版本，只省胶水不省业务。
- **L89** 是模型路由基线，本课的路由只把「拼请求」退化成换参数，难度判据原样复用。
- **L106** 讲四概念，本课只做「同段逻辑下与手写版的度量对照」。
`,
    null,
    [
      {
        text: '用 AI SDK 重写工具调用，真正省掉的是哪部分？',
        options: [
          '工具的业务实现（查库/调第三方）',
          '胶水：请求构造、响应解析、工具分发、回填、续跑',
          '难度判据（选哪个模型）',
          'prompt 本身',
        ],
        answer: 1,
        explain: 'SDK 替你省的是接入成本；工具实现与决策逻辑一律不碰，一个字没少。',
        concept: 'ai-sdk-rewrite',
      },
      {
        text: '模型路由用 provider 抽象后，发生了什么变化？',
        options: [
          '难度判据不再需要',
          '「拼不同请求体」退化成「选 provider + model 两个参数」，判据逻辑原样复用',
          '误路由代价消失',
          '路由变成全自动、无需决策',
        ],
        answer: 1,
        explain: '切换模型从几十行构造变一行参数；但 L89 的选档判据属于决策，一个字没少。',
        concept: 'ai-sdk-rewrite',
      },
      {
        text: 'provider 抽象统一不了的是什么？',
        options: [
          '调用形态',
          '供应商的独有能力（某家特有功能在另一家可能不支持）',
          '模型名参数',
          '流式输出接口',
        ],
        answer: 1,
        explain: '抽象统一「调用形态」而非「能力」；依赖独有能力时换 provider 就不是换字符串。',
        concept: 'ai-sdk-rewrite',
      },
      {
        text: 'AI SDK 重写最适合的场景是？',
        options: [
          '触碰某家独有 API 的深度定制',
          '标准调模型（工具/流式/路由），且尽量只用标准能力',
          '需要自带 agent loop 与 checkpoint',
          '需要内存/rag/obs 成套件',
        ],
        answer: 1,
        explain: '它只锁模型交互层，范围小；一旦依赖独有能力，抽象会在那一处漏水。',
        concept: 'ai-sdk-rewrite',
      },
    ],
    [
      ['generateText 重写', '省掉请求构造/解析/分发/回填；工具业务与决策逻辑不省'],
      ['streamText', '把流生命周期收成 textStream 异步迭代器，省掉分块拼接'],
      ['provider 路由', '「拼请求」退化成选 provider+model 参数；L89 判据原样复用'],
      ['抽象漏水', 'provider 统一调用形态不统一能力，依赖独有功能时换供应商非换字符串'],
    ],
    [
      '路由散落模型名，换供应商时才发现用了某家独有参数。',
      '依赖 provider 独有能力却不自知，切另一家某项崩。',
      '要流式却用 generateText 拿完整 text，一次性渲染。',
      '以为 SDK 接管了工具业务或难度判据（其实只省胶水）。',
    ],
  ),
  'framework',
)
