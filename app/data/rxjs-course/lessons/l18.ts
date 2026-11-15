import { L, withKind } from '../../course-builders.ts'

export const L18 = withKind(
  L(
    'L18',
    4,
    '状态型 Subject：Behavior / Replay / Async',
    3,
    ['L17'],
    ['c-state-subj'],
    [
      '说清 Behavior / Replay / Async 三者重放语义差别',
      '解释初始值、缓冲上限与「最后一个值」的取舍',
      '对照新订阅者在不同实现下拿到的序列',
      '说清无界缓冲的内存代价',
    ],
    `
### 一次事故：一个不带上限的 ReplaySubject 拖垮了标签页

全局消息中心用 \`new ReplaySubject()\` 缓存所有历史消息，理由是「晚进页面的组件也能看到完整记录」。上线初期没人在意，运行几个小时后每个标签页的内存曲线稳步上升——行情消息每秒几十条，无界缓冲把它们全留在内存里，而且每个新订阅者都要重放一遍。另一个页面更安静：用 \`AsyncSubject\` 接收持续更新的配置流，结果一个值都收不到，因为 \`AsyncSubject\` 只在 \`complete\` 时发最后一个值，而那条流永不终结。两次问题都是**把「重放语义」当成了可随意叠加的装饰**，没有先说清每种 Subject 到底保存什么、什么时候发。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`BehaviorSubject\` 保存什么 | 一个「当前值」，必须有初始值，新订阅者立刻收到它 |
| \`ReplaySubject\` 保存什么 | 最近 N 个值，N 必须显式给出，否则无界 |
| \`AsyncSubject\` 什么时候发值 | 仅在 \`complete\` 时发最后一个值；流不终结就永远不发 |
| 普通 \`Subject\` 呢 | 什么都不存，晚订阅者只收到订阅之后的值（L17） |

### 四种 Subject 的重放语义对照

| 类型 | 保存内容 | 新订阅者立刻收到 | 何时发最后一个值 | 内存特征 |
|---|---|---|---|---|
| \`Subject\` | 无 | 无 | 不适用 | 常数 |
| \`BehaviorSubject(initial)\` | 1 个当前值 | 当前值（或初始值） | 每次 \`next\` 都更新 | 常数 |
| \`ReplaySubject(N)\` | 最近 N 个 | 最多 N 个历史值 | 每次 \`next\` 入缓冲 | 与 N 成正比 |
| \`ReplaySubject()\` | 无界历史 | 全部历史值 | 每次 \`next\` 都追加 | **无上限增长** |
| \`AsyncSubject\` | 最后一个值 | 无 | 仅 \`complete\` 时 | 常数 |

表里第二列「保存内容」是选型的唯一依据，第四列「何时发最后一个值」决定了它能不能用在持续流上。\`BehaviorSubject\` 与 \`ReplaySubject(1)\` 看起来都能「补最近一个值」，但前者强制要求初始值、语义上表示「状态」；后者允许空、语义上表示「事件缓冲」。把状态建模成可空的缓冲，会让下游到处写「如果还没值怎么办」的兜底；把事件流建模成必须有初始值的状态，又会凭空造出一个并不存在的初始值。

\`\`\`ts title="四种 Subject 的 7.8.2 写法" note="BehaviorSubject 必须给初始值；ReplaySubject 必须给 bufferSize；AsyncSubject 只在 complete 时发值。"
import { Subject, BehaviorSubject, ReplaySubject, AsyncSubject, of } from "rxjs"
import { take, tap } from "rxjs/operators"

// ① 纯广播：不保存任何历史
const plain = new Subject<string>()
plain.subscribe((v) => console.log("A", v))
plain.next("one")
plain.subscribe((v) => console.log("B", v)) // B 收不到 one
plain.next("two")

// ② 状态：必须有初始值，新订阅者立刻拿到当前值
const theme = new BehaviorSubject<string>("light")
theme.subscribe((v) => console.log("theme-A", v)) // 立刻 light
theme.next("dark")
theme.subscribe((v) => console.log("theme-B", v)) // 立刻 dark

// ③ 有界缓冲：只保留最近 2 个
const recent = new ReplaySubject<number>(2)
recent.next(1)
recent.next(2)
recent.next(3)
recent.subscribe((v) => console.log("recent", v)) // 2, 3

// ④ 完成时发最后一个值：持续流上永远不发射
const finalOnly = new AsyncSubject<string>()
finalOnly.subscribe((v) => console.log("final", v))
finalOnly.next("draft-1")
finalOnly.next("draft-2")
console.log("before complete: no value yet")
finalOnly.complete() // 此时才发 draft-2

// ⑤ 有界 + 取数：长流上必须限制缓冲与订阅寿命
const bounded = new ReplaySubject<number>(3)
of(1, 2, 3, 4, 5).subscribe(bounded)
bounded.pipe(take(3), tap((v) => console.log("bounded", v))).subscribe()
\`\`\`

### 用最小模型把「新订阅者拿到什么」变成可断言的事实

下面不依赖 RxJS 包，把四种重放语义写成一个纯函数，逐一断言晚订阅者的序列，并用负例证明无界缓冲与「未 complete 的 AsyncSubject」各自的风险。

\`\`\`ts
import assert from "node:assert/strict"

type Kind = "subject" | "behavior" | "replay" | "async"
type Opts = { initial?: number; bufferSize?: number; completed?: boolean }

/** 假设 emitted 中的值已经全部发过，此时来了一个新订阅者。 */
function lateSequence(kind: Kind, emitted: number[], opts: Opts = {}): number[] {
  if (kind === "subject") return []
  if (kind === "behavior") {
    return [emitted.length ? emitted.at(-1)! : (opts.initial ?? 0)]
  }
  if (kind === "replay") {
    const n = opts.bufferSize ?? Number.POSITIVE_INFINITY
    return emitted.slice(-n)
  }
  // async：只有 complete 之后才发最后一个值
  return opts.completed === true && emitted.length ? [emitted.at(-1)!] : []
}

const emitted = [1, 2, 3, 4, 5]

assert.deepEqual(lateSequence("subject", emitted), [], "普通 Subject 不补历史")
assert.deepEqual(lateSequence("behavior", emitted, { initial: 0 }), [5], "状态补当前值")
assert.deepEqual(lateSequence("behavior", [], { initial: 0 }), [0], "没有值时补初始值")
assert.deepEqual(lateSequence("replay", emitted, { bufferSize: 2 }), [4, 5], "只补最近 2 个")
assert.deepEqual(lateSequence("async", emitted, { completed: true }), [5])

// 负例一：无界缓冲会把全部历史交给每个新订阅者
const unbounded = lateSequence("replay", emitted)
assert.equal(unbounded.length, emitted.length, "无界 = 全部历史，长期热流会持续堆积")
assert.ok(unbounded.length > lateSequence("replay", emitted, { bufferSize: 2 }).length)

// 负例二：AsyncSubject 用在永不终结的流上，一个值都拿不到
const neverEnding = lateSequence("async", emitted, { completed: false })
assert.deepEqual(neverEnding, [], "未 complete 时 AsyncSubject 静默")

// 负例三：把状态写成可空缓冲，下游要额外兜底
const bufferedState = lateSequence("replay", [], { bufferSize: 1 })
assert.deepEqual(bufferedState, [], "没有初始值时新订阅者拿不到状态")
assert.notDeepEqual(bufferedState, lateSequence("behavior", [], { initial: 0 }))
\`\`\`

第三组负例把「Behavior vs Replay(1)」的差别落到了可观察的行为上：同样是「最近一个值」，空输入时前者给初始值、后者什么都不给。若下游把「当前主题」写成 \`ReplaySubject(1)\`，首帧就要额外处理 undefined；而写成 \`BehaviorSubject("light")\`，首帧永远有值。**语义差别不是命名偏好，而是首帧行为**。

### 四种实现的完整推演

以依次发出 1、2、3、4、5，随后（可选）\`complete\`，再接入一个新订阅者为例：

| 实现 | 缓冲内容 | 新订阅者立刻收到 | 未 complete 时 | 适合建模 |
|---|---|---|---|---|
| \`Subject\` | 空 | 无 | 继续只收之后的值 | 点击、广播 |
| \`BehaviorSubject(0)\` | 5 | 5 | 正常 | 主题、登录态、当前选中项 |
| \`ReplaySubject(2)\` | 4、5 | 4、5 | 正常 | 最近几条消息、审计尾窗 |
| \`ReplaySubject()\` | 1..5 | 全部五个 | 正常但持续增长 | 不应在长期热流上使用 |
| \`AsyncSubject\` | 5 | 无 | **永远不发** | 一次性任务、只需最终结果 |

最后一行解释了开头那个「配置流一个值都收不到」的事故：\`AsyncSubject\` 的语义是「等全部结束再给结论」，与「持续更新的配置」正好相反。它适合的是 L07 那种「只在 complete 时发射一次」的汇总场景，不是状态流。

:::deep

### 重放是热流之上额外加的一层状态

L02 说过冷热描述的是「谁触发生产」，重放并不改变这一点：无论 \`BehaviorSubject\` 还是 \`ReplaySubject\`，生产仍然独立于订阅，只是它们额外维护了一份缓冲。这个分层很重要，因为它说明**「晚订阅者能补值」与「这条流是热的」没有因果关系**：你可以用 \`shareReplay\`（L20）给一条原本冷的源加上重放，它仍然是冷源 + 共享层的组合；你也可以让一个纯 \`Subject\` 完全不补值。把重放当成「热流的定义」会推导出「我要一个能补历史值的冷流」这种自相矛盾的需求。工程上的正确问法是三问：谁触发生产（冷 / 热）、要不要共享一次生产（L17、L19）、要不要给晚到者补状态（本课）。三问各自独立，答案组合起来才是完整选型。

:::

:::warn

### 三个状态型 Subject 踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| \`new ReplaySubject()\` 不设上限 | 长期热流内存无限增长，新订阅者重放越来越慢 | 一律显式给 \`bufferSize\`，或改 \`shareReplay({ bufferSize })\` |
| 用 \`AsyncSubject\` 接永不终结的流 | 一个值都收不到，且没有任何报错 | 只在「一次性任务、只取最终结果」时使用；状态流用 \`BehaviorSubject\` |
| 把 \`ReplaySubject(1)\` 当成状态用 | 首帧没有值，下游到处写 undefined 兜底 | 状态用 \`BehaviorSubject(initial)\`，让初始值成为契约的一部分 |

第一条还有一个隐蔽成本：缓冲不只是占内存，每个新订阅者都要重放一遍全部历史。在高频推送场景里，一个新组件挂载就可能触发上千次下游回调，界面卡顿比内存曲线更早暴露问题。因此 bufferSize 不只是内存参数，也是**首帧延迟参数**。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 语义区分 | 四种实现下晚订阅者的序列均能被断言固定 |
| 初始值契约 | \`BehaviorSubject\` 必有初始值，空输入时补它 |
| 缓冲有界 | \`ReplaySubject\` 一律显式给 \`bufferSize\` |
| 终结条件 | \`AsyncSubject\` 只在 complete 后发最后一个值 |
| 分层认知 | 能说清重放与冷热是两个正交维度 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L02 冷流与热流 | 生产责任归属与三元组契约 | 本课只讲重放这一层额外状态 |
| L17 Subject 多播 | 冷流桥接成热源、单次连接与资源账本 | 本课不重复桥接实现，只补重放语义 |
| L19 连接共享 | \`share\` 与 refCount 自动连接 / 断开 | 本课不处理订阅计数 |
| L20 重放边界 | \`shareReplay\` 配置与连接 / 断开 / 重放三类陷阱 | 本课只给 Subject 家族的语义表 |
| L21 泄漏排查 | 无界缓冲、订阅未回收的排障清单 | 本课指出无界风险，不做探针 |
`,
    'rxSubject',
    [
      {
        text: '「新订阅者立刻拿到最近一个值」应使用？',
        options: ['普通 Subject', 'BehaviorSubject', 'ReplaySubject', 'AsyncSubject'],
        answer: 1,
        explain: 'BehaviorSubject 需要初始值，并把「当前值」立即发给新订阅者，之后随 next 更新。',
        concept: 'c-state-subj',
      },
      {
        text: '「等整个流 complete 时才把最后一个值发给订阅者」是？',
        options: ['BehaviorSubject', 'ReplaySubject', 'AsyncSubject', '普通 Subject'],
        answer: 2,
        explain: 'AsyncSubject 只在 complete 时发一次「最终值」，若流从未 complete 则订阅者什么都拿不到。',
        concept: 'c-state-subj',
      },
      {
        text: 'BehaviorSubject 的构造有什么硬性要求？',
        options: ['无要求，可选初始值', '必须提供初始值', '必须提供缓冲上限', '必须传清理函数'],
        answer: 1,
        explain: 'BehaviorSubject(v) 强制要求初始值，新订阅者立即收到「当前值」，之后随 next 更新。',
        concept: 'c-state-subj',
      },
    ],
    [
      ['BehaviorSubject', '需初始值，新订阅者立即拿到当前值'],
      ['ReplaySubject', '缓存最近 N 个值供新订阅者重放'],
    ],
    [
      '长期运行的热流用无上限 ReplaySubject，内存无限增长。',
      '期望 AsyncSubject 在未 complete 时就有值（它只在完成时发最后一个）。',
    ],
  ),
  'theory',
)
