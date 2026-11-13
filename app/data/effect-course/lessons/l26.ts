import { L, prose, code, call, list, q } from '../../course-builders.ts'

export const L26 = L(
  'L26',
  5,
  '生态、稳定性与渐进落地',
  30,
  2,
  ['L15', 'L23'],
  ['ecosystem'],
  ['知道 v4 的包结构与稳定性标记', '能给出一条渐进引入路线'],
  [
    prose(
      '一个生态，零依赖',
      'v4 把原先分散的平台、RPC、Cluster、CLI、AI、SQL、Workflow 等能力收进 effect 单包，核心包零运行时依赖；平台特定驱动／AI provider／OpenTelemetry 集成仍作为独立 @effect/* 包，但全生态统一版本号、同步发布。',
    ),
    code(
      '导入路径与版本锁步',
      'npm install effect@4.1.4\n# 需要 pg 驱动时：@effect/sql-pg@4.1.4（版本必须对齐）\n\nimport { Effect, Layer, Stream } from "effect"\nimport { Schema } from "effect/schema"\nimport { HttpRouter } from "effect/http"\nimport { Sql } from "effect/sql"',
      '子路径模块带 @stability 标记：stable 严格遵循 semver；unstable 在 minor 可能有破坏性变更；experimental 在 patch 也可能变。选型时先看稳定性标签。',
    ),
    list('渐进落地路线', [
      '第 1 步：只把「错误最乱」的一个函数改成 Effect，边界处 runPromise。',
      '第 2 步：把外部依赖抽成 Context.Service + Live/Test 两层配方。',
      '第 3 步：给 I/O 加 retry / timeout / Scope，享受结构化中断。',
      '第 4 步：在应用根部用 ManagedRuntime.make(MainLive) 统一装配一次。',
    ]),
    call(
      'warn',
      'ManagedRuntime 的一个坑',
      '它在首次使用时构建 Layer 并缓存结果。若首次构建失败，这个失败会被一直保留，后续所有运行都失败且不重建。对可能瞬时失败的构造，应在 Layer 内部用 Effect.retry，而不是指望 runtime 自愈。',
    ),
  ],
  'layer',
  [
    q(
      'v4 生态包的版本规则是？',
      ['各包独立版本', '全生态统一版本、同步发布', '固定 0.x', '跟随 Node 版本'],
      1,
      'effect@4.1.4 对应 @effect/*@4.1.4，避免兼容性矩阵。',
      'ecosystem',
    ),
    q(
      'ManagedRuntime 首次构建失败会？',
      ['自动重试直到成功', '缓存该失败，后续运行都失败', '回退默认 runtime', '静默忽略'],
      1,
      '应在 Layer 内部用 Effect.retry 处理瞬时故障。',
      'ecosystem',
    ),
  ],
  [
    ['@stability', 'v4 模块的稳定性标记：stable / unstable / experimental'],
    ['ManagedRuntime', '从根 Layer 构建一次、可复用并负责释放资源的运行时'],
  ],
  [
    '把 unstable 模块直接用到长期维护的核心路径上而不做隔离。',
    '在 React / Serverless 每个请求里重新构建一次根 Layer。',
  ],
)
