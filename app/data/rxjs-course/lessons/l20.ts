import { L, code, call, list, q } from '../../course-builders.ts'

export const L20 = L(
  'L20',
  4,
  'share 的陷阱：连接、断开与重放边界',
  26,
  3,
  ['L19'],
  ['c-share-pitfall'],
  ['识别 share 的常见坑', '为「晚到订阅者」补状态'],
  [
    list('三大陷阱', [
      '陷阱一：晚到订阅者错过早期值——share() 不重放，需 shareReplay / BehaviorSubject。',
      '陷阱二：无人订阅就断开——refCount 归零即断开，再次订阅会重新建立，可能重发请求。',
      '陷阱三：错误传播后整条共享流终结——一个订阅者触发的 error 会让 share 流永久结束，所有订阅者受影响。',
    ]),
    code(
      '为晚到者补状态',
      'import { fromEvent } from "rxjs"\nimport { shareReplay, startWith } from "rxjs/operators"\n\n// 路由重入 / 晚挂载的组件需要「当前值 + 未来值」\ntheme$.pipe(shareReplay(1)).subscribe((t) => apply(t)) // 重放最近 1 个\n\n// 或给初始值，让任何时刻订阅者都有可用态\nstate$.pipe(startWith(DEFAULT), shareReplay()).subscribe((s) => render(s))',
      'shareReplay(1) 让「任何时候来」的订阅者立即拿到最近值，是 SPA 里跨路由共享状态的关键。',
    ),
    call(
      'warn',
      'error 会终结共享流',
      'share 流一旦 error，对所有订阅者永久结束。要「一条分支挂了整条都废」之外的语义，得在源头加 retry/catchError，或干脆不共享带错误语义的流。',
    ),
  ],
  'rxShare',
  [
    q(
      '「晚进页面的组件也要立即拿到最近一次状态」最合适的做法是？',
      ['share()', 'shareReplay / startWith(初始值)', 'concat', 'take(0)'],
      1,
      'share() 不重放历史；shareReplay 会缓存最近值，startWith 提供初始态，二者才能让晚到者有可用状态。',
      'c-share-pitfall',
    ),
    q(
      '共享流收到 error 后会发生什么？',
      ['自动重试', '对所有订阅者永久终结', '只影响该订阅者', '变成 complete'],
      1,
      'error 沿共享流传播给全部订阅者并终结它；要避免「一处挂全废」需在源头加重试或兜底。',
      'c-share-pitfall',
    ),
    q(
      '跨路由共享主题状态用 shareReplay() 相比 share() 额外解决了什么？',
      ['晚到订阅者能立即拿到最近一次值', '减少并发请求', '提高发射频率', '自动取消 error'],
      0,
      'shareReplay 缓存最近值供新订阅者重放；share() 不重放历史，晚进页面的组件会拿到空状态。',
      'c-share-pitfall',
    ),
  ],
  [
    ['重放边界', 'share 不重放 vs shareReplay/Behavior 重放'],
    ['连接生命周期', 'refCount 归零断开、重订重连'],
  ],
  [
    '用 share() 跨路由共享状态，结果晚到组件拿不到值（应使用 shareReplay/startWith）。',
    '忽略共享流的 error 终结语义，一条分支失败拖垮所有消费者。',
  ],
)
