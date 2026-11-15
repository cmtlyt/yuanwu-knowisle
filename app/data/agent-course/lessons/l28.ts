import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 3 ========== */

export const L28 = withKind(
  L(
    'L28',
    3,
    '混合范式实战：Plan + ReAct + Reflexion 怎么串',
    2,
    ['L27', 'L15', 'L18'],
    ['hybrid-paradigm'],
    [
      '把 P&E 骨架 + ReAct 执行 + Reflexion 纠错串成一个可运行实现',
      '实现「失败才反思、有预算、可重规划」的三层触发条件',
      '跑通正常路径不反思、失败只纠一次、预算耗尽停机等验收断言',
    ],
    `
### 三个范式塞进一个提示词，轮次从 5 涨到 23

第一次尝试「混合范式」的团队写了一段自认为很周全的提示词：请先制定计划，执行时边观察边推理，完成后反思哪里可以改进，不满意就重新规划。跑起来确实「什么都有」——每一步都在规划，每一步做完都要反思一次，同一个字段错误被改了三遍还在，轮次从预期 5 步涨到 23 步，最后撞上预算上限被强杀。日志里看不出哪一步属于哪个范式，因为**它们全在同一个循环、同一段提示词里**。

问题不在三个范式选错了，而在**把它们当成三句指令拼接，而不是三层结构**。正确的混合是分层的：P&E 负责骨架（先出计划、按步推进），ReAct 负责单步内部（观察—推理—动作的小循环），Reflexion 只在「某步失败且有新信息」时触发一次纠错回路。每层有自己的进入条件、退出条件与预算，互不抢控制权。

### 三层各管一件事

| 层 | 职责 | 进入条件 | 退出条件 | 预算 | 失败处置 | 对应课 |
|---|---|---|---|---|---|---|
| P&E 骨架 | 拆步骤、排序、重规划 | 任务开始 / 反思后 | 计划全部完成或预算耗尽 | 最多 2 次重规划 | 保留原约束再重排 | L14/L15、L24 |
| ReAct 单步 | 观察—推理—动作 | 拿到一个步骤 | 该步产出结果或判定失败 | 每步最多 4 轮工具 | 抛 \`StepFailure\` 给上层 | L12/L13 |
| Reflexion 纠错 | 从失败里提取可复用结论 | **仅当失败且满足触发条件** | 产出一条结论即退出 | 整轮最多 N 次 | 不产出就跳过 | L17/L18 |

第三行的加粗部分是关键。L11 说过「每多一层能力就多付一份代价」，这里体现得最直白：反思不是每轮都做，它是**异常路径上的一次性回路**。把它放进主循环，就等于给每次成功也付了反思的成本。

:::deep
### 触发条件比范式本身重要

混合系统的复杂度不在「三个范式怎么实现」，而在「什么时候允许谁接管」。三条判据足以挡住绝大多数失控：

1. **ReAct 只在单步内转**：它看不到全局计划，也不该改计划；跨步骤的决策属于 P&E。
2. **Reflexion 只在可判成败且有新信息时触发**：如果失败原因和上次一模一样、或者根本判断不出成功与否，再反思一次只是重复烧 token。这与 L63 的「失败经验要可复用才值得持久化」、L64 的「自我批评要有停手条件」是同一条原则的入门版。
3. **重规划必须保留原约束**：L61 讲过「重规划丢约束」是最隐蔽的回归——新计划不能把用户最初的时间、格式、权限要求弄丢。

把这三条写成代码里的 \`if\`，而不是写在提示词里请模型「自己判断该用哪个范式」。**控制权归谁，是结构问题，不是语气问题**（L06）。
:::

### 三层可运行实现

\`\`\`ts title="HybridRunner：P&E 骨架 + ReAct 单步 + 失败才反思" note="要点：反思在异常路径；重规划保留约束；整轮预算共享；每层留事件。"
type Step = { id: string; goal: string; constraints: string[] }
type StepFailure = { stepId: string; reason: string; observation: string }
type Budget = { maxSteps: number; maxReplans: number; maxReflections: number }

class HybridRunner {
  private events: string[] = []
  constructor(private deps: HybridDeps, private budget: Budget) {}

  async run(task: string): Promise<string> {
    let plan = await this.deps.planner.plan(task)
    let replans = 0
    let reflections = 0
    const done: string[] = []

    for (const step of plan.steps) {
      if (done.length >= this.budget.maxSteps) throw new Error('step budget exhausted')
      try {
        const out = await this.executeStep(step)             // ② ReAct 单步
        done.push(out)
        this.events.push('ok:' + step.id)
      } catch (e) {
        const failure = e as StepFailure
        this.events.push('fail:' + step.id)
        // ③ 只在满足条件时反思一次
        if (reflections < this.budget.maxReflections && this.shouldReflect(failure, plan)) {
          const lesson = await this.deps.critic.reflect(failure)
          this.events.push('reflect:' + step.id)
          reflections += 1
          if (replans < this.budget.maxReplans) {
            plan = await this.deps.planner.replan(plan, lesson, step.id, {
              keepConstraints: step.constraints,            // 重规划不丢约束
              alreadyDone: done,
            })
            replans += 1
            this.events.push('replan:' + plan.version)
            return this.runFrom(plan, done, replans, reflections)  // 从剩余步骤继续
          }
        }
        throw new Error('step failed without usable reflection: ' + failure.reason)
      }
    }
    return this.deps.summarize(done)
  }

  private async executeStep(step: Step): Promise<string> {
    let observation = ''
    for (let turn = 0; turn < 4; turn++) {                   // ReAct 每步最多 4 轮
      const thought = await this.deps.llm.decide(step.goal, observation, turn)
      if (thought.done) return thought.answer ?? ''
      observation = await this.deps.tools.dispatch(thought.action, thought.args)
      this.events.push('act:' + step.id + ':' + thought.action)
    }
    throw { stepId: step.id, reason: 'react-turn-exceeded', observation } as StepFailure
  }

  private shouldReflect(f: StepFailure, plan: Plan): boolean {
    if (!f.observation || f.observation.trim() === '') return false   // 无从判断成败
    if (this.events.some((e) => e === 'reflect:' + f.stepId)) return false // 同一步不重复
    return plan.steps.some((s) => s.id === f.stepId)                 // 失败必须属于当前计划
  }
}
\`\`\`

\`executeStep\` 里的 \`for (let turn = 0; turn < 4)\` 是 ReAct 的**局部**循环，它拿不到 \`plan\`；\`run\` 里的 \`for (const step of plan.steps)\` 是 P&E 的**全局**循环。两个循环嵌套但职责不交叉——这正是 L97 后面会反复检查的「控制流位置」。\`runFrom\` 用剩余计划继续，而不是从头重跑，避免 L60 那种「重规划三次把八张表重查三遍」的浪费。

### 反思触发器与重规划约束

\`\`\`ts title="触发器与约束保留" note="要点：可判成败 / 有新信息 / 不重复 / 预算够，四条全满足才反思；重规划继承原约束。"
type Plan = { version: string; steps: Step[]; sourceConstraints: string[] }

interface HybridDeps {
  llm: Decider
  tools: ToolRegistry
  planner: {
    plan(task: string): Promise<Plan>
    replan(prev: Plan, lesson: string, failedStepId: string,
           ctx: { keepConstraints: string[]; alreadyDone: string[] }): Promise<Plan>
  }
  critic: { reflect(f: StepFailure): Promise<string> }
  summarize(parts: string[]): string
}

async function replanSafely(prev: Plan, lesson: string, failedStepId: string,
                            done: string[], deps: HybridDeps): Promise<Plan> {
  const next = await deps.planner.replan(prev, lesson, failedStepId, {
    keepConstraints: prev.sourceConstraints,
    alreadyDone: done,
  })
  const lost = prev.sourceConstraints.filter((c) => !next.sourceConstraints.includes(c))
  if (lost.length) throw new Error('重规划丢了约束: ' + lost.join(', '))  // 硬断言
  if (!next.steps.some((s) => s.id === failedStepId || s.id.startsWith('retry-'))) {
    throw new Error('重规划没有覆盖失败步骤')
  }
  return next
}
\`\`\`

\`replanSafely\` 里那两条断言看着啰嗦，却是混合范式最实用的护栏：**模型生成的新计划很容易「优化掉」用户最初的要求**，比如把「必须用中文、不得联网」悄悄删掉。把约束继承写成结构性检查，比在提示词里重复三遍「请保留所有要求」可靠得多。

### 验收：把「分层」变成断言

\`\`\`ts title="tests/hybrid.test.ts" note="要点：正常路径不反思；失败只纠一次；预算耗尽停机；重规划继承约束。"
test('全部步骤成功时，反思与重规划都不该发生', async () => {
  const { runner, spy } = makeHarness({ failAt: null })
  const out = await runner.run('查订单并解释')
  assert.ok(out.length > 0)
  assert.equal(spy.reflections(), 0)
  assert.equal(spy.replans(), 0)
})

test('某步失败且可判成败时，只反思一次并生成新计划', async () => {
  const { runner, spy } = makeHarness({ failAt: 'step-2' })
  await runner.run('查订单并解释')
  assert.equal(spy.reflections(), 1)
  assert.equal(spy.replans(), 1)
  assert.ok(spy.events().includes('reflect:step-2'))
})

test('重规划必须继承原约束，丢失即抛错', async () => {
  const deps = makeHybridDeps({ dropConstraintsOnReplan: true })
  await assert.rejects(new HybridRunner(deps, BUDGET).run('x'), /重规划丢了约束/)
})

test('重规划次数用尽后必须停机，不能无限反思', async () => {
  const { runner, spy } = makeHarness({ alwaysFail: true })
  await assert.rejects(runner.run('x'), /budget exhausted|without usable reflection/)
  assert.ok(spy.reflections() <= 2)
})
\`\`\`

四条断言分别对应四种真实失控：正常路径被多余反思拖慢、重复纠错、约束被新计划吃掉、无限循环。用假 planner 与假 critic 驱动，不连真模型，能进 CI。

:::warn
### 两个必踩的坑

- **三种范式共享一个提示词**。模型会在同一轮里既规划又反思，日志里分不清哪一步属于哪层，也无法给某一层单独设预算。分层要落在代码结构上，不是提示词的小标题上。
- **无限反思**。没有「同一步不重复、整轮有上限、失败要可判成败」这三条，Reflexion 会在同一个错误上反复打转。停手条件比反思逻辑本身更重要（L64 会把它展开成专论）。
:::

### 三层之间的数据契约

上面三个类型不是随手定的，每个字段都在支撑一次跨层交接：

| 字段 | 谁写 | 谁读 | 少了会怎样 |
|---|---|---|---|
| \`Step.constraints\` | Planner | \`replanSafely\` 的约束比对 | 重规划悄悄丢掉用户要求（L61） |
| \`StepFailure.observation\` | \`executeStep\` | \`shouldReflect\` 判成败 | 无从判断是否值得反思，只能盲目重试 |
| \`Plan.version\` | \`replan\` | 事件 \`replan:<version>\` | 事后说不清「当前跑的是第几版计划」 |
| \`Plan.sourceConstraints\` | 首次 \`plan\` | \`replanSafely\` | 新计划没有可对照的原始约束集合 |
| \`alreadyDone\` | \`run\` | \`replan\` | 重规划把已完成步骤重跑一遍（L60） |

少了这些字段，三层之间就只能靠共享提示词里的自然语言传递状态——那正是开头「一个提示词塞三种范式」的退化路径。**分层混合的实质是让交接物结构化**：谁产出、谁消费、缺了什么，全部写在类型里，而不是写在模型的理解里。

### 什么时候不该混合

混合不是升级路线上的必经站。四种情况下应当保持单层：单步就能完成、正确结果可用纯函数精确断言（L09）、没有可判成败的验证器（反思无从触发）、以及时延或成本预算很紧。每加一层，都至少要多一类事件、一个预算、一条验收断言；如果说不清「这一层具体解决哪一类失败」，就不要加。

这也划清了本课与后续专论的边界：L59–L65 会把规划、重规划、失败经验持久化、自我批评停手判据逐个展开，L65 更是完整的闭环实战；本课只是**入门串法**——把三层装起来、给它们触发条件与预算、用四条断言证明没有失控，不写持久化学习，也不推导停手判据。先能跑通分层，才谈得上让系统从失败里长期变聪明。

### 与相邻课的分工

- **L12/L13 / L14/L15 / L17/L18**：三个范式各自的专论与实现，本课只做分层组装，不复述原理。
- **L27**：四维矩阵回答「各有什么取舍」，本课回答「选好的几层怎么叠」。
- **L59–L65**：分解、P&E 引擎、动态重规划、失败经验持久化与自我批评的进阶实现；本课是入门串法，不讲持久化学习与停手判据的完整推导。
- **L97**：检查控制流是否真的迁移到新架构，本课两个嵌套循环是它的检查样本。

**一句话收束**：混合范式不是把三句指令拼在一起，是**三层各有进入条件、退出条件与预算**；反思只在异常路径发生，重规划绝不丢约束。
`,
    null,
    [
      {
        text: '把三种范式塞进一个提示词导致轮次暴涨，根因是？',
        options: [
          '模型不够强',
          '三层没有各自的结构、触发条件与预算，每轮都在规划又反思',
          '工具太少',
          '上下文太短',
        ],
        answer: 1,
        explain: '分层要落在代码结构上，不是提示词的小标题上。',
        concept: 'hybrid-paradigm',
      },
      {
        text: 'Reflexion 层正确的触发条件是？',
        options: [
          '每轮执行后',
          '仅当失败且可判成败、有新信息、同一步未反思过、预算够',
          '任务开始时',
          '用户每次提问',
        ],
        answer: 1,
        explain: '反思是异常路径上的一次性回路，不是主循环的一部分。',
        concept: 'hybrid-paradigm',
      },
      {
        text: '重规划时最该写成硬断言的是？',
        options: ['步骤数量变少', '原约束逐条保留且失败步骤被覆盖', '提示词更短', '换成更强的模型'],
        answer: 1,
        explain: '新计划容易「优化掉」用户最初要求，靠提示词重复不可靠。',
        concept: 'hybrid-paradigm',
      },
    ],
    [
      ['分层混合', 'P&E 做骨架、ReAct 做单步、Reflexion 做失败后纠错，各有触发与预算'],
      ['局部循环 vs 全局循环', 'ReAct 的 for 在单步内，P&E 的 for 跨步骤，职责不交叉'],
      ['约束继承', '重规划后逐条比对原约束，丢失即抛错'],
    ],
    [
      '把三种范式写进同一段提示词，日志分不清层级且无法单独设预算。',
      '没有「同一步不重复 + 整轮上限」的停手条件，在同一个错误上无限反思。',
    ],
  ),
  'practice',
)
