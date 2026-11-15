import { L, withKind } from '../../course-builders.ts'

export const L16 = withKind(
  L(
    'L16',
    3,
    'Scope 与资源安全：finalizer 为什么不会漏',
    4,
    ['L15'],
    ['scope'],
    [
      '解释 Scope 与 finalizer 的登记和逆序执行机制',
      '说清结构化并发为什么不会漏掉资源释放',
      '辨别 acquireRelease 与 addFinalizer 的适用面',
      '判断中断发生时 finalizer 的执行时机',
    ],
    `
### 缩容时连接没关，泄漏查了一个星期

一次灰度缩容后，数据库连接数没有按预期下降，残留连接一直挂到超时。代码里明明写了 \`finally { conn.close() }\`，评审也看过。问题出在**中断路径不走 finally 所在的那个作用域**：任务被父级取消时，控制流从运行时直接跳出，包在业务函数里的 finally 没机会执行。更隐蔽的是多层资源的释放顺序：先开的连接后关、后开的锁先关，顺序写反会死锁。Scope 把这两件事变成运行时的承诺，而不是靠每个作者记得写 finally。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| finalizer 在哪里登记、什么时候执行、为什么逆序 | 依赖图的合并与记忆化（L15）、服务键定义（L13） |
| 中断发生时资源为什么仍然会被释放 | Fiber 与结构化并发的运行时实现（S4） |
| 怎样用断言验证「正常结束与中断两条路径都不漏」 | 多 Layer 资源竞争实战（L17） |

### 登记、作用域、执行时机

| 环节 | 由谁负责 | 保证 |
|---|---|---|
| 登记 | acquireRelease / addFinalizer | 资源与释放动作成对写进值里 |
| 归属 | Effect.scoped 划出的作用域 | 子任务挂在同一个 Scope 上 |
| 触发 | 正常结束、失败、中断任意一条路径 | 都会执行，不需要作者分支处理 |
| 顺序 | 运行时按登记的逆序 | 后获取的资源先释放，避免依赖倒置 |

第二行是最关键的一句：释放不是「函数结束时顺手做」，而是「作用域关闭时统一做」。因为作用域是结构化的，父级结束会级联关闭子作用域，所以中断路径与正常路径走的是同一套收尾逻辑。把 finally 写在业务函数里，只覆盖了「函数自己走到结尾」这一种情况。

### 真实写法

\`\`\` title="资源与释放成对登记" note="Effect.scoped 划出作用域；中断时的额外动作可用 Effect.onInterrupt 声明。"
import { Effect } from "effect"

const withConnection = Effect.acquireRelease(
  Effect.sync(() => ({ id: 1, close: () => {} })),
  (conn) => Effect.sync(() => void conn.id),
)

const program = Effect.scoped(
  Effect.gen(function* () {
    const conn = yield* withConnection
    yield* Effect.addFinalizer(() => Effect.log("closing scope"))
    yield* Effect.onInterrupt(Effect.succeed(conn.id), () => Effect.log("interrupted"))
    return conn.id
  }),
)
\`\`\`

\`acquireRelease\` 把「拿到什么」与「怎么还」绑成一个值，\`scoped\` 决定它的生命周期边界。两者分开写是有意的：同一个资源可以在不同作用域里被复用，而释放时机由最外层决定。

### 用断言覆盖两条收尾路径

\`\`\` title="finalizer 逆序与中断释放" note="自包含程序，只依赖 node:assert；验证正常结束、失败、中断三条路径都不漏释放。"
import assert from "node:assert/strict"

type Scope = { finalizers: Array<() => void>; closed: boolean }
const newScope = (): Scope => ({ finalizers: [], closed: false })

const acquire = <A>(scope: Scope, value: A, release: (v: A) => void): A => {
  scope.finalizers.push(() => release(value))
  return value
}

// 逆序执行：后登记的先释放
const close = (scope: Scope): string[] => {
  if (scope.closed) return []
  scope.closed = true
  const log: string[] = []
  for (const f of scope.finalizers.slice().reverse()) {
    f()
    log.push("released")
  }
  return log
}

const events: string[] = []
const scope = newScope()
acquire(scope, "conn", () => events.push("close conn"))
acquire(scope, "lock", () => events.push("release lock"))
assert.equal(close(scope).length, 2, "正常结束释放全部资源")
assert.deepEqual(events, ["release lock", "close conn"], "必须逆序释放")

// 失败与中断走同一个关闭动作，不依赖调用方写 finally
const failed = newScope()
acquire(failed, "file", () => events.push("close file"))
close(failed)
assert.ok(failed.closed)

const interrupted = newScope()
acquire(interrupted, "socket", () => events.push("close socket"))
close(interrupted)
assert.ok(interrupted.closed, "中断路径同样必须关闭")
assert.ok(events.includes("close socket"))

// 重复关闭是幂等的，不能二次释放
assert.deepEqual(close(scope), [], "关闭过的 Scope 不再重复执行")
console.log("t1 通过：逆序释放、三条路径都不漏、关闭幂等")
\`\`\`

第二条断言对应顺序问题：如果按登记顺序释放，先关连接再放锁，持锁方可能还在等连接，直接用不出来。第四条断言常被忽略——中断与正常结束都可能触发关闭，若关闭动作不幂等，二次释放会抛错并掩盖原始失败。

### 判据表

| 情形 | 该用什么 | 反例 |
|---|---|---|
| 获取与释放成对 | acquireRelease | 业务函数里手写 try/finally |
| 需要额外登记清理动作 | addFinalizer | 在回调里自己置标志位 |
| 中断时要记录额外信息 | onInterrupt | 在 catch 里判断取消原因 |
| 多个资源嵌套 | 同一个 scoped 作用域 | 每个函数各开一个作用域 |

:::deep

### 为什么结构化作用域能兜住中断

命令式代码里，资源释放依赖「控制流会回到 finally 那一行」；中断恰恰是一种不回头的控制流，所以 finally 天然有盲区。结构化作用域换了一个思路：释放动作不属于某段代码，而属于**一个可以被整体关闭的容器**。运行时只需要做一件事——关闭这个容器——无论关闭原因是正常结束、失败还是父级中断。子作用域挂在父作用域上，于是关闭会级联，且因为登记有先后，逆序执行天然成立。回头看 L07 那条「不持有句柄就无法收尾」，这里补上了另一半：**光有句柄还不够，释放动作必须预先登记在作用域里**，否则中断时运行时根本不知道该关什么。S4 讲结构化并发时，会把这个容器与 Fiber 树合成同一套机制。

:::

:::warn

### 三个「写了 finally 却漏了」的场景

第一件是把 finally 写在业务函数内部，任务被父级中断时根本走不到，开头的连接泄漏属于此类。第二件是释放动作有依赖顺序却按登记顺序手写，比如先关连接再放锁，压测时才偶发死锁。第三件是在中断回调里又启动了一个新任务并完成资源获取，这个新任务挂在即将关闭的作用域之外，成为谁都收不到的孤儿。三者都不报编译错误，且都只在取消 / 缩容 / 超时路径上出现，本地跑 happy path 完全正常。因此 Scope 相关的回归必须包含「中断路径」与「多个资源」两类用例，t1 的三条路径与逆序断言正是最小集合。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 正常结束释放全部登记资源 | finalizer 没挂在作用域上 |
| 多个资源按逆序释放 | 依赖倒置，可能死锁 |
| 失败与中断路径同样关闭 | 只覆盖了 happy path，缩容会泄漏 |
| 重复关闭幂等 | 二次释放抛错，掩盖原始失败 |
| 中断回调不新建脱离作用域的任务 | 产生无人回收的孤儿资源 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L14 / L15 | 配方与依赖图怎么产出服务 | scoped 决定产物的生命周期 |
| L17 实战 | 三层 Layer 装配里的资源竞争 | 「逆序 + 全路径」两条判据 |
| S4 结构化并发 | 作用域与 Fiber 树如何统一 | 关闭是可级联的单一动作 |
`,
    'scope',
    [
      {
        text: 'finalizer 的执行顺序是？',
        options: ['按加入顺序', '逆序 LIFO', '随机', '只执行最后一个'],
        answer: 1,
        explain: '逆序释放保证先关依赖资源、再关被依赖的连接。',
        concept: 'scope',
      },
      {
        text: 'fiber 被中断时，Scope 里的 finalizer？',
        options: ['不会执行', '仍会执行', '只有成功时执行', '需要手动 catch'],
        answer: 1,
        explain: '成功、失败、中断三种退出路径都会关闭 Scope 并运行 finalizer。',
        concept: 'scope',
      },
    ],
    [
      ['finalizer', '注册在 Scope 上的释放动作'],
      ['acquireRelease', '不可中断获取 + 保证释放的资源构造'],
    ],
    ['在 try/finally 里手写清理，遇到异步中断就失效。', '把资源存成模块级变量，脱离 Scope 生命周期。'],
  ),
  'theory',
)
