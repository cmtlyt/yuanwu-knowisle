import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 5 ========== */

export const L23 = L(
  'L23',
  5,
  'Stream：零到多个值与背压',
  35,
  3,
  ['L21'],
  ['stream'],
  ['区分 Effect 与 Stream', '理解 pull-based 背压为什么天然成立'],
  [
    prose(
      'Effect 恰好一个值，Stream 零到无数个',
      'Stream<A,E,R> 是 Effect 的延伸：同样的三通道，但能发出 0 个、1 个、有限多个甚至无限多个 A。它可替代 Observable、Node stream、AsyncIterable，且与 Effect 共用同一套错误、依赖、中断与资源语义。',
    ),
    code(
      '基础用法',
      'import { Effect, Stream } from "effect"\n\nconst numbers = Stream.range(1, 10)\nconst doubled = numbers.pipe(Stream.map((n) => n * 2))\n\nawait Effect.runPromise(Stream.runCollect(doubled))\n// [2, 4, 6, ..., 20]\n\nconst infinite = Stream.iterate(1, (n) => n + 1)\nconst firstFive = infinite.pipe(Stream.take(5), Stream.runCollect)',
      'runCollect 是众多 Sink 之一：它决定「如何消费」这条流。',
    ),
    call(
      'deep',
      '背压来自 pull',
      '流不是生产者随便往里推，而是下游按需 pull 一个 chunk。消费者慢，上游就停下来等——背压因此是模型的自然结果，不需要额外的缓冲阈值配置。Chunk 是批量传输单位，减少逐元素调度开销；底层由 Channel 统一描述「读／写／结束」的状态机。',
    ),
  ],
  'stream',
  [
    q(
      'Stream 相对 Effect 的关键差别？',
      ['Stream 没有错误通道', 'Stream 可发出零到多个值', 'Stream 立即执行', 'Stream 不支持依赖'],
      1,
      'Effect 成功时恰好一个值；Stream 是 0..N 个值的时间序列。',
      'stream',
    ),
    q(
      'pull-based 模型如何带来背压？',
      ['靠固定大小缓冲区', '下游按需拉取，上游不会超过消费速度', '靠丢弃数据', '靠提高生产者优先级'],
      1,
      '需求由下游驱动，是结构化而非补救式的流量控制。',
      'stream',
    ),
  ],
  [
    ['Chunk', 'Stream 批量传输的数据块'],
    ['Sink', '流的消费者，如 runCollect / runDrain'],
  ],
  ['把无限流直接 runCollect，等价于让程序永不结束。'],
)
