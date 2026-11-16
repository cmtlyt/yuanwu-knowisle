import { L, withKind } from '../../course-builders.ts'

export const L57 = withKind(
  L(
    'L57',
    26,
    '推理成本建模：激活参决定 FLOPs',
    4,
    ['L55'],
    ['cost-model'],
    [
      '讲清总参 vs 激活参对 FLOPs 的决定作用',
      '解释长上下文 KV 成本线性增长',
      '建立 $/token 的成本模型',
      '与 M11 部署衔接',
    ],
    `### 一个分水岭：总参决定显存，激活参决定 FLOPs

推理成本建模最容易犯的错，是把「模型多大」和「每 token 多贵」混为一谈。对稠密模型二者近似成正比（所有参数每 token 都参与计算），但 MoE 打破了这个等式。以 DeepSeek-V3 为例（A 级数字）：总参 671B，每 token 只激活 37B。这意味着两件独立的事：**显存要装下全部 671B 权重**（专家再稀疏也得驻留内存），但**每 token 的前向 FLOPs 只按 37B 算**（约 6 乘以激活参乘以 token 数）。这个分离是 MoE 成本优势的根源，也是成本模型的分水岭：算「能不能装下、能塞多少并发」看总参与 KV，算「每个 token 花多少算力」看激活参。把这两个量分开记账，后面所有成本推导才不会错。

### 每 token FLOPs 与 KV 内存：两条独立账

成本有两条独立增长的账，必须分开算。

**FLOPs 账（计算）**：前向传播约 6ND（N 为激活参、D 为 token 数），注意这是**激活参** N。MoE 用 37B 激活而非 671B 总参代入，FLOPs 骤降；稠密模型激活参等于总参，代 671B。这条账决定「每 token 要多少算力、多快能算完」，与序列长是线性关系（每多一 token 多算一次前向）。

**KV 内存账（存储）**：自回归注意力的 KV cache 每 token 存 2（K 和 V）乘以层数 L 乘以 KV 头数 H 乘以头维 d_h 乘以字节数。这段内存 ∝ 序列长，是长上下文的成本瓶颈。注意区分：注意力**计算**是序列长的平方（n²，靠 FlashAttention 优化 IO 但不改平方本质），而 KV **内存**是序列长的线性——两者常被混为一谈。SSM 用固定递推状态替代 KV，把这条线性账变成 O(1)，这是它在长上下文成本上的结构性优势（L55/L56）。

:::deep

### 长上下文为什么抬高 $/token

长上下文抬高成本有两段机制。第一，**prefill 更贵**：处理一段 32K 的 prompt，注意力计算是序列长的平方级（虽被 FlashAttention 优化，量级仍在），首 token 延迟随上下文显著上升。第二，**decode 阶段 KV 更大、并发更低**：每生成一 token 都要从头读 KV，32K 上下文的 KV 很大，既拖慢单步（读更多内存），又挤占显存——同一张卡能并行的请求数下降。并发下降直接压低吞吐（tokens/s），而 $/token 与吞吐成反比，于是**长上下文通过「KV 挤显存、降并发、降吞吐」这条链抬高 $/token**。用 SSM 或 KV 压缩（GQA/MLA，M2/M7）打断这条链，就能在长上下文场景压住成本。这就是 L56 里「32K 上下文」约束为何会淘汰显存装不下 KV 的架构——它不是抽象偏好，而是成本模型算出来的硬约束。

:::

### 建立 $/token 成本模型

把两条账合成一个可算的成本模型。推理的直接成本主要是 GPU 时间租金：一张 GPU 每小时租金 R 美元，运行 T 小时，期间生成 N_tokens 个 token，则每 token 成本等于 R 乘以 T 除以 N_tokens。要点在于分母 N_tokens 由吞吐决定，而吞吐由「单请求计算速度」和「能塞多少并发」共同决定——前者看激活参 FLOPs，后者看显存（总权重 + KV + 激活）。所以完整的成本链是：激活参和 KV 大小 → 单请求速度与并发数 → 吞吐 → $/token。这个模型把架构选择（MoE 低激活参、SSM 小 KV、扩散多步）和真金白银连了起来。

### 可跑代码：FLOPs、KV 与 $/token 三账合一

把三条账写成可跑脚本，核对 MoE 与稠密、长上下文与短上下文的成本差异。

\`\`\`python
def flops_per_token(active_params_b):
    """前向 FLOPs ≈ 6 × 激活参（B 为单位，×1e9）。"""
    return 6 * active_params_b * 1e9

dense = flops_per_token(671)      # 同总参稠密：671B 全激活
moe = flops_per_token(37)         # DSV3：每 token 激活 37B
print(f"稠密 671B 每 token FLOPs≈{dense:.2e}；MoE 激活 37B≈{moe:.2e}")
print(f"MoE FLOPs 约为稠密的 {moe/dense:.1%}")
assert moe < dense * 0.1, "MoE 激活参低应让每 token FLOPs 降一个数量级"
assert abs(moe / dense - 37 / 671) < 1e-9, "FLOPs 之比应等于激活参之比"
print(f"每 token 省下约 {(1-moe/dense)*100:.1f}% 的算术量（显存仍需装全部 671B）")
\`\`\`

\`\`\`python
def kv_gb(seq, layers=32, kv_heads=8, d_h=128, bits=16):
    """KV cache 内存（GB）∝ 序列长：2(K,V)×层×KV头×d_h×字节×seq。"""
    return 2 * layers * kv_heads * d_h * (bits // 8) * seq / 1e9

for seq in (4096, 32768):
    print(f"上下文 {seq}: KV ≈ {kv_gb(seq):.2f} GB/请求")
assert kv_gb(32768) == kv_gb(4096) * 8, "KV 应随序列长线性增长（32K 是 4K 的 8 倍）"
\`\`\`

\`\`\`python
def cost_per_token(gpu_per_hour, tokens_per_sec):
    """$/token = 每小时租金 / (每秒 token × 3600 秒)。"""
    return gpu_per_hour / (tokens_per_sec * 3600)

# 同一张卡，长上下文 KV 挤占显存→并发降→吞吐降→$/token 升
c_short = cost_per_token(2.0, tokens_per_sec=4000)
c_long = cost_per_token(2.0, tokens_per_sec=1000)
print(f"短上下文 $/1M token≈{c_short*1e6:.2f}；长上下文≈{c_long*1e6:.2f}")
assert c_long > c_short * 3, "长上下文吞吐低应显著抬高单位成本"
# 注：GPU 租金 $2/h 为示意（B 级，随时间变动），不担关键结论
\`\`\`

三段分别核对：MoE 每 token FLOPs 约为同总参稠密的 5.5%（37/671），KV 随序列长严格线性（32K 是 4K 的 8 倍），长上下文因吞吐下降把 $/token 抬高数倍。租金 2 美元/小时是示意值——真实 GPU 价格是 B 级、随时间变动，只用于演示模型结构，不担关键结论（L60 专门讲商用价格）。

### 成本模型的适用边界

这套模型有几个必须写明的边界，否则容易算出错觉。第一，**FLOPs 不等于墙钟时间**：6ND 只是算术量，实际延迟还受内存带宽、算子融合、并行效率影响——MoE 的 all-to-all 通信、扩散的多步调度都可能让「理论 FLOPs 低」无法完全兑现成「实际快」。第二，**并发不是无限的**：并发随显存释放而增，但卡数固定时并发越高每请求分到的算力越少，边际收益递减（L24 讲过这条守恒）。第三，**租金是 B 级量**：示例里的每小时租金只用于演示模型结构，商用 API 与云 GPU 价格随时间变动（L60 详述），不担关键结论。第四，**批处理与量化会改写系数**：continuous batching、KV 量化（FP8/INT8）、GQA/MLA 都会改变 KV 与 FLOPs 的常数项，模型的「结构」不变但「数值」要重算。把这四条写进成本报告，结论才诚实。

### 与 M11 部署的衔接

这套成本模型是 M11 部署课的直接输入。部署时你要回答的「用几张卡、能扛多少 QPS、单位成本多少」，正是这里三个量的工程化：激活参 FLOPs 决定单卡算力规划，KV 内存决定显存与并发规划，$/token 决定报价与回本（L60）。具体到选择：高并发短请求场景，MoE 的低激活参把 FLOPs 压下来、吞吐上去，但要注意它要装全部专家、显存门槛高；长上下文场景，KV 线性增长是主要矛盾，SSM 或 KV 压缩（GQA/MLA、PagedAttention）能打断成本上升链；扩散的多步去噪会把 FLOPs 乘以步数，整句生成成本天然偏高，只在编辑场景划算。把 L55 的矩阵、L56 的判据、这里的成本模型三者串起来，就是 L58 实验要验证、L59 报告要落地的完整链条。

:::tip

### 收束：两条账分开记，成本自然清

记住成本模型的两条独立账：**FLOPs 看激活参**（DSV3 671B 总参、37B 激活，每 token 只按 37B 算），**显存看总参与 KV**（671B 权重要全装，KV 随序列长线性增长）。$/token 等于 GPU 租金乘时间除以生成 token 数，吞吐是分母、并发是吞吐的关键，而长上下文通过「KV 挤显存、降并发、降吞吐」抬高单位成本。这套模型接 M11 部署、接 L60 回本判据。带着它，L58 用固定约 125M 的实测把矩阵格子填上真数。

:::
`,
    null,
    [
      {
        text: 'MoE 模型每 token 的前向 FLOPs 主要由什么决定？',
        options: [
          '总参数量',
          '每 token 的激活参数量（如 DSV3 671B 总参、37B 激活）',
          '词表大小',
          '训练数据量的倒数',
        ],
        answer: 1,
        explain:
          '前向 FLOPs 约 6×激活参×token 数，由激活参决定；总参决定显存容量。DSV3 671B 总参但每 token 仅激活 37B，故每 token 计算远低于同总参稠密模型。',
        concept: 'cost-model',
      },
      {
        text: '自回归注意力 KV cache 内存随序列长度如何变化？',
        options: ['常数', '线性增长', '平方增长', '对数增长'],
        answer: 1,
        explain:
          'KV cache 每 token 存 2×层数×KV头数×d_h×字节，故内存 ∝ 序列长线性增长；注意这是内存，计算才是平方。',
        concept: 'cost-model',
      },
      {
        text: '建立 $/token 成本模型时，推理总成本的正确分解是？',
        options: [
          '只算 GPU 购买价',
          'GPU 租金×时间 ÷ 总生成 token 数，再叠加显存/并发限制',
          '只算电费',
          '只算模型参数量',
        ],
        answer: 1,
        explain:
          '$/token = （GPU 每小时租金 × 运行小时）/ 期间生成 token 数；吞吐决定分母，显存/KV 决定能塞多少并发，从而影响吞吐。',
        concept: 'cost-model',
      },
      {
        text: '总参 671B、激活 37B 的 MoE 相比同总参稠密模型，显存与 FLOPs 的差别是？',
        options: [
          '显存和 FLOPs 都降 18 倍',
          '显存要装全部 671B（大），但每 token FLOPs 按 37B（小）',
          '都按 37B',
          '都按 671B',
        ],
        answer: 1,
        explain:
          '显存要容纳全部专家权重（671B 规模），但每个 token 只激活 37B 参与计算——这是 MoE「内存换 FLOPs」的核心，也是成本模型的分水岭。',
        concept: 'cost-model',
      },
    ],
    [
      ['总参数量', '模型全部权重数，决定显存/内存容量下限，MoE 中随专家数增长'],
      ['激活参数量', '每 token 前向实际参与计算的权重数，决定 FLOPs 与每 token 延迟'],
      ['KV cache 线性增长', '自回归 KV 内存 ∝ 序列长 × 层数 × KV头数 × d_h × 字节'],
      ['$/token', '每生成 token 的成本 = GPU 租金×时间 ÷ token 数，受吞吐与并发影响'],
      ['显存墙', '权重 + KV + 激活超过显存容量时的瓶颈，限制并发进而限制吞吐'],
    ],
    [
      '用总参数量估推理 FLOPs——应由激活参决定；总参只决定显存容量。',
      '把 KV 的线性内存增长与注意力的平方计算混为一谈——KV 是线性内存、注意力是平方计算。',
      '算 $/token 时只算 GPU 租金忘了吞吐分母——同一张卡吞吐不同，$/token 可差数倍。',
      '忽略长上下文下 KV 挤占显存、压低并发——这会通过降低吞吐抬高 $/token。',
      '以为 MoE 只需 37B 的显存——需装全部 671B 专家权重，激活参小不等于显存小。',
    ],
  ),
  'framework',
)
