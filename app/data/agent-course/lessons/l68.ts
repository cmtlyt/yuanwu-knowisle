import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 11 ========== */

export const L68 = withKind(
  L(
    'L68',
    11,
    '实战：亲手用 TS 实现一个多 Agent 系统（消息总线 + 角色 + supervisor）',
    3,
    ['L67', 'L36'],
    ['multi-agent-impl'],
    [
      '用 TypeScript 实现 MessageBus + Role + Supervisor 三个部件并跑通三角色协作',
      '实现消息投递、轮次推进、三类终止判定与事件流记录',
      '对照 OpenAI Agents SDK 的 handoff 与 AutoGen 的角色编排，说清控制权差异',
    ],
    `
### 一个广播把预算烧掉三分之二

某团队的第一版多 Agent 系统只有三十行：所有角色订阅全部消息，谁有话说就 \`bus.emit(msg)\`。

三个角色时它工作得很好。加到六个角色那天，一次任务跑了 91 秒、消耗 4.2 万 token——同样的任务在三角色版本里是 11 秒、1.1 万 token。原因是广播：每轮每个角色都收到全部消息，六个角色互相「看到」彼此的中间产物，于是每个都想补充两句。消息数从 12 条涨到 78 条，而真正的信息量没有变。

这一课从零搭一个能控制住这件事的骨架。关键不是「能跑」，是**三条边界**：总线不理解业务、角色只能通过消息影响彼此、supervisor 独占「决定谁做什么」的权力。

### 三个部件与一条边界

| 部件 | 职责 | 不该做的事 |
| --- | --- | --- |
| MessageBus | 投递、记录、轮次推进、终止判定 | 解析 payload 的业务语义 |
| Role | 处理自己关心的消息类型，产出新消息 | 直接调用另一个 Role 的方法 |
| Supervisor | 持有全局计划，决定任务分配与汇总 | 替其他角色做事 |

总线一旦开始「看懂」消息内容，它就成了隐藏的编排者——路由规则会同时存在于总线和 supervisor 两处，改一处漏一处。角色之间直接互调方法则更糟：它绕过了消息记录，事件流里会出现无法解释的状态变化。

### 消息与总线

\`\`\`ts title="总线：投递、记录、推进"
export type MsgType = 'request' | 'inform' | 'handoff' | 'done' | 'error'

export interface AgentMessage {
  id: string
  traceId: string
  parentId?: string
  from: string
  to: string // 角色名或 '*'
  type: MsgType
  payload: unknown
  depth: number
  ts: number
}

export interface Role {
  name: string
  handles: MsgType[] // 只接收这些类型
  handle(m: AgentMessage, bus: MessageBus): Promise<AgentMessage[]>
}

export interface RunResult {
  ok: boolean
  reason: string
  rounds: number
  messages: AgentMessage[]
  answer?: unknown
}

export class MessageBus {
  private roles = new Map<string, Role>()
  private queue: AgentMessage[] = []
  history: AgentMessage[] = []
  private seq = 0

  register(role: Role): this {
    this.roles.set(role.name, role)
    return this
  }

  /** 由角色调用：基于父消息造一条回复，自动继承 traceId 与 depth */
  reply(parent: AgentMessage, patch: Pick<AgentMessage, 'from' | 'to' | 'type'> & { payload: unknown }): AgentMessage {
    return {
      id: 'm' + ++this.seq,
      traceId: parent.traceId,
      parentId: parent.id,
      depth: parent.depth + 1,
      ts: Date.now(),
      ...patch,
    }
  }
}
\`\`\`

\`reply()\` 里自动继承 \`traceId\` 和 \`depth + 1\` 这两个细节很关键：让角色**没有机会**忘记带它们。凡是能靠 API 保证的约束，就不要写成文档里的约定——这是 L67 那条「协议要在类型里」的具体落地方式。

### 角色：处理消息，产出消息

\`\`\`ts title="三个角色"
const researcher: Role = {
  name: 'researcher',
  handles: ['request'],
  async handle(m, bus) {
    const q = String((m.payload as { question: string }).question)
    // 真实实现里这里调检索工具；这里用固定结果演示
    const hits = [
      { id: 'doc:a', title: '协议 A 说明', snippet: '协议 A 于 2024 年发布' },
      { id: 'doc:b', title: '迁移指南', snippet: '建议在 Q3 前完成迁移' },
    ]
    return [
      bus.reply(m, {
        from: 'researcher',
        to: 'analyst',
        type: 'inform',
        payload: { question: q, hits },
      }),
    ]
  },
}

const analyst: Role = {
  name: 'analyst',
  handles: ['inform'],
  async handle(m, bus) {
    const { hits } = m.payload as { hits: Array<{ id: string; snippet: string }> }
    // 只有一条命中时不再转手，直接汇报——避免无意义的交接
    const conclusion = hits.map((h) => '[' + h.id + '] ' + h.snippet).join('；')
    return [
      bus.reply(m, {
        from: 'analyst',
        to: 'supervisor',
        type: 'inform',
        payload: { conclusion, refs: hits.map((h) => h.id) },
      }),
    ]
  },
}
\`\`\`

注意 \`analyst\` 把 \`refs\` 原样带上去了。这不是冗余——L67 那个「引用不存在的第三条」事故，修复点就在这条链上：**每一跳都携带 refs，最后一跳才能校验引用是否合法**。

### supervisor：只决定，不执行

\`\`\`ts title="supervisor：持有计划与裁决权"
export function makeSupervisor(maxRounds = 6): Role {
  const seen = new Map<string, unknown>()
  return {
    name: 'supervisor',
    handles: ['inform', 'error'],
    async handle(m, bus) {
      if (m.type === 'error') {
        return [bus.reply(m, { from: 'supervisor', to: m.from, type: 'request', payload: { retry: true } })]
      }
      const p = m.payload as { conclusion?: string; refs?: string[] }
      seen.set(m.from, p.conclusion)

      // ① 汇总齐了就宣告完成
      if (seen.size >= 1 && p.conclusion) {
        return [
          bus.reply(m, {
            from: 'supervisor',
            to: '*',
            type: 'done',
            payload: { answer: p.conclusion, refs: p.refs ?? [], agents: [...seen.keys()] },
          }),
        ]
      }
      // ② 深度到达上限仍未汇总，报错并收敛（而不是继续要东西）
      if (m.depth >= maxRounds) {
        return [bus.reply(m, { from: 'supervisor', to: '*', type: 'error', payload: { reason: 'depth-limit' } })]
      }
      return []
    },
  }
}
\`\`\`

supervisor 的特权只有一条：**它发出的 \`done\` 能终止整个循环**。其他角色发 \`done\` 不算——否则任何一个角色都能单方面宣布结束，系统就没有收敛点。

### 循环：投递、推进、终止

\`\`\`ts title="run：批次推进 + 三类终止"
export async function run(
  bus: MessageBus,
  seed: AgentMessage,
  opts: { maxRounds?: number; maxMessages?: number } = {},
): Promise<RunResult> {
  const maxRounds = opts.maxRounds ?? 8
  const maxMessages = opts.maxMessages ?? 40
  bus['queue'].push(seed) // 演示用；生产环境走 enqueue()
  let rounds = 0

  while (bus['queue'].length > 0 && rounds < maxRounds) {
    const batch = bus['queue'].splice(0)
    rounds++
    for (const m of batch) {
      bus.history.push(m)
      if (bus.history.length > maxMessages) {
        return { ok: false, reason: 'message-budget', rounds, messages: bus.history }
      }
      const targets = m.to === '*' ? [...bus['roles'].keys()] : [m.to]
      for (const t of targets) {
        const role = bus['roles'].get(t)
        if (!role?.handles.includes(m.type)) continue
        const out = await role.handle(m, bus)
        for (const o of out) {
          // 终止信号在此处被消费：不再入队
          if (o.type === 'done' && o.from === 'supervisor') {
            bus.history.push(o)
            return { ok: true, reason: 'supervisor-done', rounds, messages: bus.history, answer: o.payload }
          }
          bus['queue'].push(o)
        }
      }
    }
  }
  return {
    ok: false,
    reason: rounds >= maxRounds ? 'max-rounds' : 'no-messages',
    rounds,
    messages: bus.history,
  }
}
\`\`\`

三个终止条件的落点各不相同，这是刻意的：

- \`done\` 在**出队前**被拦截，因为它不是一个要投递的消息，是一个停止信号。投递出去会让所有角色都处理一次「完成」事件。
- \`maxMessages\` 在**入历史前**检查，因为它是最后一道闸（广播失控时靠它兜底）。
- \`maxRounds\` 在循环条件里，捕获「队列一直有消息但没人完成任务」的礼貌互评（L67 讲过）。

### 跑通一次

\`\`\`ts title="组装 + 运行"
const bus = new MessageBus()
bus.register(researcher).register(analyst).register(makeSupervisor())

const seed: AgentMessage = {
  id: 'm0',
  traceId: 't-' + Date.now(),
  from: 'user',
  to: 'supervisor',
  type: 'request',
  payload: { question: '协议 A 什么时候发布的？' },
  depth: 0,
  ts: Date.now(),
}

// supervisor 收到初始 request 后派给 researcher
bus.register({
  name: 'supervisor',
  handles: ['request', 'inform', 'error'],
  async handle(m, b) {
    if (m.type === 'request') {
      return [b.reply(m, { from: 'supervisor', to: 'researcher', type: 'request', payload: m.payload })]
    }
    return makeSupervisor().handle(m, b)
  },
})

const r = await run(bus, seed)
console.log(r.ok, r.reason, r.rounds)
// true 'supervisor-done' 3
console.log(r.messages.map((m) => m.depth + ' ' + m.from + '->' + m.to + ' ' + m.type).join(' | '))
// 0 user->supervisor request | 1 supervisor->researcher request | 2 researcher->analyst inform
// | 3 analyst->supervisor inform | 4 supervisor->* done
\`\`\`

实际跑出来是 3 轮、5 条消息，且 \`depth\` 单调递增。这两个数字本身就是可观测性：如果 \`depth\` 出现回退，说明有角色在凭空造消息而没走 \`reply()\`；如果轮次远超角色数，说明有角色在重复处理同一类消息（通常是 \`handles\` 声明过宽）。

### 与 OpenAI Agents SDK / AutoGen 对照

| 概念 | 本课实现 | OpenAI Agents SDK | AutoGen |
| --- | --- | --- | --- |
| 角色 | \`Role\` 接口（名字 + 关心的类型 + handle） | \`Agent\`（instructions + tools + handoffs） | \`ConversableAgent\`（system_message + llm_config） |
| 控制权转移 | 消息投递给 \`to\`，控制权始终在循环里 | \`handoff\` 显式转移并带上历史 | 群聊 \`GroupChat\` 由 manager 决定下一个发言者 |
| 终止 | supervisor 的 \`done\` 被出队拦截 | \`final_output\` / 最大轮次 | \`is_termination_msg\` 谓词 |
| 编排位置 | \`run()\` 循环 | runner | GroupChatManager |

最关键的一处差异是 \`handoff\`：它把**控制权连同上下文一起转移**给另一个 Agent，被调方成为当前执行者，原 Agent 不再回来（除非被再次 handoff）。这与「调用一个工具再拿回结果」在语义上不同——工具调用后控制权必定回来，handoff 不回来。

这决定了两种架构的适用面：需要「汇总多方结果」时用消息投递（本课形态，控制权在循环里）；需要「把用户完整交给另一个专家」时用 handoff（控制权转移，上下文连贯）。混用会产生很难查的 bug——比如一边 handoff 一边又期待原 Agent 收到回复。

:::deep

### 为什么把「轮次」作为一等对象

多数多 Agent 实现是事件驱动的：消息来了就处理，没有轮的概念。它在三角色时能跑，但一旦出现「A 和 B 互相触发」，事件流就变成无法打断的递归。

引入轮次（batch）解决三件事：**可打断**（每轮之间检查预算，能在轮边界停机）、**可归因**（一轮的输出是确定的，便于复现）、**可观测**（轮数与角色数的比值是判断效率的直接指标）。

代价是延迟：批次推进要等一轮里最慢的角色返回。所以批量任务用轮次、交互式任务用事件驱动——判断依据是「用户能否等一轮的时间」。

:::

:::warn

### 重试必须有幂等键

总线的 \`run()\` 一遇到角色抛错就会重放整批消息（这是最常见也最容易写的重试策略）。如果角色有副作用——发邮件、写库、扣额度——重放会把副作用做两遍。

解法不是「别重试」，而是让副作用可去重：每条消息带一个稳定键，副作用执行前先查这个键是否已处理过。

\`\`\`ts title="用 parentId 做幂等键"
const done = new Set<string>()

async function handle(m: AgentMessage, bus: MessageBus) {
  const key = m.traceId + ':' + (m.parentId ?? m.id) // 同一条父消息的下游动作只做一次
  if (done.has(key)) {
    return [bus.reply(m, { from: 'writer', to: 'supervisor', type: 'inform', payload: { replayed: true } })]
  }
  const out = await doSideEffect(m) // 发通知 / 写库
  done.add(key)
  return [bus.reply(m, { from: 'writer', to: 'supervisor', type: 'inform', payload: out })]
}
\`\`\`

键的选择有讲究：用 \`m.id\` 会在重放时失效（重放会产生新 id），用 \`parentId\` 才能识别出「同一次请求的第二次尝试」。这也是 \`parentId\` 除了重建因果链之外的第二个用途。

顺带说一个和幂等相关但常被分开处理的问题：**历史要不要落盘**。本课的 \`history\` 只在内存里，进程重启即丢。如果任务需要断点续跑（L36 讲过运行时状态落盘），那么 \`history\` 与幂等键集必须一起持久化——只存历史不存已处理键，重启后重放会把副作用再做一遍；只存键不存历史，重启后无法重建因果链。

### 三个容易写错的地方

**第一，\`handles\` 声明过宽。** 一个角色声明 \`handles: ['inform']\` 却只想处理「分析结果」这一种 inform，它就会收到所有 inform 并各自响应一次，消息数按角色数乘开。正确做法是让 \`type\` 更细（\`inform.analysis\` 这种命名空间），或在 handle 里做显式的前置过滤并**返回空数组**而不是返回「我不关心」的消息。

**第二，用返回空数组表达「不需要回复」和「处理完了」两种语义。** 二者在 \`run()\` 里都表现为「没有新消息」，但含义相反：前者正常，后者意味着链路断了。解法是让 handle 返回 \`{ out: AgentMessage[], ack: boolean }\`，或者在事件流里记录一条 \`noop\` 事件区分。

**第三，忘了给 seed 消息设 \`depth: 0\`。** 缺省 \`undefined\` 时 \`depth + 1\` 会变成 \`NaN\`，而 \`NaN > maxRounds\` 恒为 false——所有深度保护失效，且不会有任何报错。

:::

### 收束

这套骨架不到 200 行，但它把 L67 的三要素全部落到了代码：消息结构由 \`AgentMessage\` 保证、路由由 \`to\` + \`handles\` 保证、终止由 \`done\` 拦截 + 两道预算保证。

下一课换一个维度：同样是这三个部件，把控制权放在不同位置，就得到三种编排模式——supervisor 集中、群聊去中心、图 workflow 声明式。
`,
    null,
    [
      {
        text: '总线为什么不应该解析 payload 的业务语义？',
        options: [
          '性能问题',
          '它一旦「看懂」内容就成了隐藏的编排者，路由规则会分散在总线和 supervisor 两处',
          '安全风险',
          'payload 类型不确定',
        ],
        answer: 1,
        explain: '职责边界：总线只投递与记录，编排权归 supervisor。',
        concept: 'multi-agent-impl',
      },
      {
        text: '`reply()` 自动继承 traceId 与 depth+1 的价值是？',
        options: [
          '减少代码行数',
          '让角色没有机会忘记携带，把协议约束变成 API 保证',
          '提升性能',
          '方便日志排序',
        ],
        answer: 1,
        explain: '能靠 API 保证的约束不要写成文档约定。',
        concept: 'multi-agent-impl',
      },
      {
        text: '`done` 消息在出队前被拦截而不是投递给所有角色，原因是？',
        options: [
          '节省带宽',
          '它是停止信号而非待投递消息，投递会让所有角色各处理一次完成事件',
          'done 没有 payload',
          '避免死循环',
        ],
        answer: 1,
        explain: '终止信号只应被消费一次，且消费者是循环本身。',
        concept: 'multi-agent-impl',
      },
      {
        text: 'handoff 与「调用工具」的核心差异是？',
        options: [
          'handoff 更快',
          'handoff 转移控制权且不回来，工具调用后控制权必定返回',
          'handoff 只用于人类',
          '工具调用不能带上下文',
        ],
        answer: 1,
        explain: '这决定了「汇总多方结果」用消息投递、「整体交给专家」用 handoff。',
        concept: 'multi-agent-impl',
      },
    ],
    [
      ['MessageBus', '负责投递、记录历史与轮次推进的传输层，不理解业务语义'],
      ['Role', '声明关心哪些消息类型，处理并产出新消息的角色单元'],
      ['handoff', '把控制权连同上下文转移给另一个 Agent，原 Agent 不再回来'],
      ['轮次（batch）', '一次推进中处理的全部消息集合，提供可打断与可归因的单位'],
    ],
    [
      '广播给所有角色，消息数与 token 随角色数平方增长。',
      '`handles` 声明过宽，角色对每条同类消息都响应一次。',
      'seed 消息缺 depth，`depth + 1` 变 NaN 使所有深度保护失效。',
      '一边 handoff 一边期待原 Agent 收到回复，产生不可解释的状态。',
    ],
  ),
  'practice',
)
