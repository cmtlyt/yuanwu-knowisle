import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 1 ========== */

export const L09 = withKind(
  L(
    'L09',
    1,
    '选型清单：哪些任务适合 Agent，哪些该用传统代码',
    2,
    ['L08'],
    ['agent-selection'],
    [
      '理解按「正确结果能否精确定义」选型的判据',
      '掌握四类任务的选型表与五个否决项',
      '能用评分函数与反例回归断言说明「不该用 Agent」的场景',
    ],
    `
### 三十行能算对的事，做成 Agent 之后开始算错

某团队把「按固定规则计算运费」接进了 Agent：规则表有六行（满 99 包邮、偏远地区加价、生鲜另计……），原本一个纯函数加二十条单元测试就能盖住。改造后，模型每轮读规则表、判断适用哪条、再算金额。上线两周出现两类问题：一是成本涨了约二十倍，一次计算要过模型好几轮；二是偶发算错，有次把「满 99 包邮」理解成了「满 99 减 99」，而且**没法写一条精确断言把它钉住**——同样的输入这次对、下次错。

复盘结论很朴素：这个任务的**正确结果可以被一个纯函数精确定义**，那么让模型去「判断」它，就是把确定性问题变成了概率问题。L08 已经说过，控制权交给模型的代价是路径不确定、断言要换成分布；这一课要回答的是：**这份代价在什么任务上根本不值得付**。

### 四类任务，两种答案

| 任务类型 | 正确结果能否精确定义 | 路径是否固定 | 建议 | 替代方案 |
|---|---|---|---|---|
| 确定性计算（运费 / 税率 / 折扣） | 能 | 固定 | **不用 Agent** | 纯函数 + 表驱动单测 |
| 单步生成（摘要 / 翻译 / 改写） | 不能，但没有动作选择 | 固定 | 不用 Agent，用一次模型调用 | 结构化输出 + 校验（L106） |
| 多步开放任务（研究 / 排查 / 规划） | 不能 | 不固定 | **适合 Agent** | — |
| 与外部系统交互且路径随结果变化 | 部分能 | 不固定 | 适合，但要强护栏 | 动作白名单 + 幂等（L85/L70） |

第二行最常被误判：摘要用了模型，于是有人顺手把整个系统叫成 Agent 并配上循环、预算、轨迹评测。但 L06 已经给过判据——模型没有选择下一步，只负责产出文本，按「一次调用 + 输出校验」处理即可。第三、四行才是 Agent 的甜区：**任务本身就需要「看结果再决定下一步」**，没有人在事前能把路径写全。

:::deep
### Agent 的成本不在钱，在不可判定性

讨论选型时大家常盯着 token 单价，但 token 只是最小的一笔。真正的成本是**你放弃了精确断言的能力**：纯函数可以用 \`assert.equal(shippingFee(...), 12)\` 钉死，Agent 只能用通过率、区间、人工抽检来描述（L77）。一旦某段逻辑对正确性要求极高、或合规上要求「每次结果一致」，这种放弃就是不可接受的。

由此得到一条很好用的主判据：**如果正确结果能被一个纯函数精确定义，就不要交给模型决定**。它比「任务复杂吗」「要不要用大模型」都可靠，因为它直接问的是「你愿不愿意把可判定的东西换成不可判定的」。运费、税率、权限判定、金额核对、状态机流转，全都属于这一类——哪怕它们看起来有很多分支，分支多不等于需要临场判断。

反过来说，适合 Agent 的任务通常有一个共同特征：**路径要由中途的观察才能确定**。研究时不知道会不会查到反方材料，排障时不知道下一步该看哪个日志，规划时不知道第一步会不会失败。这类任务里，「写死路径」本身就是错的，付出不确定性的代价才划算。
:::

### 评分函数与反例回归断言

\`\`\`ts title="选型评分：先看否决项，再看收益" note="要点：任一否决项命中就直接返回不用 Agent；不要把评分做成加权平均。"
type Criteria = {
  exactAnswerDefinable: boolean   // 正确结果能否用纯函数精确定义
  requiresConsistency: boolean    // 合规/审计是否要求每次完全一致
  pathDependsOnObservation: boolean
  hasExternalSideEffects: boolean
  latencyBudgetMs: number
  irreversibleSideEffects: boolean
}

function shouldUseAgent(c: Criteria): { use: boolean; reason: string } {
  const veto: string[] = []
  if (c.exactAnswerDefinable) veto.push('结果可精确定义，用纯函数')
  if (c.requiresConsistency) veto.push('要求每次一致，模型波动不可接受')
  if (c.latencyBudgetMs < 1_000) veto.push('时延预算不足以容纳多轮')
  if (c.irreversibleSideEffects) veto.push('有不可逆副作用，先解决幂等与审批')
  if (!c.pathDependsOnObservation) veto.push('路径不依赖观察，写死即可')
  if (veto.length) return { use: false, reason: veto.join('；') }

  return {
    use: true,
    reason: c.hasExternalSideEffects
      ? '适合，但必须配动作白名单与幂等键'
      : '适合，路径需由观察决定',
  }
}

const shipping = shouldUseAgent({
  exactAnswerDefinable: true, requiresConsistency: true,
  pathDependsOnObservation: false, hasExternalSideEffects: false,
  latencyBudgetMs: 200, irreversibleSideEffects: false,
})
// -> { use: false, reason: '结果可精确定义…；路径不依赖观察…' }
\`\`\`

\`\`\`ts title="反例的正确实现：纯函数 + 精确断言" note="要点：分支多不等于需要临场判断；规则表可变，计算逻辑不变。"
const RULES = [
  { test: (o: Order) => o.total >= 99, fee: 0 },
  { test: (o: Order) => o.region === 'remote', fee: 20 },
  { test: (o: Order) => o.category === 'fresh', fee: 15 },
]
function shippingFee(o: Order): number {
  return RULES.find((r) => r.test(o))?.fee ?? 8
}

assert.equal(shippingFee({ total: 120, region: 'east', category: 'book' }), 0)
assert.equal(shippingFee({ total: 30, region: 'remote', category: 'book' }), 20)
assert.equal(shippingFee({ total: 30, region: 'east', category: 'fresh' }), 15)
\`\`\`

评分函数特意用**否决项**而不是加权分数。加权会让「路径不固定」这一条的高分把「结果必须精确」盖过去，得出一个看似合理、实则把运费交给模型的结论。选型里有些条件是不可交易的，就该写成一票否决。

### 五个否决项，逐条看代价

1. **正确结果可精确定义** → 纯函数；否则把可判定变成概率。
2. **合规 / 审计要求每次一致** → 模型波动不可接受（L77 的区间也救不了「必须完全相同」）。
3. **时延预算极紧** → 多轮推理与工具调用很难压进一秒以内（L120 的低时延语音场景尤其明显）。
4. **副作用不可逆且没有幂等 / 审批** → 先补 L70 / L71，再谈自主决策。
5. **高频低成本** → 每次都要过模型，成本与容量按峰值算会非常难看（L88 / L125）。

注意第 4 条不是「永远不做」，是「顺序不能反」：先把幂等键、动作白名单、人工审批做扎实，Agent 才有资格碰这类系统。L117 的数据 Agent 之所以要先建语义层与只读闸，正是同一条逻辑。

:::warn
### 两个必踩的坑

- **因为「看起来高级」上 Agent**。评审里最难反驳的理由往往是「以后可能会更复杂」；但为假想的未来路径提前付出不可判定性，通常不如先把今天的规则表写清楚——真需要时再迁移，成本比想象中低。
- **把 Agent 当万能胶水**。两个系统本该用一次 API 直连、带明确 schema 与错误处理，却让模型「看着办」去拼参数。这会把本可静态检查的接口错误变成运行时概率事件，排查成本陡增。
:::

### 与相邻课的分工

- **L06 / L08**：分别给边界与「控制权转移的后果」，本课用它们推导「什么时候不值得付这份代价」。
- **L77 / L80**：评测维度与回归基线，解释了「放弃精确断言」具体放弃了什么。
- **L85 / L70 / L71**：最小权限、幂等、人在回路，是第 4 条否决项的前置条件。
- **L88 / L125**：成本与容量，对应第 5 条。
- **L112**：框架选型矩阵回答「用哪个框架」，本课回答更前面的一问——「到底要不要 Agent」。

**一句话收束**：能写成精确断言的逻辑不要交给模型；Agent 的甜区是**路径必须由中途观察才能确定**的任务。
`,
    null,
    [
      {
        text: '「按固定规则算运费」最不该做成 Agent 的理由是？',
        options: [
          '规则太多',
          '正确结果可用纯函数精确定义，交模型等于把确定性变成概率',
          '模型太贵',
          '没有前端',
        ],
        answer: 1,
        explain: '分支多不等于需要临场判断。',
        concept: 'agent-selection',
      },
      {
        text: '选型评分函数为什么用否决项而不是加权分数？',
        options: [
          '代码更短',
          '加权会让「路径不固定」盖过「结果必须精确」这类不可交易条件',
          '加权不好测试',
          '没有原因',
        ],
        answer: 1,
        explain: '有些条件一票否决，不能互相折算。',
        concept: 'agent-selection',
      },
      {
        text: '哪类任务最适合 Agent？',
        options: ['税率计算', '固定格式摘要', '路径要由中途观察才能确定的研究与排障', '定时发邮件'],
        answer: 2,
        explain: '路径事前写不全，才值得付不确定性的代价。',
        concept: 'agent-selection',
      },
    ],
    [
      ['主判据', '正确结果能否被纯函数精确定义；能就别交给模型决定'],
      ['否决项', '精确可定义 / 要求一致 / 时延极紧 / 不可逆副作用 / 高频低成本'],
      ['路径依赖观察', 'Agent 甜区的共同特征：下一步要由中途结果才能确定'],
    ],
    [
      '为「以后可能更复杂」提前上 Agent，把今天可判定的逻辑换成不可判定的。',
      '让模型「看着办」去拼两个系统间的 API 参数，把静态可查的接口错误变成运行时概率事件。',
    ],
  ),
  'theory',
)
