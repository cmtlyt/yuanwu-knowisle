import { L, withKind } from '../../course-builders.ts'

export const L87 = withKind(
  L(
    'L87',
    24,
    '检索环：BaseRetriever 骨架 + asRetriever 桥 + MMR',
    2,
    ['L86'],
    ['lc-retriever-mmr'],
    [
      '从零实现一个自定义 BaseRetriever 子类，写出 _getRelevantDocuments 并跑通 invoke 回调三相',
      '接入 asRetriever 双签名把任意 VectorStore 变成 LCEL 可 pipe 的检索器，构建 RAG 检索段链',
      '调通 searchType: "mmr" 检索，验证 fetchK/lambda 两参数对多样性的实际影响',
    ],
    `### 检索环：把向量库变成 LCEL 一等公民

前三课把文本变成了向量、向量落了库；本课把「库」变成「检索器」——一个能 pipe、能被观测、能选 MMR 的 Runnable。核心结论：**Retriever 是存储环与 LCEL 世界之间的适配层，其骨架就是一段手写的回调三相编排**。本课是 practice 课型：先读骨架，再动手实现一个自定义检索器并跑通，最后接入 MMR 验证能力协商。

### 读骨架：BaseRetriever 的 invoke 三相

\`\`\`ts
export abstract class BaseRetriever<Metadata extends Record<string, any> = Record<string, any>>
  extends Runnable<string, DocumentInterface<Metadata>[]>
  implements BaseRetrieverInterface
{
  callbacks?: Callbacks;
  tags?: string[];
  metadata?: Record<string, unknown>;
  verbose?: boolean;

  _getRelevantDocuments(_query: string, _callbacks?: CallbackManagerForRetrieverRun)
    : Promise<DocumentInterface<Metadata>[]> {
    throw new Error("Not implemented!");
  }

  async invoke(input: string, options?: RunnableConfig): Promise<DocumentInterface<Metadata>[]> {
    const parsedConfig = ensureConfig(parseCallbackConfigArg(options));
    const callbackManager_ = await CallbackManager.configure(
      parsedConfig.callbacks, this.callbacks,
      parsedConfig.tags, this.tags,
      parsedConfig.metadata, this.metadata,
      { verbose: this.verbose }
    );
    const runManager = await callbackManager_?.handleRetrieverStart(
      this.toJSON(), input, parsedConfig.runId, ...);
    try {
      const results = await this._getRelevantDocuments(input, runManager);
      await runManager?.handleRetrieverEnd(results);
      return results;
    } catch (error) {
      await runManager?.handleRetrieverError(error);
      throw error;
    }
  }
}
\`\`\`

*— langchain-core/src/retrievers/index.ts:65-173（commit 7704471）*

三点对照。其一，泛型签名 \`Runnable<string, DocumentInterface[]>\` 钉死了检索环的 I/O 形态：**输入是查询字符串，输出是文档数组**——比 VectorStore 的向量级接口高一整层。其二，\`_getRelevantDocuments\` 上方注释写得非常坦诚：本该是 abstract，但为了不破坏现有的自定义子类，推迟到下一个大版本（retrievers/index.ts:107-110）。未实现时默认抛 Not implemented。其三，invoke **没有走** Runnable 基类的通用回调路径，而是手动编排 configure → start → end/error 三相——retriever 是独立的一等 run 类型，不是 chain 的伪装。构造器里 callbacks/tags/metadata/verbose 四件套默认值齐备（99-105 行），它们就是 BaseRetrieverInput 接口——所有检索器的观测性配置面。

还有第四点藏在可选链里：\`callbackManager_?.handleRetrieverStart\` 与 \`runManager?.handleRetrieverEnd\` 全程可选——**调用方没传任何 handler 时 callbackManager_ 为 undefined，三相编排整体退化为一次普通函数调用**，零回调开销。runManager 也可能是 undefined（configure 后无监听者），所以子类钩子收到它的第二参数时必须按可选处理——这正是手写 KeywordRetriever 时 \`runManager?\` 签名的来历。回调开销只在有人观测时才发生，这是「观测旁路」设计落到运行时的证据。

### 适配桥：asRetriever 的双签名

\`\`\`ts
asRetriever(kOrFields?: number | Partial<VectorStoreRetrieverInput<this>>, filter?, callbacks?, tags?, metadata?, verbose?): VectorStoreRetriever<this> {
  if (typeof kOrFields === "number") {
    return new VectorStoreRetriever({ vectorStore: this, k: kOrFields, filter, tags: [...(tags ?? []), this._vectorstoreType()], ... });
  } else {
    const params = { vectorStore: this, k: kOrFields?.k, filter: kOrFields?.filter, tags: [...(kOrFields?.tags ?? []), this._vectorstoreType()], ... };
    if (kOrFields?.searchType === "mmr") {
      return new VectorStoreRetriever({ ...params, searchKwargs: kOrFields.searchKwargs });
    }
    return new VectorStoreRetriever({ ...params });
  }
}
\`\`\`

*— langchain-core/src/vectorstores.ts:810-847（commit 7704471）*

\`VectorStoreRetriever\` 是存储环到检索环的**适配器类**：它 extends BaseRetriever，内部持有一个 VectorStore 实例。\`asRetriever\` 是挂在每个 VectorStore 上的桥：第一参数可以是数字（\`asRetriever(5)\` 即 k=5）或完整配置对象（\`asRetriever({ k: 10, searchType: "mmr", searchKwargs: { fetchK: 50, lambda: 0.5 } })\`）。注意一个细节：无论哪条分支，tags 都会追加 \`this._vectorstoreType()\`——每个检索 run 天然带库类型标签，可观测性内建。VectorStoreRetriever 侧还有独立默认值 \`k = 4\` 与 \`searchType = "similarity"\`（vectorstores.ts:217,227），与上一课 similaritySearch 的 k=4 是两处独立存在的默认。

还有一条传播线藏在 \`_getRelevantDocuments\` 内部：VectorStoreRetriever 调用底层库的 \`similaritySearch/maxMarginalRelevanceSearch\` 时，传的不是裸回调，而是 \`runManager?.getChild("vectorstore")\`（vectorstores.ts:336-347）——**检索 run 之下会再长出一层 vectorstore 子 run**。也就是说，链上观测到的树形是「retriever → vectorstore → 库内操作」两级：检索器的编排与库的执行各自占一个节点。写自定义 VectorStore 时，如果你的实现也接收 callbacks 参数，就应把收到的 callbacks 继续传给内部子组件，让树保持完整——这是「回调传播的接力义务」在检索环的具体形态。

### 实现一：自定义 Retriever 跑通回调三相

写一个带观测的最小检索器——从本地数组按关键词过滤，足以验证骨架：

\`\`\`ts
import { BaseRetriever, type CallbackManagerForRetrieverRun } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";

class KeywordRetriever extends BaseRetriever {
  private corpus: Document[];

  constructor(corpus: Document[], fields?: { k?: number; callbacks?: any }) {
    super(fields);
    this.corpus = corpus;
  }

  // 唯一必须实现的钩子：不要覆写 invoke！
  async _getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun
  ): Promise<Document[]> {
    const k = 3;
    const hits = this.corpus
      .filter((d) => d.pageContent.includes(query) || query.length === 0)
      .slice(0, k);
    // runManager 可用于传播子回调（如日志 handler），也可不用
    return hits;
  }
}

const retriever = new KeywordRetriever([
  new Document({ pageContent: "langgraph checkpoint 支持 interrupt 恢复", metadata: { src: "doc1" } }),
  new Document({ pageContent: "langchain 中间件可以改写模型请求", metadata: { src: "doc2" } }),
]);

// 三相回调直接跑通：invoke 是基类骨架
const docs = await retriever.invoke("checkpoint");
console.log(docs.map((d) => d.metadata.src)); // ["doc1"]

// pipe 进 LCEL 合法：Retriever 是 Runnable<string, Document[]>
const chain = retriever.pipe((docs) => docs.map((d) => d.pageContent).join("\\n"));
const out = await chain.invoke("中间件");
console.log(out); // "langchain 中间件可以改写模型请求"
\`\`\`

验收断言三条：第一，\`retriever.invoke(...)\` 返回过滤后的 Document 数组——回调三相（handleRetrieverStart/End）在基类 invoke 里已完成，我们一行回调代码都没写；第二，\`retriever.pipe(...)\` 编译通过且运行正确——它继承 Runnable 四支柱；第三，如果把 \`_getRelevantDocuments\` 删掉，调用 invoke 会得到 Not implemented!——验证钩子契约。

### 实现二：MMR 检索与能力协商

\`\`\`ts
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { FakeEmbeddings } from "@langchain/core/utils/testing";

const store = await MemoryVectorStore.fromTexts(
  ["向量数据库索引结构", "向量相似度检索原理", "周末爬山装备清单", "向量库混合检索实践"],
  [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
  new FakeEmbeddings()   // 测试用假 embedding，只验证流程
);

// 相似度检索（默认）
const sim = store.asRetriever({ k: 2 });

// MMR：先粗取 fetchK 条候选，再从中选 k 条兼顾多样
const mmr = store.asRetriever({
  k: 2,
  searchType: "mmr",
  searchKwargs: { fetchK: 20, lambda: 0.2 },   // lambda 低 → 重多样性
});

const simDocs = await sim.invoke("向量检索");
const mmrDocs = await mmr.invoke("向量检索");

// 能力协商的运行时路径：对一个没实现 MMR 的 VectorStore 会得到明确报错
try {
  const noMmrStore = new InMemoryVectorStore(embeddings);   // L86 手写版，未实现 maxMarginalRelevanceSearch
  await noMmrStore.asRetriever({ k: 2, searchType: "mmr" }).invoke("任何查询");
} catch (e) {
  // e.message 形如：The vector store backing this retriever, in_memory_demo
  // does not support max marginal relevance search.
}
\`\`\`

对照三条验收：其一，\`lambda: 0.2\` 时 mmrDocs 的文档组合比 simDocs 更分散（FakeEmbeddings 下向量是伪随机，多样性效应依实现而异，真实 embedding 下差异更可观察）；其二，\`fetchK: 20 > k: 2\` 保证候选池有余量；其三，MMR 未实现时报错信息点名向量库类型——这是 vectorstores.ts:330-335 那段鸭子检查在实战中的样子。参数口径再确认一遍：**lambda 0 = 最大多样性、1 = 最大相关性**（vectorstores.ts:41-45 JSDoc）。

### 补读：VectorStoreRetriever 的构造器守门、写通桥与标签透传

asRetriever 只是桥的一端；桥的另一端 VectorStoreRetriever 有三个值得逐行看的细节。其一，构造器对 searchKwargs 有守门：**只有 \`fields.searchType === "mmr"\` 时才存 searchKwargs**（vectorstores.ts:305-311）——similarity 模式下你传的 fetchK/lambda 直接被丢弃，不报错也不生效，这是「静默失效」类的误用点。其二，\`_vectorstoreType()\` 直接委托 \`this.vectorStore._vectorstoreType()\`（vectorstores.ts:255-259），所以检索 run 的标签与底层库类型永远一致。其三，VectorStoreRetriever 也有 addDocuments/addVectors，实现是委托 vectorStore（vectorstores.ts:358-426）——**检索器同时是写通口**，ingestion 与查询可以共用一个对象。

*— langchain-core/src/vectorstores.ts:255-311, 358-426（commit 7704471）*

### 实现三：给 KeywordRetriever 加观测配置与子 run 传播

把实现一的骨架升级成带完整观测面的版本——用上构造器四件套，并在钩子内派生子 run：

\`\`\`ts
import { BaseRetriever, type CallbackManagerForRetrieverRun } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { RunnableLambda } from "@langchain/core/runnables";

// 一个最简 handler：记录检索与内部子链的 run 事件
class SpyHandler extends BaseCallbackHandler {
  name = "spy_handler";
  events: string[] = [];
  handleRetrieverStart() { this.events.push("retriever_start"); }
  handleRetrieverEnd() { this.events.push("retriever_end"); }
  handleChainStart() { this.events.push("chain_start"); }
  handleChainEnd() { this.events.push("chain_end"); }
}

class ConfigurableRetriever extends BaseRetriever {
  private corpus: Document[];
  private k: number;

  // 四件套经 fields 进构造器，invoke 的 configure 会自动消费
  constructor(corpus: Document[], fields?: { k?: number; callbacks?: any; tags?: string[] }) {
    super(fields);
    this.corpus = corpus;
    this.k = fields?.k ?? 2;
  }

  async _getRelevantDocuments(query: string, runManager?: CallbackManagerForRetrieverRun) {
    // 派生子 run 的 manager：传给内部任何 Runnable，子 run 就挂进检索 run 之下
    const child = runManager?.getChild("keyword_filter");
    const scorer = RunnableLambda.from((hits: Document[]) => hits.slice(0, this.k));
    const filtered = this.corpus.filter((d) => d.pageContent.includes(query));
    return scorer.invoke(filtered, { callbacks: child });
  }
}

const spy = new SpyHandler();
const retriever = new ConfigurableRetriever(
  [new Document({ pageContent: "checkpoint 支持 interrupt 恢复" })],
  { k: 1, callbacks: [spy], tags: ["demo"], metadata: { env: "test" } }
);
const docs = await retriever.invoke("checkpoint");
console.log(docs.length, spy.events);
// 1 ["retriever_start", "chain_start", "chain_end", "retriever_end"]
\`\`\`

验收断言三条：spy.events 依次出现 retriever_start 与 retriever_end——构造时传入的 callbacks 经 invoke 的 configure 进入三相编排；中间夹着 chain_start/chain_end——\`getChild("keyword_filter")\` 派生的子 manager 把 RunnableLambda 的 run 挂进了检索 run 之下，run 树在检索器内部继续生长；tags/metadata 无 handler 传入时完全无副作用（可选链短路）。这条实现链展示了「观测面是配置面」的完整闭环：**四件套传给构造器 → invoke 的 configure 合成 → 三相事件派发 → getChild 向下生长**，四个环节全部在基类完成，子类只写过滤逻辑。



### 误用与排查：三类高频坑

把本课能踩的坑集中钉一遍。**坑一：searchKwargs 静默失效**——在 similarity 模式下传 \`searchKwargs: { fetchK: 20, lambda: 0.5 }\`，构造器直接丢弃这组参数（vectorstores.ts:305-311），不报错不生效，典型症状是「MMR 参数配了却看不出多样性变化」——排查第一步先确认 searchType 真的是 "mmr"。**坑二：覆写 invoke**——自定义检索器为了「加点逻辑」覆写了 invoke 却忘了编排回调三相，trace 树里这个检索器从此隐形，观测端只剩上游节点；正确姿势是把逻辑放进 \`_getRelevantDocuments\` 或包装成 RunnableLambda 再 pipe。**坑三：数字签名与对象签名的能力差**——\`asRetriever(5)\` 走的数字分支只透传 k 与 filter 等位置参数，searchType/searchKwargs 只有对象签名才能传；想要 MMR 却用数字签名再事后补属性，得到的是 similarity 检索器。

还有一条工程口径：fetchK 不是越大越好——候选池是 MMR 两阶段的第一阶段开销，k 的 3-5 倍是常见起点（quiz 的工程经验），拉到几百上千只会拖慢候选召回而不改变多样性上限。lambda 从 0.5 起调，向 0 移动前先确认语料里确实存在「同义但表达不同」的文档——多样性只在冗余语料上才有意义。

### 本课小结

- BaseRetriever：Runnable<string, Document[]>，唯一子类钩子 _getRelevantDocuments（因兼容性暂不 abstract），invoke 手动编排回调三相。
- asRetriever 双签名是存储环进 LCEL 的桥；tags 自动追加向量库类型。
- MMR = fetchK 粗召回 + lambda 插值（0 多样性 / 1 相关性）；能力协商在运行时，未实现时明确报错。
- 实战纪律：自定义检索器只实现钩子、不覆写 invoke，保住观测性与 pipe 能力。
- 下一课转向记忆层：BaseMemory/ChatHistory 双基类——看看被 1.x 淘汰的旧记忆模型长什么样、为什么被淘汰。
`,
    null,
    [
      {
        text: 'BaseRetriever 唯一需要子类实现的钩子是？',
        options: [
          'invoke()',
          '_getRelevantDocuments()',
          'transformDocuments()',
          'getRelevantDocuments()（公开方法）',
        ],
        answer: 1,
        explain:
          "retrievers/index.ts:126-131：_getRelevantDocuments 是子类钩子，且注释明确写着 TODO: This should be an abstract method, but we'd like to avoid breaking changes to people currently using subclassed custom retrievers——本该 abstract 但为了兼容旧自定义子类暂不强制，未实现时默认抛 Not implemented!。invoke 是基类骨架不用碰，公开的 getRelevantDocuments 走 Runnable 默认降级。",
        concept: 'lc-retriever-mmr',
      },
      {
        text: 'BaseRetriever.invoke 与 Runnable 基类的 _callWithConfig 有什么关键差别？',
        options: [
          '没有差别，就是继承来的',
          'invoke 手动编排 configure→handleRetrieverStart→handleRetrieverEnd/Error 三相回调，不经过通用 _callWithConfig',
          'invoke 完全不走回调',
          'invoke 只发 start 不发 end',
        ],
        answer: 1,
        explain:
          'retrievers/index.ts:142-173：先 CallbackManager.configure 合并配置，再 handleRetrieverStart，try 里执行 _getRelevantDocuments 后 handleRetrieverEnd，catch 里 handleRetrieverError 后 rethrow。这是手写版回调编排——Retriever 拥有专属事件类型（retriever run），链式场景才用通用链回调。',
        concept: 'lc-retriever-mmr',
      },
      {
        text: 'searchType: "mmr" 但底层向量库没实现 maxMarginalRelevanceSearch 时会发生什么？',
        options: [
          '静默降级为普通相似度检索',
          '运行时鸭子检查 typeof ... !== "function"，抛出明确的「does not support max marginal relevance search」错误',
          '编译期报错',
          '返回空数组',
        ],
        answer: 1,
        explain:
          'vectorstores.ts:330-335：_getRelevantDocuments 里用 typeof this.vectorStore.maxMarginalRelevanceSearch !== "function" 做运行时能力检查再报错。maxMarginalRelevanceSearch 在接口上是可选方法（vectorstores.ts:715-719 带 ?），所以编译期不报错，能力协商被推迟到运行时且给出明确错误信息。',
        concept: 'lc-retriever-mmr',
      },
      {
        text: 'MMR 的 lambda 参数语义是？',
        options: [
          '0 重多样性、1 重相关性',
          '0 重相关性、1 重多样性',
          '0.5 是默认多样性',
          'lambda 是正则化系数，越大越慢',
        ],
        answer: 0,
        explain:
          'vectorstores.ts:41-45 的 JSDoc 写死：A lambda of 0 emphasizes diversity, maximizing content variation. A lambda of 1 emphasizes similarity to the query。注意别和某些 MMR 论文的记号方向记反——langchain 的口径是 1=纯相关性。',
        concept: 'lc-retriever-mmr',
      },
      {
        text: 'fetchK > k 的两段式检索为什么这样设计？',
        options: [
          '纯为了分页',
          '先粗召回 fetchK 条候选池，再由 MMR 算法从中选出 k 条兼顾相关与多样的结果',
          'fetchK 是重试次数',
          '为了绕过向量库的 k 上限',
        ],
        answer: 1,
        explain:
          'vectorstores.ts:29-33 注释：fetchK 是 The initial number of documents to retrieve from the vector store before applying the MMR algorithm。MMR 需要「相关性排序 + 逐个选多样代表」两步，候选池太小（=k）就没有多样性可选的余地。工程经验是 fetchK 取 k 的 3-5 倍。',
        concept: 'lc-retriever-mmr',
      },
    ],
    [
      ['BaseRetriever', '检索环骨架：Runnable<string, DocumentInterface[]>，子类钩子 _getRelevantDocuments'],
      ['asRetriever', 'VectorStore → VectorStoreRetriever 的适配方法，kOrFields 支持数字或配置对象双签名'],
      ['MMR', 'Maximal Marginal Relevance：相关性 λ=1 与多样性 λ=0 之间的插值检索'],
      ['BaseRetrieverInput', 'callbacks/tags/metadata/verbose 四件套，所有检索器的观测性配置面'],
    ],
    [
      '以为 searchType: "mmr" 是编译期保证——maxMarginalRelevanceSearch 是接口可选方法，能力检查在运行时，不支持的库到调用时才炸',
      '在自定义 Retriever 里覆写 invoke 而绕过回调编排——trace 树会缺 retriever 节点；正确姿势是只实现 _getRelevantDocuments',
      '把 MMR 的 lambda 记反——langchain 的口径是 0=最大多样性、1=最大相关性',
    ],
  ),
  'practice',
)
