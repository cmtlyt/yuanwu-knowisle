# LLM 架构深度课 · 课程大纲

> 交付物（00098）：课程大纲 + 可验证来源台账。本文**不落地 `app/data`**。
> 每个知识点挂 `来源 ID（S-*）· 级别`，级别：A=官方一手 / B=可复核第三方 / C=二手转述。
> 证据与原始检索见 `../research/evidence/` 与 `../research/raw/`；引用纪律见 `00-discipline.md`。

## 模块总览

| 模块 | 主题 | 阶段数 | 定位 |
|---|---|---|---|
| M1 | 架构原理深挖（Transformer 本体） | 5 | 从注意力数学到范式取舍，末节「架构谱系地图」串起 M2–M5 |
| M2 | 注意力机制演进 | 4 | 从 MHA 到高效注意力与推理系统 |
| M3 | 混合专家 MoE | 4 | 参数规模解耦算力 |
| M4 | 状态空间与混合架构 | 3 | 替代自回归的第二条路线 |
| M5 | 扩散 LLM | 2 | 第三条生成范式 |
| M6 | 横向对比与选型（综合交付） | 5 | 五维矩阵 + 可执行对比实验 + 选型报告 |
| M7 | DeepSeek 专讲 | 6 | 单一模型架构创新深挖（含 R1 推理链） |
| M8 | 预训练（基座炼成） | 3 | 从零预训练的概念与可落地实操 |
| M9 | 模型微调（Full / PEFT） | 4 | 微调概念 + 对应实操 |
| M10 | 后训练 / 对齐 | 4 | RLHF→DPO→GRPO 概念 + 实操 |
| M11 | 参数打包与部署 | 3 | 改完参数如何打包成新模型并上线 |

> **M1–M7 讲「架构是什么」**；**M8–M11 讲「模型怎么炼、怎么改、怎么打包上线」**，每条同样挂 `来源 ID（S-*）· 级别`。

---

## M1 架构原理深挖（Transformer 本体）

> 本模块把「Transformer 本身怎么工作」讲到**原理层**：注意力数学 → 多头/block/FFN → 归一化/位置编码 → 三范式 → 现代配方 → 架构谱系地图。
> 末节 S5「架构谱系地图」明确：**每个「其他架构」= 解决 Transformer 某弱点**，并指向 M2–M5（MoE/SSM/线性/扩散）。

### S1 2017 Transformer 原文与自回归目标
- 原始 Transformer 论文（arXiv:1706.03762，Vaswani et al. 2017）的**核心机制**：自注意力 + FFN + 残差 + 层归一化的 block 结构；「注意力是一切的基础」思想。
  - 来源：S-Transformer17 · A
- 自回归「预测下一 token」目标（next-token cross-entropy）；decoder-only 范式从 2017 双向 encoder-decoder → 现代 LLM 的取舍演进。
  - 来源：S-Llama2 · A
- 现代 LLM 统一为 **decoder-only + RMSNorm + RoPE + 大词表**（Llama 系范式）。
  - 来源：S-Llama3 · A
- **三范式取舍（补 M1-a 缺口）**：为何 LLM 弃用 **encoder-only（BERT，双向理解，MLM/NSP，arXiv:1810.04805）** 与 **encoder-decoder（T5，text-to-text span corruption，arXiv:1910.10683）**——二者都强于「理解/改写」但弱于**开放式自回归生成**：encoder 双向不能逐 token 续写；enc-dec 需固定句对目标。decoder-only 以「预测下一 token」统一生成、可无限续写、预训练目标即下游目标，故成 LLM 主流。三范式对照表（双向性 / 生成目标 / 适用任务 / 代表模型）。
  - 来源：S-BERT（arXiv:1810.04805）· A；S-T5（arXiv:**1910.10683**，**非 1910.13461=BART**）· A
- **推理时逐 token 生成 + KV 复用原理（补 M1-b 缺口）**：训练时一次并行喂整句（因果掩码屏蔽未来），**推理生成阶段只能逐 token 自回归**——每步要预测下一个 token，已生成的 token 的 K/V **不必重算**，缓存进 KV cache 复用（否则每 token 都要 O(N) 重算全序列）。这是「训练/推理差异」的核心，也是 M2 高效注意力 / PagedAttention 的动机。
  - 来源：S-Transformer17 · A（因果掩码）；KV 复用机制为 S-Transformer17 推理侧推论

### S2 注意力机制原理（QKV 数学 → 多头）
- **QKV 注意力**数学：`Attention(Q,K,V)=softmax(QKᵀ/√d_k)V`，缩放因子 `1/√d_k` 防 softmax 饱和；因果掩码保证自回归。
  - 来源：S-Transformer17 · A；FlashAttention IO 印证 S-FA · A
- **多头（Multi-Head）**：`n_h` 个并行头 `n_h × d_h = d_model`，多头 = 多子空间建模；谱系 MHA → MQA（全共享 KV，省内存伤质量）→ GQA（分组折中，Llama 主流）。
  - 来源：S-GQA · A；MQA Shazeer 2019 · A
- 参数与 FLOPs：单 token 注意力 ≈ `4·d_model² + 2·n_h·d_h·N²`（N 为序列长），与 FFN 的 O(d²) 相对照（M6 成本建模复用）。

### S3 现代 LLM 的 Block 结构（FFN + 归一化 + 残差）
- **FFN 是 block 大头**：两层线性 + 非线性（GELU/SiLU/SwiGLU），中间维度 ≈ 8/3·d_model，参数占比常 2/3 以上（M3 MoE 的改造目标）。
  - 来源：S-Transformer17 · A；Llama SwiGLU · A
- **SwiGLU 门控 FFN 细节（补 M1-c 缺口）**：把 2017 的单路 GELU FFN 换成**门控**——两条投影 `gate_proj`/`up_proj` 各自过 SiLU 门控（`Swish(g)⊙up`，⊙ 逐元素乘）再 `down_proj`；即 `FFN(x)=down( Swish(xW_gate)⊙(xW_up) )`。相对 GELU：**参数量多 1 路（中间矩阵 2 个而非 1 个），但同参数量下困惑度更低**，Llama 3 起成标配；「门控」让网络学会按输入**选择性放大/抑制**特征，比单调激活更强表达。
  - 来源：S-Llama3（Llama 3 官方 SwiGLU 配方）· A
- **残差连接**（residual）：每个 sublayer 输出加回输入（skip），深网可训练的关键；Pre-Norm/Post-Norm 位置差异。
- **归一化**：标准 LayerNorm → **RMSNorm**（去 re-centering 只 re-scaling，省 7–64% 计算，Llama 起成标配）。
  - 来源：S-RMSNorm（arXiv:1910.07467）· A

### S4 位置编码演进
- 谱系：绝对/正弦 → 可学习相对偏置 → **RoPE 旋转**（旋转矩阵把位置编进 Q/K，注意力只依赖相对距离；三大特性：相对感知、保范、无查表）。
  - 来源：S-RoPE · A
- 长上下文外推：Position Interpolation → **NTK / YaRN**（频率分带 + 温度缩放）→ LongRoPE（逐维搜索 + 渐进训练）。
  - 来源：S-YaRN · A；LongRoPE arXiv:2402.13753 · A
- **ALiBi**：注意力 logit 加线性距离惩罚，免重训外推（与 RoPE 互补的路线）。
  - 来源：S-ALiBi · A

### S5 Tokenizer / 词表 + 范式与架构谱系地图
- BPE / byte-level；词表规模权衡（Llama 2 的 32K → Llama 3 的 128K）；多语言词表与 OOV。
  - 来源：S-Llama3 · A（128K 词表）
- 三范式定位：**encoder**（BERT 类，双向理解）/ **encoder-decoder**（T5 类，seq2seq）/ **decoder-only**（现代 LLM，自回归生成）——为何 LLM 选了 decoder-only。
  - 来源：S-Transformer17 + S-Llama3 · A
- **架构谱系地图（本模块收口）**：把「其他架构」定位成「解决 Transformer 某弱点」，指向后续模块——
  - 序列建模 O(N²) 内存/延迟 → **SSM/线性注意力**（M4，Jamba/Mamba）
  - FFN 参数大头 + 算力天花板 → **MoE**（M3，细粒度专家 + 共享专家）
  - 单向不可编辑/不可逆 → **扩散 LLM**（M5，LLaDA）
  - KV cache 存储瓶颈 → **MLA/GQA**（M7 DeepSeek / M2 注意力演进）
  - 来源：综合 S-Transformer17 + 各模块 A 级来源（S-Mamba 2312.00752 / S-DSV3 / S-LLaDA / S-GQA / S-Jamba 等）

---

## M2 注意力机制演进

### S1 多头到分组
- MHA → **MQA**（全共享 KV 头，内存降 n_h 倍，伤质量）→ **GQA**（分组共享，折中，Llama/主流采用）→ MLA（M7 深挖）。
  - 来源：S-GQA · A；MQA Shazeer 2019 · A；MLA 见 M7

### S2 窗口与长上下文
- sliding window / 局部注意力；上下文扩展手法（RoPE 缩放、YaRN）。
  - 来源：S-YaRN · A

### S3 高效注意力与推理系统
- **FlashAttention**（IO-aware，把 N×N 分数留 SRAM）v1/v2/v3。
  - 来源：S-FA · A；S-FA3 · A
- **PagedAttention / vLLM**（KV cache 当 OS 分页）；**SGLang RadixAttention**（全局 radix tree 前缀共享）；chunked prefill。
  - 来源：S-vLLM · A；S-SGL · A
- 关键区分：FlashAttention 解 O(N²) 计算的内存，不解决 O(N) 的 KV cache 存储；长上下文须靠 PagedAttention 等系统。
- **FlashAttention 实操（补 M2-c 缺口）**：一节**可执行冒烟**——同模型开/关 FA 实测吞吐（token/s）+ 峰值显存（含长上下文 4K/16K），验证「IO-aware 把 O(N²) 中间分数量化到 SRAM」的实际收益；产出可复现脚本 + 数据表（与 M6 Stage 6.4 复用）。
  - 来源：S-FA/S-FA3 · A + HF 生态工具 · A
- **KV cache 量化（补 M2-b 缺口）**：KV cache 是长上下文**存储**瓶颈（随上下文线性 O(N) 增长），量化 **INT8/FP8** 把每 token 每头字节砍 2×（FP8 已在 FA3 训练侧验证）；权重/激活/KV 三类量化区分，量化后长上下文吞吐↑、显存↓（精度代价需实测，挂 M6/M11 量化主题）。
  - 来源：S-FA3（FP8，arXiv:2407.08608）· A；通用 KV 量化 B 级（第三方实测/待官方章节核实，不作关键结论）

### S4 线性与替代注意力（谱系 + 原理，A 级升级）
- 线性注意力谱系（**已升级 A 级官方**）：**Performer/FAVOR+**（随机特征核化，arXiv:2009.14794）→ **Transformer-Linear（Katharopoulos 2020，可当线性 RNN 恒内存）**→ 门控谱系 **GLA/DeltaNet/RetNet/RWKV**（细节与状态数学见 M4 S2）。本模块 M2 定位「**为什么线性化 + 谱系脉络**」，与 M4「SSM/门控/卷积落地 + 状态更新原理」分工互引（补 M2-d 缺口）。
  - 来源：S-Performer（arXiv:2009.14794）· A；S-GLA/S-DeltaNet/S-RetNet/S-RWKV · A（详见 M4 S2）
- 与 SSM 的边界：线性注意力 = 「特征化后把 QKᵀ 求和交换」；SSM = 「固定隐状态线性递推」，二者在 Mamba-2 SSD 处数学统一（M4 S1）。
  - 来源：S-Mamba2 · A

---

## M3 混合专家 MoE

### S1 原理与由来
- 稀疏门控 MoE 源头：Shazeer 2017（把 FFN 换成专家库 + 门控，容量随内存而非 FLOPs 扩展）。
  - 来源：S-SGMoE · A
- 现代谱系：GShard（确立专家并行 + top-2 + 容量溢出）→ Switch（top-1，1.6T）→ GLaM（总参/激活参分离的「身份证号」）。
  - 来源：S-GShard · A；S-Switch · A；S-GLaM · A

### S2 路由与负载均衡
- top-k 门控流程（线性打分 → top-k → 门控加权和）。
  - 来源：S-SGMoE · A
- 辅助均衡损失（GShard/Switch 防专家坍缩）→ **expert-choice**（翻转选择，收敛更快）→ **aux-loss-free**（DeepSeek-V3，router 偏置梯度调节）。
  - 来源：S-GShard/S-Switch · A；expert-choice arXiv:2202.09368 · A；S-DSV3 · A
- 反直觉点：Mixtral 分析显示专家**按 token 类型/语法分化，而非主题**（论文 §5）。
  - 来源：S-Mixtral · A
- **专家坍缩 / 路由失败模式（补 M3-a 缺口）**：均衡损失没压住时的**诊断信号**——利用率分布尖锐（少数专家吃掉绝大多数 token）、路由熵塌缩到 near-deterministic、aux-loss 持续抬升；对应**失败形态**：token 溢出被丢弃（容量因子不足）、个别专家饿死。解法旋钮：调**容量因子**（cap·token 预算）、换 expert-choice（翻转选择天然更均衡）、或 aux-loss-free 的 router 偏置梯度（DSV3）。一节约束「怎么看出坍缩 + 旋钮怎么拨」。
  - 来源：S-SGMoE/S-GShard（容量/溢出）· A；S-DSV3（aux-loss-free）· A

### S3 并行与通信
- 专家并行（all-to-all 分发/回收）；EP 与 TP/PP/DP 组合成 3D/4D 并行；容量因子。
  - 来源：S-GShard · A（EP 概念首立）；S-DSV3（跨节点 all-to-all）· A

### S4 代表模型
- **Mixtral 8x7B**（开源引爆点：46.7B/12.9B，8 选 2，Apache-2.0）；**DeepSeek-V3**（671B/37B，细粒度专家 + 共享专家，256 路由 + 1 共享、top-8，详见 M7）。
  - 来源：S-Mixtral · A；S-DSV3 · A
- **共享专家（shared expert）机制（补 M3-b 缺口）**：在 top-k 路由专家之外，再加 1 个（或少数）**所有 token 都必过**的共享专家——承接「通用/高频特征」（如语法、基础 token），把「专家分化」的压力从路由层卸走，让路由专家专注「细分/稀有特征」。Mixtral/DeepSeek-V3 都带共享专家；DSV3 是「256 路由专家 + 1 共享专家 + top-8」的组合。设计要点：共享专家**不计入 top-k 选择**（总是激活），参数量小但覆盖面全。
  - 来源：S-Mixtral/S-DSV3 · A；S-DSM（细粒度专家 + 共享专家隔离）· A
- **MoE 训练/推理实操（补 M3-c 缺口）**：完整 MoE **训练**冒烟（不只是手写路由）——小 MoE 在 HF 生态训练几十步，观测**专家利用率均衡度**（top-k 命中直方图）、激活参数占比（总参 vs 激活参核对）；推理侧对照「激活参数决定单 token FLOPs」与 dense 同激活规模的速度差。产出一节可跑脚本 + 利用率数据表（与 M6 Stage 6.4 复用）。
  - 来源：S-Mixtral · A + HF 生态 · A

---

## M4 状态空间与混合架构

> 本模块是「替代自回归/降二次方」的第二条路线。M4 重点把 **Mamba / RWKV / RetNet / Hyena / GLA / DeltaNet / Performer** 讲透**原理层**（每家的「状态怎么更新、为什么线性、能省什么」），而不止点名。

### S1 SSM 与 Mamba
- 经典 SSM（S4 fixed dynamics）→ **Mamba 选择性 SSM**：把 SSM 离散化的 Δ/B/C 三个参数都做成**输入依赖**（选择性），硬件感知并行扫描；**原理**：隐状态 h_t 是固定大小的线性 RNN 记忆 `h_t = ᾱ_t h_{t−1} + β_t x_t`（ᾱ_t 门控遗忘、β_t 门控写入），输出 `y_t = C_t h_t`，故**推理内存 O(1) 不随序列长**、训练用并行扫描 O(L)；官方 arXiv:2312.00752（**非 2402.03684**）。
  - 来源：S-Mamba（arXiv:2312.00752）· A
- **Mamba-2**：结构化状态空间对偶（SSD），把 SSM 写成「门控线性注意力」的对偶形式，**数学上统一 SSM 与（线性）注意力**；状态维 16→256，比 Mamba-1 快 2–8×（论文自报）。
  - 来源：S-Mamba2 · A
- **Mamba 训练实操（补 M4-c 缺口）**：不只跑推理，补一节**小 Mamba 训练 + 吞吐/KV 内存对照**（同规模 vs Transformer 的显存曲线、长上下文吞吐），验证「O(1) 推理内存」在训练/推理两侧的差异。
  - 来源：S-Mamba · A + 官方仓库（state-spaces/mamba）· A

### S2 线性 / 替代注意力谱系（原理深挖）
> 缺口 M4-b（原「谱系一句话带过」）在此扩为两节，把各家**状态更新原理**讲清楚；M2-L09（线性注意力谱系+原理）与本节分工：M2 讲「谱系 + 为什么线性化」，M4 讲「SSM/门控/卷积落地 + 状态数学」。

- **Performer（FAVOR+）**：把 softmax 注意力**核化**为随机特征 `φ(·)`，恒等式 `softmax(qᵀk)≈φ(q)ᵀφ(k)`，重排成 `Y≈Φ(Q)(Φ(K)ᵀV)` 避免物化 N×N 分数矩阵 → 时空线性；正交随机特征压方差。
  - 来源：S-Performer（arXiv:**2009.14794**，**非 2009.13529**）· A
- **GLA（门控线性注意力）**：线性注意力 + **数据依赖门控**（ᾱ_t 随输入），解决早期线性注意力「召回弱」；配 FLASHLINEARATTENTION 的 IO 感知分块并行，吞吐超同规模 Mamba；2K 训练外推 20K+ 不退化（论文自报）。
  - 来源：S-GLA（arXiv:2312.06635）· A
- **DeltaNet（delta rule）**：把线性注意力的「加性更新」换成 **delta rule**——读旧值→与目标比→按学习写入强度纠正（等价对平方预测误差做一次在线梯度步），强化**联想召回**；重参数化为矩阵值 RNN（Householder 变换 + WY 紧凑表示）实现**沿序列并行**训练。
  - 来源：S-DeltaNet（arXiv:**2406.06484**，**非 2406.07271**）· A
- **RetNet（retention）**：从「循环 vs 注意力」理论桥梁推出 retention 机制，**三计算范式**（并行训练 / 循环 O(1) 推理 / 分块循环线性长序列），三者互转。
  - 来源：S-RetNet（arXiv:2307.08621）· A
- **RWKV（RNN 重发明）**：channel-directed 线性注意力（**通道导向，非 token 点积**）；每通道时间衰减与数据无关 → 训练像 Transformer 可并行、推理像 RNN 恒定内存；首个扩到 14B 的 dense RNN（「O(n) 训练 / O(1) 推理」，论文自报）。
  - 来源：S-RWKV（arXiv:**2305.13048**，**非 2309.05465**）· A
- **Hyena（隐式长卷积 + 数据门控）**：交错「数据控制对角矩阵 D × 长卷积 Toeplitz 矩阵 S」，**滤波器不显式存 L 权重、用浅层 FFN(位置) 隐式生成**（参数与序列长解耦）；FFT 求值 O(N·L·log L)；8K 比优化注意力快 2×、64K 快 100×（论文自报）。
  - 来源：S-Hyena（arXiv:**2302.10866**，**非 2402.06416**）· A
- **Hedgehog**（可学习线性注意力：可训练 MLP 特征图模仿 softmax 的「尖峰低熵 + 点积单调性」，三场景恢复 >99% 质量）；**xLSTM**（指数门控 + 标量/矩阵记忆，补齐「存储不可改/容量有限/难并行」三大 LSTM 缺陷）。
  - 来源：S-Hedgehog（arXiv:2402.04347）· A；S-xLSTM（arXiv:2405.04517）· A

### S3 混合架构
- 生产趋势：「SSM + 少量全注意力」混合模型，按注意力与 SSM 的组合方式分两支：
  - **串行混合**（层间穿插）：**Jamba**（每 8 层放 1 层 Transformer + 7 层 Mamba + 部分层 MoE；7B 基座=12B 激活/52B 总参、单 80GB GPU、256K 上下文、长上下文吞吐最高 3×）、**Zamba**（Mamba 主干 + 单个共享注意力模块，1T token）。
  - **并行混合**（同块内注意力‖Mamba-2 头）：**Falcon-H1**（34B 匹敌 70B 级，长上下文最高 8× 加速）、**Hymba**（补 M4-a 缺口，原理见下）、**Granite 4.0**（补 M4-a 缺口，原理见下）。
  - 共识：约 10% 注意力层最优，少量注意力承担「远距离召回」，SSM 层做「通用序列映射」；**放置**上「Transformer 块放中部最佳、放前端最差」（多家消融一致）。
  - 来源：S-Jamba（arXiv:2403.19887）· A；S-Zamba（arXiv:2405.16712）· A；S-FalconH1（arXiv:2507.22448）· A
- **Hymba（并行混合头，补 M4-a）**：每层同输入**并行**走「softmax 注意力头 ‖ Mamba-2 SSM 头」再融合——注意力头负责**高分辨率召回**（精确检索某历史 token）、SSM 头负责**恒定成本上下文摘要**；因 SSM 输出幅值常大于注意力，先各自归一化再融合；配可学习 **meta tokens**（预置在 prompt 前存储关键信息，减轻「必须关注」负担）+ 跨层 KV 共享 + 90% 滑窗注意力。Hymba-1.5B 超 Llama-3.2-3B（+1.32% 准确率 / 缓存 11.67× 更小 / 吞吐 3.49×，**均论文自报**）。
  - 来源：S-Hymba（arXiv:**2411.13676**，NVIDIA，ICLR 2025 spotlight；**非 2404.08801=Megalodon**）· A
- **Granite 4.0（串联 9:1 混合，补 M4-a）**：IBM 企业级混合，**Mamba-2 与注意力层按 9:1 串联**（36 层 Mamba-2 : 4 层注意力，NoPE）；Tiny/Small 把每个 block 输出送进**细粒度 MoE**（含**常激活的共享专家**），H-Small 32B(9B 激活)/H-Tiny 7B(1B 激活)/H-Micro 3B dense；长上下文并发场景 RAM 较同质量 Transformer 降 70%+（官方自报）。与 Hymba 的关键区别：**串联 9:1 vs 同层并行头**。
  - 来源：S-Granite4（IBM 官方公告页 ibm.com 一手，无 arXiv，Apache-2.0）· A

---

## M5 扩散 LLM

### S1 扩散式生成
- 离散/掩码扩散（吸收态 ≈ 随机比例掩码的广义 MLM）；前向掩码 + 反向去噪预测，参数体是**去因果掩码的双向 Transformer**。
  - 来源：S-LLaDA · A
- **理论前置 SEDD（补 M5-a 缺口，展开）**：Score Entropy Discrete Diffusion（ICML 2024 Oral，arXiv:2310.16834）——把连续扩散的 **score matching 推广到离散**：提出 **score entropy** 损失，用「数据分布比值」估计离散空间分数；同规模比既有扩散语言范式 **perplexity 降 25–75%**、超 GPT-2；两大扩散独有优势——**trade-off 计算换质量**（32× 更少网络评估达同等质量）与**可控 infilling**（不需 temperature 退火即可忠实生成）。是 LLaDA/Dream 的理论地基。
  - 来源：S-SEDD（arXiv:2310.16834）· A
- **局部编辑 / 可控生成（补 M5-c 缺口）**：扩散 LLM 相对自回归的**双向可编辑**优势——**inpainting/局部改写**（固定保留部分 token、只对 [MASK] 区域迭代去噪），支持「填中段（fill-in-the-middle）」、约束生成、任意顺序生成；这是自回归「单向、错误级联、不可回头改」范式做不到的。一节约束「为什么扩散适合编辑/规划 + 冒烟对比」。
  - 来源：S-LLaDA · A；S-SEDD（infilling）· A

### S2 代表模型
- **LLaDA 8B**（从零 2.3T token 训练，ICL 与 LLaMA3 8B 可比；GSM8K/MATH 反超；缓解 reversal curse）。
  - 来源：S-LLaDA · A
- **Dream 7B（补 M5-b 缺口，成课）**：当前**最强开源扩散 LLM**（arXiv:2508.15487）——用 **AR-初始化**（Qwen2.5-7B 权重初始化 + 上下文自适应 token 级噪声重调度 CART）把扩散 LLM 拉到与自回归同规模打平：**MMLU 与 Qwen2.5-7B 持平**（58.3% vs 58.4%，论文自报）、Countdown 复杂规划反超（78% vs 50%）；独有**任意顺序生成 / infilling / 质量-速度可调**（推理步数可换质量）。作为 LLaDA 之后扩散 LLM 的「规模 + 规划」代表。
  - 来源：S-Dream（arXiv:2508.15487）· A
- 谱系：LLaDA 1.5（偏好优化）/ LLaDA-V / LLaDA-MoE / LLaDA 2.0（100B）；商用对照 Mercury（**C 级，仅背景，不进正文关键结论**）。
  - 来源：B/C 级

---

## M6 横向对比与选型（综合交付）

> 本模块是 M2–M5 的**收口实操**：先给静态对比（矩阵/选型/成本建模），再上**可执行对比实验**，最后产一份**选型报告 capstone**。

### S1 能力/成本/延迟矩阵
- 自回归 Transformer / MoE / SSM / 扩散 LLM 在「质量 / 训练成本 / 推理延迟 / 长上下文 / 可控性」五维矩阵。
  - 来源：综合各模块 A 级来源；成本数据挂 DeepSeek（S-DSV3 2.788M H800 时）· A

### S2 选型判据
- 何时用 MoE（大参数小激活）、何时用 SSM（长序列内存敏感）、何时用 Diffusion（需要双向/可编辑生成）。
  - 来源：综合各模块 A 级
- **多模态 / 长上下文 benchmark 选型（补 M6-b 缺口）**：五维矩阵补两维——**多模态基准**（VLM 类，图文/视频理解）与**长上下文基准**（needle-in-haystack、PG19 等）；选型时按任务类型选对应 benchmark 官方口径（各 benchmark 官方页 · A），避免拿短文本 benchmark 误评长上下文/多模态模型。
  - 来源：各 benchmark 官方 · A（需各官方页复核，标注「官方基准口径」）

### S3 推理成本建模
- 总参 vs 激活参（MoE 的「身份证号」）；激活参数量决定单 token FLOPs；长上下文 KV 成本随上下文线性增长。
  - 来源：S-DSV3（671B/37B 成本类比）· A
- **商用 / API 模型成本维度（补 M6-a 缺口）**：自建 125M 级实验之上，补一层**商用 API 成本维度**——$/1K input token、$/1K output token、上下文长度阶梯价（长上下文溢价）；把「自建吞吐/显存成本」与「API 调用价」放同一张成本模型里对比（何时自建回本 vs 直接用 API）。
  - 来源：各厂官方定价页（B 级可复核，**随时间变动**，正文标注「第三方/官方定价，以检索日为准」）

### S4 可执行对比实验（同规模实测）
- 固定 ~125M 规模，跑 **Transformer / MoE / SSM(Mamba) / 线性注意力** 四模型，实测：吞吐（token/s）· 峰值 KV/显存 · 同语料 loss/困惑度 · 长上下文（4K/16K）退化曲线；产出可复现脚本 + 数据表。
  - 来源：架构来源复用 M2–M4 A 级；工具链 S-OPTIM 同族 HF 生态 · A；并行冒烟 S-DSV3 · A
- 验收点：四模型在同算力预算下各维度排序与「S3 成本建模」的理论预测是否一致（可执行断言：吞吐/KV 内存/困惑度数值落区间）。

### S5 选型报告 capstone
- 给一个「真实需求」场景（预算 + 延迟 + 上下文 + 是否需编辑/双向），基于 S1–S4 数据写一份**架构选型决策报告**：推荐架构 + 量化依据 + 反例（选错的代价）；可执行验收断言（结论可由 S4 数据复现、关键数字挂 A 级来源）。
  - 来源：S-DSV3/S-LoRA 同族 · A

---

## M7 DeepSeek 专讲（架构创新）

### S1 谱系与开源生态
- DeepSeek 67B（dense）→ V2（MLA 首提）→ V3（MTP + 无辅助均衡）→ R1（RL 推理）；开放权重与许可证。
  - 来源：S-DSV2 · A；S-DSV3 · A；官方仓库 deepseek-ai/*

### S2 Multi-head Latent Attention（MLA）
- 把 KV 联合低秩压缩到潜在向量 c_KV（d_c ≪ 2·n_h·d_h），生成时再上投影还原；相对 DeepSeek 67B 减 KV 缓存 **93.3%**、吞吐 **5.76×**。
- **解耦 RoPE（decoupled RoPE）**：把 K 拆成未旋转内容 + 小旋转 k^R，保住 KV 压缩又保住相对位置精度。
  - 来源：S-DSV2 · A；解耦 RoPE 见 S-RoPE + S-DSV2

### S3 稀疏 MoE（DeepSeekMoE）
- 细粒度专家细分 + 共享专家隔离；路由数学与稀疏门控同源；aux-loss-free 负载均衡（router 偏置梯度调节，免辅助损失项）。
  - 来源：S-DSM · A；S-DSV3 · A

### S4 MTP / 3D 并行 / FP8
- **MTP（Multi-Token Prediction）**：每 token 预测多个未来 token，增强表示 + 推理时可做推测解码；「要预测 k 个未来 token 需 k−1 个 MTP 模块」。
- **3D 并行**（DP+TP+PP）+ DualPipe 计算-通信重叠 + 跨节点 all-to-all。
  - **DualPipe 通信重叠细节（补 M7-c 缺口）**：传统 3D 并行里 PP 流水有「气泡」（stage 空等上下游），DualPipe 把前向与反向**双向流水线**排布——forward 流第 i 个 micro-batch 的同时让第 i−1 个微批的反向走另一条「反向流」，**计算与 all-reduce 通信重叠**（用 TP 的通信去盖 PP 的空等），近乎消除 PP 气泡；配 1F1B 调度，跨节点 all-to-all 与计算错峰。一节约束「流水线气泡怎么产生 + DualPipe 怎么填平 + 与 1F1B 的关系」。
- **FP8 混合精度训练**：首次在超大模型验证，降显存 + 提速。
  - 来源：S-DSV3 · A（DualPipe 见 S-DSV3 训练并行章节）

### S5 R1 推理链（RL 强化推理，补 M7-a 缺口）
- 谱系 S1 里 R1「RL 推理」在此**成课**：DeepSeek-R1（arXiv:2501.12948，Nature 收录）核心是**用纯 RL 激励推理能力、免人工标注推理轨迹**——
  - **rule-based reward**：可验证任务（数学/代码/STEM）用**确定性判分**（答案对不对）当 reward，不靠人标；
  - **涌现推理模式**：RL 训练中自发出 **self-reflection / verification / 动态策略切换**（「让我再检查一步」式自检）；
  - **推理蒸馏（reasoning distillation）**：把 R1 大模型涌现的**推理轨迹**蒸馏给小模型，让小模型也学会长思维链——这是「大模型推理能力→小模型」的迁移路径。
  - 与 M10 对齐模块（GRPO）呼应：R1 的 RL 底座就是 GRPO 类组相对优化。
  - 来源：S-R1（arXiv:2501.12948）· A

### S6 其他创新核实（含 mFformer 定论）
- **mFformer：经精确检索无官方来源，判定为误记/混淆词（C 级）**，最可能对应 MLA / MTP / DeepSeekMoE 之一；本模块不把它当真实架构点。
  - 来源：`B1-09-mfformer-verdict.md`
- 逐条核实结论表（真实 vs 误记）见该分片。

---

## M8 预训练（基座炼成）

### S1 预训练目标与数据
- 自回归「预测下一 token」损失；语料按来源设采样权重（GPT-3：Wikipedia 轮数 ≫ Common Crawl，保高质量多轮）。
  - 来源：S-GPT3 · A
- 数据配比（LLaMA 系：CommonCrawl 67% / C4 15% / GitHub 4.5% / Wikipedia 4.5% / Books 4.5% / arXiv 2.5% / StackExchange 2%）——**已升级 A 级官方**：LLaMA 官方论文（arXiv:2302.13971，Touvron et al.）§数据 给出各源配比与 1.4T token 总量，正文直接引用官方表。
  - 来源：S-LLaMA（arXiv:2302.13971）· A（B5-01 核验官方 abs 可达）

### S2 Scaling Law 与算力取舍
- Chinchilla：固定算力下**参数量与 token 数应等比扩展**（≈ 20 token/参数）；70B@1.4T 击败 175B GPT-3。
  - 来源：S-Chinchilla · A
- 「训练最优 ≠ 推理最优」：主流小模型刻意**过训练**（Llama 2 7B ≈ 290、Llama 3 70B ≈ 215 token/参数）换更低推理成本。
  - 来源：B 级（唐杰/Epoch 复算，第三方；**「token/参数」为第三方复算口径，官方 LLaMA 论文不直接给该比值，正文标注 B 级不作关键结论**）

### S2.5 预训练能力评估 / 涌现（补 M8-c 缺口）
- 讲了 loss/困惑度还不够，补一节**能力探针**：预训练中途做 **zero-shot probe**（few-shot 分类/检索/简单推理）观察**涌现点**（某规模/某 token 数后能力跳变）；困惑度降 ≠ 能力涌现，二者要分开看（GPT-3 的 emergent abilities 讨论）。
  - 来源：S-GPT3（arXiv:2005.14165）· A

### S3 实操（可落地）
- 全量预训练超单卡/单机 → 课程落地为**继续预训练 / 领域预训练**（`accelerate`/`torchrun` + HF Trainer 的 `--resume` + 领域语料）；分布式读 TP/PP/ZeRO 概念（挂 M7 的 3D 并行 + S-DSV3）。
  - 来源：工具 S-OPTIM/S-GGUF 同族 HF 生态 · A；并行概念 S-DSV3 · A

---

## M9 模型微调（Full / PEFT）

### S1 全参微调 vs 参数高效微调
- 全参微调更新所有权重（贵、易过拟合）；PEFT 冻结基座只训小子集。谱系：Adapters → Prefix/Prompt Tuning → (IA)³ → **LoRA**。
  - 来源：S-PEFT · A

### S2 LoRA / QLoRA / DoRA
- **LoRA**：注入低秩 B×A，省至 10,000× 可训练参数，`merge_and_unload` 零延迟；一基座多适配器。
  - 来源：S-LoRA · A
- **QLoRA**：4-bit NF4 基座 + bf16 LoRA，**单 48GB GPU 微调 65B**。
  - 来源：S-QLoRA · A
- **DoRA**：权重拆幅度+方向、方向做 LoRA，稳超 LoRA，推理无额外开销。
  - 来源：S-DoRA · A
- **GaLore（补 M9-a 缺口，展开）**：梯度低秩投影省显存——把**全参微调的梯度**投影到低秩子空间再在低维里存动量（adam 状态），**显存降到全参的 ~1/4** 且不必像 LoRA 那样冻结基座；本质是「全参训练 + 低秩优化器」，适合**想全参但不起 4-bit 基座**的中间档。冒烟：小模型 GaLore vs 全参显存/收敛对照。
  - 来源：S-GaLore（arXiv:2403.03507）· A

### S3 实操（HF 三件套 + 全参对照 + 指令数据构造）
- `transformers` + `peft`（`LoraConfig`）+ `bitsandbytes`（4-bit）；数据为「指令—响应」对；`merge_and_unload()` 导出。
  - 来源：S-OPTIM 同族 HF 生态 · A（peft/bnb 官方文档）
- **全参微调实操（补 M9-b 缺口）**：小模型（如 Qwen0.5B / GPT-2 级）**全参 SFT** 一节，与 LoRA/QLoRA 做**显存对照**——直观看到「冻结基座 + 只训低秩」省了多少显存、全参何时才值得（基座本就小 / 需改深层表征时）。
  - 来源：HF 生态 · A
- **指令 / 多任务数据构造（补 M9-c 缺口）**：一节约束「指令数据怎么造」——(指令—响应) 对的 schema、**多任务混排**（分类/抽取/对话/代码各占比例）、**自举数据**（用强模型蒸馏指令样本）、去重与难度分级；对照 S-QLoRA 数据集（9k 高质量对话 > 450k 泛指令）。
  - 来源：S-QLoRA（arXiv:2305.14314）· A；HF 生态 · A

### S4 过拟合与数据量
- 数据量 < 模型容量时小数据集常更优（QLoRA 9k 对话样本 > 450k 指令子集）；过拟合是 PEFT 主风险。
  - 来源：S-QLoRA · A

---

## M10 后训练 / 对齐

### S1 RLHF 三阶段（InstructGPT）
- SFT → 奖励模型 RM → PPO（KL 惩罚约束漂移）；1.3B InstructGPT 偏好度胜 175B GPT-3。
  - 来源：S-InstructGPT · A
- 对齐税（掉通用基准）与 PPO-ptx 缓解。
  - 来源：S-InstructGPT · A

### S2 DPO（免 RM 的捷径）
- 偏好对直接监督式损失，免显式 RM、免在线 PPO，更稳更省，成开源对齐默认；仅强化静态偏好集内差异。
  - 来源：S-DPO（arXiv:2305.18290）· A
- **DPO 变体（补 M10-b 缺口）**：
  - **IPO（ΨPO / Identity 特例，arXiv:2310.12036，**非 2310.12040**）**：把 RLHF/DPO 统一进 ΨPO 框架；Identity 特例**始终向 πref 正则、避免对偏好数据过拟合**（对比 DPO 在确定性偏好下把概率打到 0 的退化），损失 `E[(hπ − τ⁻¹/2)²]`。
  - **KTO（前视理论对齐，arXiv:2402.01306，**非 2402.17935**）**：提出 HALOs（human-aware losses）家族；**只需二元「是否合意」信号、免偏好对**——把「点赞/点踩」日志直接当对齐数据，1B–30B 匹配/超 DPO（GSM8K +13.5 点，论文自报）。
  - 三法对照（DPO/IPO/KTO）：数据形态（成对 vs 成对 vs 二元）、正则行为、适用场景。
  - 来源：S-IPO（arXiv:**2310.12036**）· A；S-KTO（arXiv:**2402.01306**）· A

### S2.5 安全对齐 / 越狱 / 红队（补 M10-a 缺口）
- 对齐不只是「有用」，还有「安全」一维：**越狱（jailbreak）**——诱导模型绕护栏输出有害内容（角色扮演讲解 / 编码混淆 / 多语言绕过 / 提示注入）；**红队（red teaming）**——系统化攻击 + 修复循环；**对齐安全边界**（什么该拒 / 拒得得体 / 拒不崩）；Constitutional AI（S-ConstAI）与安全 RLHF 同源。一节约束「越狱模式分类 + 安全对齐怎么做 + 与通用对齐的张力」。
  - 来源：S-InstructGPT/S-ConstAI · A

### S3 GRPO（DeepSeek 系）
- 去 critic，按同 prompt 一组 rollout 的组内相对奖励更新；DeepSeekMath 7B MATH 51.7%，R1 沿用。
  - 来源：S-GRPO · A
- RLAIF / Constitutional AI：用模型自评替代人标，信号可规模化。
  - 来源：S-ConstAI（arXiv:2212.08073）· A

### S4 实操
- `trl`：SFTTrainer / DPOTrainer / GRPOTrainer，均接受 `peft_config=LoraConfig()`；数据为「prompt + chosen + rejected」偏好对。
  - 来源：S-OPTIM 同族 HF 生态 · A（trl 官方文档）

---

## M11 参数打包与部署

### S1 合并与权重保存
- `merge_and_unload()` 把 LoRA/QLoRA 代数折回基座（W_final = W₀ + (α/r)BA），零延迟；`save_pretrained()` 存 `*.safetensors` + `config.json` + tokenizer。
  - 来源：S-SAFE · A；S-LoRA · A

### S2 导出格式
- **GGUF**：llama.cpp `convert-hf-to-gguf.py` + `llama-quantize`（Q4_K_M 甜点，7B≈4GB），供 Ollama / LM Studio / 纯 CPU。
  - **量化档位（补 M11-a 缺口，升级官方）**：GGUF 各档（F16→Q8_0→Q6_K→**Q4_K_M**→Q3_K_M→Q2_K）的**体积/速度/质量权衡表**挂 llama.cpp 官方量化文档（`S-GGUF` 官方仓库），不再只靠 B 级教程；「K-quant」的 k 表示按块混合精度，Q4_K_M 是「显存友好 + 质量几乎无损」的甜点。
  - 来源：S-GGUF（llama.cpp 官方仓库 + `convert-hf-to-gguf.py`/`llama-quantize` 文档）· A
- **ONNX / TensorRT**：`optimum` `ORTModelForCausalLM(export=True)` → ONNX；TensorRT-LLM 编译 `.engine`。
  - 来源：S-OPTIM · A；S-TensorRT-LLM · A
- **推理侧量化（补 M11-b 缺口）**：GGUF/ONNX 导出之外补「量化本身」一节——**权重量化 vs 激活量化**的区分；**GPTQ**（二阶信息一次性权重压到 3–4 bit，arXiv:2210.17323）与 **AWQ**（激活感知，只保护 1% 显著权重通道，arXiv:2306.00978）对照 + **FP8**（训练/推理双用，挂 S-FA3/S-DSV3）；一节约束「何时用哪种 + 吞吐/精度实测对照（挂 M6/M2 KV 量化主题）」。
  - 来源：S-GPTQ（arXiv:2210.17323）· A；S-AWQ（arXiv:2306.00978）· A

### S3 服务化上线
- vLLM（PagedAttention）/ SGLang / TensorRT-LLM / llama-server（OpenAI 兼容端点）；KV cache、批量、多节点部署。
  - 来源：S-vLLM · A；S-GGUF/S-TensorRT-LLM · A
- **多节点 / 吞吐调优（补 M11-c 缺口）**：一节「服务化调优实操」——**batch size / 并发 / 流式（streaming）**三旋钮对吞吐与延迟的影响；**压测**（固定并发跑 P95/P99 延迟 + 吞吐曲线）；多节点时挂 M7 的 3D 并行 / 跨节点 all-to-all（S-DSV3）。产出可复现压测脚本 + 吞吐-延迟散点（与 M6 Stage 6.4 复用）。
  - 来源：S-vLLM · A；并行概念 S-DSV3 · A

---

## 已升级 A 级官方来源（本批次确认）

- **B5 批次（2026-11-16，arXiv 官方 abs 页逐一 WebFetch 核验，缺口补全）**：
  - Hyena arXiv:**2302.10866**（Poli et al.，**非 2402.06416=neutrino**）
  - RWKV arXiv:**2305.13048**（Bo Peng et al.，**非 2309.05465=量子 MOF**）
  - RetNet arXiv:2307.08621（Sun et al.）；GLA arXiv:2312.06635（Yang et al.）
  - DeltaNet arXiv:**2406.06484**（**非 2406.07271=vehicle platoon**）
  - Hymba arXiv:**2411.13676**（NVIDIA，**非 2404.08801=Megalodon**，ICLR 2025 spotlight）
  - Performer arXiv:**2009.14794**（Choromanski et al.，**非 2009.13529=VLBA 天文**）
  - SEDD arXiv:2310.16834（Lou/Meng/Ermon，ICML 2024 Oral）
  - Dream 7B arXiv:**2508.15487**（Ye et al.，**非 2407.04764=galaxy 星团**）
  - LLaMA arXiv:2302.13971（Touvron et al.，M8 数据配比升级 A 级）
  - DeepSeek-R1 arXiv:2501.12948（Nature 645, 633–638, 2025）
  - BERT arXiv:1810.04805（Devlin et al.）；T5 arXiv:**1910.10683**（Raffel et al.，**非 1910.13461=BART**）
  - IPO arXiv:**2310.12036**（Azar et al.，**非 2310.12040=graphene 物理**）
  - KTO arXiv:**2402.01306**（Ethayarajh et al.，**非 2402.17935=Macdonald 多项式**）
  - GPTQ arXiv:2210.17323（Frantar et al.，ICLR 2023）；AWQ arXiv:2306.00978（Lin et al.，MLSys 2024 Best Paper）
  - Granite 4.0：IBM 官方公告页（ibm.com 一手，无 arXiv，Apache-2.0）
  - 详见 `../research/raw/B5-01` / `../research/raw/B5-02`；本批 **9 个猜测号被官方页拦下并更正**。

- **B4 批次（2026-11-16，arXiv 官方 abs 页逐一 WebFetch 核验）**：
  - Zamba arXiv:**2405.16712**（Zyphra，**非 2407.11621**；Zamba2 套件 2411.15242）
  - Falcon-H1 arXiv:**2507.22448**（TII，补定号）
  - Hedgehog arXiv:**2402.04347**（Zhang/Bhatia/Kumbong/Ré, ICLR 2024，**非 2301.08299**）
  - **Mamba 更正为 arXiv:2312.00752**（**B1 原记 2402.03684 是错号**，该号指向早期暗能量论文）
  - Llama 2 arXiv:2307.09288 官方 abs 页可达性确认
- **B3 批次（2026-11-16，arXiv 官方 abs 页逐一 WebFetch 核验）**：
  - LongRoPE arXiv:**2402.13753**（Microsoft，2M 上下文渐进外推）
  - Jamba arXiv:**2403.19887**（AI21，**非 2403.19897**）
  - xLSTM arXiv:**2405.04517**（Beck/Hochreiter，**非 2405.09933**）
  - InstructGPT arXiv:**2203.02155**（**更正 B2-02 误记的 2212.08073**）
  - Constitutional AI arXiv:**2212.08073**（补定，Bai et al.）
  - GPT-3 arXiv:**2005.14165**（**更正 2005.1418 错号**，Brown et al.）
- **B2 批次（2026-11-16）**：LoRA arXiv:2106.09685、QLoRA arXiv:2305.14314、DoRA arXiv:2402.09353、GaLore arXiv:2403.03507、PEFT 综述 arXiv:2403.14608；DPO arXiv:2305.18290、GRPO arXiv:2402.03300；Chinchilla arXiv:**2203.15556**（更正自误传的 2203.02155）；打包工具链 S-GGUF / S-TensorRT-LLM / S-OPTIM / S-SAFE（官方仓库/文档，非 arXiv）。

- RMSNorm arXiv:1910.07467（Zhang & Sennrich 2019）
- GQA arXiv:2305.13245（Ainslie et al. 2023，EMNLP 2023）
- ALiBi arXiv:2108.12409（Press et al. 2022）
- expert-choice arXiv:2202.09368（Zhou et al. 2022）
- **S-Transformer17 arXiv:1706.03762（Vaswani et al. 2017，"Attention Is All You Need"，原始 Transformer 官方论文）**——M1「架构原理深挖」S1/S2/S3 的核心 A 级来源

## 仍待补 A 级官方页（下批次检索升级）

- ~~LongRoPE arXiv:2402.13753~~ → **已补 A 级**（B3）
- ~~Jamba arXiv:2403.19887~~ → **已补 A 级**（B3）；~~Zamba / Falcon-H1~~ → **已补 A 级**（B4：Zamba 2405.16712 / Falcon-H1 2507.22448）
- ~~xLSTM arXiv:2405.04517~~ / ~~Hedgehog arXiv:2402.04347~~ → **已补 A 级**（B3/B4）
- ~~Mamba arXiv:2312.00752~~ → **已核验更正**（B4，官方 abs 可达；原误传 2402.03684）
- ~~Llama 2 arXiv:2307.09288 / Llama 3 arXiv:2407.21783~~ → **已核验**（B4，官方 abs 可达）
- **缺口补全批次（B5，2026-11-16）新增 A 级来源**（arXiv 官方 abs 页逐一 WebFetch 核验，9 个猜测号被拦下并更正）：
  - Hyena **2302.10866** / RWKV **2305.13048** / RetNet 2307.08621 / GLA 2312.06635 / DeltaNet **2406.06484** / Hymba **2411.13676** / Performer **2009.14794** / SEDD 2310.16834 / Dream **2508.15487** / LLaMA 2302.13971（**M8 数据配比据此升 A 级**）/ R1 2501.12948 / BERT 1810.04805 / T5 **1910.10683** / IPO **2310.12036** / KTO **2402.01306** / GPTQ 2210.17323 / AWQ 2306.00978 / Granite 4.0（IBM 官方页）
  - 对应缺口：M4-b（RWKV/RetNet/Hyena 等成课）、M4-a（Hymba/Granite）、M5-a/b/c（SEDD/Dream/局部编辑）、M7-a（R1 推理链）、M8-a（LLaMA 配比升 A）、M10-b（IPO/KTO）、M11-b（GPTQ/AWQ）、M1-a（BERT/T5 范式对照）等。

> **B5 批次后，缺口补全涉及的架构/对齐/量化知识点均已挂到 A 级官方 abs 可达来源。** 仍保留 B 级的项（显式标注、不作关键结论）：M8-b 过训练 token/参数（唐杰/Epoch 复算）、M6-a 商用 API 成本（官方定价随时间变动）、M2-b 通用 KV 量化（FA3 FP8 之外的部分）、M6-b 多模态/长上下文 benchmark（各官方页待逐一复核）。
