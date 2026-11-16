# B3-01 · 混合/线性注意力谱系 + 对齐补号（检索原始返回）

- 工具：WebSearch + WebFetch（arXiv 官方 abs 页逐一核验）
- 查询：
  - `LongRoPE arXiv 2402.13753; Jamba; xLSTM 2405.09933; Hedgehog 2301.08299`
  - `Constitutional AI arXiv; InstructGPT arXiv 2203.02155`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（官方 arXiv abs 页可达，逐一 WebFetch 核验）

## 一手来源（arXiv 号经官方 abs 页核验，含 3 处更正）

| 源 ID | 主题 | 一手来源 | 级别 | 备注 |
|---|---|---|---|---|
| S-LongRoPE | 长上下文 2M 外推 | arXiv:**2402.13753**（Ding et al., Microsoft） | A | 官方 abs 可达；渐进扩展 256k→2048k |
| S-Jamba | 混合 Transformer-Mamba-MoE | arXiv:**2403.19887**（Lieber et al., AI21） | A | **更正：非 2403.19897**；Jamba 7B 基座=12B 激活/52B 总参，单 80GB GPU，256K 上下文 |
| S-xLSTM | 扩展 LSTM（指数门控 + 矩阵记忆） | arXiv:**2405.04517**（Beck et al., JKU/Hochreiter） | A | **更正：非 2405.09933**；sLSTM/mLSTM，xLSTM 7B 为最快 7B 推理 |
| S-InstructGPT | RLHF 三阶段（InstructGPT） | arXiv:**2203.02155**（Ouyang et al.） | A | **更正：非 2212.08073**（B2-02 记错）；提交 2022-03-04 |
| S-ConstAI | Constitutional AI（RLAIF） | arXiv:**2212.08073**（Bai et al., Anthropic） | A | **补定号**（B2-02 原标「待补」）；提交 2022-12-15 |

## 更正汇总（本批次 3 处 + 1 处补定）

1. **InstructGPT = 2203.02155**，不是 2212.08073（后者是 Constitutional AI）。B2-02 台账把 InstructGPT 误记为 2212.08073，须改。
2. **Constitutional AI = 2212.08073**，补定（此前标「待补」）。
3. **Jamba = 2403.19887**，不是 2403.19897。
4. **xLSTM = 2405.04517**，不是 2405.09933。

## 混合/线性注意力谱系（M4 S2 升级 A 级）

- **xLSTM（S-xLSTM · A）**：指数门控 + 矩阵记忆（mLSTM 可并行协方差更新），补齐「存储不可改/容量有限/难并行」三大 LSTM 缺陷；xLSTM 7B 主打快推理。
- **Jamba（S-Jamba · A）**：每 8 层放 1 层注意力（Transformer）+ 7 层 Mamba + 部分层 MoE；长上下文吞吐最高 3×、KV cache 小一个数量级。
- 谱系前置仍为 B 级（Hedgehog 等线性注意力、Zamba/Falcon-H1 官方论文），下批次按需升级；M4 S2 已有 xLSTM/Jamba 两个 A 级锚点。

## GPT-3 编号更正（本批次 WebFetch 官方 abs 页核验）

- GPT-3「Language Models are Few-Shot Learners」(Brown et al., OpenAI 2020) 真实编号为 arXiv:**2005.14165**（提交 2020-05-28）。**2005.1418 是错号**（该号指向一篇引力物理论文），2005.1418 与 2005.14165 都是流传误记。台账 S-GPT3 一律改为 2005.14165。
