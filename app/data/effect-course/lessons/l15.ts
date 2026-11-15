import { L, withKind } from '../../course-builders.ts'

export const L15 = withKind(
  L(
    'L15',
    3,
    '依赖图：merge / provide / provideMerge 与记忆化',
    4,
    ['L14'],
    ['layer-graph'],
    [
      '解释依赖图 merge / provide / provideMerge 的合并顺序',
      '说清记忆化为什么按 Tag 而不是按值',
      '读懂菱形依赖里同一个实例是怎么保证的',
      '判断循环依赖在类型层还是运行时暴露',
    ],
    `
### 菱形依赖里，同一个 Logger 被造了两份

服务装配图里，\`Db\` 和 \`Cache\` 都依赖 \`Logger\`，主程序再同时依赖 \`Db\` 与 \`Cache\`。上线后发现日志里每条记录都出现两次，但两条的 traceId 不同。原因是装配时把两个分支分别 build 了两次，各自造了一个 Logger 实例；两个分支都「逻辑正确」，合起来却不是同一个对象。**菱形依赖的难点不是连边，而是保证共享节点只被构造一次**，并且这个保证不能依赖调用方按顺序手工组装。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| merge / provide / provideMerge 在依赖图上各做什么 | Layer 与实例的区别（L14）、服务键定义（L13） |
| 为什么记忆化按 Tag 而不是按值，菱形依赖怎么保证单例 | Scope 的 finalizer 执行顺序（L16） |
| 如何用断言验证「共享节点只构造一次、输出类型正确」 | 资源竞争与排障清单（L17） |

### 三个操作在图上做的事

| 操作 | 对图的影响 | 输出类型 | 常见误用 |
|---|---|---|---|
| Layer.merge | 并排合并两个配方，需求取并集 | 同时提供两边的 Tag | 以为它会替你解决重复依赖 |
| Layer.provide | 把某个配方的需求喂给另一个配方 | 只保留被提供方的输出 | 与 provideMerge 混用，输出类型不对 |
| Layer.provideMerge | 同上，但把供给方的输出也保留 | 同时保留两边输出 | 需要共享 Logger 时却用了 provide |

最后一行是菱形依赖最容易踩的坑：用 \`provide\` 把 Logger 喂给 Db，Logger 的输出就从图中消失了，再喂给 Cache 时只能重新构造一份；改用 \`provideMerge\`，Logger 作为共享节点留在图里，两边拿到的是同一个 Tag 对应的同一份产物。

### 真实写法

\`\`\` title="菱形依赖的装配" note="provideMerge 保留供给方输出，让共享节点留在图中；merge 只做并排组合。"
import { Context, Effect, Layer } from "effect"

class Logger extends Context.Service<Logger, { readonly info: (s: string) => Effect.Effect<void> }>()("Logger") {}
class Db extends Context.Service<Db, { readonly q: () => Effect.Effect<string> }>()("Db") {}
class Cache extends Context.Service<Cache, { readonly get: () => Effect.Effect<string> }>()("Cache") {}

declare const loggerLayer: Layer.Layer<Logger>
declare const dbLayer: Layer.Layer<Db, never, Logger>
declare const cacheLayer: Layer.Layer<Cache, never, Logger>

const dbReady = Layer.provideMerge(dbLayer, loggerLayer)
const cacheReady = Layer.provideMerge(cacheLayer, loggerLayer)
const appLayer = Layer.merge(dbReady, cacheReady)
\`\`\`

这里刻意让 \`dbReady\` 与 \`cacheReady\` 各自引用同一个 \`loggerLayer\` 值。装配器按 Tag 记忆化，因此无论它在图上被引用几次，Logger 只构造一次。

### 用断言验证菱形依赖

\`\`\` title="依赖图合并与按 Tag 记忆化" note="自包含程序，只依赖 node:assert；验证共享节点只构造一次、输出集合正确、环能被发现。"
import assert from "node:assert/strict"

type Node = { provides: string; needs: string[]; build: () => unknown }
const node = (provides: string, needs: string[], build: () => unknown): Node => ({ provides, needs, build })

const builds = new Map<string, number>()
const count = (id: string) => builds.set(id, (builds.get(id) ?? 0) + 1)
const make = (provides: string, needs: string[] = []): Node =>
  node(provides, needs, () => {
    count(provides)
    return { id: provides }
  })

const logger = make("Logger")
const db = make("Db", ["Logger"])
const cache = make("Cache", ["Logger"])
const app = node("App", ["Db", "Cache"], () => ({ id: "App" }))

// 装配：按 Tag 记忆化，同一个 Tag 只 build 一次
const instances = new Map<string, unknown>()
const buildGraph = (nodes: Node[]): void => {
  const byId = new Map(nodes.map((n) => [n.provides, n]))
  const visiting = new Set<string>()
  const visit = (id: string): unknown => {
    if (instances.has(id)) return instances.get(id)
    if (visiting.has(id)) throw new Error("cycle detected at " + id)
    visiting.add(id)
    const n = byId.get(id)
    if (n) for (const need of n.needs) visit(need)
    visiting.delete(id)
    const value = n ? n.build() : undefined
    instances.set(id, value)
    return value
  }
  for (const n of nodes) visit(n.provides)
}

buildGraph([logger, db, cache, app])
assert.equal(builds.get("Logger"), 1, "菱形共享节点只构造一次")
assert.equal(builds.get("Db"), 1)
assert.equal(builds.get("Cache"), 1)
assert.strictEqual(instances.get("Logger"), instances.get("Logger"))

// 输出集合：merge 保留两边，provide 会丢掉供给方输出
const mergeOutputs = (a: string[], b: string[]) => [...new Set([...a, ...b])]
assert.deepEqual(mergeOutputs(["Db"], ["Cache"]).sort(), ["Cache", "Db"])

// 循环依赖必须在装配期暴露，而不是运行时栈溢出
const badA = make("A", ["B"])
const badB = make("B", ["A"])
assert.throws(() => buildGraph([badA, badB]), /cycle detected/)
console.log("t1 通过：共享节点单例、输出集合正确、环在装配期暴露")
\`\`\`

第一条断言是这课的核心：如果装配器按「值」而不是 Tag 记忆化，两个分支各自引用 \`loggerLayer\` 就会造出两个实例，日志重复出现；按 Tag 缓存则无论引用几次都只有一份。最后一条断言说明循环依赖应该在装配期被发现——真实库里通常表现为类型层或装配期的错误，而不是运行到一半爆栈。

:::deep

### 为什么记忆化的键必须是 Tag

按值比较听起来更「准确」：两个配置一模一样，为什么不复用？因为**服务身份不等于配置内容**。两个 Layer 即使构造出结构相同的对象，也可能代表两条独立的资源生命周期（两个连接池、两个文件句柄），合并它们会造成意料之外的共享与提前释放。反过来，同一个 Tag 在图上被多次引用，语义上就是「同一个服务」，必须复用。Tag 是身份，值是内容；记忆化锁的是身份。这也解释了 L13 为什么坚持把键写进 R 通道：它不只是给类型推导用的标签，更是装配期决定「谁和谁是同一个」的唯一依据。按值记忆化在测试里往往看不出问题，因为假实现都是简单对象，一旦换成带状态的真实资源就会立刻分裂。

:::

:::warn

### 三个菱形依赖的典型故障

第一件是用 \`Layer.provide\` 处理共享节点，供给方输出从图中消失，另一分支只能重建，开头的日志重复就属于此类。第二件是在每个分支内部各自 \`Layer.succeed\` 一个「看起来一样」的 Logger，绕过了同一个 Tag，记忆化自然无从生效；症状是 traceId 分裂，链路拼不起来。第三件是循环依赖靠运行时懒加载「绕过去」，装配期不报错，运行到某个分支才栈溢出，且堆栈里全是框架代码，很难定位。三者都不会在单分支测试里出现，所以依赖图相关的回归至少要覆盖「一个 Tag 被两个分支引用」与「存在环」两种用例，t1 已经把两条都钉住。**菱形依赖的验收点从来不是能不能跑通，而是共享节点是不是同一份。**

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 共享 Tag 的 build 计数为 1 | 记忆化失效，产生了两份有状态服务 |
| 两次获取得到严格同一个实例 | 按值比较，身份分裂 |
| merge 后输出集合包含两边 Tag | 供给方输出被意外丢弃 |
| 循环依赖在装配期抛错 | 环被推迟到运行时，堆栈不可读 |
| 需求在 build 之前全部可达 | 装配顺序错，运行时缺服务 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L14 Layer 语义 | 单个配方怎么构造、何时构造 | 按 Tag 记忆化的构造入口 |
| L16 Scope | 构造出来的资源怎么释放 | 装配图是释放顺序的依据 |
| L17 实战 | 三层依赖图与资源竞争排障 | 「共享节点单例」这条验收判据 |
`,
    'layer',
    [
      {
        text: 'Layer.provide(inner, outer) 的结果产出是？',
        options: ['inner 与 outer 的并集', 'inner 的产出（outer 的需求被消解）', 'outer 的产出', 'never'],
        answer: 1,
        explain: 'provide 是纵向消解：outer 的产出喂给 inner，最终只暴露 inner 的 ROut。',
        concept: 'layer-graph',
      },
      {
        text: '记忆化最重要的实际价值是？',
        options: ['让类型更短', '共享同一份有状态资源，避免重复建连接池', '加快编译', '自动重试构造失败'],
        answer: 1,
        explain: '同一配方只构建一次，保证连接池／客户端在依赖图中是单例。',
        concept: 'layer-graph',
      },
    ],
    [
      ['merge', '并联组合：输出与输入都取并集'],
      ['provideMerge', '消解依赖同时保留被提供方的输出'],
    ],
    [
      '在循环依赖里反复 provide，导致类型永远消不掉 R。',
      '把带状态的 Layer 在多个入口各构建一次，造成连接池泄漏。',
    ],
  ),
  'theory',
)
