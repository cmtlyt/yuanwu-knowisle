# B1-06 · 高效注意力与推理系统（FlashAttention / PagedAttention / 谱系）

- 工具：WebSearch
- 查询：`FlashAttention arxiv 2205.14135 IO-aware exact attention vLLM PagedAttention arxiv 2309.06180 SGLang`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（arXiv 官方论文）；「吞吐倍数」等具体数字多为第三方博客转述（B 级），入台账时挂到官方论文

## 一手来源

- **S-FA**：FlashAttention（Dao et al. 2022），arXiv:2205.14135 —— IO-aware 精确注意力，把 QKV 切块进 SRAM、N×N 分数矩阵不落 HBM，转 HBM-bound → SRAM-bound，支持 16k+ 序列。
- **S-FA2**：FlashAttention-2，arXiv:2307.08691（重排工作划分，~2× 于 FA1）。
- **S-FA3**：FlashAttention-3，arXiv:2407.08608（利用 Hopper wgmma/TMA 异步，FP16 75% MFU、FP8 提速）。
- **S-vLLM**：PagedAttention（Kwon et al. 2023），arXiv:2309.06180（SOSP 2023）——把 KV cache 当 OS 分页虚拟地址管理（block allocator + per-seq page table + copy-on-write + gather kernel），碎片 ~90% → ~4%，吞吐 2–4×。仓库 vllm-project/vllm。
- **S-SGL**：SGLang / RadixAttention，arXiv:2312.07104 —— 全局 radix tree 按内容共享 KV，前缀重用（agentic 多轮/few-shot 场景大幅降 TTFT，论文最高 ~6.4× 端到端吞吐）。
- 相关前置（谱系）：Orca（iteration-level scheduling）、FlexGen（受限显存推理，arXiv:2303.06865）、Megatron-LM（张量并行，arXiv:1909.08053）。

## 关键概念（课程 M2 S3「高效注意力」用）

- **FlashAttention 只解 O(N²) 注意力计算的内存问题，不解决 O(N) 的 KV cache 存储**；128k+ 长上下文下 70B 的 KV cache 可近 335GB，须靠 PagedAttention/分片系统。
- **RadixAttention** = PagedAttention 的进阶：block table 由 per-request 变全局、按内容寻址 → 跨请求 KV 复用（服务侧的「共享库」类比）。
- **Chunked prefill**：长 prompt 的 prefill 切成定长块与 decode 交错，降 TTFT 方差。

## 注意

- 第三方给出的「2–4× / 5× / 6.4×」等倍数，入课程正文时必须挂官方论文对应章节或实测口径；本台账标 A（论文存在）+ 数值挂 B（第三方转述待核）。
