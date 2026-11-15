import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 13 ========== */

export const L82 = withKind(
  L(
    'L82',
    13,
    'LLM-as-Judge：用模型评模型（评分维度设计、偏差与缓解）',
    3,
    ['L81'],
    ['llm-as-judge'],
    [
      '用 TypeScript 实现 pointwise 与 pairwise 两种评审器，含 rubric 与理由输出',
      '识别位置偏差、自我偏好、长度偏差，并用交换顺序、盲评、校准集缓解',
      '用人工标注集测 judge 与人的一致率，判定它是否可用',
    ],
    `
### judge 分数涨了 8 个点，人工评分没动

一个客服 Agent 的评测里有一个「回答清晰度」维度，用模型当评委。某次改动后该维度从 3.4 涨到 4.1（五分制），团队据此判断「表达质量提升了」。

两周后人工抽检同一批样本，人工评分是 3.3 → 3.2，略微下降。

把 judge 的评分理由打出来看，原因很清楚：judge 给出的高分理由几乎都包含「回答很详细」「覆盖了多个方面」「结构清晰」，而人工扣分的理由集中在「说了太多无关内容」「该给结论的地方还在铺陈」。改动确实让回答变长了、结构变复杂了——judge 把「长且有结构」当成「清晰」，人把同一件事当成「啰嗦」。

这不是 judge 坏了，是它**在按自己能看见的特征评分**。长度与结构是它最容易测量的，而「是否切题」需要领域判断。理解这一点，就能理解 LLM-as-Judge 的全部工程约束：它的分数衡量的是「judge 能感知的质量」，不完全等于「用户感知的质量」。

### judge 的适用面

| 场景 | 适合 judge | 原因 |
| --- | --- | --- |
| 有标准答案 | 不适合 | 用精确匹配或校验器，便宜且确定 |
| 可执行验证（跑测试、校验 schema） | 不适合 | 验证器给出的信号是二值的、可复现的 |
| 主观质量（清晰度、语气、有用性） | 适合 | 没有客观判据，只能用判断 |
| 大规模粗筛 | 适合 | 成本低于人工，用于把候选从 1000 条缩到 100 条 |
| 高风险终审 | 不适合 | judge 有系统性偏差，最终判定要人做（L71） |

判据可以压缩成一句：**能写成代码验的就不要用 judge**。judge 的位置在「写不成代码、又必须打分」的缝隙里。

### 两种评审形态

| 形态 | 输入 | 输出 | 特点 |
| --- | --- | --- | --- |
| pointwise | 一个回答 + rubric | 各维度分数 + 理由 | 可单独评、成本低；但分数不可跨批次比较 |
| pairwise | 两个回答 + 任务 | 哪个更好 + 理由 | 更稳、更接近人的判断方式；但只能做相对比较 |

pointwise 的致命问题是**分数漂移**：同一个回答在不同批次里可能得到 3.7 或 4.1，取决于同批其他回答的整体水平。所以 pointwise 分数只能用于「同批次内排序」，不能「这周 4.1 比上周 3.9 好」。

pairwise 没有这个问题（它比的是两个具体对象），但代价是 O(n²) 的比较次数和「无法给出绝对分数」。工程上的常见组合是：**用 pairwise 做模型间 / 版本间比较，用 pointwise 做单条粗筛**。

:::deep

### 三个偏差与它们的物理来源

**位置偏差**：pairwise 时 judge 倾向选第一个（或最后一个，取决于模型）。来源是注意力分布——放在前面的内容在长上下文里权重更高。它的大小可以测：把同一对回答交换顺序跑两次，如果结论翻转率超过 20%，位置偏差就不可忽略。

**自我偏好**：judge 与被测是同一个模型时，它会偏好自己风格的输出。来源是表征相似——它更容易「理解」与自己分布接近的文本，从而把「易懂」误认为「更好」。缓解办法是换一个模型做 judge，或者至少换一个不同的系统提示。

**长度偏差**：judge 倾向给更长的回答更高分。这是最顽固的一个，因为「详细」在很多 rubric 里确实是加分项。实测中它的效应量常常大于真实质量差异——这也是开头那个事故的直接原因。

三者有一个共同点：**它们都不是随机噪声，而是系统性偏移**。随机噪声可以通过多次采样平均掉，系统偏移不能——平均之后偏移还在。所以解法必须是结构性的（换顺序、盲评、换模型），而不是「多跑几次取平均」。

:::

### 缓解：四个可落地的做法

\`\`\`ts title="pairwise + 交换顺序消除位置偏差"
export interface Verdict {
  winner: 'A' | 'B' | 'tie'
  reason: string
  dims?: Record<string, number>
}

export interface JudgeClient {
  ask(prompt: string): Promise<string> // 返回 JSON 字符串
}

const SYS = [
  '你是严格的评审员。只根据给定标准判断，不要因为长度、格式、措辞华丽而加分。',
  '如果两者质量实质相当，必须判 tie，不要为了给出结论而勉强选择。',
  '输出 JSON：{"winner":"A|B|tie","reason":"不超过 80 字，必须引用具体内容"}',
].join('\\n')

function buildPrompt(task: string, a: string, b: string): string {
  return [
    '任务：' + task,
    '标准：① 是否直接回答了问题 ② 事实是否准确 ③ 是否有与任务无关的内容',
    '',
    '【回答 A】',
    a,
    '',
    '【回答 B】',
    b,
  ].join('\\n')
}

/** 双向各评一次，结论不一致则判 tie —— 位置偏差的直接对消 */
export async function pairwise(judge: JudgeClient, task: string, a: string, b: string): Promise<Verdict> {
  const first = JSON.parse(await judge.ask(SYS + '\\n\\n' + buildPrompt(task, a, b))) as Verdict
  // 交换顺序：原来的 B 放到 A 位置
  const second = JSON.parse(await judge.ask(SYS + '\\n\\n' + buildPrompt(task, b, a))) as Verdict

  const flip = (v: Verdict): Verdict['winner'] => (v.winner === 'A' ? 'B' : v.winner === 'B' ? 'A' : 'tie')
  const s = flip(second) // 把第二次的 A/B 映射回原顺序

  if (first.winner === s) return { winner: first.winner, reason: first.reason }
  return { winner: 'tie', reason: '顺序不一致：' + first.reason + ' / ' + second.reason }
}
\`\`\`

三个细节：

1. **系统提示里显式禁止长度加分**。这不是万能药（judge 仍会受影响），但能显著降低效应量，且成本为零。
2. **允许判 tie，并明确要求**。不写这一句时，judge 几乎从不输出 tie——它会为了「完成任务」而硬选一个。
3. **不一致时判 tie 而不是取平均**。结论翻转说明这一对回答的质量差异落在 judge 的噪声范围内，此时「分不出高下」才是诚实的输出。

**盲评**是第四个做法：把回答里的作者信息、模型名、时间戳全部去掉。听起来多余，但实测中带上「由 GPT-x 生成」这类标签会让 judge 的判定偏移——它认识这个名字。

### 校准：judge 到底能不能用

最重要的一步不是设计 prompt，是**测 judge 与人的一致率**。做法很简单：拿 50–100 条人工已标注的样本，让 judge 也评一遍，算一致率。

\`\`\`ts title="一致率与可用性判定"
export interface Labeled {
  id: string
  human: 'A' | 'B' | 'tie'
  judge: 'A' | 'B' | 'tie'
}

export interface Agreement {
  n: number
  raw: number // 简单一致率
  kappa: number // Cohen's kappa：扣除随机一致后的真实一致
  usable: boolean
}

export function agreement(rows: Labeled[]): Agreement {
  const n = rows.length
  const raw = rows.filter((r) => r.human === r.judge).length / n

  // 边际分布
  const cats = ['A', 'B', 'tie'] as const
  const ph = cats.map((c) => rows.filter((r) => r.human === c).length / n)
  const pj = cats.map((c) => rows.filter((r) => r.judge === c).length / n)
  const expected = ph.reduce((s, v, i) => s + v * pj[i], 0)
  const kappa = expected === 1 ? 1 : (raw - expected) / (1 - expected)

  return { n, raw, kappa, usable: kappa >= 0.6 && n >= 50 }
}
\`\`\`

为什么要看 kappa 而不是简单一致率：如果 80% 的样本人工都判 A，judge 全判 A 也能拿到 80% 的「一致率」，但它的 kappa 接近 0——它没有判断能力，只是在猜多数类。

经验阈值：kappa ≥ 0.6 表示「substantial agreement」，可以用于粗筛；≥ 0.8 才接近人工水平。低于 0.4 时 judge 的分数基本无用，哪怕它的理由看起来很合理。

:::warn

### 四个让 judge 结论失效的做法

**第一，用同一模型既生成又评分。** 自我偏好会让分数稳定偏高，且偏高的幅度与被测版本无关——所以它连「相对比较」也不可靠。

**第二，把 judge 分数当绝对能力。** 「4.1 分」本身没有意义，只有「同批次内比另一个高 0.3」有意义。跨批次比分数是 pointwise 最常见的误用。

**第三，不做校准就直接上 CI 门禁。** 未校准的 judge 可能对某类改动系统性敏感（比如开头那个「变长就加分」），门禁会持续给出错误的通过或拦截。上线前至少要有 50 条人工标注的一致率。

**第四，judge 的理由不落盘。** 理由是唯一能审计 judge 的东西。分数掉点时，你需要看它「因为什么给低分」才能判断是系统退化还是 judge 变了。不存理由的 judge 与一个随机数生成器在排查时没有区别。

:::

### 一个务实的组合

把这一课和 L81 的 harness 接起来的推荐配置：

- **判定分层**：能写成断言的用 \`exact\` / \`predicate\`（L81），只有写不成的才走 judge。一个健康的评测集里，judge 覆盖的用例比例通常在 20–40%。
- **judge 用 pairwise 做版本比较**，每个 pair 双向各跑一次，不一致判 tie；tie 的比例本身就是个指标——它升高说明两个版本的真实差异在变小。
- **每次改 prompt 或换 judge 模型，都重跑校准集**。judge 本身就是被测系统的一部分，它会随版本漂移。
- **judge 分数只作为趋势，不作为门禁的硬阈值**，除非 kappa 已验证 ≥ 0.6。

### Stage 13 收束

六课构成一条完整的链路：L77 定义「变好」的维度，L78 从轨迹里算过程指标，L79 说清外部基准的边界，L80 建立自己的基线与快照纪律，L81 把前面四课装成可重复的 harness，L82 补上「没有客观判据时怎么打分」这一块。

一条贯穿的判断：**评测的价值不在分数，在「结论能不能被复述」**。一个好的评测结论应当能说成「在 260 条固定样本集上，用 L78 的三个轨迹指标与 L82 校准过的 judge，与 v1.4 的快照相比，正确性提升 4 个百分点、p95 步数未劣化、成本上升 8%」。说不出这句话的评测，无论跑多少次都不构成证据。
`,
    null,
    [
      {
        text: 'judge 分数从 3.4 涨到 4.1 但人工评分下降，最可能的原因是？',
        options: [
          'judge 有 bug',
          '长度偏差——judge 把「长且有结构」当成「清晰」，而人认为啰嗦',
          '人工标注错了',
          '样本太少',
        ],
        answer: 1,
        explain: 'judge 按自己能看见的特征评分，长度与结构是最易测量的。',
        concept: 'llm-as-judge',
      },
      {
        text: 'pointwise 分数的致命问题是？',
        options: [
          '成本太高',
          '分数会随同批其他回答的水平漂移，不能跨批次比较',
          '无法给出理由',
          '只能评一个维度',
        ],
        answer: 1,
        explain: '所以 pointwise 只用于同批次排序，版本比较应使用 pairwise。',
        concept: 'llm-as-judge',
      },
      {
        text: '校准 judge 时为什么要看 kappa 而不是简单一致率？',
        options: [
          'kappa 更易计算',
          '若样本多数类占比高，judge 全猜多数类也能拿到高一致率，而 kappa 接近 0',
          'kappa 能跨语言',
          '一致率不稳定',
        ],
        answer: 1,
        explain: 'kappa 扣除随机一致，才反映真实判断能力。',
        concept: 'llm-as-judge',
      },
      {
        text: '位置偏差为什么不能靠「多跑几次取平均」解决？',
        options: [
          '成本太高',
          '它是系统性偏移而非随机噪声，平均之后偏移仍在',
          '采样次数有限',
          '平均会放大方差',
        ],
        answer: 1,
        explain: '解法必须结构性：交换顺序、盲评、换模型。',
        concept: 'llm-as-judge',
      },
    ],
    [
      ['LLM-as-Judge', '用模型按 rubric 给输出打分，适用于无客观判据的主观质量'],
      ['位置偏差', 'pairwise 时倾向某一位置的回答，可用双向交换对消'],
      ['校准集', '人工已标注的样本集，用于测 judge 与人的一致率'],
      ['Cohen kappa', '扣除随机一致后的真实一致度，≥0.6 才可用于粗筛'],
    ],
    [
      'judge 把「长且有结构」当成「清晰」，分数上涨而人工评分下降。',
      '跨批次比较 pointwise 分数，把批次效应当成版本改进。',
      '同模型既生成又评分，自我偏好使分数稳定偏高。',
      '不落盘 judge 理由，掉分时无法区分系统退化与 judge 漂移。',
    ],
  ),
  'practice',
)
