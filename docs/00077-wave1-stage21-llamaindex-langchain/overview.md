# Wave 1 第十九批：Stage 21 LlamaIndex.TS + LangChain.JS 四课（L108–L111）

## 目标

重写模块七第五、六个框架专论（4 课）。这两个框架的定位与前四个都不同——它们都**围绕「数据 → 索引 → 查询」组织**，
而不是围绕 agent 编排：LlamaIndex 聚焦 RAG / 向量 / Graph RAG，LangChain 聚焦 tools / chains 的可组合单元。

写作风险：容易写成「组件 API 速查」或和前面框架重复。统一定位：**每个框架讲清它的「组织原语」是什么、替你还哪笔债、锁在哪**。

按 00055 下限：四节均为 framework（正文 1500 / 代码 1000）。

## 现状

| 课 | 课型 | 标题 | 正文 / 下限 | 代码 / 下限 |
|---|---|---|---|---|
| L108 | framework | LlamaIndex.TS 核心：RAG / 向量 / Graph RAG | 188 / 1500 | 331 / 1000 |
| L109 | framework | 对照：用 LlamaIndex.TS 重写向量 / Graph RAG（对比 L49 / L50） | 210 / 1500 | 362 / 1000 |
| L110 | framework | LangChain JS 核心：tools / chains | 190 / 1500 | 395 / 1000 |
| L111 | framework | 对照：用 LangChain JS 重写 Function Calling + 检索链（对比 L42 / L49） | 190 / 1500 | 513 / 1000 |

## 课型复核

- L108：交付物是三个核心概念的可运行最小实现 → framework ✓
- L109：交付物是完整重写的向量 / Graph RAG → framework ✓
- L110：交付物是 tools / chains 的可运行最小实现 → framework ✓
- L111：交付物是完整重写的 FC + 检索链 → framework ✓

**四节原标注正确。**

## 分工

| 课 | 唯一要回答的问题 | 明确不讲 |
|---|---|---|
| L108 | LlamaIndex 的组织原语（Document/Node/Index/QueryEngine）各抽象哪层 | 通用 agent 编排（L96+） |
| L109 | 同段 RAG 逻辑下 LlamaIndex vs L49/L50 手写差异 | MCP（L45）、Mastra rag（L103） |
| L110 | LangChain 的 chain / tool / runnable 抽象 | 完整 agent（L68） |
| L111 | 同段 FC / 检索逻辑下 LangChain vs L42/L49 手写差异 | 多 Agent（L68） |

## 术语统一

- **组织原语**：每个框架用来「把东西串起来」的最小可组合单元（LlamaIndex 的 Index、LangChain 的 Chain/Runnable）。
- **检索链（retrieval chain）**：先召回相关文档再让模型基于它回答，等价于 L49 手写向量 RAG 的「召回 + 生成」两段。
- **Graph RAG**：把实体关系建成图，查询时沿图游走，对应 L50 手写版。
- **Runnable**：LangChain 的统一执行接口（pipe 组合），类似 AI SDK 的 provider 抽象但面向「链」而非「模型」。

## 变更计划

1. L108：以「手写向量 RAG 300 行，一半在管 chunk/embed/索引/查询」开场；核心原语对照表；最小 Document→VectorStoreIndex→QueryEngine 实现 + GraphIndex 简述。
2. L109：重写向量 RAG（fromDocuments + query vs L49 手写）、Graph RAG（GraphIndex vs L50）；给「省了胶水 / 锁了索引形态」判据。
3. L110：以「chain 是把 LLM+工具+记忆串成可复用单元」开场；chain/tool/runnable/memory/retriever 抽象层表；最小 chain 实现。
4. L111：重写 Function Calling（tool calling agent vs L42）、检索链（retrieval chain vs L49）；给「LangChain 的可组合性 vs 手写样板」判据。
5. 每节 ≥1 表格、≥2 callout、≥1 代码块；双扫描；`--update-baseline`；全门禁。

## 验证方案

- `content-gate --only=L108,L109,L110,L111` 四节 ✓ 且余量 >50。
- 渲染：table≥1 / callout≥2 / code≥1 / leftover=0 / fenceLeak=0。
- `pnpm verify` / `lint` / `typecheck` 全绿；`tmp-backtick.mjs` + `tmp-escape.mjs` 双扫描干净。

## 实测（实施后回填）

<section id="result">

四课均为 framework（正文 1500 / 代码 1000），全部达标且留有余量：

| 课 | 课型 | 标题 | 正文 / 下限 | 代码 / 下限 |
|---|---|---|---|---|
| L108 | framework | LlamaIndex.TS 核心：RAG / 向量 / Graph RAG | 1657 / 1500 | 1057 / 1000 |
| L109 | framework | 对照：用 LlamaIndex.TS 重写向量 / Graph RAG | 1650 / 1500 | 1102 / 1000 |
| L110 | framework | LangChain JS 核心：tools / chains | 1564 / 1500 | 1252 / 1000 |
| L111 | framework | 对照：用 LangChain JS 重写 FC + 检索链 | 1632 / 1500 | 1238 / 1000 |

- L108 用「手写向量 RAG 三百行，一半在管四件事」开场，给核心原语对照表 + Document/Node 分层 + 自定义 chunk + 元数据过滤；L109 两段重写对照（向量/L49、图/L50）+ 混合检索 + 重排，落点「框架吃掉了建索引的胶水，没吃掉调召回的判断」。L110 用「同一 LLM+工具+记忆复制八次」开场，给 Runnable/pipe 抽象表 + 中间件可插拔；L111 两段重写（FC/L42、检索链/L49）+ 混合链合成，落点「chain 表达不了图，分支循环上 LangGraph」。
- 初稿四课均远低于 framework 下限（L108 1199/558、L109 1076/499、L110 1068/933、L111 906/983）——因在 baseline 豁免里 gate 不报红。已各自补「召回策略实验 / 中间件组合 / 混合链合成 / Document 分层」等节达标。L111 初稿还在正文里写了字面 `\n`（被 tmp-escape 扫出会变成真换行），已改为「上下文段与问题段两段」表述。
- 全局达标 98 → **102/142**，豁免 44 → 40。verify 四段、lint 0e/4w、typecheck 0e/9w 全绿。

</section>
