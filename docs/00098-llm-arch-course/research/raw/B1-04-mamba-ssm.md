# B1-04 · Mamba / 状态空间模型 SSM（检索原始返回）

- 工具：WebSearch
- 查询：`Mamba state space model selective scan arxiv 2402.03684 state space Mamba-2`
- 核实日期：2026-11-16
- 可信级别提示：**Mamba/Mamba-2 论文为 A 级**；混合格式（Jamba/Zamba/Falcon-H1）与「线性注意力谱系」第三方整理需回官方核实（B4）

## 一手来源（待 B4 补官方 arXiv 链接）

- **Mamba-1**：Gu & Dao，《Mamba: Linear-Time Sequence Modeling with Selective State Spaces》(arXiv:2402.03684)。
  核心：选择性 SSM（S6），Δ/B/C 随输入变化，硬件感知并行扫描，语言建模线性复杂度、恒定推理内存。
- **Mamba-2**：Dao & Gu 2024（state-spaces/mamba 仓库）。
  核心：结构化状态空间对偶（SSD）框架，数学上统一 SSM 与注意力；SSD 层把状态维度从 16 扩到 256，比 Mamba-1 快 2–8×；X 并行生成 SSM 参数、加额外 norm 层（NormFormer 式）。
- **Mamba-3**：在 Mamba-2 基础上加梯形离散化 + 复数化 SSM + MIMO-SSM（第三方百科整理，需回官方仓库核实）。

## 谱系要点（B4 需逐条回官方/论文核实）

- 经典 SSM 谱系：S4（fixed dynamics）→ Mamba（selective，input-dependent ΔB C）。
- **混合架构（hybrid）现状**：到 2026 年纯 SSM 线多已让位于「SSM + 少量全注意力」的混合生产模型——
  - **Jamba**（AI21, 2024）：Mamba–Transformer–MoE 混合；
  - **Zamba**（Zyphra, 2024）；
  - **Falcon-H1**（TII, 2025）；
  - 线性递归侧：**xLSTM**（Beck et al., 2024，指数门控 + 矩阵记忆）。
  - 第三方反复总结：「一小撮注意力层即可补上质量差距、同时保住推理内存收益」。
- 核心 tradeoff（第三方）：SSM 推理 O(1) 每步内存 vs Transformer 注意力 O(n) KV cache；代价是远距离精确召回。

## 注意

- 检索返回里大量是百科/博客（C 级）。Mamba 关键数字（线性复杂度、5× 吞吐、Mamba-3 的三大改进）**必须升级到 arXiv 官方论文与 state-spaces 仓库**（B4 批次），台账先标 A（论文存在）但具体数值挂到官方。
