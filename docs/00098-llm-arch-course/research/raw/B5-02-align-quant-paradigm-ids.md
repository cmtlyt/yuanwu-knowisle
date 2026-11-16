# B5-02 · 对齐 / 量化 / 范式 arXiv 号核验分片（缺口补全批次）

> 00098 缺口补全批次续（M7-a / M10-b / M11-b / M1-a 范式来源）。
> 机械导出：逐条「官方 abs 页 WebFetch 核验结论」，含 标题/首作者/正确 arXiv 号/核验日期/错号更正。
> **纪律（00091）：arXiv 号一律以官方 abs 页可达为准。本批 T5/IPO/KTO 三个猜测号被核验拦下，逐条记「错号 → 正号」。**
> 核验日期：2026-11-16。可信级别：全部 = A（官方一手）。

## 逐条核验记录

| 知识点 | 论文标题（官方 abs 页原文） | 首作者 | 正确 arXiv 号 | 我最初猜的号 | 核验结果 |
|---|---|---|---|---|---|
| DeepSeek-R1 | DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning | DeepSeek-AI（Guo 等） | **2501.12948** | 同（直接命中） | ✅ 官方 abs 可达（Nature 645, 633–638, 2025） |
| BERT | BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding | Jacob Devlin | **1810.04805** | 同（直接命中） | ✅ 官方 abs 可达 |
| T5 | Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer | Colin Raffel | **1910.10683** | ~~1910.13461~~（实为 **BART**，denoising seq2seq） | ✅ 官方 abs 可达（JMLR 2020） |
| IPO | A General Theoretical Paradigm to Understand Learning from Human Preferences（ΨPO；Identity 特例即 IPO） | Mohammad G. Azar | **2310.12036** | ~~2310.12040~~（实为 graphene Josephson 凝聚态物理） | ✅ 官方 abs 可达 |
| KTO | KTO: Model Alignment as Prospect Theoretic Optimization | Kawin Ethayarajh | **2402.01306** | ~~2402.17935~~（实为 Lusztig varieties/Macdonald 多项式） | ✅ 官方 abs 可达（ICML 2024） |
| GPTQ | GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers | Elias Frantar | **2210.17323** | 同（直接命中） | ✅ 官方 abs 可达（ICLR 2023） |
| AWQ | AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration | Ji Lin | **2306.00978** | 同（直接命中） | ✅ 官方 abs 可达（MLSys 2024 Best Paper） |

## 要点摘录（供证据台账引用）

- **DeepSeek-R1（2501.12948）**：用**纯 RL 激励推理**（免人工标注推理轨迹）；RL 催生 self-reflection / verification / 动态策略等涌现推理模式；可验证任务（数学/编程/STEM）超同规模监督学习；大模型涌现的推理模式可**系统蒸馏**给小模型（R1-Distill 路线）。Nature 卷收录。
- **BERT（1810.04805）**：**encoder-only 双向**预训练（联合左/右上下文）；MLM + NSP；单输出头微调 11 项 SOTA；GLUE 80.5%。M1 三范式讲「为何 LLM 弃 encoder」的对照基线。
- **T5（1910.10683）**：**encoder-decoder text-to-text**——所有 NLP 任务统一成 text-in/text-out；span corruption 去噪预训练；C4 语料；60M–11B 五档。M1 三范式中「seq2seq 范式」代表。
- **IPO（2310.12036）**：提出 ΨPO 通用目标统一 RLHF/DPO；Identity 特例 = IPO，**始终向 πref 正则、避免对偏好数据过拟合**（对比 DPO 在确定性偏好下把概率打到 0 的退化）；损失 `E[(hπ(yw,yl) − τ⁻¹/2)²]`。
- **KTO（2402.01306）**：前视理论视角，提出 HALOs（human-aware losses）家族；**只需二元「是否合意」信号、免偏好对**；1B–30B 匹配/超 DPO（GSM8K 在 Zephyr 上 +13.5 点，论文自报，A 级）。
- **GPTQ（2210.17323）**：基于二阶信息的**一次性权重量化**；175B 约 4 GPU 小时压到 3–4 bit 近乎无损；单 GPU 推理 175B 首次实现；A100 端到端约 3.25× 提速（论文自报，A 级）。
- **AWQ（2306.00978）**：**激活感知**——按激活分布识别 1% 显著权重通道并等价缩放保护；免反传/重建，跨域泛化；4-bit 权重量化；配 TinyChat 3× 加速（MLSys 2024 Best Paper，论文自报，A 级）。

## 官方一手（非 arXiv）项

- **IBM Granite 4.0（H 系列）**：混合 **Mamba-2 : Transformer 注意力 ≈ 9:1** 串联；H-Small 32B(9B 激活)/H-Tiny 7B(1B 激活)/H-Micro 3B dense；Apache-2.0；长上下文 RAM 较同质量 Transformer 降 70%+。**来源 = IBM 官方公告页（ibm.com 一手），无 arXiv**，级别 A（官方一手），挂 `S-Granite4`。注意与「Falcon-H1 / Hymba 并行混合」对照——Granite 4.0 是**串联 9:1**，Falcon-H1/Hymba 是**同层并行头**。

## 待升级 / B 级项（本批未升到 A，显式标注）

- M2-b KV cache 量化（INT8/FP8）：FlashAttention-3 提 FP8（S-FA3 · A 已有）；通用 KV 量化**无单一官方 A 级**，标注 B 级待官方章节核实。
- M8-b / M6-a / M6-b：同 B5-01，维持 B 级或待补官方 A。
