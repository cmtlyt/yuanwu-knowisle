import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 4 · 多播与热流 ========== */

export const L17 = L(
  'L17',
  4,
  'Subject：把冷流变成可多播的热源',
  26,
  3,
  ['L02'],
  ['c-subject'],
  ['用 Subject 共享一条时间线', '理解 Subject 即观察者又可被订阅'],
  [
    prose(
      'Subject 的两副面孔',
      'Subject 既是 Observer（可 next/error/complete 推数据），又是 Observable（可 subscribe 收数据）。一条源可以「喂给」多个 Subject，让 N 个订阅者共享同一份时间线——这就是多播（multicast）。',
    ),
    code(
      '一个源，多个消费者',
      'import { interval } from "rxjs"\nimport { Subject } from "rxjs"\n\nconst hot = new Subject<number>()\ninterval(1000).pipe(take(5)).subscribe((n) => hot.next(n)) // 源喂给 Subject\n\nhot.subscribe((n) => console.log("UI 面板", n))   // 晚到也共享同一份\nhot.subscribe((n) => console.log("日志面板", n))   // 多订阅者同步看到',
      '注意：这里源仍在「推」，Subject 只是转发；晚到订阅者会错过已发过的值（ReplaySubject 除外）。',
    ),
    call(
      'deep',
      'Subject 是「广播」不是「重放」',
      '普通 Subject 不保存历史：你 next() 发过的值，晚到的订阅者看不到。需要「新订阅者立刻拿到最近值」是 BehaviorSubject，「拿到最近 N 个」是 ReplaySubject。',
    ),
  ],
  'rxSubject',
  [
    q(
      'Subject 同时具备哪两种身份？',
      ['只是 Observer', '只是 Observable', '既是被订阅的源，又是可推数据的观察者', '只是定时器'],
      2,
      'Subject 双身份：能 next()（观察者）又能 subscribe()（可观察），这是它能做多播广播的原因。',
      'c-subject',
    ),
    q(
      '普通 Subject 晚到的订阅者能拿到之前发过的值吗？',
      ['能，自动重放', '不能，不保存历史', '只能拿最后一个', '拿前 5 个'],
      1,
      '普通 Subject 不存历史；要「拿最近值」用 BehaviorSubject，「拿最近 N 个」用 ReplaySubject。',
      'c-subject',
    ),
    q(
      '一个 Subject 调用了 complete() 之后，再继续 next() 会发生什么？',
      [
        '继续正常发出',
        'next 被忽略（已终止），且 complete 已传播给所有订阅者并终结流',
        '抛 JS 异常',
        '自动重开',
      ],
      1,
      'error/complete 会传播给全部订阅者并让 Subject 进入终止态，之后再 next 无效。这是「热流也会终结」的陷阱，与「晚到无历史」是不同面向。',
      'c-subject',
    ),
  ],
  [
    ['Subject', '既是 Observer 又是 Observable，可多播'],
    ['多播', '一条源被多个订阅者共享'],
  ],
  [
    '以为普通 Subject 会重放历史（它不会，需行为/回放型）。',
    '把 Subject 当冷源，期待每次订阅都「从头」重放。',
  ],
)
