import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 11 ========== */

export const L68 = withKind(
  L(
    'L68',
    11,
    '实战：亲手用 TS 实现一个多 Agent 系统（消息总线 + 角色 + supervisor）',
    4,
    ['L67', 'L36'],
    ['multi-agent-impl'],
    [
      '用 TS 实现消息总线 + 角色定义 + supervisor 编排的多 Agent 系统',
      '理解 supervisor 如何分配任务、收集结果',
      '对照 OpenAI Agents SDK 的 handoff / AutoGen 的角色编排',
    ],
    `
### 从零搭一个最小多 Agent

多 Agent 系统的三块：**角色**（每个 Agent 的职责 + prompt）、**消息总线**（通信）、**supervisor**（编排者，分配任务、汇总结果）。

\`\`\` title="多 Agent 系统（消息总线 + 角色 + supervisor）" note="关键：supervisor 显式编排「谁先谁后、谁把结果交给谁」，消息全走总线（可追踪）。"
interface Agent { name: string; systemPrompt: string; run(task: string): Promise<string> }

// ① 角色：各有独立 systemPrompt 与上下文
const researcher: Agent = { name: "researcher", systemPrompt: "你是研究员，负责收集与分析信息。", ... }
const reviewer: Agent  = { name: "reviewer",  systemPrompt: "你是评审，负责找出结论的问题。", ... }
const writer: Agent    = { name: "writer",    systemPrompt: "你是合成者，负责汇总成最终报告。", ... }

// ② 消息总线：记录并分发消息（带 id，可追踪）
class Bus {
  log: AgentMessage[] = []
  send(msg: AgentMessage) { this.log.push(msg); /* 分发给目标 agent */ }
}

// ③ supervisor：编排流程
async function supervisor(task: string, bus: Bus) {
  bus.send({ from: "supervisor", to: "researcher", type: "task", payload: task })
  const research = await researcher.run(task)

  bus.send({ from: "supervisor", to: "reviewer", type: "task", payload: research })
  const review = await reviewer.run(research)

  bus.send({ from: "supervisor", to: "writer", type: "task", payload: review })
  return await writer.run("基于研究" + research + "和评审" + review + "写报告")
}
\`\`\`

:::deep

### 框架对照：handoff vs supervisor

OpenAI Agents SDK 的 \\\`handoff\\\` 让一个 Agent 把对话「交接」给另一个 Agent（链式）；AutoGen 的 supervisor 模式则是「集中调度」——supervisor 决定每轮谁发言。你手写的 supervisor 更接近 AutoGen 的集中调度。

:::

### supervisor 编排的要点

- 显式流程：谁先谁后写清楚，而非让 Agent 自由聊。
- 结果传递：上游输出作为下游输入，避免信息丢失。
- 消息可追踪：全部走总线，配合 L75 链路追踪。

:::warn

### 结果要「带来源」

writer 拿到的研究结果要标明「这是 researcher 的产出」，否则合成时无法溯源（呼应 L138 研究小组的溯源校验）。

:::

`,
    null,
    [
      {
        text: '多 Agent 系统的三块是？',
        options: ['模型、工具、记忆', '角色、消息总线、supervisor', '前端、后端、数据库', '读、写、执行'],
        answer: 1,
        explain: '角色、总线、supervisor。',
        concept: 'multi-agent-impl',
      },
      {
        text: 'supervisor 的作用是？',
        options: ['写 prompt', '显式编排谁先谁后、结果如何传递', '存数据', '调模型'],
        answer: 1,
        explain: '编排流程、传递结果。',
        concept: 'multi-agent-impl',
      },
      {
        text: 'supervisor 编排模式更接近？',
        options: ['OpenAI handoff（链式交接）', 'AutoGen 的集中调度', 'LangGraph 图', 'React'],
        answer: 1,
        explain: '集中调度更接近 AutoGen supervisor。',
        concept: 'multi-agent-impl',
      },
    ],
    [
      ['角色 Agent', '有独立 systemPrompt 与上下文的执行单元'],
      ['消息总线', '记录并分发 Agent 消息的组件'],
      ['supervisor', '显式编排多 Agent 流程的调度者'],
    ],
    ['让 Agent 自由聊天而非 supervisor 显式编排，流程失控。', '结果不标来源，下游合成无法溯源。'],
  ),
  'practice',
)
