import { L, withKind } from '../../course-builders.ts'

export const L04 = withKind(
  L(
    'L04',
    1,
    '构造子全景：把现实世界装进 Effect',
    2,
    ['L03'],
    ['constructors', 'typed-error'],
    [
      '写出 succeed / fail / sync / tryPromise 等构造子的最小可跑示例',
      '实现把任意异常收敛为有名字领域错误的包装',
      '跑通一组构造子对照断言，验证失败通道不被吞掉',
      '识别构造子里最常见的「提前执行」误用',
    ],
    `
### 一个「包了一层」却把异常全吞掉的构造函数

网关迁移时有人给所有外部调用加了个统一包装：捕获异常、打日志、返回一个默认值。上线后调用方再也没见过失败，因为默认值长得和成功结果一样，监控里错误率归零，实际订单却少了一大批。问题不在包装本身，而在**把任意异常转换成一个「看起来成功」的值**：类型上它成功，语义上它失败。构造子这一层决定的正是「现实世界的哪一种情况，该被写进 E 通道的哪一类错误」，写错了，后面所有恢复策略都无从谈起。

### 本课唯一要回答的问题

| 要回答的 | 明确不讲的 |
|---|---|
| 同步、异步、可能抛错、需要回调注册这几类现实情况，各自该用哪个构造子 | 组合算子怎么串（L03、L05）、类型如何沿链累积（L06） |
| 怎样把任意异常收敛成有名字的领域错误，而不是吞成默认值 | 恢复策略与重试边界（L10）、Cause 的缺陷分类（L08、L09） |
| 如何用一组断言证明构造子没有提前执行、也没有丢失失败通道 | 运行边界与 Exit 折叠（L07） |

### 六类现实情况，六个入口

构造子不是语法糖清单，而是「现实世界进入描述层」的六个入口。选错的代价通常不会立刻报错，而是在几周后以「失败没被观察到」的形式出现。

| 现实情况 | 应选构造子 | 最容易犯的错 |
|---|---|---|
| 已经拿到的纯值 | succeed | 为了「统一」把它包进异步构造子，凭空多出一个执行阶段 |
| 已知的预期失败 | fail | 用 throw 代替，失败没进 E 通道 |
| 同步、不会抛错的计算 | sync | 把会抛错的代码塞进去，异常逃逸成缺陷 |
| 同步、可能抛错的计算 | try（catch 映射） | catch 里返回默认值，把失败伪装成成功 |
| 返回 Promise 的调用 | tryPromise | 直接写 async 函数，副作用在构造时就发生 |
| 需要登记与释放的资源 | acquireRelease（配 scoped） | 忘记在中断时清理注册，回调仍被触发 |

表里最危险的一行是「同步、可能抛错」：开头的事故就属于这一类。正确做法是让 catch 把未知异常**映射成一个有名字的错误类型**，而不是映射成一个成功值。有名字这一点很关键——L02 讲过 E 是集合，恢复谓词靠名字挑分支；名字丢了，集合还在，判断依据没了。

### 真实构造子对照

\`\`\` title="六类入口的 effect@4.1.4 写法" note="重点是每个 catch 都产出具名错误，绝不返回默认值；异步入口在构造阶段不发起调用。"
import { Effect } from "effect"

class DecodeError extends Error {}
class HttpError extends Error {
  constructor(readonly status: number) {
    super("http status " + status)
  }
}

const fromValue = Effect.succeed({ id: 1 })
const fromFailure = Effect.fail(new DecodeError("bad payload"))
const fromSync = Effect.sync(() => 1 + 1)
const fromThrowing = Effect.try({
  try: () => JSON.parse("not json"),
  catch: () => new DecodeError("invalid json"),
})
const fromPromise = (id: number) =>
  Effect.tryPromise({
    try: () => fetch("/api/todos/" + id),
    catch: () => new HttpError(503),
  })
const withTimer = Effect.acquireRelease(
  Effect.sync(() => setInterval(() => {}, 1_000)),
  (handle) => Effect.sync(() => clearInterval(handle)),
)
\`\`\`

最后一段把「获取」与「释放」写成一对：acquireRelease 保证无论正常结束还是被中断，释放动作都会执行。这行代码在 happy path 上永远看不出区别，只有父级提前结束时才会暴露，因此很容易在评审里被当成可省略的样板删掉。S3 会讲 Scope 如何统一登记这类动作，但前提始终是：**构造子必须把清理意图写进值里，运行时才有的可调度**。

### 把「不吞失败」变成断言

下面用不依赖库的最小模型把六个入口重写一遍，重点验证两件事：构造阶段不执行、失败通道保持具名。这段可以直接跑，也可以当成 CI 里的回归护栏。

\`\`\` title="构造子语义的最小模型" note="自包含程序，只依赖 node:assert；Result 只有 success 与 failure 两种形状，没有默认值分支。"
import assert from "node:assert/strict"

type Result<A, E> = { ok: true; value: A } | { ok: false; error: E }
type Thunk<A, E> = () => Result<A, E>

class DecodeError extends Error {}
class HttpError extends Error {}

const succeed = <A, E>(value: A): Thunk<A, E> => () => ({ ok: true as const, value })
const fail = <A, E>(error: E): Thunk<A, E> => () => ({ ok: false as const, error })
const sync = <A, E>(f: () => A): Thunk<A, E> => () => ({ ok: true as const, value: f() })
const tryOf = <A, E>(f: () => A, onThrow: (e: unknown) => E): Thunk<A, E> => () => {
  try {
    return { ok: true as const, value: f() }
  } catch (e) {
    return { ok: false as const, error: onThrow(e) }
  }
}
const fromPromise = <A, E>(f: () => Promise<A>, onReject: (e: unknown) => E) => (): Promise<Result<A, E>> =>
  f().then(
    (value) => ({ ok: true as const, value }),
    (e) => ({ ok: false as const, error: onReject(e) }),
  )

let calls = 0
const pending = fromPromise(() => {
  calls += 1
  return Promise.resolve(7)
}, () => new HttpError("down"))
assert.equal(calls, 0, "构造异步入口不得发起调用")
assert.deepEqual(await pending(), { ok: true, value: 7 })
assert.equal(calls, 1)

const bad = tryOf<unknown, DecodeError>(() => JSON.parse("not json"), () => new DecodeError("bad json"))
const outcome = bad()
assert.equal(outcome.ok, false, "解析失败不能变成默认值")
assert.ok(outcome.ok === false && outcome.error instanceof DecodeError, "错误必须具名")
assert.notEqual(succeed(1)(), fail(new DecodeError())(), "成功与失败形状必须可区分")
console.log("t1 通过：六个入口不提前执行、不吞失败、失败具名")
\`\`\`

第二条与第三条断言对应开头的事故：如果 catch 里返回的是默认值，\`outcome.ok\` 会是 true，恢复策略再也看不到这次失败；如果错误被擦成字符串，\`instanceof\` 这条就过不了，L02 里的分支判断同样失效。**构造子是整条链的第一道闸门，这里松了，后面全补不回来。**

:::deep

### 为什么构造子要分这么细

一个自然的疑问是：既然最后都要变成 Effect，为什么不能只留一个「包一层」的通用函数？因为运行时需要知道三件不同的事，而这三件事无法从「一个 thunk」里推断：**这段计算是同步还是异步**（决定能否用 runSync）、**失败是否属于预期**（决定进 E 还是进 Cause 的 Die）、**被中断时有没有清理动作**（决定父级结束时能否安全回收）。把这三点混在一个通用入口里，运行时只能按最坏情况处理：所有东西都当异步、所有异常都当缺陷、所有回调都不清理。构造子分得细，本质上是把这三份元信息显式写进值里，让运行时不必猜。反过来说，看到一段代码把所有外部调用都塞进同一个包装函数，就该警觉：它不是在简化，而是在丢弃元信息。

:::

:::warn

### 三个静默失效的构造子误用

第一个是 catch 里返回默认值，本课的开头事故；症状是监控错误率下降而业务指标变差，两者方向相反，最容易误判成「优化生效」。第二个是用 \`Effect.sync\` 包住会抛错的代码，异常不会进 E 通道，而是变成缺陷（Die），\`Effect.catch\` 对它无效——这类失败在测试里常被 \`try/catch\` 兜住，生产里却直接冒泡。第三个是异步入口写成普通 async 函数：函数一调用，Promise 立刻启动，后面再怎么叠加超时与重试都只是在读同一个已启动的结果。三者的共同点是**没有任何编译错误**，所以不要指望类型检查兜底；把 t1 的「构造阶段调用计数为 0」与「失败必须具名」两条断言放进回归集，比人工评审可靠得多。

:::

### 验收清单

| 断言 | 失败时说明什么 |
|---|---|
| 构造异步入口时调用计数为 0 | 副作用提前发生，重试与超时失效 |
| 抛错时结果是具名失败而非默认值 | 失败被吞，恢复策略无从下手 |
| 成功与失败两种形状可区分 | 调用方靠猜，容易把失败当成功消费 |
| 回调入口返回清理动作 | 中断后回调仍触发，资源泄漏 |
| 同步入口可用同步运行器执行 | 元信息丢失，运行时只能按最坏情况处理 |

### 与相邻课的分工

| 课 | 接走的问题 | 本课留下的接口 |
|---|---|---|
| L05 组合与变换 | 造出来的值怎么串成流水线 | 六类入口产出形状一致的 Effect 值 |
| L06 类型累积 | E 与 R 在链上怎么长出来、怎么收敛 | catch 产出的具名错误进入 E 联合 |
| L10 恢复与重试 | 具名错误如何被挑出来做分支恢复 | 「失败具名」是恢复谓词的前提 |

### 排障时怎么从现象倒推到构造子

| 现象 | 优先检查的入口 | 常见根因 |
|---|---|---|
| 监控错误率下降但业务指标变差 | try / tryPromise 的 catch | catch 返回默认值，失败被伪装成成功 |
| Effect.catch 写了却没接住 | sync 包住的抛错代码 | 异常走缺陷通道，不在 E 里 |
| 超时配置不起作用 | 普通 async 函数入口 | 副作用在构造时启动，运行边界被提前 |
| 重试把同一条失败读了几遍 | 返回 Promise 而非蓝图的包装 | 拿到的是一次性执行结果 |
| 缩容后回调仍被触发 | acquireRelease 的释放动作 | 缺释放登记，中断时没注销 |
| 同步运行器报不兼容 | sync 里混入异步调用 | 元信息与实际计算不一致 |

这张表的用法是从现象倒推入口，而不是逐个算子试。前三行都属于「失败没被观察到」，后三行属于「执行元信息不对」，两类的修法完全不同：前者要修 catch 的映射，后者要换构造子。把它贴进排障手册，比记住六个 API 名字有用得多。尤其第一行，监控曲线变好与业务指标变差同时出现时，几乎可以确定是失败被吞而不是稳定性提升。

### 与后续模块的接缝

| 上游交付 | 下游怎么用 | 不允许改什么 |
|---|---|---|
| 具名错误类型 | L10 的恢复谓词按名字挑分支 | 不把错误合并成通用字符串 |
| 形状一致的 Effect 值 | L05 / L06 直接组合 | 不在构造子里提前运行 |
| 一对获取与释放动作 | S3 的 Scope 统一登记 finalizer | 不在回调里自行吞掉取消 |
`,
    'triple',
    [
      {
        text: '把一个「缓存未命中」建模成什么最合适？',
        options: ['Effect.die', 'Effect.fail(new CacheMiss())', 'throw new Error', 'Effect.void'],
        answer: 1,
        explain: '调用方需要据此回源查询，属于领域决策，应进入 E 通道。',
        concept: 'typed-error',
      },
      {
        text: 'Effect.die 产生的失败在哪里？',
        options: ['E 通道里', 'Cause 的 Die reason，不在 E 里', '被 runtime 忽略', 'Success 值里'],
        answer: 1,
        explain: '缺陷不进入类型化错误通道，但被 Cause 完整保留，可在边界处检查或上报。',
        concept: 'constructors',
      },
    ],
    [
      ['defect', '意外的、代表 bug 的失败，不参与类型化恢复'],
      ['预期错误 failure', 'E 通道中列出的、调用方应处理的失败'],
    ],
    ['到处用 tryPromise 把真 bug 也吞成业务错误，导致错误永远被「恢复」掉。'],
  ),
  'practice',
)
