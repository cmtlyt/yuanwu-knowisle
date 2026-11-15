import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 13 ========== */

export const L78 = withKind(
  L(
    'L78',
    13,
    '轨迹级评测的工程实现',
    3,
    ['L77'],
    ['trajectory-eval'],
    [
      '实现步骤数、工具成功率、冗余动作率三个轨迹指标的计算',
      '说清「冗余」的三种判定口径与分母选择的影响',
      '识别「结果对但过程烂」的三种形态：绕路、重复、危险接近',
    ],
    `
### 答案对了，代价是二十三次工具调用

一个「查订单并回答退款进度」的任务在评测里通过了——最终答案正确。但看轨迹：模型调了 23 次工具，其中 15 次是对同一个查询的重复（参数完全相同，因为第一次返回空它以为超时了），另有 3 次调用的是与任务无关的工具（库存查询、物流轨迹）。

这个任务耗时 47 秒、花费 0.31 元。同一批样本里，同类任务的中位数是 4 次工具调用、6 秒、0.04 元。

如果评测只看最终答案，这条轨迹和一条 4 次调用的优雅轨迹得分完全相同。而这个差异在实际系统里意味着：成本高 8 倍、时延高 8 倍、并且当并发上来时它会先打满工具配额。

**结果评测回答「对不对」，轨迹评测回答「值不值」。** 两者的差别在任务简单时看不出来，在生产环境里是数量级的差别。

### 结果评测与轨迹评测的分工

| 维度 | 结果评测 | 轨迹评测 |
| --- | --- | --- |
| 输入 | 最终答案 | 完整 span 树 |
| 回答 | 对不对 | 值不值、稳不稳、有没有擦边 |
| 实现成本 | 低（可比对、可人工） | 中（需要追踪，L73） |
| 发现的问题 | 错误答案 | 绕路、重复、危险接近 |
| 盲区 | 过程完全不可见 | 无法判断答案本身对错 |

两者不可替代：只看结果会漏掉「用错误的方式答对了」（比如靠猜、靠巧合、靠调用不该调的工具）；只看轨迹则根本不知道答案对不对。生产上的做法是**结果评测做门禁、轨迹评测做趋势**——前者决定能不能上线，后者决定该往哪优化。

### 三个指标

\`\`\`ts title="从 span 树算轨迹指标"
export interface ToolSpan {
  name: string
  argsDigest: string // 入参摘要（L75 的 digest）
  step: number
  ok: boolean
  ms: number
  errorType?: string
}

export interface TrajectoryMetrics {
  steps: number // 有多少轮 step
  toolCalls: number // 工具调用总次数
  toolSuccessRate: number // 成功调用 / 总调用
  redundantCalls: number // 冗余调用次数
  redundantRate: number // 冗余 / 总调用
  distinctTools: number // 用到的不同工具数
  retriedCalls: number // 同参重试次数
}

export function metrics(tools: ToolSpan[]): TrajectoryMetrics {
  const steps = new Set(tools.map((t) => t.step)).size
  const seen = new Set<string>()
  let redundant = 0
  let retried = 0

  for (const t of tools) {
    const key = t.name + '|' + t.argsDigest
    if (seen.has(key)) {
      redundant++
      // 同参第二次及以上且第一次失败 → 归为「重试」，单独计数
      if (!t.ok) retried++
    } else {
      seen.add(key)
    }
  }

  const okCount = tools.filter((t) => t.ok).length
  return {
    steps,
    toolCalls: tools.length,
    toolSuccessRate: tools.length === 0 ? 1 : okCount / tools.length,
    redundantCalls: redundant,
    redundantRate: tools.length === 0 ? 0 : redundant / tools.length,
    distinctTools: new Set(tools.map((t) => t.name)).size,
    retriedCalls: retried,
  }
}
\`\`\`

三个指标各自的用途与陷阱：

- **步骤数**（\`steps\`）：反映「思考了几轮」。陷阱是它按 step 去重计数，所以一轮里调五个并行工具只算一步——要判断并行度得看 \`toolCalls / steps\`。
- **工具成功率**：分母是**总调用数**而不是「不同工具数」。按工具去重会把「同一个工具失败十次」算成一次失败，完全掩盖问题。
- **冗余动作率**：最有用也最容易算错，下面单独说。

### 冗余的三种口径

「冗余」没有唯一定义，三种口径的严格程度递增：

| 口径 | 判定 | 能发现 | 会误伤 |
| --- | --- | --- | --- |
| 重复键 | 同工具 + 同入参出现 ≥2 次 | 明显的重复调用 | 「查两次确认」这类合理重复 |
| 无效重试 | 同键且第一次失败、之后仍失败 | 拿同一个错参数硬试 | 无（严格定义） |
| 绕路 | 实际步数 / 基线中位步数 超过阈值 | 用大量无用步骤达成目标 | 新类型任务（无双基线可比） |

工程上建议**同时算前两个**，第三个作为趋势指标单独看而不做门禁。原因是「绕路」依赖基线，而基线在没有同类历史时不可用（L80 会讲基线怎么建）。

第一个口径的误伤需要说明：有些重复是合理的——「查一次余额、做完操作再查一次确认」是同工具不同入参（digest 不同），不会被算冗余；真正被算进去的是**参数完全相同**的重复，这类重复几乎总能归因为「模型不确定上一次是否成功」。

:::deep

### 为什么冗余率的分母必须是总调用数

一个容易想到的替代方案是以「任务数」为分母（每个任务平均几次冗余）。它的问题是不能跨任务类型比较：简单任务冗余 0.2 次、复杂任务冗余 1.5 次，混在一起算平均值会被任务构成左右。

以总调用数为分母（冗余占比）则有明确含义：**在所有工具调用里，有多少是白做的**。它的取值范围天然被限制在 0–1，且不受任务规模影响，因此可以直接在趋势图上看。

更重要的原因是这个比值有直接的业务解释：如果冗余率是 30%，那么把冗余消掉就能让工具调用成本降 30%。以任务数为分母时没有这个换算关系。

还有一个细节：分母要不要包含冗余调用本身？要。因为我们要回答的是「在全部调用中冗余占多少」，而不是「在必要调用中冗余占多少」——后者会随冗余增加而虚高。

:::

### 「结果对但过程烂」的三种形态

**形态一：绕路。** 答案对，但用了远超必要的步骤。典型成因是工具选择困难（工具太多、schema 描述不清），模型试了几个才找到对的。它对成本的伤害最大（L66 讲过的「工具多不等于角色多」）。

**形态二：重复。** 同参数反复调用。成因通常是「无法确认上次是否成功」——尤其当工具返回空结果或超时时。修法在工具层：返回结构里明确写「空结果」而不是「空值」，或给工具加幂等键让模型敢于重试（L68 讲过幂等键）。

**形态三：危险接近。** 这条最容易被忽略：答案对，但过程中调用了本不该调用的工具。比如一个「查天气」任务顺手调了用户信息接口；一个只读任务调了写接口但恰好参数为空所以没生效。

形态三无法用任何比率指标捕获，只能靠**工具集白名单校验**：给每个任务类型声明允许的工具集，轨迹里出现白名单外的调用就判失败。它属于安全维度（L77），但检测手段在轨迹层。

:::warn

### 三个实现陷阱

**第一，用消息数当步骤数。** 多 Agent 场景（L68）里消息数远大于步数，两者不可互换。步数应当从 span 树里 \`step\` 属性去重，或从运行时的轮次计数取。

**第二，把「工具返回业务错误」当成功。** \`ok: true\` 只表示这次调用没有抛异常，不代表业务成功。典型的坑是「查询返回 \`{error: 'not found'}\`」被算成成功调用——工具执行成功了，但业务失败了。修法是在工具层区分 \`transportOk\` 与 \`businessOk\`，指标按后者算。

**第三，忽略时序导致的假冗余。** 并行调用时两个同名同参工具可能同时发出（模型在同一轮里重复生成了），它们的 \`step\` 相同。按 \`step\` 分组统计冗余会把它们算成「同一轮内的重复」——这是对的，但如果你按时间排序后再算，可能因为完成顺序不同而误判为跨轮重复。

:::

### 从指标到判定

指标算出来只是数字，要变成评测结论还需要与基线比较（L80 详述）。一个最小可用的判定：

\`\`\`ts title="与基线比较：哪些指标退化了"
export interface Baseline {
  steps: number // 中位数
  toolCalls: number
  redundantRate: number
  toolSuccessRate: number
}

export interface Regression {
  metric: keyof Baseline
  base: number
  cur: number
  delta: number
  verdict: 'worse' | 'better' | 'ok'
}

/** 各指标的容忍度与方向：true = 越大越好 */
const RULES: Record<keyof Baseline, { up: boolean; tol: number }> = {
  steps: { up: false, tol: 0.15 },
  toolCalls: { up: false, tol: 0.2 },
  redundantRate: { up: false, tol: 0.05 }, // 绝对 5 个百分点
  toolSuccessRate: { up: true, tol: 0.03 },
}

export function regressions(cur: TrajectoryMetrics, base: Baseline): Regression[] {
  const out: Regression[] = []
  for (const key of Object.keys(RULES) as Array<keyof Baseline>) {
    const rule = RULES[key]
    const b = base[key]
    const c = cur[key as keyof TrajectoryMetrics] as number
    const worse = rule.up ? c < b - Math.abs(b) * rule.tol : c > b + Math.abs(b) * rule.tol
    const better = rule.up ? c > b + Math.abs(b) * rule.tol : c < b - Math.abs(b) * rule.tol
    out.push({ metric: key, base: b, cur: c, delta: c - b, verdict: worse ? 'worse' : better ? 'better' : 'ok' })
  }
  return out
}
\`\`\`

容忍度的设置有个原则：**相对指标用百分比，绝对指标用百分点**。\`steps\`、\`toolCalls\` 随任务规模缩放，用 15% / 20% 合理；\`redundantRate\` 本身是个比例（0–1），用 5 个百分点而不是 5%（后者在冗余率 3% 时几乎没有意义）。

这套判定的价值在于它能自动跑：一条轨迹进来，四个数字出来，退化项立刻可见。它不判断「好不好」，只判断「有没有变」。判断好坏仍然需要人类定标准（L77 的五维约束线）。

### 下一课的位置

轨迹评测解决了「过程能不能量化」。但它有一个隐含前提：你有自己的样本集和基线。而很多团队一开始没有，他们看的是公开基准的分数。下一课讨论那三个基准各能证明什么、不能证明什么。
`,
    null,
    [
      {
        text: '结果评测与轨迹评测的分工是？',
        options: [
          '互相替代',
          '结果评测做门禁（对不对），轨迹评测做趋势（值不值、稳不稳、有无擦边）',
          '轨迹评测更准所以只用它',
          '结果评测成本更低所以只用它',
        ],
        answer: 1,
        explain: '只看结果会漏掉「用错误方式答对」，只看轨迹不知道答案对不对。',
        concept: 'trajectory-eval',
      },
      {
        text: '工具成功率的分母应该是？',
        options: ['不同工具的数量', '总调用次数', '任务数', '成功的工具数'],
        answer: 1,
        explain: '按工具去重会把「同一工具失败十次」算成一次，掩盖问题。',
        concept: 'trajectory-eval',
      },
      {
        text: '冗余率以总调用数为分母而不是任务数的关键理由是？',
        options: [
          '计算更简单',
          '有直接业务解释：冗余率 30% 意味着消除冗余可省 30% 调用成本，且不受任务规模影响',
          '任务数无法统计',
          '总调用数更大',
        ],
        answer: 1,
        explain: '以任务数为分母时没有这种换算关系，且会被任务构成左右。',
        concept: 'trajectory-eval',
      },
      {
        text: '「危险接近」这种形态为什么无法用比率指标捕获？',
        options: [
          '它太罕见',
          '答案对、比率正常，只是调用了不该调的工具，只能靠工具集白名单校验',
          '它没有耗时',
          '它发生在评测之外',
        ],
        answer: 1,
        explain: '需要按任务类型声明允许的工具集，出现白名单外调用即判失败。',
        concept: 'trajectory-eval',
      },
    ],
    [
      ['轨迹评测', '对过程打分（步数、工具成功率、冗余率），与只看答案的结果评测相对'],
      ['冗余动作率', '白做的调用占总调用数的比例，可直接换算成本节省空间'],
      ['无效重试', '同工具同入参且失败的重复调用，属于最严格口径的冗余'],
      ['工具集白名单', '按任务类型声明允许调用的工具，用于捕获「危险接近」'],
    ],
    [
      '只看最终答案，漏掉 23 次工具调用、8 倍成本的劣质轨迹。',
      '工具成功率按去重后的工具数算，掩盖单工具反复失败。',
      '把「查询返回 not found」当成功调用，成功率虚高。',
    ],
  ),
  'practice',
)
