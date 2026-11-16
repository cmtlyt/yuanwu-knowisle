# B1-11 · RMSNorm + GQA 官方来源（检索原始返回）

- 工具：WebSearch
- 查询：
  - `Root Mean Square Layer Normalization arxiv 1910.07248 Zhang Sennrich RMSNorm`
  - `Grouped-Query Attention arxiv 2305.13245 Ainslie multi-query attention GQA`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（官方 arXiv）

## 关键更正（本批次重要）

- **RMSNorm 的 arXiv 号是 `1910.07467`，不是 `1910.07248`**。
  - 检索一致命中 `hf.co/papers/1910.07467`、`arxiv-vanity.com/papers/1910.07467`。
  - Zhang & Sennrich 2019《Root Mean Square Layer Normalization》：去掉 LayerNorm 的 re-centering（减均值），只保留 re-scaling（按 RMS），省 7–64% 计算；并提 partial RMSNorm（pRMSNorm）。
  - **此前 B1-10 / evidence 表里写的 1910.07248 是错号，一律改为 1910.07467。**

## 一手来源

- **S-RMSNorm**：Zhang & Sennrich 2019，arXiv:**1910.07467**（更正后）。
- **S-GQA**：Ainslie, Lee-Thorp, de Jong et al. 2023《GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints》，arXiv:**2305.13245**（EMNLP 2023，Google Research，官方页可达）。
  - 核心：GQA = query 头分 G 组、每组共享 1 个 KV 头（MHA 与 MQA 之间折中）；可用 5% 预训练算力把已有 MHA 模型 uptrain 成 GQA；Llama 2 起被采用。

## 更正范围

- `evidence/00-discipline.md` 来源登记表 S-RMSNorm 行：1910.07248 → **1910.07467**。
- `drafts/course-outline.md` M1 S3 的 RMSNorm arXiv 号同步更正。
- 本台账 GQA 补齐官方号 2305.13245（此前标「GQA 论文 · A」无号）。
