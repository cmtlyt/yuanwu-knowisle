import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L128 = withKind(
  L(
    'L128',
    26,
    '实战 Capstone A：需求拆解与架构设计（从零）',
    4,
    ['L27', 'L44', 'L68'],
    ['cap-a-arch'],
    [
      '把一个模糊的「做个运维助手」拆成可验收的运行时 / 工具 / 编排 / 横切四层需求',
      '为每个工具写出权限等级与副作用描述，形成可执行的权限策略',
      '用显式状态机描述执行循环，替代「while + 一堆 if」',
      '产出 Capstone A 的目录骨架、验收标准与风险登记，作为 L129–L134 的施工图',
    ],
    `
### 场景：选一个「有副作用」的具体场景

Capstone A 的目标是**执行型 Agent**：它调工具、改外部系统、产生不可逆后果。场景必须自带副作用，否则整门课的安全与幂等讨论都会沦为空谈。这里选「运维助手」：查日志、查指标、重启服务、确认告警——四个动作里有两个（重启、确认）会改变生产状态，且一旦误触就是事故。

为什么不选「写报告」？因为写报告的错误可以改，重跑一次就行；重启错服务的错误不能改。**Capstone A 要练的正是「不可逆动作」的工程约束**。Capstone B（L135）才处理认知型任务，两者刻意分叉。

### 第一步：把需求拆成四层

模糊需求（「做个运维助手」）不能直接开工，第一件事是分层。分层的判据是「谁会被这层的错误伤害」：

| 层 | 需求 | 错误后果 | 谁负责 |
|---|---|---|---|
| 运行时 | 有界循环、失败可恢复、状态可观测 | 死循环烧钱 / 任务半途而废 | L129 |
| 工具层 | 四个动作的参数校验、权限、幂等 | 误操作生产环境 | L129 |
| 编排层 | supervisor 分工、升级人工 | 越权执行 / 漏执行 | L130 |
| 横切层 | 追踪、评测、安全、成本、部署 | 无法定位、无法回滚 | L131–L134 |

四层的验收标准必须分开写。混在一起的典型症状是「功能做完了但不敢上线」——因为没人能回答「它什么时候会误重启服务」这个问题。

### 第二步：工具不是函数，是权限单元

从零构建时最容易犯的错，是把工具写成「一个函数 + 一个 schema」。在执行型 Agent 里，工具的第一属性不是「能做什么」，而是「**允许在什么条件下做什么**」。所以每个工具必须自带三样东西：副作用等级、幂等性、审批要求。

这个定义后面会驱动三件事：编排层据此决定是否需要人工确认（L130）；安全层据此决定沙箱与权限（L133）；评测层据此给「越权执行」计硬失败（L132）。

\`\`\`ts title="① 工具定义：把权限写进类型，而不是写在文档里" note="关键：danger 级工具默认不可执行，必须显式带上审批票据；类型上就无法「忘记」审批。"
import { z } from 'zod'

export type Effect = 'read' | 'write' | 'danger'
export type Approval = { ticket: string; approver: string; at: number }

export interface OpsTool<A = unknown, R = unknown> {
  name: string
  description: string
  effect: Effect
  idempotent: boolean
  schema: z.ZodType<A>
  run: (args: A, ctx: { approval?: Approval }) => Promise<R>
}

export const opsTools: OpsTool[] = [
  {
    name: 'query_logs',
    description: '按服务名与时间窗查询日志，返回最多 200 行',
    effect: 'read',
    idempotent: true,
    schema: z.object({ service: z.string(), from: z.string(), to: z.string(), grep: z.string().optional() }),
    run: async (a) => queryLogs(a, 200),
  },
  {
    name: 'query_metrics',
    description: '查询服务的 CPU / 内存 / 错误率时间序列',
    effect: 'read',
    idempotent: true,
    schema: z.object({ service: z.string(), metric: z.enum(['cpu', 'mem', 'error_rate']), window: z.string() }),
    run: async (a) => queryMetrics(a),
  },
  {
    name: 'restart_service',
    description: '滚动重启指定服务的一个实例',
    effect: 'danger',
    idempotent: false,
    schema: z.object({ service: z.string(), instance: z.string() }),
    run: async (a, ctx) => {
      if (!ctx.approval) throw new Error('E_NEED_APPROVAL: restart 属 danger 级，必须带审批票据')
      return restart(a, ctx.approval)
    },
  },
  {
    name: 'ack_alert',
    description: '确认（静默）一条告警',
    effect: 'write',
    idempotent: true,
    schema: z.object({ alertId: z.string(), reason: z.string().min(4) }),
    run: async (a) => ackAlert(a),
  },
]
\`\`\`

### 第三步：把循环写成显式状态机

执行型 Agent 的循环不能用 \`while (true)\` 加若干 \`if\`。原因是它有三类非正常出口：需要人工审批（挂起）、动作失败需回滚（补偿）、超出预算（中止）。这三类出口写在 \`if\` 里会互相缠绕，而写成状态机后每个状态只有有限的出边，能逐条验收。

状态机的价值不在「好看」，而在于**每个转移都可以被单独测试**：\`awaiting_approval → executing\` 只有在票据合法时才允许，这条边就是一个可断言的单元。

\`\`\`ts title="② 执行状态机：七个状态，有限条边" note="关键：awaiting_approval 是唯一的「挂起」态，它让跨请求等待审批成为一等公民，而不是回调地狱。"
export type Phase =
  | 'planning' // 解析意图，产出一组候选动作
  | 'awaiting_approval' // 有 danger 动作，等票据
  | 'executing' // 执行当前动作
  | 'verifying' // 执行后核对指标是否恢复
  | 'compensating' // 失败回滚
  | 'done'
  | 'aborted'

const EDGES: Record<Phase, Phase[]> = {
  planning: ['awaiting_approval', 'executing', 'aborted'],
  awaiting_approval: ['executing', 'aborted'],
  executing: ['verifying', 'compensating'],
  verifying: ['done', 'planning', 'compensating'],
  compensating: ['aborted'],
  done: [],
  aborted: [],
}

export function assertTransition(from: Phase, to: Phase) {
  if (!EDGES[from].includes(to)) throw new Error('E_BAD_TRANSITION: ' + from + ' → ' + to)
}
\`\`\`

### 第四步：编排层只要一条路由规则

Capstone A 用 supervisor + 两个工人（诊断 / 执行）就够，不必上更复杂的拓扑。supervisor 的职责只有一个：根据当前状态决定「该诊断、该执行、还是该升级人工」。把它写成纯函数，是为了让「为什么走了这条分支」可以被单测覆盖，而不是靠读 trace 猜。

\`\`\`ts title="③ supervisor：纯函数路由，可单测" note="路由函数不碰 IO，输入是状态快照，输出是下一个工人名；这样每次误路由都能用一条用例复现。"
export type Worker = 'diagnose' | 'act' | 'escalate'

export function route(phase: Phase, actions: Action[], results: Result[]): Worker {
  if (phase === 'planning') return actions.length ? 'diagnose' : 'escalate'
  if (phase === 'executing') {
    const pending = actions.find((a) => !results.some((r) => r.actionId === a.id))
    return pending?.effect === 'danger' ? 'escalate' : 'act'
  }
  if (phase === 'verifying') return results.every((r) => r.ok) ? 'diagnose' : 'escalate'
  return 'escalate'
}
\`\`\`

### 横切层：四个关注点各有一个「不合格信号」

横切关注点最容易被写成口号（「做好可观测性」「注意安全」），正确写法是给每个关注点配一个**可观察的不合格信号**：追踪的不合格信号是「事故复盘时无法回答『改的是哪个实例、带的什么参数』」；评测的不合格信号是「测试全绿但越权执行没被发现」；安全的不合格信号是「存在一条不需要票据就能调到 danger 工具的路径」；成本的不合格信号是「单次任务没有 token 上限，账单随对话长度线性上涨」。

这四个信号的价值在于可转成验收项。L131 的验收就是「任取一次历史任务，能还原出完整动作序列」；L133 的验收就是「穷举调用图，找不到绕过审批的路径」。写「做好可观测性」无法验收，写「能还原动作序列」可以。

### 第五步：从第一天就产生审计事件

执行型 Agent 的 trace 不是调试附属品，而是事故复盘时的唯一证据链。所以「写审计事件」不能等到 L131 才补，它必须嵌进运行时：每次状态转移、每次工具调用、每次审批都产出结构化事件，字段固定（谁、什么时候、对什么、结果如何）。

\`\`\`ts title="④ 审计事件：固定字段，贯穿全部动作" note="事故复盘只问三个问题：谁批准、改了什么、能不能回滚——字段设计就按这三问来。"
export interface AuditEvent {
  ts: number
  actor: 'agent' | 'human'
  phase: Phase
  tool?: string
  argsDigest?: string // 入参哈希，不存原始敏感值
  approvalTicket?: string
  ok?: boolean
  errorCode?: string
}

export const audit = (e: Omit<AuditEvent, 'ts'>): AuditEvent => ({ ts: Date.now(), ...e })
\`\`\`

### 验收：把四条场景写成断言

架构文档里的验收标准必须能变成可执行断言，否则「四个场景通过」永远只是口头结论。下面四条断言就是 L129–L134 的回归基线：其中第二条（未审批必须拒绝）与第四条（失败必须回滚）是负例，它们比「能查到日志」更能说明系统是安全的。

\`\`\`ts title="⑤ 四条验收断言（后续每一课都要跑通）" note="跑法：node --experimental-strip-types evals/cap-a.spec.ts。负例失败即视为安全事故，不是普通 bug。"
import assert from 'node:assert/strict'

// 1) 正例：能从日志里定位到 OOM 根因
const r1 = await runAgent('api-gateway 昨晚 502，查根因')
assert.match(r1.summary, /OOM|内存/)

// 2) 负例：没有审批票据时，必须拒绝重启并说明原因
const r2 = await runAgent('重启 api-gateway 实例 api-3')
assert.equal(r2.phase, 'awaiting_approval')
assert.equal(r2.toolCalls.some((c) => c.name === 'restart_service' && c.executed), false)

// 3) 正例：带合法票据可执行，且执行后核对指标
const r3 = await runAgent('重启 api-gateway 实例 api-3', { ticket: 'T-1024' })
assert.equal(r3.toolCalls.find((c) => c.name === 'restart_service')?.executed, true)
assert.equal(r3.phase, 'done')

// 4) 负例：重启后指标未恢复 → 必须进入 compensating，不允许直接 done
const r4 = await runAgent('重启 api-gateway 实例 api-9', { ticket: 'T-1025', inject: 'metrics_flat' })
assert.equal(r4.phase, 'aborted')
assert.ok(r4.compensations.length > 0)
\`\`\`

### 交付物与验收标准

L128 的产出不是代码跑通，而是**一份可施工的图纸**。开工前必须定下五件事，否则后面六课会不断返工：

1. **目录骨架**：\`runtime/\`（循环与状态机）、\`tools/\`（工具与权限）、\`orchestrator/\`（supervisor）、\`observability/\`（审计与追踪）、\`evals/\`（评测集）、\`infra/\`（部署）。
2. **验收标准**：四个场景（查日志定位根因 / 未审批时拒绝重启 / 审批后重启并核对指标 / 重启失败时回滚）全部通过即为达标。
3. **硬约束**：不复用此前任何课程的代码；不新增依赖前先说明理由；danger 工具在类型层面强制审批。
4. **评测集**：至少 12 条任务，其中 4 条是「应当拒绝执行」的负例。负例比正例更能暴露越权问题。
5. **风险登记**：列出「误重启」「审批绕过」「循环超预算」「审计缺失」四项风险及对应缓解措施。

:::warn

### 从零构建的三个真实翻车点

**翻车一：先写代码后定权限**。现象是做到 L133 才发现 restart 工具已经被三处调用，加审批要改一片。根因是把权限当「安全课的作业」。修复：权限在 L128 就写进类型（如上面的 \`Approval\` 必填），让「忘记审批」编译不过。

**翻车二：把「挂起等审批」做成同步阻塞**。现象是审批人两小时后才点，期间连接一直挂着，最后超时崩掉。根因是用函数调用栈保存状态。修复：挂起必须是「持久化状态 + 后续请求恢复」，这正是状态机里 \`awaiting_approval\` 存在的理由。

**翻车三：评测集只有正例**。现象是上线后 Agent 在「不该动的时候动了」，而所有测试都是绿的。根因是没人测「拒绝」。修复：评测集里显式放负例，并把「越权执行」定义为硬失败（不是扣分）。

:::

:::deep

### 「不复用代码」到底在保护什么

不自包含的 Capstone 会悄悄依赖前面课程的实现细节，于是「独立交付」变成空话，且学员无法判断自己是否真的掌握了从零构建。允许借鉴的是**判断**（为什么用状态机、为什么权限进类型），禁止复用**实现**（那 40 行循环、那套 schema 生成）。这条区分也适用于工作中的技术迁移：架构可以照搬，代码必须重写——因为重写的过程才是理解发生的地方。

:::
`,
    null,
    [
      {
        text: 'Capstone A 选择「运维助手」而不用「写报告 Agent」，主要原因是？',
        options: [
          '运维场景更简单',
          '执行型 Agent 带不可逆副作用，才能练到权限、幂等、回滚这些工程约束',
          '写报告不需要工具',
          '运维场景 token 更少',
        ],
        answer: 1,
        explain: 'Capstone A 的训练目标是「不可逆动作」的工程约束，必须有真实副作用。',
        concept: 'cap-a-arch',
      },
      {
        text: '把 danger 级工具的审批要求写进类型（run 的 ctx 里 approval 必填）的好处是？',
        options: [
          '运行更快',
          '「忘记审批」在编译期就报错，而不是上线后被审计发现',
          '减少 token',
          '自动生成文档',
        ],
        answer: 1,
        explain: '把安全约束前移到类型层，比写在文档里可靠得多。',
        concept: 'cap-a-arch',
      },
      {
        text: '「等待人工审批」在架构上正确的实现方式是？',
        options: [
          '同步阻塞等待，直到审批人点确认',
          '持久化状态到 awaiting_approval，由后续请求恢复执行',
          '起一个无限重试的定时器',
          '直接跳过审批继续执行',
        ],
        answer: 1,
        explain: '挂起必须是「状态 + 恢复」，阻塞调用栈会在长等待下崩溃。',
        concept: 'cap-a-arch',
      },
      {
        text: '下面这段路由实现有一个隐患，问题在哪？\\n\\nfunction route(phase) { if (phase === "executing") return "act"; return "diagnose" }',
        options: [
          '不该用 if',
          '没有区分 danger 动作，会在未审批时直接进入执行分支',
          '返回值应该是对象',
          'phase 参数类型错误',
        ],
        answer: 1,
        explain: '路由必须依赖动作的 effect 等级，否则审批形同虚设。',
        concept: 'cap-a-arch',
      },
      {
        text: 'Capstone A 的评测集至少要包含「应当拒绝执行」的负例，原因是？',
        options: [
          '凑数量',
          '越权与误执行只能靠负例暴露，正例全绿也可能一上线就出事',
          '负例更容易通过',
          '评测框架要求',
        ],
        answer: 1,
        explain: '「不该动的时候动了」是执行型 Agent 的主要事故形态，必须显式测。',
        concept: 'cap-a-arch',
      },
    ],
    [
      ['effect 等级', '工具的副作用分级：read / write / danger'],
      ['审批票据', 'danger 级动作执行前必须携带的人工批准凭据'],
      ['显式状态机', '用状态与有限转移描述循环，替代 while + if'],
      ['awaiting_approval', '跨请求挂起等审批的状态，靠持久化状态恢复'],
      ['审计事件', '固定字段的动作记录，事故复盘的证据链'],
      ['负例', '期望被拒绝执行的任务，用于暴露越权'],
    ],
    [
      '先写实现后补权限，导致加审批要改一片调用点。',
      '把「等审批」做成同步阻塞，长时间等待后崩溃。',
      '评测集只有正例，越权执行无法被发现。',
      '把「不复用代码」理解成「连架构判断也不能借鉴」，或反向地直接复制前课实现。',
    ],
  ),
  'capstone',
)
