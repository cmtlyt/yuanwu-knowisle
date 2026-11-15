import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 21 ========== */

export const L110 = withKind(
  L(
    'L110',
    21,
    'LangChain JS 核心：tools / chains',
    3,
    ['L93'],
    ['langchain-core'],
    [
      '说清 LangChain 的核心抽象：Chain / Runnable / Tool / Memory / Retriever',
      '理解「把 LLM + 工具 + 记忆串成可复用单元」的组织原语，以及它与 agent 编排的边界',
      '认识 chain 的 pipe 组合带来的可组合性，和它锁住的部分',
    ],
    `
### 同一个「LLM + 工具 + 记忆」复制了八次

接手一个老项目时，我发现八处功能都长差不多：一段 system prompt、调一次模型、可能调一个工具、可能读一点历史。但每一处都是独立写的——prompt 拼法不同、工具调用写法不同、历史怎么传也不同。改一个通用规则（比如「所有输出加一句免责声明」）要改八遍，还容易改漏。

LangChain 给出的答案是 **chain**：把「prompt 模板 + 模型 + 输出解析 +（可选）工具/记忆」包成一个可复用、可组合的单元。你改一处模板，八处都生效。这一刻明白它卖的是什么——它**不是 agent 编排框架（那是 L68 的活），它是「可组合的执行单元」框架**：重心在「怎么把小块拼成可靠的一条线」。

:::deep
### 为什么说它「围绕可组合单元」而非「围绕流程」

和前面几个框架对齐看：

- LangGraph（L96）：图的执行，重心在「节点怎么连、怎么续跑」。
- OpenAI Agents（L100）：agent loop 约定，重心在「控制权怎么交」。
- Mastra（L103）：成套件，重心在「TS 一站开发」。
- Vercel AI SDK（L106）：模型交互层，重心在「调模型」。
- LlamaIndex（L108）：数据索引，重心在「检索」。
- **LangChain：可组合单元（Runnable），重心在「小块怎么拼成一条可靠管线」。**

它的核心抽象是 \`Runnable\`——任何东西（prompt、model、tool、retriever、甚至另一个 chain）只要实现 \`invoke\` / \`stream\` / \`batch\`，就能用同一个 \`pipe\`（\`|\`）算子串起来。这种「统一接口 + pipe 组合」让它像 Unix 管道一样可拼装。判据：**需求是「把若干处理步骤串成一条可复用管线」→ LangChain 顺手；需求是「多 Agent 动态协作」→ 它不是最贴合的，那是 LangGraph 的活。**
:::

### 核心抽象各自抽象了哪一层

| 抽象 | 抽象了哪一层 | 替你还的债 | 典型误用 |
|---|---|---|---|
| \`PromptTemplate\` | 提示词参数化 | 手写字符串拼接（易注入、难维护） | 直接拼用户输入进模板 |
| \`Runnable\` | 统一执行接口（pipe 组合） | 手写每一步的调用与传参 | 不用 pipe，手动调每步 |
| \`Tool\` | 工具的声明与 schema | 手写 function calling 分发 | 工具入参不写 schema |
| \`Memory\` | 对话历史的读写 | 手写消息存取（L91） | 以为它等于 checkpoint |
| \`Retriever\` | 「给 query 返回相关文档」 | 手写向量查询 + 拼装 | 把 retriever 当答案源 |

五个里 \`Runnable\` 是真正的枢纽：其它四个都是 Runnable，所以都能 \`pipe\` 起来。\`PromptTemplate | model | parser\` 这一行就是一个最小 chain。

### 最小可运行：template | model | parser

下面这段把三个 Runnable 用 pipe 串成一条线。注意 \`prompt.pipe(model).pipe(parser)\` 等价于手写「填模板 → 调模型 → 解析输出」，但每一步都可单独替换。

\`\`\`ts title="LangChain 最小 chain" note="要点：PromptTemplate / model / parser 都是 Runnable，用 pipe 串成线；替换任一步不影响其它。"
import { PromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { StringOutputParser } from '@langchain/core/output_parsers'

const prompt = PromptTemplate.fromTemplate('把这句话翻译成英文：{input}')
const model = new ChatOpenAI({ model: 'gpt-4o-mini', apiKey: MODEL_API_KEY })
const parser = new StringOutputParser()

const chain = prompt.pipe(model).pipe(parser) // 三个 Runnable 焊成一条线
const out = await chain.invoke({ input: '今天天气真好' }) // 统一 invoke 接口
console.log(out) // "The weather is really nice today."
\`\`\`

对比手写版：那里你要 \`renderTemplate(input)\` 拿到字符串、\`chat(messages)\` 拿到响应、\`response.content.trim()\` 拿文本。这里三步被 \`pipe\` 收掉，**而且中途任一步都能插入（比如加一个审计 logger、加一个重试 wrapper），不用改主流程**——这是 pipe 组合相对手写线性的最大收益。

### 加一个工具与一个记忆

chain 真正的威力在「可插拔」。下面把工具与记忆也接进来，仍然用同一套 pipe 思路。

\`\`\`ts title="带工具与记忆的 chain" note="要点：tool 用 zod 声明；memory 在链外读写，chain 本身保持纯函数式可组合。"
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ConversationTokenBufferMemory } from 'langchain/memory'

const lookup = tool(async ({ orderId }) => db.orders.find(orderId), {
  name: 'lookup_order',
  description: '按订单号查询',
  schema: z.object({ orderId: z.string() }),
})

const memory = new ConversationTokenBufferMemory({ llm: model, maxTokenLimit: 2000 })
const history = await memory.loadMemoryVariables({})
const chain2 = prompt.pipe(model.bindTools?.([lookup]) ?? model).pipe(parser)
\`\`\`

:::warn
### 三个必踩的坑

- **直接把用户输入拼进模板**。表现是被注入或格式错乱。\`PromptTemplate\` 的 \`{input}\` 是占位符，框架会转义；但如果你绕过模板手写 \`\` \`翻译：\${userInput}\` \`\`，就回到手写拼接的坑。始终走模板占位符。
- **以为 Memory 等于 checkpoint**。LangChain 的 \`Memory\` 只管「聊过什么」，不保「执行到哪一步」，跨请求续跑要上 LangGraph（L96）。和 L100 的 session 是同一个误区。
- **不用 pipe 手动调每步**。表现是代码里一堆 \`const a = await step1(x); const b = await step2(a)\`，失去可组合性，加中间件要改主流程。能用 \`pipe\` 就用 \`pipe\`，它是这个框架的立身之本。
:::

### pipe 组合的真正收益：可插拔中间件

前面说 pipe 让「替换任一步不影响其它」，这不只是代码整洁，它让**横切关注点**可以独立成一块插进管线。审计、重试、限流、格式校验——这些在手写版里要散落在每一步前后，在 chain 里是一个 \`RunnableLambda\` 插在哪个位置都行。

\`\`\`ts title="把审计与重试插进 chain" note="要点：RunnableLambda 是通用包裹器；插在 pipe 任意位置即生效，主流程零改动。"
import { RunnableLambda } from '@langchain/core/runnables'

const audit = RunnableLambda.from(async (input) => {
  console.log('[audit]', JSON.stringify(input).slice(0, 80)) // 脱敏后记录入参
  return input
})
const chain = audit
  .pipe(prompt)
  .pipe(model.withRetry({ stopAfterAttempt: 3 })) // 模型调用失败自动重试
  .pipe(parser)

const out = await chain.invoke({ input: '今天天气真好' })
\`\`\`

对比手写版：你要给「调模型」那段包一个 try/catch + 重试循环，给「拼模板」那段前面加一行 log。chain 把这些关注点从「散落在业务里」变成「挂在管线上的一个可复用块」。这是 pipe 组合相对线性手写的本质优势——**关注点的插入成本趋近于零**。

这一点在真实项目里价值尤其大：当合规要求「所有模型调用都要留痕」时，你改一个 \`audit\` 块即可，而不必翻遍八处手写调用。可插拔性省下的不是几行代码，是「改一处规则」的全局成本——这正是当初那八个重复实现最让我们头疼的地方。

### 什么时候该用 LangChain，什么时候手写

pipe 再好，也不是所有「调模型」都该用它。一张判据表：

| 场景 | 用 LangChain | 手写 |
|---|---|---|
| 多步骤管线（prompt→模型→工具→记忆→后处理） | ✅ pipe 组合省事 | 胶水爆炸 |
| 线性、单步、无组合 | 过重 | ✅ 几行更清楚 |
| 要分支 / 循环 / 续跑 | 改用 LangGraph（L96） | 或手写状态机 |
| 只用「调模型」这一层 | 用 Vercel AI SDK（L106）更轻 | — |
| 只做 RAG 检索问答 | 用 LlamaIndex（L108）更贴 | — |

最后两行很重要：**LangChain 是「胶水框架」，但它不是最轻的胶水，也不是最贴 RAG 的胶水**。当你的需求退化成「只调模型」或「只做检索」，更专门的框架反而更合适。选 LangChain 的正确理由是「我要把好几样东西串成一条可复用管线」，而不是「反正它什么都能做」。

### 与相邻课的分工

- **L68** 是手写多 Agent 编排，本课只讲单条 chain 的可组合单元，不展开多 Agent。
- **L91** 是手写记忆裁剪，本课的 \`Memory\` 是它的框架版本，但只管存取不管续跑。
- **L111** 用 LangChain 重写 FC 与检索链，本课只讲核心抽象不展开重写。
`,
    null,
    [
      {
        text: 'LangChain 的核心组织原语围绕什么？',
        options: [
          '图的执行与 checkpoint',
          '可组合的执行单元（Runnable），用 pipe 把小块拼成可靠管线',
          '多 Agent 动态协作',
          '数据索引与查询',
        ],
        answer: 1,
        explain: '它是「可组合单元」框架，重心在拼装而非流程编排或数据检索。',
        concept: 'langchain-core',
      },
      {
        text: '下列哪个是串起所有抽象的枢纽接口？',
        options: ['PromptTemplate', 'Runnable（pipe 组合）', 'Memory', 'Retriever'],
        answer: 1,
        explain: 'Prompt/Tool/Memory/Retriever 都是 Runnable，都能用 pipe 串起来。',
        concept: 'langchain-core',
      },
      {
        text: '下列哪种做法最典型地误用了 LangChain？',
        options: [
          '用 pipe 组合各步',
          '绕过 PromptTemplate 手写字符串拼接用户输入',
          '用 zod 声明 tool schema',
          '在链外用 Memory 读写历史',
        ],
        answer: 1,
        explain: '绕过模板就回到手写拼接的注入/格式坑；模板占位符才是正确路径。',
        concept: 'langchain-core',
      },
      {
        text: 'LangChain 的 Memory 与 checkpoint 的关系是？',
        options: [
          'Memory 就是 checkpoint',
          'Memory 只管聊过什么，不保执行到哪一步；续跑要上 LangGraph',
          'Memory 比 checkpoint 更强',
          '两者完全无关',
        ],
        answer: 1,
        explain: 'Memory 与 L100 的 session 同款误区：只管消息序列，不管执行状态。',
        concept: 'langchain-core',
      },
    ],
    [
      ['Runnable', '统一执行接口（invoke/stream/batch），一切皆可 pipe 组合'],
      ['PromptTemplate', '提示词参数化；占位符转义，禁止手写拼接用户输入'],
      ['Tool', '用 zod 声明 schema 的工具，等价于 L42 手写的 function calling'],
      ['Memory', '对话历史存取（L91 框架版）；只管聊过什么，不等于 checkpoint'],
    ],
    [
      '绕过 PromptTemplate 手写字符串拼接用户输入，引入注入风险。',
      '以为 Memory 等于 checkpoint，跨请求续跑失败。',
      '不用 pipe 手动调每步，失去可组合性与中间件插入能力。',
      '把 Retriever 当答案源，忘了它只返回相关文档。',
    ],
  ),
  'framework',
)
