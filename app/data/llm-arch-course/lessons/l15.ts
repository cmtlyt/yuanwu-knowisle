import { L, withKind } from '../../course-builders.ts'

/* ========== 模块 2 · 注意力机制演进 ========== */

export const L15 = withKind(
  L(
    'L15',
    6,
    'MHA → MQA → GQA：分组查询注意力的谱系',
    2,
    ['L11'],
    ['mha-mqa'],
    [
      '说清 MHA / MQA / GQA 三者 K、V 头共享的差别与谱系关系',
      '解释「n_h×d_h = d_model」约束与「KV 内存 ∝ 生成头数」的关系',
      '解释 MQA 为何省内存最狠但最伤质量、GQA 如何折中',
      '对照 GQA 官方（arXiv:2305.13245）说明分组数如何选',
    ],
    `
### 从 M1 的谱系地图进 M2

M1-L11 的谱系地图标了一条短板：「KV 存储随头数 × 序列长膨胀」。M2 全模块都在拆这条短板。第一课先把它最前端的**多头到分组**讲透：MHA（每查询头配一组 K/V）→ MQA（全部查询头共享 1 组 K/V）→ GQA（分组共享，折中）。这是现代 LLM 推理内存优化最基础的一环，后面 FlashAttention、PagedAttention、KV 量化都建立在它之上。

### MHA：每个查询头一组 K/V

标准多头注意力（M1-L05/L06 已实现）里，n_h 个查询头各有自己的 Q，并各自配一组 K、V。约束 \`n_h × d_h = d_model\`：头数越多每头越窄，总容量不变。KV cache 内存随**生成头数 n_h** 线性增长，这是 MHA 在推理侧最贵的地方。

### MQA：全部共享 1 组 K/V

MQA（Shazeer 2019，Multi-Query Attention）把 K、V 头全压到 1 组，所有查询头共享同一对 K/V。KV 内存直接降 n_h 倍（如 32 头 → 1/32），是省内存最狠的方案。但代价是**所有查询头失去「按子空间区分检索目标」的能力**——本来不同头可以看句法、指代、位置等不同关系，现在全挤到同一组 K/V 上，质量掉得最多。MQA 是 GQA 的「g = n_h」极端。

:::deep

### GQA：分组折中

GQA（arXiv:2305.13245，EMNLP 2023）取中间：把 n_h 个查询头分成 g 组、每组共享一组 K/V，K/V 头数从 n_h 降到 g。KV 内存降 n_h/g 倍，而论文在 7B/13B 级实验发现 g=8 时质量「几乎无损」。这就是它成为现代 LLM 默认（LLaMA 2 7B 起、Gemma、Grok 都用 GQA）的原因。

把三者钉在一根滑杆上：**K/V 生成头数从 n_h（MHA）滑到 1（MQA），g 是中间任意刻度**。MHA 是 g=1、MQA 是 g=n_h，GQA 是 1 < g < n_h 的折中。

:::

### 三方案 KV 内存账

给定 \`d_model=4096, n_h=32, d_h=128, L=32 层, 序列 4096, 16bit\`，KV cache：

\`\`\`python
def kv_cache_mb(layers, seq, kv_heads, d_h, bits=16):
    bytes_per_token = 2 * kv_heads * d_h * (bits // 8)   # K + V 两块
    return layers * seq * bytes_per_token / 1e6

LAYERS, SEQ, D_H, N_H = 32, 4096, 128, 32
for name, g in [("MHA (g=32)", 32), ("GQA-8", 8), ("GQA-4", 4), ("MQA (g=1)", 1)]:
    print(f"{name:10s} KV/层 ≈ {kv_cache_mb(LAYERS, SEQ, g, D_H):7.1f} MB  相对 MHA {g/N_H:.2f} 倍")
# MHA ≈ 1.0 GB/层；GQA-8 降到 1/4；MQA 降到 1/32
# 结论：KV 内存是「生成阶段」显存瓶颈，g 越小越省、越接近 MHA 质量越高
\`\`\`

这张表是 M2 后续所有 KV 优化（PagedAttention 省碎片、KV 量化省字节、MLA 省有效秩）的**起点账**：先认清 MHA 的 KV 有多贵，才知道后面每省一块是在省哪个因子。

### 为什么 g 选 4 或 8

GQA 论文与 LLaMA 2 的经验：7B 级 \`g\` 取 4 或 8「几乎无损」，更大模型倾向 8 或 16。判据永远是「KV 预算固定时让 g 尽量小（越接近 MHA 越好）」。工程上把它当成**内存与质量之间的旋钮**：显存富余拧大（接近 MHA）、显存紧张拧小（省 KV）。下一课 L16 把「选 g」落到手写 GQA 与 KV 内存实测，L24 capstone 再把它接进 vLLM 吞吐。

:::deep

### 一张「选 g」的工程清单（可套用到你手上任何模型）

把「显存预算 → 选 g」从口号落成可执行的判断顺序，遇到「这个模型 KV 会不会爆」先过一遍：

1. **先算 MHA 的 KV 起点账**（用上面 \`kv_cache_mb\`，\`kv_heads=n_h\`）。这是「最贵档」，一切优化都从这里省。
2. **定并发与目标序列长**：同显存能塞的并发数 = 显存预算 / 单请求 KV。目标序列越长、并发越高，越需要把 g 拧小（KV 起点账越大、越扛不住）。
3. **选 g 的默认档**：7B 级取 8（LLaMA 2 7B 官方即 GQA-8）、13B 取 8、70B 取 8；显存极紧的小模型可上 4。判据是「下游任务掉点可接受」——GQA 论文的结论是 g=8 时 7B/13B 几乎无损，但**你自己的任务**要抽测，不能直接抄 8。
4. **量化再叠一档**（L26）：g 拧到极限后仍不够，就对 KV 上 INT8/FP8，字节数再砍一半。g 与量化**正交**：g 压「头数因子」、量化压「字节因子」，两个旋钮一起拧。
5. **长上下文再叠滑窗**（L18）：若目标序列 32K+，在低价值层换滑窗（只存最近 W），与 GQA 叠用进一步压 KV。

:::

### 代码自检：g 必须整除 n_h

选完 g 有一条硬约束：\`n_h % g == 0\`（否则 repeat 广播对不齐、直接维度报错）。把这条写进模型的初始化断言，是 L16 手写层要做的事，这里先钉死认知：

\`\`\`python
# 常见 n_h / g 组合自检（n_h % g == 0 才合法）
for n_h in (8, 16, 32, 64):
    legal = [g for g in (1, 2, 4, 8, 16) if n_h % g == 0]
    print(f"n_h={n_h:2d}  合法 g：{legal}")
# 例：n_h=32 时 g∈{1,2,4,8,16}；g=8 → GQA-8；g=32 → MHA；g=1 → MQA
\`\`\`

这行自检把「MHA 是 g=1（g=n_h）、MQA 是 g=n_h（生成头压到 1）、GQA 是中间」的谱系钉成了**可枚举的整数**，选 g 就是在这根离散滑杆上取一格，而不是一个模糊的「折中」。

:::tip

### 把 MHA/MQA/GQA 记成一根滑杆

三者本质是「**K/V 生成头数从 n_h（MHA）滑到 1（MQA）**」这根杆上的不同刻度，g 是中间任意整数：MHA=g=1（每查询头配一组 K/V，KV 最贵）、MQA=g=n_h（全共享 1 组，KV 最省但最伤质量）、GQA=1<g<n_h（折中）。记住这根滑杆，后面 L16 手写、L17 uptrain、L24 接 vLLM，全都是在「这根杆上选一格并实测它的 KV/质量/吞吐代价」。

:::
`,
    null,
    [
      {
        text: '决定 KV cache 内存大小的关键因素是？',
        options: ['查询头数', 'K/V 生成头数 × d_h × 序列长', 'FFN 宽度', '词表大小'],
        answer: 1,
        explain:
          'KV cache 内存 ∝ 层数 × K/V 生成头数 × d_h × 序列长 × 字节数，由生成头数（不是查询头数）决定。',
        concept: 'mha-mqa',
      },
      {
        text: 'MQA 相比 MHA 的 KV 内存降幅与代价是？',
        options: ['降 2 倍、无损', '降 n_h 倍、最省但最伤质量', '不降、最稳', '降 n_h² 倍'],
        answer: 1,
        explain:
          'MQA 把所有查询头共享 1 组 K/V，KV 内存降 n_h 倍，但失去按子空间区分检索的能力，质量掉最多。',
        concept: 'mha-mqa',
      },
      {
        text: 'GQA 相对 MHA 的定位是？',
        options: [
          'MHA 的 g=1 极端',
          '把查询头分组共享 K/V、内存与质量的折中',
          '完全不用 K/V',
          '只用注意力不用 FFN',
        ],
        answer: 1,
        explain: 'GQA 取 n_h/g 组 K/V，g 小则接近 MHA 质量、g 大则省更多内存，是 MQA 与 MHA 之间的滑杆。',
        concept: 'mha-mqa',
      },
      {
        text: '「n_h × d_h = d_model」约束的含义是？',
        options: [
          '头越多每头越宽',
          '头数与头维乘积固定为 d_model，总容量不变',
          '与 d_model 无关',
          '只限查询头',
        ],
        answer: 1,
        explain: '多头是把 d_model 切 h 份、每份 d_model/h，总表达容量不变，只是换个子空间分工。',
        concept: 'mha-mqa',
      },
    ],
    [
      ['MHA', '多头注意力，每查询头配一组 K/V，KV 内存最大'],
      ['MQA', 'Multi-Query Attention，所有查询头共享 1 组 K/V，最省内存伤质量'],
      ['GQA', '分组查询注意力，n_h/g 组 K/V，内存与质量折中，现代 LLM 默认'],
      ['KV cache', '生成时按位置累积存储的 K/V，内存 ∝ 生成头数 × 序列长'],
    ],
    [
      '以为「头越多越好」——总容量不变，只是换个子空间分工。',
      '把 KV 内存按「查询头数」算——应按 K/V 生成头数算，这正是 GQA 省内存的地方。',
      '直接上 MQA 省到底——质量掉最多，一般用 GQA 折中。',
      '忽略 d_h 与字节数——KV 内存还随 d_h 与量化位宽变化（L26 KV 量化课展开）。',
    ],
  ),
  'theory',
)
