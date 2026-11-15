import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 17 ========== */

export const L98 = withKind(
  L(
    'L98',
    17,
    '对照：用 LangGraph 实现多 Agent 与 subgraph / human-in-loop',
    3,
    ['L96', 'L68'],
    ['langgraph-multi'],
    [
      '区分 subgraph 的两种接入方式（共享 state / 只换输入输出）并各自写对',
      '用「状态契约」作为拆 subgraph 的唯一判据',
      '把 supervisor 放在父图，把审批放在正确的层级（避开 checkpoint_ns 坑）',
      '对照 L68 手写消息总线，说清图化后哪些能力变强、哪些变弱',
    ],
    `
### 四张图拼起来，trace 变成四个黑盒

L68 手写的多 Agent 我们改造过一版：supervisor 加三个角色（查询、定价、风控），每个角色拆成一张独立的 subgraph，理由是「边界清晰、各自能测」。上线时看起来很优雅——四张图，每张都不超过六个节点。

第一次线上排查就卡住了。用户投诉报价偏低，我打开 trace，supervisor 那一层有一个 span 叫 \`call_pricing\`，点进去**是空的**：没有子步骤、没有工具调用、没有模型输入。因为我们的定价 subgraph 用的是**独立 state**，父图只拿到它的输入和输出，它内部跑了什么在另一个 checkpoint 命名空间里。三天后，我们是靠对比自建日志才定位到「折扣规则查的是旧 SKU」。

那次之后我把这件事总结成一句话：**subgraph 的状态隔离是特性，也是陷阱——取决于你有没有为边界写契约。**

### 两种接入方式，别混着用

LangGraph 里接一个子图有两条路，它们对状态的可见性完全不同：

| 方式 | 写法 | 状态可见性 | 适合场景 |
|---|---|---|---|
| 节点即图（共享 state） | \`addNode('pricing', pricingGraph)\` | 共用一份 state，字段互通 | 子图与父图操作同一个业务对象 |
| 独立图（只换入参出参） | 节点函数里自己 \`await sub.invoke({...})\` | 父图只看得到调用参数与返回值 | 边界清晰、要独立测试或独立部署 |

第一条路最省事，也最危险：共享 state 意味着子图的 reducer 必须与父图兼容，否则字段会静默丢失（不是报错，是「值没进来」）。第二条路啰嗦一点，但契约是显式的——你能一眼看出「这个角色从父图拿什么、往父图交什么」。

混着用的后果最糟：一个 subgraph 当节点挂进去（共享 state），另一个用 invoke 调（独立 state），于是有些中间字段能跨角色看到、有些不能，谁也说不出规律。**一个项目里只选一种，写进约定。**

### 判据只有一个：状态契约的边界

「该不该拆 subgraph」这个问题，我在不同项目里听过很多答案：按角色拆、按工具集拆、按 LLM 调用拆、按「一个文件一个 subgraph」拆。这些都不对，因为它们都在按**实现**切，而不是按**状态**切。

正确的判据是：**subgraph 的边界应该是「状态契约」的边界。**

具体怎么判断，两个问题：

1. 这两个角色之间，需不需要**频繁读对方的内部字段**？需要 → 不该拆，拆了就要把那些字段提升到父图，等于没拆。
2. 这个角色的**输入输出能不能用三个以内的字段说清**？能 → 适合拆；说不清（要传十个字段的一张表）→ 状态耦合太紧，先拆模型。

拿 L68 那套对照：查询角色和定价角色之间传的是「SKU + 数量」，两个字段，边界很干净，拆得对；定价和风控之间传的是「报价单全量 + 客户等级 + 历史违约记录」，那时候我们的做法是把整个报价对象提升到父图共享——现在回头看，更该做的是**先重新设计报价单这个模型**，而不是把它整个搬到父图。

### supervisor 在图上的三种位置

L69 讲过控制权的三个位置，落到图上是三种具体写法：

| 写法 | 长什么样 | 可观测性 | 成本 | 适合 |
|---|---|---|---|---|
| supervisor 是节点 | 一个 \`supervisor\` 节点写 \`next\`，条件边据此路由 | 最好：每次决策是一个 span | 多一次 LLM 调用 | 角色多、需要动态选择 |
| supervisor 是路由函数 | 直接在条件边函数里调 LLM | 差：决策发生在调度层，不容易挂 span | 一样多一次调用 | 追求最少节点 |
| 没有 supervisor | 固定边，流程写死 | 最好 | 零 | 步骤固定、角色顺序不变 |

第一行是我推荐的默认写法，理由不是「更规范」，而是**可观测性**：决策本身是 Agent 系统里最需要审计的动作（为什么这次没叫风控？），把它做成节点，它才在 trace 里有一个可以被点开的位置。

第三行值得单独说：很多「多 Agent 系统」其实根本不需要动态路由。角色顺序固定时（查询 → 定价 → 风控 → 汇总），用固定边比用 supervisor 又快又稳，还省掉每次一轮「该叫谁」的 LLM 调用。判断方法：如果 supervisor 连续 100 次都选了同一个人，那它就不该存在。

\`\`\`ts title="supervisor + 独立 state 子图" note="要点：子图用 invoke 接入（契约显式）；supervisor 有显式终止条件；报告走归并 reducer。"
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'

// 父图状态：只放「跨角色可见」的东西，内部细节不进父图
const TeamState = Annotation.Root({
  request: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),
  reports: Annotation<Record<string, string>>({
    reducer: (prev, next) => ({ ...prev, ...next }), // 归并：每个角色写自己的键
    default: () => ({}),
  }),
  next: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),
  rounds: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }), // 终止靠它
})

// 子图：定价。内部字段（中间折扣、阶梯计算）父图看不到，也不需要看到
const QuoteState = Annotation.Root({
  sku: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),
  qty: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
  quote: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
})

const quoteApp = new StateGraph(QuoteState)
  .addNode('calc', async (s) => ({ quote: await priceOf(s.sku, s.qty) }))
  .addEdge(START, 'calc')
  .addEdge('calc', END)
  .compile() // 子图不挂 checkpointer：它的快照由父图那次 invoke 统一落

const supervisor = async (s: typeof TeamState.State) => {
  if (s.rounds >= 4) return { next: 'done' } // 显式终止条件，防止角色互相转交
  const who = await routeByLlm(s.request, s.reports) // 'quote' | 'risk' | 'done'
  return { next: who, rounds: s.rounds + 1 }
}

const callQuote = async (s: typeof TeamState.State) => {
  const { sku, qty } = parseSku(s.request) // 契约：只传两个字段
  const out = await quoteApp.invoke({ sku, qty })
  return { reports: { quote: String(out.quote) } } // 契约：只交回报价
}

const route = (s: typeof TeamState.State) => (s.next === 'done' ? END : s.next)

export const teamApp = new StateGraph(TeamState)
  .addNode('supervisor', supervisor)
  .addNode('quote', callQuote)
  .addNode('risk', callRisk)
  .addNode('approve', approveNode)
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', route, ['quote', 'risk', 'approve', END])
  .addEdge('quote', 'supervisor') // 角色干完回 supervisor，而不是直接互相调用
  .addEdge('risk', 'supervisor')
  .addEdge('approve', 'supervisor')
  .compile({ checkpointer: saver })
\`\`\`

这里有个刻意的结构选择：**每个角色干完都回到 supervisor，而不是角色之间直接连边。** 后者看起来更「省一次调度」，但会让控制权散落在图里——L69 讲过控制权放的位置决定了系统可改到什么程度。回到中心节点的代价是一次调度开销，收益是「所有决策都经过同一个可审计的位置」。

### 人在回路：审批该放在哪一层

\`interrupt()\` 在父图和子图里都能调，但恢复时的配置不同，这是最容易踩的一个坑：

| 审批放在 | 恢复配置 | 典型问题 |
|---|---|---|
| 父图节点 | \`{ thread_id }\` | 无（推荐默认） |
| 子图节点（共享 state） | \`{ thread_id, checkpoint_ns }\` | 少了 ns 会恢复到父图末尾，而不是子图断点 |
| 子图内部（invoke 接入） | 父图拿不到子图的中断 | 中断信号丢失，表现为「跑完了但没人批」 |

第三行尤其坑：用独立图接入时，子图自己 \`compile\` 的实例如果没有 checkpointer，它的 \`interrupt()\` 根本没有地方落快照——信号就丢了。所以**用独立图接入的子图，不要在里面放 interrupt**。

我的建议是把审批统一放在父图的一个 \`approve\` 节点里。理由不只是避开 ns 问题：审批本质上是**跨角色的决策**（「这张报价单能不能发」不属于定价，也不属于风控），把它放在上一级在语义上也更对。

\`\`\`ts title="审批节点：放在父图，恢复只需 thread_id" note="interrupt 的返回值就是 Command({ resume }) 传进来的东西。"
import { interrupt, Command } from '@langchain/langgraph'

const approveNode = async (s: typeof TeamState.State) => {
  const ok = interrupt({
    question: '报价 ' + (s.reports.quote ?? '?') + ' 是否发出？',
    risk: s.reports.risk,
  })
  return ok ? { reports: { approved: 'yes' } } : { next: 'done', reports: { approved: 'no' } }
}

// 首次调用跑到 interrupt 就返回，进程可以退出
await teamApp.invoke({ request }, { configurable: { thread_id: 't-1' } })
// 审批到达：同一个 thread_id 恢复，不需要 checkpoint_ns
await teamApp.invoke(new Command({ resume: true }), { configurable: { thread_id: 't-1' } })
\`\`\`

### 与 L68 手写版的对照

| 维度 | L68 手写（消息总线 + supervisor） | L98 图版本 | 差距来源 |
|---|---|---|---|
| 新增一个角色 | 改 supervisor 的分支 + 注册 handler，约 3 处 | 加一个节点 + 一条边 + 一条路由值 | 图把「接线」变成了声明 |
| 跨角色上下文 | 总线里全量可见，谁都能读 | 只有父图字段可见，必须显式提升 | 隔离降低耦合，也降低便利 |
| 断点与恢复 | 自己序列化整个会话状态 | checkpointer 按 super-step 落 | 手写要实现同等能力成本极高 |
| 审批挂起 | 阻塞等待或自建轮询 | interrupt + Command | 手写版的进程生命周期问题无解 |
| 调试「谁决定的」 | 读日志里 supervisor 的输出 | supervisor 是一个 span，可点开 | 这是图化最实在的收益 |
| 单步延迟 | 最低 | +调度与快照 | 每步毫秒级，可接受 |

注意第三、四行是这套改造真正的理由：**手写版实现「跨请求挂起 + 恢复」的等价能力，成本超过整个多 Agent 逻辑本身。** 如果需求里没有长任务与人审，图化的收益会小很多，这时 L68 的手写版反而更轻。

:::deep
### 状态隔离为什么是特性，不是缺陷

第一反应通常是「共享 state 更方便」——确实方便，直到状态爆炸。一个 30 字段的父图状态里，20 个字段只有某个角色关心；每次加角色，父图状态就多几个字段，reducer 越写越多，最后没人敢改。这就是 L70 里「两个人的订单金额不一样」那类 bug 的温床：**共享可变状态让「谁的写入生效」变成一个需要推理的问题。**

隔离带来三个具体收益：

1. **状态爆炸被挡住**。子图的中间变量在子图里出生、在子图里消亡，父图只看到契约字段。
2. **子图可独立测试**。给定 \`{ sku, qty }\`，断言输出 \`{ quote }\`——不需要构造整个会话状态。这是「能测」和「能测一点点」的差别。
3. **子图可替换**。定价逻辑从规则改成模型时，只要契约不变，父图一行都不用改。

代价是**你必须写契约**。而写契约恰恰是这个设计最有价值的部分：它把「角色之间到底依赖什么」从隐含变成文档。我们在 L68 手写版里从来没写清过这件事，所以每次改一个角色的输出格式，都要通读其他三个角色的代码才知道会不会炸。

一个实操建议：给每个子图写一行契约注释，格式固定为「入参：A、B；出参：C；绝不读父图其他字段」。这一行比任何架构图都有用。
:::

:::warn
### 三个必踩的坑

- **共享 state 时子图 reducer 与父图不兼容**。现象是「子图算出来的值父图看不到」，不报错。根因是同一个字段在两边声明了不同的 reducer（一边追加一边覆盖），合并时以父图为准，子图那次写入被当成了「追加的内容」而丢了。修复：共享 state 时，子图老老实实用父图的同一份 \`Annotation\`，不要自己再声明一遍。
- **supervisor 让 LLM 决定路由却没有终止条件**。现象是两个角色开始「礼貌地互相转交」——风控说「请定价确认」，定价说「请风控先看」，直到额度烧完。L67 讲的三类终止在这里都要显式落在图上：轮次上限（\`rounds\`）、无进展检测（连续两次 \`reports\` 没变化）、显式 \`done\` 路由值。
- **interrupt 在子图里恢复时 ns 不对**。现象是恢复后跑到了父图的另一处，或者干脆从头开始。根因是子图的中断点位于子图的 checkpoint 命名空间里，恢复时必须带 \`checkpoint_ns\`。最省事的规避方式就是本课的建议：审批统一放父图。

还有一条隐含的：**别给子图单独挂 \`MemorySaver\`**。子图自己挂了 checkpointer 以后，它的快照与父图的分裂成两套，恢复时你会有两个「真相」，而它们很容易不一致。
:::

### 与相邻课的分工

- **L66** 讲「什么时候该上多 Agent」——本课假定已经决定要上，只讲图上的表达。
- **L67** 讲消息协议与终止条件（语义层），本课把它们落到节点与边上（结构层）。
- **L68** 是手写基线，本课所有对照数字以它为准。
- **L69** 讲控制权的三个位置，本课给出了它们在 LangGraph 里的三种具体写法。
`,
    null,
    [
      {
        text: '把 subgraph 当节点挂进父图（共享 state）时，最常见的静默故障是？',
        options: [
          '编译报错',
          '同一字段两边声明了不同 reducer，子图写入被合并掉，父图看不到值',
          '子图无法调用工具',
          '父图变慢',
        ],
        answer: 1,
        explain: '不报错、不留痕，只是「值没进来」。共享 state 时应复用父图的同一份 Annotation。',
        concept: 'langgraph-multi',
      },
      {
        text: '判断该不该拆 subgraph，正确的判据是？',
        options: [
          '一个角色一个 subgraph',
          '一个工具集一个 subgraph',
          '状态契约的边界：角色间是否需要频繁读对方内部字段、输入输出能否用少量字段说清',
          '一个文件一个 subgraph',
        ],
        answer: 2,
        explain: '按实现切会导致状态耦合依旧、还要把内部字段提升到父图，等于没拆。',
        concept: 'langgraph-multi',
      },
      {
        text: '审批节点为什么建议放在父图而不是子图？',
        options: [
          '父图执行更快',
          '子图中断点在自己的 checkpoint 命名空间里，恢复要带 checkpoint_ns，容易恢复到错误位置；且审批本身是跨角色决策',
          '子图不支持 interrupt',
          '父图能省 token',
        ],
        answer: 1,
        explain:
          '独立图接入的子图若没挂 checkpointer，interrupt 信号甚至无处落盘；放父图恢复只需 thread_id。',
        concept: 'langgraph-multi',
      },
      {
        text: 'supervisor 连续 100 次都路由到同一个角色，说明什么？',
        options: [
          'supervisor 训练得好',
          '这个 supervisor 不该存在，流程其实是固定的，用固定边更快更稳',
          '需要增加更多角色',
          '需要换更大的模型',
        ],
        answer: 1,
        explain: '动态路由的价值在于「可能选别人」。永远选同一个，等于每轮多付一次 LLM 调用换零决策价值。',
        concept: 'langgraph-multi',
      },
    ],
    [
      ['subgraph', '可独立编译的子图；接入方式决定状态可见性'],
      ['共享 state 接入', '子图当节点挂进父图，字段互通，必须复用父图 Annotation'],
      ['独立图接入', '节点内 invoke 子图，只换输入输出，契约显式、可独立测试'],
      ['状态契约', '子图的入参与出参声明；subgraph 边界应等于契约边界'],
      ['checkpoint_ns', '子图快照的命名空间，恢复子图中断点必须带它'],
      ['中心式回边', '每个角色干完回 supervisor，而不是角色之间直接连边'],
    ],
    [
      '共享 state 时子图重复声明 Annotation 且 reducer 不同，字段写入被静默合并掉。',
      'supervisor 没有轮次上限与无进展检测，两个角色礼貌互转直到额度烧完。',
      '在独立图接入的子图里放 interrupt，信号无处落盘，表现为「跑完但没人批」。',
      '子图单独挂 MemorySaver，与父图形成两套快照，恢复时真相分裂。',
    ],
  ),
  'framework',
)
