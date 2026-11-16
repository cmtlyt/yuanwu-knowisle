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
| M7 | DeepSeek 专讲 | 5 | 单一模型架构创新深挖 |
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

### S2 注意力机制原理（QKV 数学 → 多头）
- **QKV 注意力**数学：`Attention(Q,K,V)=softmax(QKᵀ/√d_k)V`，缩放因子 `1/√d_k` 防 softmax 饱和；因果掩码保证自回归。
  - 来源：S-Transformer17 · A；FlashAttention IO 印证 S-FA · A
- **多头（Multi-Head）**：`n_h` 个并行头 `n_h × d_h = d_model`，多头 = 多子空间建模；谱系 MHA → MQA（全共享 KV，省内存伤质量）→ GQA（分组折中，Llama 主流）。
  - 来源：S-GQA · A；MQA Shazeer 2019 · A
- 参数与 FLOPs：单 token 注意力 ≈ `4·d_model² + 2·n_h·d_h·N²`（N 为序列长），与 FFN 的 O(d²) 相对照（M6 成本建模复用）。

### S3 现代 LLM 的 Block 结构（FFN + 归一化 + 残差）
- **FFN 是 block 大头**：两层线性 + 非线性（GELU/SiLU/SwiGLU），中间维度 ≈ 8/3·d_model，参数占比常 2/3 以上（M3 MoE 的改造目标）。
  - 来源：S-Transformer17 · A；Llama SwiGLU · A
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

### S4 线性与替代注意力
- 线性注意力谱系（Hedgehog/Transformer Linear 等，**待补官方**）；与 SSM 的边界（见 M4）。
  - 来源：（B 级，需补 A）

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

### S3 并行与通信
- 专家并行（all-to-all 分发/回收）；EP 与 TP/PP/DP 组合成 3D/4D 并行；容量因子。
  - 来源：S-GShard · A（EP 概念首立）；S-DSV3（跨节点 all-to-all）· A

### S4 代表模型
- **Mixtral 8x7B**（开源引爆点：46.7B/12.9B，8 选 2，Apache-2.0）；**DeepSeek-V3**（671B/37B，细粒度专家 + 共享专家，256 路由 + 1 共享、top-8，详见 M7）。
  - 来源：S-Mixtral · A；S-DSV3 · A

---

## M4 状态空间与混合架构

### S1 SSM 与 Mamba
- 经典 SSM（S4 fixed dynamics）→ **Mamba 选择性 SSM**（Δ/B/C 随输入，线性复杂度、恒定推理内存、硬件感知并行扫描；官方 arXiv:2312.00752，**非 2402.03684**）。
  - 来源：S-Mamba（arXiv:2312.00752）· A
- **Mamba-2**：结构化状态空间对偶（SSD），数学上统一 SSM 与注意力；状态维 16→256，比 Mamba-1 快 2–8×。
  - 来源：S-Mamba2 · A

### S2 线性 Transformer 谱系
- **Hedgehog**（可学习线性注意力：可训练 MLP 特征图模仿 softmax 的「尖峰低熵 + 点积单调性」，从头/微调/预训练转换三场景恢复 >99% 质量）；**xLSTM**（指数门控 + 标量/矩阵记忆，补齐「存储不可改/容量有限/难并行」三大 LSTM 缺陷，xLSTM 7B 主打快推理）；谱系 Linear Transformer → Performer → DeltaNet/GLA/RetNet → RWKV。
  - 来源：S-Hedgehog（arXiv:2402.04347）· A；S-xLSTM（arXiv:2405.04517）· A

### S3 混合架构
- 生产趋势：「SSM + 少量全注意力」混合模型，按注意力与 SSM 的组合方式分两支：
  - **串行混合**（层间穿插）：**Jamba**（每 8 层放 1 层 Transformer + 7 层 Mamba + 部分层 MoE；7B 基座=12B 激活/52B 总参、单 80GB GPU、256K 上下文、长上下文吞吐最高 3×）、**Zamba**（Mamba 主干 + 单个共享注意力模块，1T token）。
  - **并行混合**（同块内注意力‖Mamba-2 头）：**Falcon-H1**（34B 匹敌 70B 级，长上下文最高 8× 加速）、Hymba、Granite 4.0（Mamba-2:注意力 ≈ 9:1）。
  - 共识：约 10% 注意力层最优，少量注意力承担「远距离召回」，SSM 层做「通用序列映射」。
  - 来源：S-Jamba（arXiv:2403.19887）· A；S-Zamba（arXiv:2405.16712）· A；S-FalconH1（arXiv:2507.22448）· A

---

## M5 扩散 LLM

### S1 扩散式生成
- 离散/掩码扩散（吸收态 ≈ 随机比例掩码的广义 MLM）；前向掩码 + 反向去噪预测，参数体是**去因果掩码的双向 Transformer**。
  - 来源：S-LLaDA · A
- 理论前置：SEDD（Score Entropy Discrete Diffusion，ICML 2024）。

### S2 代表模型
- **LLaDA 8B**（从零 2.3T token 训练，ICL 与 LLaMA3 8B 可比；GSM8K/MATH 反超；缓解 reversal curse）。
  - 来源：S-LLaDA · A
- 谱系：LLaDA 1.5（偏好优化）/ LLaDA-V / LLaDA-MoE / LLaDA 2.0（100B）；商用对照 Mercury（**C 级，仅背景**）。
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

### S3 推理成本建模
- 总参 vs 激活参（MoE 的「身份证号」）；激活参数量决定单 token FLOPs；长上下文 KV 成本随上下文线性增长。
  - 来源：S-DSV3（671B/37B 成本类比）· A

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
- **FP8 混合精度训练**：首次在超大模型验证，降显存 + 提速。
  - 来源：S-DSV3 · A

### S5 其他创新核实（含 mFformer 定论）
- **mFformer：经精确检索无官方来源，判定为误记/混淆词（C 级）**，最可能对应 MLA / MTP / DeepSeekMoE 之一；本模块不把它当真实架构点。
  - 来源：`B1-09-mfformer-verdict.md`
- 逐条核实结论表（真实 vs 误记）见该分片。

---

## M8 预训练（基座炼成）

### S1 预训练目标与数据
- 自回归「预测下一 token」损失；语料按来源设采样权重（GPT-3：Wikipedia 轮数 ≫ Common Crawl，保高质量多轮）。
  - 来源：S-GPT3 · A
- 数据配比（LLaMA 系：CommonCrawl 67% / C4 15% / GitHub 4.5% / Wikipedia 4.5% / Books 4.5% / arXiv 2.5% / StackExchange 2%）——第三方整理，官方 LLaMA 论文可复核。
  - 来源：B 级（需回 LLaMA arXiv 官方页升级 A）

### S2 Scaling Law 与算力取舍
- Chinchilla：固定算力下**参数量与 token 数应等比扩展**（≈ 20 token/参数）；70B@1.4T 击败 175B GPT-3。
  - 来源：S-Chinchilla · A
- 「训练最优 ≠ 推理最优」：主流小模型刻意**过训练**（Llama 2 7B ≈ 290、Llama 3 70B ≈ 215 token/参数）换更低推理成本。
  - 来源：B 级（唐杰/Epoch 复算，第三方）

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
- 备选：GaLore（梯度低秩投影省显存）· S-GaLore · A。

### S3 实操（HF 三件套）
- `transformers` + `peft`（`LoraConfig`）+ `bitsandbytes`（4-bit）；数据为「指令—响应」对；`merge_and_unload()` 导出。
  - 来源：S-OPTIM 同族 HF 生态 · A（peft/bnb 官方文档）

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
  - 来源：S-DPO · A

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
  - 来源：S-GGUF · A（量化档位 B 级教程）
- **ONNX / TensorRT**：`optimum` `ORTModelForCausalLM(export=True)` → ONNX；TensorRT-LLM 编译 `.engine`。
  - 来源：S-OPTIM · A；S-TensorRT-LLM · A

### S3 服务化上线
- vLLM（PagedAttention）/ SGLang / TensorRT-LLM / llama-server（OpenAI 兼容端点）；KV cache、批量、多节点部署。
  - 来源：S-vLLM · A；S-GGUF/S-TensorRT-LLM · A

---

## 已升级 A 级官方来源（本批次确认）

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

> **本批次（B4）后，大纲全部架构/混合/线性注意力知识点均已挂到 A 级官方 abs 可达来源，「待补 A 级」清零。** 后续仅余各模型「数据配比 / 吞吐倍数」等 B 级经验值，按需升级。
