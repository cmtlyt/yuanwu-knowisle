import { L, withKind } from '../../course-builders.ts'

export const L93 = withKind(
  L(
    'L93',
    41,
    '小模型全参 SFT 实操与显存对照',
    4,
    ['L83'],
    ['full-finetune-sft'],
    ['写出 Qwen0.5B/GPT-2 级全参 SFT 脚本', '测显存峰值', '对照 LoRA/QLoRA 显存', '判断全参何时值得'],
    `### 为什么小模型上全参仍有一席之地

前面几课的主线是 PEFT，但 L83 留了一个明确的例外：当模型小到单卡能装下全参训练状态、且数据足够、LoRA 基线又不够时，全参的表达力上限值得付这份成本。0.5B 到 1B 级模型（Qwen2.5-0.5B、GPT-2 等）正好落在这个区间——按 L83 的 16 字节/参数估算，0.5B 全参状态约 8GB，加激活后一张 24GB 消费卡就能跑。这让小模型全参不再「物理上不可能」，而是一个真实可选项。

这一课把 L83 的判据落成实操：写出一份全参 SFT 脚本、用 CUDA 峰值接口实测显存、把 LoRA/QLoRA 三种模式的显存摆在一起对照、最后给出「全参何时值得」的判断。核心不是教「怎么无脑全参」，而是用数字验证 L83 的账——让你亲手看到 0.5B 全参峰值落在哪、LoRA 省在哪、什么时候这份开销能换来质量。

### 节点一：全参 SFT 脚本

全参脚本与 L89 的 LoRA 脚本最大的区别是：不加载 BitsAndBytesConfig、不注入 LoraConfig、不 prepare for kbit——基座所有参数 \`requires_grad=True\`。数据构造与 prompt 掩码逻辑与 L89 一致（SFT 只对回答计损）。

\`\`\`python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from datasets import Dataset
from trl import SFTTrainer, SFTConfig

MODEL_ID = "Qwen/Qwen2.5-0.5B"          # 0.5B 级；换 GPT-2 同样跑通
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID, torch_dtype=torch.bfloat16, device_map="auto")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
total = sum(p.numel() for p in model.parameters())
print(f"全参模式：可训参数 {trainable/1e6:.1f}M / 总参数 {total/1e6:.1f}M "
      f"({trainable/total*100:.1f}%)")
assert trainable == total, "全参模式应所有参数都可训"
\`\`\`

与 LoRA 脚本的这行 \`trainable == total\` 形成鲜明对照——L89 里可训参数只占 0.x%，这里 100%。这个比例就是显存差的根源：全参要给每个参数都存梯度、主权重与 Adam 状态，LoRA 只给千分之一的 BA 存。

### 节点二：数据构造与训练配置

指令数据同样按模板拼接并只对回答计损。这里补一段可独立运行的数据配比检查——小模型更容易被数据分布带偏，训练前先看任务分布是否均衡。

\`\`\`python
from collections import Counter

rows = [
    {"instruction": "翻译", "input": "你好", "output": "Hello", "task": "translate"},
    {"instruction": "总结", "input": "注意力与微调是重点。", "output": "注意力、微调", "task": "summary"},
    {"instruction": "翻译", "input": "再见", "output": "Goodbye", "task": "translate"},
    {"instruction": "分类", "input": "这条评论很好", "output": "正面", "task": "classify"},
]
dist = Counter(r["task"] for r in rows)
print("任务分布:", dict(dist))
assert len(dist) >= 2, "至少两类任务，避免单一分布"

def to_text(ex):
    return (f"### 指令:\\n{ex['instruction']}\\n\\n### 输入:\\n{ex['input']}\\n\\n"
            f"### 回答:\\n{ex['output']}{tokenizer.eos_token}")
ds = Dataset.from_list(rows).map(lambda ex: {"text": to_text(ex)})

train_config = SFTConfig(
    output_dir="./full-sft-out", num_train_epochs=3,
    per_device_train_batch_size=1, gradient_accumulation_steps=8,
    learning_rate=2e-5,                 # 全参用更小的学习率（对比 LoRA 的 2e-4）
    lr_scheduler_type="cosine", logging_steps=1,
    max_length=512, bf16=True,
    gradient_checkpointing=True,        # 用计算换显存
    optim="adamw_torch",
)
print("全参训练配置就绪：lr=2e-5（小一个量级）、检查点开、有效 batch=8")
\`\`\`

注意学习率：全参用 2e-5，比 L89 的 LoRA 2e-4 小一个量级。因为全参更新的是预训练好的权重，大学习率会破坏已有表征（灾难性遗忘，L83）；LoRA 的 B 从零起步需要更大步子。这是两种模式在超参上的系统性差异。

:::deep

### 梯度检查点是小模型全参的关键开关

\`gradient_checkpointing=True\` 让前向时只保留少量检查点激活、反向时重算中间激活，用**计算时间换显存**。对 0.5B 全参，权重/梯度/优化器状态约 8GB 是固定的，但激活随 batch 与序列长增长——seq=512、batch=1 时可能再占好几 GB。开检查点后激活压到个位数 GB，是「24GB 卡能否跑起来」的分水岭。代价是训练慢约 30% 到 50%（重算前向）。若你的卡显存充裕（如 48GB），可以关掉它换速度；显存紧就必须开。这个开关再次说明：**显存优化几乎都是用某种资源换另一种资源**，没有白省。

:::

### 节点三：实测显存峰值

这是本课的核心动作。测峰值必须用 CUDA 的峰值接口：先 \`reset_peak_memory_stats()\` 清零，训练一段，再读 \`max_memory_allocated()\`。\`nvidia-smi\` 的瞬时刷新会漏掉尖峰，不能当峰值。

\`\`\`python
import torch

def peak_train(trainer, max_steps=5):
    torch.cuda.reset_peak_memory_stats()                 # 清零峰值统计
    trainer.train(max_steps=max_steps)                   # 只跑几步测峰值
    peak = torch.cuda.max_memory_allocated() / 1e9
    return peak

# 若在无 GPU 环境，下面用解析式给出可核对的量级（保证代码可跑）
def analytic_peak_gb(n_params, checkpoint_on=True):
    state = n_params * 16 / 1e9                          # L83：16B/参数
    act = 2.0 if checkpoint_on else 6.0                  # 激活：开检查点约 2GB，不开约 6GB（示意）
    return state + act

peak_full = analytic_peak_gb(0.5e9, checkpoint_on=True)
print(f"0.5B 全参峰值（解析估算，开检查点）≈ {peak_full:.1f} GB")
if torch.cuda.is_available():
    trainer = SFTTrainer(model=model, args=train_config, train_dataset=ds,
                         processing_class=tokenizer)
    print(f"实测峰值 ≈ {peak_train(trainer):.1f} GB")
else:
    print("当前无 CUDA，跳过实测；上真实 GPU 时取消注释即可读到实测峰值")
assert peak_full < 24, "0.5B 全参（开检查点）应能装进 24GB 卡"
\`\`\`

这段兼顾两种环境：有 GPU 走真实峰值接口，无 GPU 用 L83 的 16B/参数 + 激活估算给出量级。实测时把两者对照——若实测明显高于解析值，多半是激活没被检查点压住（seq 太长或 batch 太大），回到配置排查。

### 节点四：三种模式显存对照

把全参、LoRA、QLoRA 放在同一张账上对照，数字最能说明各自的位置。下表为 0.5B 模型、bf16、开检查点的量级示意（实测随框架与序列长浮动）。

| 模式 | 权重存储 | 可训参数 | 优化器状态 | 显存量级 |
|---|---|---|---|---|
| 全参微调 | bf16 约 1GB | 100%（0.5B） | 8B/参数约 4GB | 约 8 到 10GB |
| LoRA | bf16 约 1GB | 约 0.5% | 极小 | 约 2 到 3GB |
| QLoRA | 4bit 约 0.3GB | 约 0.5% | 极小 | 约 1.5 到 2GB |

\`\`\`python
N = 0.5e9
def mode_mem(mode):
    if mode == "full":
        return N*2/1e9 + N*8/1e9 + 2.0          # bf16权重 + m,v + 激活
    if mode == "lora":
        trainable = 0.005*N
        return N*2/1e9 + trainable*16/1e9 + 2.0
    if mode == "qlora":
        trainable = 0.005*N
        return N*0.5/1e9 + trainable*16/1e9 + 2.0
for m in ("full", "lora", "qlora"):
    print(f"{m:6s} 显存量级 ≈ {mode_mem(m):.2f} GB")
assert mode_mem("full") > mode_mem("lora") > mode_mem("qlora")
print(f"全参/LoRA 显存比 ≈ {mode_mem('full')/mode_mem('lora'):.1f}×")
\`\`\`

对照结论：全参最贵但表达力最强；LoRA 省下约 3 到 4 倍显存、质量接近；QLoRA 再省基座那部分，最省。这组数字把 L83 的理论账（16B/参数）与 L86 的 4bit 收益落到了具体量级。注意全参的激活项在长序列时会显著放大，而 LoRA/QLoRA 因基座冻结、可训参数少，激活与状态都更可控。

### 节点五：判断全参何时值得

把 L83 的判据用本课的数字重述一遍，形成可执行结论：

1. **显存关**：用上面的解析式或实测峰值判断。0.5B 全参约 8 到 10GB，单卡装得下；7B 全参约 112GB 状态，单卡基本出局——除非多卡切分。
2. **PEFT 基线关**：先跑 LoRA（L89）。若 LoRA 已在你的评测上达标，全参的额外成本与遗忘风险不值得。
3. **数据与领域关**：全参的容量优势只有在足够多、且与预训练差异明显的领域数据上才兑现（L83/L91）。小数据上全参更容易过拟合。
4. **通用能力关**：全参后回测通用基准，确认下游涨点没以遗忘为代价（L83 的灾难性遗忘）。
5. **部署关**：全参导出就是原模型、无 merge（相对 LoRA 的一个小优势）；但若要多任务，全参每任务一份权重，成本陡增（L90）。

四关都过才上全参。对小模型的典型结论是：**单任务、显存够、数据足、LoRA 不够** → 全参值得；其余情况 LoRA/QLoRA 更划算。这条判断把 L83 的理论、L88 的选型、L91 的数据观收束到一个可操作的决策上。

### 全参与 LoRA 的学习率与收敛差异：为什么不能照搬超参

从 LoRA 脚本切到全参，最容易犯的错是把超参原封不动搬过来。最典型的是学习率：L89 的 LoRA 用 2e-4，这里全参降到 2e-5，差整整一个量级。原因在 L85 与 L83 的机制差异——LoRA 的 B 从零初始化，增量要从零长出来，需要较大步子；全参更新的是已经训练好的预训练权重，任何大步子都会破坏已学到的表征，触发 L83 的灾难性遗忘。收敛速度也不同：全参每步更新全部参数，loss 下降往往更快更稳，但过拟合来得更早，因此 epoch 数要更保守、更要盯 val 曲线（L91）。有效 batch 的处理同样有讲究：小显存下用梯度累积把 batch 撑大能稳定梯度，但累积步数越多、每步的梯度噪声越小，此时可适当调高学习率，两者要联动而非各调各的。把「全参 = LoRA 的放大版」这种直觉丢掉，按「更新对象变了，超参体系就要重来」的原则重设，才不会在切换模式时踩坑。

### 从实测数字到显存预算：给不同卡的建议

把三种模式的量级对照换算成对具体显卡的选择建议，方便落地。一张 8GB 卡（如消费级入门）：全参 0.5B 约 8 到 10GB 装不下，LoRA 约 2 到 3GB 舒适，QLoRA 约 1.5 到 2GB 最稳，应走 PEFT 路线。一张 24GB 卡：0.5B 全参开检查点约 8 到 10GB 可行，是「小模型想挣脱低秩约束」的合理选择；若换 7B，bf16 权重本身约 14GB，全参状态上百 GB 必须多卡，单卡只能 LoRA/QLoRA。一张 48GB 卡：7B 全参状态仍超百 GB 装不下，但 QLoRA 可上到更大规模（L86 的单卡 65B 即 4bit 基座 + 分页优化器的极限）。读出背后的规律：**决定能否全参的是「参数量 × 16 字节」这条硬线，决定 PEFT 余量的是基座存储（bf16 还是 4bit）**。拿到一张新卡、一个新模型，先用解析式算这两条线，就能在动手前判断模式，不必靠试错 OOM。

:::tip

### 小模型全参：先算账、先跑基线，再决定

这一课把 L83 的全参账落成了可跑流程：全参脚本（所有参数可训、lr 小一个量级）→ CUDA 峰值接口实测（reset + max_memory_allocated）→ 三模式显存对照（全参约 8 到 10GB、LoRA 约 2 到 3GB、QLoRA 约 1.5 到 2GB）→ 五关判据。核心认知没变：**全参是表达力上限但带三笔账单，PEFT 是主菜**；小模型上全参「装得下」不等于「该上」，先跑 LoRA 基线、显存够且 PEFT 不够再升级。带着这套数字进 L95 capstone——那里会在小数据集上用 LoRA 走完整流程，并用过拟合曲线做验收。

:::
`,
    null,
    [
      {
        text: '测训练显存峰值应使用哪个接口？',
        options: [
          'torch.cuda.memory_allocated() 单次采样',
          'torch.cuda.reset_peak_memory_stats() 后训练再读 torch.cuda.max_memory_allocated()',
          '只看 nvidia-smi 瞬时值',
          '读模型文件大小',
        ],
        answer: 1,
        explain:
          '先 reset_peak_memory_stats 清零，训练一段后读 max_memory_allocated 才是这段的峰值；瞬时值会漏掉尖峰。',
        concept: 'full-finetune-sft',
      },
      {
        text: '小模型（0.5B 级）全参 SFT 相对 LoRA 的主要优势是？',
        options: [
          '显存一定更低',
          '表达力上限更高、无低秩约束，且单卡往往装得下，部署无需 merge',
          '一定不会过拟合',
          '训练一定更快',
        ],
        answer: 1,
        explain:
          '全参更新所有权重、表达力最强；小模型单卡能装下 16B/参数的状态时，就没有低秩约束，部署就是原模型。',
        concept: 'full-finetune-sft',
      },
      {
        text: '全参训练显存约 16 字节/参数，其中不包括？',
        options: ['fp16 权重 2B', 'fp16 梯度 2B', 'fp32 主权重与 Adam 的 m、v 共 12B', '模型文件的磁盘占用'],
        answer: 3,
        explain:
          '16B/参数是 GPU 训练状态（权重/梯度/主权重/m/v），磁盘文件大小是另一回事，激活与检查点还要另算。',
        concept: 'full-finetune-sft',
      },
      {
        text: '判断「全参是否值得」最合理的顺序是？',
        options: [
          '任何任务都先全参',
          '先算显存能否装下、先跑 LoRA 基线、显存够且 PEFT 不够再上全参',
          '只看模型参数量',
          '只看数据量',
        ],
        answer: 1,
        explain: 'L83 判据：先过显存关、再跑 PEFT 基线，只有显存够、数据够、评测证明 PEFT 不足时全参才值得。',
        concept: 'full-finetune-sft',
      },
    ],
    [
      ['全参 SFT', '监督式微调中更新模型全部权重，表达力最强、显存成本最高'],
      ['显存峰值', '训练期间 GPU 显存占用的最大值，用 reset_peak + max_memory_allocated 测'],
      ['16 字节/参数', 'AMP+AdamW 训练状态：权重2+梯度2+主权重4+m4+v4'],
      ['梯度检查点', '用重算换显存，把激活占用压下来，训练变慢但能装下'],
      ['LoRA 基线', '先跑 LoRA 作为强基线，显存够且它不够时才升级全参'],
    ],
    [
      '用 nvidia-smi 单次采样当峰值——它刷新慢、会漏掉瞬时尖峰，应用 CUDA 峰值接口。',
      '忘记 reset_peak_memory_stats——读到的是进程历史峰值，不是本次训练的。',
      '把磁盘模型文件大小当训练显存——训练状态是推理权重的约 8 倍。',
      '小模型就无脑全参——先跑 LoRA 基线，很多任务 LoRA 已足够（L83/L88）。',
      '忽略激活与梯度检查点——16B/参数只是训练状态，seq 长时激活可能反超。',
    ],
  ),
  'practice',
)
