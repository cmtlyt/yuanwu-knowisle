import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 21 ========== */

export const L108 = withKind(
  L(
    'L108',
    21,
    'LlamaIndex.TS 核心：RAG / 向量 / Graph RAG',
    3,
    ['L93'],
    ['llamaindex-core'],
    [
      '说清 LlamaIndex.TS 的核心原语：Document / Node / VectorStoreIndex / QueryEngine / GraphIndex',
      '理解它「围绕数据索引与查询组织」的定位，以及和通用 agent 编排框架的边界',
      '认识 RAG 流水线里每一层抽象替你还的债、锁在哪',
    ],
    `
### 手写向量 RAG 三百行，一半在管四件事

L49 那一章我们手写的向量 RAG，到我接生产时已经三百多行：读文件、切 chunk、调 embedding、存向量库、按 query 召回、把召回拼进 prompt、再调模型。其中「切 chunk / embed / 建索引 / 查询」这四件最重复、最易错——切多大、overlap 多少、embedding 维度对不对，任何一个配错召回就崩。

切到 LlamaIndex 之后，这四件事被收成一条流水线：**Document → Node → Index → QueryEngine**。你只给「原始文档」和「要问什么」，中间全链路它管。这一刻明白它卖的是什么——它**不是 agent 编排框架，它是「数据索引 + 查询引擎」框架**：把「让模型基于你的数据回答」这件事做薄、做标准。

:::deep
### 为什么说它「围绕数据组织」而非「围绕流程组织」

前面五个框架的重心分别是：

- LangGraph（L96）：图的执行。
- OpenAI Agents（L100）：agent loop 约定。
- Mastra（L103）：TS 成套件。
- Vercel AI SDK（L106）：模型交互层。
- **LlamaIndex：数据索引与查询。**

它的核心抽象全是「数据的形状与流向」：Document（原始数据）→ Node（切好的最小单元）→ Index（可检索的结构）→ QueryEngine（检索 + 生成）。你几乎看不到「循环」「状态机」「handoff」这类词——因为它根本不解决「流程怎么跑」，它只解决「模型怎么基于你的知识库拿到对的上下文」。

判据很清晰：**需求是「让用户问我的文档/数据库，模型基于检索结果回答」→ LlamaIndex 是正解；需求是「多步骤自主任务、要动态决策」→ 它不是正确工具，该上 L96/L100。** 这两者常被混为一谈，因为 RAG 经常是 agent 的一部分；但「RAG 这一块」用 LlamaIndex 做、「流程那一块」用编排框架做，是现实里最常见的组合。
:::

### 核心原语各自抽象了哪一层

| 原语 | 抽象了哪一层 | 替你还的债 | 典型误用 |
|---|---|---|---|
| \`Document\` | 原始数据容器（pdf/txt/md…） | 手写各格式解析器 | 把已切好的文本当 Document 直接灌 |
| \`Node\` | 切分后的最小检索单元 | 手写 chunk + overlap 策略 | chunk 过大/过小不调参 |
| \`VectorStoreIndex\` | embedding + 向量存储 + 召回 | 手写 embed / 入库 / 相似度查询 | 用错 embedding 维度 |
| \`QueryEngine\` | 召回 + 拼 prompt + 生成 | 手写「召回→组装→调模型」 | 直接拿 index 当答案源 |
| \`GraphIndex\` | 实体关系图（Graph RAG） | 手写实体抽取 + 图遍历 | 把图当向量库平铺查 |

五个里 \`QueryEngine\` 是真正的出口：它把「检索」和「生成」焊在一起，你问一句它返回带引用的答案。\`VectorStoreIndex\` 只是地基，单用它拿不到回答，必须包一层 QueryEngine。

### 最小可运行：Document → VectorStoreIndex → QueryEngine

下面这段把前四个原语摆出来。注意 \`VectorStoreIndex.fromDocuments\` 一次性完成了 chunk + embed + 入库三件事，\`queryEngine.query\` 一次性完成了召回 + 生成。

\`\`\`ts title="LlamaIndex 最小向量 RAG" note="要点：fromDocuments 收掉 chunk/embed/入库；query 收掉召回/拼装/生成；你只给文档和问句。"
import { Document, VectorStoreIndex, Settings } from 'llamaindex'

Settings.embedModel =embedding // 统一配置 embedding（L49 里是手写维度）
const docs = [new Document({ text: '退货政策：7 天内未拆封可退。' })]

const index = await VectorStoreIndex.fromDocuments(docs) // chunk+embed+入库 一步
const engine = index.asQueryEngine()                     // 召回+生成 焊成引擎
const answer = await engine.query({ query: '多久能退？' }) // 带引用返回
console.log(answer.response, answer.sourceNodes)
\`\`\`

对比 L49 手写版：那里 \`embed\` 返回向量后要自己 \`upsert\` 进库，查询时自己 \`query\` 向量库、自己 \`map\` 回原文、自己拼 prompt。这里这些全被 \`fromDocuments\` 与 \`asQueryEngine\` 收掉。**抽象掉的正是最重复的那半（chunk/embed/入库/召回），保留的是「数据从哪来、用什么 embedding」这两个你本就该决定的事。**

### Graph RAG：当关系比相似度更重要

向量召回的弱点是「只认语义相似，不认实体关系」。问「A 公司投资了哪些子公司，这些子公司又和谁合资」——这种多跳关系，向量库平铺查不出来。LlamaIndex 的 \`GraphIndex\` 把文档抽成实体关系图，查询时沿边游走。

\`\`\`ts title="GraphIndex 简述（多跳关系查询）" note="要点：图索引补的是向量索引缺的『关系跳转』；代价是抽取与建图的成本与质量风险。"
import { GraphIndex } from 'llamaindex'

const g = await GraphIndex.fromDocuments(docs) // 抽实体 + 建关系图（重，且依赖抽取质量）
const gEngine = g.asQueryEngine()
const r = await gEngine.query({ query: 'A 公司通过子公司和谁合资？' }) // 沿边多跳
\`\`\`

:::warn
### 三个必踩的坑

- **把已切好的文本直接当 Document 灌**。表现是召回质量差，因为 LlamaIndex 又切了一遍，chunk 叠 chunk。正确做法是给原始长文本，让它的 Node 切分策略生效，或显式控制 \`chunkSize\` / \`chunkOverlap\`。
- **embedding 维度对不上**。表现是入库成功查询时报维度不匹配。\`Settings.embedModel\` 必须和索引建的时候一致——这和 L49 手写版「维表建错就全错」是同一个坑，只是报错更晚。
- **以为 GraphIndex 是向量库的升级替代**。表现是大文档全建图，成本爆了且抽取错的实体污染全图。图索引补的是「关系跳转」不是「语义召回」，多数场景向量 + 关键字混合就够了，图只留给真正的多跳需求。
:::

### Document 与 Node：为什么要分两层

初学者最容易混淆的是「我已经有切好的文本了，为什么还要先包成 Document 再切成 Node」。分两层的价值在**解耦「数据从哪来」和「怎么切」**：Document 可以是 pdf / 网页 / 数据库行，形状各异；Node 是统一的检索单元，形状一致。换数据源不用改切分逻辑，换切分策略不用碰数据源。这正是前面几课反复出现的「抽象替你还的债、锁在哪」的又一个例子——债是「各格式解析」，锁是「你被 Node 的统一形状约束」。

\`\`\`ts title="自定义 Node 切分与重叠" note="要点：chunkSize/chunkOverlap 控制检索粒度；这是手写版里最容易调错、也最影响召回的参数。"
import { Document, VectorStoreIndex, Settings } from 'llamaindex'

Settings.chunkSize = 512
Settings.chunkOverlap = 64 // 相邻 chunk 重叠，避免一句话被切断后召回不全
Settings.embedModel = myEmbedding // 建索引与查询必须同一 embedding（L49 同款维度坑）

const index = await VectorStoreIndex.fromDocuments(
  [new Document({ text: longPolicyText })],
  { chunkSize: 512, chunkOverlap: 64 }, // 等价于手写版的滑动窗口切分
)
\`\`\`

这个参数在 L49 手写版里是你自己写的滑动窗口函数；这里它变成了一个配置项，但**调参的职责没变**——chunk 太大召回粗、太小上下文碎，仍然要你按数据特征实验。框架收掉的是「怎么实现滑动窗口」，没收掉的是「窗口多大」这个判断。这也是 RAG 类框架最容易被神话的地方：它让「建索引」变简单，但「调出好召回」的难度一点没降。

### 带元数据的过滤查询

Node 还能挂 metadata（来源、时间、权限），查询时可以按它过滤。这等价于手写版里你给每段打标签后做 \`where\` 过滤，但框架把它做成了 QueryEngine 的一等参数。

\`\`\`ts title="带元数据的过滤查询" note="要点：Node 的 metadata 让『只查某来源』变成配置而非代码；等价于手写版给每段打标签后过滤。"
const engine = index.asQueryEngine({
  preFilters: { required: [{ key: 'source', value: 'policy' }] },
})
const r = await engine.query({ query: '退货期限？', preFilters: undefined })
// 也可在查询时动态传入过滤条件，而非写死在引擎上
\`\`\`

注意最后一行：**过滤条件既可以固化在引擎上，也可以每次查询动态传**。手写版你要自己决定「过滤逻辑写哪」；框架给了两种位置，但你仍然要选——抽象没替你做这个决策，它只是把两种位置都暴露出来了。这再次印证 L93 那句话：框架省的是重复劳动，省不掉的是设计判断。

### 与相邻课的分工

- **L49 / L50** 是手写向量 RAG 与 Graph RAG 基线，本课的原语就是它们的框架版本，L109 做逐段重写对照。
- **L93** 给框架三形态，本课把 LlamaIndex 定位在「围绕数据索引与查询组织」这一边界。
- **L106 / L103** 是另两类框架，本课只讲 LlamaIndex 的 RAG 原语，不展开通用编排。
`,
    null,
    [
      {
        text: 'LlamaIndex 的核心组织原语围绕什么？',
        options: [
          'agent loop 与状态机',
          '数据索引与查询：Document / Node / Index / QueryEngine',
          '多 Agent 编排范式',
          '模型交互层的流式输出',
        ],
        answer: 1,
        explain: '它把「让模型基于你的数据回答」做薄做标准，不解决流程怎么跑。',
        concept: 'llamaindex-core',
      },
      {
        text: '下列哪个是「召回 + 生成」焊在一起的出口？',
        options: ['Document', 'QueryEngine', 'Node', 'GraphIndex'],
        answer: 1,
        explain: 'VectorStoreIndex 只是地基，必须包一层 QueryEngine 才能拿到带引用的回答。',
        concept: 'llamaindex-core',
      },
      {
        text: 'GraphIndex（Graph RAG）补的是向量索引缺的什么能力？',
        options: ['语义相似度', '实体关系的多跳跳转', '流式生成', '工具调用'],
        answer: 1,
        explain: '向量只认相似不认关系；图索引沿边游走解决多跳，但成本高且依赖抽取质量。',
        concept: 'llamaindex-core',
      },
      {
        text: '下列哪种需求最适合用 LlamaIndex？',
        options: [
          '多步骤自主任务、要动态决策',
          '让用户问我的文档，模型基于检索结果回答',
          '多 Agent 协作编排',
          '手写 MCP 协议',
        ],
        answer: 1,
        explain: '「基于知识库回答」是 LlamaIndex 的正解；动态决策该上编排框架，两者常组合而非互斥。',
        concept: 'llamaindex-core',
      },
    ],
    [
      ['Document / Node', '原始数据容器 / 切分后的最小检索单元；切分策略由框架管'],
      ['VectorStoreIndex', 'embedding + 入库 + 召回；fromDocuments 一步完成 chunk/embed/入库'],
      ['QueryEngine', '召回 + 生成焊成的出口，返回带 sourceNodes 引用的答案'],
      ['GraphIndex', '实体关系图索引，补向量缺的多跳关系查询，代价是高成本与抽取质量风险'],
    ],
    [
      '把已切好文本当 Document 灌，召回质量差（chunk 叠 chunk）。',
      'embedding 维度对不上，入库成功查询时才报不匹配。',
      '以为 GraphIndex 是向量库升级替代，大文档全建图成本爆。',
      '直接用 Index 当答案源，忘了包 QueryEngine。',
    ],
  ),
  'framework',
)
