import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 21 ========== */

export const L111 = withKind(
  L(
    'L111',
    21,
    '对照：用 LangChain JS 重写 Function Calling + 检索链（对比 L42 / L49）',
    3,
    ['L110', 'L42', 'L49'],
    ['langchain-rewrite'],
    [
      '用 LangChain 重写 Function Calling 与检索链，并给出与 L42 / L49 手写版的度量对照',
      '理解 chain 的 pipe 组合如何让「FC + RAG」这种组合需求变简单',
      '认识可组合性带来的收益，以及它锁住的「链形态」',
    ],
    `
### 手写「会调工具又会查知识库」的 agent，四百行

L42 的 function-calling 运行时加上 L49 的向量 RAG，组合成一个「既能调工具、又能基于知识库回答」的 agent——手写版到我接生产时滚到四百多行：FC 那套请求/解析/分发/回填，加上 RAG 那套 chunk/embed/召回/拼装，再加上「先判断该调工具还是该查库」的路由。每一块都重复、都易错。

用 LangChain 重写后大概八十行。但和前面几个框架一样，最该想清楚的不是「省了多少」，而是**省掉的胶水里有没有你想自己控制的**。这一节给两段重写对照。

### 对照一：Function Calling（vs L42 手写运行时）

| 维度 | L42 手写运行时 | LangChain 重写 |
|---|---|---|
| 工具声明 | 手写 \`parameters\` schema | \`tool()\` + zod schema |
| tool_calls 解析 | 手写 \`JSON.parse\` + 字段判断 | 框架解析，可直接用 |
| 工具分发 | 手写 \`switch(name)\` | \`bindTools\` 交给模型路由 |
| 回填 + 续跑 | 手写拼消息再调 | \`createToolCallingAgent\` 内部完成 |
| 你仍要写 | 工具业务实现 | 同左（省不掉） |

关键差异在「路由」：L42 手写版里「该调哪个工具」要么你写 if，要么模型吐 tool_calls 你分发；LangChain 用 \`bindTools\` 把工具挂到模型上，模型自己决定调不调、调哪个。这把「分发」也收进了框架。

\`\`\`ts title="Function Calling 重写（对比 L42）" note="要点：tool() 声明 + bindTools 挂到模型；分发/回填/续跑由 agent 内部完成，你只写业务。"
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { ChatOpenAI } from '@langchain/openai'
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents'

const lookup = tool(async ({ orderId }) => db.orders.find(orderId), {
  name: 'lookup_order',
  description: '按订单号查询',
  schema: z.object({ orderId: z.string() }),
})

const model = new ChatOpenAI({ model: 'gpt-4o-mini', apiKey: MODEL_API_KEY })
const agent = createToolCallingAgent({ llm: model.bindTools([lookup]), tools: [lookup] })
const exec = new AgentExecutor({ agent, tools: [lookup] })
const out = await exec.invoke({ input: '订单 A1001 到哪了？' }) // 分发/回填全内部
\`\`\`

### 对照二：检索链（vs L49 手写向量 RAG）

L49 手写的「召回 + 生成」两段，在 LangChain 里被收成 \`RetrievalQAChain\`：retriever 负责召回，chain 负责把召回拼进 prompt 调模型。注意它和 L108 的 LlamaIndex \`QueryEngine\` 做的是同一件事，只是组织方式不同——一个用 chain，一个用 index。

\`\`\`ts title="检索链重写（对比 L49）" note="要点：retriever 负责召回，chain 负责拼装+生成；等价于 L49 手写的两段，但组合方式走 pipe。"
import { VectorStore } from 'langchain/vectorstores'
import { createRetrievalChain } from 'langchain/chains/retrieval'

const retriever = VectorStore.fromDocuments(docs, myEmbedding).asRetriever()
const ragChain = await createRetrievalChain({ retriever, combineDocsChain: answerChain })
const r = await ragChain.invoke({ input: '多久能退？' }) // retriever 召回 + 模型生成
\`\`\`

这里省的是「召回结果怎么塞进 prompt、怎么和原问题拼」那段胶水。L49 手写版你要自己 \`map\` 召回片段、自己拼「上下文段」与「问题段」两段，框架版 retriever 输出直接进 chain。

:::deep
### 可组合性才是 LangChain 真正的卖点

两段重写单独看，别的框架也能做（L106 的 AI SDK 能重写 FC，L108 的 LlamaIndex 能重写 RAG）。LangChain 独特的是**这两段能无缝拼进同一条 pipe**：

\`\`\`ts title="FC + RAG 组合成一条链" note="要点：retriever 与 tool 都是 Runnable，能进同一条 pipe；组合成本极低是 LangChain 相较单点框架的优势。"
const hybrid = {
  retriever,                         // 召回知识
  agent: createToolCallingAgent(...), // 调工具
}
// 两路结果可在上层 chain 里用 pipe 汇合，无需重写胶水
\`\`\`

这解释了它为什么常被用作「胶水框架」：当你需要「模型 + 多个工具 + 检索 + 记忆 + 后处理」串成一条带审计、带重试、带格式的管线时，pipe 组合比在各框架间手写桥接省事得多。但它也锁住「链形态」——一旦你的需求超出线性 pipe（要分支、要循环、要断点续跑），就得换 LangGraph（L96），因为纯 chain 表达不了图。

所以判据是：**线性可组合的管线 → LangChain 正解；带分支/循环的流程 → 上 LangGraph，别硬用 chain 拼。**
:::

:::warn
### 三个必踩的坑

- **用 chain 硬拼带循环的需求**。表现是为了「先想三步再执行」在 chain 里塞 while，链条变成意大利面。chain 是线性的，循环/分支请用 LangGraph（L96）。
- **以为 \`createToolCallingAgent\` 自动帮你管并发工具调用**。它默认串行分发；要和 L68 的并行工具一样的效果得自己在工具层做，别默认框架替你想到了。
- **Memory 与 chain 生命周期错位**。把 \`ConversationTokenBufferMemory\` 当作跨请求续跑机制，结果进程重启历史全没（和 L110 同款误区）。长任务续跑该上 checkpoint 体系。
:::

### 把检索与工具合成一条混合链

前面两段重写是独立的：一段调工具、一段查知识库。真实 agent 往往是「先查知识库拿到上下文，再带着上下文调工具，最后综合回答」。LangChain 的 \`RunnableSequence\` 让这两路合成一条链，而不用你手写「先 await 召回、再拼进 agent 输入、再 await agent」的胶水。

\`\`\`ts title="检索 + 工具 合成一条混合链" note="要点：RunnableSequence 把 retriever 与 agent 串成线；两路结果在中段函数里汇合，无需手写 await 胶水。"
import { RunnableSequence } from '@langchain/core/runnables'

const hybridChain = RunnableSequence.from([
  retriever,                                      // ① 先召回知识
  (docs) => ({ input: '基于以下资料回答：' + docs, tools: [lookup] }), // ② 汇合
  agentExecutor,                                  // ③ 带上下文调工具并回答
])
const out = await hybridChain.invoke({ input: 'A1001 的退款政策和状态？' })
\`\`\`

对比手写版：你要 \`const docs = await retrieve(q)\`、再 \`const ctx = format(docs)\`、再 \`const ans = await agent(q, ctx)\`——三步胶水。链版把它们收进一个 \`invoke\`。这正好对应本课开头说的「四百行手写 agent」：那些行大半就是这种跨组件的胶水，chain 把它们变成了声明。

### 什么时候不该用 LangChain

和前面每个框架一样，搞清楚「它不擅长什么」比「它会什么」更重要。四种情况该退回去：

- **需求退化为单次调模型**：你其实只做「prompt → 模型 → 文本」，没有工具、没有检索、没有记忆。这时 Vercel AI SDK（L106）更轻，LangChain 的 chain 抽象是纯负担。
- **需求是「只做 RAG 问答」**：LlamaIndex（L108）的 QueryEngine 比手写 retrieval chain 更贴这个场景，调召回参数也更顺手。硬用 LangChain 只是因为它「也能做」。
- **需求有分支 / 循环 / 断点续跑**：纯 chain 是线性的，表达不了图。这种该上 LangGraph（L96），用 chain 硬拼只会产生意大利面代码（L110 已强调）。
- **团队不熟悉、且流程极简单**：引入 chain 的抽象成本（学 pipe、学 Runnable、学各组件 API）高于它省的胶水。几行直写更清楚，也更好招人维护。

一句话回归：**LangChain 的正确使用场景是「多组件线性管线」，不是「所有调模型的地方」。** 它的可组合性是资产，也是诱饵——当你只是想要「调一次模型」时，这层组合能力就是你要背的税。

:::deep
### 六个框架的取舍总览（为 L112 矩阵铺垫）

把本模块七节框架课收一下，每个框架的「甜区」其实互不重叠：

- **Vercel AI SDK（L106）**：只调模型，边界最小、叠加性最强。
- **LlamaIndex（L108）**：数据索引与查询，RAG 最贴。
- **LangChain（L110）**：多组件线性管线，胶水最顺。
- **Mastra（L103）**：TS 成件套件，一站开发。
- **OpenAI Agents（L100）**：进程内 agent loop 约定，代码最短。
- **LangGraph（L96）**：有状态执行机，长任务 / 续跑。

选框架的第一步永远是「我的需求落在哪个甜区」，而不是「哪个最火」。L112 会把这张表扩成可量化的对照矩阵。
:::

### 与相邻课的分工

- **L42 / L49** 是手写基线，本课的 \`bindTools\` / \`RetrievalChain\` 是它们的框架版本，只省胶水不省业务。
- **L110** 讲核心抽象，本课只做「同段逻辑下与手写版的度量对照」。
- **L96** 是图执行框架，本课的「chain 表达不了图」直接指向它；**L112** 给六框架量化矩阵。

- **L42 / L49** 是手写基线，本课的 \`bindTools\` / \`RetrievalChain\` 是它们的框架版本，只省胶水不省业务。
- **L110** 讲核心抽象，本课只做「同段逻辑下与手写版的度量对照」。
- **L96** 是图执行框架，本课的「chain 表达不了图」直接指向它。
`,
    null,
    [
      {
        text: 'LangChain 重写 Function Calling，路由（该调哪个工具）由谁决定？',
        options: ['你手写 switch', 'bindTools 把工具挂到模型，模型自己决定', '随机选', '框架固定顺序轮询'],
        answer: 1,
        explain: 'bindTools 之后分发/回填/续跑都由 agent 内部完成，你只声明工具业务。',
        concept: 'langchain-rewrite',
      },
      {
        text: 'LangChain 相对 AI SDK / LlamaIndex 的独特卖点是？',
        options: [
          '更强的基础模型',
          '可组合性：FC + RAG + 记忆 + 后处理能用 pipe 拼成一条管线',
          '自带 checkpoint',
          '更快的向量召回',
        ],
        answer: 1,
        explain: '单点能力别家也有，pipe 组合让多组件线性管线成本极低，是「胶水框架」定位。',
        concept: 'langchain-rewrite',
      },
      {
        text: '下列哪种需求不该用纯 chain 硬拼？',
        options: ['线性可组合的管线', '带分支与循环、要断点续跑的流程', '单一检索问答', '单工具调用'],
        answer: 1,
        explain: 'chain 是线性的，分支/循环/续跑该上 LangGraph（L96），别硬拼。',
        concept: 'langchain-rewrite',
      },
      {
        text: 'createToolCallingAgent 默认的工具调用方式是？',
        options: [
          '并行分发',
          '串行分发（要并行得自己在工具层做）',
          '只调第一个匹配工具',
          '不调工具，只生成文本',
        ],
        answer: 1,
        explain: '默认串行；要和 L68 并行工具同效得自己实现，别默认框架替你并发。',
        concept: 'langchain-rewrite',
      },
    ],
    [
      ['bindTools', '把工具挂到模型，模型自决调不调/调哪个；分发/回填/续跑收进 agent'],
      ['RetrievalChain', 'retriever 召回 + chain 拼装生成，等价于 L49 手写的两段'],
      ['pipe 组合', 'FC+RAG+记忆+后处理可拼成一条管线，是 LangChain 相较单点框架的优势'],
      ['链形态锁定', 'chain 表达不了图；分支/循环/续跑要上 LangGraph'],
    ],
    [
      '用 chain 硬拼带循环需求，链条变意大利面。',
      '以为 agent 自动并发调工具，实际默认串行。',
      '把 Memory 当跨请求续跑，进程重启历史全没。',
      '以为 LangChain 比别家模型更强（它只是胶水框架）。',
    ],
  ),
  'framework',
)
