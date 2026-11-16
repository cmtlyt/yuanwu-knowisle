import { L, withKind } from '../../course-builders.ts'

export const L80 = withKind(
  L(
    'L80',
    36,
    'TP/PP/ZeRO 对照 + 2 卡 ZeRO 冒烟',
    4,
    ['L79'],
    ['dist-parallel'],
    ['对照 TP/PP/ZeRO 的切分维度', '跑通 torchrun 2 卡 ZeRO', '说明何时用哪种并行', '对照 125M→700M 扩展'],
    `### 为什么要并行：125M 到 700M 的显存墙

L78 在单卡上跑通了 125M 冒烟，L77 的显存校验给出过一个关键量级：模型状态的基线显存约 12N 字节——权重 2N（BF16 每参数 2 字节）、梯度 2N、AdamW 优化器状态 8N（动量与方差各 4N）。125M 约 1.5GB，单卡轻松；700M 约 8.4GB，加上激活与临时缓冲，24GB 卡就相当紧张。再往上到 7B、70B，单卡根本放不下。这就是**显存墙**：算力够但模型状态塞不进一张卡。

并行技术的目的就是突破这堵墙，把模型或状态切到多卡。本课来源挂 S-DSV3（A 级，DeepSeek-V3 的 3D 并行实践）——三种切法 TP/PP/ZeRO 正好对应「层内、层间、状态」三个正交维度。这一课对照它们的切分维度与适用场景，并用 torchrun 跑一个 2 卡 ZeRO 冒烟。

### 三种切法对照：TP 切层内，PP 切层间，ZeRO 切状态

理解并行的关键是记住「切什么」：

- **数据并行（DP）**：每卡持有一份完整模型，把 batch 切成多份分给各卡；每步反向后用 all-reduce 把梯度平均。最简单，但每卡都存完整模型状态——显存没省，靠「堆卡提吞吐」。
- **张量并行（TP）**：把单层里的权重矩阵按行或列切到多卡（如注意力的 QKV 投影、FFN 的上投影下投影）。切的是**层内张量**，需要层内多卡频繁通信（all-reduce），通常限制在单机内（NVLink 带宽高）。
- **流水线并行（PP）**：把模型的层按顺序分段，不同段放不同卡（如 24 层切成 4 段、每段 6 层一段卡）。切的是**层间**，通信只在相邻段之间传激活，但会有「气泡」（bubble）——后续段等前序段的空闲时间。
- **ZeRO（零冗余优化器）**：DP 的问题是每卡冗余存同样的优化器状态、梯度、参数。ZeRO 把这些**状态分片**到各卡：stage1 切优化器状态、stage2 再切梯度、stage3 再切参数本身。用时再 all-gather 拼回来。

三者正交：一个大模型可以同时用 TP（机内切层）+ PP（机间切层）+ ZeRO（切状态）+ DP（切数据），这就是 DeepSeek-V3 所谓「3D 并行」的思路。下面用可跑代码把不同规模模型的显存账与「该不该切」算清楚。

\`\`\`python
def state_mem_gb(N, stage=0, world=2):
    """模型状态显存：stage0=不切, 1切优化器, 2再切梯度, 3再切参数。"""
    weights = 2*N/1e9        # BF16 权重
    grads = 2*N/1e9
    optim = 8*N/1e9          # AdamW 动量+方差
    if stage == 0:
        return weights + grads + optim
    if stage == 1:
        return weights + grads + optim/world
    if stage == 2:
        return weights + (grads+optim)/world
    return (weights+grads+optim)/world   # stage3 全分片

for N, name in [(125e6, "125M"), (700e6, "700M"), (7e9, "7B")]:
    print(f"{name}: 不切 {state_mem_gb(N,0):5.1f}GB  "
          f"ZeRO-2 {state_mem_gb(N,2,2):5.1f}GB  "
          f"ZeRO-3 {state_mem_gb(N,3,2):5.1f}GB (2卡)")
# 700M 不切约 8.4GB，2卡 ZeRO-3 约 4.2GB -> 能塞进中等显存卡
assert state_mem_gb(700e6,0) > state_mem_gb(700e6,3,2)
print("显存分片账自检通过")
\`\`\`

这张账把「何时用哪种」讲清：125M 不切也轻松，没必要上 ZeRO；700M 不切 8.4GB、2 卡 ZeRO-3 降到约 4.2GB，开始有意义；7B 不切 84GB，必须切且往往要 TP+PP+ZeRO 组合。判据是**先看单卡放不放得下，放不下再按 TP（层内）、PP（层间）、ZeRO（状态）的顺序选**。

:::deep

### ZeRO 三个阶段：省显存与通信量的权衡

ZeRO 的「零冗余」指消除 DP 里每卡重复存的状态。三个阶段的取舍：

- **stage1（切优化器状态）**：省显存最多的一刀（优化器占 8N，是最大头），通信增加很少，性价比最高，是默认起点。
- **stage2（再切梯度）**：梯度 2N 也分片，省得更多，通信略增。
- **stage3（再切参数）**：参数本身也分片，省到极致，但每次前向/反向都要 all-gather 拼参数，通信量最大，小模型/低带宽下反而更慢。

经验选择：模型单卡放得下就别用 ZeRO；放不下先用 stage1/2；大到必须分片参数才上 stage3。DeepSpeed 的 \`zero_stage\` 参数就是这个开关。下面对照 stage 与通信的定性账。

:::

\`\`\`python
# Zero 阶段 vs 显存节省 vs 通信量（定性打分，示意）
stages = {
    "ZeRO-1": (1, "低"),    # (省显存档位, 通信量)
    "ZeRO-2": (2, "中"),
    "ZeRO-3": (3, "高"),
}
for name, (save, comm) in stages.items():
    print(f"{name}: 省显存档位={save}/3, 通信量={comm}")
# 判据：省显存 ∝ stage，通信量也 ∝ stage -> 选「刚好放得下」的最低 stage
best_stage = min(s for s in (1,2,3)
                 if state_mem_gb(700e6, s, 2) < 8.0)   # 目标：单卡 <8GB
print(f"700M 2卡、目标单卡<8GB 的最低 stage = ZeRO-{best_stage}")
assert best_stage in (1,2,3)
\`\`\`

### 2 卡 ZeRO 冒烟：torchrun 启动脚本

理论讲完，跑一个真实的 2 卡 ZeRO 冒烟。用 \`torchrun --nproc_per_node=2\` 拉起两个进程，每进程用 \`torch.distributed\` 初始化进程组，DeepSpeed 用 ZeRO-2 配置。下面是一个最小可跑训练脚本 \`train_zero2.py\` 与启动命令。

\`\`\`python
# train_zero2.py —— 2 卡 ZeRO-2 冒烟训练（示意结构，可运行逻辑）
import os, torch, torch.distributed as dist
import deepspeed
from torch.utils.data import Dataset, DataLoader

# torchrun 注入的环境变量：RANK / WORLD_SIZE / LOCAL_RANK
local_rank = int(os.environ.get("LOCAL_RANK", 0))
dist.init_process_group("nccl")
torch.cuda.set_device(local_rank)

class Dummy(Dataset):
    def __len__(self): return 512
    def __getitem__(self, i):
        x = torch.randint(0, 1000, (64,))
        return {"input_ids": x, "labels": x.clone()}

model = torch.nn.Transformer(d_model=256, nhead=4,
                             num_encoder_layers=0,
                             num_decoder_layers=2)  # 演示用 decoder 栈
model = torch.nn.Sequential(torch.nn.Embedding(1000, 256), model,
                            torch.nn.Linear(256, 1000))

# DeepSpeed ZeRO-2 配置写成 ds_config.json（见下）
model_engine, optimizer, _, _ = deepspeed.initialize(
    model=model, model_parameters=model.parameters(),
    config="ds_config.json")

loader = DataLoader(Dummy(), batch_size=4,
                    sampler=torch.utils.data.DistributedSampler(
                        Dummy(), num_replicas=dist.get_world_size(),
                        rank=dist.get_rank()))
step = 0
for batch in loader:
    batch = {k: v.cuda(local_rank) for k, v in batch.items()}
    out = model_engine(batch["input_ids"])
    loss = torch.nn.functional.cross_entropy(
        out.view(-1, 1000), batch["labels"].view(-1))
    model_engine.backward(loss)
    model_engine.step()          # DeepSpeed 内部做梯度同步/参数更新
    step += 1
    if dist.get_rank() == 0 and step % 10 == 0:
        print(f"rank0 step {step}, loss {loss.item():.4f}")
    if step >= 50: break
print(f"rank {dist.get_rank()} 完成 {step} 步")
\`\`\`

配套的 DeepSpeed 配置 \`ds_config.json\` 与启动命令：

\`\`\`json
{
  "train_batch_size": 8,
  "gradient_accumulation_steps": 1,
  "optimizer": {"type": "AdamW", "params": {"lr": 5e-5}},
  "fp16": {"enabled": true},
  "zero_optimization": {
    "stage": 2,
    "allgather_partitions": true,
    "reduce_scatter": true
  }
}
\`\`\`

\`\`\`bash
torchrun --standalone --nproc_per_node=2 train_zero2.py
# 预期：rank0 每 10 步打印 loss，rank0/rank1 各跑 50 步后退出
# 关键：两个进程由 DistributedSampler 喂不同数据，梯度经 DeepSpeed all-reduce 同步
\`\`\`

这段冒烟把三件事钉死：① \`torchrun\` 用 \`--nproc_per_node=2\` 拉起两个进程并注入 \`LOCAL_RANK\`；② \`DistributedSampler\` 保证各进程拿到不同数据（否则重复训练）；③ DeepSpeed 用 \`zero_optimization.stage=2\` 分片优化器与梯度，\`model_engine.step()\` 内部完成同步。运行后两个 rank 的 loss 应同步下降——这是「并行训练正确」的最小证据。

### 何时用哪种：一张决策清单

把选择落成判断顺序。第一，**单卡放得下吗**？放得下（如 125M）就别上并行，DP 或单卡最省事。第二，**放不下但能放进一台多卡机**？优先 ZeRO-1/2（切状态，通信小），或 TP（机内 NVLink 带宽高，适合切层内大矩阵）。第三，**单机也放不下**？上 PP（切层到多机）+ ZeRO-3（切参数），必要时叠 TP。第四，**通信瓶颈在哪**？TP 通信最密集放机内，PP 只传相邻激活可跨机，ZeRO 的 all-gather 随 stage 增加。

一个高频误区是把 ZeRO 当「加速」手段。它主要**省显存**、让更大模型/更大 batch 放得下；因引入通信，单模型速度可能略慢于不切。它的价值是「让训得起来」，不是「训得更快」——想提吞吐靠 DP 堆卡或 TP 并行算。另一个误区是小模型硬开 ZeRO-3：125M 单卡轻松，开 stage3 反而被 all-gather 拖慢，得不偿失。判据永远是「刚好放得下的最低配置」。

### 冒烟阶段要盯的三个通信信号

跑通 2 卡 ZeRO 不等于跑对。有三个信号能帮你判断并行是否真生效：第一，**两卡 loss 同步下降**——若 rank0 降、rank1 卡住或数值完全不同，说明梯度 all-reduce 没生效，多半是进程组没初始化或 sampler 没分发数据。第二，**显存确实降了**——用 \`nvidia-smi\` 看每张卡占用，ZeRO-2 相对不切应有明显下降；若两卡显存和不降反升，可能是配置没加载（\`deepspeed.initialize\` 没吃到 \`ds_config.json\`）。第三，**没有 NCCL 超时/掉卡**——\`torchrun\` 启动后若某 rank 因数据不均卡在集合通信，会触发 NCCL timeout，通常是 \`DistributedSampler\` 的 \`num_replicas\` 与 \`world_size\` 不一致。

把这三个信号写进冒烟检查表：打印 rank 与 world_size、每 10 步同步打印 loss、记录峰值显存。它们比「程序没报错」更能说明并行真在工作。L82 的 700M 多卡 capstone 会把这套检查扩展成正式验收——到那时模型更大、通信更重，这些信号的重要性只增不减。

:::tip

### 一句话收束并行与 ZeRO

三种切法正交：DP 切数据、TP 切层内张量、PP 切层间、ZeRO 切模型状态（stage1 优化器、2 加梯度、3 加参数）。显存账约 12N 字节，125M 单卡轻松、700M 约 8.4GB 需分片、7B 必须组合切。torchrun 按 \`--nproc_per_node\` 拉多进程并注入 rank，DeepSpeed ZeRO 分片状态、通信随 stage 增大；选择判据是「刚好放得下的最低配置」，ZeRO 主要省显存非加速。下一课 L81 转向「训到中途能力怎么涨」——用能力探针论证困惑度下降不等于能力涌现。L82 capstone 再把 700M + 多卡 ZeRO 串成完整交付。

:::
`,
    null,
    [
      {
        text: '数据并行（DP）、张量并行（TP）、流水线并行（PP）、ZeRO 各自主要切分什么？',
        options: [
          '都切数据',
          'DP 切数据、TP 切单层内张量、PP 切层、ZeRO 切优化器/梯度/参数状态',
          'TP 切数据、DP 切层',
          'ZeRO 只切激活',
        ],
        answer: 1,
        explain:
          'DP 把不同数据分给各卡（每卡全模型）；TP 把单层的矩阵乘按行/列切到多卡；PP 把不同层放到不同卡；ZeRO 分片模型状态（优化器/梯度/参数）消除 DP 的冗余。',
        concept: 'dist-parallel',
      },
      {
        text: 'ZeRO 的三个阶段（stage 1/2/3）分别切分什么？',
        options: [
          '都只切数据',
          'stage1 切优化器状态、stage2 再切梯度、stage3 再切模型参数',
          'stage1 切参数、stage3 切优化器',
          '三个阶段完全一样',
        ],
        answer: 1,
        explain:
          'ZeRO-1 分片优化器状态、ZeRO-2 额外分片梯度、ZeRO-3 额外分片模型参数本身；阶段越高省显存越多、通信越多。',
        concept: 'dist-parallel',
      },
      {
        text: '为什么 700M 模型比 125M 更需要多卡 ZeRO？',
        options: [
          '因为 700M 不会过拟合',
          '因为模型状态显存约 ∝ 参数量（12N 字节），700M 单卡放不下或很紧，需分片到多卡',
          '因为 700M 不需要数据',
          '因为 700M 收敛更快',
        ],
        answer: 1,
        explain:
          '基线显存约 12N 字节（权重2N+梯度2N+优化器8N），125M 约 1.5GB 单卡轻松，700M 约 8.4GB 加激活后 24GB 卡紧张，ZeRO 分片后每卡只存一份切片。',
        concept: 'dist-parallel',
      },
      {
        text: 'torchrun 在多卡训练里负责什么？',
        options: [
          '压缩模型',
          '按 --nproc_per_node 启动多个进程、注入 RANK/WORLD_SIZE 等环境变量，建立分布式通信',
          '只做数据清洗',
          '只保存模型',
        ],
        answer: 1,
        explain:
          'torchrun 是分布式启动器：按每卡进程数拉起进程、设置 rank/world_size/master 地址，让各进程用 torch.distributed 初始化进程组、协同训练。',
        concept: 'dist-parallel',
      },
    ],
    [
      ['数据并行 DP', '每卡一份完整模型、切分数据，梯度用 all-reduce 同步'],
      ['张量并行 TP', '把单层权重矩阵按行/列切到多卡，切的是层内张量'],
      ['流水线并行 PP', '把模型按层分段放不同卡，切的是层间'],
      ['ZeRO', '零冗余优化器，把优化器状态/梯度/参数分片到各卡消除 DP 冗余'],
      ['torchrun', 'PyTorch 分布式启动器，拉起多进程并注入 rank/world_size 环境变量'],
    ],
    [
      '把 TP 和 PP 的切分维度搞反——TP 切层内张量、PP 切层间，不是都切数据。',
      '以为 ZeRO 会加速单卡训练——它主要省显存、让更大模型放得下，可能因通信略慢。',
      'torchrun 启动后各进程不设 seed/不分发数据——多进程重复同一批数据，训练失效。',
      'ZeRO-3 通信量大却在小模型上硬开——小模型单卡放得下时开 ZeRO-3 得不偿失。',
    ],
  ),
  'framework',
)
