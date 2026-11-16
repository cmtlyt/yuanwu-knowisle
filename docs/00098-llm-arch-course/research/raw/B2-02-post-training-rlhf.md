# B2-02 · 后训练（对齐）RLHF / DPO / GRPO 官方来源（检索原始返回）

- 工具：WebSearch
- 查询：
  - `InstructGPT arXiv 2212.08073 Ouyang; DPO Direct Preference Optimization arXiv 2305.18290 Rafailov`
  - `InstructGPT RLHF; DPO; GRPO DeepSeek`
- 核实日期：2026-11-16
- 可信级别提示：**A 级**（官方 arXiv）

## 一手来源（arXiv 号经多方一致引用确认）

| 源 ID | 主题 | 一手来源 | 级别 |
|---|---|---|---|
| S-InstructGPT | RLHF 三阶段范式 | arXiv:**2212.08073**（Ouyang et al., OpenAI, NeurIPS 2022） | A |
| S-DPO | 直接偏好优化 | arXiv:**2305.18290**（Rafailov et al., NeurIPS 2023） | A |
| S-GRPO | 组相对策略优化 | arXiv:**2402.03300**（DeepSeekMath, Li et al. 2024） | A |
| S-ConstAI | Constitutional AI（RLAIF 前驱） | Bai et al. 2022，**arXiv 号本批次未逐一核验，暂标「待补」，不臆造** | A（号待补） |

## 关键事实（挂 A 级）

- **RLHF 三阶段（S-InstructGPT · A）**：① SFT（人工标注「指令—响应」示例，学听话格式）→ ② 奖励模型 RM（对同一 prompt 多个回答由人排序，训打分模型）→ ③ PPO 强化学习（以 RM 为奖励信号、KL 惩罚约束漂移）。1.3B InstructGPT 在人类偏好上胜过 175B GPT-3。
- **DPO（S-DPO · A）**：把 RLHF 目标改写成直接对偏好对的监督式损失，**免显式 RM、免在线 PPO 采样**；更稳、算力更低，成开源对齐默认；仍只能在静态偏好数据集内强化，探索能力弱于在线 RL。
- **GRPO（S-GRPO · A）**：PPO 变体，去掉独立 critic，按**同一 prompt 一组 rollout 的组内相对奖励**（相对组均值）更新；DeepSeekMath 用它把 7B 模型 MATH 推到 51.7%；DeepSeek-R1 沿用。
- **对齐税（alignment tax）**：RLHF/DPO 可能掉部分通用基准；InstructGPT 用 PPO-ptx（混预训练目标）缓解。

## 实操映射（课程 M9 用）

- HF `trl`：SFTTrainer / DPOTrainer / GRPOTrainer，均接受 `peft_config=LoraConfig()`；数据集为「prompt + chosen + rejected」偏好对。
