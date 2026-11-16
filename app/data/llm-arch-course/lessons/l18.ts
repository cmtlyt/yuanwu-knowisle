import { L, withKind } from '../../course-builders.ts'

export const L18 = withKind(
  L(
    'L18',
    7,
    '滑动窗口 / 局部注意力与上下文扩展',
    3,
    ['L15'],
    ['sliding-window'],
    [
      '写清 sliding window / 局部注意力「只看最近 W 个 token」的掩码形式',
      '写出可跑的 sliding-window causal mask 脚本，打印验证某位置只能看到窗口内的 token',
      '说明窗口 + 全局层交替如何既省 KV 又保留长程依赖',
      '对照 RoPE 缩放 / YaRN（arXiv:2309.00071）说明上下文扩展的另一条路',
      '估算「滑窗 W」相比全注意力省多少 KV 内存',
    ],
    `
### 长上下文的两条路

M2 把「补长上下文短板」拆成两条正交的路：**路 A 限制每个位置看多远**（滑窗/局部注意力），**路 B 让 RoPE 的频率「转慢」以支持更长**（NTK/YaRN/LongRoPE，M1-L10 已讲谱系）。本课时先走路 A——滑窗，因为它直接砍 KV 内存，是推理侧最省的一块。

### 滑窗 / 局部注意力的掩码

全注意力让第 t 位看 0..t；滑窗（sliding window attention）让它**只看 t-W..t**（最近 W 个 + 自己）。掩码比因果多砍掉「太远的过去」：

\`\`\`python
import torch

def sliding_causal_mask(n, window):
    # 因果（下三角）且每行只看最近 window 列
    causal = torch.tril(torch.ones(n, n)).bool()
    band = torch.tril(torch.ones(n, n, diagonal=0), diagonal=0)  # 占位
    # 用「列号 - 行号 >= -W」构造窗口带
    row = torch.arange(n).view(-1, 1)
    col = torch.arange(n).view(1, -1)
    within = (col - row) >= -window        # 距离不超过 W 才允许看
    return causal & within                 # 既要因果、又要在窗口内

n, W = 8, 3
m = sliding_causal_mask(n, W)
print(m.int())
# 位置 6 只能看 3,4,5,6（最近 3 个 + 自己），看不到 0,1,2
# 因果保证「不看未来」，窗口保证「不看太远」
\`\`\`

### 窗口 + 全局层交替：既省 KV 又保长程

纯滑窗会让「第 t 位完全看不到 0..t-W」，长程依赖就断了。常见解法（LLaMA 2 13B/70B 即用）是**部分层滑窗、部分层全局**：每隔 k 层放一个全局注意力层，其余层用滑窗。全局层负责「把远处的信息接力传下来」，滑窗层负责省 KV。这样**多数层的 KV 只存最近 W 个 token**，内存大幅下降，而长程信息靠全局层保留。

:::deep

### 滑窗省多少 KV

全注意力每层每序列的 KV 随**全长 L** 线性涨；滑窗层只存**最近 W**（W 恒定），所以滑窗层的 KV 内存从 O(L) 降到 **O(W)**（与 L 无关）。若 1/2 层是滑窗（W=4096）、1/2 层全局，整模型 KV ≈ 全局层的全长 + 滑窗层的固定 W，比全全局省一大截。这正是 M11 部署时「同显存塞更长上下文」的机制之一。

:::

\`\`\`python
def kv_per_layer_mb(layers, seq, kv_heads, d_h, bits=16, window=None):
    # window=None → 全注意力（存全长）；window 给定 → 滑窗（只存最近 W）
    eff_len = seq if window is None else min(seq, window)
    return layers * eff_len * 2 * kv_heads * d_h * (bits // 8) / 1e6

LAYERS, SEQ, KV_H, D_H, W = 32, 8192, 8, 128, 4096
full = kv_per_layer_mb(LAYERS, SEQ, KV_H, D_H, window=None)
slid = kv_per_layer_mb(LAYERS, SEQ, KV_H, D_H, window=W)
print(f"全注意力 KV/层 ≈ {full:.1f} MB；滑窗(W={W}) KV/层 ≈ {slid:.1f} MB（降 {slid/full:.2f} 倍）")
# 序列 8K、窗口 4K：滑窗层只存 4K，比全 8K 省一半；序列再长仍只存 4K
\`\`\`

### 路 B：RoPE 缩放 / YaRN 扩展上下文

滑窗是「限制看多远」，路 B 是「让位置编码支持更远」。NTK 改 base、YaRN（arXiv:2309.00071）分段缩放 RoPE 频率（低频段缩放、高频段不动、中间插值 + 短距离衰减），是 LLaMA 3 把上下文扩到 128K 的官方方案（M1-L10 讲过谱系）。两条路**不冲突、可叠**：滑窗省 KV 内存（推理侧），YaRN 让模型真正「读得远」（语义侧）。M11 部署时常一起用。

:::deep

### 可跑的窗口掩码 + 交替层布局

把上面两个掩码接成可跑的「交替层」模型，验收「滑窗层只存最近 W、全局层存全长」的 KV 行为，这是 L24 capstone 调 \`window_size\` 前的冒烟：

\`\`\`python
import torch

def layer_kv_budget(seq, window, is_global):
    """交替层：全局层存全长 seq，滑窗层只存最近 W。"""
    return seq if is_global else min(seq, window)

LAYERS, SEQ, W = 32, 8192, 4096
# LLaMA 2 式布局：每隔 4 层放一个全局层（0,4,8,...），其余滑窗
budget = []
for layer in range(LAYERS):
    is_global = (layer % 4 == 0)
    budget.append(layer_kv_budget(SEQ, W, is_global))
full = sum(SEQ for _ in range(LAYERS))            # 全注意力：每层都存全长
mixed = sum(budget)
print(f"全注意力 KV 长度总量 ≈ {full}；交替布局 ≈ {mixed}（降 {mixed/full:.2f} 倍）")
# 1/4 层全局 + 3/4 层滑窗(W=4096)：每 4 层省 (3*SEQ-3*W)，序列再长省得越多
assert mixed < full, "滑窗层只存 W，总量应低于全注意力"
\`\`\`

这段把「窗口 + 全局层交替」从概念落到一个可算的量：**每 4 层里 3 层只存 W、1 层存全长**。序列从 8K 拉到 32K 时，全注意力的 KV 长度总量 ×4，而交替布局里滑窗层仍只存 4096、只有全局层跟着 ×4——省的比例随序列长放大。这是「同显存塞更长上下文」的定量依据，也正是 L24 调 \`window_size\` 时的旋钮。

### 滑窗与全局层比例的取舍

\`每隔 k 层放一个全局层\` 的 k 不是越大越好：

- **k 太大（全局层太密）**：接近全注意力，滑窗省 KV 的收益没了。
- **k 太小（全局层太稀）**：长程信息接力链太长，「第 t 位要跨很多层才能看到远处」，长程依赖掉点。
- **经验**：LLaMA 2 13B/70B 用「部分层滑窗 + 部分层全局」且滑窗 W=4096，是「省 KV」与「长程」的平衡点。自调时**抽测长程基准**（needle-in-haystack、多跳 QA）——k 调到长程掉点不可接受就回调。

:::

### 窗口 W 怎么选：与「目标检索距离」挂钩

上面把 k（全局层间隔）当成旋钮，W（窗口大小）是另一条独立的轴，两条一起定才能把「省 KV」与「长程」都拿到。选 W 的判据是**目标任务里「需要跨多远检索」**：

- **局部任务（对话、短上下文摘要）**：W=1024–4096 足够，远处信息本来就不重要，省 KV 收益最大。
- **长文档问答（needle-in-haystack）**：需要跨几千到几万 token 检索，纯滑窗会断远距依赖，必须「滑窗 + 全局层」或「YaRN 拉长 RoPE」，W 只是「近处快查」的一部分。
- **超长上下文（128K+）**：W 设成 4096 仍只覆盖最近 4K，更远的检索要靠全局层（或 M4 的混合架构）——此时「W 多大」反而是次要矛盾，主要矛盾是「全局层间隔 k 与 RoPE 频率缩放」。

经验上 W 选「任务典型检索距离的 1.5–2 倍」：检索距离 2K 的任务 W=4096，既覆盖近处又不过度存远处。W 设太大（>目标检索距离）等于白存 KV、没省到；设太小（<目标检索距离）近处都断，长程掉点。

### 滑窗 + 全局层的「接力距离」直觉

把「每隔 k 层放一个全局层」理解成**信息接力**：滑窗层只把信息传给最近 W 个位置，全局层把「远处信息」接力到更远的层。接力链的长度 = 全局层间隔 k，链越长（k 越小、全局层越密），远处信息到第 t 位的「跳数」越少、越准；链越短（k 越大），滑窗层越多、省 KV 越多但接力损失越大。所以 **k 与 W 是一组「省 KV 强度 vs 长程保留」的联立旋钮**：k 大 + W 小 = 最省 KV、长程最弱；k 小 + W 大 = 长程最强、KV 最贵。LLaMA 2 13B/70B 的「部分滑窗 + 部分全局 + W=4096」是把这组旋钮拧到一个工程平衡点的代表，自调时抽测 needle 基准定 k、按显存预算定 W。

:::tip

「**省 KV 用滑窗，读得远用 YaRN**」：滑窗砍的是每个位置看的范围（直接降 KV 内存，但纯滑窗会断长程），YaRN 拉长的是 RoPE 的有效频率窗口（让模型支持更长序列，不直接省 KV）。要「同显存塞更长上下文」靠滑窗 + 全局层；要「模型真的理解 128K」靠 YaRN/NTK。两条路一起上才是长上下文的完整解法。

### 把「滑窗 + YaRN」叠起来调长上下文的三步法

M11 部署时真正「同显存塞更长上下文」，是把两条正交的路叠起来、按顺序拧：

- **第 1 步（省 KV）**：先上滑窗 + 全局层（路 A），把「KV 随 L 线性涨」砍成「滑窗层只存 W、全局层存全长」，同显存能塞的**最大上下文长度**先拉起来（显存不再被 KV 卡死）。
- **第 2 步（读得远）**：再上 YaRN/NTK（路 B），把 RoPE 频率缩放、让模型的**有效感受野**真的覆盖到更长序列——此时滑窗省出来的显存，YaRN 才用得上（否则模型读不到那么远，塞了也理解不了）。
- **第 3 步（验证）**：抽测长程基准（needle-in-haystack、多跳 QA）确认「真的读到远处」，再调 k/W 与 YaRN 缩放系数到「长程不掉点 + 显存不爆」的平衡点。

三条顺序不能倒：**先省 KV（腾显存）再拉远（YaRN）再验证**——若先 YaRN 后滑窗，YaRN 拉远后 KV 暴涨会 OOM；若省了 KV 不拉远，显存腾出来但模型读不到那么远。这也是 L24 调 \`window_size\` 与 M11 调 \`rope_scaling\` 两个参数的协同关系：一个管「存多少」、一个管「读多远」，配合才是完整长上下文方案。把「滑窗省 KV + 全局层保长程」叠起来的显存账写成可跑的对照，验收「同显存塞下比全注意力更长上下文」：

\`\`\`python
def kv_bytes(lay, seq, kv_h, d_h, bits=16, window=None, global_every=4):
    """交替层 KV 字节：全局层（每 global_every 层）存全长 seq，滑窗层存 min(seq, window)。"""
    total = 0
    for layer in range(lay):
        is_global = (layer % global_every == 0)
        eff = seq if is_global else min(seq, window)
        total += eff * 2 * kv_h * d_h * (bits // 8)      # K+V
    return total

LAY, KV_H, D_H, W = 32, 8, 128, 4096
full_attn = kv_bytes(LAY, 32768, KV_H, D_H, window=None)   # 全注意力、32K
slid_mix  = kv_bytes(LAY, 32768, KV_H, D_H, window=W)      # 滑窗+全局、32K
budget = full_attn // 4   # 显存被全注意力 32K 占了 1/4 的预算
def max_seq_under_budget(b):
    lo, hi = 1024, 131072
    while lo < hi:
        mid = (lo + hi) // 2
        if kv_bytes(LAY, mid, KV_H, D_H, window=W) <= b: lo = mid + 1
        else: hi = mid
    return lo - 1
print(f"全注意力 32K KV ≈ {full_attn/1e9:.1f} GB；滑窗+全局 32K ≈ {slid_mix/1e9:.1f} GB（省 {1-slid_mix/full_attn:.0%}）")
print(f"同预算下滑窗+全局能塞的序列长 ≈ {max_seq_under_budget(budget)} token（远超 32K）")
assert max_seq_under_budget(budget) > 32768, "滑窗+全局应在同显存塞下更长上下文"
# YaRN 在这段「省出来的显存」上把 RoPE 有效窗口拉长，模型才真读得到那么远
\`\`\`

:::
`,
    null,
    [
      {
        text: 'sliding window attention 让第 t 位看哪里？',
        options: ['0..t（全因果）', 't-W..t（最近 W + 自己）', '0..W', 't..t+W（含未来）'],
        answer: 1,
        explain: '滑窗是因果 + 窗口带：第 t 位只看最近 W 个与自身，既不看未来也不看太远的过去。',
        concept: 'sliding-window',
      },
      {
        text: '纯滑窗会断长程依赖，常见解法是？',
        options: ['加大窗口 W', '部分层滑窗 + 部分层全局注意力交替', '去掉因果掩码', '不用滑窗'],
        answer: 1,
        explain: '每隔 k 层放全局层接力传长程信息，其余层滑窗省 KV；LLaMA 2 13B/70B 即此方案。',
        concept: 'sliding-window',
      },
      {
        text: '滑窗层 KV 内存随序列长 L 的关系是？',
        options: ['O(L)', 'O(W)（W 恒定，与 L 无关）', 'O(L²)', 'O(1)'],
        answer: 1,
        explain: '滑窗只存最近 W 个 token 的 KV，内存 ∝ W 而非常数 L，这是它省 KV 的原因。',
        concept: 'sliding-window',
      },
      {
        text: '让 RoPE 支持更长上下文（YaRN/NTK）与滑窗的关系是？',
        options: ['互相冲突只能选一', '正交可叠：滑窗省 KV、YaRN 拉长读远', 'YaRN 是滑窗的子集', '两者等价'],
        answer: 1,
        explain: '滑窗砍「看多远」（省推理 KV），YaRN 拉「读多远」（语义长上下文），不冲突、常一起用。',
        concept: 'sliding-window',
      },
    ],
    [
      ['滑窗注意力', '第 t 位只看最近 W 个 + 自身，KV 内存 O(W) 与 L 无关'],
      ['全局层交替', '部分层滑窗、部分层全局，接力传长程信息'],
      ['YaRN', 'RoPE 频率分段缩放 + 短距离衰减，LLaMA 3 扩到 128K 的方案'],
      ['长上下文两路', '路 A 限制看多远（滑窗省 KV）、路 B 拉长读远（RoPE 缩放）'],
    ],
    [
      '以为纯滑窗能保留全局长程——它会断远处依赖，需全局层交替。',
      '滑窗层 KV 仍按全长 L 存——只存最近 W，否则没省。',
      '把 YaRN 当成省 KV 的手段——它让模型读得远，不直接省 KV（省 KV 靠滑窗/量化）。',
      '窗口 W 设太小——长程信息断得早，需要配合全局层，不是越小越好。',
    ],
  ),
  'practice',
)
