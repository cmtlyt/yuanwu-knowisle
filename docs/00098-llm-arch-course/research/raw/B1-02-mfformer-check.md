# B1-02 · mFformer 存在性核实（检索原始返回）

- 工具：WebSearch
- 查询：`DeepSeek mFformer architecture transformer`
- 核实日期：2026-11-16
- 可信级别提示：**未命中官方来源（暂判 C / 存疑）**

## 结果

返回 5 条均为第三方泛泛文章（deepseek.net 产品页、个人博客、51CTO、oryoy、intelliparadigm），**没有一条提到 "mFformer" 这一命名**，也没有指向 DeepSeek 官方论文 / 仓库。这些文章反复把 DeepSeek 的创新归为：Transformer 基础 + MoE + MLA + RoPE + MTP。

## 初步判断（待 B7 专项核实后定稿）

- "mFformer" 极可能是**误记 / 混淆词**，DeepSeek 官方论文（V2/V3/R1）中没有此命名。
- 最接近的真实概念候选（需逐一对比）：
  - **MLA（Multi-head Latent Attention）** —— V2 起真实存在；
  - **MTP（Multi-Token Prediction）** —— V3 起真实存在；
  - **MoE 的 mF（mix/merge 专家）** —— 无此官方缩写；
  - **Mamba 的 M（state-space）** —— 非 DeepSeek。
- **结论倾向**：课程大纲中「mFformer」一项应标注为「未找到官方来源，疑似误记」，不把它当作真实架构点列入 DeepSeek 创新清单；如用户坚持保留，则只作背景提及并明确标注可信级别 C。

## 待办

- B7 批次：用 `DeepSeek "mFformer"` 精确引号搜索 + 查 DeepSeek 官方 GitHub release / 论文，二选一定论。
