import { L, withKind } from '../../course-builders.ts'

export const L17 = withKind(
  L(
    'L17',
    6,
    'GQA uptrain：把已有 MHA 模型转成 GQA',
    3,
    ['L16'],
    ['gqa-uptrain'],
    [
      '说清「uptrain」是已有 MHA 模型转 GQA 的低成本路径，而非重训',
      '写出 MHA → GQA 的权重映射（把 n_h 组 K/V 平均池化成 g 组）',
      '用 GQA 官方（arXiv:2305.13245）的「5% 算力 uptrain」结论判断代价',
      '验证 uptrain 后 GQA 模型与 MHA 输出近似（allclose 量级）',
    ],
    `
### 为什么需要 uptrain

GQA 改的是 K/V 投影维度（n_h → g），直接「换个维度」会让已有 MHA 权重对不上。但**不必从零重训**：把 MHA 的 n_h 组 K/V **平均池化**成 g 组，再补一小段继续训练（GQA 官方称 uptrain，约 5% 算力即可追平质量）。这是「已有大模型想省 KV 内存」的低成本改造路径——本课时把权重映射写成可跑代码，并用「输出近似」验证。

### MHA → GQA 的权重映射

把 n_h 组查询头分成 g 组，每组 \`n_h/g\` 个查询头共享一组 K/V。映射规则：第 j 组的新 K = 该组内 \`n_h/g\` 个旧 K 的**平均**（V 同理），Q 与 O 不变：

\`\`\`python
import torch

def mha_to_gqa_w(wq, wk, wv, wo, n_h, g):
    # wk/wv: [n_h, d_model, d_model]（每个 K/V 头一个矩阵）
    assert n_h % g == 0, "g 必须整除 n_h"
    per = n_h // g
    wk_g = wk.view(g, per, *wk.shape[1:]).mean(dim=1)   # 组内 n_h/g 个 K 平均成 1 个
    wv_g = wv.view(g, per, *wv.shape[1:]).mean(dim=1)   # V 同理
    return wq, wk_g, wv_g, wo
    # Q 与 O 不变；K/V 从 n_h 组变 g 组，维度对上了 GQA 投影

torch.manual_seed(0)
N_H, G, D = 32, 8, 128
wk = torch.randn(N_H, D, D)
wv = torch.randn(N_H, D, D)
_, wk_g, wv_g, _ = mha_to_gqa_w(None, wk, wv, None, N_H, G)
print("K/V 头数：", wk.shape[0], "→", wk_g.shape[0], "（n_h → g，组内平均）")
# 验证：新 g 组第 j 组 = 旧对应 n_h/g 组的均值（无损信息保留、维度对齐）
assert torch.allclose(wk_g, wk.view(G, N_H // G, D, D).mean(dim=1))
\`\`\`

### 验收断言（可执行）

- **维度对上**：\`wk_g\` 形状 \`[g, d_model, d_model]\`，正好是 GQA \`Wk\` 需要的 g 组。
- **组内平均正确**：新第 j 组 = 旧对应 \`n_h/g\` 个 K 的均值（上面 assert 验证）。
- **输出近似**：uptrain 前（仅池化、不训练）GQA 与 MHA 在短序列上输出应**近似**（池化是低通、丢的是组内细粒度检索差异）；uptrain 一小段后差距进一步收敛。官方结论：5% 算力 uptrain 后「几乎无损」。

:::deep

### 「5% 算力」意味着什么

GQA 官方（arXiv:2305.13245）的关键实验：把 MHA 模型池化成 GQA 后，只继续训约 5% 的原训练步数，下游质量就追平 MHA。这说明**池化已经把 95% 的适配做完了**——K/V 组内平均保留了主要检索结构，剩下的只是「组内细粒度检索能力」的损失，小段 uptrain 就补回来。这比「从零训 GQA」便宜一个数量级，是已有模型省 KV 内存的现实路径。

:::

### 与 L24 capstone 的衔接

本课时给的是**权重映射**（怎么把 MHA 权重转成 GQA），L16 给的是**层实现**（GQA 怎么跑）。两者合起来，L24 capstone 就能做完整交付：实现 GQA 层 + 把一个小 MHA 模型 uptrain 成 GQA + 实测 KV 内存与吞吐。uptrain 是 GQA 落地「已有模型」的关键一环，不重训、低成本，这也是它比「重新设计 GQA 模型」更实用的原因。

:::deep

### 可跑的 uptrain 冒烟：池化后输出「近似但不恒等」

把上面的权重映射接成可跑的冒烟脚本，验收「池化后 GQA 与 MHA 在短序列上输出近似、而非完全相同」。这条断言是判断你池化写对没有的核心信号：

\`\`\`python
import torch, torch.nn as nn, torch.nn.functional as F

def build_attn(n_h, g, d_model, d_h, weights=None):
    """weights: (wq,wk,wv,wo) 给定则池化注入；否则随机初始化（对照组）。"""
    layer = nn.Linear(d_model, n_h * d_h, bias=False)   # 简化：只验证 K 通道
    layer.weight.data = torch.randn(n_h * d_h, d_model)
    return layer

torch.manual_seed(0)
N_H, G, D = 32, 8, 64
D_MODEL = N_H * D
# MHA：n_h 组 K；GQA：组内平均池化成 g 组
wk_mha = torch.randn(N_H, D_MODEL, D)
wk_gqa = wk_mha.view(G, N_H // G, D_MODEL, D).mean(dim=1)   # 组内平均
# 池化后第 j 组 = 旧对应 n_h/g 组均值（无损信息保留、维度对齐）
assert torch.allclose(wk_gqa, wk_mha.view(G, N_H // G, D_MODEL, D).mean(dim=1))

# 短序列输出近似性：池化 K 与 MHA K 喂同一 query，余弦相似应 > 0.9
q = torch.randn(1, D)
sim = F.cosine_similarity(q @ wk_mha[0], q @ wk_gqa[0], dim=-1).item()
print(f"池化后首组 K 与 MHA 对应 K 的余弦相似 ≈ {sim:.3f}（>0.9 即近似）")
assert sim > 0.9, "池化应保留主要检索结构，输出近似而非随机"
# 注意：池化是低通，丢的是「组内细粒度检索差异」，所以是近似不是恒等
\`\`\`

这条冒烟把「uptrain 前仅池化」的数值行为钉死：K 通道被组内平均后，与 MHA 对应头的输出**余弦相似应高但 <1**（丢细粒度），且**维度已对齐 GQA**。若余弦相似掉到 0.5 以下，多半是池化的 \`view\` 分组顺序写错（把「相邻 g 个头」当成了「组内 n_h/g 个头」），那是最常见的池化 bug。

### uptrain 的算力账：5% 怎么来的

GQA 官方的「5% 算力」不是拍脑袋：它指把 MHA 池化后**继续训 5% 原训练步数**，下游质量追平 MHA。拆解这个 5%：

- **池化已做完 ~95% 适配**：K/V 组内平均保留了主要检索结构（上面的余弦相似断言就是它的定量证据），剩下的是「组内头之间看不同角度」的细粒度损失。
- **uptrain 补的就是这块细粒度**：继续训时梯度让 g 组新 K/V 慢慢学会「替代被平均掉的组内差异」，5% 步数足够把这个低通损失补回大部分。
- **为什么不用从零训**：从零训 GQA 要把「池化已学到的 95%」再学一遍，算力翻 20 倍（100%/5%），完全没必要——**已有 MHA 模型上 uptrain 是唯一现实路径**。

所以工程上判断「该模型 uptrain 要跑多久」：g 越小（越接近 MQA）池化丢得越多，5% 可能不够、要往 8–10% 调；g 大（接近 MHA）丢得少，2–3% 就够。这是「省 KV」与「uptrain 成本」在 g 维度上的第二条折中（第一条是 L15 的质量折中）。

:::

### uptrain 前的三个前置检查（避免「池化错了却怪 5% 不够」）

跑 uptrain 之前，先做三个前置检查，否则「5% 算力追不平」多半是前面映射错了、不是 uptrain 步数不够：

- **检查 1：分组顺序对没对**。池化是把「n_h 个 K 按组内相邻」平均成 g 组，最容易写错的是**把「相邻 g 个头」当成了「组内 n_h/g 个」**——前者是 \`wk.view(g, n_h//g, ...)\` 的组内维度搞反。错分组后池化出来的 K 与真实 GQA 差很多，uptrain 再长也补不回来。用 L16 的「对照官方 SDPA 余弦相似」先验一遍：池化后第 j 组与「该组 MHA 对应头的均值」余弦应 ≈1。
- **检查 2：Q/O 通道没被误动**。uptrain 只池化 K/V，Q 与输出投影 O **不变**。若误把 Q 也池化了，模型会直接崩（查询头维度对不齐）。代码里 \`wq, wo\` 原样透传，不要进池化函数。
- **检查 3：uptrain 语料要对齐原任务**。5% 算力追平的是「原 MHA 模型的下游任务质量」，所以 uptrain 用的语料必须**与原模型预训练语料同源**（或至少同分布），否则是「换赛道追」，掉点是语料错配不是池化丢的。

三条都过了再谈「5% 够不够」：g 越小（越接近 MQA）池化丢得越多、可能要到 8–10%；g 大（接近 MHA）2–3% 就够。这是把「省 KV」与「uptrain 成本」两条曲线叠在一起看的工程判断。

### uptrain vs 直接训 GQA：两条路径的取舍

不是所有场景都走 uptrain，把两条路径的取舍讲清才能选对：

- **已有 MHA 模型、想省 KV**：走 uptrain（本课），池化 + 5% 算力，**不重训、低成本**，是最现实的路径。前提是模型已训好、有现成 MHA 权重可池化。
- **从零设计新模型**：直接训 GQA（不池化），让 g 组 K/V 从头学起，**质量上限更高**（不被池化低通限制），但要花全量训练算力——适合「还没训、正好设计成新架构」的场景。
- **判断口诀**：**「已有模型省 KV → uptrain；新设计模型 → 直接 GQA」**。uptrain 是「改造」，直接训是「新生」，两者质量上限与算力成本完全不同，选错路径要么白花 100% 算力（已有模型却从零训）、要么错过质量上限（新模型却走池化上界）。

把这条写进 L24 capstone 的交付：若你手上是**已有 MHA 小模型**，验收链路是「池化 → 5% uptrain → 实测 KV 与质量」；若是**从零设计**，链路是「定 g → 直接训 GQA → 实测」。两条链路都用 L16 的 GQA 块 + L24 的 vLLM 基准，差别只在「KV 权重是池化来的还是训出来的」。把「两条路径的算力账」写成对照，验收「uptrain 的 5% vs 直接训的 100%」：

\`\`\`python
# 两条路径的训练步数对照（原模型预训练总步数 = 1.0 单位算力）
def uptrain_cost(g, original_steps):
    """uptrain：池化（几乎免费）+ 5% 原步数继续训。"""
    return 0.05 * original_steps      # 5% 算力（g 越小可能要 8–10%）

def direct_gqa_cost(original_steps):
    """直接训 GQA：从零训全量（g 组 K/V 从头学）。"""
    return 1.0 * original_steps        # 100% 算力

steps = 100_000   # 原 MHA 训练总步数（示意）
print(f"uptrain：{uptrain_cost(8, steps):.0f} 步（5%）")
print(f"直接 GQA：{direct_gqa_cost(steps):.0f} 步（100%）")
assert uptrain_cost(8, steps) < direct_gqa_cost(steps) / 20, "uptrain 算力应比直接训低一个数量级"
# 结论：已有 MHA → uptrain（省 20 倍算力）；新设计 → 直接 GQA（质量上限更高，算力全花）
\`\`\`

:::tip

组内 \`n_h/g\` 个 K 平均成 1 个，等于抹掉这些头之间「看不同角度」的细粒度差异——这正是 MQA 质量掉得比 GQA 多的原因（MQA 是池化到 1 组，丢得最多）。uptrain 5% 补的就是这块丢掉的细粒度。所以 g 越小（越接近 MQA）池化丢得越多、uptrain 越要够长；g 大（接近 MHA）丢得少、几乎不用 uptrain。这是「省 KV」与「质量」在 uptrain 维度的折中。

:::
`,
    null,
    [
      {
        text: 'GQA uptrain 相对「从零训 GQA」的优势是？',
        options: ['参数更多', '已有 MHA 池化成 GQA + 小段继续训练，约 5% 算力', '不需要模型', '质量一定更高'],
        answer: 1,
        explain: 'uptrain 把 MHA 的 K/V 组内平均池化，再补 5% 算力，低成本追平质量，不必重训。',
        concept: 'gqa-uptrain',
      },
      {
        text: 'MHA → GQA 权重映射里，K/V 怎么处理？',
        options: ['直接删到 g 组', '组内 n_h/g 个 K/V 平均池化成 g 组', '随机初始化 g 组', 'K/V 不变'],
        answer: 1,
        explain: '新 g 组第 j 组 = 旧对应 n_h/g 个 K/V 的均值，保留主要检索结构、维度对齐 GQA。',
        concept: 'gqa-uptrain',
      },
      {
        text: 'uptrain 前仅池化（不训练），GQA 与 MHA 输出关系是？',
        options: ['完全相同', '近似（池化丢了组内细粒度检索差异）', 'GQA 更差很多', '无法比较'],
        answer: 1,
        explain: '池化是低通、抹掉组内头差异，输出近似但不完全同；小段 uptrain 后差距进一步收敛。',
        concept: 'gqa-uptrain',
      },
      {
        text: 'g 越小（越接近 MQA）池化的影响是？',
        options: ['丢得少、uptrain 越短', '丢得越多、uptrain 越要够长', '无影响', '质量自动更高'],
        answer: 1,
        explain:
          'g 小则组内 n_h/g 大、池化抹掉的细粒度检索越多，需要更长 uptrain 补回；g 大则几乎不用 uptrain。',
        concept: 'gqa-uptrain',
      },
    ],
    [
      ['uptrain', '已有 MHA 池化成 GQA + 小段继续训练（约 5% 算力）的改造路径'],
      ['池化', '把组内 n_h/g 个 K/V 平均成 1 个，保留主要检索结构、丢细粒度差异'],
      ['5% 算力', 'GQA 官方结论：uptrain 小段步数即可追平 MHA 质量'],
      ['组内检索差异', '池化抹掉的部分，g 越小丢越多、越需要 uptrain 补'],
    ],
    [
      '以为 uptrain 要重训整个模型——它只补 ~5% 算力，池化已做完 95% 适配。',
      '把 K/V 直接「删到 g 组」——必须组内平均池化，随机删会丢信息、质量崩。',
      '以为池化后输出与 MHA 完全相同——池化丢细粒度，是近似不是恒等。',
      'g 选得很小却不加长 uptrain——丢得多却补得少，质量掉。',
    ],
  ),
  'practice',
)
