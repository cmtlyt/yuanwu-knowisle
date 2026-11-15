import { L, withKind } from '../../course-builders.ts'

export const L15 = withKind(
  L(
    'L15',
    3,
    '错误传播：错误只在一条路径上走',
    3,
    ['L14'],
    ['c-error-prop'],
    [
      '说清错误只沿一条路径向上、不广播的机制',
      '解释 catchError 放置位置如何决定可恢复范围',
      '对照多订阅者场景下错误是否共享',
      '说清为什么把 catchError 放在源外侧并不等于万事大吉',
    ],
    `
### 一次事故：一路失败，整块看板全黑

首页看板把「订单」「库存」「物流」三路数据 \`merge\` 成一条流再渲染。某天库存接口 500，结果不只是库存卡片空白，订单和物流卡片也一起消失，连已经渲染出来的数据都被清空。团队在最外层加了 \`catchError(() => of(fallback))\`，试图给整块看板兜底，但兜底值是一个全局占位，三路信息的区分已经丢了。复盘时的关键发现是：**错误不是沿三路分别通知的，合并之后它变成整条结果流的一次终结**（L13）；想让「某路失败不拖垮整体」，必须在那一路内部、合并之前接住。这节课把错误传播画成一条明确的路径，并说明 \`catchError\` 放在哪里就决定了多大范围能被恢复。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 错误会传给谁 | 沿当前算子链**向下游一个方向**传递，直到被 \`catchError\` 接住或到达订阅者 |
| 错误会广播给其他订阅者吗 | 不会；每个订阅者各有独立的一条订阅链，错误是这条链自己的事 |
| 多源合并时呢 | 任一支路 error 会让合并后的结果流整体 error，其他支路被取消 |
| \`catchError\` 放哪里最有效 | 放在**需要隔离的最小分支内**；放最外层只能保住整条链，保不住各分支语义 |

### 错误传播路径对照表

| 场景 | 错误路径 | 其他分支 / 订阅者 | 结论 |
|---|---|---|---|
| 单链 \`map → filter → subscribe\` | 逐级向下到订阅者 | 无 | 任一环抛错，整链终结 |
| 链中间有 \`catchError\` | 到 catch 处截断，改走替代源 | catch 之后的算子收到的是替代源的值 | 恢复范围 = catch 之下那一段 |
| 同一冷源被订阅两次 | 两条独立链，各走各的 | 另一订阅者不受影响 | 错误不共享（L02） |
| \`merge(a$, b$)\` 的一支 error | 进入合并结果流 | 其他支被取消 | 一处失败拖垮整体 |
| 共享流 \`share()\` 之后 error | 进入共享结果流 | 所有当前订阅者一起终结，且不可恢复 | 共享把错误也共享了（L20） |

最后两行是同一枚硬币的两面：**合并与共享都会把多条订阅路径收敛成一条**，因此错误的爆炸半径也随之放大。设计时的判断很简单——如果业务要求「A 失败不影响 B」，就必须在收敛之前把 A 的失败消化掉，而不是在收敛之后试图区分「是谁错了」。

\`\`\`ts title="在最小分支内接住错误" note="catchError 返回的是替代源；原流已经终结，恢复不会让原流继续。"
import { of, from, merge, defer, throwError } from "rxjs"
import { map, catchError, mergeMap, tap } from "rxjs/operators"

type Panel = { name: string; ok: boolean; rows: number }
const fail = (name: string) => throwError(() => new Error(name + " down"))
const load = (name: string, rows: number) => of<Panel>({ name, ok: true, rows })

// 错误写法：一路失败让整条合并流终结
const fragile$ = merge(load("order", 3), fail("stock"), load("shipping", 2))
fragile$.subscribe({ error: (e) => console.warn("全部失败", e.message) })

// 正确写法：每路内部兜底，保留各自的语义
const orders$ = load("order", 3).pipe(
  catchError(() => of<Panel>({ name: "order", ok: false, rows: 0 })),
)
const stock$ = defer(() => from(Promise.reject(new Error("stock down")))).pipe(
  catchError(() => of<Panel>({ name: "stock", ok: false, rows: 0 })),
)
const shipping$ = load("shipping", 2)
merge(orders$, stock$, shipping$).subscribe((p) => console.log(p.name, p.ok, p.rows))

// 扁平化里也一样：内层兜底才能保住外层继续处理后续 id
const ids$ = of(1, 2, 3).pipe(
  mergeMap((id) =>
    (id === 2 ? fail("id-2") : load("row-" + id, 1)).pipe(
      catchError(() => of<Panel>({ name: "row-" + id, ok: false, rows: 0 })),
    ),
  ),
)
ids$.pipe(tap((p) => console.log("row", p.name))).subscribe(console.log)
\`\`\`

### 用最小模型把「只沿一条路径」变成可断言的事实

下面不依赖 RxJS 包：把算子链表示为处理器数组，错误从链首向下传递，遇到第一个 \`catches\` 的处理器就截断；再模拟两个独立订阅者，断言错误不共享。

\`\`\`ts
import assert from "node:assert/strict"

type Handler = { name: string; catches: boolean }
type Outcome = { visited: string[]; recoveredBy: string | null; reachedSubscriber: boolean }

function propagate(chain: Handler[]): Outcome {
  const visited: string[] = []
  for (const h of chain) {
    visited.push(h.name)
    if (h.catches) return { visited, recoveredBy: h.name, reachedSubscriber: false }
  }
  return { visited, recoveredBy: null, reachedSubscriber: true }
}

const plain: Handler[] = [
  { name: "map", catches: false },
  { name: "filter", catches: false },
  { name: "tap", catches: false },
]
const noCatch = propagate(plain)
assert.equal(noCatch.reachedSubscriber, true, "没人接住就到订阅者")
assert.deepEqual(noCatch.visited, ["map", "filter", "tap"])

// catch 在中间：后面的算子根本看不到错误
const midCatch = propagate([
  plain[0],
  { name: "catchError", catches: true },
  plain[2],
])
assert.equal(midCatch.recoveredBy, "catchError")
assert.deepEqual(midCatch.visited, ["map", "catchError"], "恢复范围只有 catch 以上的一段")
assert.equal(midCatch.reachedSubscriber, false)

// catch 在最外层：整条链都被错误走过，只能整体兜底
const outerCatch = propagate([...plain, { name: "catchError", catches: true }])
assert.deepEqual(outerCatch.visited, ["map", "filter", "tap", "catchError"])

// 两个订阅者各有独立链路，错误不广播
function subscribe(chain: Handler[]): Outcome { return propagate(chain) }
const subA = subscribe([{ name: "catchError", catches: true }, ...plain])
const subB = subscribe(plain)
assert.equal(subA.reachedSubscriber, false, "A 被自己的 catch 接住")
assert.equal(subB.reachedSubscriber, true, "B 仍独立地收到自己的错误")
assert.notDeepEqual(subA.visited, subB.visited)

// 合并：任一支 error 让结果流整体终结
function mergeOutcome(branches: Outcome[]): "ok" | "error" {
  return branches.some((b) => b.reachedSubscriber) ? "error" : "ok"
}
assert.equal(mergeOutcome([subA, subB]), "error", "一支未兜底，合并结果流整体 error")
assert.equal(mergeOutcome([subA, subA]), "ok", "每支都兜底，合并流存活")
\`\`\`

最后两条断言把「在最小分支内兜底」量化了：同样的两个分支，只要有一支的 \`reachedSubscriber\` 为 true，合并结果就是 \`error\`；全部在支内消化，结果才是 \`ok\`。这也解释了为什么把 \`catchError\` 放在 \`merge\` 之后虽然能让链不断，却拿不回「库存失败但订单正常」的信息——错误走到那里时，其他支已经被取消了。

### 一次错误传播的完整推演

以「订单正常 / 库存 500 / 物流正常」三路合并为例：

| 步骤 | 位置 | 事件 | 结果流状态 | 其他支路 |
|---|---|---|---|---|
| 1 | 订单支 | 发出一个值 | open | 正常 |
| 2 | 库存支 | \`error\` | 即将终结 | 订单、物流仍活跃 |
| 3 | 合并节点 | 收到某支 error | **errored** | 所有支被取消 |
| 4 | 下游 tap / map | 不再收到 \`next\` | errored | 已交付的订单值仍在界面上，但不会刷新 |
| 5 | 订阅者 error 回调 | 收到一次通知 | errored | 若清空 UI，就会把订单值一起抹掉 |

第 5 步就是「整块看板全黑」的直接原因：错误本身只让流终结，真正清空数据的往往是我们自己在 \`error\` 回调里写的「重置状态」。因此修复要分两层：**结构上**在支内 \`catchError\` 保住合并流，**交互上**不要把全局清空绑到一次错误通知上。两层缺一，都会出现「一路失败，全场陪葬」。

:::deep

### 错误不是值，也不是广播

\`next\` 是值：可以有很多个、可以被 \`map\` 变换、可以被 \`filter\` 丢弃、可以被多个订阅者各自收到一份。\`error\` 是**控制流事件**：至多一次、不能被变换、不能被过滤、一旦发生就终结这条链（L13）。这条差别决定了所有设计：\`catchError\` 不是在「过滤错误」，而是在链被截断的位置**换一条新源继续**；\`retry\` 不是「忽略错误」，而是重新订阅一次原源（L14）。同样，错误也不会广播：两个订阅者各有自己的订阅链，某条链上的 \`catchError\` 只影响自己。但一旦引入 \`merge\` / \`share\` 这类把多条路径收敛成一个结果流的算子，多个上游就共享了同一个终结状态，错误的爆炸半径随之变成全局。理解「错误属于链、不属于源」之后，\`share()\` 之后一次 error 让所有订阅者永久结束（L20）就不再是意外，而是收敛结构的必然结果。

:::

:::warn

### 三个错误传播踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 在 \`merge\` 之后才 \`catchError\` | 链不断但各支语义丢失，只能给一个全局占位 | 在每一支内部兜底，保留 \`name\` / \`ok\` 等信息 |
| 以为一个订阅者的 catch 会保护其他人 | 另一订阅者照样收到 error | 兜底写在源或共享层，让所有订阅者共享同一条已恢复的链 |
| 在 \`error\` 回调里清空全部 UI 状态 | 一路失败把其他路的已渲染数据一起抹掉 | 错误只更新失败那一块；清空动作需要显式业务判断 |

第二条在共享流里最容易踩：\`share()\` 之后多个组件订阅同一个结果流，其中一个组件在自己的 \`pipe\` 里加了 \`catchError\`，只保护了自己，别的组件依旧一起终结，而且共享流一旦 error 就永久结束，后续新订阅者也会立刻收到终结。要让「所有人都不受影响」，兜底必须放在 \`share\` 之前。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 单向传播 | 错误沿链向下，遇到第一个 catch 截断 |
| 恢复范围 | catch 位置越靠上，被截断的算子越少 |
| 不广播 | 两个订阅者各自独立，一个被 catch 不影响另一个 |
| 合并爆炸半径 | 任一支未兜底，合并结果流整体 error |
| 交互隔离 | \`error\` 回调不清空其他分支已渲染的数据 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L13 终结语义 | error / complete 不可逆与状态机 | 本课只讲错误沿哪条路径走 |
| L14 恢复与重试 | \`catchError\` / \`retry\` 的策略与退避 | 本课只把 catch 当作「截断位置」，不设计重试次数 |
| L09 / L12 扁平化 | 内层订阅的管理与并发上限 | 本课只指出「内层兜底才能保住外层」 |
| L19 / L20 共享 | \`share\` / \`refCount\` 与一次 error 永久结束 | 本课提前说明收敛结构放大错误，不展开配置 |
| L16 空流兜底 | \`defaultIfEmpty\` / \`throwIfEmpty\` | 本课不处理「没有错误也没有值」的情形 |
`,
    'rxTeardown',
    [
      {
        text: '两条流 merge 后，其中一条 error 会发生什么？',
        options: ['只有那条停', '整个合并流 error，全部订阅者收到', '自动忽略该路', '变成 complete'],
        answer: 1,
        explain: '合并流把任一路的 error 视为整体 error；想让某路失败不传播，要在该路单独 catchError。',
        concept: 'c-error-prop',
      },
      {
        text: '「某路失败不应拖垮整体合并流」应怎么做？',
        options: ['什么都不做', '在该路加 catchError 兜底', '用 mergeMap', '用 take'],
        answer: 1,
        explain: '在出错的那一路单独 catchError（恢复成正常流或吞掉），错误才不会传播到合并层。',
        concept: 'c-error-prop',
      },
      {
        text: '要杜绝「错误在某处被静默吞掉」，最稳妥的做法是？',
        options: [
          '订阅不写 error 回调，交给 GC',
          'catch 后 console.log 了事',
          '在管道末端统一 catchError 上报',
          '对每路都加 retry(99)',
        ],
        answer: 2,
        explain:
          '末端统一捕获 + 显式上报（或全局错误边界）才能保证错误不消失；零散 log 与无限重试都是静默失败/重试风暴。',
        concept: 'c-error-prop',
      },
    ],
    [
      ['错误传播', 'error 作为值沿管道向下游订阅者传播'],
      ['静默失败', '错误被吞掉、无人上报'],
    ],
    [
      '在多源合并里不处理某一路的 error，导致整体流意外终止。',
      'catch 后仅打印日志不上报，生产环境「静默失败」。',
    ],
  ),
  'theory',
)
