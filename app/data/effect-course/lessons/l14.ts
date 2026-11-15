import { L, withKind } from '../../course-builders.ts'

export const L14 = withKind(
  L(
    'L14',
    3,
    'Layer 是构造配方，不是服务本身',
    3,
    ['L13'],
    ['layer'],
    [
      '解释 Layer 是构造配方而不是服务实例',
      '说清 Layer 的构造时机与记忆化决定共享还是重建',
      '辨别 provide 与 provideMerge 在输出类型上的差异',
      '判断一个依赖该建成 Layer 还是直接传参',
    ],
    `
### 连接池被重建了几千次

压测里数据库 CPU 异常高，但 QPS 并不大。翻日志发现每个请求都在打印「初始化连接池」。原因是一次重构把 Layer 当成「服务实例的缓存」来用：每次请求都重新构造一遍 Layer 并立刻 provide，团队以为 \`Layer.succeed\` 里的值会被复用。实际上 Layer 描述的是**怎么构造服务**，不是服务本身；是否复用同一个实例，取决于它在依赖图里被合并了几次、有没有被记忆化。把配方当成品，就会在每次请求时照着配方重新做一遍。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| Layer 与服务实例的区别，以及「构造配方」这个比喻的确切含义 | 服务键与 R 通道（L13）、依赖图合并顺序（L15） |
| 三种构造方式各自适合什么、构造发生在什么时候 | Scope 与 finalizer 的释放时机（L16） |
| 怎样用断言验证「同一 Layer 只构造一次」 | 多 Layer 资源竞争实战（L17） |

### 配方、产物、装配时机

| 概念 | 类比 | 实际含义 | 误用后果 |
|---|---|---|---|
| Layer | 菜谱 | 描述「需要什么、怎么造出什么」 | 当成成品缓存，每次请求重新构造 |
| 服务实例 | 做好的菜 | 装配时产出的具体对象 | 在业务函数里直接 new，绕过装配 |
| provide | 上菜 | 把产物交给程序，收敛 R | 放在链中间，后续分支绕过 |
| 记忆化 | 同一份菜复用 | 按 Tag 缓存已构造的产物 | 按值比较，两个等价实现各造一次 |

一个有用的判断句：**Layer 是值，但它描述的是构造过程**；它是不可变的、可组合的，本身不持有连接、不打开文件。真正持有资源的是装配时产出的实例，而那部分的生命周期归 Scope 管（L16）。把这两层混在一起，就会出现「日志里反复初始化」却查不到谁在 new 的情况——构造动作藏在 Layer 里，被调用方反复执行了。

### 真实写法

\`\`\` title="三种构造方式" note="Layer.succeed 给现成值，Layer.effect 用一段 Effect 构造，Layer.scoped 带资源释放。"
import { Context, Effect, Layer } from "effect"

class Config extends Context.Service<Config, { readonly url: string }>()("Config") {}
class Pool extends Context.Service<Pool, { readonly size: number }>()("Pool") {}

const configLayer = Layer.succeed(Config, new Config({ url: "postgres://local" }))
const poolLayer = Layer.effect(
  Pool,
  Effect.sync(() => new Pool({ size: 10 })),
)
const scopedLayer = Layer.scoped(
  Pool,
  Effect.acquireRelease(
    Effect.sync(() => new Pool({ size: 10 })),
    (p) => Effect.sync(() => void p.size),
  ),
)
\`\`\`

三种方式的差别不在语法，而在**构造动作的代价与责任**：\`succeed\` 没有构造过程；\`effect\` 有一段可失败的构造逻辑；\`scoped\` 额外承诺释放。选错时不会报错，只会在压测或缩容时以资源泄漏的形式出现。

### 用断言把「只构造一次」钉住

\`\`\` title="Layer 构造配方与记忆化的最小模型" note="自包含程序，只依赖 node:assert；验证配方是值、按 Tag 记忆化、不按值比较。"
import assert from "node:assert/strict"

type Tag = { readonly id: string }
const tag = (id: string): Tag => ({ id })

type Layer = { readonly provides: Tag; readonly needs: readonly Tag[]; readonly build: () => unknown }
const succeed = (provides: Tag, value: unknown): Layer => ({ provides, needs: [], build: () => value })
const effect = (provides: Tag, needs: readonly Tag[], build: () => unknown): Layer => ({
  provides,
  needs,
  build,
})

let builds = 0
const poolTag = tag("Pool")
const configTag = tag("Config")
const poolLayer = effect(poolTag, [configTag], () => {
  builds += 1
  return { size: 10 }
})

// 配方本身是值：构造它不会触发 build
assert.equal(builds, 0, "定义 Layer 不得构造服务")

// 按 Tag 记忆化：同一个 Layer 被两处依赖，只构造一次
const memo = new Map<string, unknown>()
const getInstance = (l: Layer): unknown => {
  const key = l.provides.id
  if (!memo.has(key)) memo.set(key, l.build())
  return memo.get(key)
}
const a = getInstance(poolLayer)
const b = getInstance(poolLayer)
assert.equal(builds, 1, "同一 Tag 只构造一次")
assert.strictEqual(a, b, "两次拿到的是同一个实例")

// 需求在装配前必须已满足，否则不允许 build
const configLayer = succeed(configTag, { url: "local" })
assert.deepEqual(poolLayer.needs.map((t) => t.id), ["Config"])
assert.ok(getInstance(configLayer))
console.log("t1 通过：配方是值、按 Tag 记忆化、需求可检查")
\`\`\`

第一条断言是这课的起点：如果 \`effect(...)\` 在定义时就执行了 build，那它就不是一个可组合的值，而是一段立即执行的副作用，L01 讲的描述/执行分离在这一层同样适用。第二条断言对应开头的连接池事故——缺少按 Tag 的记忆化，同一份配方被两处依赖就会造出两个池。

### 选型判据

| 情形 | 选择 | 理由 |
|---|---|---|
| 配置、常量等现成值 | Layer.succeed | 没有构造过程 |
| 需要读取配置或可能失败的构造 | Layer.effect | 构造逻辑本身是 Effect |
| 连接、文件句柄等需要释放 | Layer.scoped | 释放归 Scope 管理 |
| 多个 Layer 共享同一依赖 | 合并后统一装配 | 让记忆化生效，避免重复构造 |

:::deep

### 为什么「配方」这个比喻值得较真

说 Layer 像函数、像工厂、像依赖图节点，都能讲通一部分，但只有「配方」能把三件事同时说清：它是**值**（可以被传递、合并、复用）、它**不持有资源**（只有照着做才产出实例）、它**有输入需求**（needs 里写着还缺什么原料）。把 Layer 理解成工厂对象，容易顺手在里面缓存实例，于是构造时机变得隐式；理解成依赖图节点，又容易忽略它携带的构造动作与失败可能。配方的比喻还有一个实际好处：它天然带出「谁来做、做几次」这个问题，而这个问题正是 L15 记忆化要回答的。**比喻不是修辞，它决定了你会把状态放在哪一层。**

:::

:::warn

### 三个把配方当成品的写法

第一件是每次请求重新构造并 provide 一遍 Layer，开头的事故属于此类；日志表现为反复初始化，但代码里找不到 new。第二件是在 Layer 内部自行缓存实例，绕过了按 Tag 的记忆化，结果不同装配路径拿到不同对象，比较与清理都失效。第三件是用 \`Layer.succeed\` 包住一个需要释放的资源，构造时看起来没问题，缩容时连接永远不关——因为 succeed 没有任何释放承诺，应该换成 \`Layer.scoped\`。三者都不会报错，前两个在高并发下才暴露，最后一个只在进程退出时暴露。排查时先问一句「这个 Layer 的 build 被调用了几次」，比读业务代码快得多；t1 的构造计数断言可以直接搬进集成测试。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 定义 Layer 时构造计数为 0 | 配方退化成立即执行的副作用 |
| 同一 Tag 的依赖只构造一次 | 记忆化失效，连接池被重建 |
| 两次获取得到同一实例 | 按值比较而非按 Tag，状态分裂 |
| needs 在装配前可检查 | 缺依赖直到运行时才暴露 |
| 需释放的资源走 scoped | 进程退出时资源不释放 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L13 服务键 | 需求怎么声明、键为什么进 R | 配方按 Tag 提供产物 |
| L15 依赖图 | 多个配方怎么合并、记忆化怎么生效 | build 计数与 needs 检查 |
| L16 Scope | 产出的资源怎么登记与逆序释放 | scoped 是释放承诺的入口 |
`,
    'layer',
    [
      {
        text: 'Layer<Logger, never, Config> 中的 Config 表示？',
        options: ['产出的服务', '构造期需要的依赖', '构造错误类型', '成功值类型'],
        answer: 1,
        explain: 'RIn 是构造这个 Layer 之前必须先满足的服务集合。',
        concept: 'layer',
      },
      {
        text: '服务需要在关闭时释放连接，用哪个构造？',
        options: ['Layer.succeed', 'Layer.effect', 'Layer.scoped', 'Layer.merge'],
        answer: 2,
        explain: 'scoped 把构造与 finalizer 绑定到 Scope，退出时保证释放。',
        concept: 'layer',
      },
    ],
    [
      ['Layer<ROut, Err, RIn>', '服务构造蓝图的三段式类型'],
      ['scoped', '带资源生命周期的构造方式'],
    ],
    ['把 Layer 当成「服务容器对象」，在业务代码里直接读它的属性。'],
  ),
  'theory',
)
