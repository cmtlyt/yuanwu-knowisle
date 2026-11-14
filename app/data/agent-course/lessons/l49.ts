import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 7 ========== */

export const L49 = L(
  'L49',
  7,
  '实战：实现一个最小向量 RAG 管线（embedding + 检索 + 重排）',
  20,
  4,
  ['L48'],
  ['vector-rag'],
  [
    '用 TS 实现 embedding → 检索 → 重排的最小 RAG 管线',
    '理解「先检索、再喂给模型」与「全塞上下文」的区别',
    '对照 LlamaIndex / LangChain 的 Retriever 等价实现',
  ],
  [
    prose(
      'RAG = 检索增强生成',
      'RAG（Retrieval-Augmented Generation）把「知识」放外部向量库，回答问题前**先检索相关片段，再喂给模型**，而不是让模型凭记忆答。三步：embedding（向量化）→ 检索（相似度匹配）→ 重排（优化顺序）。',
    ),
    code(
      '最小 RAG 管线',
      '// ① embedding：把文本转成向量（教学用余弦相似度示意）\nasync function embed(text: string): Promise<number[]> {\n  return callEmbeddingApi(text)  // 真实场景接 embedding 模型\n}\n\n// ② 建索引：文档切块 → 逐块向量化存库\nasync function index(chunks: string[]) {\n  return Promise.all(chunks.map(async (c) => ({ text: c, vec: await embed(c) })))\n}\n\n// ③ 检索：查询向量化 → 找最相似的 topK\nasync function retrieve(query: string, store: Chunk[], k = 4) {\n  const qv = await embed(query)\n  return store\n    .map((c) => ({ chunk: c, score: cosine(qv, c.vec) }))\n    .sort((a, b) => b.score - a.score)\n    .slice(0, k)\n}\n\n// ④ 增强生成：把检索结果拼进 prompt\nconst top = await retrieve(question, store)\nconst answer = await client.chat([\n  { role: "system", content: "根据以下资料回答：\\n" + top.map((t) => t.chunk.text).join("\\n") },\n  { role: "user", content: question },\n])',
      '核心：模型不「背」知识，而是每次现查现用——知识更新时无需重训。',
    ),
    call(
      'deep',
      '重排（rerank）为什么重要',
      '向量相似度找的 topK 只是「相关」，不一定「最有用」。重排器（reranker）对 topK 做精排，把真正回答问题的片段提前。工程上常「先粗检（快）→ 再精排（准）」。',
    ),
    list('RAG 的三个优势', [
      '知识可更新：文档变了，重建索引即可，不用重训模型。',
      '可溯源：答案能指向具体片段，减少幻觉。',
      '省上下文：只喂相关片段，不塞整本知识库。',
    ]),
    call(
      'warn',
      '切块大小很关键',
      'chunk 太大 → 检索不精准、超出上下文；太小 → 语义被切断。通常按语义边界（段落/小节）切，而非固定字符数一刀切。',
    ),
  ],
  null,
  [
    q(
      'RAG 的三步是？',
      ['训练、推理、部署', 'embedding → 检索 → 重排', '加密、解密、签名', '增、删、改'],
      1,
      '向量化、相似度检索、重排。',
      'vector-rag',
    ),
    q(
      'RAG 相比「让模型背知识」的核心优势是？',
      ['模型更小', '知识可更新（重建索引即可）、可溯源、省上下文', '更快', '不需要 embedding'],
      1,
      '知识外置、按需检索、可溯源。',
      'vector-rag',
    ),
    q(
      '重排（rerank）的作用是？',
      ['加快向量化', '对粗检 topK 做精排，把真正有用的片段提前', '减少存储', '替代 embedding'],
      1,
      '先粗检再精排。',
      'vector-rag',
    ),
  ],
  [
    ['embedding', '把文本转成向量表示'],
    ['余弦相似度', '衡量两个向量方向相似程度的指标'],
    ['rerank', '对粗检结果做精排，提升相关片段排序'],
  ],
  ['切块固定字符数一刀切，语义被切断。', '把整本知识库塞进 prompt，违背 RAG 的「按需检索」初衷。'],
)
