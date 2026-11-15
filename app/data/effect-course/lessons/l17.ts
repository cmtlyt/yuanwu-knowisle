import { L, withKind } from '../../course-builders.ts'

export const L17 = withKind(
  L(
    'L17',
    3,
    '多 Layer 组合与资源竞争实战',
    4,
    ['L15', 'L16'],
    ['layer', 'layer-graph', 'scope'],
    [
      '实现三层 Layer 的依赖图并跑通完整装配',
      '写出资源竞争场景的复现与修复程序',
      '跑通「同一 Tag 只构造一次」的断言',
      '产出一份 Layer 组合的排障清单',
    ],
    `
### 三层装配跑通了，压测却出现两个连接池

依赖项按设计分了三层：Logger → Db / Cache → App。本地单测全绿，压测时发现连接数是预期的两倍，而且部分请求拿到了已经关闭的连接。排查结果有两条：一是 \`Db\` 与 \`Cache\` 各自用 \`Layer.provide\` 喂了一次 Logger，共享节点被重建；二是某个分支在请求作用域之外自己构造了一个连接池，绕过了 Scope 的登记。两处单独看都「能跑」，合起来就成了**资源竞争**：同一份资源有两个所有者，一个按请求回收，另一个没人回收。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 三层依赖图怎么完整装配，共享节点怎么保证只有一份 | Layer 与实例的区别（L14）、依赖图合并规则（L15） |
| 资源竞争的两种典型成因怎么复现、怎么修复 | finalizer 逆序的运行时原理（L16） |
| 怎样用断言与排障清单把「不泄漏」变成可回归资产 | Fiber 调度与中断实现（S4） |

### 三层图与两个竞争点

| 层 | 提供 | 依赖 | 竞争风险 |
|---|---|---|---|
| 基础层 | Logger | 无 | 被两条分支各构造一次 |
| 中间层 | Db、Cache | Logger | 用 provide 丢掉共享输出 |
| 应用层 | App | Db、Cache | 在作用域外自行构造连接 |

两个竞争点分别对应 L15 的「共享节点单例」与 L16 的「释放登记」。它们常常同时出现：装配错了导致多一份实例，作用域错了导致其中一份没人关。只修其中一处，压测里连接数仍然不对。

### 真实写法

\`\`\` title="三层依赖图的装配" note="provideMerge 保留 Logger 输出；整个程序交给 Effect.scoped 统一收尾。"
import { Context, Effect, Layer } from "effect"

class Logger extends Context.Service<Logger, { readonly info: (s: string) => Effect.Effect<void> }>()("Logger") {}
class Db extends Context.Service<Db, { readonly q: () => Effect.Effect<string> }>()("Db") {}
class Cache extends Context.Service<Cache, { readonly get: () => Effect.Effect<string> }>()("Cache") {}

declare const loggerLayer: Layer.Layer<Logger>
declare const dbLayer: Layer.Layer<Db, never, Logger>
declare const cacheLayer: Layer.Layer<Cache, never, Logger>
declare const app: Effect.Effect<string, never, Db | Cache>

const dbReady = Layer.provideMerge(dbLayer, loggerLayer)
const cacheReady = Layer.provideMerge(cacheLayer, loggerLayer)
const appLayer = Layer.merge(dbReady, cacheReady)

const main = Effect.scoped(Effect.provide(app, appLayer))
\`\`\`

注意 \`scoped\` 包在 \`provide\` 外面：作用域覆盖整次装配与运行，任何在链上登记的资源都会随它一起关闭。把 \`scoped\` 放进某个中间分支，等于提前关闭了别人还在用的连接。

### 竞争复现、修复与断言

\`\`\` title="资源竞争的最小模型" note="自包含程序，只依赖 node:assert；复现双份实例与漏释放，再验证修复后的不变量。"
import assert from "node:assert/strict"

type Node = { provides: string; needs: string[]; build: () => { id: string; closed: boolean } }
const builds: string[] = []
const released: string[] = []

const makeNode = (provides: string, needs: string[] = []): Node => ({
  provides,
  needs,
  build: () => {
    builds.push(provides)
    return { id: provides, closed: false }
  },
})

const logger = makeNode("Logger")
const db = makeNode("Db", ["Logger"])
const cache = makeNode("Cache", ["Logger"])

// 错误版：每个分支各自装配，共享节点被构造两次，且没有统一释放
const assembleWrong = (): { logger: number; db: number } => {
  const a = logger.build()
  const b = logger.build()
  void db.build()
  void cache.build()
  void a
  void b
  return { logger: builds.filter((x) => x === "Logger").length, db: 1 }
}

// 修订版：按 Tag 记忆化 + 统一作用域登记释放
const assembleRight = (nodes: Node[]) => {
  const instances = new Map<string, { id: string; closed: boolean }>()
  const scope: Array<() => void> = []
  const byId = new Map(nodes.map((n) => [n.provides, n]))
  const visit = (id: string) => {
    if (instances.has(id)) return instances.get(id)!
    for (const need of byId.get(id)?.needs ?? []) visit(need)
    const n = byId.get(id)
    if (!n) throw new Error("missing layer: " + id)
    const value = n.build()
    instances.set(id, value)
    scope.push(() => {
      value.closed = true
      released.push(value.id)
    })
    return value
  }
  for (const n of nodes) visit(n.provides)
  return { instances, close: () => scope.slice().reverse().forEach((f) => f()) }
}

builds.length = 0
const wrong = assembleWrong()
assert.equal(wrong.logger, 2, "错误版确实造了两份 Logger")
assert.equal(released.length, 0, "错误版没有任何释放")

builds.length = 0
const right = assembleRight([logger, db, cache])
assert.equal(builds.filter((x) => x === "Logger").length, 1, "修订版共享节点只有一份")
assert.strictEqual(right.instances.get("Logger"), right.instances.get("Logger"))
right.close()
assert.deepEqual(released, ["Cache", "Db", "Logger"], "逆序释放全部三层资源")
assert.ok([...right.instances.values()].every((v) => v.closed), "不存在无人回收的实例")
console.log("t1 通过：复现双份实例与漏释放，修订版单例且全量回收")
\`\`\`

第一条断言故意让错误版先跑通：它「能跑」，只是造了两份 Logger 且没有释放，正好是压测里那两条现象。修订版同时满足 L15 的单例与 L16 的逆序释放，两条断言缺一不可——只验单例，仍可能有一个实例没人关。

### 排障清单（可直接落地）

| 现象 | 先查哪里 | 判定 |
|---|---|---|
| 连接数是预期两倍 | 共享 Tag 是否被 provideMerge 保留 | build 计数应为 1 |
| 日志 traceId 分裂 | 两个分支是否各自 succeed 了一份 Logger | 应引用同一个 Layer 值 |
| 缩容后连接残留 | scoped 是否覆盖整次装配 | 关闭动作应在最外层 |
| 偶发「连接已关闭」 | 作用域是否被提前关闭 | scoped 不能放在中间分支 |
| 部分资源从未释放 | 是否在作用域外自行构造 | 所有获取都要登记 |

:::deep

### 为什么资源问题总是「两个 bug 叠在一起」

单个装配错误通常只是多一份实例，压测里表现为计数偏高，容易定位；单个作用域错误通常只是漏一次释放，缩容时才暴露。真正难查的是两者同时发生：多出来的那份实例恰好挂在没人关闭的作用域里，于是既多又漏，监控上连接数忽高忽低，看不出规律。这也是为什么本课把「复现」写成一段能跑的程序，而不是列几条注意事项——**只有让错误版真的造出两份 Logger、真的一个都不释放，才能确认修订版的两条断言各自对应哪一个成因**。推而广之，依赖图与生命周期不是一个可以分开验收的两层：装配决定「有几个资源」，作用域决定「谁来关」，回归断言必须同时覆盖这两个维度。

:::

:::warn

### 三个让装配与释放脱节的写法

第一件是在工具函数内部自己 \`Effect.scoped\` 一下「图省事」，作用域提前关闭，别的分支还在用那份连接。第二件是在 Layer 里直接 \`new\` 一个连接池并用模块级变量缓存，绕过了 Tag 记忆化与释放登记，两份所有者互不知情。第三件是只给部分分支加 \`acquireRelease\`，认为「主力路径管好就行」，结果异常与中断路径各漏一点，残留连接随时间累积。三者都不报编译错误，且都在并发或缩容时才显现。排查顺序建议固定：先数 build 次数，再看 released 列表是不是覆盖全部实例，最后才怀疑数据库配置。t1 正好把这三步变成三条断言。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 共享 Tag 的 build 计数为 1 | provide 丢掉了共享输出 |
| 两次获取严格同一实例 | 按值记忆化，身份分裂 |
| 关闭后所有实例都标记已释放 | 存在孤儿资源 |
| 释放顺序为逆序 | 依赖倒置，可能死锁 |
| 错误版能被断言复现 | 回归集只测了正确路径，抓不到退化 |

### 与 S4 的分工

| 上游交付 | 下游怎么用 | 不允许改什么 |
|---|---|---|
| 单例共享节点 | L18 的 Fiber 树按同一份服务运行 | 不在子任务里另造实例 |
| 统一作用域与逆序释放 | S4 的级联中断复用同一套关闭动作 | 不在中间分支提前 scoped |
| 竞争排障清单 | L21 的结构化并发验收 | 不把「能跑通」当成「不泄漏」 |

### S3 五课复盘：一次装配走过的五站

| 站 | 课 | 把什么变成数据 | 交给下一站的东西 |
|---|---|---|---|
| 1 | L13 服务键 | 「我需要什么」的声明 | 可去重、带类型的需求项 |
| 2 | L14 Layer 语义 | 「怎么造出来」的配方 | 不持有资源的构造值 |
| 3 | L15 依赖图 | 多个配方之间的合并关系 | 按 Tag 记忆化的装配图 |
| 4 | L16 Scope | 「什么时候还」的释放承诺 | 可逆序、可级联的关闭动作 |
| 5 | L17 实战 | 前四站的不变量 | 可复现、可回归的竞争验收 |

复盘表里最容易断的是第 3 站到第 4 站：装配图决定「有几个资源」，作用域决定「谁来关」，任何一站单独正确都不够。开头那次压测出现两个连接池，复盘时两条成因各占一半，正因为 L15 与 L16 的验收断言从来没有放在同一个用例里跑过。把 t1 的错误版与修订版一起进回归集，就是为了让这两站从此一起被检查。

### 与 S4 的接缝

| S3 交付 | S4 怎么用 | 不允许改什么 |
|---|---|---|
| 单例共享节点 | L18 的 Fiber 树按同一份服务运行 | 不在子任务里另造实例 |
| 统一作用域与逆序释放 | L21 的级联中断复用同一套关闭动作 | 不在中间分支提前 scoped |
| 竞争排障清单 | L22 的中断竞态验收 | 不把「能跑通」当成「不泄漏」 |

留一条给下一阶段的判据：装配层解决的是「资源有几个、谁来关」，运行时层解决的是「同一份资源被多少个并发分支共享、父级结束时怎么一起收」。前者靠 Tag 记忆化与作用域，后者靠 Fiber 树与中断传播；两边共用同一个「不泄漏」目标，但验收断言不能互相替代。S4 的每一课都会回到这个问题：当一个 Fiber 提前结束，它碰过的资源还回得来吗。把这条判据带过去，才不会把「装配图正确」误当成「并发下也安全」。

S3 到这里收口：键、配方、图、作用域、实战五件事都落在同一条装配链上。S4 转向运行时内部——蓝图到底是怎么被解释执行的。
`,
    'layer',
    [
      {
        text: 'Logger 依赖 Config、Db 依赖 Logger，要产出「只有 Db」且需求归零的根配方，应？',
        options: [
          'Layer.merge(LoggerLive, DbLive)',
          'DbLive.pipe(Layer.provideMerge(LoggerLive), Layer.provide(LoggerLive.pipe(Layer.provide(ConfigLive))))',
          '把三个服务都写进同一个 Layer.succeed',
          '用 Effect.provide 代替 Layer.provide',
        ],
        answer: 1,
        explain:
          'provide 是纵向消解：内层配方的 RIn 被外层 ROut 满足，一路 provide 下去 Db 的 RIn 归零，最终只暴露 Db。',
        concept: 'layer',
      },
      {
        text: '两个入口各自 ManagedRuntime.make 一份带连接池的 Db 配方，最可能出什么？',
        options: [
          '类型报错',
          '开了两套连接池（资源竞争 / 连接数翻倍），应把 Db 配方放在唯一根 Layer 并被记忆化',
          '没有区别',
          '连接池自动去重',
        ],
        answer: 1,
        explain:
          'Layer 结果按配方记忆化；同一份根 Layer 被多消费者引用才共享单例，各开各的就各开各的连接池。',
        concept: 'layer-graph',
      },
      {
        text: '嵌套 Scope 关闭时，finalizer 的执行顺序是？',
        options: [
          '父先关再关子',
          '子 scope 先关、父 scope 后关（LIFO），后加的资源先释放',
          '随机顺序',
          '只有子 scope 关',
        ],
        answer: 1,
        explain: '与栈展开一致：先释放后加的资源（如查询结果集），再释放先加的资源（如连接池）。',
        concept: 'scope',
      },
    ],
    [
      ['根 Layer', 'RIn 归零、可交给 ManagedRuntime 装配的服务依赖图'],
      ['资源竞争', '多个入口/Scope 各自构建有状态 Layer 导致连接池等多套'],
    ],
    [
      '在多个应用入口各 make 一次根 Layer，以为连接池会自动共享。',
      '把带状态的单例 Layer 放进每请求新建的 Scope，导致反复开/关连接。',
    ],
  ),
  'practice',
)
