import { L, withKind } from '../../course-builders.ts'

export const L23 = withKind(
  L(
    'L23',
    9,
    '线性注意力谱系与 SSM 的边界',
    4,
    ['L19'],
    ['linear-attn'],
    [
      '把「线性注意力」钉在一条谱系上：kernel 近似 → 去 softmax 线性化 → SSM/状态空间',
      '说清线性注意力把 O(n²) 降到 O(n) 靠的是「QK^T 算子律重排」而非丢信息',
      '区分「线性注意力」与「SSM（Mamba）」各自解的是什么问题、边界在哪',
      '对照 M4 预告：为什么纯线性/SSM 在需要长程精确检索时会掉，混合架构为何成为主流',
    ],
    `
### 把注意力「降次」的两个正交思路

M2 前 7 课都在优化**标准注意力**（GQA 省 KV、FlashAttention 省 IO、PagedAttention 省碎片）。本课时跳到另一条路：**换掉注意力本身**。两条正交思路：

- **降次（复杂度）**：标准注意力要算 \`S = QKᵀ\`（n×n 矩阵），显存/算力随 n² 涨。线性化把 \`softmax(QKᵀ)V\` 重排成 \`Q(KᵀV)\`，利用**矩阵乘的算子律**，先算 \`KᵀV\`（一个 d×d 的「隐状态」），再与 Q 相乘——复杂度从 O(n²d) 降到 O(n·d²)，n 很大时 d² 远小于 n·d，**显存不随序列长无界增长**。
- **换机制（用 RNN/SSM 的常数状态替代注意力）**：SSM（如 Mamba）用**固定大小的隐状态**读入序列、逐 token 更新，天然 O(n) 且无 KV cache。这是「把注意力整个换成状态机」。

:::deep

### 谱系：从 kernel 近似到 SSM

沿「怎么把 n² 打下来」这条线排开，每往右一步要么丢更少、要么丢得更有结构：

- **kernel 近似**（Performer 等，2020）：把 softmax 里的 \`exp(qk)\` 用**随机特征/核**近似成 \`(φ(q))ᵀ(φ(k))\`，保留注意力形式但让点积可分解，从而 O(n)。本质是「保留 softmax 注意力、但让它能被重排」。
- **去 softmax 线性化**（Linear Attention / Hedgehog 等，2023–24）：更激进，直接去掉 softmax，用 \`q\` 与 \`k\` 各自过 \`φ\` 后做 \`φ(q)(φ(k)ᵀv)\` 的算子律重排。Hedgehog（Meta，2024）就是这类——它**保留注意力接口、换掉计算核**，可无缝替换 LLaMA 里的 softmax 注意力做消融。
- **SSM / Mamba**（2024）：不再「换核」而是「换机制」，用状态空间模型（连续动力学离散化 + 选择性扫描）的**常数隐状态**读序列，彻底没有 QKV 的 n×n。

三步的共同动机是同一个：标准注意力在**超长序列**上的 KV cache 与 O(n²) 算力是墙。区别在于丢的是什么——kernel 近似丢「softmax 的非线性」、线性化丢「softmax」、SSM 丢「按位置自由检索」的能力（换来常数状态）。

:::

### 与 SSM 的边界：谁解决什么

这是最容易混的点，钉清楚：

- **线性注意力**解决的是「**保留注意力、但降次降显存**」——它还是 QKV 三件套，只是把 \`QKᵀV\` 重排成 \`Q(KᵀV)\`，输出仍是「每个 token 对所有历史 token 的加权」。
- **SSM/Mamba** 解决的是「**连 QKV 都不要、用常数状态替代**」——它没有「按位置检索某段」的能力，靠隐状态**顺序压缩**整个历史，O(n) 且**推理时零 KV cache**。

边界判据：要「任意位置精确检索（needle-in-haystack）」→ 标准/线性注意力更强；要「超长序列 + 显存恒定」→ SSM 更强。两者**不是替代关系而是互补**，所以 M4 的混合架构（部分层注意力 + 部分层 SSM，如 Jamba / Griffin / Zamba）是当前的工程主流：**用注意力保住精确检索、用 SSM 层压低长序列成本**。

:::deep

### 可跑的对照：线性注意力 vs 标准注意力

把「算子律重排」写成可跑的代码，验收三件事：① 线性注意力输出与标准注意力**数值近似**（同组 q/k/v）；② 线性注意力的隐状态形状是 **d×d 常数**（不随序列长 n 涨）；③ 显存随 n 的关系是**线性而非平方**。

\`\`\`python
import torch
import torch.nn.functional as F

def std_attn(q, k, v):
    """标准因果注意力：物化 S=QKᵀ（n×n），显存 O(n²)。"""
    s = torch.softmax(q @ k.transpose(-1, -2) / (q.size(-1) ** 0.5), dim=-1)
    return s @ v

def linear_attn(q, k, v, phi=lambda t: t.exp()):
    """线性注意力：先算 KV 隐状态 S=φ(k)ᵀφ(v)（d×d 常数），再与 φ(q) 相乘。
    关键：隐状态 shape 是 [d, d]，与序列长 n 无关。"""
    q, k, v = phi(q), phi(k), phi(v)
    state = k.transpose(-1, -2) @ v          # [B, d, d] 常数隐状态（不随 n 涨）
    out = q @ state                            # [B, n, d]，每个位置与全部历史做隐状态检索
    return out / out.sum(dim=-2, keepdim=True).clamp(min=1e-6)

torch.manual_seed(0)
B, N, D = 1, 256, 64
q = torch.randn(B, N, D).exp()
k = torch.randn(B, N, D)
v = torch.randn(B, N, D)
o_std, o_lin = std_attn(q, k, v), linear_attn(q, k, v)
sim = F.cosine_similarity(o_std.flatten(), o_lin.flatten(), dim=0).item()
print(f"线性 vs 标准注意力余弦相似 ≈ {sim:.3f}（短序列近似，长序列+检索任务会拉开）")
# 验收：隐状态 d×d 常数
kv_state = k.exp().transpose(-1, -2) @ v
assert kv_state.shape == (B, D, D), "线性注意力隐状态必须是 [d, d]，与 n 无关"
# 显存对照：n=256 vs n=1024，隐状态不变、只有 q 那一侧随 n 线性涨
for n in (256, 1024):
    print(f"n={n}: 隐状态 {D}×{D}（不变），q 侧 {n}×{D}（线性）")
\`\`\`

对照的判读：**短序列**（n 不大、检索距离近）时线性与标准注意力余弦相似度高，几乎无差；**长序列 + 需要跨很远位置精确检索**时拉开——因为线性注意力把所有历史「压缩」进一个 d×d 隐状态，检索粒度的丢失随序列长放大。这正是「纯线性/SSM 在 needle 基准掉、混合架构补少量注意力层」的定量根源：隐状态是**低通压缩**，越远的位置越被抹平。

### Mamba 的选择性扫描：常数隐状态的「有选择」版

SSM/Mamba 比「固定隐状态」更进一步：Mamba 把隐状态更新做成**选择性**（\`B, C, Δ\` 随输入内容动态调），让模型能「选择性记住该记的、遗忘该忘的」，常数隐状态不再是无差别低通。M4 会真正实现这个选择性扫描；本课时只要记住**机制分界**：线性注意力「保留 QKV、重排算子律」、Mamba「常数隐状态、顺序扫描、零 KV cache」，两者互补构成 M4 的混合层设计。

这个「选择性」是关键差异，值得多说一层：普通 RNN/SSM 的隐状态是**无差别累积**（每个 token 按固定系数更新），相当于对所有历史一视同仁地低通——所以「检索某个很久以前、但很重要的位置」会被中间大量无关 token 稀释掉。Mamba 的「选择性」让每个位置的 \`Δ\`（更新步长）随内容调：**重要的位置 \`Δ\` 大、更新猛，无关位置 \`Δ\` 小、几乎不动**，等于在常数隐状态里做了「有重点的记忆」，缓解纯 SSM 的长程检索掉点。但即使这样，**按位置自由检索（needle）仍不如标准/线性注意力的 QKV 直接匹配**——所以混合架构才要「少量注意力层专管精确检索、多数 SSM 层压长序列成本」，各取所长。

把「常数隐状态顺序扫描、零 KV cache」写成可跑的对照，验收 SSM 的「显存不随 n 涨」与「按位置检索弱于注意力」：

\`\`\`python
import torch

def ssm_scan(x, A, B):
    """最简 SSM 隐状态扫描：h_t = exp(A)*h_{t-1} + B_t*x_t（选择性：B_t 随输入变）。
    隐状态是 [N, D] 常数，不随序列长 n 涨。"""
    N, T, D = x.shape
    h = torch.zeros(N, D, device=x.device)
    outs = []
    for t in range(T):
        h = torch.exp(A) * h + B[t] * x[:, t]     # 步长折进 A 的衰减（选择性）
        outs.append(h)
    return torch.stack(outs, dim=1)                # [N, T, D] 输出

torch.manual_seed(0)
N, T, D = 1, 256, 64
x = torch.randn(N, T, D)
A = torch.log(torch.rand(D) + 0.1)
B = torch.rand(N, T)                               # 选择性：每位置一个系数
out = ssm_scan(x, A, B)
assert out.shape == (N, T, D)
# 验收：隐状态 h 是 [N, D] 常数（不随 T 涨）
print(f"SSM 隐状态 {D} 维常数；对照线性注意力隐状态 {D}×{D} 常数——两者都不随 n 涨")
# 但 SSM 是顺序压缩、无按位置检索：needle 基准会弱于标准/线性注意力
\`\`\`

对照的判读：SSM 与线性注意力**都靠「常数隐状态」做到 O(n) + 零/低 KV cache**，区别在隐状态的组织——线性注意力是 \`KᵀV\`（保留 QKV 接口的算子律重排）、SSM 是「选择性 RNN 累积」（按位置顺序读、\`B_t\` 随内容调）。两者推理侧都省 KV，但**长程精确检索都弱于标准注意力**，这正是 M4 混合架构「少量注意力层补检索、多数 SSM 层压成本」的定量依据。

:::

:::tip

### 与 M4 的衔接

本课时把「线性注意力谱系 + SSM 边界」讲透，是 M4（SSM 与混合架构）的地基。M4 会真正**实现 Mamba 的选择性扫描**、做 Mamba 与「注意力 + Mamba」混合的对照实验。记住本课的一句判据：**纯线性/SSM 在需要长程精确检索的基准（needle、多跳 QA）上会掉，混合架构用少量注意力层补回检索、多数 SSM 层压成本**——这就是 M4 的实验设计出发点。

:::
`,
    null,
    [
      {
        text: '线性注意力把 O(n²) 降到 O(n) 靠的是？',
        options: ['丢弃历史 token', '用矩阵乘算子律把 QKᵀV 重排成 Q(KᵀV)', '减少层数', '降低 d_model'],
        answer: 1,
        explain: '先算 KᵀV 得一个 d×d 隐状态、再与 Q 相乘，绕开 n×n 的注意力矩阵，n 很大时 d² 远小于 n·d。',
        concept: 'linear-attn',
      },
      {
        text: 'kernel 近似（Performer）保留的是？',
        options: ['完整 softmax', 'softmax 注意力形式但用核近似 exp(qk)', 'QKV 都不留', '只有 FFN'],
        answer: 1,
        explain:
          'kernel 近似保留注意力接口、把 exp 核随机特征化以便分解，是「保留 softmax 但让它可重排」的降次路线。',
        concept: 'linear-attn',
      },
      {
        text: 'SSM/Mamba 与线性注意力的本质区别是？',
        options: [
          '只是参数更多',
          'Mamba 用常数隐状态顺序压缩、彻底没有 QKV 的 n×n',
          'Mamba 不用位置编码就等同',
          '没有区别',
        ],
        answer: 1,
        explain:
          '线性注意力仍是 QKV、只是重排；SSM 连 QKV 都不要、用状态机读序列，推理零 KV cache。机制不同、互补。',
        concept: 'linear-attn',
      },
      {
        text: '为什么当前工程主流是「注意力 + SSM 混合」而非二选一？',
        options: [
          '混合一定更快',
          '用少量注意力保精确检索、多数 SSM 层压长序列成本',
          '没有别的选择',
          'SSM 已完全取代注意力',
        ],
        answer: 1,
        explain:
          '纯 SSM 在 needle/多跳检索掉、纯注意力长序列贵，混合按「检索 vs 成本」分工，是当前主流（Jamba/Griffin/Zamba）。',
        concept: 'linear-attn',
      },
    ],
    [
      ['线性注意力', '把 QKᵀV 重排成 Q(KᵀV)，保留 QKV、降次降显存'],
      ['kernel 近似', 'Performer 等，用随机特征近似 exp 核、保留注意力形式可分解'],
      ['SSM/Mamba', '状态空间模型，常数隐状态顺序读序列、推理零 KV cache'],
      ['混合架构', '部分层注意力 + 部分层 SSM，按检索/成本分工，M4 主线'],
    ],
    [
      '以为线性注意力「丢信息」——它是重排不是丢弃，n 小时精度与标准注意力接近。',
      '把 SSM 当「更快的注意力」——它不是注意力的加速版，是另一套机制（常数状态替代自由检索）。',
      '纯线性/SSM 直接上生产长程检索任务——needle/多跳会掉，需混合少量注意力层补回。',
      '以为 SSM 一定赢——要看任务：检索型任务标准注意力仍强，SSM 强在超长 + 显存恒定。',
    ],
  ),
  'framework',
)
