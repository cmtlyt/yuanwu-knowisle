# M9 spec（13 课）

## L83 · 全参微调：成本/过拟合/灾难性遗忘
- stage=37 kind=theory difficulty=2 prereqs=[L72] concept=full-finetune
- source: S-PEFT · A
- bodyGoal: 全参微调成本/过拟合/灾难性遗忘；何时才该全参
- goals: 「讲清全参微调的显存与优化器成本」 / 「解释过拟合与灾难性遗忘」 / 「说明何时才该全参」 / 「对照 PEFT 动机」

## L84 · PEFT 谱系：Adapters→Prefix→(IA)³→LoRA
- stage=37 kind=framework difficulty=3 prereqs=[L83] concept=peft-lineage
- source: S-PEFT · A
- bodyGoal: PEFT 谱系 Adapters→Prefix/Prompt→(IA)³→LoRA 逐项对照；可训参数量级表
- goals: 「梳理 PEFT 谱系逐项对照」 / 「列出可训参数量级表」 / 「解释各代取舍」 / 「说明 LoRA 为何成默认」

## L85 · LoRA：冻结基座 + 低秩 B×A
- stage=38 kind=theory difficulty=3 prereqs=[L84] concept=lora
- source: S-LoRA · A
- bodyGoal: LoRA 机制：冻结基座+低秩 B×A，W=W₀+(α/r)BA；为何省 10⁴×
- goals: 「推导 LoRA 的 W=W₀+(α/r)BA」 / 「解释为何省 10⁴× 可训参数」 / 「说明秩 r 与 α 的作用」 / 「对照全参更新」

## L86 · QLoRA：4-bit NF4 基座 + 双重量化
- stage=38 kind=framework difficulty=3 prereqs=[L85] concept=qlora
- source: S-QLoRA · A
- bodyGoal: QLoRA：4-bit NF4 基座+双重量化+bf16 LoRA；单 48GB 微调 65B
- goals: 「讲清 4-bit NF4 量化基座」 / 「解释双重量化与分页优化器」 / 「说明 bf16 LoRA 适配」 / 「核算单 48GB GPU 微调 65B 的机制」

## L87 · DoRA：权重拆幅度+方向
- stage=38 kind=theory difficulty=3 prereqs=[L85] concept=dora
- source: S-DoRA · A
- bodyGoal: DoRA：权重拆幅度+方向、方向做 LoRA；稳超 LoRA 且零推理开销
- goals: 「讲清 DoRA 把权重拆幅度与方向」 / 「解释方向做 LoRA」 / 「说明为何稳超 LoRA 且零推理开销」 / 「对照 LoRA 的表达力」

## L88 · LoRA/QLoRA/DoRA/GaLore 四法选型
- stage=38 kind=framework difficulty=4 prereqs=[L86,L87] concept=peft-select
- source: S-LoRA/QLoRA/DoRA/GaLore · A
- bodyGoal: 四法对比与选型判据（显存/质量/多任务）；GaLore 备选
- goals: 「从显存/质量/多任务三维对比四法」 / 「给出选型判据」 / 「说明 GaLore 备选定位」 / 「产出对照表」

## L89 · LoRA SFT 端到端 + merge_and_unload
- stage=39 kind=practice difficulty=4 prereqs=[L85] concept=lora-sft
- source: S-OPTIM 同族 HF 生态 · A
- bodyGoal: LoRA SFT 端到端：LoraConfig+bitsandbytes4bit+指令数据；merge 导出
- goals: 「写出 LoraConfig + 4bit + 指令数据脚本」 / 「跑通 LoRA SFT 训练」 / 「用 merge_and_unload 导出」 / 「验证合并后推理」

## L90 · 一基座多适配器与零延迟切换
- stage=39 kind=scenario difficulty=4 prereqs=[L89] concept=multi-adapter
- source: S-LoRA · A
- bodyGoal: 一基座多适配器：训 2 个领域 LoRA + 服务切换 + 零延迟 merge 对照
- goals: 「训练 2 个不同领域 LoRA」 / 「实现服务端适配器切换」 / 「对照零延迟 merge」 / 「验证多任务隔离」

## L91 · 数据量 < 模型容量：小数据常更优
- stage=40 kind=theory difficulty=3 prereqs=[L89] concept=data-size
- source: S-QLoRA · A
- bodyGoal: 数据量<容量时小数据常更优（QLoRA 9k>450k）；过拟合识别
- goals: 「讲清 QLoRA 9k>450k 的发现」 / 「解释数据质量>数量的边界」 / 「给出过拟合识别信号」 / 「说明数据清洗优先级」

## L92 · GaLore：梯度低秩投影省显存
- stage=41 kind=theory difficulty=3 prereqs=[L88] concept=galore
- source: S-GaLore（2403.03507）· A
- bodyGoal: GaLore 梯度低秩投影省显存（~1/4，不冻基座）vs 全参/LoRA
- goals: 「讲清 GaLore 把全参梯度投到低秩子空间」 / 「解释显存 ~1/4 且不冻基座」 / 「对照全参/LoRA」 / 「给出小模型显存/收敛对照」

## L93 · 小模型全参 SFT 实操与显存对照
- stage=41 kind=practice difficulty=4 prereqs=[L83] concept=full-finetune-sft
- source: HF 生态 · A
- bodyGoal: 小模型全参 SFT 实操 vs LoRA/QLoRA 显存对照；何时值得
- goals: 「写出 Qwen0.5B/GPT-2 级全参 SFT 脚本」 / 「测显存峰值」 / 「对照 LoRA/QLoRA 显存」 / 「判断全参何时值得」

## L94 · 指令/多任务数据构造
- stage=41 kind=framework difficulty=3 prereqs=[L89,L91] concept=instr-data
- source: S-QLoRA · A + HF 生态 · A
- bodyGoal: 指令/多任务数据构造：schema/混排/自举蒸馏/去重分级；9k>450k
- goals: 「讲清 (指令—响应) schema」 / 「说明多任务混排比例」 / 「解释自举蒸馏与去重难度分级」 / 「对照 S-QLoRA 数据集结论」

## L95 · 小数据集 LoRA 微调 + 过拟合验收 capstone
- stage=41 kind=capstone difficulty=5 prereqs=[L89,L91,L94] concept=m9-capstone
- source: S-LoRA/QLoRA · A
- bodyGoal: 小数据集 LoRA 微调 + 过拟合曲线验收（train/val 分离 + merge 推理）
- goals: 「搭建小数据集 LoRA 微调流程」 / 「画 train/val loss 分离曲线」 / 「验证 merge 后推理冒烟」 / 「给出过拟合曲线验收断言」

