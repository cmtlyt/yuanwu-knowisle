import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 25 ========== */

export const L123 = withKind(
  L(
    'L123',
    25,
    '有状态会话的水平扩展',
    3,
    ['L53'],
    ['stateful-scaling'],
    [
      '实现会话状态外置、租约与乐观锁写入，让实例可以随意加减',
      '写出多实例并发下的请求处理器与一致性边界划分',
      '跑通「实例被杀、同一会话并发」两类验收断言',
    ],
    `
### 加了两台实例，会话上下文丢了一半

流量涨上来后给 Agent 服务从一台扩到三台，负载均衡按轮询分发。当天就出了两类工单：一类是「我上一句说的那个项目，你怎么不记得了」——同一个会话的连续两条消息落到了不同实例，各自的内存里只有半段历史；另一类更麻烦，用户双击发送产生了两个并发请求，两台实例各推进了一次同一会话，各自写回一份历史，后写的把先写的整段覆盖，模型随后开始自相矛盾。

复盘时大家先想到的是「加个粘性会话」。但那只是把问题推迟：滚动发布时实例会被替换、扩缩容时哈希环会变、实例崩溃后连接必然重连到别处，**粘性能保证的只是「正常情况下不搬」，保证不了「异常情况下不丢」**。水平扩展真正的约束是：实例必须可丢弃，因此会话状态必须住在实例之外，且同一时刻只允许一个写者推进它。

### 三种放法，差的不是性能是失效模式

| 方案 | 扩缩容 | 实例崩溃 | 同一会话并发 | 适用 |
|---|---|---|---|---|
| 进程内内存 | 直接丢状态 | 全丢 | 各写各的，互相覆盖 | 单机原型、本地调试 |
| 粘性会话 + 内存 | 哈希环变化时丢 | 丢该实例所有会话 | 同一实例内仍需自己加锁 | 临时过渡，别上生产 |
| **状态外置 + 租约** | 无影响 | 租约到期后可接管 | 租约保证单写者 | 生产默认 |

第三行的关键不在「存到 Redis」，而在**实例不持有权威状态**：每次请求都从共享存储读、推进、带版本写回。这样实例崩了只是少了一个无状态的计算单元，换一台接着跑即可。

:::deep
### 为什么「租约」比「分布式锁」更贴合 Agent 会话

会话推进有一个和传统交易很不一样的特点：**它可能很长**。一次工具调用、一次等待人工审批、一次模型慢响应，都可能让持有锁的时间从毫秒级涨到几十秒。用严格互斥锁，锁一旦因网络抖动没释放，整个会话要等超时才能恢复；用带过期的租约，实例崩溃后租约自然到期，别的实例可以接管，恢复时间是可配的、可预期的。

租约也不是万能的：如果原实例只是「卡住」而非死亡，租约过期后可能出现两个写者。所以还要配**版本号乐观锁**兜底——写回时带上读到的版本，版本不匹配就说明期间有人写过，本次作废重读。租约负责「通常只有一个写者」，乐观锁负责「万一有两个也不会静默覆盖」。两者是互补的两层，不能只留一层。
:::

### 状态外置：存储接口与租约

\`\`\`ts title="会话存储接口与租约实现" note="要点：key 必须含 tenantId；每次写入带 version 做乐观锁；租约用 SET NX PX 保证原子且可过期。"
type Turn = { role: 'user' | 'assistant' | 'tool'; content: string; at: number }

type SessionState = {
  tenantId: string
  sessionId: string
  version: number
  turns: Turn[]
  pendingApproval?: { id: string; expiresAt: number }
}

interface SessionStore {
  load(key: string): Promise<SessionState | null>
  compareAndSet(key: string, expected: number, next: SessionState): Promise<boolean>
  acquireLease(key: string, owner: string, ttlMs: number): Promise<boolean>
  releaseLease(key: string, owner: string): Promise<void>
}

const sessionKey = (tenantId: string, sessionId: string) =>
  'session:' + tenantId + ':' + sessionId

class RedisSessionStore implements SessionStore {
  constructor(private redis: RedisClient) {}

  async load(key: string) {
    const raw = await this.redis.get(key)
    return raw ? (JSON.parse(raw) as SessionState) : null
  }

  async compareAndSet(key: string, expected: number, next: SessionState) {
    // WATCH + MULTI：读到的版本没变才写，避免并发覆盖
    const ok = await this.redis.eval(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then '
      + 'redis.call("SET", KEYS[1], ARGV[2]); return 1 else return 0 end',
      [key], [String(expected)], JSON.stringify(next)
    )
    return ok === 1
  }

  async acquireLease(key: string, owner: string, ttlMs: number) {
    const r = await this.redis.set('lease:' + key, owner, { nx: true, px: ttlMs })
    return r === 'OK'
  }

  async releaseLease(key: string, owner: string) {
    // 只删自己的租约，避免误删已经续期给别人的那一把
    await this.redis.eval(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
      ['lease:' + key], [owner]
    )
  }
}
\`\`\`

\`compareAndSet\` 里的 \`expected\` 是读状态时的 \`version\`，不是时间戳；\`releaseLease\` 里那句「只删自己的」很容易被漏掉——若 A 的租约已过期、B 重新拿到，A 恢复后直接 \`DEL\` 会把 B 的锁删掉，第三个写者就进来了。

### 请求处理器：租约 → 读 → 推进 → 带版本写回

\`\`\`ts title="单写者请求处理器" note="要点：租约 + 乐观锁双保险；冲突重试有上限；finally 一定释放；拿不到租约不排队。"
const OWNER = process.env.INSTANCE_ID ?? 'local'
const LEASE_TTL = 15_000
const MAX_CAS_RETRY = 3

async function handleTurn(
  store: SessionStore, tenantId: string, sessionId: string, userText: string
): Promise<string> {
  const key = sessionKey(tenantId, sessionId)
  if (!(await store.acquireLease(key, OWNER, LEASE_TTL))) {
    return '这个会话正在处理上一条消息，请稍候'   // 不排队、不并发推进
  }
  try {
    for (let attempt = 0; attempt < MAX_CAS_RETRY; attempt++) {
      const state = (await store.load(key)) ?? {
        tenantId, sessionId, version: 0, turns: [],
      }
      const nextTurns: Turn[] = [
        ...state.turns,
        { role: 'user', content: userText, at: Date.now() },
      ]
      const reply = await runAgent(nextTurns)          // 无状态计算，任何实例都能跑
      nextTurns.push({ role: 'assistant', content: reply, at: Date.now() })
      const next: SessionState = { ...state, version: state.version + 1, turns: nextTurns }
      if (await store.compareAndSet(key, state.version, next)) return reply
      // 版本变了：说明期间有别的写者成功，重读再来
    }
    throw new Error('CAS retry exhausted: ' + key)
  } finally {
    await store.releaseLease(key, OWNER)
  }
}
\`\`\`

这里有两个刻意的选择。**拿不到租约时不排队**，直接给用户一句明确回复：让一个会话的两个请求排队，用户会以为第一条丢了而再发一条，越排越糟；明确的「正在处理」反而止住了重试。**重试有上限**，超过就把异常抛给上层走 L124 的降级，而不是无限自旋把 CPU 吃满。

### 一致性边界：不是所有状态都值得强一致

把每样东西都塞进 \`SessionState\` 会让它变成瓶颈。按「丢了会怎样」分三层：

| 状态 | 一致性要求 | 存放位置 | 丢了的后果 |
|---|---|---|---|
| 对话历史、待审批项、幂等键 | 强一致（版本乐观锁） | 共享存储，随会话推进 | 上下文断裂 / 重复执行工具 |
| 学情摘要、偏好、计数 | 最终一致即可 | 异步写，允许落后几秒 | 个性化晚一点生效 |
| 埋点、trace、用量统计 | 可丢 | 批量上报，不进关键路径 | 监控缺口，不影响会话 |

第二层允许异步，第三层允许丢——**把可丢的东西从关键路径上拿掉，是水平扩展里最有效的一步优化**。注意幂等键属于第一层：工具调用可能因重试被执行两次，幂等键必须与会话历史一起原子写入，否则「状态对了、副作用重复了」依然算事故（L70 的冲突与一致性在这里落到具体存储）。

:::warn
### 两个必踩的坑

- **只靠负载均衡粘性**。扩缩容、滚动发布、实例崩溃三种情况下粘性必然失效，而它们恰恰是最需要状态不丢的时刻。粘性可以做性能优化，不能做正确性保证。
- **乐观锁冲突后无限重试**。冲突通常意味着「有别的写者在推进」，此时重读是必要的，但要有上限并配合退避；无限重试在热点会话上会形成活锁，把共享存储打满（L92 的重试放大是同一个机制）。
:::

### 状态会长大：快照、检查点与冷归档

状态外置之后会冒出下一个问题：会话历史是**只增不减**的。一个跑了两百轮的客服会话，每次 \`load\` 都要反序列化整段历史，每轮请求还要把它全量带进模型；共享存储的网络往返与 token 成本一起线性上涨。这时水平扩展做得再漂亮，单会话延迟也压不下来。

分层处置和前面「按丢了会怎样」是同一套思路：热历史只保留最近 N 轮（强一致、每次读写都带），更早的轮次滚动压成一个**带版本的检查点摘要**，原始逐轮记录异步归档到冷存储。关键判据有两条：第一，**未决的待审批项与幂等键绝不能进摘要**，它们必须留在热状态里，否则一次审批等待后就再也找不到该批准什么；第二，摘要不能删除原始历史，L74 的回放调试需要逐轮原文，把摘要当存档会让事故复盘失去证据。

\`\`\`ts title="热状态与冷归档的边界" note="要点：摘要只压「已完成的对话轮次」，不碰待审批项与幂等键；原始历史异步归档。"
async function compactIfNeeded(key: string, state: SessionState): Promise<SessionState> {
  if (state.turns.length <= 40) return state
  const cold = state.turns.slice(0, state.turns.length - 20)
  await archive.append(key, { version: state.version, turns: cold }) // 异步，不在关键路径
  const summary = await summarize(cold)      // 滚动摘要，带 version 便于追溯
  return {
    ...state,
    version: state.version + 1,
    turns: [{ role: 'tool', content: '历史摘要: ' + summary, at: Date.now() },
      ...state.turns.slice(-20)],
    // pendingApproval / 幂等键原样保留，不参与压缩
  }
}
\`\`\`

这里要特意和 L91 的上下文裁剪划清界限：**裁剪决定「这一轮不喂给模型什么」，归档决定「存储层不常驻什么」**，一个在 prompt 层、一个在状态层，谁也替代不了谁。只做裁剪不做归档，存储照样膨胀；只做归档不做裁剪，token 照样涨。两者都做，才算把长会话的成本管住。

### 验收：把「实例可丢弃」写成断言

\`\`\`ts title="多实例并发与故障转移回归" note="要点：断言历史条数、无重复写入、崩溃可接管、租户隔离四项。"
async function runScalingCase(store: SessionStore) {
  // ① 同一会话 10 个并发请求，模拟用户连点 / 多实例同时推进
  const reqs = Array.from({ length: 10 }, (_, i) => handleTurn(store, 't1', 's1', 'msg-' + i))
  await Promise.allSettled(reqs)
  const final = await store.load(sessionKey('t1', 's1'))
  assert.ok(final, '会话状态不能丢')
  assert.ok(final.turns.length >= 2 && final.turns.length <= 20, '历史条数异常')
  assert.equal(new Set(final.turns.map((t) => t.content)).size, final.turns.length, '出现重复写入')

  // ② 模拟实例崩溃：租约过期后另一实例可接管
  await store.acquireLease(sessionKey('t1', 's1'), 'dead-instance', 50)
  await new Promise((r) => setTimeout(r, 80))
  assert.ok(await store.acquireLease(sessionKey('t1', 's1'), 'fresh-instance', 15_000))

  // ③ 租户隔离：不同 tenantId 的会话 key 不相交
  assert.notEqual(sessionKey('t1', 's1'), sessionKey('t2', 's1'))
}
\`\`\`

这三条断言分别盯住并发覆盖、故障转移、租户隔离（L87）。用内存版 \`SessionStore\` 就能跑，不必起真 Redis，因而能进 CI；真集群下的网络分区只做人工演练记录，不写成硬断言——和 L82 的分层是同一个道理。

### 与相邻课的分工

- **L53**：持久化与隐私，讲「存什么、存多久」；本课讲「多实例下怎么读写才不覆盖」。
- **L70**：冲突与一致性的一般原则，本课把它落成 \`version\` + \`compareAndSet\` + 租约。
- **L87**：多租户隔离，本课的 \`tenantId\` 进 key 是它的最小实现。
- **L92**：有界并发与重试放大，本课的 \`MAX_CAS_RETRY\` 与「拿不到租约不排队」直接复用其结论。
- **L124 / L127**：降级与部署实战，本课提供它们依赖的「实例可丢弃」前提。

**一句话收束**：水平扩展的前提不是「加机器」，是**实例不持有权威状态、同一会话同一时刻只有一个写者**。
`,
    null,
    [
      {
        text: '加实例后同一会话上下文丢了一半，最不该采用的修法是？',
        options: ['会话状态外置到共享存储', '只加负载均衡粘性会话', '引入租约保证单写者', '写入带版本乐观锁'],
        answer: 1,
        explain: '粘性在扩缩容、滚动发布、实例崩溃时必然失效，只能做性能优化。',
        concept: 'stateful-scaling',
      },
      {
        text: '租约与乐观锁为什么必须同时存在？',
        options: [
          '为了更快',
          '租约管「通常单写者」，乐观锁管「万一有两个也不静默覆盖」',
          '一个读一个写',
          '为了省内存',
        ],
        answer: 1,
        explain: '长任务里租约会过期，两个写者可能出现，版本校验是最后一道。',
        concept: 'stateful-scaling',
      },
      {
        text: '学情摘要、埋点这类状态应该怎么放？',
        options: [
          '全部强一致写进 SessionState',
          '最终一致异步写 / 可丢，从关键路径拿掉',
          '放实例内存',
          '不存',
        ],
        answer: 1,
        explain: '按「丢了会怎样」分层，可丢的不进关键路径是最有效的扩展优化。',
        concept: 'stateful-scaling',
      },
    ],
    [
      ['状态外置', '实例不持有权威状态，每次请求从共享存储读改写'],
      ['租约（lease）', '带过期时间的会话所有权，实例崩溃后可被接管'],
      ['乐观锁', '写回时带读到的 version，不匹配则作废重读'],
    ],
    [
      '只靠粘性会话做正确性保证，滚动发布和实例崩溃时状态必丢。',
      'CAS 冲突后无限重试，热点会话会形成活锁并打满共享存储。',
    ],
  ),
  'scenario',
)
