import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 21 ========== */

export const L109 = withKind(
  L(
    'L109',
    21,
    '对照：用 LlamaIndex.TS 重写向量 / Graph RAG（对比 L49 / L50 手写版）',
    3,
    ['L108', 'L49', 'L50'],
    ['llamaindex-rag'],
    [
      '用 LlamaIndex 重写向量 RAG 与 Graph RAG，并给出与 L49 / L50 手写版的度量对照',
      '理解「召回 + 生成」被框架收成 QueryEngine 之后，哪些胶水消失了、哪些被锁死',
      '建立「什么时候该用框架 RAG、什么时候手写」的判据',
    ],
    `
### 三百行手写 RAG，重写后五十行

L49 手写的向量 RAG 到生产里有三百多行：读文件、切 chunk、embed、入库、查询、召回、拼 prompt、调模型、解析答案。同一段逻辑用 LlamaIndex 重写后大概五十行——因为「切 / embed / 入库 / 召回 / 拼装」这五件最重复的事被收成了 \`fromDocuments\` 和 \`asQueryEngine\` 两步。

但重写最该想清楚的不是「省了多少行」，而是**省掉的那些胶水里，有没有你其实想自己控制的**。这一节就围绕两段重写展开。

### 对照一：向量 RAG（vs L49 手写）

| 维度 | L49 手写版 | LlamaIndex 重写 |
|---|---|---|
| chunk / overlap | 手写切分函数 | \`Node\` 切分策略（可配） |
| embedding | 手写维度 + 调接口 | \`Settings.embedModel\` 统一配置 |
| 入库 | 手写 upsert 向量库 | \`fromDocuments\` 内部完成 |
| 召回 | 手写相似度查询 + map 回原文 | \`query\` 内部完成 |
| 拼 prompt + 生成 | 手写模板 + 调模型 | \`QueryEngine\` 焊成一体 |
| 你仍要写 | 数据源、embedding 选型 | 同左（这块省不掉） |

注意最后一行：**数据从哪来、用什么 embedding** 这两件事 SDK 一律不碰。它替你省的是「数据怎么流进索引、怎么流回答案」，不是「业务该用哪个模型」。如果 embedding 选错维度，框架不会拦你，报错会在查询时才来——和手写版一样的坑，只是来得更晚。

\`\`\`ts title="向量 RAG 重写（对比 L49 手写）" note="要点：fromDocuments 收掉 chunk/embed/入库；query 收掉召回/拼装/生成；你只声明数据与问句。"
import { Document, VectorStoreIndex, Settings } from 'llamaindex'

Settings.embedModel = myEmbedding // 等价于 L49 手写的 embedding 选型
const index = await VectorStoreIndex.fromDocuments([
  new Document({ text: '退货政策：7 天内未拆封可退。' }),
])
const engine = index.asQueryEngine()
const { response, sourceNodes } = await engine.query({ query: '多久能退？' })
// sourceNodes 等价于 L49 手写版自己 map 回的原文片段
\`\`\`

### 对照二：Graph RAG（vs L50 手写）

L50 手写 Graph RAG 最重的一块是**实体抽取 + 建图 + 沿边遍历**三件事，每一件都不稳：抽取靠 prompt、建图靠消重、遍历靠你自己写的 BFS。LlamaIndex 的 \`GraphIndex\` 把这三件收了，你只给文档和问句。

\`\`\`ts title="Graph RAG 重写（对比 L50 手写）" note="要点：fromDocuments 收掉抽取/建图/遍历；多跳关系查询从『自己写 BFS』变成一句 query。"
import { GraphIndex } from 'llamaindex'

const g = await GraphIndex.fromDocuments(docs) // 抽取实体 + 建关系图
const gEngine = g.asQueryEngine()
const r = await gEngine.query({ query: 'A 公司通过子公司和谁合资？' }) // 沿边多跳
\`\`\`

这里省的是「图的生命周期管理」：抽取怎么批、图怎么存、遍历怎么剪枝。但这些恰恰是 Graph RAG 最容易出错的地方——**框架接管之后，你失去了对「抽取质量」的直接控制**。L50 手写版虽然累，但每一跳你都能看、能改；框架版抽错了实体，你只能去调它的抽取 prompt，调试面反而变窄。

:::deep
### 重写省了胶水，也锁了索引形态

两段对照合起来看，规律与前面几个框架同源：

- **省的是「流水线胶水」**：切分、embed、入库、召回、拼装、遍历——这些与「你的业务是什么」无关，纯属接入成本。
- **锁的是「索引形态」**：一旦用 \`VectorStoreIndex\`，你的数据就被固化成「向量 + 原文」的形态；想换成「向量 + 关键字混合」或「图 + 向量」就得走框架给的扩展点。手写版你随时能改召回策略，框架版改召回要懂它的 Retriever 抽象。
- **没动的是「数据与模型选型」**：用什么 embedding、数据从哪来、要不要重排——这些 SDK 一律不碰，一个字没少。

所以判据写下来是：

- 标准「问文档答文档」场景 → 框架 RAG 稳赢，别手写。
- 召回策略要反复实验（混合检索、重排、上下文压缩）→ 框架可能挡路，手写或只用它的底层组件更灵活。
- 数据量极小、查询极简单 → 框架的抽象反而是负担，几行向量查询就够了。
:::

:::warn
### 三个必踩的坑

- **embedding 维度在重建索引时偷偷变了**。表现是旧索引查新数据报错。手写版也会犯，但框架把 embedModel 收进全局 \`Settings\`，更容易忘记「索引与查询必须用同一个」。建索引和查索引前各打一次日志确认。
- **把 GraphIndex 当默认**。表现是大批文档无脑建图，成本涨十倍且抽取错的实体污染全图。图索引只留给真正的多跳关系需求，普通问答用向量足够。
- **以为 QueryEngine 的 sourceNodes 等于「可信出处」**。它只是召回片段，不排除模型张冠李戴。和 L49 手写版一样，回答的可信度仍要靠你自己的引用校验，框架不担保。
:::

### 召回策略实验：框架没替你做的那半

前面两段重写让「建索引、查索引」变简单，但**召回质量**这件事框架一点没替你做。真实项目里召回差，八成不是因为没用框架，而是因为：chunk 太大、overlap 不够、embedding 选错、只用了向量没用关键字、召回后没重排。这些在 L49 手写版里要自己写，在 LlamaIndex 里要自己配——框架只是把「调这些旋钮」收成了配置项，旋钮本身一个没少。

一个最常见的实验是**混合检索**：向量召回管语义、关键字召回管精确词（比如订单号、错误码），两者合并再重排。框架版写起来比手写短，但「怎么合并、重排权重多少」仍然靠你实验。

\`\`\`ts title="混合检索（向量 + 关键字）" note="要点：EnsembleRetriever 把两路召回合并；重排权重是实验参数，框架不替你定。"
import { VectorStoreIndex, KeywordTableIndex, EnsembleRetriever } from 'llamaindex'

const vIdx = await VectorStoreIndex.fromDocuments(docs)
const kIdx = await KeywordTableIndex.fromDocuments(docs)
const retriever = new EnsembleRetriever({
  retrievers: [vIdx.asRetriever(), kIdx.asRetriever()],
  weights: [0.6, 0.4], // 语义 0.6 + 关键字 0.4，权重靠实验调
})
const nodes = await retriever.retrieve({ query: '订单 A1001 的退款状态' })
\`\`\`

换成手写版，这段代码对应的是「分别查向量库和倒排表、按 score 加权合并、去重」。框架省下的是合并与去重的胶水，但 \`weights\` 这个旋钮——以及「为什么这条查询该关键字权重更高」——是你得从 bad case 里总结的。这也解释了为什么 RAG 项目里「接框架」往往只花一天，「调召回」要花两周：框架吃掉了前者，后者它无能为力。

### 重排与上下文压缩

召回的下一步常被忽略：**重排（rerank）**。向量召回按相似度排，但相似度高不等于「对回答最有用的排最前」。加一层 rerank 模型，把召回的 top-k 重排成「与问题最相关」的顺序，再截取前 n 段喂给模型，质量通常明显提升。这部分 LlamaIndex 提供组件，但接不接、接哪个、截几段，全是决策。

\`\`\`ts title="召回后重排（决策点）" note="要点：rerank 是召回与生成之间的独立一环；接不接、截几段由你按质量实验决定。"
const nodes = await retriever.retrieve({ query, topK: 20 })      // 先多召回
const ranked = await rerankModel.rerank({ query, nodes, topK: 4 }) // 再重排截取
const engine = index.asQueryEngine({ preFilters: undefined })
const r = await engine.query({ query, retriever: () => ranked })  // 用重排结果
\`\`\`

:::warn
### 召回相关的两个额外坑

- **以为「建完索引就能用」**。表现是上线后用户问具体订单号答不上来，因为只用向量召回，订单号这种精确词被语义召回淹没。补关键字召回（上面那段）后立刻好转。
- **召回 topK 拍脑袋定**。太大塞爆上下文、太小漏关键信息。正确做法是按 bad case 调：先大召回（20）+ 重排截取（4），再观察哪些问题仍答偏，回头改权重与截取数。
:::

### 与相邻课的分工

- **L49 / L50** 是手写基线，本课的 \`fromDocuments\` / \`GraphIndex\` 是它们的框架版本，只省胶水不省选型。
- **L108** 讲核心原语，本课只做「同段逻辑下与手写版的度量对照」。
- **L103** 的 Mastra rag 是另一套抽象，本课不展开跨框架 RAG 对比（留给 L112 矩阵）。
`,
    null,
    [
      {
        text: '用 LlamaIndex 重写向量 RAG，真正省掉的是哪部分？',
        options: [
          '数据源与 embedding 选型',
          '切分/embed/入库/召回/拼装 这些流水线胶水',
          '查询时该问什么',
          '召回质量的最终责任',
        ],
        answer: 1,
        explain: '框架收掉的是数据怎么流进索引、怎么流回答案；数据与模型选型仍由你决定。',
        concept: 'llamaindex-rag',
      },
      {
        text: 'GraphIndex 接管之后，最大的代价是？',
        options: ['embedding 维度变了', '失去对「抽取质量」的直接控制，调试面变窄', '召回变慢', '不能多跳'],
        answer: 1,
        explain: '抽取/建图/遍历被收掉，抽错实体只能调框架的抽取 prompt，不如手写版每跳可见可改。',
        concept: 'llamaindex-rag',
      },
      {
        text: '下列哪种场景最适合用框架 RAG 而非手写？',
        options: [
          '召回策略要反复实验混合检索与重排',
          '标准「问文档答文档」',
          '数据量极小查询极简单',
          '索引形态要随时换',
        ],
        answer: 1,
        explain: '标准问答框架稳赢；实验性召回或极简场景手写或只用底层组件更灵活。',
        concept: 'llamaindex-rag',
      },
      {
        text: 'QueryEngine 返回的 sourceNodes 意味着什么？',
        options: [
          '回答一定可信、有出处担保',
          '只是召回片段，可信度仍需自己校验',
          '等于手写版的实体关系图',
          '已做过重排',
        ],
        answer: 1,
        explain: '它只是召回片段，不排除模型张冠李戴；引用校验的责任框架不接。',
        concept: 'llamaindex-rag',
      },
    ],
    [
      ['fromDocuments', '收掉 chunk/embed/入库；等价于 L49 手写前三段'],
      ['asQueryEngine', '收掉召回/拼装/生成；返回带 sourceNodes 的答案'],
      ['GraphIndex', '收掉抽取/建图/遍历；多跳查询从手写 BFS 变一句 query'],
      ['抽象漏水', '索引形态被固化，改召回策略要懂框架 Retriever 抽象'],
    ],
    [
      'embedding 维度在重建索引时偷偷变了，旧索引查新数据报错。',
      '把 GraphIndex 当默认，大文档无脑建图成本涨十倍。',
      '以为 sourceNodes 等于可信出处，漏掉引用校验。',
      '以为框架 RAG 接管了数据与模型选型（其实只省胶水）。',
    ],
  ),
  'framework',
)
