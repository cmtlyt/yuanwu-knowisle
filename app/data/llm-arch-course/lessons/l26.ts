import { L, withKind } from '../../course-builders.ts'

export const L26 = withKind(
  L(
    'L26',
    11,
    'KV cache 的 INT8 / FP8 量化',
    4,
    ['L22', 'L25'],
    ['kv-quant'],
    [
      '把「权重 / 激活 / KV」三类量化分开，说清 KV 量化省的是哪一块显存',
      '说清 INT8 与 FP8 在 KV 场景的取舍（范围、精度、硬件支持）',
      '用逐 token / 逐 head 缩放说清 KV 量化为什么不是一刀切的 8bit',
      '对照精度代价说明「KV 量化掉的质量通常比权重量化小」的原因',
    ],
    `
### 先分清三类量化

模型压缩里「量化」常被混为一谈，先钉死它作用的**对象**不同：

- **权重量化（weight-only）**：把**参数**从 16bit 降到 8/4bit，省的是**加载与推理的权重显存**。权重在推理时是**只读常数**，量化误差固定、可离线校准，对最终精度影响可控（L1 的量化课会展开）。
- **激活量化**：把**中间激活**（每层的输出）降到 8bit，省的是**计算显存**，但激活分布随输入变、难离线校准，误差会逐层累积，最难做。
- **KV 量化（本课）**：把**推理时按位置累积的 K/V cache** 从 16bit 降到 8/4bit，省的是**生成阶段随序列长线性涨的那块显存**。KV 不是参数、不是激活，它是**运行时动态增长的缓存**，是长上下文 + 高并发下最贵的显存（L15 的「起点账」）。

一句话：三类量化省的是**三块不同显存**，KV 量化专门省「生成阶段」这块，也是 M2 这条「KV 短板」链路的最后一环。

:::deep

### INT8 vs FP8：KV 场景怎么选

KV 量化的两个主流位宽，取舍不同：

- **INT8**：对称 8 位整数量化（\`scale\` 把 8bit 映射回浮点），**每个 KV 值配一个 per-token / per-head 缩放因子**。INT8 动态范围大、数值稳定、几乎所有硬件都支持，是 KV 量化的**稳妥默认**。
- **FP8（E4M3 / E5M2）**：8 位浮点，**精度（尾数）比 INT8 高但范围靠指数表达**，需要 **Hopper（H100）及以上**硬件原生支持（\`w8a8\` 或 KV 专用 \`fp8\`）。FP8 的优势是**尾数 4bit**，对 KV 这种「幅值动态范围不极端」的数据精度损失更小；代价是要专用硬件 + 更复杂的缩放。

经验判据：**没有 Hopper 就先用 INT8**（通用、稳）；**有 H100/H200 且追求极致精度则上 FP8**。两者都把 KV 字节数砍到 1/2（相对 16bit），省下的显存直接换成能塞的并发请求数（L24 的「KV 显存 → 并发」链路）。

:::

### 不是一刀切 8bit：逐 token / 逐 head 缩放

直接「全 KV 一个 scale 压成 8bit」会被**离群值**（某些 head 的 K/V 幅值特别大）带崩——那个大值占满 scale、其它正常值全被压成 0，精度崩。所以工程上 KV 量化几乎都是**分组缩放**：

- **per-token**：每个序列位置单独一个 scale（K 和 V 各一份），最细、精度最好，开销最大。
- **per-head**：每个 K/V head 一个 scale，是精度与开销的折中，vLLM 的 \`--kv-cache-dtype int8\` 默认走这档。

分组缩放的核心思想：**让离群值只影响自己那个组，不污染其它组**。写起来就是「每 token 先取该 token 的 K 幅值最大项定 scale，量化，反量化」：

\`\`\`python
import torch

def kv_quant_int8_per_token(k, v):
    """per-token 对称 INT8：每位置一个 scale，K/V 各一份。
    输入 [B, H, T, D]，输出 int8 张量 + 每位置 scale。"""
    def quant(t):
        B, H, T, D = t.shape
        amax = t.abs().amax(dim=3, keepdim=True).clamp(min=1e-6)   # per-token 幅值
        scale = amax / 127.0                                        # 该 token 的缩放因子
        q = torch.round(t / scale).clamp(-128, 127)                # 量化到 int8
        deq = q * scale                                            # 反量化
        return q, scale, deq
    kq, ks, kd = quant(k)
    vq, vs, vd = quant(v)
    return (kq, vq, torch.cat([ks, vs], dim=1), kd, vd)

torch.manual_seed(0)
B, H, T, D = 2, 8, 512, 64
k = torch.randn(B, H, T, D) * (1 + torch.rand(B, H, T, 1))   # 模拟幅值不均
kq, vq, scales, kd, vd = kv_quant_int8_per_token(k, torch.randn_like(k))
err = (k - kd).abs().max().item()
# 断言：per-token INT8 反量化误差远小于「全局一个 scale」
global_scale = k.abs().amax() / 127.0
err_global = (k - torch.round(k / global_scale).clamp(-128,127) * global_scale).abs().max().item()
assert err < err_global, "分组缩放应比全局一刀切更准"
print(f"per-token INT8 max|Δ|={err:.3e} < 全局 {err_global:.3e}（离群值不污染）")
# 字节账：16bit → 8bit，KV 显存砍半，省下的换成并发请求数（L24 链路）
\`\`\`

:::deep

### 把「省下的字节」接回 L24 的吞吐链路

KV 量化砍的是「字节因子」，省下的显存并不自动变成吞吐——要接回 L24 的「KV 显存 → 并发请求数 → 吞吐」链路才兑现：

\`\`\`python
def kv_budget(num_kv_heads, d_h, seq, bits, layers=32):
    """KV 总字节 = 层数 × 序列长 × 2(K+V) × 头数 × d_h × (bits//8)。"""
    return layers * seq * 2 * num_kv_heads * d_h * (bits // 8)

LAYERS, SEQ, HEADS, D_H = 32, 4096, 8, 128
for bits, label in [(16, "FP16"), (8, "INT8/FP8")]:
    gb = kv_budget(HEADS, D_H, SEQ, bits) / 1e9
    print(f"{label}: 单请求 KV ≈ {gb:.2f} GB；同 20GB 预算并发 ≈ {20e9 // (gb*1e9):.0f}")
# INT8/FP8 把字节砍半 → 同预算并发再 ×2，叠在 GQA 的「头数因子」之上
\`\`\`

两段相乘才是完整的 KV 显存账：**GQA（L15）砍头数因子 + 量化（本课）砍字节因子**，两个旋钮正交。20GB 预算下 FP16 能塞的并发数，INT8 直接翻倍——这是 L24 消融表里「量化」那一行的定量来源，也是「先 GQA 再量化」两条一起拧才吃满同显存的工程顺序。

### 选量化位宽的三条经验法则

把 INT8/FP8 的取舍落成可执行的判断：

- **无 Hopper → INT8**：数值稳、硬件普适，是「能跑」的默认档。
- **有 H100/H200 → FP8（E4M3）**：尾数精度比 INT8 高，KV 这种幅值不极端的数据掉点更小，能吃到 Hopper 的 FP8 硬件吞吐。
- **追求极致压缩 → 4bit**：字节再砍一半，但要更细的分组（per-token 甚至 per-channel）+ 校准，掉点开始明显，一般留到「显存还是不够」的极限档。

:::

:::tip

### 精度代价：为什么 KV 量化掉得比权重少

这是常考的一个反直觉点：**KV 量化通常比权重量化掉的质量小**。原因是 KV 是「**对历史内容的记忆**」，而 8bit 的分辨率足以表达 K/V 的**相对结构**（哪个位置重要、哪个方向）；真正决定精度的「检索结构」在**分组缩放**下被保留，丢的是每 token 的低比特噪声。实测上（vLLM / SGLang 的 KV-int8 报告）多数长上下文基准掉点 < 0.5%，而权重 4bit 往往掉 1–3%。所以「先 KV 量化、再考虑权重量化」是更稳的压缩顺序——**KV 那块（随序列长线性涨、离群值可分组）比权重那块（固定、一刀切易崩）更经得起量化**。

一个易混的细节：上面说的「KV 量化掉点 < 0.5%」是**8bit 分组缩放**的量级；若压到 4bit，掉点会明显上升（与权重 4bit 同量级），这时「先量化 KV」的优势就消失了，要按显存预算权衡。所以位宽是「省多少字节 vs 掉多少点」的旋钮，不是越低越好。

:::
`,
    null,
    [
      {
        text: 'KV 量化专门省的是哪块显存？',
        options: ['加载权重', '生成阶段随序列长线性涨的 K/V cache', 'FFN 权重', '词表'],
        answer: 1,
        explain:
          'KV 量化作用于推理时动态累积的 K/V cache，省的是「生成阶段」那块（L15 起点账），不是只读的参数权重。',
        concept: 'kv-quant',
      },
      {
        text: '没有 Hopper（H100）硬件时，KV 量化的稳妥选择是？',
        options: ['FP8', 'INT8（通用、数值稳定、硬件支持广）', 'FP4', '不量化'],
        answer: 1,
        explain:
          'INT8 动态范围大、几乎所有硬件支持，是稳妥默认；FP8（E4M3/E5M2）需 Hopper 起原生支持、精度更高但门槛高。',
        concept: 'kv-quant',
      },
      {
        text: 'KV 量化为什么不用「全局一个 scale」一刀切？',
        options: [
          '8bit 不够用',
          '离群值会占满 scale、污染其它正常值，需 per-token/per-head 分组缩放',
          'K/V 没有离群值',
          '为了更快',
        ],
        answer: 1,
        explain:
          '某些 head 的 K/V 幅值特别大，全局 scale 会被它撑爆、正常值全压成 0；分组缩放让离群值只影响自己那组。',
        concept: 'kv-quant',
      },
      {
        text: '「KV 量化比权重量化掉的质量小」的原因是？',
        options: [
          'KV 更短',
          'KV 存的是相对结构，8bit 分辨率够 + 分组缩放保留检索结构，丢的只是低比特噪声',
          'KV 不需要精度',
          '权重更短',
        ],
        answer: 1,
        explain:
          'KV 是对历史内容的记忆，检索结构在分组缩放下被保留；权重一刀切易崩、KV 分组易扛，故先量化 KV 更稳。',
        concept: 'kv-quant',
      },
    ],
    [
      ['三类量化', '权重（参数）/ 激活（中间输出）/ KV（运行时缓存），各省不同显存'],
      ['INT8 vs FP8', 'INT8 通用稳、FP8 需 Hopper、尾数精度更高'],
      ['per-token/per-head 缩放', '分组缩放，让离群值不污染其它组，精度与开销折中'],
      ['量化顺序', '先 KV（分组、易扛）再权重（固定、易崩），更稳'],
    ],
    [
      '把 KV 量化当成「量化权重」——它省的是运行时 K/V cache，不是只读参数，链路不同。',
      '用全局一个 scale 压 KV——离群值撑爆 scale、正常值全压成 0，必须分组。',
      '无 Hopper 就上 FP8——硬件不支持会回退或报错，稳妥默认是 INT8。',
      '以为 KV 量化比权重量化更伤——恰好相反，分组缩放下 KV 掉点通常更小。',
    ],
  ),
  'theory',
)
