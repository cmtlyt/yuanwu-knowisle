# B1-03 · DeepSeek-V2 技术报告（MLA 首次提出）

- 工具：WebSearch
- 查询：`DeepSeek-V2 technical report arxiv 2405.04434 multi-head latent attention KV cache compression`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（arXiv 官方）

## 一手来源

- **S-V2**：DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model，arXiv:2405.04434（DeepSeek-AI）。
  - URL：https://arxiv.org/abs/2405.04434
  - 官方仓库：https://github.com/deepseek-ai/DeepSeek-V2

## 关键事实

- 模型：**236B 总参数 / 每 token 激活 21B**，上下文 128K，预训练 8.1T token。
- **MLA 首次在此提出**：把 KV 缓存压缩为低维潜在向量 c_KV（维度 d_c ≪ 2·n_h·d_h），生成时再用学习上投影还原；相对 DeepSeek 67B 把 KV 缓存减 **93.3%**，最大生成吞吐提升 **5.76×**。
- 解耦 RoPE（decoupled RoPE）：把旋转位置编码从低秩压缩路径中分离，保留长序列性能。
- **DeepSeekMoE**：细粒度专家 + 共享专家隔离；专家并行 + 负载均衡。
- 相比 67B 省 42.5% 训练成本。

## 高效注意力谱系（第三方整理，需回论文/官方核实 → B2）

- **MQA**（Multi-Query Attention，Shazeer 2019）：所有 query 头共享 1 个 KV 头，KV 内存降 n_h 倍，代价是质量下降。
- **GQA**（Grouped-Query Attention，Ainslie et al. 2023）：query 头分 g 组、每组共享 1 个 KV 头，内存降 n_h/g 倍，质量折中；被 Llama 系列采用。
- **MLA**：低秩联合压缩而非头共享，论文消融（§D）称其在同等算力下不劣于 MHA/MQA/GQA（第三方 promptingindex 转述，需回官方论文核实该消融结论）。
