import { L, withKind } from '../../course-builders.ts'

export const L01 = withKind(
  L(
    'L01',
    0,
    '动机与创建源：异步组合的缺口与源操作符全景',
    1,
    [],
    ['c-callbacks', 'c-sources'],
    [
      '说清 Promise 与回调在「一段时间里的多次值」上的四个结构性缺口',
      '把 Observable 的三元组协议与冷 / 热、单次 / 多次的边界讲透',
      '按场景选对源操作符，说清 defer 为什么是重入与重试的默认写法',
      '用对照表说清 RxJS 不是「更快的 Promise」',
    ],
    `
### 一次事故：新结果被旧结果盖掉

搜索框监听输入后直接发请求，用户连打「rx」「rxjs」两次。第一次请求慢、第二次快，界面却先显示第二次的正确结果、随后被第一次的旧结果覆盖。团队最初的补丁是给每次请求编号、在回调里比对序号，再补一个布尔量表示「组件是否已卸载」。三周后，同一个页面又加了轮询、上传进度和 ESC 取消，补丁长成五层嵌套：序号、布尔量、定时器句柄、清理标记、异常分支各管一件事，谁都不敢动。真正的问题不是代码写得乱，而是**用来描述异步的抽象只能表达「将来恰好一次」**，而界面要面对的是「一段时间里可能来很多次、可能中途不要了、可能与别的信号按某种时序合成」。RxJS 把这段「时间」本身变成一个可以传递、可以组合、可以取消的值，这就是 Observable。

### 本课唯一要回答的问题

这节课只回答一件事：**为什么需要把「一段时间里的数据序列」当成一等值，以及第一步该用什么把它造出来**。至于造出来之后谁触发生产、订阅怎么回收，分别交给 L02 与 L03。

| 你以为 | 实际 |
|---|---|
| RxJS 是「更强的 Promise」 | Promise 表达 0 或 1 个结果；Observable 表达 0..n 个结果，二者互补而非替代 |
| 引入它是为了性能 | 引入它是为了**取消、组合与时间语义**有统一模型，性能通常不是起点 |
| 先背操作符清单 | 先分清「描述」与「执行」：创建源只是写蓝图，订阅才产生数据 |

### 四个结构性缺口

| 缺口 | Promise / 回调的处境 | 流提供的统一机制 |
|---|---|---|
| 多值 | 一次 resolve 之后就结束，后续事件只能再建一个 Promise | 同一个源按时间持续 \`next\`，直到 \`complete\` / \`error\` |
| 取消 | 没有标准取消协议，只能靠外部布尔量 | 订阅返回句柄，\`unsubscribe()\` 触发统一清理 |
| 组合 | 多个异步的串行 / 并行 / 竞态需手写状态机 | \`concat\` / \`merge\` / \`race\` 等组合子直接表达时序 |
| 时间语义 | 「每 200ms 防抖」「过去 5 秒内」散落在定时器里 | 调度器与 \`debounceTime\` / \`bufferTime\` 把时间变成数据 |

这四个缺口不是四个独立功能，而是同一个缺失：**没有一种值可以携带「何时发生、发生了几次、何时结束」**。补上这一层之后，取消、组合、时间才可能共用一套契约。也正因为如此，把 RxJS 学成「操作符速查表」会立刻撞墙——操作符只是这层契约上的函数。

### 三元组协议与「订阅才执行」

Observable 的订阅契约只有三条通道：\`next\` 给值（零到多次）、\`error\` 给失败（至多一次且终结）、\`complete\` 给完成（至多一次且终结）。一个源在终结之后不得再发射任何东西，这条不可逆性后面 L13 会单独展开。

| 通道 | 次数 | 是否终结 | 常见误用 |
|---|---|---|---|
| \`next\` | 0..n | 否 | 在 \`error\` 之后继续 \`next\`，指望订阅者还能收到 |
| \`error\` | 0 或 1 | 是 | 把业务校验失败当 \`error\`，导致整条链提前终结 |
| \`complete\` | 0 或 1 | 是 | 以为「完成」等于「成功」，其实只等于「不再有值」 |

另一个必须一开始就钉住的边界是**描述与执行分离**：\`of(1, 2, 3)\` 只是构造了一个描述，\`defer(() => of(...))\` 也只是把工厂存起来；在调用 \`subscribe\` 之前，工厂里的网络请求、时间戳、随机数一次都不会发生。这不是实现细节，而是重试、路由重入、多次订阅能成立的前提。

### 源操作符选型表

下面的写法全部按 \`rxjs@7.8.2\` 的 7.x 导入约定：创建函数与组合函数从 \`rxjs\` 导入，单参数操作符从 \`rxjs/operators\` 导入，\`TestScheduler\` 从 \`rxjs/testing\` 导入。

| 场景 | 源写法 | 首次值时机 | 是否自行终结 |
|---|---|---|---|
| 已知若干同步值 | \`of(1, 2, 3)\` | 订阅当帧同步逐个给出 | 是，随即 \`complete\` |
| 数组 / Promise / 迭代器 | \`from([1, 2, 3])\` | 订阅后按来源节奏给出 | 取决于来源 |
| DOM 事件这类外部热信号 | \`fromEvent(el, "click")\` | 事件发生时 | 否，需主动取消 |
| 周期心跳 | \`interval(1000)\` | 首个延迟 1000ms | 否 |
| 延迟 + 周期 | \`timer(200, 1000)\` | 200ms 后首个 | 否 |
| 每次订阅重新求值 | \`defer(() => from(fetchUser()))\` | 订阅时执行工厂 | 取决于工厂返回的源 |
| 立即完成、零个值 | \`EMPTY\` | 无值 | 是，立即 \`complete\` |
| 永不终结、零个值 | \`NEVER\` | 无值 | 否 |
| 立即失败 | \`throwError(() => new Error("down"))\` | 订阅当帧 | 是，以 \`error\` 终结 |

选型表里最容易被低估的是 \`defer\`。它不是「又一个创建函数」，而是**把副作用从构造期挪到订阅期**的开关。凡是涉及重试、重新进入页面、缓存失效后重取的源，都应该先问一句：这次订阅是不是真的需要重新执行工厂？

\`\`\`ts title="最小起步：把一次请求写成可重入的源" note="defer 把工厂推迟到订阅时刻；EMPTY 与 NEVER 是常量，不要写成函数调用。"
import { defer, from, of, interval, EMPTY, NEVER, throwError } from "rxjs"
import { take } from "rxjs/operators"

let calls = 0

// 蓝图：构造时 calls 仍是 0，网络请求也还没发生
const user$ = defer(() => {
  calls += 1
  return from(fetchUser(calls))
})

// 每次订阅都重新执行工厂，因此重入 / 重试天然成立
const sub1 = user$.subscribe({
  next: (u) => console.log("sub1", u.seq),
  error: (e) => console.warn("failed", e),
})
const sub2 = user$.subscribe({ next: (u) => console.log("sub2", u.seq) })
sub1.unsubscribe()
sub2.unsubscribe()

const ticks$ = interval(1000).pipe(take(3)) // take 会在第 3 个值后自动完成并清理
const empty$ = EMPTY
const never$ = NEVER
const failed$ = throwError(() => new Error("down"))

function fetchUser(seq: number): Promise<{ seq: number }> {
  return Promise.resolve({ seq })
}

void [ticks$, empty$, never$, failed$]
\`\`\`

### 用最小模型把「惰性」变成可断言的事实

光看上面的示例很容易以为「订阅才执行」只是口头约定。下面不依赖 RxJS 包，用一个自包含的最小模型把这条契约写成可失败的断言：同一个工厂，直接调用与包进惰性源，调用次数必须不同。

\`\`\`ts
import assert from "node:assert/strict"

type Observer<T> = { next: (v: T) => void; complete?: () => void }
type Source<T> = { subscribe: (o: Observer<T>) => { unsubscribe: () => void } }

/** 惰性源：工厂只在 subscribe 时执行，每次订阅独立求值。 */
function lazy<T>(factory: () => T): Source<T> {
  return {
    subscribe(o) {
      o.next(factory())
      o.complete?.()
      return { unsubscribe() {} }
    },
  }
}

let calls = 0
const factory = () => {
  calls += 1
  return calls
}
const src = lazy(factory)

assert.equal(calls, 0, "构造蓝图不得触发工厂")

const seenA: number[] = []
const seenB: number[] = []
src.subscribe({ next: (v) => seenA.push(v) })
src.subscribe({ next: (v) => seenB.push(v) })

assert.equal(calls, 2, "两次订阅 = 两次独立求值")
assert.deepEqual(seenA, [1])
assert.deepEqual(seenB, [2], "第二次订阅不能复用第一次的结果")

// 负例：若把工厂结果在构造期就固化，重入会拿到旧值
const eager = { subscribe: (o: Observer<number>) => { o.next(factory()); return { unsubscribe() {} } } }
const first = factory()
assert.equal(first, 3)
let stale: number | undefined
eager.subscribe({ next: (v) => { stale = v } })
assert.equal(stale, 4, "惰性源每次求值；固化写法只会拿到构造时的旧值")
\`\`\`

这段模型刻意保留了 \`unsubscribe()\` 的空实现，因为资源回收要到 L03 才讲。但断言已经把本课最核心的一条钉死：**同一个源订阅两次，是两次求值，不是两次读取同一个结果**。把这个结论忘掉，后面 \`retry\`、\`share\`、\`refCount\` 的行为都会变成玄学。

:::deep

### 它不是 Promise 的替代品

Promise 的语义是「一个尚未确定的单次结果」，它一旦 settle 就永久缓存；Observable 的语义是「一段时间里的若干次结果」，其生命周期由订阅关系决定。两者不是快慢关系，而是基数关系：一个是 1，一个是 0..n。因此 \`of(1, 2, 3)\` 与 \`Promise.resolve([1, 2, 3])\` 也不等价——前者是把三个值沿时间依次交出、可以被 \`take(2)\` 中途截断，后者是把一个数组一次性交出、订阅者无法在中途介入。工程上正确的分工是：一次性的请求结果用 Promise，事件流、重试流、需要取消的长任务用 Observable，再用 \`from()\` 在边界上把两者接起来。把 Promise 硬改成流，往往只是多包了一层；把事件流塞进 Promise，则会立刻丢掉取消与多次值两条能力。

:::

:::warn

### 三个最常见的起步错误

| 错误 | 现象 | 修正 |
|---|---|---|
| 在模块顶层 \`from(fetchUser())\` | 请求在导入时就发出，重入页面拿到的是已完成的结果，重试也无效 | 包一层 \`defer(() => from(fetchUser()))\` |
| 把 \`EMPTY\` / \`NEVER\` 写成 \`EMPTY()\` / \`NEVER()\` | 7.8.2 中它们是常量；\`empty()\` / \`never()\` 是遗留的函数式写法，容易与 6.x 资料混用 | 统一用常量，导入自 \`rxjs\` |
| 把「校验不通过」当成 \`error\` | 整条链提前终结，后续合法值再也进不来 | 业务失败是一个正常的 \`next\` 值，用 \`filter\` 或结果类型表达；\`error\` 只留给真正的异常 |

第三个错误尤其隐蔽：它不会在开发环境报错，只会让「偶尔有一段数据不刷新」，排查时通常会先怀疑缓存或网络，而不是怀疑自己把业务分支写成了终结信号。判断标准是问一句：**这个失败之后，这条流还有可能继续产生有意义的值吗？** 有可能，就不该用 \`error\`。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 描述与执行分离 | 构造 \`defer\` 源后工厂调用次数为 0；每次订阅才 +1 |
| 三元组不可逆 | 终结后再 \`next\` 不产生任何输出 |
| 源选型 | 能说清 \`of\` / \`from\` / \`fromEvent\` / \`interval\` / \`defer\` 各自的首次值时机 |
| 常量口径 | 正文与代码用 \`EMPTY\` / \`NEVER\`，不混 \`empty()\` / \`never()\` |
| 边界认知 | 能举出一个「该用 Promise 而不是 Observable」的场景 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L02 冷流与热流 | 「谁触发生产」的差别、冷源每次订阅独立执行 | 本课只说「订阅才执行」，不判断冷热 |
| L03 订阅与资源回收 | \`Subscription\` / \`teardown\` / \`unsubscribe\` 的完整清理链路 | 本课只留一个空的 \`unsubscribe()\` 占位 |
| L04 自定义源 | 用 \`new Observable\` 手写观察者协议 | 本课只用现成创建函数 |
| L22 调度器 | 把「何时执行」注入系统 | 本课只说时间语义存在，不解释调度器 |
`,
    'rxjsSource',
    [
      {
        text: 'Promise 与 Observable 最本质的区别是什么？',
        options: [
          'Observable 更快',
          'Promise 只产出恰好一个值（或一次失败），Observable 可产出 0..n 个值',
          'Observable 只能在浏览器用',
          'Promise 支持取消',
        ],
        answer: 1,
        explain:
          'Promise 语义是「恰好一次结果」；Observable 是「一段时间里的若干次结果」，这才是它引入时序操作符的根基。',
        concept: 'c-callbacks',
      },
      {
        text: 'defer(() => from(fetch())) 相比模块顶层 from(fetch()) 的好处是？',
        options: ['更快', '每次订阅都重新发起请求', '能取消', '类型更安全'],
        answer: 1,
        explain: 'defer 把源工厂推迟到订阅时执行，避免固化成一次性完成的冷源，适合重试与重入。',
        concept: 'c-sources',
      },
    ],
    [
      ['回调地狱', '异步嵌套回调层层下钻，难以取消与组合'],
      ['源操作符', '产生可观察序列的函数（of/from/fromEvent/defer…）'],
    ],
    [
      '把 RxJS 当成「更快的 Promise」——它处理的是时间序列，不是单次结果。',
      '在模块顶层 new Promise / 建流，导致结果被固化、无法重试。',
    ],
  ),
  'theory',
)
