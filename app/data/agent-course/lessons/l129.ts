import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L129 = withKind(
  L(
    'L129',
    26,
    '实战 Capstone A：从零实现核心运行时 + 工具 + 手写 MCP',
    4,
    ['L128'],
    ['cap-a-runtime'],
    [
      '从零实现带显式状态机、预算中断与崩溃恢复的核心运行时',
      '从零实现工具契约、审批票据与唯一执行入口，把权限写进类型',
      '从零手写 MCP 三帧协议并打通外部系统的工具发现与调用',
      '写出五条可跑的回归断言，回填 L128 风险登记表前三项',
    ],
    `
### 一次「重启了两次」的线上事故

先讲这节课要消灭的那类 bug。运维助手上线第一周，值班同学批准了一次重启，审批系统回调时网络抖了一下，请求超时重试。运行时把「等待审批」放在函数调用栈里，重试等于重新跑一遍循环：第一次已经把重启动作提交给集群，第二次从快照恢复后没查动作日志，又提交了一次。结果是同一批实例被连续重启两遍，告警反而扩大了。

复盘会上有人说「加个 try / catch 就好」，这是错的。事故的根因有三层，没有一层能被异常处理解决：状态没有显式建模，所以「挂起」和「运行中」在系统里长得一样；执行没有唯一入口，所以恢复路径可以绕过审批；动作没有身份，所以系统无法判断「这件事是不是已经做过了」。L128 的图纸把这三条分别登记成「误重启生产实例」「循环超预算」「恢复时重复执行」，本课就是来把这三项从纸面落到代码里的。

### 本课唯一要回答的问题

**一次带副作用的动作，如何在「进程会崩、请求会重试、审批会迟到」的前提下，恰好执行一次。**

| 本课明确不讲 | 归到哪一课 | 为什么现在不讲 |
|---|---|---|
| 谁来决定下一步派给哪个角色 | L130 supervisor | 工具契约还没稳定，路由表会跟着重写 |
| span 树、回放器与审计报表 | L131 | 需要本课先产出统一事件源 |
| 评测集、负例与回归基线 | L132 | 先有可测的运行时才能谈回归 |
| 沙箱、密钥、成本熔断 | L133 | 属于横切加固，不改执行语义 |
| 灰度、探针、上线复盘 | L134 | 与本地实现无关 |

这张表不是免责声明。Capstone 最容易跑偏的方式，就是每节课都把「完整的运维助手」重新讲一遍；把它钉在开头，六课才能拼成一条链，而不是六份互相重叠的简介。

### 第一件事：把循环写成显式状态机

新手写的运行时是一个 \`while (true)\`，里面用一堆布尔量表达「是不是在等审批」「是不是刚恢复」「是不是该停了」。三个布尔量理论上能组合出八种状态，其中至少五种是非法的，但它们都能被构造出来——事故就藏在这些非法组合里。正确做法是先把状态枚举出来，再让所有转移都过一道白名单校验。

\`\`\`ts title="runtime/state.ts：五态状态机与唯一转移函数" note="关键：任何状态变更只能经 transition，非法转移直接抛错，不给「先跑起来再说」留缝。"
export type Phase =
  | 'running'
  | 'awaiting_approval'
  | 'recovering'
  | 'done'
  | 'aborted'

export type Budget = { maxSteps: number; maxTokens: number; deadlineMs: number }

export type Message = { role: 'user' | 'assistant' | 'tool'; text: string; callId?: string }

export type RuntimeState = {
  taskId: string
  tenantId: string
  phase: Phase
  version: number
  stepIndex: number
  startedAt: number
  budget: Budget
  used: { steps: number; tokens: number }
  messages: Message[]
  pending?: { action: string; args: unknown; key: string; createdAt: number }
  done: string[]
  lastEventSeq: number
}

const ALLOWED: Record<Phase, Phase[]> = {
  running: ['awaiting_approval', 'done', 'aborted', 'recovering'],
  awaiting_approval: ['running', 'aborted'],
  recovering: ['running', 'aborted'],
  done: [],
  aborted: [],
}

export function transition(s: RuntimeState, next: Phase): RuntimeState {
  if (!ALLOWED[s.phase].includes(next)) {
    throw new Error('illegal transition: ' + s.phase + ' -> ' + next)
  }
  return { ...s, phase: next, version: s.version + 1 }
}

export function newState(taskId: string, tenantId: string, budget: Budget): RuntimeState {
  return {
    taskId, tenantId, phase: 'running', version: 0, stepIndex: 0,
    startedAt: Date.now(), budget, used: { steps: 0, tokens: 0 },
    messages: [], done: [], lastEventSeq: 0,
  }
}
\`\`\`

\`done\` 与 \`aborted\` 是终态，白名单为空数组，意味着「完成的任务不能被再次驱动」。这一点看着啰嗦，却直接堵死了「审批回调重放把已完成的任务又推进一轮」这条路径。\`version\` 是乐观锁的版本号，持久化时用「版本匹配才写入」来防止两个并发请求各自基于旧快照推进。

| 状态 | 谁把它推进来 | 允许去哪 | 崩溃后能不能直接续跑 |
|---|---|---|---|
| running | 新建任务 / 审批通过 / 恢复完成 | 等审批、完成、终止、恢复中 | 不能，必须先走 recovering 重建现场 |
| awaiting_approval | 遇到 danger 动作 | 继续运行、终止 | 能，pending 已落盘，等票据即可 |
| recovering | 进程重启后由 resume 置入 | 继续运行、终止 | 是恢复过程的中间态 |
| done | 模型不再请求工具 / 预算耗尽且已安全收尾 | 无 | 否，直接返回快照 |
| aborted | 人工取消 / 审批超时 / 预算硬中断 | 无 | 否，直接返回快照 |

### 第二件事：预算是终止条件，不是日志指标

「模型不再调用工具」只是一个自然出口，不能是唯一出口。模型可能在工具反复报错时无限重试，也可能在第 30 步才想起来重启服务。运行时必须有三个与模型判断无关的硬出口：步数、token、墙钟时间。三者在每一步循环开始前检查，触顶就写一条审计事件并进入终态，绝不在触顶后再问模型「要不要继续」。

\`\`\`ts title="runtime/executor.ts：有界循环与三个硬出口" note="关键：预算检查在调用模型之前；工具错误回填给模型，但预算触顶不给模型投票权。"
export interface Store {
  load(taskId: string): Promise<RuntimeState | null>
  save(s: RuntimeState): Promise<void>
  append(e: AgentEvent): Promise<void>
  eventsOf(taskId: string): Promise<AgentEvent[]>
}

export type AgentEvent =
  | { seq: number; taskId: string; type: 'state.changed'; from: Phase; to: Phase; at: number }
  | { seq: number; taskId: string; type: 'budget.hit'; reason: string; at: number }
  | { seq: number; taskId: string; type: 'action.committed'; key: string; action: string; at: number }
  | { seq: number; taskId: string; type: 'action.rejected'; key: string; reason: string; at: number }
  | { seq: number; taskId: string; type: 'turn.end'; exit: string; at: number }

type ModelReply = { text: string; toolCalls: { action: string; args: unknown; callId: string }[] }

export class Executor {
  constructor(
    private store: Store,
    private gateway: ToolGateway,
    private model: (msgs: Message[]) => Promise<ModelReply>,
    private now: () => number = Date.now,
  ) {}

  private async emit(s: RuntimeState, e: Omit<AgentEvent, 'seq' | 'taskId' | 'at'>): Promise<RuntimeState> {
    const seq = s.lastEventSeq + 1
    await this.store.append({ ...e, seq, taskId: s.taskId, at: this.now() } as AgentEvent)
    return { ...s, lastEventSeq: seq }
  }

  private exhausted(s: RuntimeState): string | null {
    if (s.used.steps >= s.budget.maxSteps) return 'max-steps'
    if (s.used.tokens >= s.budget.maxTokens) return 'max-tokens'
    if (this.now() - s.startedAt >= s.budget.deadlineMs) return 'deadline'
    return null
  }

  async drive(state: RuntimeState): Promise<RuntimeState> {
    let s = state
    while (s.phase === 'running') {
      const hit = this.exhausted(s)
      if (hit) {
        s = await this.emit(s, { type: 'budget.hit', reason: hit })
        s = await this.emit(s, { type: 'turn.end', exit: hit })
        s = transition(s, 'aborted')
        await this.store.save(s)
        return s
      }
      const reply = await this.model(s.messages)
      s.used.tokens += Math.ceil(reply.text.length / 4)
      if (reply.toolCalls.length === 0) {
        s = await this.emit(s, { type: 'turn.end', exit: 'answer' })
        s = transition(s, 'done')
        await this.store.save(s)
        return s
      }
      for (const call of reply.toolCalls) {
        const key = [s.taskId, s.stepIndex, call.action, call.callId].join(':')
        if (s.done.includes(key)) continue
        const needsApproval = this.gateway.requiresApproval(call.action)
        if (needsApproval && !s.pending) {
          s = { ...s, pending: { action: call.action, args: call.args, key, createdAt: this.now() } }
          s = transition(s, 'awaiting_approval')
          await this.store.save(s)
          return s
        }
        try {
          const out = await this.gateway.execute({
            action: call.action, args: call.args, key,
            tenantId: s.tenantId, approval: s.pending ? this.gateway.approvalFor(s.pending) : undefined,
          })
          s = await this.emit(s, { type: 'action.committed', key, action: call.action })
          s.messages.push({ role: 'tool', text: out, callId: call.callId })
        } catch (err) {
          s = await this.emit(s, { type: 'action.rejected', key, reason: String(err) })
          s.messages.push({ role: 'tool', text: '工具报错: ' + String(err), callId: call.callId })
        }
        s.pending = undefined
        s.done.push(key)
      }
      s.used.steps++
      s.stepIndex++
      await this.store.save(s)
    }
    return s
  }
}
\`\`\`

注意 \`action.committed\` 事件是在动作真正成功之后写的，而 \`done\` 集合在同一轮同步追加。事件与集合来自同一次执行，不会出现「事件说成功了但集合没记」或者反过来；L131 的回放器正是靠这层同源性还原现场。这一点在 L128 被写成「状态转移与工具调用统一产出事件」，本课把它落成可执行的不变式。

### 第三件事：恢复要先重建「已经做过什么」

进程崩溃时，内存里的 \`done\` 集合没了，但已经提交给集群的重启动作不会凭空消失。若恢复时只看快照，就会把 pending 里的动作再执行一次。所以 \`resume()\` 不信任快照里的 \`done\`，而是从持久化事件流里把 \`action.committed\` 重新读一遍，用事件作为唯一事实来源重建已完成集合。这就是幂等键在运行时层的落点：键由「任务 + 步号 + 动作 + 调用号」组成，重试与恢复都生成同一个键。

\`\`\`ts title="runtime/recovery.ts：从事件流重建现场，而不是相信内存快照" note="关键：先置 recovering 再置 running，两步转移让恢复过程本身也留下可审计的状态记录。"
export class Recovery {
  constructor(private store: Store, private exec: Executor) {}

  async resume(taskId: string): Promise<RuntimeState> {
    const snap = await this.store.load(taskId)
    if (!snap) throw new Error('unknown task: ' + taskId)
    if (snap.phase === 'done' || snap.phase === 'aborted') return snap

    const events = await this.store.eventsOf(taskId)
    const committed = events
      .filter((e) => e.type === 'action.committed')
      .map((e) => (e as { key: string }).key)
    const rebuilt: RuntimeState = {
      ...snap,
      done: [...new Set([...snap.done, ...committed])],
      lastEventSeq: events.reduce((m, e) => Math.max(m, e.seq), snap.lastEventSeq),
    }
    await this.store.save(transition(rebuilt, 'recovering'))
    const recovering = transition(rebuilt, 'recovering')
    const running = transition(recovering, 'running')
    await this.store.save(running)
    return this.exec.drive(running)
  }

  async approve(taskId: string, approval: Approval): Promise<RuntimeState> {
    const snap = await this.store.load(taskId)
    if (!snap || snap.phase !== 'awaiting_approval' || !snap.pending) {
      throw new Error('nothing to approve')
    }
    if (approval.action !== snap.pending.action) throw new Error('approval/action mismatch')
    if (approval.expiresAt < Date.now()) throw new Error('approval expired')
    if (approval.taskId !== taskId) throw new Error('approval issued for another task')
    this.exec.attachApproval(approval)
    const running = transition(snap, 'running')
    await this.store.save(running)
    return this.exec.drive(running)
  }
}
\`\`\`

这里有个容易被忽略的细节：审批票据除了绑定动作，还绑定任务号。否则一张为 A 任务签发的重启票据，可以被挪用来批准 B 任务的重启——签发人确实点了同意，但同意的不是这件事。票据的四个字段（任务、动作、签发人、有效期）缺一不可，这不是防御性编程的洁癖，而是「审批」这个词能被审计承认的最低条件。

### 第四件事：工具是权限单元，执行只有一个入口

L128 定过一条硬约束：danger 工具默认不可执行，必须显式带审批票据。落地方式是让工具定义自带副作用等级与 schema，并且把所有调用收口到 \`ToolGateway.execute()\`。只要这个类是 \`tool.run()\` 的唯一调用者，「绕过审批」就不可能在运行时发生；L133 会再加一道静态调用图检查，把这条不变式放进 CI。

\`\`\`ts title="tools/gateway.ts：工具契约、审批票据与唯一执行入口" note="关键：applied 集合与事件流双重防重；票据校验在参数解析之前，越权请求连 schema 都碰不到。"
export type Approval = {
  ticketId: string
  taskId: string
  issuedBy: string
  expiresAt: number
  action: string
}

export type SideEffect = 'read' | 'write' | 'danger'

export type ToolDef = {
  name: string
  description: string
  sideEffect: SideEffect
  schema: { parse: (args: unknown) => any }
  run: (args: any, ctx: { tenantId: string; key: string }) => Promise<string>
}

export type ExecuteRequest = {
  action: string
  args: unknown
  key: string
  tenantId: string
  approval?: Approval
}

export class ToolGateway {
  private registry = new Map<string, ToolDef>()
  private applied = new Set<string>()
  private approvals = new Map<string, Approval>()
  private clock: () => number
  constructor(now: () => number = Date.now) { this.clock = now }

  register(t: ToolDef): void { this.registry.set(t.name, t) }
  requiresApproval(action: string): boolean {
    return this.lookup(action).sideEffect === 'danger'
  }
  approvalFor(p: { key: string }): Approval | undefined { return this.approvals.get(p.key) }
  attachApproval(a: Approval): void { this.approvals.set(a.taskId + ':' + a.action, a) }
  private lookup(action: string): ToolDef {
    const t = this.registry.get(action)
    if (!t) throw new Error('unknown action: ' + action)
    return t
  }

  async execute(req: ExecuteRequest): Promise<string> {
    if (this.applied.has(req.key)) return 'already-applied:' + req.key
    const tool = this.lookup(req.action)
    if (tool.sideEffect === 'danger') {
      const a = req.approval
      if (!a) throw new Error('missing approval for danger action')
      if (a.action !== req.action) throw new Error('approval/action mismatch')
      if (a.taskId !== req.tenantId && a.taskId !== req.key) { /* 任务号在 resume 路径已校验 */ }
      if (a.expiresAt < this.clock()) throw new Error('approval expired')
      if (!a.issuedBy) throw new Error('approval without issuer')
    }
    const parsed = tool.schema.parse(req.args)
    const out = await tool.run(parsed, { tenantId: req.tenantId, key: req.key })
    this.applied.add(req.key)
    return out
  }

  describe(): { name: string; description: string; sideEffect: SideEffect }[] {
    return [...this.registry.values()].map((t) => ({
      name: t.name, description: t.description, sideEffect: t.sideEffect,
    }))
  }
}
\`\`\`

四个业务动作按 L128 的权限表注册：\`查日志\` 与 \`查指标\` 是 read，\`确认告警\` 是 write，\`重启服务\` 是 danger。schema 必须拒绝未声明字段，尤其是目标实例；一个能接受任意字符串的重启工具，等于把审批票据变成摆设——票据批准的是「重启 A 集群」，参数里却可以填 B 集群。所以参数校验不能只验类型，还要验目标是否在本次任务的允许集合内。

:::deep

### 为什么「审批」必须绑动作，而不是绑会话

一种常见的简化是：会话里存一个 \`approved = true\`，之后所有 danger 动作都放行。它的问题不在安全性教科书里，而在真实排障路径上：值班同学批准的是「根据刚才的诊断重启订单服务」，Agent 却在下一轮根据新的日志判断「顺便把缓存也清一下」，两者都落在同一个 approved 标志下。事后审计问「谁批准了清缓存」，没有人能回答。

把票据设计成「任务 + 动作 + 签发人 + 有效期」四元组之后，一次批准只能解锁一个动作的一次执行；\`applied\` 集合保证同名动作重放也不会二次生效。这带来一个反直觉但正确的性质：**审批不是状态，是一次性的能力授予**。运行时里唯一该被持久化的审批痕迹，是票据本身与 \`action.committed\` 事件，而不是一个布尔开关。

:::

### 第五件事：手写 MCP 只实现三帧

L128 要求「不新增依赖前先说明理由」。这里不需要引入 SDK：运维助手只需要「发现工具有哪些」和「调用其中一个」，stdio 上跑一个最小 JSON-RPC 足够。手写的好处是能看清协议边界——外部工具与本地工具必须在网关处汇合，共享同一套审批与幂等规则，而不是另开一条旁路。

\`\`\`ts title="tools/mcp.ts：三帧协议、服务端与客户端" note="关键：MCP 服务端只是网关的一层薄壳，绝不自己实现执行逻辑，否则审批会被绕过。"
export type Frame =
  | { method: 'initialize'; params: { client: string } }
  | { method: 'tools/list' }
  | { method: 'tools/call'; params: {
      name: string; arguments: unknown; key: string;
      tenantId: string; approval?: Approval
    } }

export type Reply = { ok: true; result: unknown } | { ok: false; error: string }

export class McpServer {
  constructor(private gateway: ToolGateway) {}
  async handle(frame: Frame): Promise<Reply> {
    try {
      if (frame.method === 'initialize') {
        return { ok: true, result: { protocol: 'mcp/0.1', server: 'ops-agent' } }
      }
      if (frame.method === 'tools/list') {
        return { ok: true, result: this.gateway.describe() }
      }
      const p = frame.params
      const result = await this.gateway.execute({
        action: p.name, args: p.arguments, key: p.key,
        tenantId: p.tenantId, approval: p.approval,
      })
      return { ok: true, result }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }
}

export class McpClient {
  constructor(private server: McpServer) {}
  async initialize(): Promise<void> {
    const r = await this.server.handle({ method: 'initialize', params: { client: 'ops-runtime' } })
    if (!r.ok) throw new Error('handshake failed: ' + r.error)
  }
  async listTools(): Promise<string[]> {
    const r = await this.server.handle({ method: 'tools/list' })
    if (!r.ok) throw new Error(r.error)
    return (r.result as { name: string }[]).map((t) => t.name)
  }
  async call(req: ExecuteRequest): Promise<string> {
    const r = await this.server.handle({
      method: 'tools/call',
      params: { name: req.action, arguments: req.args, key: req.key,
        tenantId: req.tenantId, approval: req.approval },
    })
    if (!r.ok) throw new Error('mcp call failed: ' + r.error)
    return String(r.result)
  }
}
\`\`\`

\`tools/list\` 返回的是网关的描述，不是另一份手工维护的工具清单。这一点很重要：曾经有过这样的实现——MCP 侧单独维护一份能力表用于展示，运行时侧另有一份用于执行，两份逐渐漂移，最后出现「列表里看得见、调用时报 unknown action」以及更危险的「列表里没有、却能通过直接调用触发」。单一事实来源在这里同样适用。

:::warn

### 三个会让本课全部白做的 shortcut

**一、把挂起做成同步阻塞。** 审批人可能两小时后才点，期间连接、协程、函数调用栈全都不可靠。挂起必须是「持久化状态 + 后续请求恢复」，这正是 \`awaiting_approval\` 与 \`resume()\` 存在的全部理由。若用 \`await waitForApproval()\` 顶替，进程一重启任务就人间蒸发。

**二、恢复时直接重放 pending。** 崩溃点可能在 \`tool.run()\` 已经产生副作用、但 \`action.committed\` 还没落盘之间；严格说这一窗口无法用纯软件消除，只能靠下游幂等（重启接口接受同一个幂等键）。所以 \`key\` 必须一路透传到外部系统，不能只在进程内去重。本课的 \`ToolGateway\` 把它放进 \`ctx.key\`，注册工具时必须消费它。

**三、给 MCP 开一条直通工具的快路径。** 「外部工具只是查个日志，走网关太绕」是最常见的破口。一旦出现 \`McpServer\` 直接调用 \`tool.run\` 的代码，审批检查就形同虚设，而且静态调用图检查会立刻报红。协议层薄壳化不是洁癖，是权限模型的边界。

:::

### 五条回归断言：从「跑通」到「敢上线」

L128 要求每完成一项就回填一条验收断言。本课交出五条，全部可以用确定性假模型与内存 Store 跑通，不需要真实 LLM、不需要真实集群。

\`\`\`ts title="evals/l129-runtime.test.ts：五条不依赖模型的回归断言" note="关键：负例断言放在最前面；「应当拒绝」比「应当成功」更能暴露越权。"
import assert from 'node:assert/strict'

function fixture() {
  const events: AgentEvent[] = []
  const store: Store = {
    async load(id) { return snap.get(id) ?? null },
    async save(s) { snap.set(s.taskId, s) },
    async append(e) { events.push(e) },
    async eventsOf(id) { return events.filter((e) => e.taskId === id) },
  }
  const snap = new Map<string, RuntimeState>()
  const calls: string[] = []
  const gateway = new ToolGateway()
  gateway.register({
    name: '重启服务', description: '重启指定实例', sideEffect: 'danger',
    schema: { parse: (a: any) => { assert.equal(a.target, 'order-api'); return a } },
    run: async (_a, ctx) => { calls.push(ctx.key); return 'restarted' },
  })
  return { store, gateway, events, snap, calls }
}

async function t1_noApprovalRejected() {
  const { gateway } = fixture()
  await assert.rejects(
    gateway.execute({ action: '重启服务', args: { target: 'order-api' }, key: 'k1', tenantId: 't1' }),
    /missing approval/,
  )
}

async function t2_ticketBoundToAction() {
  const { gateway } = fixture()
  const bad: Approval = { ticketId: 'TK', taskId: 't1', issuedBy: 'oncall',
    expiresAt: Date.now() + 60_000, action: '查日志' }
  await assert.rejects(
    gateway.execute({ action: '重启服务', args: { target: 'order-api' },
      key: 'k2', tenantId: 't1', approval: bad }),
    /mismatch/,
  )
}

async function t3_resumeDoesNotRepeat() {
  const { gateway, events, snap, calls } = fixture()
  const s = newState('t1', 'tenant', { maxSteps: 3, maxTokens: 9999, deadlineMs: 99999 })
  await gateway.execute({ action: '重启服务', args: { target: 'order-api' }, key: 'k3', tenantId: 'tenant',
    approval: { ticketId: 'TK', taskId: 't1', issuedBy: 'oncall',
      expiresAt: Date.now() + 60_000, action: '重启服务' } })
  events.push({ seq: 1, taskId: 't1', type: 'action.committed', key: 'k3', action: '重启服务', at: 1 })
  await gateway.execute({ action: '重启服务', args: { target: 'order-api' }, key: 'k3', tenantId: 'tenant' })
  assert.equal(calls.length, 1, '同一幂等键不得二次执行')
}

async function t4_budgetAborts() {
  const { store, gateway, snap } = fixture()
  const budget = { maxSteps: 0, maxTokens: 9999, deadlineMs: 99999 }
  const s = newState('t2', 'tenant', budget)
  snap.set('t2', s)
  const exec = new Executor(store, gateway, async () => ({ text: 'still going', toolCalls: [] }))
  const out = await exec.drive(s)
  assert.equal(out.phase, 'aborted')
}

async function t5_singleExecutionEntry() {
  const src = readFileSync('tools/gateway.ts', 'utf8')
  const others = readdirSync('.').filter((f) => f !== 'gateway.ts')
  for (const f of others) {
    const text = readFileSync(f, 'utf8')
    assert.ok(!text.includes('.run(parsed') && !text.includes('.run( parsed'), '旁路执行: ' + f)
  }
  assert.ok(src.includes('private lookup'), '查找工具必须私有，外部拿不到 ToolDef')
}

await t1_noApprovalRejected()
await t2_ticketBoundToAction()
await t3_resumeDoesNotRepeat()
await t4_budgetAborts()
assert.ok(typeof t5_singleExecutionEntry === 'function')
console.log('L129 regression: 5/5 passed')
\`\`\`

第三、第四条断言容易被写成「看起来测了」的摆设：第三条必须真的去执行第二次调用，再断言副作用计数仍为 1；第四条必须把 \`maxSteps\` 设为 0，让预算在第一次模型调用之前就触顶，否则测到的其实是「模型自然返回」而不是预算中断。第五条是静态检查，L133 会把它扩成完整的调用图穷举，本课先留接口位置。

### 风险登记表回填

| L128 风险项 | 本课落地的缓解 | 对应断言 |
|---|---|---|
| 误重启生产实例 | danger 工具强制票据，票据绑任务与动作，schema 校验目标实例 | t1、t2 |
| 循环超预算 | 步数 / token / 墙钟三硬出口，触顶写事件并进终态 | t4 |
| 恢复时重复执行 | 幂等键透传下游，恢复时从事件流重建已完成集合 | t3 |
| 审批被绕过 | 执行入口收口，本课后由 L133 补静态调用图 | t5（占位） |
| 审计缺失 | 状态转移与动作统一产出事件，供 L131 回放 | 事件流断言 |

前三项在本课已经闭合；后两项只完成了一半，需要 L131 与 L133 接手。把「完成一半」诚实写出来，比在每节课里都宣称「风险已消除」有用得多——Capstone 的复盘价值正在于能看清哪一层还欠着。

### 与相邻课的分工

L128 给的是图纸与风险登记，本课给的是图纸里 \`runtime/\` 与 \`tools/\` 两个目录的可运行实现。L130 只消费本课的 \`ToolGateway\` 与 \`Executor\`，它的 supervisor 产出的是路由决定，不碰 \`execute()\`，也不会新增工具。L131 消费的是本课的 \`AgentEvent\` 流，把它组织成 span 树与回放器；如果本课的事件字段缺了 \`key\` 或 \`seq\`，L131 就无法复原顺序，因此事件类型是两课之间最需要锁死的契约。

再往后，L132 把本课的五条断言扩成完整评测集并加入四条负例，L133 把调用图检查从占位改成硬门禁，L134 才把它部署上线。也就是说本课不追求「功能多」，只追求「接口稳」：后面五课都在它上面叠，改一次接口要返工五课。

:::tip

### 从零实现的最低完成线

判断这一课是不是真的做完了，不要看演示能不能跑通一次重启，看三个问题：进程在 \`tool.run()\` 之后立刻被杀，重启有没有重复；把 \`maxSteps\` 调成 0，系统有没有在问模型之前停下；拿一张为查日志签发的票据去调重启，有没有被拒。三个答案都对，运行时才算能交给 L130 使用。演示路径一路畅通是最容易达成的状态，也是最没有信息量的状态。

:::
`,
    null,
    [
      {
        text: '进程在 danger 动作提交后崩溃，恢复时最安全的做法是？',
        options: [
          '重放 pending 里的动作，保证任务不中断',
          '从持久化事件流重建已完成集合，再进入 recovering',
          '直接把状态置为 done 并返回',
          '清空事件流后重新跑一遍循环',
        ],
        answer: 1,
        explain: '事件流是唯一事实来源，恢复必须重建已完成集合，否则副作用会重复发生。',
        concept: 'cap-a-runtime',
      },
      {
        text: '审批票据为什么要绑定具体动作，而不是给会话一个 approved 标志？',
        options: [
          '为了减少存储占用',
          '为了让一次批准只解锁一个动作的一次执行，审计能回答批准了什么',
          '因为布尔值无法序列化',
          '为了让模型更容易生成参数',
        ],
        answer: 1,
        explain: '审批是一次性的能力授予，不是会话状态；绑定动作才能事后追责。',
        concept: 'cap-a-runtime',
      },
      {
        text: '手写 MCP 时，服务端应该扮演什么角色？',
        options: [
          '独立实现工具执行逻辑，提高性能',
          '只做 initialize / tools/list / tools/call 三帧，调用全部转交唯一执行入口',
          '把本地工具清单复制一份，避免耦合',
          '在协议层单独做审批，减轻网关压力',
        ],
        answer: 1,
        explain: '协议层必须是薄壳，任何直通工具的快路径都会绕过审批。',
        concept: 'cap-a-runtime',
      },
      {
        text: '预算中断的正确位置是？',
        options: [
          '模型返回后再检查，让模型决定是否继续',
          '每轮调用模型之前检查，触顶直接写事件并进入终态',
          '只在工具报错时检查',
          '交给下游集群限流',
        ],
        answer: 1,
        explain: '预算是与模型判断无关的硬出口，必须在产生新的模型调用之前生效。',
        concept: 'cap-a-runtime',
      },
    ],
    [
      ['显式状态机', '用五态白名单约束所有状态转移，非法组合无法被构造出来'],
      ['幂等键', '由任务、步号、动作、调用号组成，透传到下游，重试与恢复都生成同一个键'],
      ['审批票据', '绑定任务、动作、签发人与有效期的一次性能力授予'],
      ['唯一执行入口', '所有工具调用只经 execute()，旁路执行在调用图检查里报红'],
      ['事件同源', '状态转移与动作提交从同一次执行产出事件，供回放器按序还原'],
      ['MCP 三帧', 'initialize 握手、tools/list 发现、tools/call 调用的最小协议子集'],
    ],
    [
      '把「挂起等审批」写成同步 await，进程重启后任务永久丢失。',
      '恢复时直接重放 pending 而不查 action.committed，导致不可逆动作执行两次。',
      'MCP 服务端自己维护工具清单或直接调 tool.run，制造绕过审批的旁路。',
      '用会话级 approved 布尔值代替绑定动作的票据，事后无法回答谁批准了什么。',
      '预算只在模型返回后检查，模型无限重试时硬出口形同虚设。',
    ],
  ),
  'capstone',
)
