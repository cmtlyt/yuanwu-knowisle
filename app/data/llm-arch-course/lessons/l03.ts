import { L, withKind } from '../../course-builders.ts'

export const L03 = withKind(
  L(
    'L03',
    0,
    '手写 next-token 交叉熵损失 + 小语料冒烟',
    2,
    ['L02'],
    ['next-token-loss'],
    [
      '实现一个可跑的最小 next-token 训练循环（词表 → 张量 → logits → 交叉熵）',
      '跑通一个 20 句小语料的冒烟，看到 loss 从初值明显下降',
      '用 perplexity（困惑度 = exp(loss)）读 loss 曲线，判断「学到了多少」',
      '指出教师强制里「labels 右移一位」的 off-by-one 最容易写错的地方',
    ],
    `
### 目标：从 0 搭一个能「降 loss」的最小预训练

本课时不碰任何现成大模型，只用 NumPy/PyTorch 手写**数据张量化 + next-token 交叉熵 + 一个可训练的小模型**，跑通「喂数据 → 算 loss → 反向传播 → loss 下降」的最小闭环。目的是把 L02 的数学变成可运行的代码，并练出**读 loss/困惑度**的手感——这是后面 M8 预训练全模块的地基。

### 数据张量化：token 序列 → 二维整数矩阵

把每句话 tokenize 成整数 id，右移一位对齐「输入 → 目标」：

\`\`\`python
import numpy as np

def tokenize(texts, vocab):
    # 每句转成词元 id 列表（这里用字符级词表示意，真实用 BPE，见 L11）
    ids = []
    for t in texts:
        seq = [vocab[c] for c in t]
        ids.append(seq)
    return ids

def to_tensor(ids, pad_token, maxlen):
    X = np.full((len(ids), maxlen), pad_token, dtype=np.int64)      # 输入
    y = np.full((len(ids), maxlen), -1, dtype=np.int64)            # 目标
    for i, seq in enumerate(ids):
        s = seq[:maxlen - 1]
        X[i, :len(s)] = s
        y[i, :len(s)] = seq[len(s) : len(s) + len(s)]  # 右移一位
        y[i, len(s):] = -1                              # 尾部置无效
    return X, y  # 输入比目标整体左移一格——这就是「右移一位」
\`\`\`

**最容易写错**：目标必须是输入的「右移一位」。如果 X 的第 0 位对应目标第 1 位，那么 \`y[i] = seq[1:]\`、\`X[i] = seq[:-1]\`。一旦错位一格，模型学的是「预测两个 token 之后」而不是「下一个」，loss 会莫名偏高且降得慢——这是 next-token 训练第一大坑。

### 可训练的小模型 + 交叉熵

用一个「emb 向量 + 线性头」的最简结构（真实是 Transformer，这里先让 loss 能降），关键是**交叉熵要在 logits 上用、不要在 softmax 概率上用**：

\`\`\`python
import torch
import torch.nn as nn
import torch.nn.functional as F

class TinyLM(nn.Module):
    def __init__(self, vocab, d, ctx):
        super().__init__()
        self.emb = nn.Embedding(vocab, d)
        self.ctx = ctx
        self.head = nn.Linear(d, vocab)

    def forward(self, x):
        h = self.emb(x)                              # [B, T, d]
        h = torch.mean(h[:, :self.ctx], dim=1)       # 取前 ctx 位置平均（简化上下文）
        return self.head(h)                           # [B, V]

# next-token 交叉熵（在 logits 上，-1 的 mask 忽略）
def next_token_loss(logits, labels):
    B, V = logits.shape
    return F.cross_entropy(logits.reshape(-1, V), labels.reshape(-1), ignore_index=-1)

# 冒烟：20 句重复性很强的语料，loss 应从 ~log(V) 明显下降
torch.manual_seed(0)
sentences = ["the cat sat on the mat", "the dog sat on the log"] * 10
vocab = {c: i + 1 for i, c in enumerate(" abdfgilmnots".replace(" ", ""))}
vocab[" "] = 0
ids = tokenize(sentences, vocab)
X, y = to_tensor(ids, pad_token=0, maxlen=16)
Xt, yt = torch.tensor(X), torch.tensor(y)

model = TinyLM(len(vocab), d=16, ctx=8)
opt = torch.optim.Adam(model.parameters(), 1e-2)
for step in range(300):
    logits = model(Xt)
    loss = next_token_loss(logits, yt)
    opt.zero_grad()
    loss.backward()
    opt.step()
    if step % 50 == 0:
        print(step, round(loss.item(), 3), "ppl=", round(torch.exp(loss).item(), 2))
\`\`\`

### 验收断言（可执行）

- **初值**：训练前 loss ≈ \`ln(V)\`（均匀分布困惑度），本例 ~ln(13)≈2.56。
- **下降**：300 步后 loss 明显低于初值（本冒烟语料重复性强，通常降到 ~1.x）。
- **困惑度**：\`ppl = exp(loss)\` 随训练单调下降；若**不降反升**，优先查 labels 是否错位、学习率是否过大。
- **单步正确**：把 \`y[0]\` 手动设成 \`seq[1]\` 的第一个 token，检查模型是否倾向预测它（小模型弱，但方向要对）。

:::warn

### 三个高频坑

1. **labels 右移一位写错**：\`y[i] = seq[1:]\`、\`X[i] = seq[:-1]\`，两者长度差 1，错位会「学隔一个」。
2. **在 softmax 后算交叉熵**：要拿**未归一化的 logits** 进 \`F.cross_entropy\`（内部自带 log-softmax，数值更稳），先 \`softmax\` 再 \`log\` 会丢精度。
3. **学习率过大 / 语料太乱**：冒烟语料要「重复性强」，loss 才降得快；换成随机噪声语料，loss 会停在高位——这是正常的，不代表代码错。

:::

### 把「均值上下文」换成一个真 mini-Transformer

上面 TinyLM 用「前 ctx 位平均」做上下文，纯粹是为了让 loss 能降、把数据管道跑通。真正想验证「next-token 目标 + Transformer 架构」，把 TinyLM 的 forward 换成一个 2 层小 Transformer 即可，目标函数与数据管道一行不改：

\`\`\`python
class MiniGPT(nn.Module):
    def __init__(self, vocab, d, h, layers, ctx):
        super().__init__()
        self.emb = nn.Embedding(vocab, d)
        self.pos = nn.Embedding(ctx, d)                  # 可学习位置编码
        block = nn.TransformerEncoderLayer(d, h, batch_first=True, norm_first=True)
        self.blocks = nn.TransformerEncoder(d, block, layers)
        self.head = nn.Linear(d, vocab, bias=False)
        self.ctx = ctx

    def forward(self, x):
        B, T = x.shape
        h = self.emb(x) + self.pos(torch.arange(T, device=x.device))
        h = self.blocks(h)                               # 因果性靠 mask 保证
        return self.head(h)                               # [B, T, V]

# 因果 mask：上三角 -inf，保证第 t 位只看 0..t（见 L01）
def causal_mask(T, device):
    return nn.TransformerEncoderLayer.generate_square_subsequent_mask(T, device=device)
\`\`\`

换成 MiniGPT 后，\`next_token_loss\` 要在 **[B, T, V] 的每个位置**上算，labels 仍是「右移一位」：把 logits 整体右移一位对齐，再进 \`F.cross_entropy\`。\`loss\` 曲线会比均值版**降得更慢、更低**——因为小 Transformer 容量更大，能把重复语料的困惑度压到很接近 1。对比两条曲线，你能直观看到「架构决定 loss 下限、数据决定 loss 上限」。

### 数据侧三个决定 loss 下限的细节

冒烟时最容易把时间花在调学习率，但其实**数据侧三处**对 loss 下限的影响更大，先确认这三处再谈超参：

- **padding 与截断方向**：序列不足 \`maxlen\` 时补 pad token，但 pad 位的目标必须置成 \`-1\`（ignore_index），否则模型会「学预测 pad」，loss 里混进噪声；截断是「从头截」还是「滑窗」，直接决定模型看到的是什么长度的局部模式。
- **去重**：本例 \`"..." * 10\` 是刻意重复以让 loss 降得快；真实预训练若不去重，模型会死记高频句，loss 虚低但泛化差。M8 讲数据配比时会专门讲去重阈值。
- **词表与 BPE**：这里用字符级词表是简化；真实 LLM 用 BPE 把词表压到 3 万左右（L11 展开）。词表大小直接影响「初值 loss ≈ ln(V)」的量级——词表越大，初值越高，越要确认 loss 是从正确起点降下来的。

把这三处当成「数据体检清单」，每次读 loss 曲线前先过一遍，比反复调学习率有效得多。

### 读 loss 曲线的三种形态

同样是「loss 在降」，曲线形态不同，含义完全不同，这是读冒烟/预训练日志的核心技能：

- **平滑单调降**：正常，容量够、数据干净、学习率合适。
- **降到一半平台期**：多半是数据去重后真实复杂度到顶（容量或数据到头），或学习率没退火；看 M8 的 learning rate schedule。
- **震荡甚至反升**：先查 labels 是否错位（最大概率），再查学习率是否过大、batch 是否太小导致梯度噪声。

:::tip

### 这一课为什么用「小模型」而不是真 Transformer

冒烟的目的是验证**数据管道 + 目标函数 + 反向传播**这条链路正确，不是验证架构。所以先用最小的「均值上下文」模型把 loss 跑下来、把三个数据坑暴露出来，再换 MiniGPT 验证「架构无关性」。这样调试时**变量只有一个（架构）**，loss 变化才能归因到架构本身——这是后面 M8 预训练全模块的通用调试方法：**一次只动一个变量，其余锁死**。

:::

### 把 loss 与困惑度翻译成「模型到底学了多少」

\`loss\` 是「平均每个 token 的负对数似然」，数值本身不好直观判断；\`perplexity = exp(loss)\` 把它翻译成人话——**模型在「每个位置上平均有多少个等概率的候选词」**。初值 \`ln(V)\` 对应困惑度 \`V\`（完全随机、每个词等概率）；训练后困惑度降到 1.x，意味着模型在多数位置只剩 1~2 个候选词还分不清（因为语料重复性强，本就不该有那么多不确定）。

用这个量纲读曲线有三个习惯：

- **看起点而非当前值**：先确认 loss 是从 \`ln(V)\` 这个正确的随机起点降下来的，起点不对（比如初值就远低于 \`ln(V)\`）往往是 embedding 初始化或词表映射有 bug。
- **看斜率拐点**：loss 下降速度从快变慢的拐点，通常对应「模型把高频重复模式学完了、开始啃真正的长尾语义」，这是判断「冒烟数据太简单」的信号。
- **看 floor（下限）**：冒烟语料的理论 floor 接近 1（完全可预测），真实语料 floor 在 2~3 量级。如果真实预训练 loss 卡在 floor 以上很远且长期不动，多半是数据去重或配比问题，不是模型问题。

### 一次完整的「loss 异常 → 定位」排查剧本

把前面散落的坑串成一条可执行的排查顺序，下次遇到「loss 不降」直接照做：

1. **先验证数据对齐**：打印一对 \`X[i]\` 与 \`y[i]\`，手工确认 \`y[i]\` 正好是 \`X[i]\` 右移一位（\`y[i] = seq[1:]\`）。这一步排除最大概率的错位 bug。
2. **再验证起点**：随机初始化时 \`loss ≈ ln(V)\`？偏低说明 embedding 或 logits 头有系统性偏置。
3. **检查学习率量级**：冒烟用 1e-2 起步；若第一步 loss 就爆到 inf，先降 10 倍再看。
4. **确认数据重复性**：若 loss 长期停在 floor 以上，换更重复的语料或调大 batch——这是数据复杂度问题，不是代码问题。
5. **最后才怀疑模型容量**：以上都正常但 loss 还是降不动，才考虑加宽/加深或加层数。

这个顺序的价值在于**先排除 90% 的廉价 bug（数据、学习率），再碰 10% 的昂贵调整（容量）**，避免一上来就调学习率调半天、其实只是 labels 写反了。
`,
    null,
    [
      {
        text: 'next-token 数据张量化里，目标序列相对输入是？',
        options: ['左移一位', '右移一位', '不变', '随机'],
        answer: 1,
        explain: '目标 y 是输入 X 右移一位：y[i]=seq[1:]、X[i]=seq[:-1]，错位一格是最大坑。',
        concept: 'next-token-loss',
      },
      {
        text: '交叉熵损失应该在什么上计算？',
        options: ['softmax 后的概率', '未归一化的 logits', 'embedding 向量', '梯度'],
        answer: 1,
        explain:
          '用未归一化 logits 进 F.cross_entropy（内部 log-softmax 数值更稳），先 softmax 再 log 会丢精度。',
        concept: 'next-token-loss',
      },
      {
        text: '均匀分布下 next-token 困惑度的量级是？',
        options: ['1', 'ln(V)', 'exp(V)', '0'],
        answer: 1,
        explain: '未训练模型输出近均匀分布，loss≈ln(V)，ppl=exp(loss)≈V，随训练下降。',
        concept: 'next-token-loss',
      },
      {
        text: '训练时 loss 不降反升，优先排查哪一项？',
        options: ['语料太长', 'labels 是否错位 / 学习率是否过大', '词表太小', 'd 太大'],
        answer: 1,
        explain: 'loss 反升最常见原因是 labels 错位一格或学习率过大；先查这两处再考虑数据/容量。',
        concept: 'next-token-loss',
      },
    ],
    [
      ['右移一位', '目标序列相对输入左移一格（输入=seq[:-1]，目标=seq[1:]）'],
      ['困惑度', 'ppl=exp(loss)，衡量模型预测的「意外程度」，随训练下降'],
      ['logits', '未归一化的打分向量，交叉熵应直接在其上计算'],
      ['冒烟', '用重复性强的小语料快速验证「loss 能下降」的最小闭环'],
    ],
    [
      '把目标写成 `seq[:-1]`、输入写成 `seq[1:]`（方向写反），学成「隔一个」。',
      '先 softmax 再取 log 算交叉熵——数值不稳，直接用 logits 进交叉熵。',
      '用随机噪声语料期待 loss 下降——噪声语料 loss 停在高位是正常的。',
      '学习率设 1e-1 导致 loss 爆炸——冒烟一般 1e-2 起调。',
    ],
  ),
  'practice',
)
