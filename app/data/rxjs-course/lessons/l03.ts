import { L, withKind } from '../../course-builders.ts'

export const L03 = withKind(
  L(
    'L03',
    0,
    '订阅与资源回收：Subscription 与 teardown',
    1,
    ['L02'],
    ['c-teardown'],
    [
      '说清 Subscription 树、add / unsubscribe 与 teardown 的执行时机',
      '解释终结路径与手动取消路径分别如何触发清理',
      '说清 take / takeUntil 这类自动完成算子如何间接回收资源',
      '用一张对照表区分「流结束」与「订阅被取消」的清理差异',
    ],
    `
### 一次事故：路由切走了，定时器还在跑

后台看板每秒轮询一次指标，组件卸载时只把界面隐藏了，没有取消订阅。测试环境一切正常，上线后用户在列表和详情之间来回切十几次，浏览器里同时挂着十几个轮询，请求量翻十几倍，控制台里还不断出现「向已卸载组件写入状态」的警告。有人试图在回调里判断「组件还在不在」，但轮询、WebSocket、事件监听、动画帧各自有一套判断，漏一个就漏一次泄漏。真正的修复不是再补一个布尔量，而是认清一件事：**订阅不只是「开始收值」，它同时创建了一份需要归还的资源**。这节课只讲这份资源怎么登记、什么时候归还、由谁归还。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`subscribe()\` 除了返回观察者还返回什么 | 一个 \`Subscription\` 句柄，代表这次订阅持有的全部资源 |
| 资源什么时候归还 | 流 \`complete\` / \`error\` 终结时，或调用 \`unsubscribe()\` 时，两者都会跑清理 |
| 多个资源怎么管理 | 用 \`Subscription.add()\` 组成父子树，父取消时连带取消所有子订阅 |
| 本课不回答什么 | 如何自定义源（L04）、错误如何恢复（L14）、热流共享如何断开（L19） |

### Subscription 树与 teardown

\`subscribe()\` 返回的句柄是一次订阅的**资源账本**。源在被订阅时创建的定时器、DOM 监听、WebSocket、文件句柄，都要登记成 teardown（清理函数）；订阅终结时，账本按登记逆序或按实现约定逐一执行。手工 \`new Observable\` 时（L04）可以直接返回 teardown，使用现成创建函数时也可以借 \`finalize\` 在终结与取消两条路径上插入统一清理。

| 概念 | 作用 | 常见误用 |
|---|---|---|
| \`Subscription\` | 一次订阅的资源句柄，可 \`unsubscribe()\` | 只保存子订阅，忘了持有父句柄 |
| \`add(child)\` | 把子订阅挂到父账本，父取消时连带取消 | 组件里各订阅各自 \`unsubscribe\`，漏掉其中一个 |
| \`unsubscribe()\` | 幂等地释放全部资源，之后再调用不再重复清理 | 以为调用两次会跑两次清理，或在清理里做有副作用的计数 |
| teardown | 源在订阅时登记的清理函数 | 把「清理」写成「业务回滚」，取消时误改服务端状态 |
| \`finalize\` | 在 complete / error / unsubscribe 三条路径都执行 | 用 \`tap\` 的 complete 分支代替，取消路径漏掉 |

这里有一个容易被忽略的对称性：**取消和终结走的是同一套清理**。区别在于终结还会向下游交付一个 \`complete\` 或 \`error\` 通知，而取消不会——取消是订阅者单方面说「我不要了」，源不必、也不应该再通知下游。正因为两条路径共用清理，\`finalize\` 才比「在 \`complete\` 回调里写清理」更可靠。

### 终结与取消：清理路径对照

| 路径 | 触发者 | 是否通知下游 | 是否执行 teardown | 典型场景 |
|---|---|---|---|---|
| \`complete\` | 源 | 是，\`complete\` | 是 | \`take(3)\` 达到数量、\`of\` 发完所有值 |
| \`error\` | 源 | 是，\`error\` | 是 | 网络异常、解析失败 |
| \`unsubscribe()\` | 订阅者 | 否 | 是 | 组件卸载、用户取消、路由切换 |
| \`add()\` 后父取消 | 父订阅 | 否 | 是，父与所有子 | 一个页面统一收口若干订阅 |

\`\`\`ts title="三条终结路径的统一清理" note="take 让流自己完成；finalize 在 complete、error 与 unsubscribe 三条路径上都会执行。"
import { interval, of, throwError, Subscription, Subject } from "rxjs"
import { take, finalize, map } from "rxjs/operators"

const log: string[] = []
const parent = new Subscription()

// 路径一：源自行 complete，take 会替我们取消上游定时器
const auto = interval(50)
  .pipe(
    take(3),
    finalize(() => log.push("auto-clean")),
  )
  .subscribe((n) => log.push("auto-" + n))
parent.add(auto)

// 路径二：源以 error 终结，清理同样执行
const failed = throwError(() => new Error("down"))
  .pipe(finalize(() => log.push("error-clean")))
  .subscribe({ error: () => log.push("error-handled") })
parent.add(failed)

// 路径三：订阅者主动取消，不再收到值，但清理照跑
const manual = interval(50)
  .pipe(
    map((n) => n),
    finalize(() => log.push("manual-clean")),
  )
  .subscribe((n) => log.push("manual-" + n))
parent.add(manual)
setTimeout(() => manual.unsubscribe(), 120)

// 页面卸载时只需一个调用：父账本连带释放全部子订阅
const destroy$ = new Subject<void>()
destroy$.next()
parent.unsubscribe()

// 幂等：重复取消不会重复清理
parent.unsubscribe()
void of(1).subscribe()
\`\`\`

### 用最小模型把「清理恰好一次」变成可断言的事实

下面不依赖 RxJS 包，手写一个假的时钟源与资源账本，验证三件事：取消之后时间推进不再产生值、teardown 恰好执行一次、父取消会连带取消所有子订阅。

\`\`\`ts
import assert from "node:assert/strict"

type Teardown = () => void

class Account {
  private children: Account[] = []
  private done = false
  constructor(private readonly teardown: Teardown) {}
  add(child: Account) {
    if (this.done) { child.unsubscribe(); return }
    this.children.push(child)
  }
  unsubscribe() {
    if (this.done) return
    this.done = true
    for (const c of this.children) c.unsubscribe()
    this.teardown()
  }
  get closed() { return this.done }
}

/** 假的 interval：只有被订阅时才登记 listener，取消时从集合里摘掉。 */
function ticker() {
  const listeners = new Set<(n: number) => void>()
  let count = 0
  return {
    subscribe(fn: (n: number) => void) {
      listeners.add(fn)
      return new Account(() => { listeners.delete(fn) })
    },
    advance(frames: number) {
      for (let i = 0; i < frames; i++) {
        const n = count++
        for (const fn of [...listeners]) fn(n)
      }
    },
    get listenerCount() { return listeners.size },
  }
}

const clock = ticker()
let cleanups = 0
const seen: number[] = []
const sub = clock.subscribe((n) => seen.push(n))
const wrapped = new Account(() => { cleanups += 1 })
wrapped.add(sub)

clock.advance(3)
assert.deepEqual(seen, [0, 1, 2])
assert.equal(clock.listenerCount, 1)

wrapped.unsubscribe()
wrapped.unsubscribe()
assert.equal(cleanups, 1, "unsubscribe 必须幂等，清理只跑一次")
assert.equal(sub.closed, true, "父取消连带取消子订阅")
assert.equal(clock.listenerCount, 0, "teardown 必须把 listener 摘掉")

clock.advance(5)
assert.deepEqual(seen, [0, 1, 2], "取消之后推进时间不得再产生值")
\`\`\`

注意最后一处断言：它检查的不是「值有没有被界面忽略」，而是**源这一侧还有没有在登记听众**。如果只在下游加布尔量挡住回调，\`seen\` 也会保持不变，但 \`listenerCount\` 仍是 1，定时器与请求照样在跑——这正是开头那次事故用布尔量修补失败的原因。排查资源泄漏时要看「账本是否归还」，不是看「回调有没有被挡住」。

:::deep

### 为什么「流自己结束」也要清理

很多工程师能接受「主动取消要清理」，却觉得「\`of(1,2,3)\` 同步发完、什么资源都没占，清理没意义」。这个直觉在同步源上成立，但不能推广：\`take(3)\` 之所以能在第三个值后停下来，靠的正是它向上游发出取消；\`interval\` 的定时器、\`fromEvent\` 的监听器、\`WebSocket\` 的连接都是在订阅时登记的资源，即使源因为某个条件自行 \`complete\`，这些资源也不会凭空消失。把清理统一绑到「订阅关系终结」这个事件上，而不是绑到「谁决定终结」上，好处是源作者只需要登记 teardown，不必为「正常完成 / 异常 / 用户取消」写三套分支。**统一事件比统一原因更可靠**——原因是发散的，事件只有一个。

:::

:::warn

### 三个资源回收踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 组件里保存了若干子订阅，逐个手动取消 | 新增一个订阅时忘了加入取消列表，泄漏悄悄回来 | 建一个父 \`Subscription\`，全部 \`parent.add(sub)\`，卸载只调一次 \`parent.unsubscribe()\` |
| 在 \`tap\` 的 \`complete\` 回调里写清理 | 用户中途取消或路由切走时不走 \`complete\`，清理被跳过 | 用 \`finalize\`，它覆盖 complete / error / unsubscribe 三条路径 |
| 在 teardown 里发请求撤销业务操作 | 组件卸载顺带把服务端状态回滚了，刷新页面后数据不一致 | teardown 只释放本地资源（定时器、监听、连接）；业务回滚必须由显式用户动作触发 |

第三个坑是语义越界：**取消订阅表达的是「我不再接收值」，不是「我撤销了这个操作」**。把业务语义塞进资源清理，会让「关闭面板」和「撤销提交」变成同一件事，这类 bug 通常只在弱网或快速切换时复现，极难定位。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 账本视角 | 能说出 \`subscribe()\` 返回的是「资源句柄」而不是「值的容器」 |
| 三条路径 | \`complete\` / \`error\` / \`unsubscribe\` 都会触发 teardown |
| 取消语义 | 取消不向下游发通知，也不代表业务回滚 |
| 幂等 | 重复 \`unsubscribe()\` 不重复执行清理，断言可复现 |
| 泄漏判据 | 用「源侧 listener 数」而非「下游是否忽略回调」判断泄漏 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L02 冷流与热流 | 生产责任归属、三元组顺序约束 | 本课只讲资源账本，不重复冷热定义 |
| L04 自定义源 | 在 \`new Observable\` 里直接返回 teardown | 本课用 \`finalize\` 演示，不手写观察者协议 |
| L13 终结语义 | \`error\` / \`complete\` 不可逆的完整契约 | 本课只关心「终结触发清理」，不展开终结后的行为 |
| L21 泄漏排查 | 无界缓冲、\`refCount\` 失配、订阅未回收的排障清单 | 本课给出账本模型，不覆盖热流特有的泄漏源 |
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
  ),
  'theory',
)
