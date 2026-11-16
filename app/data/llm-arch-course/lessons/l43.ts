import { L, withKind } from '../../course-builders.ts'

export const L43 = withKind(
  L(
    'L43',
    19,
    'Jamba/Zamba/Falcon-H1 架构对照',
    4,
    ['L42'],
    ['hybrid-compare'],
    [
      '讲清 Jamba 的 1:8 注意力层布局',
      '对照 Zamba 单共享注意力',
      '解释 Falcon-H1 并行混合',
      '对照三家 KV/吞吐取舍',
    ],
    `### 三家混合的布局差异：先把结构画清楚

L42 讲了混合的两大组织维度——串行（层间交替）与并行（层内分工），Jamba、Zamba、Falcon-H1 正好是三种不同落点。**Jamba**（arXiv:2403.19887）走串行路线：按 1:8 交替，每 8 层插入 1 个全注意力层、其余 7 层是 Mamba，前馈部分还用 MoE（混合专家）扩大总参数；官方支持 256K 上下文。它的心智是「绝大多数层用 Mamba 省 KV，周期性用一层注意力校准全局」。**Zamba**（arXiv:2405.16712）把串行压缩到极致：整个网络只保留**一个共享的注意力层**，其余全是 Mamba-2——几乎把注意力/KV 占比压到零，是「SSM 主干几乎纯、 barely 补一点注意力」的极端。**Falcon-H1**（arXiv:2507.22448）走并行路线：在同一层内让注意力分支与 Mamba-2 分支**同时计算、沿头维拼接**，每层都同时具备精确召回与高效主干，是「层内分工」的代表。三者分别占据「标准串行混合 / 极简串行混合 / 并行混合」三个坐标，正好构成一张完整的对照图。下面的脚本把三家的层布局显式构造出来，让差异变成可枚举的整数序列。

\`\`\`python
def build_layout(name, total_layers=32):
    """返回每层类型列表：'A'=注意力，'M'=Mamba。"""
    if name == 'Jamba-1:8':
        return ['A' if (i + 1) % 8 == 0 else 'M' for i in range(total_layers)]
    if name == 'Zamba-1shared':
        return ['M'] * (total_layers - 1) + ['A']   # 仅最后一层共享注意力
    if name == 'FalconH1-parallel':
        return ['AM'] * total_layers                # 每层都并行含 A 与 M 两分支
    raise ValueError(name)

for name in ('Jamba-1:8', 'Zamba-1shared', 'FalconH1-parallel'):
    layout = build_layout(name)
    n_attn = sum(1 for x in layout if 'A' in x)
    print(f"{name:20s} 注意力出现 {n_attn:2d}/{len(layout)} 层  布局前12层={''.join(layout[:12])}")
assert ''.join(build_layout('Jamba-1:8')[:8]).count('A') == 1, "Jamba 每 8 层应恰有 1 个注意力层"
assert build_layout('Zamba-1shared').count('A') == 1, "Zamba 应只有 1 个注意力层"
print("断言通过：三家的注意力层布局差异被钉成可枚举结构")
\`\`\`

三种布局一目了然：Jamba 每 8 层一个 \`A\`、Zamba 32 层里仅 1 个 \`A\`、Falcon-H1 每层都有 \`A\` 和 \`M\` 两条分支。这直接决定了三家 KV 的量级——因为**KV 只由注意力产生，Mamba 状态不算 KV**。

### KV 账：有效注意力占比决定一切

L42 给出过关键结论：混合模型的 KV ≈「有效注意力占比 × 纯 Transformer 的 KV」。对串行混合，有效占比就是注意力层数除以总层数；对并行混合，是每层注意力头数占总头数的比例（再叠加用了 GQA 之类的压缩）。把三家的有效占比算出来，就能统一比较 KV 与吞吐潜力。下面这段把三家的 KV 按同一序列长、同一 $d_{model}$ 算成数量级账，并验证「Zamba 最少、Jamba 约 1/8」。

\`\`\`python
def kv_mb(eff_ratio, d=4096, seq=8192, layers=32, bits=16):
    """KV ≈ 有效注意力占比 × 全注意力 KV。"""
    full = layers * seq * 2 * d * (bits // 8) / 1e6     # 全注意力 8K 约 4 GB
    return eff_ratio * full

# 有效占比：Jamba≈1/8；Zamba≈1/32；并行混合若 1/4 头走注意力≈1/4
ratios = {"纯Transformer": 1.0, "Jamba-1:8": 1/8, "Zamba-1shared": 1/32, "FalconH1(1/4头)": 1/4}
for name, r in ratios.items():
    print(f"{name:16s} 有效占比={r:6.3%}  8K KV≈{kv_mb(r):7.1f} MB")
assert kv_mb(1/8) < kv_mb(1.0) * 0.13, "Jamba KV 应约纯 Transformer 的 1/8"
assert kv_mb(1/32) < kv_mb(1/8), "Zamba 单共享注意力 KV 应少于 Jamba"
print("结论：Zamba KV 最低、Jamba 约 1/8、并行混合按头占比居中")
\`\`\`

数字印证了直觉：纯 Transformer 在 8K 下 KV 约 4 GB，Jamba 约 0.5 GB（1/8），Zamba 约 0.125 GB（1/32），并行混合若四分之一头走注意力则约 1 GB。KV 越小、同显存能塞的并发越多、长上下文吞吐越高——这就是三家在「KV/吞吐」轴上的排序依据。

### Jamba：1:8 串行 + MoE 的工程平衡

Jamba 的 1:8 不是随便定的，它是 L42 那条「~10% 注意力甜点」的直接落地：每 8 层 1 个注意力层约占 12.5%，略高于 10% 但留出安全边际，实测在召回任务上接近全注意力模型。配合 Mamba 主干，KV 砍到 1/8，使 256K 超长上下文在合理显存内可行。Jamba 还有个设计：**FFN 用 MoE**——把前馈层换成多专家、每 token 只激活少数专家，在不大增单次计算（激活参数）的前提下扩大总参数与容量。要注意区分两件事：「1:8」说的是**注意力与 Mamba 层的配比**，「MoE」说的是**FFN 内部结构**，二者正交。Jamba 的整体策略是「注意力配比压甜点、主干用 Mamba 省 KV、FFN 用 MoE 扩容量」，是一个多维平衡的工程产物。下面的脚本把它「1:8 配比 + MoE 激活比」两件事分开算，避免混淆。

\`\`\`python
def jamba_params(total_layers=32, d=4096, n_experts=16, top_k=2, moe_ffn_mult=4):
    attn_layers = total_layers // 8
    mamba_layers = total_layers - attn_layers
    # MoE FFN：每 token 激活 top_k/n_experts 的专家容量
    active_ffn_frac = top_k / n_experts
    return {
        'attn_layers': attn_layers, 'mamba_layers': mamba_layers,
        'attn_ratio': attn_layers / total_layers,
        'active_ffn_frac': active_ffn_frac,
    }
p = jamba_params()
print(f"Jamba: 注意力层={p['attn_layers']} Mamba层={p['mamba_layers']} 占比={p['attn_ratio']:.1%}")
print(f"MoE FFN 每 token 激活专家比例={p['active_ffn_frac']:.1%}（与层配比正交）")
assert p['attn_ratio'] <= 0.15, "Jamba 注意力占比应接近 ~10% 甜点"
print("结论：1:8 是层配比、MoE 是 FFN 激活策略，两者各自独立")
\`\`\`

### Zamba 与 Falcon-H1：两个方向的极端

**Zamba** 把「省注意力」推到极端——**全网络仅一个共享注意力层**。它的逻辑是：既然少量注意力就能补召回，那能不能只用一个？Zamba 的答案是「基本可以」：一个放在网络后部的注意力层已足以在关键处校准全局，其余 Mamba-2 层承担全部序列建模。KV 因此降到全注意力的 1/32 级别，是三家里最低的。代价是召回能力最吃紧——只有一次「精确对齐」机会，复杂多跳任务可能不如 Jamba。它适合**显存极紧、KV 是硬约束**的场景。

**Falcon-H1** 则走向另一端：不减少注意力，而是把它**并行塞进每一层**。每层同时有注意力头（精确召回）与 Mamba-2 头（高效主干），输出拼接。好处是每层都能即时融合两类信息，召回能力最强；代价是每层都有注意力头、KV 占比取决于头配比，通常高于 Jamba/Zamba。但 Falcon-H1 通过在该并行的注意力部分用 GQA 等压缩手段，仍把 KV 控制在可接受范围。它适合**质量优先、召回任务重**的场景。下面的脚本对三家做一个「KV 低 ↔ 召回强」的二维打分（量级示意），把取舍量化。

\`\`\`python
def profile(kv_ratio, recall_strength):
    conc = 1.0 / kv_ratio                 # 同显存并发潜力的相对值
    return {'kv_ratio': kv_ratio, 'concurrency_rel': conc, 'recall': recall_strength}

models = {
    'Zamba': profile(1/32, 0.75),          # KV 最低，召回最吃紧
    'Jamba': profile(1/8, 0.90),           # 平衡
    'FalconH1': profile(1/4, 0.97),        # KV 较高，召回最强
}
for name, p in models.items():
    print(f"{name:10s} KV占比={p['kv_ratio']:6.3%} 并发潜力≈{p['concurrency_rel']:5.1f}x 召回强度≈{p['recall']:.2f}")
assert models['Zamba']['concurrency_rel'] > models['Jamba']['concurrency_rel'] > models['FalconH1']['concurrency_rel']
assert models['FalconH1']['recall'] > models['Jamba']['recall'] > models['Zamba']['recall']
print("结论：KV 越低并发潜力越高，但召回越弱——三家在一条权衡曲线上")
\`\`\`

### 三家 KV/吞吐取舍的工程判据

把对照收敛成可执行的选型：① **显存/并发是第一约束**（长上下文高并发服务）选 Zamba 或极低注意力占比的混合——KV 最低、能塞的并发最多；② **质量与召回优先**（检索、多跳、复制密集任务）选 Falcon-H1 式并行混合——每层都有注意力，召回最强；③ **要综合平衡**选 Jamba 1:8——KV 砍 1/8、召回接近满配，是「甜点」落地的稳妥默认。共同前提是都靠 SSM 主干扛长序列，差别只在「注意力放多少、放哪、和 SSM 怎么组合」。要记住：KV 与召回是一对反向指标，没有「既最低 KV 又最强召回」的免费午餐，三家只是站在同一条权衡曲线的不同位置。具体型号配比随版本迭代，数值以各自官方技术报告为准（B 级量级示意，不担关键结论）。

:::tip

### 一句话记住三家对照

三家都是「SSM 主干 + 少量注意力」，区别在**注意力怎么放**：**Jamba** 串行 1:8（每 8 层 1 个注意力 + MoE FFN，平衡甜点）、**Zamba** 全模型仅 1 个共享注意力层（KV 最低、召回最吃紧）、**Falcon-H1** 每层注意力与 Mamba-2 并行拼接（KV 较高、召回最强）。**KV 只看有效注意力占比**，三家落在「KV 低 ↔ 召回强」同一条权衡曲线的不同点上。记住「放多少决定 KV、放哪决定融合方式」，就抓住了对照的要害。

:::
`,
    null,
    [
      {
        text: 'Jamba（2403.19887）的 1:8 注意力层布局指？',
        options: [
          '每 8 层里 1 个注意力层、其余 Mamba 层',
          '注意力头是 Mamba 的 8 倍',
          '8 个注意力层共 1 个 Mamba 层',
          '只有 8 层',
        ],
        answer: 0,
        explain:
          'Jamba 按 1:8 交替：每 8 层插 1 个全注意力层、其余 7 层是 Mamba（并配合 MoE FFN），支持 256K 上下文。',
        concept: 'hybrid-compare',
      },
      {
        text: 'Zamba（2405.16712）把注意力用量压到极致的做法是？',
        options: [
          '每层都放注意力',
          '整个模型只用一个共享的注意力层，其余为 Mamba-2',
          '不用 Mamba',
          '把 KV 量化到 1bit',
        ],
        answer: 1,
        explain:
          'Zamba 全网络仅保留一个共享注意力层放在末尾附近，其余全部 Mamba-2，把注意力/KV 占比压到最小。',
        concept: 'hybrid-compare',
      },
      {
        text: 'Falcon-H1（2507.22448）的「并行混合」是？',
        options: [
          '先跑完所有 Mamba 再跑注意力',
          '每层内注意力头与 Mamba 头并行计算、输出拼接',
          '只用注意力',
          '只用 Mamba',
        ],
        answer: 1,
        explain:
          'Falcon-H1 在同一层内让注意力分支与 Mamba-2 分支并行、沿头维拼接，每层都同时具备精确召回与高效主干。',
        concept: 'hybrid-compare',
      },
      {
        text: '三家对照中，关于 KV 的说法正确的是？',
        options: [
          'Mamba 层也产生大量 KV',
          'KV 几乎只来自注意力部分，故 Zamba 最少、Jamba 约 1/8、并行混合取决于每层注意力头占比',
          '三者 KV 相同',
          '注意力占比与 KV 无关',
        ],
        answer: 1,
        explain:
          'SSM 不产 KV；Zamba 单共享注意力层 KV 最少，Jamba 1:8 约纯注意力的 1/8，并行混合按有效注意力头占比计。',
        concept: 'hybrid-compare',
      },
    ],
    [
      ['Jamba', '2403.19887，1:8 注意力/Mamba 层交替 + MoE FFN，支持 256K 上下文'],
      ['Zamba', '2405.16712，全模型单个共享注意力层 + 其余 Mamba-2，KV 用量最低'],
      ['Falcon-H1', '2507.22448，同层内注意力与 Mamba-2 并行分支、输出拼接的并行混合'],
      ['有效注意力占比', '衡量混合模型 KV 成本的统一量：注意力层占比或并行注意力头占比'],
      ['MoE FFN', 'Jamba 用混合专家前馈网络，在不大增激活参数的前提下扩大总参数'],
    ],
    [
      '以为 Jamba 1:8 是「1 个 Mamba 配 8 个注意力」——方向反了，是每 8 层 1 个注意力层。',
      '把 Zamba 的「单共享注意力」当成「共享 KV cache」——它共享的是一个注意力层权重，KV 仍按该层产生。',
      '认为并行混合每层都有注意力就 KV 高——KV 取决于注意力头占比，Falcon-H1 用 GQA 等仍可把 KV 控住。',
      '忽略 Jamba 的 MoE——它扩的是总参数、激活参数受控，不能和「层数配比」混为一谈。',
    ],
  ),
  'framework',
)
