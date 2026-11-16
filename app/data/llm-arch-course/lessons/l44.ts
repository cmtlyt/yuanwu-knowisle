import { L, withKind } from '../../course-builders.ts'

export const L44 = withKind(
  L(
    'L44',
    19,
    '混合模型 KV/吞吐 vs 纯 Transformer capstone',
    4,
    ['L40', 'L43'],
    ['m4-capstone'],
    [
      '搭建可跑的混合模型基准冒烟',
      '测 KV cache 与吞吐对照纯 Transformer',
      '给出内存数量级验收断言',
      '验证长上下文吞吐倍数',
    ],
    `### 综合交付要做什么：把 M4 后半拼成一条可跑链路

这是 M4 的收束课。前面几课各自打碎一个维度：L38/L39 把注意力换成 SSM 拿到线性与恒定状态、L40 实测了 Mamba 的恒定内存、L42 立起「SSM 主干 + 约 10% 注意力补召回」的共识、L43 对照了 Jamba/Zamba/Falcon-H1 三种落地形态。本课时把**这些结论拼成一条可复现的基准链路**：搭一个混合模型（Mamba 主干 + 约 1/8 注意力层）的推理冒烟 → 实测它的 KV cache 与吞吐、对照同规模纯 Transformer → 用可执行断言验收「KV 数量级」与「长上下文吞吐倍数」→ 对着数字把收益归因到因子。交付物不是一句「混合更快」，而是**一组能跑、能断言、能归因的数字**。

:::deep

### 一条链路上每块负责什么：SSM 主干 vs 注意力层

把混合模型的推理成本拆成三个正交部分，交付链路正好各测一层。**状态/主干（SSM 层）**：提供 $O(L)$ 序列建模，每步更新固定状态 $h$，内存与计算都与序列长无关——这是「长上下文不爆」的主力。**KV（注意力层）**：约 1/8 的层产生随 $T$ 线性增长的 K/V，是混合模型里**唯一随长度涨的缓存**，也是和纯 Transformer 拉开差距的地方。**召回（注意力层）**：这约 1/8 的层同时承担精确寻址，补上 SSM 的召回短板。三者里，**KV 是「成本」、召回是「收益」、SSM 主干是「效率底座」**。本课的验收要证明：用一成的注意力成本（KV），换回了接近全注意力的召回质量，同时保住 SSM 的恒定内存主干。关键认知是——**混合的吞吐优势不是「注意力变快了」，而是「绝大多数 token 的计算不再背着 KV 走」**：SSM 层每步只算固定状态更新，省掉了纯 Transformer 每层每步都要读写 $O(T)$ KV 的带宽开销，序列越长省得越多。

:::

### 搭建可跑的混合模型基准冒烟

先搭一个能逐 token 生成的混合模型最小实现，验证「SSM 分支 + 注意力分支」能同时跑通。下面这段不依赖大模型库，用 NumPy 实现一个两层混合块：一层 Mamba 式 SSM（固定状态递推）、一层带 KV cache 的注意力（只在 1/8 的层出现）。脚本打印每步的状态范数与注意力输出范数，构成完整冒烟；关键是把**两类缓存分开管理**，这样后面才能分别测量它们的增长行为。

\`\`\`python
import numpy as np
np.random.seed(0)

class MambaLayer:
    """SSM 分支：固定状态，不产生 KV。"""
    def __init__(self, d=64, n=16):
        self.h = np.zeros((d, n)); self.a = -0.4 * np.ones(n)
        self.B = np.random.randn(d, n); self.C = np.random.randn(n, d)
    def step(self, x):
        self.h = np.exp(self.a)[None, :] * self.h + 0.3 * (x @ self.B)
        return self.h @ self.C

class AttnLayer:
    """注意力分支：带 KV cache，随 T 增长（只在 1/8 层出现）。"""
    def __init__(self, d=64):
        self.d = d; self.K = []; self.V = []
        self.Wq = np.random.randn(d, d); self.Wk = np.random.randn(d, d); self.Wv = np.random.randn(d, d)
    def step(self, x):
        q, k, v = x @ self.Wq, x @ self.Wk, x @ self.Wv
        self.K.append(k); self.V.append(v)
        K = np.stack(self.K); V = np.stack(self.V)
        w = np.exp((K @ q) / np.sqrt(self.d)); w /= w.sum()
        return w @ V

class HybridBlock:
    """混合块：每 8 层里 1 个注意力层，其余 Mamba 层。"""
    def __init__(self, total_layers=32, d=64):
        self.layers = [AttnLayer(d) if (i + 1) % 8 == 0 else MambaLayer(d)
                       for i in range(total_layers)]
    def step(self, x):
        for lyr in self.layers:
            x = x + lyr.step(x)          # 残差连接
        return x

m = HybridBlock()
x = np.random.randn(64)
for t in range(16):
    x = m.step(x)
    if t in (0, 7, 15):
        print(f"t={t:2d}  输出范数={np.linalg.norm(x):.3f}  注意力K长度={len(m.layers[7].K)}")
assert len(m.layers[7].K) == 16 and isinstance(m.layers[0], MambaLayer)
print("冒烟通过：16 token 生成，Mamba 层无 KV、注意力层 K/V 随步累积")
\`\`\`

冒烟脚本里，第 8 层（索引 7）是注意力层，它的 \`K\` 列表随生成步数增长到 16；而其余 Mamba 层只有固定状态 \`h\`。两类缓存被清晰分开——这是后续所有测量的基础。

### 验收断言一：KV cache 数量级

第一条硬验收是「混合 KV 落在纯 Transformer 的约 1/8 到 1/10」。做法是固定序列长与 $d_{model}$，分别算纯 Transformer（全注意力层）与混合（约 1/8 注意力层）的 KV 字节，再用 \`assert\` 锁定比值落在数量级区间；同时验证 SSM 状态内存**不随 $T$ 增长**。下面这段把两条断言都写成可执行的量级检查。

\`\`\`python
def kv_bytes(n_attn_layers, T, d=4096, layers=32, bits=16):
    return n_attn_layers * T * 2 * d * (bits // 8)   # K+V

def ssm_state_bytes(T, d=4096, n=16, layers=32, bits=16):
    return layers * n * d * (bits // 8)              # 与 T 无关

T = 8192
kv_full = kv_bytes(32, T)
kv_hybrid = kv_bytes(4, T)                           # 1:8 → 32 层里 4 层注意力
state = ssm_state_bytes(T)
print(f"8K 序列：纯Transformer KV≈{kv_full/1e9:.2f} GB  混合 KV≈{kv_hybrid/1e9:.2f} GB  比值={kv_hybrid/kv_full:.3f}")
print(f"混合 SSM 状态≈{state/1e6:.1f} MB（恒定）")
assert 0.10 <= kv_hybrid / kv_full <= 0.15, "混合 KV 应约纯 Transformer 的 1/8"
assert ssm_state_bytes(1000) == ssm_state_bytes(1_000_000), "SSM 状态内存必须与 T 无关"
print("断言通过：KV 降约一个数量级，SSM 状态恒定")
\`\`\`

数字上，8K 序列下纯 Transformer KV 约 4 GB、混合约 0.5 GB（1/8），SSM 状态仅约 4 MB 且恒定。两条断言把「KV 数量级」与「状态恒定」同时钉死——这正是 L40 的单模型结论在混合模型上的推广：**KV 几乎全部来自那一成注意力层，SSM 主干不贡献随长度增长的缓存**。

### 把 KV 账算到每一层：混合状态与注意力缓存的分工

在写断言之前，必须把「混合模型到底缓存了什么」算到每一层，否则后面所有数量级判断都失去依据。一个混合块里其实有**三种**要缓存的东西，它们的增长行为完全不同，必须分开对待。第一种是 **SSM 状态 $h$**：每层大小 $d_{state}\\times d_{model}$，逐 token 原地更新、大小恒定，与序列长 $T$ 无关；它决定了「推理状态内存」这一项。第二种是 **SSM 的短卷积缓存**：Mamba 在状态更新前有一个宽度 $d_{conv}$（通常 4）的局部卷积，需要缓存最近 $d_{conv}$ 个输入，大小 $d_{model}\\times d_{conv}$、同样恒定；它常被忘记，但因为 $d_{conv}$ 只有 4，量级远小于状态 $h$，不影响结论。第三种是**注意力 KV**：只有那约 1/8 的注意力层产生，每层每 token 两份 $d_{model}$ 向量，**随 $T$ 线性增长**——这是唯一会「越生成越占地方」的缓存。把三者加总时，恒定项（状态 + 卷积缓存）与增长项（KV）必须分开报，否则「总缓存随长度增长多少」会被恒定项稀释、看不出 KV 因子。下面的脚本把三层缓存逐项列出，验证「只有 KV 随 $T$ 增长、状态与卷积缓存恒定」。

\`\`\`python
def cache_breakdown(T, layers=32, d=4096, n=16, d_conv=4, n_attn=4, bits=16):
    b = bits // 8
    state = layers * n * d * b                    # 恒定
    conv  = layers * d_conv * d * b               # 恒定
    kv    = n_attn * T * 2 * d * b                 # 随 T 线性
    return {'SSM状态': state, '卷积缓存': conv, '注意力KV': kv}

for T in (2_000, 8_000, 32_000):
    c = cache_breakdown(T)
    total = sum(c.values())
    print(f"T={T:>6}  状态={c['SSM状态']/1e6:5.1f}MB  卷积={c['卷积缓存']/1e6:5.1f}MB  KV={c['注意力KV']/1e9:5.2f}GB  KV占比={c['注意力KV']/total:.1%}")
a, b = cache_breakdown(2_000), cache_breakdown(32_000)
assert a['SSM状态'] == b['SSM状态'] and a['卷积缓存'] == b['卷积缓存'], "恒定项必须与 T 无关"
assert b['注意力KV'] / a['注意力KV'] == 16.0, "KV 必须随 T 严格线性（16 倍）"
print("断言通过：状态/卷积缓存恒定，只有 KV 随序列长线性膨胀")
\`\`\`

数字揭示了一个重要事实：在 8K 时 KV 已占混合模型总缓存的九成以上，而 SSM 状态与卷积缓存加起来只有几 MB、几乎可忽略。这意味着**混合模型的缓存瓶颈几乎完全由那一成注意力层决定**——优化 KV（少放注意力层、GQA、KV 量化）就是优化混合推理的全部缓存故事。反过来说，若把注意力层全删掉变成纯 SSM，缓存会彻底恒定，但召回会塌（L42），所以「保留多少注意力」始终是围绕 KV 与召回的权衡。把这张分项账记在心里，看任何混合模型的显存报告都不会再被「总缓存」一个数字糊弄。

### 从量级示意到真实基准：实验设计的四个约束

上面的脚本都是量级示意，要在真实硬件上复现出可信数字，有四个必须提前钉死的实验约束。第一，**模型规模要可比**：混合与纯 Transformer 的总参数、激活参数、层数、隐维要尽量对齐；若混合用了 MoE（如 Jamba）导致总参数更大，要说明「激活参数」而非「总参数」，否则吞吐差会被参数量污染。第二，**精度与核实现要一致**：两边都用同一精度（FP16 或 BF16），并确认 Mamba 走的是优化过的扫描核、注意力走的是 FlashAttention 类后端；核没生效时测出的是「实现差」而非「架构差」。第三，**显存预算要固定**：两档用同一个 \`gpu_memory_utilization\`，让「省下的 KV」真正被「塞更多并发」吃掉，而不是被「更大预算」白送。第四，**负载要分层记录**：分别测 prefill（长 prompt 的并行预填充）与 decode（逐 token 生成），因为混合的优势主要在 decode 阶段兑现——prefill 阶段纯 Transformer 能用大矩阵并行、劣势小，decode 阶段才被 KV 带宽拖住。把这四个约束写进实验记录，得到的倍数才经得起追问；缺任何一条，数字都可能把「架构差」误报成「实现差/预算差/规模差」。这也是本 capstone 与普通练习的分界：不仅要能跑出倍数，还要能说清这个倍数**为什么是这个数、不是别的数**。

### 验收断言二：同显存吞吐对照

第二条验收是吞吐。核心是**严格的控制变量**：固定模型规模、硬件、精度、批大小、显存预算，只让「架构 + 有效注意力占比」不同。我们用「同显存预算能塞的并发请求数 × 每步成本」作为吞吐代理（真实 tok/s 受核实现影响，这里量级示意，第三方复算随硬件与语料变动，不担关键结论）。显存省下来会换成并发，但并发增长存在边际递减，所以吞吐提升会小于并发提升——这点必须在数字里体现，不能笼统说「KV 砍 8 倍吞吐就涨 8 倍」。

\`\`\`python
def concurrency(gpu_mem_gb, kv_per_req_gb):
    """同显存预算能塞的并发数（留一部分给权重/激活）。"""
    return int((gpu_mem_gb - 8) / kv_per_req_gb)     # 8 GB 预留给权重/激活

def step_cost_proxy(n_attn_layers, T, d=4096, n=16, layers=32):
    """单步乘加量代理：SSM 层 O(n·d) + 注意力层 O(d·T)。"""
    return layers * 2 * d * n + n_attn_layers * 2 * d * T

budget = 24.0                                       # 24 GB 卡
kv8k_full = kv_bytes(32, 8192) / 1e9
kv8k_hybrid = kv_bytes(4, 8192) / 1e9
c_full = concurrency(budget, kv8k_full)
c_hybrid = concurrency(budget, kv8k_hybrid)
cost_full = step_cost_proxy(32, 8192)
cost_hybrid = step_cost_proxy(4, 8192)
tp_full = c_full / cost_full                        # 吞吐代理 ∝ 并发 / 单步成本
tp_hybrid = c_hybrid / cost_hybrid
print(f"同 24GB：并发 纯Attn≈{c_full}  混合≈{c_hybrid}（{c_hybrid/max(c_full,1):.1f}倍）")
print(f"吞吐代理：纯Attn≈{tp_full:.2e}  混合≈{tp_hybrid:.2e}  倍数≈{tp_hybrid/max(tp_full,1e-30):.1f}x")
assert c_hybrid > c_full, "混合 KV 更小应能塞更多并发"
print("断言通过：KV 省下→并发涨→吞吐涨（提升倍数受边际递减约束）")
\`\`\`

在这组配置里，纯 Transformer 在 8K 下 KV 约 4 GB、24 GB 卡扣掉 8 GB 权重后只能塞约 4 路并发；混合 KV 约 0.5 GB、能塞约 32 路——并发涨约 8 倍。但单步成本也降了（少了 28 层注意力的 $O(d\\cdot T)$ 读写），吞吐代理的提升是「并发涨」与「单步成本降」的合力。注意这里并发从 4 到 32 是 KV 因子的直接结果，而真实吞吐倍数会因边际递减（并发越高每请求分到的算力越少）小于并发倍数——报数字时要同时记录总吞吐与单请求吞吐，才能解释这个差。

### 验收断言三：长上下文吞吐倍数

第三条验收直接对应 spec 的「验证长上下文吞吐倍数」：扫多个序列长，看纯 Transformer 的吞吐随 $T$ 陡降（每步要读写 $O(T)$ 的 KV），而混合的 SSM 主干每步成本恒定、只有少量注意力层受影响，吞吐下降平缓。把「混合吞吐 / 纯 Transformer 吞吐」画成随 $T$ 变化的倍数，应该看到**倍数随 $T$ 增大而放大**——这正是长上下文场景混合架构的价值兑现点。下面这段把这条曲线算出来并断言倍数随长度单调递增。

\`\`\`python
def throughput_proxy(n_attn_layers, T, d=4096, n=16, layers=32):
    # 吞吐 ∝ 1 / 单步成本；SSM 层成本与 T 无关，注意力层成本随 T 线性
    cost = layers * 2 * d * n + n_attn_layers * 2 * d * T
    return 1.0 / cost

print("  序列长 T    纯Attn吞吐    混合吞吐     倍数")
ratios = []
for T in (2_000, 8_000, 32_000, 128_000):
    tp_f = throughput_proxy(32, T)
    tp_h = throughput_proxy(4, T)
    ratios.append(tp_h / tp_f)
    print(f"{T:>9}  {tp_f:.2e}  {tp_h:.2e}  {tp_h/tp_f:6.1f}x")
assert all(ratios[i] <= ratios[i+1] for i in range(len(ratios)-1)), "长上下文吞吐倍数应随 T 单调放大"
print(f"断言通过：倍数从 {ratios[0]:.1f}x 放大到 {ratios[-1]:.1f}x，长上下文优势兑现")
\`\`\`

从 2K 到 128K，纯 Transformer 的单步成本被 KV 越拖越重，而混合只有 1/8 的层受影响，吞吐倍数随之放大。这条单调递增曲线就是「长上下文吞吐倍数」的可执行证据——它说明混合的价值**不是常数，而是随上下文变长而增长**。要在真实基准上复现，需要在每个 $T$ 都固定同一显存预算、同一 batch，否则并发变化会污染倍数。

:::deep

### 把吞吐倍数拆成可归因的因子

跑完基准，把「混合 / 纯 Transformer」的吞吐倍数拆成因子，避免笼统记成「混合更快」。**因子 A（KV 头数/层数）**：混合把注意力层压到约 1/8，KV 降一个数量级 → 同显存并发涨约 8 倍，这是来自 L42/L43 的直接因子。**因子 B（单步成本）**：SSM 层每步只算固定状态更新（$O(n\\cdot d)$），不再读写 $O(T)$ 的 KV → 单步成本下降，且 $T$ 越大省得越多，这是 L38 的结论在混合里的兑现。**因子 C（召回不塌）**：约 1/8 的注意力层补回精确召回（L42），使质量接近全注意力——这是「收益」侧，保证省 KV 不是以废掉模型为代价。**因子 D（任务相关）**：低并发短上下文时 KV 非瓶颈，A/B 兑现有限，倍数接近 1；高并发长上下文时 A/B 吃满，倍数放大。四者里 A、B 是「成本侧」的直接贡献，C 是「质量侧」的保底，D 决定「倍数在什么场景才兑现」。做消融时逐一关掉（把混合改成全注意力、改回每层注意力、换短序列），看倍数掉多少，就能把每个因子各占多少测出来——若只能报一个总倍数、做不出分层数字，说明还没真正把 M4 拆透。

### 常见翻车点与出口清单

三个最常翻车的点，交付前自查：① **显存预算不一致**——混合档用了更大预算，省下的 KV 被「预算更大」白送，吞吐差变成预算因子而非 KV 因子，整张对照表作废；务必两档写同一个 \`gpu_memory_utilization\`。② **把总显存当 KV**——权重、激活、SSM 状态、KV 混在一起算，会得出「内存没怎么省」的假象；所有断言只针对缓存区。③ **只报总吞吐不报单请求吞吐**——并发拉满后的边际递减会让「并发 ×8」只兑现成「总吞吐 ×3 左右」，把「总吞吐 = 并发 × 单请求吞吐 × 系数」写进报告才算读透数字。出口清单：可跑的混合模型冒烟（§搭建）、KV 数量级断言（§验收一）、同显存吞吐断言（§验收二）、长上下文倍数断言（§验收三）、四因子消融表（§因子拆解）——五条齐全，M4 综合交付完成，可进入 M5。

:::

:::tip

### 收束与出口

M4 的出口判据：能搭起「SSM 主干 + 约 10% 注意力」的混合冒烟，能用可执行断言证明 KV 降约一个数量级、状态内存恒定、长上下文吞吐倍数随 $T$ 放大，并能把吞吐收益归因到「KV 层数 / 单步成本 / 召回保底 / 场景相关」几个因子。达成即完成 M4，进入 M5。若数字对不上，按三条排查：先查两档显存预算是否一致、再查断言是否只针对缓存区、最后查是否记录了单请求吞吐以解释边际递减。记住整条主线：**SSM 拿效率、少量注意力拿召回，混合把「全层背 KV」压缩成「一成层背 KV」，长上下文越久省得越多**。

:::
`,
    null,
    [
      {
        text: '混合模型相对纯 Transformer 的 KV 收益，根本来源是？',
        options: [
          'Mamba 层也存 KV',
          '绝大多数层用 SSM 不产 KV，只有约一成注意力层产 KV，KV 降约一个数量级',
          '把权重量化',
          '序列变短',
        ],
        answer: 1,
        explain:
          'SSM 状态不是 KV、不随 token 累积；混合把注意力压到约 10%，KV 约为纯 Transformer 的 1/8 到 1/10。',
        concept: 'm4-capstone',
      },
      {
        text: '做混合 vs 纯 Transformer 的吞吐对照，必须固定的变量是？',
        options: [
          '仅提示词',
          '模型规模/硬件/精度/批大小/显存预算，只让架构与注意力占比不同',
          '温度',
          '随机种子',
        ],
        answer: 1,
        explain:
          '固定规模、硬件、精度、batch、显存预算，吞吐差才能归因到「KV 因子」，否则被预算/规模差异污染。',
        concept: 'm4-capstone',
      },
      {
        text: '「内存数量级验收断言」合理的断言是？',
        options: [
          '混合 KV 与纯 Transformer 相同',
          '混合 KV 约为纯 Transformer 的 1/8 至 1/10 且状态内存不随 T 增长',
          '混合 KV 更高',
          '断言吞吐恒定',
        ],
        answer: 1,
        explain:
          '按 1:8 布局，混合 KV 应落在纯 Transformer 的约 1/8 量级；SSM 状态内存恒定，不随序列长增长。',
        concept: 'm4-capstone',
      },
      {
        text: '验证「长上下文吞吐倍数」时，正确做法是？',
        options: [
          '只测一个长度',
          '扫多个序列长，看混合的吞吐下降幅度远小于纯 Transformer（KV 增长慢）',
          '只比较首 token',
          '调大温度',
        ],
        answer: 1,
        explain:
          '随序列变长，纯 Transformer 被 KV 带宽拖慢、吞吐陡降；混合的 SSM 主干每步成本恒定，吞吐下降平缓。',
        concept: 'm4-capstone',
      },
    ],
    [
      ['混合基准冒烟', '用极小配置跑通混合模型前向/生成，验证 SSM 与注意力两分支形状对齐、可生成'],
      ['有效注意力占比', '混合模型 KV 的统一度量，约 10%，决定 KV 与吞吐代价'],
      ['内存数量级断言', '用可执行的 assert 锁定 KV 落在纯 Transformer 的约 1/8 到 1/10、状态内存恒定'],
      ['长上下文吞吐倍数', '同一批配置下，序列变长时混合相对纯 Transformer 的吞吐优势倍数'],
      ['控制变量', '对照实验中除架构外全部固定的量（规模/硬件/精度/batch/显存预算）'],
    ],
    [
      '把混合模型的总显存当成 KV——权重、激活、状态、KV 要分开算，断言只针对缓存区。',
      '对照时显存预算不一致——省下的 KV 没换成并发，吞吐差就被预算差异掩盖、归因全错。',
      '以为混合一定吞吐翻倍——低并发短上下文时 KV 非瓶颈，收益主要兑现于高并发长上下文。',
      '只报总吞吐不报单请求吞吐——并发拉满后有边际递减，需两者一起记录才能解释倍数。',
    ],
  ),
  'capstone',
)
