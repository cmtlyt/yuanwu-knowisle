# B5-01 · 架构谱系 arXiv 号核验分片（缺口补全批次）

> 00098 缺口补全批次（用户 2026-11-16「全部都补全，并检查 mamba/rwkv/retnet/hyena 原理深度」）。
> 本分片只做**机械导出**：逐条把「官方 abs 页 WebFetch 核验结论」落盘，含 标题/首作者/正确 arXiv 号/核验日期/错号更正。
> **纪律（00091）：arXiv 号一律以官方 abs 页可达为准，绝不凭记忆/猜测。本批多个猜测号被核验拦下，逐条记「错号 → 正号」。**
> 核验日期：2026-11-16。可信级别：全部 = A（官方一手 arXiv abs 可达，或官方一手页）。

## 逐条核验记录

| 知识点 | 论文标题（官方 abs 页原文） | 首作者 | 正确 arXiv 号 | 我最初猜的号 | 核验结果 |
|---|---|---|---|---|---|
| Hyena | Hyena Hierarchy: Towards Larger Convolutional Language Models | Michael Poli | **2302.10866** | ~~2402.06416~~（实为 neutrino/dark-matter 物理） | ✅ 官方 abs 可达 |
| RWKV | RWKV: Reinventing RNNs for the Transformer Era | Bo Peng | **2305.13048** | ~~2309.05465~~（实为 quantum computing MOF） | ✅ 官方 abs 可达 |
| RetNet | Retentive Network: A Successor to Transformer for Large Language Models | Yutao Sun | **2307.08621** | 同（直接命中） | ✅ 官方 abs 可达 |
| Hymba | Hymba: A Hybrid-head Architecture for Small Language Models | Xin Dong（NVIDIA） | **2411.13676** | ~~2404.08801~~（实为 Megalodon，另一门控线性注意力） | ✅ 官方 abs 可达 |
| Performer | Rethinking Attention with Performers（FAVOR+ 正交随机特征） | Krzysztof Choromanski | **2009.14794** | ~~2009.13529~~（实为 VLBA 射电天文） | ✅ 官方 abs 可达（ICLR 2021 oral） |
| DeltaNet | Parallelizing Linear Transformers with the Delta Rule over Sequence Length | Songlin Yang | **2406.06484** | ~~2406.07271~~（实为 vehicle platoon 控制） | ✅ 官方 abs 可达 |
| GLA | Gated Linear Attention Transformers with Hardware-Efficient Training | Songlin Yang | **2312.06635** | 同（直接命中） | ✅ 官方 abs 可达 |
| SEDD | Discrete Diffusion Modeling by Estimating the Ratios of the Data Distribution（Score Entropy Discrete Diffusion，ICML 2024 Oral） | Aaron Lou | **2310.16834** | 同（直接命中） | ✅ 官方 abs 可达 |
| Dream 7B | Dream 7B: Diffusion Large Language Models | Jiacheng Ye | **2508.15487** | ~~2407.04764~~（实为 galaxy 球状星团计数） | ✅ 官方 abs 可达 |
| Mamba | （Mamba 选择性 SSM，已在 B4 锁定） | — | **2312.00752**（**非 2402.03684**） | B4 已核验 | ✅ 复用 B4 结论 |
| LLaMA 配比 | LLaMA: Open and Efficient Foundation Language Models | Hugo Touvron | **2302.13971** | 同（直接命中） | ✅ 官方 abs 可达 |

## 要点摘录（供证据台账引用，非原文全文）

- **Hyena（2302.10866）**：次二次方注意力即插即用替代；交错「隐式长卷积 + 数据控制门控」；算子分解为对角矩阵 × Toeplitz 矩阵乘积，FFT 求值 O(N·L·log L)；**滤波器不显式存 L 个权重，用浅层 FFN(位置) 隐式生成**（参数与序列长解耦）；8K 处比优化注意力快 2×、64K 快 100×（论文自报，A 级可引但标注「论文自报」）。
- **RWKV（2305.13048）**：结合 Transformer 可并行训练 + RNN 恒定推理内存；线性注意力变体「channel directed attention」避开点积；首个扩到 14B 的 dense RNN；官方 abs 摘要明确「O(n) 内存/计算、O(1) 推理」。
- **RetNet（2307.08621）**：retention 机制；三计算范式（并行 / 循环 / 分块循环）；循环表示 O(1) 推理、分块循环线性复杂度长序列；微软 aka.ms/retnet。
- **Hymba（2411.13676）**：**混合头并行架构**——同层内 softmax 注意力头 ‖ Mamba-2 SSM 头并行处理同一输入再融合；注意力头做高分辨率召回、SSM 头做恒定成本摘要；引入可学习 meta tokens + 跨层 KV 共享 + 部分滑窗注意力；Hymba-1.5B 超 Llama-3.2-3B（平均准确率 +1.32%、缓存 11.67× 更小、吞吐 3.49×，**均为论文自报 A 级**）。ICLR 2025 spotlight。
- **Performer/FAVOR+（2009.14794）**：用正交随机特征把 softmax 注意力核近似为线性时空；关键恒等式 `softmax(qᵀk)≈φ(q)ᵀφ(k)`，重排 `Y≈Φ(Q)(Φ(K)ᵀV)` 避免物化 N×N 矩阵；无偏/近无偏估计 + 统一收敛。
- **DeltaNet（2406.06484）**：用 delta rule（读旧值→比较→按学习写入强度纠正）替代线性注意力的加性更新，强化联想召回；重参数化为矩阵值 RNN（Householder 变换 + WY 紧凑表示）实现**沿序列并行**训练；1.3B/100B token 超过 Mamba、GLA（论文自报，A 级）。FlashLinearAttention 库官方实现。
- **GLA（2312.06635）**：数据依赖门控的线性注意力 + IO 感知硬件高效算法（FLASHLINEARATTENTION）；2K 训练外推 20K+ 不退化；吞吐高于同规模 Mamba（论文自报，A 级）。
- **SEDD（2310.16834）**：离散扩散理论核心——score entropy 损失把 score matching 推广到离散空间；同规模比既有扩散语言范式 perplexity 降 25–75%；可 trade-off 计算换质量（32× 更少网络评估达同等质量）、支持可控 infilling（ICML 2024 Oral）。
- **Dream 7B（2508.15487）**：最强开源扩散 LLM；AR-初始化（用 Qwen2.5-7B 权重初始化）+ 上下文自适应 token 级噪声重调度（CART）；任意顺序生成 / infilling / 质量-速度可调；MMLU 与 Qwen2.5-7B 打平、Countdown 复杂规划反超（论文自报，A 级）。

## 待升级 / B 级项（本批未升到 A，显式标注）

- M8-b 过训练 token/参数（Llama2 7B≈290 / Llama3 70B≈215）：官方 LLaMA 论文未直接给「token/参数」口径，**维持 B 级（唐杰/Epoch 复算）**，不入正文关键结论。
- M6-a 商用/API 模型成本（$/1K token）：无单一 A 级 arXiv 来源，**需各厂官方定价页 B 级可复核**，标注「第三方/官方定价，随时间变动」。
- M6-b 多模态 / 长上下文 benchmark 选型：需各 benchmark 官方页，**本批未检索升级**，标注「待补官方 A」。
