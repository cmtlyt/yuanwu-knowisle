import { L, withKind } from '../../course-builders.ts'

export const L45 = withKind(
  L(
    'L45',
    20,
    '小 Mamba 训练冒烟：O(1) 推理/O(L) 扫描',
    4,
    ['L38', 'L40'],
    ['mamba-train'],
    [
      '写出可跑的小 Mamba 训练脚本',
      '测吞吐 + KV/显存曲线 vs 同规模 Transformer',
      '验证 O(1) 推理内存与 O(L) 并行扫描',
      '对照训练与推理两侧差异',
    ],
    `### 训练冒烟：一个可跑的极小 Mamba 更新

要验证 O(L) 扫描与 O(1) 推理，先得有一个真正会「训练」的小 Mamba。下面这段用 NumPy 实现一个最小选择性 SSM 层，写清它的**状态更新方程** $h_t=\\bar a_t h_{t-1}+\\bar B_t x_t$、$\\bar a_t=\\exp(\\Delta_t a)$、$\\bar B_t\\approx\\Delta_t B_t$，并用有限差分做梯度下降、在合成任务上把 loss 降下来。脚本打印每轮 loss，构成训练冒烟——关键是把「状态怎么更新」落到可执行代码，而不是停在公式。

\`\`\`python
import numpy as np
np.random.seed(0)

class TinySSM:
    """最小选择性 SSM：h_t = a_t·h_{t-1} + B·x_t（标量输入、N 维状态）。"""
    def __init__(self, N=8):
        self.N = N
        self.a = -0.5                       # 固定标量衰减（训练中可学，这里固定以简化）
        self.B = np.random.randn(N) * 0.1   # 待学输入投影
        self.C = np.random.randn(N) * 0.1   # 待学读出
    def forward(self, x):
        h = np.zeros(self.N); ys = []
        for xt in x:
            a_t = np.exp(self.a * 0.3)       # Δ=0.3 固定
            h = a_t * h + self.B * xt
            ys.append(self.C @ h)
        return np.array(ys)

def loss_fn(model, x, y):
    pred = model.forward(x)
    return np.mean((pred - y) ** 2)

m = TinySSM()
x = np.random.randn(24); y = np.random.randn(24) * 0.5
for step in range(60):
    l0 = loss_fn(m, x, y)
    gradB = np.zeros(m.N); gradC = np.zeros(m.N); eps = 1e-4
    for i in range(m.N):                    # 有限差分求梯度（仅示意，真实用反向传播）
        m.B[i] += eps; lp = loss_fn(m, x, y); m.B[i] -= eps
        m.B[i] -= eps; lm = loss_fn(m, x, y); m.B[i] += eps
        gradB[i] = (lp - lm) / (2 * eps)
        m.C[i] += eps; lp = loss_fn(m, x, y); m.C[i] -= eps
        m.C[i] -= eps; lm = loss_fn(m, x, y); m.C[i] += eps
        gradC[i] = (lp - lm) / (2 * eps)
    lr = 0.05
    m.B -= lr * gradB; m.C -= lr * gradC
    if step in (0, 29, 59):
        print(f"step={step:2d}  loss={l0:.4f}")
assert loss_fn(m, x, y) < l0, "训练应降低 loss"
print("训练冒烟通过：状态更新 h=a·h+B·x 驱动前向，梯度下降收敛")
\`\`\`

这段把 Mamba 的「状态更新 → 输出 → loss → 参数更新」完整跑通。注意这里用有限差分只为让脚本自包含可跑；真实训练用反向传播，但**状态更新方程本身不变**——这正是 L38 的递推在训练侧的形态。

### 并行扫描：为什么训练是 O(L) 而非 O(L²)

上面的 \`forward\` 是逐步递推，训练时这样串行跑在 GPU 上很慢。Mamba 的训练秘诀是把这条递推改写成**关联扫描**：状态更新 $h_t=a_t h_{t-1}+u_t$（其中 $u_t=\\bar B_t x_t$）是一种关联二元运算 $(a,u)\\circ(a',u')=(a a',\\,a u'+u)$，可以用并行前缀扫描在 $O(\\log L)$ 的并行深度内算完，总工作量仍是 $O(L)$。对比注意力：自注意力矩阵是 $L\\times L$，工作量 $O(L^2)$。下面这段实现标准的 Hillis-Steele 并行扫描，验证它与逐步递推数值一致，并对比 $O(L)$ 与 $O(L^2)$ 的工作量随长度的增长。

\`\`\`python
import numpy as np
def sequential_scan(a, u):
    """逐步递推 h_t = a_t·h_{t-1} + u_t。"""
    h = np.zeros_like(u); out = np.zeros_like(u)
    for t in range(len(u)):
        h = a[t] * h + u[t]; out[t] = h
    return out

def parallel_scan(a, u):
    """Hillis-Steele 关联扫描：O(log L) 深度。"""
    A, U = a.copy(), u.copy(); n = len(u)
    d = 1
    while d < n:
        A_new, U_new = A.copy(), U.copy()
        for i in range(d, n):
            U_new[i] = U[i] + A[i] * U[i - d]
            A_new[i] = A[i] * A[i - d]
        A, U = A_new, U_new; d *= 2
    return U

n = 16
a = np.random.uniform(0.5, 0.9, n)     # a_t = exp(Δ_t·a) ∈ (0,1)
u = np.random.randn(n)
seq = sequential_scan(a, u); par = parallel_scan(a, u)
print("顺序 vs 并行扫描最大误差:", np.max(np.abs(seq - par)))
assert np.allclose(seq, par, atol=1e-9), "并行扫描必须与逐步递推数值一致"
for L in (1_000, 4_000, 16_000):
    print(f"L={L:>6}  扫描工作量≈{L:>7} (O(L))   注意力矩阵元素≈{L*L:>11} (O(L²))")
print("结论：扫描 O(L) 工作 + O(log L) 深度，注意力 O(L²)——这就是「为什么线性」")
\`\`\`

误差为零证明扫描只是「重排计算顺序、不改数学」。工作量对比很直观：$L=16\\mathrm{K}$ 时扫描约 1.6 万次状态更新，注意力要物化约 2.6 亿个矩阵元素——差了四个数量级。这就是 Mamba 训练「为什么线性」的核心：**状态递推的关联结构让整条序列能用 $O(L)$ 前缀扫描算完，彻底避开 $L\\times L$**。

### 测吞吐与显存曲线：训练侧 vs 推理侧

有了可跑的前向与扫描，就能测「两侧差异」。训练侧要保存每层的中间激活供反向传播，激活内存随序列长 $L$ 增长；推理侧只保留固定状态与短卷积缓存，内存与 $T$ 无关。把两条曲线画在同一张图上（这里用数值表），会看到训练内存随 $L$ 线性上升、推理内存水平——这正是「O(1) 推理内存」与「O(L) 训练激活」的分野。下面这段把两条曲线算出来并断言「训练随 L 涨、推理恒定」。

\`\`\`python
def train_activation_mb(L, layers=32, d=4096, bits=16):
    """训练激活：每层每 token 存 d 个激活（量级示意）。"""
    return layers * L * d * (bits // 8) / 1e6

def infer_state_mb(T, layers=32, d=4096, n=16, d_conv=4, bits=16):
    """推理：固定状态 + 短卷积缓存，与 T 无关。"""
    return (layers * n * d + layers * d_conv * d) * (bits // 8) / 1e6

print("  长度       训练激活MB     推理状态MB")
for T in (2_000, 8_000, 32_000):
    print(f"{T:>7}  {train_activation_mb(T):12.1f}  {infer_state_mb(T):12.1f}")
assert train_activation_mb(32_000) > train_activation_mb(2_000), "训练激活应随 L 增长"
assert infer_state_mb(32_000) == infer_state_mb(2_000), "推理状态内存必须与 T 无关"
print("断言通过：训练内存随 L 线性、推理内存恒定")
\`\`\`

数字上，训练激活从 2K 的约 0.5 GB 涨到 32K 的约 8 GB，而推理状态全程约 4 MB 不动。这条对比揭示了 Mamba 的「两侧」本质：**训练吃的是并行度（扫描把 O(L) 工作铺开），推理吃的是恒定内存（递推只留固定状态）**。侧重点不同，但用的是同一个状态更新方程——这是理解 SSM 架构最关键的认知。

:::deep

### 并行扫描的实现细节：关联运算怎么来的

为什么 $h_t=a_t h_{t-1}+u_t$ 能做关联扫描？定义二元运算 $(a_1,u_1)\\circ(a_2,u_2)=(a_1 a_2,\\;a_1 u_2+u_1)$，它表示「先经过 $(a_1,u_1)$ 的状态转移，再经过 $(a_2,u_2)$」。可以验证它满足**结合律**：$((x\\circ y)\\circ z)=(x\\circ(y\\circ z))$。于是整条序列 $h_L$ 就是所有 $(a_t,u_t)$ 按此运算的左折叠，而结合律允许我们用「倍增」方式并行算前缀——这正是 Hillis-Steele / Blelloch 扫描的原理。关键在于**衰减因子 $a_t=\\exp(\\Delta_t a)$ 不能丢**：若 $a_t=1$（纯累加），运算退化成求和，虽然更容易并行但状态会「越装越满」；有了 $a_t<1$，每一步都在「遗忘旧状态」，状态才有界、模型才能选择性记忆。Mamba 的输入相关 $\\Delta_t$ 让 $a_t$ 随内容变化，于是「遗忘多少」也是数据相关的——这就是选择性与扫描能力的结合点：$a_t$ 的乘积在扫描里自然累积成 $\\exp(a\\sum\\Delta)$，既实现了精确的时间衰减，又保持了可并行性。L39 的 SSD 正是把这套扫描与注意力统一到半可分矩阵，理解这里的关联运算就理解了 SSD 扫描侧的全部。

:::

### 吞吐对照：同规模 Mamba 与 Transformer

显存之外再测吞吐。做法与控制变量实验一致：固定规模、硬件、精度、batch，扫多个序列长，比较训练吞吐（tokens/s）与推理单步成本。训练侧 Mamba 的 $O(L)$ 扫描对 Transformer 的 $O(L^2)$ 优势随 $L$ 放大；推理侧 Mamba 每步成本与 $T$ 无关，Transformer 随 $T$ 线性。下面这段用「每步乘加量」作为吞吐代理（量级示意，第三方复算随硬件与核实现变动，不担关键结论），把两条曲线随 $L$ 的增长算出来并断言 Mamba 的增长更平缓。

\`\`\`python
def train_flops(kind, L, layers=32, d=4096, n=16):
    if kind == 'mamba':
        return layers * 2 * d * n * L          # O(L)：每 token 一次状态更新
    else:
        return layers * 2 * L * L * d          # O(L²)：注意力矩阵

for L in (2_000, 8_000, 32_000):
    fm = train_flops('mamba', L); ft = train_flops('transformer', L)
    print(f"L={L:>6}  Mamba≈{fm/1e9:8.1f} GFLOP  Transformer≈{ft/1e12:8.1f} TFLOP  比≈{ft/fm:7.0f}x")
gm32, gm2 = train_flops('mamba', 32_000) / train_flops('mamba', 2_000), 1
gt = train_flops('transformer', 32_000) / train_flops('transformer', 2_000)
print(f"长度×16 时计算增长：Mamba≈{gm32:.0f}x  Transformer≈{gt:.0f}x")
assert gt > gm32, "Transformer 计算随 L 增长应远快于 Mamba"
print("断言通过：长序列下 Mamba 训练吞吐优势放大")
\`\`\`

从 2K 到 32K（长度 ×16），Mamba 的计算量涨约 16 倍（线性），Transformer 涨约 256 倍（平方）——差了一个数量级还多。这就是长序列训练场景 Mamba 吞吐优势的来源。要在真实硬件兑现，需要确认 Mamba 走的是优化过的并行扫描核；核没生效时退到串行递推，训练吞吐会大打折扣——这是实测时最该先排查的实现问题。

### 数值自检：把「O(1)」与「O(L)」两个符号钉死

在收尾前做一次符号级自检，避免把两个 $O$ 用混。$O(1)$ 说的是**推理内存**：状态 $h$ 是 $N\\times d$、卷积缓存是 $d\\times d_{conv}$，两者都不含 $T$，所以缓存字节数是一个与生成长度无关的常数；把 $T$ 从 1K 拉到 1M，这个数纹丝不动。$O(L)$ 说的是**训练工作量**：扫描对整条序列做 $L$ 次状态更新，且并行深度是对数级，所以是「线性工作量 + 对数深度」，既不是 $O(L^2)$ 也不是 $O(1)$。两个符号描述的是**不同量纲**（内存 vs 计算），不要写成「Mamba 是 O(1) 模型」这种含糊话。下面的自检把三个量分别断言，彻底钉死符号。

\`\`\`python
def complexity_check(T, N=16, d=4096, L=None):
    L = L or T
    infer_mem = N * d                # O(1)：与 T 无关
    scan_work = L                    # O(L)：线性工作量
    attn_work = L * L                # O(L²)：对比基线
    return infer_mem, scan_work, attn_work

_, s1, a1 = complexity_check(1_000)
_, s2, a2 = complexity_check(16_000)
# 推理内存恒定（这里用状态元素数代表）
assert complexity_check(1_000)[0] == complexity_check(1_000_000)[0]
# 扫描线性：长度 ×16 → 工作量 ×16
assert s1 == 1_000 and s2 == 16_000 and s2 / s1 == 16
# 注意力平方：长度 ×16 → 工作量 ×256
assert a2 / a1 == 256
print(f"长度×16：扫描工作量×{s2/s1:.0f}（O(L)），注意力工作量×{a2/a1:.0f}（O(L²)），推理内存恒定（O(1)）")
print("符号自检通过：O(1)是推理内存、O(L)是训练工作量，量纲不同不可混用")
\`\`\`

三条断言分别锁定「推理内存恒定」「扫描线性」「注意力平方」，把 $O(1)$ 与 $O(L)$ 钉在各自的量纲上——这是把 Mamba 复杂度讲清楚的最小自检。

### 工程判据：训练与推理两侧各自的优化重点

把两侧的取舍收敛成判据。训练侧：① **序列越长，Mamba 优势越大**——$O(L)$ vs $O(L^2)$，长上下文预训练优先 Mamba/SSD；② **必须用并行扫描核**——否则退化为串行、吃不满 GPU；③ **状态维 $N$ 要够大**——太小限制记忆（L39 的 16→256），太大增加每步成本，$N$ 是容量与速度的旋钮。推理侧：① **恒定内存是核心卖点**——高并发长上下文时 KV 非瓶颈，能塞更多请求；② **短卷积缓存别忽略**——虽小但实现上必须保留，否则局部依赖丢失；③ **召回靠混合补**——纯 Mamba 检索弱，长上下文高质量场景配少量注意力层（L42/L44）。一句话：**训练优化「并行度与序列长度」，推理优化「状态大小与召回补强」**，二者共用同一个状态更新方程，却因侧重点不同走向不同的工程实践。

:::tip

### 一句话记住 L45

小 Mamba 训练冒烟验证两件事：训练侧用**并行扫描**把 $O(L)$ 状态递推铺到 GPU（关联运算保证与逐步递推数值一致、避开 $O(L^2)$），推理侧用**逐步递推**保持 $O(1)$ 恒定状态（与短卷积缓存一起，不随长度涨）。**两侧共用同一个状态更新方程 $h_t=\\bar a_t h_{t-1}+\\bar B_t x_t$，只是训练吃并行度、推理吃恒定内存**。记住「扫描是训练算法、递推是推理形态、状态更新是共同地基」，就抓住了 Mamba 训练与推理差异的全部。

:::
`,
    null,
    [
      {
        text: 'Mamba 训练用「并行扫描」而推理用「逐步递推」，两者数学上是什么关系？',
        options: [
          '完全不同的两个模型',
          '同一递推的不同算法：扫描并行算前缀、递推逐步算，结果一致',
          '训练不用状态',
          '推理不用状态',
        ],
        answer: 1,
        explain:
          '状态更新 h_t=a_t·h_{t-1}+B_t·x_t 是关联运算，可用并行前缀扫描一次算完（训练），也可逐步算（推理），数值等价。',
        concept: 'mamba-train',
      },
      {
        text: '「O(L) 并行扫描」里的 O(L) 指什么？',
        options: [
          '推理内存随 L 线性',
          '序列总计算量与 L 线性（对比注意力 O(L²)），扫描并行深度 O(log L)',
          '状态大小随 L 线性',
          '层数',
        ],
        answer: 1,
        explain:
          '扫描对整个序列做 O(L) 次状态更新（线性总工作量），但借助关联扫描把串行依赖降到 O(log L) 深度，可用 GPU 并行。',
        concept: 'mamba-train',
      },
      {
        text: '验证「O(1) 推理内存」的正确断言是？',
        options: ['训练激活内存恒定', '推理时状态/卷积缓存大小与已生成长度 T 无关', '吞吐恒定', 'loss 恒定'],
        answer: 1,
        explain: '推理只需保存固定状态 h 与短卷积缓存，字节数与 T 无关；这与训练时随 L 增长的激活内存不同。',
        concept: 'mamba-train',
      },
      {
        text: 'Mamba 训练与推理两侧的核心差异是？',
        options: [
          '训练用 O(L) 并行扫描（吃并行度）、推理用 O(1) 状态递推（吃恒定内存）',
          '训练不用 GPU',
          '推理精度更高',
          '训练不更新参数',
        ],
        answer: 0,
        explain:
          '训练侧重吞吐——用并行扫描把 O(L) 工作铺到 GPU；推理侧重内存——用递推保持恒定状态、无 KV 增长。',
        concept: 'mamba-train',
      },
    ],
    [
      ['并行扫描', 'parallel/associative scan，对状态递推做并行前缀计算，O(L) 工作量、O(log L) 深度'],
      ['递推形式', '逐步算 h_t=a_t·h_{t-1}+B_t·x_t，推理时每 token 更新固定状态'],
      ['状态更新方程', 'h_t=ā_t·h_{t-1}+B̄_t·x_t，ā=exp(Δa) 是带衰减的线性更新'],
      ['训练激活内存', '反向传播需保存的中间量，随序列长 L 增长；与推理状态内存不同'],
      ['O(1) 推理内存', '推理缓存字节数与生成长度无关，只存固定大小状态与短卷积缓存'],
    ],
    [
      '把「O(L) 扫描」误读成「推理内存 O(L)」——扫描是训练算法，推理内存是 O(1)，两者说的不是一回事。',
      '以为并行扫描改变了递推数学——它只是重排计算顺序，结果必须与逐步递推一致（要用断言验证）。',
      '把训练激活内存当成推理状态内存——训练时保存中间量随 L 涨，推理时只留恒定状态，别混为一谈。',
      '忽略 Δ>0 的约束——Δ 若非正，ā=exp(Δa) 可能放大、扫描数值不稳定。',
    ],
  ),
  'practice',
)
