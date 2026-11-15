import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 20 ========== */

export const L106 = withKind(
  L(
    'L106',
    20,
    'Vercel AI SDK 核心概念：ai 包 / provider / tool / streaming',
    3,
    ['L93'],
    ['ai-sdk-core'],
    [
      '说清四个核心概念各自抽象了哪一层，以及它们对应的手写版本（L36 / L42 / L91）',
      '理解「聚焦模型交互层」的定位，以及它和前三框架（范式/SDK/成套件）的边界',
      '认识 provider 抽象为什么是整个 SDK 的关键，它省了什么、锁了什么',
    ],
    `
### 三个模型，三套 fetch 加解析

第一次在一个项目里同时接 OpenAI、Anthropic 和一个本地模型时，我写了三个函数：\`callGpt\` / \`callClaude\` / \`callLocal\`。每个函数里都是「拼不同的请求体 → 发不同的 endpoint → 解析不同的响应字段 → 统一成 \`{text, usage}\`」。第四次要加一个模型，又得复制一遍这套样板。

切到 Vercel AI SDK 之后，这三段样板被收成了一个东西：**provider**。我把模型名从 \`'gpt-4o-mini'\` 换成 \`'claude-3-5-sonnet'\` 或 \`'local-model'\`，调用代码一行都不用改。这一刻才明白这个 SDK 卖的到底是什么——它**不卖 agent loop，不卖状态机，不卖成套件，它只卖「调模型」这件事的标准化**。

:::deep
### 为什么说它「聚焦模型交互层」

前面三个框架的边界各不相同：

- LangGraph（L96）：卖有状态的执行机，连 checkpoint 都管。
- OpenAI Agents（L100）：卖让 agent loop 写起来更短的约定。
- Mastra（L103）：卖 TS 原生成套件，agent/workflow/memory/rag/obs 全包。

Vercel AI SDK 的边界比它们都小：**它只管「调一次模型要的活」**——构造请求、解析响应、跑工具、流式吐字、结构化输出。它不管你的循环怎么跑（L36 手写还是 L42 P&E 都行），不管你的状态怎么存，不管跨请求怎么续跑。

这个边界小，反而让它和任何编排都能叠：你可以在 LangGraph 的节点里用 \`generateText\`，也可以在 Mastra 的 agent 里用 \`streamText\`。它是「胶水层之下的那一层」。判断标准是：**如果你要的是「把模型调通」就别碰编排框架，直接用它；如果你要的是「让多个步骤自己跑」才上另三个。**
:::

### 四个核心概念各自抽象了哪一层

| 概念 | 抽象了哪一层 | 替你还的债 | 典型误用 |
|---|---|---|---|
| \`ai\` 包 | 调模型的统一入口（generate / stream / object） | 手写 fetch + 解析响应 | 自己拼请求体忘了统一返回结构 |
| \`provider\` | 不同模型供应商的统一接口 | 手写每家的请求/响应适配 | 把模型名写死成具体供应商格式 |
| \`tool\` | 工具的声明与执行（zod 约束入参） | 手写 function calling 的 schema 与分发（L42） | 工具入参不写 schema，运行时才报错 |
| \`streaming\` | 增量输出的统一接口 | 手写 SSE / 分块拼接 | 把流式当一次性用，丢增量 |

四个里 \`provider\` 是真正的杠杆：它让后面三个概念都能「换模型零成本」。没有它，工具还是得为每家供应商各写一套；有了它，工具只写一次。

### 最小可运行：generateText + tool + streamText

下面这段把四概念都摆出来。注意 \`tools\` 用 zod 声明入参（L42 里我们手写的 \`parameters\` schema 等价于这个），\`streamText\` 返回的是可迭代的增量流。

\`\`\`ts title="AI SDK 最小四件套" note="要点：provider 决定模型，tools 用 zod 声明，streamText 给增量流；这三行之外的样板都被 SDK 吃掉了。"
import { generateText, streamText } from 'ai'
import { openai, anthropic } from '@ai-sdk/openai' // 各家 provider 统一接口

const provider = openai // 换成 anthropic 或本地 provider，下面代码不变

const { text, usage, toolCalls } = await generateText({
  model: provider('gpt-4o-mini'),               // ① provider 抽象：模型即字符串
  prompt: '查订单 A1001 的状态并告诉我。',
  tools: {                                       // ② tool：zod 声明入参
    lookupOrder: {
      description: '按订单号查询状态',
      parameters: z.object({ orderId: z.string() }),
      execute: async ({ orderId }) => db.orders.find(orderId),
    },
  },
})

// ③ streaming：增量吐字，前端边收边渲染
const result = streamText({ model: provider('gpt-4o-mini'), prompt: '写一句欢迎语' })
for await (const delta of result.textStream) {
  process.stdout.write(delta) // 每个 delta 是一小段增量文本
  const usage = await result.usage // 流式同样能拿到 token 用量
  console.log('streamed tokens', usage.totalTokens) // 与 L42 手写统计对齐
}
\`\`\`

对比 L36 手写运行时：那里每一行都是「拼请求、发、读响应、判 tool_calls、回填」。这里这些全被 \`generateText\` 收掉了，你只写「模型是谁、说什么、有哪些工具」。**抽象掉的正是「调模型」这个最重复、最无聊、最易错的环节。**

:::warn
### 三个必踩的坑

- **把 provider 写死成具体供应商的格式**。表现是 \`openai('gpt-4o')\` 写死，想换 anthropic 时改了三处。正确做法是把 \`provider\` 抽成变量（如上），模型名只是字符串参数，换供应商只改这一行。
- **工具入参不写 zod schema**。表现是运行时才报「参数类型不对」，而 L42 手写版能在调用前校验。AI SDK 的 \`parameters\` 既是文档也是校验，不写等于把错误推到模型那边。
- **混淆 \`generateText\` 和 \`streamText\` 的返回**。\`generateText\` 返回完整 \`text\`；\`streamText\` 返回 \`textStream\`（异步迭代器）。拿 \`.text\` 去遍历流，得到的是 undefined 而不是字。两者不是「同一个加个 flag」，是两种返回形态。
:::

### 常被忽略的第四个能力：结构化输出

四个概念之外，AI SDK 还有一个常被低估的能力——\`generateObject\`：用 zod schema 约束模型返回**结构化 JSON**，直接拿到类型安全的对象，而不是自己 \`JSON.parse\` 一段文本再手写校验。它其实是 \`tool\` 的「无工具版」：同样用 zod 声明形状，差别是它不调函数，只产出数据。

| 返回方式 | 手写版 | AI SDK |
|---|---|---|
| 自由文本 | \`text\` 字段 | \`generateText().text\` |
| 结构化数据 | 解析文本 + 手写校验 | \`generateObject({ schema })\` 直接得对象 |

\`\`\`ts title="generateObject：结构化抽取" note="要点：schema 既是约束也是类型，返回对象无需手写 JSON.parse；这是 tool 的无工具版。"
import { generateObject } from 'ai'

const { object } = await generateObject({
  model: openai('gpt-4o-mini'),
  schema: z.object({
    intent: z.enum(['refund', 'track', 'complain']),
    orderId: z.string().optional(),
    sentiment: z.number().min(-1).max(1),
  }),
  prompt: '用户说：我要退 A1001，气死了。',
})
// object 已是 { intent:'refund', orderId:'A1001', sentiment:-0.9 }，类型安全
\`\`\`

为什么这个能力值得单独拎出来：它在「调模型」和「用模型产出」之间补上了类型边界。手写版里模型吐出的永远是字符串，你要不要校验、怎么校验全凭自觉；\`generateObject\` 把 schema 变成**编译期就存在的契约**，模型偏离形状会在解析阶段就报错，而不是在某个下游分支里悄悄变成 \`undefined\`。这是把「胶水」省掉的同时，还顺手把「胶水出错」这类 bug 一起省了。

### 与另三个框架的定位对照

把 L93 的三形态 + 本课补成一张表，能看清 AI SDK 为什么「最小」：

| 框架 | 边界 | 管不管 agent loop | 管不管状态机 |
|---|---|---|---|
| LangGraph | 有状态执行机 | 管（图即循环） | 管（checkpoint） |
| OpenAI Agents | agent loop 约定 | 管（run 内建） | 不管（只有 session） |
| Mastra | TS 成套件 | 部分（agent 内） | 部分（workflow） |
| Vercel AI SDK | 模型交互层 | 不管 | 不管 |

最后一行是它的立身之本：**边界最小，所以叠加性最强**。你几乎可以在任何编排里用它来「调模型」这一件事——LangGraph 的节点里、Mastra 的 agent 里、甚至你自己写的 while 循环里。它不和你抢「谁来控制流程」，这也是它和另三个框架最本质的区别：别人多少都想接管一点流程，它只接管「调模型」这个动词。

### 与相邻课的分工

- **L36 / L42** 是手写运行时与 FC 运行时基线，本课的 \`generateText\` + \`tool\` 就是它们的框架版本。
- **L93** 给框架三形态与运行时位置，本课把 AI SDK 定位在「聚焦模型交互层」这一最小边界。
- **L107** 用 AI SDK 重写工具调用与流式，并对比 L89 的模型路由，本课只讲概念不展开重写。
`,
    null,
    [
      {
        text: 'Vercel AI SDK 的边界（它聚焦在哪一层）是？',
        options: [
          '有状态的执行机（含 checkpoint）',
          '只管「调一次模型要的活」：构造请求、解析响应、工具、流式、结构化输出',
          'TS 原生成套件（agent/workflow/memory/rag/obs）',
          '多 Agent 编排范式',
        ],
        answer: 1,
        explain: '它比前三框架边界都小，是「胶水层之下」的模型交互层，可叠加在任何编排之上。',
        concept: 'ai-sdk-core',
      },
      {
        text: '四个核心概念里，哪个是整个 SDK 的杠杆？',
        options: ['ai 包', 'provider（让工具/流式都能换模型零成本）', 'streaming', 'tool'],
        answer: 1,
        explain: 'provider 抽象让模型变成字符串参数，工具与流式都只需写一次即可跨供应商复用。',
        concept: 'ai-sdk-core',
      },
      {
        text: '下列最典型的误用是？',
        options: [
          '把 provider 写死成具体供应商格式',
          '用 streamText 渲染增量',
          '用 zod 声明工具入参',
          '换模型只改 provider 变量',
        ],
        answer: 0,
        explain: '写死后换供应商要改多处；正确做法是 provider 抽变量、模型名当参数。',
        concept: 'ai-sdk-core',
      },
      {
        text: 'generateText 与 streamText 的核心区别是？',
        options: [
          '前者更快',
          '前者返回完整 text，后者返回可迭代的 textStream（增量）',
          '后者不能带工具',
          '两者完全一样',
        ],
        answer: 1,
        explain: '两种返回形态：一次性完整文本 vs 异步迭代的增量流，不是同一个加 flag。',
        concept: 'ai-sdk-core',
      },
    ],
    [
      ['provider', '不同模型供应商的统一接口；模型即字符串参数，换供应商只改一行'],
      ['ai 包', '调模型的统一入口：generateText / streamText / generateObject'],
      ['tool', '用 zod 声明入参的工具，等价于 L42 手写的 function calling schema'],
      ['streaming', '增量输出的统一接口，返回可迭代的 textStream 而非完整 text'],
    ],
    [
      '把 provider 写死成具体供应商格式，换模型改三处。',
      '工具入参不写 zod schema，错误推到运行时。',
      '拿 streamText 的 .text 去遍历流，得到 undefined。',
      '以为 AI SDK 管 agent loop 或状态机，其实它只管调模型。',
    ],
  ),
  'framework',
)
