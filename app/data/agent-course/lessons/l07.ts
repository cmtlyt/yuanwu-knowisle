import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 1 ========== */

export const L07 = withKind(
  L(
    'L07',
    1,
    '一张图看懂 Agent 系统的组成要素',
    1,
    ['L06'],
    ['agent-components'],
    [
      '理解 Agent 六个组成要素各自的责任与边界',
      '掌握组件之间的接口，能指出每个组件在最小工程里的落点',
      '认识「观测与护栏不是可选项」以及常见的组件误放',
    ],
    `
### 换了个模型，整个系统突然答非所问

有个团队把第一版 Agent 写在一个三百行的函数里：拼提示词、调模型、解析工具调用、把历史消息累加到一个字符串、出错就 \`console.log\`、权限判断靠提示词里一句「请不要删除任何文件」。跑得好好的，直到把模型换成另一家——上下文窗口不同，历史字符串被悄悄截断；新模型对那句「请不要」的服从度也不一样，某次真的调用了删除工具。

复盘时发现，问题不在任何一个组件「坏了」，而在**六个组件全搅在一起，没有边界**：想换模型得改提示词拼接，想查「这轮到底读了哪段历史」查不到，想加权限得往三百行里再塞 \`if\`。这一课就把这个黑盒拆开：一个 Agent 由哪几块组成、每块对外的接口是什么、以及为什么**接口比组件本身重要**。

### 六个组件，一张表看清职责与落点

| 组件 | 唯一职责 | 对外接口 | L04/L05 的落点 | 常见误放 |
|---|---|---|---|---|
| 模型接口 | 一次推理，返回文本或动作选择 | \`decide(observation, actions)\` | \`LlmClient\` | 把循环写进去 |
| 工具注册表 | 声明可用动作、校验参数、执行 | \`dispatch(action, args)\` | \`ToolRegistry\` | 把权限散在每个工具里 |
| 状态 / 记忆 | 保存历史与未完成事项 | \`load() / commit()\` | \`messages\` + \`RunContext\` | 直接拼成 prompt 字符串 |
| 循环控制 | 决定轮次、退出、预算 | \`runLoop()\` | \`loop.ts\` | 塞进入口文件 |
| 观测 | 记录每一步的事件与版本 | \`EventSink.emit()\` | \`events.ts\` | 用 \`console.log\` 代替 |
| 护栏 | 在动作执行前/输出返回前收口 | \`guard(action) / guard(answer)\` | 后续 L85 / L86 | 只写进提示词 |

数据流其实只有一句话：**观察 → 决策 → 动作 → 新观察**，状态和观测横穿整条链，护栏卡在「动作执行前」与「答案返回前」两个位置。把它画成图时，别把这六个组件画成六个并排的方框——**它们不是同一层的东西**：前四个在主链上，观测是旁路，护栏是两道闸门。

:::deep
### 接口比组件本身重要

组件实现几乎一定会换：模型会换供应商（L122）、工具会接 MCP（L121）、状态会从内存挪到共享存储（L123）、观测会从 \`MemorySink\` 换成 tracer（L75）。如果这些替换都需要改主循环，系统就是不可演进的。

决定能不能换的，是接口有没有切对。L04 留下的三个可替换点（\`LlmClient\` / \`ToolRegistry\` / \`EventSink\`）正好对应这里的前三个组件；L05 把四个版本号放进 \`RunContext\`，则是为了让观测组件在任何实现下都能拿到同一份上下文。**接口定义的是「哪些信息必须跨过边界」，而不是「实现里怎么算」**——比如 \`decide\` 的返回值里必须有「动作名 + 参数 + 是否结束」，至于模型用 JSON 还是 function calling 表达，是模型接口内部的事。

一个实用自检：随便挑一个组件问「把它换成另一个实现，需要改几个文件？」答案大于一，说明边界划错了。
:::

### 六组件的类型定义与装配

\`\`\`ts title="Agent 组件接口与一次 step" note="要点：主链四组件 + 旁路观测 + 两道护栏；护栏不在提示词里，在动作执行前与答案返回前。"
type Observation = { messages: Message[]; lastResult?: string }
type Decision = { action: string; args: unknown; answer?: string; done: boolean }

interface Decider { decide(o: Observation, actions: string[]): Promise<Decision> }
interface Actors { names(): string[]; dispatch(action: string, args: unknown): Promise<string> }
interface State { load(): Promise<Observation>; commit(o: Observation): Promise<void> }
interface Observer { emit(e: StepEvent): void }
interface Guard { beforeAction(d: Decision): void; beforeAnswer(text: string): string }

type AgentSystem = {
  decider: Decider; actors: Actors; state: State
  observer: Observer; guard: Guard; maxTurns: number
}

async function step(sys: AgentSystem, o: Observation): Promise<Decision | string> {
  const d = await sys.decider.decide(o, sys.actors.names())
  sys.observer.emit({ type: 'decision', action: d.action, at: Date.now() })
  if (d.done) {
    const safe = sys.guard.beforeAnswer(d.answer ?? '')   // 输出护栏（L86）
    await sys.state.commit(o)
    return safe
  }
  sys.guard.beforeAction(d)                              // 权限护栏（L85）
  const result = await sys.actors.dispatch(d.action, d.args)
  sys.observer.emit({ type: 'result', action: d.action, ok: true, at: Date.now() })
  return { ...d, answer: result }
}

async function run(sys: AgentSystem, question: string): Promise<string> {
  let o = await sys.state.load()
  o.messages.push({ role: 'user', content: question })
  for (let turn = 0; turn < sys.maxTurns; turn++) {
    const out = await step(sys, o)
    if (typeof out === 'string') return out
    o = { messages: o.messages, lastResult: out.answer }
  }
  throw new Error('max turns exceeded')
}
\`\`\`

这段代码刻意把 \`Guard\` 放在 \`Actors.dispatch\` **之前**。原因是护栏要拦的是副作用：提示词里写「请不要删除」属于建议，模型可以忽略；而 \`beforeAction\` 是代码，模型没有绕过路径。这一点和 L06 说的控制权归属直接相关——**既然下一步由模型决定，就得在它决定之后、动作发生之前有一道确定性检查**。

### 观测为什么不是可选项

六个组件里最常被砍掉的是观测，理由通常是「先跑通再说」。但 L05 已经说过：日志是当时那一刻的唯一记录，事后补不回来。放到这张组件图里看更清楚——观测不是第七个功能，而是**横穿主链的旁路**：决策、动作、退出、失败四个点都要落事件，少一个点，轨迹就断了，L78 的轨迹评测与 L74 的回放调试都无从谈起。

同样地，护栏也不是「模型够聪明就不用」。L83 的提示注入、L85 的最小权限、L86 的输出护栏，分别对应「输入不可信」「动作有副作用」「输出会对外承诺」三件事实，它们与模型能力无关，是系统边界的一部分。把这两块画进图里，是为了让第一次搭 Agent 的人别把它们留到「以后再补」。

:::warn
### 两个必踩的坑

- **把状态和提示词混成一个字符串**。表面上少一个组件，实际上无法回答「这轮用了哪段历史」，也无法在换模型时按窗口裁剪（L91）、在扩容时外置（L123）。状态要有自己的 \`load/commit\` 接口。
- **把护栏只写进提示词**。提示词是给模型的建议，不是系统的约束；一旦模型忽略或被人通过输入诱导，副作用已经发生。护栏必须是动作执行前的确定性代码。
:::

### 与相邻课的分工

- **L06**：用三个反例划清「什么不是 Agent」，本课才讲「一个 Agent 由什么组成」。
- **L04 / L05**：四段骨架与结构化事件，是本课六个组件在最小工程里的具体落点。
- **L08**：本课给静态结构，L08 讲「把决策权交给模型」之后这套结构会承受什么变化。
- **L36 / L85 / L86 / L72**：循环实现、权限护栏、输出护栏、仪表盘，分别是各组件的后续专论。

**一句话收束**：Agent 不是六个功能堆在一起，是**主链四组件 + 观测旁路 + 两道护栏**；能不能演进，取决于接口有没有切对。
`,
    null,
    [
      {
        text: '六个组件里，哪两个不属于主链？',
        options: ['模型接口与工具注册表', '观测是旁路、护栏是两道闸门', '状态与循环控制', '都不属于'],
        answer: 1,
        explain: '前四个在主链上，观测横穿全链，护栏卡在动作前与答案前。',
        concept: 'agent-components',
      },
      {
        text: '「接口比组件本身重要」最实用的自检是？',
        options: [
          '组件有没有注释',
          '换一个实现需要改几个文件，大于一说明边界划错',
          '代码行数是否够少',
          '有没有用框架',
        ],
        answer: 1,
        explain: '接口定义哪些信息必须跨边界，决定实现能否替换。',
        concept: 'agent-components',
      },
      {
        text: '权限护栏应该放在哪里？',
        options: ['只写进系统提示词', '动作执行前的确定性代码里', '模型输出之后由用户判断', '日志里记录即可'],
        answer: 1,
        explain: '提示词是建议，模型可忽略；beforeAction 是代码，没有绕过路径。',
        concept: 'agent-components',
      },
    ],
    [
      ['主链四组件', '模型接口 / 工具注册表 / 状态 / 循环控制，构成观察→决策→动作→观察'],
      ['观测旁路', '横穿决策、动作、退出、失败四个点，轨迹断了就无法评测'],
      ['两道护栏', '动作执行前的权限检查与答案返回前的输出检查，都是确定性代码'],
    ],
    [
      '把历史消息直接拼成 prompt 字符串，换模型后被截断且无法追溯用了哪段历史。',
      '把「请不要删除文件」只写进提示词当护栏，模型忽略时副作用已经发生。',
    ],
  ),
  'theory',
)
