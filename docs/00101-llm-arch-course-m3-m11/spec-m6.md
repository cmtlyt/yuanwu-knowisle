# M6 spec（7 课）

## L55 · 五维矩阵：自回归/MoE/SSM/扩散对比
- stage=24 kind=framework difficulty=3 prereqs=[L24,L34,L44] concept=compare-matrix
- source: 各模块 A 级；成本挂 S-DSV3 · A
- bodyGoal: 自回归/MoE/SSM/扩散五维矩阵（质量·成本·延迟·长上下文·可控性）
- goals: 「铺开质量·训练成本·推理延迟·长上下文·可控性五维」 / 「对照四类架构在每维的强弱」 / 「说明矩阵是选型第一张图」 / 「给出每维的可量化指标」

## L56 · 给定预算/延迟/上下文的架构选型判据
- stage=25 kind=scenario difficulty=3 prereqs=[L55] concept=selection
- source: 综合各模块 A 级
- bodyGoal: 给定预算/延迟/上下文约束做架构选型决策（MoE/SSM/扩散判据）
- goals: 「把真实约束翻译成选型判据」 / 「给出 MoE/SSM/扩散的适用边界」 / 「对照常见误选」 / 「产出有依据的推荐」

## L57 · 推理成本建模：激活参决定 FLOPs
- stage=26 kind=framework difficulty=4 prereqs=[L55] concept=cost-model
- source: S-DSV3（671B/37B）· A
- bodyGoal: 总参 vs 激活参（FLOPs 由激活参决定）；长上下文 KV 成本线性增长
- goals: 「讲清总参 vs 激活参对 FLOPs 的决定作用」 / 「解释长上下文 KV 成本线性增长」 / 「建立 $/token 的成本模型」 / 「与 M11 部署衔接」

## L58 · 同规模 ~125M 四架构可执行对比实验
- stage=27 kind=practice difficulty=4 prereqs=[L55,L57] concept=arch-compare-exp
- source: 架构复用 M2–M4 A 级；HF 生态 · A
- bodyGoal: 固定 ~125M 跑 Transformer/MoE/SSM/线性注意力四模型实测；可复现脚本+数据表
- goals: 「写出可跑的四架构对比脚本」 / 「固定 ~125M 实测吞吐·峰值 KV/显存·同语料 loss」 / 「测 4K/16K 长上下文退化曲线」 / 「产出可复现数据表」

## L59 · 架构选型决策报告 capstone
- stage=27 kind=capstone difficulty=5 prereqs=[L56,L58] concept=m6-capstone
- source: S-DSV3/S-LoRA 同族 · A
- bodyGoal: 给真实需求写架构选型决策报告；引实测数据；可执行验收断言
- goals: 「搭建真实需求场景（预算+延迟+上下文+编辑需求）」 / 「写推荐架构+量化依据的选型报告」 / 「给出反例与边界」 / 「用 Stage 6.4 实测数据复现结论」

## L60 · 商用/API 成本维度与自建回本判据
- stage=28 kind=scenario difficulty=3 prereqs=[L57] concept=api-cost
- source: 各厂官方定价页 · B（随时间变动，标注检索日）
- bodyGoal: 商用 API 成本维度；自建 vs API 同一成本模型；判回本
- goals: 「解释 $/1K input·output 与长上下文阶梯价」 / 「把自建吞吐/显存成本与 API 价放同一模型」 / 「给「自建回本 vs 直用 API」判据」 / 「标注价格随时间变动」

## L61 · 多模态/长上下文 benchmark 选型
- stage=28 kind=framework difficulty=3 prereqs=[L55] concept=mm-bench
- source: 各 benchmark 官方页 · A（待复核）
- bodyGoal: 多模态/长上下文 benchmark 选型；按任务选官方基准口径
- goals: 「给五维矩阵补「多模态」「长上下文」两维」 / 「按任务选官方基准口径」 / 「说明 needle-in-haystack/PG19 用法」 / 「避免短文本基准误评」

