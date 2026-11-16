# M10 spec（9 课）

## L96 · RLHF 三阶段：SFT→RM→PPO
- stage=42 kind=theory difficulty=3 prereqs=[L89] concept=rlhf
- source: S-InstructGPT（2203.02155）· A
- bodyGoal: RLHF 三阶段 SFT→奖励模型 RM→PPO（KL 惩罚）；1.3B 胜 175B
- goals: 「讲清 RLHF 三阶段流程」 / 「解释 KL 惩罚约束漂移」 / 「说明 1.3B 胜 175B」 / 「对照纯 SFT」

## L97 · 对齐税与 PPO-ptx 缓解
- stage=42 kind=theory difficulty=3 prereqs=[L96] concept=alignment-tax
- source: S-InstructGPT · A
- bodyGoal: 对齐税（掉通用基准）与 PPO-ptx 缓解机制
- goals: 「解释对齐税（掉通用基准）」 / 「说明 PPO-ptx 缓解机制」 / 「给出识别对齐税的方法」 / 「对照不同 RLHF 变体」

## L98 · DPO：免显式 RM 的偏好对监督损失
- stage=43 kind=theory difficulty=3 prereqs=[L96] concept=dpo
- source: S-DPO（2305.18290）· A
- bodyGoal: DPO：免显式 RM、免在线 PPO、偏好对直接监督式损失；为何成默认
- goals: 「推导 DPO 从 RLHF 目标到偏好对损失」 / 「解释免显式 RM、免在线 PPO」 / 「说明为何成开源默认」 / 「对照 RLHF 的不稳定性」

## L99 · GRPO：去 critic 组内相对奖励
- stage=44 kind=theory difficulty=4 prereqs=[L98] concept=grpo
- source: S-GRPO（2402.03300）· A
- bodyGoal: GRPO 去 critic、组内相对奖励；DeepSeekMath 7B MATH 51.7%
- goals: 「讲清 GRPO 去 critic 的机制」 / 「解释同 prompt 一组 rollout 的组内相对奖励」 / 「说明 DeepSeekMath 7B MATH 51.7%」 / 「对照 PPO」

## L100 · RLAIF / Constitutional AI：模型自评
- stage=44 kind=framework difficulty=3 prereqs=[L96] concept=rlaif
- source: S-ConstAI（2212.08073）· A
- bodyGoal: RLAIF/Constitutional AI 模型自评替代人标；与 RLHF 谱系对照
- goals: 「讲清 RLAIF 用模型自评替代人标」 / 「解释 Constitutional AI 的宪法原则」 / 「对照 RLHF 谱系」 / 「说明可扩展性与偏差」

## L101 · trl：SFT/DPO/GRPO Trainer 实操
- stage=45 kind=scenario difficulty=4 prereqs=[L98,L99] concept=trl-align
- source: S-OPTIM 同族 HF 生态 · A
- bodyGoal: trl：SFTTrainer/DPOTrainer/GRPOTrainer + peft_config=LoraConfig()；偏好对数据流
- goals: 「搭建 trl 三种 Trainer 流程」 / 「用 peft_config=LoraConfig()」 / 「走通偏好对数据流」 / 「对照 DPO/GRPO 训练稳定性」

## L102 · DPO 变体：IPO / KTO 三法对照
- stage=46 kind=framework difficulty=4 prereqs=[L98] concept=dpo-variants
- source: S-IPO（2310.12036）/S-KTO（2402.01306）· A
- bodyGoal: IPO/KTO 三法对照：数据形态·正则行为·适用场景
- goals: 「讲清 IPO 的 Identity 正则避免过拟合」 / 「解释 KTO 的 HALOs 只需二元合意标签」 / 「对照数据形态/正则行为/适用场景」 / 「说明 KTO 1B–30B 匹配/超 DPO」

## L103 · 安全对齐：越狱/红队/拒答边界
- stage=46 kind=scenario difficulty=4 prereqs=[L96,L100] concept=safety-align
- source: S-InstructGPT/S-ConstAI · A
- bodyGoal: 安全对齐：越狱模式分类、红队循环、拒答得体；与通用对齐张力
- goals: 「分类越狱模式（角色扮演/编码混淆/多语言/注入）」 / 「跑通红队攻击+修复循环」 / 「说明对齐安全边界」 / 「对照与通用对齐的张力」

## L104 · 偏好对数据集 + DPO 对齐 capstone
- stage=46 kind=capstone difficulty=5 prereqs=[L101,L102] concept=m10-capstone
- source: S-DPO · A
- bodyGoal: 偏好对数据集构建 + DPO 对齐端到端；偏好胜率/KL/基准不掉验收
- goals: 「搭建偏好对数据集构建流程」 / 「跑通 DPO 对齐端到端」 / 「验证偏好胜率/KL 漂移」 / 「给出通用基准不掉的验收断言」

