# B2-01 · LoRA / QLoRA / DoRA / PEFT 官方来源（检索原始返回）

- 工具：WebSearch
- 查询：`LoRA low-rank adaptation arXiv 2106.09685; QLoRA 4-bit arXiv 2305.14314; DoRA 2402.09353; PEFT survey 2403.14608`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（官方 arXiv）

## 一手来源（arXiv 号经多方一致引用确认）

| 源 ID | 主题 | 一手来源 | 级别 |
|---|---|---|---|
| S-LoRA | LoRA 低秩适配 | arXiv:**2106.09685**（Hu et al., Microsoft, ICLR 2022） | A |
| S-QLoRA | 4-bit 量化微调 | arXiv:**2305.14314**（Dettmers et al., NeurIPS 2023） | A |
| S-DoRA | 权重分解 LoRA | arXiv:**2402.09353**（Liu et al., NVIDIA, ICML 2024 Oral） | A |
| S-PEFT | PEFT 综述 | arXiv:**2403.14608**（Houlsby et al. 谱系 + 统一分类） | A |
| S-GaLore | 梯度低秩投影省显存 | arXiv:**2403.03507**（Zhao et al., Caltech & Meta, ICML 2024 Oral） | A |

## 关键事实（挂 A 级）

- **LoRA（S-LoRA · A）**：冻结预训练权重，向注意力/线性层注入可训练低秩矩阵 B×A（秩 r ≪ d）；相对全参微调可省至 **10,000×** 可训练参数；推理时可用 `merge_and_unload()` 把适配器代数折回基座（W_final = W₀ + (α/r)BA），**零额外延迟**，导出的模型可在 vLLM / TensorRT-LLM / SGLang 以标准吞吐运行。一个基座可挂多个适配器（swap）。
- **QLoRA（S-QLoRA · A）**：把冻结基座量化到 **4-bit NormalFloat（NF4）+ 双重量化 + paged optimizer**，再在上面训 bf16 LoRA 适配器；报告可在**单张 48GB GPU 上微调 65B 模型**，接近 16-bit 全精度的任务表现。数据量 < 模型容量时常更优（9k 对话样本 > 450k 公开指令子集）。
- **DoRA（S-DoRA · A）**：把每个权重分解成**幅度 + 方向**，对方向分量做 LoRA；报告在 LLaMA / LLaVA / VL-BART 上稳超 LoRA，推理无额外开销（代价：训练时开销略高、支持层类型更少）。
- **谱系前置（S-PEFT · A）**：Adapters（arXiv:1902.00751）→ Prefix-Tuning（2101.00190）→ Prompt Tuning（2104.08691）→ (IA)³（2205.05638）→ LoRA（2106.09685）。统一视角 MAM Adapter（arXiv:2110.04366）。

## 实操映射（课程 M8/M9 用）

- HF 三件套：`transformers` + `peft`（LoraConfig / DoRA）+ `trl`（SFTTrainer / DPOTrainer，接受 `peft_config=LoraConfig()`）。
- 量化微调：`bitsandbytes` 4-bit + peft → QLoRA 路径；Unsloth 为 GPU 加速实现。
