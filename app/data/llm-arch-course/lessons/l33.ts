import { L, withKind } from '../../course-builders.ts'

export const L33 = withKind(
  L(
    'L33',
    15,
    'Mixtral 8x7B vs DeepSeek-V3 稀疏 MoE 对照',
    4,
    ['L27', 'L32'],
    ['mixtral'],
    [
      '讲清 Mixtral 8x7B 的 46.7B/12.9B 与 8 选 2',
      '对照 DeepSeek-V3 的稀疏 MoE 设计',
      '解释激活参数决定 FLOPs',
      '对照两者许可证与开放策略',
    ],
    `### 两个里程碑式稀疏模型

M3 前几课把 MoE 的机制、路由、均衡、并行逐块讲清，这一课用两个真实落地的模型把它们串起来：Mixtral 8x7B 与 DeepSeek-V3。前者是开源稀疏 MoE 的标杆，把「8 选 2、小激活大总参」做成了可部署的产品；后者是近年中国团队推出的超大规模稀疏模型，把细粒度专家、共享专家、aux-loss-free 均衡、大规模专家并行等前沿设计集于一身。把它们并排对照，能看清「同一个 MoE 思想在不同规模、不同工程取向下的两种形态」。

这一课也是 L34 capstone 的直接铺垫——L34 要手写一个含细粒度专家与共享专家的 MoE 层，并对照 Mixtral 的官方数字做验收。所以这里不仅讲架构，还把「数字怎么核对」「激活参占比怎么算」「许可证怎么看」这些落地细节一并交代。

### Mixtral 8x7B：把「小激活大总参」做成产品

Mixtral 8x7B（Mistral AI，arXiv:2401.04088）是稀疏 MoE 走向主流的标志性模型。先把三个 A 级数字钉死：**总参数 46.7B，每 token 激活参数约 12.9B，每层 8 个专家选 top-2**（即 8 选 2）。名字里的「8x7B」容易误导：它不是 8 个 7B 模型的集成，也不是 56B 稠密模型。46.7B 这个总数来自「8 份独立的专家 FFN 加上一份所有层共享的注意力、嵌入等参数」——共享部分只算一份，所以总参小于 8 乘某个整数。

它的设计要点有三。第一，**top-2 路由**：每个 token 在每层选 2 个专家，8 个里选 2 个，专家 FLOPs 约为稠密融合的 1/4。第二，**共享的注意力与嵌入**：只有 FFN 被替换成 MoE 层，注意力仍是稠密的、所有 token 共用——这正是前面算激活占比时「共享部分把整体占比从 25% 抬到 27.6%」的来源。第三，**激活参数决定 FLOPs**：推理时虽然要装下 46.7B 的权重（显存接近 47B 稠密模型），但每个 token 只算 12.9B 的参数，计算量接近一个 13B 稠密模型。这种「显存按大模型算、算力按小模型算」的错位，是 MoE 部署的核心特征——L32 讲的专家并行、L36 要讲的共享专家，都是围绕这条约束的工程应对。

Mixtral 还因为一个现象引发讨论：其专家会按 token 的浅层属性（位置、语法角色）自发分化，而非按语义主题——这正是 L30 末尾讲的「专家类型分化」反直觉点，也是 L35 诊断时提醒不要过度拟人化专家的由来。

:::deep

### 激活参数决定 FLOPs：把账算到底

「激活参数决定 FLOPs」这句话值得用公式再钉一次。对一个隐藏维 d、每层 8 专家、每专家 FFN 参数 P_e、top-2 的 MoE 层：每 token 的专家 FLOPs 约正比于 2 乘 P_e（两个被选中专家），而不是 8 乘 P_e。推广到整个模型，每 token 的总 FLOPs 约正比于「全部共享层参数加 2 乘专家层参数」，这就是 12.9B 这个数字的来源。

对比一下就很直观：一个 46.7B 的稠密模型，每 token 要算 46.7B 参数的乘加；Mixtral 每 token 只算 12.9B 参数的乘加，**FLOPs 约为同总参稠密模型的 12.9/46.7 约 27.6%**。反过来说，用运行 13B 稠密模型的算力，Mixtral 能调用一个 46.7B 模型的知识容量。这就是 L27 讲的「容量与计算解耦」在旗舰模型上的兑现。要注意显存并不享受这个折扣——8 个专家的权重都得常驻，所以 MoE 部署的门槛是显存而非算力。

:::

### DeepSeek-V3：更激进的稀疏设计

DeepSeek-V3（DeepSeek，2024 年底发布）代表了稀疏 MoE 的另一条路线——把稀疏度、专家细粒度、工程协同都推到更激进的位置。按其官方公布的数字（A 级官报）：**总参数 671B，每 token 激活约 37B**。相比 Mixtral 的 27.6% 激活占比，DeepSeek-V3 的激活占比只有 37/671 约 5.5%——稀疏得多。它有几个关键设计：

- **细粒度专家**：把专家切得更小、数量更多（如把 FFN 切成更细的专家单元），让 top-k 的组合空间更大、路由更精细。细粒度的意义在于「同样的激活参数预算下，专家搭配更丰富」。
- **共享专家**：设置所有 token 必过的共享专家，承接通用特征、给路由卸压——这正是 L36 的主题。
- **aux-loss-free 负载均衡**：用路由偏置的负反馈替代 aux-loss，避免辅助梯度损害质量（L30 第三条路线）。
- **大规模专家并行**：配合精细的 EP 与通信优化支撑超大稀疏模型训练（L32）。

把两者放在一起对照，能看到一条清晰的演进轴：**Mixtral 是「中等稀疏度、粗粒度、经典 top-2 + 常规均衡」的稳健产品；DeepSeek-V3 是「极高稀疏度、细粒度、共享专家 + aux-loss-free + 大规模 EP」的前沿系统**。后者用更低的激活占比，在同样的激活参数预算下撬动更大的总容量——这是稀疏 MoE 近年的主攻方向。

### 许可证与开放策略：落地必须核对

技术之外，两个模型的开放策略也不同，选型时必须分清。Mixtral 8x7B 以 **Apache 2.0** 许可证开放权重，这是最宽松的开源许可之一，商用友好。DeepSeek-V3 同样以开放权重方式发布，但附带的是**自有许可证**，条款与 Apache 不同（可能涉及使用范围、署名、附加条件等）。

这里要强调一条纪律：**许可证条款会随时间更新，具体措辞必须以官方最新文件为准**。本课只讲「两者条款不同、都要核对」这个原则，不写死具体条款细节（这类信息属于随时间变动的内容，不构成关键结论的依据）。工程落地时，法务与合规团队要直接读官方仓库的 LICENSE 文件，而不是依赖二手转述。

### 可跑代码：两组参数账与激活占比对照

下面用代码把两个模型的激活参占比、相对稠密模型的 FLOPs 折扣算出来，并验证稀疏逻辑的核心关系。数字用官方口径（Mixtral 46.7B/12.9B、DeepSeek-V3 671B/37B，均为官报 A 级）。

\`\`\`python
def moe_accounting(name, total_b, active_b, n_experts, k_top):
    ratio = active_b / total_b
    flops_discount = ratio
    print(f"{name}: 总参={total_b}B, 激活={active_b}B, 激活占比={ratio:.1%}")
    print(f"   相对同总参稠密模型的 FLOPs≈{flops_discount:.1%}, "
          f"专家组合数≈C({n_experts},{k_top})")
    return ratio

# 官方口径数字（Mixtral 46.7B/12.9B；DeepSeek-V3 官报 671B/37B）
r_mix = moe_accounting("Mixtral 8x7B", 46.7, 12.9, 8, 2)
r_v3 = moe_accounting("DeepSeek-V3", 671.0, 37.0, 256, 8)

import math
comb_mix = math.comb(8, 2)       # 8 选 2 的专家组合数 = 28
comb_v3 = math.comb(256, 8)      # 细粒度下组合数极其庞大
print(f"Mixtral 每层专家组合数={comb_mix}, DeepSeek-V3(256选8)组合数≈{comb_v3:.3e}")

assert abs(r_mix - 12.9/46.7) < 1e-9, "Mixtral 激活占比应等于 12.9/46.7"
assert r_v3 < r_mix, "DeepSeek-V3 应比 Mixtral 稀疏得多（激活占比更低）"
assert comb_v3 > comb_mix, "细粒度专家应提供更丰富的组合空间"

# 显存 vs 算力错位：权重显存按总参、FLOPs 按激活
def weight_mem_gb(total_b, bits=16):
    return total_b * bits / 8
print(f"Mixtral 权重显存≈{weight_mem_gb(46.7):.0f}GB（16bit，按总参），"
      f"但推理算力≈{12.9}B 稠密级")
print(f"DeepSeek-V3 权重显存≈{weight_mem_gb(671.0):.0f}GB（16bit），"
      f"但推理算力≈{37}B 稠密级")
# 显存对比：V3 是 Mixtral 的多少倍
mem_ratio = weight_mem_gb(671.0) / weight_mem_gb(46.7)
print(f"V3 权重显存约为 Mixtral 的 {mem_ratio:.1f} 倍")
assert abs(mem_ratio - 671.0/46.7) < 1e-9, "显存比应等于总参数比"
print("参数账与激活占比对照完成")
\`\`\`

三组输出把对照讲透：激活占比（Mixtral 约 27.6% 对 DeepSeek-V3 约 5.5%）、专家组合数（细粒度让组合空间从 28 暴涨到天文数字，体现「同样激活预算下搭配更丰富」）、显存与算力的错位（权重按总参算显存、FLOPs 按激活算算力）。断言锁死了核心关系：DeepSeek-V3 更稀疏、细粒度组合更丰富。

:::tip

### 对照的落点：稀疏度是核心旋钮

**Mixtral 8x7B**：46.7B 总参、12.9B 激活、8 选 2、Apache 2.0，是「小激活大总参」的稳健标杆。**DeepSeek-V3**：官报 671B 总参、37B 激活、细粒度专家 + 共享专家 + aux-loss-free，把稀疏度推到 5.5%。两者共同验证「激活参数决定 FLOPs」：显存按总参算、算力按激活算。许可证条款不同且会变动，落地以官方最新文件为准。下一课 L34 capstone 会手写含细粒度与共享专家的 MoE 层，并用 Mixtral 的官方数字做验收断言。

### 数值自检：8 选 2 的专家组合数

最后用一个独立小脚本核对 Mixtral「8 选 2」与 DeepSeek-V3 细粒度「256 选 8」的专家组合数差异，体会细粒度为何带来更丰富的搭配空间。

\`\`\`python
import math
comb_mixtral = math.comb(8, 2)
comb_v3 = math.comb(256, 8)
print(f"Mixtral 8选2 组合数={comb_mixtral}")
print(f"DeepSeek-V3(256选8) 组合数≈{comb_v3:.3e}")
assert comb_mixtral == 28, "8选2 应为 28 种组合"
assert comb_v3 > comb_mixtral * 1e6, "细粒度组合数应比粗粒度大六个数量级以上"
# 激活占比复核
print(f"Mixtral 激活占比={12.9/46.7:.1%}, DeepSeek-V3≈{37/671:.1%}")
assert 12.9/46.7 > 37/671, "Mixtral 激活占比应高于 DeepSeek-V3"
print("组合数与激活占比自检通过")
\`\`\`

:::
`,
    null,
    [
      {
        text: '关于 Mixtral 8x7B 的参数量，正确的说法是？',
        options: [
          '总参数 56B、激活 56B',
          '总参数 46.7B、每 token 激活约 12.9B，8 个专家选 2 个',
          '总参数 8B、激活 7B',
          '总参数等于 8 乘 7B 且无共享层',
        ],
        answer: 1,
        explain:
          'Mixtral 8x7B 官方：总参数 46.7B（含共享注意力与嵌入），每 token 激活约 12.9B，每层 8 个专家选 top-2（A 级数字）。',
        concept: 'mixtral',
      },
      {
        text: 'Mixtral 8x7B 的推理 FLOPs 大致相当于哪个规模的稠密模型？',
        options: ['46.7B 稠密', '56B 稠密', '约 12.9B 稠密', '8B 稠密'],
        answer: 2,
        explain:
          'FLOPs 由激活参数决定；每 token 激活约 12.9B，故推理计算量接近一个 13B 稠密模型，尽管权重显存接近 47B。',
        concept: 'mixtral',
      },
      {
        text: 'DeepSeek-V3 相对 Mixtral 在稀疏 MoE 设计上的一个显著特点是？',
        options: [
          '专家数更少但每个更大',
          '采用大量细粒度专家 + 共享专家 + aux-loss-free 负载均衡，总参数 671B、每 token 激活约 37B（官报）',
          '完全不用 MoE',
          '只支持稠密前向',
        ],
        answer: 1,
        explain:
          'DeepSeek-V3（官报）总参数 671B、每 token 激活约 37B，采用细粒度专家、共享专家与 aux-loss-free 偏置均衡，是更激进的稀疏设计。',
        concept: 'mixtral',
      },
      {
        text: '对照 Mixtral 与 DeepSeek-V3 的许可证与开放策略，正确的是？',
        options: [
          '两者都完全闭源',
          'Mixtral 用 Apache 2.0 开放权重，DeepSeek-V3 以开放权重/许可证方式发布但条款不同，需分别核对',
          '两者许可证完全相同',
          'DeepSeek-V3 不公开任何权重',
        ],
        answer: 1,
        explain:
          'Mixtral 8x7B 以 Apache 2.0 开放权重；DeepSeek-V3 也以开放权重发布并附自有许可证，条款与 Apache 不同；许可证细节会变动，落地须核对官方最新文件。',
        concept: 'mixtral',
      },
    ],
    [
      [
        'Mixtral 8x7B',
        'Mistral AI 的稀疏 MoE：46.7B 总参数、约 12.9B 激活参数、每层 8 专家 top-2、Apache 2.0 开放权重',
      ],
      [
        'DeepSeek-V3',
        'DeepSeek 的稀疏 MoE（官报）：671B 总参数、约 37B 激活、细粒度专家 + 共享专家 + aux-loss-free',
      ],
      ['细粒度专家', '把专家切得更小、数量更多，使 top-k 的组合更丰富、路由更精细的设计取向'],
      ['激活参数决定 FLOPs', '每 token 的计算量由被激活的参数量决定，与总参数量解耦的核心认知'],
      [
        '开放权重许可证',
        '模型权重可获取的授权条款；Mixtral 为 Apache 2.0，DeepSeek-V3 为自有条款，需分别核对',
      ],
    ],
    [
      '把 Mixtral 当成 56B 稠密模型——它是 46.7B 总参、12.9B 激活的稀疏模型，显存与算力口径要分开。',
      '用总参数估算推理成本——FLOPs 由激活参数决定，46.7B 总参的模型推理只接近 13B 稠密。',
      '把「开放权重」等同于「无任何限制」——要具体看许可证条款，Mixtral 与 DeepSeek-V3 条款不同且会变动。',
      '以为细粒度专家一定有更多激活参数——细粒度是把专家切小切多，激活参数由 top-k 与专家大小共同决定，不等于变大。',
    ],
  ),
  'framework',
)
