import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L36 = withKind(
  L(
    'L36',
    4,
    '实战：从零实现一个最小可运行运行时（循环 + 终止 + 错误恢复）',
    3,
    ['L31', 'L34'],
    ['runtime-impl'],
    [
      '把循环 / 状态 / 终止 / 错误恢复四个部件拼成可运行代码',
      '用可注入的模型与工具保证运行时可以被确定性测试',
      '写出五条验收断言，覆盖正常、超步数、超时、工具失败、格式错误',
    ],
    `
### 拼装的顺序决定返工次数

L31 拆了四个部件，L34 定了终止契约，L35 给了状态视角。现在要把它们拼起来——而拼装顺序本身是有讲究的。

常见的错法是「先写循环，跑通再加状态、再加预算」。这条路的问题在于：循环一旦写成「直接操作外部变量」的形状，后面加状态就得重写；而重写循环是所有返工里最贵的，因为它的边界条件最难覆盖。

正确的顺序是**由内向外**：

1. **先定状态形状**（\`State\` 类型）。所有部件的接口都依赖它。
2. **再定纯函数式的状态推进**（\`applyObservation\`、\`recordFailure\`）。它们是循环的积木。
3. **再写终止判定**（\`shouldStop\`），它只读状态与预算。
4. **最后写循环**，把上面三样串起来。
5. **回归契约**在最后收口，但类型要一开始就定。

这个顺序的收益是：每一步都能单独测。状态推进可以纯函数单测，终止判定可以造状态单测，循环只剩「串」这一件事。

### 两条设计约束

**约束一：模型与工具必须可注入。** 运行时不能直接 \`import\` 一个真实的 LLM client，否则测试就得联网。所有外部依赖通过参数传入，测试时换成脚本化的假实现。

**约束二：不持有隐含状态。** 运行时不保存任何模块级变量。它接收初始状态、返回最终状态与结果。这条保证了并发安全（每个请求一份状态）与可回放（喂历史状态就能重现）。

**约束三：不直接读时间与随机数。** 时间通过 \`now()\` 注入、随机种子通过参数注入。理由与上一条同源：任何「从环境里偷偷读的东西」都会让测试变得不可复现——而运行时恰恰是最需要被测的部分。

### 实现：一个文件装下整套运行时

\`\`\`ts title="runtime.ts：状态 + 预算 + 循环 + 恢复" note="重点看 applyObservation 与 recordFailure——它们都是纯函数，循环本身只剩十几行。"
/* ---------- 类型 ---------- */
export interface Msg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  text: string
}

export interface Failure {
  tool: string
  kind: 'retryable' | 'bypassable' | 'fatal'
  message: string
  attempts: number
}

export interface State {
  msgs: Msg[]
  steps: number
  tokens: number
  status: 'running' | 'done' | 'failed'
  answer?: string
  partial?: string
  failures: Failure[]
}

export interface Budget {
  maxSteps: number
  timeoutMs: number
  maxTokens: number
  toolTimeoutMs: number
}

export type Action =
  | { type: 'tool'; tool: string; args: Record<string, unknown> }
  | { type: 'finish'; answer: string }

export interface Observation {
  ok: boolean
  data?: unknown
  error?: string
}

export interface RunResult {
  status: 'ok' | 'incomplete' | 'failed'
  reason?: 'max_steps' | 'timeout' | 'token_budget' | 'fatal'
  answer?: string
  state: State
}

export interface Deps {
  decide: (s: State) => Promise<{ action: Action; tokens: number }>
  execute: (a: { tool: string; args: Record<string, unknown> }, timeoutMs: number) => Promise<Observation>
  validate: (answer: string) => { ok: true } | { ok: false; reason: string }
  now: () => number
}

/* ---------- 纯函数：状态推进 ---------- */
export function initState(task: string, system: string): State {
  return {
    msgs: [
      { role: 'system', text: system },
      { role: 'user', text: task },
    ],
    steps: 0,
    tokens: 0,
    status: 'running',
    failures: [],
  }
}

export function applyObservation(s: State, a: Action, obs: Observation): State {
  const text = obs.ok ? 'OK\\n' + JSON.stringify(obs.data ?? null) : 'FAILED\\n' + (obs.error ?? '未知错误')
  return {
    ...s,
    msgs: [
      ...s.msgs,
      { role: 'assistant', text: JSON.stringify(a) },
      { role: 'tool', text: \`[tool:\${a.type === 'tool' ? a.tool : 'finish'}] \${text}\` },
    ],
    steps: s.steps + 1,
  }
}

/** 把异常翻译成状态：可重试的在内部消化，其余记为失败并让模型看见。 */
export function recordFailure(s: State, tool: string, err: Error): State {
  const message = err.message
  const prev = s.failures.find((f) => f.tool === tool && f.message === message)
  const attempts = (prev?.attempts ?? 0) + 1
  const fatal = /401|403|invalid argument/i.test(message)
  const kind: Failure['kind'] = fatal ? 'fatal' : attempts >= 2 ? 'bypassable' : 'retryable'
  return {
    ...s,
    failures: [...s.failures.filter((f) => f !== prev), { tool, kind, message, attempts }],
    status: fatal ? 'failed' : s.status,
    msgs: [...s.msgs, { role: 'tool', text: \`[tool:\${tool}] FAILED\\n\${message}（第 \${attempts} 次）\` }],
    steps: s.steps + 1,
  }
}

/* ---------- 终止判定：顺序即语义 ---------- */
export function stopReason(s: State, b: Budget, startedAt: number, now: () => number): RunResult['reason'] | null {
  if (s.status === 'done' || s.status === 'failed') return null
  if (s.steps >= b.maxSteps) return 'max_steps'
  if (now() - startedAt > b.timeoutMs) return 'timeout'
  if (s.tokens >= b.maxTokens) return 'token_budget'
  return null
}

/* ---------- 主循环 ---------- */
export async function run(task: string, system: string, b: Budget, deps: Deps): Promise<RunResult> {
  const startedAt = deps.now()
  let s = initState(task, system)

  while (true) {
    if (s.status === 'done') return { status: 'ok', answer: s.answer, state: s }
    if (s.status === 'failed') return { status: 'failed', reason: 'fatal', state: s }

    const stop = stopReason(s, b, startedAt, deps.now)
    if (stop) return { status: 'incomplete', reason: stop, answer: s.partial, state: s }

    const { action, tokens } = await deps.decide(s)
    s = { ...s, tokens: s.tokens + tokens }

    if (action.type === 'finish') {
      const v = deps.validate(action.answer)
      s = v.ok
        ? { ...s, status: 'done', answer: action.answer, steps: s.steps + 1 }
        : applyObservation(s, action, { ok: false, error: '答案不合格：' + v.reason })
      continue
    }

    try {
      const obs = await deps.execute({ tool: action.tool, args: action.args }, b.toolTimeoutMs)
      if (!obs.ok) s = recordFailure(s, action.tool, new Error(obs.error ?? '工具返回失败'))
      else s = applyObservation(s, action, obs)
    } catch (e) {
      s = recordFailure(s, action.tool, e as Error)
    }
  }
}
\`\`\`

几个实现细节值得单独说：

**\`applyObservation\` 与 \`recordFailure\` 都是纯函数**，返回新状态而不修改旧状态。这让循环体只剩下「判、调、赋」三个动作，读起来就是 L31 那张骨架图。

**\`recordFailure\` 里细分了三类错误**：\`401/403/参数非法\` 直接置 \`failed\`；同一工具同一错误第二次出现时降级为 \`bypassable\`（让模型换路径）；第一次是 \`retryable\`。这个分类决定了下一步是「再试」「绕开」还是「终止」。

**\`stopReason\` 里先判 \`done\`/\`failed\`**，返回 \`null\` 让主循环前面的分支处理。顺序在这里就是语义，写反了会在边界上误判。

### 五条验收断言

运行时的测试不该「跑一遍看看输出对不对」，而该按**失效模式**逐条钉住。五条覆盖了四类典型路径：

| # | 构造 | 期望 | 钉住的是什么 |
|---|---|---|---|
| 1 | 假模型依次返回两个 tool 再 finish | \`status='ok'\`，steps=3 | 正常路径不被预算误杀 |
| 2 | 假模型永远返回同一个 tool | \`reason='max_steps'\` | 死循环能被拦住 |
| 3 | 时钟每次前进 10 秒，工具永不返回 | \`reason='timeout'\` | 墙钟兜底生效 |
| 4 | 工具抛「429」两次后成功 | \`status='ok'\`，failures 有 2 条 | 可重试错误不改控制流 |
| 5 | finish 的答案为空 | 不置 done，多跑一轮 | 格式校验拦住假完成 |

\`\`\`ts title="用假模型与假时钟做确定性测试" note="关键是 now 可注入：不用真的等 60 秒，就能测超时。"
import { run, initState, type Deps, type State } from './runtime'

function fakeDeps(script: string[], clock = { t: 0 }): Deps {
  let i = 0
  return {
    now: () => clock.t,
    decide: async (s: State) => {
      const step = script[i++] ?? 'finish:done'
      if (step === 'loop') return { action: { type: 'tool', tool: 'noop', args: {} }, tokens: 10 }
      if (step.startsWith('finish:')) {
        return { action: { type: 'finish', answer: step.slice(7) }, tokens: 10 }
      }
      return { action: { type: 'tool', tool: step, args: {} }, tokens: 10 }
    },
    execute: async () => ({ ok: true, data: 'x' }),
    validate: (a) => (a.trim() ? { ok: true } : { ok: false, reason: '空答案' }),
  }
}

const budget = { maxSteps: 5, timeoutMs: 1000, maxTokens: 10_000, toolTimeoutMs: 100 }

// ① 正常路径
const r1 = await run('t', 's', budget, fakeDeps(['search', 'search', 'finish:报告']))
console.assert(r1.status === 'ok' && r1.state.steps === 3, '① 正常路径')

// ② 死循环
const r2 = await run('t', 's', budget, fakeDeps(Array(20).fill('loop')))
console.assert(r2.status === 'incomplete' && r2.reason === 'max_steps', '② 死循环')

// ③ 超时：时钟每次读都前进，模拟卡死
const slow = { t: 0 }
const r3 = await run('t', 's', budget, {
  ...fakeDeps(['loop'], slow),
  now: () => (slow.t += 400),
  execute: () => new Promise(() => {}),
})
console.assert(r3.status === 'incomplete' && r3.reason === 'timeout', '③ 超时')

// ⑤ 空答案：不置 done，会继续跑
const r5 = await run('t', 's', budget, fakeDeps(['finish:', 'finish:真的答案']))
console.assert(r5.status === 'ok' && r5.state.steps === 2, '⑤ 格式校验')

console.log('五条断言通过')
\`\`\`

第三条断言值得单独说：它用「每次读时钟都前进 400ms」来模拟「工具卡住」——不需要真的等，测试瞬间完成。这正是把 \`now\` 做成可注入依赖的价值。如果运行时里直接调 \`Date.now()\`，这条测试就得真的 sleep。

### 让状态能落盘：续跑需要什么

上面这套状态有个隐含要求：**必须能 JSON 序列化**。这条要求排除掉三类东西——函数、\`Map\`/\`Set\`、闭包捕获的变量。写的时候觉得「放个回调方便」，落盘时就会卡住。

续跑本身还有两个细节：

**第一，恢复时不能假定「在飞的那一步失败了」。** 进程在「工具已调用、结果未写回」时崩溃，恢复后你不知道那个副作用到底执行了没有。正确做法是给副作用工具带**幂等键**（\`idempotencyKey = runId + step\`），让重复调用安全，而不是靠猜。

**第二，恢复点要落在「稳定状态」上。** 也就是「一次推进已经完成、下一次还没开始」的时刻。在循环中间任意位置存快照，恢复后可能处于半完成状态，比不存更危险。

这两条决定了状态结构的形状：\`steps\` 单调递增、每次推进只写一次、副作用可重放。它们看起来是「额外要求」，实际上是把「重启」这个生产必然事件提前考虑进去的代价。

### 三个常见的实现错误

**错误一：在循环里 \`await\` 计时的粒度错了。** 超时检查只在每轮开头做，所以单步超过总超时也检测不到。修法是**每个工具调用单独带超时**（\`toolTimeoutMs\`），外层再用 \`Promise.race\` 兜一层。

**错误二：\`steps\` 的语义不统一。** 有的分支 \`steps + 1\`，有的分支忘了加。修法是把「步数递增」收进 \`applyObservation\` 与 \`recordFailure\` 两个出口——所有推进都必须经过它们。

**错误三：失败被记成观测但不改状态。** 工具失败只回填一条 \`FAILED\`，\`failures\` 数组却是空的，于是「同一个错误第三次出现」的判断永远不会触发。修法是把「记录失败」和「回填观测」绑在同一个函数里（\`recordFailure\` 两者都做）。

:::deep

### 为什么这个运行时只有 100 行

去掉类型声明，主循环不到 40 行。它能这么短，是因为每个部件都只做一件事：

- 状态推进是纯函数，不含控制流。
- 终止判定是纯函数，只读状态。
- 恢复只把异常翻译成状态，不做跳转。
- 循环只负责「按顺序调用上面三样」。

反过来说，一个 500 行的运行时通常不是因为功能多，而是因为**职责串了**：循环里掺了重试逻辑、状态对象里塞了业务方法、恢复逻辑自己决定 \`break\`。这些掺入让每一处都难测，最后只能靠端到端跑一遍来「验证」。

短不是目的，短是职责清晰的副产品。

:::

:::warn

### 先跑通「无聊」的路径，再加功能

实现运行时最常见的失控方式是「一次把流式、并发、多工具、记忆全加上」。

正确顺序是：先让上面这段 100 行代码跑通五条断言，**再加任何功能之前先补一条对应的断言**。比如加流式（L37）之前，先写「流式输出拼接后与一次性返回等价」的断言；加并发工具之前，先写「两个工具同时失败时 failures 有两条」的断言。

没有断言的功能是负债：它在 demo 里能用，在上线后成为「不敢动的部分」。

:::

### 收束：运行时是后面所有章节的地基

这套 100 行代码会在后面反复出现：L37 加流式、L40 加工具安全边界、L72 加可观测性、L91 加成本控制、L128 加可恢复执行器。它们都是在这套骨架上加东西，而不是另起一套。

所以本节的目标不是「写出能跑的代码」，而是「写出能改的代码」——而能改的前提，是每个部件的边界清楚到「加功能只需要动一处」。

L37 给这套运行时加流式输出：让用户能看见「正在生成」，而不是等 40 秒后一次性收到结果。

`,
    null,
    [
      {
        text: '拼装运行时的正确顺序是？',
        options: [
          '先写循环，跑通再加状态与预算',
          '先定状态形状 → 纯函数推进 → 终止判定 → 循环',
          '先写测试，再写代码',
          '先接真实模型，再补假实现',
        ],
        answer: 1,
        explain: '由内向外：状态先定，循环最后串，每步可单测。',
        concept: 'runtime-impl',
      },
      {
        text: '为什么模型与工具必须可注入？',
        options: ['便于换供应商', '测试时能换成脚本化假实现，不联网也能确定性验证', '性能更好', '类型更安全'],
        answer: 1,
        explain: '可注入才能用假模型与假时钟做确定性断言。',
        concept: 'runtime-impl',
      },
      {
        text: '把 `now` 做成注入依赖，最大的测试收益是？',
        options: ['代码更短', '不用真的等待就能测超时（每次读时钟人为前进）', '精度更高', '避免时区问题'],
        answer: 1,
        explain: '超时测试瞬间完成，不需要 sleep。',
        concept: 'runtime-impl',
      },
      {
        text: '步数递增为什么要收进 applyObservation / recordFailure 两个出口？',
        options: ['减少参数', '避免某些分支忘记 +1 导致 steps 语义不一致', '方便打印日志', '兼容旧代码'],
        answer: 1,
        explain: '所有状态推进都经过同一处，计数才不会漂。',
        concept: 'runtime-impl',
      },
      {
        text: '「先跑通五条断言再加功能」的理由是？',
        options: ['功能不重要', '没有断言的功能在上线后变成不敢动的部分', '断言比功能难写', '可以少写代码'],
        answer: 1,
        explain: '加功能前先补对应断言，否则功能是负债。',
        concept: 'runtime-impl',
      },
    ],
    [
      ['运行时', '循环 + 状态 + 终止 + 恢复组成的执行框架'],
      ['可注入依赖', '模型、工具、时钟由外部传入，便于确定性测试'],
      ['纯函数推进', '接收旧状态返回新状态、不产生副作用的更新方式'],
      ['失效模式断言', '按「会怎么坏」逐条构造的测试，而非只测正常路径'],
    ],
    [
      '运行时里直接 `import` 真实 client，测试必须联网且不确定。',
      '超时只在轮首检查，单步卡死检测不到。',
      '失败只回填观测不记 failures，重试判定永远不触发。',
    ],
  ),
  'practice',
)
