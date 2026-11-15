import { L, withKind } from '../../course-builders.ts'

export const L13 = withKind(
  L(
    'L13',
    3,
    '终结语义：error 与 complete 不可逆',
    2,
    ['L03'],
    ['c-terminal'],
    [
      '说清 error 与 complete 不可逆的三条契约',
      '解释终结后 next 与再次终结被忽略的机制',
      '对照 error 与 complete 之后的清理路径',
      '说清为什么「完成」不等于「成功」',
    ],
    `
### 一次事故：流「成功结束」了，数据却没来

一个批量导入页面在解析完成后显示「导入成功」，但列表里一条新数据都没有。查日志发现，源在发完前两条之后就 \`complete\` 了，而下游的汇总逻辑把 \`complete\` 当成「全部成功」的确认信号，直接跳过了校验。另一处更隐蔽：某条分支 \`error\` 之后，订阅里的 \`next\` 再也没被调用，团队却在 \`error\` 回调之外又补了一段 \`next\`，指望它能继续收尾，结果那段代码永远不执行。两次问题都指向同一件事——**终结是单向门，不是一种可以继续商量的状态**。这节课把 \`error\` / \`complete\` 的不可逆性写成一张状态机，并把「完成 ≠ 成功」这条语义反复钉牢。

### 本课唯一要回答的问题

| 疑问 | 结论 |
|---|---|
| 一条流终结后还能再 \`next\` 吗 | 不能；终结后所有 \`next\` / 再次终结都被静默忽略 |
| \`error\` 与 \`complete\` 能同时发生吗 | 不能，互斥且各至多一次，先到者胜 |
| \`complete\` 表示成功吗 | 不表示，它只表示「不再有值」；成功与否是业务语义 |
| 取消订阅算终结吗 | 算资源意义上的终结，但**不向下游发通知**（L03） |

### 三条不可逆契约

| 契约 | 内容 | 违反后的现象 |
|---|---|---|
| 终结唯一 | \`error\` 与 \`complete\` 至多一次且互斥 | 下游清理跑两遍，或「先完成后报错」让状态机错乱 |
| 终结后静默 | 之后的 \`next\` 不交付、不报错 | 定时器还在跑、界面却不更新，极难定位 |
| 取消不通知 | \`unsubscribe()\` 不发 \`complete\` / \`error\` | 把「用户离开」误当成「任务成功」，写错业务状态 |

第三条是把 L03 的资源账本与业务语义分开的关键：取消表达的是「我不再接收」，不是「这件事做完了」。任何在 \`complete\` 回调里写「标记成功、清缓存、跳转下一步」的代码，都必须先确认这条路径不是由用户取消触发的——而取消恰恰不会触发它，所以真正要担心的是反过来：把「流结束了」直接等同于「业务成功」。

\`\`\`ts title="终结路径的 7.8.2 写法" note="complete 与 error 都只触发一次；finalize 覆盖终结与取消三条路径。"
import { of, from, throwError, EMPTY, NEVER, Observable } from "rxjs"
import { take, finalize, tap, catchError } from "rxjs/operators"

const trace: string[] = []

of(1, 2, 3)
  .pipe(
    tap({ complete: () => trace.push("completed") }),
    finalize(() => trace.push("cleanup")),
  )
  .subscribe({
    next: (v) => trace.push("next-" + v),
    error: () => trace.push("error"),
  })
// trace: next-1, next-2, next-3, completed, cleanup

throwError(() => new Error("down"))
  .pipe(
    catchError(() => of("fallback")),
    finalize(() => trace.push("error-cleanup")),
  )
  .subscribe({ next: (v) => trace.push("recovered-" + v) })
// catchError 返回新源：原流已终结，恢复发生在替代源上

// complete 只表示「不再有值」：EMPTY 也会完成
EMPTY.subscribe({ complete: () => trace.push("empty-completed") })

// NEVER 永不终结，finalize 不会自动触发，必须显式取消
const neverSub = NEVER.pipe(finalize(() => trace.push("never-cleanup"))).subscribe()
neverSub.unsubscribe()

// 终结后继续 next 是一个无效的自定义源，不应出现在业务代码里
const bad$ = new Observable<number>((subscriber) => {
  subscriber.next(1)
  subscriber.complete()
  subscriber.next(2) // 静默忽略
  subscriber.complete() // 静默忽略
})
bad$.pipe(take(5)).subscribe((v) => trace.push("bad-" + v))

void from([1]).subscribe()
\`\`\`

### 用最小模型把「不可逆」变成可断言的事实

下面不依赖 RxJS 包，把订阅状态机写成纯函数：四个状态、三类事件，逐一断言转换结果。重点是「终结之后所有事件都不产生交付」以及「取消不产生通知」。

\`\`\`ts
import assert from "node:assert/strict"

type State = "open" | "completed" | "errored" | "cancelled"
type Event = "next" | "error" | "complete" | "unsubscribe"
type Result = { state: State; delivered: string[] }

function transition(state: State, event: Event, value?: string): Result {
  if (state !== "open") return { state, delivered: [] }
  if (event === "next") return { state, delivered: value ? [value] : [] }
  if (event === "error") return { state: "errored", delivered: ["error"] }
  if (event === "complete") return { state: "completed", delivered: ["complete"] }
  return { state: "cancelled", delivered: [] } // 取消不通知下游
}

assert.deepEqual(transition("open", "next", "a"), { state: "open", delivered: ["a"] })
assert.deepEqual(transition("open", "complete"), { state: "completed", delivered: ["complete"] })
assert.deepEqual(transition("open", "error"), { state: "errored", delivered: ["error"] })
assert.deepEqual(transition("open", "unsubscribe"), { state: "cancelled", delivered: [] })

// 终结之后，任何事件都既不改变状态、也不交付
for (const terminal of ["completed", "errored", "cancelled"] as State[]) {
  for (const ev of ["next", "error", "complete", "unsubscribe"] as Event[]) {
    const r = transition(terminal, ev, "late")
    assert.equal(r.state, terminal, terminal + " 遇到 " + ev + " 不得改变状态")
    assert.deepEqual(r.delivered, [], terminal + " 遇到 " + ev + " 不得交付")
  }
}

// 互斥：先 complete 再 error，仍是 completed
const s1 = transition("open", "complete")
const s2 = transition(s1.state, "error")
assert.equal(s2.state, "completed", "先到者胜，error 不能覆盖 complete")

// 一次完整序列：next, next, complete, next(被忽略)
function run(events: Event[]): { state: State; log: string[] } {
  let state: State = "open"
  const log: string[] = []
  for (const ev of events) {
    const r = transition(state, ev, "v")
    state = r.state
    log.push(...r.delivered)
  }
  return { state, log }
}
const seq = run(["next", "next", "complete", "next"])
assert.equal(seq.state, "completed")
assert.deepEqual(seq.log, ["v", "v", "complete"], "终结后的 next 连日志都不该出现")
\`\`\`

最后这条断言给出了排查「数据少了一截」的方法：不要只看有没有报错，而要看**终结通知出现在序列的第几个位置**。如果 \`complete\` 出现在前两个值之后，后面的值不是「丢了」，而是源根本没打算再发——问题在上游的生产条件，不在下游的渲染。

### 一次完整状态机推演

| 步骤 | 事件 | 转移前状态 | 转移后状态 | 下游收到 |
|---|---|---|---|---|
| 1 | \`next(a)\` | open | open | a |
| 2 | \`next(b)\` | open | open | b |
| 3 | \`complete()\` | open | completed | complete |
| 4 | \`next(c)\` | completed | completed | 无（静默） |
| 5 | \`error(e)\` | completed | completed | 无（静默） |
| 6 | \`unsubscribe()\` | completed | completed | 无（静默） |

把 L03 的取消路径并排看会更清楚：若第 3 步换成 \`unsubscribe()\`，状态直接到 cancelled，下游连 \`complete\` 都收不到。因此「业务上是否成功」绝对不能挂在 \`finalize\` 或 \`complete\` 上：\`finalize\` 三条路径都跑，\`complete\` 两条终结路径里的其中一条才跑，二者都不等价于「校验通过」。正确做法是把业务结果作为一个正常的 \`next\` 值交出来，让下游显式判断。

:::deep

### 为什么终结必须不可逆

如果允许终结之后继续 \`next\`，所有依赖「流结束」的算子都会失去意义：\`toArray\` / \`reduce\` / \`count\` 不知道何时该发射结果（L07），\`concatMap\` 不知道何时该启动下一条内流（L09），\`share\` 不知道何时该断开（L19），\`finalize\` 也不知道该跑几次。换句话说，**终结通知是整条链的时间锚点**，它必须是唯一的、单向的，否则「完成」这个概念无法被任何算子依赖。这也解释了为什么 RxJS 选择「静默忽略」而不是「抛错」：终结后继续 \`next\` 通常来自没检查 \`closed\` 的自定义源（L04），抛错只会把一个上游的编码疏漏变成下游的崩溃；静默忽略则让契约保持稳定，代价是这类 bug 只能靠断言与日志发现。工程上的补偿很直接：自定义源里每个异步回调先判 \`closed\`，同时在测试里写一条「终结后 next 不产生日志」的断言。

:::

:::warn

### 三个终结语义踩坑

| 踩坑 | 现象 | 修正 |
|---|---|---|
| 把 \`complete\` 当成「业务成功」 | 空流或提前完成也显示成功，数据却没落地 | 成功是业务值，用一个正常 \`next\` 传递；\`complete\` 只表示不再有值 |
| 在终结后继续调用源侧的 \`next\` | 界面静默停更，无任何报错 | 自定义源每个回调先判 \`subscriber.closed\`（L04） |
| 把「用户取消」当成「任务完成」写进状态 | 路由切走后任务被标记成功，实际请求半途而废 | 取消不发通知；需要区分时用 \`finalize\` 加显式状态，不要靠 \`complete\` 推断 |

第一条还有个常见变体：\`catchError(() => EMPTY)\` 会让流「正常完成」，于是上游的失败被伪装成一次干净的成功。兜底要返回有语义的替代值（如带 \`degraded\` 标记的结果），而不是一个空流，否则监控与 UI 都看不到降级发生过。

:::

### 验收清单

| 检查 | 判据 |
|---|---|
| 终结唯一 | \`error\` 与 \`complete\` 互斥，先到者胜 |
| 终结后静默 | 三种终结状态下所有事件都不改变状态、不交付值 |
| 取消不通知 | \`unsubscribe\` 的 delivered 为空 |
| 业务语义 | 成功 / 失败由 \`next\` 值表达，不由 \`complete\` 推断 |
| 兜底可观测 | \`catchError\` 不返回裸 \`EMPTY\` 伪装成功 |

### 与相邻课的分工

| 课 | 它交付什么 | 本课明确不讲 |
|---|---|---|
| L02 三元组契约 | next / error / complete 的顺序约束 | 本课把顺序约束升级为状态机与不可逆性 |
| L03 资源账本 | teardown、\`finalize\`、取消幂等 | 本课只说明取消不通知下游，不重复清理实现 |
| L14 恢复与重试 | \`catchError\` / \`retry\` 的恢复策略 | 本课只说「原流已终结」，不设计恢复 |
| L15 错误传播 | 错误沿哪条路径走、catchError 位置 | 本课只定义终结语义，不画传播路径 |
| L16 空流兜底 | \`defaultIfEmpty\` / \`throwIfEmpty\` | 本课只指出 EMPTY 也会 complete |
`,
    'rxTeardown',
    [
      {
        text: '一条流调用 complete() 之后会怎样？',
        options: ['可以再次 next', '对该订阅永久结束，不再接受任何信号', '自动重连', '抛错'],
        answer: 1,
        explain: 'complete 与 error 都是终结且不可逆；之后的 next/error/complete 都会被忽略。',
        concept: 'c-terminal',
      },
      {
        text: '「无论流成功、失败还是被取消都要清理资源」应该放在哪？',
        options: ['next', 'finalize', 'filter', 'take'],
        answer: 1,
        explain: 'finalize 在任何终结方式（完成/错误/取消）时都执行，是资源清理的统一位置。',
        concept: 'c-terminal',
      },
    ],
    [
      ['终结信号', 'error 与 complete，使流不可逆地结束'],
      ['finalize', '任意结束方式都会触发的清理钩子'],
    ],
    [
      '以为 complete 后还能继续 next（不可逆）。',
      '把资源清理写在 complete 回调里，结果流 error 时泄漏（应使用 finalize）。',
    ],
  ),
  'theory',
)
