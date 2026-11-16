import { L, withKind } from '../../course-builders.ts'

export const L08 = withKind(
  L(
    'L08',
    2,
    '残差连接 + 归一化：Pre/Post-Norm 与 RMSNorm',
    3,
    ['L07'],
    ['norm-residual'],
    [
      '说清残差连接为什么让深网络「梯度直通」、为何几乎不可或缺',
      '区分 Pre-Norm 与 Post-Norm 的位置差异，并解释现代 LLM 为何偏好 Pre-Norm',
      '写清 RMSNorm 与 LayerNorm 的差别（去 re-centering，只 re-scaling）',
      '解释 RMSNorm 为何省 7–64% 归一化计算并成为 LLaMA 标配',
    ],
    `
### 残差连接：让梯度「走高速路」

没有残差时，深层网络的梯度要一路经过每个非线性与矩阵乘，越深越容易被压到接近 0（梯度消失）。残差连接 \`x → sublayer(x) + x\` 给梯度开了一条**绕过子层的直通支路**：反向传播时 ∂(sublayer(x)+x)/∂x 里恒有一项 1，无论子层多深，梯度都能「至少」传回去。这就是为什么 Transformer 能堆几十上百层而不崩。现代 LLM 把残差放在**注意力之后、FFN 之后各一处**，是每个 block 的两条「高速路」。

:::warn

### Pre-Norm vs Post-Norm 的位置差

- **Post-Norm（原文）**：\`x + sublayer(LN(x))\`——先归一化再过子层、最后加残差。
- **Pre-Norm（现代）**：\`x + sublayer(LN(x))\` 里 LN 放在子层输入前，**残差支路不加归一化**。

关键差别在**梯度是否要穿过归一化**：Post-Norm 的梯度回传要穿过 \`sublayer\` 再进 LN，深层时这条「慢路」容易不稳定；Pre-Norm 的残差支路是干净的恒等映射，梯度直通，**训练更稳、几乎不需要学习率预热**，代价是最后输出可能尺度偏大，所以要加一个**额外的最终 LN**。这是 LLaMA/GPT 系几乎全用 Pre-Norm 的核心原因。

:::

### RMSNorm：只缩放、不中心化

LayerNorm 做两件事：减均值（re-centering，使零均值）+ 除标准差（re-scaling）。**RMSNorm（arXiv:1910.07467，Zhang & Sennrich 2019）砍掉减均值**，只做缩放：

    RMSNorm(x) = (1/rms(x)) · x · g，  rms(x)=√(mean(x²)+ε)

少算一个均值、少一次减法，归一化那步**约省一半**；配合 Pre-Norm 的整体简化，LLaMA 报告归一化相关计算比标准 LayerNorm 省 7–64%。质量上 RMSNorm 与 LayerNorm 基本打平，因此成了现代 LLM（LLaMA、Qwen、Gemma、Mistral）的标配。

\`\`\`python
# 概念：RMSNorm 与 LayerNorm 对照（PyTorch）
import torch
import torch.nn as nn

class RMSNorm(nn.Module):
    def __init__(self, dim, eps=1e-5):
        super().__init__()
        self.eps, self.g = eps, nn.Parameter(torch.ones(dim))

    def forward(self, x):
        rms = x.pow(2).mean(-1, keepdim=True).add_(self.eps).sqrt_()
        return x / rms * self.g                 # 只 re-scaling，不减均值

class LayerNormRef(nn.Module):
    def __init__(self, dim, eps=1e-5):
        super().__init__()
        self.eps = eps
        self.g = nn.Parameter(torch.ones(dim))
        self.b = nn.Parameter(torch.zeros(dim))

    def forward(self, x):
        m = x.mean(-1, keepdim=True)
        s = x.var(-1, keepdim=True, unbiased=False).add_(self.eps).sqrt_()
        return (x - m) / s * self.g + self.b    # re-centering + re-scaling

# 验证：RMSNorm 输出均值不恒为 0（不中心化），LayerNorm 输出均值≈0
torch.manual_seed(0)
x = torch.randn(1, 4096) * 3
r, l = RMSNorm(4096)(x), LayerNormRef(4096)(x)
print("RMSNorm 输出均值（应≈x 的量级，非 0）:", round(r.mean().item(), 4))
print("LayerNorm 输出均值（应≈0）:", round(l.mean().item(), 4))
print("RMSNorm 无 bias 参数；LayerNorm 多一个 b 向量")
\`\`\`

对照 RMSNorm 官方（arXiv:1910.07467）：核心即「去掉 re-centering，只保留 re-scaling」，在语言建模/翻译上匹配或超过 LayerNorm，且计算更省。LLaMA（arXiv:2302.13971）将 Pre-Norm + RMSNorm 列为标准配方。

### 把「残差 + 归一化」串成一条完整的 Pre-Norm block

把 L01 的 block 结构、L07 的 SwiGLU、本课时的位置选择合起来，一个现代 decoder-only 的标准 block 是：

\`\`\`python
import torch
import torch.nn as nn

class TransformerBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff):
        super().__init__()
        self.ln1 = RMSNorm(d_model)                    # Pre-Norm：归一化在子层「前」
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.ln2 = RMSNorm(d_model)
        self.ffn = SwiGLUFFN(d_model, d_ff)           # L07 的 SwiGLU

    def forward(self, x):
        a, _ = self.attn(self.ln1(x), self.ln1(x), self.ln1(x), need_weights=False)
        x = x + a                                       # 残差：恒等支路（不加 LN）
        x = x + self.ffn(self.ln2(x))                  # 第二段：FFN 前置归一化
        return x
# 整网络最后再补一个 RMSNorm（最终归一化），再进 LM head
\`\`\`

对照两个位置：\`x = x + sublayer(LN(x))\` 里 \`LN(x)\` 放在 \`sublayer\` **之前**——这就是 Pre-Norm。残差支路（那个 \`x +\`）保持纯净，不含归一化，梯度回传时这条支路恒等。

### 为什么「Pre-Norm 几乎不需要学习率预热」

Post-Norm 的初始化阶段很麻烦：刚初始化时各层输出的尺度差异大、梯度在深层要么爆炸要么消失，必须用一段**学习率预热（warmup）**让模型缓慢进入稳定区。Pre-Norm 把归一化挪到残差前之后，**每一层进入子层前都被 RMSNorm 压到 ~1 尺度**，残差流从头到尾尺度可控，梯度天然平滑——所以 LLaMA 系训练曲线更稳、预热需求更小。这是「Pre-Norm 稳」的机制解释，而不只是「听起来更稳」。

:::tip

### RMSNorm 省计算到底省在哪、不省在哪

RMSNorm 比 LayerNorm 省的是**一次均值统计 + 一次减法**（前向和反向各算一遍）。对几百层、每层两段归一化、每步上万 token 的模型，省下来的统计量乘以「层数 × 步数 × token 数」是可观的。但要注意：**它不省参数量**——RMSNorm 仍有一个逐维缩放参数 \`g\`（与 LayerNorm 的 \`g\` 数量相同），只是少了 \`b\`（bias）。所以「RMSNorm 更省」指的是**归一化那一步的 FLOPs/访存**，不是参数；这是验收里特意列出的一个高频误解。

:::

### 把 Pre-Norm 与 RMSNorm 记成「位置 + 算法」两个正交旋钮

容易把「Pre-Norm」和「RMSNorm」混为一谈，其实它们是**两个独立维度的选择**：

- **位置维度**：归一化放残差前（Pre）还是后（Post）。现代默认 Pre，因为它稳。
- **算法维度**：归一化用 LayerNorm（中心化 + 缩放）还是 RMSNorm（只缩放）。现代默认 RMSNorm，因为它更省且不掉质量。

两者可正交组合（Pre+LN、Pre+RMS、Post+RMS…），LLaMA 的「Pre + RMS」是当前经验最优组合。理解了「位置与算法正交」，后面看 M7 的 DeepSeek 或其它架构时，只要分别定位它的「归一化位置」与「归一化算法」，就能快速判断它和标准配方差在哪。

### 残差连接为什么「几乎不可或缺」

把残差连接去掉，网络从「每层学一个增量 + 直接透传输入」退化成「每层从零学一个完整变换」。深层时这意味着梯度要穿过几十个非线性与矩阵乘才能回到输入层，越深越容易被压到接近 0（梯度消失）或放大到爆炸。残差连接给梯度开了一条**恒等支路**：\`∂(sublayer(x)+x)/∂x\` 里恒有一项 \`1\`（来自 \`+x\`），无论子层多深，梯度都能「至少」传回去——这是 Transformer 能堆几十上百层而不崩的根本原因。

更进一步，残差还改变了「学习」的语义：每层只需学 \`sublayer(x)\` 这个**相对输入的增量**（残差），而不是学「从输入到输出的完整映射」。增量通常更小、更容易学，网络整体优化更平滑。所以现代 LLM 把残差放在注意力之后、FFN 之后各一处，构成每个 block 的两条「梯度高速路」——这正是 L01 讲的四件套里「残差管可训」的落地。

### Pre-Norm 末尾那个「最终归一化」常被漏掉

Pre-Norm 的代价是：因为残差支路从不被归一化，一路累加下来，最深层输出的**尺度会越来越大**（每加一次残差就放大一点）。如果直接把这个尺度偏大的输出喂进 LM head，logits 会被放大、softmax 趋于 one-hot、训练不稳。所以 Pre-Norm 架构**必须在所有 block 之后、进 LM head 之前，再补一个 RMSNorm/LayerNorm**（L09 的 \`self.lf = RMSNorm(...)\` 就是它）。这个「最终归一化」是 Pre-Norm 方案的固定配套，漏掉它是最常见的 Pre-Norm 实现 bug——表现为 logits 量级偏大、困惑度虚高。
`,
    null,
    [
      {
        text: '残差连接对深层网络最关键的贡献是？',
        options: ['增加参数', '给梯度开绕过子层的直通支路，缓解梯度消失', '减少 FFN', '省归一化'],
        answer: 1,
        explain: '残差支路恒有一项 1 的梯度，让深层网络的梯度能「至少」传回去，是堆深不崩的关键。',
        concept: 'norm-residual',
      },
      {
        text: '现代 LLM 偏好 Pre-Norm 相比 Post-Norm 的主要好处是？',
        options: ['省参数', '梯度走干净恒等支路，训练更稳、几乎不需预热', '输出更小', '不需要残差'],
        answer: 1,
        explain: 'Pre-Norm 残差支路不加归一化，梯度直通更稳；代价是末尾要补一个最终 LN。',
        concept: 'norm-residual',
      },
      {
        text: 'RMSNorm 相对 LayerNorm 去掉了哪一步？',
        options: ['re-scaling（除标准差）', 're-centering（减均值）', '缩放因子', '可学习 g'],
        answer: 1,
        explain: 'RMSNorm 只做 re-scaling、不减均值，少算一次均值/减法，更省计算且质量打平。',
        concept: 'norm-residual',
      },
      {
        text: 'RMSNorm 成为 LLaMA/Qwen/Gemma 标配的原因是？',
        options: ['参数更多', '比 LayerNorm 省计算且质量基本打平', '只用于分类', '不需要 eps'],
        answer: 1,
        explain: '省 7–64% 归一化相关计算、质量匹配，故成为现代 LLM 标配（arXiv:1910.07467）。',
        concept: 'norm-residual',
      },
    ],
    [
      ['残差连接', 'sublayer(x)+x 的恒等支路，给梯度开高速路'],
      ['Pre-Norm', '归一化放在子层输入前、残差支路不加归一化，训练更稳'],
      ['Post-Norm', '原文写法，归一化在残差之后，深层易不稳定'],
      ['RMSNorm', '只 re-scaling 不减均值的归一化，LLaMA 系标配'],
    ],
    [
      '以为 Pre-Norm 不需要任何归一化——末尾仍要补一个最终 LN，否则输出尺度偏大。',
      '把 RMSNorm 当成 LayerNorm 直接替换且保留 bias——RMSNorm 无 bias，只缩放。',
      'Post-Norm 直接堆很深期望「更准」——深层 Post-Norm 训练不稳，现代普遍改 Pre-Norm。',
      '以为 RMSNorm 省的是参数量——它省的是**归一化计算**，不是参数量。',
    ],
  ),
  'framework',
)
