import { L, withKind } from '../../course-builders.ts'

export const L22 = withKind(
  L(
    'L22',
    4,
    '中断语义与 Channel',
    5,
    ['L21'],
    ['concurrency', 'channel'],
    [
      '实现中断语义与 Channel 的生产消费程序',
      '写出中断时 finalizer 与队列清理的对照断言',
      '跑通「消费者中断后生产者不再堆积」的验证',
      '产出一份中断竞态排查清单',
    ],
    `
### 消费者被取消后，队列涨到了几十万条

导出接口被用户取消后，前端不再收数据，后端却还在往内存队列里塞结果，十分钟后 OOM。代码里确实处理了「取消」：消费者收到中断就退出了。但生产者是独立启动的，没人告诉它该停；队列是共享的可变状态，也没人在作用域关闭时清空。**中断不是一个布尔标志，而是一次需要沿整条数据链传播的收尾动作**。Channel 这一层把「谁在等、谁在写、队列归谁管」变成显式结构，正是为了让取消能一路传到生产端。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 中断有哪几种来源、各自要求什么样的收尾 | Fiber 状态与归属（L18）、父子 Fiber 树（L21） |
| 生产 / 消费链在中断时怎么停、队列怎么清 | Stream 背压与调度（L23）、Fiber 调度公平性（L20） |
| 怎样用断言验证「消费者中断后生产者不再堆积」 | 生产环境的配额与负载调优（L26） |

### 三种中断来源与对应收尾

| 来源 | 触发条件 | 必须做的收尾 |
|---|---|---|
| 父级结束 | 父作用域关闭 | 级联中断所有子任务（L21） |
| 外部取消 | 用户取消、请求断开 | 停止生产者、清空队列、关闭消费者 |
| 超时 / 失败 | 任一分支失败 | 与父级结束同一套关闭动作 |

三行里第二行最容易漏：外部取消往往只被「离用户最近的那一层」感知到，生产端在另一条 Fiber 上，二者之间没有天然的传播路径。把它补上不靠加标志位，而靠**让队列与两条 Fiber 属于同一个作用域**——关闭时统一执行登记的清理动作。

### 真实写法

\`\`\` title="中断时的额外动作与有界消费" note="Effect.onInterrupt 声明中断回调；Stream.take 给消费端一个明确上界。"
import { Effect, Stream } from "effect"

declare const source: Stream.Stream<number>

const bounded = Stream.take(source, 100)
const withCleanup = Effect.onInterrupt(
  Stream.runCollect(bounded),
  () => Effect.log("consumer interrupted, drain queue"),
)
const main = Effect.scoped(withCleanup)
\`\`\`

Channel 的具体 API 在不同小版本里形状变化较多，本课刻意用**自包含的有界队列模型**来讲语义，不把示例绑死在某个具体签名上；生产代码按 META 锁定的 4.1.4 文档选 Channel 构造子即可，语义不变：\`take\` 给上界、\`onInterrupt\` 给收尾、\`scoped\` 给边界。

### 有界队列与中断清理断言

\`\`\` title="生产消费链与中断收尾" note="自包含程序，只依赖 node:assert；验证上界、背压、中断后生产者停写且队列清空。"
import assert from "node:assert/strict"

type Queue = { items: number[]; capacity: number; closed: boolean; produced: number }
const queue = (capacity: number): Queue => ({ items: [], capacity, closed: false, produced: 0 })

const offer = (q: Queue, v: number): boolean => {
  if (q.closed) return false
  if (q.items.length >= q.capacity) return false // 背压：满了就不写
  q.items.push(v)
  q.produced += 1
  return true
}
const poll = (q: Queue): number | undefined => q.items.shift()

const producer = (q: Queue, count: number): { written: number; blocked: number } => {
  let written = 0
  let blocked = 0
  for (let i = 0; i < count; i += 1) {
    if (q.closed) break
    if (offer(q, i)) written += 1
    else blocked += 1
  }
  return { written, blocked }
}
const interrupt = (q: Queue): number => {
  q.closed = true
  const drained = q.items.length
  q.items.length = 0
  return drained
}

const q = queue(4)
assert.equal(poll(q), undefined, "空队列不产出")
const first = producer(q, 10)
assert.equal(first.written, 4, "有界队列阻止无限堆积")
assert.equal(first.blocked, 6, "写不进去的计入背压而不是丢给别处")
assert.equal(q.items.length, 4)

assert.equal(poll(q), 0, "先进先出")
const beforeInterrupt = q.produced
const drained = interrupt(q)
assert.equal(drained, 3, "中断时清空剩余元素")
assert.equal(q.closed, true)

const after = producer(q, 10)
assert.equal(after.written, 0, "中断后生产者不再写入")
assert.equal(q.produced, beforeInterrupt, "生产计数不再增长")
assert.equal(q.items.length, 0, "队列不残留")
console.log("t1 通过：有界、背压、中断停写与清空")
\`\`\`

\`\`\` title="关闭顺序的断言" note="自包含程序；先置 closed 再记录损失、最后清空，确保没有写入漏过取消点。"
import assert from "node:assert/strict"

type State = { closed: boolean; items: number[]; drained: number }

const shutdown = (s: State): void => {
  s.closed = true
  s.drained = s.items.length
  s.items.length = 0
}
const write = (s: State, v: number): boolean => {
  if (s.closed) return false
  s.items.push(v)
  return true
}

const s: State = { closed: false, items: [1, 2], drained: 0 }
shutdown(s)
assert.equal(write(s, 3), false, "关闭后写入必须被拒绝")
assert.equal(s.drained, 2, "丢弃数量必须可观测")
assert.equal(s.items.length, 0)
console.log("t2 通过：关闭顺序无漏写、损失可观测")
\`\`\`

\`t1\` 里 \`beforeInterrupt\` 这条断言是开头事故的直接对应：取消之后再看 \`produced\`，它必须不再增长。只断言「消费者退出了」是不够的——消费者退出恰恰是 OOM 的起点，因为没人再取数据，而生产者还在写。

### 中断竞态排障清单

| 现象 | 先查哪里 | 判定 |
|---|---|---|
| 取消后内存持续上涨 | 生产者是否收到关闭信号 | produced 计数停止 |
| 取消后仍有一条写入 | offer 是否检查 closed | 关闭后返回 false |
| 偶发「队列已关闭」 | 关闭与写入的顺序 | 先置 closed 再清空 |
| 元素丢失 | 清空前有没有消费完待处理项 |  drained 可被记录并上报 |
| 测试全绿但生产 OOM | 测试是否只验消费者退出 | 必须验 produced 与队列长度 |

:::deep

### 为什么「取消」必须是一条传播链而不是一个标志

把取消实现成一个共享布尔值，在单生产单消费的 demo 里够用；但真实链路里往往有多个生产者、中间缓冲区、若干消费者，标志位只能让「看得到它的人」停下，看不到的人继续写。更麻烦的是顺序：先置标志再清空队列，还是先清空再置标志，会决定有没有一条写入漏过去。结构化中断把它变成一次沿作用域传播的动作——关闭是单一事件，登记过的清理动作按逆序执行，队列与两端 Fiber 同属一个边界，于是「谁先停、谁后清」不再由各任务自己决定。这与 L16 的 finalizer、L21 的级联中断是同一套机制在三种对象上的表现：资源、计算、数据流。**能统一收尾的前提，是它们从一开始就属于同一个可关闭的容器。**

:::

:::warn

### 三个中断路径上的静默故障

第一件是只取消消费者、不通知生产者，开头的事故属于此类；症状是接口已返回、内存还在涨。第二件是在 \`onInterrupt\` 回调里又启动了一个新任务去「补完剩余数据」，这个任务挂在即将关闭的作用域之外，成为谁也收不到的孤儿，数据重复处理。第三件是清空队列时不记录丢弃数量，事后无法判断这次取消到底损失了多少条，监控里只剩一次「正常取消」。三者都不报编译错误，且都只在取消 / 缩容路径出现。纠偏顺序固定：先把生产与消费放进同一作用域，再确保关闭后 \`offer\` 一律拒绝，最后把 \`drained\` 写进可观测数据；t1 的后四条断言正好覆盖这三步。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 队列有上界且写满返回 false | 背压失效，内存无限增长 |
| 中断后 produced 计数不再增长 | 生产者没收到关闭信号 |
| 关闭后 offer 一律拒绝 | 有一条写入漏过取消点 |
| 队列清空且长度归零 | 残留元素被后续任务误消费 |
| 丢弃数量可被记录 | 取消造成的损失不可观测 |

### 与 S5 的分工

| 上游交付 | 下游怎么用 | 不允许改什么 |
|---|---|---|
| 单一关闭动作与逆序清理 | L23 的 Stream 背压管线 | 不在回调里另起脱离作用域的任务 |
| 「produced 停止」验收点 | L26 的生产落地检查单 | 不只验消费者退出 |
| 中断竞态排障清单 | L21 的结构化并发回归 | 不把「能取消」当成「收尾干净」 |

### S4 五课复盘：同一套关闭动作的三个对象

| 对象 | 对应的课 | 关闭时要做的事 | 共用的判据 |
|---|---|---|---|
| 资源 | L16 Scope | 逆序执行 finalizer | 没有未释放的实例 |
| 计算 | L21 结构化并发 | 级联中断子 Fiber | 没有 running 残留 |
| 数据流 | L22 中断与 Channel | 停生产者、清队列、记录损失 | produced 不再增长 |

三行看起来是三个主题，实际是同一句话的三次复述：**运行时只能统一关闭它看得见、且归属于同一容器的东西**。资源靠登记、计算靠父子归属、数据流靠共享作用域；少任何一层，关闭动作就会漏掉一半。这也是 S4 整段最值得带走的判据——不要问「这里有没有处理取消」，要问「它属不属于那个会被关闭的容器」。

### 与 S5 的接缝

| S4 交付 | S5 怎么用 | 不允许改什么 |
|---|---|---|
| 单一关闭动作与逆序清理 | L23 的 Stream 背压管线 | 不在回调里另起脱离作用域的任务 |
| 「produced 停止」验收点 | L26 的生产落地检查单 | 不只验消费者退出 |
| 中断竞态排障清单 | L25 的 STM 事务冲突处理 | 不把「能取消」当成「收尾干净」 |

S4 到这里收口：Fiber、runLoop、Scheduler、结构化并发、中断五件事都回到同一个问题——运行时能不能看见并统一关闭它启动的一切。S5 转向把这套能力用到流、策略与真实项目落地。
`,
    'concurrency',
    [
      {
        text: '父 fiber 被中断时，用 Effect.forkChild 派生的子 fiber 会？',
        options: [
          '继续跑到自然完成',
          '被一并中断，且其 Scope finalizer 仍会执行',
          '抛出未捕获异常',
          '自动重启',
        ],
        answer: 1,
        explain: '结构化中断向下传播；forkDetach 的 daemon 才不受父中断影响。finalizer 保证资源收尾。',
        concept: 'concurrency',
      },
      {
        text: '需要「请求—响应」式来回通信（可写可读、有界缓冲）时，比 Stream 更合适的是？',
        options: ['Effect.all', 'Channel（双向、可交互）', 'Ref', 'Effect.map'],
        answer: 1,
        explain: 'Stream 单向只读；Channel 是双向通信原语，底层与 Stream 共用同一套读/写/结束状态机。',
        concept: 'channel',
      },
      {
        text: '关闭一个 Channel 时，仍阻塞在 read 上的 fiber 会？',
        options: ['永远卡住', '被正常结束并触发收尾，不泄漏', '抛 JS 异常', '自动重开'],
        answer: 1,
        explain: 'Channel 的「结束」是显式事件：读端在关闭时会收到结束而非永久阻塞，资源随 Scope 回收。',
        concept: 'channel',
      },
    ],
    [
      ['Interrupt 传播', '中断沿 fiber 树向下，未 detach 的子任务被一并取消'],
      ['Channel', '双向可交互通信原语，与 Stream 共用读/写/结束状态机'],
    ],
    [
      '把 Channel 的有界缓冲当无界用，写满后阻塞生产者造成隐性背压。',
      '用 forkDetach 起后台任务却忘记在退出前显式关闭，daemon 泄漏。',
    ],
  ),
  'practice',
)
