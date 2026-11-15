import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 18 ========== */

export const L101 = withKind(
  L(
    'L101',
    18,
    '对照：用 OpenAI Agents SDK 重写运行时 + 多 Agent handoffs（对比 L36 / L68）',
    3,
    ['L100', 'L36', 'L68'],
    ['oa-rewrite'],
    [
      '把 L36 手写运行时与 L68 supervisor 分别改写成 SDK 版本，并度量差异',
      '说清「中心式路由」与「点对点转移」在控制权、回退、可观测上的差别',
      '用反向 handoff + 熔断补上 handoff 无法回退的缺陷',
      '把 SDK 版包成 L94 的 Impl 契约，纳入同一套对照实验',
    ],
    `
### 路由记录消失以后

L68 那套 supervisor 我们已经跑得挺稳，每次路由都有 trace：\`supervisor\` 节点下面一个 span，写着「为什么选风控」。改写成 handoff 之后，第一次线上排查就把我卡住了——用户投诉「明明是被扣了两次钱，为什么没人处理」。

我要查的是「为什么这次没转给 billing」。在新的实现里，转交不是一次决策，而是模型的一次工具调用（\`transfer_to_billing\`）。它出现在模型的原始输出里，而我们把 tracing 关掉省钱已经两个月了。于是整条链路上**没有任何地方记录「这次为什么没转」**。

那次之后我加了两样东西：\`onHandoff\` 回调里的审计日志，以及一个「每次 run 结束都记录最终停在哪个 agent」的收口。这也成了本课的第一条教训——**handoff 把「决策」降级成了「事件」，你必须自己把它提升回可审计的东西。**

### 中心式与点对点的本质差异

| 维度 | supervisor（L68 手写） | handoff（Agents SDK） |
|---|---|---|
| 控制权在哪 | 一个中心节点，每轮重新决策 | 当前 agent，转出即交出 |
| 路由信息形态 | 结构化的 \`next\` 字段 | 一次 handoff 工具调用 |
| 终止条件 | 显式 \`done\` + 轮次上限 | \`maxTurns\` + 不再转交 |
| 上下文传递 | 由总线或状态决定 | \`inputFilter\` 决定 |
| 可观测性 | 决策天然是一个 span | 转交是事件，需自己补审计 |
| 能否回退 | 容易：中心节点可以再派 | 难：转出去就交给了对方 |
| 新增角色 | 改中心节点的分支 | 加 agent + 注册到相关 agent |

这张表里最后三行是选型的关键，尤其「能否回退」。

supervisor 的形态是「所有人向中心汇报，中心可以反悔」。风控判断不了，它可以一句话把任务打回给查询。handoff 的形态是「我把话筒交给你」——交出去以后，只有对方能再交回来，而对方会不会交回来，取决于你给它的 description 写没写清楚。

**这是 handoff 最大的结构代价，不是 API 好不好用的问题。**

### 用反向 handoff 补回退能力

既然回退不能靠「中心节点反悔」，那就把回退做成一条显式的边：给下游 agent 也注册一个「交回上游」的 handoff，并加一个互转计数熔断。

\`\`\`ts title="三 agent + 双向 handoff + 熔断" note="要点：回退必须显式注册；description 写「何时转」；审计在 onHandoff 里；互转有上限。"
import { Agent, run, handoff } from '@openai/agents'

// 互转计数放在 run 的上下文里，不放在 agent 实例上（实例是共享的）
type TurnCtx = { transfers: Map<string, number> }

const MAX_PINGPONG = 2 // 同一对 agent 最多互转两次

function guardTransfer(ctx: TurnCtx, from: string, to: string) {
  const key = [from, to].sort().join('<->')
  const n = (ctx.transfers.get(key) ?? 0) + 1
  ctx.transfers.set(key, n)
  if (n > MAX_PINGPONG) {
    throw new Error('ping-pong limit: ' + key + ' x' + n) // 交给外层降级处理
  }
}

const audit = (event: string, payload: unknown) => logger.info('handoff', { event, payload })

const queryAgent: Agent = new Agent({
  name: 'query',
  instructions: '你查订单与物流。信息不足时向用户提问，不要猜。',
  tools: [lookupOrder, trackShipment],
})

const billingAgent: Agent = new Agent({
  name: 'billing',
  instructions: '你处理退款与账单。金额超过 500 元必须转人工审批。',
  tools: [lookupOrder, createRefund],
})

const riskAgent: Agent = new Agent({
  name: 'risk',
  instructions: '你判断是否存在异常交易。只给结论与依据，不处理退款。',
  tools: [lookupOrder, riskScore],
})

// 中心到下游
queryAgent.handoffs = [
  handoff(billingAgent, {
    description: '用户要求退款、投诉扣费、问账单明细时转；对方会核对订单并处理退款。',
    inputFilter: (msgs) => msgs.slice(-2), // 传最近两条，细节由对方自己查
    onHandoff: (ctx, input) => {
      guardTransfer(ctx.context as TurnCtx, 'query', 'billing')
      audit('query->billing', input)
    },
  }),
  handoff(riskAgent, {
    description: '同一订单出现多次扣费、金额异常、或用户提到「被盗」时转；对方只给判断。',
    inputFilter: (msgs) => msgs.slice(-2),
    onHandoff: (ctx, input) => {
      guardTransfer(ctx.context as TurnCtx, 'query', 'risk')
      audit('query->risk', input)
    },
  }),
]

// 反向：下游判断不了时交回查询，这是 handoff 形态下的「回退」
billingAgent.handoffs = [
  handoff(queryAgent, {
    description: '需要补充订单信息、或用户改问物流时交回；对方掌握查询工具。',
    inputFilter: (msgs) => msgs.slice(-2),
    onHandoff: (ctx, input) => {
      guardTransfer(ctx.context as TurnCtx, 'billing', 'query')
      audit('billing->query', input)
    },
  }),
]
riskAgent.handoffs = [
  handoff(billingAgent, {
    description: '确认是重复扣费后转；对方执行退款。',
    inputFilter: (msgs) => msgs.slice(-2),
    onHandoff: (ctx, input) => {
      guardTransfer(ctx.context as TurnCtx, 'risk', 'billing')
      audit('risk->billing', input)
    },
  }),
]

const result = await run(queryAgent, userText, {
  maxTurns: 10,
  context: { transfers: new Map() } as TurnCtx, // 每次 run 一份，避免跨请求串味
})
audit('final_agent', { agent: result.lastAgent?.name, turns: result.usage?.requests })
\`\`\`

三个细节值得停一下：

- **互转计数放在 \`context\` 里而不是模块级变量**。放模块级变量在并发下会互相污染（L92 的共享可变状态问题），而 \`context\` 是每次 \`run()\` 一份。
- **\`inputFilter\` 只留最近两条**，信息不足由对方自己查——这比传全量历史便宜得多，也更符合「每个角色有自己的工具」的设计。
- **\`onHandoff\` 里同时做熔断和审计**。这两个职责放一起很自然：熔断需要看到每一次转移，审计也是。

### 与 L36 运行时的对照

L36 的手写运行时是 320 行左右：循环、工具分发、消息装配、错误处理、流式、取消。SDK 版本压到 60 行，但**省掉的和你以为的不完全一样**：

| 维度 | L36 手写 | SDK 版 | 说明 |
|---|---|---|---|
| 核心行数 | ~320 | ~60（含类型） | 循环与消息装配被内建 |
| 流式 | 自己写 for-await 分发 | 事件流回调 | 写法不同，能力相当 |
| 取消传播 | 自己传 signal 到每层 | 仍要自己传到工具 | 「接管了一半」 |
| 工具超时 | 自己 \`withTimeout\` | 仍要自己写 | 同上 |
| 断点续跑 | 不支持（当时没做） | 不支持 | 两者都属于进程内形态 |
| 可观测 | 自建 span（L75） | 内置 tracing | 默认开启，注意数据外发 |

中间三行是这个对照里最有信息量的：**框架接管的是「循环与装配」，不接管「取消、超时、断点」。** 这三样恰好是生产环境里最常出问题的地方，也是「换框架后代码变少但故障没变少」的原因。

我们那次改造后的真实收益是：新增一个角色从「改运行时分支 + 加 handler」变成「加一个 agent + 注册 handoff」，从 3 处变成 1 处。这个收益在角色增加时线性放大，是这套 SDK 最实在的价值。

### 纳入同一套对照实验

L94 定的规矩是「任何框架结论都要跑同一把尺子」。SDK 版接进去只需要一个适配器：

\`\`\`ts title="把 SDK 实现包成 L94 的 Impl 契约" note="要点：每次 run 独立 context；从 result 里取 steps 与 token；异常转成失败而不是中断整轮。"
import type { Case, Impl, RunResult } from '../core/types.ts'

export function sdkImpl(name: string, root: Agent): Impl {
  return {
    name,
    version: 'openai-agents@<locked>', // 版本必须可读（L95）
    async setup() {},
    async teardown() {},
    async run(input: string, signal: AbortSignal): Promise<RunResult> {
      const result = await run(root, input, {
        maxTurns: 10,
        context: { transfers: new Map() } as TurnCtx, // 每次独立，避免跨 case 串味
        signal, // 硬超时要能真的取消（L94 的 AbortController）
      })
      return {
        output: String(result.finalOutput ?? ''),
        steps: result.usage?.requests ?? 0,
        tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
      }
    },
  }
}

// 用法：与手写版、LangGraph 版放进同一个 compare()
const rows = await compare([sdkImpl('oa', queryAgent), handImpl, lgImpl], cases, { repeat: 3 })
\`\`\`

这里有个容易漏的点：**\`context\` 必须每次 \`run()\` 新建**。我们第一版把它挂在 agent 实例上，结果三个 case 共用一份 \`transfers\`，第二个 case 一开始就触发了熔断——而那看起来像「模型变笨了」。

:::deep
### handoff 与「子 Agent 当工具调用」怎么选

这两种形态经常被混用，但它们的语义完全不同，判断只需要一句话：**下一句话该由谁说。**

- 如果用户下一句仍然跟同一个角色说（「那我的另一个订单呢」）→ 用**子 Agent 当工具**：主对话不变，子任务在内部完成，结果回到主对话。用户的「对话对象」没有变。
- 如果用户下一句该跟新角色说（「你们退款要多久」）→ 用 **handoff**：新的角色有自己的口吻、自己的工具、自己的权限。对话对象变了。

第二个判据是**权限边界**。handoff 天然对应「不同 agent 有不同工具集」：query 没有 \`createRefund\`，billing 有。这让权限成为结构的一部分，而不是提示词里的一句「不要随便退款」——这正是 L85 讲的「能力最小化优于提示词约束」。

反过来说，如果你的两个「agent」工具集完全一样、instructions 只差几句话，那 handoff 是过度设计：一个 agent 加两种提示模板就够了，还省掉一次转交的往返与一段被重发的历史。

还有一个容易被忽略的第三种形态：**handoff 之后再 handoff 的链式结构**（query → billing → 人工审批）。链越长，「谁该负责」越模糊，因为每个环节都认为「后面有人管」。这类结构必须配一个「最终落点」的记录——就是我们上面 \`audit('final_agent')\` 干的事。没有它，任务可能悄悄地停在一个没人负责的 agent 上。
:::

:::warn
### 三个坑，每个都真实发生过

- **为了省钱关掉 tracing。** 表现是「为什么这次没转给风控」永远查不出来。handoff 的路由不落在你自己的业务日志里，它就是隐形的。最低成本的补法是 \`onHandoff\` 里写一行结构化日志 + run 结束时记 \`lastAgent\`，别依赖平台。
- **\`description\` 写成名词短语。** 「账单问题」这种描述给模型的信息量为零，它会靠名字猜。写成「用户说什么的时候转 + 转过去对方会做什么」，误转率会明显下降。这和 L89 的路由提示词是同一个问题：路由质量取决于描述质量，不取决于模型大小。
- **没有反向 handoff。** 表现是任务卡在一个判断不了的 agent 上，它对用户说「我帮您转接」然后原地不动，或者开始瞎答。反向边不是可选项——点对点结构里，回退能力只能由边提供。

再加一条不那么显性但很重要的：**别让 \`maxTurns\` 成为唯一的终止条件**。\`maxTurns: 10\` 的意思是「十轮之后强行停」，它保证你不烧穿额度，但不保证任务完成。真正的终止要有业务语义：任务达成、明确拒绝、转人工。三者都没有时被 \`maxTurns\` 截断，用户看到的是「说到一半没了」。
:::

### 与相邻课的分工

- **L36** 是运行时基线，本课第一节的对照表以它为参照。
- **L68** 是 supervisor 基线，本课第三节以它为参照；两者的结构差异是本课的主线。
- **L66 / L67** 讨论「何时上多 Agent」与「协议怎么定」，本课不重复——这里假定已经决定要上。
- **L100** 讲六个概念的机制，本课讲「换到这个形态以后，哪些能力变强、哪些变弱」。
`,
    null,
    [
      {
        text: 'handoff 相比 supervisor 最大的结构代价是？',
        options: [
          '速度更慢',
          '难以回退：控制权交出去后，只有对方能再交回来',
          '不支持工具调用',
          '不能流式输出',
        ],
        answer: 1,
        explain: 'supervisor 是中心可以反悔；handoff 是点对点交出话筒。回退能力只能靠显式反向边补。',
        concept: 'oa-rewrite',
      },
      {
        text: 'handoff 把「路由决策」变成了什么？为什么危险？',
        options: [
          '变成了配置项，容易被改坏',
          '变成了模型的一次工具调用事件，不进业务日志，关掉 tracing 后完全不可审计',
          '变成了数据库事务，开销大',
          '变成了系统提示词，不可修改',
        ],
        answer: 1,
        explain: '必须在 onHandoff 里补结构化审计，并记录 run 结束时的 lastAgent。',
        concept: 'oa-rewrite',
      },
      {
        text: '互转熔断的计数器为什么必须放在 run 的 context 里？',
        options: [
          '性能更好',
          '放模块级变量在并发下互相污染，会导致别的 case 一开始就触发熔断',
          'context 才能持久化',
          '框架要求',
        ],
        answer: 1,
        explain:
          '每次 run 一份，避免跨请求串味。我们第一版挂 agent 实例上，第二个 case 直接熔断，看起来像模型变笨。',
        concept: 'oa-rewrite',
      },
      {
        text: '框架接管了循环与消息装配，但通常不接管下面哪一组？',
        options: ['工具注册与 schema', '取消传播、单次工具超时、断点续跑', '模型调用与重试策略', '流式输出'],
        answer: 1,
        explain: '这三样是生产里最常出问题的地方，也是「换框架后代码变少但故障没变少」的原因。',
        concept: 'oa-rewrite',
      },
    ],
    [
      ['中心式路由', 'supervisor 握着控制权，每轮重新决策，可以反悔'],
      ['点对点转移', 'handoff 把控制权交给下游 agent，回退需显式反向边'],
      ['反向 handoff', '下游交回上游的显式边，是 handoff 形态下的回退能力'],
      ['互转熔断', '同一对 agent 转移次数上限，计数放 run context 而非实例'],
      ['lastAgent 记录', 'run 结束时记下最终停在哪个 agent，防止任务悄悄失焦'],
      ['接管一半', '框架接管循环与装配，不接管取消、超时、断点'],
    ],
    [
      '关掉 tracing 省钱，handoff 的路由决策完全不可审计。',
      '没有反向 handoff，任务卡在判断不了的 agent 上，对用户说「帮您转接」然后原地不动。',
      '互转计数挂模块级变量，并发下互相污染，别的请求一开始就熔断。',
      '手写版靠 supervisor 反悔实现的回退，迁移后没补对应机制，能力静默消失。',
      '只靠 maxTurns 终止，任务被「十轮后强行停」截断，用户看到说到一半没了。',
    ],
  ),
  'framework',
)
