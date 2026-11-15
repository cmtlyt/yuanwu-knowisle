import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L18 = withKind(
  L(
    'L18',
    2,
    '实战：实现 Reflexion 记忆回路（失败写进持久化记忆）',
    3,
    ['L17', 'L13'],
    ['reflexion-memory'],
    [
      '用 TS 实现「尝试 → 评估 → 反思 → 持久化 → 重试」的完整回路',
      '实现原子落盘、按任务分桶、条数上限与去重的记忆存储',
      '用假 client + 假评估器写出确定性用例：只反思一次、成功后不再重试',
      '认清四个边界：评估噪声、检索漏召、反思冲突、重试成本',
    ],
    `
### 需求：四个不变量，比代码本身更重要

L17 讲了闭环的形状，这一节把它写成能跑、能重启、能长期积累的代码。先钉四条不变量——
Reflexion 在生产里出问题，基本都是其中某一条被违反：

1. **只有评估失败才反思**。成功也反思会污染记忆：模型会为「已经对的路径」编出改进建议，下一轮
   反而改坏。
2. **反思必须落盘、且按任务分桶**。只放内存，进程重启就退回「单次重试」；不分桶，代码任务的
   教训会被注入到写报告的任务里。
3. **注入是「一次性提示」，不是累积**。每次尝试只取最近 K 条（3–5 条），否则上下文会被历史教训
   淹没——这是长期运行最容易失控的地方。
4. **重试有上限，且同一反思不重复触发**。如果上一轮反思产生的改动没有改变失败原因，再试一次
   只会得到同一条反思——检测到「连续两轮反思高度相似」就该停，而不是烧完重试预算。

### 接口：三个小接口，撑起整个回路

\`\`\` title="types.ts：回路只依赖这四个类型" note="evaluate 是外部注入的——这是 L17 的结论落到代码上的样子：反思方向由外部判定决定。"
export interface Reflection {
  /** 任务类型（分桶键），如 'research' / 'code-patch'，不是完整任务描述 */
  taskKind: string
  /** 失败现象（来自评估，不是模型自述） */
  symptom: string
  /** 提炼出的可执行经验 */
  insight: string
  at: number
  /** 命中计数：被注入后任务成功则 +1，用于淘汰 */
  hits: number
}

export type Evaluate = (result: string) => Promise<{ ok: boolean; reason: string }>
export type RunTask = (task: string, lessons: Reflection[]) => Promise<string>

export interface Options {
  maxTries?: number
  /** 每次注入的记忆条数上限 */
  recall?: number
}
\`\`\`

### 第一步：存储要原子、要分桶、要有上限

记忆落盘最常见的故障不是「写不进去」，而是**写到一半崩溃留下半截 JSON**，下次启动 \`JSON.parse\`
抛错、整库作废。所以写盘必须走「临时文件 + rename」，rename 在同一文件系统上是原子的。

\`\`\` title="memory.ts：原子写 + 分桶 + 上限 + 去重" note="rename 是原子操作，所以要么是旧文件、要么是新文件，不会出现半截 JSON。"
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Reflection } from './types'

const PER_BUCKET = 20

export class MemoryStore {
  private items: Reflection[] = []
  private dirty = false
  constructor(private file: string) {}

  async load(): Promise<void> {
    try {
      this.items = JSON.parse(await readFile(this.file, 'utf8')) as Reflection[]
    } catch {
      // 文件不存在或损坏：从空库开始，不让启动失败
      this.items = []
    }
  }

  /** 注入用：只取该桶最近 N 条，按命中数降序（有效经验优先） */
  recall(taskKind: string, limit = 3): Reflection[] {
    return this.items
      .filter((r) => r.taskKind === taskKind)
      .sort((a, b) => b.hits - a.hits || b.at - a.at)
      .slice(0, limit)
  }

  async add(r: Reflection): Promise<'added' | 'duplicate'> {
    // 同一桶里文本高度重合的不重复存：重复反思是上下文噪声的主要来源
    const bucket = this.items.filter((x) => x.taskKind === r.taskKind)
    if (bucket.some((x) => x.insight.trim() === r.insight.trim())) return 'duplicate'
    this.items.push(r)
    // 每桶只留最近 PER_BUCKET 条，防止无限增长
    const keep = this.items.filter((x) => x.taskKind === r.taskKind).slice(-PER_BUCKET)
    const others = this.items.filter((x) => x.taskKind !== r.taskKind)
    this.items = [...others, ...keep]
    await this.flush()
    return 'added'
  }

  /** 任务成功后给注入过的经验加分，用于淘汰 */
  async reward(used: Reflection[]): Promise<void> {
    for (const u of used) {
      const hit = this.items.find((x) => x.at === u.at && x.insight === u.insight)
      if (hit) hit.hits += 1
    }
    await this.flush()
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const tmp = this.file + '.tmp'
    await writeFile(tmp, JSON.stringify(this.items, null, 2), 'utf8')
    await rename(tmp, this.file)
  }
}
\`\`\`

三个设计点值得单独说：

- **\`recall\` 按命中数排序而不是时间**。新经验不一定更好用；被验证过「注入后任务成功」的经验
  才值得反复注入。\`hits\` 是这套机制里唯一的学习信号，没有它，记忆只是一堆只会增长的文本。
- **\`add\` 返回 \`'duplicate'\`**。调用方拿到这个返回值就知道「这次反思没有新信息」，可以据此提前
  终止重试——比烧完 \`maxTries\` 更省。
- **\`!==\` 精确去重只是下限**。真实系统会用归一化文本或向量相似度（L49），但即使是精确去重，
  也能挡掉「模型把同一条教训换个说法」的一大半重复。

### 第二步：主循环——把「评估」和「反思」严格分开

\`\`\` title="loop.ts：失败才反思，反思注入 system 末尾" note="注意 lessons 拼在 system 的末尾并带固定标题——放 user 里会被模型当成新的用户要求（L13 的观测注入同理）。"
import type { Evaluate, Options, Reflection, RunTask } from './types'
import { MemoryStore } from './memory'
import type { LlmClient } from './llm'

export async function reflexionLoop(
  client: LlmClient,
  memory: MemoryStore,
  opts: { task: string; taskKind: string; run: RunTask; evaluate: Evaluate } & Options,
): Promise<{ result: string; tries: number; reflection?: Reflection }> {
  const maxTries = opts.maxTries ?? 3
  const lastInsight: string[] = []

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const lessons = memory.recall(opts.taskKind, opts.recall ?? 3)
    const result = await opts.run(opts.task, lessons)

    // ① 外部评估：成败由 evaluate 决定，模型无权宣称完成
    const verdict = await opts.evaluate(result)
    if (verdict.ok) {
      await memory.reward(lessons)
      return { result, tries: attempt }
    }
    if (attempt === maxTries) break

    // ② 反思：三段式 prompt，逼它给出「具体改动」而不是复述
    const insight = (
      await client.chat([
        { role: 'system', content: REFLECTOR_SYSTEM },
        {
          role: 'user',
          content:
            '任务：' + opts.task + '\\n失败原因（外部评估给出）：' + verdict.reason +
            '\\n本次产出摘要：' + result.slice(0, 1200),
        },
      ])
    ).trim()

    // ③ 同一反思连续出现 → 说明改动没生效，提前收手
    if (lastInsight.some((s) => similar(s, insight))) {
      return { result, tries: attempt }
    }
    lastInsight.push(insight)

    const saved = await memory.add({
      taskKind: opts.taskKind,
      symptom: verdict.reason,
      insight,
      at: Date.now(),
      hits: 0,
    })
    if (saved === 'duplicate') return { result, tries: attempt }
  }

  // 走到这里说明重试预算用完：返回最后一次产出，让上层决定降级策略
  const final = await opts.run(opts.task, memory.recall(opts.taskKind, opts.recall ?? 3))
  return { result: final, tries: maxTries }
}

/** 粗相似：归一化后字符级 Jaccard，够用来识别「换了说法的同一条」 */
function similar(a: string, b: string): boolean {
  const grams = (s: string) =>
    new Set(Array.from({ length: Math.max(1, s.length - 1) }, (_, i) => s.slice(i, i + 2)))
  const A = grams(a.replace(/\\s+/g, ''))
  const B = grams(b.replace(/\\s+/g, ''))
  const inter = [...A].filter((g) => B.has(g)).length
  return inter / Math.max(1, Math.max(A.size, B.size)) > 0.6
}
\`\`\`

\`REFLECTOR_SYSTEM\` 的内容决定了反思质量，值得单独给一份：

\`\`\` title="反思 prompt：强制「现象 / 根因 / 下次改动」三段" note="不加这段结构化约束，模型八成会写「我应该更仔细地检查」——这类反思注入后毫无作用。"
export const REFLECTOR_SYSTEM = [
  '你是失败分析者。基于「失败原因」与「本次产出」，写一条能直接指导下一次尝试的经验。',
  '必须包含三段，总长不超过 80 字：',
  '现象：这次具体错在哪（引用产出里的证据）',
  '根因：为什么会出现这个现象（指向可改的东西：参数、步骤、工具选择、校验）',
  '下次改动：下一轮要做的**具体动作**（改哪一步、加什么检查、换哪个工具）',
  '禁止：归因于「模型能力」「信息不足」「要更仔细」——这些没有行动含义。',
].join('\\n')
\`\`\`

### 第三步：跑起来验证——假评估器 + 假 client

Reflexion 的测试难点是「失败」不好造。解法是把 \`evaluate\` 做成注入的：第一次返回失败、
第二次返回成功，就能精确断言「反思发生了一次、记忆落盘了、成功后不再重试」。

\`\`\` title="loop.test.ts：两次尝试的确定性用例" note="评估器是假的，这正是重点——回路本身不依赖任何真实模型就能测。"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryStore } from './memory'
import { reflexionLoop } from './loop'

test('失败一次 → 反思落盘 → 第二次成功且不再反思', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'refl-'))
  const memory = new MemoryStore(join(dir, 'reflections.json'))
  await memory.load()

  let evaluated = 0
  const evaluatedResults: string[] = []
  const injected: number[] = []
  let reflected = 0

  const out = await reflexionLoop(
    { chat: async () => { reflected++; return '现象：漏了同比\\n根因：只查快照\\n下次改动：查询时带日期范围' } },
    memory,
    {
      task: '写一份营收分析',
      taskKind: 'report',
      run: async (_task, lessons) => {
        injected.push(lessons.length)
        return lessons.length > 0 ? '含同比的分析' : '只有快照'
      },
      evaluate: async (result) => {
        evaluated++
        evaluatedResults.push(result)
        return result.includes('同比')
          ? { ok: true, reason: '' }
          : { ok: false, reason: '缺少同比数据' }
      },
    },
  )

  assert.equal(out.tries, 2)
  assert.equal(evaluated, 2)
  assert.equal(reflected, 1, '只应反思一次（成功后不再反思）')
  assert.deepEqual(injected, [0, 1], '第二次尝试应注入 1 条经验')
  assert.equal(memory.recall('report').length, 1)
  assert.ok(memory.recall('report')[0].insight.includes('日期范围'))
})

test('同一反思重复出现时提前收手，不烧完重试预算', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'refl-'))
  const memory = new MemoryStore(join(dir, 'reflections.json'))
  await memory.load()

  const out = await reflexionLoop(
    { chat: async () => '现象：同一条\\n根因：同一个\\n下次改动：同一个动作' },
    memory,
    {
      task: 'x',
      taskKind: 'report',
      maxTries: 5,
      run: async () => '一直错',
      evaluate: async () => ({ ok: false, reason: '还是错' }),
    },
  )

  assert.ok(out.tries < 5, '应提前终止而不是跑满 5 次')
})
\`\`\`

第二个用例才是这套实现真正的价值：**没有它，一个「永远失败」的任务会消耗完整重试预算，而每轮都在
写同一条反思**。真实系统里这类浪费很常见——重试预算看起来只花了 3 次，但如果每次尝试内部还有
10 步 ReAct，成本是 30 次调用。

:::deep

### 框架对照：LangGraph 的 checkpoint 与自检节点

LangGraph 把这条回路建模成图：\`act 节点 → evaluate 节点 → 条件边（失败走 reflect，成功走 end）
→ reflect 节点写 state → 回到 act\`。它的 \`checkpoint\` 会在每个 super-step 存档图状态，
带 \`thread_id\` 可按会话恢复，甚至能「时间旅行」回退到某一步重跑。

两者容易混淆的地方在于：**checkpoint 存的是「流程状态」，\`MemoryStore\` 存的是「经验」**。
前者用于「进程挂了还能接着跑」，后者用于「下次遇到同类任务别再犯」。它们可以同时存在——
LangGraph 里把经验写进 \`state.memories\`（会被 checkpoint 持久化），就是一种合流做法。

对齐点只有一个：**隔离粒度**。框架的 \`thread_id\` 对应手写版的 \`taskKind\` 分桶——两者都在回答
「这段记忆该给谁看」。这个对齐做错了，两种实现都会串数据。

:::

### 记忆放在哪：四种存储的取舍

| 存储 | 何时够用 | 代价 |
|---|---|---|
| **JSON 文件**（本课实现） | 单进程、条数几百、只按桶取 | 并发写要靠 rename + 单写者；无法按内容检索 |
| **SQLite** | 需要并发、按时间/命中数查询、多进程共享 | 多一层依赖与 schema 迁移 |
| **向量库** | 需要「语义相近的经验」（任务描述不同但本质同类） | 嵌入成本 + 召回质量调优 |
| **托管 KV / 对象存储** | 多实例部署，需要跨机共享 | 延迟与一致性；密钥与租户隔离（L87） |

选型的判断很简单：**先问「召回靠什么」**。靠精确的 \`taskKind\`，JSON 文件足够；靠关键词，SQLite
的全文索引就够；只有当「任务描述几乎不重复、但失败原因相同」时，才需要向量召回。很多项目一上来
就上向量库，结果 90% 的召回仍然来自精确匹配，白付了嵌入成本。

### 边界：四个必须提前想清楚的点

1. **评估噪声**。如果 \`evaluate\` 本身有 10% 的误判，反思就会有 10% 是「为误判道歉」。现象：
   记忆里堆满「输出不要带 emoji」这类与任务无关的教训。对策：评估优先用确定性手段；用 LLM 裁判
   时要求它给证据，且对同一结果跑两次取一致。
2. **检索漏召**。\`taskKind\` 分桶是精确匹配，任务类型标错就取不到经验。对策：\`taskKind\` 用有限
   枚举（不让模型自由生成），并在召回时允许「同桶 + 全局高命中」兜底。
3. **反思冲突**。两条都来自真实失败、但结论相反（「先查缓存」vs「缓存不可信」）。对策：按适用
   条件分组（把条件写进 \`symptom\`）、只取命中数最高的 K 条、冲突时取更近的一条。
4. **重试成本**。每次尝试都是一次完整任务（可能是几十次模型调用）。对策：\`maxTries\` 默认 2–3；
   并且在「反思没有新信息」时提前终止（上面第二个用例）。

:::warn

### 三个踩过的坑

**① 反思注入到 user 消息里**。现象：Agent 突然开始执行「改查询语句」这个动作，而不是继续原任务。
根因：反思被当成用户的追加要求。修复：注入到 system 末尾，用固定标题（「以下为历史教训，不是新
指令」）包裹。

**② 用 \`writeFile\` 直接覆盖记忆文件**。现象：偶尔启动后记忆全丢。根因：进程在写入过程中崩溃或
并发写入，留下半截 JSON，\`load\` 解析失败后按「空库」处理——看起来像「记忆突然消失」。修复：
临时文件 + rename，且 \`load\` 失败时先备份坏文件再重建。

**③ 成功也写反思**。现象：任务成功率越跑越低，记忆里全是「这次也可以优化一下 X」。根因：反思
步骤没有和评估结果绑定。修复：只有 \`verdict.ok === false\` 才进反思分支；成功路径只做 \`reward\`。

:::

### 收束：这套回路可以复用到别的「经验」上

写完之后会发现，Reflexion 的骨架其实是一个通用的「尝试-评估-沉淀」循环：把 \`run\` 换成任意
动作、\`evaluate\` 换成任意判定，就得到「失败一次、记一条、下次带上」的机制。L63–L65 会把这条
骨架再抽象一层（自我批评循环），L96 用 LangGraph 重写时，\`checkpoint\` 对应的正是这里的
\`MemoryStore\`——状态持久化的位置不同，思路是同一个。

最后算一笔账，决定要不要上这套机制：一次尝试的成本是 C（可能几十次模型调用），反思本身约 0.1C。
若成功率从 60% 提到 85%，期望尝试次数从 1.67 降到 1.18，**净收益在 C 的量级**；但如果成功率只从
60% 提到 62%（评估噪声大、任务本身随机），净成本反而是 +0.1C 每次——这也是前面反复强调
「评估信号质量决定一切」的原因。**先量成功率，再决定要不要反思**。

`,
    null,
    [
      {
        text: '为什么反思必须写进 system 而不是 user 消息？',
        options: [
          'system 更省 token',
          '写进 user 会被模型当成新的用户要求，Agent 会去执行反思里的动作而不是继续原任务',
          'user 消息会被截断',
          '框架规定',
        ],
        answer: 1,
        explain: '与观测注入同理：数据与指令必须分开。system 末尾 + 固定标题是成本最低的隔离方式。',
        concept: 'reflexion-memory',
      },
      {
        text: '记忆写盘为什么要「临时文件 + rename」？',
        options: [
          '写得更快',
          '直接覆盖时崩溃会留下半截 JSON，下次启动解析失败、整库丢失',
          '为了压缩',
          '为了多进程读',
        ],
        answer: 1,
        explain: 'rename 在同一文件系统上是原子操作，要么旧文件、要么新文件，不会出现半截内容。',
        concept: 'reflexion-memory',
      },
      {
        text: '`recall` 按命中数（hits）排序而不是按时间，理由是什么？',
        options: [
          '时间戳不可靠',
          '被验证过「注入后任务成功」的经验更值得反复注入，hits 是这套机制里唯一的学习信号',
          '排序更快',
          '为了省内存',
        ],
        answer: 1,
        explain: '新经验不等于好经验；没有 hits，记忆只是一堆只会增长的文本。',
        concept: 'reflexion-memory',
      },
      {
        text: '检测到「连续两轮反思高度相似」时应该怎么做？',
        options: [
          '继续重试直到预算用完',
          '提前终止——说明改动没生效，再试只会得到同一条反思',
          '换更大的模型',
          '把反思写得更长',
        ],
        answer: 1,
        explain: '每次尝试都是一次完整任务，反复烧预算换同一条反思是最常见的浪费。',
        concept: 'reflexion-memory',
      },
    ],
    [
      ['原子落盘', '写临时文件再 rename，避免崩溃留下半截 JSON 导致整库丢失'],
      ['记忆分桶', '按 taskKind 精确分区，防止代码任务的教训污染报告任务'],
      ['命中计数', '经验被注入后任务成功则加分，作为召回排序与淘汰的唯一学习信号'],
      ['反思三段式', '现象 / 根因 / 下次改动，强制反思指向具体动作'],
      ['提前收手', '连续两轮反思相似或反思重复入库时终止重试，而不是烧完预算'],
    ],
    [
      '把反思注入到 user 消息：模型把它当新要求，转去执行反思里的动作。',
      '直接 writeFile 覆盖记忆文件：崩溃留半截 JSON，下次启动整库丢失。',
      '成功也写反思：记忆里堆满「还可以优化 X」，成功率越跑越低。',
      '反思入库不做去重：同一教训换个说法存十几条，把真正相关的经验挤出召回窗口。',
    ],
  ),
  'practice',
)
