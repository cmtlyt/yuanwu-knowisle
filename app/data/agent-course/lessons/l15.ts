import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L15 = withKind(
  L(
    'L15',
    2,
    '实战：对比实现 Plan-and-Execute（与 ReAct 跑同一任务）',
    3,
    ['L14', 'L13'],
    ['plan-execute-impl'],
    [
      '用 TS 实现 P&E 的 planner / executor 两段，并跑通一个多步任务',
      '把 ReAct 与 P&E 放在同一任务、同一 fake client 下对照，量化差异',
      '定义并采集四个指标：调用次数、输入字符、推理字符、上下文峰值',
      '知道这份对照在什么条件下会反转（计划出错、任务过短、执行期要判断）',
    ],
    `
### 需求：要回答的不是「怎么写」，而是「省在哪」

L14 讲了 P&E 的结构，这一节要解决一个更实际的问题：**它到底比 ReAct 省多少，省的是哪一项**。

这个问题不能靠感觉回答。常见的说法是「P&E 调用更少」，实测往往相反——P&E 的调用次数可能
**更多**（一次规划 + 每步一次 + 一次汇总），它省的是执行期的推理 token 和上下文累积。要把这件事
说清楚，只能让两个实现在同一任务、同一模型输出下跑一遍，把指标摆出来。

**对照的前提是控制变量**，三条必须守住：

1. 同一个任务、同一套工具（不同工具会让步数不可比）；
2. 同一个 fake client 脚本（真模型的随机性会让任何比较失去意义）；
3. 同一份「任务完成」的判定标准（都产出同样结构的最终答案）。

### 度量什么：四个指标，都能从代码里采

| 指标 | 怎么采 | 它说明什么 |
|---|---|---|
| \`llmCalls\` | 每次 \`client.chat\` 计数 | 往返次数 → 直接对应延迟下限 |
| \`inputChars\` | 每次请求的 messages 总字符累加 | 真实成本（输入按 token 计费，字符数是稳定代理） |
| \`reasonChars\` | 只统计 Thought / 规划产出的字符 | 执行期的「想」占了多少 |
| \`contextPeak\` | 单次请求的最大字符数 | 上下文窗口压力，决定长任务能不能跑完 |

四个指标里最容易被忽略的是 \`contextPeak\`。ReAct 的历史只增不减，第 9 轮的请求要重发前 8 轮的
全部内容；P&E 每步重建上下文，峰值基本恒定。**任务越长，这一项的差距越大**——它也是 P&E 在
长任务上更稳的根本原因，而不是「调用少」。

### 第一步：把 P&E 写成可注入的两段

planner 与 executor 都依赖同一个 \`LlmClient\`，这样测试时可以共用一份脚本化 client：

\`\`\` title="pe.ts：规划一次、执行 N 次，每步重建上下文" note="executor 的 messages 每步从零构造——这是与 ReAct 最大的结构性差异。"
import type { LlmClient, Msg } from './types'
import { parsePlan, type Plan } from './plan-types'

/** 规划：只给任务与工具清单，不给任何工具返回 */
export async function plan(client: LlmClient, task: string, toolNames: string[]): Promise<Plan> {
  const raw = await client.chat([
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content: '任务：' + task + '\\n可用工具：' + toolNames.join(', ') },
  ])
  return parsePlan(raw)
}

/** 执行：每步重建上下文，只带本步描述与上游产出 */
export async function execute(
  client: LlmClient,
  plan: Plan,
  tools: Record<string, { run(a: Record<string, unknown>): Promise<string> }>,
) {
  const outputs = new Map<number, string>()
  for (const step of plan.steps) {
    const upstream = step.needs.map((id) => '[' + id + '] ' + (outputs.get(id) ?? '')).join('\\n')
    const messages: Msg[] = [
      { role: 'system', content: EXECUTOR_SYSTEM },
      {
        role: 'user',
        content: '当前步骤（第 ' + step.id + ' 步）：' + step.goal + '\\n预期产出：' + step.expect + '\\n上游产出：\\n' + upstream,
      },
    ]
    const raw = await client.chat(messages)
    const call = parseStepCall(raw)
    const tool = tools[call.action]
    const observation = tool ? await tool.run(call.args) : '(无此工具)'
    outputs.set(step.id, observation)
  }
  return outputs
}
\`\`\`

第 14 课定义过的 \`PlanStep\` 与 \`parsePlan\` 直接复用——这正是把计划做成数据结构的回报：
planner 换一种 prompt、换一个模型，executor 一行不用改。

### 第二步：给两个实现套同一层「仪表」

指标采集不写进业务代码，而是包一层装饰器。这样 L13 的 ReAct 与本节 P&E 用的是同一套计数逻辑：

\`\`\` title="metrics.ts：装饰器采样，业务代码零侵入" note="inputChars 在每次请求前算，contextPeak 取最大值——两个指标都来自同一份 messages。"
import type { LlmClient, Msg } from './types'

export interface Metrics {
  llmCalls: number
  inputChars: number
  reasonChars: number
  contextPeak: number
}

export function instrument(inner: LlmClient, reasonOf: (raw: string) => string) {
  const m: Metrics = { llmCalls: 0, inputChars: 0, reasonChars: 0, contextPeak: 0 }
  const client: LlmClient = {
    async chat(messages: Msg[]) {
      const size = messages.reduce((n, x) => n + x.content.length, 0)
      m.llmCalls += 1
      m.inputChars += size
      m.contextPeak = Math.max(m.contextPeak, size)
      const raw = await inner.chat(messages)
      m.reasonChars += reasonOf(raw).length
      return raw
    },
  }
  return { client, metrics: m }
}

/** ReAct 的「想」在 Thought 段；P&E 的规划产出整段都算「想」 */
export const thoughtOf = (raw: string) =>
  raw.slice(raw.indexOf('Thought:') + 8, raw.indexOf('Action:')).trim()
export const wholeOf = (raw: string) => raw
\`\`\`

### 第三步：跑同一个任务，把差异摆出来

任务选一个需要两次工具调用、且第二步依赖第一步结果的场景（否则 P&E 没有发挥空间）：
「查北京今天天气和空气质量，判断适不适合跑步」。

fake client 按轮次返回脚本化输出：ReAct 要走 3 轮（查天气 → 查空气 → 作答），P&E 要走
1 轮规划 + 2 轮执行 + 1 轮汇总。

\`\`\` title="compare.test.ts：同一脚本、两套循环、四个指标" note="断言写成结构性结论而不是绝对数字——脚本一变数字就变，但「P&E 峰值更低」应当稳定。"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reactLoop } from './loop'
import { plan, execute } from './pe'
import { instrument, wholeOf, thoughtOf } from './metrics'

const tools = {
  search_weather: { run: async () => '晴，18°C' },
  search_air: { run: async () => 'AQI 42 优' },
}

const TASK = '查北京今天天气与空气质量，判断适不适合跑步'

test('同一任务：P&E 的上下文峰值更低，调用次数不一定更少', async () => {
  const r1 = instrument(scriptedReact(), thoughtOf)
  await reactLoop(r1.client, tools, TASK)

  const r2 = instrument(scriptedPe(), wholeOf)
  const p = await plan(r2.client, TASK, Object.keys(tools))
  await execute(r2.client, p, tools)

  // 关键结论：ReAct 的上下文随轮次累积，P&E 每步重建
  assert.ok(r1.metrics.contextPeak > r2.metrics.contextPeak, 'ReAct 峰值应更高')
  // 对照结论：P&E 省的是「想」与累积，不是往返次数
  assert.ok(r2.metrics.llmCalls >= r1.metrics.llmCalls)
})
\`\`\`

跑下来的典型数字（同一脚本、同一任务）：

| 指标 | ReAct | P&E | 差异 |
|---|---|---|---|
| \`llmCalls\` | 3 | 4（1 规划 + 2 执行 + 1 汇总） | **P&E 更多** |
| \`inputChars\` | 约 1.4k | 约 1.9k | P&E 更多（规划与汇总） |
| \`reasonChars\` | 约 90 | 约 220（含规划） | 短任务 P&E 反而更贵 |
| \`contextPeak\` | 约 700（增长到第 3 轮） | 约 420（恒定） | **P&E 低约 40%** |

这组数字最有价值的地方是**它推翻了「P&E 更省调用」的直觉**：3 步的任务里 P&E 全面更贵。把任务
换成 12 步（比如迁移 12 个文件），ReAct 的 \`contextPeak\` 会线性涨到 3k 以上，而 P&E 还是 420 左右，
同时 ReAct 每轮的 Thought 都要重想一遍——这时候 P&E 才真正开始赢。

**所以「P&E 更省」有一个前提：任务足够长，且计划基本正确。** 缺任何一个，它都不划算。

### 计划的 expect 由谁判定：这决定 P&E 能不能自动化

L14 给每个步骤加了 \`expect\`（预期产出），但执行时**由谁来判「这一步真的完成了」**，方案差别很大：

| 判定方式 | 成本 | 可靠性 | 典型场合 |
|---|---|---|---|
| **确定性断言**（JSON schema / 正则 / 文件存在 / 行数） | 几乎为零 | 高，不会误判 | 数据清洗、批量改写、结构化产出 |
| **工具自带校验**（跑测试、编译、lint） | 低（已有） | 最高，是外部事实 | 代码迁移、重构、生成可执行物 |
| **LLM 评判** | 每次一次调用 | 中，有偏差且不稳定 | 报告、摘要、无法形式化的产出 |

这张表解释了一个容易被忽略的规律：**P&E 效果最好的场景，恰好是 \`expect\` 能落成确定性断言的
场景**。代码迁移能跑测试、批处理能数行数、数据清洗能校验 schema——它们不光步骤清晰，而且每步
都有免费的裁判。反过来，如果每一步的「完成」都只能靠 LLM 说「看起来不错」，那 P&E 就失去了
它最大的优势：可重试。**判不出失败，就谈不上重试哪一步。**

所以写计划时，\`expect\` 应该按「能不能写成一个断言」来写，而不是按「我希望得到什么」来写。
「一份含 5 个模块的依赖列表（JSON）」可以断言，「对项目有更清晰的理解」不能。后者不是不该做，
而是说明这一步的产出还需要再拆一层，直到落到可验证的东西上。

### 边界：这份对照会反转的三种情况

1. **计划错了**。P&E 需要重规划：多一次规划调用，且已执行的步骤可能白做。ReAct 没有这个风险，
   它每一步都在纠正方向。
2. **任务短于 5 步**。规划与汇总的固定开销摊不掉，P&E 全指标更贵（上表就是 3 步的情形）。
3. **执行期需要判断**。如果每步都得看观测再决定怎么做（而不是照计划做），P&E 的 executor 就得
   内嵌一个 ReAct——这时它退化成「ReAct 外面套了一层计划」，两边的成本都付了。混合范式的坑
   就在这里，L28 会具体讲怎么切分职责。

真实项目里最常见的其实是第三种形态的变体：**P&E 定骨架，只有个别步骤内部用 ReAct**。判断依据很
朴素——这一步的下一步动作是不是只能用「跑一次看结果」才知道。是，就在这一步里放 ReAct；不是，
就老实照计划做。把这条标准写进计划的 \`goal\` 里，执行器就不用每步自己猜该用哪种模式。

:::warn

### 对照实验最容易做错的三件事

**① 用真模型做对照**。现象：跑两次结论相反。根因：模型输出的 Thought 长度、是否调工具都在随机
波动，样本量又不够。修复：对照实验必须脚本化 client；真模型只用来测「格式失败率」这类统计量，
且要跑几十次取分布。

**② 两个实现用了不同的工具实现**。现象：P&E 步数莫名其妙少。根因：一边的 \`run\` 里写死了返回
（省了一次真实调用），比较的不是循环而是工具。修复：工具实现只写一份，两个循环共用。

**③ 只统计调用次数**。现象：得出「两者差不多」的结论。根因：真正的差异在 \`contextPeak\` 与
\`reasonChars\`，调用次数恰恰是 P&E 不占优的那一项。修复：四个指标一起采，缺一项就可能得出反向结论。

:::

### 收束：对照的意义是知道「什么时候不用」

这一节写了两套实现，但真正的产出是那张表：**短任务用 ReAct，长任务用 P&E，探索型任务回到
ReAct，需要并发的长任务进 ReWOO**。下一节 L16 就讲 ReWOO 怎么把 P&E 的「每步一次调用」也省掉——
代价是计划必须把变量依赖预先写对。

`,
    null,
    [
      {
        text: '同一 3 步任务下，P&E 与 ReAct 的调用次数通常是？',
        options: [
          'P&E 明显更少',
          'P&E 可能更多（规划 + 每步 + 汇总），它省的是上下文峰值与执行期推理',
          '完全相同',
          'P&E 只有 1 次',
        ],
        answer: 1,
        explain: '短任务里 P&E 的固定开销摊不掉，调用次数与输入量反而更高；优势在长任务的上下文峰值。',
        concept: 'plan-execute-impl',
      },
      {
        text: '对照实验为什么必须用脚本化 client？',
        options: [
          '速度快',
          '真模型输出随机、样本又少，两次实验可能得出相反结论',
          '真模型不能计 token',
          '脚本 client 更准',
        ],
        answer: 1,
        explain: '只有固定模型输出，才能让差异来自「循环结构」而不是模型抖动。',
        concept: 'plan-execute-impl',
      },
      {
        text: '哪个指标最能解释「P&E 在长任务上更稳」？',
        options: ['llmCalls', 'contextPeak（单次请求的最大上下文）', 'reasonChars', '工具数量'],
        answer: 1,
        explain: 'ReAct 历史只增不减，峰值随轮次线性上涨；P&E 每步重建，峰值基本恒定。',
        concept: 'plan-execute-impl',
      },
      {
        text: '执行期每步都需要看观测再决定怎么做时，P&E 会变成什么？',
        options: ['更快的 P&E', '退化成「ReAct 外面套一层计划」，两边成本都付', '自动变成 ReWOO', '无法运行'],
        answer: 1,
        explain: 'executor 内嵌 ReAct 后，计划只剩「骨架」的价值，推理成本又回来了——混合范式要划清职责。',
        concept: 'plan-execute-impl',
      },
    ],
    [
      ['对照实验', '同一任务、同一工具、同一脚本 client 下比较两套循环'],
      ['contextPeak', '单次请求的最大上下文字符数，衡量窗口压力'],
      ['reasonChars', 'Thought 与规划产出合计字符，衡量「想」的成本'],
      ['仪表装饰器', '包一层 LlmClient 采集指标，业务代码零侵入'],
      ['反转条件', '计划出错 / 任务过短 / 执行期要判断，三种情况下 P&E 不再划算'],
    ],
    [
      '用真模型反复跑对照：输出随机、样本少，结论可能完全相反。',
      '两个实现各用一份工具：比的是工具实现而不是循环结构。',
      '只统计调用次数：恰恰是 P&E 不占优的一项，结论会反过来。',
      '在 3 步任务上得出「P&E 更省」：固定开销摊不掉，短任务里它全指标更贵。',
    ],
  ),
  'practice',
)
