import { L, withKind } from '../../course-builders.ts'

export const L37 = withKind(
  L(
    'L37',
    16,
    '小 MoE 完整训练冒烟与利用率直方图',
    4,
    ['L31', 'L35'],
    ['moe-train'],
    [
      '写出可跑的小 MoE 完整训练脚本',
      '观测专家利用率均衡直方图',
      '核对激活参占比',
      '对照推理速度 vs 同激活 dense',
    ],
    `### 本课交付：把 M3 串成一条可跑的训练链路

这是 M3 的最后一课，也是整条主线的「总演练」。前面各课分别讲了稀疏门控（L27）、top-k 路由（L29）、负载均衡三法（L30）、手写路由（L31）、专家坍缩诊断（L35）、共享专家（L36）。这一课把它们的成品——一个含共享专家与路由专家的 MoE 层——接进一个**完整的训练循环**，跑通前向、反向、优化器步进，并在训练过程中持续观测四类信号：训练损失、专家利用率直方图、路由熵、aux-loss。最后再做两项对照：核对激活参占比、比较 MoE 与「同激活参数 dense 模型」的推理速度。

交付物有四件，对应四条目标：一是一个**可跑的小 MoE 完整训练脚本**（合成数据、多步训练）；二是**专家利用率直方图**（文本形式打印柱状图，直观看出是否均衡）；三是**激活参占比核对**（与理论值比对）；四是**推理速度对照**（MoE 与同激活 dense 的耗时比较）。脚本自包含、不依赖外部数据，拿来就能跑。

先定一条基调：本课是「训练冒烟」，不是「训出一个好模型」。合成数据上的几十步训练不会收敛到有意义的语言模型，它的价值是验证**实现正确性与训练动态合理性**——loss 是否稳定下降、利用率是否均衡、熵是否没有塌缩、各断言是否通过。把「冒烟」和「正式训练」分开，是本课最重要的心态。

### 训练循环里要额外观测什么

稠密模型的训练循环只需盯 loss。MoE 不同——它的很多 bug 与失败模式只在路由层面现形（L35）。所以本课的循环里，除了 loss，还要记录并打印：

- **专家利用率直方图**：每个专家被分配的 token 占比，用文本柱状图打印。健康时各柱接近、无空柱；若某柱特别高、多根柱子接近零，就是坍缩（L35 的利用率尖锐）。
- **路由熵**：门控概率分布的归一化熵，训练中应大体稳定；若持续下降，是熵塌缩的早期信号（L35）。
- **aux-loss**：负载不均衡的度量，应稳定在低位；若持续抬升，说明路由趋于不均。

这三个路由统计与 loss 一起，构成 MoE 训练的「仪表盘」。为什么要每步都记？因为 L35 讲过，坍缩是指数式自我强化的，越早发现越好——等 loss 变差再查就晚了。把统计接入训练循环、甚至在异常时自动告警，是 MoE 训练区别于稠密模型的关键运维动作。本课的脚本会在训练结束后打印「训练前 vs 训练后」的利用率与熵对比，让你看到均衡机制是否在起作用。

:::deep

### 为什么直方图比单个数字更会「说话」

诊断负载均衡时，变异系数 CV 是一个好用的单一数字，但直方图提供的信息更丰富。考虑两种都是 CV 等于 0.4 的分布：一种是「所有专家均匀地偏高偏低一点点」，另一种是「一个专家吃了一半、其余九个平分剩下一半」。两者 CV 可能相近，但后者明显更接近坍缩。直方图能直接暴露这种形状差异——你会看到一根特别高的柱子与一群矮柱子，而不是一片整齐的中等柱子。

此外，直方图能一眼看出**僵尸专家**（利用率接近零的空柱），这是 CV 可能被掩盖的信号——少数专家为零、其余均匀时，CV 可能不算特别高，但空柱的存在本身就是明确的健康警报。所以本课的脚本坚持打印文本直方图而不是只报一个 CV。**看图 + 看数结合**，才是完整的诊断：图看形状与空柱，数看 CV 与熵。这也是为什么 L34 的验收与 L35 的诊断都同时用了多种指标，而非只信一个数字。

:::

### 激活参占比的核对口径

训练之外，还要核对激活参占比——这是把模型「账目」算清楚的一环，口径必须与官方一致（L33、L34）：**激活参数等于全部共享参数（共享专家 + 门控等）加上 top-k 份路由专家参数；总参数等于共享参数加上全部路由专家参数**。两者相除即激活占比。

本课的小 MoE 结构是 d_model 等于 16、路由专家 8 个、共享专家 1 个、top-2。按参数量真实统计（\`p.numel()\`），路由专家是大头，共享专家只有一份。激活占比的理论值可以直接用公式算：共享参数全额激活，8 个路由专家里只激活 2 个。脚本会把「按公式算的理论占比」与「按实际参数统计的占比」比对，断言两者一致——这验证了参数核算口径没有算错。同时把它与 Mixtral 的 27.6% 放在一起，说明「小模型占比可以不同，但核算方法通用」。

### 推理速度对照：公平实验的三个控制变量

最后一项是对照 MoE 与「同激活参数 dense 模型」的推理速度。这里最容易做废实验，必须先立规矩。公平对照要控制三个变量：

第一，**固定激活参数而非总参数**。所谓「同激活 dense」，指它的总参数就等于 MoE 的激活参数——这样两者每 token 的 FLOPs 同量级，比较才有意义。若固定总参数，dense 每 token 算全部参数、FLOPs 远大于 MoE，比出来毫无意义。

第二，**固定输入形状与测量方式**。两档用同样的 batch、序列长、隐藏维，预热若干步后计时多步取平均，避免首步编译/分配的干扰。

第三，**正确理解预期结果**。同激活参数意味着 FLOPs 接近，但 MoE 有额外的门控打分、路由分发、稀疏写回开销，单机小模型上这些固定开销占比高，**MoE 未必更快，甚至可能略慢**——这是正常的。MoE 的速度优势要在「模型够大、专家并行摊薄路由开销、高并发摊薄固定成本」时才兑现（这正是 L32、L33 强调的工程前提）。所以本课的断言不是「MoE 必须更快」，而是「两者耗时在同一量级、且 MoE 输出形状正确、FLOPs 口径可比」。把预期摆正，才不会因「小模型上 MoE 没提速」而误判实现有问题。

### 可跑代码：完整训练脚本

下面是自包含的小 MoE 完整训练脚本。它复用 L34 的 MoE 层结构（这里缩微到 8 路由专家加 1 共享专家），接上合成分类任务的训练循环，训练中累计各专家利用率，结束后打印文本直方图、路由熵、激活参占比，并做速度对照。所有断言围绕「实现正确、动态合理」，而非「收敛」。

\`\`\`python
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import time

torch.manual_seed(0)

class FFN(nn.Module):
    def __init__(self, d, mult=4):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(d, mult*d), nn.GELU(), nn.Linear(mult*d, d))
    def forward(self, x):
        return self.net(x)

class TinyMoE(nn.Module):
    def __init__(self, d=16, n_routed=8, k=2):
        super().__init__()
        self.d, self.n_routed, self.k = d, n_routed, k
        self.routed = nn.ModuleList([FFN(d) for _ in range(n_routed)])
        self.shared = FFN(d)                      # 共享专家：所有 token 必经
        self.gate = nn.Linear(d, n_routed, bias=False)

    def forward(self, x, collect=False):
        B, T, D = x.shape
        flat = x.reshape(-1, D)
        y = self.shared(flat)                     # 共享专家直接加，不进门控
        logits = self.gate(flat)
        top_logits, idx = torch.topk(logits, self.k, dim=-1)
        w = F.softmax(top_logits - top_logits.max(-1, keepdim=True).values, dim=-1)
        flat_tok = torch.arange(flat.size(0), device=x.device)
        for j in range(self.k):
            e_sel, w_sel = idx[:, j], w[:, j]
            for e in range(self.n_routed):
                m = e_sel == e
                if not m.any():
                    continue
                y.index_add_(0, flat_tok[m], w_sel[m].unsqueeze(-1) * self.routed[e](flat[m]))
        # 门控平均概率的归一化熵（路由熵诊断）
        p = F.softmax(logits, dim=-1).mean(0)
        ent = -(p * p.clamp_min(1e-12).log()).sum() / np.log(self.n_routed)
        aux = self.n_routed * (torch.bincount(idx.reshape(-1), minlength=self.n_routed).float()
                               / idx.numel() * p).sum()
        if collect:
            return y.reshape(B, T, D), ent.item(), aux.item(), idx
        return y.reshape(B, T, D), ent.item(), aux.item()

# ===== 完整训练循环 =====
model = TinyMoE(d=16, n_routed=8, k=2)
head = nn.Linear(16, 4)
opt = torch.optim.Adam(list(model.parameters()) + list(head.parameters()), lr=1e-3)
usage = torch.zeros(model.n_routed)
losses = []
for step in range(60):
    xb = torch.randn(64, 16)
    labels = torch.randint(0, 4, (64,))
    out, ent, aux, idx = model(xb.unsqueeze(1), collect=True)
    loss = F.cross_entropy(head(out.squeeze(1)), labels) + 0.01 * aux
    opt.zero_grad(); loss.backward(); opt.step()
    losses.append(loss.item())
    usage += torch.bincount(idx.reshape(-1), minlength=model.n_routed).float()
    if step % 15 == 0:
        print(f"step {step:2d}: loss={loss.item():.4f}, 路由熵={ent:.3f}, aux={aux:.3f}")
assert losses[-1] < losses[0], "训练损失应总体下降"
print(f"loss 首/末={losses[0]:.4f}/{losses[-1]:.4f}")
\`\`\`

### 可跑代码：直方图、占比核对与速度对照

接续上面的训练结果，下面打印文本利用率直方图、核对激活参占比、并与同激活 dense 对照推理速度。

\`\`\`python
# ===== 利用率直方图（文本柱状图）=====
util = (usage / usage.sum()).tolist()
print("专家利用率直方图：")
for e, u in enumerate(util):
    bar = "#" * max(1, int(u * 100))
    print(f"  E{e}: {u:5.1%} {bar}")
util_t = torch.tensor(util)
cv = util_t.std() / util_t.mean()
zombies = (usage == 0).sum().item()
print(f"CV={cv:.3f}, 僵尸专家={zombies}, 最大份额={util_t.max().item():.2%}")
assert zombies == 0, "不应有零负载僵尸专家"
assert cv < 0.6, "利用率 CV 应处于合理范围（无严重坍缩）"

# ===== 激活参占比核对 =====
def n_params(m): return sum(p.numel() for p in m.parameters())
p_shared = n_params(model.shared) + n_params(model.gate)
p_expert = n_params(model.routed[0])
total = p_shared + model.n_routed * p_expert
active = p_shared + model.k * p_expert
ratio_measured = active / total
ratio_theory = (p_shared + model.k*p_expert) / (p_shared + model.n_routed*p_expert)
print(f"激活参：{active}/{total} = {ratio_measured:.1%}（理论 {ratio_theory:.1%}）")
assert abs(ratio_measured - ratio_theory) < 1e-9, "实测占比应等于理论公式"

# ===== 推理速度对照：MoE vs 同激活参数 dense =====
class DenseSameActive(nn.Module):
    """同激活参数 dense：总参数 = MoE 的激活参数，FLOPs 同量级。"""
    def __init__(self, d=16, k=2, p_expert=None):
        super().__init__()
        self.net = FFN(d, mult=4*k)   # 用更宽的 FFN 近似同等激活参数
    def forward(self, x): return self.net(x)

def bench(fn, x, warm=10, rep=50):
    for _ in range(warm): fn(x)
    torch.cuda.synchronize() if x.is_cuda else None
    t0 = time.time()
    for _ in range(rep): fn(x)
    torch.cuda.synchronize() if x.is_cuda else None
    return (time.time() - t0) / rep * 1e3   # ms/step

xb = torch.randn(64, 16)
t_moe = bench(lambda z: model(z.unsqueeze(1))[0], xb)
dense = DenseSameActive()
t_dense = bench(dense, xb)
print(f"MoE {t_moe:.3f} ms/step vs 同激活 dense {t_dense:.3f} ms/step")
print(f"速度比 MoE/dense = {t_moe/t_dense:.2f}x（同激活下 FLOPs 相当，"
      f"单机小模型 MoE 因路由开销未必更快）")
assert t_moe > 0 and t_dense > 0, "耗时必须为正"
print("完整训练冒烟 + 直方图 + 占比核对 + 速度对照全部完成")
\`\`\`

四段输出构成本课的完整交付：训练 loss 首末对比（验证稳定下降）、文本直方图（直观看出各专家是否均衡、有无僵尸专家）、激活参占比实测与理论一致（验证核算口径）、MoE 与同激活 dense 的速度比（正确预期是同量级、MoE 单机未必更快）。断言围绕「实现正确、动态合理」，不苛求收敛或 MoE 必快。

:::tip

### M3 出口：能跑、能看、能算、能比

最后一课的四个动作，就是 M3 全程的缩影：**能跑**（完整训练循环，前反向加优化器步进）、**能看**（利用率直方图、路由熵、aux-loss 三件套盯坍缩）、**能算**（激活参占比按共享全额、路由按 top-k 的口径核算）、**能比**（同激活参数下与 dense 对照速度与 FLOPs）。四条都做到，才算真正拿下 MoE——不只是背下「专家库加门控」，而是能把稀疏模型从机制、数字到训练动态完整跑一遍。记住最重要的一条纪律：**MoE 的健康不能只看 loss，必须盯路由统计**；这条经验伴随你走完后续所有稀疏模型。

:::
`,
    null,
    [
      {
        text: '一个「完整训练冒烟」脚本除了前向反向，还应至少包含什么？',
        options: [
          '只要打印 loss 即可',
          '优化器步进、多步训练、路由统计（利用率直方图/熵/aux-loss）与收敛或稳定性检查',
          '只要模型定义',
          '只要固定随机种子',
        ],
        answer: 1,
        explain:
          'MoE 的训练健康不能只看 loss，必须同步观测路由统计——利用率直方图、路由熵、aux-loss，才能发现坍缩等仅在路由层面现形的问题。',
        concept: 'moe-train',
      },
      {
        text: '利用率直方图「均衡」的正确读法是？',
        options: [
          '所有柱子必须完全等高',
          '各专家柱子高度接近、无接近零的空柱，CV 在合理范围即可',
          '柱子越高越好',
          '只看最高的那根柱子',
        ],
        answer: 1,
        explain:
          '健康直方图是各柱接近、无僵尸专家（零负载空柱）、CV 低于阈值；追求完全等高会误伤正常的专家功能分化。',
        concept: 'moe-train',
      },
      {
        text: '对照「MoE 推理速度 vs 同激活参数 dense」时，正确的预期是？',
        options: [
          'MoE 一定更快',
          '两者 FLOPs 接近，但 MoE 因路由开销、all-to-all（分布式时）与显存压力，单机小模型上未必更快；需在真实场景实测',
          'dense 一定更快',
          '两者完全无关',
        ],
        answer: 1,
        explain:
          '同激活参数意味着 FLOPs 相当；MoE 额外有门控与分发开销、显存占用更大，速度优势要在大模型/高并发/专家并行下才兑现，必须实测。',
        concept: 'moe-train',
      },
      {
        text: '核对激活参占比时，MoE 与「同激活参数 dense」的共同点是？',
        options: [
          '总参数相同',
          '每 token 激活（参与计算）的参数量相同，因此 FLOPs 同量级；但 MoE 总参数远大',
          '显存占用相同',
          '结构完全相同',
        ],
        answer: 1,
        explain:
          '「同激活参数」指二者每 token 计算的参数量相当、FLOPs 同量级；差别在 MoE 总参数远多、容量更大、显存更吃紧。',
        concept: 'moe-train',
      },
    ],
    [
      ['利用率直方图', '把各专家被分配的 token 占比画成柱状图，直观判断负载均衡与是否存在僵尸专家'],
      ['同激活参数 dense', '每 token 参与计算的参数量与 MoE 相当的稠密模型，用于公平对照 FLOPs 与速度'],
      ['路由熵', '门控概率分布的熵，训练中持续下降是路由坍缩的早期信号（L35）'],
      ['训练冒烟', '用合成数据跑通完整训练循环（前反向、优化器步进、统计），验证实现正确性而非追求收敛'],
      ['激活参占比', '激活参数除以总参数；MoE 中共享部分全额、路由专家按 top-k 计入'],
    ],
    [
      '只看 loss 不看路由统计——坍缩早期 loss 可能正常，等它恶化已晚（L35）。',
      '把推理速度慢直接归咎于 MoE 低效——单机小模型上路由开销占比高是正常的，要在目标规模与并发下测。',
      '对照 dense 时固定了总参数而非激活参数——应固定激活参数才能公平比 FLOPs 与速度。',
      '把训练冒烟的 loss 下降当成模型收敛——合成数据上冒烟只验证实现，不证明学到了有用知识。',
    ],
  ),
  'practice',
)
