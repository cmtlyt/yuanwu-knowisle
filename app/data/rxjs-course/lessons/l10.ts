import { L, withKind } from '../../course-builders.ts'

export const L10 = withKind(
  L(
    'L10',
    2,
    'switchMap 与 exhaustMap：取最新 vs 排空',
    3,
    ['L09'],
    ['c-switch', 'c-exhaust'],
    [
      '说清取最新与排空的取消 / 忽略语义差别',
      '解释 switchMap 为什么能天然解决搜索竞态',
      '对照表单重复提交场景里 exhaustMap 的作用',
      '说清「忽略」与「取消」在实现上的区别',
    ],
    `
### 一次事故：解决了搜索竞态，却把提交弄丢了

L01 里的搜索竞态用 \`switchMap\` 修好之后，团队把同一个写法复制到「保存表单」按钮上：连点两次保存，第一次请求刚发出就被取消，界面只显示第二次的结果；更糟的是后端已经收到第一次请求并创建了草稿，前端却以为它没发生，刷新后出现两条记录。复盘时有人问「取消请求不就等于没提交吗」，这正是问题所在：**取消订阅只是不再接收结果，不能撤销已经发出的副作用**。同一组代码在两个场景下，一个是对的、一个是错的，差别不在语法，而在「旧内流被取消后，它的副作用是否允许留在世界上」。这节课把 \`switchMap\` 与 \`exhaustMap\` 放到同一张时间线上，把「取消」与「忽略」彻底分开。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`switchMap\` 对新外值做什么 | **取消**当前内流（unsubscribe），立刻订阅新内流 |
| \`exhaustMap\` 对新外值做什么 | **忽略**新外值，当前内流跑完前不订阅任何新流 |
| 忽略和排队是一回事吗 | 不是：\`concatMap\` 会把新值排队稍后执行，\`exhaustMap\` 直接丢弃 |
| 取消能撤销副作用吗 | 不能；它只让下游不再收到旧内流的值 |

### 取消与忽略：逐项对照

| 维度 | \`switchMap\` | \`exhaustMap\` |
|---|---|---|
| 新外值到来 | 取消旧内流 | 静默丢弃新外值 |
| 旧内流的资源 | 触发 teardown（L03） | 正常跑完再清理 |
| 已发出的网络请求 | 不会被中止，只是结果不再交付 | 照常完成 |
| 输出个数 | 通常只有最后一条内流的值 | 每条被接纳的内流的值 |
| 典型场景 | 搜索建议、路由切换、自动补全 | 提交按钮、登录、防重复触发 |
| 主要风险 | 把不该取消的任务掐断 | 用户输入被静默忽略，需要给出反馈 |

表里第三行是这节课最需要记住的事实：RxJS 的 \`unsubscribe\` 能清掉定时器与监听器，但对 \`from(fetch(...))\` 里已经在飞的请求无能为力——它只能保证结果不再被写进界面。因此 \`switchMap\` 解决的是**「旧结果盖掉新结果」**，不是「旧请求不该发生」。搜索框里这不重要（旧结果丢弃即可），提交场景里却是致命的（旧请求已经创建了数据）。

\`\`\`ts title="两个场景，两种策略" note="switchMap 取消旧内流；exhaustMap 在内流活跃期间忽略新外值，两者都不回滚已发出的请求。"
import { fromEvent, from, defer, of, throwError } from "rxjs"
import {
  map,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  exhaustMap,
  catchError,
  take,
} from "rxjs/operators"

type Suggestion = { keyword: string; items: string[] }
type SaveResult = { id: string; ok: boolean }

const find = (k: string): Promise<Suggestion> =>
  Promise.resolve({ keyword: k, items: [k + "-1", k + "-2"] })
const save = (payload: object): Promise<SaveResult> =>
  Promise.resolve({ id: "row-1", ok: true })

// 搜索：旧请求的结果不许写回，取最新是正确语义
const input = document.querySelector<HTMLInputElement>("#search")
if (input) {
  fromEvent(input, "input")
    .pipe(
      map((ev) => (ev.target as HTMLInputElement).value.trim()),
      debounceTime(200),
      distinctUntilChanged(),
      switchMap((k) => defer(() => from(find(k)))),
      take(20),
    )
    .subscribe((s) => console.log("suggest", s.keyword, s.items.length))
}

// 提交：连点期间忽略新点击，绝不取消第一次请求
const button = document.querySelector<HTMLButtonElement>("#save")
if (button) {
  fromEvent(button, "click")
    .pipe(
      map(() => ({ at: Date.now() })),
      exhaustMap((payload) =>
        defer(() => from(save(payload))).pipe(
          catchError(() => of<SaveResult>({ id: "none", ok: false })),
        ),
      ),
    )
    .subscribe((r) => console.log("saved", r.id, r.ok))
}

// 对照：错误写法——把提交也用 switchMap，第一次请求会被取消
const wrong$ = of({ at: 1 }, { at: 2 }).pipe(switchMap((p) => from(save(p))))
void wrong$
void throwError(() => new Error("unused"))
\`\`\`

### 用最小模型把「取消」与「忽略」变成可断言的事实

下面不依赖 RxJS 包：用事件发生时刻与内流活跃时长，分别实现取最新、排空、排队三种策略，断言输出序列，并用一个「副作用已发生但结果被丢弃」的负例说明取消不等于撤销。

\`\`\`ts
import assert from "node:assert/strict"

type Hit = { key: string; at: number }

const hits: Hit[] = [
  { key: "a", at: 0 },
  { key: "b", at: 50 },
  { key: "c", at: 120 },
  { key: "d", at: 300 },
]
const ACTIVE_MS = 200

/** switchMap：只保留最后一条内流的结果。 */
function latest(items: Hit[]): string[] {
  return items.length ? [items.at(-1)!.key] : []
}

/** exhaustMap：内流活跃期间的新外值直接丢弃，不排队。 */
function exhausted(items: Hit[], activeMs: number): string[] {
  const out: string[] = []
  let busyUntil = -1
  for (const h of items) {
    if (h.at < busyUntil) continue
    out.push(h.key)
    busyUntil = h.at + activeMs
  }
  return out
}

/** concatMap：新外值排队，一个都不丢。 */
function queued(items: Hit[]): string[] {
  return items.map((h) => h.key)
}

assert.deepEqual(latest(hits), ["d"], "取最新只交付最后一条内流")
assert.deepEqual(exhausted(hits, ACTIVE_MS), ["a", "d"], "排空丢掉活跃期内的 b、c，且不补执行")
assert.deepEqual(queued(hits), ["a", "b", "c", "d"], "排队是第三种语义，别与忽略混淆")

// 负例：取消订阅不会撤销已经发出的副作用
const sideEffects: string[] = []
let delivered: string[] = []
for (const h of hits) sideEffects.push("POST " + h.key) // 请求在订阅时就发出
delivered = latest(hits)
assert.equal(sideEffects.length, 4, "四次点击都真实发出了请求")
assert.deepEqual(delivered, ["d"], "但只有最后一次的结果被交付")
assert.ok(
  sideEffects.includes("POST a") && !delivered.includes("a"),
  "副作用已发生而结果被丢弃：取消不等于撤销",
)
\`\`\`

最后这组断言把「连点两次保存出现两条记录」的原因写成了可复现的事实：\`sideEffects\` 有四条，\`delivered\` 只有一条。如果业务要求「最多一次」，就必须从源头限制触发（\`exhaustMap\`），而不是指望下游取消。**这也是为什么把 \`switchMap\` 从搜索复制到提交会出错：两个场景对「旧副作用是否允许留下」的答案相反**。

### 一次连点事件的完整推演

假设内流活跃 200ms，用户在 0 / 50 / 120 / 300ms 各点一次：

| 帧 | 事件 | switchMap 活跃内流 | switchMap 交付 | exhaustMap 活跃内流 | exhaustMap 交付 |
|---|---|---|---|---|---|
| 0 | a | a | 无 | a（busy 到 200） | 无 |
| 50 | b | b（取消 a） | 无 | a（忽略 b） | 无 |
| 120 | c | c（取消 b） | 无 | a（忽略 c） | 无 |
| 200 | a 完成 | 无 | 不交付（已取消） | 空闲 | a |
| 300 | d | d | 无 | d（busy 到 500） | 无 |
| 500 | d 完成 | 无 | d | 空闲 | d |

第 200ms 那一行值得单独看：a 的内流其实已经完成，但因为 \`switchMap\` 早已取消订阅，它的结果不会写回界面——这正是搜索框想要的「旧结果不许盖掉新结果」。同一行在 \`exhaustMap\` 下却正常交付 a，因此提交按钮只会创建一条记录。两种策略都没有「谁更快」的问题，只是把「旧值是否有效」写成了不同的答案。

:::deep

### 竞态的本质不是「慢」，而是「旧结果仍被允许写回」

很多工程师把竞态理解成「请求太慢」，于是加 loading、加节流、甚至给请求排序。但真正造成界面错乱的是**旧结果没有失效**：只要旧内流还被订阅，它完成时就一定会调用下游的 \`next\`，把过期数据写进状态。\`mergeMap\` 下的搜索框就是这样：两次请求都正常完成，只是完成顺序与发出顺序相反。\`switchMap\` 的价值在于它在语义层宣布「新外值出现时，旧内流的结果立即失效」，因此不需要在回调里比对序号、也不需要给请求编号。这是 L01 那次事故最优雅的解法，也是为什么它值得单独一课。反过来，凡是旧结果**不该失效**的场景（提交、支付、上传），任何形式的「取最新」都是错误的：你要的不是让旧结果失效，而是让第二次触发根本不发生，这正是 \`exhaustMap\` 的语义。

:::

:::warn

### 三个取最新 / 排空踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 把 \`switchMap\` 用在提交、支付、上传 | 第一次请求被取消，后端已创建数据但前端显示未提交 | 改用 \`exhaustMap\`，并在 UI 上给出「处理中」反馈 |
| 以为 \`exhaustMap\` 会把点击排队 | 活跃期内的输入被静默丢弃，用户以为按钮坏了 | 需要「不丢」用 \`concatMap\`（L09）；用 \`exhaustMap\` 必须显式提示忽略 |
| 以为 \`switchMap\` 会中止 HTTP 请求 | 网络面板里旧请求照样跑完，服务端负载没降 | 取消只影响订阅；要真正中止需配合 AbortController，且服务端仍可能已处理 |

第三条在性能排查时经常引发误判：把 \`mergeMap\` 换成 \`switchMap\` 后，界面不再错乱，但服务端 QPS 并没有下降，因为旧请求只是结果被丢弃。要降 QPS 需要 \`debounceTime\` 削峰（L23）或 AbortController 中止，这两件事与「结果是否有效」是不同层面的问题。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 语义区分 | 能用「取消 / 忽略 / 排队」一句话区分三种策略 |
| 输出序列 | 同一组连点事件下，\`switchMap\` 只交付 d、\`exhaustMap\` 交付 a 与 d |
| 副作用认知 | 断言能证明「请求已发出但结果被丢弃」 |
| 场景选型 | 搜索用取最新、提交用排空，且能说出旧副作用是否允许留下 |
| 用户反馈 | 使用 \`exhaustMap\` 时有「处理中」提示，不让输入石沉大海 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L08 嵌套流心智模型 | 四种策略的取消语义总表 | 本课只推演取消与忽略两种 |
| L09 排队与并发 | \`concatMap\` / \`mergeMap\` 的时序与耗时 | 本课只在对照里提排队，不推演并发度 |
| L11 决策树 | 三问顺序与四类场景选型 | 本课给两个场景的结论，不给完整决策表 |
| L14 恢复与重试 | \`catchError\` / \`retry\` | 本课示例里的 \`catchError\` 只作占位，不展开 |
| L23 时间算子 | \`debounceTime\` 削峰 | 本课只用它配合搜索场景，不讲窗口语义 |
`,
    'rxCross',
    [
      {
        text: 'switchMap 收到新外值时会做什么？',
        options: ['忽略新值', '取消当前内层、改为订阅新内层', '排队等旧完成', '报错'],
        answer: 1,
        explain: 'switchMap 的核心是「取消旧内层 + 订阅新内层」，这正是搜索防竞态的答案。',
        concept: 'c-switch',
      },
      {
        text: '「按钮加载中，忽略后续点击，直到本次加载完成」应该用？',
        options: ['switchMap', 'concatMap', 'exhaustMap', 'mergeMap'],
        answer: 2,
        explain: 'exhaustMap 在旧内层未完成时忽略新外值，做完后接受下一次，正好是「排队/防重复提交」语义。',
        concept: 'c-exhaust',
      },
      {
        text: 'switchMap 取消旧内层后，旧内层已发出的部分 next 值会怎样？',
        options: ['保留并继续转发', '被丢弃，下游只看到新内层的值', '自动补发', '抛错'],
        answer: 1,
        explain: 'switchMap 取消旧内层订阅：旧内层尚未发出的值被丢弃，下游只接收新内层；已发出的历史值仍在。',
        concept: 'c-switch',
      },
    ],
    [
      ['switchMap', '取最新并取消旧内层'],
      ['exhaustMap', '排空语义：进行中忽略新值'],
    ],
    [
      '搜索框用 mergeMap/concatMap 导致竞态与旧结果覆盖（应使用 switchMap）。',
      '把 exhaustMap 当成 switchMap 用，期待「取消旧的」（它不取消，只忽略）。',
    ],
  ),
  'theory',
)
