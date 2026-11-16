# B1-01 · DeepSeek-V3 技术报告（检索原始返回）

- 工具：WebSearch
- 查询：`DeepSeek-V3 technical report MLA multi-head latent attention MoE MTP multi-token prediction arxiv 2412.19434`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（arXiv 官方论文 + DeepSeek 官方仓库）

## 一手来源（S 编号）

- **S-V3**：DeepSeek-V3 Technical Report，arXiv:2412.19437（官方，DeepSeek-AI）。
  - URL：https://arxiv.org/abs/2412.19437
  - HTML 全文：https://arxiv.org/html/2412.19437v1
  - 官方仓库：https://github.com/deepseek-ai/DeepSeek-V3

## 关键事实（待提炼进 evidence）

- 模型：**671B 总参数 / 每 token 激活 37B** 的 MoE 语言模型。
- 架构：采用 **MLA（Multi-head Latent Attention）+ DeepSeekMoE**（V2 已验证）。
- 首创 **auxiliary-loss-free（无辅助损失）负载均衡** 策略。
- 设定 **Multi-Token Prediction（MTP）** 训练目标。
- 预训练 14.8T token；完整训练 2.788M H800 GPU 小时；训练过程无不可恢复 loss spike / 无回滚。
- 目录含：Basic Architecture（MLA、DeepSeekMoE + Aux-Loss-Free LB、MTP）、Infrastructure（DualPipe、Cross-Node All-to-All、FP8 训练、Prefill/Decode）、Pre-Training（含 MTP 与负载均衡消融）、Post-Training（SFT + GRPO RL）。
- MoE 细节（第三方转述，需回论文核实）：256 个细粒度专家 + 共享专家，每 token 路由 8 个专家。

## 注意

- 用户 query 写的 arXiv 号是 `2412.19434`，但官方 DeepSeek-V3 实为 **`2412.19437`**（命中结果确认）。`2412.19434` 可能是误记；台账一律用 2412.19437。
- DeepSeek-V2（MLA 首次提出）另行检索（arXiv:2405.04434，待 B1-03 核实）。
