import { L, withKind } from '../../course-builders.ts'

export const L63 = withKind(
  L(
    'L63',
    30,
    'MLA：KV 联合低秩压缩减 93.3%',
    4,
    ['L62', 'L15'],
    ['mla'],
    [
      '推导 MLA 的 KV 联合低秩压缩到 c_KV',
      '解释 d_c≪2·n_h·d_h 的意义',
      '说明生成时再上投影',
      '核算减 KV 93.3%、吞吐 5.76×',
    ],
    `### 从 KV 缓存的膨胀说起

M2 已经把 KV 缓存的账算清：标准多头注意力里，每个 token 每层要存 K、V 两块，每块 n_h 个头、每头 d_h 维，合计 2·n_h·d_h 个元素。序列越长、层数越多、并发越大，这块显存越成为生成阶段的瓶颈。GQA（L15）的解法是减少 K/V 头数（从 n_h 降到 g），但它是「砍头数」这一条路。MLA 走的是另一条完全不同的路：**不砍头数，而是先把 K、V 联合压到一个低秩潜空间，缓存这个潜向量，用的时候再展开**。这一课把这条路的数学、数字与生成时行为讲透。

### 联合低秩压缩：压到 c_KV

设某层第 t 个 token 的隐藏状态是 h_t。标准 MHA 直接用两个矩阵算出各头 K、V 并缓存。MLA 引入一个下投影矩阵 W^DKV，把 h_t 压成低维潜向量 c_KV = W^DKV · h_t，其中 c_KV 的维度是 d_c。需要 K、V 时，再用两个上投影矩阵还原：K = W^UK · c_KV，V = W^UV · c_KV，得到的 K、V 仍是 n_h 个头、每头 d_h 维。关键点是：**推理缓存里只放 c_KV，不放展开后的 K、V**。W^DKV、W^UK、W^UV 都是权重矩阵，常数，不随序列增长；随序列增长的只有每个 token 的 d_c 维潜向量。

「联合」二字很重要：K 和 V 共用同一个 c_KV，各自用不同上投影还原。这比「分别压 K、压 V」更狠——把两份冗余的相关性揉进一份低秩表示里。这就是 d_c 可以远小于 2·n_h·d_h 的原因：K、V 原本在两个高维子空间里各有各的冗余，联合压缩只保留一份公共低秩骨架。

:::deep

### d_c 远小于 2·n_h·d_h 意味着什么

取一组便于手算的配置：n_h = 32、d_h = 128，则标准 MHA 每 token 每层的 KV 是 2·32·128 = 8192 个元素。MLA 的潜向量维度取 d_c = 512，仅内容部分就把缓存压到 512/8192 = 6.25%，即降幅 93.75%；再算上 L64 要讲的解耦旋转键（每 token 共享、约 d_h^R = 64 个元素），合计 576 个元素，降幅约 93%。这与 DeepSeek-V2 论文（arXiv:2405.04434）报告的 **93.3%** 是同一量级——A 级数字以论文实测为准，上面只是把机制算成可复核的账。注意这里的 n_h、d_h 是为了讲清机制选的手算配置，真实模型维度以官方 config 为准，结论「低秩 d_c 远小于全维 2·n_h·d_h」不依赖具体取值。

降低 KV 之所以能换来吞吐，是因为 decode 阶段是**显存带宽受限**：每生成一个 token 都要把全部历史 KV 从显存搬到片上做注意力，KV 越小、同样带宽能服务的并发请求越多。论文报告最大生成吞吐提升 **5.76 倍**（A 级），正是「KV 降一个数量级 → 并发上去 → 吞吐上去」这条链的实测结果。

:::

### 生成时再上投影：用算力换显存

一个自然的疑问是：缓存里只有 c_KV，注意力怎么算？答案是**生成时再上投影**。decode 到第 t 步时，从缓存里取出此前所有位置的 c_KV，对每个位置乘 W^UK、W^UV 得到该位置的 K、V，再参与注意力。这带来一次额外的小矩阵乘，但它有两个好处：一是上投影矩阵是共享权重，可以和高效率的 GEMM 融合；二是它把瓶颈从「搬巨大的 KV 显存」换成「算一个低秩展开」，而现代 GPU 的算力增长快于带宽增长，这笔交换很划算。换句话说，MLA 不是让计算消失，而是把计算从带宽受限的搬运，挪到算力充裕的矩阵乘。

### 一段可跑的压缩比核算

把上面的账写成代码：给定头数与头维，计算标准 MHA 的 KV、MLA 的 c_KV 加旋转键，以及降幅。断言把「降幅应超过九成」钉住。

\`\`\`python
def kv_per_token(n_h, d_h, d_c, d_rope=64):
    """每 token 每层的 KV 元素数。"""
    mha = 2 * n_h * d_h                 # MHA：K、V 各 n_h 个头、每头 d_h
    mla = d_c + d_rope                  # MLA：低秩 c_KV + 共享旋转键 k^R
    return mha, mla

n_h, d_h, d_c = 32, 128, 512
mha, mla = kv_per_token(n_h, d_h, d_c)
reduction = 1 - mla / mha
print(f"MHA KV/token/层 = {mha} 元素")
print(f"MLA KV/token/层 = {mla} 元素（c_KV={d_c} + k^R=64）")
print(f"KV 降幅 = {reduction:.2%}，官方报告 93.3%（A 级）")
assert reduction > 0.90, "MLA 的 KV 降幅应超过九成"
assert mla < mha / 10, "压缩后应不足原来的十分之一"
\`\`\`

把序列长度与层数也乘进去，看整段上下文的显存，并核对 5.76 倍吞吐的量级来源。

\`\`\`python
def kv_bytes(tokens, layers, per_token_elems, bytes_per_elem=2):
    return tokens * layers * per_token_elems * bytes_per_elem / 1e9   # GB

layers, seq = 61, 8192
mha_gb = kv_bytes(seq, layers, 2 * n_h * d_h)
mla_gb = kv_bytes(seq, layers, d_c + 64)
print(f"seq={seq} layers={layers}: MHA KV ≈ {mha_gb:.1f} GB, MLA KV ≈ {mla_gb:.1f} GB")
print(f"省下 {mha_gb - mla_gb:.1f} GB → 同显存可塞约 {mha_gb/mla_gb:.1f} 倍并发")
# 吞吐 5.76 倍来自：并发上限提升 + decode 带宽压力下降（A 级，论文实测）
assert mha_gb > mla_gb * 10
print(f"并发上限量级 {mha_gb/mla_gb:.1f} 倍，与吞吐 5.76 倍方向一致")
\`\`\`

### MLA 的位置编码伏笔

MLA 还有一个必须解决的细节：低秩压缩与 RoPE 并不天然兼容。标准 RoPE 要作用在完整 Q、K 的各头子空间上，利用旋转矩阵的相对位置性质；而 c_KV 是共享的低秩向量，直接对它旋转既破坏低秩结构、又无法还原出每头的位置信息。DeepSeek-V2 的办法是**解耦 RoPE**：把 K 拆成「不含位置的低秩内容部分」与「很小的、带旋转的位置部分 k^R」，内容部分走 MLA 压缩、旋转部分单独缓存。这样既保住 93.3% 的 KV 压缩，又保住位置精度。这正是下一课 L64 的主题，也是 MLA 能真正落地的关键拼图。

:::tip

### 三句话复述 MLA

**缓存什么**：只缓存低秩潜向量 c_KV（维度 d_c），不是展开后的 K、V。**为什么省**：d_c 远小于 2·n_h·d_h，K、V 联合压缩揉掉两份冗余，实测减 KV 93.3%（A 级）。**怎么用**：生成时乘 W^UK、W^UV 上投影还原各头 K、V，把显存带宽压力换成算力，换来最大生成吞吐 5.76 倍（A 级）。再加一句伏笔——位置信息靠 L64 的解耦 RoPE 单独保住。把这四句讲清，MLA 的机制就完整了。

:::
`,
    null,
    [
      {
        text: 'MLA 相比 MHA 省 KV 的根本原因是？',
        options: [
          '把 K/V 量化到 4bit',
          '把 K、V 联合低秩压缩成共享潜向量 c_KV，缓存维度 d_c 远小于 2·n_h·d_h',
          '减少层数',
          '缩短序列',
        ],
        answer: 1,
        explain:
          'MLA 用下投影把每 token 的 K/V 压到 d_c 维潜向量，只缓存 c_KV；d_c≪2·n_h·d_h 是省 KV 的数学根源。',
        concept: 'mla',
      },
      {
        text: 'MLA 在生成阶段如何得到每个头的 K、V？',
        options: [
          '重新跑一遍 prefill',
          '从缓存读出 c_KV，再乘上投影矩阵 W^UK、W^UV 重建',
          '用上一 token 的 K/V 代替',
          '丢弃 V 只用 K',
        ],
        answer: 1,
        explain:
          '生成时用两个上投影矩阵把低秩潜向量还原为各头 K、V，把显存开销换成一次小矩阵乘，decode 带宽大幅下降。',
        concept: 'mla',
      },
      {
        text: 'MLA 官方报告的 KV 降幅与最大生成吞吐提升是？',
        options: ['降 50%、2 倍', '降 93.3%、5.76 倍', '降 75%、4 倍', '降 30%、1.4 倍'],
        answer: 1,
        explain:
          'DeepSeek-V2 论文（arXiv:2405.04434）报告 MLA 减 KV 缓存 93.3%、最大生成吞吐提升 5.76 倍，为 A 级数字。',
        concept: 'mla',
      },
      {
        text: '若直接对压缩后的 c_KV 施加标准 RoPE，主要问题是？',
        options: [
          '位置编码会失效或无意义，因为旋转与低秩上投影不对易，需解耦出小旋转键',
          'KV 会变大',
          'AND 维度不整',
          '会丢掉 V',
        ],
        answer: 0,
        explain:
          'RoPE 要作用在各头完整 Q/K 的子空间上，而 c_KV 是共享低秩向量；旋转与上投影不对易，L64 用解耦 RoPE 把位置部分单独切成小旋转键 k^R。',
        concept: 'mla',
      },
    ],
    [
      ['MLA', 'Multi-head Latent Attention，把 K/V 联合压缩到低秩潜向量 c_KV，只缓存 c_KV'],
      ['c_KV', '每个 token 的压缩 KV 潜向量，维度 d_c，远小于 2·n_h·d_h'],
      ['上投影', '生成时用 W^UK、W^UV 把 c_KV 还原为各头 K、V 的操作'],
      ['KV 缓存降幅', 'MLA 官方报告 93.3%（A 级），decode 显存带宽瓶颈随之缓解'],
      ['吞吐 5.76 倍', 'DeepSeek-V2 报告的最大生成吞吐提升（A 级）'],
    ],
    [
      '以为 MLA 是量化——它压的是有效秩，可与量化正交叠加。',
      '把 c_KV 的维度记成 2·n_h·d_h——它是远小于该值的 d_c。',
      '以为生成时直接用 c_KV 当 K/V——必须经上投影还原为各头 K/V。',
      '忽略位置编码——MLA 必须配解耦 RoPE 才能保住位置精度（L64）。',
    ],
  ),
  'theory',
)
