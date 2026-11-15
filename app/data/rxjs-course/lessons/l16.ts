import { L, withKind } from '../../course-builders.ts'

export const L16 = withKind(
  L(
    'L16',
    3,
    '安全订阅与空流：throwIfEmpty / defaultIfEmpty / 防御式',
    2,
    ['L15'],
    ['c-safe'],
    [
      '实现 throwIfEmpty / defaultIfEmpty 的兜底链并跑通',
      '写出一个防御式订阅封装，统一处理空流与异常',
      '搭好断言覆盖空流、有值流、异常流三条路径',
      '产出一份空流排查清单',
    ],
    `
### 一次事故：「查无结果」被渲染成一次成功

搜索页在后端返回空数组时，界面先闪一下骨架屏、再变成空白，既没有「无结果」提示，也没有错误日志。代码里用了 \`filter(...)\` 加 \`first()\`，空输入时 \`first()\` 直接抛错，但错误回调又只写了 \`console.warn\`，于是用户看到的是一次「静默的失败」。另一个页面更隐蔽：把 \`reduce\` 用在可能为空的流上且没给 seed，结果一个值都不发，下游把「什么都没发生」当成「已经处理完毕」，报表少了一行也没人发现。两处问题都源于同一个空白：**「没有值」这条路径从来没有被显式定义过**。这节课把空流当成一等输入，给出兜底、报错、占位三种可验收的处理方式。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 空流会 \`error\` 吗 | 不会；它正常 \`complete\`，只是零个 \`next\`（L13） |
| 想给一个默认值用什么 | \`defaultIfEmpty(v)\`：发射一个占位值后完成 |
| 想让「没有值」成为失败用什么 | \`throwIfEmpty(() => new Error(...))\`：以 error 终结 |
| 想让首帧立刻有状态用什么 | \`startWith(v)\`：在源的第一个值之前同步插入 |
| 三者的边界 | 兜底改变值、报错改变终结方式、占位不改变源本身 |

### 空流语义对照表

| 写法 | 有值流 | 空流 | 下游能否区分「原本为空」 | 典型用途 |
|---|---|---|---|---|
| 不处理 | 原样交付 | 静默完成 | 否 | 明确允许零结果，且下游不依赖值 |
| \`defaultIfEmpty(v)\` | 原样交付 | 发射 v 后完成 | 需靠 v 的哨兵值 | 列表「暂无数据」、缓存默认值 |
| \`throwIfEmpty(fn)\` | 原样交付 | 以 error 终结 | 是（走 error 路径） | 必须有值的配置 / 必需记录 |
| \`startWith(v)\` | 先 v 再原值 | 只发射 v | 否（占位与真实值混在一起） | loading、初始状态 |
| \`reduce(fn)\` 无 seed | 发射汇总 | 不发射、直接完成 | 否 | 一般应避免，改给 seed（L07） |

表里第四列「能否区分」是选型的关键：\`startWith\` 插入的值会像真实值一样走完下游所有算子，如果下游把它写进统计，就会凭空多一条记录；\`defaultIfEmpty\` 至少可以用哨兵类型标记；\`throwIfEmpty\` 则把空变成一条独立的错误路径，最容易被监控捕获。**先决定「空是正常结果还是失败」，再选算子**，反过来做一定会在某个页面出现语义错位。

\`\`\`ts title="三种空流处理与防御式订阅" note="throwIfEmpty 在 7.8.2 接收一个 error 工厂函数，不是字符串。"
import { of, from, EMPTY, throwError, Observable } from "rxjs"
import {
  filter,
  first,
  map,
  defaultIfEmpty,
  throwIfEmpty,
  startWith,
  catchError,
  finalize,
  toArray,
} from "rxjs/operators"

type Row = { id: string; label: string; placeholder?: boolean }
type Outcome = { kind: "values" | "empty" | "error"; rows: Row[]; message?: string }

const query = (rows: Row[]) => of(...rows)

// ① 空是正常结果：给带哨兵的占位行
const withDefault$ = query([]).pipe(
  defaultIfEmpty({ id: "none", label: "暂无数据", placeholder: true }),
)
withDefault$.subscribe((r) => console.log(r.label, r.placeholder === true))

// ② 空是失败：显式以 error 终结
const required$ = query([]).pipe(
  throwIfEmpty(() => new Error("必需配置缺失")),
)
required$.subscribe({
  next: (r) => console.log(r.id),
  error: (e) => console.warn("required failed", e.message),
})

// ③ 首帧占位：先给 loading，再给真实值
const withLoading$ = query([{ id: "1", label: "A" }]).pipe(
  startWith({ id: "loading", label: "加载中", placeholder: true }),
  finalize(() => console.log("done")),
)
withLoading$.subscribe((r) => console.log(r.label))

// ④ 防御式订阅：把三条路径收敛成一个结果类型，不再靠回调猜
function safeCollect(source: Observable<Row>, mode: "default" | "throw" | "raw"): Observable<Outcome> {
  const prepared =
    mode === "default"
      ? source.pipe(defaultIfEmpty({ id: "none", label: "暂无数据", placeholder: true }))
      : mode === "throw"
        ? source.pipe(throwIfEmpty(() => new Error("no rows")))
        : source
  return prepared.pipe(
    toArray(),
    map((rows): Outcome => ({ kind: "values", rows })),
    catchError((e) => of<Outcome>({ kind: "error", rows: [], message: String(e) })),
  )
}

safeCollect(query([{ id: "1", label: "A" }]), "default").subscribe(console.log)
void from([]).pipe(filter(() => true), first()).subscribe({ error: () => {} })
void EMPTY.pipe(finalize(() => {})).subscribe()
\`\`\`

### 用最小模型把「三条路径」变成可断言的事实

下面不依赖 RxJS 包，把订阅结果收敛成一个 \`Outcome\` 判别联合，断言：有值流原样交付、空流按模式给出占位或报错、异常流走 error、兜底只发射一次、占位排在最前且不被计入真实值。

\`\`\`ts
import assert from "node:assert/strict"

type Row = { id: string; placeholder?: boolean }
type Outcome =
  | { kind: "values"; rows: Row[] }
  | { kind: "empty"; rows: Row[] }
  | { kind: "error"; rows: Row[]; message: string }

type Source = { kind: "values" | "empty" | "error"; rows: Row[]; message?: string }
type Mode = "raw" | "default" | "throw" | "startWith"

const FALLBACK: Row = { id: "none", placeholder: true }
const LOADING: Row = { id: "loading", placeholder: true }

function safeCollect(src: Source, mode: Mode): Outcome {
  if (src.kind === "error") {
    return { kind: "error", rows: [], message: src.message ?? "unknown" }
  }
  if (src.rows.length === 0) {
    if (mode === "throw") return { kind: "error", rows: [], message: "no rows" }
    if (mode === "default") return { kind: "values", rows: [FALLBACK] }
    return { kind: "empty", rows: [] }
  }
  const rows = mode === "startWith" ? [LOADING, ...src.rows] : [...src.rows]
  return { kind: "values", rows }
}

const real: Row[] = [{ id: "1" }, { id: "2" }]

// 有值流
const values = safeCollect({ kind: "values", rows: real }, "raw")
assert.deepEqual(values, { kind: "values", rows: real })
assert.equal(values.rows.length, 2)

// 空流：三种模式给出三种不同语义
assert.deepEqual(safeCollect({ kind: "empty", rows: [] }, "raw"), { kind: "empty", rows: [] })
const def = safeCollect({ kind: "empty", rows: [] }, "default")
assert.equal(def.kind, "values")
assert.equal(def.rows.length, 1, "兜底值只能发射一次")
assert.equal(def.rows[0].placeholder, true, "兜底必须可识别")
const thrown = safeCollect({ kind: "empty", rows: [] }, "throw")
assert.equal(thrown.kind, "error")
assert.equal(thrown.message, "no rows")

// 异常流：任何模式都走 error，且不带出半截数据
const failed = safeCollect({ kind: "error", rows: real, message: "down" }, "default")
assert.equal(failed.kind, "error")
assert.equal(failed.rows.length, 0, "错误路径不得交付部分值")

// startWith 占位：在最前，但真实值数量不变
const withPlaceholder = safeCollect({ kind: "values", rows: real }, "startWith")
assert.equal(withPlaceholder.rows[0].id, "loading")
assert.equal(withPlaceholder.rows.length, 3)
assert.equal(withPlaceholder.rows.filter((r) => !r.placeholder).length, 2, "真实值仍为 2 条")
\`\`\`

最后三条断言把「占位不能污染业务口径」写死了：\`startWith\` 让总行数变成 3，但过滤掉 \`placeholder\` 之后仍是 2 条真实数据。若下游直接把 \`rows.length\` 当成功条数上报，就会多算一条；因此凡是引入哨兵，必须同时约定「统计前先过滤」。

### 一次完整订阅的推演

以「查询返回 0 / 1 / N 条」与「接口异常」四种输入为例：

| 输入 | raw 模式 | default 模式 | throw 模式 | 下游应做的处理 |
|---|---|---|---|---|
| 0 条 | 静默 complete | 发射 1 条哨兵 | error 终结 | 显示「暂无数据」或按失败告警 |
| 1 条 | 原样交付 | 原样交付 | 原样交付 | 正常渲染 |
| N 条 | 原样交付 | 原样交付 | 原样交付 | 正常渲染 |
| 异常 | error 终结 | error 终结 | error 终结 | 走 L14 的恢复 / 降级路径 |

第二列是开头那次事故的根源：raw 模式下「0 条」与「处理完毕」在下游看不出区别，因为两条路径都只是 \`complete\`。把这张表写进评审材料，就能逼团队对每个查询明确回答「0 条算成功还是失败」，而不是等 UI 闪空之后再去猜。

### 防御式订阅评审清单

| 评审项 | 要问的问题 | 不通过时的后果 |
|---|---|---|
| 空语义 | 0 条是正常结果还是失败 | 静默完成被当成「已处理」，报表缺行 |
| 结束符敏感性 | 链上是否有 \`first()\` / 无 seed 的 \`reduce\` | 空流报错或不发射，行为随算子变化 |
| 兜底可识别 | 占位值是否带哨兵标记 | 占位混进真实数据，统计口径失真 |
| 错误收敛 | 是否把三条路径收敛成一个结果类型 | 业务状态散落在 next / error / complete 三个回调里 |
| 清理覆盖 | 是否用 \`finalize\` 统一收尾 | 取消路径漏掉清理（L03） |

第四行是「防御式订阅」的真正价值：把 \`next\` / \`error\` / \`complete\` 三个回调里散落的状态判断，收敛成一个带 \`kind\` 的结果值。这样 UI 只需要对一个判别联合做分支，不会因为「忘了写 error 回调」而把失败吞掉，也不会把空结果与成功结果混为一谈。

:::deep

### \`defaultIfEmpty\` 与 \`startWith\` 不是一回事

两者都能让「本来什么都没有」的流发出一个值，但时机与语义完全不同。\`startWith\` 在订阅时**立即同步**发射占位值，之后源的原值照常到来，因此它不关心源是不是空；\`defaultIfEmpty\` 要等源 \`complete\` 且确认一个值都没发过，才补发兜底值，因此它对有值流完全无副作用。这个差别决定了两个常见错误：用 \`startWith\` 做空态提示，结果「加载中」和真实数据短暂共存甚至被写进列表；用 \`defaultIfEmpty\` 做 loading，结果占位值要等流结束才出现，界面先空白后闪烁。判断口诀是：**「一开始就该有」用 startWith，「到最后都没有才补」用 defaultIfEmpty**。再往外一步，\`throwIfEmpty\` 同样要等 \`complete\`，因此它只适用于「流一定会结束」的场景；对永不终结的热流，等不到 complete 就永远不会有空态判定，那类场景应该在业务层用超时（L12、L25）来定义「多久没数据算失败」。

:::

:::warn

### 三个空流踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 在可能为空的流上用 \`first()\` | 以 error 终结，错误回调若空实现就变成静默失败 | 先 \`defaultIfEmpty\` 再 \`first\`，或改用 \`toArray\` + 判别联合 |
| \`throwIfEmpty("没有数据")\` 传字符串 | 7.8.2 需要 error 工厂函数，旧写法来自 6.x 资料 | 写 \`throwIfEmpty(() => new Error(...))\` |
| \`catchError(() => EMPTY)\` 收尾 | 失败被伪装成一次干净的成功（L14） | 返回带降级标记的替代值，让监控看得到 |

第一条在真实代码里特别常见，因为 \`first()\` 看起来只是「取第一条」。它的隐含契约是「必须至少有一条」，空输入会以 \`EmptyError\` 终结。凡是数据来源可能为空（筛选条件、可选配置、缓存未命中），都应该先问一句「这里允许零条吗」，再把答案写进算子链，而不是交给 \`first()\` 的默认行为。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 三条路径 | 有值、空、异常分别得到不同且可判别的结果 |
| 兜底唯一 | \`defaultIfEmpty\` 只发射一次，且带哨兵标记 |
| 占位隔离 | \`startWith\` 排在最前，过滤哨兵后真实值数量不变 |
| 错误收敛 | 异常路径不交付部分值，\`kind\` 为 error |
| 版本口径 | \`throwIfEmpty\` 使用 error 工厂函数，不用旧字符串签名 |
| 完整清理 | 三条路径都触发 \`finalize\`（L03） |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L06 过滤与取舍 | \`first()\` / \`take()\` 与空输入的隐含行为 | 本课把这些「隐含行为」变成显式的空语义 |
| L07 归约与收集 | \`reduce\` 无 seed 时空流不发射 | 本课引用该结论，不重推归约 |
| L13 终结语义 | complete 只表示「不再有值」 | 本课基于它区分「空结果」与「失败」 |
| L14 恢复与重试 | \`catchError\` / \`retry\` 的恢复策略 | 本课只用 \`catchError\` 收敛结果类型，不设计重试 |
| L19 共享 | \`shareReplay\` 的初始状态与重放 | 本课只讲单条订阅链的空态 |
`,
    'rxTeardown',
    [
      {
        text: 'from([]) 一个值都没发就 complete，想要「空时给个默认值」用？',
        options: ['throwIfEmpty', 'defaultIfEmpty(v)', 'startWith', 'take(0)'],
        answer: 1,
        explain: 'defaultIfEmpty 在流未发出任何值就 complete 时，改发一次你给的默认值。',
        concept: 'c-safe',
      },
      {
        text: '给 UI 一个「加载中」的初始态，避免首帧渲染 undefined，最合适？',
        options: ['startWith(loading)', 'buffer', 'skip', 'exhaustMap'],
        answer: 0,
        explain: 'startWith 在真实值到来前先发一次初始态，是处理首屏「加载中/默认值」的惯用法。',
        concept: 'c-safe',
      },
    ],
    [
      ['throwIfEmpty', '空流转成 error'],
      ['defaultIfEmpty', '空流改发一次默认值'],
    ],
    [
      '空流被渲染成 undefined 白屏（缺 startWith / defaultIfEmpty 兜底）。',
      '把「空结果」误当「错误」，导致用户看到红屏。',
    ],
  ),
  'practice',
)
