# 证据台账 00 · 可信级别与引用纪律（沿用 00091 约定）

## 可信级别

| 级别 | 含义 | 在大纲/正文中的写法 |
|---|---|---|
| **A** | 官方仓库 / 官方文档 / arXiv 一手论文 / 基准发布者一手数据 | 直接陈述，附官方链接 |
| **B** | 可复核第三方分析：公开原始记录、作者复算、带统计的实测 | 注明「第三方实测/复算」并附链接 |
| **C** | 二手转述、社区博客、百科、媒体、搜索摘要 | 只作背景/定性，必须写「据…转述」，不单独承担关键结论 |

## 硬性纪律

1. 关键架构数字（参数量、激活量、KV 压缩比、路由 top-k、专家数）**必须来自 A 级官方论文**，C 级只作旁证。
2. 不确定的命名（如 mFformer）**以检索定论为准**，无官方来源则标注「疑似误记」，不臆造（见 `B1-09-mfformer-verdict.md`）。
3. 每个知识点在大纲里挂 `来源 ID（S-*）+ 可信级别 + arXiv/官方链接`。
4. 第三方吞吐倍数（2–4× 等）挂 B 级并标注「待官方章节核实」，不入正文作关键结论。
5. 核实日期：本批次 2026-11-16；arXiv 号为多方一致引用，关键处升级到官方页。

## 来源登记表（S-*）

| ID | 主题 | 一手来源 | 级别 | 分片 |
|---|---|---|---|---|
| S-Llama2 | Llama 2 自回归基线 | arXiv:2307.09288 | A | B1-10 |
| S-Llama3 | Llama 3 系 | arXiv:2407.21783 | A | B1-10 |
| S-RoPE | RoPE 旋转位置编码 | arXiv:2104.09864 | A | B1-08 |
| S-ALiBi | 线性偏差注意力 | arXiv:2108.12409 | A | B1-08 |
| S-YaRN | NTK 感知上下文扩展 | arXiv:2309.00071 | A | B1-08 |
| S-GQA | 分组查询注意力（Ainslie et al. 2023） | arXiv:2305.13245 | A | B1-03 / B1-11 |
| S-FA | FlashAttention | arXiv:2205.14135 | A | B1-06 |
| S-FA3 | FlashAttention-3 | arXiv:2407.08608 | A | B1-06 |
| S-vLLM | PagedAttention/vLLM | arXiv:2309.06180 | A | B1-06 |
| S-SGL | SGLang/RadixAttention | arXiv:2312.07104 | A | B1-06 |
| S-SGMoE | 稀疏门控 MoE 源头 | arXiv:1701.06538 | A | B1-07 |
| S-GShard | 专家并行 GShard | arXiv:2006.16668 | A | B1-07 |
| S-Switch | Switch Transformer | arXiv:2101.03961 | A | B1-07 |
| S-GLaM | GLaM 1.2T | arXiv:2112.06905 | A | B1-07 |
| S-Mixtral | Mixtral 8x7B | arXiv:2401.04088 | A | B1-07 |
| S-Mamba | Mamba 选择性 SSM | arXiv:2402.03684 | A | B1-04 |
| S-Mamba2 | Mamba-2 SSD | state-spaces/mamba（2024） | A | B1-04 |
| S-LLaDA | LLaDA 扩散 LLM | arXiv:2502.09992 | A | B1-05 |
| S-DSV2 | DeepSeek-V2（MLA 首提） | arXiv:2405.04434 | A | B1-03 |
| S-DSV3 | DeepSeek-V3（MTP/无辅助均衡） | arXiv:2412.19437 | A | B1-01 |
| S-DSM | DeepSeekMoE | arXiv:2401.06066 | A | B1-07 |
| S-RMSNorm | RMSNorm（Zhang & Sennrich 2019） | arXiv:1910.07467 | A | B1-11 |
| S-PEFT | PEFT 综述 / Adapter 谱系 | arXiv:2403.14608 | A | B2-01 |
| S-LoRA | LoRA 低秩适配 | arXiv:2106.09685 | A | B2-01 |
| S-QLoRA | 4-bit NF4 量化微调 | arXiv:2305.14314 | A | B2-01 |
| S-DoRA | 权重分解 LoRA | arXiv:2402.09353 | A | B2-01 |
| S-GaLore | 梯度低秩投影省显存 | arXiv:2403.03507 | A | B2-01 |
| S-InstructGPT | RLHF 三阶段（对齐范式） | arXiv:2212.08073 | A | B2-02 |
| S-DPO | 直接偏好优化 | arXiv:2305.18290 | A | B2-02 |
| S-GRPO | 组相对策略优化（DeepSeek） | arXiv:2402.03300 | A | B2-02 |
| S-ConstAI | Constitutional AI（RLAIF 前驱） | Bai et al. 2022（**arXiv 号待补，不臆造**） | A（号待补） | B2-02 |
| S-GPT3 | GPT-3 few-shot | arXiv:2005.1418 | A | B2-03 |
| S-Chinchilla | 计算最优 scaling law | arXiv:2203.15556 | A | B2-03 |
| S-GGUF | llama.cpp / GGUF 打包 | ggml-org/llama.cpp（官方仓库 + convert/quantize 工具） | A | B2-04 |
| S-TensorRT-LLM | NVIDIA 推理引擎 | NVIDIA/TensorRT-LLM（官方仓库 + 文档） | A | B2-04 |
| S-OPTIM | Optimum ONNX/ORT 导出 | HF optimum（官方文档） | A | B2-04 |
| S-SAFE | safetensors 权重格式 | huggingface/safetensors（官方仓库） | A | B2-04 |
| mFformer | 用户提及的命名 | **无官方来源** | C（疑似误记） | B1-09 |
