# B4-01 · 混合/线性注意力谱系官方 abs 页核验（检索原始返回）

- 工具：WebSearch + WebFetch（arXiv 官方 abs 页逐一核验）
- 查询：
  - `Zamba 2407.11621; Falcon-H1 2501.18877; Hedgehog 2301.08299`
  - `"Zamba" Gloriosi arXiv; Zamba2 2411; hedgehog Gromov`
  - `Hedgehog "Quest for the Holy Grail of Fast Transformers" arXiv`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（官方 arXiv abs 页逐一 WebFetch 核验）

## 一手来源（含 2 处错号更正 + 1 处补定）

| 源 ID | 主题 | 一手来源 | 级别 | 备注 |
|---|---|---|---|---|
| S-Zamba | 共享注意力 SSM 混合 | arXiv:**2405.16712**（Glorioso et al., Zyphra, 2024-05-26） | A | **更正：非 2407.11621**（该号指向凝聚物理论文）；Zamba2 套件 arXiv:2411.15242 |
| S-FalconH1 | 并行混合头（注意力‖Mamba-2） | arXiv:**2507.22448**（Zuo et al., TII, 2025-07-30） | A | **补定号**（此前 B 级无号）；34B 旗舰匹敌 70B 级，≤256K 上下文 |
| S-Hedgehog | 可学习线性注意力（模仿 softmax） | arXiv:**2402.04347**（Zhang/Bhatia/Kumbong/Ré, ICLR 2024） | A | **更正：非 2301.08299**（该号指向中微子暗物质论文） |

## 关键事实（挂 A 级）

- **Zamba（S-Zamba · A）**：Mamba 主干 + **单个共享注意力模块**（跨深度复用，ABAB 穿插 + LoRA 按层专精），1T token 训练；以最小参数代价拿到注意力 ICL 收益，推理显著快于同规模 Transformer。Zamba2（2411.15242）升级 Mamba-2 主干 + 双共享注意力 + RoPE，KV cache 比同质量纯 Transformer 小约 6×。
- **Falcon-H1（S-FalconH1 · A）**：与 Jamba/Zamba 的**串行**混合不同，把注意力头与 Mamba-2 头**并行放在同一 mixer 块**、输出拼接，注意力/SSM 通道比可独立调（≈ 2:1:5 注意力:SSM:FFN）；34B-Instruct 用约半参数/更少数据匹敌 Qwen3-32B / Qwen2.5-72B / Llama3.3-70B，长上下文最高 8× 加速。
- **Hedgehog（S-Hedgehog · A）**：可学习线性注意力，用可训练 MLP 特征图**模仿 softmax 的「尖峰低熵 + 点积单调性」**；从头训 / 微调转换 / 预训练转换三场景恢复 >99% Transformer 质量（WikiText-103 因果 GPT 比先验线性注意力优 6 困惑度点，把 Llama-2 7B 转线性 ROUGE-1 反升 28.1 点）。

## 混合架构谱系定论（M4 S3 升级 A 级）

- **串行混合**（层间穿插 Transformer/Mamba）：Jamba（1:7）、Zamba/Zamba2（单/双共享注意力块）。
- **并行混合**（同块内注意力‖SSM 头）：Hymba、**Falcon-H1**、Nemotron-H、Granite 4.0（Mamba-2:注意力 ≈ 9:1）。
- 设计共识（Mamba-2 论文 + NVIDIA 8B 研究，B 级）：约 10% 注意力层最优；少量注意力承担「远距离召回」，SSM 层做「通用序列映射」。

## 更正范围

- `evidence/00-discipline.md` 来源登记表新增 S-Zamba / S-FalconH1 / S-Hedgehog 三行（A 级，含更正标注）。
- **S-Mamba 更正**：Mamba 真实编号 **arXiv:2312.00752**（Gu & Dao, 2023-12-01，官方 abs 可达）；B1 台账原记的 **2402.03684 是错号**（该号指向一篇早期暗能量论文 gr-qc），一律改为 2312.00752。
- **Llama 核验**：Llama 2 arXiv:**2307.09288**（Touvron et al.）与 Llama 3 arXiv:**2407.21783**（《The Llama 3 Herd of Models》, Grattafiori et al.，405B 旗舰 128K 上下文）官方 abs 页均已 WebFetch 核验可达。
- `drafts/course-outline.md` M4 S2（Hedgehog 升级 A 级）、M4 S3（Zamba/Falcon-H1 升级 A 级，并行混合定论）、「已升级 A 级」与「仍待补」清单同步；Mamba 编号同步更正。
- 原始检索日志若曾把 Zamba 记为 2407.11621、Hedgehog 记为 2301.08299、Mamba 记为 2402.03684，均由本分片声明更正（历史记录不回改）。
