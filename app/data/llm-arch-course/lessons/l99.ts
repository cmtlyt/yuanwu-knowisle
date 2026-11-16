import { L, withKind } from '../../course-builders.ts'

export const L99 = withKind(
  L(
    'L99',
    44,
    'GRPO：去 critic 组内相对奖励',
    4,
    ['L98'],
    ['grpo'],
    [
      '讲清 GRPO 去 critic 的机制',
      '解释同 prompt 一组 rollout 的组内相对奖励',
      '说明 DeepSeekMath 7B MATH 51.7%',
      '对照 PPO',
    ],
    `### PPO 的 critic 贵在哪

L96 的 PPO 需要同时维护**策略模型**和**价值网络（critic）**：critic 学习状态价值 V(s)，用广义优势估计 GAE 算出「这个回答比预期好多少」。代价有三：① 价值网络通常与策略模型同量级，训练显存与算力近乎翻倍；② critic 的拟合误差会直接污染优势估计，价值函数没学好，策略更新就被带偏；③ 在 LLM 这种高维、稀疏奖励场景里，让 critic 准确预测「一段回答的价值」本身很难。能不能不要 critic，又能拿到可用的 baseline？GRPO（arXiv:2402.03300）给出的答案是：**用同一 prompt 下多个回答之间的相对比较，替代绝对价值估计**。

### GRPO：去 critic，拿组内统计当 baseline

GRPO 的做法：对每个 prompt，用当前策略采样一组 G 个回答（一组 rollout），用奖励函数给每个回答打分得到 {r_1, …, r_G}；然后把每个回答的优势定义为它相对**这组均值**的偏离程度，再除以组内标准差做归一化：

Â_i = (r_i − mean({r})) / std({r})

直觉很直接：既然无法知道「这篇回答的绝对价值是多少」，那就问「在这组回答里它排第几」。比同组平均好的（Â > 0）被强化，差的（Â < 0）被抑制。baseline 从「学出来的 V(s)」变成「这一组自己的均值」，**零额外参数**。GRPO 仍保留 PPO 的策略裁剪（重要性比裁剪）和对参考策略的 KL 约束，只是换掉优势来源。

需要注意组内比较隐含一个前提：同一 prompt 的多个回答必须在同一策略版本下采样，否则不同回答来自不同分布，均值基线就失去意义。实现上通常先冻结当前策略、一次性生成 G 条回答，再用这批样本做若干次 PPO 式小步更新，更新完成后才重新采样下一组。

**组内相对优势的数值算法**

\`\`\`python
import math

def group_relative_advantage(rewards):
    """GRPO 核心：组内奖励标准化成相对优势（mean≈0, std≈1）。"""
    g = len(rewards)
    mean = sum(rewards) / g
    var = sum((r - mean) ** 2 for r in rewards) / g
    std = math.sqrt(var) + 1e-8
    return [(r - mean) / std for r in rewards]

rewards = [1.0, 0.0, 0.0, 0.5, 0.0, 1.0]   # 同一 prompt 的 6 个 rollout 奖励
adv = group_relative_advantage(rewards)
print("组内奖励:", rewards)
print("相对优势:", [round(a, 3) for a in adv])
assert abs(sum(adv)) < 1e-6, "组内相对优势应近似零均值"
assert max(adv) > 0 > min(adv), "应同时存在正优势与负优势"
\`\`\`

组均值约 0.42：奖励 1.0 的两个回答拿到约 +1.22 的优势被强化，奖励 0.0 的几个拿到约 −0.87 被抑制，奖励 0.5 的接近 0 几乎不动。注意相对优势**零均值**这一性质——它意味着同一组内「被强化的量」与「被抑制的量」天然平衡，这正是它替代 critic baseline 后能稳定更新的原因。

:::deep

### 为什么组内均值能当 baseline：方差与偏见的权衡

优势估计的目标是「降低策略梯度的方差而不引入偏差」。PPO 用 V(s) 当 baseline 理论上方差最低，但 V(s) 是学出来的、有误差。GRPO 的组内均值来自**实际采样奖励**，是无偏的 baseline（不依赖任何拟合），代价是只用了局部 G 个样本、方差比完美 critic 略高。这个取舍在 LLM 上很划算：① 省掉一整份 critic 参数与训练成本；② 避开价值函数难训的老大难；③ 对于**可验证奖励**（数学答案对不对、代码测试过不过），奖励本身噪声极低，组内比较极其可靠。G 的选择是方差旋钮：G 太小（如 2）标准化噪声大，G 大（8 到 16 以上）估计更稳但采样成本线性上升。

:::

### DeepSeekMath 7B：MATH 51.7%

GRPO 论文（arXiv:2402.03300）最有说服力的实验：在 DeepSeekMath-Base 7B 上用 GRPO 做强化学习，在 MATH 基准上达到 **51.7%**（A 级数据）。这个数字的意义在于，它是在**7B** 这种相对小的规模上、靠**可验证奖励**（数学题标准答案）+ 去 critic 的 GRPO 拿到的——说明在线强化学习的收益不必依赖超大模型与复杂 critic，关键是「奖励可自动验证 + 组内相对比较足够稳」。MATH 51.7% 也成了后续数学推理 RL 工作的重要参照基线。

这个结果也解释了为什么 GRPO 常与可验证奖励强化学习绑定：数学与代码题有标准答案或测试用例，奖励零噪声，组内相对比较几乎不受标注误差干扰；换成开放式写作这类主观奖励，组内标准化放大的反而是奖励模型的噪声，GRPO 的优势就会被削弱。

### 对照 PPO：一张取舍清单

\`\`\`python
def advantage_source(n_rollouts, has_critic):
    if has_critic:
        return "PPO: 需价值网络 V(s)，额外约 1 份策略参数量，用 GAE 估优势"
    return f"GRPO: 用同 prompt {n_rollouts} 个 rollout 的奖励均值当 baseline，0 额外参数"

for has_critic in (True, False):
    print(advantage_source(8, has_critic))
assert "0 额外参数" in advantage_source(8, False), "GRPO 不应引入 critic 参数"
assert "价值网络" in advantage_source(8, True), "PPO 必须依赖 critic"
\`\`\`

- **参数与显存**：PPO = 策略 + critic 两份；GRPO = 只策略一份，省下的显存可换更大 batch 或更长上下文。
- **优势来源**：PPO 用学出来的 V(s) + GAE；GRPO 用组内实际奖励的均值/标准差。
- **适用场景**：PPO 通用但 critic 难训；GRPO 在**奖励可验证、可多样采样**的任务（数学、代码）上优势最大。
- **共同点**：两者都在线采样、都用 KL 约束拴住参考策略；GRPO 不是离线方法，别和 DPO（L98）混为一谈。

:::tip

### 一句话记住 GRPO

GRPO = **把 PPO 的 critic baseline 换成「同 prompt 一组 rollout 的奖励均值/标准差」**。去 critic 省显存、避价值函数误差；组内相对优势零均值、无偏；配可验证奖励在 7B 上达到 MATH 51.7%。代价是需多采样 G 条回答、组内全对或全错时无梯度信号。它是「用群体比较替代绝对估值」的典型思路，也是 M7 DeepSeek 系列推理 RL 的关键组件。

:::
`,
    null,
    [
      {
        text: 'GRPO（arXiv:2402.03300）相对 PPO 最核心的结构简化是？',
        options: [
          '去掉参考模型',
          '去掉 critic 价值网络，用同 prompt 一组 rollout 的组内相对奖励当 baseline',
          '去掉奖励信号',
          '去掉策略模型',
        ],
        answer: 1,
        explain:
          'PPO 用学习到的价值函数 V(s) 当 baseline 并用 GAE 估优势；GRPO 对同一 prompt 采样一组回答，用组内奖励均值/标准差归一化出相对优势，省掉 critic。',
        concept: 'grpo',
      },
      {
        text: 'GRPO 的「组内相对奖励」具体指？',
        options: [
          '所有 prompt 的奖励求平均',
          '同一 prompt 下 G 个 rollout，每个的优势 = (自身奖励 − 组均值)/组标准差',
          '只保留奖励最高的 rollout',
          '奖励除以模型参数量',
        ],
        answer: 1,
        explain:
          '对一组采样奖励 {r_i} 做标准化 Â_i=(r_i−mean)/std，正优势表示优于组内平均被强化，负优势被抑制，均值为零。',
        concept: 'grpo',
      },
      {
        text: 'DeepSeekMath 7B 用 GRPO 在 MATH 基准上达到的成绩是？',
        options: ['MATH 31.7%', 'MATH 51.7%', 'MATH 71.7%', 'MATH 91.7%'],
        answer: 1,
        explain:
          'GRPO 论文报告 DeepSeekMath-7B 经 GRPO 后 MATH 达 51.7%（A 级数据，arXiv:2402.03300），显示去 critic 的在线强化在数学推理上有效。',
        concept: 'grpo',
      },
      {
        text: 'GRPO 与 PPO 的关系，正确的是？',
        options: [
          'GRPO 是完全离线的监督方法',
          'GRPO 保留在线采样与 KL 约束，但省去 critic，优势来自组内比较',
          'PPO 不用任何 baseline',
          'GRPO 必须训显式 RM',
        ],
        answer: 1,
        explain:
          'GRPO 仍是在线 RL：对 prompt 组采样、用奖励模型或可验证奖励打分、加 KL 约束，只是把 PPO 的 critic baseline 换成组内相对统计。',
        concept: 'grpo',
      },
    ],
    [
      ['GRPO', 'Group Relative Policy Optimization，组内相对策略优化，去 critic 用组内奖励统计估优势'],
      ['critic / 价值网络', 'PPO 中学习 V(s) 作为优势 baseline 的额外网络，GRPO 将其移除'],
      ['组内相对优势', 'Â_i=(r_i−mean)/std，同 prompt 一组 rollout 奖励标准化后的优势估计'],
      ['rollout 组', '对同一 prompt 采样 G 条回答，构成组内比较的样本集合'],
      ['可验证奖励', '数学/代码等可用规则自动判对错的奖励来源，常与 GRPO 搭配'],
    ],
    [
      '以为 GRPO 是离线方法——它仍在线采样 rollout，只是不训 critic。',
      '组内样本太少（G=2）时标准差估计不稳，优势噪声大；G 通常取 8 到 16 以上。',
      '组内奖励全相同时标准差接近 0，优势趋近 0、该组无梯度信号，需过滤或处理。',
      '误以为去掉 critic 也去掉了 KL 约束——GRPO 仍对参考策略加 KL 防止漂移。',
    ],
  ),
  'theory',
)
