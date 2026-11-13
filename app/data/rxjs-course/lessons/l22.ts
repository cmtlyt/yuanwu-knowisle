import { L, prose, code, call, list, q } from '../../course-builders.ts'

export const L22 = L(
  'L22',
  5,
  '调度器：把时间注入系统',
  28,
  3,
  ['L01'],
  ['c-scheduler'],
  ['理解 Scheduler 把「时间」变成可替换的依赖', '选对调度器'],
  [
    prose(
      '时间是一种依赖',
      '调度器（Scheduler）把「何时、以什么节奏执行」从代码里抽离成可注入的参数。同一套时间逻辑，换个调度器就能跑在宏任务 / 微任务 / 动画帧上，还能在测试里换成「虚拟时间」。这是 RxJS 可测试性的根基。',
    ),
    code(
      '三种常见调度器',
      'import { of, asyncScheduler, queueScheduler, animationFrameScheduler } from "rxjs"\n\nof(1).pipe(map(n => n + 1)).subscribe() // 默认同步\n\n// 异步（宏任务）：把执行推到 setTimeout 队列\nof(1, 2, 3).pipe(subscribeOn(asyncScheduler), /* ... */)\n   .subscribe((n) => console.log(n))\n\n// 微任务（Promise）\n// 动画帧：与 requestAnimationFrame 对齐，做动画更顺',
      'subscribeOn 决定「何时订阅/首次发射」；observeOn 决定「后续值在哪个调度器上被消费」。',
    ),
    list('四个调度器', [
      'queueScheduler：微任务（Promise.resolve），最接近同步。',
      'asyncScheduler：宏任务（setTimeout/queueMicrotask），默认异步。',
      'animationFrameScheduler：requestAnimationFrame，做动画。',
      'asapScheduler：队列优先、溢出宏任务（默认异步选择）。',
    ]),
    call(
      'deep',
      'subscribeOn vs observeOn',
      'subscribeOn 只影响「建立订阅 + 首次发射」的时机；observeOn 影响「每个值在哪个任务上被处理」。要整条流都异步，用 observeOn。',
    ),
  ],
  'rxScheduler',
  [
    q(
      '「让后续每个值都在微任务队列里被处理」应使用？',
      ['subscribeOn(queueScheduler)', 'observeOn(queueScheduler)', 'map', 'startWith'],
      1,
      'observeOn 控制每个值的消费时机；subscribeOn 只管订阅与首发射，不改变后续值的调度。',
      'c-scheduler',
    ),
    q(
      '做 UI 动画、希望发射对齐渲染帧，选哪个调度器？',
      ['queueScheduler', 'animationFrameScheduler', 'timer', 'asapScheduler'],
      1,
      'animationFrameScheduler 把执行对齐 requestAnimationFrame，避免与渲染争抢主线程。',
      'c-scheduler',
    ),
    q(
      '「让后续每个值都在宏任务队列里被消费」应使用？',
      ['subscribeOn(asyncScheduler)', 'observeOn(asyncScheduler)', 'map(fn)', 'delay(0)'],
      1,
      'observeOn 控制每个值在哪个调度器上被处理；subscribeOn 只影响订阅与首次发射的时机。',
      'c-scheduler',
    ),
  ],
  [
    ['Scheduler', '把「时间/节奏」抽离为可注入依赖'],
    ['subscribeOn / observeOn', '分别控制订阅时机与值消费时机'],
  ],
  [
    '混用 subscribeOn 与 observeOn，期望「整条流异步」却只异步了首发射。',
    '在高并发 UI 里默认用宏任务调度，主线程被阻塞、动画掉帧。',
  ],
)
