import { L } from '../../course-builders.ts'

export const L15 = L(
  'L15',
  3,
  '依赖图：merge / provide / provideMerge 与记忆化',
  4,
  ['L14'],
  ['layer-graph'],
  ['能手工算出组合后的 RIn / ROut 类型', '理解 Layer 记忆化对资源共享的意义'],
  `
### 类型就是架构图

merge 是横向并联：产出与需求都取并集。provide 是纵向串联：用外层配方的产出去满足内层配方的输入，最终只暴露最外层的输出。provideMerge 则在串联的同时把被提供的一方也保留在输出里。

\`\`\` title="三种组合的类型演算" note="写对组合方式后，MainLive 的 RIn 变成 never——这就是「依赖已全部装配完成」的编译期证明。"
import { Layer } from "effect"

declare const ConfigLive: Layer.Layer<Config>
declare const LoggerLive: Layer.Layer<Logger, never, Config>
declare const DbLive: Layer.Layer<Db, never, Config | Logger>

// merge: 并联，需求 = Config，产出 = Config | Logger
const AppConfig = Layer.merge(ConfigLive, LoggerLive)

// provide: 串联消解，产出只剩 Db，需求归零
const MainLive = DbLive.pipe(
  Layer.provide(AppConfig),
  Layer.provide(ConfigLive)
) // Layer<Db, never, never>

// provideMerge: 产出 = Db | Config | Logger
const Exposed = DbLive.pipe(Layer.provideMerge(AppConfig))
\`\`\`

:::deep

### 记忆化与共享

Layer 的构建结果会被记忆化：同一份配方在依赖图里被多处引用时只构造一次，多个消费者拿到同一个服务实例。v4 中跨 Effect.provide 调用的记忆化更一致，这对连接池、缓存客户端这类「必须单例」的资源尤其关键。

:::

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
)
