# B1-05 · 扩散 LLM LLaDA（检索原始返回）

- 工具：WebSearch
- 查询：`Diffusion LLM LLaDA arxiv diffusion transformer discrete diffusion language model 2024 2025`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（arXiv 官方论文 2502.09992 + 官方 GitHub）

## 一手来源

- **S-LLaDA**：Shen Nie et al.（人大高瓴 + 蚂蚁），《Large Language Diffusion Models》(LLaDA)，arXiv:2502.09992（2025-02-14 v1）。
  - URL：https://arxiv.org/abs/2502.09992
  - 官方仓库 / demo：https://github.com/ML-GSAI/LLaDA · https://ml-gsai.github.io/LLaDA-demo/
  - 被 NeurIPS 2025 以 oral 报告（第三方记录）。

## 关键事实

- **非自回归扩散 LLM**：用前向掩码（forward masking）+ 反向生成预测被掩 token，参数化体是**标准 decoder-only Transformer 但去掉因果掩码**（双向）。
- **LLaDA 8B** 从零训练（2.3T token，~0.13M H800 GPU 时），与同规模自回归基线 LLaMA3 8B 可比：
  - MMLU 65.9 vs 65.4；GSM8K 70.3 vs 48.7；MATH 31.4 vs 16.0；HumanEval 35.4 vs 34.8。
  - 核心论点：**LLM 核心能力（缩放/ICL/指令跟随/压缩）并非自回归目标特有，可从双向扩散模型涌现**；并缓解「reversal curse」（反向诗歌补全超 GPT-4o，第三方转述需核实）。
- 谱系延伸（需后续核实）：LLaDA 1.5（偏好优化）、LLaDA-V（多模态）、LLaDA-MoE（原生 MoE）、LLaDA 2.0（100B）；同类商用扩散 LLM 有 Inception Labs Mercury（第三方记录）。
- **理论前置**：SEDD（Score Entropy Discrete Diffusion，ICML 2024，Lou/Meng/Ermon）小规模证明离散扩散可做语言建模；吸收态扩散（absorbing-state）= 随机比例掩码的广义 MLM（与 BERT 式掩码建模同构）。

## 注意

- 基准对比数字（MMLU/GSM8K 等）来自官方论文摘要（A 级），但「超 GPT-4o」这类点状结论建议回论文正文核原始设定，台账先标 A 并注明「摘要级」。
