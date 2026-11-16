import { L, withKind } from '../../course-builders.ts'

export const L47 = withKind(
  L(
    'L47',
    20,
    '原理深挖：GLA/DeltaNet/Hyena 门控·delta·卷积',
    4,
    ['L46'],
    ['gated-conv-principle'],
    [
      '讲清 GLA 数据门控线性注意力与分块',
      '推导 DeltaNet 的 delta rule 读-比-写纠正',
      '解释 Hyena 隐式长卷积与 FFT 复杂度',
      '对照三类状态数学的取舍',
    ],
    `### 三类状态数学：门控、delta、卷积

L46 讲了三家「带衰减的线性注意力与核近似」，L47 再往前一步：GLA、DeltaNet、Hyena 代表三种更激进的「状态怎么更新」的设计。GLA（arXiv:2312.06635）给线性注意力的遗忘装上**数据门控**——门由输入决定；DeltaNet（arXiv:2406.06484）把状态更新换成**delta rule**——一种在线纠错的读-比-写；Hyena（arXiv:2302.10866）干脆放弃递推状态，用**隐式长卷积 + FFT** 拿到全局感受野。三者分别回答「状态该怎么忘」「状态该怎么写」「不用状态怎么拿到长依赖」。这一课逐家推导状态更新、说明「为什么线性、省什么」，并做三类对照。

### GLA：数据门控的线性注意力与分块并行

普通线性注意力的状态 $S_t=S_{t-1}+k_t^\\top v_t$ 只有加法、没有遗忘，序列越长旧信息越稀释。GLA 的改动是加一个**逐特征、由输入决定的遗忘门**：

$g_t=\\sigma\\big(\\mathrm{Linear}(x_t)\\big)\\in(0,1)^d,\\qquad S_t=\\mathrm{diag}(g_t)\\,S_{t-1}+k_t^\\top v_t,\\qquad o_t=\\mathrm{diag}(g_t)\\,S_{t-1}\\,q_t\\ (\\text{或经 }q_t)$

$g_t$ 是 $d$ 维向量，每个特征维度独立决定「忘多少」，且**由当前输入 $x_t$ 决定**——这是「data-gated」的含义，比 RetNet 固定 $\\gamma$（L46）更灵活：模型能按内容给不同维度设不同遗忘速度。**为什么线性**：每步仍是矩阵-向量的线性更新，$O(d^2)$，序列 $O(Ld^2)$。**省什么**：省掉 $L\\times L$ 注意力，状态是 $d\\times d$、推理恒定；同时数据门控带来比纯加法更好的召回。训练时 GLA 用**分块并行算法**——把序列切块，块内用矩阵乘并行处理带门控的更新（借助类似 WY 表示的分块技巧），块间传递压缩状态，兼顾线性复杂度与 GPU 利用率。下面这段实现 GLA 的状态更新，验证门由输入决定、状态定长、$g_t$ 越小遗忘越快。

\`\`\`python
import numpy as np
np.random.seed(0)
L, d = 16, 6
x = np.random.randn(L, d); k = np.random.randn(L, d); v = np.random.randn(L, d)
Wg = np.random.randn(d, d) * 0.3

def sigmoid(z): return 1 / (1 + np.exp(-z))

def gla_step(S, x_t, k_t, v_t):
    g = sigmoid(x_t @ Wg)              # 门由输入决定，逐特征
    S = g[:, None] * S + np.outer(k_t, v_t)
    return S, g

S = np.zeros((d, d)); gs = []
for t in range(L):
    S, g = gla_step(S, x[t], k[t], v[t]); gs.append(g)
print("状态 S 形状:", S.shape, "恒定；门 g 形状:", gs[0].shape, "由输入决定")
print("平均门值(越大越不易忘):", np.mean(np.stack(gs), axis=0).round(2))
assert S.shape == (d, d), "GLA 状态必须定长 d×d"
assert not np.allclose(gs[0], gs[-1]), "数据门控应让不同时刻的门不同"
print("结论：GLA 用输入相关的逐特征门控遗忘，线性且保留选择性")
\`\`\`

不同时刻的门值不同，印证「数据门控」——$g_t$ 随输入变化，而非固定。这带来比 RetNet 固定衰减更强的选择性，代价是要额外计算门 $\\sigma(x_t W_g)$ 并做逐特征相乘。

### DeltaNet：读-比-写的 delta rule

线性注意力的状态 $S=\\sum k_iv_i^\\top$ 是**纯加法**：要写入 $(k_t,v_t)$ 就往上加 $k_t v_t^\\top$，从不纠正旧值。这在联想召回上有个问题：若之前写入的 $k$ 对应的 $v$ 记错了，纯加法无法改正。DeltaNet 把更新换成**delta rule**（在线最小二乘）:

$S_t=S_{t-1}+\\beta_t\\big(v_t-S_{t-1}k_t\\big)k_t^\\top\\big/\\big(1+\\beta_t\\,k_t^\\top k_t\\big)$

拆开看就是三步：**读**——用当前键 $k_t$ 从旧状态读出预测 $S_{t-1}k_t$；**比**——与目标 $v_t$ 比较得到误差 $\\delta_t=v_t-S_{t-1}k_t$；**写**——用误差乘 $k_t^\\top$ 写回状态，把 $S_t k_t$ 往 $v_t$ 推。$\\beta_t$ 是学习率（可由输入决定），分母是归一化项。直觉上，这让「键 $k_t$ 对应的值 ≈ $v_t$」被反复强化，因此**联想召回远强于纯加法线性注意力**。**为什么线性**：每步是一次秩-1 矩阵更新，$O(d^2)$，序列 $O(Ld^2)$；训练同样用分块并行（WY 表示处理秩-1 更新的累积）。**省什么**：省 $L\\times L$，矩阵状态恒定。下面这段对比「纯加法」与「delta rule」在同一组键值上的召回误差，验证 delta 的纠正效果。

\`\`\`python
import numpy as np
np.random.seed(3)
d = 8
keys = np.eye(d); vals = np.random.randn(d, d)
beta = 1.0

def additive_store(keys, vals):
    S = np.zeros((d, d))
    for i in range(len(keys)):
        S += np.outer(keys[i], vals[i])
    return S

def deltanet_store(keys, vals, beta=1.0):
    S = np.zeros((d, d))
    for i in range(len(keys)):
        k, v = keys[i], vals[i]
        err = v - S @ k
        S = S + beta * np.outer(err, k) / (1 + beta * (k @ k))
    return S

Sa, Sd = additive_store(keys, vals), deltanet_store(keys, vals, beta)
err_a = np.linalg.norm(Sa @ keys[2] - vals[2])
err_d = np.linalg.norm(Sd @ keys[2] - vals[2])
print(f"纯加法召回误差={err_a:.4f}  delta rule 召回误差={err_d:.4f}")
assert err_d < err_a, "delta rule 应比纯加法更精确地召回键值"
print("结论：delta rule 用读-比-写纠正，使 S·k≈v，召回强于纯加法")
\`\`\`

delta rule 的召回误差明显低于纯加法——这正是「读-比-写纠正」的价值：它不是盲目累加，而是让状态**朝目标值收敛**。代价是每步多了一次 $S k$ 的读取与纠正计算，比纯加法稍贵，但仍在 $O(d^2)$ 线性范畴。

### Hyena：隐式长卷积与 FFT 复杂度

GLA 与 DeltaNet 都还保留「随 token 递推的矩阵状态」。Hyena（arXiv:2302.10866）走第三条路：**用长卷积替代递推状态**。它把序列算子写成隐式长卷积：

$y_t=(h*x)_t=\\sum_{s\\le t}h_{t-s}\\,x_s$

其中卷积核 $h$ 不是学出来的独立长向量，而是由一个**小型网络隐式生成**（输入位置编码或参数，输出长度为 $L$ 的滤波器）——参数量小、感受野却能覆盖整条序列。直接算卷积是 $O(L^2)$，但卷积定理告诉我们可以用 FFT：$\\mathcal{F}(h*x)=\\mathcal{F}(h)\\cdot\\mathcal{F}(x)$，在频域点乘再逆变换，复杂度降到 $O(L\\log L)$。**为什么次二次**：FFT 把卷积从 $O(L^2)$ 降到 $O(L\\log L)$，虽比 GLA/DeltaNet 的 $O(L)$ 略高，但仍是次二次，且全程大矩阵 FFT、硬件友好。**省什么**：省掉显式 $L\\times L$ 注意力矩阵，也没有随 token 更新的递推状态（推理可用 FFT 或缓存卷积历史）。Hyena 用「隐式核 + FFT」证明：不必有注意力、也不必有 RNN 状态，光靠长卷积就能拿到全局依赖。下面这段实现 FFT 卷积，验证它与直接卷积一致、并展示复杂度优势。

\`\`\`python
import numpy as np
np.random.seed(4)
L = 1024
x = np.random.randn(L)
# 隐式生成的长卷积核：用小网络（这里用指数衰减核示意）生成，长度 L
t = np.arange(L)
h = np.exp(-t / 200.0) * np.sin(t / 10.0)   # 长距离、带振荡的隐式核

def conv_direct(x, h):
    return np.array([sum(h[t-i]*x[i] for i in range(t+1)) for t in range(len(x))])

def conv_fft(x, h):
    n = 2 * L
    return np.fft.ifft(np.fft.fft(x, n) * np.fft.fft(h, n))[:L].real

y_direct = conv_direct(x[:64], h[:64])      # 直接法只对前 64 个点演示（O(64²)）
y_fft = conv_fft(x, h)[:64]                 # FFT 算全长再截取（O(L log L)）
print("直接 vs FFT 最大误差:", np.max(np.abs(y_direct - y_fft)))
assert np.allclose(y_direct, y_fft, atol=1e-6), "FFT 卷积必须与直接卷积一致"
print(f"全长 L={L}：直接卷积≈{L*L/1e6:.0f}M 次乘加，FFT≈{L*np.log2(L)/1e3:.0f}K 量级")
print("结论：Hyena 用隐式长卷积 + FFT 拿到全局感受野，O(L log L)")
\`\`\`

误差在精度内为零，证明 FFT 与直接卷积等价；全长 1024 时直接卷积要约百万次乘加，FFT 只要几千量级——长序列优势明显。要注意 Hyena 的卷积核是由小网络**隐式生成**的，「隐式」指的是「用少量参数生成一个长核」而非「核是固定的」；不同输入可生成不同核，从而具备一定数据适应性。

:::deep

### 分块并行：GLA/DeltaNet 如何把递推搬到 GPU

一个容易被忽略的工程点：GLA 与 DeltaNet 虽有线性递推，但**逐步递推本身是串行的**，直接跑在 GPU 上并行度差。它们能高效训练，靠的是**分块并行（chunkwise）算法**：把序列切成若干块，块内把带门控/带 delta 的状态更新改写成矩阵乘（对 GLA 用累积门控的块内矩阵，对 DeltaNet 用 WY 表示把秩-1 更新的累积写成矩阵乘），块间只传递一个压缩状态。这样块内计算变成 GPU 擅长的 GEMM、块间串行深度被块数（远小于 $L$）限制。下面的自检用「块数 vs 序列长」说明分块如何压缩串行深度：把 $L=8192$ 切成 64 点一块，串行深度从 8192 降到 128。

\`\`\`python
def chunk_depth(L, chunk):
    n_chunks = int(np.ceil(L / chunk))
    return n_chunks

for L in (2_048, 8_192, 32_768):
    d_naive, d_chunk = L, chunk_depth(L, 64)
    print(f"L={L:>6}  逐步串行深度={d_naive:>6}  分块(64)串行深度={d_chunk:>4}  降低≈{d_naive/d_chunk:.0f}x")
assert chunk_depth(8192, 64) == 128, "8192 切 64 点一块应为 128 块"
print("结论：分块把串行深度从 O(L) 降到 O(L/块大小)，块内用矩阵乘吃满 GPU")
\`\`\`

分块把串行深度降了几十倍，块内再用矩阵乘铺满 GPU——这就是 GLA/DeltaNet 「线性且能高效训练」的完整故事：**状态递推保证 $O(L)$ 复杂度，分块保证 GPU 利用率**。要记住：线性复杂度 ≠ 天然快速，若没有分块并行，递推的串行依赖会让 GPU 空转，这是实测时最该排查的实现点。

:::

### 三类状态数学的取舍对照

把三家摆在一起，取舍清晰。**GLA**（门控）：状态 $d\\times d$，门由输入决定、逐特征遗忘；比固定衰减灵活，召回优于纯加法，代价是多算门与分块实现复杂。**DeltaNet**（delta）：状态 $d\\times d$，用读-比-写纠正，召回最强（在线最小二乘），代价是每步多一次读取与纠正。**Hyena**（卷积）：无显式递推状态，隐式长卷积 + FFT，$O(L\\log L)$ 略高于前两者但全程 FFT 硬件友好、全局感受野强，代价是卷积核生成与 FFT 的常数开销、且是次二次而非线性。共同点是都避开 $L\\times L$，都靠「有界状态或频域摘要」替代显式注意力。按需求选：**要数据化遗忘与平衡**用 GLA、**要强召回/联想**用 DeltaNet、**要全局卷积且硬件友好**用 Hyena。值得注意：这三家与 L46 的 RWKV/RetNet/Performer 一起，构成了一整条「线性/次二次序列算子」的谱系——它们都在用不同方式回答同一个问题：**如何在不付 $O(L^2)$ 代价的前提下保留足够的历史与全局依赖**。而 M4 的混合架构（L42 起）则说明：无论哪家，都还需补少量精确注意力来兜住最难的召回任务。

:::tip

### 一句话记住三家

三问套三家：**GLA** 状态 $S_t=\\mathrm{diag}(g_t)S_{t-1}+k_t^\\top v_t$、门 $g_t$ 由输入决定、分块并行训练，线性且选择性更强；**DeltaNet** 用 delta rule 读-比-写 $S\\leftarrow S+\\beta(v-Sk)k^\\top$、使 $Sk\\approx v$、召回最强；**Hyena** 用隐式长卷积 + FFT 拿到全局感受野、$O(L\\log L)$ 次二次、无显式递推状态。记住「**门控管怎么忘、delta 管怎么写、卷积管不用状态怎么连远处**」，三类状态数学就各归其位了。

:::
`,
    null,
    [
      {
        text: 'GLA（2312.06635）的「数据门控」指什么？',
        options: [
          '遗忘门 g_t 由输入 x_t 决定、逐特征按 g_t 衰减状态',
          '门是固定的',
          '不用状态',
          '门只用于输出',
        ],
        answer: 0,
        explain:
          'GLA 令遗忘门 g_t=sigmoid(Linear(x_t))，状态更新 S_t=diag(g_t)·S_{t-1}+k_t^T v_t，门随输入变化、逐特征控制遗忘。',
        concept: 'gated-conv-principle',
      },
      {
        text: 'DeltaNet（2406.06484）的 delta rule 核心是？',
        options: [
          '纯加法累加',
          '读-比-写：用 (v_t - S_{t-1}k_t) 的纠正量更新 S，使 S_t k_t 逼近 v_t',
          '把状态乘 2',
          '只存最后一个 token',
        ],
        answer: 1,
        explain:
          'DeltaNet 用 S_t=S_{t-1}+β_t(v_t - S_{t-1}k_t)k_t^T，先读 S k、与目标 v 比较、写回纠正量，是在线最小二乘更新。',
        concept: 'gated-conv-principle',
      },
      {
        text: 'Hyena（2302.10866）实现长距离依赖靠的是？',
        options: [
          '显式状态递推',
          '隐式生成的长卷积核 + FFT 计算，O(L log L)',
          'softmax 注意力',
          '只靠局部窗口',
        ],
        answer: 1,
        explain:
          'Hyena 用小型网络隐式生成长卷积核，与输入做全局卷积，用 FFT 在 O(L log L) 内算完，无显式注意力状态。',
        concept: 'gated-conv-principle',
      },
      {
        text: '三家「为什么线性/次二次、省什么」的正确说法是？',
        options: [
          '都靠随机特征近似',
          'GLA/DeltaNet 用有界矩阵状态递推+O(L)，Hyena 用 FFT 长卷积 O(L log L)，都避开 O(L²)',
          '都完全无状态',
          '都只省推理内存',
        ],
        answer: 1,
        explain:
          'GLA/DeltaNet 维持 d×d 状态做线性递推，Hyena 用 FFT 把长卷积降到 O(L log L)，三者都避开注意力的 O(L²)。',
        concept: 'gated-conv-principle',
      },
    ],
    [
      ['GLA', '2312.06635，Gated Linear Attention，遗忘门由数据决定的线性注意力，带分块并行算法'],
      ['DeltaNet', '2406.06484，用 delta rule 在线更新矩阵状态的线性 RNN，读-比-写纠正'],
      ['Hyena', '2302.10866，隐式长卷积 + FFT，O(L log L) 次二次序列算子，无显式注意力'],
      ['delta rule', '在线最小二乘更新：S←S+β(v-Sk)k^T，使状态对键的读出逼近目标值'],
      ['隐式卷积核', 'Hyena 中小网络生成的卷积滤波器，参数量小但感受野覆盖全序列'],
    ],
    [
      '把 GLA 的门当成固定衰减——它的门 g_t 由输入决定，这正是「数据门控」与 RetNet 固定 γ 的差别。',
      '以为 DeltaNet 是普通加法线性注意力——它的 delta 纠正是乘性/最小二乘更新，召回强于纯加法。',
      '认为 Hyena 没有全局依赖——它的长卷积感受野覆盖全序列，只是用 FFT 算而非注意力。',
      '忽略分块算法——GLA/DeltaNet 的并行训练依赖 chunkwise 组织，不是简单逐步递推。',
    ],
  ),
  'framework',
)
