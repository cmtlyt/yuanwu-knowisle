# B1-08 · 位置编码谱系（检索原始返回）

- 工具：WebSearch
- 查询：`Rotary Position Embeddings RoPE arxiv 2104.09864 YaRN NTK-aware scaling arxiv 2309.00071`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（官方 arXiv）；各框架 RoPE 基频（Llama b=500000 等）第三方整理，需回官方 config 核实

## 一手来源

- **S-RoPE**：Su et al.《RoFormer: Enhanced Transformer with Rotary Position Embedding》，arXiv:2104.09864 —— RoPE 将位置编码成 Q/K 的旋转矩阵，注意力得分只依赖相对距离 (m−n)；三大特性：相对位置感知、旋转保范、无查表。
- **S-ALiBi**：Press et al.《Train Short, Test Long: Attention with Linear Biases》，arXiv:2108.12409 —— 注意力 logit 上加 −m·|j−i| 线性距离惩罚，按头学斜率，无需重训即可外推。
- **S-YaRN**：Peng et al.《YaRN: Efficient Context Window Extension of LLMs》，arXiv:2309.00071 —— NTK-by-parts 频率分带（高频不动 / 低频全插值 / 中频 ramp）+ 注意力温度缩放；Llama2 7B 约 384 A100 GPU 时扩到 128K，短上下文退化 <1%。
- 谱系前置：**Position Interpolation**（Chen et al. 2023，arXiv:2306.15595，均匀拉伸全局旋转频率，伤局部语法）、**LongRoPE**（Ding et al. 2024，arXiv:2402.13753，进化搜索逐维缩放 + 渐进训练，扩到 2M+ token）、**Transformer-XL** 相对位置（Dai et al. 2019）。

## 关键概念（课程 M1 S2 用）

- 位置编码谱系：绝对/正弦 → 可学习相对偏置 → **RoPE（旋转）**；主流 LLM（Llama/Mistral/Qwen/Gemma/DeepSeek）均用 RoPE。
- **RoPE 长度外推问题**：旋转频率按训练长度校准，超训练长度会 OOD 失配 → 需 NTK/YaRN/LongRoPE。
- **DeepSeek 的解耦 RoPE（decoupled RoPE）**：MLA 把 KV 压缩成潜在向量后，RoPE 无法直接旋转无位置的 latent → 把 K 拆成「未旋转内容 + 小旋转 k^R」，保住 KV 压缩又保住相对位置精度（见 B1-03 的 V2 论文）。

## 注意

- 「RoPE 被 Llama/Mistral/Qwen/Gemma/DeepSeek 采用」及引用数（Semantic Scholar 6,184）为第三方陈述；课程正文用「行业标配」定性即可，具体数字不担关键结论。
