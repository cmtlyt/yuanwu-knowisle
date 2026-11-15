import { L, withKind } from '../../course-builders.ts'

export const L17 = withKind(
  L(
    'L17',
    4,
    'Subject：把冷流变成可多播的热源',
    3,
    ['L02'],
    ['c-subject'],
    [
      '实现一个把冷流转成多播热源的 Subject 桥并跑通',
      '写出多订阅者共享一次生产的最小模型',
      '搭好断言验证晚订阅者收不到历史值',
      '产出 Subject 使用边界清单',
    ],
    `
### 一次事故：为了少发一次请求，晚来的组件什么都没拿到

详情页有头部、侧栏、面包屑三处都要显示当前用户。原本各自订阅 \`defer(() => from(fetchUser()))\`，一次进页面发三次请求；有人把它改成模块顶层建一个 \`Subject\`，请求只发一次，再把结果 \`next\` 进去。上线后侧栏因为渲染慢永远显示骨架屏——它订阅时值已经发过了，而普通 \`Subject\` 不重放历史。团队又加了模块级变量存「上一次的用户」，手动在新订阅时补发，于是缓存与流各存一份真相，刷新后两边不一致。这节课要做的不是「选 Subject 还是选缓存」，而是**把冷流显式桥接成热源，并逐条说清这个桥承担了哪些责任**。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 多播桥解决什么 | 让 N 个订阅者共享**一次上游生产**，而不是各自触发一次 |
| 桥必须自己承担什么 | 上游何时连接、值往哪里转发、何时 complete / error、上游何时断开 |
| 晚订阅者为什么拿不到历史值 | 普通 \`Subject\` 不缓存；补值是 L18 的职责 |
| 本课不回答什么 | 订阅数归零自动断开（L19）、重放边界（L18 / L20）、泄漏排查（L21） |

### 多播桥的四项责任

| 责任 | 具体动作 | 漏掉后的现象 |
|---|---|---|
| 单次连接 | 只订阅上游一次，把值转发给所有下游 | 每个下游各触发一次请求，白改 |
| 值转发 | 上游 \`next\` → \`subject.next\` | 下游永远收不到值 |
| 终结转发 | 上游 \`complete\` / \`error\` → subject 同样终结 | 下游一直挂着，L13 的终结契约被破坏 |
| 生命周期收口 | 上游订阅句柄挂在统一的账本上（L03） | 组件卸载后上游仍在跑 |

第四项最容易被「先跑通再说」的示例省略：一个裸 \`Subject\` 加一句 \`source$.subscribe(v => subject.next(v))\`，确实能让多个组件拿到值，但那句订阅返回的句柄没人持有，页面卸载时不会取消。多播桥不是「把值广播出去」这么简单，它同时是**一份新的资源账本**，必须回答「谁创建、谁归还」。

\`\`\`ts title="把冷流显式桥接成热源" note="上游只订阅一次；终结与清理都转发；Subject 不重放历史，晚订阅者拿不到已发过的值。"
import { Observable, Subject, defer, from, Subscription } from "rxjs"
import { take, finalize, tap } from "rxjs/operators"

type User = { id: string; name: string }

const fetchUser = (): Promise<User> => Promise.resolve({ id: "u1", name: "Ada" })

/** 一个显式多播桥：连接一次，值 / 终结 / 清理全部转发。 */
function multicastOnce<T>(source: Observable<T>) {
  const subject = new Subject<T>()
  const ledger = new Subscription()
  let connected = false

  return {
    stream: subject.asObservable(),
    connect(): void {
      if (connected) return
      connected = true
      ledger.add(
        source.subscribe({
          next: (v) => subject.next(v),
          error: (e) => subject.error(e),
          complete: () => subject.complete(),
        }),
      )
    },
    dispose(): void {
      ledger.unsubscribe()
      subject.complete()
    },
  }
}

const cold$ = defer(() => from(fetchUser()))
const bridge = multicastOnce(cold$)
bridge.connect()

bridge.stream.subscribe((u) => console.log("header", u.name))
bridge.stream.subscribe((u) => console.log("breadcrumb", u.name))

// 晚订阅者：此时上游早已 complete，Subject 已终结，一个值都拿不到
bridge.stream.subscribe({
  next: (u) => console.log("sidebar", u.name),
  complete: () => console.log("sidebar: completed with no value"),
})

// 页面卸载时统一归还；真实项目里应挂在组件生命周期上
bridge.dispose()

// 对照：不桥接时每个订阅者各自触发一次工厂
let calls = 0
const perSubscriber$ = defer(() => {
  calls += 1
  return from(fetchUser())
})
perSubscriber$.pipe(take(1), tap((u) => console.log(u.id))).subscribe()
perSubscriber$.pipe(take(1), finalize(() => console.log("calls", calls))).subscribe()
\`\`\`

### 用最小模型把「共享一次生产」变成可断言的事实

下面不依赖 RxJS 包，实现一个最小多播桥：记录上游连接次数、每个订阅者收到的序列，并断言晚订阅者缺历史值、终结后新订阅者立刻完成、下游取消不影响其他订阅者。

\`\`\`ts
import assert from "node:assert/strict"

class MiniSubject<T> {
  private listeners = new Map<(v: T) => void, (() => void) | undefined>()
  private completed = false
  subscribe(fn: (v: T) => void, onComplete?: () => void): () => void {
    if (this.completed) { onComplete?.(); return () => {} }
    this.listeners.set(fn, onComplete)
    return () => this.listeners.delete(fn)
  }
  next(v: T) {
    if (this.completed) return
    for (const fn of [...this.listeners.keys()]) fn(v)
  }
  complete() {
    if (this.completed) return
    this.completed = true
    for (const cb of this.listeners.values()) cb?.()
    this.listeners.clear()
  }
  get listenerCount() { return this.listeners.size }
}

function bridge<T>(items: T[]) {
  const subject = new MiniSubject<T>()
  let connects = 0
  return {
    subject,
    connect() {
      connects += 1
      for (const v of items) subject.next(v)
      subject.complete()
    },
    get connects() { return connects },
  }
}

const b = bridge([1, 2, 3])
const earlyA: number[] = []
const earlyB: number[] = []
let completedA = false
let completedB = false
b.subject.subscribe((v) => earlyA.push(v), () => { completedA = true })
b.subject.subscribe((v) => earlyB.push(v), () => { completedB = true })
b.connect()

assert.equal(b.connects, 1, "上游只连接一次")
assert.deepEqual(earlyA, [1, 2, 3])
assert.deepEqual(earlyB, [1, 2, 3], "两个订阅者共享同一条序列")
assert.equal(completedA, true, "终结通知要转发给所有下游")
assert.equal(completedB, true)
assert.equal(b.subject.listenerCount, 0, "complete 后听众被清空")

// 晚订阅者：不重放历史，只收到立刻完成
const late: number[] = []
let lateCompleted = false
b.subject.subscribe((v) => late.push(v), () => { lateCompleted = true })
assert.deepEqual(late, [], "普通 Subject 不补历史值")
assert.equal(lateCompleted, true)

// 取消一个下游不影响另一个（终结前）
const b2 = bridge([1, 2])
const a2: number[] = []
const c2: number[] = []
const off = b2.subject.subscribe((v) => a2.push(v))
b2.subject.subscribe((v) => c2.push(v))
off()
b2.subject.next(9)
assert.deepEqual(a2, [], "被取消的订阅者不再收值")
assert.deepEqual(c2, [9], "其他订阅者不受影响")
\`\`\`

最后一组断言把「多播」与「广播」的边界写清楚：取消只摘掉一个听众，不关掉整条生产。至于「所有听众都离开后要不要断开上游」，裸 \`Subject\` 完全不管——这正是 L19 的 \`refCount\` 要解决的问题。把本课的模型与 L19 的模型对照读，能看出两者只差一个订阅计数，却决定了长期运行的连接会不会泄漏。

### 一次多播的完整推演

| 步骤 | 动作 | 上游连接数 | Subject 听众数 | 各订阅者收到 |
|---|---|---|---|---|
| 1 | 头部订阅 | 0 | 1 | 无（还没连接） |
| 2 | 侧栏订阅 | 0 | 2 | 无 |
| 3 | \`connect()\` 执行工厂 | 1 | 2 | 无（等待异步结果） |
| 4 | 上游 \`next(u)\` | 1 | 2 | 头部 u、侧栏 u |
| 5 | 上游 \`complete()\` | 1 | 0 | 两者各收到 complete |
| 6 | 面包屑订阅 | 1 | 0 | 立刻 complete，无值 |

第 6 步就是事故现场：**「共享」与「补历史」是两件事**。多播桥只解决前者；要覆盖后者，要么让桥具备重放能力（L18 的状态型 Subject、L20 的 \`shareReplay\`），要么让晚来的组件主动从缓存读取。把这两件事分开，就不会出现「模块级变量 + Subject」那种双真相补丁。

### 多播桥评审清单

| 评审项 | 要问的问题 | 不通过时的后果 |
|---|---|---|
| 单次连接 | 上游是否只订阅一次 | 每个下游各发一次请求，优化无效 |
| 终结转发 | complete / error 是否传下去 | 下游挂住或错误被吞 |
| 清理句柄 | 上游订阅是否挂在账本上 | 组件卸载后请求 / 定时器常驻（L21） |
| 晚订阅语义 | 是否明确「不补历史」 | 侧栏、面包屑显示骨架屏 |
| 断开策略 | 听众归零后上游是否断开 | 长连接永久占用（L19） |

:::deep

### 为什么多播不是「把冷流改成热流」这么一句话

L02 说过冷热描述的是**生产与订阅的因果关系**。冷源的生产由订阅触发，热源的订阅只是接入。手工桥接时，你实际上引入了一个中间人：它自己订阅冷源（触发一次生产），再把值转发给任意多个下游。于是「上游是冷的」这件事并没有变，变的是**下游看到的是热的**。这个区分很实用：上游仍保有 \`defer\` 的重算能力，只要桥愿意重新连接（L19 的 refCount 归零重连）就能再执行一次工厂；而下游看到的序列不补历史、不因新增订阅者重算。把「上游冷、下游热」这一层中间人画出来，L19 的「重连即重请求」、L20 的「一次 error 永久终结」都不再是意外，都是这个结构的直接后果。反过来，如果把工厂提到模块顶层、把结果固化成常量再广播，就同时丢掉了重算能力，回到 L02 那个「重试空转」的坑。

:::

:::warn

### 三个多播桥踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 直接 \`source$.subscribe(v => subject.next(v))\` 不保存句柄 | 页面卸载后上游仍在跑，请求与定时器堆积 | 把上游订阅加入父 \`Subscription\`，卸载时统一 \`unsubscribe()\` |
| 用普通 \`Subject\` 给「当前用户」这类状态建模 | 晚挂载组件拿不到值，只能靠外部变量补 | 用 \`BehaviorSubject\` / \`ReplaySubject\`（L18）或 \`shareReplay\`（L20） |
| 上游 \`error\` 时只打日志、不 \`subject.error(e)\` | 下游永远不终结，进度条卡住 | 三条通道一起转发，保持 L13 的终结契约 |

第三条尤其容易在「先接住错误再说」的代码里出现：桥的作者觉得「一个组件失败不该影响别人」，于是把 error 吞了。但 L15 已经说明共享结构会把错误也共享，正确做法是在桥之前把那一路兜底掉，而不是让所有下游永远等一个不会来的终结通知。

:::

### 一次桥接改造的落地顺序

| 顺序 | 改动 | 为什么放这一步 | 验收 |
|---|---|---|---|
| 1 | 先把源包进 defer | 保住每次连接都能重算（L02） | 连续 connect 两次得到不同结果 |
| 2 | 建 Subject 与父账本 | 值与资源各有归属 | 上游订阅句柄可统一释放 |
| 3 | 转发 next / error / complete | 保持终结契约（L13） | 下游都能收到 complete |
| 4 | 再接下游组件 | 避免边写边调 | 两个组件序列一致 |
| 5 | 最后决定补值与断开 | 这两项属于 L18 / L19 | 首帧行为与重连次数符合预期 |

把顺序固定下来的原因是每一步都依赖前一步的正确性。第 1 步若跳过，后面所有「重连能拿到新数据」的验收都会失败，却很容易被误判成 Subject 的问题；第 3 步若漏掉 error 转发，下游会永远挂着，排查时又会先怀疑网络而不是桥。第 5 步刻意留到最后，是因为「要不要补历史值」与「归零要不要断开」是两组独立决策，提前混进来会让一次改造同时改三个变量，出问题后无法定位。能用一次只改一个变量的顺序，就不要一次改三个——这也是本阶段五课一直把「连接 / 重放 / 断开」拆开讲的原因。

### 验收清单

| 检查 | 判据 |
|---|---|
| 单次生产 | 断言上游连接次数为 1，两个订阅者序列相同 |
| 终结转发 | complete 后听众数归零，晚订阅者立刻完成 |
| 不重放 | 晚订阅者收到零个值 |
| 隔离取消 | 取消一个下游不影响另一个 |
| 资源账本 | 上游订阅句柄被保存并可统一释放 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L02 冷流与热流 | 生产责任归属与三元组契约 | 本课把冷源显式桥成热源，不重讲冷热定义 |
| L03 资源账本 | Subscription 树与 teardown | 本课把账本应用到一次桥接 |
| L18 状态型 Subject | 重放与初始值语义 | 本课明确「普通 Subject 不补历史」 |
| L19 连接共享 | \`share\` / refCount 自动连接与断开 | 本课的 \`connect()\` 是手动的，不计订阅数 |
| L21 泄漏排查 | 订阅未回收的排障清单 | 本课只给出账本，不做探针 |
`,
    'rxSubject',
    [
      {
        text: 'Subject 同时具备哪两种身份？',
        options: ['只是 Observer', '只是 Observable', '既是被订阅的源，又是可推数据的观察者', '只是定时器'],
        answer: 2,
        explain: 'Subject 双身份：能 next()（观察者）又能 subscribe()（可观察），这是它能做多播广播的原因。',
        concept: 'c-subject',
      },
      {
        text: '普通 Subject 晚到的订阅者能拿到之前发过的值吗？',
        options: ['能，自动重放', '不能，不保存历史', '只能拿最后一个', '拿前 5 个'],
        answer: 1,
        explain: '普通 Subject 不存历史；要「拿最近值」用 BehaviorSubject，「拿最近 N 个」用 ReplaySubject。',
        concept: 'c-subject',
      },
      {
        text: '一个 Subject 调用了 complete() 之后，再继续 next() 会发生什么？',
        options: [
          '继续正常发出',
          'next 被忽略（已终止），且 complete 已传播给所有订阅者并终结流',
          '抛 JS 异常',
          '自动重开',
        ],
        answer: 1,
        explain:
          'error/complete 会传播给全部订阅者并让 Subject 进入终止态，之后再 next 无效。这是「热流也会终结」的陷阱，与「晚到无历史」是不同面向。',
        concept: 'c-subject',
      },
    ],
    [
      ['Subject', '既是 Observer 又是 Observable，可多播'],
      ['多播', '一条源被多个订阅者共享'],
    ],
    [
      '以为普通 Subject 会重放历史（它不会，需行为/回放型）。',
      '把 Subject 当冷源，期待每次订阅都「从头」重放。',
    ],
  ),
  'practice',
)
