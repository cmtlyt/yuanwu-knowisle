import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 19 ========== */

export const L104 = withKind(
  L(
    'L104',
    19,
    '对照：工具型 Agent + workflow 编排',
    3,
    ['L103'],
    ['mastra-workflow'],
    [
      '讲清 workflow 与 P&E 引擎的本质差异（数据流图 vs 模型生成计划）',
      '用同一需求给出 workflow 的可运行实现，并与 L42 / L60 度量对照',
      '理解 Mastra 特有的「workflow 里嵌 agent」组合形态与其代价',
    ],
    `
### 我们先用 workflow，第二天就卡住了

第一个用在生产里的 Mastra 功能是一个「下单助手」：用户说一句话，它查库存、锁库存、建订单、发确认。我第一反应是用 workflow——四个步骤，箭头连起来，多清楚。

第二天产品说：有些订单要先问用户「要不要发票」，有些不用；某个 SKU 缺货时要改推荐而不是直接失败。**问题来了：这些分支由模型在对话里判断，而 workflow 的 step 必须在写代码时就声明好。** 我往 step 里塞 \`if\`，发现数据流向被编译期类型卡死，运行时分支越多越别扭。

最后的解法是把「动态那部分」交还给 agent：workflow 只管「确定的四步骨架」，把「问发票 / 换推荐」做成 agent 能调的两个工具，让模型在 step 内部决定要不要调。这就是 Mastra 特有的 **workflow 里嵌 agent** 形态。

这件事值得先讲，因为它直接回答了「编排层抽象值不值」：**值，但只在流程是声明式的前提下；一旦流程要运行时由模型决定，抽象就从帮手变枷锁。**

### workflow 与 P&E 的本质差异

| 维度 | workflow（声明式） | P&E 引擎（L42 / L60，模型生成计划） |
|---|---|---|
| 步骤来源 | 写代码时声明 | 模型运行时生成 |
| 数据流向 | 编译期类型贯通 | 运行时上下文传递 |
| 重规划 | 不支持，改图要改代码 | 内建，失败可换计划 |
| 人在回路 | 难（步骤预先定死） | 易（每步可插确认） |
| 可观测 | 步骤级天然断点 | 要看实现（L75） |
| 适合 | 步骤已知的后台流程 | 探索性、需动态决策的任务 |

核心区别一句话：**workflow 的状态图是静态的，P&E 的计划是动态的。** 把静态图拿去装动态需求，就会像我上面那样处处碰壁。

### workflow 的可运行实现

下面这段是「确定的四步骨架」版下单助手。注意 \`verifyStock → lockStock → createOrder → notify\` 是写死的，数据通过 \`step\` 的返回值在步骤间流动——这正是它比手写状态机省力的地方。

\`\`\`ts title="workflow 版下单助手（步骤已知）" note="要点：step 的 run 返回值为下一步提供输入；流程是写死的，模型不参与步骤决策。"
import { Workflow, step } from '@mastra/core/workflows'

const orderWf = new Workflow({ name: 'place-order' })
  .step(step({ name: 'verifyStock', run: async ({ input }) => {
    const ok = await db.stock.check(input.sku, input.qty)
    return { sku: input.sku, qty: input.qty, inStock: ok }
  }}))
  .step(step({ name: 'lockStock', run: async ({ input }) => {
    if (!input.inStock) throw new Error('OUT_OF_STOCK') // 静态分支，无动态决策
    await db.stock.lock(input.sku, input.qty)
    return { locked: true }
  }}))
  .step(step({ name: 'createOrder', run: async ({ input }) => {
    const id = await db.orders.create(input.sku, input.qty)
    return { orderId: id }
  }}))
  .step(step({ name: 'notify', run: async ({ input }) => {
    await bus.emit('order.created', { orderId: input.orderId })
    return { done: true }
  }}))

orderWf.commit()
const { result } = await orderWf.execute({ input: { sku: 'A1', qty: 2 } })
\`\`\`

这段代码和 L42 手写 P&E 的最大区别：这里**没有任何「让模型决定下一步」的逻辑**。如果「缺货时换推荐」要由模型判断，就得在 \`lockStock\` 这一步里嵌一个 agent——把决策点收回模型，而骨架仍由 workflow 管。

### workflow 里嵌 agent（Mastra 特有形态）

\`\`\`ts title="把动态决策点交还给 agent" note="要点：workflow 管骨架，agent 管骨架内的动态分支；代价是这一步变成黑盒，可观测要靠 agent 自己的 obs。"
import { Agent } from '@mastra/core/agent'

const advisor = new Agent({
  name: 'advisor',
  instructions: '缺货时调用 recommend_alternative，否则返回 {needInvoice:false}。',
  model: MODEL_ID,
  tools: [recommendAlternative, askInvoice],
})

const orderWf = new Workflow({ name: 'place-order-dynamic' })
  .step(step({ name: 'branch', run: async ({ input }) => {
    // 动态部分：让模型决定要不要换推荐 / 要不要问发票
    const decision = await advisor.generate(\`SKU=\${input.sku} 库存=\${input.stock}\`)
    return { decision }
  }}))
  .step(step({ name: 'lockAndCreate', run: async ({ input }) => {
    if (input.decision.alternative) input.sku = input.decision.alternative
    await db.stock.lock(input.sku, input.qty)
    return { orderId: await db.orders.create(input.sku, input.qty) }
  }}))
orderWf.commit()
\`\`\`

这个形态很实用，但也有代价：**\`branch\` 这一步内部对 workflow 来说是个黑盒**。断点落在 step 级，但 step 里 agent 调了哪些工具、为什么选了换推荐，得靠 agent 自己的 observability（L103 第五段）才能看到，workflow 层看不到。这是「嵌 agent」必须接受的能见度折损。

:::deep
### 编排层抽象「值不值」到底怎么算

抽象值不值，不能看「少写了多少行」，要看三件事：

- **断点粒度**：workflow 天然每步可断点、可单步重跑；手写状态机要自己埋点。这一项 workflow 稳赢。
- **重规划能力**：需求变了要改流程，workflow 改图、P&E 改提示词。后者快得多——前提是需求属于「动态决策」那一类。
- **可控性**：workflow 的步骤和数据流是显式的，出问题能顺着图看；P&E 的计划是模型生成的，同一个输入两次可能不同，调试靠日志与回放（L74）。

所以判据是：**后台批处理、步骤固定的流程用 workflow；探索性、需动态决策或人在回路的任务用 P&E。** 两者不是替代关系，是分工关系——Mastra 让你在一个项目里同时用，这正是它相比「只有范式」或「只有 SDK」的灵活处。
:::

:::warn
### 三个必踩的坑

- **把动态需求硬塞进 workflow**。表现是 step 里堆满 \`if\`、数据流向靠 \`any\` 绕过类型，改一处牵动全图。解法是把动态点抽成 agent（如上），不是把 workflow 当万能状态机。
- **嵌 agent 后以为 workflow 层能看到内部**。表现是排查「为什么选了换推荐」时只在 workflow 的 step 日志里看到「branch 完成」，看不到 agent 的工具调用。必须在 agent 侧也开 observability（L103/L99）。
- **用 workflow 做长任务却没处理 step 失败恢复**。workflow 的 step 失败默认整段失败，没有 L96 那种 checkpoint 续跑。需要中途持久化就得分批 commit，或外层套业务状态机。
:::

### 一个具体的对照：同一需求两种写法

拿「订单异常自动处理」举例——用户反馈订单有问题，系统要查原因、判断要不要退款、必要时升级人工。这个需求分别用两种写法：

- **workflow 版**：把三步写成 step，但「判断要不要退款」是个动态决策，你得在 step 里嵌 agent（前面那种黑盒）。流程清晰，断点天然，但动态点不可见，想看「为什么选了退款」得去 agent 侧查。
- **P&E 版**：让模型生成「查原因 → 判退款 → 升级」的计划，每一步可插人工确认（L71）。动态点天然支持，但同样输入两次可能生成不同计划，调试靠回放（L74）而非顺着图看。

| 维度 | workflow 版 | P&E 版 |
|---|---|---|
| 动态决策点 | 嵌 agent（step 内黑盒） | 计划内生成（天然支持） |
| 调试方式 | 顺图看 step | 回放（L74） |
| 改需求成本 | 改图 + 可能改类型 | 改提示词 |
| 适合 | 分支可枚举的固定流程 | 千变万化的临场判断 |

这不是「谁更好」，是「谁更贴需求」：异常类型固定、分支可枚举 → workflow；异常千变万化、要靠模型临场判断 → P&E。Mastra 让你在同一个项目里两者混用，这正是它相对「只有范式」或「只有 SDK」的灵活处——你不必为了动态那部分就全盘接受 P&E 的不可复现，也不必为了静态那部分就放弃模型的决策能力。把骨架交给 workflow、把动态点交给 agent，是这套框架最值得记住的一种用法。

### 与相邻课的分工

- **L42 / L60** 是 P&E 引擎基线，本课只做「与 workflow 的度量对照」，不重讲 P&E 实现。
- **L103** 讲五件套的抽象层，本课聚焦 workflow 这一个包与 P&E 的边界。
- **L66** 讲何时该上多 Agent，本课的「嵌 agent」是单 workflow 内的局部组合，不展开多 Agent 编排。
`,
    null,
    [
      {
        text: 'workflow 与 P&E 引擎的本质差异是？',
        options: [
          'workflow 更快',
          'workflow 步骤写死、数据编译期贯通；P&E 的计划由模型运行时生成',
          'P&E 不能调工具',
          '两者完全一样',
        ],
        answer: 1,
        explain: '静态图装动态需求会处处碰壁；动态决策该交给 P&E 或嵌 agent。',
        concept: 'mastra-workflow',
      },
      {
        text: '「workflow 里嵌 agent」这种 Mastra 特有形态的主要代价是？',
        options: [
          'agent 不能调工具',
          '嵌进去的 step 对 workflow 层是黑盒，内部可见性要靠 agent 自己的 obs',
          'workflow 会报错',
          '必须重写全部步骤',
        ],
        answer: 1,
        explain: '断点仍在 step 级，agent 内部的工具调用与决策靠 agent 侧 observability 才能看到。',
        concept: 'mastra-workflow',
      },
      {
        text: '下列哪种流程最适合用 workflow 而非 P&E？',
        options: [
          '探索性、需动态决策的任务',
          '步骤已知的后台批处理流程',
          '每一步都要人确认的任务',
          '下一步由模型决定的任务',
        ],
        answer: 1,
        explain: '步骤固定 → workflow 天然断点 + 单步重跑稳赢；动态决策才该用 P&E。',
        concept: 'mastra-workflow',
      },
      {
        text: '编排层抽象「值不值」不能只看什么？',
        options: ['断点粒度', '少写了多少行代码', '重规划能力', '可控性'],
        answer: 1,
        explain: '值不值要看断点粒度 / 重规划能力 / 可控性三件事，而不是代码行数。',
        concept: 'mastra-workflow',
      },
    ],
    [
      ['workflow', '声明式步骤与数据流，step 预先声明、数据编译期贯通'],
      ['P&E 引擎', '计划由模型运行时生成，可重规划、易人在回路（L42/L60）'],
      ['workflow 里嵌 agent', '骨架用 workflow、动态决策点交还 agent 的组合形态'],
      ['断点粒度', 'workflow 天然每步可断点可重跑，是其相对手写状态机的胜项'],
    ],
    [
      '把动态需求硬塞进 workflow，step 里堆 if、靠 any 绕过类型。',
      '嵌 agent 后以为 workflow 层能看到内部工具调用，实际是黑盒。',
      '用 workflow 做长任务却没处理 step 失败恢复，整段失败无续跑。',
      '用 workflow 做探索性任务，失去 P&E 的动态重规划能力。',
    ],
  ),
  'framework',
)
