import { L, withKind } from '../../course-builders.ts'

export const L07 = withKind(
  L(
    'L07',
    3,
    'classic 的博物馆清单：files 字段里的 chains/memory/experimental',
    2,
    ['L01'],
    ['lc-classic-museum'],
    [
      '能用 files 字段与 exports 子路径数为 classic 画出博物馆的完整展区图',
      '能按目录归类 0.x 的四大族 API（chains/memory/agents/retrievers）并说出各自去向',
      '能解释根入口警告与子路径强制的设计意图',
    ],
    `### 博物馆的两种布展方式

L01 说过 classic 是「博物馆」，本课走进去数馆藏。看一个项目如何封存历史，最诚实的材料是 package.json 的两个清单：**files 字段**（真正随包发布的文件）与 **exports 字段**（真正可被 import 的路径）。classic 的这两个清单加起来构成一张完整的展区图：files 79 条目、exports 100 子路径——对比主包的 12 个子路径，**「博物馆」不是修辞，是可以计数的**。

### 第一个展区：chains/ ——Chain 王国的全尸

\`\`\`text
libs/langchain-classic/src/chains/
├── base.ts                    # BaseChain：call/values 协议基类（L103 解剖）
├── llm_chain.ts               # LLMChain：0.x 的 Hello World
├── sequential_chain.ts        # SequentialChain 串行管线
├── transform.ts               # TransformChain 变换链
├── conversation.ts            # ConversationChain
├── retrieval_qa.ts / retrieval.ts   # RetrievalQA 家族
├── conversational_retrieval_chain.ts
├── history_aware_retriever.ts
├── question_answering/  summarization/  combine_documents/
├── router/                    # 路由链
├── sql_db/  graph_qa/  chat_vector_db/  api/  constitutional_ai/
└── openai_functions/  openai_moderation.ts  query_constructor/
\`\`\`

*— libs/langchain-classic/src/chains/ 目录实测（commit 7704471）*

0.x 教程里出现的每一条 Chain 都在这里：LLMChain、SequentialChain、TransformChain、ConversationChain、RetrievalQA、ConversationalRetrievalChain、路由链家族，连 OpenAI function 专用的 openai_functions/ 与宪法 AI 的 constitutional_ai/ 都原样在列。对应到 exports 字段，chains 相关子路径就有 16 个（./chains、./chains/combine_documents、./chains/retrieval、./chains/sql_db……）。**这个展区的讲解者是模块九**：L103 解剖 BaseChain 的 call/values 协议，L107/L108 做逐条迁移。

### 第二个展区：memory/ ——隐式记忆协议的标本

\`\`\`text
libs/langchain-classic/src/memory/
├── index.ts  chat_memory.ts  base?
├── buffer_memory.ts        # BufferMemory：滑动全量窗口
├── buffer_window_memory.ts # BufferWindowMemory：定长窗口
├── buffer_token_memory.ts  # TokenBuffer：token 预算裁剪
├── summary.ts  summary_buffer.ts  # 摘要记忆
├── entity_memory.ts        # 实体记忆
├── combined_memory.ts      # 组合记忆
└── vector_store.ts  stores/
\`\`\`

*— libs/langchain-classic/src/memory/ 目录实测（commit 7704471）*

memory/ 下 10 个实现文件对应 0.x 的记忆全家族。它们的共同特征是**隐式协议**：状态藏在 chain 对象里，靠 loadMemoryVariables/saveContext 两个方法在链执行前后自动读写（L104 拆协议）。1.x 的替代方案是显式的 messages 状态 + LangGraph checkpointer + summarization middleware——模块九的 L109-L111 做逐个对照。

### 第三个展区：experimental/ ——自治 agent 的化石层

\`\`\`text
libs/langchain-classic/src/experimental/
├── autogpt/  babyagi/  generative_agents/
├── plan_and_execute/  masking/
├── openai_assistant/  openai_files/
├── chains/  prompts/
\`\`\`

*— libs/langchain-classic/src/experimental/ 目录实测（commit 7704471）*

这是最有「历史标本」味道的展区：AutoGPT、BabyAGI、GenerativeAgents（斯坦福小镇）、Plan-and-Execute——2023 年自治 agent 浪潮的四大名项目在 JS 生态的实现全部封存于此，连同它们的 prompt 模板。连 experimental 也有自己的子路径导出（./experimental/autogpt、./experimental/babyagi 等 7 个）。读这层化石有两个用处：理解「循环、记忆、工具」三个概念为何在 1.x 被重新设计成 middleware + 图；以及识别旧教程——**任何 import 了 @langchain/classic/experimental/babyagi 的教程，年代判定直接完成**。

### 第四组展区：检索、工具、垂类与基础设施

其余顶层目录按功能归四组：

| 展区 | 成员 | 1.x 去向 |
|---|---|---|
| 检索族 | retrievers/（12 个花式 retriever 的目录）、vectorstores/、embeddings/、document_loaders/、document_transformers/ | core 保留基类，具体实现留在 classic 或下沉 provider（L118） |
| 工具与索引 | tools/、indexes/、schema/ | tools 基类进 core，indexes 被 core/indexing 取代 |
| 垂类与评测 | sql_db.ts、evaluation/、smith/、graph_qa/ | 大多无替代，长期留守（L114/L124） |
| 基础设施 | callbacks/、cache/、stores/、storage/、load/、hub/、chat_models/、prompts/、output_parsers/、text_splitter.ts、util/ | 基类概念进 core，classic 保留旧实现 |

files 字段的 79 条目与这张表完全对应：目录条目（chains、memory、experimental、retrievers、stores、document_transformers、output_parsers、embeddings、document_loaders、tools、agents、chat_models、hub、load、storage、util、cache、indexes、schema、vectorstores）加散装 .d.cts/.cjs/.d.ts/.js 四件套（agents、callbacks、memory、sql_db、indexes、document、output_parsers、text_splitter、smith、hub、load）再加 dist/ 与元文件。**每一行 files 都是一个展柜标签。**

### 第五展区：agents/ 与 chains 的序列化层——两组容易漏看的化石

展区图里还藏着两组低调但信息量极大的展柜。第一组是 **classic src 顶层的 \`agents/\` 目录**——它经常被 chains/ 抢走注意力，但 0.x 的 agent 世界完整封存在这里（libs/langchain-classic/src/agents/ 目录实测，commit 7704471）：

\`\`\`text
libs/langchain-classic/src/agents/
├── executor.ts          # AgentExecutor：0.x 的 agent 主循环
├── agent.ts  initialize.ts  load.ts  helpers.ts  types.ts
├── format_scratchpad/   # 把历史消息拼成各协议要求的中间提示
├── mrkl/  chat/  chat_convo/  structured_chat/  xml/
├── openai/  openai_functions/  openai_tools/  tool_calling/
└── react/  toolkits/
\`\`\`

mrkl/（ZeroShot ReAct 协议）、chat/、structured_chat/、xml/、openai_functions/、openai_tools/、tool_calling/——**每套协议一个目录**，加上 format_scratchpad/ 里按协议拼装中间提示的实现。这棵目录树就是模块九 L113「五套协议族退役」的物证：1.x 把它们全部收敛为 tool_calls 一种协议后，这里的一切都不再有主线对应物。executor.ts 单文件就是 AgentExecutor 本尊，L112 做 Executor → createAgent 映射时的全部素材都在这一个文件里。

第二组是 **chains/ 里的序列化配套**。chains/ 不只有业务链，还有 load.ts 与 serde.ts 两个基础设施文件，serde.ts 的开头就是一个时代注脚：

\`\`\`ts
/**
 * Represents the serialized form of an LLMChain. It includes properties
 * such as \`_type\`, \`llm\`, and \`prompt\`.
 *
 * @deprecated Use newer serialization methods.
 */
export type SerializedLLMChain = {
  _type: "llm_chain";
  llm?: SerializedLLM;
  prompt?: SerializedBasePromptTemplate;
};
\`\`\`

*— libs/langchain-classic/src/chains/serde.ts:1-14（commit 7704471，节选）*

\`_type: "llm_chain"\` 这种自声明式类型标签是 0.x 序列化协议的标志：每条 Chain 都要为 serde 手写一个 SerializedXxx 类型，序列化的是「声明」而非「实例」。整个类型已标 @deprecated——1.x 的序列化换成了 langgraph checkpointer 的 JsonPlusSerializer 体系（L91），对象级 serde 退役。把两组化石连起来看，你会得到博物馆的完整叙事：**0.x 把「可序列化、可组合、带协议的 Chain 对象」当作一等公民，1.x 把这一切换成「图 + 消息 + 中间件」**——目录即史书。

### 根入口的警告：博物馆的门是关着的

\`\`\`ts
console.warn(
  \`[WARNING]: The root "langchain" entrypoint is empty. Please use a specific entrypoint instead.\`
);
\`\`\`

*— libs/langchain-classic/src/index.ts:1-3（commit 7704471）*

把这 3 行放进本课最后一节，因为它浓缩了整个包的设计立场。**根入口为空 + 100 个子路径导出**意味着：每次使用旧 API，你都必须写下完整路径（\`import { BufferMemory } from "@langchain/classic/memory"\`）。这个强制有两层收益：其一，代码搜索 \`@langchain/classic\` 子路径前缀就能审计出全部 0.x 使用点，迁移进度可量化（模块九走查课的基础）；其二，旧 API 无法「顺手」混进新代码——每次 import 都是一次显式表态。

对照三个包的根入口哲学（L03 的表）：core 根入口是 \`export {}\`（全部走子路径），classic 根入口是警告（全部走子路径 + 留痕），只有主包提供便利根面。**同一个 monorepo 里三种导出策略服务三种定位：原语库要求精确、博物馆要求留痕、产品包要求开箱即用。**

### 本课小结

- 量化看规模：classic files 79 条、exports 100 子路径、src 顶层 28 个成员——主包对应数字是 12 与 8。
- chains/ 收纳 0.x 全部 Chain 族；memory/ 收纳 10 个隐式记忆实现；experimental/ 封存 AutoGPT/BabyAGI/GenerativeAgents/Plan-and-Execute 化石层。
- 检索、垂类、基础设施三组展区的 1.x 去向不同：基类进 core、实现留守、垂类无替代。
- 根入口 3 行警告是设计立场：强制子路径导入让 0.x 使用点全程可审计、不可隐式混入。
- 下一课回到主包看「反向操作」：如何用转发层（re-export）而非 museum 策略来维持版本稳定——主包如何把 core 的 API 升格为自己的承诺。
`,
    null,
    [
      {
        text: '@langchain/classic 的 exports 子路径有多少个？files 数组有多少条目？',
        options: [
          'exports 12 个、files 16 条',
          'exports 74 个、files 40 条',
          'exports 100 个、files 79 条',
          'exports 200 个、files 120 条',
        ],
        answer: 2,
        explain:
          '实测 libs/langchain-classic/package.json：exports 键恰 100 个（含 ./package.json 自描述条目），files 数组 79 条。对照主包的 12 个子路径与 core 的 74 个，子路径数量本身就是「博物馆规模」的量化证据。A 是主包的数据；B 是 core 的数据；D 是夸张值。',
        concept: 'lc-classic-museum',
      },
      {
        text: 'classic 根入口 import 会得到什么？',
        options: [
          '所有旧 API 的全量命名空间对象',
          '一条 console.warn 警告：根入口为空，请使用具体子路径',
          'Node REPL 的交互式菜单',
          'chains 与 memory 的默认实例',
        ],
        answer: 1,
        explain:
          'libs/langchain-classic/src/index.ts 全文 3 行，只有一条 `console.warn("[WARNING]: The root \\"langchain\\" entrypoint is empty. Please use a specific entrypoint instead.")`。设计意图：强制每次使用旧 API 都显式写明子路径，让「哪些代码还在用 0.x」在 IDE 与 review 里可见。A/D 与源码相反；C 纯属虚构。',
        concept: 'lc-classic-museum',
      },
      {
        text: '下列哪个目录不在 classic 的 src 顶层？',
        options: ['experimental', 'memory', 'runnables', 'indexes'],
        answer: 2,
        explain:
          'classic src 顶层实测 28 个成员，含 experimental/、memory/、indexes/、evaluation/、sql_db.ts、smith/ 等；runnables 是 core 的模块（LCEL 的家），从未在 classic 出现——classic 里的旧式组合是 chains/，与 Runnable 组合是两代世界观（L102 展开）。',
        concept: 'lc-classic-museum',
      },
      {
        text: 'classic 的 experimental/ 目录里保存着哪些 0.x 时代的实验品？',
        options: [
          'summarization 与 pii 脱敏的早期版本',
          'autogpt、babyagi、generative_agents、plan_and_execute、openai_assistant 等',
          '只包含已被删除代码的空壳目录',
          'LangGraph 的前身实现',
        ],
        answer: 1,
        explain:
          'src/experimental/ 实测含 autogpt、babyagi、chains、generative_agents、masking、openai_assistant、openai_files、plan_and_execute、prompts 九个成员——0.x 时代「agent 自治实验」的完整标本被原样封存。A 描述的能力在 1.x 主包以 middleware 形态重做（summarizationMiddleware 等），不在 experimental 里；C 错——代码完整可运行；D 错——LangGraph 是独立仓库，与其无渊源。',
        concept: 'lc-classic-museum',
      },
    ],
    [
      ['博物馆包', '把上一代 API 原样封存、不再演进的隔离包；classic 是范本：全量保留、只修不进、根入口关闭'],
      [
        'files 字段',
        'package.json 中声明随 npm publish 打包文件的白名单；classic 的 79 条目等于博物馆的馆藏清单',
      ],
      [
        'indexes/',
        '0.x 时代的检索索引层（含 VectorStore 索引与 DocstoreManager），1.x 已由 core 的 indexing/ 与 vectorstores 取代',
      ],
    ],
    [
      '在 1.x 项目里同时 import classic 与主包的同名类（如两个 Memory）——两套体系状态互不相通，混用是契约明令禁止的',
      '以为 classic 会随 1.x 演进更新 API 形态——它只做兼容性修复，新能力（middleware、structured output 等）只进主包',
      '直接 import "@langchain/classic" 根入口——只得到一条警告，必须写完整子路径如 "@langchain/classic/memory"',
    ],
  ),
  'framework',
)
