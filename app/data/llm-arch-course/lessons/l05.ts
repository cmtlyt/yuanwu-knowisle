import { L, withKind } from '../../course-builders.ts'

export const L05 = withKind(
  L(
    'L05',
    1,
    'MHA → MQA → GQA：多头到分组的谱系与 KV 内存对照',
    3,
    ['L04'],
    ['multi-head'],
    [
      '能画出 MHA / MQA / GQA 三者 K、V 头共享的差别并算出各自 KV cache 内存',
      '说清「n_h×d_h = d_model」的约束与「KV 内存 ∝ 生成头数」的关系',
      '解释 MQA 为何省内存最狠但最伤质量、GQA 如何折中',
      '对照 GQA 官方（arXiv:2305.13245）说明分组数如何选、为何接近 MHA 质量',
    ],
    `
### 多头：把注意力拆成 h 个「子空间」

单头注意力用一组 Q/K/V 算一个相似度空间，容易「顾此失彼」。多头（Multi-Head Attention，MHA）把 d_model 切成 h 份、每份 d_k = d_model/h 个维度，**每头独立学一个子空间**再拼接：有的头看句法、有的看指代、有的看位置。约束是 \`n_h × d_h = d_model\`——头数越多、每头越窄，总容量不变。

### 问题出在「KV cache 内存」

生成时每个位置要把 K、V 存进 KV cache（M2 详述），**内存 ∝ 层数 × 生成头数 × d_h × 序列长 × 字节数**。MHA 每个查询头都配一对 K/V，头数 = 生成头数，所以 KV 内存最大。于是有两类「减 KV」的设计：

| 方案 | K/V 头数 | 相对 MHA 的 KV 内存 | 质量 |
|---|---|---|---|
| MHA | n_h 组 K/V | 1×（基准） | 最好 |
| MQA（全共享） | 1 组 K/V 共享给所有查询头 | 降 n_h 倍 | 最省但最伤质量 |
| GQA（分组） | g 组 K/V，每 g 个查询头共享一组 | 降 n_h/g 倍 | 折中，接近 MHA |

:::deep

### GQA 的折中逻辑

MQA 把 K/V 头全压到 1，KV 内存降 n_h 倍（比如 32 头 → 1/32），但「所有查询头共享同一组 Key/Value」让模型失去了「按子空间区分检索目标」的能力，质量明显掉。**GQA（arXiv:2305.13245）取中间：把 n_h 个查询头分成 g 组、每组共享一组 K/V**，g 通常取 4/8。KV 内存降 n_h/g 倍，而质量几乎追平 MHA——这就是它成为现代 LLM 默认（LLaMA 2 7B 起、Gemma、Grok 都用 GQA）的原因。

关键对照：MQA 是 GQA 的 g = n_h 的极端，MHA 是 g = 1 的极端，**三者是同一根滑杆（K/V 头数）的不同刻度**。选 g 的实用判据是「在 KV 预算下尽量靠近 MHA 质量」，g 越小越像 MHA、越占内存。

:::

\`\`\`python
# 概念：MHA / GQA 的 KV 内存与查询头数关系
def kv_bytes(seq_len, n_heads, kv_heads, d_head, bits=16, layers=1):
    # 每个生成位置要存 K 和 V 两块，每块 [kv_heads, d_head]
    per_token = 2 * kv_heads * d_head * (bits // 8)
    return layers * seq_len * per_token

# 设 d_model=4096, 16 头 → d_head=256
n_heads, d_head, seq_len = 16, 256, 2048
print("MHA  KV/层:", kv_bytes(seq_len, n_heads, kv_heads=n_heads, d_head=d_head))
print("GQA4 KV/层:", kv_bytes(seq_len, n_heads, kv_heads=4, d_head=d_head))
print("MQA  KV/层:", kv_bytes(seq_len, n_heads, kv_heads=1, d_head=d_head))
# 结论：GQA4 的 KV 是 MHA 的 4/16=1/4，MQA 是 1/16
\`\`\`

对照 GQA 官方（arXiv:2305.13245，EMNLP 2023）：论文发现 8×7B 级模型 GQA-8 相对 MHA 在生成质量上「几乎无损」、KV 内存与推理吞吐显著改善，据此在 LLaMA 2 中被默认采用。

### GQA 到底改了哪一行代码

MHA 的 K/V 投影是 \`W_k, W_v ∈ R^{d_model × d_model}\`，GQA 只改这两个矩阵的**输出维度**：把 \`W_k, W_v\` 的输出从 \`d_model\` 降到 \`g·d_h\`（g 是分组数），然后**复制**成 n_h 个头再用。也就是说 GQA 的「省」发生在**参数与 KV 缓存**两处，查询头（Q）数量不变：

\`\`\`python
import torch
import torch.nn as nn

class GQA(nn.Module):
    def __init__(self, d_model, n_h, g, d_h):
        super().__init__()
        assert g <= n_h and n_h % g == 0, "分组数 g 必须整除查询头数 n_h"
        self.n_h, self.g, self.d_h = n_h, g, d_h
        self.Wq = nn.Linear(d_model, n_h * d_h, bias=False)   # 查询头不变
        self.Wk = nn.Linear(d_model, g * d_h, bias=False)     # K 只输出 g 头
        self.Wv = nn.Linear(d_model, g * d_h, bias=False)     # V 只输出 g 头

    def forward(self, x):
        B, T, _ = x.shape
        q = self.Wq(x).view(B, T, self.n_h, self.d_h).transpose(1, 2)      # [B,n_h,T,d_h]
        k = self.Wk(x).view(B, T, self.g, self.d_h).transpose(1, 2)       # [B,g,T,d_h]
        v = self.Wv(x).view(B, T, self.g, self.d_h).transpose(1, 2)      # [B,g,T,d_h]
        # 核心一行：把 g 组 K/V 复制成 n_h 组，让每个查询头都能算 attention
        k = k.repeat(1, self.n_h // self.g, 1, 1)
        v = v.repeat(1, self.n_h // self.g, 1, 1)
        # 标准缩放点积注意力
        scale = self.d_h ** -0.5
        attn = torch.softmax(q @ k.transpose(-2, -1) * scale, dim=-1)
        return (attn @ v).transpose(1, 2).reshape(B, T, self.n_h * self.d_h)
\`\`\`

注意 \`k.repeat(...)\` 这一行——它说明 GQA 在**计算注意力**时仍然有 n_h 个「逻辑 K/V」，但**真正存进 KV cache 的只有 g 组**，重复是推理时才在显存里临时展开。这正是「省的是缓存内存、不是注意力算子」的关键。

### 把「内存账」算成一张表

给定一个 7B 级配置（\`d_model=4096, n_h=32, d_h=128, L=32 层, 序列 4096, 16bit\`），三种方案的 KV 缓存：

\`\`\`python
def kv_cache_mb(layers, seq, heads, d_h, bits=16):
    bytes_per_token = 2 * heads * d_h * (bits // 8)   # K + V 两块
    return layers * seq * bytes_per_token / 1e6

LAYERS, SEQ, N_H, D_H = 32, 4096, 32, 128
for name, g in [("MHA", 32), ("GQA-8", 8), ("GQA-4", 4), ("MQA", 1)]:
    print(f"{name:8s} KV cache ≈ {kv_cache_mb(LAYERS, SEQ, g, D_H):8.1f} MB  相对 MHA {g/N_H:.2f} 倍")
# MHA ≈ 1 GB；GQA-8 降到 1/4；MQA 降到 1/32
# 结论：KV cache 是「生成阶段」的内存瓶颈，g 每翻倍内存翻倍、质量略升
\`\`\`

这张表说明：**KV 内存是推理显存的最大项**（权重本身只占一次，KV 随并发与序列长线性涨）。M11 的部署课会讲「同显存下 GQA 能多塞几路并发」，根源就在这一行。换句话说，把 g 从 32 拧到 8，等价于把「KV 这块显存」直接让出 4 倍空间给并发或上下文——这是 GQA 真正改变业务形态的地方。

:::tip

### 选 g 的工程经验值

论文与 LLaMA 2 的经验：\`g\` 取 4 或 8 在 7B 级「几乎无损」；更大模型（70B）倾向 \`g=8\` 或 \`g=16\`。判据永远是「KV 预算固定时让 g 尽量小（越接近 MHA 越好）」。把 GQA 理解成「KV 内存与质量之间的旋钮」，而不是「某种固定方案」——不同显存预算拧到不同刻度。

:::

### 多头为什么「总容量不变」却能提表达力

这是 MHA 最反直觉的一点：把 \`d_model\` 切成 h 份、每份 \`d_k = d_model/h\`，参数量（\`4·d_model²\`）与总宽度都没变，多头凭什么更强？关键在于**多头等价于「多个子空间的线性投影再拼接」**：单头只能在**一个**相似度空间里比较，而 h 个头各自在 \`d_k\` 维子空间里比较，能同时捕捉「句法关系」「指代关系」「位置邻近」等多类关系。

打个比方：单头像是用**一把尺子**量所有维度上的相似度（容易被某个强维度主导）；多头像**多把不同角度的尺子**同时量，每把只看自己那块子空间，最后拼起来。约束 \`n_h×d_h = d_model\` 保证了「所有尺子的精度总和不变」——加头不会让总表达力凭空变多，但**分配方式**变了，让模型能把表达力用在「多类关系并行建模」上，这正是它比单头强的全部来源。

### 把「KV 省内存」翻译成「同显存多并发」

GQA/MQA 省的是**生成阶段**的 KV cache，而 KV cache 是**随并发数与序列长线性增长**的那部分显存。权重本身是固定的一次性占用，但每多服务一个用户、每多生成一个 token，KV 就要多一份。所以：

- 在**同一张卡**上，把 n_h 换成 g 组 KV，KV 占用降到 \`g/n_h\`，**省出来的显存可以直接换成更多并发**（同一时刻服务更多请求）或更长上下文（同一用户能写更长的对话）。
- 这也是 M11 部署课里「同显存下 GQA 吞吐更高」的机制根源——它不是让单请求更快，而是让**单位显存能扛的并发/上下文**更多。

:::tip

### GQA 的「repeat」到底在算什么

回到上面 GQA 代码里的 \`k.repeat(1, n_h//g, 1, 1)\`：这行让**逻辑上**有 n_h 组 K/V，但**物理上**只存了 g 组。\`repeat\` 是 \`view\` 级别的无拷贝广播（内存不翻倍），所以注意力算子看到 n_h 组、KV cache 只占 g 组——这就是「省的是缓存、不是算子」。理解这一行，就理解了 GQA 与 MHA 的唯一差别：**K/V 的存储份数 vs 计算份数被解耦了**。

:::
`,
    null,
    [
      {
        text: '决定 KV cache 内存大小的因素是？',
        options: ['查询头数', 'K/V 生成头数 × d_h × 序列长', 'FFN 宽度', '词表大小'],
        answer: 1,
        explain:
          'KV cache 内存 ∝ 层数 × K/V 生成头数 × d_h × 序列长 × 字节数，由生成头数（不是查询头数）决定。',
        concept: 'multi-head',
      },
      {
        text: 'MQA 相比 MHA 的 KV 内存降幅与代价是？',
        options: ['降 2 倍、无损', '降 n_h 倍、最省但最伤质量', '不降、最稳', '降 n_h² 倍'],
        answer: 1,
        explain:
          'MQA 把所有查询头共享 1 组 K/V，KV 内存降 n_h 倍，但失去按子空间区分检索的能力，质量掉最多。',
        concept: 'multi-head',
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
        concept: 'multi-head',
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
        explain: '多头是把 d_model 切 h 份、每份 d_model/h，总表达容量不变，只是换个角度学。',
        concept: 'multi-head',
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
      '忽略 d_h 与字节数——KV 内存还随 d_h 与量化位宽变化（M2 量化课展开）。',
    ],
  ),
  'framework',
)
