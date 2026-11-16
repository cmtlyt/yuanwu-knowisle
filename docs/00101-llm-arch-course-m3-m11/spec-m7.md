# M7 spec（10 课）

## L62 · DeepSeek 谱系：67B→V2→V3→R1
- stage=29 kind=theory difficulty=3 prereqs=[L27] concept=ds-lineage
- source: S-DSV2/S-DSV3 · A；deepseek-ai/* 仓库
- bodyGoal: DeepSeek 67B→V2(MLA)→V3(MTP+无辅助均衡)→R1(RL 推理)；开放权重
- goals: 「梳理 67B→V2(MLA)→V3(MTP+无辅助均衡)→R1(RL 推理)」 / 「说明开放权重与许可证」 / 「解释每代架构创新主线」 / 「说明 DeepSeekMoE 的位置」

## L63 · MLA：KV 联合低秩压缩减 93.3%
- stage=30 kind=theory difficulty=4 prereqs=[L62,L15] concept=mla
- source: S-DSV2 · A
- bodyGoal: MLA：KV 联合低秩压缩到 c_KV；减 KV 93.3%、吞吐 5.76×
- goals: 「推导 MLA 的 KV 联合低秩压缩到 c_KV」 / 「解释 d_c≪2·n_h·d_h 的意义」 / 「说明生成时再上投影」 / 「核算减 KV 93.3%、吞吐 5.76×」

## L64 · 解耦 RoPE：K 拆未旋转内容 + 小旋转 k^R
- stage=30 kind=framework difficulty=4 prereqs=[L63] concept=decoupled-rope
- source: S-RoPE+S-DSV2 · A
- bodyGoal: 解耦 RoPE（K 拆未旋转内容+小旋转 k^R）vs 标准 RoPE；保 KV 压缩又保位置
- goals: 「讲清标准 RoPE 与 KV 压缩的冲突」 / 「解释解耦 RoPE 的 K 拆分」 / 「说明如何保住 KV 压缩又保位置精度」 / 「对照两种 RoPE 的实现」

## L65 · DeepSeekMoE：细粒度专家+共享专家隔离
- stage=31 kind=framework difficulty=4 prereqs=[L62,L30] concept=deepseekmoe
- source: S-DSM/S-DSV3 · A
- bodyGoal: DeepSeekMoE 细粒度专家细分+共享专家隔离；aux-loss-free 路由
- goals: 「讲清细粒度专家细分」 / 「解释共享专家隔离」 / 「说明 aux-loss-free 路由」 / 「对照通用 MoE 的差异」

## L66 · MTP：多 Token 预测与推测解码
- stage=32 kind=theory difficulty=4 prereqs=[L62] concept=mtp
- source: S-DSV3 · A
- bodyGoal: MTP（预测 k 个未来 token 需 k−1 个 MTP 模块）+ 推理时推测解码
- goals: 「讲清 MTP 预测 k 个未来 token 需 k−1 个模块」 / 「解释训练目标与推理时推测解码」 / 「说明 acceptance rate 与加速」 / 「对照单 token 预测」

## L67 · 3D 并行 + DualPipe + 跨节点 all-to-all + FP8
- stage=32 kind=framework difficulty=4 prereqs=[L66,L32] concept=ds-parallel-fp8
- source: S-DSV3 · A
- bodyGoal: 3D 并行（DP+TP+PP）+ DualPipe 重叠 + 跨节点 all-to-all + FP8 混合精度
- goals: 「讲清 DP+TP+PP 的 3D 并行」 / 「解释 DualPipe 计算-通信重叠」 / 「说明跨节点 all-to-all 错峰」 / 「对照 FP8 混合精度训练」

## L68 · mFformer 定论与真实/误记核实表
- stage=33 kind=framework difficulty=3 prereqs=[L62] concept=mfformer-verdict
- source: B1-09（C 级定论）
- bodyGoal: mFformer 定论（无官方来源，疑似混淆）+ 真实 vs 误记逐项核实表
- goals: 「给出 mFformer 无官方来源的 C 级定论」 / 「说明疑似混淆 MLA/MTP/DeepSeekMoE」 / 「逐项核实真实 vs 误记」 / 「说明来源纪律的重要性」

## L69 · R1 推理链：纯 RL 激励推理与蒸馏
- stage=33 kind=theory difficulty=4 prereqs=[L62] concept=r1-reasoning
- source: S-R1（2501.12948，Nature 收录）· A
- bodyGoal: R1 推理链：纯 RL、rule-based reward、涌现反思、蒸馏；与 M10 GRPO 呼应
- goals: 「讲清纯 RL 激励推理免人工标注轨迹」 / 「解释 rule-based reward 可验证任务判分」 / 「说明涌现 self-reflection/verification」 / 「对照推理蒸馏给小模型，与 M10 GRPO 呼应（正文说明，非前置）」

## L70 · DualPipe 细节：流水线气泡与双向填平
- stage=33 kind=framework difficulty=4 prereqs=[L66,L67] concept=dualpipe
- source: S-DSV3（3D 并行章节）· A
- bodyGoal: DualPipe 通信重叠细节：气泡产生+双向填平+1F1B+跨节点错峰
- goals: 「讲清 PP 流水线气泡怎么产生」 / 「解释 forward/reverse 双向流水填平」 / 「说明用 TP all-reduce 盖 PP 空等与 1F1B」 / 「对照跨节点 all-to-all 错峰」

## L71 · 复现 MLA 低秩 KV 压缩 capstone
- stage=33 kind=capstone difficulty=5 prereqs=[L63,L65,L66,L69] concept=m7-capstone
- source: S-DSV2/DSV3 · A
- bodyGoal: 复现 MLA 低秩 KV 压缩 + 解耦 RoPE + 算 KV 缓存节省；可执行验收断言
- goals: 「搭建可跑的 MLA 低秩 KV 压缩复现」 / 「实现解耦 RoPE」 / 「核算 KV 缓存节省」 / 「给出压缩比≈93.3% 验收断言」

