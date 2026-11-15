import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 18 ========== */

export const L100 = withKind(
  L(
    'L100',
    18,
    'OpenAI Agents SDK 核心概念：Agent / run / handoff / guardrail / session / tracing',
    3,
    ['L93'],
    ['oa-core'],
    [
      '说清六个概念各自的职责，以及它们对应的手写版本（L36 / L68 / L86）',
      '理解 run() 内置的 agent loop 与它的两个必设上限',
      '用 handoff 的 description 与 input_filter 控制「转给谁」和「带什么走」',
      '识别 SDK 没有 checkpoint 带来的运行时位置限制',
    ],
    `
### 找了一整天「checkpoint 在哪」

从 LangGraph 那章切到 OpenAI Agents SDK 的第一天，我做的第一件事是翻文档找 checkpoint——因为上一章的图靠它断点续跑，我以为这是「多 Agent 框架」的标配。

找了一整天，结论是这个 SDK 里没有这个概念。

原因不是它缺功能，而是**运行时位置不同**（L93 的第一形态：进程内库）。\`run()\` 就是一次函数调用：它内部替你跑「模型 → 工具 → 回填 → 再调模型」的循环，跑完返回结果。中间没有 super-step，没有快照，没有命名空间。你当然可以自己存对话历史（用 session），但「跑到第 7 步崩了从第 7 步继续」这件事，它不提供。

这个认知差异值得放在最前面：**LangGraph 卖的是一台有状态的执行机，Agents SDK 卖的是一套让循环写起来更短的约定。** 后者轻得多，也丢得多。

### 六个概念各自的责任

| 概念 | 一句话定义 | 它替你还的债 | 典型误用 |
|---|---|---|---|
| \`Agent\` | 名字 + 指令 + 工具 + 可选的 handoffs / guardrails / 输出结构 | 把「一个角色的配置」聚成一个对象 | 把所有工具塞给所有 agent |
| \`run()\` | 跑一次 agent loop 直到产出最终输出 | 手写 while + tool_calls 判断 + 回填 | 不设 \`maxTurns\` |
| \`handoff\` | 把控制权与对话交给另一个 agent | 手写 supervisor 的路由与上下文传递 | 不设 \`inputFilter\`，历史全量重发 |
| \`guardrail\` | 输入或输出上的检查，触发即中断 | 手写校验与拦截分支 | 把护栏当权限用 |
| \`session\` | 对话历史的持久化容器 | 自己存消息、自己拼上下文 | 以为它等于 checkpoint |
| \`tracing\` | 内置的 trace 采集（默认开启） | 手写埋点（L75） | 不知道它在往外发数据 |

六个里最容易误解的是 \`session\` 和 \`tracing\`，一个被高估、一个被忽略。

**session 被高估**：它存的是消息序列，不是执行状态。你用它可以让第二轮对话知道第一轮说了什么，但它不能让你「恢复到某个中间步骤」。这两件事在 LangGraph 里都由 checkpointer 承担，容易混。

**tracing 被忽略**：它默认是开的，会把 run 的输入输出发到平台。很多人是在第一次看到账单或者第一次做安全评审时才知道这件事——L99 讲的那四个问题（脱敏、保留期、采样、区域）在这里同样适用，而且因为它是默认行为，更容易被跳过。

### run() 的循环与两个必设上限

\`run()\` 内部做的正是 L36 手写运行时那个循环：调模型 → 有 tool_calls 就执行 → 回填结果 → 再调模型 → 直到模型给出最终文本。这带来两个必然要设的上限：

- **\`maxTurns\`**：循环轮次上限。不设的话，一个「一直想调工具」的模型可以跑到你把额度烧完。
- **单次工具调用的超时**：SDK 不替你设，工具实现里必须自己处理 \`AbortSignal\`。

L36 里这两个是我们手写的 \`while (steps < MAX)\` 和 \`withTimeout()\`。换到 SDK 上，第一个变成了配置项，第二个仍然是你的责任——**这类「框架接管了一半」的地方最容易漏**，因为你会默认它都接管了。

\`\`\`ts title="最小三件套：Agent + run + maxTurns" note="要点：instructions 是角色，tools 是能力，maxTurns 是保险丝；缺一个都不算能用。"
import { Agent, run } from '@openai/agents'

const lookupOrder = tool({
  name: 'lookup_order',
  description: '按订单号查询订单状态与金额',
  parameters: z.object({ orderId: z.string() }),
  execute: async ({ orderId }, ctx) => db.orders.find(orderId, ctx.signal),
})

const supportAgent = new Agent({
  name: 'support',
  instructions: '你是客服。先查订单再回答，不要编造金额。',
  model: MODEL_ID, // 带快照日期，禁止 latest（L95）
  tools: [lookupOrder],
})

const result = await run(supportAgent, '我的订单 A1001 到哪了？', {
  maxTurns: 6, // 保险丝：不设等于把额度交给模型
})
console.log(result.finalOutput, result.usage)
\`\`\`

\`result\` 里除了 \`finalOutput\`，还有本次的 usage 与中间步骤。**这个 \`result\` 就是你的「全部状态」**——想持久化，就把它序列化后存起来；想续跑，下次把消息塞回去重新 \`run()\`。这是「进程内库」形态下你能做到的最好程度，也是它和 checkpoint 的根本差别。

### handoff：交出控制权，不是调用函数

handoff 是这套 SDK 最容易被误解的机制。它**不是**「调用另一个 agent 然后拿结果回来」，而是「当前 agent 把接下来的对话交给另一个 agent」——后者会用自己的 instructions 继续这场对话。

三个参数决定它好不好用：

| 参数 | 作用 | 不写的后果 |
|---|---|---|
| \`description\` | 给当前 agent 看的「什么时候该转给它」 | 模型不知道该转，或乱转 |
| \`inputFilter\` | 转交时携带哪些历史 | 全量重发，token 翻倍（我们那次事故） |
| \`onHandoff\` | 转交时的回调（审计、打点） | 「为什么转了」事后查不到 |

\`description\` 其实是路由提示词，和 L89 的模型路由是同一个问题：写得含糊（「处理技术问题」），模型的选择就含糊。有个实用写法是写成「什么时候转 + 转过去以后对方会做什么」，比单纯的名词描述准得多。

\`inputFilter\` 我们踩过坑。三个角色的客服系统，每次 handoff 都把前一段完整对话重新发一遍，一个五轮的任务 token 涨到三倍。后来改成「只带最近两条 + 一条摘要」，成本回到正常，效果几乎没变。但这里有个反面：**摘要里必须包含约束**（L91 的否定型约束问题），否则接手的人会把用户说过的「别打电话」忘掉。

\`\`\`ts title="handoff（带 description 与 inputFilter）+ guardrail + session" note="要点：description 是路由提示词；inputFilter 里必须保住约束；护栏是最后一道不是唯一一道。"
import { Agent, run, handoff, InputGuardrail, OutputGuardrail } from '@openai/agents'

const noPhone = (msgs: any[]) =>
  msgs.filter((m) => m.role !== 'assistant' || !/电话/.test(String(m.content))) // 收窄上下文
    .slice(-2)
    .concat([{ role: 'system', content: '用户约束：只发邮件，勿电话联系' }]) // 约束必须留

const billingAgent = new Agent({
  name: 'billing',
  instructions: '你处理退款与账单。先确认订单号与金额，金额超过 500 元需人工审批。',
  tools: [lookupOrder, createRefund],
})

const supportAgent = new Agent({
  name: 'support',
  instructions: '你是客服。查询类问题自己答，涉及退款或账单转给 billing。',
  tools: [lookupOrder],
  handoffs: [
    handoff(billingAgent, {
      // description 写成「何时转 + 对方会做什么」
      description: '当用户要求退款、投诉扣费、或询问账单明细时转交；对方会核对订单并处理退款。',
      inputFilter: noPhone,
      onHandoff: (ctx, input) => audit('handoff:support->billing', ctx, input),
    }),
  ],
  inputGuardrails: [piiGuardrail],
  outputGuardrails: [promiseGuardrail], // 拦「三天内到账」这类承诺（L86）
})

const out = await run(supportAgent, userText, {
  maxTurns: 8,
  session, // 对话历史容器：只管「聊过什么」，不管「执行到哪一步」
})
\`\`\`

注意 \`noPhone\` 那一段：它同时做了两件事——裁掉历史（省钱）和补一条约束（保正确）。只做前者就是我们那次事故。

### guardrail 的 tripwire：中断，而不是打折

护栏触发时的行为是**抛出一个特殊异常中止整个 run**，输出被丢弃。这个语义很硬，好处是不可能出现「护栏说不行但还是发出去了」，坏处是你必须显式处理它：

\`\`\`ts
try {
  await run(agent, input)
} catch (e) {
  if (isGuardrailTripwire(e)) return { blocked: true, reason: e.details } // 给用户一个正常回复
  throw e
}
\`\`\`

不处理的话，前端看到的是 500，用户看到的是「系统错误」——而事实上我们**主动**拦了一次可疑输入。这个体验差别很大，也是护栏上线后最常见的客诉来源。

### 与手写版的对应关系

| 手写（本课程前面的课） | SDK 里的对应物 | 差别 |
|---|---|---|
| L36 运行时 while 循环 | \`run()\` | 循环内建，但取消/超时仍要你自己处理 |
| L68 supervisor + 消息总线 | \`handoffs\` | 控制权点对点转移，没有中心节点 |
| L86 输出护栏 | \`outputGuardrails\` | 声明化，触发即中断 |
| L73/L75 手写 span | \`tracing\`（默认开） | 零代码，但数据默认外发 |
| L96 checkpoint（图） | 无。只有 \`session\` 存消息 | 不能续跑，只能重跑 |

最后一行是选型的分水岭：**如果需求里有「跨请求挂起后从原位继续」，这套 SDK 不是正确选择**，或者你得自己在外面套一层状态机（那基本等于把 LangGraph 那套重写一遍）。

:::deep
### 为什么「没有 checkpoint」不是缺陷

刚接触时会觉得这是缺失，用久了会发现它是**有意的取舍**。

checkpoint 的能力不是免费的：它要求运行时在每一步之间落盘、要求你的状态可序列化、要求所有副作用（工具调用）可重放或幂等、要求图结构稳定到能按版本恢复。这四条约束一旦接受，你的代码就必须「图化」——这也正是 LangGraph 的形态。

Agents SDK 选了另一条路：**把状态压在一次函数调用里**。好处是心智负担极小（一个 \`run()\` 进去，一个结果出来）、没有序列化约束、任何普通后端都能承载。代价是任务必须短到一次调用能跑完，或者你能接受「失败就整段重跑」。

所以判断标准很清楚：

- 任务能在几十秒内跑完、失败重跑成本可接受 → 进程内形态更简单
- 任务要跑几分钟、跨多次人工确认、失败重跑代价高 → 需要 checkpoint，选图那类方案
- 任务要跑几分钟但你已经在用 SDK → 在 SDK 外面套一层「任务表 + 步骤幂等」，用业务状态机补上这个能力（这是可行的，但要清楚你在自己实现 checkpoint 的一部分）

顺带说一个实践中的组合：**外层用业务数据库存任务状态，内层每次 \`run()\` 只做一个可重试的片段。** 这样既保留了 SDK 的简洁，也拿到了粗粒度的续跑能力。我们后来一个项目就这么干，效果比硬套图好。
:::

:::warn
### 三个必踩的坑

- **不设 \`maxTurns\`**。表现是某个输入让模型反复调工具，跑到额度告警。这类输入通常在测试集里不存在（因为测试集是正常人写的），上线后由真实用户触发。默认值不等于安全值，显式写。
- **handoff 不设 \`inputFilter\`**。表现是 token 随对话轮次线性膨胀，一个五轮任务翻三倍。更隐蔽的是它不会报错，只是账单变贵、延迟变长。而如果为了省钱裁得太狠，又会丢掉约束（L91），所以 \`inputFilter\` 里必须同时做「裁历史」和「补约束」两件事。
- **默认开启的 tracing 把 payload 发出去**。表现是安全评审时被问「用户的手机号为什么会出现在第三方平台」，而你确实没写过一行上传代码。上线前必须确认：能不能关、能不能脱敏、采样率是多少。这与 L99 是同一个问题，只是这里的默认值更省心——它默认帮你开了。

还有一条关于 handoff 的：**别给所有 agent 注册所有 handoff**。三个角色互相都能转，等于给了模型九种选择，误转率会明显上升，而且容易形成 A→B→A 的循环。做法是只注册「业务上真的会发生的转移」，并在 \`maxTurns\` 之外再加一个「同一对 agent 最多互转两次」的业务熔断。
:::

### 与相邻课的分工

- **L36** 是手写运行时基线，本课的 \`run()\` 就是它的框架版本。
- **L68** 是手写 supervisor + 消息总线，本课的 handoff 是它的另一种形态（点对点而非中心式），差异在 L101 展开。
- **L86** 讲输出护栏的判据与四类要拦的内容，本课只讲声明化以后的写法。
- **L99** 讲托管追踪的验证清单，本课的 \`tracing\` 直接适用。
`,
    null,
    [
      {
        text: 'OpenAI Agents SDK 里没有 checkpoint，根本原因是？',
        options: [
          '功能还没做',
          '运行时位置是进程内库：run() 是一次函数调用，没有 super-step 与快照',
          '需要付费才有',
          '只能用于单 Agent',
        ],
        answer: 1,
        explain: '它把状态压在一次调用里，换来极低的心智负担；代价是跨请求续跑要自己实现。',
        concept: 'oa-core',
      },
      {
        text: 'handoff 与「调用一个工具拿结果」的本质区别是？',
        options: [
          'handoff 更快',
          'handoff 把控制权与对话交给另一个 agent，后者用自己的 instructions 继续这场对话',
          'handoff 不能带参数',
          '工具不能返回字符串',
        ],
        answer: 1,
        explain: '工具是「拿结果回来」，handoff 是「换个人接着说」。判断依据是下一句该由谁说。',
        concept: 'oa-core',
      },
      {
        text: 'handoff 不设 inputFilter 会出现什么问题？',
        options: [
          '编译失败',
          '历史全量重发，token 随轮次膨胀；裁得太狠又会丢约束',
          '模型不再调工具',
          'guardrail 失效',
        ],
        answer: 1,
        explain: '正确做法是同时做两件事：裁掉冗余历史 + 显式补一条约束摘要。',
        concept: 'oa-core',
      },
      {
        text: 'guardrail 触发（tripwire）时若不做处理，用户会看到什么？',
        options: [
          '一段温和的拒绝说明',
          '系统错误（500），因为异常一路冒泡到调用方',
          '上一次的回答',
          '空字符串',
        ],
        answer: 1,
        explain: '护栏是「主动拦截」，必须 catch 并转成正常回复，否则体验上变成故障。',
        concept: 'oa-core',
      },
    ],
    [
      ['Agent', '名字 + 指令 + 工具 + 可选的 handoffs / guardrails / 输出结构'],
      ['run()', '跑一次 agent loop 直到最终输出；maxTurns 是必备保险丝'],
      ['handoff', '把控制权与对话交给另一个 agent，不是调用工具'],
      ['inputFilter', 'handoff 时携带哪些历史；必须同时裁冗余与补约束'],
      ['guardrail / tripwire', '输入输出上的检查，触发即中断整个 run'],
      ['session', '对话历史容器，不等于 checkpoint，不能续跑执行'],
    ],
    [
      '不设 maxTurns，某个输入让模型反复调工具直到额度告警。',
      'handoff 全量重发历史，五轮任务 token 翻三倍；裁太狠又丢掉用户约束。',
      '不知道 tracing 默认开启，用户手机号出现在第三方平台。',
      '把所有 agent 互相注册成 handoff，误转率高且形成 A→B→A 循环。',
      '把 tripwire 当普通异常，护栏拦截在用户侧表现为 500 故障。',
    ],
  ),
  'framework',
)
