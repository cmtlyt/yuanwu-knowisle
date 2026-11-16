import { L, withKind } from '../../course-builders.ts'

export const L84 = withKind(
  L(
    'L84',
    37,
    'PEFT 谱系：Adapters→Prefix→(IA)³→LoRA',
    3,
    ['L83'],
    ['peft-lineage'],
    ['梳理 PEFT 谱系逐项对照', '列出可训参数量级表', '解释各代取舍', '说明 LoRA 为何成默认'],
    `### 为什么需要一条 PEFT 谱系

L83 把全参微调立成了带三笔账单的基线：约 16 字节/参数的训练状态、过拟合、灾难性遗忘。PEFT（参数高效微调）的全体方法都在回答同一个问题——**冻结基座，只训少量新增参数，逼近全参效果**。但「少量新增参数」的实现方式有很多种：插在层间、加在输入、缩放激活、给权重加低秩增量。这些方案不是彼此无关的技巧，而是一条有清晰演进逻辑的谱系：从「加模块」到「加向量」再到「加可合并的权重增量」，可训参数越来越少、部署代价越来越低。梳理这条谱系，才能真正理解为什么 LoRA 最终成了默认选项。

### Adapters：层间插入串行瓶颈

Adapters 是最早成功的 PEFT 之一（Houlsby 等）。做法是：在每个 Transformer 层的注意力与 FFN 之后，插入一个小的瓶颈模块——先把隐状态从 d 维 down-project 到很小的 r 维（如 r=8），过非线性，再 up-project 回 d 维。只训练这些瓶颈参数，基座全部冻结。可训参数量约为每层 4·d·r，24 层、d=1024、r=8 时约 0.8M，占模型的百分之几。

代价在于**串行**：瓶颈模块插在主干路径上，推理时数据必须穿过 down-up 两步额外计算，且残差连接被改成「原路径 + 瓶颈路径」。这在训练时可接受，但在线服务的 every-token 延迟被抬高，且不同任务要加载不同的瓶颈权重，切换不如可合并方案干脆。这一点直接催生了「把增量做成与权重并行、且能 merge」的下一阶段思路。

### Prefix / Prompt Tuning：在输入侧加可训向量

另一条思路不改层结构，而是在**序列前端拼接可训练向量**：

- **Prompt Tuning**：只在输入嵌入层前面加若干个可训 token（如 20 个），这些 token 的嵌入是参数；基座完全不动。参数极少（20×d 级别），但只在最底层施加影响，表达力有限，对复杂任务偏弱。
- **Prefix Tuning**：在**每一层**注意力的 K、V 前面都拼接可训前缀向量。因为作用在所有深度，表达力显著强于 Prompt Tuning，代价是参数量多一个层数因子（prefix_len×L×d×2）。前缀通过重参数化（用一个小 MLP 生成）来稳定训练。

两者的取舍是「深度 vs 参数」：Prompt Tuning 把参数压到极致但只碰输入层，Prefix Tuning 用更多参数换每层都能调。它们都不改权重，因此也是可存储的「软提示」，但**不像 LoRA 那样能 merge 回权重**——推理时前缀仍要随序列走，占用上下文长度。

:::deep

### 「加向量」路线的隐藏成本：吞掉上下文窗口

Prefix/Prompt Tuning 的前缀是真实参与注意力的 token，它们占据上下文长度。若前缀长 100，模型可用的有效上下文就少 100 个 token；长上下文任务里这点损失会被放大。更麻烦的是，前缀要在每个 batch、每步解码时都带着，服务层要为它做额外的 KV 管理。这解释了为什么在「长上下文 + 高并发」场景，社区更偏爱 LoRA——LoRA 的增量 merge 进权重后，序列里没有任何额外 token，上下文窗口一寸不少。一个方法「参数少」不等于「系统成本低」，这是谱系对照里最容易被忽略的维度。

:::

### (IA)³：缩放激活的极简派

(IA)³（Infused Adapter by Inhibiting and Amplifying Inner Activations）走了一条极简路线：不插模块、不加前缀，而是学**三个逐元素的缩放向量** l_k、l_v、l_ff，分别与注意力 K、注意力 V、FFN 中间激活相乘。参数量是 d + d + d_ff 每层的量级，比 LoRA 还省，且这些缩放可以数学上吸收进相邻权重矩阵——**推理同样零额外延迟**。

它的定位是「极致省参数 + 可合并」，在一些少样本、资源极紧的场景表现不错。但缩放向量只能调「幅度」，无法像低秩矩阵那样改变方向子空间，表达力上限低于 LoRA。可以把 (IA)³ 理解为谱系里「可合并阵营」中比 LoRA 更省、更弱的一档。

### LoRA：低秩增量成默认

LoRA（L85 详解）给每个目标权重加一个并行的低秩增量：W = W₀ + (α/r)BA，B 是 d_out×r、A 是 r×d_in，r 远小于 d。它同时继承了前几代的优点并补上了短板：

- **参数少**：只训 A、B，量级 d·r，比全参低约 10⁴ 倍（L85 推导）。
- **可合并**：部署前把 BA 加回 W₀，推理零额外延迟——不像 Adapters（串行）与 Prefix（占上下文）。
- **一基座多任务**：同一份 W₀，换不同的 (B,A) 就是不同任务适配器，切换只需换几十 MB 的小文件（L90 场景）。
- **表达力够**：低秩矩阵能改方向子空间，比 (IA)³ 的纯缩放强。

正是「省参数 + 零延迟 + 易切换 + 表达力够」这四点叠加，让 LoRA 成为默认 PEFT。下面把整条谱系的可训参数量级算成一张可复现的表。

### 可训参数量级对照表（可跑）

以 7B 级模型（L=32、d=4096、d_ff≈11008）为例，把各方法的可训参数量级算出来。注意 LoRA 的量级取决于挂了哪些目标模块——只挂 Wq/Wv 与挂全部线性层，差好几倍，这是选型时常见的认知盲区。

\`\`\`python
L, D, DFF = 32, 4096, 11008
N_FULL = 7e9

def pct(n):
    return f"{n/N_FULL*100:.4f}%"

methods = {}
methods["全参微调"] = N_FULL
methods["Adapters(r=8,4/L)"] = L * 4 * D * 8          # 每层 down+up 两次，各 d*r
methods["Prefix(L=32,len=100)"] = L * 100 * D * 2     # 每层 K、V 各 prefix_len*d
methods["Prompt(len=100)"] = 100 * D                  # 仅输入嵌入
methods["(IA)^3"] = L * (D + D + DFF)                 # 每层 k/v/ff 三个缩放向量
methods["LoRA r=8 (Wq,Wv)"] = L * 2 * (8 * (D + D))   # 只挂 Wq、Wv
methods["LoRA r=8 (全线性)"] = L * (4 * (8 * (D + D)) + 3 * (8 * (D + DFF)))

for name, n in methods.items():
    print(f"{name:26s} 可训 ≈ {n/1e6:9.3f} M  ({pct(n)})")

assert methods["LoRA r=8 (Wq,Wv)"] < methods["(IA)^3"] * 40
assert methods["全参微调"] / methods["LoRA r=8 (Wq,Wv)"] > 1e3
print("量级结论：LoRA 比全参省 3 个数量级；目标模块决定它落在谱系的哪个位置")
\`\`\`

### 各代取舍：把谱系钉在一张对照表上

把四代方法放进「可训参数 / 是否可合并 / 表达力 / 切换成本」四个维度，取舍一目了然：

| 方法 | 可训参数量级 | 可合并零延迟 | 表达力 | 多任务切换 |
|---|---|---|---|---|
| 全参微调 | 100%（N） | 是（本身就是新权重） | 最强 | 每任务一份全权重，最贵 |
| Adapters | 约 0.5% 到几% | 否（串行额外计算） | 中 | 换瓶颈权重，有延迟 |
| Prefix Tuning | 约 0.1% 到 1% | 否（占上下文） | 中偏强 | 换前缀，占窗口 |
| Prompt Tuning | 约 0.01% | 否（占上下文） | 弱 | 换 prompt token |
| (IA)³ | 约 0.01% | 是 | 偏弱（只调幅度） | 换缩放向量 |
| LoRA | 约 0.01% 到 0.5% | 是 | 强 | 换 BA，几十 MB |

读表要点：① **可合并**是部署分水岭——只有全参、(IA)³、LoRA 能零延迟，其余都要在推理路径上背额外开销；② **表达力**与「能否改方向子空间」相关，低秩矩阵（LoRA）比纯缩放（(IA)³）强；③ **切换成本**决定多任务架构成败，LoRA 的小文件切换最优（L90）。LoRA 正是唯一在四个维度上都不偏科的一档，这就是它成为默认的根本理由。

### 可跑验证：merge 为什么能抹掉推理开销

参数量之外，「可合并」是谱系里第二个分水岭。用一个可跑的 Toy 前向对照三种情况：裸基座、训练态 LoRA（并行算 W₀x + BAx）、merge 后单矩阵，以及插入式 Adapter（串行多两步矩阵乘）。数一数每层额外矩阵乘的次数与额外参数，就能理解为什么 LoRA 能零延迟而 Adapters 不能。

\`\`\`python
import numpy as np
rng = np.random.default_rng(1)
d, r, Bsz = 32, 4, 2                       # 隐维、秩、batch
W0 = rng.normal(size=(d, d))               # 基座权重
A = rng.normal(size=(r, d)) * 0.1          # LoRA A
Bm = rng.normal(size=(d, r)) * 0.1         # LoRA B（避免与 batch 变量 B 重名）
x = rng.normal(size=(Bsz, d))

# 数每个方案前向需要的「大矩阵乘」次数（小秩的 down/up 单列不计入大乘）
base_out = x @ W0.T                                   # 1 次：裸基座
lora_live = (x @ W0.T) + (x @ A.T) @ Bm.T             # 基座1 + 降维1 + 升维1
W_merge = W0 + Bm @ A                                 # 合并：把增量加回权重
lora_merged = x @ W_merge.T                           # 1 次：部署态单矩阵
assert np.allclose(lora_live, lora_merged), "merge 前后输出必须一致"

Down, Up = rng.normal(size=(d, r)), rng.normal(size=(r, d))
adapter_out = (x @ W0.T) + ((x @ Down) @ Up)           # 基座1 + down1 + up1，无法 merge
mm = {"裸基座": 1, "LoRA训练态": 3, "LoRA合并后": 1, "Adapter": 3}
for k, v in mm.items():
    print(f"{k:10s} 大矩阵乘次数 = {v}")
print("额外参数：LoRA BA =", Bm.size + A.size, " Adapter Down+Up =", Down.size + Up.size)
assert mm["LoRA合并后"] < mm["Adapter"], "merge 后应比 Adapter 少大矩阵乘"
print("结论：LoRA merge 回单矩阵抹掉额外计算；Adapter 串行无法消除，推理更慢")
\`\`\`

这段代码把「可合并」从口号变成可数的矩阵乘次数：LoRA merge 后与裸基座一样只做一次 matmul，而 Adapter 无论怎么部署都要多做 down+up 两次。这正是 L84 对照表里「LoRA 零延迟、Adapters 有延迟」的可验证来源，也是 L90 一基座多适配器能「零延迟切换」的前提——每个适配器的 BA 都能各自 merge 回同一份基座。

:::tip

### 一条演进主线：从「加在旁边」到「加进权重」

整条 PEFT 谱系可以压成一句话：**把「为任务新增的可调自由度」，从模型的外部（串行模块、输入前缀）一步步挪进权重矩阵内部的可合并增量**。Adapters 加在层间（外部、串行），Prefix/Prompt 加在序列前端（外部、占窗口），(IA)³ 缩放激活（半内部、可合并），LoRA 直接给权重加低秩增量（内部、可合并）。越往内部走，系统代价越低、切换越轻，工程上越好用。带着这条主线读 L85 的 W=W₀+(α/r)BA，就不只是记一个公式，而是理解它为什么站在谱系的终点。

:::
`,
    null,
    [
      {
        text: 'Adapters 与 LoRA 在「新增参数放在哪」上的核心差别是？',
        options: [
          '两者都在输入前加向量',
          'Adapters 在层间插入串行瓶颈模块，LoRA 给权重加并行低秩增量且可合并',
          '两者都只改词嵌入',
          'LoRA 不训练任何参数',
        ],
        answer: 1,
        explain:
          'Adapters 是层内串行的 down-up 瓶颈，推理多一段串行计算；LoRA 是与权重并行的 BA 增量，部署前可 merge 回原矩阵，零额外延迟。',
        concept: 'peft-lineage',
      },
      {
        text: 'Prefix Tuning 与 Prompt Tuning 的主要区别是？',
        options: [
          '前者只在输入层加向量、后者在每层加',
          '前者在每一层的 K/V 前加可训前缀（更深、更强），后者只在输入嵌入层加可训 prompt（更浅、更省）',
          '两者完全相同',
          '后者需要改权重',
        ],
        answer: 1,
        explain:
          'Prompt Tuning 只在输入嵌入加可训 token，参数最少但表达弱；Prefix Tuning 在每层注意力 K/V 前都加可训前缀，参数更多、表达更强。',
        concept: 'peft-lineage',
      },
      {
        text: '(IA)³ 的可训参数形式是什么？',
        options: [
          '低秩矩阵 B×A',
          '对 K、V、FFN 激活逐元素相乘的可学习缩放向量',
          '输入前缀 token',
          '全部权重',
        ],
        answer: 1,
        explain:
          '(IA)³ 只学三个逐元素缩放向量 l_k、l_v、l_ff，与激活相乘，参数极省；推理也可合并进权重，零延迟。',
        concept: 'peft-lineage',
      },
      {
        text: 'LoRA 成为默认 PEFT 方法的关键原因不包括？',
        options: [
          '可训参数少、显存低',
          '增量可 merge 回基座，部署零额外延迟',
          '同一基座换不同 BA 即可切换任务',
          '必须更新全部基座权重',
        ],
        answer: 3,
        explain:
          'LoRA 冻结基座，只训低秩 BA；显存低、可 merge 零延迟、一基座多适配器，正因不更新全部权重才成立。',
        concept: 'peft-lineage',
      },
    ],
    [
      ['PEFT', '参数高效微调，冻结预训练基座、只训练少量新增参数的一类方法总称'],
      ['Adapters', '在 Transformer 层间插入的低维瓶颈模块，串行计算，参数约为模型的百分之几'],
      ['Prefix Tuning', '在每层注意力的 K/V 前拼接可训练前缀向量，不改变权重'],
      ['Prompt Tuning', '只在输入嵌入层拼接可训练 prompt token，参数最少、表达最弱'],
      ['(IA)³', '用三个可学习向量逐元素缩放 K、V、FFN 激活的极简 PEFT'],
      ['LoRA', '低秩适应，冻结基座并用 W=W₀+(α/r)BA 的低秩增量拟合下游'],
    ],
    [
      '以为 PEFT 都零延迟——Adapters 是串行插入，推理多一段计算；只有 LoRA/(IA)³ 这类可合并的才零额外延迟。',
      '把 Prompt Tuning 与 Prefix Tuning 混为一谈——前者只在输入层、后者在每层 K/V，参数量与表达力差一个层数因子。',
      '认为可训参数越少越好——Prompt Tuning 极省但表达弱，任务复杂时反而不如 LoRA。',
      '忽略「可合并」这个部署属性——不可合并的方法在在线服务里会引入延迟与工程复杂度。',
      '拿全参的显存账套 PEFT——PEFT 冻结基座后优化器状态只给少量参数准备，量级完全不同。',
    ],
  ),
  'framework',
)
