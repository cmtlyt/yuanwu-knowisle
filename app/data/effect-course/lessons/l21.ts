import { L, withKind } from '../../course-builders.ts'

export const L21 = withKind(
  L(
    'L21',
    4,
    '★ 结构化并发与异步中断',
    5,
    ['L16', 'L18'],
    ['concurrency'],
    [
      '实现结构化并发的父子 Fiber 树与统一中断',
      '写出「任一子任务失败，其余全部回收」的验收程序',
      '跑通 forkScoped 在 Scope 关闭时自动中断的断言',
      '改造一段泄漏后台任务的代码',
    ],
    `
### 一个失败分支把后台任务留在了线上

批量接口用 \`Promise.all\` 并发三个子任务，其中一个失败后接口立刻返回 500，日志看起来很干净。但十分钟后监控显示数据库连接数没回落，还有任务在往里写数据。原因是**失败只让 Promise.all 的聚合失败，没有让另外两个已经启动的任务停止**：它们继续在后台跑，谁也不持有它们的句柄。这类泄漏在测试里几乎测不到——测试进程结束得快，后台任务恰好也跑完了。结构化并发要解决的正是这件事：并发不是「同时启动几个任务」，而是「让它们属于同一棵可整体关闭的树」。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 父子 Fiber 树怎么建、失败与中断怎么级联 | Fiber 保存什么（L18）、runLoop 怎么推进（L19）、调度公平性（L20） |
| 怎样把泄漏后台任务的代码改造成可统一回收的形式 | Channel 的生产消费与队列清理（L22） |
| 如何用断言证明「任一失败，其余全部回收」 | 生产环境的配额与负载调优（L26） |

### 两种并发模型

| 维度 | Promise.all | 结构化并发 |
|---|---|---|
| 子任务归属 | 无显式父子关系 | 挂在父 Fiber / 父 Scope 上 |
| 一个失败时 | 聚合 Promise 失败，其余继续跑 | 父级结束，级联中断所有子任务 |
| 取消入口 | 需要在每个任务里自己传 AbortSignal | 统一由父级关闭作用域 |
| 资源回收 | 靠各任务自己的 finally | 作用域统一逆序关闭 |
| 测试可观察性 | 后台任务是否还在跑，难以断言 | 可以断言子 Fiber 状态 |

第二行是开头事故的全部原因。补一句 \`try/finally\` 只能修「自己走到结尾」的路径，补不出「父级替你结束」的能力——那是 L16 讲过的同一个盲区，只是从资源换成了任务。

### 真实写法

\`\`\` title="把并发装进作用域" note="Effect.all 并发执行；Effect.scoped 让所有 forkScoped 子任务随作用域一起关闭。"
import { Effect, Fiber } from "effect"

declare const fetchA: Effect.Effect<string, Error>
declare const fetchB: Effect.Effect<string, Error>

const program = Effect.scoped(
  Effect.gen(function* () {
    const a = yield* Effect.forkScoped(fetchA)
    const b = yield* Effect.forkScoped(fetchB)
    const results = yield* Effect.all([Fiber.join(a), Fiber.join(b)])
    return results
  }),
)
\`\`\`

\`scoped\` 是这层的关键：无论中间哪一步失败、或者父级被外部中断，退出作用域时两个子 Fiber 都会被中断，不会留下后台任务。\`forkScoped\` 的生命周期归属（L18 表格第二行）在这里第一次产生实际价值。

### 父子 Fiber 树与级联中断断言

\`\`\` title="结构化并发的最小模型" note="自包含程序，只依赖 node:assert；验证任一失败时其余子任务全部回收、资源逆序释放。"
import assert from "node:assert/strict"

type Child = { id: number; parent: number; state: "running" | "done" | "interrupted" }
type Scope = { children: Child[]; finalizers: Array<() => void>; closed: boolean }

const newScope = (): Scope => ({ children: [], finalizers: [], closed: false })
const forkScoped = (scope: Scope, parent: number): Child => {
  const c: Child = { id: scope.children.length + 1, parent, state: "running" }
  scope.children.push(c)
  scope.finalizers.push(() => {
    if (c.state === "running") c.state = "interrupted"
  })
  return c
}
const close = (scope: Scope): void => {
  if (scope.closed) return
  scope.closed = true
  scope.finalizers.slice().reverse().forEach((f) => f())
}

const events: string[] = []
const runAll = (scope: Scope, failAt: number): { ok: boolean; reason: string } => {
  const parent = 0
  const children = [forkScoped(scope, parent), forkScoped(scope, parent), forkScoped(scope, parent)]
  for (const c of children) if (c.id === failAt) c.state = "interrupted"
  const failed = children.some((c) => c.id === failAt)
  if (!failed) for (const c of children) c.state = "done"
  close(scope)
  events.push(...children.map((c) => c.id + ":" + c.state))
  return failed
    ? { ok: false, reason: "child " + failAt + " failed" }
    : { ok: true, reason: "all succeeded" }
}

const failed = newScope()
assert.deepEqual(runAll(failed, 2), { ok: false, reason: "child 2 failed" })
assert.ok(failed.closed, "父级必须关闭作用域")
assert.ok(failed.children.every((c) => c.state !== "running"), "任一失败，其余全部回收")
assert.ok(failed.children.every((c) => c.parent === 0), "所有子任务挂在同一父级")

const okScope = newScope()
assert.equal(runAll(okScope, 0).ok, true)
assert.ok(okScope.children.every((c) => c.state === "done"), "成功路径所有子任务都完成")

// 重复关闭幂等
close(failed)
assert.equal(failed.closed, true)
console.log("t1 通过：级联中断、归属唯一、关闭幂等")
\`\`\`

\`t1\` 里最容易写错的一点是：把「失败」直接建模成 \`return\`，而不关闭作用域。那样断言看起来也过（函数确实提前返回了），但后台任务状态仍是 running。所以第二条与第三条断言必须一起写：**既要返回失败，也要能证明没有 running 的子任务**。

### 从泄漏版本改造过来

\`\`\` title="Promise.all 泄漏改造" note="自包含程序；改造前后用同一组任务，差别只在有无统一作用域。"
import assert from "node:assert/strict"

type Job = { id: number; state: "pending" | "running" | "done" | "interrupted" }
const jobs = (): Job[] => [
  { id: 1, state: "pending" },
  { id: 2, state: "pending" },
  { id: 3, state: "pending" },
]

// 改造前：一个失败就直接返回，其余任务没人管
const before = (): Job[] => {
  const list = jobs()
  list.forEach((j) => (j.state = "running"))
  list[1]!.state = "done"
  return list // 失败已返回，但 1 / 3 仍是 running
}
assert.equal(before().filter((j) => j.state === "running").length, 2, "确实泄漏了两个后台任务")

// 改造后：退出前统一中断所有未完成任务
const after = (): Job[] => {
  const list = jobs()
  list.forEach((j) => (j.state = "running"))
  try {
    list[1]!.state = "done"
    throw new Error("child 2 failed")
  } catch {
    for (const j of list) if (j.state === "running") j.state = "interrupted"
    return list
  }
}
const cleaned = after()
assert.equal(cleaned.filter((j) => j.state === "running").length, 0, "退出前必须清空 running")
assert.equal(cleaned.filter((j) => j.state === "interrupted").length, 2)
console.log("t2 通过：改造后无后台残留")
\`\`\`

### 排障清单

| 现象 | 先查哪里 | 判定 |
|---|---|---|
| 接口已返回但连接数不降 | 子任务是否挂在父 Scope | 所有子任务都有 parent |
| 失败后仍有写入 | 失败路径有没有关闭作用域 | 无 running 残留 |
| 缩容时丢任务 | 是否用了 forkDetach | 只在明确场景出现 |
| 偶发资源已关闭 | 作用域是否提前关闭 | scoped 包在最外层 |
| 测试全绿但生产泄漏 | 测试是否只验返回值 | 必须断言子任务状态 |

:::deep

### 并发的「结构」到底指什么

通常说并发，想到的是同时跑几个任务；结构化并发多出来的那层意思是：**任务的生命周期必须嵌在一个可以被整体关闭的边界里**。这跟 L16 的作用域是同一套思路，只是对象从资源变成了计算。有了这个边界，失败、取消、超时都不再是「某个任务自己决定怎么处理」，而是父级的单一动作——关闭。好处在排查时最明显：不需要逐个任务问「它有没有处理取消」，只要确认它挂在同一棵树上。反过来说，任何脱离这棵树的任务（forkDetach、在回调里另起 Promise、跨作用域保存句柄）都会让这个推理失效。所以「结构」不是图画得好看，而是**让回收成为一个可证明的全局性质**。

:::

:::warn

### 三个让回收失效的写法

第一件是用 \`Promise.all\` 起任务却不给每个任务传取消信号，开头的事故属于此类；症状是接口已失败、后台还在写。第二件是把 \`scoped\` 放在中间分支，父作用域关闭时还有别的分支在用子任务，出现「连接已关闭」这类看似随机的错误。第三件是测试只断言接口返回值，不断言子任务状态，于是泄漏版本与正确版本都能通过 CI——t2 的改造前断言就是为揭穿这一点准备的。三者都不报编译错误，且都在失败路径或缩容时显现。纠偏顺序固定：先确认父子归属，再确认关闭动作覆盖所有退出路径，最后把「无 running 残留」写进回归集。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 任一子任务失败后无 running 残留 | 后台任务泄漏 |
| 所有子任务挂在同一父级 | 无法统一回收 |
| 关闭动作幂等 | 二次关闭掩盖原始失败 |
| 资源按逆序释放 | 依赖倒置，可能死锁 |
| 改造前有可复现的泄漏 | 回归集只测了正确路径 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L18 / L20 | Fiber 状态与调度公平性 | 可级联关闭的父子 Fiber 树 |
| L22 Channel | 中断时队列与生产者怎么清理 | 「无 running 残留」这条验收点 |
| L17 资源竞争 | 装配层的单例与逆序释放 | 同一套作用域机制，对象换成计算 |

### 一次「接口已返回、连接数不降」的排障回放

| 步骤 | 当时看到的现象 | 缺的是哪一层 |
|---|---|---|
| 看接口日志 | 500 已返回，耗时正常 | 只记录了聚合结果，没记录子任务 |
| 看数据库 | 仍有写入，连接未释放 | 失败分支没有关闭父作用域 |
| 想手工取消 | 找不到可中断的句柄 | 子任务是裸 Promise，没有父子归属 |
| 想加 finally | 只覆盖自己走到结尾的路径 | 中断不走业务函数的 finally |
| 改成 forkScoped + scoped | 退出时全部子任务被中断 | 回收成为父级的单一动作 |

这张表按倒序读最有价值：最后一步能一次修好，是因为「回收」不再由每个子任务自己负责；前四步耗掉的时间，都花在试图给一个没有结构的并发集合补取消逻辑。**并发泄漏的根因几乎从来不是某个任务忘了写 finally，而是这些任务根本不属于同一棵可关闭的树。** 把这条写进评审清单，比逐段代码检查「有没有处理取消」有效得多。

### S4 前半段复盘

| 课 | 交付了什么 | 到本课怎么被用上 |
|---|---|---|
| L18 Fiber | 可挂起的计算状态与四种 fork 归属 | forkScoped 让子任务挂在 Scope 上 |
| L19 runLoop | 堆上的 continuation 与让出点 | 中断能被运行时插进指令流 |
| L20 Scheduler | 配额与公平性兜底 | 关闭动作能在让出点被调度执行 |
| L21 结构化并发 | 父子 Fiber 树与级联中断 | 失败、取消、超时共用同一关闭动作 |

L22 会把这四站的能力再用到数据流上：对象从「计算」换成「队列与两端 Fiber」，但「属于同一个可关闭容器」这条判据逐字不变。
`,
    'fiber',
    [
      {
        text: '父 fiber 被中断时，forkDetach 出来的 fiber？',
        options: ['一起终止', '继续运行，直到自身完成或全局 scope 关闭', '抛异常', '自动重启'],
        answer: 1,
        explain: 'detach 无 parent、不被监督，是 daemon 语义。',
        concept: 'concurrency',
      },
      {
        text: 'Fiber.interrupt 与 interruptUnsafe 的差别？',
        options: [
          '前者等待 fiber 完全终止并执行 finalizer',
          '后者更快且保证清理',
          '两者完全一样',
          '前者只能中断自己',
        ],
        answer: 0,
        explain: 'interrupt 是 back-pressuring 的安全路径；Unsafe 不等待 finalizer 完成。',
        concept: 'concurrency',
      },
    ],
    [
      ['结构化并发', '子任务生命周期绑定父任务，取消与清理可整体传播'],
      ['异步中断', '运行时在安全边界注入取消信号，无需目标轮询'],
    ],
    [
      '用 forkDetach 做「顺手起个后台任务」，结果应用退出时它还挂着。',
      '误以为 race 的失败者会自动停止——需要确认它已被中断并清理。',
    ],
  ),
  'practice',
)
