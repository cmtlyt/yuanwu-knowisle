import { L, withKind } from '../../course-builders.ts'

export const L46 = withKind(
  L(
    'L46',
    20,
    '原理深挖：RWKV/RetNet/Performer 状态数学',
    4,
    ['L38', 'L41'],
    ['linear-rnn-principle'],
    [
      '推导 RWKV 的 channel-directed 线性注意力与时间衰减',
      '讲清 RetNet retention 三范式',
      '解释 Performer FAVOR+ 核化避开 N×N',
      '逐家说明「为什么线性、省什么」',
    ],
    `### 三家如何「避开 N×N」：共同的野心与不同路径

L41 给出了线性注意力的共同公式 $\\varphi(Q)(\\varphi(K)^\\top V)$，它靠结合律把 $L\\times L$ 的注意力矩阵换成 $d\\times d$ 的状态。RWKV、RetNet、Performer 是这条路上的三种典型，差别在**「状态怎么更新、为什么线性、省了什么」**这三问上。RWKV 把状态写成**逐通道的加权和**（WKV 机制），衰减是逐通道向量；RetNet 把状态写成**带固定衰减 $\\gamma$ 的矩阵**（retention），并给出并行/递推/分块三种算法；Performer 则用**随机特征**去近似 softmax 核，根本不显式构造注意力矩阵。三者都做到序列复杂度线性、推理状态恒定，但「线性」的来源与省下的东西各有侧重。这一课逐家推导状态更新方程，把三问钉死。

### RWKV：通道定向的线性注意力与时间衰减

RWKV（arXiv:2305.13048）的 WKV（weighted key-value）机制是逐通道的 RNN 递推。对每个通道 $c$，它维护两个标量状态（分子 \`num\`、分母 \`den\`），按下面的规则更新：

$\\mathrm{num}_t = e^{-w_c}\\,\\mathrm{num}_{t-1} + e^{u_c + k_t^c}\\,v_t^c,\\qquad \\mathrm{den}_t = e^{-w_c}\\,\\mathrm{den}_{t-1} + e^{u_c + k_t^c},\\qquad \\mathrm{wkv}_t^c=\\dfrac{\\mathrm{num}_t}{\\mathrm{den}_t}$

这里 $w_c$ 是**逐通道时间衰减曲线**（$e^{-w_c}<1$，越久远的贡献衰减越多），$u_c$ 是**当前 token 的通道加成**（让当前位置在竞争中有额外权重）。「channel-directed linear attention」这个名字就来自 $w,u$ 是**每个通道独立**的向量：不同通道以不同速度遗忘、以不同方式看重当前，从而表达多尺度的时序模式。**为什么线性**：这是标量的指数加权递推，每步 $O(C)$（$C$ 为通道数），序列总 $O(L)$，没有 $L\\times L$。**省什么**：推理只需保存 \`num\`、\`den\` 两个 $C$ 维向量，恒定内存、无 KV。下面这段实现 WKV 递推，并验证「状态定长」与「$w$ 越大遗忘越快」。

\`\`\`python
import numpy as np
np.random.seed(0)
T, C = 20, 8
w = np.linspace(0.05, 1.0, C)        # 逐通道不同衰减：通道0几乎不忘，通道7忘得快
u = 0.3 * np.ones(C)                 # 当前加成
k = np.random.randn(T, C); v = np.random.randn(T, C)

def wkv_recurrent(k, v, w, u):
    num = np.zeros(C); den = np.zeros(C); outs = []
    for t in range(T):
        cur = np.exp(u + k[t])
        num = np.exp(-w) * num + cur * v[t]
        den = np.exp(-w) * den + cur
        outs.append(num / (den + 1e-9))
    return np.array(outs), num, den

outs, num, den = wkv_recurrent(k, v, w, u)
print("状态形状 num/den:", num.shape, den.shape, "（定长 C，与 T 无关）")
print("远端贡献随 w 增大而减小：通道0 w=%.2f → num=%.2f；通道7 w=%.2f → num=%.2f" %
      (w[0], num[0], w[-1], num[-1]))
assert num.shape == (C,) and den.shape == (C,), "WKV 状态必须定长"
assert num[0] > num[-1], "w 小的通道应保留更多历史"
print("结论：WKV 用逐通道衰减把历史压进定长状态，线性且恒定内存")
\`\`\`

\`num\`、\`den\` 形状恒为 $(C,)$，与 $T$ 无关；$w$ 小的通道（0 号）保留更多历史、$w$ 大的通道（7 号）忘得更快——「逐通道多尺度记忆」由此而来。这就是 RWKV 的状态数学：**两个标量状态 + 逐通道衰减 = 恒定内存 + 线性复杂度**。

### RetNet：带衰减的矩阵状态与三范式

RetNet（arXiv:2307.08621）把状态升级成 $d\\times d$ 的矩阵 $S$，更新规则是：

$S_t=\\gamma\\,S_{t-1}+k_t^\\top v_t,\\qquad o_t=q_t\\,S_t$

其中 $\\gamma\\in(0,1)$ 是**固定标量衰减**（与 Mamba 的输入相关 $\\Delta$ 不同）。展开 $S_t=\\sum_{i\\le t}\\gamma^{t-i}k_i^\\top v_i$，输出 $o_t=\\sum_{i\\le t}\\gamma^{t-i}(q_t k_i^\\top)v_i$——又是一带衰减掩码的线性注意力。**为什么线性**：递推形式每步 $O(d^2)$、序列 $O(Ld^2)$。**省什么**：推理只需保存矩阵 $S$，恒定内存。

RetNet 的特色是**三范式**：
- **并行（parallel）**：写成 $\\big(QK^\\top\\odot D\\big)V$，$D_{ti}=\\gamma^{t-i}\\mathbf{1}[i\\le t]$ 是衰减掩码，可并行训练（不过这仍是 $O(L^2)$ 形式，长序列靠分块缓解）。
- **递推（recurrent）**：上式 $S_t=\\gamma S_{t-1}+k_t^\\top v_t$，推理 $O(1)$ 状态。
- **分块（chunkwise）**：块内并行、块间递推，兼顾训练并行与推理省内存。

三种形式数学等价，只是算法组织不同。下面这段验证「递推」与「并行」两种形式算出同一个输出，体现三范式的一致性。

\`\`\`python
import numpy as np
np.random.seed(1)
L, d = 12, 4
gamma = 0.85
q = np.random.randn(L, d); k = np.random.randn(L, d); v = np.random.randn(L, d)

# 递推形式
S = np.zeros((d, d)); o_rec = []
for t in range(L):
    S = gamma * S + np.outer(k[t], v[t])
    o_rec.append(q[t] @ S)
o_rec = np.array(o_rec)

# 并行形式：(QK^T ⊙ D) V
D = np.tril(np.power(gamma, np.arange(L)[:, None] - np.arange(L)[None, :]))
o_par = ((q @ k.T) * D) @ v

print("递推 vs 并行最大误差:", np.max(np.abs(o_rec - o_par)))
assert np.allclose(o_rec, o_par, atol=1e-9), "RetNet 三范式必须数值等价"
print("S 形状:", S.shape, "恒定；结论：RetNet 用矩阵状态 + γ衰减，训练并行、推理 O(1)")
\`\`\`

误差为零印证了 RetNet 的核心卖点：**同一套数学，训练用并行形式吃满算力，推理用递推形式保持恒定状态**，chunkwise 则是两者的折中。$S$ 是 $d\\times d$ 矩阵、定长，推理内存与 $T$ 无关。要注意 $\\gamma$ 是固定的：它不像 Mamba 的 $\\Delta_t$ 那样随输入自适应，所以 RetNet 的「选择性」弱于 Mamba——这是它在与 Mamba 竞争时的主要短板。

### Performer：FAVOR+ 核化避开 N×N

Performer（arXiv:2009.14794）走的是完全不同的路：不设计特殊递推，而是**用随机特征近似 softmax 本身**。它利用恒等式 $\\exp(q\\cdot k)=\\mathbb{E}_{\\omega\\sim\\mathcal{N}(0,I)}\\big[\\exp(\\omega\\cdot q-\\tfrac{\\|q\\|^2}{2})\\exp(\\omega\\cdot k-\\tfrac{\\|k\\|^2}{2})\\big]$，用 $m$ 个从正态分布采样的随机向量 $\\omega_j$ 做蒙特卡洛估计，构造特征映射：

$\\varphi(x)=\\exp\\Big(-\\tfrac{\\|x\\|^2}{2}\\Big)\\big[\\exp(\\omega_1\\cdot x),\\dots,\\exp(\\omega_m\\cdot x)\\big]$

于是 $\\mathrm{softmax}(QK^\\top)V\\approx D^{-1}\\varphi(Q)\\big(\\varphi(K)^\\top V\\big)$，$D=\\varphi(Q)\\sum_j\\varphi(k_j)$ 是归一化分母。**为什么线性**：先算 $\\varphi(K)^\\top V$（$m\\times d$），再左乘 $\\varphi(Q)$，复杂度 $O(Lmd)$，避开 $L\\times L$；$m$ 是随机特征数（常数级，通常数百）。**省什么**：省掉 $L\\times L$ 注意力矩阵的内存与计算。FAVOR+ 的改进是用**正交随机特征**（对采样向量做正交化）降低估计方差，使较小的 $m$ 就有好近似。下面这段实现 FAVOR+ 风格的核近似，验证「$m$ 越大越接近精确 softmax」。

\`\`\`python
import numpy as np
np.random.seed(2)
L, d = 24, 8
Q = np.random.randn(L, d); K = np.random.randn(L, d); V = np.random.randn(L, d)

def exact_softmax_attn(Q, K, V):
    S = np.exp(Q @ K.T / np.sqrt(d)); S /= S.sum(axis=1, keepdims=True)
    return S @ V

def favor_attn(Q, K, V, m):
    omega = np.random.randn(d, m)
    def phi(X):
        return np.exp(-np.sum(X**2, axis=1, keepdims=True) / 2) * np.exp((X @ omega) / np.sqrt(d))
    Fq, Fk = phi(Q), phi(K)
    KV = Fk.T @ V
    num = Fq @ KV
    den = Fq @ Fk.sum(axis=1)
    return num / (den[:, None] + 1e-9)

exact = exact_softmax_attn(Q, K, V)
for m in (32, 128, 512):
    approx = favor_attn(Q, K, V, m)
    print(f"m={m:3d}  与精确softmax平均误差={np.mean(np.abs(approx-exact)):.4f}")
assert np.mean(np.abs(favor_attn(Q,K,V,512)-exact)) < np.mean(np.abs(favor_attn(Q,K,V,32)-exact)) + 1e-3
print("结论：FAVOR+ 用 m 个随机特征近似 softmax，m 越大越准，复杂度 O(L·m·d)")
\`\`\`

$m$ 从 32 增到 512，近似误差明显下降——FAVOR+ 是用**特征数换精度**的旋钮：$m$ 小则快但方差大，$m$ 大则准但计算多。关键纪律是**必须除以归一化分母** \`den\`，否则输出尺度会错（这是 L46 常见坑）。

:::deep

### 三家的「状态」形态对比：标量、矩阵、随机特征

把三家的状态摆在一起，能看清「线性」的不同来源。RWKV 的状态是**两个 $C$ 维标量向量**（num/den），靠逐通道衰减 $e^{-w}$ 加权累加——状态最小、推理最省，但表达靠「多通道不同衰减速度」堆出来。RetNet 的状态是**$d\\times d$ 矩阵** $S=\\sum\\gamma^{t-i}k_iv_i^\\top$，容量更大、能建模 key-value 关联，但每步要 $O(d^2)$；$\\gamma$ 固定，选择性弱。Performer **没有显式的循环状态**——它用随机特征 $\\varphi$ 把注意力改写成一个 $m\\times d$ 的中间矩阵 $\\varphi(K)^\\top V$，这个矩阵角色类似状态，但它是「一次性并行算出的摘要」，不随 token 递推更新；要流式推理也能维护 $\\sum\\varphi(k_i)v_i^\\top$，但那是派生形式。三家的取舍因此清楚：**RWKV 最省（标量状态）但靠通道分工补表达、RetNet 状态大但统一了三范式、Performer 不停式但用近似换线性**。理解了「状态是什么、怎么更新」，就理解了每家「为什么线性、省什么」的全部答案：线性都来自「把 $L\\times L$ 换成有界状态/特征矩阵」，差别只在那个矩阵的大小、是否随 token 更新、更新是否带衰减与选择性。

:::

### 逐家「为什么线性、省什么」的工程判据

落到选型，一张判据表：**RWKV**——要极致省推理内存、喜欢 RNN 式简洁递推选它，代价是表达靠通道衰减堆、训练并行度一般；适合边缘/低资源长序列。**RetNet**——要在「训练并行」与「推理恒定」之间要一个统一框架、且能接受固定衰减选它，三范式让工程灵活；适合对选择性要求不极端的场景。**Performer**——要在不改动 softmax 语义太远的前提下拿到线性、且能接受随机近似误差选它，$m$ 是精度旋钮；适合核方法友好、对精确注意力近似可接受的任务。共同底线：三者都比全注意力省了 $L\\times L$，但都牺牲了「精确匹配」——这正是 M4 用混合架构（L42）把少量精确注意力请回来的根本原因。下面这段自检把三家的状态大小与复杂度摆在一起，作为整课的量化收束。

\`\`\`python
def profile(name, L=8192, d=4096, C=4096, m=256):
    if name == 'RWKV':   state, step, why = 2*C, C, '逐通道标量状态'
    if name == 'RetNet': state, step, why = d*d, d*d, '矩阵状态+γ衰减'
    if name == 'Performer': state, step, why = m*d, m*d, '随机特征矩阵(近似)'
    total = step * L
    return state, total, why

for name in ('RWKV', 'RetNet', 'Performer'):
    st, tot, why = profile(name)
    print(f"{name:10s} 状态/中间≈{st/1e6:7.2f}M 数  序列总操作≈{tot/1e9:7.1f}G  ({why})")
print("全注意力对比：序列总操作≈%.1fG（L²）" % (8192*8192/1e9))
print("结论：三家都把 O(L²) 降到 O(L)，状态大小与近似方式各异")
\`\`\`

RWKV 用最小的标量状态、RetNet 用 $d^2$ 矩阵换统一三范式、Performer 用 $md$ 特征换近似的 softmax——三家状态量级不同，但序列总操作都是 $O(L)$，远小于全注意力的 $L^2$。这就是「线性、省什么」的最终量化。

:::tip

### 一句话记住三家状态数学

三问套三家：**RWKV** 状态=逐通道 num/den 标量、线性来自指数加权递推、省下 KV 换恒定内存（$w$ 逐通道衰减、$u$ 当前加成）；**RetNet** 状态=$S_t=\\gamma S_{t-1}+k_t^\\top v_t$ 矩阵、三范式（并行/递推/分块）统一训练与推理、$\\gamma$ 固定衰减；**Performer** 用 FAVOR+ 随机特征 $\\varphi$ 近似 softmax、$O(Lmd)$ 避开 $L\\times L$、$m$ 是精度旋钮且别忘归一化分母。记住「都把 $L\\times L$ 换成有界状态，差别在状态大小与是否随输入更新」，就抓住了这一课。

:::
`,
    null,
    [
      {
        text: 'RWKV 的 WKV 机制中，通道时间衰减 w 与当前加成 u 的作用是？',
        options: [
          'w 控制历史按通道指数衰减、u 给当前 token 加成，二者都是逐通道向量',
          'w/u 都是标量且与通道无关',
          '只用于归一化',
          '只影响输出门',
        ],
        answer: 0,
        explain:
          'RWKV（2305.13048）用逐通道的 w（时间衰减曲线）与 u（当前 token 加成）参与 WKV 加权，实现 channel-directed 的线性注意力。',
        concept: 'linear-rnn-principle',
      },
      {
        text: 'RetNet 的 retention 递推状态更新是？',
        options: [
          'S_t = γ·S_{t-1} + k_t^T·v_t，输出 o_t = q_t·S_t（γ 为衰减）',
          'S_t = S_{t-1} + q_t',
          '不用状态',
          'S_t = QK^T',
        ],
        answer: 0,
        explain:
          'RetNet（2307.08621）用矩阵状态 S=Σ γ^{t-i} k_i v_i^T，递推 S_t=γS_{t-1}+k_t^Tv_t，含衰减 γ。',
        concept: 'linear-rnn-principle',
      },
      {
        text: 'RetNet 的「三范式」指？',
        options: [
          '三种损失函数',
          '并行/递推/分块三种计算形式，训练用并行、推理用递推、长序列用分块',
          '三种归一化',
          '三种注意力头',
        ],
        answer: 1,
        explain:
          'RetNet 提供 parallel（并行训练）、recurrent（O(1) 推理）、chunkwise（分块折中）三种等价计算范式。',
        concept: 'linear-rnn-principle',
      },
      {
        text: 'Performer 的 FAVOR+ 避开 N×N 的核心手段是？',
        options: [
          '截断序列',
          '用正交随机特征 φ 近似 softmax 核，把 φ(Q)(φ(K)^T V) 做结合律',
          '把注意力换成卷积',
          '降低精度',
        ],
        answer: 1,
        explain:
          'Performer（2009.14794）用 FAVOR+ 正交随机特征近似 exp(q·k)，将 softmax 注意力写成 φ(Q)(φ(K)^T V)，复杂度 O(L·m·d)。',
        concept: 'linear-rnn-principle',
      },
    ],
    [
      ['WKV', 'RWKV 的 weighted key-value 机制，逐通道加权累加历史价值，写成 RNN 递推'],
      ['通道时间衰减 w', 'RWKV 中逐通道向量，决定该通道历史按 exp(-w·Δt) 衰减的速度'],
      ['Retention', 'RetNet 的注意力替代，矩阵状态 S_t=γS_{t-1}+k_t^Tv_t，带衰减 γ'],
      ['FAVOR+', 'Performer 的正交随机特征方法，近似 softmax 核、避开 N×N 注意力矩阵'],
      ['三范式', 'RetNet 的 parallel / recurrent / chunkwise 三种等价计算形式'],
    ],
    [
      '以为 RWKV 的 w/u 是全局标量——它们是逐通道向量，这正是「channel-directed 线性注意力」的由来。',
      '把 RetNet 的 γ 与 Mamba 的 Δ 混同——γ 是固定衰减、Δ 是输入相关的自适应步长，机制不同。',
      '认为 FAVOR+ 是精确 softmax——它是对 exp 核的随机特征近似，特征数 m 越小方差越大。',
      '忽略 softmax 分母——Performer 的线性形式必须除以 φ(Q) 的行和做归一化，否则输出尺度错。',
    ],
  ),
  'framework',
)
