import { L, withKind } from '../../course-builders.ts'

export const L62 = withKind(
  L(
    'L62',
    29,
    'DeepSeek 谱系：67B→V2→V3→R1',
    3,
    ['L27'],
    ['ds-lineage'],
    [
      '梳理 67B→V2(MLA)→V3(MTP+无辅助均衡)→R1(RL 推理)',
      '说明开放权重与许可证',
      '解释每代架构创新主线',
      '说明 DeepSeekMoE 的位置',
    ],
    `### 为什么从谱系看 DeepSeek

M7 专讲 DeepSeek，但先把四代放在一条时间轴上，才看得清每代到底改了什么。从 67B 密集模型，到 V2 的 MLA，到 V3 的 MTP 与无辅助损失均衡，再到 R1 的强化学习推理，每一步都不是「把模型做大」这一件事，而是换掉某一个具体瓶颈：67B 解决「有没有强基座」，V2 解决「KV 缓存与 MoE 效率」，V3 解决「训练信号密度与负载均衡」，R1 解决「推理能力从哪来」。本课的来源按 spec 标 A 级，数字以 deepseek-ai 各仓库与论文为准。

### 67B：密集基座的起点

DeepSeek 67B 是这一谱系的密集基座，全部参数每一步都参与计算。它的价值在于把预训练、数据清洗、尺度规律这些底座跑通，为后面所有 MoE 变体提供可靠的初始化与对照。密集模型的代价也很直白：参数量与计算量同步增长，67B 的每一层都要为所有 token 做完整的注意力与前馈计算。KV 缓存随头数与序列长度线性膨胀（这正是 M2 从 MHA 到 GQA 一直在拆的问题），而 FFN 全激活让训练与推理成本都压在稠密矩阵乘上。V2 的两项核心创新——MLA 与 DeepSeekMoE——正好一个打 KV、一个打 FFN。

### V2：MLA 与细粒度专家

DeepSeek-V2（arXiv:2405.04434）把 67B 的两个短板各换掉一块。注意力侧用 MLA 把 K、V 联合压缩到低秩潜向量 c_KV，官方报告把 KV 缓存降低 93.3%、最大生成吞吐提升到 5.76 倍——这是 A 级数字，后面 L63 会完整推导它。前馈侧用 DeepSeekMoE：把专家切得更细、再隔离出共享专家，让每个 token 只激活一小部分参数。V2 的总参数是 236B、每 token 激活 21B，激活比例约 9%。MLA 在 V2 首次落地，DeepSeekMoE 也在这里成型，两者一起构成后续 V3/R1 的结构底座。

:::deep

### V3：训练信号与工程的双重升级

DeepSeek-V3（arXiv:2412.19437）把规模推到 671B 总参数、37B 每 token 激活，激活比例进一步降到约 5.5%。它在 V2 的结构上叠了三件新事。第一是 MTP（多 token 预测）：让每个位置不只预测下一个 token，而是额外预测若干未来 token，训练信号更密，推理时还能当推测解码的草稿头——L66 展开。第二是无辅助损失负载均衡：不再靠辅助损失去压专家负载，而是给每个专家一个可调偏置，路由时加偏置、算输出权重时不加，兼顾均衡与质量——L65 展开。第三是 FP8 混合精度与 DualPipe 等系统工程，在 2048 张 H800 上把 14.8T token 训完，训练成本约 557.6 万 H800 GPU 小时（A 级，论文口径）。这三样分别对应「学得更密」「路由更稳」「跑得更省」，是 V3 与 V2 真正的分界。

:::

### R1：把推理交给强化学习

DeepSeek-R1（arXiv:2501.12948，Nature 收录）在 V3 基座上解决一个不同性质的问题：推理能力从哪来。R1-Zero 直接在基座上做纯 RL，用规则奖励对可验证任务（数学、代码）判分，不做冷启动 SFT、不标注推理轨迹，结果模型自发涌现出更长的思考链、自我反思与验证行为——所谓 aha moment。完整版 R1 加入冷启动数据与多阶段 RL 稳住可读性，再把推理能力蒸馏到 1.5B 至 70B 的小模型。R1 的论文报告在 AIME 2024、MATH-500 等基准上接近当时的一线闭源推理模型（A 级，论文口径）。这一步把「推理是一种可被激励涌现的能力」写成了可复现的配方，也与 M10 的 GRPO（L99）训练方法直接相通。

### 开放权重与许可证

DeepSeek 系列在 Hugging Face 以 deepseek-ai/* 组织开放模型权重，包含 V2、V3、R1 及其蒸馏版。V3 与 R1 等采用 MIT 许可证，允许商用、修改与再分发；具体条款以各仓库的 LICENSE 文件为准，引用时不要凭印象写死。开放权重意味着可以本地部署、微调与二次开发，这也是 M7 后面几课能「对着实现讲机制」的前提：你能拿到配置、看到结构、复现数字，而不是只能隔着 API 猜。需要区分的是「开放权重」与「开源训练代码/数据集」——前者是通行做法，后两者范围更窄，论文与仓库分别说明。

### 一条可跑的谱系自检

把四代的关键数字写成脚本，用一个对照表钉住「谁是谁」：总参数、激活参数、激活比例、核心创新。这段代码只做算术与打印，不依赖深度学习框架，作用是防止把 236B/21B 与 671B/37B 记混。

\`\`\`python
LINEAGE = [
    # (代号, 总参数B, 激活参数B, 核心创新)
    ("DeepSeek 67B", 67.0, 67.0, "dense 基座"),
    ("DeepSeek-V2", 236.0, 21.0, "MLA + DeepSeekMoE"),
    ("DeepSeek-V3", 671.0, 37.0, "MTP + aux-loss-free + FP8"),
    ("DeepSeek-R1", 671.0, 37.0, "纯 RL 推理 + 蒸馏"),
]
print(f"{'代号':16s}{'总B':>7s}{'激活B':>7s}{'激活比例':>9s}  核心创新")
for name, total, active, feat in LINEAGE:
    ratio = active / total
    print(f"{name:16s}{total:7.0f}{active:7.0f}{ratio:9.1%}  {feat}")
assert LINEAGE[1][1] == 21 and LINEAGE[2][1] == 37, "V2=21B, V3=37B"
assert abs(LINEAGE[2][2] / LINEAGE[2][1] - 37/671) < 1e-9
\`\`\`

再看激活比例的工程含义：MoE 让「总参数」与「每 token 计算量」解耦。用激活比例可以估算相对密集模型的训练算力节省量级。

\`\`\`python
def active_flops_ratio(total_b, active_b):
    """MoE 相对同总参密集模型的每 token 前馈算力比例（只计 FFN 主项）。"""
    return active_b / total_b

r_v2 = active_flops_ratio(236, 21)
r_v3 = active_flops_ratio(671, 37)
print(f"V2 激活比例 {r_v2:.1%}，V3 激活比例 {r_v3:.1%}")
print(f"V3 相对同规模密集模型，前馈算力约省 {1-r_v3:.1%}")
assert r_v3 < r_v2 < 1.0, "MoE 激活比例应远小于 1，且 V3 更稀疏"
print("谱系自检通过：四代数字与激活比例一致")
\`\`\`

:::tip

### 记忆主线：一代换一个瓶颈

把谱系压成一句话：**67B 打基座 → V2 打 KV 与 FFN（MLA + DeepSeekMoE）→ V3 打训练信号与工程（MTP + 无辅助损失 + FP8/DualPipe）→ R1 打推理来源（纯 RL + 蒸馏）**。四代共享同一套结构底座（MLA 注意力 + DeepSeekMoE 前馈），差别在于往上叠了什么。后面 L63 讲 MLA、L64 讲解耦 RoPE、L65 讲 DeepSeekMoE、L66 讲 MTP、L67/L70 讲并行与 FP8、L69 讲 R1，都是在把这条主线上的某一颗螺丝拧到细节。记住「谁改了哪一块」，就不会把 671B、93.3%、5.76 倍这些数字安错代。

:::
`,
    null,
    [
      {
        text: 'DeepSeek-V2 相对 67B 最核心的架构创新是？',
        options: [
          '把 FFN 换成密集层',
          'MLA 低秩压缩 KV 与 DeepSeekMoE 细粒度专家',
          '把 RoPE 换成绝对位置编码',
          '用 8bit 权重',
        ],
        answer: 1,
        explain:
          'V2（arXiv:2405.04434）引入 MLA，把 KV 缓存降 93.3%、最大生成吞吐 5.76 倍，同时用 DeepSeekMoE 细粒度专家。',
        concept: 'ds-lineage',
      },
      {
        text: 'DeepSeek-V3 的总参数量与每 token 激活参数量是？',
        options: ['7B / 7B', '236B / 21B', '671B / 37B', '67B / 67B'],
        answer: 2,
        explain:
          'V3 是 671B 总参数、37B 每 token 激活的 MoE，训练用了 MTP、无辅助损失均衡与 FP8。236B/21B 是 V2。',
        concept: 'ds-lineage',
      },
      {
        text: 'DeepSeek-R1 的推理能力主要靠什么获得？',
        options: [
          '纯监督微调堆数据',
          '强化学习激励，规则奖励可验证任务，并涌现反思',
          '增大上下文窗口',
          '降低温度',
        ],
        answer: 1,
        explain:
          'R1（arXiv:2501.12948，Nature 收录）用纯 RL 与规则奖励激励推理，涌现自我反思与验证，再蒸馏给小模型。',
        concept: 'ds-lineage',
      },
      {
        text: '关于 DeepSeek 系列开放权重与许可证，最准确的说法是？',
        options: [
          '全部闭源只给 API',
          '权重开放，V3/R1 等采用 MIT 等宽松许可证，具体以官方仓库 LICENSE 为准',
          '只开放训练代码不开放权重',
          '许可证禁止商用',
        ],
        answer: 1,
        explain:
          'DeepSeek 在 Hugging Face 开放模型权重，V3/R1 等采用 MIT 许可证允许商用与再分发；具体条款以 deepseek-ai 各仓库 LICENSE 为准。',
        concept: 'ds-lineage',
      },
    ],
    [
      ['MLA', 'Multi-head Latent Attention，把 K/V 联合压缩到低秩潜向量 c_KV，V2 起使用，减 KV 93.3%'],
      ['DeepSeekMoE', '细粒度专家细分加共享专家隔离的 MoE 结构，V2 引入、V3 沿用'],
      ['MTP', 'Multi-Token Prediction，多 token 预测，V3 训练目标，推理时用于推测解码'],
      ['aux-loss-free', '无辅助损失负载均衡，用专家偏置调整路由而不加辅助损失'],
      ['开放权重', '模型权重公开可下载，V3/R1 采用 MIT 等宽松许可证'],
    ],
    [
      '把 V2 的 236B/21B 与 V3 的 671B/37B 记混。',
      '以为 R1 靠 SFT 标注推理轨迹——R1-Zero 是纯 RL、无需人工轨迹。',
      '把 MLA 说成 GQA 或 MQA 的变体——它是低秩潜空间压缩，机制不同。',
      '说 DeepSeek 完全闭源——权重开放，但许可证条款按仓库为准。',
    ],
  ),
  'theory',
)
