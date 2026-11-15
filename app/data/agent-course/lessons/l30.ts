import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 3 ========== */

export const L30 = withKind(
  L(
    'L30',
    3,
    '实战：同一任务跑三种范式并对比（成本 / 质量度量）',
    3,
    ['L28', 'L15', 'L13'],
    ['paradigm-benchmark'],
    [
      '为同一任务分别实现并跑通 ReAct / P&E / ToT 三种范式',
      '建立「成本 + 质量」双维度度量，客观对比',
      '对照三种范式在 LangGraph 中的实现差异',
    ],
    `
### 一次「凭感觉选型」的翻车

有个团队要给「竞品调研」功能选范式。讨论时大家的直觉很一致：P&E 先把计划列出来再执行，肯定比 ReAct 一步步试更省调用——因为「想清楚了再动手」。

他们按这个直觉选了 P&E，上线后发现单次调研的模型调用次数是 ReAct 的 **2.7 倍**。

原因在复盘时才看清：调研任务里有一半步骤依赖上一步的结果（先搜到公司名，才知道要去查哪个产品页），P&E 的计划只能写到「搜索 → 提取 → 汇总」这个粒度，执行时每遇到不确定就得重新规划一次，而每次重规划都要把整份计划连同已有结果重新喂给模型。省下的「试错调用」，被「重规划调用」加倍还了回去。

这个案例的教训不是「P&E 不好」，而是：**范式之间的成本差异依赖任务形状，不依赖范式本身的「名声」**。想选对，只能测。

本课就是把这套测量做出来：同一个任务集，三种范式各跑一遍，用可复核的四个指标给出对比表。

### 实验设计：四个必须钉死的前提

对比实验最常见的失败不是代码写错，而是**前提不一致**——比出来的差异其实是别的东西造成的。四个前提必须先钉死：

| 前提 | 为什么必须一致 | 不一致会怎样 |
|---|---|---|
| 同一任务集 | 任务难度直接决定调用次数 | 给 ReAct 简单任务、给 ToT 难题，结论完全反转 |
| 同一 evaluator | 判定标准决定「正确率」 | 各用一把尺子，正确率无意义 |
| 同一模型与温度 | 模型能力与随机性影响一切指标 | 换了模型，差异里混进了模型差异 |
| 多次采样（n ≥ 3） | 单次结果的方差可能大于范式差异 | n=1 时你测的是噪声 |

第三条容易被忽略的是「温度」：如果 ReAct 用 0.7、ToT 用 0，ToT 的正确率优势有一部分来自「更确定」，不是来自「搜索」。

### 任务集：三类形状，各五条

任务形状是自变量，必须覆盖范式差异会显现的区间：

- **单步查证**（5 条）：「X 公司的 CEO 是谁」。一次搜索就能答，用来测「最小开销」。
- **多步依赖**（5 条）：「查 A 公司近三年营收，算出复合增长率，并给出数据来源」。步骤之间有依赖，用来测「计划过期后的重规划成本」。
- **需要探索**（5 条）：「找出这家创业公司最可能的三个竞争对手，并说明理由」。答案不唯一、需要比较多个候选，用来测「搜索带来的质量收益」。

只测第一类，你会得出「ReAct 最省，所以最好」；只测第三类，你会得出「ToT 最强，所以都用 ToT」。**两类结论都对，但都只在自己的任务形状里成立。**

### evaluator：不要用模型给自己判卷

evaluator 是整套实验的地基。原则是「能程序化断言的就程序化，不能的才人工」：

\`\`\`ts title="evaluator 的三种形态" note="第三种最危险：用模型评判模型，误差会系统性地偏向「更像自己风格」的输出。"
// ① 程序化断言：答案是确定值时最可靠
const exact = (expected: string) => (out: string) => out.trim() === expected

// ② 包含式断言：答案有多写法时
const containsAll = (keys: string[]) => (out: string) =>
  keys.every((k) => out.includes(k))

// ③ 人工标注：开放性任务，先人工标好参考答案，再按要点命中率打分
//    不要在实验里现场让模型评分——那是「自己判自己的卷」
const rubric = (points: string[]) => (out: string) => {
  const hit = points.filter((p) => out.includes(p)).length
  return hit / points.length >= 0.6
}
\`\`\`

第一条与第二条是可靠的地基，第三条在开放式任务上不可避免，但要**提前**做人工标注、固定下来，不能每跑一次让模型重新评一次。

### 度量：四个指标 + 一个派生指标

| 指标 | 采集方式 | 说明 |
|---|---|---|
| \`calls\` | 包一层 client 计数 | 模型调用次数，直接对应「步数感」 |
| \`tokens\` | 累加 usage 的输入 + 输出 | 决定真实成本 |
| \`latencyMs\` | 首字到末字的总墙钟 | 决定用户体感 |
| \`ok\` | evaluator 判定 | 单次是否答对 |
| \`pass@k\` | k 次采样中至少一次对 | 稳定性，比 pass@1 更贴近用户实际体验 |

派生指标 \`pass@k\` 值得单独讲：用户通常只跑一次，所以 \`pass@1\` 是他真实看到的成功率。但团队真正关心的是「多试几次能不能成」，那就是 \`pass@k\`。两者差距大的范式，说明它的失败是「运气问题」而非「能力问题」。

### 完整 harness

下面是可以直接跑的骨架。核心是 \`Recorder\`——它把「计数」这件横切关注点从三个范式实现里剥离出来，保证三个范式用的是同一套统计口径。

\`\`\`ts title="对比 harness：统一记录 + 统一判定 + 多次采样" note="recorder 包裹 client 而不是修改范式实现，是这套代码最关键的结构选择。"
interface Metrics {
  calls: number
  tokens: number
  latencyMs: number
}

interface Sample extends Metrics {
  paradigm: string
  taskId: string
  ok: boolean
  answer: string
}

type Client = (messages: { role: string; content: string }[]) => Promise<{ text: string; usage: number }>

/** 包一层 client：三个范式都只能通过它调模型，统计口径因此唯一。 */
function makeRecorder(inner: Client): { client: Client; read: () => Metrics; reset: () => void } {
  let calls = 0
  let tokens = 0
  const client: Client = async (messages) => {
    const t0 = Date.now()
    const res = await inner(messages)
    calls += 1
    tokens += res.usage
    void t0
    return res
  }
  return {
    client,
    read: () => ({ calls, tokens, latencyMs: 0 }),
    reset: () => {
      calls = 0
      tokens = 0
    },
  }
}

interface Task {
  id: string
  prompt: string
  check: (out: string) => boolean
}

type Paradigm = (task: Task, client: Client) => Promise<string>

interface Summary {
  paradigm: string
  avgCalls: number
  avgTokens: number
  pass1: number
  passK: number
  byShape: Record<string, { pass1: number; avgCalls: number }>
}

async function runOne(
  name: string,
  paradigm: Paradigm,
  task: Task,
  inner: Client,
  shape: string,
  k: number,
): Promise<Sample[]> {
  const samples: Sample[] = []
  for (let i = 0; i < k; i += 1) {
    const rec = makeRecorder(inner)
    const t0 = Date.now()
    let answer = ''
    let ok = false
    try {
      answer = await paradigm(task, rec.client)
      ok = task.check(answer)
    } catch (e) {
      answer = 'ERROR: ' + (e as Error).message
    }
    const m = rec.read()
    samples.push({
      paradigm: name,
      taskId: task.id,
      ok,
      answer,
      calls: m.calls,
      tokens: m.tokens,
      latencyMs: Date.now() - t0,
    })
    void shape
  }
  return samples
}

export async function benchmark(
  paradigms: Record<string, Paradigm>,
  tasks: Task[],
  inner: Client,
  k = 3,
): Promise<{ samples: Sample[]; summary: Summary[] }> {
  const samples: Sample[] = []
  for (const [name, fn] of Object.entries(paradigms)) {
    for (const task of tasks) {
      samples.push(...(await runOne(name, fn, task, inner, task.id, k)))
    }
  }

  const summary: Summary[] = Object.keys(paradigms).map((name) => {
    const own = samples.filter((s) => s.paradigm === name)
    const avg = (f: (s: Sample) => number) => own.reduce((a, s) => a + f(s), 0) / own.length
    const byTask = new Map<string, Sample[]>()
    for (const s of own) byTask.set(s.taskId, [...(byTask.get(s.taskId) ?? []), s])
    let hit = 0
    for (const list of byTask.values()) if (list.some((s) => s.ok)) hit += 1
    return {
      paradigm: name,
      avgCalls: avg((s) => s.calls),
      avgTokens: avg((s) => s.tokens),
      pass1: own.filter((s) => s.ok).length / own.length,
      passK: hit / byTask.size,
      byShape: {},
    }
  })
  return { samples, summary }
}
\`\`\`

三个设计点值得强调：

**第一，\`Recorder\` 包裹 client，而不是在范式实现里手工埋点。** 如果让每个范式自己统计调用次数，你迟早会漏掉某个内部调用（比如 P&E 重规划时的那次），三个范式的数字就不再可比。把计数放在唯一的出口上，是最省心的做法。

**第二，异常也记一条样本。** 崩溃的范式不该被「剔除」，它应该以 \`ok=false\` 进入统计——否则「容易崩」这个重要缺陷会被平均掉。

**第三，\`pass@k\` 按任务算，不按样本算。** 先按 \`taskId\` 聚合，只要有一条对就算这个任务通过。这样 \`pass@k\` 衡量的才是「多试几次能不能成」，而不是「平均单次成功率」。

### 怎么读结果：三张表而不是一张

跑完之后，正确读法是分三张表看，而不是把所有数字塞进一张大表评总分。

**第一张：成本表。** 看 \`avgCalls\` 与 \`avgTokens\` 在三种任务形状上的变化。如果某范式在「多步依赖」上调用暴涨，说明它的成本对任务形状敏感——这类范式在生产环境里会「越复杂越贵」，预算难估。

**第二张：质量表。** 看 \`pass@1\` 与 \`pass@k\` 的差距。差距大（比如 0.6 vs 0.95）说明失败是随机的，可以通过「多跑几次取多数」提升；差距小（0.6 vs 0.65）说明是能力上限，重跑没用。

**第三张：性价比表。** 用 \`pass@1 / avgTokens\` 做粗排，但只能用来排除明显劣势项，不能用来定冠军——它把「一次答对」和「三次答对」当成了同一件事。

:::deep

### 为什么平均值会骗人

\`avgTokens\` 是算术平均，但 Agent 的成本分布是**长尾**的：大多数任务几步就结束，少数任务会跑满步数上限，把平均值拉高。

真实场景里你付的是账单总额，而不是平均值。所以更该看的是 \`p50\` 与 \`p95\`：\`p50\` 决定「典型任务的成本」，\`p95\` 决定「最坏情况会不会失控」。

用平均值做决策，等于假设所有任务都是典型任务——而预算超支永远发生在长尾里。

:::

### 四个会让实验失效的错误

| 错误 | 后果 | 正确做法 |
|---|---|---|
| 三范式用不同提示词 | 差异可能来自提示词而非范式 | 系统提示词共用，只改「流程指令」部分 |
| 只跑一次（n=1） | 方差淹没差异 | n ≥ 3，且固定随机种子或温度 |
| 忽略缓存命中 | token 被低估 | 关闭 prompt cache 或单独统计命中率 |
| 任务集偏向某范式 | 结论是设计出来的 | 三类形状各五条，且难度对齐 |

第一条是最隐蔽的：为了让每个范式「发挥好」，你会不自觉地给 ToT 写更详细的评分指引、给 P&E 写更结构化的计划模板。这些优化是合理的，但它们让「范式差异」和「提示词差异」混在一起了。正确做法是**先做一次「提示词对齐」的对照跑**，确认差异不是提示词带来的，再在此基础上各自优化。

:::warn

### 结论要写成「条件句」，不要写成「排名」

实验做完，最容易的产出是一张排名表：ToT 第一、P&E 第二、ReAct 第三。这张表在你自己的任务集上是对的，但它几乎一定会被误用——因为读者会把它当成通用结论。

正确写法是条件句：「**在需要探索、答案不唯一的多步任务上**，ToT 的 pass@1 比 ReAct 高 21 个百分点，代价是 3.4 倍 token；**在步骤强依赖的任务上**，P&E 的重规划开销让它的调用次数超过 ReAct 2.7 倍。」

每条结论都带上「在什么任务形状下」和「代价是什么」，读者才能把它映射到自己的场景。这也是选型矩阵（L27）里每一格都写着条件、而不是写着分数的原因。

:::

### 框架对照：三种范式在图上的样子

LangGraph 里三种范式的差异，本质是**图的拓扑差异**，与你手写版的差异点一一对应：

| 范式 | 图结构 | 节点 | 边 | 对应手写实现 |
|---|---|---|---|---|
| ReAct | 单环 | model / tool | tool → model 回边 | \`while\` 主循环 |
| P&E | 两段 + 回边 | planner / executor / replanner | executor → replanner 条件边 | 计划数组 + 顺序执行 + 重规划 |
| ToT | 树 / DAG | expand / score / prune | 层间边 + 回溯边 | 队列 + 打分 + 剪枝 |

把三种实现画成图之后，「调用次数差异」变得可解释：ReAct 的调用次数约等于「环转了几圈」，P&E 约等于「计划步数 + 重规划次数」，ToT 约等于「节点数」。指标不再是黑箱，而是拓扑的直接后果。

### 收束：对比的目的是收敛选择，不是证明优劣

这套 harness 的产出不是「哪个范式最好」，而是三件事：

1. **你的任务集上，每种范式的成本曲线**——它是平的还是随复杂度上涨的。
2. **质量差距是随机的还是能力上限的**——决定该优化提示词还是换范式。
3. **哪个环节最贵**——通常不是「模型调用」，而是「重试」与「重规划」。

带着这三个答案回到 L27 的选型矩阵，你会发现矩阵里的「推荐」不再是别人的经验，而是你自己测出来的边界。

下一节 L31 开始拆运行时的内骨架：无论你选哪种范式，最终都要落成「循环 / 状态 / 终止 / 错误恢复」四个部件。理解了部件，换范式只是在改拓扑，而不是重写系统。

`,
    null,
    [
      {
        text: '三种范式公平对比，必须先钉死的前提不包括？',
        options: ['同一任务集', '同一 evaluator', '同一模型与温度', '三者代码行数相同'],
        answer: 3,
        explain: '前提是任务集、evaluator、模型与温度、多次采样；代码行数与结论无关。',
        concept: 'paradigm-benchmark',
      },
      {
        text: '为什么不能用模型在实验里现场给输出打分？',
        options: [
          '模型调用太贵',
          '那是自己判自己的卷，误差会偏向「更像自己风格」的输出',
          '模型不能输出分数',
          '打分不需要模型',
        ],
        answer: 1,
        explain: '开放性任务要提前人工标注 rubric 并固定，不能每次让模型重评。',
        concept: 'paradigm-benchmark',
      },
      {
        text: '把计数逻辑放在包裹 client 的 Recorder 里，主要好处是？',
        options: ['代码更短', '三个范式共用唯一统计出口，不会漏计内部调用', '能自动重试', '能降低 token'],
        answer: 1,
        explain: '手工埋点容易漏掉重规划之类的内部调用，导致数字不可比。',
        concept: 'paradigm-benchmark',
      },
      {
        text: 'pass@1 与 pass@k 差距很小（如 0.60 vs 0.65），说明？',
        options: [
          '失败是随机的，多跑几次就好',
          '失败来自能力上限，重跑无效，该换范式或改提示词',
          'evaluator 写错了',
          '样本量不够',
        ],
        answer: 1,
        explain: '差距大才是运气问题；差距小说明是能力上限。',
        concept: 'paradigm-benchmark',
      },
      {
        text: '为什么 Agent 成本该看 p50 / p95 而不是算术平均？',
        options: [
          '平均值算不准',
          '成本分布是长尾，平均值会被少数跑满步数的任务拉偏，而预算超支总在长尾',
          'p95 更便宜',
          '平均值不能比较',
        ],
        answer: 1,
        explain: '付的是账单总额，长尾决定最坏情况。',
        concept: 'paradigm-benchmark',
      },
    ],
    [
      ['benchmark', '同一任务集、同一 evaluator 下对比多范式的实验'],
      ['evaluator', '判断输出是否正确的统一函数'],
      ['pass@k', 'k 次采样中至少一次通过的任务占比'],
      ['重规划开销', '计划过期后重新生成计划所付的额外调用与 token'],
    ],
    [
      '三个范式各用一套提示词，差异其实来自提示词。',
      'n=1 就下结论，测到的是方差而不是范式差异。',
      '把结论写成排名而不带任务形状前提，导致被他人误用。',
    ],
  ),
  'practice',
)
