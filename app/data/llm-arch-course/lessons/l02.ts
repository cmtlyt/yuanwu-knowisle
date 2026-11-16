import { L, withKind } from '../../course-builders.ts'

export const L02 = withKind(
  L(
    'L02',
    0,
    '自回归范式：next-token 目标与三范式定位',
    2,
    ['L01'],
    ['autoreg-paradigm'],
    [
      '说清自回归 next-token 的数学形式 P(x_t | x_<t) 与交叉熵目标',
      '用教师强制解释「为什么训练时一次前向能并行算所有位置的 loss」',
      '在 encoder / encoder-decoder / decoder-only 三范式里给 LLM 定位',
      '讲清「为何当代生成式 LLM 几乎都选 decoder-only」的取舍逻辑',
    ],
    `
### next-token 的数学

把一段语料切成词元序列 x_1..x_T，自回归模型把联合概率分解成条件概率的连乘（链式法则）：

    P(x_1..x_T) = ∏ P(x_t | x_<t)

训练时对每一项取负对数、对位置取平均，就是 **next-token 交叉熵**：

    L = - (1/T) Σ_t log P(x_t | x_<t; θ)

关键点：**模型只预测「下一个 token」**，不预测整句。把整个序列喂进去，让模型在每一个位置都做一次「已知左边、预测右边」的预测，T 个位置各自贡献一项 loss。这就是「自回归」。

### 教师强制（teacher forcing）

训练时不拿模型自己的上一步输出去续写，而是拿**真实序列**作为每一步的输入条件。好处是并行：因果掩码（L01）保证第 t 位只看得到 0..t 的真实词元，于是 T 个位置的预测在**同一次前向**里同时算出、同时算 loss。推理时才回到「把上一步预测喂回去」的逐 token 自回归（M2 的 KV cache 就是为这一步服务的）。

:::deep

### 为何「只预测下一个」就能涌现能力

next-token 看似朴素，但为了把下一个词预测准，模型被迫学会句法、事实、甚至推理（推理链里下一步往往依赖前几步的中间结果）。GPT-3 的 few-shot、LLaMA 的通用能力都建立在这个单目标上。代价是它**天然单向**：只能从左往右生成，不能自由编辑中段——这正是 M5 扩散 LLM 想突破的短板。

:::

### 三范式定位

| 范式 | 代表 | 注意力方向 | 任务形态 | 生成目标 |
|---|---|---|---|---|
| encoder-only | BERT | 双向 | 判别/理解（分类、NER） | MLM |
| encoder-decoder | T5 | 生成侧单向 | 翻译、摘要（text→text） | seq2seq |
| decoder-only | GPT/LLaMA | 单向（因果） | 通用生成 | next-token |

当代生成式 LLM 几乎都选 decoder-only，逻辑是：**decoder-only 把「理解 + 生成 + 指令」统一进同一个 next-token 目标**，且训练/推理代码同一套、扩展性好、数据好组织；encoder/encoder-decoder 在通用生成上既不统一也不占优。BERT 的双向性对理解任务强，但做不出开放式生成。

\`\`\`python
# 概念：next-token 交叉熵（PyTorch 伪码）
import torch
import torch.nn.functional as F

def next_token_loss(logits, labels, mask=None):
    # logits: [B, T, V]，labels: [B, T]（右移一位的目标）
    B, T, V = logits.shape
    loss = F.cross_entropy(
        logits.reshape(-1, V),
        labels.reshape(-1),
        reduction='mean',
    )
    return loss
# 注意：训练时 labels 直接来自语料的右移一位（教师强制），
# 推理时才把上一步 argmax 喂回输入（见 L13 的 KV 复用）。

# 配套：把一段序列右移一位，得到「输入 / 目标」成对张量
def shift_pair(seq, pad=0):
    x = seq[:-1]              # 输入：第 0..T-2 个 token
    y = seq[1:]              # 目标：第 1..T-1 个 token（右移一位）
    return x, y
# 例：seq=[5,9,2,7,1] → x=[5,9,2,7] y=[9,2,7,1]，x 的每一位预测它的下一位
\`\`\`

对照 LLaMA 系（arXiv:2302.13971 / 2407.21783）：预训练目标就是 next-token 交叉熵，训练数据用 15T token，推理用解码器逐 token 采样。

### 为什么「同一个目标」能撑起理解与指令

一个常见的疑问：next-token 只是个「预测下一个词」的朴素目标，凭什么 LLM 还能做分类、抽取、推理？关键在**训练数据里混着各种文本**：有推理链（预测下一步要会中间步骤）、有问答（预测答案要理解问题）、有代码（预测下一行要懂上下文）。模型为了把「下一个 token」预测准，被迫**内化出支持这些能力的中间表示**。换句话说，能力不是「专门教」出来的，而是「预测得够准」的副产品——数据里有什么模式，模型就得学会什么模式才能预测准。这就是 GPT-3 的 in-context few-shot、LLaMA 的通用能力都长在 next-token 上的原因，也是「数据配比决定能力边界」这条 M8 主线的理论起点。

### 自回归目标隐含的一个「单向假设」

把联合概率分解成 P(x_1)·P(x_2|x_1)·…·P(x_T|x_{T-1})，这个连乘**假设了从左到右的因果顺序**。它对「按顺序生成」非常高效（训练一次前向并行、推理逐 token），但对「中间某处错了要回改」不友好——自回归模型生成时**不能回头**，第 t 个 token 生成后就固定了，后面只能继续往右。要改第 3 个词，只能把整段重新生成一遍。这个单向性不是缺陷，是范式选择；它换来的是训练/推理代码一致、scaling law 干净。但它也留下了「不可编辑」这个明确短板——**M5 扩散 LLM 用双向去噪、任意顺序生成来正面突破这一点**（L11 的架构谱系地图里专门标注了这条线）。

:::tip

### 一个常见误区：next-token ≠ 只能生成

「预测下一个 token」听起来像是只能用来生成文本，其实它是**通用的表示学习目标**：同一个 next-token 模型，配上不同的 prompt 前缀，就能做分类（让模型预测「正确/错误」标签词）、抽取（预测答案片段）、翻译（把源文当输入、预测译文）。区别只在「条件序列怎么组织」，目标本身不变。这正是 decoder-only 能「一套权重做多任务」的底层原因——任务靠 in-context 组织，不需要像 BERT 那样每接一个新任务加一个微调头。

:::

### 收束：把「选 next-token」当作一条可追溯的决策

把这一课压成一句：decoder-only LLM 选择 next-token，不是因为它是「最好的目标」，而是因为它**把理解、生成、指令统一进一个可并行训练、可扩展、数据易组织**的单目标，代价是单向不可编辑（留给 M5 去补）。认清这个取舍，后面 L13 讲 KV cache、M8 讲数据配比，都是从这一条决策长出来的。
`,
    null,
    [
      {
        text: '自回归 next-token 目标的核心是？',
        options: ['预测整句', '在已知左边时预测下一个 token', '预测最远位置', '预测双向上下文'],
        answer: 1,
        explain: 'next-token 只预测下一个词元，联合概率靠链式法则分解成条件概率连乘。',
        concept: 'autoreg-paradigm',
      },
      {
        text: '训练时为何一次前向就能算出所有位置的 loss？',
        options: ['模型够大', '因果掩码 + 教师强制让 T 个位置并行预测', '用了 dropout', '序列很短'],
        answer: 1,
        explain: '因果掩码保证每位只看左边，配教师强制用真实词元做条件，T 个位置的预测在单次前向同时算出。',
        concept: 'autoreg-paradigm',
      },
      {
        text: '当代生成式 LLM 几乎都选 decoder-only，主要理由是？',
        options: [
          '双向性更强',
          '理解+生成+指令统一进 next-token 目标、代码同一套、易扩展',
          '参数最少',
          '不需要位置编码',
        ],
        answer: 1,
        explain: 'decoder-only 把多种能力统一进单一目标且训练/推理代码一致，比 encoder/enc-dec 更通用。',
        concept: 'autoreg-paradigm',
      },
      {
        text: 'next-token 目标的固有代价（单向性）主要被哪类架构想突破？',
        options: ['MoE', '扩散 LLM', 'FlashAttention', 'GQA'],
        answer: 1,
        explain: '自回归只能从左往右生成、不能编辑中段；M5 扩散 LLM 用双向去噪突破这个局限。',
        concept: 'autoreg-paradigm',
      },
    ],
    [
      ['next-token', '在已知左边时预测下一个词元的自回归目标'],
      ['教师强制', '训练时用真实序列做条件而非模型自身输出，换取并行'],
      ['链式法则', '把联合概率分解成条件概率连乘的恒等式'],
      ['三范式', 'encoder-only / encoder-decoder / decoder-only 的注意力方向与任务形态对照'],
    ],
    [
      '把「理解任务」也硬塞进 decoder-only——双向理解任务 encoder 仍更强，只是生成统一性让 LLM 选了 decoder-only。',
      '混淆训练与推理：训练并行（教师强制）、推理才逐 token 自回归。',
      '以为 next-token 目标弱——它恰恰是涌现 few-shot/推理能力的底座。',
      '用整句预测替换 next-token 就「更准」——单 token 预测已是分解后的最细目标。',
    ],
  ),
  'theory',
)
