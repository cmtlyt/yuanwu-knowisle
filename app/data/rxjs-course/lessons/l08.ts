import { L, withKind } from '../../course-builders.ts'

export const L08 = withKind(
  L(
    'L08',
    2,
    '为什么需要扁平化：嵌套流的心智模型',
    3,
    ['L07'],
    ['c-flatten'],
    [
      '说清「流的流」为什么不能直接拼接',
      '解释投影函数与内层订阅的生命周期',
      '对照四种扁平化策略的取消语义',
      '说清扁平化不是 map 的加强版',
    ],
    `
### 一次事故：界面上出现了 [object Object]

搜索框接后端接口时，有人按 L05 的习惯写了 \`keyword$.pipe(map((k) => from(fetchList(k))))\`，然后把结果直接绑到列表。页面没有报错，只是每一项都渲染成 \`[object Object]\`。调试器里一看，\`next\` 收到的不是结果数组，而是一个 Observable。团队第一反应是「再套一层 subscribe」，于是出现了订阅里再订阅、里层取消与外层取消互相踩、路由切走后 Inner 请求还在跑的代码。问题的根子不在 \`map\` 写错了，而在于**投影函数返回了「流」而不是「值」**：一旦每个输入值都对应一条独立的时间序列，就必须有人决定这些内层流以什么策略共存。这一步叫扁平化，它是 S2 五课共同的主轴。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`map\` 返回流会变成什么 | \`Observable<Observable<T>>\`，即「流的流」，下游拿到的是描述而不是数据 |
| 扁平化到底做两件什么事 | ① 为每个外值订阅一条内流；② 决定新外值到来时旧内流是被等待、并存、取消还是忽略 |
| 四种策略由什么区分 | 只由**取消 / 排队语义**区分，与数据形状无关 |
| 本课不回答什么 | 四种策略各自的时序推演（L09、L10）、怎么选（L11）、并发上限（L12） |

### 「流的流」：三个必须分清的对象

| 对象 | 谁创建 | 生命周期 | 常见混淆 |
|---|---|---|---|
| 外流 | 业务源（输入事件、轮询、队列） | 通常与页面同寿 | 以为外流结束内流才结束 |
| 投影函数 | 你写的 \`k => from(fetch(k))\` | 每个外值调用一次 | 以为它只负责「算一个值」 |
| 内流 | 投影函数的返回值 | 由扁平化策略决定何时订阅、何时取消 | 以为 \`map\` 会替你订阅它 |

这三者里最容易被忽略的是**内流的生命周期归属**。\`map\` 完全不碰内流：它把 \`Observable\` 当作一个普通值交出去，订阅与否是下游的事。扁平化算子之所以不能简单理解成「concat 版的 map」，正是因为它额外接下了一份责任：管理 N 条内流各自的订阅句柄，并在外流终结、内流报错、订阅者取消这三类事件上逐一收口（L03 的资源账本在这里被放大了 N 倍）。

### 四种策略：只按取消语义区分

| 策略 | 新外值到来时 | 旧内流 | 保序 | 典型风险 |
|---|---|---|---|---|
| \`concatMap\` | 排队等待 | 跑完才轮到下一个 | 是 | 慢内流阻塞整条链 |
| \`mergeMap\` | 立即并存订阅 | 继续跑 | 否 | 无上限并发打爆下游 |
| \`switchMap\` | 取消旧内流 | 立刻 unsubscribe | 否 | 旧任务被中途掐断 |
| \`exhaustMap\` | 忽略新外值 | 继续跑 | 否 | 输入被静默丢弃 |

把这张表读成「新值到来时的一个 if 分支」，四种策略就不再是四个要背的 API：等待、并存、取消、忽略，恰好覆盖了所有可能的处理方式。它们的数据形状完全一样（都是 \`Observable<T>\`），差别的 100% 都在时序与资源上。因此**选错扁平化算子不会报类型错误，只会让结果以「偶尔不对」的方式出现**——这正是 S2 需要逐课推演的原因。

\`\`\`ts title="从嵌套到扁平：同一段业务的两种写法" note="concatMap / mergeMap / switchMap / exhaustMap 在 7.8.2 中都从 rxjs/operators 导入。"
import { from, of, defer } from "rxjs"
import { map, mergeMap, concatMap, switchMap, exhaustMap, take } from "rxjs/operators"

type Result = { keyword: string; items: string[] }
const lookup = (k: string): Promise<Result> =>
  Promise.resolve({ keyword: k, items: [k + "-1", k + "-2"] })

const keywords$ = of("rx", "rxjs")

// 错误：下游拿到的是 Observable<Promise<Result>>，界面渲染成对象
const nested$ = keywords$.pipe(map((k) => from(lookup(k))))

// 正确：扁平化后下游拿到 Observable<Result>
const queued$ = keywords$.pipe(concatMap((k) => from(lookup(k))))
const parallel$ = keywords$.pipe(mergeMap((k) => from(lookup(k))))
const latest$ = keywords$.pipe(switchMap((k) => from(lookup(k))))
const firstOnly$ = keywords$.pipe(exhaustMap((k) => from(lookup(k))))

// 重入安全的写法：把工厂放进 defer，保证每次订阅重新求值（L01、L02）
const reentrant$ = keywords$.pipe(
  switchMap((k) => defer(() => from(lookup(k)))),
  take(4),
)

void [nested$, queued$, parallel$, latest$, firstOnly$]
reentrant$.subscribe((r) => console.log(r.keyword, r.items.length))
\`\`\`

### 用最小模型把「嵌套」与「扁平」变成可断言的事实

下面不依赖 RxJS 包：用数组模拟内外两层，把四种策略写成不同的合并函数，断言嵌套与扁平的层数差别、四种策略的输出差别，以及「内流不终结」这条会让整条链挂住的风险。

\`\`\`ts
import assert from "node:assert/strict"

type Task = { outer: string; inner: string[]; done: boolean }

const outer = ["a", "b", "c"]
const project = (k: string): Task => ({ outer: k, inner: [k + "1", k + "2"], done: true })

const nested: Task[] = outer.map(project)
assert.equal(nested.length, 3, "map 只把外值换成内流描述，层数不变")
assert.equal(nested[0].inner.length, 2, "内流里的数据此刻还没被交出来")

function flatten(tasks: Task[], strategy: "concat" | "merge" | "switch" | "exhaust") {
  if (strategy === "switch") return tasks.at(-1)!.inner
  if (strategy === "exhaust") return tasks[0].inner
  if (strategy === "concat") return tasks.flatMap((t) => t.inner)
  // merge：按「每条内流的第 i 个值」交错，体现并发下的交错交付
  const out: string[] = []
  const width = Math.max(...tasks.map((t) => t.inner.length))
  for (let i = 0; i < width; i++) {
    for (const t of tasks) if (t.inner[i]) out.push(t.inner[i])
  }
  return out
}

const all = flatten(nested, "concat")
assert.deepEqual(all, ["a1", "a2", "b1", "b2", "c1", "c2"])
assert.equal(all.length, 6, "扁平化把 3 条内流的 6 个值合成一条序列")
assert.deepEqual(
  flatten(nested, "merge"),
  ["a1", "b1", "c1", "a2", "b2", "c2"],
  "并发时各内流交错交付，不保证按外值顺序",
)
assert.deepEqual(flatten(nested, "switch"), ["c1", "c2"], "取最新：只保留最后一条内流")
assert.deepEqual(flatten(nested, "exhaust"), ["a1", "a2"], "排空：忽略新外值")

// 负例：有一条内流永不终结时，排队策略会永久阻塞后续外值
const blocked: Task[] = [project("a"), { ...project("b"), done: false }, project("c")]
const completed = blocked.filter((t) => t.done).map((t) => t.outer)
assert.deepEqual(completed, ["a", "c"])
assert.equal(blocked[1].done, false, "concatMap 遇到不终结的内流会一直等下去")
\`\`\`

最后这个负例解释了一个非常常见的线上现象：某个接口偶尔不返回、也不超时，用 \`concatMap\` 的批量任务就此卡死，后续所有外值排队却永远不被处理。修复方向不是给 \`concatMap\` 加参数，而是给内流加 \`take\` 或超时（L12、L25），让「不终结」变成可观测的错误。

### 一次扁平化的完整推演

以外流依次给出 a、b、c，三条内流各产生两个值为例：

| 时刻 | 外流 | concatMap 活跃内流 | mergeMap 活跃内流 | switchMap 活跃内流 | exhaustMap 活跃内流 |
|---|---|---|---|---|---|
| t1 | a | a | a | a | a |
| t2 | b | a（b 排队） | a、b | b（取消 a） | a（忽略 b） |
| t3 | c | a（b、c 排队） | a、b、c | c（取消 b） | a（忽略 c） |
| t4 | 外流完成 | a→b→c 依次跑 | 三条交错交付 | 只交付 c | 只交付 a |

这张表把「四种策略输出不同」从一句结论变成了可读的时间线：同一组输入、同样的投影函数，差别完全来自 t2、t3 两列对旧内流的处理。评审时可以直接拿它对照业务约束——搜索框不能让旧请求写回，所以 t2 必须是「取消 a」；批量上传必须保序，所以 t2 必须是「b 排队」。**先写出这张表再选算子**，比先写算子再解释行为可靠得多。

:::deep

### 扁平化不是 map 的加强版

\`map\` 是纯值映射，输入 N 个值输出 N 个值，不创建订阅、不持有资源（L05）。扁平化算子是**订阅管理器**：它为每个外值创建一条内流订阅，把这些订阅挂在同一个父账本上，还要在取消、报错、终结时逐一收口。因此两者在三个维度上完全不同：输出个数（N vs 0..∞）、资源持有（无 vs N 个句柄）、失败影响面（只影响当前值 vs 任一条内流 \`error\` 会终结整条结果链，见 L15）。把扁平化理解成「能处理异步的 map」会漏掉后两点，典型后果是给内流加了副作用却没意识到它可能被 \`switchMap\` 中途取消，或者以为某个内流报错只影响自己。真正的分界线是：**只要投影函数返回的是流，你就已经从「变换」跨进了「编排」**，此后必须同时考虑并发数、取消时机与错误传播。

:::

:::warn

### 三个扁平化起步坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 在 \`map\` 里返回 \`from(fetch(...))\` 并直接消费 | 界面出现对象字符串，数据一个都没到 | 换扁平化算子；类型标注应写成 \`Observable<Result>\` 而不是 \`Observable<Observable<Result>>\` |
| 在订阅回调里再订阅一次来「取值」 | 取消链断裂，路由切走后内流仍在跑 | 订阅只能有一层；内层交给算子管理 |
| 默认用 \`mergeMap\` 且不给并发上限 | 一次输入爆发几百个请求，下游限流、浏览器排队 | 用第二参数限定并发（L12），或按业务选 \`concatMap\` / \`switchMap\` |

第二条尤其值得警惕：嵌套 subscribe 在简单 demo 里能跑通，因此很容易被当成「扁平化的手写实现」；但它没有统一的取消账本，也没有策略语义，等于把 L03 与 S2 的两套责任都丢给了调用方。凡是看到 \`subscribe\` 里出现 \`subscribe\`，应当直接视为需要重构的信号。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 类型层级 | 能说清 \`Observable<Observable<T>>\` 与 \`Observable<T>\` 的差别 |
| 两层对象 | 能指出外流、投影函数、内流各自的生命周期归属 |
| 策略区分 | 四种策略只用「新值到来时旧内流怎么办」一句话区分 |
| 资源意识 | 知道扁平化会持有 N 个内流订阅，取消需统一收口 |
| 挂起风险 | 有一条内流不终结时，能指出哪种策略会永久阻塞 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L05 纯变换 | \`map\` 的一对一值映射与纯度 | 本课只说明「返回流时 map 不够用」 |
| L09 排队与并发 | \`concatMap\` / \`mergeMap\` 的时序推演 | 本课只给策略对照，不逐个推演输出 |
| L10 取最新与排空 | \`switchMap\` / \`exhaustMap\` 的取消与忽略 | 同上 |
| L11 决策树 | 三问顺序与四类场景选型 | 本课不提供选型结论 |
| L12 并发限制 | 并发上限、\`race\`、\`startWith\` | 本课只提示「不给上限有风险」 |
`,
    'rxFlatten',
    [
      {
        text: 'map 的回调返回 Observable 时，下游收到什么？',
        options: ['内层流的值', '整个内层 Observable 对象（未展开）', 'undefined', '报错'],
        answer: 1,
        explain: '这是「流的流」，必须用扁平化操作符（mergeMap 等）摊回，否则下游拿到的是对象本身。',
        concept: 'c-flatten',
      },
      {
        text: '扁平化要回答的根本问题是？',
        options: ['如何命名', '多个内层流在时间上重叠时按什么策略合并', '如何加速', '如何取消'],
        answer: 1,
        explain: '四个扁平化操作符的差异全在于「内层时序策略」：顺序 / 并发 / 取最新 / 排空。',
        concept: 'c-flatten',
      },
      {
        text: 'map 回调返回 Observable 且内层都是同步 of() 时，用哪个扁平化能保持外层顺序？',
        options: ['switchMap', 'concatMap', 'race', 'exhaustMap'],
        answer: 1,
        explain:
          'concatMap 严格串行：前一个内层 complete 才启动下一个，输出顺序与外层一致；switch/exhaust 带取消或忽略语义。',
        concept: 'c-flatten',
      },
    ],
    [
      ['内层流', 'map/flatMap 回调返回的 Observable'],
      ['扁平化', '把「流的流」摊回成一条流的算子族'],
    ],
    [
      '以为 map 会自动展开内层流（它不会，必须显式扁平化）。',
      '在不该并发的场景用了 mergeMap，导致请求乱序、旧结果覆盖新结果。',
    ],
  ),
  'theory',
)
