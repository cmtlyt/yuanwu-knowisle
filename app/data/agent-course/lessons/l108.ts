import { L } from '../../course-builders.ts'

/* ========== Stage 21 ========== */

export const L108 = L(
  'L108',
  21,
  'LlamaIndex.TS 核心：RAG / 向量 / Graph RAG',
  14,
  3,
  ['L93'],
  ['llamaindex-core'],
  [
    '掌握 LlamaIndex.TS 的核心：RAG / 向量 / Graph RAG',
    '理解「数据索引 + 查询引擎」的组织方式',
    '认识它与 LangChain 在 RAG 上的分工',
  ],
  `
### RAG 的一站式工具

LlamaIndex.TS（\\\`llamaindex\\\`）专注「数据到索引、索引到答案」：把文档做成**索引**（向量 / 图 / 关键词），再用**查询引擎**检索生成。

\`\`\` title="LlamaIndex 核心" note="关键：\\\`VectorStoreIndex\\\` 对应 L49 手写的「切块 → 向量化 → 检索」管线。"
import { VectorStoreIndex, Document } from "llamaindex"

// ① 文档 → 索引
const docs = [new Document({ text: "..." }), ...]
const index = await VectorStoreIndex.fromDocuments(docs)  // 向量索引

// ② 索引 → 查询引擎
const engine = index.asQueryEngine()
const answer = await engine.query({ query: "问题" })  // 检索 + 生成

// ③ Graph RAG：图索引（实体 + 关系）
const graphIndex = await KnowledgeGraphIndex.fromDocuments(docs)
\`\`\`

:::deep

### LlamaIndex vs LangChain（RAG 视角）

两者都做 RAG，但组织方式不同：LlamaIndex 以「索引」为核心抽象（向量/图/关键词索引），强调「数据 → 索引 → 查询」；LangChain 以「链」为核心（retriever + prompt + llm 组成 chain）。LlamaIndex 更聚焦 RAG 深度。

:::

### LlamaIndex 的三个索引

- VectorStoreIndex：向量索引（语义检索）。
- KnowledgeGraphIndex：图索引（Graph RAG）。
- SummaryIndex / 关键词索引：其它检索方式。

:::warn

### 别把「索引」当「数据库」

索引是「检索结构」，不是「存储真相」。文档改了要重建索引，否则检索的是旧数据（呼应 L49 的「知识可更新」）。

:::

`,
  null,
  [
    {
      text: 'LlamaIndex 的核心抽象是？',
      options: ['链', '索引（向量/图/关键词）+ 查询引擎', '图节点', 'Agent'],
      answer: 1,
      explain: '索引 + 查询引擎。',
      concept: 'llamaindex-core',
    },
    {
      text: 'VectorStoreIndex 对应 L49 手写的什么？',
      options: ['LLM 调用', '切块 → 向量化 → 检索管线', '工具调用', '流式'],
      answer: 1,
      explain: '对应手写 RAG 管线。',
      concept: 'llamaindex-core',
    },
    {
      text: 'LlamaIndex 的 Graph RAG 索引是？',
      options: ['VectorStoreIndex', 'KnowledgeGraphIndex', 'SummaryIndex', '关键词索引'],
      answer: 1,
      explain: 'KnowledgeGraphIndex。',
      concept: 'llamaindex-core',
    },
  ],
  [
    ['索引', '文档的检索结构（向量/图/关键词）'],
    ['查询引擎', '检索 + 生成的问答入口'],
    ['KnowledgeGraphIndex', '图索引（Graph RAG）'],
  ],
  ['把索引当数据库，文档改了不重建索引，检索旧数据。', '用 LlamaIndex 做多 Agent 编排（它是 RAG 工具）。'],
)
