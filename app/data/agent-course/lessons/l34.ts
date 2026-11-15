import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L34 = withKind(
  L(
    'L34',
    4,
    '让 Agent 知道「该停了」：终止与回归',
    2,
    ['L31'],
    ['termination'],
    [
      '掌握三类终止条件：显式 finish / 步数上限 / 超时',
      '理解「终止」与「回归」的关系（正常收尾 vs 异常回退）',
      '避免「该停不停」「不该停硬停」两类错误',
    ],
    `
### 一次「停不下来」的账单

有个团队的 Agent 在一次夜间批处理里跑了 6 个小时，账单是预算的 40 倍。

原因不复杂：那个任务的终止条件只有一条——模型说完成。而模型陷入了一种很常见的循环：查一个数据源、返回空、它换个查询词再查一遍、还是空。它从不说「我做不到」，而是不断微调措辞重试。代码里没有任何上限，于是它一直转到天亮，直到有人手动停掉进程。

另一个团队的问题相反：他们把 \`maxSteps\` 写死成 8。结果 12% 的任务在第 8 步被截断，返回的结果「看起来完整」——因为截断时他们把已收集的内容拼成了一段回答。用户看到的是一个语气笃定、但缺了最后一步结论的报告。

两个事故是同一枚硬币的两面：**终止条件既不能全靠模型，也不能粗暴截断**。本课讲怎么把它设计成一份清晰的契约。

### 三类终止，约束三种不同资源

| 类型 | 判据 | 防的是 | 触发后的语义 |
|---|---|---|---|
| 显式完成 | 模型输出了 \`finish\` 动作，且代码侧校验通过 | 任务真做完了却继续转 | 成功 |
| 步数上限 | \`steps >= maxSteps\` | 逻辑死循环 | 未完成（可续跑） |
| 墙钟超时 | \`now > deadline\` | 单步卡死（网络 / 工具无响应） | 未完成（可续跑） |
| token 预算 | 累计用量超阈值 | 成本失控 | 未完成（可续跑） |

四者不能互相替代，因为度量对象不同：一个每步只花 50 token 但转了 300 圈的循环，token 预算可能还没触发，步数早该停了；一个卡在 HTTP 请求上的调用，步数与 token 都不增加，只有墙钟能救。

步数与超时的语义要特别说清：它们是**「没做完」而不是「失败」**。这两者的区别决定了调用方该重试还是该报错——所以回归类型必须能把它们区分开。

### 终止判定的顺序很重要

判定顺序影响语义，不能随意排列。推荐顺序是：

1. **先判成功**（\`status === 'done'\`）。已经完成的任务不该因为「步数刚好用完」被标成未完成。
2. **再判致命错误**。鉴权失败、参数非法这类错误，继续跑没有意义。
3. **最后判预算**（步数 / 时间 / token）。这是「外力叫停」，不是任务自身状态。

如果顺序反过来（先判预算再判成功），就会出现一个诡异的现象：任务在第 \`maxSteps\` 步正好完成，却被标记为「超出步数上限」。这类 bug 只在边界上出现，测试很容易漏掉。

### 回归：停止之后要交代什么

「终止」是停止循环；「回归」（return）是停止后交给调用方一个**可处理的返回值**。两者是「停」与「停之后怎么交代」的关系。

一份可用的回归值至少要有四个字段：

\`\`\`ts title="回归契约：调用方靠这四个字段决定下一步" note="status 与 reason 分离是关键：status 说「成没成」，reason 说「为什么」，两者组合才有足够信息量。"
type Status = 'ok' | 'incomplete' | 'failed'

interface RunResult {
  status: Status // 成没成
  reason?: 'max_steps' | 'timeout' | 'token_budget' | 'fatal' // 没成的原因
  answer?: string // 有就返回，哪怕是部分结果
  trace: Trace // 完整轨迹，供排查与续跑
}
\`\`\`

三个语义约定：

- **\`ok\`**：只有「模型宣布完成 且 代码侧校验通过」才算。模型说完成但没给答案、答案为空、答案不符格式，都不能算 \`ok\`。
- **\`incomplete\`**：跑到预算上限。这类结果**可以带部分答案**，但必须显式标注「这是部分结果」，否则调用方会当完整结果用。
- **\`failed\`**：致命错误。这类不该带答案——带了答案会诱导调用方凑合使用。

第二点是上面第二个事故的根因：他们把 \`incomplete\` 的结果拼成了一段完整口吻的报告。修法不是「不要返回部分结果」，而是**让部分结果无法被误认为完整结果**——状态字段、文案标注、甚至在答案开头加一句「以下为部分结果」。

:::deep

### 为什么「模型说完成」不能直接信

模型输出 \`finish\` 只说明它**认为**自己做完了，不说明任务真的满足要求。三种常见的不一致：

**① 提前收工。** 任务要求「对比三家」，它查了两家就说完成。这在长任务里很常见，因为模型倾向于「给出一个答案」而不是「承认信息不足」。

**② 格式不符。** 要求输出 JSON，它给了一段带解释的自然语言。它认为「内容都有了」，但调用方解析会失败。

**③ 空答案。** 输出了 \`finish\` 但 answer 字段为空——通常是生成被截断或工具返回空。

工程上的做法是**在代码侧加一道校验**：\`finish\` 只是「候选完成」，要通过 \`validateAnswer(state)\` 才算真完成。校验不通过时，把「格式不对 / 缺字段」作为一条观测回填，让模型再修一次——这比直接失败友好得多，也比无条件相信安全得多。

代价是可能多跑一两轮。但相比「返回一个格式错的答案让下游炸掉」，这一两轮很便宜。

:::

### 完整实现：预算 + 判定顺序 + 回归

\`\`\`ts title="带预算与回归契约的主循环" note="shouldStop 返回 null 表示继续；返回原因表示该停——把「为什么停」变成数据，而不是靠 break 语句。"
interface Budget {
  maxSteps: number
  timeoutMs: number
  maxTokens: number
}

function shouldStop(state: State, b: Budget, startedAt: number): RunResult['reason'] | null {
  if (state.status === 'done') return null // 成功由外层单独处理
  if (state.status === 'failed') return 'fatal'
  if (state.steps >= b.maxSteps) return 'max_steps'
  if (Date.now() - startedAt > b.timeoutMs) return 'timeout'
  if (state.tokensUsed >= b.maxTokens) return 'token_budget'
  return null
}

export async function run(
  input: string,
  b: Budget,
  deps: { decide: Decide; execute: Execute; validate: Validate },
): Promise<RunResult> {
  const startedAt = Date.now()
  let state: State = initState(input)
  const trace: Trace = []

  while (true) {
    // ① 成功优先：先看任务自身是否已完成
    if (state.status === 'done') {
      return { status: 'ok', answer: state.answer, trace }
    }

    // ② 致命错误
    if (state.status === 'failed') {
      return { status: 'failed', reason: 'fatal', trace }
    }

    // ③ 预算上限
    const stop = shouldStop(state, b, startedAt)
    if (stop) {
      return { status: 'incomplete', reason: stop, answer: state.partial, trace }
    }

    // ④ 走一步
    const action = await deps.decide(state)
    trace.push({ type: 'action', action, at: state.steps })

    if (action.type === 'finish') {
      // 模型说完成了，但要在代码侧校验
      const verdict = deps.validate(action.answer)
      if (verdict.ok) {
        state = { ...state, status: 'done', answer: action.answer }
      } else {
        // 校验不过：把问题回填成观测，让模型再修一次
        state = appendObservation(state, action, '答案不合格：' + verdict.reason)
      }
    } else {
      try {
        const obs = await deps.execute(action)
        state = appendObservation(state, action, obs)
      } catch (e) {
        state = recordFailure(state, e) // 可重试错误在 recordFailure 内部消化
      }
    }
    state = { ...state, steps: state.steps + 1 }
  }
}
\`\`\`

这段代码里有三个值得注意的决定：

**第一，\`shouldStop\` 返回「原因」而不是布尔值。** 布尔值只能表达「该停了」，而回归需要知道「为什么停」——调用方据此决定续跑还是报错。用枚举把「为什么」变成数据，是这类控制逻辑的通用做法。

**第二，成功判定放在预算判定之前。** 这是上面说的顺序问题。写成 \`if (stop) return ...\` 在 \`if (done)\` 之前，边界上就会误判。

**第三，\`finish\` 走校验分支而不是直接返回。** 校验失败时回填一条观测继续循环，让模型自己修。这比抛错终止友好，也比无条件相信安全。

### 上限该设多大

没有通用答案，但有两个可操作的规则：

- **按任务复杂度分档**，而不是全局一个值。简单查证类 5–8 步，多步调研 15–20 步，开放式任务 30+。用同一套上限，简单任务浪费、复杂任务截断。
- **用 p95 校准**。先在灰度环境记录「成功任务实际用了多少步」，取 p95 的 1.3 倍作为上限。这样绝大多数正常任务不会撞线，而异常任务会被及时拦住。

token 预算的校准同理：看成功任务的 token 分布，取 p95 的 1.5 倍。超时则按「单步最慢工具 × 预期步数」估，再乘 2 倍余量。

:::warn

### 把 maxSteps 当唯一防线，等于没有防线

只设步数上限有两个漏洞：

**漏洞一：一步可以很贵。** 若某步调用了「读整个仓库」的工具，一步就能吃掉几十万 token。步数没超，成本已经爆了。所以 token 预算必须独立存在。

**漏洞二：一步可以永远不返回。** 工具内部死循环、HTTP 没有超时、数据库连接挂住——这些情况下步数永远不增加。必须有墙钟超时，而且**每个工具调用本身也要有超时**（这是两层防护：外层管整体，内层管单次）。

一个实用的检查清单：问自己「如果模型每步都做最坏的选择，系统会在多久内停下来、花多少钱」。答不出来，说明预算还没设计完。

:::

### 收束：终止是「契约」，不是「开关」

把终止当开关，你会写出「到 10 步就 break」的代码；把终止当契约，你会定义三种状态、四种原因、部分结果的标注方式，让调用方能够正确决策。

这个区别在 demo 里看不出来，在上生产时是决定性的：**调用方能不能区分「没做完」和「做错了」，决定了它该重试、降级、还是告警**。而这一切的前提，是运行时把「为什么停」准确地传出去。

L35 换个角度建模同一件事：把「运行中 / 已完成 / 已失败」以及它们之间的转移画成状态机，你会发现终止条件其实是状态机里的「出边」，而错误恢复是「回边」。

`,
    null,
    [
      {
        text: '三类终止上限分别防什么？',
        options: [
          '防黑客、防超时、防溢出',
          '步数防逻辑死循环、token 防成本失控、墙钟防单步卡死',
          '防重复、防并发、防丢数据',
          '防幻觉、防越权、防泄露',
        ],
        answer: 1,
        explain: '度量对象不同，不能互相替代。',
        concept: 'termination',
      },
      {
        text: '终止判定为什么要把「成功」放在「预算」之前？',
        options: ['性能更好', '否则正好在上限那一步完成的任务会被误标成「超出步数」', '代码更短', '模型要求'],
        answer: 1,
        explain: '顺序错会在边界上误判语义。',
        concept: 'termination',
      },
      {
        text: '`incomplete`（跑到上限）的结果该怎么处理？',
        options: [
          '直接丢弃',
          '可以带部分答案，但必须显式标注「部分结果」',
          '当成完整结果返回',
          '自动重试直到成功',
        ],
        answer: 1,
        explain: '不标注会让调用方把部分结果当完整结果使用。',
        concept: 'termination',
      },
      {
        text: '为什么模型输出 finish 不能直接算成功？',
        options: [
          'finish 是内部信号',
          '模型可能提前收工、格式不符或答案为空，需要代码侧校验',
          'finish 会消耗 token',
          'finish 只能用在 ReAct',
        ],
        answer: 1,
        explain: 'finish 只是「候选完成」，要过 validateAnswer。',
        concept: 'termination',
      },
      {
        text: '只设 maxSteps 的两个漏洞是？',
        options: [
          '太慢、太贵',
          '一步可能很贵（token 爆）、一步可能永不返回（墙钟卡死）',
          '无法统计、无法日志',
          '模型不支持、工具不支持',
        ],
        answer: 1,
        explain: '步数不约束单步成本，也不约束单步耗时。',
        concept: 'termination',
      },
    ],
    [
      ['显式 finish', '模型输出的完成信号，需代码侧校验才算成功'],
      ['回归契约', 'status + reason + answer + trace 四字段的返回值'],
      ['部分结果', '跑到预算上限时的产出，必须显式标注'],
      ['p95 校准', '按成功任务的实际用量分布设定上限的做法'],
    ],
    [
      '只依赖模型说 finish，没有步数 / 时间 / token 兜底。',
      '把截断的结果拼成完整口吻的报告，让调用方误用。',
      '上限全局写死一个值，简单任务浪费、复杂任务被截断。',
    ],
  ),
  'theory',
)
