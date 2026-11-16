import { L, withKind } from '../../course-builders.ts'

/* ========== 模块 1 · 架构原理深挖 ========== */

export const L01 = withKind(
  L(
    'L01',
    0,
    '2017 Transformer 原文：block 结构与「注意力即基础」',
    2,
    [],
    ['block-arch'],
    [
      '能画出 2017 原文 encoder / decoder block 的子层构成与残差、归一化位置',
      '说清「Attention Is All You Need」相对 RNN 的两处根本改变',
      '理解自注意力 + FFN + 残差 + LayerNorm 四件套为何缺一不可',
      '对照现代 decoder-only LLM 指出原文被保留与抛弃了哪些组件',
    ],
    `
### 两个根本改变：把「序列」交给注意力，把「容量」交给 FFN

2017 年的 Transformer（arXiv:1706.03762）之所以成为后面所有大模型的骨架，靠的是两处对循环网络的根本替换。第一处是**用自注意力替代 RNN 的逐位置递推**：RNN 要把序列从左读到右、每个位置依赖上一步隐藏态，序列越长递推越多，无法并行；自注意力则让任意两个位置直接算一个相关性分数，一次前向就能把全序列的两两关系算完，训练时天然可并行到任意长度。第二处是**用一个足够宽的逐位置前馈网络（FFN）承接「记忆」职责**：注意力负责「看哪里」，FFN 负责「看到之后记住什么知识」，两者交替堆叠，模型的表达力主要就来自 FFN 的宽度。

### encoder block 的四件套

原文的 encoder 由 N 个相同子结构堆叠而成，每个子结构内部又是两层，每层都套「残差 + 归一化」：

- 多头自注意力（Multi-Head Self-Attention）：把输入投影成 h 组 Q/K/V，各组独立算 softmax(QKᵀ/√d_k)V，再拼接投回。
- 逐位置前馈（Position-wise FFN）：两个线性层夹一个 ReLU，作用在每个位置上互相独立。
- 残差连接（Residual）：子层输出加回子层输入，梯度可以直接回传，深网络才训得动。
- 层归一化（LayerNorm）：对每个位置、跨特征维做归一化，稳定各层激活尺度。

原文用的是 **Post-Norm**（先残差、再归一化），后文 L08 会讲现代 LLM 普遍改成 **Pre-Norm**（先归一化、再残差），训练更稳。

:::tip

### 为什么「注意力即基础」

去掉 FFN，注意力只能做「线性组合」——它把 V 加权，但权重本身没有非线性，堆再多层仍是线性。FFN 提供非线性容量。反过来去掉注意力，模型退化成逐位置独立处理，无法建模词与词的关系。四件套是**注意力管关系、FFN 管容量、残差管可训、归一化管稳定**的分工。

:::

### decoder block 与 encoder 的差异

decoder 在自注意力外面多包一层**跨注意力**（cross-attention）：query 来自 decoder 自身，key/value 来自 encoder 输出，用于「看着源序列生成目标序列」。同时 decoder 的自注意力带**因果掩码**（causal mask）：第 t 个位置只能看到 0..t，保证生成是自回归的、训练时可以用教师强制一次并行算完。

\`\`\`python
# 概念伪码：原文一个 encoder 子层（Post-Norm）
def encoder_block(x, heads):
    x = x + sublayer(multi_head_self_attention(x, heads))   # 残差
    x = layer_norm(x)                                        # Post-Norm
    x = x + sublayer(pwff(x))                                # 逐位置 FFN
    x = layer_norm(x)
    return x

# 训练并行关键：因果掩码让「生成第 t 个词」在训练时一次前向全算完
def causal_mask(n):
    import torch
    return torch.tril(torch.ones(n, n)).bool()               # 下三角 True
\`\`\`

### 现代 LLM 保留了什么、丢了什么

今天的 decoder-only 模型（GPT / LLaMA 系）基本把原文的四件套全留下来了，改动集中在：归一化从 Post-Norm 换 Pre-Norm、FFN 的激活从 ReLU 换 GELU/SwiGLU、位置信息从可学习向量换 RoPE（L03、L10）、注意力从 MHA 换 GQA（L05）。而**跨注意力与 encoder 分支被整个丢掉**——decoder-only 只靠自注意力 + 因果掩码就够了，这也是「自回归范式」的核心（下一课 L02 展开）。

### 子层为什么是「注意力 → FFN」的固定交替

一个 block 内部几乎总是「先注意力、再 FFN」两段串联，这个顺序不是随意的。注意力子层负责**把信息在位置之间搬运**：让第 t 个位置去聚合它关心的其它位置（建立关系）。FFN 子层负责**在搬运完之后做非线性加工**：把注意力聚来的混合信号进一步变换、提炼成更高层的表示（沉淀知识）。两者交替，等于「交换信息 → 加工信息」不断循环 N 轮。把 FFN 放在注意力前则逻辑不通——FFN 是逐位置独立的，没有其它位置的信息可加工；它必须等注意力先把上下文聚合好，再在其上做非线性变换。所以「注意力在前、FFN 在后」是**先有原料、再做加工**的自然次序。

### 一行算清一个 block 的参数量

把原文一个 encoder block 的参数摊开：注意力是 Q/K/V/O 四个 d_model×d_model 矩阵，共 4·d_model²；FFN 是「d_model→4·d_model→d_model」两个矩阵，共 8·d_model²。一个 block 的线性参数合计约 **12·d_model²**，注意力与 FFN 大致是 **1:2**。这个比例是理解 M3 的钥匙：FFN 占了 2/3 的参数，**MoE 要省的就是 FFN 这块大头**（把 dense FFN 换成稀疏门控专家），而不是动注意力（注意力建立的是位置间关系，必须 dense 才算得动）。记住这个 1:2，后面讲 MoE 省算力时才有「为什么省的是 FFN」的直觉锚点。

\`\`\`python
# 一个 block 的线性参数占比（概念）
d_model = 768
p_attn = 4 * d_model * d_model          # Q/K/V/O
p_ffn  = 2 * d_model * (4 * d_model)    # FFN 两路（原文 ReLU 版）
print("注意力参数:", p_attn, " FFN 参数:", p_ffn, " 占比 FFN:", round(p_ffn/(p_attn+p_ffn), 2))
# 结论：FFN 约占 2/3，是 MoE（M3）的改造对象
\`\`\`

### 收束：把 block 当作可复用的「信息单元」

把上面几条压成一句可复用的直觉：一个 Transformer block 是**「交换 + 加工 + 稳定」**三件套的最小单元——注意力负责在位置间交换信息，FFN 负责对交换来的信息做非线性加工，残差与归一化负责让这个单元在堆 N 层后仍然训得动、算得稳。只要认清「每个 block 在做同一件小事，堆叠就是把它做 N 遍」，后面无论是 M4 的 SSM、M7 的 DeepSeek 混合结构，还是 M3 把 FFN 换成稀疏门控，都能定位到「它动了三件套里的哪一个」。这就是 2017 原文留下的最值钱的设计遗产。
`,
    null,
    [
      {
        text: '自注意力相比 RNN 递推的核心优势是什么？',
        options: ['参数更少', '任意两位置直接算相关性，全序列可并行', '不需要 FFN', '一定比 RNN 精度高'],
        answer: 1,
        explain: '自注意力一次前向算完全序列两两关系，训练天然并行；这是 Transformer 可扩到超长序列的关键。',
        concept: 'block-arch',
      },
      {
        text: '在「注意力 + FFN + 残差 + 归一化」中，主要提供模型容量（知识记忆）的是？',
        options: ['自注意力', '逐位置 FFN', '残差连接', 'LayerNorm'],
        answer: 1,
        explain:
          '注意力管「看哪里」，FFN 管「看到后记住什么知识」；容量主要靠 FFN 宽度，这也是 MoE 改造的目标。',
        concept: 'block-arch',
      },
      {
        text: 'decoder 的自注意力为什么要加因果掩码？',
        options: [
          '为了省内存',
          '保证第 t 位只能看到 0..t，让生成自回归、训练可教师强制并行',
          '为了加速',
          '原文没有',
        ],
        answer: 1,
        explain: '因果掩码保证自回归性：训练时每个位置的条件分布独立，可用教师强制一次前向并行算完。',
        concept: 'block-arch',
      },
      {
        text: '现代 decoder-only LLM 相比 2017 原文，丢掉了哪个组件？',
        options: ['FFN', '残差连接', '跨注意力（cross-attention）', 'LayerNorm'],
        answer: 2,
        explain: 'decoder-only 只保留自注意力 + 因果掩码，跨注意力与 encoder 分支被整个移除。',
        concept: 'block-arch',
      },
    ],
    [
      ['自注意力', '替代 RNN 递推，任意两位置直接算相关性，全序列可并行'],
      ['Post-Norm', '先残差再归一化，原文 encoder/decoder 的归一化位置'],
      ['因果掩码', '让第 t 位只看 0..t 的下三角掩码，保证自回归'],
      ['四件套', '注意力管关系、FFN 管容量、残差管可训、归一化管稳定的分工'],
    ],
    [
      '把「容量」寄托在注意力层数上——主要容量在 FFN，加深度不等于加容量。',
      '以为 decoder-only 还带着 encoder 分支——跨注意力已被移除，只留自注意力。',
      '混淆 Post-Norm 与 Pre-Norm：原文是 Post-Norm，现代 LLM 多为 Pre-Norm。',
      '把「可并行」当成精度优势——并行是训练效率优势，精度取决于数据与规模。',
    ],
  ),
  'theory',
)
