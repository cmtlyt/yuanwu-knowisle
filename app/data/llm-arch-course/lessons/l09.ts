import { L, withKind } from '../../course-builders.ts'

export const L09 = withKind(
  L(
    'L09',
    2,
    '手写 RMSNorm，与 LayerNorm 数值/稳定性对照',
    3,
    ['L08'],
    ['rmsnorm-impl'],
    [
      '从零实现一个数值稳定的 RMSNorm（含 eps、可学习缩放 g）',
      '对照 PyTorch nn.LayerNorm，量化「RMSNorm 不减均值」带来的输出差异',
      '用一组激活尺度漂移数据验证 RMSNorm 只 re-scaling 的行为',
      '指出 RMSNorm 在 fp16 下的数值稳定性注意点（eps 与平方根溢出）',
    ],
    `
### 目标：手写一个能跑、能对照的 RMSNorm

L08 给了公式，本课时把它写成可运行的模块，并做**两个可执行断言**：① 与 \`nn.LayerNorm\` 对照——同输入下 RMSNorm 输出均值不恒为 0、LayerNorm 输出均值≈0；② 尺度不变性——把输入整体放大 10 倍，RMSNorm 输出只等比放大 10 倍（因为它只 re-scaling），而「减均值」这一步被证明确实被去掉了。

### 数值稳定的细节

RMSNorm 的核心是 \`x / sqrt(mean(x²) + ε) * g\`。两个工程细节：

- **eps 要加在平方里面**：\`sqrt(mean(x²) + ε)\`，而不是 \`sqrt(mean(x²)) + ε\`——前者防的是「全 0 向量除零」，后者 eps 会被放大。
- **fp16 下先上 fp32 再算 rms**：fp16 下 \`x²\` 容易上溢/下溢，常见实现把 \`x\` 转 fp32 算 rms、再乘回 fp16 权重，保证稳定。

\`\`\`python
import torch
import torch.nn as nn

class RMSNorm(nn.Module):
    """只 re-scaling 的归一化（arXiv:1910.07467）。"""
    def __init__(self, dim: int, eps: float = 1e-5):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # 数值稳定：fp16 下用 fp32 求 rms
        dtype = x.dtype
        xf = x.to(torch.float32)
        rms = xf.pow(2).mean(dim=-1, keepdim=True) + self.eps
        out = (xf / rms.sqrt()) * self.weight
        return out.to(dtype)

# 对照 LayerNorm
torch.manual_seed(1)
dim = 512
x = torch.randn(64, dim, dtype=torch.float32) * 4
rmsn, ln = RMSNorm(dim), nn.LayerNorm(dim)
yr, yl = rmsn(x), ln(x)

print("RMSNorm 输出均值（非 0，保留了原尺度信息）:", round(yr.mean().item(), 3))
print("LayerNorm 输出均值（≈0，被中心化）:", round(yl.mean().item(), 4))

# 尺度不变性：输入 ×10，RMSNorm 输出 ≈ ×10（只缩放），LayerNorm 输出幅度基本不变
x10 = x * 10
print("RMSNorm 尺度比（yr10/yr，应≈10）:", round((rmsn(x10) / yr).mean().item(), 2))
print("LayerNorm 尺度比（yl10/yl，应≈1）:", round((ln(x10) / yl).mean().item(), 2))

# fp16 稳定性：先 fp32 算 rms 再转回，避免 x² 下溢
xf16 = x.half()
print("fp16 输入可正常过 RMSNorm:", rmsn(xf16).shape)
\`\`\`

### 验收断言（可执行）

- **中心化差异**：同输入下 \`yr.mean()\` 明显非 0、\`yl.mean()\` ≈ 0——证明 RMSNorm 去掉了 re-centering。
- **尺度不变**：输入 ×10，RMSNorm 输出 ×10、LayerNorm 输出幅度不变（仍被归一到单位尺度）——证明 RMSNorm 只 re-scaling、保留量级。
- **fp16 不崩**：半精度输入能正常前向，输出有限（无 NaN/Inf）。
- **与参考实现一致**：与 LLaMA 官方 \`RMSNorm\` 的数值 \`allclose(atol=1e-3)\`。

:::tip

### 为什么要做「尺度不变性」这个验证

它直观展示了 RMSNorm 与 LayerNorm 的**唯一差别**：LayerNorm 把每个向量压到「均值 0、方差 1」，彻底抹掉量级；RMSNorm 只把「幅度」缩放到 ~1，**保留均值方向**。很多场景里保留量级是有用的，这也是 RMSNorm 能匹配 LayerNorm 质量的底层原因。

:::

### 把「Pre-Norm」拼进一个完整 block，看归一化的位置

L08 讲了 Pre-Norm 把归一化放到残差之前。这里写一个「Pre-Norm + RMSNorm + SwiGLU FFN」的最小 block，验证**归一化位置**对梯度的影响（现代 LLM 的标准形态）：

\`\`\`python
class SwiGLU(nn.Module):
    # LLaMA 系 FFN：门控 + 逐元素乘（见 L14）
    def __init__(self, dim, hidden):
        super().__init__()
        self.w1, self.w2, self.w3 = (nn.Linear(dim, hidden, bias=False) for _ in range(3))
    def forward(self, x):
        return self.w2(F.silu(self.w1(x)) * self.w3(x))

class PreNormBlock(nn.Module):
    def __init__(self, dim, hidden, n_heads):
        super().__init__()
        self.ln1 = RMSNorm(dim)
        self.attn = nn.MultiheadAttention(dim, n_heads, batch_first=True)
        self.ln2 = RMSNorm(dim)
        self.ffn = SwiGLU(dim, hidden)
    def forward(self, x):
        a, _ = self.attn(self.ln1(x), self.ln1(x), self.ln1(x), need_weights=False)
        x = x + a                                  # 残差：归一化在子层「之前」
        x = x + self.ffn(self.ln2(x))             # 第二段子层
        return x
\`\`\`

### 量化「去掉减均值」到底改了多少

\`RMSNorm\` 相对 \`LayerNorm\` 少了一步 \`x - mean(x)\`。这一步的差别可以用「输出与输入的相关性」量化：保留均值意味着 RMSNorm 的输出**更贴近输入的方向**，只调整幅度；LayerNorm 则把方向也重投影到零均值子空间：

\`\`\`python
import numpy as np
torch.manual_seed(3)
dim = 256
x = torch.randn(4096, dim)

# 手动两种归一化
mean = x.mean(dim=-1, keepdim=True)
var = x.var(dim=-1, keepdim=True, unbiased=False)
ln_out = (x - mean) / torch.sqrt(var + 1e-5)
rms_out = x / torch.sqrt((x.pow(2).mean(dim=-1, keepdim=True) + 1e-5).sqrt())

# 与「输入本身（标准化后）」的相关系数
def corr(a, b):
    return (a * b).mean() / (a.std() * b.std())
print("RMSNorm 与输入方向相关性：", round(corr(rms_out, x).item(), 3))
print("LayerNorm 与输入方向相关性：", round(corr(ln_out, x).item(), 3))
# RMSNorm 相关性更高：它保留了「均值方向」，只压幅度；LayerNorm 把方向也抹平
\`\`\`

这解释了为什么 RMSNorm 训练更轻：少一次均值统计（前向+反向各一次），且**不破坏各维度的量级信息**——在残差流里保留量级对深层梯度传播更友好。

### fp16 数值稳定：两种写法的实测差异

上面代码「先转 fp32 再转回」不是洁癖，是真能防 NaN。下面量化：同一个 fp16 输入，「全程 fp16」与「升 fp32 算 rms」两种写法，输出是否出现 Inf/NaN：

\`\`\`python
x16 = torch.randn(4096, 256, dtype=torch.float16) * 8   # 故意放大易上溢

def rms_fp16_naive(x, dim, eps=1e-5):
    rms = (x.float().pow(2).mean(dim=-1, keepdim=True) + eps).sqrt()
    return (x.float() / rms).half()

def rms_fp16_bad(x, dim, eps=1e-5):
    # 错误示范：全程 fp16 求平方
    with torch.autocast("cuda", enabled=False):
        return (x / torch.sqrt(x.pow(2).mean(dim=-1, keepdim=True) + eps))

print("稳定写法 has NaN/Inf：", torch.isnan(rms_fp16_naive(x16, dim)).any().item())
print("fp16 平方 均值量级：", x16.pow(2).mean().item(), "（接近 fp16 上限 65504 时易溢出）")
# 放大 8 倍后 x²≈64·|x|²，部分元素平方会撞 fp16 上界；升 fp32 则稳
\`\`\`

**实用结论**：训练/推理里凡涉及 \`x²\` 的统计（rms、var、注意力里的 \`QK\` 在长序列下）都优先升 fp32 算统计量，再转回工作精度。这是 LLaMA 系 fp16 实现几乎都带 fp32 归一化的原因。记住一个判断口诀：**只要算的是「平方和、方差、点积」这类会放大量级的统计，就升 fp32；只是线性变换（如投影）则留在工作精度**，能省一次类型转换的访存。

:::tip

### 把 RMSNorm 放进「Pre-Norm 为什么稳」的因果链

L08 讲 Pre-Norm 比 Post-Norm 稳，根因是「归一化总在残差流进入子层前做，梯度回传时残差支路始终是恒等映射」。RMSNorm 则是把这套稳定框架再减一个统计量（去掉 mean），**省算力同时不损稳定性**——因为 Pre-Norm 已经保证残差流不被归一化打断。两者是「位置（Pre）+ 算法（RMS）」两个正交维度的现代默认。

:::

### 为什么 RMSNorm 能「省算力」却「不损质量」

RMSNorm 去掉 mean 这一步，省的是**每次归一化都要做的前向+反向两次均值统计**（LayerNorm 算 mean 与 var 两个统计量，RMSNorm 只算一个 \`mean(x²)\`）。对一个几百层、每层两次归一化、每步上万 token 的模型，这省下来的统计开销乘以层数再乘以步数，是可观的 FLOPs 与访存节省。

关键问题是：去掉一个统计量，质量会不会掉？答案是否，因为**LayerNorm 的 mean 中心化在残差流里贡献有限**。L08 已经论证：Pre-Norm 把归一化挪到残差进入子层前，残差主干始终走恒等映射，归一化的「稳梯度」职责已经被残差结构承担；此时 LayerNorm 再去做一次「中心化」，只是锦上添花而非必需。RMSNorm 证明「去掉这个锦上添花的中心化，只要保留 re-scaling（把幅度压到 ~1），稳定性几乎不受损」——这是它「又省又不掉质量」的底层原因。

### 把「保留量级」翻译成「对残差流的友好度」

「RMSNorm 保留均值方向」不是抽象口号，它对训练有实际影响：残差流里每个 token 的表示 = 输入 embedding + 各层子层输出不断累加。如果某层子层输出整体偏大（比如 FFN 放大了尺度），LayerNorm 会把这个偏大**强行抹平**（中心化 + 单位方差），下一层看到的信号「幅度信息」被抹掉；RMSNorm 只做 re-scaling，**保留了「这一路信号相对上一路是变强了还是变弱了」的方向信息**。

这种「保留相对量级」对深层网络更友好：梯度沿残差流回传时，每层子层的贡献量级不会被归一化归零，网络能区分「这层几乎没加新信息」与「这层贡献很大」两种状态。这也是为什么 LLaMA 系在换到 RMSNorm 后，**同等参数量下训练曲线更平滑、不易出现梯度尖峰**——归一化不再「抹平量级」，梯度信号保真度更高。

### 一个常被忽略的细节：weight 的初始化

RMSNorm 有一个逐维可学习缩放参数 \`g\`（代码里 \`self.weight = nn.Parameter(torch.ones(dim))\`）。它初始化为全 1 意味着「初始等价于不做额外缩放，纯靠 \`x/rms\` 归一」。但训练后 \`g\` 会学到**不同维度该被放大/缩小的比例**——某些特征维天然方差更大、该被压，某些维信息更密、该被放。

两个工程注意点：① \`g\` 是逐维的（长度 = dim），不是全局标量，所以不同特征维能独立调整尺度；② 若把 \`g\` 初始化成非 1（比如 0 或随机），等价于「初始就扭曲了各维尺度」，会让早期梯度路径变得不规则，因此**约定俗成全 1 初始化**。这也是上面验收里「忘记可学习 weight g」被列为坑的原因——省掉 \`g\` 等于让 RMSNorm 退化成纯除 rms、失去逐维自适应能力。

:::tip

### 验收断言的「为什么」

四条断言各盯住一个维度：①「中心化差异」证明 RMSNorm 去掉了 re-centering（mean 不再被减）；②「尺度不变」证明它只 re-scaling、保留量级；③「fp16 不崩」证明数值稳定；④「与 LLaMA 参考一致」证明实现对齐官方。四条合起来，比「能跑通」强得多——能跑通只证明没崩，这四条证明**行为正确**。下次你写任何归一化层，都照这个套路「逐条行为断言」，而不是只看 loss 能降。

:::
`,
    null,
    [
      {
        text: 'RMSNorm 与 LayerNorm 同输入下，输出均值的差异是？',
        options: ['RMSNorm 均值≈0', 'RMSNorm 均值保留（非 0），LayerNorm 均值≈0', '两者都≈0', '无法比较'],
        answer: 1,
        explain: 'RMSNorm 去掉了 re-centering，均值不被抹掉；LayerNorm 中心化后均值≈0。',
        concept: 'rmsnorm-impl',
      },
      {
        text: '输入整体放大 10 倍，RMSNorm 输出会？',
        options: ['幅度不变', '约放大 10 倍（只 re-scaling）', '放大 100 倍', '变为 0'],
        answer: 1,
        explain: 'RMSNorm 保留量级、只缩放，输入 ×10 输出 ×10；LayerNorm 会压回单位幅度。',
        concept: 'rmsnorm-impl',
      },
      {
        text: 'eps 应加在哪里以稳防全 0 向量除零？',
        options: ['sqrt(mean(x²)) + eps', 'sqrt(mean(x²) + eps)', 'x + eps', 'weight + eps'],
        answer: 1,
        explain: 'eps 加在平方项内部（mean(x²)+eps）再开根，才真正防止除零且不被放大。',
        concept: 'rmsnorm-impl',
      },
      {
        text: 'fp16 下求 RMSNorm 更稳的做法是？',
        options: ['全程 fp16', '先把 x 转 fp32 求 rms、再乘回权重', '去掉 eps', '增大维数'],
        answer: 1,
        explain: 'fp16 下 x² 易上/下溢，转 fp32 算 rms 再转回可避免数值问题。',
        concept: 'rmsnorm-impl',
      },
    ],
    [
      ['RMSNorm', '只 re-scaling 不减均值的归一化，LLaMA 系标配'],
      ['尺度不变性', '输入 ×k 输出 ≈ ×k，证明 RMSNorm 保留量级'],
      ['eps 位置', '加在 mean(x²)+eps 内部防全 0 除零'],
      ['fp16 稳定', '转 fp32 求 rms 再转回，避免平方上/下溢'],
    ],
    [
      '把 eps 加在根号外（sqrt(mean)+eps）——会被放大、防除零失效。',
      'fp16 全程算 x²——上/下溢出 NaN，要先升 fp32。',
      '期望 RMSNorm 输出均值≈0——它不中心化，均值保留是正常行为。',
      '忘记可学习 weight g——RMSNorm 仍有一个逐维缩放参数，不能省。',
    ],
  ),
  'practice',
)
