import { L, withKind } from '../../course-builders.ts'

export const L06 = withKind(
  L(
    'L06',
    1,
    '过滤与取舍：filter / take / skip / distinctUntilChanged',
    2,
    ['L05'],
    ['c-filter'],
    [
      '实现由 filter / take / skip / distinctUntilChanged 组成的筛选链',
      '写出带状态边界的去重版本并跑通重复值用例',
      '搭好断言验证 take 会提前取消上游、skip 不会',
      '产出常见取舍场景的算子选型表',
    ],
    `
### 一次事故：去重状态被所有订阅者共享

搜索建议里加了一段「连续相同关键词不重复请求」的逻辑，实现方式是在模块顶层放一个 \`let lastKeyword\`，在 \`map\` 里比对并更新它。单页面时一切正常；后来详情页也订阅了同一条建议流，两个订阅者开始互相踩 \`lastKeyword\`：A 刚把值设成「rx」，B 再发「rx」就被判成重复而丢弃，界面偶尔少一条建议。排查了很久才发现问题不在网络，而在**去重状态放错了位置**：它属于「一次订阅」，却被提升成了模块级全局。同类的还有「\`take(3)\` 之后定时器还在跑」「\`skip(2)\` 以为会提前结束」。这节课把过滤与取舍类算子拆成「无状态」「有状态」「会提前终结」三类，并把状态归属写成可断言的事实。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 哪些算子是纯判断、不记状态 | \`filter\`、\`skip\`（只数已收到的个数，仍属订阅内状态） |
| 哪些算子必须记状态 | \`distinctUntilChanged\` 记住「上一个值」，状态必须按订阅隔离 |
| 哪些算子会提前终结上游 | \`take\`、\`first\`、\`take(0)\`；它们会向上游发出取消，触发 teardown（L03） |
| 为什么 \`skip\` 不会提前取消 | 它只是丢弃前 N 个值，上游仍要跑完，代价照样付 |

### 取舍算子对照表

| 算子 | 状态 | 是否提前取消上游 | 空流 / 不足时的行为 | 典型用途 |
|---|---|---|---|---|
| \`filter(pred)\` | 无 | 否 | 直接 \`complete\` | 按业务条件放行 |
| \`take(n)\` | 计数 | 是，第 n 个值后 | 上游不足则随上游终结 | 只取前 N 条、限时轮询 |
| \`take(0)\` | 计数 | 是，立即 | 不发任何值，直接 \`complete\` | 探测订阅但不要数据 |
| \`skip(n)\` | 计数 | 否 | 全部丢弃后随上游终结 | 跳过预热帧、忽略首值 |
| \`first()\` | 计数 | 是 | 空流时以 \`error\` 终结 | 只要第一个值 |
| \`last()\` | 缓存末值 | 否，等上游完成才发 | 空流时不发值 | 汇总最后一次状态 |
| \`distinctUntilChanged()\` | 记住上一个值 | 否 | 原样传递 | 抑制连续重复 |

表里最容易被误读的是 \`first()\`：它在空流上不是「不发值」而是**报错**，这会让整条链提前终结，与「业务上没有匹配项」完全不是一回事。需要「可能没有值」的语义时，应当配合 L16 的 \`defaultIfEmpty\` 或 \`throwIfEmpty\` 显式决定，而不是让 \`first()\` 的隐含行为替你决定。

\`\`\`ts title="取舍链的 7.8.2 写法" note="distinctUntilChanged 的比较器显式给出，避免对象引用比较带来的假重复与假差异。"
import { of, from, defer, interval, EMPTY } from "rxjs"
import { filter, take, skip, first, last, distinctUntilChanged, finalize, map } from "rxjs/operators"

type Keyword = { text: string; source: "input" | "history" }

const events: Keyword[] = [
  { text: "rx", source: "input" },
  { text: "rx", source: "history" }, // 同一 text，应被去重
  { text: "rxjs", source: "input" },
  { text: "rxjs", source: "input" }, // 同一 text，应被去重
  { text: "rxjs", source: "history" },
]

const input$ = from(events).pipe(
  distinctUntilChanged((a, b) => a.text === b.text),
  filter((k) => k.source === "input"),
  take(2), // 第 2 个值之后自动取消上游、触发 finalize
)
input$.subscribe((k) => console.log("search", k.text))

// skip 不取消上游：定时器仍要跑满，finalize 只在源自己完成时触发
const skipped$ = interval(10).pipe(skip(2), take(2), finalize(() => console.log("skip-clean")))
skipped$.subscribe(console.log)

// 每个订阅者拥有独立的去重状态：用 defer 把状态关在订阅里
function dedup$() {
  return defer(() => {
    let previous: string | undefined
    return from(events).pipe(
      distinctUntilChanged((a) => {
        const key = a.text
        if (key === previous) return true
        previous = key
        return false
      }),
      map((k) => k.text),
    )
  })
}
dedup$().subscribe((v) => console.log("A", v))
dedup$().subscribe((v) => console.log("B", v)) // 与 A 完全一致，互不干扰

// 空流语义：first 会报错，last 只是不发值
EMPTY.pipe(first()).subscribe({ error: (e) => console.warn("first on empty", e.message) })
EMPTY.pipe(last()).subscribe({ complete: () => console.log("last on empty: completed") })
\`\`\`

### 用最小模型把「状态归属」变成可断言的事实

下面不依赖 RxJS 包，实现 \`take\` / \`skip\` / \`distinct\` 三个算子与一个可观察的假源，断言：状态必须按订阅隔离、\`take\` 会提前停止生产、\`skip\` 不会、对象引用比较会把两条不同记录误判为重复。

\`\`\`ts
import assert from "node:assert/strict"

type Sink<T> = { values: T[]; done: boolean; cancelled: boolean }

function source<T>(items: T[]) {
  return {
    subscribe(sink: Sink<T>, onValue: (v: T, sink: Sink<T>) => void) {
      for (const item of items) {
        if (sink.cancelled) break
        onValue(item, sink)
      }
      if (!sink.cancelled) sink.done = true
    },
  }
}

function takeOp<T>(n: number) {
  return (items: T[], sink: Sink<T>): T[] => {
    const kept: T[] = []
    let seen = 0
    for (const item of items) {
      if (seen >= n) { sink.cancelled = true; break }
      kept.push(item)
      seen += 1
    }
    return kept
  }
}

function skipOp<T>(n: number) {
  return (items: T[]): T[] => items.slice(n)
}

/** 正确版：比较器由调用方给出，状态在函数内部、每次订阅重新创建。 */
function distinctBy<T>(keyOf: (v: T) => string) {
  return (items: T[]): T[] => {
    let previous: string | undefined
    const out: T[] = []
    for (const item of items) {
      const key = keyOf(item)
      if (key !== previous) { out.push(item); previous = key }
    }
    return out
  }
}

const items = ["a", "a", "b", "b", "c"]

const sinkA = { values: [] as string[], done: false, cancelled: false }
const sinkB = { values: [] as string[], done: false, cancelled: false }
const s = source(items)

// 负例：把 take 拆成「每个值单独调用一次」，计数器每次归零，上游永远取消不了
s.subscribe(sinkA, (v, sk) => { sk.values.push(...takeOp<string>(2)([v], sk)) })
assert.equal(sinkA.cancelled, false, "逐值调用时取数状态被重置，take 永远不会取消上游")
assert.equal(sinkA.values.length, items.length, "而且一个值都没少收")

// 一次订阅内跑完整链：take 提前取消
const whole = { values: [] as string[], done: false, cancelled: false }
whole.values.push(...takeOp<string>(2)(items, whole))
assert.deepEqual(whole.values, ["a", "a"])
assert.equal(whole.cancelled, true, "take(2) 之后上游必须停手")
assert.equal(whole.done, false)

const skipped = skipOp<string>(2)(items)
assert.deepEqual(skipped, ["b", "b", "c"])
assert.equal(skipped.length, 3, "skip 不减少上游工作量，只是丢弃前两个值")

// 状态隔离：两条独立订阅各自去重，互不污染
const outA = distinctBy((x: string) => x)(items)
const outB = distinctBy((x: string) => x)(items)
assert.deepEqual(outA, ["a", "b", "c"])
assert.deepEqual(outB, outA)

// 负例：对象引用比较会把内容相同的两条记录当成不同值
type K = { text: string }
const objs: K[] = [{ text: "rx" }, { text: "rx" }, { text: "rxjs" }]
const byRef = (arr: K[]) => arr.filter((v, i) => i === 0 || v !== arr[i - 1])
assert.equal(byRef(objs).length, 3, "引用比较没有去掉内容重复")
assert.equal(distinctBy((k: K) => k.text)(objs).length, 2, "按 text 比较才得到 2 条")
\`\`\`

第一条断言特意暴露了一个实现陷阱：把 \`take\` 写成「逐个值调用一次」会让计数器每次归零，永远取消不了上游。这正是 00089 记录过的 cursor 重置类错误在时间维度上的翻版——**有状态算子的状态必须挂在链上，而不是挂在单次回调里**。最后一组负例则说明 \`distinctUntilChanged()\` 默认按引用比较，对象流里几乎总是要显式传比较器。

:::deep

### 「过滤」不改变流的身份，但会改变它的代价模型

\`filter\` 丢掉值，\`skip\` 丢掉前几个值，看起来都只是「少收一点」。但上游的生产成本并不随下游丢弃而减少：网络请求已经发出、定时器已经跑过、解析已经做完。\`take\` 是这一组里唯一会**反向通知上游停止**的算子，因此它是唯一真正降低生产成本的取舍手段。这个差别决定了两类设计：需要「只取前 N 条」时优先 \`take\`，因为它会触发 L03 的 teardown；需要「忽略开头几帧」时 \`skip\` 无可替代，但要清楚代价照付。再往外推一步，如果丢弃比例很高（一万条里只要三条），正确的做法往往不是加更激进的 \`filter\`，而是回到源头改查询条件——**流内过滤是表达力工具，不是容量规划工具**。把这两件事混在一起，就会写出「上游拉全表、下游丢掉 99%」的链路，压测时怎么调算子顺序都救不回来。

:::

:::warn

### 三个取舍踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 把去重状态放在模块顶层 | 多个订阅者互相覆盖 \`lastValue\`，偶发漏值且难以复现 | 状态关进 \`defer\` 工厂或直接用 \`distinctUntilChanged\`，每次订阅独立持有 |
| 对象流用默认 \`distinctUntilChanged()\` | 内容相同的两个对象被当成不同值，去重完全失效 | 显式传比较器 \`(a, b) => a.id === b.id\` |
| 在空流上用 \`first()\` 期望拿到 \`undefined\` | 直接以 \`error\` 终结，整条链断掉 | 用 \`defaultIfEmpty\` / \`throwIfEmpty\`（L16）显式定义「没有值」的语义 |

第二个坑还有个变体：比较器写成了 \`(a) => a.id\`（只取一个参数）却以为在比较前后值。7.8.2 的比较器签名是前后两个值，写成单参数时第二个值根本没参与判断，去重结果会随数据顺序诡异变化。凡是有状态算子，先写一条「两条内容相同但引用不同的记录应被去重」的断言，比读三遍文档可靠。

:::

### 一次取舍链的完整推演

假设输入是五条关键词记录，链为「按 text 去重 → 只留 input → take(2)」。逐值推演如下：

| 序号 | text | source | 去重后是否保留 | 通过 filter | take 计数 | 是否交付 |
|---|---|---|---|---|---|---|
| 1 | rx | input | 保留，previous 记为 rx | 是 | 1 | 是 |
| 2 | rx | history | 丢弃，text 与 previous 相同 | 否 | 1 | 否 |
| 3 | rxjs | input | 保留，previous 记为 rxjs | 是 | 2 | 是，随后取消上游 |
| 4 | rxjs | input | 不会到达，上游已取消 | 否 | 否 | 否 |
| 5 | rxjs | history | 不会到达，上游已取消 | 否 | 否 | 否 |

第 4、5 行是这张表的重点：它们不是「被过滤掉了」，而是**根本没有进入链**。这个区别在排查时非常关键——如果上游挂了 finalize 或埋点，第 3 个值之后就会立刻触发清理；若把链写成先 filter 再 take，第 4 行会先被保留、再把 take 计满，取消时机整体后移一帧。时间敏感的链路（比如「只取前两条报价就断开连接」）必须按这张表逐值确认取消发生在哪一帧，而不是靠「应该差不多」。同一张表也能用来验证状态隔离：把 previous 换成模块级变量后，第二条订阅的第 1 行就会因为 previous 已是 rx 而被误丢，前面那条状态隔离断言能直接抓到。把推演表写进评审材料，比在脑内模拟算子顺序可靠得多。

### 验收清单

| 检查 | 判据 |
|---|---|
| 状态隔离 | 同一源两次订阅的去重序列完全一致，互不干扰 |
| 提前取消 | \`take(2)\` 后上游 \`cancelled = true\` 且 \`done = false\` |
| 代价认知 | \`skip(2)\` 不减少上游工作量，断言输出仍含剩余全部值 |
| 比较器 | 对象流按业务键比较，负例能证明引用比较失效 |
| 空流语义 | 明确区分 \`first()\` 报错与 \`last()\` 静默完成 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L05 纯变换 | \`map\` / \`pipe\` 的一对一映射与纯度 | 本课不重复纯度论证，只处理「要不要这个值与要几个」 |
| L07 归约与收集 | \`reduce\` / \`toArray\` / \`buffer\` 把多条值合成一条 | 本课只做取舍，不把值收集成结构 |
| L13 终结语义 | \`error\` / \`complete\` 不可逆的完整契约 | 本课只提示 \`first()\` 在空流上会 \`error\` |
| L16 安全订阅 | \`defaultIfEmpty\` / \`throwIfEmpty\` 的兜底链 | 本课把「空流怎么办」明确交给 L16 |
`,
    'rxFilter',
    [
      {
        text: 'distinctUntilChanged 的去重范围是？',
        options: ['整条流去重', '仅相邻重复', '可配置去重窗口', '按 key 全量去重'],
        answer: 1,
        explain: '它只比较「上一个」值；全量去重要么自己维护 Set，要么用 distinct(keySelector)。',
        concept: 'c-filter',
      },
      {
        text: 'take(3) 之后流的状态是？',
        options: ['继续发射', 'complete，不再发射', '挂起等待', '抛错'],
        answer: 1,
        explain: 'take(n) 取到第 n 个值就自动 complete，下游不再收到任何值——这是「截断」的内置语义。',
        concept: 'c-filter',
      },
    ],
    [
      ['filter', '按谓词保留元素、改变发射次数'],
      ['take / skip', '按数量截断 / 丢弃前 n 个'],
    ],
    [
      '以为 distinctUntilChanged 能跨非相邻去重。',
      'takeWhile 与 take 混用：takeWhile 遇到首个不满足即停，take 是固定数量。',
    ],
  ),
  'practice',
)
