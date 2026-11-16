# M5 spec（6 课）

## L49 · 离散/掩码扩散 LLM：第三条生成范式
- stage=21 kind=theory difficulty=3 prereqs=[L11] concept=diffusion-llm
- source: S-LLaDA · A
- bodyGoal: 离散/掩码扩散（吸收态≈广义 MLM）；前向掩码+反向去噪；去因果双向 Transformer
- goals: 「讲清离散扩散的前向掩码与反向去噪」 / 「解释吸收态与「广义 MLM」」 / 「说明去因果双向 Transformer 的作用」 / 「对照扩散与自回归的取舍」

## L50 · 跑 LLaDA-8B：reversal curse 与 ICL 对照
- stage=21 kind=scenario difficulty=4 prereqs=[L49] concept=llada-run
- source: S-LLaDA · A
- bodyGoal: 跑 LLaDA-8B（2.3T token）+ 对照 reversal curse 缓解、与 LLaMA3 8B ICL 对比
- goals: 「搭建可跑的 LLaDA-8B 推理冒烟」 / 「对照 reversal curse 缓解」 / 「与 LLaMA3 8B 做 ICL 对比」 / 「验证任意顺序生成的可用性与速度」

## L51 · LLaDA 谱系：1.5/V/MoE/2.0
- stage=22 kind=framework difficulty=3 prereqs=[L49] concept=llada-lineage
- source: S-LLaDA · A；Mercury C 级仅背景
- bodyGoal: LLaDA 谱系（1.5/V/MoE/2.0）+ 商用对照（C 级仅背景）
- goals: 「梳理 LLaDA 1.5/LLaDA-V/LLaDA-MoE/2.0 谱系」 / 「说明各代改进点」 / 「对照商用扩散 LLM（C 级仅背景）」 / 「说明展示型模块的定位」

## L52 · SEDD：score entropy 离散扩散理论
- stage=23 kind=theory difficulty=4 prereqs=[L49] concept=sedd-theory
- source: S-SEDD（2310.16834，ICML 2024 Oral）· A
- bodyGoal: SEDD score entropy 损失；ppl 降 25–75%；计算换质量；可控 infilling
- goals: 「讲清 score entropy 损失如何推广 score matching 到离散」 / 「解释同规模 ppl 降 25–75%」 / 「说明「计算换质量」trade-off（32× 更少评估）」 / 「对照可控 infilling 机制」

## L53 · Dream 7B：上下文自适应噪声重调度
- stage=23 kind=framework difficulty=4 prereqs=[L49] concept=dream-llm
- source: S-Dream（2508.15487）· A
- bodyGoal: Dream 7B（AR 初始化 + CART）；MMLU 打平、规划反超；任意顺序生成
- goals: 「讲清 AR-初始化与 CART 噪声重调度」 / 「对照 MMLU 与 Qwen2.5-7B 打平」 / 「解释 Countdown 规划反超」 / 「说明任意顺序生成/infilling/质量-速度可调」

## L54 · 扩散 LLM 局部编辑与可控生成
- stage=23 kind=scenario difficulty=4 prereqs=[L49,L52] concept=diffusion-edit
- source: S-LLaDA/S-SEDD · A
- bodyGoal: 扩散 LLM 局部编辑/可控生成：inpainting、FIM、约束生成；冒烟对比
- goals: 「跑通 inpainting / fill-in-the-middle 冒烟」 / 「对照约束生成」 / 「说明任意顺序生成 vs 自回归单向不可编辑」 / 「验证局部编辑的可用性」

