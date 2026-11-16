import { L, withKind } from '../../course-builders.ts'

export const L94 = withKind(
  L(
    'L94',
    41,
    '指令/多任务数据构造',
    3,
    ['L89', 'L91'],
    ['instr-data'],
    [
      '讲清 (指令—响应) schema',
      '说明多任务混排比例',
      '解释自举蒸馏与去重难度分级',
      '对照 S-QLoRA 数据集结论',
    ],
    `### 数据决定了微调的上限

L89 给出了训练链路，L91 给出了「小数据常更优、9k>450k」的结论，这一课把中间最关键的一环补上：**怎么构造出那个「9k 的高质量子集」**。微调的天花板由数据决定——同样的 LoRA 脚本、同样的超参，喂进去的是去重分级后的精集还是未筛选的杂集，结果可能天差地别（L91）。S-QLoRA（A 级）的 9k>450k 不是玄学，而是「去重 + 去噪 + 多样采样 + 难度分级」这套数据工程的产出。

这一课按数据构造的完整流水线展开：先定义 (instruction, input, output) schema，再讲多任务混排比例，然后讲自举蒸馏与去重难度分级，最后回到 S-QLoRA 的结论收口。所有数字挂 S-QLoRA/QLoRA（A 级）与 HF 生态（A 级）。

### schema：把任务写成 (指令—输入—响应) 三元组

指令微调最通用的 schema 是 **(instruction, input, output)** 三元组：

- **instruction**：描述要做什么（「把句子翻译成英文」「总结要点」）。
- **input**：可选的输入上下文（待翻译的句子、待总结的文本）。没有输入的任务可留空。
- **output**：期望的回答，是唯一应计入 loss 的部分（L89 的 prompt 掩码）。

训练时三段按模板拼成一条文本，prompt 段（instruction + input）标签设为 -100，只对 output 计损。schema 的工程价值在于**统一性**：所有任务都塞进同一结构，模型学会「读指令 → 看输入 → 给回答」这一通用模式，而不是记住某个任务的固定格式。模板要稳定一致——同一批数据里指令与回答的衔接方式、分隔符、结束符必须统一，否则格式噪声会被模型学进去。

\`\`\`python
from collections import Counter

def to_template(ex):
    """把三元组拼成统一模板；input 为空时省略该段。"""
    parts = [f"### 指令:\\n{ex['instruction']}"]
    if ex.get("input"):
        parts.append(f"### 输入:\\n{ex['input']}")
    parts.append(f"### 回答:\\n{ex['output']}")
    return "\\n\\n".join(parts) + "\\n"

rows = [
    {"instruction": "翻译为英文", "input": "你好", "output": "Hello"},
    {"instruction": "说一句问候", "input": "", "output": "你好！"},
    {"instruction": "总结", "input": "注意力省显存，微调分全参与PEFT。", "output": "注意力、微调两类优化"},
]
for ex in rows:
    print("----\\n" + to_template(ex))
assert all("### 回答:" in to_template(e) for e in rows), "每条必须有回答段"
print("schema 统一：三段模板一致，input 为空可省略")
\`\`\`

### 多任务混排：比例是策略不是默认值

真实应用往往要模型同时具备多种能力：问答、总结、翻译、分类、代码。若训练数据按「各任务现有样本数」直接混合，会出现两个失衡：① 样本多的简单任务主导梯度，模型往它偏；② 样本少的难任务/长尾任务欠训练，关键时刻掉链子。所以混排比例要**主动设计**，核心依据是：

1. **目标使用分布**：线上哪个任务用得多，训练占比就应更高。这是最重要的权重来源。
2. **难度补偿**：难任务学得慢，适当加权重；但过重会导致过拟合，需配合验证曲线（L91）。
3. **长尾保底**：低频但关键的任务要有最低占比，不能完全被淹没。

一个实用做法是先按目标分布设初始比例，训练后按各任务的验证指标微调——哪个任务验证差就加权重。下面的可跑代码演示按比例采样，并对比均衡与倾斜两种配比。

\`\`\`python
import random
random.seed(0)
pools = {
    "translate": [{"task": "translate", "id": i} for i in range(50)],
    "summary":   [{"task": "summary",   "id": i} for i in range(20)],
    "classify":  [{"task": "classify",  "id": i} for i in range(20)},
    "code":      [{"task": "code",      "id": i} for i in range(10)},
}

def mix(pools, weights, total):
    tasks = list(weights)
    w = [weights[t] for t in tasks]
    out = []
    for _ in range(total):
        t = random.choices(tasks, weights=w, k=1)[0]
        pool = pools[t]
        out.append(random.choice(pool))          # 有放回采样：池子小也可凑够总量
    return out

w_balanced = {t: 1 for t in pools}
w_prod = {"translate": 1, "summary": 3, "classify": 2, "code": 2}  # 按目标分布倾斜
for name, w in [("均衡", w_balanced), ("按业务倾斜", w_prod)]:
    mixd = mix(pools, w, total=1000)
    print(name, "采样任务分布:", dict(Counter(x["task"] for x in mixd)))
assert len(mix(pools, w_prod, total=100)) == 100
print("配比是策略：倾斜后 summary 等目标任务占比明显提升")
\`\`\`

:::deep

### 有放回采样的隐患与改进

上面的 \`mix\` 用有放回随机采样，池子小的任务（如 code 只有 10 条）会被反复抽到，等于变相复制，容易过拟合。改进有两种：① **按任务配额无放回采样**——每个任务抽 min(配额, 池大小) 条，配额不够就少抽，避免重复；② **数据增强/自举扩充**小任务池子（见下一节），让它有足够样本被抽。实战中还要设一个「重复上限」：同一条样本在整个训练集里出现不超过 N 次。这个细节正是 L91「高信息密度」的反面——反复抽同一批 code 样本，信息密度随重复次数骤降，还把模型往 memorization 上带。混排不是简单的加权随机，而要带着「别让小池子被抽烂」的约束。

:::

### 自举蒸馏：低成本扩多样性，但必须筛选

指令数据的瓶颈是多样性——人工写几万条高质量指令成本极高。**自举蒸馏**（self-instruct 类方法）用强模型批量生成候选指令-响应对：先给种子任务，让强模型生成大量新指令与回答，再筛选。它用更低成本换来了远超手工的覆盖面，是快速起步的有效手段。

但自举的命门是**质量参差**：强模型也会生成错误、空泛、重复、格式错的样本。若把生成结果不经筛选直接训练，就是人为制造一个「450k 大杂集」——正是 L91 的 9k>450k 所警示的。所以自举必须与筛选绑定：规则过滤（格式、长度、去重）→ 模型/人工打分 → 难度分级 → 只保留高质量子集。自举负责「量」，筛选负责「质」，两者缺一不可。

\`\`\`python
def dedup_and_filter(rows, min_len=4):
    """去重 + 基础质量过滤：返回保留样本与被丢弃原因统计。"""
    seen, kept, drop = set(), [], Counter()
    for ex in rows:
        text = (ex["instruction"] + ex.get("input", "") + ex["output"]).strip()
        if len(text) < min_len:
            drop["too_short"] += 1; continue
        key = hash(text)
        if key in seen:
            drop["duplicate"] += 1; continue
        if ex["output"].startswith("作为AI"):   # 模板化空话，示意过滤规则
            drop["boilerplate"] += 1; continue
        seen.add(key); kept.append(ex)
    return kept, drop

raw = [
    {"instruction": "翻译", "input": "你好", "output": "Hello"},
    {"instruction": "翻译", "input": "你好", "output": "Hello"},           # 重复
    {"instruction": "问", "input": "", "output": "作为AI我无法回答"},       # 模板空话
    {"instruction": "总结", "input": "长文本", "output": "要点若干"},
    {"instruction": "x", "input": "", "output": "y"},                       # 太短
]
kept, drop = dedup_and_filter(raw)
print("保留:", len(kept), " 丢弃原因:", dict(drop))
assert len(kept) == 2 and drop["duplicate"] == 1 and drop["boilerplate"] == 1
print("筛选把 5 条杂数据压成 2 条高质量样本 —— 9k>450k 的微观版")
\`\`\`

### 去重与难度分级：把「9k 子集」造出来

筛选之后还要做两件事，才能从「干净数据」升级到「高信息密度数据」：

- **去重（dedup）**：不仅删完全相同的样本，还要处理近似重复（模板相同只换实体、语义高度相似）。近似重复最容易被忽略，却大量存在于自举数据里——强模型翻来覆去用同一套句式。可用精确哈希 + 语义嵌入聚类两层去重。
- **难度/质量分级**：给每条样本打分（如用强模型评估回答质量、或按任务复杂度分层），分成高/中/低档。训练时优先用高档，或按「高档为主 + 适量中档保多样性」配比。分级让你在「数据少」时能挑最精华的，在数据多时能控制质量底线。

这两步加上前面的 schema、混排、自举，就构成了 S-QLoRA 数据集结论的完整落地路径：**9k 子集之所以胜 450k，正是因为它经历了「自举扩量 → 严格去重 → 质量分级 → 按分布混排」，把单位样本信息密度做到最高**。反过来，450k 大杂集缺的正是这套工序。

\`\`\`python
# 难度分级 + 分层配比：高档为主，中档保多样性
def grade_rows(rows, score_fn):
    for ex in rows:
        s = score_fn(ex)
        ex["grade"] = "high" if s >= 0.8 else ("mid" if s >= 0.5 else "low")
    return rows

def layered_sample(rows, quota, seed=0):
    r = random.Random(seed)
    buckets = {g: [e for e in rows if e["grade"] == g] for g in ("high", "mid", "low")}
    out = []
    for g, n in quota.items():
        pool = buckets[g]
        out += r.sample(pool, min(n, len(pool)))   # 无放回，小池不重复
    return out

graded = grade_rows(
    [{"output": "详尽的正确回答", "_s": 0.9}, {"output": "基本正确", "_s": 0.6},
     {"output": "含糊其辞", "_s": 0.3}, {"output": "另一个好回答", "_s": 0.95}],
    score_fn=lambda e: e["_s"])
sel = layered_sample(graded, {"high": 2, "mid": 1, "low": 0})
print("分层采样结果:", [e["grade"] for e in sel])
assert all(e["grade"] != "low" for e in sel), "低档不入选"
print("配比：high 为主、mid 保多样性、low 剔除 —— 高信息密度子集成型")
\`\`\`

:::tip

### 数据构造一句话：用工序换信息密度

9k>450k（S-QLoRA，A 级）的落地不是某个魔法数字，而是一套工序：统一 (instruction, input, output) schema 并对回答计损 → 按目标分布与难度设计多任务混排比例 → 自举蒸馏低成本扩多样性 → 严格去重（精确 + 语义）与质量分级 → 按分层配比选高信息密度子集。自举负责量、筛选与分级负责质，缺一就退回「大杂集」。这套工序直接产出 L91 所需的「小而精」数据，也是 L95 capstone 里小数据集 LoRA 微调的输入。带着它进 L95，把数据 → 训练 → 过拟合验收串成完整闭环。

:::
`,
    null,
    [
      {
        text: '标准指令数据的 (指令—响应) schema 通常是？',
        options: [
          '只有一段原始文本',
          '(instruction, input, output) 三元组：指令、可选输入、期望回答',
          '只有标签和类别',
          '权重矩阵和梯度',
        ],
        answer: 1,
        explain:
          '指令微调数据常用 (instruction, input, output) 三元组，拼成模板后只对 output 计损（L89 的 prompt 掩码）。',
        concept: 'instr-data',
      },
      {
        text: '多任务混排比例设计的核心原则是？',
        options: [
          '所有任务等比例，不管目标场景',
          '按目标场景的任务分布与难度加权，避免单一任务主导或长尾任务缺失',
          '只保留一个任务',
          '比例完全随机',
        ],
        answer: 1,
        explain: '混排比例应反映目标使用分布，并给难/长尾任务适当权重；失衡会让模型偏科或被简单任务主导。',
        concept: 'instr-data',
      },
      {
        text: '自举蒸馏（self-instruct / 模型生成再筛选）在数据构造中的作用是？',
        options: [
          '完全替代人工标注',
          '用强模型生成候选指令数据、再经规则或人工筛选，快速扩充多样性，但需严控质量',
          '把数据量化',
          '删除所有数据',
        ],
        answer: 1,
        explain:
          '自举用强模型批量生成指令-响应对再筛选，低成本换多样性；但生成数据质量参差，必须去重去噪分级（呼应 9k>450k）。',
        concept: 'instr-data',
      },
      {
        text: 'S-QLoRA 的「9k>450k」结论对数据构造的直接启示是？',
        options: [
          '数据量完全不重要',
          '去重、去噪、多样性采样、难度分级提升单位样本信息密度，小精集可胜大杂集',
          '应只用随机 9k 条',
          '不要做数据清洗',
        ],
        answer: 1,
        explain:
          '9k>450k 说明质量与信息密度胜数量；落地就是去重、去噪、多样采样、难度分级这套数据工程（A 级）。',
        concept: 'instr-data',
      },
    ],
    [
      ['(instruction, input, output)', '指令数据三元组：任务指令、可选输入上下文、期望回答'],
      ['多任务混排', '把不同任务类型的数据按一定比例混合训练，比例反映目标分布与难度'],
      ['自举蒸馏', '用强模型生成候选数据再筛选，低成本扩充多样性（self-instruct 类方法）'],
      ['去重与难度分级', '删除重复/低信息样本，并按难度或质量分层以便配比'],
      ['9k>450k', 'S-QLoRA（A 级）：高质量小子集胜过大而杂的数据集，是数据工程的依据'],
    ],
    [
      '把自举生成的数据不经筛选直接训练——质量参差，会放大噪声（9k>450k 的反面）。',
      '多任务按样本数简单等比例混排——长尾/难任务被淹没，模型偏科。',
      '只看数据量不看多样性——大量模板化重复样本信息密度极低。',
      '忽略 prompt 掩码——三元组拼成模板后若不对 output 计损，模型会学指令本身（L89）。',
      '把 9k>450k 理解成随机抽 9k——优势来自筛选标准，不是数量。',
    ],
  ),
  'framework',
)
