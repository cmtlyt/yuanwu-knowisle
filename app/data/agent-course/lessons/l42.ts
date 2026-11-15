import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 5 ========== */

export const L42 = withKind(
  L(
    'L42',
    5,
    '实战：不依赖框架实现 Function Calling 运行时',
    3,
    ['L39', 'L41'],
    ['fc-runtime'],
    [
      '把工具注册表、协议适配、并行执行、边界检查组装成完整运行时',
      '用适配器隔离 provider 差异，使换模型不改业务代码',
      '写出覆盖「未命中工具 / 参数非法 / 部分失败」的验收断言',
    ],
    `
### 先把「框架替你做了什么」列出来

L36 写了运行时骨架，L38 讲了协议，L39 讲了 schema，L40 讲了边界，L41 讲了并行。现在要把它们组装起来——而组装之前，值得先列一张清单：**一个 Function Calling 框架到底替你做了什么**。

| 职责 | 框架里的名字 | 你手写要做什么 |
|---|---|---|
| 工具注册 | \`tool()\` / \`defineTool\` | 一个 Map + 类型定义 |
| schema → 声明 | 自动转换 | 手写 JSON Schema（L39） |
| provider 适配 | 内置多模型支持 | 适配器接口 + 各 provider 的字段映射 |
| 调用循环 | \`maxSteps\` 循环 | L36 的主循环 |
| 参数校验 | 常带 zod | 运行时校验函数 |
| 并行与部分失败 | 有的支持、有的没有 | L41 的并发池 |
| 边界（权限/超时） | 基本不管 | L40 的 guard |

最后一行是关键：**框架几乎都不管安全边界**。它们擅长「让调用跑通」，不擅长「让调用别乱跑」。所以手写一遍的价值不只是「理解框架」，而是拿到一个能自己加边界的位置。

### 三个模块，一条边界

整套实现分三层，边界很清楚：

\`\`\`
provider adapter   ← 只管「怎么和某家模型说话」
runtime loop       ← 只管「一轮怎么走」
tool layer         ← 只管「工具怎么定义与执行」
\`\`\`

换 provider 只动第一层，加工具只动第三层，改循环策略只动第二层。这条分层的收益在真实项目里很直接：绝大多数「换模型」的需求，最后都变成改一个适配器文件。

### 工具层：注册表 + 校验

工具定义要同时承载三样东西：给模型看的 schema、给执行用的函数、给安全用的元数据。

\`\`\`ts title="tool layer：一份定义，三个消费者" note="schema 给模型，run 给执行，risk/timeout 给边界——三者写在同一个对象里，避免「声明与实现脱节」。"
export type Risk = 'read' | 'write' | 'destructive'

export interface ToolDef<A = Record<string, unknown>> {
  name: string
  description: string
  schema: {
    type: 'object'
    properties: Record<string, { type: string; description?: string; enum?: string[] }>
    required?: string[]
  }
  risk: Risk
  timeoutMs?: number
  run: (args: A, ctx: { signal: AbortSignal; userId: string }) => Promise<unknown>
}

export class ToolRegistry {
  private map = new Map<string, ToolDef>()

  add(def: ToolDef) {
    if (this.map.has(def.name)) throw new Error('工具重名：' + def.name)
    this.map.set(def.name, def as ToolDef)
    return this
  }

  get(name: string) {
    return this.map.get(name)
  }

  /** 转成 provider 需要的 tools 数组（OpenAI 风格） */
  toSpec() {
    return [...this.map.values()].map((d) => ({
      type: 'function' as const,
      function: { name: d.name, description: d.description, parameters: d.schema },
    }))
  }
}

/** 运行时校验：schema 只影响生成倾向，不提供保证（L39） */
export function validateArgs(
  def: ToolDef,
  args: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  const missing = (def.schema.required ?? []).filter((k) => args[k] === undefined || args[k] === '')
  if (missing.length) return { ok: false, error: '缺少必填参数：' + missing.join(', ') }

  for (const [key, spec] of Object.entries(def.schema.properties)) {
    const v = args[key]
    if (v === undefined) continue
    if (spec.enum && !spec.enum.includes(String(v))) {
      return { ok: false, error: \`参数 \${key} 只能是 \${spec.enum.join(' / ')}\` }
    }
    if (spec.type === 'number' && typeof v !== 'number') {
      return { ok: false, error: \`参数 \${key} 必须是数字\` }
    }
    if (spec.type === 'string' && typeof v !== 'string') {
      return { ok: false, error: \`参数 \${key} 必须是字符串\` }
    }
  }
  return { ok: true }
}
\`\`\`

\`add\` 里的重名检查不是洁癖：工具重名时后注册的会覆盖先注册的，而模型仍然按旧 schema 填参数，症状是「参数莫名不匹配」。让它在启动时就炸，比线上排查便宜得多。

### 适配层：把 provider 差异吃掉

不同 provider 的字段名有差异（\`tool_calls\` vs \`function_call\`、\`tool_call_id\` vs \`id\`），适配器负责统一成内部结构。

\`\`\`ts title="adapter：内部只认一种形状" note="适配器不做业务判断，只做形状转换——这条约束让它容易测、也容易加新 provider。"
export interface ModelMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  toolCalls?: { id: string; name: string; args: string }[]
  toolCallId?: string
}

export interface ChatResult {
  text: string | null
  toolCalls: { id: string; name: string; args: string }[]
  finishReason: 'stop' | 'tool_calls' | 'length'
  tokens: number
}

export interface Provider {
  chat(input: { messages: ModelMsg[]; tools: unknown[] }): Promise<ChatResult>
}
\`\`\`

这个接口只有三个字段是必须的：\`text\`、\`toolCalls\`、\`finishReason\`。所有 provider 都能映射到它，而运行时只依赖它——这就是「换模型改一个文件」的全部秘密。

### 主循环：只读并行、写串行

把 L36 的循环、L41 的并发池、L40 的边界拼在一起，得到最终形态：

\`\`\`ts title="fc-runtime：一轮的完整处理" note="注意 reads 并行、writes 串行的分支——这是 L41 的结论落地。"
export async function step(
  msgs: ModelMsg[],
  provider: Provider,
  registry: ToolRegistry,
  ctx: { signal: AbortSignal; userId: string; env: 'dev' | 'prod'; approved: Set<string>; writesLeft: number },
): Promise<{ done: boolean; msgs: ModelMsg[]; tokens: number }> {
  const res = await provider.chat({ messages: msgs, tools: registry.toSpec() })
  const next: ModelMsg[] = [...msgs, { role: 'assistant', content: res.text, toolCalls: res.toolCalls }]

  if (res.finishReason !== 'tool_calls' || res.toolCalls.length === 0) {
    return { done: true, msgs: next, tokens: res.tokens }
  }

  const reads = res.toolCalls.filter((c) => registry.get(c.name)?.risk === 'read')
  const writes = res.toolCalls.filter((c) => registry.get(c.name)?.risk !== 'read')

  const runOne = async (c: { id: string; name: string; args: string }) => {
    const def = registry.get(c.name)
    if (!def) return { id: c.id, text: \`ERROR 未知工具 \${c.name}\` }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(c.args || '{}')
    } catch {
      return { id: c.id, text: 'ERROR 参数不是合法 JSON' }
    }

    const v = validateArgs(def, parsed)
    if (!v.ok) return { id: c.id, text: 'ERROR ' + v.error }

    if (def.risk === 'destructive' && ctx.env === 'prod' && !ctx.approved.has(c.name)) {
      return { id: c.id, text: 'ERROR 需要人工确认：' + c.name }
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), def.timeoutMs ?? 10_000)
    try {
      const data = await def.run(parsed, { signal: ctrl.signal, userId: ctx.userId })
      return { id: c.id, text: 'OK\\n' + JSON.stringify(data) }
    } catch (e) {
      return { id: c.id, text: 'ERROR ' + (e as Error).message }
    } finally {
      clearTimeout(timer)
    }
  }

  // 只读并行（并发上限 4），写操作按顺序串行
  const readOut = await Promise.all(reads.map(runOne))
  const writeOut: { id: string; text: string }[] = []
  for (const w of writes) {
    if (ctx.writesLeft <= 0) {
      writeOut.push({ id: w.id, text: 'ERROR 写操作配额已用尽' })
      continue
    }
    ctx.writesLeft -= 1
    writeOut.push(await runOne(w))
  }

  const byId = new Map([...readOut, ...writeOut].map((r) => [r.id, r.text]))
  for (const c of res.toolCalls) {
    next.push({ role: 'tool', content: byId.get(c.id) ?? 'ERROR 结果缺失', toolCallId: c.id })
  }
  return { done: false, msgs: next, tokens: res.tokens }
}
\`\`\`

两个细节容易忽略：

**结果回填按 \`res.toolCalls\` 的原始顺序，而不是完成顺序。** 因为 \`Promise.all\` 的结果虽然有序，但读写分两组跑完后，你需要一个 \`byId\` 映射重新对齐。直接按执行顺序 push，会让模型收到顺序错乱的结果。

**\`writesLeft\` 在循环里递减，不在 \`runOne\` 里。** 因为写操作是串行的，递减点放在「串行循环」这一层，配额才不会被并发穿透。

### 验收断言：四条覆盖协议层

协议层的测试与业务无关，四条断言就能钉住主要失效模式：

| # | 构造 | 期望 |
|---|---|---|
| 1 | 模型返回未声明的工具名 | 回填 \`ERROR 未知工具\`，循环继续 |
| 2 | 模型返回 \`{"limit":"ten"}\`（类型错） | 回填「必须是数字」，不执行 |
| 3 | 两个只读调用，一个抛错 | 另一个仍返回 OK，两条 tool 消息都在 |
| 4 | 两个写调用，配额剩 1 | 一条成功、一条「配额已用尽」 |

\`\`\`ts title="用假 provider 做协议断言" note="假 provider 只返回预设的 toolCalls，不需要真实模型——这让协议测试变成纯单元测试。"
const registry = new ToolRegistry()
  .add({
    name: 'ok',
    description: 'always ok',
    schema: { type: 'object', properties: {} },
    risk: 'read',
    run: async () => ({ v: 1 }),
  })
  .add({
    name: 'boom',
    description: 'always throws',
    schema: { type: 'object', properties: {} },
    risk: 'read',
    run: async () => {
      throw new Error('炸了')
    },
  })

const fake = (calls: { id: string; name: string; args: string }[]): Provider => ({
  chat: async () => ({ text: null, toolCalls: calls, finishReason: 'tool_calls', tokens: 5 }),
})

const ctx = { signal: new AbortController().signal, userId: 'u1', env: 'dev' as const, approved: new Set<string>(), writesLeft: 10 }

// 断言 3：部分失败不影响另一个
const r = await step([{ role: 'user', content: 'go' }], fake([
  { id: '1', name: 'ok', args: '{}' },
  { id: '2', name: 'boom', args: '{}' },
]), registry, ctx)

const tools = r.msgs.filter((m) => m.role === 'tool')
console.assert(tools.length === 2, '两个工具结果都要回填')
console.assert(tools[0]!.content!.startsWith('OK'), '成功的仍然成功')
console.assert(tools[1]!.content!.startsWith('ERROR'), '失败的标注失败')
\`\`\`

第三条断言是这套实现的核心价值：**部分失败不影响其余结果**。如果用 \`Promise.all\` 写，这条断言会在第一个 \`boom\` 处抛错，整个 \`step\` 失败——而正确行为是「模型看到一成一败，自己决定下一步」。

### 加流式要动哪一层

手写实现的一个隐性好处是：加流式（L37）时你清楚知道该改哪里。

按上面的分层，流式只影响两处：**适配层**多一个 \`chatStream\` 方法（把 provider 的回调转成 \`AsyncGenerator\`），**主循环**把「等结果」换成「边收边透出、结束后再推进」。工具层完全不动——工具只关心「参数进来、结果出去」。

换成框架时这件事会变复杂：框架可能把流式与工具循环耦合成一个 \`streamEvents\` API，你需要用它定义的事件类型来重写整段逻辑。功能没有变多，但你对「哪一层在做什么」的掌控变弱了。

这不是说框架不好，而是说**分层的价值在扩展时才显现**：能指出「改一个文件」和「改一整段」的区别，就是分层的回报。

### 加一条可观测性钩子也只要一个函数

生产环境一定会需要「这次任务调了几次工具、每次多久、失败率多少」。手写实现里，这只是个包装函数：

\`\`\`ts
export function withMeter<T extends (...a: never[]) => Promise<unknown>>(name: string, fn: T): T {
  return (async (...args: never[]) => {
    const t0 = performance.now()
    try {
      const out = await fn(...args)
      metrics.record(name, { ok: true, ms: performance.now() - t0 })
      return out
    } catch (e) {
      metrics.record(name, { ok: false, ms: performance.now() - t0 })
      throw e
    }
  }) as T
}
\`\`\`

把它套在 \`runOne\` 上，就得到了「按工具维度的成功率与耗时分布」——这正是 L72 里那套可观测性体系的最小内核。框架通常也有类似能力，但往往绑定它自己的事件模型，导出到你现有的监控体系需要额外适配。

:::deep

### 什么时候该换成框架

手写这套大约 200 行。什么时候值得换成 LangGraph / Agents SDK？

**该换的信号：**

- 需要「持久化执行」——进程崩溃后从断点恢复。手写要自己做 checkpoint 与状态序列化，框架有现成机制。
- 需要「人在回路」——挂起等审批再继续。这与持久化是同一套基础设施。
- 需要「多 Agent 编排」——子图、并行分支、条件路由。手写会迅速变成状态机地狱。
- 团队多人协作，需要统一的抽象与文档。

**不该换的信号：**

- 只是「调几个工具、跑几轮」。手写 200 行比引入依赖更省心。
- 需要精细控制边界（权限、配额、审计）。框架的钩子往往不够细，你还是要绕开它。
- 需要极致控制成本（自定义上下文裁剪、缓存策略）。框架的默认行为可能正好与你的预算冲突。

一个务实的路径是：**先手写跑通，等到「持久化 / 人在回路 / 多 Agent」三个需求中出现第一个时再换**。那时你已经知道自己需要什么，选框架也有了判据——而不是被「生态热闹」推着走。

:::

:::warn

### 手写实现最容易漏的三件事

**第一，\`tool_call_id\` 的唯一性。** 有些 provider 在并行调用时复用 id，或干脆不返回。回填时按 id 对不上，模型就会收到「结果缺失」。防御：id 缺失时按 index 生成稳定的伪 id，并在日志里标注。

**第二，空内容的 assistant 消息。** 只调工具、不输出文本时，\`content\` 是 \`null\`。有些实现会把它写成空字符串 \`''\`，而某些 provider 会拒绝「content 为空的 assistant 消息」。保留 \`null\` 更安全。

**第三，\`finish_reason\` 与 \`tool_calls\` 不一致的兜底。** 有时 \`finish_reason='stop'\` 但 \`tool_calls\` 非空（部分 provider 的边界行为）。此时应以 \`tool_calls\` 非空为准——否则工具永远不被执行。

:::

### 收束：运行时是「协议 + 边界」的组合

这一节把所有零件拼在了一起，而拼装后你会发现：真正让运行时可靠的，不是「调通了模型」，而是那些**看起来不像功能的功能**——参数校验、部分失败、写串行、超时兜底、配额递减。

它们都不产生「demo 效果」，但决定了「能不能上线」。

L43 换一个视角：当工具不再由你实现，而是由别人提供时，上面这套「schema + 执行 + 边界」怎么标准化。那就是 MCP 要解决的问题。

`,
    null,
    [
      {
        text: '适配层（Provider 接口）的价值是？',
        options: [
          '性能更好',
          '把 provider 字段差异统一成内部形状，换模型只改一个文件',
          '减少 token',
          '自动重试',
        ],
        answer: 1,
        explain: '运行时只依赖统一形状，差异被封在适配器里。',
        concept: 'fc-runtime',
      },
      {
        text: '工具注册表里检查重名，主要是为了避免？',
        options: [
          '内存浪费',
          '后注册覆盖先注册，模型按旧 schema 填参导致「参数莫名不匹配」',
          '类型冲突',
          '日志重复',
        ],
        answer: 1,
        explain: '启动即炸，比线上排查便宜。',
        concept: 'fc-runtime',
      },
      {
        text: '为什么只读调用可以并行、写操作要串行？',
        options: ['写的量大', '并行写会造成部分成功语义模糊与回滚失序', '协议限制', '模型不支持'],
        answer: 1,
        explain: 'L41 的结论：只读独立可并行，写要保持顺序可追溯。',
        concept: 'fc-runtime',
      },
      {
        text: '结果回填为什么要按 `res.toolCalls` 原始顺序，而不是执行完成顺序？',
        options: [
          '性能更好',
          '并行完成顺序不可控，错序会让模型收到对不上的结果',
          '减少消息数',
          '符合协议要求',
        ],
        answer: 1,
        explain: '用 byId 重新对齐，保证一一对应。',
        concept: 'fc-runtime',
      },
      {
        text: '什么时候值得从手写切到框架？',
        options: [
          '工具超过 3 个',
          '出现持久化执行 / 人在回路 / 多 Agent 编排需求时',
          '需要日志时',
          '代码超过 500 行时',
        ],
        answer: 1,
        explain: '这三类需求手写成本陡增，框架有现成基础设施。',
        concept: 'fc-runtime',
      },
    ],
    [
      ['适配器', '把 provider 差异转换为内部统一形状的一层'],
      ['工具注册表', '工具定义与执行的唯一入口，承载 schema 与元数据'],
      ['部分失败', '并行中部分成功、部分失败仍需各自回填'],
      ['持久化执行', '崩溃后从检查点恢复的能力，是换框架的主要信号'],
    ],
    [
      'kind 未命中 / 参数非法时抛异常，导致整个任务失败。',
      '结果按完成顺序回填，模型收到错位的工具结果。',
      '把空 content 写成空字符串，被 provider 拒绝。',
    ],
  ),
  'practice',
)
