import { L, withKind } from '../../course-builders.ts'

export const L11 = withKind(
  L(
    'L11',
    4,
    'Capstone：组装最小 decoder-only block 并画架构谱系地图',
    4,
    ['L03', 'L06', 'L09', 'L10'],
    ['m1-capstone'],
    [
      '组装一个可跑的最小 decoder-only block（causal MHA + SwiGLU FFN + RMSNorm + RoPE + tokenizer）',
      '跑通 next-token 训练，loss 明显下降并做生成冒烟',
      '验证单步前向正确（因果掩码、RMSNorm、RoPE 各就位）',
      '画一张「架构谱系地图」：把 M2–M5 各架构标注成「补 Transformer 哪个短板」',
    ],
    `
### 目标：把 M1 学过的零件拼成一个能训、能生成的最小 LLM

这是 M1 的收口综合课。前面分散学过 next-token 损失（L03）、因果 MHA（L06）、RMSNorm（L09）、RoPE（L10），本课时把它们**拼进一个标准 Pre-Norm decoder-only block**，加一个 tokenizer 与 next-token 训练循环，做到两件事：**loss 能下降**、**能生成冒烟句子**。最后画一张「架构谱系地图」，把 M2–M5 各架构标注成「补 Transformer 哪个短板」，给整个模块收口。

### 一个标准 Pre-Norm block

结构（每个 block）：

    x = x + MHA(RMSNorm(x) + RoPE)        # 注意力支路（Pre-Norm）
    x = x + SwiGLUFFN(RMSNorm(x))         # FFN 支路
    末尾再补一个 RMSNorm

关键「拼装正确性」检查点：
- 注意力支路先过 RMSNorm 再进 MHA（Pre-Norm），输出**加回原 x**（残差）。
- MHA 的 Q/K 在进 softmax 前要做 RoPE 旋转（L10）。
- FFN 支路同样 Pre-Norm，中间维 8/3·d_model（L07）。

\`\`\`python
import torch
import torch.nn as nn
import torch.nn.functional as F
# 假设你已按 L06/L07/L09/L10 实现 MHA（因果多头）/ SwiGLUFFN / RMSNorm / RoPE，
# 这里直接复用，本节只讲「怎么拼进一个 Pre-Norm decoder-only block」。

class DecoderBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff):
        super().__init__()
        self.attn = MHA(d_model, n_heads, causal=True)
        self.ln1 = RMSNorm(d_model)
        self.ffn = SwiGLUFFN(d_model, d_ff)
        self.ln2 = RMSNorm(d_model)

    def forward(self, x, cos, sin):
        h, _ = self.attn(x, cos=cos, sin=sin)        # 因果 MHA + RoPE
        x = x + h
        x = x + self.ffn(self.ln2(x))                 # FFN 支路
        return x

class TinyLLM(nn.Module):
    def __init__(self, vocab, d_model, n_heads, depth, d_ff, max_len=128):
        super().__init__()
        self.emb = nn.Embedding(vocab, d_model)
        self.blocks = nn.ModuleList([DecoderBlock(d_model, n_heads, d_ff) for _ in range(depth)])
        self.lf = RMSNorm(d_model)
        self.head = nn.Linear(d_model, vocab, bias=False)
        self.cos, self.sin = precompute_rope_cache(max_len, d_model // n_heads)

    def forward(self, x):
        h = self.emb(x)
        for b in self.blocks:
            h = b(h, self.cos, self.sin)
        return self.head(self.lf(h))

# 冒烟：极简字符级 tokenizer + next-token 训练
def char_tokens(texts):
    vocab = sorted({c for t in texts for c in t})
    it = {c: i + 1 for i, c in enumerate(vocab)}
    it[" "] = 0
    data = [[it[c] for c in t] for t in texts]
    return data, it, vocab

sentences = ["the cat sat on the mat and the dog", "the dog ran to the park today"] * 40
data, it, vocab = char_tokens(sentences)
maxlen = max(len(s) for s in data)

# 右移一位对齐（L03 的坑：目标 = 输入右移）
X = torch.tensor([s[: maxlen - 1] + [0] * (maxlen - 1 - len(s[:maxlen-1])) for s in data])
Y = torch.tensor([s[1:] + [0] * (maxlen - len(s[1:])) for s in data])

model = TinyLLM(len(vocab), d_model=64, n_heads=4, depth=2, d_ff=80)
opt = torch.optim.AdamW(model.parameters(), 3e-3)
for step in range(400):
    logits = model(X)
    loss = F.cross_entropy(logits.reshape(-1, len(vocab)), Y.reshape(-1), ignore_index=0)
    opt.zero_grad()
    loss.backward()
    opt.step()
    if step % 80 == 0:
        print(step, "loss=", round(loss.item(), 3))

# 生成冒烟：贪心自回归（把上一步 argmax 喂回，见 L13 的 KV 复用动机）
@torch.no_grad()
def greedy(model, prompt, n=20):
    ids = [it[c] for c in prompt]
    for _ in range(n):
        ctx = ids[-64:]                                   # 取最近 64 个 token
        x = torch.tensor([ctx])
        next_id = model(x).argmax(-1).item()              # 贪心取下一个
        ids.append(next_id)
    # 把 id 还原回字符（it 是 字符→id，这里反转）
    it_inv = {v: k for k, v in it.items()}
    return "".join(it_inv[i] for i in ids if i in it_inv)

out = greedy(model, "the cat ")
print("生成冒烟输出：", out, "（重复语料下应吐出 the/dog 等片段）")
\`\`\`

### 升级：把贪心生成改成「KV 缓存版」（预告 L13）

上面的 \`greedy\` 每步重算整段上下文。下面把它升级成**增量版**——每步只喂新 token、复用历史 K/V，把生成从 O(T²) 降到 O(T)。这就是 L13 的 KV cache，先在这里把「升级点」标出来，让你看到朴素版与缓存版的差别就在「喂多少」：

\`\`\`python
@torch.no_grad()
def greedy_kv(model, prompt, n=20, cache=None):
    ids = [it[c] for c in prompt]
    if cache is None:
        cache = {"k": {}, "v": {}}           # 每层一份 K/V 缓存
    out_ids = list(ids)
    for step in range(n):
        # 关键差别：只把「最后一个新 token」喂进模型，历史 K/V 从 cache 取
        x = torch.tensor([out_ids[-1:]])     # 1 个新 token，不是整段
        logits = model.forward_infer(x, pos=len(out_ids), cache=cache)
        nxt = logits[:, -1].argmax(-1).item() # 取新 token 的 logit
        out_ids.append(nxt)
        # cache 由 model.forward_infer 内部把本步的 K/V 追加进去（因果性保证不再改）
    it_inv = {v: k for k, v in it.items()}
    return "".join(it_inv[i] for i in out_ids if i in it_inv)
# 与朴素 greedy 的唯一差别：x 只取「最后一个 token」+ 复用 cache 里的历史 K/V。
# 这是「O(T²) → O(T)」的全部来源，也是 L13 KV cache 的落地形态。
\`\`\`

（\`forward_infer\` 的实现在 L13；这里只标「喂 1 个新 token + 复用 cache」这个升级点，避免本课时提前实现整套 KV 管理。）

### 可执行验收断言

1. **loss 下降**：初值 ≈ \`ln(len(vocab))\`，400 步后明显下降（本冒烟语料重复性强，通常降到初值一半以下）。
2. **单步前向正确**：把 \`Y[0,0]\` 手动设为 \`data[0][1]\` 的 token，检查 \`model(X)\` 在该位置对该 token 的 logit 是最大（方向对即可）。
3. **因果性**：把 prompt 后半段改成一个 token，输出不变（因为因果掩码让前面看不到后面）。
4. **组件就位**：每个 block 有 \`RMSNorm→MHA→残差\` 与 \`RMSNorm→SwiGLU→残差\` 两条支路；MHA 的 Q/K 带 RoPE 旋转。

### 架构谱系地图（模块收口）

把 M2–M5 标注成「补 Transformer 哪个短板」，这是 M1 要留下的**总图**（后文各模块据此展开）：

| 短板 | 对应架构 | 模块 |
|---|---|---|
| O(N²) 长序列内存 / 注意力贵 | 线性注意力 / SSM / Mamba / RWKV / Hyena | M4 |
| FFN 容量（参数大头）浪费在稀疏 | MoE（细粒度专家 + 稀疏激活） | M3 |
| 单向自回归、不可编辑 | 扩散 LLM（双向去噪 / 任意顺序生成） | M5 |
| KV 存储随头数×序列长膨胀 | GQA / MLA / KV 量化 | M2 / M7 |

**一句话**：Transformer 本体（M1）是地基，后面所有架构都是「针对某个短板做的减法或换法」。

### 把「拼对了」的四个检查点逐个验一遍

组装最容易翻车的是「零件都写对了、拼到一起顺序错」。四个检查点按发生顺序验：

- **Pre-Norm 位置**：\`ln1(x)\` 必须在 \`attn\` 调用**之前**（进子层前归一化），且残差 \`x = x + h\` 里的 \`x\` 是**归一化前的原值**——如果把 \`x = x + self.ln1(h)\` 写成 \`x + self.ln1(h)\` 之外还多归一化一次，就把 Pre-Norm 写回了 Post-Norm。
- **RoPE 时机**：旋转要在 Q/K **算完、进 softmax 之前**。如果忘了给 K 也旋转（只转了 Q），相对感知会被破坏，注意力分数不再只依赖相对距离。
- **FFN 支路独立归一化**：FFN 支路有自己的 \`ln2\`，不能复用注意力的 \`ln1\`。两条支路各自 Pre-Norm、各自残差加回。
- **末尾最终归一化**：整网络最后一个 block 出来后进 LM head 前，还要补一个 RMSNorm（Pre-Norm 的代价），否则输出尺度偏大、logits 不稳。

把这四点当成「组装修完必查清单」，能排除 90% 的「能跑但 loss 不对」问题。

### 为什么「贪心喂回」就是 KV 复用的动机

上面 \`greedy()\` 里每一步都拿 \`ids[-64:]\` 重新喂一遍整段上下文、重算一次前向——这是**最朴素、最浪费**的生成方式：第 t 步重算了一遍 0..t-1 所有位置，而这些位置的 K/V 上一步已经算过、本可直接复用。L13 的 KV cache 就是把「每步重算的历史 K/V」存下来、新 token 只算它自己那一步，把生成从 O(T²) 降到 O(T)。本课时故意用最朴素版，是为了让你**先体会「没有 KV 复用有多浪费」**，L13 才有的放矢。

### 把「能训 + 能生成」拆成可观测的两个里程碑

本课时有两个独立的验收里程碑，别混为一谈：

- **里程碑一：loss 能下降**。只证明「数据管道 + 反向传播 + 优化器」这条链路通了。判据：loss 从 \`ln(V)\` 明显往下走（本冒烟通常降到初值一半以下）。
- **里程碑二：能生成冒烟**。只证明「前向 + 自回归采样 + 词表反查」这条链路通了。判据：喂 \`"the cat "\` 能吐出 \`the/dog/mat\` 等语料里出现过的片段。

两个里程碑**互相独立**：loss 能降但生成吐乱码，多半是生成循环里的「id 反查映射」写反了（本课时的 \`it_inv = {v: k}\` 就是干这个的）；生成看着对但 loss 不降，多半是训练侧的数据对齐（L03 的右移一位）错了。把两个里程碑拆开验，定位问题时就不会「两边互相怀疑」。

### 为什么本课时用「字符级词表」而不是真 tokenizer

LLaMA 系用 BPE 把词表压到 3 万左右，本课时却故意用最简陋的**字符级词表**（\`{c: i+1}\` 逐字符建表），是为了把变量压到最少：

- 字符级词表**零外部依赖**，不用引 BPE 库、不用下 tokenizer，冒烟脚本单文件可跑。
- 词表极小 → 初值 loss 低、训练快、肉眼可判。
- 把「tokenizer 怎么造」这一变量彻底拿掉，本课时只聚焦「block 拼装 + 训练 + 生成」三件事。

真 tokenizer（BPE 造词表、分词、padding）留到 M11 部署课与 L11 提到的 BPE 概念展开——本课时刻意**不做 tokenizer**，是「一次只验一个层面」的调试纪律。

### 把 capstone 当成 M1 的「出口考试」

这是 M1 最后一课，它的设计意图是**出口验收**：如果你能独立把这套 block 拼出来、跑通训练、生成冒烟，说明 M1 十四课的地基（block 结构、自回归目标、MHA、GQA、FFN、归一化、位置编码、KV 复用动机）你已经全打通了，可以进 M2。如果拼不出来或卡在某步，**先回到对应零件课（L06/L07/L09/L10/L13）补那一块**，不要在 capstone 里死磕——capstone 翻车的根因几乎都在零件没吃透，而不是拼装本身。

:::tip

### 把整门课 M2–M11 挂在「短板 → 换法」这张总图上

这张谱系地图不只是 M1 的收口，它是**整门 111 课的导航图**。后文每个模块都对应表里的一行「短板」：

- **M2 注意力演进**：补「KV 存储随头数×序列长膨胀」——GQA/MLA/量化都是在这条短板上做减法。
- **M3 MoE**：补「FFN 容量浪费在稀疏」——把 FFN 换成按 token 稀疏激活的专家库。
- **M4 SSM/混合**：补「O(N²) 长序列内存」——线性化/RNN 化把注意力降阶。
- **M5 扩散 LLM**：补「单向自回归不可编辑」——双向去噪、任意顺序生成。
- **M6–M11**：在「能跑」的基础上做**选型、预训练、微调、对齐、打包部署**，把地基之上的楼一层层盖起来。

把模块记成「它在补 Transformer 哪块短板」，比记「它用了什么技术」更不容易混——因为技术会变，短板是稳定的。

### 把「组装」抽象成一套可复用的调试方法

这课的价值不止于「拼出一个模型」，更在于它示范了一套**通用调试方法**：先让每个零件（MHA、FFN、RMSNorm、RoPE）单独过 L06/L07/L09/L10 的行为断言，确认零件正确；再拼装；拼完只查「顺序/时机」四个检查点。这样当 loss 不对时，你能立刻判断是「零件 bug」还是「拼装顺序 bug」——**一次只怀疑一个层面**。这套「先单件验收、再组装、再查顺序」的方法，后面 M8 预训练、M11 部署里都会反复用到：复杂系统出问题，永远先缩小怀疑范围，再动手。

### 冒烟语料的选择逻辑

本课时用两句重复性极强的字符串（\`"the cat sat on the mat..."\` × 40）做冒烟，不是偷懒，是**刻意**：

- 重复性强 → loss 能在 400 步内明显下降，能验证「训练闭环」；
- 字符级词表极小 → 初值 loss ≈ ln(V) 很小，好算好读；
- 内容简单 → 生成冒烟能吐出可预期的片段（the/dog/mat），肉眼可验。

换成真实语料，loss 降得慢、floor 高、生成结果不可肉眼判读，就失去「冒烟」的意义了。冒烟的目标是**验证链路正确**，不是验证模型能力——这点和 L03 的取舍一致：**先跑通、再谈能力**。

### 把每个零件的「出处」标注清楚，验收才能归因

Capstone 最容易变成「能跑但不知道为什么」。本课时特意让每个零件都能追溯到前文某一课，验收时出了问题立刻能归因到具体零件：

| 零件 | 来源课 | 本课时里的角色 |
|---|---|---|
| 因果 MHA（QKV + 缩放 + 因果 mask） | L06 | 注意力支路核心 |
| SwiGLU FFN（gate/up/down、8/3 中间维） | L07 / L14 | FFN 支路 |
| RMSNorm（Pre-Norm、只 re-scaling） | L08 / L09 | 两条支路前的归一化 + 末尾最终归一化 |
| RoPE（旋转 Q/K、相对感知） | L10 | 进 softmax 前的位置注入 |
| next-token 交叉熵 + 右移一位 | L02 / L03 | 训练目标 + 数据对齐 |
| 贪心生成（上一步 argmax 喂回） | L13 | 推理冒烟（体现 KV 复用动机） |

验收出问题时的归因顺序：**先查数据对齐（L03 的右移）→ 再查零件（MHA/RMSNorm/RoPE 各跑一遍 L06/L09/L10 的行为断言）→ 最后查拼装顺序（本课时的四个检查点）**。这个顺序把「capstone 翻车」拆成三层可定位的问题，避免面对一个 loss 不对的整模型无从下手。

### 为什么 capstone 要「能生成」而不止于「能训」

很多综合课只验 loss 下降就收尾，本课时坚持加上**生成冒烟**，理由有三：

- **生成才是 decoder-only 的真正形态**：loss 下降只证明「训练目标在优化」，但模型能不能**自回归地吐出连贯 token**，要看到生成输出才知道。
- **暴露「训练视角 vs 推理视角」的分界**（L13）：贪心生成逼你把「每步重算」的朴素做法写出来，正是 L13 KV cache 的动机来源——不写生成，KV 复用就悬空。
- **肉眼可验**：重复语料下生成出 the/dog/mat 这类片段，人一眼就能判「链路通了」，比读 loss 数字直观。

所以 M1 的收口标准是「**能训 + 能生成 + 组件就位 + 谱系地图**」四件事，缺一都不能算把地基打好——后面 M2 起的所有优化都假设「你已经手里有一个能跑的 decoder-only」，本课时就是提供这个起点。

:::tip

### 把这张谱系地图当作「整门课的目录页」

上面的「短板 → 架构 → 模块」表，建议你在学完 M1 后**手绘一遍**再进 M2：把 M2 注意力演进、M3 MoE、M4 SSM、M5 扩散 LLM 各自填进「补哪个短板」的格子。画得出来的那一刻，你就把 111 课从「一堆课时」升级成了「一张有逻辑的总图」——后文每学一个架构，你都能立刻说出「它在补 Transformer 的哪块短板、对应 M 几」。这是 M1 作为地基课最重要的交付物，比任何一段代码都值钱。

:::

### 把本课时当 M2–M11 的「验收锚点」

学完这门课、进到 M2 之前，用四句话自检 M1 是否真的打牢：

1. **能不能不看讲义、白手写出一个 Pre-Norm decoder-only block**（注意力支路 + FFN 支路 + 残差 + RMSNorm + RoPE 各就位）？
2. **能不能把「loss 不对」按「数据对齐 → 零件 → 拼装顺序」三层拆下去**？
3. **能不能说清每个零件的出处课**（MHA=L06、SwiGLU=L07/L14、RMSNorm=L08/L09、RoPE=L10、next-token=L02/L03、生成=L13）？
4. **能不能把 M2–M5 各自填进「补 Transformer 哪个短板」的谱系图**？

四问都答得出，M1 地基才算交付；哪一问卡住，就回对应课时补那一块，而不是带着模糊进 M2。这是 capstone 真正的验收方式——**它是「地基打没打牢」的自检清单，不是又一段要你读懂的代码**。
`,
    null,
    [
      {
        text: '标准 Pre-Norm decoder-only block 的两条支路顺序是？',
        options: ['MHA→FFN→归一化', 'RMSNorm→MHA→残差 与 RMSNorm→FFN→残差', 'FFN→MHA', '无残差'],
        answer: 1,
        explain: 'Pre-Norm：先归一化再进子层，子层输出加回原 x；两条支路（注意力/FFN）各带残差。',
        concept: 'm1-capstone',
      },
      {
        text: 'MHA 的 Q/K 在进入 softmax 前应做（L10）？',
        options: ['LayerNorm', 'RoPE 旋转', 'ReLU', 'dropout'],
        answer: 1,
        explain: 'RoPE 把相对位置旋转进 Q/K，是 LLaMA 系标准位置编码。',
        concept: 'm1-capstone',
      },
      {
        text: '「O(N²) 长序列内存/注意力贵」这个短板主要由哪类架构解决？',
        options: ['MoE', '线性注意力 / SSM / Mamba / RWKV / Hyena', '扩散 LLM', 'MLA'],
        answer: 1,
        explain: '线性化/RNN 化把注意力从 O(N²) 降到 O(N) 或 O(1)，是 M4 的主线。',
        concept: 'm1-capstone',
      },
      {
        text: '「单向自回归、不可编辑」的短板被哪类架构突破？',
        options: ['MoE', 'GQA', '扩散 LLM', 'GPTQ'],
        answer: 2,
        explain: '扩散 LLM 用双向去噪/任意顺序生成，可局部编辑，突破自回归单向限制（M5）。',
        concept: 'm1-capstone',
      },
    ],
    [
      ['Pre-Norm', '归一化在子层输入前、残差支路不加归一化的 block 结构'],
      ['因果 MHA', '带因果掩码的多头自回归注意力'],
      ['谱系地图', '把各架构标注成「补 Transformer 哪个短板」的总图'],
      ['贪心生成', '把上一步 argmax 喂回去的自回归生成（体现 KV 复用动机）'],
    ],
    [
      '把 FFN 支路忘了 RMSNorm——Pre-Norm 两条支路都要先归一化。',
      'MHA 没接 RoPE 就进 softmax——位置信息缺失，长文本退化。',
      '生成冒烟用「未来 token」喂回——因果生成只能拿已生成部分。',
      '把「补短板」记成「加模块」——架构演进是换法/减法，不是往 block 里塞东西。',
    ],
  ),
  'capstone',
)
