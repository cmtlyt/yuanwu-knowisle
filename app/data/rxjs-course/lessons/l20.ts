import { L, withKind } from '../../course-builders.ts'

export const L20 = withKind(
  L(
    'L20',
    4,
    'share 的陷阱：连接、断开与重放边界',
    3,
    ['L19'],
    ['c-share-pitfall'],
    [
      '实现复现连接 / 断开 / 重放三类边界的最小用例',
      '写出一个负例断言抓出「重连即重请求」',
      '搭好 shareReplay 配置对照并跑通',
      '产出一份配置决策表',
    ],
    `
### 一次事故：切一次页面，多一次扣款

共享用户信息流用了 \`share()\`，源是「读取并上报一次活跃事件」的请求。产品同学发现活跃数据虚高：用户每次从详情页退回列表页，\`share()\` 的订阅数归零又重连，请求就重发一次，上报也就多一条。同一周还出了两个相关问题：某次接口 500 之后，共享流永久终结，后面所有新订阅者一进来就收到错误；另一个页面用不带上限的重放缓冲，运行几小时后内存翻倍。三件事看起来毫不相干，其实都是**同一个共享结构的三类边界没被显式配置**：连接怎么建立、归零怎么断开、终结与历史怎么保留。这节课专门把这三类边界写成可失败的断言。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 重连重发请求是 bug 吗 | 不是，是 \`share()\` 的默认语义；要么接受，要么关掉归零重置 |
| 共享流 error 之后会怎样 | 对所有当前订阅者终结，且后续新订阅者也立刻终结，不会自愈 |
| 重放缓冲要不要上限 | 必须给；无界缓冲是长期热流最稳定的内存泄漏源 |
| 三类边界如何验收 | 各写一条负例断言：重连次数、永久终结、缓冲上限 |

### 三类边界对照表

| 边界 | 默认行为 | 显式配置 | 不做配置的后果 |
|---|---|---|---|
| 连接 | 首个订阅者触发源 | \`share()\` 自动连接 | 手工桥接时可能永远不连或连多次 |
| 断开 | 订阅数归零即断开 | 关闭归零重置可常驻 | 切页重发请求 / 上游永久占用 |
| 重放 | \`share()\` 不重放 | \`shareReplay({ bufferSize, refCount })\` | 晚挂载组件首帧空白 |
| 终结 | 一次 error 永久终结共享结果流 | 在 \`share\` 之前兜底（L15） | 后续所有订阅者一起失败 |
| 缓冲容量 | \`shareReplay\` 默认按配置 | 显式给 \`bufferSize\` | 无界增长，重放越来越慢 |

第三行与第四行要连起来看：\`shareReplay\` 让晚订阅者补值，但也把「一次 error」的影响面放大到所有未来订阅者。想要「某次失败不毁掉整个共享状态」，必须在共享之前把那一路错误消化掉，而不是在下游给每个组件各加一个 \`catchError\`——后者只保护自己，共享结果流本身已经终结了（L15）。

\`\`\`ts title="三类边界的 7.8.2 配置" note="refCount 决定归零是否断开；bufferSize 决定重放上限；兜底必须放在 share 之前。"
import { defer, from, interval, of, throwError } from "rxjs"
import { share, shareReplay, catchError, take, finalize, tap } from "rxjs/operators"

type State = { theme: string; degraded: boolean }

let connects = 0
const loadState = () => defer(() => {
  connects += 1
  return from(Promise.resolve<State>({ theme: "dark", degraded: false }))
})

// ① 归零即断开：切页会重连（connects 递增），适合可接受重发的数据
const ephemeral$ = loadState().pipe(
  finalize(() => console.log("teardown")),
  share(),
)

// ② 常驻 + 有界重放：不重连、晚订阅者补最近 1 个
const persistent$ = loadState().pipe(
  shareReplay({ bufferSize: 1, refCount: false }),
)

// ③ 错误在共享之前兜底：共享结果流不会因一次失败永久终结
const resilient$ = loadState().pipe(
  catchError(() => of<State>({ theme: "light", degraded: true })),
  shareReplay({ bufferSize: 1, refCount: false }),
)

// ④ 无界重放的反面教材：长流上必须给 bufferSize 或 take
const boundedTicks$ = interval(50).pipe(
  take(6),
  tap((n) => console.log("tick", n)),
  shareReplay({ bufferSize: 2, refCount: true }),
)

ephemeral$.subscribe(console.log)
persistent$.subscribe(console.log)
resilient$.subscribe(console.log)
boundedTicks$.subscribe()

void throwError(() => new Error("unused")).pipe(catchError(() => of(0))).subscribe()
\`\`\`

### 用最小模型把三类边界变成可失败的断言

下面不依赖 RxJS 包，实现带终结状态与缓冲上限的共享连接，然后写三条负例断言：重连必然重跑源、error 之后新订阅者立刻终结、无界缓冲超过阈值会被检查器抓到。

\`\`\`ts
import assert from "node:assert/strict"

type Opts = { resetOnZero: boolean; bufferSize: number }
let nextId = 0

class SharedState<T> {
  private listeners = new Map<number, (v: T) => void>()
  private buffer: T[] = []
  private started = false
  private terminated = false
  private terminalError: string | null = null
  sourceRuns = 0
  constructor(private readonly source: () => T[], private readonly opts: Opts) {}

  subscribe(fn: (v: T) => void, onError?: (e: string) => void): () => void {
    if (this.terminated) {
      onError?.(this.terminalError ?? "terminated")
      return () => {}
    }
    const id = ++nextId
    this.listeners.set(id, fn)
    for (const v of this.buffer) fn(v) // 重放
    if (!this.started) this.start()
    return () => {
      this.listeners.delete(id)
      if (this.listeners.size === 0 && this.opts.resetOnZero) {
        this.started = false
        this.buffer = []
      }
    }
  }

  private start(): void {
    this.started = true
    this.sourceRuns += 1
    for (const v of this.source()) this.push(v)
  }

  push(v: T): void {
    if (this.terminated) return
    this.buffer.push(v)
    if (this.opts.bufferSize < Number.POSITIVE_INFINITY) {
      this.buffer = this.buffer.slice(-this.opts.bufferSize)
    }
    for (const fn of this.listeners.values()) fn(v)
  }

  fail(message: string): void {
    this.terminated = true
    this.terminalError = message
    this.listeners.clear()
  }

  get bufferLength() { return this.buffer.length }
  get count() { return this.listeners.size }
}

/** 检查器：缓冲必须落在显式上限内。 */
function assertBufferBounded<T>(state: SharedState<T>, max: number): void {
  assert.ok(state.bufferLength <= max, "重放缓冲超过上限，长期热流会持续增长")
}

// 负例一：归零重置必然重跑源
const ephemeral = new SharedState<number>(() => [1, 2], { resetOnZero: true, bufferSize: 1 })
const off1 = ephemeral.subscribe(() => {})
off1()
assert.equal(ephemeral.sourceRuns, 1)
const off2 = ephemeral.subscribe(() => {})
assert.equal(ephemeral.sourceRuns, 2, "重连 = 源再跑一次；昂贵源即重发请求")
off2()

// 常驻配置不重跑
const persistent = new SharedState<number>(() => [1, 2], { resetOnZero: false, bufferSize: 1 })
persistent.subscribe(() => {})()
persistent.subscribe(() => {})
assert.equal(persistent.sourceRuns, 1, "关掉归零重置后连接常驻")

// 负例二：共享流 error 之后永久终结，新订阅者立刻收到错误
persistent.fail("500")
let lateError: string | null = null
persistent.subscribe(() => {}, (e) => { lateError = e })
assert.equal(lateError, "500", "后续订阅者不会自愈，只会立刻终结")
assert.equal(persistent.count, 0)

// 负例三：无界缓冲增长；有界缓冲被检查器放行
const unbounded = new SharedState<number>(() => [], {
  resetOnZero: false,
  bufferSize: Number.POSITIVE_INFINITY,
})
for (let i = 0; i < 50; i++) unbounded.push(i)
assert.equal(unbounded.bufferLength, 50)
assert.throws(() => assertBufferBounded(unbounded, 10), /超过上限/)
const bounded = new SharedState<number>(() => [], { resetOnZero: false, bufferSize: 2 })
for (let i = 0; i < 50; i++) bounded.push(i)
assert.equal(bounded.bufferLength, 2)
assert.doesNotThrow(() => assertBufferBounded(bounded, 10))
\`\`\`

三条负例分别对应开头那三类事故。\`assertBufferBounded\` 尤其值得单独留着：它不依赖内存采样，也不需要跑几小时，只要把上限写成参数，就能在测试里第一时间发现「有人用了无界重放」。这类检查器比事后看监控曲线便宜得多。

### 一次切页事件的完整推演

以「详情页挂载 → 切走 → 重新进入 → 期间发生一次 500」为例，对比两种配置：

| 步骤 | \`share()\` 归零重置 | 常驻 \`shareReplay\` | 未兜底的共享流 |
|---|---|---|---|
| 首次挂载 | 跑源一次 | 跑源一次 | 跑源一次 |
| 切走（归零） | 断开、清缓存 | 不断开、保留缓存 | 断开 |
| 重新进入 | **重跑源，重发请求** | 直接给缓存 | 重跑源 |
| 期间 500 | 当前订阅者失败 | 当前订阅者失败 | 结果流永久终结 |
| 之后再订阅 | 可重新连接、可能成功 | 立刻终结、不自愈 | 立刻终结 |

倒数第二列是最反直觉的一行：常驻共享在「平时」更省请求，但一次错误会让它**永久不可用**，因为连接没断开、终结状态也没被重置。要兼顾两者，必须在共享之前兜底（示例里的 \`resilient$\`），让错误根本不进入共享结果流。换句话说：**错误隔离的位置决定了共享流的寿命**。

### 配置决策表

| 业务约束 | 推荐配置 | 必须补的保护 |
|---|---|---|
| 数据可随时重取、允许切页重发 | \`share()\` | 无 |
| 昂贵请求、不能重发 | \`shareReplay({ bufferSize: 1, refCount: false })\` | 缓存有效期、应用退出时收口 |
| 晚挂载组件必须有首帧值 | 带 \`bufferSize\` 的重放 | 缓冲上限、哨兵值识别（L16） |
| 一次失败不能毁掉全局 | 在 \`share\` 之前 \`catchError\` | 降级标记（L14） |
| 长流、高频推送 | 有界重放 + \`take\` / 超时 | 缓冲上限检查器 |

:::deep

### 重连是特性，不是 bug

\`share()\` 按订阅数管理连接，归零断开、再来重连，这个行为让「没人看的时候不占资源」成为可能，也正是它比裸 \`Subject\` 桥更安全的理由。把它当成 bug 去「修」，通常会导致两种更糟的结果：一是关掉归零重置让连接常驻，于是必须自己补一套生命周期收口；二是在源外层加缓存让重连不重发，于是缓存与流各存一份真相（L17 那个模块级变量补丁）。正确做法是承认这是特性，然后在业务层明确回答「这次重发能不能接受」：能，就用默认；不能，就选常驻并承担收口责任；不确定，就把重发次数做成指标，让数据说话。**配置的本质是选择代价，不是消除代价**。

:::

:::warn

### 三个共享边界踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 昂贵 / 有副作用的源直接 \`share()\` | 切一次页面重发一次请求，上报或写入重复 | 关掉归零重置，或把副作用从源工厂里移出去 |
| 共享流 error 后指望新订阅者能重试 | 新订阅者立刻终结，且没有日志 | 在 \`share\` 之前 \`catchError\`；必要时把重置也显式建模 |
| \`shareReplay()\` 不设 \`bufferSize\` | 高频热流内存与首帧重放耗时持续增长 | 一律给 \`bufferSize\`，并用 \`assertBufferBounded\` 守住 |

第二条还有个隐蔽变体：只在某个组件的 \`pipe\` 里加 \`catchError\`，共享结果流仍然已经终结，其他组件与后续订阅者照样失败。L15 说得很清楚——**兜底要放在收敛之前**，共享就是最强的收敛点之一。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 重连次数 | 归零重置配置下重订使 \`sourceRuns\` +1，常驻配置下不变 |
| 永久终结 | error 之后新订阅者立刻收到错误，\`count\` 为 0 |
| 缓冲上限 | 无界配置被检查器拒绝，有界配置放行且长度固定 |
| 错误位置 | \`catchError\` 在 \`share\` / \`shareReplay\` 之前 |
| 收口责任 | 常驻配置明确记录由谁在应用退出时释放 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L19 连接共享 | refCount 自动连接 / 断开与正常生命周期 | 本课只讲三类边界与负例 |
| L18 状态型 Subject | 四种重放语义与初始值契约 | 本课只把缓冲上限当成配置项 |
| L15 错误传播 | 收敛结构放大错误爆炸半径 | 本课把它落到共享流的具体后果 |
| L21 泄漏排查 | 订阅未回收的探针与排障清单 | 本课给出缓冲检查器，不做完整探针 |
| L14 恢复与重试 | 降级值、错误分类与重试次数 | 本课只要求「兜底放在共享之前」 |
`,
    'rxShare',
    [
      {
        text: '「晚进页面的组件也要立即拿到最近一次状态」最合适的做法是？',
        options: ['share()', 'shareReplay / startWith(初始值)', 'concat', 'take(0)'],
        answer: 1,
        explain:
          'share() 不重放历史；shareReplay 会缓存最近值，startWith 提供初始态，二者才能让晚到者有可用状态。',
        concept: 'c-share-pitfall',
      },
      {
        text: '共享流收到 error 后会发生什么？',
        options: ['自动重试', '对所有订阅者永久终结', '只影响该订阅者', '变成 complete'],
        answer: 1,
        explain: 'error 沿共享流传播给全部订阅者并终结它；要避免「一处挂全废」需在源头加重试或兜底。',
        concept: 'c-share-pitfall',
      },
      {
        text: '跨路由共享主题状态用 shareReplay() 相比 share() 额外解决了什么？',
        options: ['晚到订阅者能立即拿到最近一次值', '减少并发请求', '提高发射频率', '自动取消 error'],
        answer: 0,
        explain: 'shareReplay 缓存最近值供新订阅者重放；share() 不重放历史，晚进页面的组件会拿到空状态。',
        concept: 'c-share-pitfall',
      },
    ],
    [
      ['重放边界', 'share 不重放 vs shareReplay/Behavior 重放'],
      ['连接生命周期', 'refCount 归零断开、重订重连'],
    ],
    [
      '用 share() 跨路由共享状态，结果晚到组件拿不到值（应使用 shareReplay/startWith）。',
      '忽略共享流的 error 终结语义，一条分支失败拖垮所有消费者。',
    ],
  ),
  'practice',
)
