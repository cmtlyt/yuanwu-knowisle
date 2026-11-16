import { L, withKind } from '../../course-builders.ts'

export const L13 = withKind(
  L(
    'L13',
    5,
    '逐 token 生成与 KV 缓存复用：训练 vs 推理的差异',
    3,
    ['L04', 'L12'],
    ['gen-kv-reuse'],
    [
      '说清「训练并行」与「推理逐 token 自回归」两种模式的根本差异',
      '推导为何已生成 token 的 K/V 可以缓存复用（免每步 O(N) 重算）',
      '估算 KV 缓存在「生成头数 × 序列长 × 字节数」上的内存量',
      '点明这就是 M2 GQA / PagedAttention / KV 量化 / MLA 的动机',
    ],
    `
### 训练并行 vs 推理自回归

L02 讲过：训练时靠**教师强制 + 因果掩码**，一次前向就能把所有位置的 loss 算完（并行）。但**推理生成**时情况不同——我们要**逐 token** 吐字：生成第 1 个、把它接上去、再生成第 2 个……每一步都依赖上一步的输出，天然串行。这就是「自回归」在推理侧的样子。

问题来了：每生成一个新 token，都要把它和**前面所有已生成 token** 做注意力。如果每一步都从头重算前面所有 K/V，生成 N 个 token 就要 O(N²) 次重算——这是推理最大的浪费。

### KV 缓存复用：为什么可以「记住」K/V

关键洞察：**因果注意力里，前面已生成 token 的 K/V 值不会变**。第 t 步要算注意力时，前 t−1 个 token 的 Key/Value 在第 t−1 步就算过了，和现在一模一样（因果掩码保证未来 token 不影响过去）。所以推理时**缓存已生成的 K/V**，新 token 只算自己这一个位置的 Q/K/V、再和缓存拼起来算注意力——每步从 O(N²) 降到 O(N)。这就是 **KV cache**（M2 的核心优化对象）。

\`\`\`python
# 概念：带 KV 缓存的逐 token 自回归生成
import torch

class KVCachedAttention:
    def __init__(self, d_model, n_heads):
        self.h, self.d_k = n_heads, d_model // n_heads
        self.cache_k, self.cache_v = [], []    # 累积已生成 token 的 K/V

    def forward(self, q_new, k_new, v_new):
        # 新 token 的 K/V 追加进缓存（因果：过去的 K/V 不再重算）
        self.cache_k.append(k_new)
        self.cache_v.append(v_new)
        K = torch.cat(self.cache_k, dim=0)      # [N_so_far, d]
        V = torch.cat(self.cache_v, dim=0)
        # 只用「新 q」去注意全部「已缓存 K/V」
        scores = (q_new @ K.T) / (self.d_k ** 0.5)
        return torch.softmax(scores, dim=-1) @ V

# 内存估算：KV cache ≈ 层数 × 2(K和V) × 生成头数 × d_h × 序列长 × 字节
def kv_bytes(seq_len, n_kv_heads, d_head, bits, layers):
    return layers * seq_len * 2 * n_kv_heads * d_head * (bits // 8)

# 例：40 层、8 组 GQA K/V 头、d_head=128、16bit、4K 上下文
print("4K 上下文 KV cache ≈",
      kv_bytes(4096, 8, 128, 16, 40) // (1024**3), "GB")
# 换成 INT8 直接减半；GQA 头数越少越小 —— 这正是 M2 的优化方向
\`\`\`

:::deep

### KV 缓存把「内存瓶颈」立起来，后面全在拆它

KV cache 让推理**计算**变快了，但代价是**内存**：它随「层数 × 生成头数 × 序列长 × 字节数」线性膨胀，长上下文 + 大 batch 时显存会被 KV 吃满。于是 M2/M7 的一系列优化都在这根轴上做文章：

- **GQA（M2-L01）**：减少 K/V 头数 → KV 内存降 n_h/g 倍。
- **PagedAttention / vLLM（M2-L07）**：把 KV 当操作系统分页管理 → 提高 GPU 利用率、支持更大 batch。
- **KV 量化（M2-L12）**：INT8/FP8 存 K/V → 内存再砍一半。
- **MLA（M7-L02）**：把 K/V 联合低秩压缩 → DeepSeek-V2 减 KV 93.3%。

**一句话**：L13 把「为什么要有 KV 缓存」讲透，M2/M7 才有的放矢。

### 一次「从头重算」到底浪费在哪

把「没有 KV 缓存」的推理成本算清：生成第 1 个 token 算 1 次 K/V；生成第 2 个要重算前 2 个；生成第 N 个要重算前 N 个，累计 1+2+…+N = O(N²) 次 K/V 投影——**同一份 K/V 被反复重算 N 遍**。因果注意力保证「前面的 K/V 不会因后面新 token 改变」，这些重算全是浪费。缓存后第 t 步只投影新 token 自己（1 次），再把新 K/V 追加进缓存、和整段一起算注意力——总计算从 O(N²) 降到 O(N)。

### 长上下文 + 大 batch 的显存账

落到工程：40 层、每层 8 组 GQA K/V 头、d_head=128、FP16（2 字节），4K 单序列 KV ≈ 40 × 4096 × 2 × 8 × 128 × 2 ≈ **1.6 GB**；再乘 32 并发就 50+ GB，远超单卡显存。这正是「长上下文 + 大 batch 时显存被 KV 吃满」的实感来源。注意 K/V 是**成对**累积的（K 决定权重怎么分、V 决定加权取什么），所以内存估算要乘 2；M2/M7 压的就是这成对的一块——GQA 压「生成头数」、量化压「字节数」、MLA 压「d_h 的有效秩」，三条轴各管一半。

### 「缓存后只算新 token」的边界：什么时候缓存会失效

KV 缓存成立的唯一前提是「已生成 token 的 K/V 不变」。这个前提在两种常见场景下会被打破，要心里有数：

- **改 prompt 或换对话**：一旦上下文变（用户改写、切换会话），整段 KV 全部作废，必须从头重算——这也是为什么 L11 的朴素贪心「取最近 64 个 token」在某些场景会重新跑前缀。
- **非因果/双向模型**：双向注意力里第 t 位能看到未来，未来 token 会反过来改变前面位置的 K/V，缓存假设直接失效。M5 扩散 LLM 是双向去噪，所以它**不能用经典 KV cache**——这是扩散范式的一个隐藏代价。

### 把「KV 复用」和「M2 三大优化」精确对位

L13 只回答「为什么要有 KV cache」，M2/M7 的三个优化分别攻 KV 内存公式里的三个因子，对应关系要记死：

- **GQA（M2-L01）攻「生成头数」**：把 n_h 组 K/V 压成 g 组，公式里 \`×n_kv_heads\` 变小 → 内存降 n_h/g 倍。
- **KV 量化（M2-L12）攻「字节数」**：K/V 从 FP16 降到 INT8/FP8，公式里 \`×(bits//8)\` 减半 → 内存直接砍半。
- **PagedAttention（M2-L07）攻「利用率」**：不省单序列内存，但把 KV 当 OS 分页管理，消除碎片、支持更大 batch 与更灵活的前缀共享。
- **MLA（M7-L02）攻「d_h 有效秩」**：把 K/V 联合投影到低秩潜空间，DeepSeek-V2 报告 KV 减 93.3%。

四者**正交可叠**：GQA + 量化 + PagedAttention + MLA 能同时上，各自砍公式里不同的因子，这也是 M2 的「内存账」能从 1.6GB 一路压到几百分之几的原因。

:::tip

### 一句话记住「训练并行 vs 推理串行」

训练是「**整段喂进去、一次算完所有位置的 loss**」（教师强制 + 因果掩码，GPU 吃满并行）；推理是「**逐 token 吐字、每步依赖上一步**」（串行、每步一次前向，KV cache 让它从 O(N²) 降到 O(N)）。把这两句钉死，后面 M2 全模块的优化动机（省推理、不省训练）就全通了——**KV cache 及其优化只发生在推理侧**，训练侧永远是整段并行。

:::

:::
`,
    null,
    [
      {
        text: '推理生成相比训练的根本差异是？',
        options: [
          '训练串行、推理并行',
          '训练并行（教师强制）、推理逐 token 自回归',
          '两者完全一样',
          '推理不用因果掩码',
        ],
        answer: 1,
        explain: '训练靠因果掩码一次并行算全位置；推理必须逐 token、依赖上一步输出，天然串行。',
        concept: 'gen-kv-reuse',
      },
      {
        text: 'KV 缓存能省计算的根本原因是？',
        options: [
          'K/V 值变小了',
          '因果性下已生成 token 的 K/V 不变，可复用免重算',
          '注意力变 O(1)',
          '不用 FFN',
        ],
        answer: 1,
        explain: '因果掩码保证未来不影响过去，已生成 K/V 恒定，缓存后每步只算新 token，O(N²)→O(N)。',
        concept: 'gen-kv-reuse',
      },
      {
        text: 'KV cache 内存量正比于？',
        options: ['层数 × 生成头数 × d_h × 序列长 × 字节数', '只与词表大小', '只与序列长', '与 FFN 宽度'],
        answer: 0,
        explain: '每层每生成头要存 K、V 两块，随层数/头数/序列长/字节数线性膨胀，是长上下文显存大头。',
        concept: 'gen-kv-reuse',
      },
      {
        text: '「减少 K/V 头数」直接降低 KV 内存的架构是？',
        options: ['RMSNorm', 'GQA', 'SwiGLU', 'RoPE'],
        answer: 1,
        explain: 'GQA 用 n_h/g 组 K/V 替代 MHA 的 n_h 组，KV 内存降 n_h/g 倍（M2 主线）。',
        concept: 'gen-kv-reuse',
      },
    ],
    [
      ['教师强制', '训练用真实序列做条件，一次前向并行算全位置 loss'],
      ['自回归生成', '推理逐 token 吐字，每步依赖上一步输出'],
      ['KV cache', '缓存已生成 token 的 K/V，把每步 O(N²) 重算降到 O(N)'],
      ['内存瓶颈', 'KV 随层数×头数×序列长×字节膨胀，是 GQA/量化/MLA 的优化对象'],
    ],
    [
      '以为推理也能像训练那样一次并行——生成必须逐 token，无法并行吐字。',
      '以为 KV 缓存「免费」——它省计算但花内存，长上下文显存会被吃满。',
      '把 KV 内存按「查询头数」算——应按 K/V 生成头数（GQA 省的就是这里）。',
      '缓存后仍每步重算全部 K/V——那样 KV cache 就没意义了，只算新 token 才省时。',
    ],
  ),
  'theory',
)
