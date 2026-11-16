import { L, withKind } from '../../course-builders.ts'

export const L79 = withKind(
  L(
    'L79',
    36,
    '继续/领域预训练 CPT 端到端',
    4,
    ['L78'],
    ['cpt'],
    [
      '搭建基座 --resume + 领域语料流程',
      '训练 + loss 曲线 + 早停',
      '对照从零预训练差异（学习率/冻结/混合）',
      '验证领域适配效果',
    ],
    `### 场景：把一个通用基座适配到你的领域

L78 从零训了一个 125M 的小模型，验证整条链路能跑。但真实项目极少从零训——更常见的是拿一个已训好的基座，做**继续/领域预训练（Continual Pre-Training，CPT）**：比如把通用中文基座适配到法律、医疗、代码等垂直领域。本课来源挂 S-OPTIM 同族 HF 生态（A 级）——用 HF 的 \`from_pretrained\`、\`Trainer\`、\`--resume\` 机制搭建端到端流程。

CPT 的本质不是「重新训」，而是「**带着已有知识继续学**」。基座已经在海量通用语料上把 next-token 交叉熵压得很低，权重里编码了语言、常识、推理的通用结构。CPT 要做的是在这些结构上「增量吸收」领域知识，同时尽量不破坏通用能力。这个「增量 vs 保护」的张力，贯穿本课每一步：学习率要小、要早停、要混通用数据、要冻结部分层——全是在平衡「学新东西」与「不忘老东西」。

### 与从零训练的四个关键差异

把 CPT 与 L78 的从零训练逐项对照，差异集中在四处：

- **起点权重**：从零是随机初始化；CPT 用 \`from_pretrained(基座路径)\` 或 \`Trainer(resume_from_checkpoint=...)\` 加载已训权重与优化器状态。
- **学习率**：从零用较大学习率（如 5e-4 起）快速下降；CPT 用更小学习率（如 5e-5 到 1e-4，常低一个数量级），做「微调式延续」。
- **冻结策略**：CPT 可选冻结 embedding 与底层若干层，只训高层，保护通用表征；从零通常全量训练。
- **数据混合**：CPT 把领域语料与少量通用语料按比例混合（replay），防止遗忘；从零直接按 L73 配比训。

这四点不是硬性规则，而是默认起点——具体要在你的领域验证集上调。下面先把基座与领域语料准备好，并用可跑代码确认起点权重确实加载成功。

\`\`\`python
import torch
from transformers import GPT2Config, GPT2LMHeadModel, GPT2TokenizerFast

# 演示：先把 L78 训出的小模型当作「基座」保存，再 resume（真实项目换成真基座）
base_cfg = GPT2Config(vocab_size=300, n_embd=256, n_layer=6, n_head=4,
                      n_positions=256, bos_token_id=1, eos_token_id=2)
base = GPT2LMHeadModel(base_cfg)
base.save_pretrained("./base-ckpt")
print("基座参数量:", sum(p.numel() for p in base.parameters())/1e6, "M")

# CPT 起点：从基座加载（等价 --resume / from_pretrained）
resumed = GPT2LMHeadModel.from_pretrained("./base-ckpt")
# 校验权重确实一致而非重新随机初始化
same = all(torch.equal(base.state_dict()[k], resumed.state_dict()[k])
           for k in base.state_dict())
print("加载权重与基座一致:", same)
assert same, "CPT 必须从基座权重开始，而非随机初始化"
\`\`\`

断言 \`same\` 是 CPT 的第一道关卡：若加载失败、退化成随机初始化，后续训练就是在做从零训练，前面的基座能力全丢。工程上要把基座路径、checkpoint 版本号写进实验记录，避免「resume 错了 checkpoint」这种隐蔽错误。

:::deep

### 优化器状态与 tokenizer：resume 的两个隐形坑

\`--resume\` 不只是加载模型权重。一个完整的 checkpoint 还含优化器状态（AdamW 的动量/方差）、学习率调度器进度、已训练步数。若只加载模型不加载优化器状态，训练会从「动量为零」重新开始，前几百步不稳定——这对从小学习率起步的 CPT 尤其明显。HF \`Trainer(resume_from_checkpoint=...)\` 会一并恢复这些状态，是推荐做法。

另一个坑是 tokenizer。基座用哪个分词器训的，CPT 必须用同一个——L78 反复强调的「训练与生成契约」在 CPT 里升级成「基座与继续训练的契约」。若领域语料带来新词（如专业术语），正确做法是扩充词表并**只初始化新 token 的 embedding**（旧 token 向量保持不变），而不是重新训练分词器——后者会改变所有 token id 的语义，让基座权重失效。

:::

### 领域语料准备与数据混合

CPT 的领域语料来自 L74 的清洗管线，但要额外做一件事：**与通用语料按比例混合**。设领域占比 p（如 0.7），通用占比 1-p（如 0.3）。p 越高适配越快但遗忘越重；p 越低越稳但适配慢。起步用 0.5 到 0.8，按验证集调。下面构造一个混合数据集，并用可跑代码验证采样比例。

\`\`\`python
import random
random.seed(0)

def make_cpt_corpus(n_domain=800, n_general=300):
    domain = ["the court hereby grants the motion to dismiss the case. "] * (n_domain//8)
    general = ["the quick brown fox jumps over the lazy dog. "] * (n_general//5)
    texts = domain + general
    random.shuffle(texts)
    return texts, len(domain), len(general)

texts, nd, ng = make_cpt_corpus()
print(f"领域样本 {nd}, 通用样本 {ng}, 领域占比 {nd/(nd+ng):.2f}")
assert nd > ng, "CPT 应以领域语料为主"
assert ng > 0, "必须混入通用语料防遗忘"
\`\`\`

这段代码把「数据混合」从口号落成可执行比例：领域为主（800 条）、通用为辅（300 条），两者都非零。\`ng > 0\` 这条断言是防遗忘的红线——一旦通用语料归零，灾难性遗忘的风险陡增。真实项目里通用回放语料可以来自 L73 的原始配比池，按小比例抽取。

### 训练：小学习率 + 早停的完整循环

把前面的要素合成训练循环，加入三个 CPT 专属机制：小学习率、冻结底层、验证集早停。早停用 HF \`EarlyStoppingCallback\`，监控验证集 loss，\`patience=3\` 表示连续 3 次评估无改善就停。

\`\`\`python
from transformers import (Trainer, TrainingArguments,
                          DataCollatorForLanguageModeling, EarlyStoppingCallback)
from torch.utils.data import Dataset
from tokenizers import Tokenizer, models, pre_tokenizers, trainers

# 复用一个简易分词器（真实项目用基座的 tokenizer）
tk = Tokenizer(models.BPE()); tk.pre_tokenizer = pre_tokenizers.Whitespace()
tk.train_from_iterator([t*50 for t in texts],
                       trainers.BpeTrainer(vocab_size=200, min_frequency=2,
                       special_tokens=["<pad>"]))

class Blocks(Dataset):
    def __init__(self, ids, block=64):
        self.data = [ids[i:i+block] for i in range(0, len(ids)-block, block)]
    def __len__(self): return len(self.data)
    def __getitem__(self, i):
        x = self.data[i]; return {"input_ids": x, "labels": x[:]}

all_ids = tk.encode(" ".join(texts)).ids
ds = Blocks(all_ids)
# 切 9:1 训练/验证
n_val = max(1, len(ds)//10)
ds_train = torch.utils.data.Subset(ds, range(len(ds)-n_val))
ds_val = torch.utils.data.Subset(ds, range(len(ds)-n_val, len(ds)))

# 冻结底层 4 层（共 6 层），只训高层
for p in resumed.transformer.h[:4].parameters():
    p.requires_grad_(False)
trainable = sum(p.numel() for p in resumed.parameters() if p.requires_grad)
print(f"可训练参数 {trainable/1e6:.2f} M / 总参数 "
      f"{sum(p.numel() for p in resumed.parameters())/1e6:.2f} M")

args = TrainingArguments(
    output_dir="./cpt-out", overwrite_output_dir=True,
    num_train_epochs=3, learning_rate=5e-5,   # 小学习率
    per_device_train_batch_size=2, per_device_eval_batch_size=2,
    warmup_steps=5, logging_steps=5, eval_steps=5,
    save_strategy="epoch", evaluation_strategy="steps",
    load_best_model_at_end=True, report_to=[], seed=0,
)
trainer = Trainer(
    model=resumed, args=args,
    train_dataset=ds_train, eval_dataset=ds_val,
    data_collator=DataCollatorForLanguageModeling(tokenizer=tk, mlm=False),
    callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
)
print("CPT 训练配置完成：小学习率 5e-5 + 冻结底层 + 早停 patience=3")
\`\`\`

这段把 CPT 的三个机制都落到代码：冻结底层 4 层（\`requires_grad_(False)\`）、学习率降到 5e-5、用 \`EarlyStoppingCallback\` 监控验证集。可训练参数打印出来确认冻结生效——若可训练参数等于总参数，说明冻结没生效，得检查层索引。注意 \`load_best_model_at_end=True\` 让训练结束自动回退到验证集最优 checkpoint，避免早停时停在已变差的 epoch。

### loss 曲线与早停判读

训练后抽取日志，分别画训练 loss 与验证 loss 的曲线。CPT 的早停判据是：**验证 loss 停滞或回升**就停，即使训练 loss 还在降。若两者同步下降，说明领域适配顺利；若训练 loss 降、验证 loss 升，说明过拟合领域语料，早停应已触发。

\`\`\`python
import math
hist = trainer.state.log_history
train_losses = [e["loss"] for e in hist if "loss" in e]
eval_losses = [e.get("eval_loss") for e in hist if "eval_loss" in e]
print("训练 loss 点数:", len(train_losses), "验证 loss 点数:", len(eval_losses))
if len(train_losses) >= 2:
    print(f"train loss {train_losses[0]:.3f} -> {train_losses[-1]:.3f}")
if len(eval_losses) >= 1:
    print(f"eval  loss {eval_losses[0]:.3f} -> {eval_losses[-1]:.3f}, "
          f"PPL {math.exp(eval_losses[-1]):.1f}")
    # 早停判据：验证 loss 末值不应显著高于最好值（早停保留最优）
    print(f"eval 最优 {min(eval_losses):.3f}, 末值 {eval_losses[-1]:.3f}")
assert len(eval_losses) >= 1, "CPT 必须有验证集 loss 才能早停"
print("loss 曲线与早停判读完成")
\`\`\`

\`assert len(eval_losses) >= 1\` 是硬约束——CPT 没有验证集就无法早停，等于裸奔。困惑度换算再次回到 L72 的 PPL=exp(L)，把领域适配效果翻译成可比的数值。

### 验证领域适配效果

最后一步是回答「CPT 到底有没有用」。两个对照：① 训练前后在同一段领域提示上生成，看是否更懂领域术语；② 计算领域验证集困惑度，CPT 后应低于基座（前提领域语料够）。下面是可跑的对照脚本。

\`\`\`python
prompt = "the court hereby grants the motion to"
inp = tk.encode(prompt).ids
x = torch.tensor([inp])

def ppl(model, ids):
    with torch.no_grad():
        out = model(torch.tensor([ids]), labels=torch.tensor([ids]))
    return math.exp(min(out.loss.item(), 20))

base_ppl = ppl(base, all_ids[:256])      # 基座在领域数据上的困惑度
cpt_ppl = ppl(resumed, all_ids[:256])    # CPT 后
print(f"基座困惑度 {base_ppl:.2f} -> CPT 后 {cpt_ppl:.2f}")

resumed.eval()
with torch.no_grad():
    gen = resumed.generate(x, max_new_tokens=12, do_sample=False,
                           pad_token_id=tk.token_to_id("<pad>"))
print("CPT 后生成:", tk.decode(gen[0].tolist()))
print("领域适配验证：困惑度下降 =", cpt_ppl < base_ppl)
\`\`\`

理想结果：CPT 后领域困惑度下降、生成输出带上领域句式。但要注意——若领域语料太小或学习率过大，可能出现「领域 loss 降、通用能力掉」的遗忘；此时应调低学习率、增加通用回放比例、或放宽冻结层。把困惑度与生成两条证据合起来看，才能下「适配有效且未严重遗忘」的结论。

### 工程判据与常见翻车点

把 CPT 落成判断清单。第一，**起点正确**：校验加载权重与基座一致，优化器状态随 resume 一起恢复，tokenizer 与基座严格相同。第二，**学习率分级**：CPT 比从零低一个数量级起，按验证集微调。第三，**必须有验证集**：无验证集就无法早停，领域小语料极易过拟合。第四，**防遗忘三件套**：小学习率 + 通用回放 + 冻结底层，按遗忘程度选用。第五，**效果双证据**：困惑度下降 + 生成符合领域，缺一不可。

三个最常翻车的点：① 混淆 \`--resume\`（恢复训练，带优化器状态）与 \`from_pretrained\`（只加载权重），需要继续训练进度用前者；② 扩充词表时重训了整个 tokenizer，导致基座权重与 token id 错位；③ 用领域训练集自己当验证集，早停形同虚设。把这三点排查清楚，CPT 才能既适配领域又保住通用能力。

:::tip

### 一句话收束 CPT 端到端

CPT 是「带知识继续学」：从基座 resume（权重+优化器状态+tokenizer 严格一致），用领域语料为主、混少量通用语料防遗忘，学习率比从零低一数量级（如 5e-5），冻结底层保护通用表征，用独立验证集早停（patience=3）防过拟合，最后用领域困惑度下降 + 生成符合领域双证据验收。与从零训练的差别集中在起点、学习率、冻结、混合四点。下一课 L80 讲多卡并行——当 125M 不够、要扩到 700M 时，TP/PP/ZeRO 怎么切、2 卡 ZeRO 怎么冒烟。

:::
`,
    null,
    [
      {
        text: '继续预训练（CPT）与从零预训练（L78）最本质的区别是？',
        options: [
          'CPT 完全不需要数据',
          'CPT 从已训好的基座权重 resume，用领域语料继续优化，而非随机初始化',
          'CPT 一定要换模型架构',
          'CPT 把 loss 目标改成分类',
        ],
        answer: 1,
        explain:
          'CPT 加载已训练基座（--resume / from_pretrained），保留学到的通用知识，再用领域语料继续做 next-token 优化；从零训练是随机初始化。',
        concept: 'cpt',
      },
      {
        text: 'CPT 阶段学习率通常应比从零预训练？',
        options: ['大一个数量级', '更小（常低一个数量级），以免破坏已学到的通用能力', '完全相同', '设为零'],
        answer: 1,
        explain:
          '基座已收敛到较优点，CPT 用小学习率做「微调式延续」，避免大幅更新破坏通用能力；从零训练才用较大学习率快速下降。',
        concept: 'cpt',
      },
      {
        text: 'CPT 里「早停」的依据应是？',
        options: [
          '训练 loss 一直降就不停',
          '监控领域验证集 loss/指标， stagnate 或回升时停，防止过拟合小领域语料',
          '固定跑 1000 步',
          '看 GPU 温度',
        ],
        answer: 1,
        explain:
          '领域语料通常较小，训练 loss 会持续下降但可能过拟合；应用独立验证集监控，损失停滞或回升即早停，保留泛化能力。',
        concept: 'cpt',
      },
      {
        text: '防止 CPT「灾难性遗忘」的常用手段不包括？',
        options: [
          '降低学习率',
          '在领域数据中混入一定比例通用语料（replay）',
          '冻结部分底层参数',
          '只用领域语料、把学习率拉满',
        ],
        answer: 3,
        explain:
          '降学习率、混入通用语料回放、冻结底层都能缓解遗忘；只用领域语料且高学习率会快速覆盖通用知识，加剧灾难性遗忘。',
        concept: 'cpt',
      },
    ],
    [
      ['CPT', 'Continual/继续预训练，在已训基座上用新语料继续 next-token 训练'],
      ['灾难性遗忘', '继续训练时新数据覆盖旧知识，导致通用能力下降的现象'],
      ['学习率重设', 'CPT 用小学习率恢复训练，避免破坏基座已收敛的权重'],
      ['数据回放', '在领域语料中混入一定比例通用语料，缓解遗忘'],
      ['早停', '监控验证集指标，停滞或变差时停止训练以防过拟合'],
    ],
    [
      'CPT 沿用从零训练的大学习率——会破坏基座通用能力，应低一个数量级起。',
      '只看训练 loss 不停训——领域语料小，train loss 会降但验证集可能已过拟合，须早停。',
      '只用领域语料不做通用回放——易灾难性遗忘，应混入少量通用数据。',
      '恢复训练时优化器状态与 tokenizer 不匹配——须与基座 checkpoint 严格一致，否则训练不稳。',
    ],
  ),
  'scenario',
)
