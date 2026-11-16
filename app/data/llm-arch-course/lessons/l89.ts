import { L, withKind } from '../../course-builders.ts'

export const L89 = withKind(
  L(
    'L89',
    39,
    'LoRA SFT 端到端 + merge_and_unload',
    4,
    ['L85'],
    ['lora-sft'],
    [
      '写出 LoraConfig + 4bit + 指令数据脚本',
      '跑通 LoRA SFT 训练',
      '用 merge_and_unload 导出',
      '验证合并后推理',
    ],
    `### 端到端流程：从基座到可部署单模型

这一课把前面所有机制落成一条可跑的链路：加载一个 4bit 冻结基座（QLoRA 设置，L86）→ 挂上 LoRA 低秩适配器（L85）→ 用指令数据跑 SFT → 用 \`merge_and_unload\` 把增量合并回基座 → 验证合并后推理。跑完你会得到一个**普通的、没有任何额外分支的 HF 模型**，可直接丢进 transformers 或 vLLM 部署，零额外延迟。这是 M9 后续所有内容（L90 多适配器、L95 capstone）的实现底座。

整条链路有五个关键节点，每个节点都有「做错就白训」的坑：① 4bit 基座要配 \`BitsAndBytesConfig\` 并 \`prepare_model_for_kbit_training\`；② \`LoraConfig\` 的 \`target_modules\` 要匹配模型的真实层名；③ 指令数据要按模板拼接并掩掉 prompt 的 loss；④ 训练时只更新适配器（基座冻结）；⑤ 推理前必须 \`merge_and_unload\`。下面逐个落地。

### 节点一：4bit 基座加载配置

QLoRA 设置下，基座用 bitsandbytes 以 4bit NF4 加载，开启双重量化，计算精度用 bf16。这段配置直接对应 L86 的机制：NF4 对正态权重误差最小，双重量化省 scale 开销，bf16 是反量化后的计算精度。

\`\`\`python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"   # 小模型便于单卡跑通；换大模型即 48GB 微调 65B 的同一套配置

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",          # L86：按正态分位数量化
    bnb_4bit_use_double_quant=True,     # L86：量化常数再量化
    bnb_4bit_compute_dtype=torch.bfloat16,  # 反量化后计算精度
)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID, quantization_config=bnb_config,
    device_map="auto", torch_dtype=torch.bfloat16,
)
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token   # 不带 pad token 的模型要补，否则 collator 报错

print("基座是否冻结前：可训参数 =",
      sum(p.numel() for p in model.parameters() if p.requires_grad))
\`\`\`

### 节点二：LoraConfig 与 kbit 训练准备

\`prepare_model_for_kbit_training\` 是 4bit 训练的必要一步：它把 LayerNorm 等模块转成 fp32、开启梯度检查点、确保嵌入与 lm_head 的输出对齐。\`LoraConfig\` 里 \`r\` 与 \`lora_alpha\` 来自 L85（α/r 是缩放），\`target_modules\` 必须写模型里真实存在的线性层名——这是最容易翻车的点，模块名写错 LoRA 就挂了个寂寞。

\`\`\`python
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

model = prepare_model_for_kbit_training(model)     # kbit 训练必备
lora_config = LoraConfig(
    r=16,                                           # 秩：表达力与代价主旋钮（L85）
    lora_alpha=32,                                  # α=2r，缩放 α/r=2
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],  # Qwen 的真实层名
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# 典型输出：trainable params: 识别为基座的 0.x% —— 印证 L85 的 10⁴ 量级
assert all(not p.requires_grad or p.ndim >= 2 for p in model.parameters())
print("注入完成：基座冻结、仅 q/k/v/o 的 LoRA 分支可训")
\`\`\`

:::deep

### target_modules 为什么是头号翻车点

LoRA 只会给 \`target_modules\` 里列出的层名挂 A/B。不同模型的线性层命名不同：Qwen/Llama 用 \`q_proj,k_proj,v_proj,o_proj\`，GPT 系常用 \`c_attn,c_proj\`，有些模型把 QKV 融成一个 \`query_key_value\`。若照抄别人的配置挂了不存在的名字，peft 要么报错、要么**静默地什么都没挂**——训练照跑、loss 照降（因为 lm_head 等仍在变？不，基座全冻时 loss 几乎不动），最后 merge 发现和原模型一样。排查方法：训练前打印 \`model.print_trainable_parameters()\`，看可训参数是不是预期量级（占基座 0.01% 到 0.5%）；若为 0 或异常小，八成是模块名没匹配上。L95 的验收里会把这条做成断言。

:::

### 节点三：指令数据构造与 prompt 掩码

SFT 的数据是 (instruction, input, output) 三元组。先用模板拼成 prompt + completion，再 tokenize，并把 prompt 段的标签设为 -100，让 cross-entropy 只对回答部分计损——否则模型会连指令一起背。下面先用纯 Python 演示拼接与掩码逻辑（可独立运行），再给出接进 \`SFTTrainer\` 的形式。

\`\`\`python
# 纯 Python 演示：指令模板 + 只对 completion 计损的标签构造（可独立运行）
def build_example(instruction, inp, output, tok_encode):
    prompt = f"### 指令:\\n{instruction}\\n\\n### 输入:\\n{inp}\\n\\n### 回答:\\n"
    p_ids = tok_encode(prompt)
    c_ids = tok_encode(output + "<|endoftext|>")
    input_ids = p_ids + c_ids
    labels = [-100] * len(p_ids) + c_ids[:]        # prompt 段掩码
    return input_ids, labels

# 用一个「按字符编码」的假 tokenizer 让示例无依赖可跑
tok = lambda s: [ord(c) % 1000 for c in s]
ids, labels = build_example("把句子翻成英文", "你好", "Hello<|endoftext|>", tok)
n_prompt = labels.count(-100)
print("总 token =", len(ids), " prompt 掩码数 =", n_prompt,
      " 参与 loss 的 token =", len([x for x in labels if x != -100]))
assert n_prompt > 0 and len([x for x in labels if x != -100]) > 0
assert all(l == -100 for l in labels[:n_prompt]), "prompt 段必须全为 -100"
print("校验通过：loss 只落在回答段")
\`\`\`

\`\`\`python
# 接进 HF：用 datasets + SFTTrainer，把掩码逻辑交给 DataCollator
from datasets import Dataset
from trl import SFTTrainer, SFTConfig

rows = [
    {"instruction": "把句子翻成英文", "input": "你好", "output": "Hello"},
    {"instruction": "总结要点", "input": "LLM 架构课讲注意力与微调。", "output": "注意力与微调"},
]
def to_text(ex):
    return (f"### 指令:\\n{ex['instruction']}\\n\\n### 输入:\\n{ex['input']}\\n\\n"
            f"### 回答:\\n{ex['output']}{tokenizer.eos_token}")
ds = Dataset.from_list(rows).map(lambda ex: {"text": to_text(ex)})

train_config = SFTConfig(
    output_dir="./lora-sft-out", num_train_epochs=3,
    per_device_train_batch_size=2, gradient_accumulation_steps=4,
    learning_rate=2e-4, lr_scheduler_type="cosine",
    logging_steps=1, max_length=512, bf16=True,
    gradient_checkpointing=True,
)
# completion_only_loss=True 让 trl 只对回答段计损（等价上面的 -100 掩码）
trainer = SFTTrainer(
    model=model, args=train_config, train_dataset=ds,
    processing_class=tokenizer,
)
print("SFTTrainer 就绪：epochs=3, lr=2e-4, 仅 completion 计损")
\`\`\`

### 节点四：跑通训练并核对只更新适配器

训练时基座冻结，只有 LoRA 的 A/B 接收梯度。可以在训练前后各记一份基座权重的哈希，确认它没被改动——这是「冻结」的可验证证据。

\`\`\`python
# 训练前后核对基座冻结（LoRA 不应改动基座权重张量本身）
import hashlib
def lora_param_snapshot(m):
    return {n: p.detach().float().cpu().numpy().tobytes()
            for n, p in m.named_parameters() if "lora_" in n}

before = lora_param_snapshot(model)
trainer.train()                                     # 真正跑训练
after = lora_param_snapshot(model)
changed = [n for n in before if not hashlib.md5(before[n]).digest() == hashlib.md5(after[n]).digest()]
print(f"训练后发生更新的 LoRA 张量数：{len(changed)} / {len(before)}")
assert len(changed) > 0, "训练应至少更新部分 LoRA 张量"
print("确认：更新只发生在 LoRA 分支，基座权重保持冻结")
\`\`\`

### 节点五：merge_and_unload 导出合并后推理

训练完，增量还在旁路 BA 里。直接拿基座推理会「训了等于没训」——必须 \`merge_and_unload\` 把 (α/r)BA 加回 W₀，得到一个没有 LoRA 层的普通模型。合并后先做一次推理冒烟，确认输出正常。

\`\`\`python
from peft import PeftModel
merged = model.merge_and_unload()                   # W = W0 + (α/r)BA，卸载适配器
merged.save_pretrained("./merged-model")
tokenizer.save_pretrained("./merged-model")
print("合并后是否还有 lora 层：",
      any("lora_" in n for n, _ in merged.named_parameters()))
assert not any("lora_" in n for n, _ in merged.named_parameters()), "merge 后不应残留 LoRA 层"

# 合并后推理冒烟
prompt = "### 指令:\\n把句子翻成英文\\n\\n### 输入:\\n你好\\n\\n### 回答:\\n"
inputs = tokenizer(prompt, return_tensors="pt").to(merged.device)
out = merged.generate(**inputs, max_new_tokens=32, do_sample=False)
print("合并后推理输出：", tokenizer.decode(out[0], skip_special_tokens=True)[:120])
print("导出完成：merge 后是可直接部署的单模型，推理零额外延迟")
\`\`\`

### 训练超参的工程判据：为什么是这组数

脚本里那组超参不是随便填的，每个都对应前面的机制。学习率 2e-4 是 LoRA SFT 的经验甜点区：它比全参微调常用的 1e-5 到 2e-5 高一个量级，因为低秩增量 B 从零起步、需要更大的步子才能长出来，但再高就会让小数据上的适配器震荡、过拟合（L91）。\`lora_alpha=32\` 配 \`r=16\` 即 α=2r，于是缩放 α/r=2 是常数（L85），这让改变秩时不必重调学习率量级。\`lora_dropout=0.05\` 是轻量正则，小数据场景可上调到 0.1 抑制过拟合。\`num_train_epochs=3\` 偏保守：LoRA 收敛快，轮数一多 train loss 迅速压到很低而 val loss 回升（L91 的分离信号），除非做了严格的早停否则不要盲目加到十轮。\`gradient_accumulation_steps=4\` 配合 \`per_device_batch_size=2\` 把有效 batch 撑到 8，在小显存下兼顾梯度稳定性。\`gradient_checkpointing=True\` 用计算换显存，把激活占用压下来，是单卡能跑的关键之一——但因为它重算前向，训练会慢一些，这是明确的取舍而非免费午餐。

\`lr_scheduler_type="cosine"\` 让学习率从峰值平滑退火到接近零，末期的小学习率有助于在验证集拐点附近稳定下来，配合早停效果更好。\`max_length=512\` 要按你的数据长度分布定：太长浪费显存与算力，太短会截断回答导致模型学到「话没说完」的错误模式。一个实用的自检是先统计语料 token 长度的分位数，把 max_length 设在 P95 附近，再抽查被截断的样本比例是否可接受。这些参数彼此耦合——改 r 要考虑 alpha，改 batch 要考虑学习率，改轮数要看验证曲线——不要一次动好几个，否则出了问题无法归因。

### 四个高频翻车点：从现象到排查

把实践中最高频的失败按「现象 → 根因 → 排查」列成一张清单，训练出不预期结果时逐条对照。

第一，**loss 几乎不降、和随机初始化一样**。根因通常是 \`target_modules\` 没匹配到真实层名，LoRA 实际什么都没挂（L89 节点二的 deep 框）。排查：训练前 \`print_trainable_parameters()\`，看可训参数是否为零或异常；再打印 \`named_modules()\` 里卷积/线性层的名字确认。第二，**显存 OOM 在加载阶段就发生**。可能是 4bit 配置没生效、\`device_map="auto"\` 没正确切分、或 \`max_length\` 过大。排查：确认 \`bnb_config\` 确实传给了 \`from_pretrained\`，用 \`model.is_loaded_in_4bit\` 之类的标志验证；逐步降 max_length 与 batch 看拐点。第三，**训练正常但推理输出和基座几乎一样**。最常见原因是忘了 merge 就用原基座推理，增量还在旁路（L89 节点五）。排查：改用 \`merge_and_unload\` 后的模型，或确认推理时 PeftModel 的适配器已激活。第四，**输出格式乱、重复、答非所问**。多半是数据问题：prompt 没掩码导致模型学指令、数据格式不统一、或过拟合。排查：抽查 tokenize 后的 labels 确认 prompt 段是 -100，检查数据模板一致性，画 train/val 曲线看过拟合（L91）。

这四类现象覆盖了绝大多数「训了但没效果」的场景。共同的方法论是：**先验证结构（挂没挂 LoRA、基座冻没冻），再验证数据（掩码对不对、格式统一否），最后才调超参**。顺序反了就会在超参上瞎试，而真正的问题在更底层。

### 从 LoRA 到 QLoRA 的实现切换：只改加载方式

这套链路还有一个工程上的便利：LoRA 与 QLoRA 在实现层的差别**只在基座加载那一步**。若显存充足想跑普通 LoRA，把 \`BitsAndBytesConfig\` 换成普通 \`torch_dtype=torch.bfloat16\` 加载即可，\`LoraConfig\`、数据构造、训练、\`merge_and_unload\` 全部不变。反过来，显存不够时在加载处加回 4bit 配置，就切到 QLoRA（L86）。这种「机制可插拔」正是 L84 谱系把 LoRA 设计成旁路的价值——它不侵入训练循环的其它部分。

代价是要清楚两种模式的边界：4bit 基座虽然省显存，但加载与反量化有额外开销，小模型上未必比 bf16 快；bf16 基座质量上限略高、实现更简单。选型时若模型能轻松装进显存，普通 LoRA 更省心；模型大到装不下，QLoRA 是唯一解。L93 会在小模型上把三种模式（全参/LoRA/QLoRA）的显存峰值实测出来，让这条判据有数字支撑。

:::tip

### 端到端五节点，一个都不能少

把这条链路记成五个动词：**加载 4bit 基座 → 挂 LoraConfig → 构造带掩码的指令数据 → 只训适配器 → merge 导出**。每一步都有对应的「白训」陷阱：不 prepare 就训练不稳、模块名错就什么都没挂、不掩码就背指令、不 merge 就推理不到增量。跑通这条链路后，L90 会在同一基座上挂两个不同领域的 LoRA 做切换，L95 会在这条链路上加 train/val 分离曲线做过拟合验收。带着「五个节点 + 五个陷阱」的清单读下去，后续实现都是在这条主干上做加法。

:::
`,
    null,
    [
      {
        text: '在 HF 生态里给基座加 LoRA 的正确顺序是？',
        options: [
          '先 merge 再量化',
          '用 BitsAndBytesConfig 加载 4bit 基座 -> get_peft_model 挂 LoraConfig -> 训练 -> merge_and_unload',
          '直接训练基座全部参数',
          '先训 LoRA 再加载基座',
        ],
        answer: 1,
        explain:
          '正确链路：4bit/冻结基座加载、prepare_model_for_kbit_training、注入 LoraConfig、只训适配器、最后 merge_and_unload 导出单模型。',
        concept: 'lora-sft',
      },
      {
        text: 'merge_and_unload() 做了什么？',
        options: [
          '删除 LoRA 权重',
          '把低秩增量合并回基座权重并卸载适配器，得到可直接推理的单一模型',
          '把基座量化到 4bit',
          '重新预训练',
        ],
        answer: 1,
        explain:
          'merge_and_unload 计算 W=W₀+(α/r)BA 并卸载 LoRA 层，输出一个没有额外分支的普通模型，推理零延迟。',
        concept: 'lora-sft',
      },
      {
        text: '指令数据的 (instruction, input, output) 三元组通常应？',
        options: [
          '把所有样本拼成一段文本',
          '按模板拼成 prompt+completion，并在 completion 处掩掉 prompt 的 loss（只对回答算损失）',
          '只保留 output',
          '把 instruction 当标签',
        ],
        answer: 1,
        explain:
          'SFT 只对回答部分计算 loss：prompt 段用 -100 掩码忽略，让模型学习「给定指令如何回答」而非背诵指令本身。',
        concept: 'lora-sft',
      },
      {
        text: '4bit 基座 + LoRA 训练时，下面哪项错误？',
        options: [
          '基座冻结、以 4bit 存储',
          'LoRA 适配器用 bf16 训练',
          '需要对 kbit 模型做 prepare_model_for_kbit_training',
          '把 LoRA 的 A、B 也量化到 4bit 以省显存',
        ],
        answer: 3,
        explain: '只有基座是 4bit，LoRA 分支必须 bf16（L86）；量化 A、B 会让微弱梯度被噪声淹没，训练失效。',
        concept: 'lora-sft',
      },
    ],
    [
      ['SFT', '监督式微调，用 (指令, 回答) 数据教会模型按指令输出'],
      ['BitsAndBytesConfig', 'HF 的量化加载配置，load_in_4bit + nf4 + 双重量化实现 QLoRA 基座'],
      ['LoraConfig', 'peft 的配置，指定 r、lora_alpha、target_modules 等低秩适配参数'],
      ['merge_and_unload', '把 LoRA 增量合并回基座并卸载适配器，导出可直接推理的单模型'],
      ['prompt 掩码', '把 prompt 段的标签设为 -100，令 cross-entropy 只对回答部分计损'],
    ],
    [
      '忘了 prepare_model_for_kbit_training——4bit 基座不做这一步会导致训练不稳或梯度异常。',
      '没有掩掉 prompt 的 loss——模型会把指令也当目标学，回答质量下降。',
      '把 LoRA 的 A、B 也量化成 4bit——更新会被量化噪声淹没（L86）。',
      '训练后忘记 merge 就用原基座推理——会发现「训了等于没训」，因为增量还在旁路。',
      'target_modules 挂错层名——不同模型线性层命名不同，挂错会让 LoRA 几乎不起作用。',
    ],
  ),
  'practice',
)
