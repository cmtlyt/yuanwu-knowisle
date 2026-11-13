import { L, code, call, list, q } from '../../course-builders.ts'

export const L25 = L(
  'L25',
  5,
  '并发原语与 STM',
  30,
  3,
  ['L21'],
  ['stm'],
  ['知道常见并发原语的用途', '理解事务内存解决什么问题'],
  [
    list('常用原语', [
      'Ref：单个可变引用的原子读写（Ref.make / Ref.get / Ref.update）。',
      'Deferred：一次性结果的占位，多方等待、一方完成（Deferred.await）。',
      'Queue / PubSub：有界／无界队列与发布订阅，自带背压与中断语义。',
      'Semaphore / Latch：许可控制与一次性门闩，用于限流与同步。',
      'SubscriptionRef：可读变化流的状态引用，Stream.tap 能观察每次变更。',
    ]),
    code(
      'Ref 的基本用法',
      'import { Effect, Ref } from "effect"\n\nconst counter = Effect.gen(function* () {\n  const ref = yield* Ref.make(0)\n  yield* Effect.all(\n    Array.from({ length: 10 }, () => Ref.update(ref, (n) => n + 1)),\n    { concurrency: "unbounded" }\n  )\n  return yield* Ref.get(ref)\n})',
      'v4 中 Ref 不是 Effect：要用 Ref.get / Ref.update，而不是直接 yield* ref。',
    ),
    call(
      'deep',
      'STM：把多步状态变更变成一个事务',
      '当多个引用必须「要么一起变、要么都不变」时，锁容易写错。v4 引入软件事务内存（Effect.tx 与 TxRef / TxQueue / TxHashMap / TxPubSub / TxSemaphore 等），把一组读写包成原子事务：冲突时由运行时重试，而不是由程序员手写锁与回滚。',
    ),
  ],
  'concurrency',
  [
    q(
      'v4 中想读一个 Ref 的值，正确写法是？',
      ['yield* ref', 'yield* Ref.get(ref)', 'await ref', 'Ref.value(ref)'],
      1,
      'Fiber / Ref / Deferred 不再是 Effect，必须走对应的访问函数。',
      'stm',
    ),
    q(
      'STM 主要解决？',
      ['更快的 JSON 解析', '多个状态引用的原子变更与冲突重试', '类型化错误', '日志格式化'],
      1,
      '事务内存把加锁与回滚交给运行时，避免手写临界区出错。',
      'stm',
    ),
  ],
  [
    ['Ref', 'fiber 安全的单值可变引用'],
    ['STM', '软件事务内存：一组读写作为原子事务执行'],
  ],
  ['用模块级 let 变量在并发 fiber 间共享状态，绕开原子性保证。'],
)
