import { L } from '../../course-builders.ts'

export const L14 = L(
  'L14',
  3,
  'Layer 是构造配方，不是服务本身',
  30,
  3,
  ['L13'],
  ['layer'],
  ['读懂 Layer<ROut, Err, RIn> 三个参数', '区分 succeed / effect / scoped'],
  `
### 把依赖放在构造期

如果 Logger 内部直接去读 Config，服务的形状就会被实现细节污染。Layer 把「怎么造这个服务」单独抽出来：它是一份构造配方，声明产出什么、可能构造失败成什么、以及造它需要先有哪些服务。

\`\`\` title="三个参数与三种构造" note="Layer.scoped 让服务的生命周期与 Scope 绑定，关闭时自动释放。"
import { Context, Effect, Layer } from "effect"

// Layer<ROut, Err, RIn>
//       产出服务  构造错误  构造所需依赖

const ConfigLive: Layer.Layer<Config> =
  Layer.succeed(Config, { get: () => Effect.succeed({ dsn: "..." }) })

const LoggerLive: Layer.Layer<Logger, never, Config> =
  Layer.effect(Logger, Effect.gen(function* () {
    const config = yield* Config
    return { log: (m: string) => Effect.log(m) }
  }))

// 需要清理的资源用 Layer.scoped / Effect.acquireRelease
const DbLive: Layer.Layer<Db, DbError, Config | Logger> =
  Layer.scoped(Db, Effect.acquireRelease(connect, (conn) => close(conn)))
\`\`\`

:::deep

### Live / Test 约定

同一个服务通常配两份配方：XxxLive 用于生产、XxxTest 用于测试。类型系统保证两者形状一致，测试代码只改应用根部的那一处装配。

:::

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
)
