import { L, prose, code, call, q } from '../../course-builders.ts'

export const L19 = L(
  'L19',
  4,
  '连接共享：publish / multicast / share 与 refCount',
  30,
  3,
  ['L17'],
  ['c-share'],
  ['用 share 让多订阅者共用一条源', '理解 refCount 的自动连接/断开'],
  [
    prose(
      '为什么要「共享」',
      '默认每条订阅都独立重放冷源。若某源开销大（网络请求、WebSocket），多个组件各订阅一次就会发起 N 次请求。share/publish 让所有订阅者连接「同一条」上游，N 个订阅者 → 1 次源执行。',
    ),
    code(
      'share 的等价形态',
      'import { of, interval } from "rxjs"\nimport { share, tap } from "rxjs/operators"\n\n// 等价于 new BehaviorSubject(...) 的「连接 + 重放最近」形态（取决于参数）\nconst shared$ = interval(1000)\n  .pipe(\n    tap(() => console.log("源只执行一次")), // 多订阅者都看到 1 次\n    share({ refCount: true }) // 第一个订阅者连接，最后一个取消时断开\n  )\n\nshared$.subscribe(() => console.log("订阅 A"))\nshared$.subscribe(() => console.log("订阅 B")) // 共享同一时间线',
      'refCount: true 时，订阅者计数归零自动断开上游；这是「懒连接」的关键。',
    ),
    call(
      'deep',
      'share 与 BehaviorSubject 的边界',
      'share() 不重放历史（新订阅者拿不到已发值）；需要「新订阅者补最近值」时改用 shareReplay / BehaviorSubject。选错会让「晚进页面」的组件状态错乱。',
    ),
  ],
  'rxShare',
  [
    q(
      '多组件共用同一昂贵源，避免重复请求，最常用？',
      ['各写一份 from()', 'share（让 N 个订阅者连接一条上游）', 'concat', 'reduce'],
      1,
      'share 把源「连接共享」：第一个订阅者建立上游，后续订阅者复用，最后一个取消才断开。',
      'c-share',
    ),
    q(
      'refCount: true 的作用是？',
      ['限制并发数', '订阅者计数归零时自动断开上游', '重放历史', '缓存结果'],
      1,
      'refCount 让共享流「有订阅者才连接、无人订阅就断开」，避免无人消费时上游还在跑。',
      'c-share',
    ),
    q(
      'N 个组件订阅同一份 interval(1000).pipe(share({ refCount: true }))，上游源执行几次？',
      ['N 次（每人一次）', '1 次（共享一条上游连接）', '0 次', 'N² 次'],
      1,
      'share 把 N 个订阅者接到同一条上游，源只执行 1 次；refCount 在订阅数归零时自动断开，再次订阅才重建。',
      'c-share',
    ),
  ],
  [
    ['multicast', '让一条源被多订阅者共享'],
    ['refCount', '按订阅者计数自动连接/断开'],
  ],
  [
    '每个组件各自 from(request) 发起重复请求（应使用 share 共享）。',
    '用 share() 期待重放历史，结果晚订阅者状态缺失（应使用 shareReplay/BehaviorSubject）。',
  ],
)
