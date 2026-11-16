import { L, withKind } from '../../course-builders.ts'

export const L98 = withKind(
  L(
    'L98',
    43,
    'DPO：免显式 RM 的偏好对监督损失',
    3,
    ['L96'],
    ['dpo'],
    [
      '推导 DPO 从 RLHF 目标到偏好对损失',
      '解释免显式 RM、免在线 PPO',
      '说明为何成开源默认',
      '对照 RLHF 的不稳定性',
    ],
    `### 从 RLHF 目标出发

L96 的 RLHF 目标写成：maximize E[r(x,y)] − β·KL(π_θ ‖ π_ref)。DPO（arXiv:2305.18290）的起点是一个统计力学事实：这个带 KL 约束的最优策略有闭式解。对固定 prompt x，最优策略满足：

π*(y|x) = (1/Z(x)) · π_ref(y|x) · exp(r(x,y)/β)

其中 Z(x) 是难以计算的配分函数。传统 RLHF 绕开 Z 的办法是训一个显式 RM 再用 PPO 采样优化；DPO 的做法是**把上式反解出奖励**，代进偏好概率里，让 Z 自然抵消。这一步是整个方法的杠杆点。

:::deep

### 推导：从闭式解到偏好对损失

把最优策略解反解，得到奖励与策略比的对数关系：

r(x,y) = β·log(π*(y|x)/π_ref(y|x)) + β·log Z(x)

代入 Bradley-Terry 偏好概率 P(y_w > y_l) = σ(r(x,y_w) − r(x,y_l))。两个奖励相减时，**β·log Z(x) 这一项因为对 y_w 和 y_l 相同而抵消**——这正是「不用算 Z」的数学原因：

P(y_w > y_l) = σ( β·log(π*(y_w|x)/π_ref(y_w|x)) − β·log(π*(y_l|x)/π_ref(y_l|x)) )

现在把最优策略 π* 换成待训练的策略 π_θ，并对偏好对取负对数似然，就得到 DPO 损失：

L_DPO = −E_{(x,y_w,y_l)} [ log σ( β·log(π_θ(y_w|x)/π_ref(y_w|x)) − β·log(π_θ(y_l|x)/π_ref(y_l|x)) ) ]

括号里那一项 β·log(π_θ/π_ref) 被称为**隐式奖励**——它替代了显式 RM，而且不需要训练。损失的形式就是一个二分类交叉熵：让 chosen 的隐式奖励高于 rejected。

:::

### 免显式 RM、免在线 PPO

从损失形式能直接看出 DPO 的两个「免」：

**免显式 RM**——奖励由策略与参考模型的 log 概率比表达，不需要单独训一个打分器，也就没有 RM 过拟合、分布外给虚高分的问题来源。

**免在线 PPO**——损失只依赖给定的偏好对数据 \`(prompt, chosen, rejected)\`，是**离线**的：一次前向拿到四个 logprob（π_θ 与 π_ref 各对 chosen/rejected），就能算 loss、反传。没有在线 rollout、没有策略采样、没有 PPO 的裁剪与价值网络。训练流程退化成和 SFT 一样稳的监督式循环。

从显存账看，DPO 训练时只需在显存里同时放 π_θ 与冻结的 π_ref 各一份，而 PPO 阶段还要额外驻留 critic 与在线采样缓存。对一张 24GB 卡，这意味着 DPO 能把省下的显存让给更大的 batch 或更长的偏好对序列，这也是它在开源社区「单卡可跑」口碑的来源。代价是每次前向要算两遍 logprob，计算量约为 SFT 的两倍，但换来了训练曲线的可预测性。

**可跑代码：DPO 损失与隐式奖励**

\`\`\`python
import math

def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x)) if x >= 0 else math.exp(x) / (1.0 + math.exp(x))

def dpo_loss(pi_w_logp, pi_l_logp, ref_w_logp, ref_l_logp, beta=0.1):
    # 隐式奖励 = β·log(π_θ/π_ref)；损失 = -log σ(隐式奖励_w - 隐式奖励_l)
    r_w = beta * (pi_w_logp - ref_w_logp)
    r_l = beta * (pi_l_logp - ref_l_logp)
    diff = r_w - r_l
    return -math.log(sigmoid(diff)), diff

steps = [
    (-1.0, -2.0, -1.2, -1.1),   # 初始：chosen 与 rejected 相对概率差很小
    (-0.9, -2.3, -1.2, -1.1),   # 中期：chosen ↑、rejected ↓
    (-0.7, -2.8, -1.2, -1.1),   # 后期：差进一步拉开
]
for i, (pw, pl, rw, rl) in enumerate(steps):
    loss, diff = dpo_loss(pw, pl, rw, rl)
    print(f"step{i}: 隐式奖励差={diff:.3f}  DPO损失={loss:.4f}")
assert dpo_loss(-0.7, -2.8, -1.2, -1.1)[0] < dpo_loss(-1.0, -2.0, -1.2, -1.1)[0], "训练应让损失下降"
\`\`\`

loss 从约 0.64 降到约 0.59，对应隐式奖励差从 0.11 拉到 0.22——模型学会把概率质量从 rejected 挪到 chosen。注意参考模型的 logprob 是**冻结**的（不参与反传），只有 π_θ 被更新。

**配分函数抵消的数值印证**

下面这段独立验证「整体奖励平移不改变偏好概率」，这就是 DPO 免算 Z 的关键。

\`\`\`python
import math

def pref_prob(rw, rl, beta=0.1):
    return 1.0 / (1.0 + math.exp(-(rw - rl) / beta))

rw, rl = 1.3, 0.7
base = pref_prob(rw, rl)
shifted = pref_prob(rw - 2.5, rl - 2.5)   # 同时平移 = 换成含 log Z 的奖励
print(f"原偏好概率={base:.4f}  平移后={shifted:.4f}")
assert abs(base - shifted) < 1e-12, "整体奖励平移不应改变偏好概率（Z 被抵消）"
\`\`\`

两个概率完全相同，印证了「偏好只取决于奖励之差，与绝对基线（配分函数）无关」。DPO 正是靠这一点把不可算的 Z 从损失里彻底移除。

### 为何成开源默认，以及它不稳定的边界

DPO 成为开源社区默认偏好对齐方法，原因很工程化：**只需一对偏好数据 + 一个参考模型，训练脚本和 SFT 差不多**，显存里少一个 RM、少一套在线采样，单卡就能跑；相比 PPO 的超参（KL 系数、裁剪、奖励归一化、价值网络）一大堆，DPO 只有 β 一个核心旋钮。L101 的 trl \`DPOTrainer\` 就是把这个损失封装成几行调用。

另外要注意 β 与学习率的耦合：DPO 的损失曲面在 β 较大时更平缓、更新更保守，配合较大学习率才收敛；β 较小时损失对 logprob 差极敏感，学习率必须调小，否则几个 step 就把 chosen 的概率推到 1、rejected 压到 0，看似 loss 归零实则严重过拟合偏好集。工程上常先固定 β=0.1 跑通，再按「通用基准是否掉点」微调 β 与早停步数。

但「稳」是相对的：DPO 对**偏好数据质量极敏感**——chosen 未必真的更好、标注噪声、长度偏置都会被直接学进去；而且它是离线的，训练时看到的 rejected 分布和模型自己会犯的错误可能不匹配（distribution mismatch），导致泛化不如在线方法。下一课 L99 的 GRPO 保留在线采样但去掉 critic，L102 的 IPO/KTO 则从正则与数据形态两端修补 DPO 的过拟合与标签成本问题。

:::tip

### 一句话记住 DPO

DPO = 把 RLHF 的最优策略闭式解代入 Bradley-Terry，让 **Z(x) 抵消**，得到只依赖 \`log(π_θ/π_ref)\` 差的二分类损失。它**免显式 RM、免在线 PPO**，训练像 SFT 一样简单，代价是对偏好数据与 β 敏感、离线分布不匹配。它是「把强化学习问题化简成监督学习问题」的典范，也是 M10 后续所有变体的共同起点。

:::
`,
    null,
    [
      {
        text: 'DPO（arXiv:2305.18290）损失函数直接优化的对象是？',
        options: [
          '显式奖励模型的 MSE 损失',
          '偏好对上 chosen 与 rejected 的相对对数概率差（隐式奖励）',
          'PPO 的策略梯度',
          '交叉熵 next-token 损失',
        ],
        answer: 1,
        explain:
          'DPO 把 RLHF 最优策略代回 Bradley-Terry，得到只依赖 π_θ 与 π_ref 在偏好对上 logprob 差的分类式损失，RM 被隐式表达。',
        concept: 'dpo',
      },
      {
        text: 'DPO 相比三阶段 RLHF 最大的工程简化是？',
        options: [
          '需要更大的模型',
          '免显式 RM 训练、免在线 rollout 与 PPO 采样',
          '完全不需要偏好数据',
          '不需要参考模型',
        ],
        answer: 1,
        explain:
          'DPO 是离线监督式损失：给定 (prompt, chosen, rejected) 直接算 loss，不训 RM、不在线采样、不做 PPO 更新，训练像 SFT 一样稳。',
        concept: 'dpo',
      },
      {
        text: 'DPO 损失里的 β 系数作用是？',
        options: [
          '控制学习率',
          '缩放隐式奖励差（等价 KL 约束强度），越大越惩罚偏离参考策略',
          '控制 batch size',
          '决定词表大小',
        ],
        answer: 1,
        explain:
          'β 乘在 log(π_θ/π_ref) 差上，对应 RLHF 里的 KL 系数：β 小则几乎不约束、易过拟合偏好，β 大则贴住参考策略。',
        concept: 'dpo',
      },
      {
        text: 'DPO 推导中配分函数 Z(x) 会消掉，原因是？',
        options: [
          'Z(x) 恒等于 1',
          '偏好概率只依赖两个奖励之差，整体平移（含 log Z）被抵消',
          'DPO 不用 Bradley-Terry',
          'Z(x) 被 β 吸收',
        ],
        answer: 1,
        explain:
          'P(c>r)=σ(r_c−r_r)，对两个奖励同时加同一个常数（配分函数的对数）不改变差值，因此无需估计 Z，RM 可用隐式奖励替代。',
        concept: 'dpo',
      },
    ],
    [
      ['DPO', 'Direct Preference Optimization，直接偏好优化，用偏好对上的监督损失替代显式 RM + 在线 PPO'],
      ['隐式奖励', 'β·log(π_θ(y|x)/π_ref(y|x))，由策略与参考策略的对数概率差表达，无需单独训 RM'],
      ['Bradley-Terry', '偏好概率模型 P(c>r)=σ(r_c−r_r)，DPO 推导的损失来源'],
      ['参考策略 π_ref', '通常是冻结的 SFT 模型，DPO 用 log(π_θ/π_ref) 约束漂移'],
      ['β 系数', 'DPO 中缩放隐式奖励差的超参，对应 RLHF 的 KL 约束强度'],
    ],
    [
      '以为 DPO 完全不需要参考模型——它必须用 π_ref 算 log 概率比，参考模型不能删。',
      '把 DPO 当 SFT 直接套交叉熵——它优化的是 chosen/rejected 的相对概率差，不是单条序列的似然。',
      'β 设得过小——隐式奖励被放大，模型为讨好偏好对而偏离参考分布、泛化变差。',
      '忽略 chosen 与 rejected 的长度差——长度偏置可能让模型学会「更长即更好」，需做长度归一化或清洗数据。',
    ],
  ),
  'theory',
)
