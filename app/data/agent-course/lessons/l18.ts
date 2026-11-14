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
      '用 TS 实现「尝试→评估→反思→持久化→重试」完整回路',
      '实现记忆的持久化（写文件 / DB）与注入',
      '对照 LangGraph 持久化 checkpoint + 自检节点',
    ],
    `
### 把 L17 的三段循环写成可持久化的代码

记忆如果只存在内存里，进程一重启就丢。Reflexion 的价值在于「长期积累」，所以记忆必须持久化。

\`\`\` title="记忆存储：一个最小持久层" note="真实系统里「相关记忆」要用向量检索（L49），这里先按任务精确匹配，讲清回路本身。"
interface Reflection { task: string; feedback: string; insight: string; ts: number }

class MemoryStore {
  private items: Reflection[] = []
  private file = "./reflections.json"

  async load() {           // 启动时读盘
    try { this.items = JSON.parse(await readFile(this.file, "utf8")) }
    catch { this.items = [] }
  }
  async add(r: Reflection) { this.items.push(r); await this.save() }
  relevant(task: string): Reflection[] {
    return this.items.filter((r) => r.task === task)  // 简版：按任务匹配
  }
  private async save() { await writeFile(this.file, JSON.stringify(this.items, null, 2)) }
}
\`\`\`

\`\`\` title="Reflexion 主循环" note="关键：反思（insight）落盘 → 下一轮 \\\`memory.relevant(task)\\\` 取回 → 注入 runReAct。"
async function reflexionLoop(client: LlmClient, memory: MemoryStore, task: string, maxTries = 3) {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const reflections = await memory.relevant(task)
    const { result, trajectory } = await runReAct(client, task, { reflections })
    const feedback = evaluate(result)
    if (feedback.ok) return result

    const insight = await client.chat([
      { role: "system", content: "你是反思者。根据失败轨迹与反馈，提炼一条可执行的改进建议。" },
      { role: "user", content: \\\`轨迹：\\\${trajectory}\\\\n反馈：\\\${feedback.reason}\\\` },
    ])
    await memory.add({ task, feedback: feedback.reason, insight, ts: Date.now() })
  }
  throw new Error("多次反思后仍未成功")
}
\`\`\`

:::deep

### 框架对照：LangGraph checkpoint + 自检

LangGraph 用 checkpoint 把图状态持久化（可跨进程恢复），Reflexion 对应「一个 evaluate 节点 + 条件边：失败走 reflect 节点写状态、成功走 end」。手写版的「记忆文件」对应它的 checkpoint，你的 \\\`reflect\\\` 步骤对应它的自检节点。

:::

:::warn

### 反思要「可执行」

反思句要能指导下一次行动（如「先查数据源时效」），而不是空泛的「我下次要更认真」。否则注入记忆对改进无帮助，还白占上下文。

:::

`,
    null,
    [
      {
        text: 'Reflexion 的记忆为什么必须持久化？',
        options: ['为了省内存', '价值在长期积累，进程重启不能丢', '框架要求', '为了更快'],
        answer: 1,
        explain: '记忆只在内存里重启即丢；长期积累才体现 Reflexion 价值。',
        concept: 'reflexion-memory',
      },
      {
        text: 'LangGraph 中 Reflexion 的「记忆文件」对应什么？',
        options: ['模型', 'checkpoint（图状态持久化）', '工具', 'prompt'],
        answer: 1,
        explain: 'checkpoint 把图状态持久化，对应手写的记忆文件。',
        concept: 'reflexion-memory',
      },
      {
        text: '一条有效的反思应该是？',
        options: [
          '「我下次要更认真」',
          '「先查数据源时效再下结论」这类可执行的改进',
          '复述错误信息',
          '越短越好',
        ],
        answer: 1,
        explain: '反思要可执行、能指导下次行动，空泛或复述无帮助。',
        concept: 'reflexion-memory',
      },
    ],
    [
      ['持久化记忆', '落盘（文件/DB）保存、重启不丢的反思积累'],
      ['checkpoint', 'LangGraph 中持久化图状态、可跨进程恢复的机制'],
      ['可执行反思', '能指导下一次行动、而非空泛的改进建议'],
    ],
    ['反思写成空话，注入记忆后既不改进又白占上下文。', '记忆只存内存，重启即丢，Reflexion 退化为单次重试。'],
  ),
  'theory',
)
