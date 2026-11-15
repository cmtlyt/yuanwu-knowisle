import { L, withKind } from '../../course-builders.ts'

export const L24 = withKind(
  L(
    'L24',
    5,
    '组合多源：combineLatest / merge / zip / withLatestFrom',
    3,
    ['L05'],
    ['c-combine'],
    [
      '实现 combineLatest / merge / zip / withLatestFrom 四条组合链并跑通',
      '写出一个最小多源模型验证配对规则',
      '搭好断言覆盖「缺一侧值」「长度不等」「只取最新」三类输入',
      '产出一张组合算子选型表',
    ],
    `
### 一次事故：两路数据都到了，界面却一直不刷新

筛选面板把「当前条件」与「用户信息」用 \`combineLatest\` 合成一次查询。测试账号有用户信息，一切正常；新用户第一次进入时，用户信息系统还没返回过任何值，于是 \`combineLatest\` 一个组合值都不发，界面停在骨架屏，既不报错也不超时。有人改成 \`zip\`，结果条件变化三次、用户信息只来一次，后两次变化被静静搁置；再改成 \`merge\`，下游拿到的是两种形状不同的值，解析直接崩了。四次改动都在换「组合算子」，却没有一次先回答最基础的问题：**到底是谁触发一次输出、另一方扮演什么角色**。这节课把四个组合算子拆成「触发方 / 补充方 / 配对规则」三列，并把三类边界写成可失败的断言。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| \`combineLatest\` 何时第一次发值 | 每个源都至少发过一个值之后；任一源再变化就发最新组合 |
| \`zip\` 如何配对 | 按序号一一配对，长度不等时多余的值等待对方 |
| \`merge\` 做了什么 | 不配对、不等待，按到达时间把各源的值原样交错 |
| \`withLatestFrom\` 与 combineLatest 差在哪 | 只有「我」这一路能触发输出，另一路只提供最近值 |

### 四算子对照表

| 算子 | 触发方 | 补充方 | 配对规则 | 一方没值时 | 典型场景 |
|---|---|---|---|---|---|
| \`combineLatest(a$, b$)\` | 任一路 | 其余各路的最新值 | 各取最新 | **不发任何值** | 多条件筛选、表单联动 |
| \`zip(a$, b$)\` | 成对到齐 | 互为补充 | 按序号严格配对 | 多余值等待 | 并行请求结果合并 |
| \`merge(a$, b$)\` | 每路自己 | 无 | 不配对 | 不受影响 | 日志、同类事件汇总 |
| \`trigger$.pipe(withLatestFrom(data$))\` | 仅 trigger | data 提供最近值 | 无配对 | trigger 被忽略 | 点击时捎上当前配置 |

表里第五列「一方没值时」是开头那次事故的直接答案：\`combineLatest\` 要求**每路都发过至少一次**，这与「数据还没加载完」是完全不同的状态，视觉上却都表现为空白。修复不是换算子，而是给缺失的那一路一个明确的初始值——\`startWith(DEFAULT)\`（L16），让「还没有」变成「有一个默认值」。同理，\`zip\` 的严格配对适合「两个并行请求各返回一次」，用在「条件频繁变化、用户只来一次」的场景就会把后续条件永久排队。

\`\`\`ts title="四种组合的 7.8.2 写法" note="创建与组合函数从 rxjs 导入，withLatestFrom 等单参数操作符从 rxjs/operators 导入。"
import { of, interval, combineLatest, zip, merge, fromEvent, timer } from "rxjs"
import { map, take, startWith, withLatestFrom } from "rxjs/operators"

const a$ = interval(100).pipe(map((n) => "a" + n), take(3))
const b$ = interval(150).pipe(map((n) => "b" + n), take(2))

// ① 各取最新：任一路变化都重新组合
combineLatest([a$, b$]).subscribe(([a, b]) => console.log("latest", a, b))

// ② 严格按序号配对：多出来的值等待对方
zip(a$, b$).subscribe(([a, b]) => console.log("zipped", a, b))

// ③ 不配对、不等待：按到达时间交错
merge(a$, b$).subscribe((v) => console.log("merged", v))

// ④ 只有 trigger 能触发，config 只补最近值
const trigger$ = fromEvent(document, "click")
const config$ = timer(0, 1000).pipe(map((n) => ({ theme: n % 2 ? "dark" : "light" })))
trigger$
  .pipe(withLatestFrom(config$), take(3))
  .subscribe(([ev, cfg]) => console.log("click with", cfg.theme))

// ⑤ 修复「一路永远不发值」：给缺失的一路一个明确初始值
const conditions$ = of("all", "paid", "refunded")
const profile$ = of({ vip: true }).pipe(startWith({ vip: false }))
combineLatest([conditions$, profile$]).subscribe(console.log)
\`\`\`

### 用最小模型把「谁触发」变成可断言的事实

下面不依赖 RxJS 包，用带时刻的两路事件实现四种组合逻辑，断言：缺一侧时 combineLatest 不发值、\`zip\` 只产出成对部分、\`merge\` 保留全部值、\`withLatestFrom\` 只在触发路发值且带另一方最近值。

\`\`\`ts
import assert from "node:assert/strict"

type Tick = { at: number; source: "a" | "b"; value: string }

const a: Tick[] = [
  { at: 0, source: "a", value: "a1" },
  { at: 2, source: "a", value: "a2" },
  { at: 4, source: "a", value: "a3" },
]
const b: Tick[] = [
  { at: 1, source: "b", value: "b1" },
  { at: 3, source: "b", value: "b2" },
]

function combineLatest(aTicks: Tick[], bTicks: Tick[]): string[] {
  const all = [...aTicks, ...bTicks].sort((x, y) => x.at - y.at)
  let latestA: string | undefined
  let latestB: string | undefined
  const out: string[] = []
  for (const t of all) {
    if (t.source === "a") latestA = t.value
    else latestB = t.value
    if (latestA !== undefined && latestB !== undefined) {
      out.push(latestA + "/" + latestB)
    }
  }
  return out
}

function zipPairs(aTicks: Tick[], bTicks: Tick[]): string[] {
  const n = Math.min(aTicks.length, bTicks.length)
  return Array.from({ length: n }, (_, i) => aTicks[i].value + "/" + bTicks[i].value)
}

function mergeAll(aTicks: Tick[], bTicks: Tick[]): string[] {
  return [...aTicks, ...bTicks].sort((x, y) => x.at - y.at).map((t) => t.value)
}

function withLatest(aTicks: Tick[], bTicks: Tick[]): string[] {
  const all = [...aTicks, ...bTicks].sort((x, y) => x.at - y.at)
  let latestB: string | undefined
  const out: string[] = []
  for (const t of all) {
    if (t.source === "b") { latestB = t.value; continue }
    if (latestB !== undefined) out.push(t.value + "/" + latestB)
  }
  return out
}

// 正常两路
assert.deepEqual(combineLatest(a, b), ["a1/b1", "a2/b1", "a2/b2", "a3/b2"])
assert.deepEqual(zipPairs(a, b), ["a1/b1", "a2/b2"], "长度不等时只产出成对部分")
assert.deepEqual(mergeAll(a, b), ["a1", "b1", "a2", "b2", "a3"], "按到达时刻原样交错")
assert.deepEqual(withLatest(a, b), ["a2/b1", "a3/b2"], "只有 a 能触发输出")

// 负例一：另一路从未发值，combineLatest 一个组合都不给
assert.deepEqual(combineLatest(a, []), [], "这就是新用户停在骨架屏的原因")
assert.deepEqual(withLatest(a, []), [])

// 负例二：把 zip 用在「一方只发一次」的联动场景
assert.deepEqual(zipPairs(a, b.slice(0, 1)), ["a1/b1"], "a2、a3 被永久搁置")
assert.ok(combineLatest(a, b.slice(0, 1)).length > 1, "combineLatest 能继续联动")

// 负例三：merge 不区分形状，下游若按 [a,b] 解构必然出错
const merged = mergeAll(a, b)
assert.equal(merged.length, a.length + b.length)
assert.equal(merged[0], "a1", "merge 交出的是原始值，不是组合")
\`\`\`

第一组断言把 \`combineLatest\` 的触发次数也算清楚了：两路共 5 个事件，但前 1 个因为 b 还没有值不产出，因此是 4 个组合。第二组负例则把「条件变化三次、用户只来一次」的后果量化：\`zip\` 只给 1 对，后两次条件永远等不到配对。**选型前先写这张输入表**，比在四个 API 之间反复试快得多。

### 一次组合链的完整推演

以 a 在 0 / 2 / 4 发 a1/a2/a3、b 在 1 / 3 发 b1/b2 为例：

| 时刻 | 事件 | combineLatest | zip | merge | withLatestFrom(a) |
|---|---|---|---|---|---|
| 0 | a1 | 不发（b 无值） | 缓存 a1 | a1 | 不发（b 无值） |
| 1 | b1 | a1/b1 | a1/b1 | b1 | 缓存 b1 |
| 2 | a2 | a2/b1 | 缓存 a2 | a2 | a2/b1 |
| 3 | b2 | a2/b2 | a2/b2 | b2 | 缓存 b2 |
| 4 | a3 | a3/b2 | 缓存 a3（无配对） | a3 | a3/b2 |

第 0 行与第 4 行是两类典型失败：前者「谁都没触发」，后者「触发了但对方没跟上」。把表横向读，\`withLatestFrom\` 那一列只在 a 事件的行里有输出，这正是「只有我能触发」的语义；而 \`combineLatest\` 在 b 事件的行里也有输出，说明 b 同样是触发方。两者差别不在数据形状，全在**触发权**。

### 组合选型清单

| 业务约束 | 选择 | 必须补的保护 |
|---|---|---|
| 多路都可能变化，任一变化就刷新 | \`combineLatest\` | 每路给 \`startWith\` 初始值，避免首帧不发 |
| 两个并行结果严格一一对应 | \`zip\` | 确认长度一致或明确多余值可丢弃 |
| 同类事件汇总，不需要配对 | \`merge\` | 统一值类型，别让下游按组合解构 |
| 只在某个动作发生时捎上另一路当前值 | \`withLatestFrom\` | 另一路也需初始值，否则触发被忽略 |
| 任一路失败不能拖垮整体 | 各路内部 \`catchError\`（L15） | 保留各路的名称与降级标记 |

:::deep

### 组合算子的本质是「触发权」的分配

四个算子处理的是同一批输入，差别只在于**谁有权让结果流发射一次**。\`merge\` 把触发权交给每一路；\`combineLatest\` 把触发权交给每一路，但每次都要补齐其余各路的最新值；\`zip\` 把触发权交给「成对到齐」这个条件；\`withLatestFrom\` 把触发权独占给主路。理解这一点后，「为什么 combineLatest 不发值」「为什么 zip 会搁置多余值」「为什么 withLatestFrom 点击没反应」就不再需要分别记忆，都是触发权规则的推论。工程上还有一层容易忽略：组合会让多条源共享同一个结果流，因此 L15 的错误传播结论同样适用——任一路 error 会让整个结果流终结，其他路被取消。想让「A 失败不影响 B」，兜底必须写在各路内部、组合之前。

:::

:::warn

### 三个组合踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| \`combineLatest\` 有一路可能永远不发值 | 界面永久停在骨架屏，无报错无超时 | 每路 \`startWith(DEFAULT)\`，或给该路加超时兜底 |
| 用 \`zip\` 处理频率不同的联动 | 高频一路的后续值被永久排队 | 改 \`combineLatest\`；\`zip\` 只用于严格一一对应 |
| 把 \`merge\` 的结果按 \`[a, b]\` 解构 | 运行时拿到单个原始值，解析崩溃 | 用 \`map\` 先统一形状，或换 \`combineLatest\` |

第一条还有一个隐蔽变体：某路「很晚才发第一个值」而不是「永远不发」，界面会先白屏几秒再突然刷新，用户以为卡了。\`startWith\` 给出的初始值不只是防呆，它同时把「还没加载」变成一个有语义、可渲染的状态（L16）。

:::

### 组合链的三条不变量

| 不变量 | 断言写法 | 破坏后的现象 |
|---|---|---|
| 首帧必有值 | 每路 \`startWith\` 后第一个组合非空 | 新用户停在骨架屏 |
| 触发权唯一 | \`withLatestFrom\` 只在主路事件时计数增加 | 另一路变化也刷新界面 |
| 配对不越界 | \`zip\` 产出对数等于较短一路的长度 | 多余值被静默搁置 |

这三条分别对应本课三次事故，写进测试后，后续有人把 \`combineLatest\` 换成 \`zip\`、把 \`withLatestFrom\` 写成 \`combineLatest\`、或删掉某路的 \`startWith\`，断言会立刻失败，而不是等到用户反馈界面不刷新。第三条还提醒我们「长度不等」不是异常输入而是常态：用户信息只在登录时发一次，条件却会随交互不断变化，把这种场景当成「两边数量应该相同」来设计，本身就选错了算子。把不变量写成与业务场景一一对应的断言，比在评审里反复强调「注意首帧」可靠得多。

### 验收清单

| 检查 | 判据 |
|---|---|
| 首次发射 | 每路都发过至少一次后 \`combineLatest\` 才有输出 |
| 配对规则 | 长度不等时 \`zip\` 只产出成对部分 |
| 触发权 | \`withLatestFrom\` 只在主路事件时出现输出 |
| 形状一致 | \`merge\` 交付原始值，下游不做组合解构 |
| 错误隔离 | 各路 \`catchError\` 在组合之前（L15） |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L09 / L12 扁平化 | 外值与内流的派生与并发上限 | 本课处理的是若干独立源的组合 |
| L16 空流兜底 | \`startWith\` / \`defaultIfEmpty\` 的语义 | 本课把 startWith 用作组合首帧保护 |
| L15 错误传播 | 收敛结构放大错误爆炸半径 | 本课只把结论应用到组合 |
| L25 背压落地 | 生产快于消费者时的批量整形 | 本课不控制速率，只决定组合方式 |
| L23 时间算子 | 同一路输入的时间窗口 | 本课处理多路之间的时序关系 |
`,
    'rxCombine',
    [
      {
        text: '「两个源都要有最新值，且任一变化就发一次组合」最合适？',
        options: ['merge', 'zip', 'combineLatest', 'withLatestFrom'],
        answer: 2,
        explain: 'combineLatest 在「每个源至少发过一次」后，任一变化就发出当前所有源的最新值组合。',
        concept: 'c-combine',
      },
      {
        text: '「只在用户点击时，把当前选中的数据值捎上」最合适？',
        options: ['merge', 'withLatestFrom(data$)', 'zip', 'reduce'],
        answer: 1,
        explain: 'withLatestFrom 在触发源发值时，带上另一源「最近一次」的值，正是「点击时取当前状态」语义。',
        concept: 'c-combine',
      },
      {
        text: '用 combineLatest 组合两个源时，「其中一个源还没发过第一个值」会发生什么？',
        options: [
          '已发出的源会先发',
          '整体不会发射任何值，直到所有源都至少发过一次',
          '跳过该源直接发其它值',
          '立即报错',
        ],
        answer: 1,
        explain:
          'combineLatest 要求每个参与源都「有最新值」才发组合，某源尚未发值时整体静默。这是「组合需各源有初始值」的边界，常需配 startWith 补初始态。',
        concept: 'c-combine',
      },
    ],
    [
      ['combineLatest', '所有源都有最新值后，任一变化即发组合'],
      ['withLatestFrom', '触发时带上另一源的最近值'],
    ],
    [
      '用 zip 期待「任一变化都触发」（那是 combineLatest；zip 是按步对齐）。',
      'combineLatest 中某源无初始值，导致组合流一直沉默（应配合 startWith）。',
    ],
  ),
  'practice',
)
