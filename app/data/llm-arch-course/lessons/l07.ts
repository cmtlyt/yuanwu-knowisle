import { L, withKind } from '../../course-builders.ts'

export const L07 = withKind(
  L(
    'L07',
    2,
    'FFN 是 block 大头：SwiGLU 与中间维度 8/3·d_model',
    3,
    ['L01'],
    ['ffn'],
    [
      '说清 FFN 为什么是 Transformer block 的参数量大头（常 2/3+）',
      '写出现代 LLM 的 SwiGLU FFN：down(Swish(x·W_gate)⊙(x·W_up)) 的三条投影',
      '解释「中间维度取 8/3·d_model」的来源（与 GELU-ReLU 单路 FFN 等参对照）',
      '点明 FFN 是 M3 MoE 的改造目标——把 FFN 换成稀疏专家库',
    ],
    `
### 为什么 FFN 是参数量大头

每个 Transformer block 里，注意力层的参数是 Q/K/V/O 四个 \`d_model×d_model\` 矩阵，约 \`4·d_model²\`；而 FFN（逐位置前馈）默认是「\`d_model → 4·d_model → d_model\`」两个大矩阵，约 \`8·d_model²\`。**FFN 的参数量约为注意力层的 2 倍**，整层里常占到 2/3 以上。这就是 M3 把「FFN 换成稀疏门控专家」作为 MoE 切入点的原因——**省的是 FFN 这块大头**。

### 原文 FFN vs 现代 SwiGLU

2017 原文用 \`FFN(x) = max(0, x·W_1 + b_1)·W_2 + b_2\`（ReLU 单路，中间维 4·d_model）。现代 LLM（GPT-3 起、LLaMA 全系）改成 **SwiGLU 门控**：

    FFN(x) = W_down · ( Swish(x·W_gate) ⊙ (x·W_up) )

它把 FFN 从「一条非线性」变成「一条门控 + 一条馈送相乘」：\`Swish\`（= x·σ(x)）产生门控信号，\`⊙\` 做逐元素乘法，让网络能**选择性放大/抑制**某些维度。代价是多一条投影（\`W_gate\`、\`W_up\`、\`W_down\` 三条，每条 \`d_model × d_ff\`）。

:::deep

### 「中间维度 8/3·d_model」是怎么来的

门控 FFN 有 3 个矩阵，比单路 2 个矩阵多约 1.5 倍参数。为了**总参数量与旧的 ReLU-GELU FFN 持平**（旧的是 2·4·d_model·d_ff = 8·d_model·d_ff 里 d_ff=4·d_model），把新 FFN 的中间维 d_ff 调小到 **≈ 8/3 · d_model**，这样 3·(8/3·d_model)·d_model = 8·d_model²，与旧 2·(4·d_model)·d_model 等参。这就是「LLaMA 用 \`hidden_dim=8/3·d_model\` 且 round 到 64 的倍数」的来源。SwiGLU 在同参数量下通常比 ReLU/GELU 单路困惑度更低——LLaMA 论文据此把它定为标准配方。

:::

\`\`\`python
# 概念：SwiGLU FFN（PyTorch）
import torch
import torch.nn as nn
import torch.nn.functional as F

def swish(x):
    return x * torch.sigmoid(x)

class SwiGLUFFN(nn.Module):
    def __init__(self, d_model, d_ff):
        super().__init__()
        self.gate = nn.Linear(d_model, d_ff, bias=False)
        self.up = nn.Linear(d_model, d_ff, bias=False)
        self.down = nn.Linear(d_ff, d_model, bias=False)

    def forward(self, x):
        return self.down(swish(x @ self.gate.weight.T) * (x @ self.up.weight.T))

# 中间维 8/3·d_model，且 round 到 64 的倍数（LLaMA 配方）
d_model = 4096
d_ff = int(round(8 / 3 * d_model / 64) * 64)
print("SwiGLU d_ff =", d_ff)

# 参数量对照：等参设计下 SwiGLU 与旧 ReLU FFN 谁多
params_swiglu = 3 * d_model * d_ff            # 三条投影
params_relu   = 2 * d_model * (4 * d_model)  # 旧两路 d_ff=4*d_model
print("SwiGLU 参数:", params_swiglu, " 旧ReLU 参数:", params_relu)
\`\`\`

### FFN 宽度与「宽度优先」的直觉

FFN 是逐位置独立计算的，它的**宽度 d_ff** 直接决定单块的表达能力：加宽 = 让每个位置「记住」更多知识切片，加深层数 = 让信息在位置之间多走几轮。经验上 LLM 训练偏「宽而非深」——LLaMA 7B 是 32 层、d_ff 约 1.4 万，把容量摊到较宽的单层里；GPT-3 则相反，更深更窄。两者都是「总参数约 70 亿、层数与宽度的组合不同」。选宽 FFN 的理由：FFN 是参数大头，**把预算花在 FFN 宽度上，比花在注意力头数上性价比更高**——因为注意力主要建「关系」，FFN 主要存「知识」，知识容量靠宽度堆。

:::deep

### 为什么 FFN 是 MoE 的天然改造点

把「FFN 是 block 大头」这条结论往 M3 推一步就明白了：MoE 不碰注意力（那是「看哪里」，必须 dense），而是把 FFN 换成**一群专家**，每个 token 只激活其中少数几个（top-k 门控）。这样**总参数量（专家总和）可以做到很大**、但**单 token 实际算的激活参数少**——「容量随内存、算力随激活」的解耦就是这么来的。换句话说，M3 的整套稀疏化设计，前提正是本课时讲的「FFN 占参数大头、是主要的知识容器」。把这条链子接上，后面 MoE 模块（L27 起）才不会显得凭空冒出。

:::

对照 LLaMA 官方（arXiv:2302.13971 / 2407.21783）：FFN 用 SwiGLU、中间维 \`8/3·d_model\`（round 到 64 倍数）、不带 bias；这是整块参数量占比最高的一块，也是 M3 稀疏门控的改造目标。

### 把「FFN 占大头」算成一张精确的账

把 7B 级 LLaMA 的一个 block 参数拆开（\`d_model=4096\`，SwiGLU 中间维按 8/3·d_model ≈ 10922 并 round 到 10944）：

\`\`\`python
d_model = 4096
n_h = 32
d_ff  = int(round(8/3 * d_model / 64)) * 64        # ≈ 10944
p_attn = (4 * n_h * (d_model // n_h)) * d_model    # Q/K/V/O 合计 = 4·d_model²
p_ffn  = 3 * d_model * d_ff                         # SwiGLU 三条投影
print(f"注意力 {p_attn:,}  FFN {p_ffn:,}  FFN 占比 {p_ffn/(p_attn+p_ffn):.0%}")
# FFN 占比通常 65%~70%，这就是「MoE 只动 FFN」的算术根据
\`\`\`

这张账解释了为什么 M3 把稀疏化精确瞄准 FFN：动注意力省的是「关系建模的算力」，动 FFN 省的是「知识存储的算力」，后者占比大得多，所以稀疏化 ROI 最高。

### Swish 相对 ReLU/GELU 的三个直觉差异

SwiGLU 的门控用的是 \`Swish(x) = x·σ(x)\`（也叫 SiLU），它相对 ReLU/GELU 有三个值得记住的差异：

- **负半轴有非零输出**：ReLU 在 x<0 时直接为 0（「死神经元」风险），Swish 在负半轴有小的负值再平滑归零，让梯度不会突然断掉。
- **门控语义更自然**：\`Swish(x·W_gate)\` 天然输出「接近 0 到 1 之间（可负）」的权重，逐元素乘 \`⊙\` 另一支路，等价于「让门控支路决定每个维度该放大还是抑制」，比单路的「激活后直接投回去」多一层选择。
- **同参数下表达力更高**：多出来的那条支路（gate）让模型在相同 FLOPs 预算下能学到更精细的非线性，这是 LLaMA 把 SwiGLU 定成标准的经验依据——同参数量困惑度通常更低。

### 为什么 FFN 能「逐位置独立」却存下全局知识

FFN 在每个位置**独立**地做 \`x → SwiGLU(x) → x\`，看似只看局部，为什么能承载「整个训练集的事实知识」？关键在于：FFN 的线性层权重是**跨所有位置共享**的——同一个 \`W_gate/W_up/W_down\` 作用在序列里每个位置上。于是每个位置「读到的知识」其实是这组共享权重编码的**全局统计规律**：某个词元（query）进来，FFN 就根据共享权重查出一套「关于这个 token 的通用知识」。把 FFN 理解成「一张查表式的知识存储 + 选择性激活」，就明白为什么 M3 要保留 FFN 的总容量（专家库）而只降单 token 激活量——**知识要存得多，查得可以稀疏**。
`,
    null,
    [
      {
        text: '一个 Transformer block 里参数量占比通常更高的是？',
        options: ['注意力层', 'FFN（逐位置前馈）', '残差连接', 'LayerNorm'],
        answer: 1,
        explain:
          'FFN 约 8·d_model²（4×d 中间维两路矩阵），约为注意力层 4·d_model² 的两倍，是 MoE 的改造目标。',
        concept: 'ffn',
      },
      {
        text: 'SwiGLU FFN 的输出形式是？',
        options: ['ReLU(x·W1)·W2', 'down(Swish(x·W_gate)⊙(x·W_up))', 'tanh(x)', 'x·W+ b'],
        answer: 1,
        explain: '门控：Swish 出门控、逐元素乘馈送支路，再投回 d_model；比单路多一条投影。',
        concept: 'ffn',
      },
      {
        text: 'SwiGLU 中间维常取 8/3·d_model，主要是为了？',
        options: ['参数更多', '与旧的 ReLU/GELU 单路 FFN 总参数量持平', '省算力', '增大头数'],
        answer: 1,
        explain: '门控 3 矩阵比单路 2 矩阵多 ~1.5 倍参数，把 d_ff 缩到 8/3·d_model 让总参量对齐旧配方。',
        concept: 'ffn',
      },
      {
        text: 'M3 MoE 把哪一块换成稀疏专家库？',
        options: ['注意力', 'FFN（逐位置前馈）', 'LayerNorm', '位置编码'],
        answer: 1,
        explain: 'FFN 是参数大头，MoE 用「门控选少数专家」把它改成按 token 稀疏激活，省算力。',
        concept: 'ffn',
      },
    ],
    [
      ['FFN', '逐位置前馈网络，块内参数大头，MoE 的改造目标'],
      ['SwiGLU', '门控激活 Swish(x)·σ(x)，三条投影的 FFN，现代 LLM 标准'],
      ['中间维', 'FFN 隐藏层宽度，LLaMA 取 8/3·d_model 并 round 到 64 倍数'],
      ['门控', '一条支路产生门控信号逐元素乘另一支路，选择性放大/抑制'],
    ],
    [
      '以为注意力层参数最多——FFN 才是大头（约注意力 2 倍）。',
      '把 d_ff 直接设 4·d_model 用 SwiGLU——总参量比旧配方多 ~1.5 倍，要缩到 8/3。',
      '保留 bias——LLaMA 系 SwiGLU 全不带 bias。',
      '用 SwiGLU 就「自动省算力」——它只省内存/显存不省 FLOPs，省算力靠的是 M3 MoE 的稀疏激活。',
    ],
  ),
  'theory',
)
