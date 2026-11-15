import { L, withKind } from '../../course-builders.ts'

export const L102 = withKind(
  L(
    'L102',
    30,
    '从 Chain 王国到 Runnable+Graph：classic 30 目录 vs 1.x 8 目录对比地图',
    2,
    ['L07'],
    ['lc-two-generations'],
    [
      '能对着 classic 的 30 个顶级条目说出每个目录在 1.x 的三种去向：下沉 core、迁入新主线、留 classic 无替代',
      '能解释「两代架构」的分水岭——编排单元从 BaseChain 子类变成 Runnable 组合与 LangGraph 编译图',
      '能从 classic 根入口的运行时警告与 prompts 入口的移除报错里读出官方迁移策略的时间线',
    ],
    `### 迁移的第一课：先看清两块大陆的形状

从本课起，我们进入模块九：从 0.x 到 1.x 的迁移专题。在此之前你已经走过 classic 的博物馆（L07）和新包的导出面（L03），现在把两张地图拼在一起。一句话核心结论：**1.x 迁移不是「升级」，而是「换大陆」——编排单元从 BaseChain 子类王国，迁往 Runnable 组合与 LangGraph 编译图构成的新世界，而 classic 包就是这个世界的官方旧城保护区。**

先看旧城的门牌。\`@langchain/classic\` 的 package.json 开头三行写得毫不含糊：

\`\`\`json
{
  "name": "@langchain/classic",
  "version": "1.0.61",
  "description": "Old abstractions from LangChain.js"
}
\`\`\`

*— langchain-classic/package.json:2-4（commit 7704471）*

"Old abstractions"（旧抽象）三个词就是官方定位：这个包不是废弃品仓库，而是**被正式维护的旧抽象收藏馆**。它的版本号 1.0.61 说明发布节奏跟随 1.x 主线——你升级 1.x 时它也在更新，只是内容停留在旧范式。这决定了整个迁移专题的基调：新旧两包并存、共享同一个 @langchain/core，你可以按模块分批搬家，而不是一夜清场。

### 两张目录地图并排

classic 的 src 顶级条目有 30 个（实际 ls 取证）：

| classic 顶级条目 | 1.x 去向 | 说明 |
|---|---|---|
| chains | **拆散**：概念替代为 LCEL 组合 + LangGraph | L103/L107/L108 逐项讲 |
| memory | **拆散**：messages 状态 + checkpointer + middleware | L104/L109-L111 |
| agents | **收敛**：AgentExecutor→createAgent，五套协议→tool_calls | L112/L113 |
| prompts、output_parsers、schema、types、util | **下沉 core**（多数已在 0.2 迁走） | 换 import 即可 |
| text_splitter.ts、storage/in_memory.ts、load/serializable.ts | **纯转发空壳** | 一行 \`export * from\` |
| retrievers、vectorstores、embeddings、document_loaders、document_transformers | **抽象下沉 core，实现留 classic** | L118 |
| experimental、sql_db.ts、smith、indexes、evaluation | **classic 独占，无替代** | L114/L124 |
| cache、callbacks、chat_models、hub、tools、stores、document.ts | **core 承接或集成包承接** | 各章已覆盖 |

再看新城。1.x 主线包 langchain 的 src 顶层只有 8 个条目：\`agents, browser.ts, chat_models, hub, load, prompts, storage, tools\`。它的 index.ts 导出面也印证了这种收敛：

\`\`\`ts
export * from "./agents/index.js";
export * from "./agents/middleware/index.js";
export { initChatModel } from "./chat_models/universal.js";
export { InMemoryStore } from "@langchain/core/stores";
export { type DocumentInput, Document } from "@langchain/core/documents";
\`\`\`

*— langchain/src/index.ts:53-69（commit 7704471）*

对比一下就知道迁移的主轴：**新包的顶层世界几乎只剩 agent 一件事**——agents 目录加上 middleware 的全量 re-export 占据导出面中心，其余（Store、Document、消息类型）都是 core 的转发。0.x 时代 chains/memory/retrievers/vectorstores/output_parsers 五大目录，在新包顶层一个都没有。

还有一个依赖方向的事实必须记住：langchain@1.6.6 的 package.json 里写着依赖 \`"@langchain/langgraph": "^1.6.1"\`。旧包不依赖任何编排引擎，新包的心脏是 LangGraph——这就是两代架构最硬的分界线（L02 讲过依赖方向，这里看到它的后果）。

### 三种去向，三种迁移工作量

把 30 个目录的去向归类，得到三种迁移模式，后面十几课都会用这个分类：

**第一种：精确替代，改 import 就完事。** \`text_splitter.ts:1\` 只有一行 \`export * from "@langchain/textsplitters"\`；\`storage/in_memory.ts:1\` 只有 \`export { InMemoryStore } from "@langchain/core/stores"\`。这类「旧路径」连逻辑都没变，迁移成本是零。

**第二种：概念替代，要重新表达。** LLMChain 没有同名新类，官方在自己的 JSDoc 里就示范新写法：

\`\`\`ts
// LLMChain 的 JSDoc 示例（llm_chain.ts:78-87）已经在教新写法
const chain = prompt.pipe(llm);
const response = await chain.invoke({ adjective: "funny" });
\`\`\`

*— langchain-classic/src/chains/llm_chain.ts:78-87（commit 7704471）*

注意这个细节的戏剧性：旧类的文档注释里写着新范式的示例。SequentialChain≈RunnableSequence、TransformChain≈RunnableLambda、路由链≈RunnableBranch，都是「语义一对一、代码重写」的概念替代。Memory 族更彻底：隐式变量读写协议被显式 messages 状态取代，摘要记忆变成 middleware。

**第三种：留 classic，无替代。** experimental 全族、SQL/Graph 垂类链、12 个花式 retriever、SqlToolkit——新架构没有对应物，官方选择留在 classic 继续可用。这不是失败者名单，而是「旧能力仍在服役」的清单，迁移决策树（L124）会教你怎么判。

### 官方留下的一块「移除告示牌」

classic 的入口体系本身就是迁移史的证据。根入口只有一条警告：

\`\`\`ts
console.warn(
  \`[WARNING]: The root "langchain" entrypoint is empty. Please use a specific entrypoint instead.\`
);
\`\`\`

*— langchain-classic/src/index.ts:1-3（commit 7704471）*

而 prompts 入口连警告都升级成了「移除告示」：

\`\`\`ts
console.warn(
  \`[ERROR]: The "langchain/prompts" entrypoint was removed in LangChain version 0.2.0.\`,
  \`Instead, please import from "@langchain/core/prompts".\`
);
\`\`\`

*— langchain-classic/src/prompts/index.ts:1-7（commit 7704471）*

把两条信息放在一起读，就能还原时间线：**0.2.0 完成了「大包拆小包」的第一刀**（Prompt 族归 core，旧入口留下指路牌），1.0 则是把剩余旧范式整体搬进 classic 冠名。所以迁移课上讲 Prompt 时没有「新版 Prompt」这种东西——它早就在 core 的家里了，\`PromptTemplate\`、\`ChatPromptTemplate\` 的正式住所是 @langchain/core/prompts。识别「core 有不等于 1.x 推荐」的方法也会贯穿后文：core 里的 memory.ts 类型还在，但只供 classic 消费（台账条目 37）。

### 本课小结

- @langchain/classic 是官方定位明确的「旧抽象收藏馆」（package.json 描述原话），与 1.x 并存维护，共享 core，迁移可以分批做。
- classic 30 目录的去向三类：改 import（转发空壳）、重新表达（概念替代）、留 classic（无替代）；1.x 主线顶层只剩 8 条目，重心收敛到 agent + middleware。
- 新包依赖 @langchain/langgraph 是两代架构的硬分界：0.x 编排靠 BaseChain 继承树，1.x 编排靠 Runnable 组合与 LangGraph 图。
- 0.2.0 是 Prompt 族归 core 的时间线节点，classic 里的移除告示就是迁移史的化石。
- 下一课解剖旧王国的宪法——BaseChain 的 call/values 协议，看清它为什么必须被淘汰。
`,
    null,
    [
      {
        text: '@langchain/classic 包在 package.json 里的 description 写的是什么？这透露了官方什么定位？',
        options: [
          '"Deprecated legacy layer"——即将下线',
          '"Old abstractions from LangChain.js"——它是旧抽象的官方收藏馆，跟随 1.x 同步发版而非立即废弃',
          '"Migration shim for 0.x users"——纯垫片',
          '没有 description 字段',
        ],
        answer: 1,
        explain:
          'langchain-classic/package.json:2-4 写的是 "Old abstractions from LangChain.js"，版本号 1.0.61 跟随 1.x 主线同步发版。A 错在「即将下线」没有依据——官方是新旧两包并存维护；C 错在它不只是垫片，chains/memory/experimental 等旧实现完整保留；D 错，description 就在文件开头。concept=lc-two-generations。',
        concept: 'lc-two-generations',
      },
      {
        text: '1.x 主线包 langchain 的 src 顶层只剩约 8 个条目，下列哪个目录不在其中？',
        options: ['agents（含 middleware）', 'memory', 'storage', 'chat_models'],
        answer: 1,
        explain:
          'langchain/src 顶层实际只有 agents、browser.ts、chat_models、hub、load、prompts、storage、tools 八个条目（实际 ls 取证）。memory 没有 1.x 对应目录——旧 memory 被拆解为 messages 状态 + checkpointer + middleware（如 summarizationMiddleware），概念被吸收而非目录平移。agents/chat_models/storage 都在新主线。concept=lc-two-generations。',
        concept: 'lc-two-generations',
      },
      {
        text: '在 classic 包里 import "langchain"（根入口）会发生什么？',
        options: [
          '正常导出全部旧 API',
          '抛出异常终止程序',
          '得到一条运行时警告：根入口是空的，请改用具体子入口（如 langchain/chains）',
          '静默返回空对象',
        ],
        answer: 2,
        explain:
          'langchain-classic/src/index.ts:1-3 是一条 console.warn（不是 throw）："The root \\"langchain\\" entrypoint is empty. Please use a specific entrypoint instead."。A 错在根入口确实不再导出任何 API；B 错在警告不中断执行，真正 throw 风格的报错出现在 prompts 入口（0.2.0 就移除了）；D 错在它并非完全静默。concept=lc-two-generations。',
        concept: 'lc-two-generations',
      },
      {
        text: '下列哪组 1.x 主线包顶层目录里的东西，在 classic 30 目录清单中是「整族只有 classic 有」的？',
        options: [
          'experimental（autogpt/babyagi/plan_and_execute）与 sql_db、smith、indexes、evaluation',
          'prompts 与 output_parsers',
          'text_splitter 与 storage',
          'chat_models 与 load',
        ],
        answer: 0,
        explain:
          'experimental/（autogpt、babyagi、plan_and_execute、generative_agents）整族只活在 classic，sql_db.ts、smith、indexes、evaluation 也是 classic 独占（台账条目 2）。B 错：prompts/output_parsers 的实现早已下沉 @langchain/core，不是 classic 独占；C 错：text_splitter.ts 只是一行 re-export 转发到 @langchain/textsplitters，storage 同理转发 core；D 错：chat_models 与 load 在新主线包都有自己的入口。concept=lc-two-generations。',
        concept: 'lc-two-generations',
      },
    ],
    [
      [
        '@langchain/classic',
        '旧 Chain/Memory/AgentExecutor 的隔离 npm 包，描述明写「Old abstractions」，跟随 1.x 同步发版的迁移缓冲区',
      ],
      [
        '两代架构',
        '0.x：BaseChain 子类 + memory 注入 + AgentExecutor 手写循环；1.x：Runnable 组合 + LangGraph 编译图，createAgent 内部就是编译后的 StateGraph',
      ],
      [
        '概念替代 vs 精确替代',
        '概念替代=旧 API 没有同名新类，用新原语重新表达（LLMChain→prompt.pipe(llm)）；精确替代=同名同签名换 import（initChatModel、InMemoryStore）',
      ],
    ],
    [
      '把 1.x 迁移理解为「删旧代码」——官方策略是 @langchain/classic 与 langchain 1.x 并存维护，共享同一个 @langchain/core，可以分批迁移',
      '以为 classic 包版本停在旧版本——classic 版本号是 1.0.61，跟随 1.x 主线同步发版，内容旧但发布节奏是新的',
      '对着 Python 版 LangChain 的目录结构背 TS 的目录清单——TS 的 classic 有 sql_db.ts、smith、indexes 等 Python 线没有的顶级条目',
    ],
  ),
  'theory',
)
