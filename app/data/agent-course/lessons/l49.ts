import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 7 ========== */

export const L49 = withKind(
  L(
    'L49',
    7,
    '实战：实现一个最小向量 RAG 管线（embedding + 检索 + 重排）',
    4,
    ['L48'],
    ['vector-rag'],
    [
      '用 TS 实现 embedding → 检索 → 重排的最小 RAG 管线',
      '理解「先检索、再喂给模型」与「全塞上下文」的区别',
      '对照 LlamaIndex / LangChain 的 Retriever 等价实现',
    ],
    `
### RAG = 检索增强生成

RAG（Retrieval-Augmented Generation）把「知识」放外部向量库，回答问题前**先检索相关片段，再喂给模型**，而不是让模型凭记忆答。三步：embedding（向量化）→ 检索（相似度匹配）→ 重排（优化顺序）。

\`\`\` title="最小 RAG 管线" note="核心：模型不「背」知识，而是每次现查现用——知识更新时无需重训。"
// ① embedding：把文本转成向量（教学用余弦相似度示意）
async function embed(text: string): Promise<number[]> {
  return callEmbeddingApi(text)  // 真实场景接 embedding 模型
}

// ② 建索引：文档切块 → 逐块向量化存库
async function index(chunks: string[]) {
  return Promise.all(chunks.map(async (c) => ({ text: c, vec: await embed(c) })))
}

// ③ 检索：查询向量化 → 找最相似的 topK
async function retrieve(query: string, store: Chunk[], k = 4) {
  const qv = await embed(query)
  return store
    .map((c) => ({ chunk: c, score: cosine(qv, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// ④ 增强生成：把检索结果拼进 prompt
const top = await retrieve(question, store)
const answer = await client.chat([
  { role: "system", content: "根据以下资料回答：\\\\n" + top.map((t) => t.chunk.text).join("\\\\n") },
  { role: "user", content: question },
])
\`\`\`

:::deep

### 重排（rerank）为什么重要

向量相似度找的 topK 只是「相关」，不一定「最有用」。重排器（reranker）对 topK 做精排，把真正回答问题的片段提前。工程上常「先粗检（快）→ 再精排（准）」。

:::

### RAG 的三个优势

- 知识可更新：文档变了，重建索引即可，不用重训模型。
- 可溯源：答案能指向具体片段，减少幻觉。
- 省上下文：只喂相关片段，不塞整本知识库。

:::warn

### 切块大小很关键

chunk 太大 → 检索不精准、超出上下文；太小 → 语义被切断。通常按语义边界（段落/小节）切，而非固定字符数一刀切。

:::

`,
    null,
    [
      {
        text: 'RAG 的三步是？',
        options: ['训练、推理、部署', 'embedding → 检索 → 重排', '加密、解密、签名', '增、删、改'],
        answer: 1,
        explain: '向量化、相似度检索、重排。',
        concept: 'vector-rag',
      },
      {
        text: 'RAG 相比「让模型背知识」的核心优势是？',
        options: ['模型更小', '知识可更新（重建索引即可）、可溯源、省上下文', '更快', '不需要 embedding'],
        answer: 1,
        explain: '知识外置、按需检索、可溯源。',
        concept: 'vector-rag',
      },
      {
        text: '重排（rerank）的作用是？',
        options: ['加快向量化', '对粗检 topK 做精排，把真正有用的片段提前', '减少存储', '替代 embedding'],
        answer: 1,
        explain: '先粗检再精排。',
        concept: 'vector-rag',
      },
    ],
    [
      ['embedding', '把文本转成向量表示'],
      ['余弦相似度', '衡量两个向量方向相似程度的指标'],
      ['rerank', '对粗检结果做精排，提升相关片段排序'],
    ],
    ['切块固定字符数一刀切，语义被切断。', '把整本知识库塞进 prompt，违背 RAG 的「按需检索」初衷。'],
  ),
  'practice',
)
