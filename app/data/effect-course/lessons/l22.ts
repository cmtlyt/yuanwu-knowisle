import { L, prose, code, call, q } from '../../course-builders.ts'

export const L22 = L(
  'L22',
  4,
  '中断语义与 Channel',
  40,
  5,
  ['L21'],
  ['concurrency', 'channel'],
  ['讲清结构化中断的 Interrupt 传播', '用 Channel 做有界多路通信', '区分 Channel 与 Stream 的分工'],
  [
    prose(
      '中断是会传染的信号',
      'Effect 的中断不是「轮询一个标志位」，而是运行时在安全的指令边界注入的异步信号。结构化并发下，中断沿 fiber 树向下传播：父 fiber 被中断时，未 detach 的子 fiber 会被一并中断，各层 Scope 的 finalizer 保证资源收尾。因此「取消」是安全的——不会留下半开资源。',
    ),
    code(
      'Channel：双向通信原语',
      'import { Channel, Effect, Console } from "effect"\n\n// 有界缓冲 2 的管道：读 / 写 / 结束 三态\nconst pipe = Channel.make(2)\n\nconst consumer = Effect.gen(function* () {\n  // 循环读，读不到值时按当前读策略挂起或结束\n  const value = yield* pipe.read()\n  yield* Console.log("got " + value)\n})\n\n// 关闭 Channel 会结束所有未完成的 read / write，收尾由 Scope 保证',
      'Channel 底层就是 Stream 的通信原语：它描述「读 / 写 / 结束」的状态机，因此中断传播、背压与资源语义都复用 Effect 那套。',
    ),
    call(
      'deep',
      'Channel 与 Stream 的分工',
      'Stream 是单向、只读、可被多方消费的时间序列；Channel 是双向、可交互的通信原语（可写可读、可有界缓冲），能建模父子进程、RPC 请求—响应这类需要「来回」的场景。两者底层共用同一套 Channel 描述，所以背压与中断行为一致。',
    ),
  ],
  'concurrency',
  [
    q(
      '父 fiber 被中断时，用 Effect.forkChild 派生的子 fiber 会？',
      ['继续跑到自然完成', '被一并中断，且其 Scope finalizer 仍会执行', '抛出未捕获异常', '自动重启'],
      1,
      '结构化中断向下传播；forkDetach 的 daemon 才不受父中断影响。finalizer 保证资源收尾。',
      'concurrency',
    ),
    q(
      '需要「请求—响应」式来回通信（可写可读、有界缓冲）时，比 Stream 更合适的是？',
      ['Effect.all', 'Channel（双向、可交互）', 'Ref', 'Effect.map'],
      1,
      'Stream 单向只读；Channel 是双向通信原语，底层与 Stream 共用同一套读/写/结束状态机。',
      'channel',
    ),
    q(
      '关闭一个 Channel 时，仍阻塞在 read 上的 fiber 会？',
      ['永远卡住', '被正常结束并触发收尾，不泄漏', '抛 JS 异常', '自动重开'],
      1,
      'Channel 的「结束」是显式事件：读端在关闭时会收到结束而非永久阻塞，资源随 Scope 回收。',
      'channel',
    ),
  ],
  [
    ['Interrupt 传播', '中断沿 fiber 树向下，未 detach 的子任务被一并取消'],
    ['Channel', '双向可交互通信原语，与 Stream 共用读/写/结束状态机'],
  ],
  [
    '把 Channel 的有界缓冲当无界用，写满后阻塞生产者造成隐性背压。',
    '用 forkDetach 起后台任务却忘记在退出前显式关闭，daemon 泄漏。',
  ],
)
