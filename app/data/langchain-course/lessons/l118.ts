import { L, withKind } from '../../course-builders.ts'

export const L118 = withKind(
  L(
    'L118',
    31,
    '检索层迁移：BaseRetriever 下沉、12 个花式 retriever 留守',
    2,
    ['L87'],
    ['lc-retriever-migration'],
    [
      '能画出检索层的分层格局：BaseRetriever/BaseDocumentCompressor 抽象在 core、12 个策略实现留守 classic、1.x 主线包两者皆无',
      '能用 core 的 BaseDocumentCompressor 契约把 LLMChainExtractor 重写成 LCEL 版压缩器，跑通压缩前后文档数对照',
      '拿到一个 classic 花式 retriever 时，能按「实现复杂度 + 内部是否持 LLMChain」给出留用/重写/换 createAgent+tool 三种决策',
    ],
    `### 一、检索层的分层格局：抽象下沉，实现留守

检索层（L87 讲过运行时契约）在迁移地图上的格局很特殊：**抽象类全部下沉 core，策略实现全部留守 classic，1.x 主线包两头都不沾**。先取三层证据。

第一层，core 的抽象。\`langchain-core/src/retrievers/index.ts:65\`：

\`\`\`ts
export abstract class BaseRetriever<
  // Metadata 泛型默认 Record<string, any>
> {
  // 子类实现 _getRelevantDocuments(query, runManager?)
  // 对外经 getRelevantDocuments / .invoke 暴露 Runnable 接口
}
\`\`\`

*— langchain-core/src/retrievers/index.ts:65 起（commit 7704471，骨架节选）*

配套的 \`BaseRetrieverInterface extends RunnableInterface<string, DocumentInterface<Metadata>[]>\`（同文件 :41-46）把 retriever 的 Runnable 身份写进了接口契约——**检索器就是一条以查询字符串为入参的 Runnable**，这是 1.x 检索层的世界观底座。压缩抽象也在 core：\`BaseDocumentCompressor\`（retrievers/document_compressors/index.ts:7-27），唯一抽象方法 \`compressDocuments(documents, query, callbacks?)\` 返回 \`Promise<DocumentInterface[]>\`。

第二层，classic 的实现。12 个花式 retriever 与 3 个压缩器（类名与行号来自源码 grep 与台账证据 32）：

| classic 实现 | 路径:行 | 策略一句话 |
|---|---|---|
| MultiQueryRetriever | multi_query.ts:91 | 让 LLM 生成多角度查询再合并结果 |
| HydeRetriever | hyde.ts:64 | 先生成假设性答案再拿它去检索 |
| EnsembleRetriever | ensemble.ts:25 | 多路检索结果融合排序（RRF） |
| ContextualCompressionRetriever | contextual_compression.ts:35 | 检索后挂压缩器过滤 |
| SelfQueryRetriever | self_query/index.ts:62 | LLM 把自然语言解析成结构化过滤条件 |
| ParentDocumentRetriever | parent_document.ts:67 | 子块检索返回父文档 |
| MultiVectorRetriever | multi_vector.ts:41 | 多表示向量检索 |
| TimeWeightedVectorStoreRetriever | time_weighted.ts:43 | 时间衰减加权 |
| MatryoshkaRetriever | matryoshka_retriever.ts:68 | 嵌套向量多分辨率 |
| ScoreThresholdRetriever | score_threshold.ts:17 | 分数阈值过滤 |
| LLMChainExtractor / EmbeddingsFilter / DocumentCompressorPipeline | document_compressors/chain_extract.ts:62、embeddings_filter.ts:33、index.ts:59 | 压缩器三件套 |

第三层，1.x 主线包。\`langchain/src/\` 顶层没有 retrievers 目录——主线把检索视为「组合出来的东西」（Runnable 管线或 agent 工具），不提供具体策略。

### 二、为什么这样分层：抽象是契约，策略是库存

这套格局的迁移含义要拆成两问。第一问：**新代码里还能定义自己的 retriever 吗？** 能，而且应该——继承 core 的 BaseRetriever，实现 \`_getRelevantDocuments\`，它天然是 Runnable，可以 pipe 进任何链。core 抽象下沉的意义正在于此：检索器的「身份协议」被 1.x 承认，留存的只是策略库存。第二问：**12 个花式实现要不要急着搬？** 大多数不用。它们是纯算法策略（MultiQuery 的 prompt 工程、Ensemble 的 RRF 融合），实现稳定、依赖封闭，与 1.x 代码共享 core 类型（L120 讲类型互通），留用成本近乎为零。

真正需要动的是**内部拖旧协议的少数派**，判别标准一条：类内部是否持有 LLMChain 或 classic 专属类。逐个排查的结果——LLMChainExtractor 名字里就写着 LLMChain（chain_extract.ts:62，内部逐文档调旧链）；SelfQueryRetriever 依赖 classic 的结构化查询解析器（query_constructor 族，台账证据 12 提及 StructuredQueryOutputParser/AttributeInfo）；ContextualCompressionRetriever 本身干净，但它默认装载的压缩器（LLMChainExtractor/LLMChainFilter）拖旧链。**干净策略可留，脏依赖策略要么重写要么绕开。**

### 三、重写实操：LLMChainExtractor 的 LCEL 化

以最典型的 LLMChainExtractor 为例，把「旧链压缩器」改成 LCEL 版。先看旧实现的核心契约（按 classic 源码形状复原）：

\`\`\`ts
// 旧：classic retrievers/document_compressors/chain_extract.ts:62 形状
import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import { LLMChain } from "../../chains/llm_chain.js";   // ← 旧协议依赖

export class LLMChainExtractor extends BaseDocumentCompressor {
  llmChain: LLMChain;   // 内部持旧链：逐文档「提取相关内容」
  async compressDocuments(documents, query, callbacks?) {
    const results = await Promise.all(documents.map((doc) =>
      this.llmChain.call({ question: query, docs: doc.pageContent })));
    return documents.filter((_, i) => (results[i] as any).text.trim() !== "NO_OUTPUT");
  }
}
\`\`\`

重写公式（L107 的 prompt.pipe(llm) + RunnableLambda 映射）：

\`\`\`ts
// 新：LCEL 版压缩器，实现同一个 core 契约
import { BaseDocumentCompressor } from "@langchain/core/retrievers/document_compressors";
import { Document } from "@langchain/core/documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda } from "@langchain/core/runnables";
import { initChatModel } from "langchain";
import type { DocumentInterface } from "@langchain/core/documents";

const extractPrompt = ChatPromptTemplate.fromMessages([
  ["system",
   "从给定上下文中提取与问题直接相关的原句。若无相关内容只回复 NO_OUTPUT。"],
  ["human", "问题：{question}\\n上下文：{context}"],
]);

class LcelChainExtractor extends BaseDocumentCompressor {
  private model = initChatModel("openai:gpt-4o");

  private extractor = extractPrompt.pipe(this.model).pipe(
    new RunnableLambda({ func: (m: any) => String(m.content) })
  );

  async compressDocuments(
    documents: DocumentInterface[],
    query: string
  ): Promise<DocumentInterface[]> {
    const results = await Promise.all(
      documents.map((doc) => this.extractor.invoke({ question: query, context: doc.pageContent }))
    );
    return documents.filter((_, i) => results[i].trim() !== "NO_OUTPUT");
  }
}

// 验收对照：压缩前后文档数与内容
const docs = [
  new Document({ pageContent: "该电池续航 48 小时，充电 20 分钟充满。" }),
  new Document({ pageContent: "公司成立于 1998 年，总部在东京。" }),
];
const compressed = await new LcelChainExtractor().compressDocuments(docs, "续航多久？");
console.log(compressed.length);   // 1：无关文档被过滤
expect(compressed[0].pageContent).toContain("48 小时");
\`\`\`

注意保真的三个细节：实现同一个 core 抽象（BaseDocumentCompressor），所以能直接塞进留存的 ContextualCompressionRetriever 里当压缩器用——**重写的是实现，不是契约**；返回语义与旧版一致（过滤掉空结果而非抛错）；并发结构 Promise.all 与旧版相同。跑通压缩前后对照，这一项就闭环了。

### 四、决策树：12 个花式 retriever 的三种命运

把本课的判断收敛成一棵决策树：

1. **内部干净（只依赖 core 类型）** → 留用 classic 版：EnsembleRetriever、ScoreThresholdRetriever、TimeWeightedVectorStoreRetriever、MultiVectorRetriever、MatryoshkaRetriever、EmbeddingsFilter、DocumentCompressorPipeline。它们与 1.x 代码同进程共存（L120），类型互通。
2. **拖旧协议（持 LLMChain/classic 专属类）且策略是你需要的** → 手工 LCEL 重写：LLMChainExtractor、LLMChainFilter、SelfQueryRetriever（重写重点是把 query_constructor 换成 responseFormat/withStructuredOutput 的结构化解析）。
3. **策略形态其实是「给模型的工具」** → 改造成 createAgent 工具：例如 SelfQueryRetriever 的「解析过滤条件」本质可用 responseFormat 表达后并入 agent；多路检索的「选路」交给 modelRouterMiddleware（L115）。

三种命运不是互斥的终局——留用是低风险起点，重写与工具化是演进方向；L124 的留守清单会把这棵树并入全局决策框架。

### 五、依赖封闭度抽查：三份 import 面取证

第四节决策树的第一判据「依赖封闭度」值得用真实 import 面验证一遍，因为它直接决定留用成本。抽三个代表：

\`\`\`ts
// EnsembleRetriever：纯 core 类型，封闭度最高
import { BaseRetriever, BaseRetrieverInput } from "@langchain/core/retrievers";
import { Document, DocumentInterface } from "@langchain/core/documents";
import { CallbackManagerForRetrieverRun } from "@langchain/core/callbacks/manager";
\`\`\`

*— langchain-classic/src/retrievers/ensemble.ts:1-3（commit 7704471）*

EnsembleRetriever 的 import 面只有三行 core——这就是它有资格「长期共存」的物理证据：与 1.x 代码同进程时，它消费的类型与你的新代码消费的类型是同一份 core 定义，无版本冲突面、无旧协议传染。对比 MultiQueryRetriever 的内部（multi_query.ts:100 \`private llmChain: LLMChain<LineList>\`，:135 \`new LLMChain({ llm, prompt, outputParser })\` 构造于 fromLLM）——它把旧链协议拖进了实现核心，多角度查询生成整段逻辑依赖 LLMChain 的 call/values 协议跑，这就是「不封闭」的样子。ScoreThresholdRetriever 的 import 同样收敛在 core documents/tools 侧，属于封闭阵营。

这个抽查方法可以推广成一条操作化规则：**对候选留用的 classic 实现，跑一遍 \`grep "^import" <file>\`，看非 core 的 import 有几条**。零条非 core（或只有 @langchain/textsplitters 这类独立基础包）→ 封闭，放心留用；出现 chains/llm_chain、memory/、agents/ 等 classic 内部路径 → 不封闭，进重写或隔离分支。十二个花式 retriever 用这条规则扫一遍，三种命运的分档与第四节的决策树结论完全吻合——决策树不是拍脑袋，是 import 面取证的自然结果。

### 本课小结

- 检索层是「抽象下沉、实现留守」格局：BaseRetriever（core retrievers/index.ts:65）与 BaseDocumentCompressor（document_compressors/index.ts:7）在 core，12 个策略实现留 classic，1.x 主线包不提供任何策略。
- 判别迁移必要性的一条铁标准：类内部是否持有 LLMChain/classic 专属类；干净策略可长期留用。
- LLMChainExtractor 重写实操证明：换实现不换契约——LCEL 版压缩器实现同一个 core 抽象，可无缝插回留存的编排 retriever。
- retriever 与 tool 不同构：塞给 agent 前要么保持检索形态（asRetriever 桥）要么包成 StructuredTool。
- 下一课到底座层：VectorStore/Embeddings/Document 的「纯换包名」迁移，以及一个必须点破的同名陷阱——classic 的 createReactAgent 不是新包的 createAgent。
`,
    null,
    [
      {
        text: 'BaseRetriever 抽象在 1.x 的住址与继承关系是？',
        options: [
          '住在新包 langchain/retrievers',
          '住在 @langchain/core/retrievers（retrievers/index.ts:65），实现 Runnable 接口——retriever 本质是一条以字符串为入参的 Runnable',
          '已删除，被 VectorStore.similaritySearch 取代',
          '住在 classic 包，与 0.x 位置相同',
        ],
        answer: 1,
        explain:
          'core retrievers/index.ts:65 是 export abstract class BaseRetriever，配套的 BaseRetrieverInterface extends RunnableInterface<string, DocumentInterface[]>（:41-46 附近）——抽象显式声明了 retriever 的 Runnable 身份。1.x 主线包顶层没有 retrievers 目录；classic 里的 12 个花式实现全部继承这个 core 抽象。A 错：新包无检索实现；C 错：向量库直查只是 retriever 的一种简化形态；D 错：抽象已在 core，classic 只留实现。',
        concept: 'lc-retriever-migration',
      },
      {
        text: 'LLMChainExtractor（classic retrievers/document_compressors/chain_extract.ts:62）为什么是花式 retriever 里最需要手工重写的一个？',
        options: [
          '它性能太差',
          '它 extends BaseDocumentCompressor 且内部依赖 LLMChain——名字里就带着旧协议，必须按 L107 公式改成 LCEL',
          '它在 core 有精确替代',
          '它只支持 OpenAI 模型',
        ],
        answer: 1,
        explain:
          'chain_extract.ts:62 显示它继承 core 的 BaseDocumentCompressor（compressDocuments 契约），但内部用 LLMChain 逐文档做「相关性提取」——旧链协议硬依赖使它无法改 import 迁移，重写公式是 prompt.pipe(llm) + RunnableLambda 逐文档映射。B 里「最需要」的理由即 LLMChain 依赖；A/C/D 均与协议依赖无关。',
        concept: 'lc-retriever-migration',
      },
      {
        text: 'ContextualCompressionRetriever（classic retrievers/contextual_compression.ts:35）在 1.x 的对应物是？',
        options: [
          'createAgent 内置了上下文压缩',
          '无官方同名替代：抽象（BaseDocumentCompressor）在 core、实现留 classic，需要时可按 LCEL 自组「检索→压缩→过滤」管线',
          '被 summarizationMiddleware 取代',
          '被移入 @langchain/core/retrievers',
        ],
        answer: 1,
        explain:
          'contextual_compression.ts:35 的实现留守 classic，core 只有 BaseDocumentCompressor 抽象（core retrievers/document_compressors/index.ts:7-27）——这是模块九反复出现的「抽象下沉、实现留守」格局。summarizationMiddleware 管的是对话上下文不是文档压缩，二者同名不同物；agent 的上下文编辑（contextEditingMiddleware）同样与文档压缩无关。',
        concept: 'lc-retriever-migration',
      },
      {
        text: '判断一个 classic retriever 能否「留用而不迁移」，下列哪个因素不构成阻碍？',
        options: [
          '内部持有 LLMChain 实例',
          '构造参数引用 classic 的 MemoryVectorStore',
          '它继承 core 的 BaseRetriever 并只依赖 core 类型',
          '它依赖 classic 的 self_query 解析器',
        ],
        answer: 2,
        explain:
          '留用 classic retriever 的最大风险是旧协议依赖（LLMChain、classic 专属类）拖住整个依赖面。若实现只继承 core 抽象、只依赖 core 类型（如 EnsembleRetriever 这类纯编排策略），它与 1.x 代码共存时类型互通（L120），可以长期留用。A/B/D 三种情况都把 classic 内部实现（旧链、classic 向量库、self_query 解析器）拖进了依赖图，属于要优先重写的信号。',
        concept: 'lc-retriever-migration',
      },
    ],
    [
      [
        'BaseRetriever',
        'core 检索抽象（retrievers/index.ts:65）：子类实现 _getRelevantDocuments，对外表现 Runnable<string, DocumentInterface[]>',
      ],
      [
        'BaseDocumentCompressor',
        'core 文档压缩抽象（retrievers/document_compressors/index.ts:7）：compressDocuments(documents, query) 返回过滤后的文档数组',
      ],
      [
        '花式 retriever',
        '本课术语：classic 里基于 BaseRetriever 实现的高级检索策略（MultiQuery/HyDE/Ensemble/SelfQuery 等 12 个），无官方 1.x 替代',
      ],
    ],
    [
      '以为 1.x 「原生支持」MultiQueryRetriever 等策略——这些实现只在 classic；不要在新代码里假装它们来自主线包',
      '重写 LLMChainExtractor 时忘了 compressDocuments 的返回语义——它返回过滤后的 DocumentInterface[]（可能为空），不是抛错；错误哲学是「过滤即数据」（L13 同源思想）',
      '把 retriever 直接塞进 createAgent 的 tools——retriever 的入参是字符串、出参是 Document[]，与工具契约不同构；要么用 asRetriever 桥（L87）保持检索形态，要么包一层 StructuredTool 变成真工具',
    ],
  ),
  'framework',
)
