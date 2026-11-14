import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 21 ========== */

export const L109 = L(
  'L109',
  21,
  '对照：用 LlamaIndex.TS 重写向量 / Graph RAG（对比 L49 / L50 手写版）',
  18,
  3,
  ['L108', 'L49', 'L50'],
  ['llamaindex-rag'],
  [
    '用 LlamaIndex 重写向量 RAG 与 Graph RAG，对比 L49 / L50 手写版',
    '理解索引抽象如何替代手写 embedding/检索/图遍历',
    '度量代码量与可控性的差异',
  ],
  [
    prose(
      'RAG 的框架版',
      'L49 手写的向量 RAG（embedding + 检索 + 重排）、L50 的 Graph RAG（实体 + 关系 + 多跳），用 LlamaIndex 重写。',
    ),
    code(
      '向量 / Graph RAG 重写',
      '// 手写版（L49）：embed + index + retrieve + 重排，约 40 行\n// LlamaIndex 版：\nconst index = await VectorStoreIndex.fromDocuments(docs)\nconst engine = index.asQueryEngine()\nconst answer = await engine.query({ query: q })   // 检索 + 生成一行\n\n// Graph RAG（对照 L50 手写的实体+关系+多跳遍历）\nconst kgIndex = await KnowledgeGraphIndex.fromDocuments(docs)\nconst kgEngine = kgIndex.asQueryEngine()\nconst answer2 = await kgEngine.query({ query: "A 和 B 什么关系" })',
      '关键：L49 手写的 embedding/切块/相似度检索，被 `VectorStoreIndex` 一行替代；L50 的图构建+遍历，被 `KnowledgeGraphIndex` 替代。',
    ),
    call(
      'deep',
      '度量差异',
      '代码量：LlamaIndex 版大幅缩短（索引与查询引擎内置）。可控性：让渡明显——切块策略、相似度算法、重排逻辑都由框架默认决定，除非深入配置。这些正是 L49/L50 手写时你亲手掌控的部分。',
    ),
    list('对照结论', [
      '向量 RAG：VectorStoreIndex 替代手写 embed+检索+重排。',
      'Graph RAG：KnowledgeGraphIndex 替代手写实体抽取+图遍历。',
      '代价：切块/相似度/重排的精细控制让渡给框架。',
    ]),
    call(
      'warn',
      '切块策略仍是关键',
      'LlamaIndex 有默认切块策略，但「怎么切」仍直接影响检索质量（呼应 L49 的切块陷阱）。框架替你切了，不代表你不用关心切得好不好。',
    ),
  ],
  null,
  [
    q(
      'L49 手写的 embed+检索+重排，在 LlamaIndex 里是？',
      ['手写', 'VectorStoreIndex + asQueryEngine', 'KnowledgeGraphIndex', 'Document'],
      1,
      'VectorStoreIndex。',
      'llamaindex-rag',
    ),
    q(
      'L50 手写的图构建+遍历，在 LlamaIndex 里是？',
      ['VectorStoreIndex', 'KnowledgeGraphIndex', 'SummaryIndex', 'Document'],
      1,
      'KnowledgeGraphIndex。',
      'llamaindex-rag',
    ),
    q(
      '框架替你切块后，你还要关心什么？',
      ['不用关心', '切块策略仍直接影响检索质量', '颜色', '日志'],
      1,
      '切块质量仍关键。',
      'llamaindex-rag',
    ),
  ],
  [
    ['VectorStoreIndex', '向量索引'],
    ['asQueryEngine', '把索引转成查询引擎'],
    ['KnowledgeGraphIndex', '图索引'],
  ],
  ['切块交给框架就不管了，检索质量下降。', '需要精细控制重排时仍用默认配置。'],
)
