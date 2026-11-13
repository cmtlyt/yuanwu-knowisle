import { L, prose, code, call, list, q } from '../../course-builders.ts'

export const L25 = L(
  'L25',
  5,
  '背压与落地：buffer 整形与框架接入',
  28,
  3,
  ['L23', 'L24'],
  ['c-backpressure'],
  ['能处理快源慢消费者的背压', '在真实框架里落地 takeUntil / switchMap / shareReplay'],
  [
    prose(
      '背压：当源比消费者快',
      '快源（高频事件、WebSocket 推送）配慢消费者（渲染、写库）时，值会堆积。RxJS 用「缓冲 / 丢弃 / 采样」三种策略整形：buffer/bufferTime 攒批处理，throttle/sample 丢弃或采样，audit 窗口取最后。',
    ),
    code(
      '背压三策 + 虚拟时间测试',
      'import { interval } from "rxjs"\nimport { bufferTime, throttleTime, pairwise } from "rxjs/operators"\n\n// 快源慢消费：攒 200ms 一批\nfast$.pipe(bufferTime(200)).subscribe((batch) => send(batch)) // 批量提交\n\n// 虚拟时间测试（不需要真实等待）\nimport { TestScheduler } from "rxjs/testing"\nconst ts = new TestScheduler()\nts.expectObservable(src$).toBe("a-b-|", { a: 1, b: 2 }) // 用 Marble 描述期望',
      'TestScheduler 让「debounceTime/switchMap」等时间逻辑可被断言，无需真实计时。',
    ),
    list('框架落地（以 Angular 为例）', [
      '把 HTTP 请求包成 Observable，配合 takeUntil 在组件销毁时自动取消。',
      '事件（搜索、点击）→ switchMap 请求 → AsyncPipe 渲染（自动订阅/取消）。',
      '跨组件共享状态用 shareReplay 或 BehaviorSubject。',
    ]),
    call(
      'deep',
      '与 Effect 的对照',
      'RxJS 的背压靠「缓冲/丢弃/采样」显式整形；Effect 的 Stream 是 pull-based 天然背压。两者都承认「快源慢消费必须整形」，只是模型不同：RxJS 推（push）为主，Effect 拉（pull）为主。',
    ),
  ],
  'rxCombine',
  [
    q(
      '「快源慢消费，想攒一批再处理」最合适？',
      ['bufferTime(ms)', 'take(1)', 'debounceTime', 'throwIfEmpty'],
      0,
      'bufferTime 把一段时间内的值攒成数组一次发出，是「批处理」的背压整形手段。',
      'c-backpressure',
    ),
    q(
      '想给「debounceTime 之后何时发值」写测试而不用真实计时，用什么？',
      ['TestScheduler（虚拟时间）', 'console.log', 'setTimeout', '真实等待'],
      0,
      'TestScheduler 用 Marble 图描述「值在何时发」，可精确断言时间类操作符而无需真实计时。',
      'c-backpressure',
    ),
    q(
      '快源慢消费，想「丢弃中间值、只保留最新值」做背压整形应选？',
      ['bufferTime(ms)', 'sampleTime(ms) / throttleTime(ms)', 'toArray()', 'concatAll()'],
      1,
      'sampleTime 定时采样最近值、throttleTime 限频丢弃中间值；bufferTime 是攒批保留全部，toArray 要等 complete。',
      'c-backpressure',
    ),
  ],
  [
    ['背压', '快源慢消费下的值堆积与整形'],
    ['TestScheduler', '用虚拟时间/Marble 测试时间逻辑'],
  ],
  [
    '高并发事件直接喂给慢消费者，不缓冲也不采样，导致堆积或卡顿。',
    '组件卸载不取消订阅/取最新，旧请求回来盖掉新状态（应使用 takeUntil/switchMap）。',
  ],
)
