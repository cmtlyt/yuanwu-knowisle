import { L, withKind } from '../../course-builders.ts'

export const L68 = withKind(
  L(
    'L68',
    33,
    'mFformer 定论与真实/误记核实表',
    3,
    ['L62'],
    ['mfformer-verdict'],
    [
      '给出 mFformer 无官方来源的 C 级定论',
      '说明疑似混淆 MLA/MTP/DeepSeekMoE',
      '逐项核实真实 vs 误记',
      '说明来源纪律的重要性',
    ],
    `### 为什么要专门做一课核实

M7 前几课讲的都是「有出处的东西」：MLA 出自 DeepSeek-V2 论文，MTP、辅助损失均衡、FP8 与 DualPipe 出自 V3 论文，R1 出自 2501.12948（Nature 收录）。但学习过程中常会碰到一些「听起来很像」的名词，比如流传的 mFformer。它像 Transformer 家族的某个变体，又好像和 DeepSeek 的注意力有关，却在任何官方论文与仓库里都查不到。这一课按 B1-09 的 C 级定论把这件事讲清：**mFformer 无官方来源，疑似是把 MLA、MTP、DeepSeekMoE 记混后的产物**。重点不只是给这个名词定性，更是建立一套可复用的来源纪律——遇到一个名词，先问它出自哪篇论文、哪个仓库、哪一级来源，再决定能不能写进正文、能不能写死数字。

### C 级定论该怎么表述

按课程约定，来源分三级。A 级是官方论文或仓库，数字可以写死（如 MLA 减 KV 93.3%、吞吐 5.76 倍，V3 的 671B/37B，DeepSeekMath 7B MATH 51.7%）。B 级是第三方复算或随时间变动的值，要标注「第三方复算/随时间变动，不担关键结论」。C 级是无官方来源支撑，只能表述为「疑似」「待核实」，绝不能当成论文事实。mFformer 属于 C 级：正确写法是「查无官方来源，疑似混淆 MLA/MTP/DeepSeekMoE」，错误写法是「DeepSeek 提出了 mFformer，作用是某某」。这两者的差别，就是课程可信度的底线。

:::warn

### 不要做的事

不要因为一个名词在很多二手文章里出现，就默认它真实存在；二手文章可能互相抄一个错误。也不要把「疑似混淆」写成「确定错误」——C 级定论只说「没有官方来源支持」，至于它最初怎么被造出来、是否指某个真实模块的口误，无法确证。课程里对它的处理是：如实写明无来源、给出最可能的混淆对象、然后把它放回到真实概念的核实表里，让读者用真实概念替换掉这个空壳名词。

:::

### 真实概念核实表

把 M7 涉及的有官方来源的概念逐项列出，作为「什么是真的」的基准。这些都可以写死，出处明确。

| 概念 | 真实出处 | 关键点 |
|---|---|---|
| MLA | DeepSeek-V2，arXiv:2405.04434 | KV 联合低秩压缩到 c_KV，减 93.3%、吞吐 5.76 倍 |
| 解耦 RoPE | DeepSeek-V2 | K 拆未旋转内容 + 共享小旋转键 k^R |
| DeepSeekMoE | arXiv:2401.04088 | 细粒度专家细分 + 共享专家隔离 |
| MTP | DeepSeek-V3，arXiv:2412.19437 | 预测 k 个 token 需 k−1 个模块，推理做推测解码 |
| aux-loss-free | DeepSeek-V3 | 专家偏置调路由、不进门控，无辅助损失 |
| DualPipe / FP8 | DeepSeek-V3 | 双向流水重叠通信、FP8 混合精度训练 |
| R1 推理链 | arXiv:2501.12948，Nature 收录 | 纯 RL + 规则奖励 + 涌现反思 + 蒸馏 |

### 误记逐项核实表

再看常见的误记。每一项都给出「错在哪、正确说法是什么」，方便对照自查。

| 误记说法 | 核实结论 | 正确说法 |
|---|---|---|
| DeepSeek 有 mFformer 模块 | 无官方来源，C 级 | 不存在此官方名词，疑似混淆 MLA/MTP/DeepSeekMoE |
| V2 是 671B/37B | 记混代际 | 671B/37B 是 V3；V2 是 236B/21B |
| DeepSeek 用 MQA 省 KV | 机制记错 | 用 MLA 低秩压缩；MQA 是另一条路线 |
| MLA 就是 GQA | 机制记错 | MLA 压缩到低秩潜空间，GQA 是分组共享 KV 头 |
| MTP 是一种 MoE | 类别记错 | MTP 是训练/解码目标，MoE 是前馈结构 |
| R1 靠纯 SFT 标注轨迹 | 方法记错 | R1-Zero 纯 RL、规则奖励，免人工轨迹 |
| DeepSeekMath 7B 是通用 chat 模型 | 对象记错 | 它是数学专用基座，MATH 51.7% 是数学基准成绩 |

### 可跑代码：来源核实脚本

把核实表写成可执行脚本：维护一份「官方来源白名单」，逐条检查概念是否有出处，验证 mFformer 不在其中，并把真实与误记分类打印出来。

\`\`\`python
OFFICIAL = {
    "MLA": "DeepSeek-V2 arXiv:2405.04434",
    "解耦 RoPE": "DeepSeek-V2",
    "DeepSeekMoE": "arXiv:2401.04088",
    "MTP": "DeepSeek-V3 arXiv:2412.19437",
    "aux-loss-free": "DeepSeek-V3 arXiv:2412.19437",
    "DualPipe": "DeepSeek-V3 arXiv:2412.19437",
    "FP8 混合精度": "DeepSeek-V3 arXiv:2412.19437",
    "R1 推理链": "arXiv:2501.12948 Nature",
}
CLAIMS = {
    "mFformer": None,                       # 无任何官方出处
    "MLA": "DeepSeek-V2 arXiv:2405.04434",
    "DeepSeekMoE": "arXiv:2401.04088",
}
print("逐项核实：")
for name, src in CLAIMS.items():
    verdict = "A 级 有官方来源" if src in OFFICIAL.values() else "C 级 无官方来源，疑似混淆"
    print(f"  {name:14s} → {verdict}")
assert CLAIMS["mFformer"] is None, "mFformer 不应有官方出处"
assert "mFformer" not in OFFICIAL, "mFformer 不在官方概念表"
print("结论：mFformer 按 C 级定论处理")
\`\`\`

第二段脚本做「数字归位」：把常被记混的参数、指标绑定回正确的对象，断言不串台。

\`\`\`python
FACTS = {
    "V2": {"total_B": 236, "active_B": 21},
    "V3": {"total_B": 671, "active_B": 37},
    "DeepSeekMath-7B": {"MATH": 51.7},
    "MLA": {"kv_reduction": 0.933, "throughput_x": 5.76},
}
assert FACTS["V3"]["total_B"] == 671 and FACTS["V2"]["total_B"] == 236
assert FACTS["MLA"]["kv_reduction"] == 0.933
assert FACTS["DeepSeekMath-7B"]["MATH"] == 51.7
# 误记检测：any 把 671 安到 V2 都会触发断言失败
assert FACTS["V2"]["total_B"] != FACTS["V3"]["total_B"]
for obj, kv in FACTS.items():
    print(f"{obj:16s} {kv}")
print("数字归位通过：代际与指标没有串台")
\`\`\`

### 把核实流程固化成习惯

来源纪律不是这一课的口号，而是可以固化的动作。每遇到一个新名词，按顺序做三步：第一步，在官方论文与仓库里搜名字，搜不到就标 C 级，停止把它当事实；第二步，若搜到相近概念，列出最可能的混淆对象并逐项比对定义，像本课把 mFformer 拆回 MLA、MTP、DeepSeekMoE 那样；第三步，核对所有关联数字的对象归属——236B/21B 属于 V2，671B/37B 属于 V3，51.7% 属于 DeepSeekMath 7B，93.3% 与 5.76 倍属于 MLA，串台就是误记。这三步做完，再决定正文里写「有出处的事实」还是「无来源的疑似」。把这三步写进写作流程，比记住 mFformer 这个具体名词更重要——下一个流传的错名词迟早还会出现，流程能挡住所有同类问题。对课程作者而言，这条流程还决定能否在正文里写死数字：只有走完核查、确认出处的 A 级数字才配写死，其余一律标注级别或改成定性表述。

### 来源纪律为什么重要

一个无来源的名词，如果在课程里被当成事实写死，会造成三层伤害：读者用它去检索，找不到任何论文，对课程可信度打折；它挤占了真实概念的位置，让人以为 DeepSeek 还有个没学到的模块；更糟的是，二手文章互相抄后，错误会被当成「共识」反过来污染更多资料。反过来，坚持来源纪律——A 级写死、B 级标注、C 级标疑似——让每个数字都能追到出处，读者可以自行核对。这也是 M7 后面 L69 的 R1 推理链能放心写死 2501.12948 与 Nature 收录的原因：它有确切出处。把核实表当成一张「作弊条」，以后遇到任何架构名词，先过一遍「出自哪、哪一级、能否写死」，再动笔。下一课 L69 回到技术主线，讲 R1 如何用纯 RL 激励推理。

:::tip

### 一句话收束

mFformer：**查无官方来源，疑似混淆 MLA/MTP/DeepSeekMoE，C 级定论，只能写成疑似**。与之相对，MLA、解耦 RoPE、DeepSeekMoE、MTP、aux-loss-free、DualPipe/FP8、R1 都有明确论文与仓库支撑，数字可写死。来源纪律的本质是「按级别决定表述强度」——A 级可写死、B 级要标注、C 级标疑似。把这张核实表记住，就不会再被一个听起来很像的名词带偏。

:::
`,
    null,
    [
      {
        text: '对「mFformer」最准确的定论是？',
        options: [
          '它是 DeepSeek-V3 的核心注意力模块',
          '无官方来源，疑似把 MLA/MTP/DeepSeekMoE 等记混，属 C 级定论',
          '它是 R1 的强化学习算法',
          '它是 FP8 的另一种叫法',
        ],
        answer: 1,
        explain:
          '在 DeepSeek 官方论文与仓库中查无 mFformer，按 B1-09 的 C 级定论处理：无官方来源、疑似混淆，不当作事实写死。',
        concept: 'mfformer-verdict',
      },
      {
        text: 'mFformer 这个说法最可能混淆了哪些真实概念？',
        options: ['MLA、MTP、DeepSeekMoE', 'GQA、RoPE、LayerNorm', 'SGD、Adam、动量', 'HTTP、TCP、IP'],
        answer: 0,
        explain:
          '它像是把 MLA 的低秩注意力、MTP 的多 token 预测、DeepSeekMoE 的细粒度专家揉成一个不存在的名字。',
        concept: 'mfformer-verdict',
      },
      {
        text: '关于来源级别，下列做法正确的是？',
        options: [
          'C 级结论可以写死成论文事实',
          'A 级官方数字可写死；B 级标第三方复算；C 级无来源只能标疑似、待核实',
          '所有级别都一律当真',
          '不用管来源',
        ],
        answer: 1,
        explain:
          'A 级（官方论文/仓库）可写死，B 级（第三方复算等）需标注，C 级无来源只能作为待核实的疑似表述。',
        concept: 'mfformer-verdict',
      },
      {
        text: 'DeepSeek-V3 的真实配置是？',
        options: ['236B 总参、21B 激活', '671B 总参、37B 激活', '67B 密集', '7B  MATH 51.7%'],
        answer: 1,
        explain: 'V3 是 671B 总参、37B 激活；236B/21B 是 V2，67B 是密集基座，7B/MATH 51.7% 指 DeepSeekMath。',
        concept: 'mfformer-verdict',
      },
    ],
    [
      ['mFformer', '查无官方来源的名词，疑似混淆 MLA/MTP/DeepSeekMoE，C 级定论'],
      ['C 级定论', '无官方来源支撑的结论，只能表述为疑似/待核实，不可写死为事实'],
      ['来源纪律', '按 A/B/C 级别决定数字能否写死、是否标注，防止误记变成课程事实'],
      ['真实概念', 'MLA、MTP、DeepSeekMoE、解耦 RoPE、DualPipe、FP8 等有论文与仓库支撑'],
      ['误记', '把不同概念或不同代的数字张冠李戴，如把 V2 参数安到 V3'],
    ],
    [
      '把 mFformer 当作真实模块写进正文——查无来源，只能记 C 级疑似。',
      '把 V2 的 236B/21B 与 V3 的 671B/37B 混用。',
      '把 DeepSeekMath 7B MATH 51.7% 当成通用对话模型成绩。',
      '把「无来源」等同于「不存在于任何讨论」——它可能被误传，但无官方出处。',
    ],
  ),
  'framework',
)
