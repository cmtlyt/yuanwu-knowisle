import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 25 ========== */

export const L123 = L(
  'L123',
  25,
  '有状态会话的水平扩展',
  16,
  3,
  ['L53'],
  ['stateful-scaling'],
  [
    '理解「会话状态外置」是水平扩展的前提',
    '掌握 sticky session vs 状态外置的取舍',
    '认识多实例下的状态一致性问题',
  ],
  [
    prose(
      '有状态是水平扩展的天敌',
      'Agent 会话是有状态的：多轮对话、记忆、进行到一半的工具调用。如果状态存在实例内存里，负载均衡把下一轮请求分到另一台机器，会话就「断了」。水平扩展的前提是「状态外置」——把会话状态从进程内存搬到共享存储。',
    ),
    code(
      '状态外置：把会话状态存到共享存储',
      '// ❌ 状态在进程内：换实例就丢\ntype Session = { messages: []; tools: [] }\nconst sessions = new Map<string, Session>()  // 只在当前实例\n\n// ✅ 状态外置：存 Redis / 数据库，任何实例都能读回\nasync function resume(sessionId) {\n  const state = await redis.get(`session:${sessionId}`)\n  return deserialize(state)          // 任何实例都能恢复这个会话\n}\nasync function save(sessionId, state) {\n  await redis.set(`session:${sessionId}`, serialize(state))\n}\n\n// 每个「模型往返」之间都 save / resume，实例无状态、会话有状态',
      '关键：进程本身无状态（可随意扩缩容），状态全部落在共享存储。',
    ),
    call(
      'deep',
      'sticky session 是「省事」不是「解决」',
      'sticky session（同一会话固定路由到同一实例）能避免「换实例丢状态」，但它解决不了「实例挂掉状态就丢」、也解决不了「弹性伸缩时实例被回收」。真正可靠的做法是状态外置，sticky session 顶多当优化。',
    ),
    list('有状态扩展的关键点', [
      '会话状态（消息 / 记忆 / 进行中的工具调用）外置到 Redis / DB。',
      '每个模型往返后落盘，进程随时可重启、可水平扩缩。',
      '分布式锁 / 乐观锁处理「同一会话并发请求」的写冲突。',
      '流式响应时，中间状态也要可恢复（断点续传）。',
    ]),
    call(
      'warn',
      '「进行到一半的工具调用」是难点',
      '最难外置的是「Agent 正在执行一个长工具调用」的中间状态——外置不彻底会导致「实例挂了，工具调用结果也丢了」。要么工具调用本身幂等可重放，要么把中间状态也一并持久化。',
    ),
  ],
  null,
  [
    q(
      '水平扩展的前提是？',
      ['更强的单机', '会话状态外置到共享存储', '更多内存', '更大的模型'],
      1,
      '状态外置才能无状态扩缩容。',
      'stateful-scaling',
    ),
    q(
      'sticky session 的局限是？',
      ['太慢', '解决不了实例挂掉丢状态、弹性伸缩被回收', '太贵', '不兼容'],
      1,
      'sticky 只是优化，不是解决。',
      'stateful-scaling',
    ),
    q(
      '最难外置的状态是？',
      ['对话历史', '进行到一半的长工具调用中间状态', '用户信息', '配置'],
      1,
      '进行中的工具调用中间态最难。',
      'stateful-scaling',
    ),
  ],
  [
    ['状态外置', '把会话状态从进程内存搬到共享存储'],
    ['sticky session', '同一会话固定路由到同一实例'],
    ['无状态进程', '进程本身不持有会话状态，可随意扩缩容'],
  ],
  [
    '把会话状态存在进程内存，再靠 sticky session「凑合」，实例一挂就丢。',
    '忽视「进行中的工具调用」中间态的外置。',
  ],
)
