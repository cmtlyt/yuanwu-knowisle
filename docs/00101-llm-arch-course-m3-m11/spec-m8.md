# M8 spec（11 课）

## L72 · 自回归 next-token 预训练目标
- stage=34 kind=theory difficulty=2 prereqs=[] concept=next-token
- source: S-GPT3 · A
- bodyGoal: 自回归 next-token 损失；decoder-only 为何统一；训练目标数学
- goals: 「讲清 next-token 交叉熵目标」 / 「解释 decoder-only 为何统一」 / 「说明训练目标与「预测下一 token」的数学」 / 「对照 M1 的 next-token 损失」

## L73 · 数据配比：GPT-3 vs LLaMA
- stage=34 kind=framework difficulty=2 prereqs=[L72] concept=data-mixing
- source: S-GPT3 · A；S-LLaMA（2302.13971）· A
- bodyGoal: GPT-3 vs LLaMA 配比；采样权重为何；LLaMA 官方 A 级
- goals: 「对照 GPT-3 Wikipedia 高轮数与 Common Crawl」 / 「讲清 LLaMA 配比（CC 67%/C4 15%/…）」 / 「解释采样权重为何重要」 / 「标注 LLaMA 官方 A 级来源」

## L74 · 语料去重/去毒/去噪管线实操
- stage=34 kind=practice difficulty=3 prereqs=[L73] concept=data-cleaning
- source: B 级（工具链）
- bodyGoal: 语料去重/去毒/去噪管线实操（HF datasets + deduplicate + 正则黑名单）
- goals: 「写出可跑的 HF datasets 清洗脚本」 / 「实现去重与正则黑名单」 / 「产出干净 token 流」 / 「验证清洗前后数据质量」

## L75 · Chinchilla Scaling Law：N/D 等比扩展
- stage=35 kind=theory difficulty=2 prereqs=[L72] concept=scaling-law
- source: S-Chinchilla · A
- bodyGoal: Chinchilla：固定 FLOPs 下 N/D 等比扩展（≈20 token/参数）；70B@1.4T 胜 GPT-3
- goals: 「推导固定 FLOPs 下 N 与 D 等比扩展」 / 「解释 ≈20 token/参数」 / 「说明 70B@1.4T 胜 GPT-3」 / 「给出算力边界直觉」

## L76 · 过训练：训练最优≠推理最优
- stage=35 kind=theory difficulty=3 prereqs=[L75] concept=over-train
- source: B 级（唐杰/Epoch 复算）
- bodyGoal: 过训练 token/参数（B 级）；训练最优≠推理最优；显式标第三方
- goals: 「讲清过训练换低推理成本」 / 「标注 Llama2 7B≈290、Llama3 70B≈215（B 级复算）」 / 「说明为何小模型过度训练」 / 「不把 B 级值当关键结论」

## L77 · 给定算力预算规划 N/D 实操
- stage=35 kind=practice difficulty=3 prereqs=[L75,L76] concept=compute-budget
- source: S-Chinchilla · A
- bodyGoal: FLOPs≈6ND 估算 + Chinchilla 边界表 + 过训练系数；算力规划
- goals: 「写出 FLOPs≈6ND 估算脚本」 / 「建 Chinchilla 边界表」 / 「叠加过训练系数」 / 「产出给定预算的 N/D 规划」

## L78 · 从零预训练 125M 单卡冒烟
- stage=36 kind=practice difficulty=3 prereqs=[L77] concept=from-scratch-pretrain
- source: S-Transformer17 · A；HF 生态 · A
- bodyGoal: 从零预训练 125M 单卡冒烟：数据→分词器→配置→Trainer→loss→生成
- goals: 「写出从零 125M 配置与分词器脚本」 / 「跑通 HF Trainer 训练循环」 / 「产出 loss 曲线」 / 「做生成冒烟验证」

## L79 · 继续/领域预训练 CPT 端到端
- stage=36 kind=scenario difficulty=4 prereqs=[L78] concept=cpt
- source: S-OPTIM 同族 HF 生态 · A
- bodyGoal: 继续/领域预训练端到端：resume+领域语料+loss+早停；与从零差异
- goals: 「搭建基座 --resume + 领域语料流程」 / 「训练 + loss 曲线 + 早停」 / 「对照从零预训练差异（学习率/冻结/混合）」 / 「验证领域适配效果」

## L80 · TP/PP/ZeRO 对照 + 2 卡 ZeRO 冒烟
- stage=36 kind=framework difficulty=4 prereqs=[L79] concept=dist-parallel
- source: S-DSV3 · A（3D 并行）
- bodyGoal: TP/PP/ZeRO 概念对照 + torchrun 2 卡 ZeRO 冒烟；何时用哪种
- goals: 「对照 TP/PP/ZeRO 的切分维度」 / 「跑通 torchrun 2 卡 ZeRO」 / 「说明何时用哪种并行」 / 「对照 125M→700M 扩展」

## L81 · 能力探针/涌现：困惑度↓≠能力涌现
- stage=36 kind=practice difficulty=3 prereqs=[L78] concept=cap-probe
- source: S-GPT3（2005.14165）· A
- bodyGoal: 预训练中途能力探针（few-shot 分类/检索/推理）+ 涌现点；困惑度≠能力
- goals: 「写出 zero-shot/few-shot 能力探针脚本」 / 「测分类/检索/简单推理」 / 「观察涌现点」 / 「论证困惑度与能力分开看」

## L82 · 从零 700M 预训练 + 多卡 ZeRO capstone
- stage=36 kind=capstone difficulty=5 prereqs=[L79,L80] concept=m8-capstone
- source: S-Chinchilla/S-Transformer17 · A
- bodyGoal: 从零 700M 预训练 + 多卡 ZeRO；loss/困惑度/token 参数核算验收
- goals: 「搭建从零 700M 预训练流程」 / 「跑通多卡 ZeRO 冒烟」 / 「核算 token/参数对齐 Chinchilla」 / 「给出 loss 降/困惑度验收断言」

