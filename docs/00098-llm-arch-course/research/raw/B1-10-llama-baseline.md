# B1-10 · Llama 自回归基线（检索原始返回）

- 工具：WebSearch
- 查询：`Llama 3 herd models arxiv 2407.21783 RMSNorm GQA RoPE decoder-only Llama 2 arxiv 2307.09288`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（Meta 官方 arXiv）；本轮命中多为中文百科/媒体（C 级），arXiv 号被多方一致引用，可升级到官方页

## 一手来源（arXiv 号多方一致，可升级官方）

- **S-Llama2**：Touvron et al. 2023《Llama 2: Open Foundation and Fine-Tuned Chat Models》，arXiv:2307.09288（Meta）。
- **S-Llama3**：Grattafiori et al. 2024《The Llama 3 Herd of Models》，arXiv:2407.21783（Meta）。
- 官方仓库：huggingface.co/meta-llama（各尺寸 config 可查 RMSNorm/GQA 配置）。

## 关键事实（课程 M1 自回归基线锚点）

- **decoder-only Transformer**：Llama 系列标准自回归架构。
- **RMSNorm**（预归一化，Pre-Norm）：替代标准 LayerNorm，更高效。
- **GQA（Grouped-Query Attention）**：Llama 2 起对 13B/70B 用 GQA（70B 为 8 组 KV），Llama 3 对 8B/70B 全用 GQA；小模型用 MHA。
- **RoPE**：Llama 系位置编码标配。
- **Tokenizer**：Llama 3 用 128K 词表（Llama 2 为 32K），更高效编码。
- **上下文**：Llama 3 8B/70B 训练 8K（8192 token，掩码避免跨文档）；Llama 3.1 扩到 128K。
- **数据**：Llama 3 用 15T+ token（Llama 2 的 7 倍），>5% 非英语、30+ 语言。
- 第三方反复确认：8B/70B 在 8K 序列上训练并跨文档掩码。

## 注意

- RMSNorm 原始出处 Zhang & Sennrich 2019《Root Mean Square Layer Normalization》arXiv:1910.07248，课程 M1 S3 需单列（本条未检索，标注待补）。
