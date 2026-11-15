import { L, withKind } from '../../course-builders.ts'

export const L05 = withKind(
  L(
    'L05',
    1,
    'map / pipe / lift：纯变换与组合子',
    2,
    ['L04'],
    ['c-transform'],
    [
      '实现一组纯变换算子并用 pipe 串成可复用的链',
      '写出 map 的等价手写版本，说明它不改变时序只改变值',
      '搭好断言验证变换链对每个值恰好调用一次',
      '产出一份「纯函数与副作用」的边界清单',
    ],
    `
### 一次事故：一次重试，扣了两次钱

下单流里有个 \`map\`，看起来人畜无害：拿到订单后顺手调用 \`auditLog(order)\` 写审计，再 \`return order\`。某天网关抖动触发了 \`retry\`，\`map\` 里的审计连带又跑了一遍；更要命的是另一个同事在同一个 \`map\` 里加了「库存预占」的异步调用却没有等待，实际发出去的请求数比日志里多。复盘时争论的焦点是「\`map\` 能不能写副作用」，但真正的问题更基础：**变换算子的契约是「把一个值换成另一个值」，它不承诺何时被调用、被调用几次**。一旦链上有重试、多订阅者或共享，任何藏在 \`map\` 里的副作用都会被乘以一个你无法控制的系数。这节课把变换链写成一个可以逐条验收的纯计算，并说明 \`pipe\` 与那个常被误用的 \`lift\` 各自站在什么位置。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`map\` 的契约是什么 | 对每个输入值恰好产生一个输出值，**不改变时序、不改变数量、不终结流** |
| \`pipe\` 解决什么 | 把若干算子按从左到右的顺序合成一条链，避免嵌套调用与中间变量 |
| \`lift\` 能不能直接用 | 它是 Observable 的内部提升机制，7.8.2 不推荐业务代码直接调用；自定义算子应写成「接收源、返回新源」的纯函数 |
| 副作用该放哪里 | 观察用 \`tap\`；异步展开用 \`switchMap\` / \`concatMap\`（L09、L10）；清理用 \`finalize\`（L03） |

### 变换链：什么变了、什么没变

| 维度 | \`map\` 是否改变 | 说明 |
|---|---|---|
| 值的形状 | 变 | \`Order\` → \`OrderView\`，这是它唯一的工作 |
| 值的数量 | 不变 | 一个进一个出；要一对多需 \`mergeMap\`（L09） |
| 发射时序 | 不变 | 同步源仍同步、异步源仍异步；要延迟需调度器（L22） |
| 终结方式 | 不变 | 上游 \`complete\` 就 \`complete\`，上游 \`error\` 就 \`error\` |
| 订阅次数 | 不变 | 但每个订阅者都会独立跑一遍变换函数，这正是副作用会翻倍的根源 |

「订阅次数不变」这一行值得停一下：一条冷流被订阅两次，\`map\` 的函数体就会执行两遍（L02）。如果函数体是纯计算，两遍结果一致，没人会在意；如果函数体里发了请求或写了库，两遍就是两次真实世界的影响。**纯函数不是风格偏好，而是让「多次执行」变得无害的唯一办法**。

\`\`\`ts title="纯变换链的 7.8.2 写法" note="自定义算子写成接收源、返回新源的纯函数；不要直接调用内部的 lift。"
import { Observable, of, from, defer } from "rxjs"
import { map, filter, tap, take } from "rxjs/operators"

interface Order { id: string; cents: number; status: "PAID" | "DRAFT" }
interface OrderView { label: string; yuan: number }

/** 纯函数：同样的输入永远给同样的输出，不读全局、不发请求。 */
const toView = (o: Order): OrderView => ({
  label: o.id + " / " + o.status,
  yuan: o.cents / 100,
})

/** 自定义算子 = 源到源的函数，用 new Observable 把协议兑现完整（见 L04）。 */
function withTax(rate: number) {
  return (source: Observable<Order>): Observable<Order> =>
    new Observable<Order>((subscriber) =>
      source.subscribe({
        next: (o) => subscriber.next({ ...o, cents: Math.round(o.cents * rate) }),
        error: (e) => subscriber.error(e),
        complete: () => subscriber.complete(),
      }),
    )
}

const orders$ = of<Order>(
  { id: "A1", cents: 1200, status: "PAID" },
  { id: "A2", cents: 800, status: "DRAFT" },
  { id: "A3", cents: 3000, status: "PAID" },
)

const views$ = orders$.pipe(
  filter((o) => o.status === "PAID"),
  withTax(1.06),
  tap((o) => console.log("trace", o.id)), // 观察，不改变值
  map(toView),
  take(2),
)

views$.subscribe((v) => console.log(v.label, v.yuan))

// 冷源 + defer：每次订阅重新求值，但变换函数依旧是纯的
const live$ = defer(() => from(Promise.resolve<Order>({ id: "A4", cents: 500, status: "PAID" })))
live$.pipe(map(toView)).subscribe(console.log)
\`\`\`

### 用最小模型把「纯」变成可断言的事实

下面不依赖 RxJS 包，实现一个极简的 \`pipe\`：对一组纯算子做左折叠，然后断言三件事——每个值恰好变换一次、算子顺序会改变结果、\`retry\` 式的重复执行对纯链无害但对副作用链会翻倍。

\`\`\`ts
import assert from "node:assert/strict"

type Op<T> = (values: T[]) => T[]

const map =
  <T, R>(fn: (v: T) => R) =>
  (values: T[]): R[] =>
    values.map(fn)

const filter =
  <T>(pred: (v: T) => boolean) =>
  (values: T[]): T[] =>
    values.filter(pred)

const take =
  <T>(n: number) =>
  (values: T[]): T[] =>
    values.slice(0, n)

/** 极简 pipe：从左到右依次应用算子。 */
function pipe<T>(input: T[], ...ops: Array<(v: any[]) => any[]>): any[] {
  let current: any[] = input
  for (const op of ops) current = op(current)
  return current
}

const source = [1, 2, 3, 4, 5]

// 顺序敏感：先 take 再 filter 与先 filter 再 take 结果不同
const a = pipe(source, take(3), filter((n: number) => n % 2 === 0))
const b = pipe(source, filter((n: number) => n % 2 === 0), take(3))
assert.deepEqual(a, [2])
assert.deepEqual(b, [2, 4], "算子顺序是语义的一部分，不是排版差异")

// 纯变换：调用次数恰好等于值个数，重复执行结果一致
let calls = 0
const pure = map((n: number) => { calls += 1; return n * 2 })
const once = pipe(source, pure)
const twice = pipe(source, pure)
assert.equal(calls, 10)
assert.deepEqual(once, [2, 4, 6, 8, 10])
assert.deepEqual(twice, once, "纯函数重复执行幂等")

// 负例：把副作用塞进变换，重试 / 多订阅会让它翻倍
let writes = 0
const impure = map((n: number) => { writes += 1; return n })
pipe(source, impure)
pipe(source, impure)
assert.equal(writes, 10, "两次订阅 = 10 次真实写入，而不是 5 次")

// 修法：副作用从变换里剥离，单独计数且只执行一次
let auditRuns = 0
const audit = (values: number[]) => { auditRuns += 1; return values }
const result = audit(pipe(source, pure))
assert.equal(auditRuns, 1)
assert.equal(result.length, 5)
\`\`\`

第三组断言把事故量化了：同样的五个值，因为链被订阅两次，副作用执行了十次。注意这里没有「重试」这个高级概念——**两次订阅就够了**。这也是为什么 \`tap\` 虽然被允许有副作用，仍要当作「观察点」而不是「执行点」：它同样会在每个订阅者身上跑一遍，只适合打日志、埋点这类可以容忍重复的观测，不适合扣款、写库、发通知。

:::deep

### \`lift\` 为什么不该出现在业务代码里

\`lift\` 是 Observable 内部用来「把算子挂到源上」的机制：给它一个 \`Operator\`，它返回一个带新 \`subscribe\` 行为的 Observable。理解它有助于看懂源码，但 7.8.2 把它当成实现细节，公开 API 的稳定入口是 \`pipe\`。直接在业务里调用 \`lift\` 有三个代价：绑定了内部数据结构、绕过了 \`pipe\` 的类型推导、升级时最先失效。更关键的是，一旦你开始手写 \`Operator\`，就同时接下了 L04 那张协议表的全部义务——终结、错误、清理、重入——而你要做的可能只是「把 \`Order\` 变成 \`OrderView\`」。因此自定义算子的推荐形态是上面示例里的 \`function withTax(rate) { return (source) => new Observable(...) }\`：**一个返回函数的纯工厂，输入输出都是 Observable，中间用现成协议兑现**。它既能被 \`pipe\` 组合，也能被单独测试，还不需要知道 \`lift\` 存在。

:::

:::warn

### 三个变换链踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 在 \`map\` 里 \`fetch(...)\` 却直接返回原值 | 请求发出但结果没进流，重试时重复发，且错误无人接管 | 需要异步展开就换 \`switchMap\` / \`concatMap\`（L10、L09），让请求成为内层流 |
| 在 \`map\` 里修改传入对象（\`o.cents = ...\`） | 上游其他订阅者看到被改过的值，缓存与回放结果串味 | 返回新对象（\`{ ...o, cents }\`），把变换当成值映射而非就地修改 |
| 以为 \`pipe(a, b)\` 与 \`pipe(b, a)\` 只是写法不同 | 过滤与取数顺序颠倒，结果集悄悄变小或变大 | 把算子顺序当契约写进测试：先用一段输入断言输出，再调整顺序看是否变化 |

第二条在共享流（L19）里尤其危险：冷源被 \`shareReplay\` 变成多播之后，同一个对象引用会被多个订阅者拿到，任何一处就地修改都会立刻污染其他人。纯变换的「不改动输入」不只是函数式洁癖，而是共享场景下的正确性前提。

:::

### 把变换链搬进评审清单

| 评审项 | 要问的问题 | 不通过时的典型代码 | 后果 |
|---|---|---|---|
| 一对一 | 输入 N 个值是否恰好输出 N 个 | 在 map 里按条件丢掉部分值 | 数量变化，却仍以为是纯变换 |
| 不改动入参 | 是否返回新对象 | 直接修改 order.cents | 共享流里其他订阅者被污染 |
| 无副作用 | 函数体重复执行两次是否无额外影响 | map 里发请求、写库、改全局计数 | 重试与多订阅时副作用翻倍 |
| 顺序固定 | 交换相邻算子结果是否变化 | 把 filter 放在 take 之后 | 结果集悄悄缩小 |
| 异步展开 | 是否需要拿到另一个流的结果 | map 里写 async 回调 | 下游收到 Promise 而不是值 |
| 观察位置 | 日志是否允许重复 | 把审计写进 map | 每个订阅者各写一次 |

这六项里前三项是「纯」的具体化，后三项是「链」的具体化。评审不需要逐行读实现，只要把变换函数单独拎出来问「给它同一个值跑两次，世界会不会变」，就能筛掉绝大多数问题。第四项最容易被当成排版问题：算子顺序其实是数据契约的一部分，上面示例里 take(3) 与 filter 互换就会把单元素结果变成两个元素。第五项则划出了本课的能力边界——map 无法把 Promise 或 Observable 摊平成值，它需要 L09 与 L10 的扁平化算子；在 map 里写 async 不会报错，只会让下游收到一个 Promise 对象，这类问题在类型标注宽松时格外隐蔽。第六项提醒我们 tap 虽然允许副作用，也只适合可重复执行的观测动作，不能承载「恰好一次」的业务语义。

### 验收清单

| 检查 | 判据 |
|---|---|
| 一对一 | \`map\` 前后值的个数一致，时序与终结方式不变 |
| 顺序敏感 | 交换 \`take\` 与 \`filter\` 后输出不同，并有断言固定当前顺序 |
| 纯度 | 变换函数不读全局可变状态、不发请求、不修改入参 |
| 重复执行 | 同一冷源订阅两次，纯链结果一致；副作用链执行次数翻倍且被断言抓到 |
| 自定义算子 | 写成「接收源、返回新源」的纯工厂，不直接调用 \`lift\` |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L04 自定义源 | \`new Observable\` 的观察者协议与 teardown | 本课复用它实现自定义算子，不重复协议表 |
| L06 过滤与取舍 | \`filter\` / \`take\` / \`skip\` / \`distinctUntilChanged\` | 本课只用 \`filter\` / \`take\` 演示顺序，不展开有状态算子 |
| L09 / L10 扁平化 | 一对多的异步展开与取消语义 | 本课明确指出 \`map\` 里发请求是错的，但不实现展开 |
| L19 连接共享 | \`share\` / \`refCount\` 让多订阅者共享一条源 | 本课用共享场景说明「就地修改」的危害，不实现共享 |
`,
    'rxTransform',
    [
      {
        text: 'map 会改变流的发射次数或时序吗？',
        options: ['会，可能变多', '不会，只变换每个值的形态', '取决于回调', '会重置流'],
        answer: 1,
        explain: 'map 是一对一纯变换，次数与时机完全不变；改变「次数/时序」的是 flatXxxMap 与 merge。',
        concept: 'c-transform',
      },
      {
        text: 'pipe(map(f), map(g))(src) 等价于？',
        options: ['map(g) 先执行', 'src.map(g).map(f)', 'src.map(f).map(g)', '报错'],
        answer: 2,
        explain: 'pipe 从左到右依次应用：先 map(f) 再 map(g)，等价于嵌套 src.pipe(f).pipe(g)。',
        concept: 'c-transform',
      },
    ],
    [
      ['pipe', '把多个操作符按顺序组合成单一可复用函数的工具'],
      ['lift', '把操作符提升为可作用于可观察的机制'],
    ],
    [
      '用 flatMap 做纯值变换，白白引入嵌套流的复杂度（应使用 map）。',
      '把 pipe 里的操作符顺序写反，导致语义与预期不符（顺序即执行顺序）。',
    ],
  ),
  'practice',
)
