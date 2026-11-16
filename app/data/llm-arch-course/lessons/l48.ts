import { L, withKind } from '../../course-builders.ts'

export const L48 = withKind(
  L(
    'L48',
    20,
    'Hymba vs Granite 4.0：并行 vs 串联混合',
    4,
    ['L42', 'L43'],
    ['hybrid-hymba-granite'],
    [
      '讲清 Hymba 同层注意力头‖Mamba-2 头',
      '对照 Granite 4.0 的 9:1 串联+共享专家',
      '解释 meta tokens 与跨层 KV 共享',
      '说明「~10% 注意力层放中部最佳」共识',
    ],
    `### 两种混合哲学的再次对撞：并行 vs 串联

L42 立起「SSM 主干 + 约 10% 注意力」的共识，L43 对照了 Jamba/Zamba/Falcon-H1 三种落地。这一课把对照推到两个更新的代表：**Hymba**（arXiv:2411.13676）与 **Granite 4.0**。它们恰好占据「并行混合」与「串联混合」两个极端。Hymba 走 Falcon-H1 式的同层并行路线，但更进一步引入 **meta tokens 与跨层 KV 共享**，试图在每层都融合精确召回与高效主干的同时进一步压 KV；Granite 4.0 则走 Jamba 式的串联路线，用 **Mamba:注意力≈9:1** 的稀疏布局加**共享专家 MoE**，把 KV 压到极低、靠 MoE 补容量。两者一「每层都并行」、一「稀疏串联」，构成一张完整的路线对照图。本课逐条讲清它们的结构与那句关键共识——「约 10% 注意力层放中部最佳」。

### Hymba：同层注意力头‖Mamba-2 头并行

Hymba 的核心是**在同一层内并行跑两类头**：把该层的头分成两组，一组走全注意力（负责精确召回、全局配对），另一组走 Mamba-2（负责高效序列建模、恒定状态），两条路径同时计算，输出沿头维拼接后过共享的 FFN。这与串行混合（一层里只有一种算子）不同：**每层都能即时融合**「注意力的精确」与「SSM 的高效」，不必等到下一个注意力层才校准。有效注意力占比由「该层注意力头数 / 总头数」决定，因此 Hymba 可以在每层只用少量注意力头，把 KV 控制在低位，同时保留每层都有的召回通道。下面这段构造 Hymba 式的同层头分配，验证「并行 = 同层两类头共存」并算出有效注意力占比。

\`\`\`python
def hymba_heads(total_heads=32, attn_frac=0.125):
    n_attn = round(total_heads * attn_frac)
    return {'attention_heads': n_attn, 'mamba2_heads': total_heads - n_attn,
            'eff_ratio': n_attn / total_heads}

h = hymba_heads()
print(f"Hymba 同层：注意力头={h['attention_heads']}  Mamba-2头={h['mamba2_heads']}"
      f"  有效注意力占比={h['eff_ratio']:.1%}")
assert h['attention_heads'] + h['mamba2_heads'] == 32
assert h['eff_ratio'] <= 0.15, "并行混合的有效注意力占比应接近 ~10% 甜点"
print("结论：Hymba 每层都并行含两类头，KV 由注意力头占比决定")
\`\`\`

32 个头里只用约 4 个走注意力（12.5%），其余 28 个走 Mamba-2——每层都有召回通道，但 KV 仍压在约 1/8。这就是并行混合的精髓：**用「头占比」而非「层占比」控制 KV，让每层都拿到召回能力**。

### meta tokens 与跨层 KV 共享

Hymba 的一个独门设计是 **meta tokens**：在输入序列里加入一组**可学习的元 token**（数量远小于序列长，如几十到几百个），它们的作用是「把长上下文压缩成一份全局摘要」。关键机制有两点：第一，这些 meta token 参与注意力计算，能「读到」全序列并把摘要信息汇聚到自己身上，相当于一个可学的全局池化；第二，它们的 **K/V 在多个注意力层之间共享**——同一批 meta token 的键值对被缓存一次、供各层复用，而不是每层各存一份。这样做有两个收益：① **省 KV**——meta token 是少数位置，跨层共享避免重复存储；② **强化全局信息**——摘要在层间持续可用，补上 SSM 主干逐层传递时的信息衰减。下面这段模拟 meta token 的跨层 KV 共享，对比「每层各存」与「跨层共享」的 KV 量，验证共享确实省内存。

\`\`\`python
def meta_kv_bytes(n_layers, n_meta, d=4096, seq=4096, bits=16, shared=True):
    b = bits // 8
    if shared:
        # meta token 的 KV 只存一份，跨层复用
        return n_meta * 2 * d * b + n_layers * seq * 2 * d * b * 0.12  # 12% 头占比的常规 KV
    else:
        # 每层各存一份 meta KV
        return n_layers * n_meta * 2 * d * b + n_layers * seq * 2 * d * b * 0.12

n_layers, n_meta = 32, 128
shared = meta_kv_bytes(n_layers, n_meta, shared=True)
separate = meta_kv_bytes(n_layers, n_meta, shared=False)
print(f"meta KV：跨层共享≈{shared/1e6:.1f} MB  每层各存≈{separate/1e6:.1f} MB  省≈{1-shared/separate:.0%}")
assert shared < separate, "跨层共享必须比每层各存省 KV"
print("结论：meta tokens 把全局摘要压进少量位置并跨层复用其 KV，省内存且强全局")
\`\`\`

在这组配置里，跨层共享把 meta token 的 KV 从 32 份压到 1 份，省下绝大部分 meta KV——虽然相对常规 KV 只是零头，但在长上下文、显存吃紧时每一点都算数；更重要的是它让「全局摘要」在每层都可用，这对 SSM 主干的信息传递是实质补强。

### Granite 4.0：9:1 串联 + 共享专家

Granite 4.0 走的是另一条路——**标准串联混合**：按 Mamba:注意力≈**9:1** 的配比，每约 10 层插入 1 个全注意力层，其余都是 Mamba 层。这与 Jamba 的 1:8（约 12.5% 注意力）相比更激进，注意力占比降到约 10%（正好落在共识甜点），KV 更低。为了弥补稀疏注意力带来的容量下降，Granite 4.0 在 FFN 部分引入**共享专家 MoE**：多个专家中有一部分「共享专家」被所有 token 使用，其余专家按路由选择——共享专家保证基础能力不丢，路由专家提供条件化容量。要区分两件事：「9:1」是**层配比**、「共享专家」是 **FFN 结构**，二者正交。下面这段构造 Granite 式的 9:1 串联布局并算 KV，与 Hymba 的并行占比对照，验证两者 KV 落在相近的有效注意力占比、但组织方式不同。

\`\`\`python
def granite_layout(total_layers=30):
    # 9:1 → 每 10 层 1 个注意力层
    return ['A' if (i + 1) % 10 == 0 else 'M' for i in range(total_layers)]

layout = granite_layout()
n_attn = layout.count('A')
print(f"Granite 9:1 布局：注意力层={n_attn}/{len(layout)}  占比={n_attn/len(layout):.1%}")
print("布局前 20 层：" + ''.join(layout[:20]))

def kv_mb(eff_ratio, layers=32, d=4096, seq=8192, bits=16):
    return eff_ratio * layers * seq * 2 * d * (bits // 8) / 1e6

print(f"Granite(1/10) KV≈{kv_mb(0.10):.1f} MB  Hymba(1/8) KV≈{kv_mb(0.125):.1f} MB")
assert n_attn / len(layout) <= 0.12, "Granite 注意力占比应约 10%"
print("结论：Granite 用 9:1 稀疏串联把 KV 压到约 1/10，配共享专家补容量")
\`\`\`

Granite 的注意力占比约 10%、KV 比 Hymba 的 12.5% 更低；两者落在相近的「有效占比」区间，但一个是「稀疏的层间校准」、一个是「每层的并行融合」——这就是串联与并行的本质差异。

### 「~10% 注意力层放中部最佳」共识

一个反复出现的经验发现是：**约 10% 的注意力层，放在网络 stack 的中部时，召回/质量收益最高**，而不是全部堆在底部或顶部。原因可以从信息流理解。注意力层的作用是「全局校准 + 精确召回」：放在**太靠前（底部）**时，网络还没形成丰富的上下文表示，注意力能配对的信息有限、校准效果弱；放在**太靠后（顶部）**时，SSM 主干逐层传递中可能已积累偏差或丢失细节，最后一层注意力「兜底」来不及全面修复。放在**中部**则两头兼顾：此时表示已经比较丰富，注意力能精确配对并校准全局，其输出再经后续若干层传播、放大到最终预测。多家的消融实验都支持「注意力层集中在中段优于均分或两端」（具体最优位置随模型/任务浮动，量级示意，第三方复算不担关键结论）。下面的脚本用一个假想的「质量 vs 注意力层位置」曲线演示这个中段峰值（量级示意），并断言中部优于两端。

\`\`\`python
import numpy as np
def quality_by_position(pos_frac):
    """假想：注意力层位置在 stack 中部(0.5)质量最高，两端较低。量级示意。"""
    return 0.90 - 0.25 * ((pos_frac - 0.5) / 0.5) ** 2

positions = {'底部(0.1)': 0.1, '中前(0.35)': 0.35, '中部(0.5)': 0.5, '中后(0.65)': 0.65, '顶部(0.9)': 0.9}
for name, p in positions.items():
    print(f"{name:10s} 位置={p:.2f}  假想质量≈{quality_by_position(p):.3f}")
q_mid = quality_by_position(0.5)
assert q_mid > quality_by_position(0.1) and q_mid > quality_by_position(0.9)
print("结论：约 10% 注意力层放中部，召回/质量收益最佳（经验共识，具体位置按任务抽测）")
\`\`\`

中部的假想质量最高、两端较低，印证「放中部最佳」。要强调这是**经验共识而非定理**：最优位置随模型规模、任务类型、注意力层数浮动，工程上应做消融（把同样的注意力层分别放底/中/顶、抽测召回基准），而不是盲信「中部」二字。但它提供了一个很好的先验——不确定怎么放时，优先放中段。

:::deep

### 并行 vs 串联：为什么两条路都能work，代价各在哪

把 Hymba 的并行与 Granite 的串联放在一起，能看清两条路的收益来源与代价。**串联（Granite）**的收益是「简单、KV 极低」——注意力层稀疏、集中校准，实现与 Jamba 一脉相承、生态成熟；代价是「每层信息不均衡」——大多数层没有注意力，精确召回只在少数层发生，复杂多跳任务可能受限于「校准频率」。**并行（Hymba）**的收益是「每层都融合」——精确召回通道每层都在、信息即时融合，配合 meta tokens 的全局摘要，质量潜力更高；代价是「结构复杂、单层 KV 控制更难」——每层都有注意力头，要靠头占比 + GQA + meta KV 共享把 KV 压住，实现与调优更繁琐。两条路都能 work，是因为它们都守住了同一条底线：**有效注意力占比约 10%**——只要 KV 被压到这个量级、同时保留精确召回通道，具体是「层间稀疏」还是「层内并行」只是工程组织的差别。下面的自检把两家归一到「有效占比」这个统一度量，验证它们的 KV 落在同一量级，说明路线之争本质是「信息融合方式」之争，不是「KV 成本」之争。

\`\`\`python
def unified_kv(eff_ratio, label):
    # 统一度量：KV ∝ 有效注意力占比，与串行/并行组织无关
    mb = eff_ratio * 32 * 8192 * 2 * 4096 * 2 / 1e6
    print(f"{label:20s} 有效占比={eff_ratio:6.3%}  KV≈{mb:6.1f} MB")
    return mb

hymba = unified_kv(4 / 32, 'Hymba(并行4/32头)')     # 每层 4/32 头走注意力
granite = unified_kv(3 / 30, 'Granite(串行3/30层)') # 30 层里 3 层注意力
assert abs(hymba - granite) / hymba < 0.15, "两家有效占比相近 → KV 应同一量级"
print("结论：并行/串联的 KV 都归一到有效占比，差别在信息融合方式")
\`\`\`

两家的 KV 落在同一量级——这印证了 L42 的结论：**组织维度（串行/并行）决定「信息怎么融合」，有效注意力占比决定「KV/吞吐成本」**，把这两件事分开，才能不被「并行一定更贵」或「串联一定更省」的直觉误导。选型时先看 KV 预算定占比，再根据「要校准频率（串联）还是要即时融合（并行）」选组织方式。

:::

### 工程判据与整模块收束

落到选型：① **显存/并发优先**选 Granite 式 9:1 稀疏串联——KV 最低、实现成熟，配共享专家补容量；② **质量/召回优先、能承受复杂实现**选 Hymba 式并行 + meta tokens——每层即时融合、全局摘要强；③ **不确定注意力层怎么放**时优先放网络中段（约 10%），并做底/中/顶消融抽测召回。三家（连同 L43 的 Jamba/Zamba/Falcon-H1）共同收敛到一条主线：**用约 10% 的有效注意力占比补精确召回、SSM 主干扛长序列，KV 与吞吐代价因此降到全注意力的约一成**。至此 M4 走完一条完整链路：从 SSM 状态方程（L38）→ SSD 统一（L39）→ 恒定内存实测（L40）→ 线性谱系（L41/L46/L47）→ 混合共识（L42）→ 架构对照（L43/L48）→ KV/吞吐综合验收（L44/L45）。整模块的核心认知只有一句：**状态空间拿效率、少量注意力拿召回，混合是把二者拼到「约一成注意力」甜点上**。

:::tip

### 一句话记住 L48 与整个 M4

**Hymba** 同层内注意力头‖Mamba-2 头并行、每层即时融合，配 **meta tokens**（可学习元 token 压缩上下文、KV 跨层共享）省内存并强全局；**Granite 4.0** 用 9:1 稀疏串联（每约 10 层 1 个注意力）+ 共享专家 MoE，KV 更低、实现成熟。两家有效注意力占比都在约 10%，KV 同量级，差别只在「校准频率 vs 即时融合」。共识：**约 10% 注意力层放中部最佳**（经验规律，按任务抽测）。整个 M4 收束成一句——**SSM 拿效率、约一成注意力拿召回，混合架构就是在「状态空间与注意力」之间找那个甜点**。

:::
`,
    null,
    [
      {
        text: 'Hymba（2411.13676）的并行混合具体指？',
        options: [
          '先跑注意力再跑 Mamba',
          '同一层内注意力头与 Mamba-2 头并行计算、输出融合',
          '只用注意力',
          '只用 Mamba-2',
        ],
        answer: 1,
        explain:
          'Hymba 在同层内让一部分头走全注意力、另一部分走 Mamba-2，并行计算后融合，每层兼得精确召回与高效主干。',
        concept: 'hybrid-hymba-granite',
      },
      {
        text: 'Hymba 的 meta tokens 与跨层 KV 共享的作用是？',
        options: [
          '增加词表',
          '用一组可学习元 token 压缩上下文，其 KV 跨注意力层共享，省 KV 并提供全局摘要',
          '替代 FFN',
          '降低精度',
        ],
        answer: 1,
        explain:
          'meta tokens 是可学习 token，把上下文摘要进少量位置；这些位置的 K/V 在多个注意力层间共享，减少重复 KV 并强化全局信息。',
        concept: 'hybrid-hymba-granite',
      },
      {
        text: 'Granite 4.0 的混合布局是？',
        options: ['9:1 串联（每 10 层 1 个注意力）+ 共享专家 MoE', '每层并行', '全注意力', '全 Mamba'],
        answer: 0,
        explain: 'Granite 4.0 用 Mamba:注意力≈9:1 的串联布局，并配共享专家 MoE 扩容量，走标准串行混合路线。',
        concept: 'hybrid-hymba-granite',
      },
      {
        text: '「~10% 注意力层放中部最佳」的经验共识指？',
        options: [
          '注意力层应全放开头',
          '注意力层应全放末尾',
          '约一成注意力层放在网络中段时，召回/质量收益最佳',
          '位置无关',
        ],
        answer: 2,
        explain:
          '经验发现：把约 10% 的注意力层布在 stack 中部，比全堆顶部或底部更能校准全局、补召回，性价比最高。',
        concept: 'hybrid-hymba-granite',
      },
    ],
    [
      ['Hymba', '2411.13676，同层注意力头‖Mamba-2 头并行混合，配 meta tokens 与跨层 KV 共享'],
      ['Granite 4.0', 'Mamba:注意力≈9:1 串联混合 + 共享专家 MoE 的架构'],
      ['meta tokens', '一组可学习元 token，压缩上下文为全局摘要，其 KV 跨层共享以省内存'],
      ['跨层 KV 共享', '同一批 meta token 的 K/V 在多个注意力层间复用，避免每层重复存储'],
      ['中部最佳', '经验共识：约 10% 注意力层放在网络中段时召回/质量收益最高'],
    ],
    [
      '把 Hymba 当成串行混合——它是同层内注意力头与 Mamba-2 头并行，与 Granite 的串联正交。',
      '以为 meta tokens 是普通前缀 token——它们是可学习的、KV 跨层共享的元 token，承担全局摘要角色。',
      '认为 Granite 4.0 的 9:1 是「9 个注意力配 1 个 Mamba」——方向反了，是每约 10 层 1 个注意力层。',
      '忽略「中部最佳」是经验规律而非定理——具体放置位置需按任务抽测，不能盲信。',
    ],
  ),
  'framework',
)
