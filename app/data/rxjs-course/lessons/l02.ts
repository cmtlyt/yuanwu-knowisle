import { L, prose, code, call, list, q } from '../../course-builders.ts'

export const L02 = L(
  'L02',
  0,
  '冷流与热流：订阅才产生数据',
  25,
  1,
  ['L01'],
  ['c-cold-hot', 'c-triplet'],
  ['解释冷源每次订阅独立重放', '说清热源共享同一份时间线'],
  [
    prose(
      '冷与热的分水岭',
      '冷源（cold）为每个订阅者独立运行一遍，数据只在有订阅者时才开始发射；热源（hot）独立于订阅者持续产生数据，晚到的订阅者只能拿到之后的部分。这是理解 Subject、share、组合多源之前的第一块基石。',
    ),
    code(
      '冷 vs 热',
      'import { interval, Subject } from "rxjs"\n\n// 冷：每个订阅者各自从 0 开始\ninterval(1000).pipe(take(3)).subscribe((n) => console.log("A", n))\ninterval(1000).pipe(take(3)).subscribe((n) => console.log("B", n)) // A、B 各跑一遍 0,1,2\n\n// 热：Subject 独立计时，晚到的 C 错过 0、1\nconst hot = new Subject<number>()\nhot.subscribe((n) => console.log("早到", n))\nhot.next(0); hot.next(1)\nhot.subscribe((n) => console.log("晚到", n)) // 晚到者只看到 2,3…',
      '热源没有「重放」语义，晚订阅者不会补看历史（ReplaySubject 除外）。',
    ),
    list('发射三态', [
      'next(v)：持续发射普通值，可发生 0..n 次。',
      'error(e)：以错误终止，终止后不再有任何发射（不可逆）。',
      'complete()：正常完成，同样终止（不可逆）。',
    ]),
    call(
      'tip',
      '判断冷热的一句话',
      '问「数据是否因为我订阅才开始存在？」是 → 冷；否（数据本来就在流）→ 热。DOM 事件、interval、WebSocket 是热/共享的；of/from/自定义 new Observable 是冷的。',
    ),
  ],
  'rxColdHot',
  [
    q(
      '下面哪个是典型的热源？',
      ['of(1,2,3)', 'fromEvent(el,"click")', 'timer(1000)', 'new Observable(...)'],
      1,
      'DOM 事件独立于订阅者持续发生，是热的；其余都是惰性、按订阅重放的冷源。',
      'c-cold-hot',
    ),
    q(
      '一条流调用 error() 之后还能再 next() 吗？',
      ['能，正常继续', '不能，终结不可逆', '取决于订阅者', '会抛异常'],
      1,
      'error 与 complete 都是终结信号，之后该次订阅不再接受任何 next/error/complete。',
      'c-triplet',
    ),
  ],
  [
    ['冷源 cold', '每个订阅者独立触发源执行、数据独立重放'],
    ['热源 hot', '独立于订阅者持续产生，晚订阅者错过早期数据'],
  ],
  [
    '把 interval 当冷源，期待每个订阅者拿到「相同的」时间线——它其实各自独立计时。',
    '以为 complete 后还能继续 next，或以为 error 可被重试在同一条订阅上恢复。',
  ],
)
