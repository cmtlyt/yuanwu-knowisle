# M3 spec（11 课）

## L27 · 稀疏门控专家 MoE：从 FFN 到专家库
- stage=12 kind=theory difficulty=3 prereqs=[L11] concept=spmoe
- source: S-SGMoE · A
- bodyGoal: 稀疏门控源头 Shazeer 2017；FFN→专家库+门控；GShard/Switch/GLaM 谱系；为何容量随内存非 FLOPs
- goals: 「讲清 Shazeer 2017 稀疏门控 MoE 的「FFN→专家库+门控」改造」 / 「解释「容量随内存增长而非随 FLOPs」的含义」 / 「对照 GShard / Switch / GLaM 谱系」 / 「说明稀疏激活与总参数量分离的意义」

## L28 · 总参与激活参：GLaM「身份证号」与专家并行
- stage=12 kind=framework difficulty=3 prereqs=[L27] concept=expert-parallel
- source: S-GShard/S-GLaM · A
- bodyGoal: 总参/激活参分离（GLaM 身份证号）；专家并行概念对照；激活参占比账
- goals: 「区分总参数量与每 token 激活参数量」 / 「解释 GLaM「参数身份证号」稀疏激活记账法」 / 「对照数据/张量/专家并行的分工」 / 「估算 8 选 2 稀疏层的激活参占比」

## L29 · top-k 门控路由：线性打分→top-k→加权和
- stage=13 kind=theory difficulty=3 prereqs=[L27] concept=routing
- source: S-SGMoE · A
- bodyGoal: top-k 门控流程（线性打分→top-k→门控加权和）；门控权重归一；top-k 取舍
- goals: 「讲清 top-k 门控的三步流程」 / 「解释门控权重归一与稀疏激活」 / 「说明 top-k 取值对容量与通信的影响」 / 「对照稠密 FFN 与稀疏路由的计算差异」

## L30 · 负载均衡三法：aux-loss→expert-choice→aux-loss-free
- stage=13 kind=framework difficulty=4 prereqs=[L29] concept=load-balance
- source: S-GShard/S-Switch/expert-choice 2202.09368/S-DSV3 · A
- bodyGoal: aux-loss→expert-choice→aux-loss-free 三法对照；Mixtral 专家类型分化
- goals: 「讲清 aux-loss 的均衡项设计与副作用」 / 「对照 expert-choice 的「专家选 token」反转」 / 「解释 aux-loss-free 的 router 偏置梯度调节」 / 「对照 Mixtral 专家按 token 类型分化的反直觉点」

## L31 · 手写 top-k 路由 + 辅助损失小模型冒烟
- stage=13 kind=practice difficulty=4 prereqs=[L29] concept=routing-impl
- source: S-SGMoE · A
- bodyGoal: 手写 top-k 路由 + 负载均衡（辅助损失项）小模型冒烟；验证负载分布
- goals: 「写出可跑的 top-k 路由前向代码」 / 「实现辅助负载均衡损失项」 / 「跑通小模型 MoE 前向冒烟」 / 「验证专家负载分布与门控归一」

## L32 · 专家并行：all-to-all 分发/回收与 3D/4D 组合
- stage=14 kind=theory difficulty=4 prereqs=[L28] concept=ep-all2all
- source: S-GShard/S-DSV3 · A
- bodyGoal: 专家并行 all-to-all 分发/回收；EP×TP×PP×DP 3D/4D；容量因子
- goals: 「讲清专家并行的 all-to-all 分发与回收」 / 「解释 EP×TP×PP×DP 如何组合成 3D/4D」 / 「说明容量因子与 token 丢弃」 / 「估算 all-to-all 通信量与带宽瓶颈」

## L33 · Mixtral 8x7B vs DeepSeek-V3 稀疏 MoE 对照
- stage=15 kind=framework difficulty=4 prereqs=[L27,L32] concept=mixtral
- source: S-Mixtral/S-DSV3 · A
- bodyGoal: Mixtral 8x7B（46.7B/12.9B，8 选 2）vs DeepSeek-V3 稀疏 MoE 对照
- goals: 「讲清 Mixtral 8x7B 的 46.7B/12.9B 与 8 选 2」 / 「对照 DeepSeek-V3 的稀疏 MoE 设计」 / 「解释激活参数决定 FLOPs」 / 「对照两者许可证与开放策略」

## L34 · 手写 MoE 层 + Mixtral 专家利用率验收
- stage=15 kind=capstone difficulty=4 prereqs=[L31,L33] concept=m3-capstone
- source: S-Mixtral · A
- bodyGoal: 手写 MoE 层（细粒度+共享+top-k+均衡）+ 跑 Mixtral 验证利用率；可执行验收断言
- goals: 「搭建含细粒度专家+共享专家+top-k 路由+均衡的 MoE 层」 / 「跑通 Mixtral 验证专家利用率」 / 「给出专家负载均衡度的验收断言」 / 「核算激活参数占比并对照官方数字」

## L35 · 专家坍缩诊断：利用率尖锐与路由熵塌缩
- stage=16 kind=framework difficulty=4 prereqs=[L30] concept=expert-collapse
- source: S-SGMoE/S-GShard/S-DSV3 · A
- bodyGoal: 专家坍缩/路由失败诊断；利用率尖锐、熵塌缩、aux-loss 信号；旋钮
- goals: 「识别专家利用率尖锐/路由熵塌缩等失败模式」 / 「解释 aux-loss 抬升等诊断信号」 / 「对照容量因子/expert-choice/aux-loss-free 旋钮」 / 「给出坍缩复现与修复的最小实验」

## L36 · 共享专家：top-k 之外的必经通道
- stage=16 kind=theory difficulty=3 prereqs=[L27,L33] concept=shared-expert
- source: S-Mixtral/S-DSM/S-DSV3 · A
- bodyGoal: 共享专家机制（所有 token 必经）；Mixtral/DSV3 设计；卸压路由
- goals: 「解释共享专家承接通用/高频特征的机制」 / 「说明共享专家如何给路由卸压」 / 「对照 Mixtral 与 DeepSeek-V3 的共享专家设计」 / 「估算共享专家引入的参数与收益」

## L37 · 小 MoE 完整训练冒烟与利用率直方图
- stage=16 kind=practice difficulty=4 prereqs=[L31,L35] concept=moe-train
- source: S-Mixtral · A + HF 生态 · A
- bodyGoal: 小 MoE 完整训练冒烟；利用率均衡直方图；激活参占比；速度 vs dense
- goals: 「写出可跑的小 MoE 完整训练脚本」 / 「观测专家利用率均衡直方图」 / 「核对激活参占比」 / 「对照推理速度 vs 同激活 dense」

