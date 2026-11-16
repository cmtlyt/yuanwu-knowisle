import { L, withKind } from '../../course-builders.ts'

export const L14 = withKind(
  L(
    'L14',
    5,
    'SwiGLU 门控 FFN 细节：门控选择性放大/抑制',
    3,
    ['L07'],
    ['swiglu-ffn'],
    [
      '写清 SwiGLU 的完整三条投影 down(Swish(x·W_gate)⊙(x·W_up)) 与 Swish 定义',
      '对照单路 GELU/ReLU FFN，说清「门控支路 + 馈送支路相乘」在做什么',
      '解释同参数量下 SwiGLU 困惑度常低于单路 GELU 的原因（选择性门控）',
      '说明为何 LLaMA 系把它定为标准 FFN、以及它仍是 M3 MoE 的改造目标',
    ],
    `
### SwiGLU 的完整形式

L07 给了「FFN 是 block 大头」的结论，本课时把 **SwiGLU 这条门控 FFN 的细节**讲透（00098 缺口 M1-c）。LLaMA 系（arXiv:2302.13971 / 2407.21783）的标准 FFN 是：

    FFN(x) = W_down · [ Swish(x·W_gate) ⊙ (x·W_up) ]

三条投影、**不带 bias**：
- **馈送支路** \`x·W_up\`：把输入映射到中间维 d_ff，是「要传什么内容」。
- **门控支路** \`Swish(x·W_gate)\`：先投影再用 Swish 非线性，产生一个「门」——逐元素取值为正负。
- **逐元素相乘** \`⊙\`：门控 × 馈送，等于「按门的大小放大或抑制馈送的每个维度」。
- **输出投影** \`W_down\`：把 d_ff 投回 d_model。

其中 **Swish(x) = x·σ(x)**（σ 是 sigmoid），也叫 SiLU。和 ReLU 不同，Swish 在负区有小的负值、在正区趋近 x，**平滑且有界负部**，比 ReLU 更适合门控。

:::deep

### 门控在「选择性放大/抑制」

单路 GELU FFN：\`GELU(x·W1)·W2\`，一条路决定「传什么」。SwiGLU 把它拆成**两条路再相乘**：馈送路给「内容」，门控路给「开多大」。逐元素乘的效果是——对每个隐藏维，门控信号决定这一维的馈送值**放大还是压制**：门为正且大 → 该维通过；门为负 → 被抑制甚至反相。这相当于一个**数据相关的、软性的特征选择器**，比固定阈值的 ReLU/GELU 更灵活，能在同参数量下拟合更细的关系，这就是「同参困惑度更低」的直觉来源。

代价是**多一条投影**（W_gate 与 W_up 两条，加 W_down 共三条），比单路（W1、W2 两条）多 ~1.5 倍参数。所以 L07 把中间维缩到 \`8/3·d_model\` 对齐旧配方参数量——**用「更窄但门控」换「更宽但单路」**。

:::

\`\`\`python
# 概念：SwiGLU vs 单路 GELU FFN（参数与门控行为对照）
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

class GELUFFN(nn.Module):
    def __init__(self, d_model, d_ff):
        super().__init__()
        self.fc1 = nn.Linear(d_model, d_ff, bias=False)
        self.fc2 = nn.Linear(d_ff, d_model, bias=False)
    def forward(self, x):
        return self.fc2(F.gelu(x @ self.fc1.weight.T))

# 参数对照：等参设计（SwiGLU 中间维 8/3·d_model，GELU 中间维 4·d_model）
d_model, d_ff_gelu = 768, 4 * 768
d_ff_swiglu = int(round(8 / 3 * d_model))
p_swiglu = 3 * d_model * d_ff_swiglu
p_gelu = 2 * d_model * d_ff_gelu
print("SwiGLU 参数:", p_swiglu, " GELU 参数:", p_gelu, "（同参设计）")

# 门控行为：把馈送向量某个维放大、另一维抑制
torch.manual_seed(0)
x = torch.randn(1, d_model)
s = SwiGLUFFN(d_model, d_ff_swiglu)
with torch.no_grad():
    gate = swish(x @ s.gate.weight.T)   # 门
    up = x @ s.up.weight.T              # 馈送
    print("门控值范围（正负）：", round(gate.min().item(), 2), "到", round(gate.max().item(), 2))
    print("门控为负的那些维：馈送被抑制/反相（选择性特征选择）")
\`\`\`

对照 LLaMA 官方：FFN = SwiGLU、无 bias、中间维 \`8/3·d_model\`（round 到 64 倍数）；同参下比 ReLU/GELU 单路困惑度更低，故被定为标准。注意它仍是**逐位置 dense FFN**，省算力要靠 M3 把它换成稀疏门控专家（MoE 的改造目标正是这块大头）。

### 门控支路为什么「数据相关」

SwiGLU 的门控支路 \`Swish(x·W_gate)\` 不是固定阈值（ReLU 那样 0 一刀切），而是**随输入 x 变化**的：同一个隐藏维，输入不同、门开的大小不同。这意味着同一个 token 在句子不同位置、上下文不同，FFN 对它的「放大/抑制」模式也不同——这是 SwiGLU 比 GELU/ReLU 表达力更细的根子。门控把「选哪些特征」从「固定的激活形状」升级成「由网络自己学出来的软开关」，代价是多一条投影（L07 的 8/3 对齐就是为这条投影买单）。

### 同参为什么 SwiGLU 困惑度更低

把「两条路相乘」理解成一个**门控门限**：GELU 单路只能「按非线性形状决定传多少」，而 SwiGLU 额外给了一个**独立的门**去调每个维的通过量。多出来那 1/3 的容量（多一条投影）换来的不是「更宽」，而是「同一宽度下更细的特征选择」，因此同参数量下拟合更准、困惑度更低。LLaMA 据此把 SwiGLU 定为标准 FFN；但要记住它**不省 FLOPs**（每个 token 仍走满 dense FFN），真正省算力的是 M3 的稀疏激活——把这条 dense 大头改成「每 token 只激活少数专家」。

### 把 SwiGLU 写进 MoE 视角：它就是 M3 的改造对象

L07/L14 反复强调「FFN 是 block 参数大头」。M3 MoE 做的事，精确来说是**把 SwiGLU 这条 dense FFN 复制成 N 份（N 个专家），再配一个门控每 token 只激活其中 top-k 个**：

- **总参数变大**：N 个 SwiGLU 专家的参数量总和远大于一个 dense FFN，模型的「知识容量」随之放大（M3 的主卖点：容量随内存、可堆到很大）。
- **激活参数不变**：单 token 只过 top-k（通常 k=2）个专家，实际算的 FLOPs 与一个「k 专家宽度的 dense FFN」相当，没有随总参数线性涨。

这就是「容量解耦算力」的实现：SwiGLU 这块 dense 大头是 M3 唯一改造对象，注意力、RMSNorm、残差全不动。理解了 SwiGLU 是「可复制成专家的 dense FFN 单元」，后面 M3 的细粒度专家、top-k 门控、负载均衡 loss 都是在这块大头上做文章，不会显得凭空冒出。

### SwiGLU 的「无 bias」约定

LLaMA 系 SwiGLU 三条投影**全不带 bias**（\`bias=False\`），这是 LLaMA 论文的明确约定，不是随手写的。原因与 Pre-Norm + RMSNorm 一脉相承：归一化已经压住各维尺度，FFN 的 bias 提供的「逐维平移」收益很小，去掉它省参数、省一次加法，实测不影响困惑度。所以验收里特意列了「保留 bias」这个坑——它不是 bug，但违反 LLaMA 标准配方。

:::tip

### 把 L07 与 L14 合起来记

L07 回答「为什么 FFN 是大头、SwiGLU 是什么」（宏观定位 + 8/3 对齐来源），L14 回答「SwiGLU 这条门控在做什么、为何同参更准」（微观机制 + 门控选择性 + 无 bias 约定 + M3 视角）。两课合起来才是完整的「FFN 知识包」：先知道它在 block 里占多大、为什么占大头（L07），再知道它内部怎么工作、为什么这样工作（L14），最后接上 M3 的稀疏化（L14 的 MoE 视角）。这条链子记住了，M3 模块就不会断。

:::
`,
    null,
    [
      {
        text: 'SwiGLU FFN 的三条投影是？',
        options: ['W1、W2、bias', 'W_gate、W_up、W_down（无 bias）', 'Q、K、V', 'gate、up、bias'],
        answer: 1,
        explain: 'SwiGLU 是 gate/up/down 三条无 bias 投影：门控支路 + 馈送支路相乘，再投回 d_model。',
        concept: 'swiglu-ffn',
      },
      {
        text: '门控支路 Swish(x·W_gate) 的作用是？',
        options: ['提供要传的内容', '逐元素决定馈送支路每个维放大/抑制', '降维', '加位置'],
        answer: 1,
        explain: '门控产生逐元素「开多大」的信号，与馈送相乘做数据相关的软特征选择。',
        concept: 'swiglu-ffn',
      },
      {
        text: 'Swish(x) 的表达式是？',
        options: ['max(0,x)', 'x·σ(x)（sigmoid）', 'tanh(x)', 'σ(x)'],
        answer: 1,
        explain: 'Swish/SiLU = x·σ(x)，负区有小的有界负值、正区趋近 x，比 ReLU 平滑。',
        concept: 'swiglu-ffn',
      },
      {
        text: 'SwiGLU 比单路 GELU 多一条投影，为对齐旧配方把中间维设为？',
        options: ['4·d_model', '8/3·d_model', 'd_model', '2·d_model'],
        answer: 1,
        explain: '门控 3 矩阵比单路 2 矩阵多 ~1.5 倍参数，缩到 8/3·d_model 让总参量对齐旧 ReLU/GELU 配方。',
        concept: 'swiglu-ffn',
      },
    ],
    [
      ['SwiGLU', '门控激活 FFN：down(Swish(xW_gate)⊙(xW_up))，LLaMA 系标准'],
      ['Swish / SiLU', 'x·σ(x) 平滑门控激活，负区有界'],
      ['馈送支路', 'x·W_up 提供要传的「内容」'],
      ['门控支路', 'Swish(x·W_gate) 提供逐元素「放大/抑制」门'],
    ],
    [
      '把 SwiGLU 当成「两条路相加」——它是**相乘**（门控×馈送），语义完全不同。',
      '保留 bias——LLaMA 系 SwiGLU 三条投影都不带 bias。',
      '用 4·d_model 中间维跑 SwiGLU 期望省参——多一条投影会超参，要缩到 8/3。',
      '以为 SwiGLU 省了算力——它省的是显存/参数对齐，省 FLOPs 要靠 M3 MoE 的稀疏激活。',
    ],
  ),
  'theory',
)
