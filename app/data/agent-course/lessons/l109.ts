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
      '用 LlamaIndex 重写向量 RAG 与 Graph RAG，对比 L49 / L50 手写版',
      '理解索引抽象如何替代手写 embedding/检索/图遍历',
      '度量代码量与可控性的差异',
    ],
    `
### RAG 的框架版

L49 手写的向量 RAG（embedding + 检索 + 重排）、L50 的 Graph RAG（实体 + 关系 + 多跳），用 LlamaIndex 重写。

\`\`\` title="向量 / Graph RAG 重写" note="关键：L49 手写的 embedding/切块/相似度检索，被 \\\`VectorStoreIndex\\\` 一行替代；L50 的图构建+遍历，被 \\\`KnowledgeGraphIndex\\\` 替代。"
// 手写版（L49）：embed + index + retrieve + 重排，约 40 行
// LlamaIndex 版：
const index = await VectorStoreIndex.fromDocuments(docs)
const engine = index.asQueryEngine()
const answer = await engine.query({ query: q })   // 检索 + 生成一行

// Graph RAG（对照 L50 手写的实体+关系+多跳遍历）
const kgIndex = await KnowledgeGraphIndex.fromDocuments(docs)
const kgEngine = kgIndex.asQueryEngine()
const answer2 = await kgEngine.query({ query: "A 和 B 什么关系" })
\`\`\`

:::deep

### 度量差异

代码量：LlamaIndex 版大幅缩短（索引与查询引擎内置）。可控性：让渡明显——切块策略、相似度算法、重排逻辑都由框架默认决定，除非深入配置。这些正是 L49/L50 手写时你亲手掌控的部分。

:::

### 对照结论

- 向量 RAG：VectorStoreIndex 替代手写 embed+检索+重排。
- Graph RAG：KnowledgeGraphIndex 替代手写实体抽取+图遍历。
- 代价：切块/相似度/重排的精细控制让渡给框架。

:::warn

### 切块策略仍是关键

LlamaIndex 有默认切块策略，但「怎么切」仍直接影响检索质量（呼应 L49 的切块陷阱）。框架替你切了，不代表你不用关心切得好不好。

:::

`,
    null,
    [
      {
        text: 'L49 手写的 embed+检索+重排，在 LlamaIndex 里是？',
        options: ['手写', 'VectorStoreIndex + asQueryEngine', 'KnowledgeGraphIndex', 'Document'],
        answer: 1,
        explain: 'VectorStoreIndex。',
        concept: 'llamaindex-rag',
      },
      {
        text: 'L50 手写的图构建+遍历，在 LlamaIndex 里是？',
        options: ['VectorStoreIndex', 'KnowledgeGraphIndex', 'SummaryIndex', 'Document'],
        answer: 1,
        explain: 'KnowledgeGraphIndex。',
        concept: 'llamaindex-rag',
      },
      {
        text: '框架替你切块后，你还要关心什么？',
        options: ['不用关心', '切块策略仍直接影响检索质量', '颜色', '日志'],
        answer: 1,
        explain: '切块质量仍关键。',
        concept: 'llamaindex-rag',
      },
    ],
    [
      ['VectorStoreIndex', '向量索引'],
      ['asQueryEngine', '把索引转成查询引擎'],
      ['KnowledgeGraphIndex', '图索引'],
    ],
    ['切块交给框架就不管了，检索质量下降。', '需要精细控制重排时仍用默认配置。'],
  ),
  'framework',
)
