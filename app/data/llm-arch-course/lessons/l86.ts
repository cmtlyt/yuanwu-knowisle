import { L, withKind } from '../../course-builders.ts'

export const L86 = withKind(
  L(
    'L86',
    38,
    'QLoRA：4-bit NF4 基座 + 双重量化',
    3,
    ['L85'],
    ['qlora'],
    [
      '讲清 4-bit NF4 量化基座',
      '解释双重量化与分页优化器',
      '说明 bf16 LoRA 适配',
      '核算单 48GB GPU 微调 65B 的机制',
    ],
    `### QLoRA 要解决的问题：把基座搬进 4bit

L85 的 LoRA 已经把「可训参数」压到极小，但**冻结的基座权重本身仍要占显存**：7B 基座用 bf16 存约 14GB，65B 约 130GB。对想在一张消费级或单张 48GB 卡上微调大模型的人，这 130GB 才是真正的拦路虎——可训参数再少，基座搬不进显存也无从训起。QLoRA 的答案是：**把冻结基座量化到 4bit**，再叠加 bf16 的 LoRA 适配器。4bit 把权重的存储砍到 fp16 的 1/4，65B 基座从约 130GB 降到约 32.5GB，这才让单卡微调大模型成为可能。

QLoRA 不是简单地「把权重转成 int4」。它是一套组合拳：为权重量身定做的 **NF4** 数据类型、把量化常数也压掉的**双重量化**、保持更新精度的 **bf16 LoRA**、以及兜底显存峰值的**分页优化器**。这一课逐项拆开，最后把 48GB 装 65B 的账算完整。所有数字来自 S-QLoRA（A 级），可写死。

### NF4：为正态分布量身定做的 4bit 格式

4bit 只能表示 16 个值。如何选这 16 个值，决定了量化误差。**INT4** 把区间等宽划分，适合均匀分布；但神经网络权重经过训练后近似**标准正态分布**——大量值挤在 0 附近，少数拖到两端。等宽划分会浪费表示在稀疏的尾部、却在密集的中心分辨不足。

**NF4（4-bit Normal Float）**的做法是按正态分布的**分位数**来定这 16 个代表值：把标准正态pdf 按概率质量均分成 16 段，每段取条件均值作为该档的表示值。这样每一档承载相同的概率质量，中心密集处档位密、尾部稀疏处档位疏，对正态权重的量化误差最小。实现上先归一化到标准正态、量化、再反归一化回原尺度（乘 block 的 scale）。

\`\`\`python
import numpy as np
from scipy.stats import norm

# NF4 的 16 个代表值：标准正态分位数的条件均值（负值 8 个，正值对称）
probs = np.linspace(0, 1, 17)
levels = np.array([(norm.ppf(probs[i]) + norm.ppf(probs[i+1])) / 2
                   for i in range(16)])
levels = levels / np.abs(levels).max()   # 归一到 [-1, 1]，值域示意
print("NF4 16 档（负半）:", np.round(levels[:8], 3))
assert levels[0] < levels[-1] and np.all(np.diff(levels) > 0), "档位必须单调递增"
# 对比：INT4 在 [-1,1] 等宽 16 档，中心分辨率低
int4 = np.linspace(-1, 1, 16)
center_gap_nf4 = levels[9] - levels[8]
center_gap_int4 = int4[9] - int4[8]
print(f"中心附近档距：NF4 {center_gap_nf4:.4f} vs INT4 {center_gap_int4:.4f}")
assert center_gap_nf4 < center_gap_int4, "NF4 在中心应更密（正态权重集中区）"
\`\`\`

### 双重量化：连量化常数也不放过

分块量化（blockwise quantization）把权重切成小块（如 64 个一组），每块一个 fp16 的 scale。块越小，量化越精细，但 scale 的数量越多。对 65B 权重，若每 64 个权重一个 fp16 scale，光 scale 就要 65e9/64×2 字节 ≈ 2GB——不是小数。

**双重量化**把第一重量化产生的 scale 本身再量化一次（如压到 8bit）。因为 scale 之间变化平缓、冗余高，二次量化带来的精度损失极小，却把这部分开销砍掉约一半，QLoRA 论文给出的量级是约每参数再省 0.4 字节。对 65B 就是约 26GB 的差距——这笔钱直接决定能不能塞进 48GB。

:::deep

### 为什么分块 + 双重量化缺一不可

分块量化解决「一个全局 scale 覆盖整层、尾部权重误差大」的问题：块越小，scale 越贴合局部分布，量化越准。但块越小、scale 越多，scale 的存储反过来变瓶颈。双重量化正是为化解这个矛盾：它让你可以用足够小的块（精度高）而不必担心 scale 存储爆炸（二次压缩 scale）。两者配合才同时拿到「小块的精度」与「低开销的 scale」。NF4 管「每个权重怎么表示」，分块管「scale 的粒度」，双重量化管「scale 本身多贵」——三层各自解决一个独立瓶颈，这是 QLoRA 设计的精巧之处。

:::

### bf16 LoRA 适配：低精度基座 + 高精度更新

QLoRA 有一条铁律：**只有冻结基座是 4bit，LoRA 适配器必须是 bf16**。原因在 L85 讲过——LoRA 的 A、B 从零开始学，梯度信号微弱，若用 4bit 表示更新，量化噪声会淹没梯度，训练直接失效。保持 bf16 让可训参数与其梯度、优化器状态都在高精度域，收敛特性与普通 LoRA 一致。

前向时的精度流是：4bit 权重先**反量化到 bf16**，再做矩阵乘；LoRA 的 BA 增量也在 bf16 里相加。注意 QLoRA 省的是**存储**，不是计算时精度——计算发生在 bf16，所以质量接近全精度 LoRA。这正是它「省显存但不怎么掉点」的原因：把大而不动的基座压到 4bit 存储，把小而关键的更新留在 bf16。

\`\`\`python
# 4bit 存储的显存收益 + 双重量化的 scale 开销（bytes/param）
def qlora_weight_bytes(n_params, group_size=64, double_quant=True):
    w = 0.5                              # 4bit = 0.5 字节/权重
    scale_fp16 = 2 / group_size          # 每 group 一个 fp16 scale，摊到每权重
    if double_quant:
        scale_fp16 = 1 / group_size + 2 / (group_size * 256)  # scale 压到 8bit，外加二级 fp16 scale
    return (w + scale_fp16) * n_params / 1e9

N65 = 65e9
no_dq = (0.5 + 2/64) * N65 / 1e9
with_dq = qlora_weight_bytes(N65)
print(f"65B 4bit 基座：不双重量化 ≈ {no_dq:.1f}GB，双重量化后 ≈ {with_dq:.1f}GB")
assert with_dq < no_dq, "双重量化应进一步降低每参数存储"
print(f"双重量化额外省约 {no_dq-with_dq:.1f}GB —— 这是塞进 48GB 的关键余量")
\`\`\`

### 分页优化器：兜住偶发显存峰值

即便把基座压到 4bit、LoRA 留在 bf16，训练中仍会出现**偶发的显存峰值**：某个 batch 的梯度、优化器状态更新、激活临时张量同时到位，瞬时占用远超稳态。QLoRA 引入**分页优化器（paged optimizer）**，利用 CUDA 的统一内存（unified memory）把优化器状态在显存吃紧时自动换出到 CPU 内存、需要时换回。它像操作系统里的内存分页：用便宜的大容量内存兜住峰值，避免为了几秒的尖峰而按峰值配备显存。这样 48GB 卡只需装下稳态那部分，峰值由内存吸收。

分页优化器不改变数学，只改变「何时把优化器状态放哪」。代价是换出换入有 PCIe 传输开销，所以要用在「偶发峰值」而非「常态缺失」——若稳态就装不下，分页只会让训练极慢而非跑通。

### 核算单 48GB GPU 微调 65B

把整笔账合起来（S-QLoRA，A 级）：

\`\`\`python
N65, group = 65e9, 64
base4 = qlora_weight_bytes(N65, group, double_quant=True)  # 4bit 基座 + 双重量化 scale
lora_trainable = 0.002 * N65                                # LoRA 可训参数（示意占比）
lora_state = lora_trainable * (2 + 2 + 4 + 4 + 4) / 1e9     # bf16 LoRA 的训练状态，按 16B/参数
activations = 6.0                                           # 激活/梯度缓冲（示意，含梯度检查点）
budget = 48.0
total = base4 + lora_state + activations
print(f"4bit 基座 ≈ {base4:.1f}GB + LoRA 状态 ≈ {lora_state:.2f}GB + 激活 ≈ {activations:.1f}GB")
print(f"稳态合计 ≈ {total:.1f}GB，48GB 预算余量 ≈ {budget-total:.1f}GB（峰值由分页优化器兜）")
assert total < budget, "稳态必须装进 48GB，峰值才交给分页优化器"
print("结论：4bit 基座是主因（130GB→约32GB），双重量化与分页优化器补足余量")
\`\`\`

三个贡献因子清晰：① **4bit 基座**把最大的一块从约 130GB 砍到约 32GB，是决定性的一步；② **双重量化**再省约十几个 GB 的 scale 开销；③ **分页优化器**让稳态按 48GB 配、峰值由内存吸收。bf16 LoRA 保证这份压缩不怎么掉点。这套组合就是「单卡 48GB 微调 65B」的完整机制，不是某一个技巧单打独斗。

:::tip

### QLoRA = 4bit 基座 + bf16 LoRA + 三层省显存

一句话锁定：QLoRA 把冻结基座压成 4bit（NF4 按正态分位数、分块 + 双重量化省 scale），LoRA 适配器保持 bf16 训练以保精度，分页优化器兜住偶发峰值。它省的是**存储**（基座 130GB→约 32GB），计算仍回到 bf16，所以质量接近全精度 LoRA。带着这套机制读 L88 的四法选型（QLoRA 是显存最省的一档）、L89 的端到端实现（bitsandbytes 4bit 配置）、L91 的小数据结论（S-QLoRA 的 9k 胜 450k 就出自这套设置）。

:::
`,
    null,
    [
      {
        text: 'QLoRA 里 NF4 指的是？',
        options: [
          '一种 4bit 浮点格式，指数位更多',
          '针对正态分布权重、按分位数均匀划分的 4bit 数据类型',
          '一种 4bit 的注意力',
          '把 LoRA 秩降到 4',
        ],
        answer: 1,
        explain:
          'NF4 用 16 个可表示值覆盖标准正态的分位数区间，使等概率质量的正态权重量化误差最小，是 QLoRA 的核心数据类型。',
        concept: 'qlora',
      },
      {
        text: '双重量化（double quantization）量化的是？',
        options: [
          '权重两次',
          '第一次量化产生的量化常数（scale/zero-point）再被量化一次',
          '梯度两次',
          'LoRA 的 A 和 B',
        ],
        answer: 1,
        explain:
          '第一重量化把权重压到 4bit，但每个 block 的量化常数仍是 fp16 存储；双重量化把这些常数再压到 8bit，省下约每参数 0.4 字节。',
        concept: 'qlora',
      },
      {
        text: 'QLoRA 中 LoRA 适配器通常用什么精度训练？',
        options: ['4bit', 'bf16/fp16', 'int8', 'fp64'],
        answer: 1,
        explain:
          '基座冻结为 4bit，但 LoRA 的 A、B 用 bf16 训练，梯度与优化器状态保持高精度，避免低精度更新破坏收敛。',
        concept: 'qlora',
      },
      {
        text: '单张 48GB GPU 能微调 65B 模型，最关键的机制组合是？',
        options: [
          '只用全参微调',
          '4bit 基座（约 4.1B 字节权重）+ 少量 bf16 LoRA + 分页优化器兜底显存峰值',
          '把模型剪枝到 7B',
          '只训最后一层且用 fp32',
        ],
        answer: 1,
        explain:
          '65B×0.5B≈32.5GB 的 4bit 基座 + LoRA 参数/激活/梯度 + 分页优化器把偶发峰值换出到内存，才压进 48GB。',
        concept: 'qlora',
      },
    ],
    [
      ['QLoRA', '把冻结基座量化到 4bit 再叠加 bf16 LoRA 的微调方案，大幅降低显存'],
      ['NF4', '4bit Normal Float，按标准正态分位数设计的可表示值，适配正态权重分布'],
      ['双重量化', '对第一次量化的量化常数再做一次量化，进一步压缩每参数附加字节'],
      ['分页优化器', '用统一内存把偶发的优化器状态峰值换出到 CPU 内存，避免 OOM'],
      ['计算精度', '基座存 4bit 但计算前反量化到 bf16，LoRA 全程 bf16 训练'],
    ],
    [
      '以为 QLoRA 把 LoRA 也量化成 4bit——实际只有冻结基座是 4bit，适配器保持 bf16。',
      '用普通 INT4 而非 NF4——INT4 对均匀假设最优，权重近似正态时 NF4 误差更小。',
      '忽略量化常数开销——不算双重量化，每 block 的 fp16 scale 会累积成可观的显存。',
      '以为 4bit 基座直接参与矩阵乘——计算前要反量化到 bf16，性能与精度来自这套组合。',
      '忽略分页优化器的意义——没有它，训练中的偶发显存峰值仍可能让 48GB 卡 OOM。',
    ],
  ),
  'framework',
)
