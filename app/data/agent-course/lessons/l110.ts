import { L } from '../../course-builders.ts'

/* ========== Stage 21 ========== */

export const L110 = L(
  'L110',
  21,
  'LangChain JS 核心：tools / chains',
  14,
  3,
  ['L93'],
  ['langchain-core'],
  [
    '掌握 LangChain JS 的核心：tools 与 chains',
    '理解「链」的抽象与 LCEL 组合方式',
    '认识 LangChain 与 LangGraph 的关系',
  ],
  `
### 「链」与「工具」

LangChain JS（\\\`langchain\\\` + \\\`@langchain/core\\\`）的核心是两个抽象：**tools**（可被模型调用的工具）与 **chains**（把 prompt + model + tool 串起来的链）。LCEL（\\\`|\\\` 管道）是组合方式。

\`\`\` title="tools 与 chains" note="关键：\\\`tool()\\\` 对应 L42 的 zod 工具；\\\`chain\\\`（| 管道）对应「prompt→model→解析」的流水线。"
import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { ChatPromptTemplate } from "@langchain/core/prompts"

// ① tools：zod 定义 + invoke
const weather = tool(async ({ city }) => "晴 18°C", {
  name: "search_weather",
  schema: z.object({ city: z.string() }),
})

// ② chains：LCEL 用 | 组合 prompt → model → output
const chain = ChatPromptTemplate.fromMessages([...])
  .pipe(model)
  .pipe(outputParser)

const result = await chain.invoke({ input: "..." })
\`\`\`

:::deep

### LangChain vs LangGraph

LangChain 提供「组件」与「链」（线性组合）；LangGraph 提供「图」（含循环、条件、状态）。关系：LangGraph 是 LangChain 生态里做「编排」的部分——链做不了循环，图可以。

:::

### LangChain 的两个核心

- tools：可被模型调用的工具（zod 定义）。
- chains：LCEL 管道组合 prompt/model/output。
- 注意：chains 是「线性」的，循环要交给 LangGraph。

:::warn

### 链是线性的

LangChain 的 chain（LCEL 管道）是**线性**组合，做不了「循环、条件分支」。如果教程让你用 chain 做 ReAct 循环，那是「agent executor」在背后用了 LangGraph 或手写循环，别误解。

:::

`,
  null,
  [
    {
      text: 'LangChain JS 的两个核心抽象是？',
      options: ['图、状态', 'tools 与 chains', 'Agent、run', '索引、查询引擎'],
      answer: 1,
      explain: 'tools 与 chains。',
      concept: 'langchain-core',
    },
    {
      text: 'LCEL 的组合方式是？',
      options: ['while 循环', '| 管道（prompt → model → parser）', '图节点', '消息总线'],
      answer: 1,
      explain: 'LCEL 管道组合。',
      concept: 'langchain-core',
    },
    {
      text: 'LangChain 的 chain 能做循环吗？',
      options: ['能', '不能（线性组合，循环要 LangGraph）', '有时能', '取决于模型'],
      answer: 1,
      explain: '链是线性的。',
      concept: 'langchain-core',
    },
  ],
  [
    ['tools', 'zod 定义、可被模型调用的工具'],
    ['chains', 'LCEL 管道的线性组合'],
    ['LCEL', 'LangChain 的 | 管道组合语法'],
  ],
  [
    '以为 chain 能做 ReAct 循环（它需要 LangGraph 或手写循环）。',
    '把 LangChain（组件/链）与 LangGraph（图）混为一谈。',
  ],
)
