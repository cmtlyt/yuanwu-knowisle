import { L, withKind } from '../../course-builders.ts'

export const L105 = withKind(
  L(
    'L105',
    47,
    'merge_and_unload 代数折回 + 规范保存',
    2,
    ['L89'],
    ['weight-merge'],
    [
      '推导 merge_and_unload 的 W₀+(α/r)BA 折回',
      '讲清 save_pretrained 产物',
      '说明 safetensors/config/tokenizer 三件套',
      '解释合并的数值精度',
    ],
    `### 为什么对齐完要「折回」

M10 的 DPO 对齐用 LoRA 只训低秩增量（L101 的 \`peft_config=LoraConfig()\`），训练产物是「冻结基座 + 一对小矩阵 A、B」。这种形态适合训练，却不适合直接部署：推理时每次线性层都要算 \`W₀x + (α/r)·B(Ax)\` 两条分支，框架还得知道哪里挂了适配器。若把增量**代数折回**基座，得到一个普通权重矩阵，推理就退化成一次标准线性变换——任何推理框架都能直接加载，后续量化（L106/L109）与编译（L107）也都建立在「单一权重」之上。\`merge_and_unload\` 做的就是这件事。

:::deep

### 代数折回：为什么 W₀ + (α/r)·BA 等价

LoRA 把权重更新约束为低秩分解：ΔW = B·A，其中 A 形状 (r, d)、B 形状 (d, r)，r 远小于 d；实际缩放是 (α/r)。前向传播是：

y = W₀x + (α/r)·B·A·x

矩阵乘法满足分配律，把两项合并：

y = [ W₀ + (α/r)·B·A ] · x = W_merged · x

于是定义 **W_merged = W₀ + (α/r)·BA**，就把「主分支 + 旁路」折成**一个**矩阵。注意折回是**数学等价**的——合并前后对任意 x 的输出应完全相同，差异只来自浮点数舍入。这也是验证合并是否正确的判据：拿同一输入跑合并前后，输出要几乎逐元素相等。\`merge_and_unload\` 的「unload」指的是折回后把适配器从模型结构里摘掉，此后模型不再有 LoRA 分支。

:::

### 可跑代码：手动折回与等价性验证

下面用 NumPy 把折回过程完整算一遍，并用 \`np.allclose\` 验证「双分支」与「单矩阵」输出等价。

\`\`\`python
import numpy as np
np.random.seed(0)
d, r = 8, 2
W0 = np.random.randn(d, d).astype(np.float32) * 0.1
A = np.random.randn(r, d).astype(np.float32) * 0.1   # (r, d)
B = np.random.randn(d, r).astype(np.float32) * 0.1   # (d, r)
alpha = 4.0

dW = (alpha / r) * (B @ A)          # 低秩增量 (d, d)
W_merged = W0 + dW                  # 折回：W₀ + (α/r)·BA

x = np.random.randn(d).astype(np.float32)
y_lora   = W0 @ x + dW @ x          # 合并前：主分支 + 旁路
y_merged = W_merged @ x             # 合并后：单矩阵
print("双分支与单矩阵最大差:", float(np.max(np.abs(y_lora - y_merged))))
print("增量 ΔW 的 Frobenius 范数:", round(float(np.linalg.norm(dW)), 4))
assert np.allclose(y_lora, y_merged, atol=1e-6), "折回应与双分支数学等价"
assert np.linalg.norm(dW) > 0, "LoRA 增量不应为零"
\`\`\`

\`W_merged\` 的形状与 \`W0\` 完全一致（d × d），这就是「折回」的意义：不增参数量、不改结构，只是把旁路吸收进主权重。范数量化了这个 LoRA 适配器改了多少——若接近零，说明该层几乎没学到东西。

### save_pretrained 产物：三件套

合并后调用 \`model.save_pretrained(dir)\` 与 \`tokenizer.save_pretrained(dir)\`，产出一个**自包含**的模型目录，推理框架只靠这个目录就能加载。关键三件套：

1. **权重文件**：推荐 \`model.safetensors\`。相比 pickle 格式的 \`.bin\`，safetensors 只存张量、不会在加载时执行任意代码，且内存映射加载更快、更安全。
2. **config.json**：描述结构——\`model_type\`、\`hidden_size\`、\`num_hidden_layers\`、\`torch_dtype\`、\`architectures\` 等。框架据此重建网络形状并把权重对号入座。
3. **分词器文件**：\`tokenizer.json\`、\`vocab.json\`、\`tokenizer_config.json\`、\`special_tokens_map.json\` 等，定义词表与特殊 token。缺了它，模型加载成功也无法正确把文本转成 token id。

下面模拟三件套的落盘与自检。

\`\`\`python
import os, json, numpy as np
out = "./merged-model"
os.makedirs(out, exist_ok=True)

# safetensors：真实用 safetensors.torch.save_file；这里用 npy 示意「权重已单独成文件」
np.save(os.path.join(out, "model.weights.npy"), W_merged)
config = {
    "model_type": "llama", "hidden_size": d, "num_hidden_layers": 4,
    "torch_dtype": "float16", "architectures": ["LlamaForCausalLM"],
}
with open(os.path.join(out, "config.json"), "w", encoding="utf-8") as f:
    json.dump(config, f, ensure_ascii=False, indent=2)
tok = {"vocab_size": 32000, "model_max_length": 4096, "pad_token": "<pad>"}
with open(os.path.join(out, "tokenizer_config.json"), "w", encoding="utf-8") as f:
    json.dump(tok, f, ensure_ascii=False, indent=2)

files = sorted(os.listdir(out))
print("产物清单:", files)
assert {"config.json", "model.weights.npy", "tokenizer_config.json"} <= set(files)
print("三件套齐备：权重 + 配置 + 分词器")
\`\`\`

这段把「三件套」从概念落到可勾选的文件清单。真实项目里还会有 \`generation_config.json\`（采样默认值）等附加文件，但**权重、config、分词器**是最小可加载集。

三件套里最容易出问题的是权重格式。老项目常用 \`.bin\`（pickle 序列化），加载时会执行反序列化逻辑，存在供应链风险；safetensors 只存张量二进制与头部元数据，加载时不执行任何代码，内存映射还能按需取张量、加载更快。若合并脚本输出的是 \`.bin\`，用 \`safetensors.torch.save_file\` 转一遍再交付部署链路。另一个常被忽略的点是 dtype 一致性：config.json 里声明的 \`torch_dtype\` 要与权重实际 dtype 匹配，否则推理框架可能按错误精度加载——例如权重是 fp16 而 config 写成 bf16，数值会被错误解释。合并后做一次「加载回来跑一句生成」的冒烟，能同时验证三件套是否齐全、dtype 是否一致、分词器是否配套，这一步花不了多少时间，却能挡掉 M11 部署环节大半的加载失败。

### 合并的数值精度

折回最容易被忽视的是精度。基座常以 bf16/fp16 训练与存储，LoRA 增量也以半精度保存；若直接拿半精度 \`W0 + dW\` 相加，低位有效数字会在加法中丢失，合并后输出与训练时的双分支产生可见偏差。稳妥做法是**先把 W₀ 与 ΔW 提升到 fp32 做加法，再降回目标 dtype**。

\`\`\`python
import numpy as np
merged_f32 = W0.astype(np.float32) + dW.astype(np.float32)   # fp32 累加
merged_f16 = merged_f32.astype(np.float16).astype(np.float32) # 降到 fp16 再读回
err = float(np.max(np.abs(merged_f16 - merged_f32)))
print("fp16 折回最大舍入误差:", err)
print("相对误差:", float(err / (np.max(np.abs(merged_f32)) + 1e-12)))
assert err < 0.01, "fp32 累加再降精度应把误差控制在小量级"
\`\`\`

误差落在千分位量级——相对训练时的随机性可忽略。若你在合并后发现生成质量明显变化，先按这条数值精度排查（是否用了低精度直接累加），再怀疑数据或训练本身；多数「合并后模型变傻」的案例都是精度处理不当，而非代数折回有误。

:::tip

### 一句话记住 merge_and_unload

合并 = 把 LoRA 增量 \`(α/r)·BA\` **代数折回**基座得到 \`W_merged = W₀ + (α/r)BA\`，前向从双分支变单矩阵、数学等价。产物用 \`save_pretrained\` 存成 **safetensors 权重 + config.json + tokenizer** 三件套，合并时用 **fp32 累加再降精度**控制舍入误差。合并后的标准模型是 M11 一切部署步骤的起点：L106 的 GGUF 量化、L107 的 ONNX/TensorRT 编译，都要求一个「没有适配器分支」的干净权重。这也是 M11 把所有部署路线都建立在合并成品之上的根本原因。

:::
`,
    null,
    [
      {
        text: 'LoRA 的 merge_and_unload 在代数上做什么？',
        options: [
          '删除所有 LoRA 参数',
          '把增量 (α/r)·B·A 加回基座 W₀ 得到单一权重矩阵，推理不再需要旁路',
          '把基座换成随机矩阵',
          '只保存 LoRA 不保存基座',
        ],
        answer: 1,
        explain:
          'LoRA 前向 y=W₀x+(α/r)BAx；因矩阵乘可分配，令 W_merged=W₀+(α/r)BA，则 y=W_merged x，旁路被折进主权重。',
        concept: 'weight-merge',
      },
      {
        text: 'save_pretrained 规范保存的三件套是？',
        options: [
          '权重 safetensors + 配置 config.json + 分词器 tokenizer 文件',
          '只有权重文件',
          '训练日志 + 数据 + 优化器状态',
          'Dockerfile + 脚本 + README',
        ],
        answer: 0,
        explain:
          '推理框架加载一个模型至少需要三样：模型权重（safetensors）、结构配置（config.json）、分词器（tokenizer 文件），缺一不可。',
        concept: 'weight-merge',
      },
      {
        text: '合并时推荐用 fp32 累加再降回目标 dtype，原因是？',
        options: [
          'fp32 计算更快',
          '避免低精度直接累加导致舍入误差累积，折回后权重更接近原始数学结果',
          'fp32 文件更小',
          'dtype 与合并无关',
        ],
        answer: 1,
        explain:
          'W₀ 与 ΔW 在低精度下直接相加会丢失低位有效数字；先在 fp32 累加再降到 bf16/fp16，可把折回误差控制在小量级。',
        concept: 'weight-merge',
      },
      {
        text: '为什么合并后推理不再需要 PEFT 库？',
        options: [
          '因为合并把模型变小了',
          '因为合并产出一个标准权重矩阵，普通 Linear 层即可计算，无需 LoRA 分支与适配器调度',
          '因为 PEFT 被删除了',
          '因为推理不用加载权重',
        ],
        answer: 1,
        explain:
          '折回后 y=W_merged x 就是一次普通线性变换，任何推理框架都能直接跑，省去适配器路由逻辑，也更利于后续量化与编译。',
        concept: 'weight-merge',
      },
    ],
    [
      ['merge_and_unload', 'PEFT 的方法，把 LoRA 低秩增量代回基座权重并卸载适配器，得到标准模型'],
      ['代数折回', '利用 W₀+(α/r)BA 把双分支前向合并为单矩阵前向，数学等价、推理更简'],
      ['safetensors', '安全的张量存储格式，无 pickle 执行风险、加载快，保存合并后权重的推荐格式'],
      ['config.json', '描述模型结构（层数、hidden size、dtype、architecture）的配置文件'],
      ['数值精度', '合并时用 fp32 累加再降dtype，控制舍入误差，避免低精度直接相加失真'],
    ],
    [
      '以为合并会「改变模型能力」——代数等价，合并前后输出应一致，差异只来自浮点舍入。',
      '拿 bf16 基座直接加 bf16 增量——低精度累加丢有效位，应在 fp32 折回后再降精度。',
      '存模型只存权重忘了 tokenizer 与 config——推理框架无法正确加载或分词。',
      '合并后还加载 PEFT 适配器——适配器已折进权重，重复加载会二次叠加增量。',
    ],
  ),
  'theory',
)
