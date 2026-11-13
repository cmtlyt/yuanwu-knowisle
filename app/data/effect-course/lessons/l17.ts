import { L, prose, code, call, q } from '../../course-builders.ts'

export const L17 = L(
  'L17',
  3,
  '多 Layer 组合与资源竞争实战',
  35,
  4,
  ['L15', 'L16'],
  ['layer', 'layer-graph', 'scope'],
  ['用 provideMerge 组装多服务依赖图', '识别并避免资源竞争与连接泄漏', '理解记忆化对单例资源的意义'],
  [
    prose(
      '把一个应用拆成三层配方',
      '真实应用几乎都有 Config（配置）→ Logger（日志）→ Db（数据库）这样一串依赖。每个服务各自是一份 Layer，Layer 之间的依赖用 RIn 表达，用 provide / provideMerge 把整张图装配成一个「需求归零」的根 Layer，应用入口只运行这一个根。',
    ),
    code(
      '三个服务 + 资源竞争',
      'import { Context, Effect, Layer } from "effect"\n\nclass Config extends Context.Service<Config, { dsn: string; poolSize: number }>()("Config") {}\nclass Logger extends Context.Service<Logger, { log: (m: string) => Effect.Effect<void> }, Config>()("Logger") {}\nclass Db extends Context.Service<Db, { query: (s: string) => Effect.Effect<string> }, Logger>()("Db") {}\n\n// 生产：每个服务一个 Layer；Db 是有状态的，用 scoped + acquireRelease\nconst ConfigLive = Layer.succeed(Config, { dsn: "postgres://...", poolSize: 5 })\nconst LoggerLive = Layer.effect(Logger, (cfg: Config) =>\n  Effect.succeed({ log: (m) => Effect.log(m) }))\nconst DbLive = Layer.scoped(Db, Effect.acquireRelease(\n  Effect.promise(() => openPool(5)),            // 开连接池\n  (pool) => Effect.promise(() => pool.close())   // 关时释放\n))\n\n// 组装：Db 依赖 Logger，Logger 依赖 Config；provideMerge 一路消解\nconst MainLive = Layer.merge(LoggerLive, DbLive).pipe(Layer.provideMerge(ConfigLive))\n// 根 Layer 的 RIn 归零，可 ManagedRuntime.make(MainLive)',
      'DbLive 是 scoped 的：它在根 runtime 的生命周期里只构建一次（记忆化），关闭 runtime 时才真正 close 连接池。若在多个入口各构建一次，就会开多套连接池造成竞争。',
    ),
    call(
      'deep',
      '资源竞争的三个来源',
      '① 多个 scoped Layer 各自开连接池 → 用同一份 Db 配方被记忆化，避免重复开池；② 嵌套 Scope 的关闭顺序 → 子 scope 先关、父 scope 后关（LIFO），finalizer 顺序天然正确；③ 跨请求共享单例 → 单例必须放在根 Layer，不要放在每个请求新建的 Scope 里。',
    ),
  ],
  'layer',
  [
    q(
      'Logger 依赖 Config、Db 依赖 Logger，要产出「只有 Db」且需求归零的根配方，应？',
      [
        'Layer.merge(LoggerLive, DbLive)',
        'DbLive.pipe(Layer.provideMerge(LoggerLive), Layer.provide(LoggerLive.pipe(Layer.provide(ConfigLive))))',
        '把三个服务都写进同一个 Layer.succeed',
        '用 Effect.provide 代替 Layer.provide',
      ],
      1,
      'provide 是纵向消解：内层配方的 RIn 被外层 ROut 满足，一路 provide 下去 Db 的 RIn 归零，最终只暴露 Db。',
      'layer',
    ),
    q(
      '两个入口各自 ManagedRuntime.make 一份带连接池的 Db 配方，最可能出什么？',
      [
        '类型报错',
        '开了两套连接池（资源竞争 / 连接数翻倍），应把 Db 配方放在唯一根 Layer 并被记忆化',
        '没有区别',
        '连接池自动去重',
      ],
      1,
      'Layer 结果按配方记忆化；同一份根 Layer 被多消费者引用才共享单例，各开各的就各开各的连接池。',
      'layer-graph',
    ),
    q(
      '嵌套 Scope 关闭时，finalizer 的执行顺序是？',
      [
        '父先关再关子',
        '子 scope 先关、父 scope 后关（LIFO），后加的资源先释放',
        '随机顺序',
        '只有子 scope 关',
      ],
      1,
      '与栈展开一致：先释放后加的资源（如查询结果集），再释放先加的资源（如连接池）。',
      'scope',
    ),
  ],
  [
    ['根 Layer', 'RIn 归零、可交给 ManagedRuntime 装配的服务依赖图'],
    ['资源竞争', '多个入口/Scope 各自构建有状态 Layer 导致连接池等多套'],
  ],
  [
    '在多个应用入口各 make 一次根 Layer，以为连接池会自动共享。',
    '把带状态的单例 Layer 放进每请求新建的 Scope，导致反复开/关连接。',
  ],
)
