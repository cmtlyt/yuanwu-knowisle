import { L, withKind } from '../../course-builders.ts'

export const L95 = withKind(
  L(
    'L95',
    41,
    '小数据集 LoRA 微调 + 过拟合验收 capstone',
    5,
    ['L89', 'L91', 'L94'],
    ['m9-capstone'],
    [
      '搭建小数据集 LoRA 微调流程',
      '画 train/val loss 分离曲线',
      '验证 merge 后推理冒烟',
      '给出过拟合曲线验收断言',
    ],
    `### 综合交付：把 M9 串成一条可验收的闭环

这是 M9 的收束课。前面各课分别打碎了一个环节：L83 立起全参的账单与过拟合/遗忘问题，L84 到 L88 给出 PEFT 谱系与四法选型，L89 落地 LoRA SFT 端到端与 merge，L90 演示一基座多适配器，L91 讲清「小数据常更优」与过拟合识别，L92/L93 补上 GaLore 与小模型全参对照，L94 给出高质量数据构造工序。本课把这些拼成**一条可复现、可验收的闭环**：拿一个小数据集 → 做 L94 式清洗分级 → 严格切分 train/val → 跑 LoRA SFT 并记录双曲线 → 从曲线检测过拟合拐点、早停 → merge 导出 → 推理冒烟 → 用一组**可执行的数值断言**验收整条链路。

交付物不是「跑通了」，而是**能用断言证明**：数据没泄漏、过拟合被识别并早停、merge 后推理正常。这三条把 L91 的诊断从「看图说话」升级成「自动判定」，也是把 M9 从方法理解推到工程验收的最后一步。所有机制挂 S-LoRA/QLoRA（A 级）。

:::deep

### 一条链路上每个环节对应哪一课

把综合交付拆成「数据 → 训练 → 诊断 → 部署 → 验收」五段，每段都能指回具体的课：

- **数据段（L91/L94）**：构造 (instruction, input, output) 三元组，做去重、质量分级、按分布切分。产出干净的 train/val 两份数据。这里的关键纪律来自 L91——小数据的质量与信息密度比数量重要，9k 精集可胜 450k 杂集（S-QLoRA，A 级），而 L94 的工序正是造出这个精集。
- **训练段（L85/L89）**：冻结基座 + 低秩 BA（W=W₀+(α/r)BA，L85），4bit 可选（L86），LoraConfig + 指令数据 + prompt 掩码（L89），只训适配器。
- **诊断段（L91）**：每步记录 train loss 与 val loss，画分离曲线，检测 val 拐点。这是过拟合识别的核心——train 降、val 升、差距扩大就停。
- **部署段（L89/L90）**：merge_and_unload 把增量加回 W₀，导出无 LoRA 残留的单模型，做推理冒烟。
- **验收段（本课新东西）**：把上面每一段的判据写成可执行的 assert——泄漏检查、拐点存在性、merge 一致性、生成非空。

关键认知：**验收断言不是事后补的装饰，而是把前四课的判据固化成机器可判的门槛**。若某条断言失败，你能立刻定位是哪一段出了问题，而不是对着 loss 曲线发呆。这套「分段 + 每段一个可判定产物」的思路，是把零散知识变成可交付工程的通用方法。

:::

### 数据段：构造、分级与无泄漏切分

先做一份小数据集（约 9k 规模的逻辑，这里用可跑的 Toy 演示流程），套用 L94 的工序：schema 统一 → 去重 → 质量分级 → 切分。**切分必须在去重之后**，否则同一条样本的近重复会同时落进 train 和 val，造成泄漏——这是小数据场景最隐蔽的坑，val 会因为「见过几乎一样的样本」而虚高，过拟合被完全掩盖。

下面的可跑代码做三件事：构造带质量分的样本、按内容哈希去重、用固定种子做可复现的分层切分（保证 train/val 的任务分布一致）。

\`\`\`python
import random, hashlib
from collections import Counter, defaultdict

def make_rows(n=240, seed=0):
    """合成小数据集：三类任务，带质量分；含少量重复用于验证去重。"""
    r = random.Random(seed)
    tasks = ["translate", "summary", "classify"]
    rows = []
    for i in range(n):
        t = tasks[i % 3]
        rows.append({
            "id": i, "task": t,
            "instruction": f"做{t}任务", "input": f"样本{i}",
            "output": f"正确回答{i}", "quality": r.uniform(0.3, 1.0),
        })
    rows += [dict(rows[0]), dict(rows[1])]      # 注入 2 条重复
    return rows

def dedup(rows):
    seen, out = set(), []
    for ex in rows:
        key = hashlib.md5(
            (ex["instruction"] + ex["input"] + ex["output"]).encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key); out.append(ex)
    return out

def stratified_split(rows, val_ratio=0.2, seed=42):
    """按任务分层切分：每类任务内部按比例抽 val，保证分布一致、可复现。"""
    r = random.Random(seed)
    by_task = defaultdict(list)
    for ex in rows:
        by_task[ex["task"]].append(ex)
    train, val = [], []
    for t, group in by_task.items():
        g = group[:]
        r.shuffle(g)
        n_val = max(1, int(len(g) * val_ratio))
        val += g[:n_val]; train += g[n_val:]
    r.shuffle(train); r.shuffle(val)
    return train, val

raw = make_rows()
clean = dedup(raw)
train, val = stratified_split(clean)
print(f"原始 {len(raw)} → 去重 {len(clean)} → train {len(train)} / val {len(val)}")
assert len(clean) == len(raw) - 2, "应去掉 2 条重复"
assert set(ex["id"] for ex in train).isdisjoint(ex["id"] for ex in val), "train/val 不得重叠"
# 分层保证分布接近
print("train 任务分布:", dict(Counter(e["task"] for e in train)))
print("val   任务分布:", dict(Counter(e["task"] for e in val)))
print("无泄漏切分通过：id 不重叠、任务分布一致")
\`\`\`

这段把「去重 → 分层切分 → 可复现」固化成代码，并用两条断言守住无泄漏。要注意：真实数据里 \`id\` 不同但内容近重复的样本仍可能泄漏，更严格的做法是**按内容哈希分组切分**（同一哈希组要么全进 train、要么全进 val），这里用 id 不重叠做基础版。

### 训练段：LoRA 配置与双曲线记录

训练用 L89 的标准配置（LoraConfig + 4bit 可选 + prompt 掩码），关键是**每步同时记录 train loss 与 val loss**。很多脚本只记录 train，正是 L91 警告的盲区。下面的可跑代码用 Toy loss 生成器模拟「一个会在后期过拟合的训练过程」，并把双曲线记进列表——真实训练时把 \`step_loss\` 替换为 trainer 的日志回调即可。

\`\`\`python
import math

def simulate_training(n_steps=12, overfit_at=7):
    """生成 train/val 双曲线：overfit_at 之后 val 回升、train 继续降。"""
    hist = []
    for s in range(n_steps):
        train = 1.8 * math.exp(-0.35 * s) + 0.08
        if s <= overfit_at:
            val = train + 0.12 + 0.02 * s
        else:
            val = (1.8 * math.exp(-0.35 * overfit_at) + 0.12 + 0.02 * overfit_at) \\
                  + 0.06 * (s - overfit_at)      # 拐点后回升
        hist.append({"step": s, "train": round(train, 4), "val": round(val, 4)})
    return hist

hist = simulate_training()
for h in hist:
    print(f"step {h['step']:2d}  train {h['train']:.3f}  val {h['val']:.3f}  "
          f"gap {h['val']-h['train']:.3f}")
assert len(hist) >= 8, "应有足够步数观察拐点"
print("双曲线已记录：真实训练把此处替换为 trainer 的 train/val 日志")
\`\`\`

:::deep

### 验证 loss 怎么算才不泄漏

记录 val loss 有个隐蔽陷阱：若在训练模式下算验证（dropout 开着、梯度检查点重算），得到的 val 不稳定、不可比。正确做法是每轮评估时切到 \`model.eval()\`、关梯度（\`torch.no_grad()\`）、用与训练相同的 prompt 掩码与拼接模板算 loss。另一个陷阱是验证 batch 太小导致 val loss 抖动，被误判成「回升」——拐点检测应对曲线做平滑（如 3 步移动平均）再找最低点。L95 的验收断言里会对 val 序列做平滑，避免把噪声当过拟合信号。把这两点做到，val 曲线才可信，早停才准。

:::

### 诊断段：检测过拟合拐点并早停

有了双曲线，下一步自动检测 val 拐点。判据来自 L91：val 先降后升、train 持续下降、gap 扩大。做法是对 val 做平滑后找最低点，确认其后确实回升、且末期 gap 明显扩大，则该点为**早停点**。下面的可跑代码把它写成函数，供验收断言复用。

\`\`\`python
def smooth(seq, k=3):
    """移动平均平滑，抑制 val 抖动造成的假拐点。"""
    return [sum(seq[max(0, i-k+1):i+1]) / len(seq[max(0, i-k+1):i+1])
            for i in range(len(seq))]

def find_overfit_point(hist, k=3):
    """返回 (拐点step, 是否过拟合)。val 平滑后最低点且之后回升、gap 扩大即过拟合。"""
    vals = smooth([h["val"] for h in hist], k)
    trains = [h["train"] for h in hist]
    gaps = [v - t for t, v in zip(trains, [h["val"] for h in hist])]
    best = min(range(len(vals)), key=lambda i: vals[i])
    recovered = vals[-1] > vals[best] + 1e-6
    gap_widened = gaps[-1] > gaps[best] + 1e-6
    train_still_down = trains[-1] < trains[best]
    return best, (recovered and gap_widened and train_still_down)

point, is_overfit = find_overfit_point(hist)
print(f"检测到的 val 最低点 = step {point}，是否过拟合 = {is_overfit}")
print(f"若过拟合，应在 step {point} 早停（而非训到 step {hist[-1]['step']}）")
assert is_overfit, "本示例数据应触发过拟合检测"
assert 0 < point < len(hist) - 1, "拐点应在训练中途，而非端点"
print("诊断通过：拐点存在于中途，可从该点早停")
\`\`\`

早停的工程含义：把最终模型回退到 \`step=point\` 的适配器权重（训练时定期 checkpoint），而不是用最后一步——后者已经滑向记忆。这样得到的适配器泛化最好。L89 的 \`merge_and_unload\` 应对这个**早停点**的适配器做，而非末步。

### 部署段：merge 导出与推理冒烟

选定早停点的适配器后，做 merge 并冒烟。两条硬断言：① merge 后无 \`lora_\` 残留模块（L89）；② 合并后的单矩阵前向与训练态旁路前向输出一致——这验证了 W'=W₀+(α/r)BA 的数学正确性。再用合并模型生成一段文本，确认非空、格式正常。

\`\`\`python
import numpy as np
rng = np.random.default_rng(0)
d, r, alpha = 32, 4, 8
W0 = rng.normal(size=(d, d))
A = rng.normal(size=(r, d)) * 0.05
B = rng.normal(size=(d, r)) * 0.05          # 早停点的适配器权重
x = rng.normal(size=d)

def lora_forward(W0, A, B, x):
    return W0 @ x + (alpha / r) * (B @ A) @ x      # 训练态：W0x + (α/r)BAx

W_merged = W0 + (alpha / r) * (B @ A)              # merge：单矩阵
y_train = lora_forward(W0, A, B, x)
y_merged = W_merged @ x
print("merge 前后输出最大误差 =", float(np.abs(y_train - y_merged).max()))
assert np.allclose(y_train, y_merged, atol=1e-6), "merge 必须与训练态前向一致"
assert W_merged.shape == W0.shape, "合并后形状应与基座一致"
# 推理冒烟：生成（Toy：argmax 解码一段 token id）
logits = W_merged @ x
generated = [int(np.argmax(logits)) for _ in range(8)]
print("推理冒烟生成 token 序列(示意):", generated)
assert len(generated) == 8 and all(t >= 0 for t in generated), "生成应非空且合法"
print("merge 冒烟通过：无额外分支、输出一致、生成正常")
\`\`\`

真实 HF 里这段对应 \`merged = model.merge_and_unload()\`、\`assert not any("lora_" in n for n,_ in merged.named_parameters())\`、再 \`merged.generate(...)\` 并检查输出长度。用早停点的适配器做 merge，是把「诊断段」的结论真正落到「部署段」的关键——否则前面检测拐点就白做了。

### 验收段：把判据写成可执行的断言集

现在把整条闭环的判据集中成一组验收断言。这是 capstone 的出口门槛——五条断言全过，才算把 M9 串成了可交付工程。每类断言对应前面一段，失败可定位。

\`\`\`python
def accept(dedup_ok, split_ok, hist, point, overfit, merge_ok, smoke_ok):
    """M9 综合验收：数据、诊断、部署三段断言。"""
    checks = {
        "数据去重": dedup_ok,
        "无泄漏切分": split_ok,
        "拐点存在且在中途": 0 < point < len(hist) - 1,
        "过拟合被识别": overfit,
        "merge 前向一致": merge_ok,
        "推理冒烟非空": smoke_ok,
    }
    for name, passed in checks.items():
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
    return all(checks.values())

ok = accept(
    dedup_ok=(len(clean) == len(raw) - 2),
    split_ok=set(e["id"] for e in train).isdisjoint(e["id"] for e in val),
    hist=hist, point=point, overfit=is_overfit,
    merge_ok=bool(np.allclose(y_train, y_merged, atol=1e-6)),
    smoke_ok=(len(generated) == 8),
)
print("M9 综合验收:", "全部通过" if ok else "存在未通过项")
assert ok, "任一断言失败都说明某段未达标，按对应小节排查"
\`\`\`

这组断言把 L91 的「过拟合识别」从看图升级为机器判定：不仅要求曲线分离被检测到，还要求**拐点存在于训练中途**（能早停）、**merge 前后一致**（部署正确）、**推理非空**（可用）。它同时守住数据质量（去重、无泄漏）——这是 L94/L91 的底线。任何一条失败都能定位：数据断言失败回数据段、诊断失败回训练/诊断段、部署失败回 merge 段。

### 为什么小数据闭环里「可复现」是一条硬要求

小数据集上的结论特别容易被随机性左右，因此整条闭环必须把「可复现」当硬要求，而不是锦上添花。随机性来自三处：数据切分的种子、模型初始化的种子、训练 shuffle 的顺序。同一批数据换个划分种子，val 曲线的拐点位置可能差好几步，过拟合结论随之摇摆——这也是 L91 强调「小数据结论要谨慎」的原因之一。工程上的做法是把所有种子固定并写进实验记录：切分用固定 \`seed\`（如上面 \`stratified_split\` 的 42），训练设 \`set_seed\`，并记录数据哈希与配置快照。更稳妥的是**多 seeds 重复**：用 3 个不同种子各跑一次，看拐点与最终 val 指标是否稳定；若三个种子的结论一致，才算可靠。单次划分得出的「完美曲线」很可能是运气，把它写成断言前先问一句：换个种子还成立吗？把这条纪律贯穿数据段、训练段、验收段，M9 的结论才站得住。

### 早停点与泛化：为什么「训得少」往往比「训得多」好

新手常有一种直觉——训练轮数越多、loss 越低，模型就越好。小数据 + LoRA 的场景恰恰相反：L91 讲过，当数据量远小于模型容量，继续训练会把多余的容量用在记忆训练样本上，val loss 在拐点后回升。所以早停不是「提前放弃」，而是**主动停在泛化最好的那一步**。上面 \`find_overfit_point\` 检测到的 val 最低点，就是泛化的峰值；往后的每一步都在用泛化换训练集拟合。理解这层，就能正确看待验收断言里「拐点必须在中途」这条——如果拐点总落在最后一步，说明要么训练步数不够（还没到过拟合就停了），要么学习率太小（模型还没充分学到就停了），两种情况都没摸到泛化峰值，需要回到训练段调整而非庆祝「没过拟合」。早停的本质是在「欠拟合」与「过拟合」之间找到那个最优点，这正是小数据微调最核心的技能。

### 把断言做成回归门禁：从一次性验收 to 持续可用

这组验收断言的价值不止于「这次跑通」，更在于能沉淀成**回归门禁**。做法是把它封装成一个独立的检查脚本：每次改了数据配方、换了秩 r、调了学习率，都重新跑一遍闭环，让同一组断言自动判定有没有退化。比如你把 r 从 8 调到 16，若「过拟合被识别」这条从 PASS 变成 FAIL（val 不再出现拐点，说明更高秩带来了更强记忆却没带来泛化），门禁会立刻拦下这次改动。这种「把判据写成代码、每次变更都重跑」的习惯，是把课程知识转成团队工程资产的关键——它让 L91 的诊断从个人经验变成机器可执行的纪律。落地时把断言脚本接进 CI 或训练流水线的末尾，任何一条失败就不允许模型进入部署。到这里，M9 交付的就不只是一次微调实验，而是一套**可重复、可回归、可防退化**的小数据微调验收体系。

### 常见翻车与排查清单

把这条闭环上最高频的失败列成清单，验收失败时按图索骥：

- **val 虚高、检测不到过拟合**：多半是切分泄漏——近重复样本同时落在 train/val。回数据段，改用内容哈希分组切分。
- **val 抖动被误判为拐点**：验证时没切 eval 模式、或 val batch 太小。回诊断段，确认 \`model.eval()\` + \`no_grad()\`，并对 val 做平滑。
- **merge 后输出和基座一样**：推理时用了原模型而非合并模型，或适配器没激活。回部署段，确认 \`merge_and_unload\` 的返回值用于推理。
- **merge 前后数值对不上**：α/r 缩放漏了，或 A/B 维度记反（L85）。回部署段核对 W'=W₀+(α/r)BA。
- **过拟合拐点总在最后一步**：训练步数太短或学习率太小，还没到分离就停了。回训练段增加步数或调学习率（L89 的超参判据）。

:::tip

### 收束：方法理解 → 可验收工程

M9 的出口判据：能把「小数据 → 清洗分级 → 无泄漏切分 → LoRA SFT + 双曲线 → 拐点早停 → merge 导出 → 推理冒烟 → 断言验收」串成一条可复现链路，并用一组可执行断言证明数据没泄漏、过拟合被识别并早停、merge 后推理正常。五段各自对应前面的课：数据段 L91/L94、训练段 L85/L89、诊断段 L91、部署段 L89/L90、验收段本课。达成即完成 M9，带着「全参的账单、PEFT 的谱系、LoRA 的机制、数据的质量、过拟合的验收」这套完整认知，进入后续模块。记住这条主线：**M9 不是记住一堆微调技巧，而是学会在显存、质量、数据、过拟合之间做有据可依的取舍，并把取舍固化成可验收的工程**。

:::
`,
    null,
    [
      {
        text: '过拟合验收中，train/val 分离曲线的正确判读是？',
        options: [
          '两条曲线一起下降才算过拟合',
          'val loss 先降后升、train 继续下降、差距扩大，即过拟合，应在拐点早停',
          'train 高于 val 才算过拟合',
          '只看 train loss 归零',
        ],
        answer: 1,
        explain: 'L91 的分离信号：train 降、val 升、差距扩大；拐点即最佳停止点，验收要能自动检测它。',
        concept: 'm9-capstone',
      },
      {
        text: '为什么小数据集必须做 train/val 分离，而不是只看训练 loss？',
        options: [
          '训练 loss 会报错',
          '小数据 + LoRA 仍会过拟合（L91），只有独立验证集才能暴露泛化退化并给出早停点',
          '验证集能让训练更快',
          'val loss 一定更低',
        ],
        answer: 1,
        explain: 'L91：可训参数少能缓解但不消除过拟合；小数据下记忆风险高，必须留验证集看曲线分离。',
        concept: 'm9-capstone',
      },
      {
        text: 'merge 后推理冒烟验证的核心断言是？',
        options: [
          '模型文件变大了',
          '合并后无残留 LoRA 层，且输出与训练态旁路前向一致、生成正常文本',
          '推理必须用 fp32',
          '不需要验证',
        ],
        answer: 1,
        explain:
          "L89：merge_and_unload 后不应有 lora_ 层；训练态 (W0+BA)x 与合并 W'x 输出一致，生成不为空即冒烟通过。",
        concept: 'm9-capstone',
      },
      {
        text: 'capstone 中「过拟合曲线验收断言」最合理的一条是？',
        options: [
          'train loss 必须等于 0',
          'val 最低点应出现在训练结束前若干步（可早停），且末期 train/val 差距不超过阈值',
          'val loss 必须恒低于 train',
          'epoch 数必须大于 100',
        ],
        answer: 1,
        explain: '用可执行的数值断言把 L91 的诊断固化：val 拐点存在且可早停、末期差距受控，才算验收通过。',
        concept: 'm9-capstone',
      },
    ],
    [
      ['train/val 分离', '把数据切成训练集与验证集，用验证曲线监控泛化并确定早停点'],
      ['过拟合曲线', 'train 降、val 先降后升的曲线，拐点即最佳停止点（L91）'],
      ['早停', '在 val 拐点处停止训练，防止继续训练滑向记忆'],
      ['merge 冒烟', 'merge_and_unload 后检查无 LoRA 残留、输出一致、生成正常'],
      ['验收断言', '把过拟合判据写成可执行的数值断言，作为模块出口的硬门槛'],
    ],
    [
      '只看 train loss 就宣布训练成功——必须用独立验证集看 val 是否分离（L91）。',
      'train/val 划分有泄漏——同一条样本或其近重复同时出现在两边，val 虚高、过拟合看不出来。',
      '训练完忘记 merge 就推理——增量在旁路，输出和基座一样（L89）。',
      '把 val 拐点之后继续训练当「更充分」——那是在过拟合，应早停。',
      '小数据不做种子固定与重复实验——单次划分的结论可能被随机性误导。',
    ],
  ),
  'capstone',
)
