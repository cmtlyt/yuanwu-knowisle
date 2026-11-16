# 00098 · LLM 架构深度课：大纲与可验证来源台账

- 分支：`feat/llm-arch-course-outline`，基点 `main@40abe4f`
- 日期：2026-11-16

## 目标

产出一门「LLM 架构深度课」的**课程大纲**（模块 / 阶段 / 课时知识点）+ **每知识点的可验证来源台账**。覆盖主流模型架构，并为 DeepSeek 单开一个模块专讲其架构创新。**所有知识点必须最新且来源可靠、可验证**（一手官方论文 / 仓库优先，标注可信级别 A/B/C 与核实日期）。

> 用户决策（2026-11-16）：
> 1. 本次交付「大纲 + 来源台账」（不落地 `app/data` 课程数据）；
> 2. 先定模块与阶段、完整覆盖知识点，课时体量随后定；
> 3. DeepSeek 模块聚焦**架构创新**（MLA / MoE / MTP，并核实 mFformer）；
> 4. 「各种架构」按**主流全覆盖**（自回归 Transformer + MoE + 线性注意力/SSM + 扩散 LLM + 代表模型横向对比）。

## 模块 / 阶段 / 课时框架（初版，随检索定稿）

| 模块 | 阶段 | 课时知识点（草案） |
|---|---|---|
| M1 自回归 Transformer 基线 | S1 自回归范式 | GPT 谱系、decoder-only、预训练目标 |
| | S2 位置编码演进 | 绝对/正弦/可学习 → RoPE（旋转位置） |
| | S3 归一化与残差 | Pre-Norm / Post-Norm、RMSNorm |
| | S4 Tokenizer 与词表 | BPE / byte-level、多语言词表 |
| M2 注意力机制 | S1 多头到分组 | MHA / MQA / GQA |
| | S2 窗口与长上下文 | sliding window、上下文扩展 |
| | S3 高效注意力 | FlashAttention、PagedAttention(vLLM)、KV cache 量化 |
| | S4 线性与替代 | ALiBi、线性注意力 |
| M3 混合专家 MoE | S1 原理与由来 | GShard / Switch / Sparsely-Gated |
| | S2 路由与均衡 | top-k 路由、辅助负载均衡损失、expert-choice |
| | S3 并行与通信 | 专家并行、all-to-all |
| | S4 代表模型 | Mixtral、DeepSeek-V3 稀疏 MoE |
| M4 状态空间与混合架构 | S1 SSM 与 Mamba | 状态空间模型、选择性扫描 |
| | S2 线性 Transformer 谱系 | 线性注意力变体 |
| | S3 混合架构 | Mamba2、Jamba 等 |
| M5 扩散 LLM | S1 扩散式生成 | 去噪扩散 LLM vs 自回归 |
| | S2 代表 | LLaDA / Dream 等 |
| M6 横向对比与选型 | S1 能力/成本/延迟矩阵 | 各架构对比 |
| | S2 选型判据 | 何时用 MoE / SSM / Diffusion |
| | S3 推理成本建模 | 激活参数量与成本 |
| M7 DeepSeek 专讲 | S1 谱系与开源生态 | V1/V2/V3/R1、权重与许可证 |
| | S2 Multi-head Latent Attention | MLA 结构 |
| | S3 稀疏 MoE（DeepSeekMoE） | 细粒度专家、无辅助损失路由 |
| | S4 MTP / 3D 并行 / FP8 | 多 Token 预测、三维并行、FP8 训练 |
| | S5 其他创新核实 | 逐项核实（含 mFformer 真实性） |

## 检索与验证计划（按 00091 暂存约定）

1. **一条检索一文件**：`research/raw/<批次>-<序号>-<来源短名>.md`（≤32 KB，机械导出原始返回 + 调用参数 + 核实日期 + 可信级别提示）。
2. **证据台账按主题分片**：`research/evidence/<批次>-<主题>.md`，每条事实编号 `F-*`，绑定来源 ID（`S*`）与可信级别（A 官方一手 / B 可复核第三方 / C 二手转述）；大纲正文只从台账取数。
3. **只新建、不改写**；旧结论失真时在新批次说明更正。
4. **批次划分**（每批检索 → 立即落盘 → 提炼台账 → 再下一批）：
   - B1 自回归基线与位置/归一化（Llama / GPT 官方）
   - B2 注意力演进与高效注意力（GQA/MQA、FlashAttention、vLLM/PagedAttention）
   - B3 MoE（GShard/Switch、Mixtral、DeepSeek-V3 稀疏 MoE）
   - B4 SSM/Mamba 与线性注意力
   - B5 扩散 LLM
   - B6 DeepSeek 官方论文（V2/V3 的 arXiv / GitHub）
   - B7 DeepSeek 创新逐项核实（MLA/MoE/MTP/FP8/3D，及 mFformer 是否真实存在）
5. 检索完成产出 `drafts/course-outline.md`（模块/阶段/课时 + 每点挂来源），再交用户审阅。

## 验证方案

- 每个知识点在台账中有可点击的官方/一手来源（arXiv / GitHub / 官方博客），标注 A 级优先。
- 无法升级到 A/B 级的知识点显式标 C 级并注明「仅背景，不担关键结论」。
- 大纲内不出现无来源的数字与结论；所有架构特性（如 MLA 的 KV 压缩比、DeepSeek-V3 专家数与路由）必须来自官方论文。
- `pnpm fmt:check` / `lint` / `typecheck` 对新增 md/数据无破坏（本次仅增 docs，不触门禁代码路径）。

## 注意事项

- 遵守「历史记录不可矫正」：不改任何旧 `docs/NNNNN-*/` 记录。
- **不确定的创新名（如 mFformer）必须以检索结果为准**：若官方无此命名，在台账中如实标注「未找到官方来源，疑似误记」，不臆造。
- 课程数据层（`app/data/`）**本次不动**；大纲定稿且用户批准后另开任务落地。

## 后续补充（2026-11-16，用户指令「细化 M8–M11 体量」）

- 大纲已从 7 模块扩到 **M1–M11**：新增 **M8 预训练 / M9 微调 / M10 后训练 / M11 打包部署**（均挂 S-* 来源 + 对应实操）。
- **M8–M11 课时体量规划**落在 `drafts/m8-m11-volume-plan.md`：每课时给暂定 id（`M<mod>-L<nn>`）、kind、难度、prereqs、concepts、quiz 数、正文/代码体量目标（对齐 `scripts/content-gate.mjs` 00055 阈值）、来源 S-*；合计 14 阶段 / 31 课时 / 4 capstone。
- 检索批次已推进到 **B4**（含 arXiv 官方 abs 页逐一 WebFetch 核验，纠出 InstructGPT/GPT-3/Mamba/Zamba/Hedgehog/Jamba/xLSTM 等 7 处错号）；M4 混合与线性注意力谱系已升 A 级，「待补 A 级」清零。
- 体量规划仍属**草稿**（不落地 `app/data`），定稿与全课连续编号（M1–M7 体量）后另开任务用 course-builder 管线生成。
