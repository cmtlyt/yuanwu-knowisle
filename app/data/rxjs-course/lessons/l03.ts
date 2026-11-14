import { L } from '../../course-builders.ts'

export const L03 = L(
  'L03',
  0,
  '订阅与资源回收：Subscription 与 teardown',
  1,
  ['L02'],
  ['c-teardown'],
  ['掌握 subscribe 的三种签名', '理解 teardown 的可组合性'],
  `
### 订阅即资源

订阅一条流会建立定时器、事件监听、网络连接等资源。RxJS 用 Subscription 统一管理，且它本身是可组合的：子订阅会挂到父订阅上，取消父订阅会级联回收所有子资源——这是防内存泄漏的关键。

\`\`\` title="三种订阅签名" note="组件卸载、路由离开时统一 unsubscribe，是 React/Vue 里最常见的泄漏源。"
import { interval, Subscription } from "rxjs"

// 1) 传一个对象观察者
const s1 = interval(1000).subscribe({
  next: (n) => console.log(n),
  error: (e) => console.error(e),
  complete: () => console.log("done"),
})
// 2) 传三个函数
interval(1000).subscribe((n) => {}, (e) => {}, () => "all done")
// 3) 传一个回调（只关心 next）
interval(1000).subscribe((n) => console.log(n))

s1.unsubscribe() // 手动回收，定时器停止
// 或用 teardown 自动回收
new Subscription(() => console.log("teardown")) // 带清理回调
\`\`\`

:::warn

### teardown 是可组合的

Subscription 支持 add / 级联：把多个子资源（定时器、子订阅、事件监听）都 add 进同一个 Subscription，一次 unsubscribe 全部回收。Vue 3 里通常配合 onBeforeUnmount 或 takeUntil 使用。

:::

`,
  'rxTeardown',
  [
    {
      text: '取消父订阅会发生什么？',
      options: ['只停父流，子资源泄漏', '级联取消所有子订阅，资源全部回收', '抛出异常', '子资源继续运行'],
      answer: 1,
      explain: 'Subscription 的级联设计正是为了让「取消一个订阅」能统一回收其下所有定时器/监听/子流。',
      concept: 'c-teardown',
    },
    {
      text: '组件卸载时最稳妥的做法是？',
      options: ['什么都不做，交给 GC', 'unsubscribe / takeUntil 主动回收', '重新订阅一次', '忽略 complete'],
      answer: 1,
      explain: '被动等 GC 对「持有事件监听与定时器的订阅」无效，必须主动回收或靠生命周期自动取消。',
      concept: 'c-teardown',
    },
  ],
  [
    ['Subscription', '订阅句柄，可级联、可取消、可承载 teardown 回调'],
    ['teardown', '取消订阅时执行的清理逻辑'],
  ],
  [
    '只订阅不取消，组件频繁切换导致定时器/监听堆积（最常见的性能与内存问题）。',
    '把 unsubscribe 写在错误的位置（如只清理了最后一个），遗漏中间子资源。',
  ],
)
