import { L, withKind } from '../../course-builders.ts'

export const L25 = withKind(
  L(
    'L25',
    5,
    '并发原语与 STM',
    3,
    ['L21'],
    ['stm'],
    [
      '实现并发原语与 STM 的最小事务程序',
      '写出两个并发写冲突的复现与 STM 解法',
      '跑通「事务要么全成要么全不改」的断言',
      '产出一份 Ref / Queue / STM 的选型对照',
    ],
    `
### 两笔并发转账把余额算少了一次

账户服务把「读余额 → 加钱 → 写回」写成三步普通代码，压测下两笔并发转账同时读到 100，各自算出 110 再写回，最终余额是 110 而不是 120。加锁之后问题消失了，但很快又出现超时堆积：锁的粒度覆盖了整个函数，连不相干的账户也被串行化。**问题不在「没加锁」，而在把「读-改-写」这个本该原子的事务拆成了三个可被别人插入的步骤**。STM 提供的是另一种思路：把一组读写记成事务，提交时若发现冲突就整体重来，要么全成要么全不改。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 为什么读-改-写必须原子，事务与锁各自的代价 | Fiber 调度（L20）、结构化并发（L21） |
| Ref / Queue / STM 分别在什么场景使用 | Stream 背压（L23）、Schedule 策略（L24） |
| 怎样用断言验证「要么全成要么全不改」 | 生产落地检查单（L26） |

### 三种并发原语的适用面

| 原语 | 解决什么 | 不适合什么 |
|---|---|---|
| Ref | 单个值的原子读写与更新 | 多个值需要一起保持一致 |
| Queue | 生产消费解耦、背压 | 需要跨多个状态做原子判断 |
| STM | 多个状态的一组读写整体提交 | 事务里有不可重放的外部副作用 |

最后一行是 STM 的硬边界：事务可能因为冲突被重试，所以里面**不能有发邮件、扣款、写文件这类不可重放的动作**。把外部副作用塞进事务，冲突重试一次就会发两封邮件。这条约束比任何 API 用法都重要。

### 真实写法

\`\`\` title="并发执行与事务边界" note="Effect.all 并发多个分支；STM 事务在 v4 通过 Effect.tx 表达，事务体只做可重放的状态读写。"
import { Effect } from "effect"

declare const readBalance: (id: string) => Effect.Effect<number>
declare const writeBalance: (id: string, n: number) => Effect.Effect<void>

const pair = Effect.all([readBalance("a"), readBalance("b")])
const transfer = Effect.gen(function* () {
  const [a, b] = yield* pair
  yield* writeBalance("a", a - 10)
  yield* writeBalance("b", b + 10)
})
\`\`\`

上面这段故意写成**非事务版**：两次读与两次写之间没有原子边界，正是开头事故的复现。真实代码要把这一组读写包进事务，让提交时统一检查冲突。

### 冲突复现、事务解法与断言

\`\`\` title="STM 事务的最小模型" note="自包含程序，只依赖 node:assert；复现丢失更新，再验证提交时冲突检测与整体重放。"
import assert from "node:assert/strict"

type Balances = Map<string, number>
type Journal = Array<{ id: string; before: number; after: number }>

// 错误版：读与写之间可被插入，两个事务互相覆盖
const unsafeTransfer = (
  b: Balances,
  from: string,
  to: string,
  amount: number,
  a: number,
  c: number,
): void => {
  b.set(from, a - amount)
  b.set(to, c + amount)
}

// 修订版：记录读到的版本，提交时若版本变了就整体重放
type Txn<A> = { run: (read: (id: string) => number, write: (id: string, n: number) => void) => A }
const commit = <A>(b: Balances, versions: Map<string, number>, txn: Txn<A>, journal: Journal): A => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const readVersion = new Map(versions)
    const staged = new Map<string, number>()
    const read = (id: string) => {
      readVersion.set(id, versions.get(id) ?? 0)
      return b.get(id)!
    }
    const write = (id: string, n: number) => staged.set(id, n)
    const value = txn.run(read, write)
    const conflicted = [...readVersion].some(([id, v]) => (versions.get(id) ?? 0) !== v)
    if (conflicted) continue
    for (const [id, n] of staged) {
      journal.push({ id, before: b.get(id)!, after: n })
      b.set(id, n)
      versions.set(id, (versions.get(id) ?? 0) + 1)
    }
    return value
  }
  throw new Error("transaction kept conflicting")
}

const initial = (): { b: Balances; v: Map<string, number> } => ({
  b: new Map([["a", 100], ["b", 100]]),
  v: new Map(),
})

const move = (from: string, to: string, amount: number): Txn<void> => ({
  run: (read, write) => {
    const a = read(from)
    const c = read(to)
    write(from, a - amount)
    write(to, c + amount)
  },
})

// 两个并发事务都基于同一份快照，各自算完再写回
const bad = initial()
const a0 = bad.b.get("a")!
const c0 = bad.b.get("b")!
unsafeTransfer(bad.b, "a", "b", 10, a0, c0)
unsafeTransfer(bad.b, "a", "b", 10, a0, c0)
assert.equal(bad.b.get("b"), 110, "错误版确实丢失了一次更新")
assert.equal(bad.b.get("a"), 90)

const good = initial()
const journal: Journal = []
commit(good.b, good.v, move("a", "b", 10), journal)
commit(good.b, good.v, move("a", "b", 10), journal)
assert.equal(good.b.get("a"), 80)
assert.equal(good.b.get("b"), 120, "两次转账都生效")
assert.equal(journal.length, 4, "每次提交写入两个账户，事务整体落盘")
assert.equal(good.b.get("a")! + good.b.get("b")!, 200, "总额守恒")

// 事务体不得包含不可重放的外部副作用
const sideEffects: string[] = []
const assertReplayable = (body: () => void): void => {
  const before = sideEffects.length
  body()
  body()
  assert.equal(sideEffects.length, before, "重放不得产生额外副作用")
}
assertReplayable(() => {})
// 冲突检测：读到版本后若版本被别的提交推进，必须判定冲突并重放
const versions = new Map([["a", 0]])
const readVersion = new Map([["a", 0]])
versions.set("a", 1)
const conflicted = [...readVersion].some(([id, v]) => (versions.get(id) ?? 0) !== v)
assert.equal(conflicted, true, "读到版本落后即判定冲突")
console.log("t1 通过：冲突可检测、事务整体提交、总额守恒、无外部副作用")
\`\`\`

\`t1\` 里 \`journal.length === 4\` 这条断言把「要么全成要么全不改」变成了可数的证据：每次事务要么写入两行，要么一行都不写。如果实现写成逐条落盘，中途失败就会留下半笔转账，这条断言立刻失败。

### 选型与排障

| 现象 | 先查哪里 | 判定 |
|---|---|---|
| 并发写后数值偏小 | 读-改-写有没有原子边界 | 总额守恒 |
| 加锁后吞吐骤降 | 锁粒度是否覆盖无关状态 | 按状态而不是按函数加锁 |
| 冲突后收到两封邮件 | 事务体里有没有外部副作用 | 重放次数不产生新副作用 |
| 偶发「提交失败」 | 冲突重试有没有上限 | 有界重试，不无限重放 |
| 单值更新也用 STM | 是否只需要 Ref | 别为简单场景引入事务开销 |

:::deep

### 为什么 STM 敢「重来一遍」

锁的思路是「不让别人插进来」，代价是串行化与死锁风险；STM 的思路是「允许并发地各算各的，提交时检查我读过的值有没有被改过」，没被改就提交，被改了就重算。它敢重来的前提有两条：**事务体是纯的状态读写**（所以重放安全），**读集合被完整记录**（所以冲突可被发现）。这两条也划出了能力边界：一旦事务里出现不可重放的外部动作，或者读了没被版本追踪的状态，重来就会造成副作用重复或漏判冲突。回头看 L01 的「同一蓝图可重复解释」，这里其实用上了同一个性质——事务体是一份可重新执行的描述，而不是一段已经发生的执行。**能被安全重放，才有资格被自动重试。**

:::

:::warn

### 三个并发写上的静默故障

第一件是把读-改-写拆成三步普通代码，开头的事故属于此类；单笔测试全绿，并发下才丢更新。第二件是在事务体里发通知、写日志到外部系统，冲突重试一次就产生两条记录，且这类重复往往要等到对账时才发现。第三件是用一把大锁包住整个函数「图省事」，功能正确了，但不相干的账户也被串行化，压测吞吐掉一个数量级。三者都不报编译错误。排查顺序固定：先验证总额守恒，再数每次提交的落盘行数，最后检查事务体里有没有不可重放的动作；t1 已经把这三条变成断言。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 错误版能复现丢失更新 | 回归集没覆盖并发交织 |
| 两次事务后总额守恒 | 读写之间有插入点 |
| 每次提交写入行数完整 | 出现半笔事务，状态不一致 |
| 重放不产生额外副作用 | 事务体含不可重放动作 |
| 冲突重试有上限 | 高冲突下无限重放，打满 CPU |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L21 结构化并发 | 多个 Fiber 怎么统一回收 | 并发分支内的状态一致性 |
| L22 中断与 Channel | 队列与两端 Fiber 的收尾 | 事务提交同样需要原子边界 |
| L26 渐进落地 | 老锁代码怎么逐步替换 | 总额守恒与无副作用重放两条验收 |

### 一次对账差异的排障回放

| 步骤 | 当时看到的现象 | 缺的是哪一层 |
|---|---|---|
| 看单笔测试 | 全部通过，余额正确 | 没有并发交织，看不出问题 |
| 看压测结果 | 两笔转账只生效一笔 | 读与写之间可被插入 |
| 想加分布式锁 | 功能对了，吞吐掉一个数量级 | 锁粒度覆盖无关状态 |
| 想拆细锁 | 多把锁又带来顺序与死锁问题 | 冲突判断散落在业务代码里 |
| 改成事务 + 版本检测 | 冲突时整体重放，总额守恒 | 原子边界由提交阶段统一保证 |

这张表最值得记住的是第三步：加锁确实能修好正确性，却把「保护一个账户」变成了「串行化整个函数」。**正确性与吞吐不是二选一，关键在于原子边界画在哪里**。事务把边界从「函数入口」移到「一组状态读写的提交点」，于是无关账户不必互相等待，冲突时才重算。

### 事务改造的六项评审清单

| 检查项 | 怎么看 | 漏掉后的表现 |
|---|---|---|
| 读集合是否被完整记录 | 少记一个状态就漏判冲突 | 偶发覆盖，难复现 |
| 事务体是否只有可重放的状态读写 | 有没有发通知、写外部系统 | 重放一次产生两条记录 |
| 冲突重试是否有上限 | 高冲突场景会不会一直重算 | CPU 打满，请求堆住 |
| 提交是否整体落盘 | 每次写入行数是否成对 | 留下半笔事务 |
| 总额是否守恒 | 两次并发转账后的合计 | 丢失更新 |
| 简单单值更新是否误用 STM | 只需要 Ref 的场景 | 无谓的事务开销 |

前三项管机制，后三项管验收。它们常被拆开测：单元测试验总额，压测验吞吐，通知重复却要等对账才发现。t1 把「错误版复现 + 修订版守恒 + 落盘行数 + 重放无副作用」放进同一个程序，就是为了让这四类断言一起跑。

### 与 L26 落地的接缝

| 本课交付 | 最后一课怎么用 | 不允许改什么 |
|---|---|---|
| 总额守恒与可重放断言 | 落地路线第 6 步的验收点 | 不在事务体里放外部副作用 |
| 「描述可重复解释」的另一处应用 | 与蓝图和策略并列复盘 | 不把事务体写成已发生的执行 |
| 冲突排障清单 | 回滚清单里的状态一致性检查 | 不用大锁掩盖边界问题 |
`,
    'concurrency',
    [
      {
        text: 'v4 中想读一个 Ref 的值，正确写法是？',
        options: ['yield* ref', 'yield* Ref.get(ref)', 'await ref', 'Ref.value(ref)'],
        answer: 1,
        explain: 'Fiber / Ref / Deferred 不再是 Effect，必须走对应的访问函数。',
        concept: 'stm',
      },
      {
        text: 'STM 主要解决？',
        options: ['更快的 JSON 解析', '多个状态引用的原子变更与冲突重试', '类型化错误', '日志格式化'],
        answer: 1,
        explain: '事务内存把加锁与回滚交给运行时，避免手写临界区出错。',
        concept: 'stm',
      },
    ],
    [
      ['Ref', 'fiber 安全的单值可变引用'],
      ['STM', '软件事务内存：一组读写作为原子事务执行'],
    ],
    ['用模块级 let 变量在并发 fiber 间共享状态，绕开原子性保证。'],
  ),
  'practice',
)
