import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 1 · 可观察与发射（保持 4 课） ========== */

export const L04 = L(
  'L04',
  1,
  '用 new Observable 自定义源：观察者协议',
  28,
  2,
  ['L03'],
  ['c-new-observable'],
  ['手写一个自定义源', '用返回清理函数回收资源'],
  [
    prose(
      '观察者协议',
      'new Observable 接收一个「订阅函数」：它被调用时拿到 observer，可对其调用 next / error / complete，并返回一个 teardown 清理函数（或 Subscription）。这是 RxJS 里「一切皆可观察」的底层入口。',
    ),
    code(
      '自定义源 + 自动清理',
      'import { Observable } from "rxjs"\n\n// 把「每秒报时 + 可停止」做成一个冷源\nconst ticker = new Observable<number>((observer) => {\n  let n = 0\n  const id = setInterval(() => {\n    observer.next(n++)\n    if (n >= 5) observer.complete()\n  }, 1000)\n  // 返回清理函数：订阅取消时 clearInterval，防泄漏\n  return () => clearInterval(id)\n})\n\nticker.subscribe({\n  next: (n) => console.log("tick", n),\n  complete: () => console.log("end"),\n})',
      '忘记返回清理函数是自定义源最常见的泄漏；订阅取消时清理函数自动执行。',
    ),
    call(
      'tip',
      '什么时候才手写 new Observable',
      '90% 场景用现成源（fromEvent / interval / fetch 包 from）即可；只有当你要把一段命令式代码（定时器、轮询、DOM 事件封装、WebSocket）封装成流时才手写。写出来一定是「惰性 + 可取消」。',
    ),
  ],
  'rxObserver',
  [
    q(
      'new Observable 的订阅函数返回什么最规范？',
      ['一个字符串', 'void', '一个 teardown 清理函数或 Subscription', '一个 Promise'],
      2,
      '返回清理函数可让订阅取消时自动回收定时器/连接，是自定义源防泄漏的关键。',
      'c-new-observable',
    ),
    q(
      '自定义源里 observer.complete() 之后还能 observer.next() 吗？',
      ['能', '不能，终结后调用无效', '会抛异常', '会重新开始'],
      1,
      '一次终结（error 或 complete）之后，该订阅的 next/error/complete 都会被忽略，语义不可逆。',
      'c-new-observable',
    ),
  ],
  [
    ['观察者协议', 'new Observable(fn) 中 fn 接收 observer 并返回 teardown'],
    ['teardown 函数', '订阅取消时执行的清理逻辑'],
  ],
  [
    '自定义源创建了定时器却不返回清理函数，订阅取消后定时器仍在跑。',
    '在源内部直接操作外部可变状态而不封装进 teardown，导致多次订阅互相干扰。',
  ],
)
