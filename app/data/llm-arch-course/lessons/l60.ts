import { L, withKind } from '../../course-builders.ts'

export const L60 = withKind(
  L(
    'L60',
    28,
    '商用/API 成本维度与自建回本判据',
    3,
    ['L57'],
    ['api-cost'],
    [
      '解释 $/1K input·output 与长上下文阶梯价',
      '把自建吞吐/显存成本与 API 价放同一模型',
      '给「自建回本 vs 直用 API」判据',
      '标注价格随时间变动',
    ],
    `### 两种获取算力的方式：买 API 还是自建

到这里，成本模型（L57）已经能算自建的 $/token，但工程决策还有另一半：直接调用商用 API。两条路各有账本——API 把模型当水电按量付费、零固定成本、按 token 计价；自建买卡部署、固定成本高但边际成本低，用量越高越划算。选型的本质是回答「我的用量与约束下，哪条路总成本低、风险小」。这一课把两者放进同一模型：统一到 $/1M token 口径，给出回本判据，并反复强调一条纪律——**商用 API 价格是 B 级、随时间变动，标注检索日、不担关键结论**；真正稳定的是成本模型的结构，不是某个今天的价格数字。下面所有具体价格都是演示量级，感性 understanding 用，绝不当结论。

### API 计价：input/output 分离与长上下文阶梯价

商用 API 的计费口径有三层，混淆会直接算错账。第一层，**input 与 output 分开计价**：输入 token（prompt）通常比输出 token（completion）便宜——因为输出是自回归逐 token 生成、占用算力时间更长。所以同一段对话，长 prompt 短回答与短 prompt 长回答的成本结构完全不同。第二层，**长上下文阶梯价**：支持更大上下文窗口的调用单价更高（或按实际窗口分段计价），因为大窗口吃更多 KV 与显存。第三层，**缓存/批处理折扣**：部分厂商对命中缓存的 prompt 或异步批处理给折扣，进一步改变有效单价。把这三层写进成本计算时，要分别统计 input token 数、output token 数、是否触发长上下文档、是否有缓存命中，再乘以各自单价求和。

:::deep

### 为什么价格必须标注「随时间变动」

这不是套话，而是成本决策的安全底线。商用 LLM 价格过去几年经历过数量级下降——同一模型半年内单价可能腰斩再腰斩；厂商还频繁调整上下文档位、推出新计价方式。若把今天的单价写进架构决策文档、当长期结论用，几个月后整篇分析就失效了。正确的做法是：价格一律标注「B 级、第三方、随时间变动，不担关键结论」，并记下检索日期；结论建立在**成本模型的结构**上（自建的 $/token 怎么算、回本点怎么随用量移动、input/output 比例如何影响总成本），而不是某个具体价格。这样即便价格变了，把新单价代入模型，结论自动生成——这才是稳健的工程决策。L57 里 GPU 租金的示例值同理，只是演示模型结构。

:::

### 自建 vs API：统一到 $/1M token

比较的前提是同口径。API 侧：总成本等于（input token 数乘 input 单价）加（output token 数乘 output 单价），再按 1M token 归一化。自建侧：沿用 L57 模型，总成本等于 GPU 租金乘运行时间加运维/电费折算，除以期间生成的 token 数——注意生成 token 数由吞吐决定，而吞吐受激活参 FLOPs 与 KV 显存/并发限制（L57 三条账）。两者都归一到 $/1M token 后，才在同一把尺子上。

但有两处不对称要如实处理：一是 API 通常还包含「不用管运维、弹性扩缩、随时升级模型」的隐性价值，自建要自己承担这些；二是自建的边际成本随用量下降（固定成本被摊薄），API 是线性计价——这正是回本点的来源。把固定成本、可变成本、隐性价值分开列，比较才不偏。

### 可跑代码：统一成本模型与回本点

把两侧成本写成可跑脚本，并求回本用量。

\`\`\`python
# API 单价（$/1M token，纯示意，B 级随时间变动，不担关键结论；检索日：2026-11）
API_IN = 1.0     # 每百万输入 token
API_OUT = 4.0    # 每百万输出 token（输出更贵）

def api_cost_m(input_m, output_m, in_p=API_IN, out_p=API_OUT):
    return input_m * in_p + output_m * out_p

# 自建（沿用 L57）：GPU 租金 + 运维，按吞吐折算（示意值）
GPU_PER_HOUR = 1.2          # B 级示意，随时间变动
OPS_FRACTION = 0.3          # 运维/电费折算为租金的 30%
THROUGHPUT_PER_HOUR = 9e6   # 每小时处理 token 数（9M）
FIXED_SETUP = 500.0         # 一次性搭建成本（$）

def self_host_cost_m(total_tokens, hours):
    var = (GPU_PER_HOUR * (1 + OPS_FRACTION)) * hours
    return (FIXED_SETUP + var) / (total_tokens / 1e6)

# 场景：input:output = 3:1，每月处理 600M input + 200M output
inp_m, out_m = 600, 200
c_api = api_cost_m(inp_m, out_m)
hours = (inp_m + out_m) / (THROUGHPUT_PER_HOUR / 1e6)
c_self = self_host_cost_m((inp_m + out_m) * 1e6, hours)
print(f"API 月成本≈\${c_api:.0f}；自建月摊成本≈\${c_self:.0f}")
\`\`\`

\`\`\`python
def breakeven_monthly_tokens(api_blended_per_m, gpu_per_hour, ops, fixed, throughput_per_hour):
    """求自建回本点：自建 $/1M = API 混合单价 时的月 token 量。"""
    # (fixed + (tok/qph)*gpu*(1+ops)) / (tok/1e6) = api_blended
    # fixed*1e6/tok + gpu*(1+ops)*1e6/qph = api_blended
    per_m_self_var = gpu_per_hour * (1 + ops) * 1e6 / throughput_per_hour
    return fixed * 1e6 / (api_blended - per_m_self_var)

blended = api_cost_m(3, 1) / 4          # 3:1 比例的混合单价
be = breakeven_monthly_tokens(blended, GPU_PER_HOUR, OPS_FRACTION, FIXED_SETUP, THROUGHPUT_PER_HOUR)
print(f"API 混合单价≈\${blended:.2f}/1M；自建回本量≈{be/1e6:.0f}M token/月")
assert be > 0, "回本点须为正（否则 API 单价低于自建可变成本，永不回本）"
# 结论：月用量高于回本量且稳定 → 自建划算；低于/波动 → API 更稳
\`\`\`

第一段把两侧成本算到同一口径并对比月成本；第二段解出回本点——当月用量高于回本量、且用量稳定（能摊薄固定成本）时自建划算，否则 API 更稳。所有价格是示意、B 级、随时间变动，只演示模型结构；把真实检索日价格代入即可重算。

### 一个完整的月度对比：把三层计价都算进去

光讲口径不够，走一遍完整账才有体感。假设一个产品每天处理 1000 万输入 token、200 万输出 token（input:output 约 5 比 1），其中 20% 的输入触发长上下文档、单价上浮。API 侧要把三段分开算：普通 input、长上下文档 input、output，各自乘单价再求和；自建侧要把这部分 token 量换成 GPU 小时数，再叠加固定搭建成本与运维系数。注意一个常见低估：自建的吞吐往往达不到标称峰值——KV 挤显存、长短请求混合导致并发下降（L57），实际吞吐可能只有峰值的几成，这会把自建 $/token 抬高不少。所以做对比时，自建吞吐要用**实测值**（L58 可测）而非宣传峰值。下面把这套完整对比写成代码，并让长上下文比例成为可调旋钮，观察它如何改变两侧成本。

\`\`\`python
def monthly_api_cost(in_m, out_m, long_frac, in_p=1.0, out_p=4.0, long_mult=2.0):
    """三层计价：普通 input + 长上下文档 input（上浮） + output。示意单价，B 级随时间变动。"""
    long_in = in_m * long_frac
    normal_in = in_m * (1 - long_frac)
    return normal_in * in_p + long_in * in_p * long_mult + out_m * out_p

def monthly_self_cost(in_m, out_m, eff_throughput_per_h, gpu=1.2, ops=0.3, setup=500):
    tok_m = in_m + out_m
    hours = tok_m / (eff_throughput_per_h / 1e6)
    return (setup + gpu * (1 + ops) * hours) / 1e3   # 返回千美元

for lf in (0.0, 0.2, 0.5):
    api = monthly_api_cost(in_m=300, out_m=60, long_frac=lf)
    print(f"长上下文占比 {lf:.0%}：API≈\${api:.0f}/月（单价示意，随时间变动）")
assert monthly_api_cost(300, 60, 0.5) > monthly_api_cost(300, 60, 0.0), "长上下文档应更贵"
self_k = monthly_self_cost(300, 60, eff_throughput_per_h=6e6)
print(f"自建≈\${self_k*1e3:.0f}/月（吞吐用实测有效值 6M/h，非峰值）")
\`\`\`

这段把三层计价落成可跑账：长上下文占比从 0 升到 50%，API 成本单调上升（阶梯价在起作用）；自建侧用「有效吞吐 6M/h」而非峰值，体现场景折损。真实决策把示意单价换成检索日官方价格、有效吞吐换成 L58 实测值，结论自动重算——这正是「结论立在模型结构、不立在价格数字」的具体做法。

### 自建回本判据：不只是算单价

回本判据不能只看「自建单价更低」，还要看三个条件是否同时成立。第一，**用量足够高且稳定**：自建有固定成本（买卡/搭建/运维），必须靠高用量摊薄；用量低或波动大时，固定成本摊不薄，自建反而更贵。第二，**能力匹配**：自建模型的能力要够用——若为了省钱自建一个明显更弱的模型，导致业务指标下降，省的钱抵不过损失。第三，**隐性成本可承担**：自建要自己处理扩容、故障、模型升级、安全合规，这些在 API 里是厂商负责的；团队没有相应能力时，隐性成本会吞掉账面上的节省。把三条件写成判据：用量高于回本点、能力达标、团队能承担运维，三者都满足才建议自建；否则优先 API。一个常见的稳健策略是混合——核心高用量路径自建、峰值与长尾走 API，兼顾成本与弹性。

:::tip

### 收束：价格会变，模型结构不变

API 计价三层（input/output 分离、长上下文阶梯、缓存折扣）要分别统计；自建与 API 统一到 $/1M token 才能比；回本点由稳定用量摊薄固定成本决定，并受能力匹配与运维能力约束。最重要的纪律：**所有商用价格是 B 级、随时间变动、标注检索日、不担关键结论**——结论立在成本模型结构上，价格一变代入新值即可重算。带着这套判据，L61 讲怎么用正确基准评估模型能力（选型另一半），进而支撑 L59 的决策报告。

:::
`,
    null,
    [
      {
        text: '商用 LLM API 的计费口径通常是？',
        options: [
          '只按输出 token 计费',
          '按输入与输出分别计价（$/1K input、$/1K output），长上下文有阶梯价，单位随时间变动',
          '按模型参数量计费',
          '固定月费不限量',
        ],
        answer: 1,
        explain:
          '主流 API 对 input/output token 分别标价，长上下文（更大窗口）通常更贵；这些是 B 级价格、随时间变动（标注检索日），不担关键结论。',
        concept: 'api-cost',
      },
      {
        text: '把自建与 API 放进同一成本模型，关键是？',
        options: [
          '只比较单次调用价格',
          '统一到 $/1M token：API 用报价，自建用 GPU 租金×时间÷吞吐，并计入显存/并发限制',
          '只比模型大小',
          '忽略长上下文',
        ],
        answer: 1,
        explain:
          '两者统一到单位 token 成本：API 用官方报价，自建用 L57 的 $/token 模型；口径一致才能比较，价格标 B 级随时间变动。',
        concept: 'api-cost',
      },
      {
        text: '「自建回本」判据的核心是？',
        options: [
          '自建永远更便宜',
          '当稳定用量×API单价 超过 自建固定+可变成本，且用量足够高摊薄固定成本时自建回本',
          'API 永远更便宜',
          '与用量无关',
        ],
        answer: 1,
        explain:
          '自建有固定成本（卡/运维）与可变成本（电费），需足够高的稳定用量摊薄固定成本；低用量/波动用量用 API 更划算。',
        concept: 'api-cost',
      },
      {
        text: '关于 API 价格在本课中的使用纪律，正确的是？',
        options: [
          '写死具体数字当关键结论',
          '标注为 B 级、随时间变动，注明检索日，不担关键结论',
          '当作永久不变',
          '无需标注来源',
        ],
        answer: 1,
        explain:
          '商用 API 价格是 B 级且频繁变动，必须标注「随时间变动/第三方，不担关键结论」并记检索日，结论靠成本模型结构而非具体价格。',
        concept: 'api-cost',
      },
    ],
    [
      ['$/1K input', '每千输入 token 的 API 价格，B 级随时间变动'],
      ['$/1K output', '每千输出 token 的 API 价格，通常高于 input，B 级'],
      ['长上下文阶梯价', '更大上下文窗口的调用单价更高，按窗口分段计价'],
      ['自建回本点', '稳定用量下自建总成本降到低于 API 总成本的使用量阈值'],
      ['固定成本 vs 可变成本', '自建的卡/运维是固定成本，电费/带宽是可变成本；API 近似纯可变'],
    ],
    [
      '把 API 报价写死当永久结论——价格 B 级、随时间变动，要标检索日。',
      '只比单次调用价、不算稳定用量与固定成本摊销——回本点由用量决定。',
      '自建成本只算 GPU 租金、忘了运维/KV 显存限制导致的吞吐折损。',
      '忽略 input/output 价差与长上下文阶梯价——用错单价会算错总成本。',
      '在用量低且波动时自建——固定成本摊不薄，反而不如 API。',
    ],
  ),
  'scenario',
)
