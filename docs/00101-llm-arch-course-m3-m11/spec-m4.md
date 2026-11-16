# M4 spec（11 课）

## L38 · 经典 SSM（S4）到 Mamba 选择性 SSM
- stage=17 kind=theory difficulty=3 prereqs=[L11] concept=ssm
- source: S-Mamba（2312.00752）· A
- bodyGoal: 经典 SSM（S4）→ Mamba 选择性 SSM（Δ/B/C 随输入，线性复杂度、恒定推理内存）
- goals: 「讲清经典 SSM/S4 的状态更新方程」 / 「解释 Mamba 让 Δ/B/C 随输入变化的「选择性」」 / 「说明线性复杂度与恒定推理内存」 / 「对照 SSM 与 Transformer 的取舍」

## L39 · Mamba-2 SSD：统一 SSM 与注意力
- stage=17 kind=framework difficulty=4 prereqs=[L38] concept=mamba2-ssd
- source: S-Mamba2 · A
- bodyGoal: Mamba-2 SSD（统一 SSM 与注意力，状态维 16→256，快 2–8×）对照
- goals: 「讲清 Mamba-2 SSD 对 SSM 与注意力的统一」 / 「解释状态维从 16→256 的意义」 / 「对照 Mamba-2 比 Mamba-1 快 2–8×」 / 「说明结构化状态空间对偶性的工程价值」

## L40 · 跑 Mamba 推理：恒定内存/吞吐实测
- stage=17 kind=practice difficulty=4 prereqs=[L38] concept=mamba-infer
- source: S-Mamba · A
- bodyGoal: 跑 Mamba 推理 + 测恒定推理内存/吞吐 vs 同规模 Transformer
- goals: 「搭建可跑的 Mamba 推理冒烟脚本」 / 「测恒定推理内存随序列长的变化」 / 「对照同规模 Transformer 吞吐」 / 「验证长序列不涨 KV cache」

## L41 · 线性 Transformer 谱系：Hedgehog/xLSTM/RWKV
- stage=18 kind=framework difficulty=4 prereqs=[L38] concept=linear-ssm
- source: S-Hedgehog（2402.04347）/S-xLSTM（2405.04517）· A
- bodyGoal: Hedgehog/xLSTM/RWKV 谱系对照（原理深挖见 L46/L47）
- goals: 「对照 Hedgehog 可学习线性注意力」 / 「解释 xLSTM 的指数门控+矩阵记忆」 / 「说明 RWKV 谱系定位」 / 「对照三家「为什么线性」的取舍」

## L42 · 混合架构：串行 vs 并行与「~10% 注意力」共识
- stage=19 kind=theory difficulty=4 prereqs=[L38] concept=hybrid-arch
- source: S-Jamba/S-Zamba/S-FalconH1 · A
- bodyGoal: 串行 vs 并行混合；SSM + ~10% 全注意力共识；补远距离召回
- goals: 「区分串行混合与并行混合」 / 「解释「SSM + ~10% 全注意力」的共识」 / 「说明少量注意力补远距离召回的机制」 / 「对照纯 SSM 在召回任务上的短板」

## L43 · Jamba/Zamba/Falcon-H1 架构对照
- stage=19 kind=framework difficulty=4 prereqs=[L42] concept=hybrid-compare
- source: S-Jamba（2403.19887）/S-Zamba（2405.16712）/S-FalconH1（2507.22448）· A
- bodyGoal: Jamba（1:8）/Zamba（单共享）/Falcon-H1（并行混合）架构对照
- goals: 「讲清 Jamba 的 1:8 注意力层布局」 / 「对照 Zamba 单共享注意力」 / 「解释 Falcon-H1 并行混合」 / 「对照三家 KV/吞吐取舍」

## L44 · 混合模型 KV/吞吐 vs 纯 Transformer capstone
- stage=19 kind=capstone difficulty=4 prereqs=[L40,L43] concept=m4-capstone
- source: S-Jamba/S-Mamba · A
- bodyGoal: 跑混合模型（Jamba/Mamba）+ 测 KV/吞吐 vs 纯 Transformer；可执行验收断言
- goals: 「搭建可跑的混合模型基准冒烟」 / 「测 KV cache 与吞吐对照纯 Transformer」 / 「给出内存数量级验收断言」 / 「验证长上下文吞吐倍数」

## L45 · 小 Mamba 训练冒烟：O(1) 推理/O(L) 扫描
- stage=20 kind=practice difficulty=4 prereqs=[L38,L40] concept=mamba-train
- source: S-Mamba · A + 官方仓库 · A
- bodyGoal: 小 Mamba 训练冒烟；吞吐/KV 曲线；O(1) 推理内存 / O(L) 并行扫描两侧差异
- goals: 「写出可跑的小 Mamba 训练脚本」 / 「测吞吐 + KV/显存曲线 vs 同规模 Transformer」 / 「验证 O(1) 推理内存与 O(L) 并行扫描」 / 「对照训练与推理两侧差异」

## L46 · 原理深挖：RWKV/RetNet/Performer 状态数学
- stage=20 kind=framework difficulty=4 prereqs=[L38,L41] concept=linear-rnn-principle
- source: S-RWKV（2305.13048）/S-RetNet（2307.08621）/S-Performer（2009.14794）· A
- bodyGoal: RWKV/RetNet/Performer 逐家状态更新公式 + 为什么线性
- goals: 「推导 RWKV 的 channel-directed 线性注意力与时间衰减」 / 「讲清 RetNet retention 三范式」 / 「解释 Performer FAVOR+ 核化避开 N×N」 / 「逐家说明「为什么线性、省什么」」

## L47 · 原理深挖：GLA/DeltaNet/Hyena 门控·delta·卷积
- stage=20 kind=framework difficulty=4 prereqs=[L46] concept=gated-conv-principle
- source: S-GLA（2312.06635）/S-DeltaNet（2406.06484）/S-Hyena（2302.10866）· A
- bodyGoal: GLA/DeltaNet/Hyena 「门控/delta/卷积」三类状态数学对照
- goals: 「讲清 GLA 数据门控线性注意力与分块」 / 「推导 DeltaNet 的 delta rule 读-比-写纠正」 / 「解释 Hyena 隐式长卷积与 FFT 复杂度」 / 「对照三类状态数学的取舍」

## L48 · Hymba vs Granite 4.0：并行 vs 串联混合
- stage=20 kind=framework difficulty=4 prereqs=[L42,L43] concept=hybrid-hymba-granite
- source: S-Hymba（2411.13676）/S-Granite4 · A
- bodyGoal: Hymba（并行头+meta tokens）vs Granite 4.0（9:1 串联）；10% 注意力中部最佳
- goals: 「讲清 Hymba 同层注意力头‖Mamba-2 头」 / 「对照 Granite 4.0 的 9:1 串联+共享专家」 / 「解释 meta tokens 与跨层 KV 共享」 / 「说明「~10% 注意力层放中部最佳」共识」

