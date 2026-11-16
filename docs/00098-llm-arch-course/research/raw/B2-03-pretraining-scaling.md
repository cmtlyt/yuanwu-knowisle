# B2-03 · 预训练（基座）与 Scaling Law 官方来源（检索原始返回）

- 工具：WebSearch
- 查询：
  - `GPT-3 arXiv 2005.1418; Chinchilla scaling laws arXiv 2203.02155 Hoffmann`
  - `Training Compute-Optimal Large Language Models Chinchilla arXiv 2203.15556 Hoffmann 70B 1.4T tokens; GPT-3 language models are few shot learners arXiv 2005.1418`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（官方 arXiv）

## 一手来源（arXiv 号经官方页 / 多方一致引用确认）

| 源 ID | 主题 | 一手来源 | 级别 |
|---|---|---|---|
| S-GPT3 | GPT-3 few-shot | arXiv:**2005.1418**（Brown et al., OpenAI, 2020） | A |
| S-Chinchilla | 计算最优 scaling | arXiv:**2203.15556**（Hoffmann et al., DeepMind, 2022） | A |

> **重要更正**：Chinchilla 的 arXiv 号是 **2203.15556**，不是 2203.02155（检索中把 2203.02155 误当 Chinchilla，实为 InstructGPT 的 html 镜像路径巧合）。官方页 `arxiv.org/abs/2203.15556` 可达，标题《Training Compute-Optimal Large Language Models》确认。

## 关键事实（挂 A 级）

- **GPT-3（S-GPT3 · A）**：175B 参数，约 300B token，确立 few-shot in-context learning；预训练语料为过滤后 Common Crawl + WebText2 + Books1/2 + 英文 Wikipedia，按来源设采样权重（Wikipedia 轮数远高于 Common Crawl，保证高质量数据多轮）。
- **Chinchilla / Scaling Law（S-Chinchilla · A）**：训 400+ 个 70M–16B 模型得出——**固定算力预算下，模型参数量与训练 token 数应等比扩展**（每参数约 20 token 为经验拐点）；70B 参数训 1.4T token 的 Chinchilla 在多数基准上击败 Gopher(280B)/GPT-3(175B)/Jurassic-1(178B)/MT-NLG(530B)，MMLU 67.5%。
- **后续修正（B 级，背景）**：推理成本计入后最优解向「更小模型 + 训更久（过训练）」漂移——Llama 2 7B ≈ 290 token/参数、Llama 3 70B ≈ 215，远超 Chinchilla 的 20；即「训练最优 ≠ 推理最优」。
- **预训练数据构成**：LLaMA 系用公开可复现数据（Common Crawl 67% / C4 15% / GitHub 4.5% / Wikipedia 4.5% / Books 4.5% / arXiv 2.5% / StackExchange 2%）——**B 级**（第三方整理，官方 LLaMA 论文为可复核一手，可升级 A，本批次未单独核验）。

## 实操映射（课程 M8 用）

- 预训练实操门槛极高；课程以「读懂 scaling 取舍 + 数据配比 + 分布式（TP/PP/ZeRO）」为目标，落地实操用**小规模继续预训练 / 指令微调**替代全量预训练（后者超出单卡/单机）。
