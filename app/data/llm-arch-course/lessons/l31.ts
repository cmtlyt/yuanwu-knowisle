import { L, withKind } from '../../course-builders.ts'

export const L31 = withKind(
  L(
    'L31',
    13,
    '手写 top-k 路由 + 辅助损失小模型冒烟',
    4,
    ['L29'],
    ['routing-impl'],
    [
      '写出可跑的 top-k 路由前向代码',
      '实现辅助负载均衡损失项',
      '跑通小模型 MoE 前向冒烟',
      '验证专家负载分布与门控归一',
    ],
    `### 本课要交付什么

这是 M3 的第一个动手课。前面几课把 MoE 的机制讲透，这一课把它们变成能跑、能验的代码。交付物有四件，正好对应四条学习目标：一是一个**可跑的 top-k 路由前向**，严格走「线性打分、top-k 选择、门控归一、加权和」四步；二是一个**辅助负载均衡损失项**，能作为正则并入训练；三是一个**小模型 MoE 前向的冒烟测试**，用随机数据跑通前向与反向、确认形状与数值合理；四是对**专家负载分布与门控归一**的验证断言。四件都做成一段自洽的 PyTorch 脚本，跑完打印具体数字并通过全部断言。

为什么强调「手写」？因为框架封装（如 Megatron、DeepSpeed 的 MoE）把路由细节藏在几十个开关背后，出问题很难定位。亲手实现一遍，你会对「logits 怎么变成权重」「稀疏到底省在哪」「aux-loss 为什么是那个形式」建立肌肉记忆——这也是后面 L32 讲 all-to-all、L34 做 capstone、L35 诊断坍缩的共同基础。代码用随机权重和合成数据，不依赖外部数据集，保证拿来就能跑。

### 第一步：top-k 路由前向的实现要点

手写路由前向有四个关键点，逐条说明。

**打分**：门控是一个 \`nn.Linear(d_model, num_experts, bias=False)\`，对输入 x（形状是 batch 乘 seq 乘 d_model）产出 logits（batch 乘 seq 乘 num_experts）。

**top-k**：用 \`torch.topk(logits, k, dim=-1)\` 同时拿到分数 \`top_logits\` 与索引 \`expert_idx\`。这里 \`expert_idx\` 决定每个 token 去哪些专家，后面分发时要用。

**归一**：对 \`top_logits\` 做 softmax。为了数值稳定，先减去每行的最大值（防指数溢出）。得到 k 个和为 1 的权重 \`top_weight\`。这一步只在 k 项上做，未选中项天然权重为零。

**稀疏加权和**：遍历 k 个被选中的专家（而不是全部 N 个），对每个专家收集「选中它的那些 token」，把它们的输入送进该专家 FFN，产出结果后乘对应门控权重，累加回输出张量的相应位置。这个「只遍历 k 个专家」的循环就是稀疏计算的落点——未选中专家的 FFN 根本不执行。

:::deep

### 为什么用 scatter 累加而不是简单地平均

把专家输出写回总输出时，最直观的写法是 for 循环逐 token 累加，但对每个专家最好是「批量收集它负责的 token、一次前向、再批量写回」。这里用到一个关键操作：\`output.index_add_(0, flatten_idx, weighted_out)\`，按 token 的扁平索引把加权后的专家输出累加进去。之所以要用「累加（add）」而不是「赋值（copy）」，是因为同一个 token 被 k 个专家服务，它的输出是 k 份加权结果的和——多个专家会往同一个 token 位置写，必须累加而非覆盖。这也是 MOE 与「硬分配」类路由（一个 token 只去一个专家，可直接赋值）在实现上的分水岭。理解这一条，就理解了为什么 top-k 大于 1 时的代码要带 \`index_add\` 语义。

:::

### 路由实现的三个常见翻车点

在真正跑通之前，有三个几乎人人都会踩的坑值得先钉死，它们各自对应一段会被断言抓住的错误代码。

第一个坑是 **softmax 的维度用错**。logits 的形状是「token 数乘专家数」，门控权重必须在「专家」那一维（最后一维 \`dim=-1\`）上归一，让每个 token 的 k 个权重和为 1。若手滑写成 \`dim=0\`，就会在 token 维上归一，得到的是「每个专家在不同 token 间的相对分数」——语义完全错了，但形状不变、不会报错，只有加上「逐 token 权重和为 1」的断言才能发现。这也是为什么本课把门控归一验证列为独立的第四步：它专抓这类「静默错误」。

第二个坑是**写回时用赋值而非累加**。一个 token 被 k 个专家服务，每份输出乘了对应门控权重后要相加。若用 \`out[tok] = y\` 覆盖，后写的专家会抹掉前面专家的贡献，最终输出只剩最后一个专家的结果——top-k 退化成了 top-1 的某个随机槽位，形状依然正确，质量却悄悄崩掉。正确做法是用 \`index_add_\` 按 token 索引累加，让 k 份加权输出真正相加。

第三个坑是**未选中专家仍被计算**。有些实现图省事，先把所有专家的输出都算出来存成张量，再用门控权重做加权和（未选中项权重乘零）。数值上这与稀疏路由等价，但 FLOPs 一点没省——每个 token 还是穿过了全部专家，MoE 省计算的前提被彻底破坏。正确写法是在专家循环里用 \`mask.any()\` 判断，没有 token 选中该专家就 \`continue\` 跳过前向。这三个坑的共同点是「形状对、结果错、不报错」，所以必须靠断言与数值检查兜底，而不是靠肉眼读输出。

### 第二步：辅助负载均衡损失

aux-loss 用 GShard/Switch 风格的形式：先统计每个专家被选中的 token 占比 f_i（用 \`torch.bincount\` 对 \`expert_idx\` 计数，再除以总数），再取门控概率在 batch 上的均值 P_i（对全部 logits 做 softmax 后沿 batch 维求平均），则 \`aux = num_experts × (f × P).sum()\`。分布均匀时这项接近 1，越不均衡越大。把它乘以一个很小的系数（如 0.01）加到主交叉熵上，一起 \`backward()\`。

实现上有两个细节。第一，f_i 的统计来自 top-k 的离散索引，本身不可导；但 P_i 可导，乘积项因此能把梯度传给门控——这正是 L30 讲过的「用软量提供可优化抓手」。第二，aux-loss 的系数是核心超参，太大压制主任务，太小压不住坍缩；代码里把它做成参数 \`aux_coef\`，方便扫参。真正的训练里还要把它记录在日志里，与困惑度一起观察——这就是 L35 的诊断信号。

### 第三步与第四步：可跑的完整脚本与验证

下面是完整脚本：一个小 MoE（d_model=16，8 个专家，每 token 选 2），手写路由前向与 aux-loss，再用合成分类任务跑几步前向/反向，最后打印门控归一检查、专家负载分布、aux-loss 数值并通过断言。这段代码同时覆盖四条学习目标，可以直接运行。

\`\`\`python
import torch
import torch.nn as nn
import torch.nn.functional as F

torch.manual_seed(0)

class Expert(nn.Module):
    """单个专家 FFN：d_model -> 4*d_model -> d_model（本课简化版）。"""
    def __init__(self, d_model):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_model, 4 * d_model), nn.GELU(),
            nn.Linear(4 * d_model, d_model),
        )
    def forward(self, x):
        return self.net(x)

class SparseMoELayer(nn.Module):
    def __init__(self, d_model, num_experts=8, k=2, aux_coef=0.01):
        super().__init__()
        self.d_model, self.E, self.k, self.aux_coef = d_model, num_experts, k, aux_coef
        self.gate = nn.Linear(d_model, num_experts, bias=False)
        self.experts = nn.ModuleList([Expert(d_model) for _ in range(num_experts)])
        self.last_load = None      # 记录本步负载，供验证与诊断

    def forward(self, x):
        B, T, D = x.shape
        flat = x.reshape(-1, D)                          # [BT, D]
        logits = self.gate(flat)                          # [BT, E] ① 打分
        top_logits, expert_idx = torch.topk(logits, self.k, dim=-1)  # ② top-k
        top_w = F.softmax(top_logits - top_logits.max(dim=-1, keepdim=True).values, dim=-1)  # ③ 归一 [BT,k]

        out = torch.zeros_like(flat)                      # ④ 稀疏加权和
        flat_tok = torch.arange(flat.size(0), device=x.device)
        counts = torch.bincount(expert_idx.reshape(-1), minlength=self.E).float()
        self.last_load = counts / counts.sum()
        for j in range(self.k):                           # 只遍历 k 个被选中的专家槽位
            e_sel = expert_idx[:, j]                      # 每个 token 在第 j 槽选中的专家
            w_sel = top_w[:, j]
            for e in range(self.E):                       # 对该专家，批量收集选中它的 token
                mask = e_sel == e
                if not mask.any():
                    continue                              # 未选中该专家 → 完全跳过前向（稀疏）
                tok_ids = flat_tok[mask]
                y = self.experts[e](flat[mask])
                out.index_add_(0, tok_ids, w_sel[mask].unsqueeze(-1) * y)  # 多专家写回需累加

        # 辅助负载均衡损失：f=实际负载占比，P=门控概率均值
        f = self.last_load
        P = F.softmax(logits, dim=-1).mean(dim=0)
        aux = self.E * (f * P).sum()
        return out.reshape(B, T, D), aux

# 冒烟：小模型 + 合成分类任务，跑若干步前向/反向
d_model, E, k = 16, 8, 2
model = SparseMoELayer(d_model, num_experts=E, k=k, aux_coef=0.01)
head = nn.Linear(d_model, 4)                            # 接一个分类头凑成完整小模型
opt = torch.optim.Adam(list(model.parameters()) + list(head.parameters()), lr=1e-3)

x = torch.randn(32, d_model)
labels = torch.randint(0, 4, (32,))
for step in range(20):
    moe_out, aux = model(x.unsqueeze(1))                # [32,1,16]
    logits_cls = head(moe_out.squeeze(1))
    loss = F.cross_entropy(logits_cls, labels) + model.aux_coef * aux
    opt.zero_grad(); loss.backward(); opt.step()

# 验证一：把门控换成「全 1 输入探针」检查每个 token 权重和为 1、非零项数为 k
probe = torch.ones(1, 1, d_model)
_, _ = model(probe)
probe_logits = model.gate(probe.reshape(-1, d_model))
pw = F.softmax(torch.topk(probe_logits, k, dim=-1).values, dim=-1)
print(f"门控权重和={pw.sum().item():.6f}, 非零项数={k}")
assert abs(pw.sum().item() - 1.0) < 1e-5, "门控权重必须归一"

# 验证二：专家负载分布与 aux-loss 数值
load = model.last_load
print(f"专家负载占比={[round(v, 3) for v in load.tolist()]}")
print(f"负载最重/最轻比={load.max().item()/load.min().item():.2f}, aux-loss={aux.item():.3f}")
assert (load > 0).sum() >= 2, "至少应有多个专家被使用"
assert aux.item() >= 1.0 - 1e-3, "aux-loss 理论下界约为 1（完全均匀）"
print("小模型 MoE 前向/反向冒烟与验证全部通过")
\`\`\`

脚本最后三个打印是最硬的验证：门控权重和约等于 1（归一）；8 个专家的负载占比列表（均衡程度一目了然）；aux-loss 不小于约 1（分布完全均匀时取下界）。\`index_add_\` 的累加语义、只遍历 k 个槽位、未选中专家 \`continue\` 跳过前向——这三处是「稀疏真正省计算」的代码落点。

:::tip

### 冒烟通过不代表训练能收敛

这课的冒烟只验证「前向/反向能跑、形状对、门控归一、aux-loss 数值合理」，**不代表模型学到了有用的东西**——20 步随机数据不会收敛。它的价值是把实现层面的 bug（维度错、softmax 用错维度、写回覆盖而非累加）挡在大规模训练之前。真正观察负载是否长期均衡、会不会坍缩，要靠 L37 的完整训练脚本与利用率直方图。把本课的四步路由函数和 aux-loss 留住，L34 的 capstone 会直接复用并加上细粒度与共享专家。

### 数值自检：index_add 累加与覆盖的差别

用一段最小代码演示「多专家写回同一 token 必须累加」：对比 \`index_add_\`（正确）与直接赋值（错误，丢弃前序专家贡献）的数值差异。

\`\`\`python
import torch
BT, D = 4, 3
out_add = torch.zeros(BT, D)
out_set = torch.zeros(BT, D)
# 两个专家都服务 token 0，各贡献一部分
contrib_0 = torch.tensor([[0.6, 0.0, 0.0]])
contrib_1 = torch.tensor([[0.4, 0.0, 0.0]])
idx = torch.tensor([0])
out_add.index_add_(0, idx, contrib_0)
out_add.index_add_(0, idx, contrib_1)   # 正确：累加 → 1.0
out_set[idx] = contrib_0
out_set[idx] = contrib_1                # 错误：覆盖 → 只剩 0.4
print(f"累加结果 token0={out_add[0].tolist()}, 覆盖结果 token0={out_set[0].tolist()}")
assert abs(out_add[0, 0].item() - 1.0) < 1e-6, "累加应得到两份贡献之和 1.0"
assert out_set[0, 0].item() < out_add[0, 0].item(), "覆盖会丢失前序专家贡献"
print("index_add 累加语义自检通过：top-k 写回必须用累加")
\`\`\`

:::
`,
    null,
    [
      {
        text: '手写 top-k 路由前向时，对未选中的专家应如何处理才能保证稀疏计算？',
        options: [
          '也计算其输出但乘以 0',
          '只为被选中的 top-k 专家计算前向，未选中者完全跳过',
          '把所有专家输出平均',
          '把未选中专家的权重设为 1',
        ],
        answer: 1,
        explain:
          '稀疏的意义就是未选中专家不参与前向和反向；若照算再乘 0，虽结果相同但 FLOPs 没省，违背 MoE 初衷。',
        concept: 'routing-impl',
      },
      {
        text: '用 torch.topk 拿到 top-k 索引后，计算门控权重最正确的做法是？',
        options: [
          '对全部 logits 做 softmax 再取索引对应值',
          '对 top-k 选出的分数做 softmax（减去最大值稳定数值），使其和为 1',
          '直接用原始 logits 当权重',
          '把所有权重设为 1/k',
        ],
        answer: 1,
        explain:
          '只在 top-k 子集中做 softmax（先减 max 防溢出），既保持稀疏又保证选中项归一、尺度稳定；对全部 logits 归一会让分母含未选中项、权重和小于 1。',
        concept: 'routing-impl',
      },
      {
        text: '辅助负载均衡损失在训练循环里应如何接入？',
        options: [
          '替代主交叉熵损失',
          '以较小的系数加权后与主损失相加，一起反向传播',
          '只在推理时计算',
          '直接加到输出 logits 上',
        ],
        answer: 1,
        explain:
          'aux-loss 作为正则项乘以小系数（如 0.01）与主交叉熵相加后统一反向传播；系数过大会压制主任务梯度导致掉点。',
        concept: 'routing-impl',
      },
      {
        text: '验证「门控归一」应检查以下哪个条件？',
        options: [
          '所有专家的权重都相等',
          '每个 token 的门控权重之和约等于 1，且非零项数等于 k',
          '权重全为正整数',
          '专家输出全为零',
        ],
        answer: 1,
        explain:
          '门控归一的硬指标是逐 token 权重和约等于 1（可用全 1 向量检验），同时非零权重数恰好为 k，二者共同确认稀疏且归一。',
        concept: 'routing-impl',
      },
    ],
    [
      ['torch.topk', 'PyTorch 中取张量最大 k 个值及其索引的操作，是实现 top-k 路由的核心算子'],
      ['稀疏前向', '只对被选中专家计算输出的前向方式，未选中专家完全跳过以真正节省 FLOPs'],
      ['辅助负载均衡损失', '加在主损失上的正则项，用负载分布统计量惩罚不均衡，鼓励各专家被均匀使用'],
      ['门控权重归一', '对选中 k 项的 logits 做 softmax 使其和为 1，保证加权和输出的尺度稳定'],
      ['冒烟测试（smoke test）', '用小批量数据跑通前向/反向的最小验证，确认形状、断言、数值合理'],
    ],
    [
      '对全部专家 logits 做 softmax 再取 top-k——会让选中项权重和小于 1，破坏归一与尺度稳定。',
      '给未选中专家也算前向再乘零——数值虽对却没省计算，失去稀疏意义。',
      '辅助损失系数取得过大——压过主任务梯度，困惑度变差；应从 0.01 量级起扫参。',
      '忘记在 eval 模式关闭路由噪声或辅助损失统计——可能让验证指标与训练口径不一致。',
    ],
  ),
  'practice',
)
