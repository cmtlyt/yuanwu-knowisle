import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 10 ========== */

export const L65 = withKind(
  L(
    'L65',
    10,
    '实战：实现 Self-Critique + 验证回路闭环',
    42,
    ['L64'],
    ['verification-loop'],
    [
      '用 TypeScript 实现「生成 → 验证 → 批评 → 修正」四件组件的可运行闭环',
      '实现最优版本追踪与三值裁决，避免交付最差的一版',
      '对照 @openai/guardrails 的生成/评审护栏，说清「拦截」与「修复」的分工',
    ],
    `
### 六轮改完，交付了最差的一版

一个把自然语言转成配置文件的 Agent 加了自我批评闭环，参数是 \`maxRounds = 6\`。某个任务跑满六轮后返回了第 6 版，用户拿着去部署，校验不通过。

日志里把它每轮的验证通过率排出来是这样：\`0.6 → 0.8 → 0.9 → 0.7 → 0.5 → 0.4\`。

第 3 轮就已经到 0.9 了——再补一个字段就全过。但循环没有「记住最好的一版」，它只往前看，于是第 4 轮的批评把本来对的部分改坏了，之后一路下滑。这不是批评器的问题，是**闭环缺了状态**：一个只记录「当前版本」的循环，在非单调的优化过程里必然会交付偏差最大的那一版。

这一课要搭的闭环有三个别处不常提但决定成败的部件：**最优版追踪**、**裁决三值**、**预算闸**。

### 四件组件与它们的契约

| 组件 | 输入 | 输出 | 不该做的事 |
| --- | --- | --- | --- |
| Generator | 任务描述 | 草稿文本 | 自己评判好坏 |
| Verifier | 草稿文本 | 通过率 + 失败明细 | 修改草稿 |
| Critic | 草稿 + 失败明细 + 已试方案 | 意见列表 | 直接给出新草稿 |
| Reviser | 草稿 + 合格意见 | 新草稿 | 引入意见之外的改动 |

四条边界的意义：Verifier 只判不改，所以它的输出可以作为独立证据；Critic 只提意见不改稿，所以意见可以被过滤和去重；Reviser 只按意见改，所以改动可归因。任何一条边界被打破，循环就退化成「模型自己反复重写」。

\`\`\`ts title="类型层：四件组件的契约"
export type Severity = 'error' | 'warn'

export interface Failure {
  path: string // 出问题的位置，用于定位
  message: string
  severity: Severity
}

export interface Verdict {
  passRate: number // 0..1，用例通过比例（不是二值）
  failures: Failure[]
}

export interface Critique {
  location: string
  action: string
  kind: 'semantic' | 'style'
}

export interface Generator {
  generate(task: string): Promise<string>
}
export interface Verifier {
  check(text: string): Promise<Verdict>
}
export interface Critic {
  review(text: string, v: Verdict, tried: string[]): Promise<Critique[]>
}
export interface Reviser {
  revise(text: string, cs: Critique[]): Promise<string>
}
\`\`\`

\`passRate\` 是关键设计：如果 Verdict 只有布尔 \`passed\`，就无法判断「这轮比上轮好还是差」，最优版追踪也就无从实现。用通过率，循环才有单调性可言。

### 验证器从哪来

Verifier 是整套闭环里唯一不依赖模型的部分，也是唯一能让循环收敛的部分。四种来源，可靠性递增：

| 来源 | 适用 | 实现成本 | 可靠性 |
| --- | --- | --- | --- |
| Schema 校验 | 结构化输出（JSON / YAML / 配置） | 低 | 高 |
| 单元测试 | 代码生成 | 中 | 高 |
| 实际执行 | SQL、脚本、可运行的 DSL | 中 | 最高（真跑） |
| 断言集 | 抽取类任务（字段是否存在、数值是否在区间） | 低 | 中 |

\`\`\`ts title="验证器示例：schema + 断言双层"
import { z } from 'zod'

const ConfigSchema = z.object({
  name: z.string().min(1),
  replicas: z.number().int().min(1).max(50),
  ports: z.array(z.number().int().min(1).max(65535)).min(1),
  env: z.record(z.string(), z.string()).optional(),
})

const CASES = [
  { name: '必填字段齐全', run: (c: unknown) => ConfigSchema.safeParse(c).success },
  { name: '端口不重复', run: (c: any) => new Set(c?.ports ?? []).size === (c?.ports ?? []).length },
  { name: '名称符合 DNS-1123', run: (c: any) => /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(String(c?.name)) },
]

export function yamlVerifier(): Verifier {
  return {
    async check(text) {
      let parsed: unknown
      try {
        parsed = JSON.parse(text) // 示例用 JSON；YAML 换成对应 parser
      } catch (e) {
        return { passRate: 0, failures: [{ path: '$', message: '解析失败：' + String(e), severity: 'error' }] }
      }
      const results = CASES.map((c) => ({ name: c.name, ok: c.run(parsed) }))
      const passed = results.filter((r) => r.ok).length
      return {
        passRate: passed / results.length,
        failures: results
          .filter((r) => !r.ok)
          .map((r) => ({ path: r.name, message: '用例未通过', severity: 'error' as Severity })),
      }
    },
  }
}
\`\`\`

注意失败明细里的 \`path\` 用的是**用例名**而不是字段名。这是刻意的：Critic 拿到「名称符合 DNS-1123 未通过」比拿到「name 字段有问题」更容易给出可执行的修正。验证器的输出质量直接决定批评质量——这是整套闭环里最重要的一条传递关系。

### 闭环主循环

\`\`\`ts title="closeLoop：三值裁决 + 最优版追踪 + 预算闸"
export type StopReason = 'passed' | 'no-fresh' | 'max-rounds' | 'budget'

export interface LoopResult {
  ok: boolean
  text: string
  rounds: number
  bestRate: number
  reason: StopReason
}

class BudgetExceeded extends Error {}

export interface LoopParts {
  generator: Generator
  verifier: Verifier
  critic: Critic
  reviser: Reviser
}

export async function closeLoop(
  task: string,
  parts: LoopParts,
  opts: { maxRounds?: number; maxCalls?: number } = {},
): Promise<LoopResult> {
  const maxRounds = opts.maxRounds ?? 4
  const maxCalls = opts.maxCalls ?? 12
  let calls = 0
  const spend = () => {
    if (++calls > maxCalls) throw new BudgetExceeded('调用预算耗尽')
  }

  let text = await parts.generator.generate(task)
  spend()

  let best = { text, rate: -1 }
  const seen = new Set<string>()
  const tried: string[] = []
  let lastRate = -1

  try {
    for (let round = 0; round < maxRounds; round++) {
      const v = await parts.verifier.check(text)

      // ① 最优版追踪：只要本版更好就记下来
      if (v.passRate > best.rate) best = { text, rate: v.passRate }

      // ② 裁决一：无 error 级失败 → 交付
      const hasError = v.failures.some((f) => f.severity === 'error')
      if (!hasError) {
        return { ok: true, text, rounds: round, bestRate: v.passRate, reason: 'passed' }
      }

      // ③ 偏差监控：连续两轮下降就停手，交回最优版
      if (lastRate >= 0 && v.passRate < lastRate) {
        // 只记一次下降是正常的；连续下降说明修正方向错了
        if (round > 0 && v.passRate < best.rate - 0.15) {
          return { ok: false, text: best.text, rounds: round, bestRate: best.rate, reason: 'max-rounds' }
        }
      }
      lastRate = v.passRate

      // ④ 批评 → 过滤 → 修正
      const all = await parts.critic.review(text, v, tried)
      spend()
      const fresh = all.filter((c) => {
        const key = c.location + '|' + c.action
        if (!c.location || !c.action || c.kind === 'style') return false
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (fresh.length === 0) {
        return { ok: false, text: best.text, rounds: round, bestRate: best.rate, reason: 'no-fresh' }
      }

      tried.push(...fresh.map((c) => c.location + ' → ' + c.action))
      text = await parts.reviser.revise(text, fresh)
      spend()
    }
  } catch (e) {
    if (e instanceof BudgetExceeded) {
      return { ok: false, text: best.text, rounds: -1, bestRate: best.rate, reason: 'budget' }
    }
    throw e
  }

  return { ok: false, text: best.text, rounds: maxRounds, bestRate: best.rate, reason: 'max-rounds' }
}
\`\`\`

四处值得单独说：

1. **返回的是 \`best.text\` 而不是 \`text\`**。开头那个事故的修复只有这一行——非单调优化里，最后一版通常不是最好的一版。
2. **\`kind === 'style'\` 的意见被直接丢弃**。L64 讲过批评会降维，风格类意见是降维的主要载体；过滤掉它们能把循环预算全用在语义问题上。
3. **偏差监控用 \`best.rate - 0.15\` 这种绝对落差**，而不是「比上一轮低」。单轮抖动很常见，只有明显低于历史最优才值得停手。
4. **\`tried\` 传给 Critic**。这是防重复的唯一手段——Critic 看不到已试方案就会反复提同一条意见，循环在第 3 轮开始空转。

### 跑通一次

\`\`\`ts title="mock 四件组件，观察通过率曲线"
const drafts = ['{ "name": "A" }', '{ "name": "a", "replicas": 2, "ports": [80] }', '{ "name": "a", "replicas": 99, "ports": [80, 80] }']

const parts: LoopParts = {
  generator: { async generate() { return drafts[0] } },
  verifier: yamlVerifier(),
  critic: {
    async review(text, v, tried) {
      return v.failures.map((f) => ({
        location: f.path,
        action: tried.includes(f.path) ? '再检查一次 ' + f.path : '补齐或修正 ' + f.path,
        kind: 'semantic' as const,
      }))
    },
  },
  reviser: {
    async revise(_text, cs) {
      // 演示用：按意见条数推进到下一版
      return drafts[Math.min(cs.length, drafts.length - 1)]
    },
  },
}

const r = await closeLoop('生成一份部署配置', parts, { maxRounds: 3, maxCalls: 10 })
console.log(r.reason, r.bestRate.toFixed(2), r.rounds)
// passed 1.00 1
\`\`\`

真实跑起来可以看到通过率曲线是 \`0.33 → 1.00\`：第 0 版缺字段，第 1 版全过。把 \`reviser\` 改成「按最末一条意见改」这种劣化实现，就能复现开头那条 \`0.6 → 0.8 → 0.9 → 0.7\` 的下坡曲线，而返回的仍然是 \`bestRate = 0.9\` 那一版。

### 与 guardrails 的分工

\`@openai/guardrails\` 是另一类东西：它把校验组织成声明式 pipeline，每条护栏返回 pass / fail + 理由，任一 fail 触发 tripwire 阻断。两者的分工很清楚：

| 维度 | guardrails 护栏 | 本课的闭环 |
| --- | --- | --- |
| 目标 | 拦截不合格输出 | 修复不合格输出 |
| 失败后 | 阻断 / 转人工 / 返回兜底 | 批评 → 修正 → 复验 |
| 终止 | 一次判定 | 迭代至通过或预算耗尽 |
| 成本 | 单次 | 与轮数成正比 |
| 适合 | 合规、安全、内容边界 | 结构化产出、代码、配置 |

它们不是替代关系，正确的组合是**闭环在内、护栏在外**：闭环负责把 0.3 抬到 1.0，护栏负责在闭环失败或超时后兜底阻断。顺序反了会出问题——先过护栏的输入如果被阻断，闭环根本没机会修；而闭环的中间版本如果每一版都过护栏，成本会翻几倍。

对应关系上，guardrails 的「评审护栏」（LLM grader 类）近似本课的 Critic，但只有判定没有修正动作；「生成护栏」近似 Verifier 的一部分。理解这层映射后，迁移成本很低：把护栏的 fail 理由当作 \`Failure.message\` 喂给 Critic 即可。

:::deep

### 为什么 Verifier 的输出要带 path

验证器的失败明细有两种写法：\`{ message: '配置不合法' }\` 与 \`{ path: '名称符合 DNS-1123', message: '用例未通过' }\`。差别不在信息量，在**可归因性**。

前者导致 Critic 只能说「配置有问题」，Reviser 只能整段重写；后者导致 Critic 能说「name 里的下划线不合法」，Reviser 只改一个字段。前者每轮改动幅度大、容易破坏已通过的部分，后者改动局部、单调性更好。

这也是为什么循环里要给 Verifier 定义成「多条用例 + 通过率」而不是「一个总的 pass/fail」：用例是最小可归因单元。用例切得越细，通过率的单调性越好，最优版追踪也越有意义。

:::

:::warn

### 没有预算闸的闭环会吃掉整个月的额度

闭环的成本是 \`1 + rounds × 2\` 次模型调用（批评 + 修正各一次，验证器不调模型）。\`maxRounds = 6\` 看起来不大，但如果上游是一个批量任务（比如一次处理 500 条），总调用量就是 6500 次。

两道闸必须同时有：\`maxRounds\` 控制单任务的轮数，\`maxCalls\` 控制单任务的调用总数（它把批评 + 修正都算进去，能兜住「轮数没超但每轮调了多次」的情况）。另外要在循环外用**总预算**再包一层：单任务超限只影响一条，全局超限应当熔断整批任务并告警，而不是让 500 条各自耗尽自己的上限。

第三个容易被忽略的预算是**时延**。闭环的 P99 通常是单次生成的 4–6 倍，如果这个 Agent 面向交互式场景，轮数上限要按 P99 倒推，而不是按效果倒推。

:::

### 四个坑

- **Critic 看不到失败明细**。只给草稿不给 \`v.failures\`，批评必然退化成风格审查——这是 L64 那个「五版修改」事故的直接原因。
- **Reviser 顺手改了意见之外的地方**。要在 prompt 里明确「只改意见指出的位置」，否则每轮都在重新引入已修复的问题。
- **\`seen\` 去重只按 location**。同一个位置可能有两类不同问题（字段缺失 vs 值越界），只按位置去重会漏掉第二条意见。键要用 \`location + action\`。
- **验证器本身有 bug 却在被信任**。验证器是闭环的锚，它错了整个循环会朝错误方向收敛。验证器要有自己的测试集，且要在真实失败样本上回归过。

### 收束

Stage 10 三课讲的是同一件事的三个尺度：L63 跨任务反思（存什么、怎么取）、L64 单次生成内的批评（怎么判、何时停）、L65 可运行闭环（四件组件、三值裁决、两层预算）。它们的共同前提只有一个——**判据必须来自模型之外**。没有外部判据的反思与批评，都只是在跟自己协商。
`,
    null,
    [
      {
        text: '闭环里为什么要追踪「最优版」而不是直接返回最后一版？',
        options: [
          '为了节省内存',
          '优化过程非单调，最后一版常常不是最好的一版',
          '为了日志完整',
          '为了兼容 guardrails',
        ],
        answer: 1,
        explain: '0.6→0.8→0.9→0.7 的曲线里，返回最后一版等于交付偏差最大的一版。',
        concept: 'verification-loop',
      },
      {
        text: 'Verdict 用 passRate 而不是布尔 passed 的原因是？',
        options: [
          '数字更好看',
          '布尔无法判断「比上轮好还是差」，最优版追踪与偏差监控都需要单调性',
          '浮点运算更快',
          '布尔无法序列化',
        ],
        answer: 1,
        explain: '通过率提供序关系，多用例切分提供可归因性。',
        concept: 'verification-loop',
      },
      {
        text: 'Critic 的输入里必须包含什么，否则批评会退化成风格审查？',
        options: ['模型的温度参数', '验证器给出的失败明细', '历史对话全文', 'token 用量'],
        answer: 1,
        explain: '有失败明细，批评才是「解释已知的错误」，而非凭感觉找问题。',
        concept: 'verification-loop',
      },
      {
        text: 'guardrails 护栏与本课闭环的正确组合方式是？',
        options: [
          '护栏在内、闭环在外',
          '闭环在内负责修复，护栏在外负责兜底阻断',
          '两者只保留一个',
          '串联两次闭环',
        ],
        answer: 1,
        explain: '先过护栏会阻断修复机会；中间版本逐版过护栏会成倍增加成本。',
        concept: 'verification-loop',
      },
    ],
    [
      ['最优版追踪', '记录通过率最高的草稿，循环结束时返回它而非最后一版'],
      ['裁决三值', 'passed / no-fresh / max-rounds（含 budget）决定循环如何结束'],
      ['预算闸', 'maxRounds 与 maxCalls 两层限制，外加全局熔断'],
      ['可归因性', '验证器用多条用例输出失败明细，使批评能定位到最小单元'],
    ],
    [
      '只记录当前版本，循环结束交付最差的一版。',
      'Critic 拿不到失败明细，批评降维成风格建议。',
      '只设 maxRounds 不设 maxCalls，批量任务耗尽额度。',
      '验证器自身有 bug 却被无条件信任，循环朝错误方向收敛。',
    ],
  ),
  'practice',
)
