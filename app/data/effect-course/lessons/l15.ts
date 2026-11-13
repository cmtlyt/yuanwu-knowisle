import { L, prose, code, call, q } from '../../course-builders.ts'

export const L15 = L(
  'L15',
  3,
  '依赖图：merge / provide / provideMerge 与记忆化',
  35,
  4,
  ['L14'],
  ['layer-graph'],
  ['能手工算出组合后的 RIn / ROut 类型', '理解 Layer 记忆化对资源共享的意义'],
  [
    prose(
      '类型就是架构图',
      'merge 是横向并联：产出与需求都取并集。provide 是纵向串联：用外层配方的产出去满足内层配方的输入，最终只暴露最外层的输出。provideMerge 则在串联的同时把被提供的一方也保留在输出里。',
    ),
    code(
      '三种组合的类型演算',
      'import { Layer } from "effect"\n\ndeclare const ConfigLive: Layer.Layer<Config>\ndeclare const LoggerLive: Layer.Layer<Logger, never, Config>\ndeclare const DbLive: Layer.Layer<Db, never, Config | Logger>\n\n// merge: 并联，需求 = Config，产出 = Config | Logger\nconst AppConfig = Layer.merge(ConfigLive, LoggerLive)\n\n// provide: 串联消解，产出只剩 Db，需求归零\nconst MainLive = DbLive.pipe(\n  Layer.provide(AppConfig),\n  Layer.provide(ConfigLive)\n) // Layer<Db, never, never>\n\n// provideMerge: 产出 = Db | Config | Logger\nconst Exposed = DbLive.pipe(Layer.provideMerge(AppConfig))',
      '写对组合方式后，MainLive 的 RIn 变成 never——这就是「依赖已全部装配完成」的编译期证明。',
    ),
    call(
      'deep',
      '记忆化与共享',
      'Layer 的构建结果会被记忆化：同一份配方在依赖图里被多处引用时只构造一次，多个消费者拿到同一个服务实例。v4 中跨 Effect.provide 调用的记忆化更一致，这对连接池、缓存客户端这类「必须单例」的资源尤其关键。',
    ),
  ],
  'layer',
  [
    q(
      'Layer.provide(inner, outer) 的结果产出是？',
      ['inner 与 outer 的并集', 'inner 的产出（outer 的需求被消解）', 'outer 的产出', 'never'],
      1,
      'provide 是纵向消解：outer 的产出喂给 inner，最终只暴露 inner 的 ROut。',
      'layer-graph',
    ),
    q(
      '记忆化最重要的实际价值是？',
      ['让类型更短', '共享同一份有状态资源，避免重复建连接池', '加快编译', '自动重试构造失败'],
      1,
      '同一配方只构建一次，保证连接池／客户端在依赖图中是单例。',
      'layer-graph',
    ),
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
