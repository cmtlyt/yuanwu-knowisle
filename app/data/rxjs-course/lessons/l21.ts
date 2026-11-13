import { L, code, call, list, q } from '../../course-builders.ts'

export const L21 = L(
  'L21',
  4,
  '热流选型与内存泄漏排查：Subject vs share 实战',
  30,
  3,
  ['L20'],
  ['c-subject'],
  ['在 Subject / BehaviorSubject / shareReplay 间正确选型', '排查 refCount 三类内存泄漏场景'],
  [
    list('选型对照', [
      '要「已知初始值 + 新订阅者立刻拿当前值」→ BehaviorSubject(initial)。',
      '要「新订阅者补最近 N 个」→ ReplaySubject(N) 或 shareReplay({ bufferSize: N })。',
      '要「N 个订阅者共享一条昂贵源、自动连接/断开」→ share({ refCount: true })。',
      '要「纯广播、不重放」→ Subject。',
    ]),
    code(
      '三类内存泄漏排查',
      '// ① 无界 ReplaySubject：new ReplaySubject()（不设上限）长期热流会无限堆积\n// ② shareReplay 默认 refCount:false：最后一个订阅者取消后源可能仍连接\n// ③ 组件卸载未取消订阅：theme$.subscribe(apply) 缺 takeUntil(destroy$)，定时器/监听常驻',
      '热流泄漏三源：无界缓冲、共享流不断开、订阅不回收——排查时依次核对这三点。',
    ),
    call(
      'warn',
      'share + refCount 的「重连即重请求」特性',
      'refCount:true 时订阅数归零会断开源；再次订阅会重新执行源——若源是网络请求就会重发。要「连一次就常驻」用 share({ refCount: false }) 或 BehaviorSubject。',
    ),
  ],
  'rxSubject',
  [
    q(
      '「晚进页面的组件也要立刻拿到最近一次主题值」最合适？',
      ['Subject', 'BehaviorSubject / shareReplay(1)', 'ReplaySubject(0)', 'concat'],
      1,
      'BehaviorSubject 需初始值并发当前值；shareReplay(1) 重放最近一个；普通 Subject 不重放。',
      'c-subject',
    ),
    q(
      'share({ refCount: true }) 下所有订阅者取消后，再次订阅会发生？',
      ['复用缓存值不重请求', '重新执行源、可能重发请求', '报错', '永久挂起'],
      1,
      'refCount 归零即断开，重订重连是特性，昂贵源要显式设计是否「常驻」。',
      'c-subject',
    ),
    q(
      '「组件卸载后定时器/监听仍常驻」这类泄漏的直接原因是？',
      [
        'ReplaySubject 无上限',
        '卸载时未取消订阅（缺 takeUntil / unsubscribe）',
        'refCount 为 true',
        'next 调用太频繁',
      ],
      1,
      '泄漏三源之一：订阅未随组件生命周期回收；无界缓冲与 refCount 失配是另外两类，需分别排查。',
      'c-subject',
    ),
  ],
  [
    ['refCount 泄漏', '源昂贵且 refCount 配置失当时重连触发重执行与堆积'],
    ['takeUntil', '组件卸载自动取消订阅，防监听常驻'],
  ],
  [
    '长期热流用无界 ReplaySubject，内存无限增长。',
    '组件卸载忘记取消订阅，定时器/监听堆积（应使用 takeUntil / destroy$）。',
  ],
)
