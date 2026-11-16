import { L, withKind } from '../../course-builders.ts'

export const L10 = withKind(
  L(
    'L10',
    3,
    '位置编码演进：RoPE 旋转、外推与 ALiBi 对照',
    3,
    ['L04'],
    ['positional-enc'],
    [
      '画出位置编码谱系：绝对（可学习/正弦）→ 相对（RoPE）→ 外推（NTK/YaRN/LongRoPE）→ ALiBi',
      '写清 RoPE 的旋转表示 q·e^{iθm} 如何编码「相对位置」，并推导为何能保范',
      '对比 NTK / YaRN / LongRoPE 三种上下文外推手法各自改了什么',
      '对照 ALiBi（logit 线性距离惩罚）说清「免查表、免加编码」的取舍',
    ],
    `
### 为什么需要位置编码

自注意力本身是**置换不变**的：打乱词序，softmax(QKᵀ/√d)V 的结果只是跟着打乱，模型分不清「猫追狗」和「狗追猫」。位置编码就是把「第几个位置」这个信息注入 Q/K。谱系大致是：

| 方案 | 机制 | 相对感知 | 外推 | 代表 |
|---|---|---|---|---|
| 可学习绝对 | 每位置一个可学向量，加到 embedding | 弱 | 差（见过 2K 就外推 4K 崩） | 原文 |
| 正弦绝对 | sin/cos 位置函数，免查表 | 弱 | 一般 | Transformer17 |
| RoPE 旋转 | 把位置「旋」进 Q/K 点积 | **强** | 中（可缩放） | GPT-NeoX / LLaMA |
| NTK / YaRN / LongRoPE | 对 RoPE 的频率或长度缩放 | 强 | **好** | 长上下文 LLM |
| ALiBi | 在 logit 上加「距离线性惩罚」 | 强 | 好（天然外推） | 无位置编码 |

:::deep

### RoPE 怎么把「相对」写进点积

RoPE（arXiv:2104.09864）把每个位置 m 的 Q/K 向量按**频率** θ_i 旋转一个角度 m·θ_i。两个位置 m、n 的点积里，旋转角相减 = (m−n)·θ_i——**只依赖相对距离 (m−n)，不依赖绝对位置**。这就是 RoPE 的「相对感知」。保范性来自旋转是正交变换：‖q·R_m‖ = ‖q‖，不放大不缩小。

\`\`\`python
# 概念：RoPE 旋转位置编码（旋转矩阵版，免复数）
import torch

def precompute_rope_cache(max_len, head_dim, base=10000.0):
    # 频率：θ_i = base^(-2i/head_dim)
    inv_freq = 1.0 / (base ** (torch.arange(0, head_dim, 2).float() / head_dim))
    t = torch.arange(max_len).float()
    angles = torch.outer(t, inv_freq)          # [max_len, head_dim/2]
    cos = torch.cat([angles.cos(), angles.cos()], dim=1)  # [max_len, head_dim]
    sin = torch.cat([angles.sin(), angles.sin()], dim=1)
    return cos, sin

def apply_rope(q, k, cos, sin):
    # 把 q/k 的最后一维 [x1,x2, x1',x2', ...] 两两分组做二维旋转
    def rotate(x):
        x1, x2 = x[..., 0::2], x[..., 1::2]
        return torch.stack([x1 - x2 * sin, x1 * cos + x2 * cos - x2 * sin + x2 * 0], dim=-1)
    # 简化的二维旋转（相邻分量）：
    def rot2(x):
        x1, x2 = x[..., 0::2], x[..., 1::2]
        c, s = cos[..., 0::2], sin[..., 0::2]
        return torch.stack([x1 * c - x2 * s, x1 * s + x2 * c], dim=-1).flatten(-2)
    return rot2(q), rot2(k)

torch.manual_seed(0)
head_dim, max_len = 8, 64
cos, sin = precompute_rope_cache(max_len, head_dim)
q = torch.randn(1, 1, max_len, head_dim)
k = q.clone()
qr, kr = apply_rope(q, k, cos, sin)

# 验证「相对感知」：同一段序列平移后，q_k 点积差只依赖相对距离
d0 = (qr[:, :, 0] * kr[:, :, 0]).sum().item()
d1 = (qr[:, :, 1] * kr[:, :, 1]).sum().item()
print("位置0/1 处 q·k（旋转后保留相对信息）:", round(d0, 3), round(d1, 3))
print("RoPE 不改变幅值（正交）：",
      round((q.norm(dim=-1) - qr.norm(dim=-1)).abs().max().item(), 4))
\`\`\`

### NTK / YaRN / LongRoPE 各改了什么

三者都是「RoPE 上下文外推」，思路不同：

- **NTK-aware（arXiv:2308.08241）**：不改 RoPE 频率结构，而是**改 base**——把 base 从 10000 放大，让长距离的旋转频率放缓，「拉伸」有效上下文，训练成本近零。
- **YaRN（arXiv:2309.00071）**：把频率**分段**——低频段缩放、高频段不动、中间段线性插值，再叠「短距离注意力衰减」，是 LLaMA 3 长上下文的官方方案。
- **LongRoPE（arXiv:2402.13753）**：把 base 与分段缩放都当成**可搜索/可学**的量，用数据驱动的搜索找到最优频率，长上下文表现最好。

:::tip

### ALiBi 的取舍（arXiv:2108.12409）

ALiBi 完全不加位置编码，而是在注意力 logit 上**按距离 m−n 加一条线性负惩罚**（每个头配一个斜率 m_i）：越远的 token 得分越低，形成「注意力偏置」直接编码相对距离。优点是**天然外推**（惩罚是距离的线性函数，没见过的长度也不会崩）、**免查表、免参数**；缺点是表达力比 RoPE 弱一档，长文本任务通常仍不如 YaRN/LongRoPE。

:::

### 为什么位置编码「外推」这么难

可学习/正弦绝对位置把「第 m 位」当成一个**死的、见过才有的量**：训练时只见过 0..2047，模型没见过 4096 该长什么样，外推自然崩。RoPE 把位置**写成相对距离的旋转角**，相对距离在训练时反复出现（任意两个位置之差在 [-L, L] 内都练过），所以它对「稍长一点」的序列有天然外推能力，但对**远超训练长度**的距离，旋转角超出训练分布，注意力分数开始「失准」——这正是需要 NTK/YaRN/LongRoPE 的原因。

理解这一点能帮你读后文：长上下文模型（LLaMA 3 128K、Gemma 2 长文版）几乎都靠「改 RoPE 的频率/长度缩放」实现扩展，**而不是把位置表拉长**。频率缩放 = 让同样的序列长度对应的旋转角「慢下来」，把有效窗口拉长。

### 相对编码 vs 绝对编码的深层差别

绝对编码（可学习向量、正弦）给每个位置一个**独立坐标**，模型要「记住」第 m 位该加什么；相对编码（RoPE、ALiBi）只给**位置差**一个影响，模型学的是「相隔多远」而非「在第几格」。相对编码的好处是**平移不变**：同一句话放在句首或句中，相对结构相同，模型不需要为「绝对位置」单独记忆——这就是为什么相对编码在长文本上更稳、也更省参数（RoPE 零可学参数、ALiBi 零位置参数）。

对照 LLaMA 官方（arXiv:2302.13971）：位置编码用 RoPE、base 50000；LLaMA 3 长上下文（2407.21783）用 YaRN 扩到 128K。

### 把 RoPE 的「相对距离只进点积」用一个二维例子钉死

抽象推导容易记不住，用一个二维旋转把「相对感知」彻底钉死。设某头 head_dim=2，位置 m、n 的 Q/K 各是一个二维向量，RoPE 就是把它俩绕原点旋转 \`m·θ\`、\`n·θ\`：

\`\`\`python
import torch
def rot2(v, angle):
    c, s = angle.cos(), angle.sin()
    return torch.stack([c * v[0] - s * v[1], s * v[0] + c * v[1]])

theta = 0.3
m, n = 5, 2
q = torch.tensor([1.0, 0.0])   # 某位置的 query
k = torch.tensor([0.5, 0.866]) # 某位置的 key
qm, kn = rot2(q, m * theta), rot2(k, n * theta)
q2, k2 = rot2(q, (m + 3) * theta), rot2(k, (n + 3) * theta)  # 整体平移 3 格

print("平移前 q·k：", round(qm @ kn, 4))
print("平移后 q·k：", round(q2 @ k2, 4))
print("两次几乎相同——因为点积里只保留了 (m-n)·θ 这个相对距离")
\`\`\`

两次点积几乎相等，把 \`m、n\` 同时加 3 格，结果不变——这就是「相对编码平移不变」的数值证据。**绝对编码没有这个性质**：把整段序列平移 3 格，每个位置的可学习向量都变了，模型会「看到不同的位置」，所以绝对编码无法外推。

### 为什么「base 越大、越长距离越稳」

RoPE 的频率是 \`θ_i = 1/base^(2i/d_head)\`，\`base\` 直接决定「旋转快慢」：base 越大，θ_i 整体越小，**同样的位置差对应的旋转角越小、越不容易「转圈转晕」**。这就是 NTK-aware「把 base 从 50000 拉到 1000000」的原理——长距离的相对角被放缓，注意力分数在远距离上不再剧烈震荡，有效上下文被「拉伸」。YaRN/LongRoPE 进一步把这种放缓做成**分段 + 可搜索**，避免「一刀切放大 base」伤及短距离精度。

:::tip

### 一张图记住位置编码的「三问」

读任何一篇用位置编码的模型时，用三个问题快速定位它：① **绝对还是相对**（可学习/正弦=绝对，RoPE/ALiBi=相对）；② **靠参数还是靠查表**（RoPE/ALiBi 零可学位置参数，可学习向量要存一张表）；③ **外推怎么做**（NTK 改 base、YaRN 分段缩放、LongRoPE 搜索、ALiBi 天然外推）。三问答完，你就知道它在 M2 长上下文那条线上处于哪个位置，以及为什么这样选。

:::

### 把位置编码记成「一个旋钮」而非「一堆方案」

位置编码方案看似多（可学习/正弦/RoPE/NTK/YaRN/LongRoPE/ALiBi），其实全挂在**同一根旋钮**上：「位置信息如何进入注意力点积、以及这根旋钮对多远的距离还灵不灵」。可学习向量与正弦把位置当成「死的绝对坐标」（旋钮拧到训练长度就失效）；RoPE 把它写成「相对距离的旋转角」（旋钮在训练窗口内有效）；NTK/YaRN/LongRoPE 则是「把 RoPE 这根旋钮往远拧」（改 base 或分段缩放，拉远有效距离）；ALiBi 干脆「不用旋钮、直接在 logit 上加距离惩罚」（天然外推）。记住「一根旋钮 + 往远拧」这个框架，面对任何新位置编码论文，你都能立刻归到这张图里——是换了旋钮，还是把旋钮拧得更远。
`,
    null,
    [
      {
        text: '自注意力本身对词序的敏感来自哪里？',
        options: ['FFN', '位置编码把位置信息注入 Q/K', '残差连接', 'LayerNorm'],
        answer: 1,
        explain: '自注意力置换不变，必须靠位置编码把「第几」写进 Q/K，否则分不清词序。',
        concept: 'positional-enc',
      },
      {
        text: 'RoPE 的「相对感知」来自？',
        options: ['两位置旋转角之差 = (m−n)·θ', '绝对位置向量相加', '可学习位置表', '距离线性惩罚'],
        answer: 0,
        explain: 'RoPE 把位置旋进 Q/K，点积时旋转角相减只剩相对距离，故编码相对位置。',
        concept: 'positional-enc',
      },
      {
        text: 'YaRN 相对 NTK 的主要区别是？',
        options: [
          '只改 base 不缩放',
          '把频率分段（低/高/中间）缩放并叠短距离衰减',
          '不用 RoPE',
          '删掉位置编码',
        ],
        answer: 1,
        explain: 'YaRN 分段处理 RoPE 频率（低频缩放、高频不动、中间插值），是 LLaMA 3 官方长上下文方案。',
        concept: 'positional-enc',
      },
      {
        text: 'ALiBi 的位置信息注入方式是？',
        options: ['加可学习位置向量', '在 logit 上按距离加线性负惩罚', '旋转 Q/K', '正弦查表'],
        answer: 1,
        explain: 'ALiBi 不加位置编码、不查表，直接在注意力 logit 上叠距离线性惩罚，天然外推。',
        concept: 'positional-enc',
      },
    ],
    [
      ['RoPE', '把位置「旋转」进 Q/K、点积后只剩相对距离的正交编码'],
      ['NTK', '放大 RoPE base 以「拉伸」有效上下文，免训练'],
      ['YaRN', 'RoPE 频率分段缩放 + 短距离衰减，LLaMA 3 长上下文官方方案'],
      ['ALiBi', '在注意力 logit 上加距离线性惩罚，免查表、免编码、天然外推'],
    ],
    [
      '以为可学习绝对位置能外推——见过 2K 就崩 4K，外推差。',
      '把 RoPE 当成「加向量」——它是旋转（正交变换），不改变幅值。',
      'YaRN 不分段直接整体缩放——高频段会被扭曲，须低/高/中分段处理。',
      '以为 ALiBi 比 RoPE 表达力更强——它省参数省查表，但长文本任务通常弱于 YaRN/LongRoPE。',
    ],
  ),
  'framework',
)
