import { L, withKind } from '../../course-builders.ts'

export const L78 = withKind(
  L(
    'L78',
    36,
    '从零预训练 125M 单卡冒烟',
    3,
    ['L77'],
    ['from-scratch-pretrain'],
    ['写出从零 125M 配置与分词器脚本', '跑通 HF Trainer 训练循环', '产出 loss 曲线', '做生成冒烟验证'],
    `### 从规划到落地：为什么要先做 125M 单卡冒烟

L77 把预算规划讲透：125M 参数按 Chinchilla 的 20 token/参数约配 2.5B token，训练算力在 1.9e20 FLOPs 量级。但直接上手训 700M（L82）风险太大——任何一处的 bug（分词器不匹配、shift 写错、数据管线错位）都要等到烧完算力才发现。工程上的标准做法是**先做单卡 125M 冒烟**：用极小的数据与步数把整条链路跑通，确认「数据→分词器→配置→Trainer→loss→生成」每一环都对，再放大规模。

本课来源挂 S-Transformer17 与 HF 生态（A 级）：结构用 Vaswani 等确立的 transformer decoder-only 范式，工具用 Hugging Face 的成熟实现。整课围绕一个可跑的最小工程展开，代码以「能离线演示 + 关键逻辑真实」为原则：数据构造、分词器训练、模型配置都在 CPU 上能跑；Trainer 循环给出真实脚本；loss 曲线用记录的数据画出；生成冒烟验证输出结构。

### 第一步：数据与分词器

预训练的第一环是数据（L74 已讲清洗）与分词器。这里用一个小的文本语料演示：先准备干净文本，再用 HF \`tokenizers\` 训练一个 BPE 分词器。**关键纪律：训练与推理必须用同一个分词器**，否则 token id 语义对不上，生成必然乱码。真实项目里要么从头训一个 BPE（如 Llama 的 SentencePiece），要么复用现成分词器，但绝不能训练用一个、生成用另一个。

\`\`\`python
# 演示语料：合成一段有重复结构的文本（真实项目换成 L74 清洗后的大语料）
corpus = (
    "the quick brown fox jumps over the lazy dog. " * 200 +
    "large language models learn from next token prediction. " * 200 +
    "machine translation and question answering are downstream tasks. " * 200
)
print("语料字符数:", len(corpus))

# 训练一个字符级 BPE 分词器（演示；大模型用 byte-level BPE / SentencePiece）
from tokenizers import Tokenizer, models, pre_tokenizers, trainers
tok = Tokenizer(models.BPE())
tok.pre_tokenizer = pre_tokenizers.Whitespace()
trainer = trainers.BpeTrainer(vocab_size=300, min_frequency=2,
                              special_tokens=["<pad>", "<bos>", "<eos>", "<unk>"])
tok.train_from_iterator([corpus], trainer=trainer)
print("词表大小:", tok.get_vocab_size())
ids = tok.encode("the quick brown fox").ids
print("编码 token ids:", ids[:12])
assert tok.get_vocab_size() <= 300
\`\`\`

这段代码在 CPU 上就能跑：合成语料有清晰的重复结构（三种句式各 200 遍），训练出一个词表不超过 300 的 BPE。真实场景把 \`corpus\` 换成 L74 产出的干净 token 流，词表放大到 32K 到 128K。分词器训练好后要保存（save），后续训练与生成都从同一份加载。

:::deep

### 分词器为什么是「训练与生成的契约」

tokenizer 定义了「文本 ↔ token id」的双向映射，是模型与语言之间的接口。模型的 embedding 层大小为 \`vocab_size × d_model\`，第 k 行对应 token id k 的向量——这个 k 的语义完全由训练时的分词器决定。生成时若换了分词器，同一个 id 指向不同的子词，输出就成了乱码。因此分词器必须和模型权重一起版本化、一起保存、一起加载。冒烟阶段最容易犯的错就是「训练用 train 出来的 tokenizer，生成时手滑用了默认的 GPT2Tokenizer」，id 语义错位，看起来在生成、其实全是噪声。把 tokenizer 与 checkpoint 绑定保存，是这条纪律的工程保障。

:::

### 第二步：从零写 125M 配置

有了分词器，接着写模型配置。125M 参数怎么拆成层数 L、隐藏维 d、头数 n_h？用 transformer 参数量近似 N≈12·L·d²（embedding 与投影另计，这里取主项反推）。取 L=12、d=768、n_h=12（每头 64 维），主项约 12·12·768²≈85M，加上词表embedding与输出投影（300×768×2≈0.46M）以及各层 bias/norm，量级接近百 M。为对齐 125M，常用配置是 L=12、d=768（GPT-2 125M/124M 的经典配置）。写成 HF 配置并打印参数量核对。

\`\`\`python
from transformers import GPT2Config, GPT2LMHeadModel

config = GPT2Config(
    vocab_size=tok.get_vocab_size(),
    n_positions=256,
    n_embd=768,          # 隐藏维 d
    n_layer=12,          # 层数 L
    n_head=12,           # 头数 n_h，d/n_h=64
    bos_token_id=1, eos_token_id=2,
)
model = GPT2LMHeadModel(config)
n_params = sum(p.numel() for p in model.parameters())
print(f"配置: L={config.n_layer}, d={config.n_embd}, heads={config.n_head}")
print(f"实际参数量 = {n_params/1e6:.2f} M")
# 125M 量级核对：允许 90M~160M 的偏差（取决于词表与实现）
assert 90e6 < n_params < 160e6, "应在百 M 量级"
print("配置自检通过")
\`\`\`

这段把「125M」从名字落成可核对的参数量。断言限定在 90M 到 160M，因为词表大小、是否绑定权重会让精确数浮动——重点是量级正确。这个模型从随机初始化开始，什么都不会，接下来的训练会把 next-token 交叉熵压下去。

### 第三步：跑通 HF Trainer 训练循环

用 HF \`Trainer\` 跑 causal LM。要点：① 把语料编码成 token id 序列并按块（block size）切成训练样本；② labels 直接等于 input_ids（GPT2LMHeadModel 内部对 causal LM 自动 shift，见 L72 的等价说明）；③ DataCollatorForLanguageModeling 处理动态 padding，pad 位置的 label 置 -100；④ 配置 TrainingArguments（学习率、步数、batch）。下面是完整可跑脚本（小步数冒烟）。

\`\`\`python
import torch
from torch.utils.data import Dataset
from transformers import (Trainer, TrainingArguments,
                          DataCollatorForLanguageModeling)

class TextBlocks(Dataset):
    def __init__(self, ids, block=128):
        self.examples = [ids[i:i+block]
                         for i in range(0, len(ids)-block, block)]
    def __len__(self): return len(self.examples)
    def __getitem__(self, i):
        x = self.examples[i]
        return {"input_ids": x, "labels": x[:]}   # causal LM 内部自动 shift

all_ids = tok.encode(corpus).ids
ds = TextBlocks(all_ids, block=128)
print("训练样本块数:", len(ds))
assert len(ds) > 0

collator = DataCollatorForLanguageModeling(
    tokenizer=tok, mlm=False)          # mlm=False -> causal LM, pad label=-100

args = TrainingArguments(
    output_dir="./smoke-125m", overwrite_output_dir=True,
    num_train_epochs=1, max_steps=60,        # 冒烟：只跑 60 步
    per_device_train_batch_size=2,
    learning_rate=5e-4, warmup_steps=5,
    logging_steps=10, save_strategy="no",
    report_to=[], seed=0,
)
trainer = Trainer(model=model, args=args,
                  data_collator=collator, train_dataset=ds)
result = trainer.train()
print("最终 train loss =", round(result.training_loss, 4))
\`\`\`

这段是训练主循环。注意 \`mlm=False\` 告诉 collator 走 causal LM（而非掩码语言模型），它会在 pad 位置填 -100 让这些位置不计入 loss。\`max_steps=60\` 是冒烟规模——真实训练按 L77 的规划跑到 D=2.5B token 对应的步数。运行后 loss 应从随机初始化的高位（约 log(300) 量级）明显下降。

### 第四步：产出 loss 曲线与困惑度

Trainer 的日志里记录了每 \`logging_steps\` 的 loss。把它抽出来画成曲线并换算困惑度（L72 的 PPL=exp(L)）。冒烟阶段用几步的 loss 下降验证「训练在起作用」，不追求收敛。

\`\`\`python
import math
# 模拟从 trainer.state.log_history 抽取的 loss（真实运行替换为实际日志）
log_history = trainer.state.log_history
losses = [e["loss"] for e in log_history if "loss" in e]
print("记录的 loss 点数:", len(losses))
if len(losses) >= 2:
    print(f"首步 loss={losses[0]:.3f}  末步 loss={losses[-1]:.3f}  "
          f"困惑度 {math.exp(losses[0]):.1f}->{math.exp(losses[-1]):.1f}")
    assert losses[-1] < losses[0], "训练后 loss 应下降"
# 文本版 loss 曲线（每个点打一行柱状示意）
if losses:
    m = max(losses)
    for i, l in enumerate(losses):
        bar = "#" * max(1, int(l / m * 30))
        print(f"step {i*10:3d}: {bar} {l:.3f}")
print("loss 曲线产出完成")
\`\`\`

断言 \`losses[-1] < losses[0]\` 是「训练有效」的最小证据。困惑度从首步到末步的下降，把抽象的 loss 翻译成直观的「等效候选数」变化。文本柱状图在没有 matplotlib 的环境也能打印，便于远程机器上快速看趋势。正式训练里把这份日志存盘，就是 L79 CPT 与 L82 capstone 要交的 loss 曲线证据。

### 第五步：生成冒烟验证

最后用训练好的模型续写一段，验证生成链路。用 \`generate\` 做贪心解码，把输出 token id 反解码回文本。冒烟的判据不是「生成得多好」，而是「输出从乱码变成有局部结构」——重复语料训练的模型应能续写出训练语料里的句式片段。

\`\`\`python
model.eval()
prompt = "the quick brown"
inp = torch.tensor([tok.encode(prompt).ids])
with torch.no_grad():
    out = model.generate(inp, max_new_tokens=20, do_sample=False,
                         pad_token_id=tok.token_to_id("<pad>"))
text = tok.decode(out[0].tolist())
print("提示:", prompt)
print("生成:", text)
generated_ids = out[0].tolist()[len(inp[0]):]
assert len(generated_ids) == 20, "应生成指定长度"
assert tok.token_to_id("<pad>") is not None, "分词器需含 pad token"
print("生成冒烟验证通过")
\`\`\`

生成长度断言与 pad token 检查，是冒烟阶段两个必查项：前者确认 \`generate\` 按预期产出，后者确认分词器契约完整。若生成仍是无意义 token 串，回头查三件事：分词器是否与训练一致、labels 是否被错误重复 shift、loss 是否真的下降了——这正是 L72 与本课反复强调的对齐纪律。

### 冒烟与第一轮真实训练的差距

必须清楚冒烟和正式训练的分界。冒烟跑 60 步、用的是几百条合成样本，loss 会降但模型远没学会语言；正式训练要按 L77 的规划把 token 喂到 2.5B 量级，步数高出几个数量级，并配 warmup、学习率衰减、梯度累积与 checkpoint。两者的关系是「先证明管线对，再投入算力放大」——若在冒烟阶段就发现 shift 或分词器问题，改一行代码即可；若拖到正式训练才发现，损失的是成倍的算力。因此冒烟阶段要把每一环的断言写全：参数量量级、样本块数、loss 下降、生成长度、pad token 存在，任何一个不满足都不要进入放大阶段。

另一个容易忽略的点是数据配比。本课的合成语料只有三种句式，模型很容易「背下来」而显得 loss 很低——这是过拟合到小语料的假象。真实训练要用 L73 的多源配比、L74 的干净数据，并划出验证集监控泛化。冒烟阶段看到漂亮 loss 不要误以为模型强，那只说明它能拟合重复模式；把「冒烟 loss 下降」与「真实能力」分开看，是进入 L79 领域适配与 L81 能力探针前必须建立的判断力。

:::tip

### 一句话收束 125M 单卡冒烟

从零预训练链路：干净语料（L74）→ 训练 BPE 分词器（训练与生成必须同一个）→ 写 GPT2Config（L=12、d=768、n_h=12，约百 M 参数，用断言核对量级）→ GPT2LMHeadModel（内部自动 shift，labels 直接等于 input_ids）→ Trainer 跑 causal LM（\`mlm=False\`、pad label=-100、冒烟 60 步）→ 抽 loss 曲线并换算困惑度 → 生成冒烟验证。冒烟目的是跑通链路，不是追效果；loss 下降 + 生成有局部结构即达标。下一课 L79 讲在已训好的基座上做继续/领域预训练 CPT，与从零训练的差别在学习率、冻结与数据混合。

:::
`,
    null,
    [
      {
        text: '从零预训练一个 GPT 风格模型，正确的步骤顺序是？',
        options: [
          '先训练再准备数据',
          '数据→分词器→模型配置→Trainer 训练→loss 曲线→生成冒烟',
          '直接微调现成模型',
          '只配置不训练',
        ],
        answer: 1,
        explain:
          '从零预训练的链路：准备干净语料、训练/加载 tokenizer、写模型配置（层数/隐藏维/头数）、用 Trainer 跑 causal LM 训练、记录 loss 曲线、最后生成验证。',
        concept: 'from-scratch-pretrain',
      },
      {
        text: '用 GPT2LMHeadModel 做 causal LM 训练时，标签应如何设置？',
        options: [
          'labels 与 input_ids 完全相同，无需 shift',
          '模型内部对 causal LM 自动做 shift，把 input_ids 同时作为 labels 传入即可',
          '标签要随机打乱',
          '只标注最后一个 token',
        ],
        answer: 1,
        explain:
          'HF 的 GPT2LMHeadModel 在前向里对 causal LM 自动把 logits 与 labels 错位一位求交叉熵，因此把 input_ids 复制成 labels 传入即可，无需手动 shift（与 L72 的手写 shift 等价）。',
        concept: 'from-scratch-pretrain',
      },
      {
        text: '125M 模型与 L77 的 Chinchilla 规划如何对应？',
        options: [
          '125M 参数按 D/N≈20 约配 2.5B token，属训练算力的小规模冒烟验证',
          '125M 必须训 1.4T token',
          '125M 与 token 数无关',
          '125M 指显存大小',
        ],
        answer: 0,
        explain:
          '按 Chinchilla 的 20 token/参数，125M 约配 2.5B token；冒烟阶段用更小的子集验证管线可跑，再放大到完整预算。参数量单位 M 是百万参数。',
        concept: 'from-scratch-pretrain',
      },
      {
        text: '生成冒烟验证时，判断「训练有效」的合理迹象是？',
        options: [
          'loss 从头到尾不变',
          'loss 明显下降，生成输出从乱码变成通顺、有局部结构的文本',
          '困惑度持续上升',
          '完全随机输出',
        ],
        answer: 1,
        explain:
          '训练有效的标志：loss 曲线随步数下降、困惑度下降，生成从随机 token 逐步变成有词法/句法结构的文本——这是能力涌现的最初迹象（L81 会做更细的能力探针）。',
        concept: 'from-scratch-pretrain',
      },
    ],
    [
      ['GPT2Config', 'HF 中描述 decoder-only transformer 结构的配置对象（层数、头数、隐藏维等）'],
      ['GPT2LMHeadModel', '带词表投影头的 causal LM 模型，前向自动做 next-token 的 shift 交叉熵'],
      ['Trainer', 'HF 的训练循环封装，处理数据加载、优化器、日志与 checkpoint'],
      ['BPE 分词器', '字节对编码，把文本切成子词 token，是 GPT 系列的标准分词方式'],
      ['冒烟测试', '用极小数据/步数跑通整条链路，验证管线正确而非追求效果'],
    ],
    [
      '以为用 GPT2LMHeadModel 还要手动 shift labels——HF 内部已对 causal LM 自动错位，重复 shift 会错。',
      '训练与推理的分词器不一致——必须用同一个 tokenizer，否则 token id 对不上、生成乱码。',
      '冒烟阶段就追求 loss 收敛到很低——冒烟目的是跑通链路，效果和预算留给正式训练。',
      '忽略 pad token——batch 训练要设置 padding 并让 labels 在 pad 位置为 -100，否则 pad 位置也参与 loss。',
    ],
  ),
  'practice',
)
