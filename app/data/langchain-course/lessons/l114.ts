import { L, withKind } from '../../course-builders.ts'

export const L114 = withKind(
  L(
    'L114',
    31,
    'Toolkits 与垂类链的去向：SqlToolkit/SqlDatabaseChain/GraphCypherQAChain',
    2,
    ['L108'],
    ['lc-toolkit-whereabouts'],
    [
      '能解释 Toolkit 这个组织形态（BaseToolkit + 工具清单 + createXxxAgent 工厂）为什么在 1.x 没有对应物',
      '能说出 SqlToolkit/SqlDatabaseChain/GraphCypherQAChain 三条迁移路径：拆工具传 tools、改造成 agent + tool、或整体留 classic',
      '拿到一个 classic 垂类链时，能按「依赖是否绑定旧协议」决策它属于哪条路径',
    ],
    `### 一、两类旧组织形态：工具集合体与垂类链

L108 处理的是通用 Chain 族（顺序、转换、路由），本课处理更垂直的两类旧 API：**Toolkits**（agents/toolkits/ 下的工具集合体）和**垂类链**（SQL、图数据库、审核等领域的专用 Chain）。它们退役的原因不同——Toolkit 死于「组织形态过时」，垂类链死于「协议绑死 BaseChain/LLMChain」——但迁移决策框架是同一套。先定位证据：1.x 主线包 \`langchain/src/\` 顶层只有 agents/browser/chat_models/hub/load/prompts/storage/tools 八个目录（ls 结果），没有任何 toolkit 或垂类链的容身之处；而 classic 的 toolkits 目录下有 sql/json/openapi/vectorstore/conversational_retrieval 五个子族。

### 二、解剖 SqlToolkit：工具集合体的形态与退役原因

先看 toolkit 到底长什么样：

\`\`\`ts
export class SqlToolkit extends BaseToolkit {
  tools: ToolInterface[];
  db: SqlDatabase;
  dialect = "sqlite";
  constructor(db: SqlDatabase, llm: BaseLanguageModelInterface) {
    super();
    this.db = db;
    this.tools = [
      new QuerySqlTool(db),
      new InfoSqlTool(db),
      new ListTablesSqlTool(db),
      new QueryCheckerTool({ llm }),
    ];
  }
}
export function createSqlAgent(llm, toolkit, args?) { ... }
\`\`\`

*— langchain-classic/src/agents/toolkits/sql/sql.ts:37-60（commit 7704471，节选）*

三个结构要点：toolkit 是「数据库连接 + 一组工具」的捆绑包；\`createSqlAgent\` 工厂把 toolkit 和模型组装成 AgentExecutor（JSDoc 示例就是 \`createSqlAgent(model, toolkit)\` 然后 \`executor.invoke({ input })\`）；四个工具共享同一个 \`db\` 句柄。**这个形态在 1.x 死于冗余**：toolkit 存在的两大理由——「工具组包」和「专属 agent 工厂」——分别被 \`createAgent({ tools })\` 的数组参数和模型原生 tool calling 吸收了。你不再需要一个「SQL agent 专属工厂」，因为任何支持 tool calling 的模型配上这四个工具就是一个 SQL agent。

迁移动作因此非常机械：拆出工具列表，交给通用入口。四个工具类本身（QuerySqlTool 等）定义在 classic 的 agents/toolkits/sql/tools.ts，短期内可以继续从 classic import 这些工具类、只把运行时换成 createAgent；更彻底的路径是按 L21/L22 的 tool() 工厂自己重写这四个工具（它们的逻辑就是「拼 SQL 字符串→调 db」）。新旧两段代码放在一起，改写的机械感一目了然：

\`\`\`ts
// 旧：toolkit + 专属 agent 工厂（classic agents/toolkits/sql/sql.ts JSDoc 示例形状）
import { SqlToolkit } from "langchain/agents/toolkits/sql";
const toolkit = new SqlToolkit(sqlDb, model);
const executor = createSqlAgent(model, toolkit);
const result = await executor.invoke({
  input: "List the total sales per country.",
});
console.log(\`Got output \${result.output}\`);

// 新：工具直传 createAgent，toolkit 与专属工厂双双退场
import { createAgent } from "langchain";
const sqlAgent = createAgent({
  model: "openai:gpt-4o",
  tools: [querySqlTool, infoSqlTool, listTablesSqlTool, queryCheckerTool],
  prompt: "你是 SQL 分析助手，先看表结构再写查询。",
});
const out = await sqlAgent.invoke({
  messages: [{ role: "user", content: "各国销售总额是多少？" }],
});
\`\`\`

旧例的调用形状来自 sql.ts:31-37 的 JSDoc（\`createSqlAgent(model, toolkit)\` → \`executor.invoke({ input })\`），新例按 langchain/src/agents/index.ts:89-106 的 createAgent 示例形状编写。注意输出通道也换了：旧 executor 返回 \`{ output }\` 字典（call/values 协议的残留），新 agent 返回 messages 状态数组，最终回答取 \`messages.at(-1)\`——这是 L103 讲过的协议换代在调用侧的直接体现。

### 三、垂类链：绑死旧协议，无法改 import 逃逸

垂类链的处境更被动。看三个代表类的内部依赖：

\`\`\`ts
export class SqlDatabaseChain extends BaseChain {
  llm: BaseLanguageModelInterface;
  database: SqlDatabase;
  prompt = DEFAULT_SQL_DATABASE_PROMPT;
\`\`\`

*— langchain-classic/src/chains/sql_db/sql_db_chain.ts:68-80（commit 7704471，节选）*

\`\`\`ts
export class GraphCypherQAChain extends BaseChain {
  private graph: any;
  private cypherGenerationChain: LLMChain;
  private qaChain: LLMChain;
\`\`\`

*— langchain-classic/src/chains/graph_qa/cypher.ts:65-71（commit 7704471，节选）*

两条铁证：SqlDatabaseChain 直接 extends BaseChain（call/values 协议，L103 讲过为什么必须淘汰）；GraphCypherQAChain 更深——内部持有**两个 LLMChain 实例**（生成 Cypher 的链 + 根据查询结果回答的链），等于把旧协议叠了两层。这类实现不存在「改 import 就迁移」的选项，只有三条路：

| 路径 | 适用场景 | 代价 |
|---|---|---|
| 留 classic | 功能可用、迁移收益低、团队维护窗口紧 | 与新包并存（L120 讲共存机制），长期承受 classic 冻结风险 |
| 拆成 agent + tool | 领域能力本质是「给模型几个工具」 | 把链内隐藏的 prompt/解析逻辑显式化为工具描述与 middleware |
| LCEL 重写 | 需要链内固定流程（如「先生成语句再执行再总结」两段式） | 按 L107 公式把每个 LLMChain 改成 prompt.pipe(llm)，用 RunnableSequence 串接 |

GraphCypherQAChain 是第三条路的典型教材：它的两段结构翻译成 LCEL 就是 \`cypherGen.pipe(execute).pipe(qaChain)\` 的 RunnableSequence，每一段用 L107 的 prompt.pipe(llm) 公式。SqlDatabaseChain 则更接近第二条路——单段「自然语言→SQL→执行」，用 createAgent + 一个 executeSqlTool 表达更自然。

### 四、垂类族全景与「审核链」的形态升级

把 classic 里的垂类实现清一遍（类名与路径均来自台账证据 12 与源码 grep）：

| classic 实现 | 路径:行 | 1.x 去向 |
|---|---|---|
| SqlDatabaseChain / SqlToolkit | chains/sql_db/sql_db_chain.ts:68；agents/toolkits/sql/sql.ts:37 | 拆工具 + createAgent，或留 classic |
| GraphCypherQAChain | chains/graph_qa/cypher.ts:65 | LCEL 重写两段式，或留 classic |
| APIChain | chains/api/api_chain.ts:40 | createAgent + HTTP 请求工具 |
| ConstitutionalChain / ConstitutionalPrinciple | chains/constitutional_ai/constitutional_chain.ts:48 | 用 modelRetry/wrapModelCall 类 middleware 表达「原则修正」循环 |
| OpenAIModerationChain | chains/openai_moderation.ts:56 | \`openAIModerationMiddleware\`（middleware/index.ts:98-101） |
| VectorDBQAChain / ChatVectorDBQAChain / ConversationalRetrievalQAChain | chains/vector_db_qa.ts:32 等 | L121 走查的 RAG 迁移模式 |

其中 OpenAIModerationChain 值得单独看一眼，因为它展示了 1.x 的**形态升级规律**：旧架构里「调用前校验」是一个独立 chain，需要你手工把它串进流水线；新架构里它变成 middleware 切面，\`createAgent({ middleware: [openAIModerationMiddleware(...)] })\` 一行挂载，执行时机由 agent 图保证。这不是审核能力独有的升级——L109-L111 的 memory 族、L115 的 executor 开关，都在走同一条「散装步骤 → 可组合切面」的路。理解这个规律后，遇到任何 classic 垂类实现，先问一句：它是一个「步骤」还是一个「循环」？步骤找 middleware，循环找 agent 图。

### 五、工厂解剖：createSqlAgent 为什么必须陪葬

第二节说 toolkit「死于冗余」，其实只说了一半——另一半原因是它的专属工厂内部绑死了整套旧协议。看 SqlToolkit 的 import 面（逐行核实）：

\`\`\`ts
import { type ToolInterface, BaseToolkit } from "@langchain/core/tools";
import {
  InfoSqlTool,
  ListTablesSqlTool,
  QueryCheckerTool,
  QuerySqlTool,
} from "../../../tools/sql.js";
import { LLMChain } from "../../../chains/llm_chain.js";
import { ZeroShotAgent, ZeroShotCreatePromptArgs } from "../../mrkl/index.js";
import { AgentExecutor } from "../../executor.js";
\`\`\`

*— langchain-classic/src/agents/toolkits/sql/sql.ts:2-13（commit 7704471，节选）*

四个事实改写直觉。第一，\`BaseToolkit\` 竟然定义在 core（@langchain/core/tools，sql.ts:2），classic 的 agents/toolkits/base.ts 只是一行 \`export { BaseToolkit as Toolkit } from "@langchain/core/tools"\` 转发——**toolkit 的抽象也没死，死的只是组装方式**。第二，四个 SQL 工具的真身不在 toolkits 目录，而在 classic 顶层的 \`tools/sql.js\`（sql.ts:4-9 的 import 路径）——拆工具迁移时 import 来源要认对。第三，import 里同时挂着 LLMChain、ZeroShotAgent、AgentExecutor 三件旧协议核心件（sql.ts:11-13）。第四，createSqlAgent（sql.ts:56 起）的内部组装用 \`ZeroShotAgent.createPrompt\` 生成 prompt、\`new ZeroShotAgent({...})\` 组装 agent（sql.ts:73-79）——**SQL agent 的专属工厂造出来的其实是 mrkl 文本协议 agent**（L113 的五套协议之一），连 QueryCheckerTool 需要 llm 的构造依赖也是为这套协议服务的。

所以三条迁移路径的判定可以更精确：工具本体（tools/sql.js 的四个类）依赖面干净、可直接传给 createAgent；toolkit 壳与 createSqlAgent 工厂绑死 ZeroShotAgent/AgentExecutor，必须退役；而「QueryCheckerTool 需要 llm」在新形态下不再特殊——任何需要模型介入的工具（比如让模型校验 SQL）都可以用 responseFormat 或包一层 model-call 逻辑表达，不再是 toolkit 构造时的隐式注入。遇到其他 toolkit（json/openapi/vectorstore）时，先看它的工厂 import 了哪套 agent 协议——绑定程度决定它是「拆工具即可」还是「整体重写」。

### 本课小结

- Toolkit 形态（BaseToolkit + 专属 agent 工厂）被 \`createAgent({ tools })\` 吸收：SqlToolkit 的四个工具（QuerySqlTool/InfoSqlTool/ListTablesSqlTool/QueryCheckerTool，sql.ts:46-51）拆出来直传即可。
- 垂类链绑死 BaseChain/LLMChain 协议（sql_db_chain.ts:68、cypher.ts:70-71），不存在纯改 import 的迁移，只有留 classic / 拆 tool / LCEL 重写三条路。
- OpenAIModerationChain → openAIModerationMiddleware 展示了 1.x 的形态升级规律：步骤找 middleware，循环找 agent 图。
- 下一课把视角拉到全景：AgentExecutor 那些散装构造开关（maxIterations/handleParsingErrors/…）如何一一映射到 20+ 个 middleware——这是模块五知识与迁移课的会师点。
`,
    null,
    [
      {
        text: 'SqlToolkit（classic agents/toolkits/sql/sql.ts:37）在 1.x 的官方对应物是？',
        options: [
          '新包 langchain 里有同名的 SqlToolkit',
          '无对应物：把 QuerySqlTool/InfoSqlTool/ListTablesSqlTool/QueryCheckerTool 四个工具拆出来直接传给 createAgent 的 tools 参数',
          '由 summarizationMiddleware 间接替代',
          '迁移到 @langchain/core/tools 下的同名类',
        ],
        answer: 1,
        explain:
          '1.x 主线包顶层目录只有 agents/browser/chat_models/hub/load/prompts/storage/tools，没有任何 toolkit——Toolkit 作为「工具集合体 + 专属 agent 工厂」的形态整体无对应物，官方迁移路径就是把 toolkit.tools 数组交给 createAgent。A/C 错：新包没有也不可能有这个类；D 错：core 只定义工具抽象（StructuredTool/tool()），不收垂类工具集合。',
        concept: 'lc-toolkit-whereabouts',
      },
      {
        text: 'SqlDatabaseChain（classic chains/sql_db/sql_db_chain.ts:68）与 SqlToolkit 的本质区别是？',
        options: [
          '前者是 BaseChain 子类（链式编排），后者是工具集合体（BaseToolkit 子类）——退役原因不同但去向上游一致',
          '两者都是 BaseToolkit 子类',
          '前者在新包有精确替代，后者没有',
          '前者只支持 PostgreSQL，后者只支持 SQLite',
        ],
        answer: 0,
        explain:
          'SqlDatabaseChain extends BaseChain（sql_db_chain.ts:68），是「自然语言→SQL→执行→总结」的链式编排，随 BaseChain 协议一起退役（L103）；SqlToolkit extends BaseToolkit（sql.ts:37），是工具打包形态，随 toolkit 形态退役。两者的退役原因不同，但迁移出口一致：能力要么拆成 tool 交给 createAgent，要么整体留 classic。C 错：两者在新包都无同名物。D 错：dialect 默认 "sqlite" 但不锁定数据库（sql.ts:44 附近字段）。',
        concept: 'lc-toolkit-whereabouts',
      },
      {
        text: 'GraphCypherQAChain（classic chains/graph_qa/cypher.ts:65）内部依赖什么使其不能直接「改 import」迁移？',
        options: [
          '依赖 OpenAI 专有 API',
          '内部持有两个 LLMChain（cypherGenerationChain 与 qaChain），依赖旧 Chain 协议，必须按 L107 的方式用 LCEL 重写',
          '依赖 LangGraph 的 StateGraph',
          '它其实可以纯改 import 迁移',
        ],
        answer: 1,
        explain:
          'cypher.ts:65-75 显示 GraphCypherQAChain 私有字段里有 cypherGenerationChain: LLMChain 与 qaChain: LLMChain——两个旧链协议的硬依赖，1.x 里 LLMChain 无对应物，所以只能留 classic 或按 LLMChain→prompt.pipe(llm) 的 LCEL 公式手工重写。A 错：它是图数据库链不绑定 OpenAI；C 错：垂类链不依赖 LangGraph；D 错：凡是内部持 LLMChain 的 classic 实现都无法纯改 import。',
        concept: 'lc-toolkit-whereabouts',
      },
      {
        text: 'OpenAIModerationChain（classic chains/openai_moderation.ts:56）在 1.x 的精神续作是？',
        options: [
          'responseFormat 的 JsonSchema 模式',
          'middleware openAIModerationMiddleware（langchain/src/agents/middleware/provider/openai/moderation.js，经 middleware/index.ts:98-101 导出）',
          'InMemoryStore',
          '没有续作，审核能力彻底移除',
        ],
        answer: 1,
        explain:
          '旧审核是 chain 形态（独立调用一次 moderation API）；1.x 把它变成 agent 的前置切面——openAIModerationMiddleware 在 middleware/index.ts:98-101 导出，挂在模型调用前拦截。这体现模块五讲过的规律：旧架构里「散装的处理步骤」在新架构统一变成可组合的 middleware 切面。A 错：responseFormat 管结构化输出；C 错：InMemoryStore 是键值存储；D 错：能力有续作只是换了形态。',
        concept: 'lc-toolkit-whereabouts',
      },
    ],
    [
      [
        'BaseToolkit',
        'classic 的工具集合体抽象（agents/toolkits/base.ts）：持有 tools 数组并提供 getTools()，配套 createXxxAgent 工厂；1.x 无对应物',
      ],
      [
        'SqlDatabase',
        'classic sql_db.ts 定义的数据库封装（依赖 typeorm），SqlDatabaseChain/SqlToolkit 的共享底座；1.x 主线无数据库抽象',
      ],
      [
        'createSqlAgent',
        'classic 里 toolkit 专属的 agent 工厂（agents/toolkits/sql/sql.ts:60 附近）：把 toolkit + model 组装成 AgentExecutor；1.x 被 createAgent({ model, tools }) 的通用形态取代',
      ],
    ],
    [
      '以为「1.x 支持 toolkit」——主线包没有任何 toolkit 目录，agents/toolkits 整族只活在 classic；不要在新代码里 import 它们',
      '把 SqlToolkit 拆工具迁移时漏掉 QueryCheckerTool 对 llm 的构造依赖——四个工具里有一个需要模型实例，拆出来后要用新包的模型接入方式重新注入',
      '把垂类链（Sql/Graph/Constitutional）当「旧但可用」长期写进新代码——它们绑定 BaseChain/LLMChain 协议，不与新包共享执行世界观，混用只会增加 L120 要讲的双包维护成本',
    ],
  ),
  'framework',
)
