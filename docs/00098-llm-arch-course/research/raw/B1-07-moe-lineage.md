# B1-07 · MoE 谱系（检索原始返回）

- 工具：WebSearch
- 查询：`GShard arxiv 2006.16668 Switch Transformer arxiv 2101.03961 Mixtral 8x7B MoE`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（官方 arXiv）；「专家分工 / 工业进化」叙述第三方整理（B 级）

## 一手来源（MoE 谱系主线）

- **S-SGMoE**：Shazeer et al. 2017《Outrageously Large Neural Networks: A Sparsely-Gated Mixture-of-Experts Layer》，arXiv:1701.06538 —— 最早 sparsely-gated MoE（LSTM 间插），137B 参。
- **S-GShard**：Lepikhin et al. 2020《GShard: Scaling Giant Models with Mixed Expert Parallelism》，arXiv:2006.16668（ICLR 2021）—— 正式确立**专家并行（expert parallelism）**：top-2 门控 + 固定容量 C=2N/(G·E) + 容量溢出丢弃 + 辅助均衡损失；600B 多语翻译模型在 2048×TPUv3 上 4 天训完。
- **S-Switch**：Fedus et al. 2021《Switch Transformer》，arXiv:2101.03961 —— 简化为 **top-1 路由**，1.6T 参（2048 专家），同 FLOPs 预训练 7× 快于 T5 dense；容量因子 1.0–1.25。
- **S-GLaM**：Du et al. 2021《GLaM: 1.2T Parameter MoE》，arXiv:2112.06905 —— 1.2T 总参 / 64 专家选 2 / 每 token 激活 96.6B（~8%），训练能耗为 GPT-3 的 1/3，29 项基准反超 GPT-3 175B。
- **S-Mixtral**：Jiang et al. 2024《Mixtral of Experts》，arXiv:2401.04088 —— 开源引爆点：8x7B 共 46.7B / 激活 12.9B，8 专家选 2，无共享专家，Apache-2.0；分析发现专家按 token 类型/语法分化而非主题。
- **S-DSM**：DeepSeekMoE 独立论文 arXiv:2401.06066 —— 细粒度专家细分 + 共享专家；路由数学与 SGMoE 门控级一致（详见 B1-01/03）。

## 路由与均衡要点（课程 M3 用）

- **top-k 门控**：路由 = 线性层出每个专家一个分 → 取 top-k → softmax 成门控权重 → 按权重求和专家输出。
- **辅助均衡损失**（GShard/Switch）：对「每专家 token 占比 × 平均路由概率」取点积作正则，防**专家坍缩**（少数专家吸走全部流量）。
- **expert-choice**（Zhou et al. 2022，arXiv:2202.09368）：把「选专家」翻转为「专家选 token」，收敛比 Switch/GShard 快 2×+。
- **aux-loss-free**（DeepSeek-V3 首创，B1-01）：改用 router 偏置梯度下降直接调均衡，不加额外损失项。
- **无辅助损失 vs 有**：现代配方正从「调好的惩罚项」转向「基于偏置的梯度自由控制」（第三方趋势描述）。

## 注意

- 「专家按主题分工」的直觉被 Mixtral 分析**证伪**（按 token 类型分化），课程 M3 应写明这一反直觉点，来源 Mixtral 论文 §5。
