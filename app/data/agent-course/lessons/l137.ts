import { L } from '../../course-builders.ts'

/* ========== Stage 27 ========== */

export const L137 = L(
  'L137',
  27,
  '实战 Capstone B：从零实现 RAG + Graph RAG 知识库',
  22,
  4,
  ['L136'],
  ['cap-b-rag'],
  [
    '从零实现向量 RAG + Graph RAG 知识库',
    '掌握「多跳推理检索」与「向量检索」的结合',
    '理解研究型 Agent 的检索为何需要「多源 + 去重 + 溯源」',
  ],
  `
### 检索是研究型 Agent 的「证据来源」

Capstone B 的检索不能只是「向量相似度 top-k」，还要支持多跳推理（Graph RAG）和多源去重。本课从零实现 RAG + Graph RAG，不复用 L49/L50，思路一致。

\`\`\` title="从零实现 RAG + Graph RAG（不复用 L49/L50）" note="关键：向量检索负责「相似」，Graph RAG 负责「多跳关系」，溯源标注贯穿始终。"
// ① 向量 RAG：把研究问题编码成向量，检索 top-k
const qVec = await embed(question)
const candidates = await vectorIndex.search(qVec, 20)  // 召回 20

// ② Graph RAG：沿知识图谱做多跳，找「A 影响 B、B 影响 C」这类关系
const hops = await graph.traverse(candidates, { depth: 2 })
//   → 问题：某技术对行业的影响
//   → 一跳：技术 → 相关公司；二跳：公司 → 市场份额

// ③ 多源去重 + 溯源标注：每段证据带 sourceId
const evidence = dedupe([...candidates, ...hops])
  .map(e => ({ text: e.text, source: e.sourceId }))

// ④ 重排：据相关性重排，取最相关的 N 段给 L138 综合
return rerank(evidence, question).slice(0, N)
\`\`\`

:::deep

### Graph RAG 补上向量检索的「关系盲区」

向量检索擅长「语义相似」，但回答不了「A 和 C 之间隔着 B 的多跳关系」。Graph RAG 把知识组织成实体-关系图，沿边做多跳遍历，才能回答「这项技术如何经由中间环节影响市场」这类问题。研究型任务里两者缺一不可。

:::

### 知识库的验收点

- 向量检索能召回语义相关的段落。
- Graph RAG 能回答需要多跳关系的问题。
- 多源结果能去重，不重复喂给模型。
- 每段证据都带 sourceId，为溯源做准备。
- 重排后取最相关 N 段，控制上下文长度。

:::warn

### 检索结果不带溯源 = 无法校验

研究型 Agent 的检索结果必须标注来源（sourceId）。如果检索时就把来源丢了，后面的溯源校验（L139）就无从谈起，整份报告的可信度也会崩塌。溯源标注要「从检索这一刻」就开始做。

:::

`,
  null,
  [
    {
      text: 'Graph RAG 补上的是向量检索的？',
      options: ['速度', '关系盲区（多跳推理）', '成本', '存储'],
      answer: 1,
      explain: '多跳关系向量检索做不了。',
      concept: 'cap-b-rag',
    },
    {
      text: '向量 RAG 擅长的是？',
      options: ['多跳关系', '语义相似检索', '图遍历', '实体识别'],
      answer: 1,
      explain: '相似检索是向量特长。',
      concept: 'cap-b-rag',
    },
    {
      text: '为什么检索结果必须带 sourceId？',
      options: ['省空间', '为溯源校验做准备，否则报告不可信', '加速', '去重'],
      answer: 1,
      explain: '溯源从检索就开始。',
      concept: 'cap-b-rag',
    },
  ],
  [
    ['向量 RAG', '语义相似度检索'],
    ['Graph RAG', '沿知识图谱多跳遍历'],
    ['多源去重', '去除重复证据'],
    ['sourceId', '证据来源标识，溯源基础'],
  ],
  ['只用向量检索，研究型任务里漏掉多跳关系。', '检索时丢弃来源，导致后续无法溯源校验。'],
)
