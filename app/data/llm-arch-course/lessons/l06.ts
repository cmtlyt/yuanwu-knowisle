import { L, withKind } from '../../course-builders.ts'

export const L06 = withKind(
  L(
    'L06',
    1,
    '手写多头注意力：QKV 投影 + 缩放 + 因果 mask 验证',
    3,
    ['L04', 'L05'],
    ['mha-impl'],
    [
      '从零实现一个可运行的多头注意力层（QKV 投影 + 缩放点积 + 因果掩码 + 多头拆分/拼接）',
      '用「注意力权重相对感知」验证：把 query 与某 key 拉近，对应注意力权重上升',
      '用「输出对 Value 保范/加权」验证：单一强相关头时输出≈该 Value',
      '对照 PyTorch 的 F.scaled_dot_product_attention，检查手写版数值一致',
    ],
    `
### 目标：手写一个真能跑的多头注意力

L04 给了公式，本课时把它写成可运行的类，并做两个**可执行断言**验证行为正确：① 注意力权重「相对感知」——query 与某 key 越像、权重越高；② 输出是 Value 的加权平均——某个头权重接近 1 时输出趋近对应 Value。最后和 PyTorch 官方实现对照，确认数值一致。

### 多头拆分与拼接

输入 X ∈ ℝ^{B×N×d_model}。投影成 Q/K/V（每 B×N×d_model），再 reshape 成多头 \`[B, h, N, d_k]\` 逐头算注意力，最后拼回 \`[B, N, d_model]\` 过一个输出投影 W_O。

\`\`\`python
import torch
import torch.nn as nn
import torch.nn.functional as F

class MHA(nn.Module):
    def __init__(self, d_model, n_heads, max_len=512, causal=True):
        super().__init__()
        assert d_model % n_heads == 0, "d_model 必须能被头数整除"
        self.h, self.d_k, self.causal = n_heads, d_model // n_heads, causal
        self.Wq = nn.Linear(d_model, d_model)
        self.Wk = nn.Linear(d_model, d_model)
        self.Wv = nn.Linear(d_model, d_model)
        self.Wo = nn.Linear(d_model, d_model)
        self.mask = (
            torch.tril(torch.ones(max_len, max_len)).bool()
            if causal
            else None
        )

    def _split(self, x):
        B, N, _ = x.shape
        return x.view(B, N, self.h, self.d_k).transpose(1, 2)  # [B,h,N,d_k]

    def forward(self, x):
        q, k, v = self._split(self.Wq(x)), self._split(self.Wk(x)), self._split(self.Wv(x))
        scores = q @ k.transpose(-2, -1) / (self.d_k ** 0.5)   # [B,h,N,N]
        if self.causal and self.mask is not None:
            m = self.mask[: N, :N][None, None]
            scores = scores.masked_fill(~m, float("-inf"))
        attn = F.softmax(scores, dim=-1)        # 注意力权重（可保存用于验证）
        out = self.Wo((attn @ v).transpose(1, 2).reshape(x.shape[0], N, -1))
        return out, attn

# 冒烟：构造「query 与某 key 强相关」的场景
torch.manual_seed(0)
model = MHA(d_model=64, n_heads=4, causal=False)
with torch.no_grad():
    x = torch.randn(1, 3, 64)
    x[0, 0] = 0.0   # 第 0 位置放「查询目标」
    out, attn = model(x)
    w = attn[0, 0, 0]  # 头 0 看第 0 位置时对各 key 的权重
    print("注意力权重和应为 1：", round(w.sum().item(), 3))
    print("第 0 位自注意力权重：", round(w[0].item(), 3))
\`\`\`

### 验收断言（可执行）

- **权重和为 1**：每个头、每个位置的注意力权重行归一，\`attn.sum(dim=-1) ≈ 1\`（数值误差 < 1e-4）。
- **相对感知**：把 \`q[0]\` 直接设成 \`k[0]\`（同向量），第 0 头第 0 位对 key 0 的权重应**显著高于**其它 key（其它 key 是随机，相似度低）。
- **数值一致性**：用同样的 q/k/v 分别过手写版与 \`F.scaled_dot_product_attention\`，输出 \`allclose(atol=1e-5)\`。
- **因果正确**：causal=True 时，下三角之外权重全为 0（\`attn[0,0,:]\` 上三角 ≈ 0）。

:::tip

### 为什么这两个验证有用

「权重和=1」验证 softmax 归一；「相对感知」验证 QK 点积确实编码了相似度（q≈k 时权重高）；「一致性」保证手写没写错 reshape/转置。三者一起，比「能跑通」强得多——能跑通只证明没崩，验证才证明行为对。

:::

### 与官方实现做数值一致性对照

把上面 MHA 内部那步 \`attn @ v\`，换成 PyTorch 官方的 \`F.scaled_dot_product_attention\`，用**同一组 q/k/v** 跑两边，比对输出：

\`\`\`python
def ref_sdpa(q, k, v, causal):
    # 官方实现，内部自动做缩放 + 可选 flash 加速
    return F.scaled_dot_product_attention(q, k, v, is_causal=causal)

torch.manual_seed(0)
B, h, N, d_k = 1, 4, 5, 16
q = torch.randn(B, h, N, d_k)
k = torch.randn(B, h, N, d_k)
v = torch.randn(B, h, N, d_k)

# 手写：把 MHA.forward 里的注意力那三行单独抽出来
scale = d_k ** -0.5
scores = q @ k.transpose(-2, -1) * scale
if True:
    scores = scores.masked_fill(~torch.tril(torch.ones(N, N)).bool()[None, None], float("-inf"))
manual = (F.softmax(scores, dim=-1) @ v)

ref = ref_sdpa(q, k, v, causal=True)
print("max 误差：", (manual - ref).abs().max().item())
assert torch.allclose(manual, ref, atol=1e-5), "手写与官方 SDPA 不一致"
# 通过说明：缩放系数、因果 mask、reshape/transpose 三处都没写错
\`\`\`

这段对照的价值在于：**它把「我写的公式」和「框架验证过的实现」绑在一起**。只要 \`allclose\` 通过，你就有底气说手写版数值正确；不通过时，先打印 \`scores\` 的 shape 与 mask，90% 的情况是 \`÷√d_k\` 漏了或 mask 方向反了。

### 为什么「÷√d_k」不能省

\`QK\` 点积是 d_k 个分量的乘积之和。当 d_k 较大时，点积方差随 d_k 增长，\`scores\` 会偏大，\`softmax\` 把概率几乎全压到单个最大项上（one-hot 化），梯度变得极小、训练卡住。除以 \`√d_k\` 把方差归一到 1，softmax 才保留「软」的分布。一个快速自检：打印 \`scores.std()\`，没缩放时远大于 1、缩放后约 1，就能确认这步生效了。

\`\`\`python
q = torch.randn(1, 64, 256)   # 故意 d_k=256 放大效应
k = torch.randn(1, 64, 256)
raw = q @ k.transpose(-2, -1)
scaled = raw / (256 ** 0.5)
print("未缩放 std：", raw.std().item(), " 缩放后 std：", scaled.std().item())
# 未缩放 std ≈ 16，softmax 几乎 one-hot；缩放后 std ≈ 1，分布变软
\`\`\`

### 多头拆分最容易写错的两处 reshape

把 Q/K/V 从 \`[B, N, d_model]\` 拆成 \`[B, h, N, d_k]\`，标准写法是**先 \`view\` 再 \`transpose\`**，顺序反了会张头串行：

\`\`\`python
def split_heads(x, h, d_k):
    B, N, _ = x.shape
    return x.view(B, N, h, d_k).transpose(1, 2)      # 正确：[B,h,N,d_k]

def merge_heads(attn_out, d_model):
    # attn_out: [B, h, N, d_k] → [B, N, d_model]
    B, h, N, d_k = attn_out.shape
    return attn_out.transpose(1, 2).reshape(B, N, h * d_k)
# 错误示范：x.view(B, h, N, d_k) 直接把前 d_model 维当 h 份切，
# 会把「头」与「维度」搞串，输出数值完全乱掉但形状不变——所以必须配一致性对照
\`\`\`

这也是为什么验收里要加「与官方 \`allclose\`」：reshape 错误往往**不报错、形状不变、只是数值错**，只有对照官方实现才暴露得出来。

### 把「因果 mask 的方向」用一个 5×5 例子钉死

因果掩码最容易写错的地方是「上三角还是下三角、True 还是 False」。用 5 个位置的例子把方向钉死：第 t 位**只能看到 0..t**（含自己），所以允许看的区域是**下三角**（行号 ≥ 列号）：

\`\`\`python
import torch
N = 5
allowed = torch.tril(torch.ones(N, N))      # 下三角为 1（允许看），上三角为 0
#   [[1 0 0 0 0]
#    [1 1 0 0 0]
#    [1 1 1 0 0]
#    [1 1 1 1 0]
#    [1 1 1 1 1]]
# 位置 3 看得到 0,1,2,3（自己与左边），看不到 4（右边/未来）
scores = torch.randn(N, N)
masked = scores.masked_fill(allowed.bool() == False, float("-inf"))
print("位置3对位置4的权重（应≈0）:", round(torch.softmax(masked, -1)[3,4].item(), 5))
\`\`\`

两个高频错法：① 把 \`tril\` 写成 \`triu\`（允许看的是上三角，等于「只能看未来」，直接废掉自回归）；② 把 mask 的 True/False 搞反（\`masked_fill(allowed, -inf)\` 会把**允许**的位置置 -inf）。自检口诀：**「第 3 行只有前 4 列有值」**，对着 5×5 的图核对一遍，方向错立刻显形。

### 输出是 Value 的加权平均：用「单头趋近 1」验证

注意力输出的本质是 \`out = Σ w_i · v_i\`——**每个位置的输出是它关心的那些 Value 的加权和**。当某个头对某个 key 的权重趋近 1 时，该头输出就趋近那个 key 的 Value。这个性质可以用一个刻意构造的场景验证：

\`\`\`python
# 构造：让第 0 个 key 与 query 几乎完全一致，其它 key 随机
q = torch.zeros(1, 1, 4)              # 查询是 4 维零向量
keys = torch.zeros(1, 1, 5, 4)        # 5 个 key
vals = torch.randn(1, 1, 5, 4)
keys[0,0,0] = torch.ones(4)           # key0 与 query 方向不同（query=0），
# 更直接：把 query 设成 key0 本身
q = keys[:, :, 0].clone()            # query == key0
attn = (q @ keys.transpose(-1,-2) / 4 ** 0.5)
w = attn.softmax(-1)
print("第0头对key0的权重（应接近1）:", round(w[0,0,0].item(), 3))
print("输出是否≈value0：", torch.allclose((w @ vals)[0,0], vals[0,0,0], atol=0.2))
\`\`\`

权重接近 1 且输出≈value0，就证明了「注意力 = 检索（按相似度加权）+ 聚合（加权求和 Value）」这件事。这也是 M2 讲注意力可解释性（把注意力权重当「模型在关注哪些词」）时的底层依据。

### 训练时的「并行」与推理时的「逐 token」差在哪

同一个手写 MHA，**训练**时一次前向把整段 \`[B, N, d_model]\` 喂进去、因果 mask 让每个位置只看左边，N 个位置的 loss 并行算完；**推理**时却是逐 token：每生成一个新 token，都要把新 token 的 K/V 追加进 KV cache、再跑一次注意力。这就是为什么 L13 要用 KV cache 把「历史 K/V」存下来、避免每步重算——本课时手写的 MHA 是「训练视角的一次性前向」，推理视角要等 L13。理解这个分界，后面 M2 全模块（KV 复用、FlashAttention、GQA 省 KV）都挂在同一棵树上。

### 把「缩放系数」写成一个可自检的量

\`scores / (d_k ** 0.5)\` 这一行最容易漏掉或写错（漏了会让 softmax 饱和、写错系数会让注意力分布偏软）。自检办法：打印缩放前后 \`scores\` 的标准差，没缩放时随 d_k 增长（几十），缩放后约 1：

\`\`\`python
torch.manual_seed(2)
d_k = 128
q = torch.randn(1, 1, 5, d_k)
k = torch.randn(1, 1, 5, d_k)
raw = q @ k.transpose(-2, -1)
print("缩放前 std：", round(raw.std().item(), 1), " 缩放后 std：", round((raw / d_k ** 0.5).std().item(), 3))
# 缩放前 std≈√d_k（数十），softmax 近乎 one-hot；缩放后 std≈1，分布变软、梯度可用
\`\`\`

这个自检能同时验证「缩放有没有做」与「系数对不对」——若缩放后 std 仍远大于 1，多半漏了除以 \`√d_k\` 或除的常数写错。

### 手写的 MHA 与 L05 的 GQA 怎么接

本课时的 \`MHA\` 里 Q/K/V 都是 \`d_model×d_model\`（每查询头配一组 K/V）。要把它升级成 L05 的 GQA，**只改三处**：① \`Wk/Wv\` 的输出维度从 \`d_model\` 降到 \`g·d_h\`；② reshape 时 K/V 拆成 \`g\` 个头（不是 \`n_h\`）；③ 计算前用 \`repeat\` 把 K/V 广播成 \`n_h\` 个逻辑头。查询头（Q）数量与输出投影 \`Wo\` 完全不变。也就是说 L05 的 GQA 不是「另一种注意力」，而是**对本课时 MHA 的 K/V 投影维度做了一次降维 + 广播**——理解了这一点，L05 的 \`k.repeat(...)\` 就不再神秘。

### 两个最容易「形状对、数值错」的坑

验收里反复强调 \`allclose\`，是因为下面两处错误**不会让程序崩、形状也不变，只是数值错**：

- **\`÷√d_k\` 漏掉或系数错**：数值上注意力被压成近似 one-hot，模型学不动但「能跑」。
- **\`view\` 与 \`transpose\` 顺序反了**：\`view(B,N,h,d_k)\` 才是对的；若误写 \`view(B,h,N,d_k)\` 且维度恰好能被整除，程序不报维数错，但「头」与「维度」被串掉，输出全乱。

这两处都用「对照官方 \`F.scaled_dot_product_attention\`」一招暴露——所以验收里那行 \`allclose\` 不是形式，而是这两类「隐形错」的唯一可靠探测器。

### 把「手写 + 验证 + 对照官方」当作这一课的收束

回看本课时，你手写了一个**能跑、能验证、能对照官方**的多头注意力：QKV 投影 → 多头拆分 → 缩放点积 → 因果 mask → softmax → 加权 Value → 输出投影，每一步都配了可执行断言（权重和=1、相对感知、因果正确、数值一致）。这套「手写 + 行为断言 + 官方对照」的三件套，是后面 L09 手写 RMSNorm、L10 手写 RoPE 的**同一套方法论**：不只是「写出来」，而是「写得对、能证明它对」。把这个习惯带进后面每节课，你对每个组件的理解都会从「读过公式」升级成「能复现、能验证」——这也是整个 M1 模块反复强调的核心纪律。

:::tip

### 把这一课当作「注意力黑盒」的拆解起点

到此你已能手写并验证 MHA 的核心。下一步 L07 会补上 FFN，把「注意力 + FFN」拼成完整 block；L08 讲 Pre-Norm 与 RMSNorm；L10 把可学习位置编码换成 RoPE。这一课的手写 MHA 是那三课的**地基**——后面每加一层，都是在它上面叠，所以先把这块拆明白。

:::
`,
    null,
    [
      {
        text: '多头注意力里输入 X 经过 QKV 投影后 reshape 成的形状是？',
        options: ['[B, N, h, d_k]', '[B, h, N, d_k]', '[h, N, d_k]', '[B, d_model]'],
        answer: 1,
        explain: 'view(B,N,h,d_k) 再 transpose(1,2) 得到 [B,h,N,d_k]，让 h 个头各自独立算注意力。',
        concept: 'mha-impl',
      },
      {
        text: '验证注意力「相对感知」最直接的实验是？',
        options: [
          '随机输入看输出',
          '把 query 设成某 key 的同向量，检查该 key 权重上升',
          '关掉因果掩码',
          '增大 d_k',
        ],
        answer: 1,
        explain: 'q≈k 时点积最大、softmax 后权重最高，直接验证 QK 点积编码了相似度。',
        concept: 'mha-impl',
      },
      {
        text: '每个头每个位置的注意力权重行满足？',
        options: ['和为 0', '和为 1（softmax 归一）', '最大为 1', '无约束'],
        answer: 1,
        explain: 'softmax 输出是概率分布，行内权重和为 1，可用于数值验证。',
        concept: 'mha-impl',
      },
      {
        text: '对照 PyTorch 官方实现确认正确时，输出应满足？',
        options: ['完全相同到比特', 'allclose（数值误差 < 1e-5 量级）', '只是形状一致', '无法对照'],
        answer: 1,
        explain: '浮点实现会有微小差异，用 allclose 判定数值一致，而非要求逐位相同。',
        concept: 'mha-impl',
      },
    ],
    [
      ['QKV 投影', '把输入线性映射成 Query/Key/Value 三套坐标'],
      ['因果掩码', '下三角 True 的掩码，让第 t 位只看 0..t'],
      ['相对感知', 'query 与某 key 越像、该 key 注意力权重越高的行为'],
      ['多头拆分', '把 d_model 切 h 份、每份独立算注意力再拼接'],
    ],
    [
      'reshape 与 transpose 顺序写反——先 view 再 transpose(1,2)，顺序错会张头串行。',
      '忘记 ÷√d_k——点积偏大让 softmax 饱和，权重趋于 one-hot、梯度消失。',
      'causal=True 却用 `tril` 全 1 掩码——上三角没置 -inf，会「看到未来」。',
      '只验证「能跑通」不验证数值——能跑只证明没崩，权重和=1 与一致性才证明行为对。',
    ],
  ),
  'practice',
)
