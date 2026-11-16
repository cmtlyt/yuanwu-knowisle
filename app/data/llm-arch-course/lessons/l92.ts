import { L, withKind } from '../../course-builders.ts'

export const L92 = withKind(
  L(
    'L92',
    41,
    'GaLore：梯度低秩投影省显存',
    3,
    ['L88'],
    ['galore'],
    [
      '讲清 GaLore 把全参梯度投到低秩子空间',
      '解释显存 ~1/4 且不冻基座',
      '对照全参/LoRA',
      '给出小模型显存/收敛对照',
    ],
    `### 第三条路：不冻基座，也能省优化器显存

L88 的四法选型里，LoRA/QLoRA/DoRA 都走「冻结基座 + 少量可训参数」路线，省参数的量级能达到 10⁴ 倍；全参微调不冻基座，但要付约 16 字节/参数的优化器状态（L83）。有没有中间路线——**既保留全参更新的表达力，又不付全量的优化器显存**？GaLore（Gradient Low-Rank Projection，arXiv:2403.03507，S-GaLore，A 级）给出的答案是：有。它不冻结任何权重，让全参都更新，但把**梯度**投影到一个低秩子空间，只在那个子空间里维护 Adam 的优化器状态。梯度是低秩的（这与 L85 低秩假设一脉相承），于是 m、v 等状态从 d 维降到 r 维，训练显存可降到全参的约 1/4。

这一课讲清 GaLore 的机制、它「约 1/4 且不冻基座」的来源、与全参/LoRA 的逐项对照，并给出小模型上的显存/收敛对照。它是 L88 选型卡里「不冻基座、显存中等、单任务」那一格的答案。

### 机制：把全参梯度投到低秩子空间

对一个 d_out×d_in 的权重矩阵 W，普通全参更新的流程是：算满秩梯度 G ∈ R^{d_out×d_in}，然后把 G 交给 Adam 更新整矩阵，优化器状态 m、v 与 W 同形状，各占 d_out×d_in。

GaLore 的流程多了一步投影：

1. 对梯度 G 做 SVD，取前 r 个奇异向量得到投影矩阵 P（r 远小于矩阵边长）。
2. 把梯度压到低秩空间：R = Pᵀ G（维度 r×d_in 或 d_out×r，取决于按行/列投影）。
3. **只在低秩空间维护优化器状态**：m_R、v_R 与 R 同形状，远小于满秩。
4. 用 Adam 在低秩空间算出更新 ΔR，再投影回全空间：ΔW = P ΔR，加到 W 上。

关键在**第 3 步**：省显存的是「优化器状态只在低秩空间」。全参的 m、v 是 d×d，GaLore 的是 r×d，比值约 r/d。当 d=4096、r=128 时，优化器状态省约 32 倍；论文整体报告训练显存降到约 1/4（因为权重、激活等其它部分不随投影缩小）。

\`\`\`python
import numpy as np
rng = np.random.default_rng(0)
d_out, d_in, r = 512, 512, 64
W = rng.normal(size=(d_out, d_in))
G = rng.normal(size=(d_out, d_in))                # 满秩梯度

# SVD 取前 r 个右奇异向量作为投影 P（d_in x r）
_, _, Vt = np.linalg.svd(G, full_matrices=False)
P = Vt[:r].T                                       # d_in x r
R = G @ P                                          # 低秩梯度：d_out x r
assert R.shape == (d_out, r)

# 优化器状态对比：全参 m,v 与 W 同形；GaLore 与 R 同形
state_full = 2 * W.size                            # m + v，元素数
state_galore = 2 * R.size + P.size                 # 低秩 m,v + 投影矩阵
print(f"全参优化器状态元素 ≈ {state_full:,}")
print(f"GaLore 优化器状态元素 ≈ {state_galore:,}  省 {state_full/state_galore:.1f}×")
assert state_galore < state_full / 4, "低秩投影应让优化器状态显著缩小"
# 梯度能量保留：r 个奇异值占比
s = np.linalg.svd(G, compute_uv=False)
print(f"前 r={r} 个奇异值能量占比 ≈ {(s[:r]**2).sum()/(s**2).sum():.3f}")
\`\`\`

### 为什么不冻基座：与 LoRA 的表达力分野

LoRA 冻结 W₀，表达力上限由低秩增量 BA 决定（L85 的边界）。GaLore 让**每个权重元素都能更新**——投影只压缩了「梯度的自由度」，没有冻结任何权重。这意味着它能做 LoRA 做不到的事：逐层、逐元素地重排特征，逼近全参的表达模式。论文的实验显示 GaLore 在预训练与微调上都能接近全参质量，而显存远低于全参。

代价是：GaLore 不产生一个「可切换的小适配器」。因为所有权重都变了，每个任务要保存一份完整模型——这正是 L88 选型卡里 GaLore 在多任务维度得分低的原因，也是它「备选定位」的来源。

:::deep

### 投影矩阵 P 为什么要周期性重算

梯度所在的低秩子空间不是固定的：训练前期与后期的梯度方向会漂移。若 P 永远不变，后期梯度被投到过时的子空间，有用的更新方向被丢掉；若每步都做 SVD 重算 P，开销又大到抵消省显存的收益。GaLore 的折中是**每隔若干步（如 200 步）重算一次 P**：子空间在几百步内变化不大，重算摊薄到可接受。这里还用到一个技巧——切换投影时让新优化的动量 m 重置为零，避免旧子空间的动量污染新子空间。实现上还要处理「按行投影 vs 按列投影」的选择（取决于权重矩阵哪个维度小），以及哪些层参与投影（通常跳过高维的 lm_head 等）。这些细节说明 GaLore 不是「一个 SVD 就完事」，而是一套需要调参的工程方案。

:::

### 对照全参与 LoRA：三维净账

把 GaLore 与全参、LoRA 放一起，三个维度的净账很清楚：

- **显存**：全参约 16 字节/参数最贵；LoRA 只训 BA、省 10⁴ 量级最省；GaLore 省的是优化器状态、约到全参 1/4，居中。注意「省 1/4」与「省 10⁴ 倍」不是一回事——GaLore 省得少但保留全参更新。
- **表达力/质量**：全参是上限；GaLore 因全参更新接近上限；LoRA 受低秩约束，复杂任务可能略逊。
- **多任务与部署**：LoRA 每任务一份小 BA、切换轻、可 merge 零延迟；GaLore 与全参都是每任务一份全权重，切换与存储成本高；GaLore 推理就是原模型，没有 merge 概念。

结论：GaLore 不是要取代 LoRA，而是填补「显存不够全参、但又不想冻结基座」的空档——典型是小模型、单任务、显存中等的场景（L88 把它列为备选）。

### 小模型显存/收敛对照（可跑）

用一个可跑 Toy 估算三种方案在小模型上的显存量级，并用一个简化的收敛曲线示意「GaLore 接近全参、优于小秩 LoRA」。数值为量级示意，用来演示机制，实际以论文与实测为准。

\`\`\`python
def train_mem_gb(n_params, bits_state, extra=1.0):
    """权重 bf16(2B) + 优化器状态 bits_state + 其它激活 extra(GB)。"""
    return n_params * 2 / 1e9 + n_params * bits_state / 1e9 + extra

N = 0.5e9                      # 0.5B 小模型
mem_full = train_mem_gb(N, bits_state=8)                    # 全参：m,v fp32 = 8B/参数
mem_galore = train_mem_gb(N, bits_state=8/8)                # GaLore：优化器约省 8×（示意）
mem_lora = 1.0 + train_mem_gb(0.002*N, bits_state=8)        # LoRA：冻结权重只存 1GB(示意)+小状态
print(f"0.5B 训练显存量级：全参≈{mem_full:.1f}GB  GaLore≈{mem_galore:.1f}GB  LoRA≈{mem_lora:.1f}GB")
assert mem_galore < mem_full and mem_lora < mem_galore

# 收敛示意：损失下降，GaLore 接近全参、优于小秩 LoRA
steps = range(5)
loss_full  = [2.0, 1.2, 0.8, 0.6, 0.5]
loss_galore= [2.0, 1.23, 0.84, 0.63, 0.53]
loss_lora  = [2.0, 1.3, 0.95, 0.78, 0.68]
print("末期 loss：全参 0.50 / GaLore 0.53 / LoRA(r小) 0.68")
assert loss_galore[-1] - loss_full[-1] < loss_lora[-1] - loss_full[-1]
print("结论：GaLore 用居中显存换来接近全参的收敛，适合不冻基座的场景")
\`\`\`

:::tip

### GaLore = 全参更新 + 低秩梯度投影

一句话锁定：GaLore 不冻结基座，让全参更新，但把梯度投到低秩子空间、只在子空间里维护 Adam 状态，训练显存约降到全参的 1/4；投影矩阵周期性用梯度 SVD 重算以跟上子空间漂移。它省得比 LoRA 少（约 1/4 对 10⁴ 倍）但保留全参表达力，且不产生可切换适配器。定位是「不冻基座、显存中等、单任务」的备选，由 L88 选型卡收口。带着这份对照读 L88 的备选定位与 L93 的小模型显存实测，就知道 GaLore 在整张版图里的位置。

:::
`,
    null,
    [
      {
        text: 'GaLore 省显存的核心机制是？',
        options: [
          '冻结基座只训 LoRA',
          '把全参梯度投影到低秩子空间，只在低秩空间里维护优化器状态',
          '把权重量化到 4bit',
          '剪枝掉一半参数',
        ],
        answer: 1,
        explain:
          'GaLore 保留全参、更新全参，但梯度被投影到秩 r 的子空间，优化器状态只需存低秩版本，显存约省到全参的 1/4。',
        concept: 'galore',
      },
      {
        text: 'GaLore 与 LoRA 的根本区别是？',
        options: [
          'GaLore 量化权重、LoRA 不量化',
          'GaLore 不冻基座、更新全参；LoRA 冻结基座只训旁路低秩增量',
          '两者都冻结基座',
          'LoRA 不省显存',
        ],
        answer: 1,
        explain:
          'LoRA 冻结 W₀ 只训 BA；GaLore 让全参都更新，只是把梯度投到低秩子空间省优化器显存，基座不冻结。',
        concept: 'galore',
      },
      {
        text: 'GaLore 论文报告的训练显存降幅量级是？',
        options: ['约省到全参的 1/4（报告可低至约 1/4）', '和全参完全一样', '省 10⁴ 倍', '只省 1%'],
        answer: 0,
        explain:
          'S-GaLore（arXiv:2403.03507，A 级）报告训练显存可降到全参的约 1/4，同时保持全参更新的表达能力。',
        concept: 'galore',
      },
      {
        text: 'GaLore 投影矩阵 P 通常多久更新一次，为什么？',
        options: [
          '每步都重新随机初始化',
          '间隔若干步用 SVD 从梯度重算，因为梯度子空间变化缓慢、频繁重算太贵',
          '永远不更新',
          '每次前向都更新',
        ],
        answer: 1,
        explain:
          '梯度的低秩子空间在训练中缓慢漂移，GaLore 每隔一定步数对梯度做 SVD 更新投影 P，摊薄开销又跟上子空间变化。',
        concept: 'galore',
      },
    ],
    [
      ['GaLore', 'Gradient Low-Rank Projection，把全参梯度投到低秩子空间以省优化器显存，不冻结基座'],
      ['低秩投影 P', '由梯度 SVD 得到的投影矩阵，把 d 维梯度压到 r 维子空间再更新'],
      ['优化器状态', 'Adam 的 m、v 等，GaLore 只需在低秩空间维护，故显存约省 1/4'],
      ['子空间漂移', '梯度所在低秩子空间随训练缓慢变化，需周期性重算投影'],
      ['全参更新', 'GaLore 每个权重都更新，与 LoRA 冻结基座形成对照'],
    ],
    [
      '把 GaLore 当成 LoRA 的一种——GaLore 不冻基座、更新全参，只是梯度低秩投影，机制根本不同。',
      '以为 GaLore 省 10⁴ 倍显存——它省的是优化器状态（约 1/4），量级远小于 LoRA 的「可训参数 10⁴ 倍」。',
      '每步都重算 SVD 投影——开销巨大，应间隔若干步更新一次。',
      '以为 GaLore 推理要.merge——它本就是全参模型，推理就是原模型，没有 merge 概念。',
      '在多任务场景用 GaLore——不冻基座意味着每任务一份全权重，切换成本高，不如 LoRA 系。',
    ],
  ),
  'theory',
)
