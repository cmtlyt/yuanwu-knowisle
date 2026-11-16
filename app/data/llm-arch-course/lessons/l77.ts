import { L, withKind } from '../../course-builders.ts'

export const L77 = withKind(
  L(
    'L77',
    35,
    '给定算力预算规划 N/D 实操',
    3,
    ['L75', 'L76'],
    ['compute-budget'],
    ['写出 FLOPs≈6ND 估算脚本', '建 Chinchilla 边界表', '叠加过训练系数', '产出给定预算的 N/D 规划'],
    `### 从理论到预算：把 scaling law 变成可执行规划

L75 给出 Chinchilla 的 A 级结论：训练算力 C≈6ND，固定算力下 N 与 D 等比扩展，最优点约 20 token/参数。L76 说明过训练是为推理成本主动偏离这个最优点（B 级数字，不担关键结论）。这一课把两者合成一件实用的事：**给定一笔算力预算，算出该建多大的模型、训多少 token**。这是预训练立项时第一个要拍板的决定，也是后面 L78（125M 冒烟）、L82（700M 实战）的预算依据。

整课围绕一个可跑的规划器展开：① 用 6ND 估算训练算力；② 用 Chinchilla 边界反解 N/D；③ 叠加过训练系数；④ 产出给定预算的规划表，并用断言做数字自检。所有代码都能离线运行，不依赖 GPU。

### 第一步：FLOPs≈6ND 估算脚本

先把估算式写对。训练一个模型的总浮点运算约 C≈6ND，其中 N 是参数量、D 是训练 token 数分解：前向约 2ND（每参数每 token 一次乘加记 2 FLOPs），反向约 4ND（算输入梯度与权重梯度，约两倍前向）。写成函数并校验几个已知模型量级。

\`\`\`python
def train_flops(N_params, D_tokens):
    """训练算力量级估算：C≈6ND（前向2ND+反向4ND）。"""
    return 6 * N_params * D_tokens

# 复核几个量级（参数为示意）
cases = [
    ("125M @ 2.5B token", 125e6, 2.5e9),   # L78 冒烟规模，D/N=20
    ("700M @ 14B token",  700e6, 14e9),    # L82 capstone 规模，D/N=20
    ("7B @ 140B token",   7e9,   140e9),   # 7B 计算最优，D/N=20
    ("70B @ 1.4T token",  70e9,  1.4e12),  # Chinchilla 对照，D/N=20
]
for name, N, D in cases:
    C = train_flops(N, D)
    print(f"{name:22s} C≈{C:.2e} FLOPs  (D/N={D/N:.0f})")

# 自检：D/N=20 时，C 应等于 120*N^2
N = 7e9
assert abs(train_flops(N, 20*N) - 120*N*N) / (120*N*N) < 1e-9
print("6ND 估算自检通过")
\`\`\`

注意 L78 的 125M 配 2.5B token、L82 的 700M 配 14B token，都是按 D/N=20 的 Chinchilla 比例设的——这正是本课规划器要产出的数据。先心中有数：125M 的训练约 1.9e20 FLOPs，700M 约 5.9e21 FLOPs。

### 第二步：建 Chinchilla 边界表（反解 N/D）

给定算力 C 与目标 token/参数比 r（默认 20，A 级），由 6ND=C 与 D=rN 联立：

N = sqrt(C / (6r))，D = r · N

这就是计算最优边界：算力乘 4，N 与 D 各乘 2。把它做成一张边界表，横轴是算力预算，纵轴是对应的 N 与 D。

\`\`\`python
import math

def chinchilla_optimal(C, r=20):
    """给定算力 C 与 token/参数比 r，反解计算最优的 N 与 D。"""
    N = math.sqrt(C / (6 * r))
    D = r * N
    return N, D

print(f"{'预算C(FLOPs)':>14s} {'最优N':>10s} {'最优D':>12s} {'6ND/C':>7s}")
budgets = [1e18, 1e19, 1e20, 1e21, 1e22, 1e23, 1e24]
for C in budgets:
    N, D = chinchilla_optimal(C, r=20)
    ratio = 6*N*D/C
    print(f"{C:14.0e} {N/1e6:8.1f}M {D/1e9:10.1f}B {ratio:7.3f}")
    assert abs(ratio - 1.0) < 1e-6, "反解结果应满足 6ND≈C"
    assert abs(D/N - 20) < 1e-6, "应满足 D/N≈20"
print("Chinchilla 边界表自检通过")
\`\`\`

这张表是立项时的核心工具：拿到预算 C，直接查该建多大、训多少 token。两个断言把约束钉死——反解结果必须满足 6ND≈C（算力用满）与 D/N≈20（比例正确）。注意 sqrt 关系：预算从 1e22 涨到 1e24（100 倍），N 只从约 0.9B 涨到约 9B（10 倍），印证等比扩展。

:::deep

### 为什么反解里是开方而不是乘法

一个常见错误是把 N 与 C 当线性关系。记住 C=6ND 是**乘积约束**：固定 r=D/N 时，C=6r·N²，所以 N=sqrt(C/(6r))。算力涨 100 倍，参数只涨 10 倍，token 也只涨 10 倍——因为两者同时涨，乘积才涨 100 倍。这正是 L75「算力×4、N 与 D 各×2」的代数形式。把它记成「预算的平方根决定规模」，规划时就不会把算力当参数线性外推。

:::

### 第三步：叠加过训练系数

L76 讲过：推理成本敏感时，把 token/参数比 r 从 20 上调（过训练）。在规划器里，这只是一行参数改动——把 r 换成更大的值（如 100 或 290）。但必须标注：**过训练系数是 B 级经验估算，不担关键结论**，具体值随模型与场景变动，要按推理量和能力验证。下面对比不同 r 下，同一算力的 N/D 怎么变。

\`\`\`python
C = 1e23   # 固定预算
print(f"{'r(token/参数)':>14s} {'N':>10s} {'D':>12s} {'D/N实测':>9s} {'等级':>6s}")
for r, grade in [(20, "A级"), (50, "B级"), (100, "B级"), (290, "B级复算")]:
    N, D = chinchilla_optimal(C, r=r)
    print(f"{r:14d} {N/1e9:8.2f}B {D/1e12:10.2f}T {D/N:9.0f} {grade:>8s}")
    assert abs(D/N - r) < 1e-6
# 结论：r 越大（过训练），同算力下模型越小、token 越多 —— 用推理省下的成本换训练多花的成本
print("过训练系数叠加完成（B 级值仅作场景演示，不担关键结论）")
\`\`\`

读法：预算固定 1e23，r=20 时是约 29B 参数配 0.57T token；r=290 时变成约 7.6B 参数配 2.2T token。同样的钱，选 r=290 得到一个小得多的模型——推理更便宜，但训练 token 多得多，是否划算取决于调用量（L76 的账）。再次强调 r=100/290 是 B 级，脚本只演示结构。

### 第四步：产出给定预算的 N/D 规划（完整交付）

把前三步合成一个完整规划器：输入算力预算 C、目标 token/参数比 r、GPU 峰值算力与利用率，输出模型配置（N、D、层数、隐藏维等粗略换算）与训练步数估算，并做全套数字自检。利用率（MFU，模型算力利用率）很关键——峰值算力打折扣后才是有效算力，这是 L75 提醒「6ND 是量级估算」的落地。

\`\`\`python
def plan_training(C_budget, r=20, peak_flops=3e14, mfu=0.4,
                  seq_len=2048, batch_tokens=2**20):
    """给定算力预算，产出 N/D 规划与训练步数。peak_flops/mfu 为示意。"""
    C_eff = C_budget * mfu                       # 有效算力（打 MFU 折扣）
    N, D = chinchilla_optimal(C_eff, r)          # 用有效算力反解
    total_tokens = D
    steps = total_tokens / batch_tokens          # 训练步数
    # 粗略结构换算：隐藏维隐藏层按 N≈12*L*d^2 估算（transformer 经验）
    L = 24
    d = math.sqrt(N / (12 * L))
    return dict(N=N, D=D, steps=steps, d_hidden=d, layers=L, C_eff=C_eff)

plan = plan_training(C_budget=1e20, r=20)
for k, v in plan.items():
    print(f"{k:9s} = {v:.4g}")
# 断言：规划满足约束
assert abs(6*plan["N"]*plan["D"] - plan["C_eff"]) / plan["C_eff"] < 1e-6
assert plan["steps"] > 0 and plan["d_hidden"] > 0
print("N/D 规划全套自检通过")
\`\`\`

这段是 L78/L82 的直接前置：L78 的 125M 单卡冒烟、L82 的 700M 多卡训练，都用这个规划器先算出「目标参数、token 预算、训练步数」，再落到配置。MFU 打 0.4 折扣是常见经验（大模型训练很难吃满峰值），把它计入才不会把预算估得太乐观。

### 工程判据与常见翻车点

把算力规划落成判断清单。第一，**区分峰值与有效算力**：规划用 C·MFU，不是硬件标称峰值；MFU 通常 0.3 到 0.5，随模型与并行效率变动。第二，**r 选值要分级**：默认 20（A 级）是训练最优起点；上调做过训练须标注 B 级、按场景验证。第三，**断言守恒**：任何规划都要校验 6ND≈C_eff 与 D/N≈r，防止反解写错。第四，**留余量**：真实训练会有重启、数据问题、loss 不降等返工，预算要留 10% 到 20% 余量。

一个高频误区是把 6ND 当精确财务数字，据此把预算算到小数点后。它只是量级估算，用于横向比较与立项,不是精确成本模型——注意力项、激活重计算、通信开销都会让实际偏离。另一个误区是把过训练的 r 当固定常数传播：L76 的 290、215 是第三方复算的 B 级值，引用时必须标注「随时间变动、不担关键结论」。

### 算力预算之外：显存与并行也要留一下

6ND 算的是「算力」，但能不能真把模型训起来，还卡在「显存」上。规划时至少要把三项显存粗算一遍，否则规划出的 N 在单卡上根本放不下：模型权重约 2N 字节（FP16/BF16，每参数 2 字节），梯度约 2N 字节，优化器状态（AdamW 的动量与方差）约 8N 字节，合计约 12N 字节——这就是 ZeRO 论文里常说的「基线显存账」。以 700M 参数为例，12N≈8.4GB 仅权重梯度优化器，加上激活值后单卡 24GB 会很紧，这正是 L80、L82 要用多卡 ZeRO 把这份账切到多卡上的原因。

把显存账写成可跑校验，能提前发现「规划了但放不下」的问题：

\`\`\`python
def min_mem_gb(N_params, bytes_per_param=12, act_gb=2.0):
    """基线显存：权重2N+梯度2N+优化器8N≈12N 字节，另加激活。"""
    state = bytes_per_param * N_params / 1e9
    return state + act_gb

for name, N in [("125M", 125e6), ("700M", 700e6), ("7B", 7e9)]:
    mem = min_mem_gb(N)
    print(f"{name:6s} 基线显存≈{mem:6.2f} GB, 单卡24GB可放下={mem < 24}")
# 125M 单卡可放下 -> L78；700M 单卡紧张 -> L80/L82 上 ZeRO 多卡
assert min_mem_gb(125e6) < 24
\`\`\`

这张显存校验把「算力规划」与「并行策略」接通：算力告诉你训多少、多久，显存告诉你要几张卡、用不用 ZeRO。一个模型若在算力上最优但在显存上放不下，规划就得让位于工程约束。L77 的产出是「目标参数 N 与 token D」，至于「用几卡、怎么切」留给 L80 的 TP/PP/ZeRO 对照与 L82 的多卡 capstone。把这两层分清——**算力定规模、显存定并行**——预训练立项的账才算算全。

:::tip

### 一句话收束算力预算规划

规划器三步走：① C≈6ND（前向 2ND+反向 4ND，量级估算）；② Chinchilla 边界反解 N=sqrt(C/(6r))、D=rN，r≈20 是 A 级起点；③ 过训练把 r 上调（100 到 300，B 级、不担关键结论），同算力换更小模型。反解是开方不是乘法——预算×100，规模只×10。规划用有效算力 C·MFU（MFU 常 0.3 到 0.5），并用断言校验 6ND≈C_eff、D/N≈r。这套规划器直接产出 L78（125M）与 L82（700M）的目标参数、token 预算与训练步数。

:::
`,
    null,
    [
      {
        text: '训练算力估算式 FLOPs≈6ND 里的「6」怎么来的？',
        options: [
          '注意力层数固定为 6',
          '前向约 2ND、反向约 4ND，合计约 6ND（数量级估算）',
          '词表大小 6 万',
          'batch size 6',
        ],
        answer: 1,
        explain:
          '每个 token、每个参数前向约 2 FLOPs（乘加）、反向约 4 FLOPs，合计约 6；6ND 是量级估算，用于规划不是精确记账。',
        concept: 'compute-budget',
      },
      {
        text: '给定训练算力 C，Chinchilla 最优（A 级）下参数 N 与 token D 应取？',
        options: [
          'N 尽量大、D 固定',
          'N≈sqrt(C/(6·r))、D≈r·N，其中 r≈20 token/参数',
          'D 尽量大、N 固定',
          'N 与 D 都等于 C',
        ],
        answer: 1,
        explain:
          '由 6ND=C 与 D=rN 联立得 N=sqrt(C/(6r))、D=rN；r≈20 来自 Chinchilla（A 级）。这就是计算最优边界。',
        concept: 'compute-budget',
      },
      {
        text: '叠加过训练系数时，正确的说法是？',
        options: [
          '把 r 从 20 往上调（如 100 到 300），但这是 B 级经验、需按场景验证',
          '把 r 固定为 20 永不改变',
          '过训练系数只影响推理不影响训练预算',
          'r 越小越好',
        ],
        answer: 0,
        explain:
          '过训练把 token/参数比 r 从 Chinchilla 的约 20 上调（B 级经验，如 100 到 300），需按推理量与能力验证；具体值是第三方估算，不担关键结论。',
        concept: 'compute-budget',
      },
      {
        text: '给定 1e23 FLOPs 预算、r=20，最优点参数量约是多少？',
        options: ['约 0.9B 参数', '约 2.9B 参数', '约 29B 参数', '约 175B 参数'],
        answer: 2,
        explain:
          'N=sqrt(C/(6r))=sqrt(1e23/120)=sqrt(8.3e20)≈2.9e10≈29B 参数，配 D=20N≈0.57T token；预算×100 时规模只×10（开方关系）。',
        concept: 'compute-budget',
      },
    ],
    [
      ['FLOPs≈6ND', '训练算力估算：N 参数、D token，前向后向合计约每参数每 token 6 次浮点运算'],
      ['计算最优边界', '给定算力 C 下使损失最小的 N/D 组合，Chinchilla 给出约 20 token/参数'],
      ['过训练系数 r', 'token/参数比，过训练时从 20 上调到更高（B 级经验值）'],
      ['预算换算', '由 C 与 r 反解可承受的 N 与 D 的过程'],
      ['数字自检', '用断言校验 N/D 规划满足 6ND≈C 与 D/N≈r 的可跑验证'],
    ],
    [
      '把 6ND 当精确成本——它是量级估算，注意力与词表投影有出入，用于规划而非精确记账。',
      '反解 N 时忘记开方——N=sqrt(C/(6r))，算力乘 4 参数只乘 2，别把 N 与 C 当线性关系。',
      '把过训练系数 r 的取值当 A 级常数——100 到 300 是 B 级经验估算，需按场景验证、不担关键结论。',
      '忽略 GPU 利用率与内存墙——理论 FLOPs 预算还要打折扣（MFU），别把峰值算力当有效算力。',
    ],
  ),
  'practice',
)
