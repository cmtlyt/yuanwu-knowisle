import { L, withKind } from '../../course-builders.ts'

export const L12 = withKind(
  L(
    'L12',
    5,
    '三范式对照：encoder / enc-dec / decoder-only 的取舍',
    2,
    ['L02'],
    ['paradigm-compare'],
    [
      '对照 BERT（encoder-only）/ T5（enc-dec）/ decoder-only LLM 的注意力方向、预训练目标、适用任务',
      '说清 BERT 双向性为何强于理解、却做不了开放式生成',
      '解释 T5 text-to-text 范式如何把翻译/摘要统一成 seq2seq',
      '给出「为何 LLM 弃 encoder/enc-dec、全押 decoder-only」的取舍理由',
    ],
    `
### 三范式一张表

00098 缺口 M1-a 补的就是这张对照表——L02 给 LLM 定位在 decoder-only，这里把**另外两个范式**也讲清楚，并解释「为什么最后 LLM 选了 decoder-only」。

| 范式 | 代表 | 注意力 | 预训练目标 | 强项任务 | 弱点 |
|---|---|---|---|---|---|
| encoder-only | BERT（arXiv:1810.04805） | **双向**（看到全句） | 掩码语言建模 MLM + NSP | 判别/理解（分类、NER、QA 抽取） | 不能开放式生成 |
| encoder-decoder | T5（arXiv:**1910.10683**，非 1910.13461=BART） | 生成侧单向 | 去噪 seq2seq（span corruption） | 翻译、摘要（text→text） | 架构重、生成与理解分开 |
| decoder-only | GPT / LLaMA | 单向（因果） | next-token | 通用生成 + 指令 | 单向、不可编辑（M5 突破） |

### BERT：双向性带来的理解力

BERT 把**双向自注意力**（每个位置同时看左右）用于预训练，MLM 目标让模型从上下文里猜被遮住的词。双向让它在「给定整句、判断/抽取」这类任务上碾压单向模型——这是 encoder-only 的护城河。但它**天生只能「整句进、标签出」**，做不了「一句句往外吐字」的开放式生成，所以没法当对话 LLM。

### T5：一切皆 text-to-text

T5（注意正确 arXiv 号是 **1910.10683**；1910.13461 其实是 BART）把所有 NLP 任务统一成「文本进、文本出」：翻译、摘要、分类全写成 text→text，用一个 encoder-decoder 架构跑。去噪预训练（把 span 换成掩码）让它同时学理解与生成。代价是架构比 decoder-only 重（多一套 encoder），且 60M–11B 各档都要训 encoder+decoder 两套权重。

:::deep

### 为什么 LLM 弃了 encoder / enc-dec，全押 decoder-only

1. **统一性**：decoder-only 把「理解 + 生成 + 指令」全塞进同一个 next-token 目标，不用为不同任务换架构；而 BERT 只做判别、T5 要 encoder+decoder 两套，任务间不通用。
2. **代码与扩展性**：decoder-only 训练/推理同一套、scaling law 干净（参数量/数据量/算力三轴等比就好），扩到万亿参数最顺。
3. **数据组织**：纯生成目标只要「文本流」，不需要 T5 那种「输入→输出」成对标注，数据最好拿。
4. **指令跟随**：decoder-only 靠 in-context learning 一条 prompt 就能做下游任务（GPT-3 few-shot），encoder/enc-dec 每接一个新任务多半要重训头。

代价是 decoder-only **单向、不可编辑**（只能从左往右生成，改中段要整段重生成）——这正是 M5 扩散 LLM 要补的短板（M1-L11 谱系地图已标注）。

### 用一段代码把「三范式能不能生成」验证清楚

下面用一个最小的注意力模块，直观对比**双向**（BERT 式，看全句）与**因果**（decoder-only 式，只看左边）在「能否做开放式生成」上的差异：

\`\`\`python
import torch
import torch.nn as nn

def attention(x, causal=False):
    # x: [N, d]；N 个位置
    N = x.size(0)
    q = k = v = x
    s = q @ k.T / (q.size(-1) ** 0.5)            # [N, N] 全位置相似度
    if causal:
        s = s.masked_fill(~torch.tril(torch.ones(N, N).bool()), float('-inf'))
    return torch.softmax(s, dim=-1) @ v

# 双向（BERT）：第 0 位能看到后面所有位 → 强于「理解整句」，但生成会「偷看未来」
out_enc = attention(torch.randn(5, 8), causal=False)
# 因果（decoder-only）：第 0 位只能看自己 → 自回归，能逐 token 生成
out_dec = attention(torch.randn(5, 8), causal=True)
print("双向：位置0 的注意力权重（非 0 的个数）=", (out_enc[0] > 1e-6).sum().item())
print("因果：位置0 的注意力权重（非 0 的个数）=", (out_dec[0] > 1e-6).sum().item())
# 双向位置0 能注意到 5 个位；因果位置0 只能注意到 1 个位（自己）
\`\`\`

:::tip

### 三范式选型的实用结论

- **要理解/判别（分类、NER、句对相似度）**：encoder-only（BERT）仍是强项，双向性有护城河。
- **要「源文本→目标文本」（翻译、摘要）**：encoder-decoder（T5/BART）表达最自然，但架构重。
- **要通用生成 + 指令跟随（对话 LLM）**：decoder-only，一套权重多任务、scaling 干净、数据好组织——这是当代 LLM 的全押方向。
- **要可控/可编辑生成**：M5 扩散 LLM，突破自回归单向不可编辑的短板。

:::

### 三范式的「任务形态」差异，不是「好坏」差异

一个常见误读是把三范式排成「BERT < T5 < decoder-only 的进步阶梯」，其实它们是**任务形态不同**导致的架构选择，没有绝对的优劣：

- BERT 的任务形态是「**整句进、标签出**」——给定完整输入做判别/抽取，双向性让它能看到全句再判断，这是它的天然主场。
- T5 的任务形态是「**源文进、目标文出**」——翻译、摘要这种「改写」任务，需要 encoder 理解源、decoder 生成目标，text-to-text 是最自然的表达。
- decoder-only 的任务形态是「**条件序列进、续写目标出**」——生成 + 指令跟随，单向 next-token 把理解与生成统一进同一目标。

所以「为何 LLM 选了 decoder-only」不是因为「它比 BERT/T5 强」，而是因为**当代 LLM 要做的事（通用生成 + 一条 prompt 多任务 + 规模化扩展）恰好落在 decoder-only 的舒适区**：统一目标、代码同一套、数据只要文本流、scaling law 干净。如果任务只是「句对相似度分类」，BERT 至今仍是更轻更准的选择——范式选型跟着任务形态走，不是越新越好。

:::

### 一个常被追问的细节：decoder-only 做「理解」会不会吃亏

既然 decoder-only 是单向、只能从左往右读，那它做「理解/判别」（本该是双向 BERT 的强项）会不会就比 BERT 差？答案分两层：① **纯判别任务上 BERT 仍可能有微弱优势**——双向注意力确实比单向更适合「整句判断」；② **但 decoder-only 靠规模与 in-context 把这点劣势抹平了**——更大的参数 + next-token 目标 + 一条 prompt 组织任务，让 decoder-only 在「分类/抽取」这类任务上也达到可用水平，且**一套权重通吃理解与生成**。对「要同时做生成与理解」的 LLM 场景，这个「通吃」比「理解任务上微弱更优」更值钱，所以 LLM 仍全押 decoder-only。这也是 L02「同一个 next-token 目标撑起理解与指令」的工程结论。

:::
`,
    null,
    [
      {
        text: 'BERT 相对 decoder-only 的核心优势是？',
        options: ['能做开放式生成', '双向注意力，判别/理解任务更强', '参数更少', '天然外推长文本'],
        answer: 1,
        explain: 'BERT 双向看全句，理解/判别任务碾压单向模型，但做不了开放式生成。',
        concept: 'paradigm-compare',
      },
      {
        text: 'T5 把 NLP 任务统一成的形态是？',
        options: ['text-to-text（seq2seq）', '纯分类', '判别式', '只翻译'],
        answer: 0,
        explain: 'T5（1910.10683）把翻译/摘要/分类全写成文本进文本出，用 encoder-decoder 跑。',
        concept: 'paradigm-compare',
      },
      {
        text: '「1910.13461」这个 arXiv 号实际对应的是？',
        options: ['T5', 'BART', 'BERT', 'GPT-2'],
        answer: 1,
        explain: '1910.13461 是 BART；T5 正确号是 1910.10683（B5 批次官方 abs 页核验更正）。',
        concept: 'paradigm-compare',
      },
      {
        text: 'decoder-only 全押的理由里，**不属于**核心动机的是？',
        options: [
          '理解+生成+指令统一进 next-token',
          'scaling law 干净、代码同一套',
          '能双向理解（BERT 式）',
          '数据只要文本流最好拿',
        ],
        answer: 2,
        explain:
          'decoder-only 是单向的，「双向理解」恰恰是它**放弃**的（那是 BERT 的强项，也是它做不了的）。',
        concept: 'paradigm-compare',
      },
    ],
    [
      ['MLM', '掩码语言建模，BERT 的双向理解预训练目标'],
      ['span corruption', 'T5 的去噪 seq2seq 预训练：把 span 换掩码再补回'],
      ['text-to-text', 'T5 把一切任务统一成文本进文本出的范式'],
      ['decoder-only 取舍', '统一性/扩展性/数据/指令 四理由，代价是单向不可编辑'],
    ],
    [
      '以为 BERT 能做对话生成——它只能整句进、标签出，做不了开放式生成。',
      '记混 T5 的 arXiv 号——T5=1910.10683，1910.13461 是 BART（B5 已更正）。',
      '以为 encoder-decoder 一定比 decoder-only 强——架构重、不统一，通用生成上反占优在 decoder-only。',
      '把「decoder-only 单向」当成缺陷去补——它是取舍结果，可编辑短板由 M5 扩散 LLM 另解。',
    ],
  ),
  'theory',
)
