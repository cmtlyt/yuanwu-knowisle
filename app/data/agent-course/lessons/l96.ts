import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 17 ========== */

export const L96 = withKind(
  L(
    'L96',
    17,
    'LangGraph 核心概念：图 / 状态 / reducer / checkpoint',
    3,
    ['L93', 'L31'],
    ['langgraph-core'],
    [
      '把 L31 的手写 ReAct 循环等价翻译成一张 LangGraph 图',
      '掌握 StateGraph / Annotation / reducer / checkpointer 四件套的真实写法',
      '按代码量、可控性、断点能力、依赖体积四个维度判断何时用图、何时用手写循环',
      '避开 reducer 写错、thread_id 缺失、MemorySaver 误用于生产三类坑',
    ],
    `
### 手写回顾：L31 的循环长什么样

在 L31 里，ReAct 循环是一个 \`while\`：调模型 → 若有 tool_calls 就执行并回填 → 再调模型 → 直到没有 tool_calls。状态是几个局部变量，流程写在控制流里，读代码时必须在脑中模拟一次执行才能知道「下一步去哪」。这个结构在两条分支时足够清楚，但当流程变成「模型 → 工具 → 校验 → 失败则回退到规划 → 通过则落库 → 需要人工确认时挂起」时，控制流就开始互相缠绕，改一处要重读整段。

LangGraph 的核心主张是：**把控制流外化成数据**。节点是函数，边是显式声明，状态是带合并规则的对象。代价是概念变多，收益是流程可读、可断点、可恢复、可可视化。

### 框架等价代码：同一件事，四种声明

下面这段是 LangGraph JS 1.x 的写法，语义与 L31 的 while 循环完全等价。注意三处与手写版本的对应关系：\`Annotation.Root\` 对应那几个局部变量；\`addConditionalEdges\` 对应 \`if (hasToolCalls)\`；\`addEdge('tools', 'model')\` 就是「回到开头」——图上的这个环，替代了 while。

\`\`\`ts title="LangGraph 1.x：状态 + 节点 + 边 + checkpointer" note="环由 addEdge('tools','model') 表达；条件边负责「继续调工具」还是「结束」。"
import { StateGraph, Annotation, START, END, MemorySaver } from '@langchain/langgraph'
import type { BaseMessage } from '@langchain/core/messages'

// ① 状态：每个字段自带 reducer（如何与旧值合并）
const State = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => prev.concat(next), // 追加，而非覆盖
    default: () => [],
  }),
  steps: Annotation<number>({
    reducer: (_prev, next) => next, // 覆盖，用于计步
    default: () => 0,
  }),
})

const graph = new StateGraph(State)
  .addNode('model', modelNode) // 调模型
  .addNode('tools', toolNode) // 执行 tool_calls
  .addEdge(START, 'model')
  .addConditionalEdges('model', route, ['tools', END]) // 有工具→tools，否则→END
  .addEdge('tools', 'model') // 环：工具结果回到模型

// ② 编译：挂 checkpointer 后每次 super-step 都落快照
const app = graph.compile({ checkpointer: new MemorySaver() })

// ③ 调用：thread_id 是「这条对话」的主键，缺了就串味
const out = await app.invoke(
  { messages: [new HumanMessage(question)] },
  { configurable: { thread_id: 'conv-42' } },
)
\`\`\`

条件是这段代码里唯一有业务语义的地方，也是把 while 的 \`if\` 搬过来的位置：

\`\`\`ts title="route：条件边函数" note="返回节点名，图引擎据此决定下一跳；返回 END 表示终止。"
const route = (s: typeof State.State) => {
  const last = s.messages.at(-1) as AIMessage | undefined
  return last?.tool_calls?.length ? 'tools' : END
}
\`\`\`

\`\`\`ts title="生产 checkpointer：把快照落到数据库" note="MemorySaver 只活在进程内存里，仅适合测试；生产必须换成持久化实现。"
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

const saver = PostgresSaver.fromConnString(process.env.PG_URL!)
await saver.setup() // 首次建表
const app = graph.compile({ checkpointer: saver })
\`\`\`

### 状态设计的三种 reducer 语义

reducer 不是只有「追加」和「覆盖」两种。第三种是**归并**：多个节点并行写同一个字典时，要按键合并，而不是整对象替换。三类字段各配一种语义，选错的表现完全不同：

| 语义 | 写法 | 适用字段 | 选错的表现 |
|---|---|---|---|
| 追加 | 拼接 prev 与 next | 消息、轨迹、日志 | 写成覆盖 → 只剩最后一条，表现为失忆 |
| 覆盖 | 直接取 next | 计步、当前阶段、最近错误 | 写成追加 → 类型漂移、下游取值拿到数组 |
| 归并 | 按键合并两个对象 | 计划表、工具结果表、指标桶 | 写成覆盖 → 并行分支的结果凭空消失 |

归并这一种最容易被漏掉：单条链跑的时候永远只有一个写者，看不出问题。一旦图里出现并行分支，两个节点在同一 super-step 里写同一张结果表，整对象覆盖会让先完成的那一支静默丢失——不报错、不留痕，只是少了一条结果。

\`\`\`ts title="归并 reducer：并行分支写同一张结果表" note="键冲突的处理必须显式写出来（这里保留先到者）；靠引擎加锁是幻想，reducer 是纯函数，并发安全来自「不依赖外部状态」。"
const State = Annotation.Root({
  results: Annotation<Record<string, Result>>({
    reducer: (prev, next) => {
      const out = { ...prev }
      for (const [k, v] of Object.entries(next)) if (!(k in out)) out[k] = v
      return out
    },
    default: () => ({}),
  }),
})
\`\`\`

### super-step：并行分支与「同一步内的写」

图的执行单位是 super-step：同一批被激活的节点并行执行，全部结束后统一合并状态，再决定下一批去哪。这与手写循环有一个关键差别——**同一 super-step 内的节点看不到彼此对本步状态的写入**，它们都基于同一份快照。

两个直接后果：

1. 「先算 A，再用 A 的结果算 B」必须拆成两个 super-step（两条边），不能靠节点声明顺序指望它生效；
2. 合并顺序不保证等于节点声明顺序。业务上的先后依赖不要塞进 reducer 里推断，那等于把并发时序当契约。

实际调试中，「为什么我的节点读到了旧值」十有八九不是 reducer 写错，而是它和写者处在同一个 super-step。这个区分能省掉大量在 reducer 里反复试错的时间。

### 跨请求挂起：interrupt 与恢复

前面反复说「人工确认要挂起」，机制就一个函数：节点里调 \`interrupt()\`，图会在该点抛出中断信号并把快照落盘；批准之后用同一个 \`thread_id\` 带 \`Command({ resume })\` 重新 invoke，节点从 \`interrupt()\` 的返回值继续往下走。

\`\`\`ts title="人审：interrupt 挂起，Command 恢复" note="resume 传什么，interrupt() 就返回什么；thread_id 必须与首次调用一致，否则恢复的是另一条会话。"
import { interrupt, Command } from '@langchain/langgraph'

const approveNode = async (s: State) => {
  const ok = interrupt({ question: '是否执行重启？', action: s.pending })
  return { approved: Boolean(ok) }
}

// 首次：跑到 interrupt 处返回中断，进程可以退出
const r1 = await app.invoke(input, { configurable: { thread_id: 'conv-42' } })
// 人工批准后：同一个 thread_id 恢复
const r2 = await app.invoke(new Command({ resume: true }), { configurable: { thread_id: 'conv-42' } })
\`\`\`

这与「在节点里 while 循环等审批」的差别不在代码长短，而在**进程生命周期**：挂起后进程可以退出、可以部署、可以换一台机器，两天后审批到达仍能从原位继续。阻塞等待则把状态压在调用栈里，进程一重启就全丢——这也是为什么挂起能力必须由 checkpointer 提供，而不是由业务代码自己攒一个标志位。

### 对照表：图与手写循环的真实差异

| 维度 | 手写 while（L31） | LangGraph 图 |
|---|---|---|
| 核心代码量 | ~40 行，一个函数 | ~25 行声明 + 2 个节点函数 + 1 个 route |
| 流程可见性 | 需读控制流在脑中模拟 | 边声明即流程图，可 \\\`getGraph().drawMermaid()\\\` 导出 |
| 断点续跑 | 需自己序列化全部状态 | checkpointer 自动逐步快照，按 thread_id 恢复 |
| 时间旅行调试 | 不支持 | 可回放任意历史 super-step |
| 并发写状态 | 自己保证不冲突 | reducer 定义合并语义，冲突显式化 |
| 依赖体积 | 零依赖 | \\\`@langchain/langgraph\\\` + \\\`@langchain/core\\\` |
| 单步延迟 | 最低（无调度开销） | 有图调度与快照写入开销 |
| 改流程成本 | 改代码、重读整段 | 加节点 / 改边，局部改动 |

表格里最容易被低估的两行是「断点续跑」和「时间旅行」。当一个 Agent 需要跑 20 分钟、跨多次人工确认、中途可能失败重试时，这两项能力从「锦上添花」变成「能不能做」——手写方案要实现同等能力，等于自己写一个 checkpointer。

### 何时选图、何时退出手写

选图的条件通常同时满足两条以上：流程有 3 个以上分支或需要回退、任务耗时跨请求（需要挂起恢复）、需要审计每一步状态。反之，单轮或两轮的工具调用、延迟敏感的同步接口、以及团队不熟悉图概念时的第一个原型，手写 while 更快也更少出错。

退出（从图回手写）通常发生在两个时刻：图里出现大量 \`addNode\` 只是为了绕开 reducer 限制，说明状态模型不匹配；或者性能分析显示图调度与快照成为瓶颈。

:::warn

### 三个高频坑

**坑一：reducer 写成覆盖**。现象是模型「失忆」，只看到最后一条消息。根因是 \`messages\` 的 reducer 用了 \`(_, next) => next\`。修复：消息类字段必须追加。

**坑二：忘了 \`thread_id\`**。现象是两个人（或两个会话）的历史互相污染。根因是缺省 config 时所有调用共享同一个命名空间。修复：把 thread_id 当成必填参数，在入口层统一注入。

**坑三：MemorySaver 上线**。现象是重启后全部会话历史消失。根因是 MemorySaver 只存在进程内存。修复：生产换持久化 checkpointer（Postgres / SQLite），并把 MemorySaver 只用于测试。

:::

:::deep

### reducer 的本体是「合并函数」，不是「校验」

很多人把 reducer 当校验用（在里边抛错拒绝非法状态），这是误用。reducer 的职责是定义「两个值如何合成一个」，它会在并发节点写同一字段时被调用。把校验塞进去会导致：并发写时抛出难以定位的错，且错误发生在状态合并阶段而非业务入口。校验应该在节点函数入口做，reducer 只做合并。

:::
`,
    null,
    [
      {
        text: 'LangGraph 里表达「工具执行完回到模型」的机制是？',
        options: ['while 循环', 'addEdge("tools", "model") 形成的环', '递归调用 compile', 'route 返回 true'],
        answer: 1,
        explain: '图上的环替代了 while，边本身就是控制流。',
        concept: 'langgraph-core',
      },
      {
        text: 'messages 字段的 reducer 若写成 (prev, next) => next，会出现什么现象？',
        options: ['消息重复两遍', '模型只剩最后一条消息，表现为「失忆」', '编译报错', 'checkpoint 不再写入'],
        answer: 1,
        explain: '覆盖语义丢历史；消息类字段必须用 concat 追加。',
        concept: 'langgraph-core',
      },
      {
        text: '一个耗时 20 分钟、中途需要人工确认的任务，最需要 LangGraph 的哪项能力？',
        options: [
          '更少的代码行',
          'checkpointer 的断点快照与按 thread_id 恢复',
          'reducer 的合并语义',
          'mermaid 导出',
        ],
        answer: 1,
        explain: '跨请求挂起恢复是 checkpointer 的核心价值，手写等价能力成本极高。',
        concept: 'langgraph-core',
      },
      {
        text: '下面这段图定义有一个会污染会话的问题，缺陷在哪？\\n\\nconst app = graph.compile({ checkpointer: new MemorySaver() })\\nawait app.invoke({ messages: [new HumanMessage(q)] })',
        options: [
          'compile 不应传 checkpointer',
          'invoke 缺少 configurable.thread_id，所有调用共享同一命名空间',
          'messages 应传字符串而非 Message 对象',
          'MemorySaver 只能用于生产',
        ],
        answer: 1,
        explain: '缺 thread_id 会让不同会话的历史互相串味。',
        concept: 'langgraph-core',
      },
      {
        text: '团队只有两轮工具调用、对延迟敏感（P99 < 800ms），且没人用过图概念。最合理的选型是？',
        options: [
          '默认上 LangGraph，图更规范',
          '先手写 while 循环，等流程复杂度（分支/跨请求/审计）真的出现再迁移',
          '必须用图否则无法上线',
          '两者都不行，改用工作流引擎',
        ],
        answer: 1,
        explain: '图的价值在复杂流程与断点能力；简单循环上图只增加调度开销与学习成本。',
        concept: 'langgraph-core',
      },
    ],
    [
      ['StateGraph', 'LangGraph 的图构建器（节点 + 边 + 状态）'],
      ['Annotation', '声明状态字段及其 reducer 的构造器'],
      ['reducer', '定义两个值如何合并的函数，用于并发写同一字段'],
      ['checkpointer', '按 super-step 落状态快照，支持断点续跑与回放'],
      ['thread_id', '会话主键，checkpoint 的命名空间'],
    ],
    [
      'reducer 用覆盖语义，导致模型「失忆」。',
      'invoke 时不传 thread_id，多个会话历史互相污染。',
      '把 MemorySaver 用到生产，重启后历史全丢。',
      '在 reducer 里做参数校验，错误发生在状态合并阶段难以定位。',
    ],
  ),
  'framework',
)
