import { L, withKind } from '../../course-builders.ts'

export const L19 = withKind(
  L(
    'L19',
    4,
    '连接共享：publish / multicast / share 与 refCount',
    3,
    ['L17'],
    ['c-share'],
    [
      '实现基于 share 的共享链并跑通自动连接与断开',
      '写出订阅计数变化的观测模型',
      '搭好断言验证 refCount 归零后源被断开',
      '产出一份重连是否重发请求的评审清单',
    ],
    `
### 一次事故：所有组件都卸载了，轮询还在跑

上一课的手动多播桥上线后又出了新问题：用户从详情页切回列表页，头部、侧栏、面包屑全部卸载，上游那条每秒一次的轮询却没有停。裸 \`Subject\` 不知道「现在还有几个听众」，桥的作者也没在卸载时判断订阅数，于是连接一直挂着；切十几次页面就积累十几个轮询。有人提议在每个组件卸载时手动调 \`dispose()\`，但「最后一个离开的人负责关灯」这种约定极其脆弱，少写一处就泄漏。这节课把「订阅计数」交给共享算子：**有人订阅就连接、人数归零就断开**，并把「断开之后要不要保留缓存」变成一个显式配置。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| refCount 数的是什么 | 当前活跃的**下游订阅者数量**，不是业务对象引用数 |
| 归零会发生什么 | 默认断开上游、触发 teardown；再次订阅会重新连接 |
| 想让连接常驻怎么办 | 关闭归零重置（常驻共享），但要自己承担资源生命周期 |
| \`publish\` / \`multicast\` 呢 | 6.x 时代的手工连接 API，7.8.2 由 \`share\` / \`shareReplay\` 取代，新代码不要引入 |

### 连接策略对照表

| 策略 | 首次订阅 | 归零时 | 再次订阅 | 晚订阅者 | 风险 |
|---|---|---|---|---|---|
| 裸 \`Subject\` 桥（L17） | 手动 connect | 不断开 | 复用已终结的桥 | 不补值 | 连接永久占用 |
| \`share()\` | 自动连接 | 断开、清空 | 重新执行源 | 不补值 | 昂贵源会重发请求 |
| \`shareReplay({ bufferSize: 1, refCount: true })\` | 自动连接 | 断开 | 重新执行源 | 补最近 1 个 | 归零窗口内缓存也丢 |
| \`shareReplay({ bufferSize: 1, refCount: false })\` | 自动连接 | **不断开** | 复用缓存 | 补最近 1 个 | 上游常驻，需自行收口 |

第二行与第三行的「重新执行源」是同一个特性：\`share()\` 的默认归零重置会让冷源工厂再跑一遍。如果源是 \`defer(() => from(fetchUser()))\`，这意味着一次真实的网络重发。要避免重发，就得选常驻策略，代价是上游连接在整个应用生命周期内都不释放。**没有「既不重发又自动断开」的免费选项**，这两者必须按业务取舍。

\`\`\`ts title="refCount 驱动的自动连接与断开" note="publish / multicast 是 6.x 手工连接 API，7.8.2 用 share / shareReplay 表达同样的连接策略。"
import { defer, from, interval, of, timer } from "rxjs"
import { share, shareReplay, take, tap, finalize } from "rxjs/operators"

type User = { id: string; name: string }
const fetchUser = (): Promise<User> => Promise.resolve({ id: "u1", name: "Ada" })

let requests = 0
const user$ = defer(() => {
  requests += 1
  return from(fetchUser())
}).pipe(
  finalize(() => console.log("upstream teardown")),
  share(), // 订阅数归零即断开，再订阅会重发请求
)

const s1 = user$.subscribe((u) => console.log("header", u.name))
const s2 = user$.subscribe((u) => console.log("sidebar", u.name))
s1.unsubscribe()
s2.unsubscribe() // 最后一个离开，触发 teardown
const s3 = user$.subscribe((u) => console.log("header-again", u.name))
console.log("requests after reconnect", requests)
s3.unsubscribe()

// 常驻共享：归零不断开，晚订阅者补最近 1 个值
const state$ = defer(() => {
  console.log("state source runs once")
  return of({ theme: "dark" })
}).pipe(shareReplay({ bufferSize: 1, refCount: false }))
state$.subscribe(console.log)
state$.subscribe(console.log) // 不重跑源，直接拿缓存

// 有界热流：take 会让源自行 complete，避免常驻定时器
const ticks$ = interval(100).pipe(
  take(4),
  tap((n) => console.log("tick", n)),
  share(),
)
ticks$.subscribe()
ticks$.subscribe()

void timer(0).subscribe()
\`\`\`

### 用最小模型把「订阅计数」变成可断言的事实

下面不依赖 RxJS 包，实现一个共享连接：记录源执行次数、活跃订阅者数、缓存，并断言「两个订阅者只跑一次源」「归零断开」「重连重跑」「常驻不重跑」「重放补值」五件事。

\`\`\`ts
import assert from "node:assert/strict"

type Opts = { resetOnZero: boolean; replay: boolean }
let nextId = 0

class Shared<T> {
  private listeners = new Map<number, (v: T) => void>()
  private started = false
  private cache: T[] = []
  sourceRuns = 0
  constructor(private readonly source: () => T[], private readonly opts: Opts) {}

  subscribe(fn: (v: T) => void): () => void {
    const id = ++nextId
    this.listeners.set(id, fn)
    if (this.opts.replay && this.started) {
      for (const v of this.cache) fn(v)
    }
    if (!this.started) this.start()
    return () => {
      this.listeners.delete(id)
      if (this.listeners.size === 0 && this.opts.resetOnZero) {
        this.started = false
        this.cache = []
      }
    }
  }

  private start(): void {
    this.started = true
    this.sourceRuns += 1
    for (const v of this.source()) {
      this.cache.push(v)
      for (const fn of this.listeners.values()) fn(v)
    }
  }

  get count() { return this.listeners.size }
  get connected() { return this.started }
}

const make = (opts: Opts) => new Shared<number>(() => [1, 2, 3], opts)

// ① 两个订阅者只跑一次源
const a = make({ resetOnZero: true, replay: false })
const a1: number[] = []
const a2: number[] = []
const off1 = a.subscribe((v) => a1.push(v))
const off2 = a.subscribe((v) => a2.push(v))
assert.equal(a.sourceRuns, 1)
assert.equal(a.count, 2)
assert.deepEqual(a1, [1, 2, 3])
assert.deepEqual(a2, [1, 2, 3])

// ② 归零断开；重连重新执行源
off1()
assert.equal(a.count, 1)
assert.equal(a.sourceRuns, 1, "还有人订阅，不能断开")
off2()
assert.equal(a.count, 0)
assert.equal(a.connected, false, "归零必须断开")
const a3: number[] = []
const off3 = a.subscribe((v) => a3.push(v))
assert.equal(a.sourceRuns, 2, "重连 = 源再跑一次（昂贵源即重发请求）")
assert.deepEqual(a3, [1, 2, 3])
off3()

// ③ 常驻策略：归零不断开，重订不重跑
const b = make({ resetOnZero: false, replay: true })
const b1: number[] = []
const offB1 = b.subscribe((v) => b1.push(v))
offB1()
assert.equal(b.connected, true)
const b2: number[] = []
b.subscribe((v) => b2.push(v))
assert.equal(b.sourceRuns, 1, "常驻共享不会重跑源")
assert.deepEqual(b2, [1, 2, 3], "重放把缓存交给晚订阅者")

// ④ 不重放时，晚订阅者拿不到历史
const c = make({ resetOnZero: false, replay: false })
c.subscribe(() => {})
const c2: number[] = []
c.subscribe((v) => c2.push(v))
assert.deepEqual(c2, [], "share() 不重放历史（L17）")
\`\`\`

\`off1()\` 之后 \`sourceRuns\` 仍为 1 的断言很关键：它把「只在最后一个人离开时断开」写死了。若实现写成「任一订阅者取消就断开」，第一个组件卸载就会让第二个组件拿不到后续值。反过来，若忘了在归零时把 \`started\` 置回 false，重连时 \`start()\` 永远不会被调用，新订阅者什么都收不到——这类「看似共享、实则僵死」的 bug 只能靠上面的重连断言发现。

### 一次连接生命周期的完整推演

以「头部 0ms 订阅、侧栏 50ms 订阅、头部 200ms 卸载、侧栏 300ms 卸载、列表页 400ms 重新订阅」为例：

| 时刻 | 动作 | 活跃订阅者 | 上游连接 | 源执行次数 | 说明 |
|---|---|---|---|---|---|
| 0 | 头部订阅 | 1 | 已连接 | 1 | 首次订阅触发工厂 |
| 50 | 侧栏订阅 | 2 | 已连接 | 1 | 不重跑源 |
| 200 | 头部卸载 | 1 | 已连接 | 1 | 还有人，不能断开 |
| 300 | 侧栏卸载 | 0 | **断开** | 1 | 触发 teardown |
| 400 | 列表页订阅 | 1 | 重新连接 | 2 | 冷源工厂再跑一次 |

第 300ms 到第 400ms 之间的空窗，就是「重连即重请求」的来源。业务上若不能接受这一次重发，只有两条路：把 \`refCount\` 关掉让连接常驻（然后自己负责收口），或者在归零与重连之间加一层缓存并明确它的有效期。把它当成 \`share()\` 的 bug 去「修」是没有意义的——这是它按订阅数管理连接的正常行为，L20 会展开它的三类边界。

### 共享策略评审清单

| 评审项 | 要问的问题 | 不通过时的后果 |
|---|---|---|
| 归零策略 | 最后一个订阅者离开后要不要断开 | 不断开则连接常驻、反复切页泄漏 |
| 重发成本 | 重新执行源会不会重发请求 / 重复副作用 | 一次切页触发一次真实写入 |
| 缓存有效期 | 重放值在多长时间内可信 | 拿到过期用户态或主题值 |
| 错误共享 | 源 error 后所有订阅者是否一起终结 | 一次失败让后续订阅者立刻终结（L20） |
| 收口责任 | 常驻策略由谁在应用退出时释放 | 上游定时器 / 监听永不归还（L21） |
| 版本口径 | 是否还在用 6.x 的 publish / multicast 手工连接 | 代码与 7.8.2 的 share 语义不一致 |

:::deep

### refCount 数的是订阅者，不是业务引用

「订阅数归零」听起来像引用计数，但它数的只是**当前订阅这条结果流的观察者**，与业务上「还有几个地方在用这份数据」没有关系。一个组件因为条件渲染临时取消订阅、一个路由切换时的空窗、一次 Suspense 重挂载，都会让计数瞬间归零，进而触发断开与重连。因此把 \`share()\` 用在昂贵或有副作用的源上，必须接受「重连次数可能远多于业务操作次数」。这也是为什么状态类数据更适合 \`BehaviorSubject\` 或常驻 \`shareReplay\`：它们把「连接」与「订阅者数量」解耦，用显式的生命周期换稳定性。理解这一点之后，\`resetOnRefCountZero\` 这类 7.8.2 配置项的含义就不难了——它决定的正是「计数归零时把共享状态重置到什么程度」，而旧资料里 \`share({ refCount })\` 的写法属于 6.x 口径，\`shareReplay\` 仍保留 \`refCount\` 选项，两者不要混着抄。

:::

:::warn

### 三个连接共享踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 昂贵源直接 \`share()\` | 切一次页面重发一次请求，QPS 随导航次数增长 | 关掉归零重置，或把缓存与有效期一起建模 |
| 以为 \`share()\` 会给晚订阅者补值 | 晚挂载组件拿到空状态 | 用 \`shareReplay({ bufferSize: 1, ... })\` 或 \`BehaviorSubject\`（L18） |
| 继续用 6.x 的 \`publish().refCount()\` 写法 | 与 7.8.2 的 \`share\` 语义不一致，升级时失效 | 统一用 \`share()\` / \`shareReplay(...)\`，历史 API 只作对照 |

第二条在 SPA 里几乎必然出现：路由切换后新组件订阅的是一条已经跑过的共享流，\`share()\` 不重放，于是首帧空白。判断方法很简单——问「这条流在订阅之前有没有可能已经发过值」，答案是有，就必须选带重放的策略。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 单次生产 | 两个订阅者只触发一次源执行 |
| 归零判定 | 还有订阅者时不断开；最后一个离开才断开 |
| 重连语义 | 归零后重新订阅，源执行次数 +1 |
| 常驻语义 | 关闭归零重置后，重订不重跑源 |
| 重放边界 | replay 开时晚订阅者补缓存，关时不补 |
| 版本口径 | 代码块只用 \`share\` / \`shareReplay\`，不引入 publish / multicast |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L17 Subject 多播 | 手动桥接的四项责任与资源账本 | 本课把 connect 交给订阅计数自动化 |
| L18 状态型 Subject | 四种重放语义与缓冲上限 | 本课只决定「是否补值」，不展开 Subject 家族 |
| L20 share 陷阱 | 连接 / 断开 / 重放三类边界与负例 | 本课给出正常生命周期，不展开异常边界 |
| L21 泄漏排查 | 订阅未回收的探针与排障清单 | 本课只保证归零自动断开 |
| L03 资源账本 | teardown 与 unsubscribe 幂等 | 本课把 teardown 绑到订阅数归零 |
`,
    'rxShare',
    [
      {
        text: '多组件共用同一昂贵源，避免重复请求，最常用？',
        options: ['各写一份 from()', 'share（让 N 个订阅者连接一条上游）', 'concat', 'reduce'],
        answer: 1,
        explain: 'share 把源「连接共享」：第一个订阅者建立上游，后续订阅者复用，最后一个取消才断开。',
        concept: 'c-share',
      },
      {
        text: 'refCount: true 的作用是？',
        options: ['限制并发数', '订阅者计数归零时自动断开上游', '重放历史', '缓存结果'],
        answer: 1,
        explain: 'refCount 让共享流「有订阅者才连接、无人订阅就断开」，避免无人消费时上游还在跑。',
        concept: 'c-share',
      },
      {
        text: 'N 个组件订阅同一份 interval(1000).pipe(share({ refCount: true }))，上游源执行几次？',
        options: ['N 次（每人一次）', '1 次（共享一条上游连接）', '0 次', 'N² 次'],
        answer: 1,
        explain:
          'share 把 N 个订阅者接到同一条上游，源只执行 1 次；refCount 在订阅数归零时自动断开，再次订阅才重建。',
        concept: 'c-share',
      },
    ],
    [
      ['multicast', '让一条源被多订阅者共享'],
      ['refCount', '按订阅者计数自动连接/断开'],
    ],
    [
      '每个组件各自 from(request) 发起重复请求（应使用 share 共享）。',
      '用 share() 期待重放历史，结果晚订阅者状态缺失（应使用 shareReplay/BehaviorSubject）。',
    ],
  ),
  'practice',
)
