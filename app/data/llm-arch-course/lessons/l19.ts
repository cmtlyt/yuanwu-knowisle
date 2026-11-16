import { L, withKind } from '../../course-builders.ts'

export const L19 = withKind(
  L(
    'L19',
    8,
    'FlashAttention：IO-aware 注意力',
    3,
    ['L15'],
    ['flash-attention'],
    [
      '说清 FlashAttention（arXiv:2205.14135）是「IO-aware」而非「改变计算量」',
      '解释「N×N 注意力分数不写回 HBM、全程留在 SRAM」如何加速',
      '分清 FlashAttention 解的是 O(N²) 计算内存、不解 O(N) KV 存储',
      '用「显存 ∝ N 而非 N²」对照标准注意力',
    ],
    `
### 为什么 FlashAttention 不改变 O(N²) 计算量

先破除一个误区：FlashAttention **没有减少注意力的 FLOPs**——它算的仍然是 QKᵀV 的每个元素，计算量还是 O(N²)。它快，是因为**减少了 HBM（主存）与 SRAM（片上缓存）之间的数据搬运**。GPU 算得快、存得慢，瓶颈常在「把中间结果（N×N 的注意力矩阵）写回 HBM 再读回来」——标准注意力要把 N×N 分数矩阵物化到 HBM 再 softmax，长序列时这块内存 O(N²) 且搬运极慢。

:::deep

### IO-aware 的核心：N×N 分数留在 SRAM

FlashAttention（arXiv:2205.14135）把 Q/K/V 切成 tile，**分块计算**——每块 N×N 的注意力分数算出来就**立即在 SRAM 里做 online softmax、加权求和**，**永不写回 HBM**。配合「online softmax」（流式维护每块的最大值与指数和，分块累加），全程 HBM 只存 Q/K/V 与输出，中间 N×N 矩阵一次都不落地。结果：**显存从 O(N²) 降到 O(N)**，且因为省了 HBM 搬运，实测 7–8× 加速（长序列更夸张）。

「online softmax」是关键技巧：标准 softmax 要先看到全部 N 个分数才能归一化，FlashAttention 用「分块边算边维护 (m, ℓ)」——每块更新块内最大值 m、指数和 ℓ，最后一次性归一，保证与标准 softmax **数值等价**（不是近似）。

:::

\`\`\`python
# 概念：online softmax 的「分块累加」核心（不物化 N×N 矩阵）
import torch

def online_softmax_block(s_tile, m_i, l_i):
    # s_tile: 当前块的 [d_head, N_block] 分数（在 SRAM）
    m_new = torch.maximum(m_i, s_tile.max(dim=-1, keepdim=True).values)
    # 旧块的指数和要按新最大值重标定（避免下溢）
    alpha = torch.exp(m_i - m_new)          # 旧 m 相对新 m 的缩放
    l_new = l_i * alpha + torch.exp(s_tile - m_new).sum(dim=-1, keepdim=True)
    return m_new, l_new
    # 处理完所有块后：out = (累加的 exp(s-m)*v) / l —— 与标准 softmax 数值等价

# 关键对照：标准注意力 HBM 占用 ~ N×N（分数矩阵）+ N×d；
# FlashAttention HBM 占用 ~ N×d（Q/K/V/输出），N×N 只在 SRAM 临时存在
N, d = 4096, 128
print(f"标准注意力 N×N 分数矩阵 ≈ {N*N*d*2/1e9:.2f} GB（若物化）；FlashAttention 不落 HBM")
\`\`\`

### 它解什么、不解决什么

必须分清 FlashAttention 的边界：

- **解 O(N²) 计算内存**：N×N 分数矩阵不再物化，显存 O(N²) → O(N)，长序列不再爆显存。
- **不解决 O(N) KV 存储**：生成时历史 K/V 的 KV cache 仍是 O(N)（随序列长线性涨），这块要靠 L15-L17 的 GQA、L25 的 PagedAttention、L26 的 KV 量化去砍。FlashAttention 只是让「注意力算子本身」又快又省 HBM。

所以 M2 的 KV 优化谱系是：**GQA 砍「生成头数」→ FlashAttention 砍「N×N 中间矩阵」→ PagedAttention 砍「KV 碎片」→ KV 量化砍「字节数」**，各砍不同因子，正交可叠。

### 为什么说「IO-bound」是 GPU 的真正瓶颈

把 FlashAttention 快的原因落到 GPU 硬件模型上，才能理解为什么它是「搬得省」而不是「算得快」：

- **SM（计算单元）很快、HBM（主存）很慢**：现代 GPU 的 FLOPs 与 HBM 带宽之比（算术强度阈值）意味着，一个 kernel 只有当「每个字节搬运触发足够多 FLOPs」才吃满算力。标准注意力把 N×N 分数写 HBM 再读回做 softmax，**每个分数元素触发 1 次 FLOPs 却搬 2 次 HBM**，算术强度低、SM 大量空等。
- **FlashAttention 提高算术强度**：N×N 留在 SRAM（片上快存）里算完，HBM 只进出 Q/K/V/O 各一次，每个 HBM 字节触发 O(SRAM 容量) 的 FLOPs——算子律（tiling + online softmax）把搬运次数从 O(N²) 压到 O(N²d²/m)（m 是 SRAM 大小），N 越大省得越夸张。

这就是「7–8× 加速、长序列更夸张」的硬件根源：**序列越长，标准注意力物化的 N×N 越大、越 IO-bound，FlashAttention 相对省得越多**。L25 的前后实测会用数字把这条曲线跑出来。

:::deep

### 「省 HBM 搬运」的定量直觉：一个算术强度算式

把「IO-bound vs 计算-bound」用算术强度（每字节触发的 FLOPs）钉成可算的量，才能预判「多长的序列 FA 才划算」：

\`\`\`python
# 算术强度 = FLOPs / HBM 字节。高于硬件 roofline 拐点（~15 FLOP/byte on A100）才是计算-bound。
def arith_intensity_flops_per_byte(n, d):
    """标准注意力：算 n×n×d 的乘加（~2*n*n*d FLOPs 量级）但搬运 N×N 矩阵
    （n*n*4byte，K/V 之外还有分数矩阵读写）。粗化到「每读 1 字节分数触发 ~2 FLOPs」。"""
    flops = 2 * n * n * d          # 注意力分数矩阵乘加的 FLOPs（量级）
    hbm_bytes = n * n * 4          # 分数矩阵 n×n × fp32 4byte（读写合计的近似）
    return flops / hbm_bytes

for n in (512, 2048, 8192):
    ai = arith_intensity_flops_per_byte(n, d=128)
    print(f"n={n:5d}  算术强度 ≈ {ai:.1f} FLOP/byte（越 n 大分数矩阵越大，越吃搬运）")
# 结论：分数矩阵随 n² 涨，搬运随 n² 涨但 HBM 带宽是常数 → n 越大越 IO-bound，
# 而 FA 把分数矩阵留在 SRAM，HBM 只进出 Q/K/V/O（∝ n），n 越大相对省越多
\`\`\`

这段把「长序列 FA 更夸张」落到算术强度：分数矩阵搬运随 \`n²\` 涨、HBM 带宽恒定，\`n\` 越大搬运占比越高、越 IO-bound；FA 把这块留在 SRAM、HBM 只进出 \`∝ n\` 的 Q/K/V/O，所以 **n 越大 FA 相对 naive 的加速越夸张**——这是 L25 的 speedup 曲线「随 seq 单调上升」的定量解释，也回答了「为什么短序列 FA 优势不明显」（n 小、分数矩阵搬运占比小、算力/启动开销主导）。

:::

:::tip

### 把 FlashAttention 记成「省搬运、不是省计算」

一句话：FlashAttention 不减少算的元素（仍 O(N²) FLOPs），它**减少 HBM↔SRAM 的搬运**——N×N 分数留在片上、用 online softmax 分块流式算完。理解「IO-bound 才是 GPU 瓶颈」这一点，后面 L20 的 FA v1/v2/v3 演进（v2 warp 级并行、v3 FP8）、L21 的 PagedAttention 都建立在「算得快不如搬得省」这个直觉上。

再强调一遍边界：**FA 省的是「注意力算子的中间矩阵搬运」，不省「KV cache 本身」**。长上下文爆显存时，先分清是「N×N 分数矩阵爆」（那是 FA 该解决的，算子侧）还是「KV cache 爆」（那是 GQA/量化该解决的，存储侧，L15/L25/L26）。两个「显存」不是一回事，FA 只砍前者，混淆它们会让「换了 FA 还是爆」的人误判成 FA 没用——其实该去砍 KV 那侧。这也是 M2 整条「KV 短板」链路（GQA→FA→Paged→量化）能并排成立的根本：每一块砍的是公式里**不同的一个因子**，互相不重叠。

:::
`,
    null,
    [
      {
        text: 'FlashAttention 快的根本原因是？',
        options: ['减少了 FLOPs', 'IO-aware：N×N 分数留在 SRAM、少搬 HBM', '用了更少的头', '去掉了 softmax'],
        answer: 1,
        explain: '它不减少计算量（仍 O(N²) FLOPs），而是省 HBM↔SRAM 搬运，N×N 中间矩阵不物化到主存。',
        concept: 'flash-attention',
      },
      {
        text: 'FlashAttention 让显存从？',
        options: ['O(N²) 降到 O(N)', 'O(N) 降到 O(1)', '不变', 'O(N²) 降到 O(log N)'],
        answer: 0,
        explain: 'N×N 分数矩阵不再写 HBM，HBM 只存 Q/K/V/输出，显存 ∝ N 而非 N²。',
        concept: 'flash-attention',
      },
      {
        text: 'FlashAttention **不**解决的是？',
        options: ['O(N²) 计算内存', 'O(N) 的 KV cache 存储', '注意力数值精度', '序列并行'],
        answer: 1,
        explain:
          '它砍 N×N 中间矩阵（计算侧），但生成时历史 K/V 的 KV cache（O(N) 存储）要靠 GQA/PagedAttention/量化另砍。',
        concept: 'flash-attention',
      },
      {
        text: 'online softmax 的作用是？',
        options: [
          '把 softmax 近似成线性',
          '分块流式算、数值等价于标准 softmax、不物化 N×N',
          '去掉 softmax',
          '只用 argmax',
        ],
        answer: 1,
        explain:
          '分块边算边维护 (m, ℓ)，最后一次性归一，与标准 softmax 数值等价而非近似，且全程不落地 N×N 矩阵。',
        concept: 'flash-attention',
      },
    ],
    [
      ['FlashAttention', 'IO-aware 注意力，N×N 分数留 SRAM、显存 O(N²)→O(N)'],
      ['IO-bound', 'GPU 瓶颈常在数据搬运而非计算，FlashAttention 省搬运'],
      ['online softmax', '分块流式 softmax，数值等价标准、不物化中间矩阵'],
      ['KV cache 边界', 'FA 砍计算侧 N×N，不砍生成侧 O(N) 的 KV 存储（GQA/Paged/量化另砍）'],
    ],
    [
      '以为 FlashAttention 减少了计算量——它仍 O(N²) FLOPs，省的是 HBM 搬运。',
      '以为 FA 解决了 KV 存储——它只砍 N×N 中间矩阵，KV cache 的 O(N) 要靠别的手段。',
      '把 online softmax 当成近似——它数值等价标准 softmax，不是近似。',
      '长序列还爆显存就怪 FA——若仍是 KV cache 爆，要去砍 KV（GQA/量化），不是 FA 的锅。',
    ],
  ),
  'theory',
)
