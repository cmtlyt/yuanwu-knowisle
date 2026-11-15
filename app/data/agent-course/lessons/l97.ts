import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 17 ========== */

export const L97 = withKind(
  L(
    'L97',
    17,
    '对照：用 LangGraph 重写 ReAct / Plan-and-Execute（对比 L13 / L15 手写版）',
    3,
    ['L96', 'L13', 'L15'],
    ['langgraph-react'],
    [
      '识别「假迁移」的三个信号，判断代码是真搬到图上还是只换了外壳',
      '用条件边表达 ReAct 的循环与 P&E 的重规划，不把控制流塞进节点',
      '把结果账本做成归并 reducer，并删掉 cursor 这类易错状态',
      '按 LOC、可控性、断点粒度、单步延迟四个维度对照手写版',
    ],
    `
### 一百八十行变九十行，能力也少了一半

L15 的 Plan-and-Execute 手写版是一百八十多行：一个 planner、一个执行循环、一个校验函数、一段重规划逻辑。搬到 LangGraph 上以后变成九十行，团队很开心，还在周报里写「代码量减半」。

两周后要加「审批通过后继续」的能力，才发现问题：那个九十行的版本里，整个执行循环被我们塞进了一个叫 \`execute\` 的节点内部——节点里跑 \`for (const step of plan)\`。图只有三个节点：plan、execute、summarize。

后果有三个，一个比一个贵：

1. **checkpoint 只在节点边界写**。跑到第 7 步崩了，快照里只有「execute 开始了」这个状态，续跑等于从第 1 步重来。断点能力为零，而这本来是选 LangGraph 的主要理由。
2. **\`interrupt()\` 无法在步骤中间挂起**。审批要等到整段 execute 结束，业务上不可接受。
3. **trace 里只有一个巨大的 span**。哪一步慢、哪一步重试了，全看不见（这就是 L75 讲的「span 全是平的」的图版本）。

LOC 少了一半，能力也少了一半。**这是假迁移**：代码搬到了图上，控制流还留在节点内部。

### 假迁移的三个信号

判断方法很省事，三个信号出现任意一个，就说明你只是给手写循环套了个图的壳：

| 信号 | 具体表现 | 为什么它致命 |
|---|---|---|
| 节点内有 \`for\` / \`while\` 遍历任务列表 | \`for (const step of plan)\` 包住工具调用 | 循环内部的每一步都不是 super-step，没有快照、没有 span、不能挂起 |
| 状态里出现「游标 / 指针」字段 | \`cursor\`、\`currentIndex\`、\`stepPointer\` | 游标必须与列表长度、重规划后的新列表保持同步，是 bug 的温床 |
| 条件边只有一个出口 | 只有 \`addConditionalEdges('execute', ...)\` 返回 END 或自己 | 说明图里没有环，业务上的「回去重来」被藏在节点里了 |

三个信号里第二个特别值得展开：**游标是状态里的冗余信息**。它可以从「哪些步骤已经有通过结论」推出来，一旦存成字段，就多了一份要和真相保持一致的数据。L60 手写版里我们用 \`results\` 账本 + \`cursor\` 两个字段，重规划后 cursor 归零、results 保留，就出过「重复执行已完成步骤」的事故。这次索性把 cursor 删掉。

### ReAct：图上表达与手写版的对应关系

L13 手写版里那些「额外的东西」——工具错误处理、步数上限、多工具并行——在图上都要有明确落点，否则迁移后它们会静默消失：

| L13 手写版的行为 | 图上的落点 | 漏掉的症状 |
|---|---|---|
| \`while (steps < MAX)\` | 状态里的 \`steps\` + 条件边返回 END | 死循环，直到额度烧完 |
| tool_calls 为空则结束 | 条件边判 \`last.tool_calls?.length\` | 图不终止，或过早结束 |
| 工具失败转成文本回填 | tools 节点内 try/catch，写进 messages | 异常冒泡，整个图挂掉 |
| 多个 tool_calls 并行执行 | tools 节点内 \`Promise.all\`（节点内并发是合法的） | 串行执行，延迟翻倍 |

最后一行有个反直觉的细节：**节点内部允许 \`Promise.all\`，但节点内部不允许长循环**。区别在于前者是一个 super-step 内的扇出、结果一起合并进状态，而后者会跨过多个本应是 super-step 的边界。判断标准就一句话：这段并发/循环里的每一项，你希望它在 trace 里独立成 span、在 checkpoint 里独立成快照吗？希望就拆成节点，不希望就留在节点内。

### P&E：把重规划写成环，而不是写成 if

这是本课的核心。L15 手写版的控制流是「规划一次 → 逐步执行 → 任一步失败就重规划」，在图上要变成三个节点绕一个环：

    plan ──> exec ──> judge ──┬─(还有未通过且未判负的步)──> exec
                              ├─(某一步判负，且重规划次数未超限)──> plan
                              └─(全部通过 或 达上限)──> END

关键设计有四个，每一个都对应手写版里一个容易漏的契约：

1. **不存 cursor，执行节点自己算「第一个未通过的步」**。这样重规划后不需要重置任何游标，也不会错位。
2. **\`results\` 用归并 reducer**。重规划会写入新结果、旧结果必须保留——这正是 L60 讲的 \`carryOver\`，在图上的自然表达就是「按键合并」而不是「整段替换」。
3. **\`verdicts\` 与 \`results\` 分开**。结果对不对是两件事：有结果不代表通过。混成一个字段，就没法区分「没执行」和「执行了但错了」。
4. **重规划上限是状态字段，不是闭包变量**。放在闭包里，重启进程后计数归零，会无限重规划。

\`\`\`ts title="P&E 图：plan / exec / judge + 三个出口" note="要点：删掉 cursor；results 归并；verdicts 与 results 分离；重规划上限进状态。"
import { StateGraph, Annotation, START, END, interrupt } from '@langchain/langgraph'

type Step = { id: string; goal: string; tool: string; args: Record<string, unknown> }
type Verdict = 'ok' | 'bad'

const PEState = Annotation.Root({
  goal: Annotation<string>({ reducer: (_p, n) => n, default: () => '' }),
  plan: Annotation<Step[]>({ reducer: (_p, n) => n, default: () => [] }),
  planVersion: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
  // 结果账本：重规划时按键保留旧结果（L60 的 carryOver）
  results: Annotation<Record<string, unknown>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
  verdicts: Annotation<Record<string, Verdict>>({
    reducer: (prev, next) => ({ ...prev, ...next }), // 只增不改：通过即终局
    default: () => ({}),
  }),
  replans: Annotation<number>({ reducer: (_p, n) => n, default: () => 0 }),
})

// 重规划只允许「插入/替换未完成部分」，已完成步骤原样保留
function mergePlan(prev: Step[], patch: Step[], verdicts: Record<string, Verdict>): Step[] {
  const kept = prev.filter((p) => verdicts[p.id] === 'ok')
  const keptIds = new Set(kept.map((p) => p.id))
  return [...kept, ...patch.filter((p) => !keptIds.has(p.id))]
}

const planNode = async (s: typeof PEState.State) => {
  // 重规划时把已完成结果一起给出去，否则 planner 会再规划一遍同样的东西
  const patch = await llmPlanner(s.goal, s.results)
  return {
    plan: mergePlan(s.plan, patch, s.verdicts),
    planVersion: s.planVersion + 1,
  }
}

const execNode = async (s: typeof PEState.State) => {
  const step = s.plan.find((p) => s.verdicts[p.id] !== 'ok' && !(p.id in s.results))
  if (!step) return {}
  if (step.destructive) {
    const ok = interrupt({ question: '执行 ' + step.tool + '？', step }) // 写操作前挂起
    if (!ok) return { results: { [step.id]: { skipped: true } } }
  }
  return { results: { [step.id]: await runTool(step.tool, step.args) } }
}

const judgeNode = async (s: typeof PEState.State) => {
  const step = s.plan.find((p) => s.verdicts[p.id] !== 'ok' && p.id in s.results)
  if (!step) return {}
  const ok = await verify(step, s.results[step.id])
  return { verdicts: { [step.id]: ok ? ('ok' as const) : ('bad' as const) } }
}

const next = (s: typeof PEState.State) => {
  const pending = s.plan.find((p) => s.verdicts[p.id] !== 'ok')
  if (!pending) return END
  if (s.verdicts[pending.id] === 'bad') {
    return s.replans >= 2 ? END : 'plan' // 上限进状态，重启进程也不清零
  }
  return 'exec'
}

export const peApp = new StateGraph(PEState)
  .addNode('plan', planNode)
  .addNode('exec', execNode)
  .addNode('judge', judgeNode)
  .addEdge(START, 'plan')
  .addConditionalEdges('plan', next, ['exec', 'plan', END])
  .addEdge('exec', 'judge')
  .addConditionalEdges('judge', next, ['exec', 'plan', END])
  .compile({ checkpointer: saver }) // saver 见 L96
\`\`\`

对着这段代码再看 L15 手写版，能看出迁移的**真实代价**：图的声明部分是 20 行，节点函数 40 行，加起来比手写版略多而不是更少。省掉的是「while 循环 + 手动状态搬运 + 手写序列化」，多出来的是「三个节点签名 + 一份 reducer 声明 + 条件边函数」。

所以「换框架代码更少」这个预期，在 P&E 这种本来就结构清晰的场景里通常不成立。它成立的地方是**状态复杂、分支多、需要断点**的场景——那时候手写版的成本会指数上升，而图的成本基本恒定。

### 四个维度的对照结果

按 L94 的方法跑同一批 case（L15 手写版 vs 本课的图版本），结论：

| 维度 | L15 手写 | L97 图版本 | 差距来源 |
|---|---|---|---|
| 业务代码量 | 183 行 | 96 行（含 40 行节点函数） | 手写版有 60 行自己写的状态搬运与序列化 |
| 胶水代码量 | 0 | 约 26 行 reducer 与类型声明 | 图需要显式声明合并语义 |
| 断点粒度 | 步（自己实现） | super-step（引擎保证） | 手写版需要自己落盘全部状态 |
| 可控性 | 全部 | 除调度与快照外全部 | 节点内并发、节点边界由引擎决定 |
| 单步延迟 | 最低 | +1 次快照写入 | 每次 super-step 落快照，毫秒级 |
| 加一个新出口的成本 | 改 if 链，触碰 1 个函数 | 加一条条件边，触碰 1 个函数 | 分支越多图越划算 |

最后一行是这个对照里唯一真正偏向图的维度，也是选型时该看的维度：**分支数**。分支少的时候手写版更省，分支多的时候图的边际成本几乎为零。

:::deep
### 节点粒度：一个节点该有多大

这是迁移时最容易被忽略、影响最大的设计决定，而它的判据其实只有一句话：**节点边界 = 你想断点 / 观测 / 重试的边界。**

不是「一个函数一个节点」（那会得到几十个节点、每步一次快照、调度开销压过业务），也不是「一个阶段一个节点」（那就是我们那次假迁移，退化成黑盒）。

三个具体的判断问题：

1. 这一步失败了，我是想**只重跑这一步**，还是从头重跑？想只重跑这一步 → 拆成节点。
2. 这一步我想不想在 trace 里**看到独立的 span 与耗时**？想 → 拆成节点。
3. 这一步能不能**挂起等人**？能且需要 → 必须是节点（\`interrupt()\` 只能在节点内调用）。

反过来，如果一段逻辑「失败就整段重来、不需要单独观测、不可能挂起」，那它就适合待在一个节点内部——比如「调模型解析出计划」这种原子操作，拆成「调模型」和「解析 JSON」两个节点只会让你多一次快照。

一个实践中的经验值：**一个图的节点数在 5 到 15 之间时最好维护**。少于 5 通常是假迁移，多于 15 通常是粒度太细，条件边开始互相交错到读不懂。
:::

:::warn
### 迁移时最容易静默丢失的三样东西

- **步数上限**。手写版的 \`while (steps < MAX)\` 在图上没有对应物，条件边忘了判 \`steps\` 就是死循环。这类 bug 在测试环境跑不出来，因为测试用的输入通常几步就结束了。
- **工具失败的兜底**。手写版里 \`try/catch\` 把错误转成文本回填，迁移时如果只在节点外层包一层，异常会让整个图挂掉，而手写版只是「这一轮失败了」。
- **\`thread_id\` 的注入位置**。手写版没有会话主键，迁移后如果各个调用点自己拼 \`thread_id\`，一定会有一处拼错（用了 requestId、用了 userId）。做法与 L96 一致：在入口层统一注入，业务代码里不出现 \`thread_id\` 字面量。

检查方法：把 L13 / L15 的**行为规格**逐条列出来（步数上限、工具错误、终止条件、并行、重试），对着图逐条指认落点。指不出来的那条，就是这次迁移丢掉的能力——而且它不会报错，只会在某个边界输入上表现为「行为和以前不一样」。
:::

### 与相邻课的分工

- **L96** 讲四件套的写法与 reducer / super-step / interrupt 的机制，本课不重复，只把它们当作已有能力来用。
- **L13 / L15** 是手写版基线，本课所有对照数字都以它们为参照。
- **L98** 讲多角色与 subgraph——那是「一张图放不下」时的下一步，本课只处理单主线的流程。
`,
    null,
    [
      {
        text: '判断是否「假迁移」的信号是？',
        options: [
          '节点数量太少',
          '节点内部用 for/while 遍历任务列表，控制流没交给边',
          '没有用 checkpointer',
          '代码比手写版长',
        ],
        answer: 1,
        explain: '节点内的长循环跨过了本该是 super-step 的边界，导致没有快照、没有独立 span、不能挂起。',
        concept: 'langgraph-react',
      },
      {
        text: '为什么建议把状态里的 cursor（游标）删掉？',
        options: [
          '减少内存占用',
          '游标是冗余状态，重规划后需要与列表同步，容易错位；可以由「哪些步已通过」推出',
          'LangGraph 不支持数字字段',
          '方便调试',
        ],
        answer: 1,
        explain: '执行节点自己算「第一个未通过且无结果的步」，就整类消灭了「游标与 plan 不同步」的 bug。',
        concept: 'langgraph-react',
      },
      {
        text: '重规划时 results 账本必须用归并 reducer 而不是整段替换，原因是？',
        options: [
          '性能更好',
          '替换会丢掉已完成步骤的结果，重规划后会重做已完成的工作',
          '归并 reducer 才能编译通过',
          '替换会导致类型错误',
        ],
        answer: 1,
        explain: '这是 L60 的 carryOver 契约在图上的表达：已完成的部分必须原样保留。',
        concept: 'langgraph-react',
      },
      {
        text: '节点内部允许 Promise.all 但禁止长循环，判据是什么？',
        options: [
          '并发比循环快',
          '这一项是否需要独立成 span / 独立成快照：需要就拆节点，不需要就留在节点内',
          'Promise.all 更安全',
          '循环会导致内存泄漏',
        ],
        answer: 1,
        explain: '扇出并发是一个 super-step 内的批量，长循环会跨过多个本该是 super-step 的边界。',
        concept: 'langgraph-react',
      },
    ],
    [
      ['假迁移', '代码搬到图上但控制流仍在节点内部的 for/while 里，断点能力为零'],
      ['节点粒度', '节点边界 = 想断点 / 观测 / 重试的边界，不是函数边界'],
      ['结果账本', 'results + verdicts 分离：有结果不代表通过，两者不能混成一个字段'],
      ['归并 reducer', '重规划时按键合并旧结果，等价于手写版的 carryOver'],
      ['重规划上限', '必须写成状态字段，放闭包会在进程重启后清零'],
    ],
    [
      '把执行循环塞进一个节点，LOC 减半但断点、挂起、span 全部失效。',
      '状态里存 cursor，重规划后与 plan 不同步，重复执行已完成步骤。',
      'results 用整段替换的 reducer，重规划丢掉已完成结果，无限重做。',
      '迁移时漏掉步数上限，条件边不判 steps，死循环烧额度。',
    ],
  ),
  'framework',
)
