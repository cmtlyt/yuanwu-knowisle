import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 16 ========== */

export const L95 = withKind(
  L(
    'L95',
    16,
    '版本锁定表回顾 + TS 工程模板（框架无关骨架）',
    2,
    ['L03'],
    ['framework-template'],
    [
      '用四重锁把依赖版本真正钉死，而不是只留一个 lockfile',
      '搭一个核心层零依赖的工程模板，让实现可替换',
      '定义 LlmClient / Tool / AgentRun / Trace 四个核心接口',
      '用脚本化 FakeLlm 隔离模型噪声，先验编排再验质量',
    ],
    `
### 半年后回来跑对照，三个框架装不上了

模块七的对照仓库我们放了一个季度。回来第一件事 \`pnpm install\`，然后直接炸了：

- 两个框架的 peer 依赖互相不兼容（一个要求 SDK 的主版本是 4，另一个是 5）
- CI 的 Node 是 18，本地是 20，某个框架的 \`engines\` 要求 20+，本地装得上、CI 装不上
- 有个框架升了大版本，我们写的适配层 import 路径全变了

我一开始以为是 lockfile 丢了，检查发现它好好的。问题在于 **lockfile 只锁了「上次装到的是什么」，没锁「谁允许装什么」**——\`package.json\` 里写的是 \`^1.2.0\`，\`engines\` 没写，Node 版本靠各自本地的 nvm 状态。所以任何一台机器上的一次 \`pnpm up\`，都能把整个对照实验的底座换掉。

### 版本锁定是四重锁，缺一不可

| 锁 | 锁住什么 | 缺了会怎样 |
|---|---|---|
| lockfile | 精确的依赖树（含传递依赖） | 每次安装都可能有细微漂移，尤其传递依赖 |
| 精确版本 | \`package.json\` 里写死版本，不用 \`^\` / \`~\` | 别人装到新的 minor，行为变了没人知道 |
| 运行时约束 | \`engines\` + \`.nvmrc\` + \`packageManager\` 字段 | 本地能跑 CI 不能跑，peer 校验失败才发现 |
| peer 区间记录 | 每个框架对 SDK / provider 的版本要求 | 换 SDK 版本时才知道两家打架 |

关于第二行要强调一句：**\`^\` 不是锁定**。\`^1.2.0\` 允许升到 \`1.9.x\`，而框架的 minor 版本里经常塞「新增但对已有行为有影响」的改动——它符合 semver 的字面定义（没删 API），但会改变你的通过率。

三处最常见的破口，都跟「顺手」有关：

1. 有人跑了 \`pnpm up\`，或者用 IDE 的一键升级。→ 用 \`--frozen-lockfile\` 在 CI 与本地都挡住。
2. CI 脚本里写 \`npx some-tool@latest\`。→ 连工具也要锁版本，工具的输出会影响结论。
3. \`postinstall\` 脚本从远端拉最新清单。→ 审一遍所有 postinstall，能删就删。

### 版本锁定表：记口径，不背数字

课程正文不写死版本号——写死了必然过期，而过期的版本号比没有更危险（读者会以为那是当前值）。要记的是**口径**：

| 包 | 锁定口径 | 必须记录的信息 | 检查方式 |
|---|---|---|---|
| 编排框架 | 精确版本，禁用 range | 主版本、是否有 breaking 变更说明 | \`pnpm why <pkg>\` + lockfile diff |
| 模型 SDK | 精确版本 | 与框架的 peer 区间是否兼容 | 安装时读 peer 警告 |
| 模型本身 | 带日期的快照 ID | 别名（\`latest\`）一律禁止 | 请求日志里回显 model id |
| 运行时 | \`engines\` + \`.nvmrc\` 双写 | Node 主版本、pnpm 主版本 | CI 与本地各跑一次 \`node -v\` |
| 工具链 | 锁在 devDependencies | 格式化/检查工具的版本也会改输出 | \`--frozen-lockfile\` |

实际项目里，这张表应该落成一个文件（附录 B 的角色），每次升级都在里面追加一行「升级日期 / 从哪个版本到哪个版本 / 改了几处 / 是否读了框架源码」。半年后你不需要重新调研，只需要读这张表。

### 工程模板：骨架统一，实现可换

对照实验的公平性，一半来自「同一份 case」，另一半来自「同一份骨架」。目录结构长这样：

    agent-lab/
      src/
        core/            框架无关：类型 + 接口 + 一个都不许 import 框架
        tools/           共用工具集（唯一来源，所有实现都用它）
        cases/           行为规格 + 评测 case（需求方维护，实现方不看）
        harness/         L94 那套 compare / firstDivergence
        impls/
          handrolled/    手写实现（参照，不提供标准答案）
          langgraph/
          openai-agents/
          mastra/
          ai-sdk/

规矩只有一条：**\`core/\` 与 \`tools/\` 的依赖必须为空。** 一旦某个框架的 import 漏进 core，所有实现就都继承了它，你的对照就退化成「同一个框架的四种用法」。

四个核心接口，是这套骨架的全部内容：

\`\`\`ts title="core/types.ts —— 这一层不许 import 任何框架" note="要点：模型 ID 可读、stream 是 AsyncIterable、Tool 的 run 只依赖 signal。"
export type Role = 'system' | 'user' | 'assistant' | 'tool'
export type Message = { role: Role; content: string }

export type ToolSpec = { name: string; description: string; parameters: unknown }

export type LlmRequest = {
  messages: Message[]
  tools: ToolSpec[]
  temperature?: number
  seed?: number
  signal?: AbortSignal
}

export type LlmChunk =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'done'; usage: { input: number; output: number } }

export interface LlmClient {
  // 形如 'openai:gpt-x-2025-01-01'，版本必须能从这一行读出来
  readonly id: string
  stream(req: LlmRequest): AsyncIterable<LlmChunk>
}

export interface Tool<A = Record<string, unknown>, R = unknown> {
  spec: ToolSpec
  run(args: A, ctx: { signal: AbortSignal }): Promise<R>
}

export type TraceEvent =
  | { kind: 'llm'; name: string; ms: number; tokens: number }
  | { kind: 'tool'; name: string; ms: number; ok: boolean }
  | { kind: 'human'; name: string; ms: number }

export type Trace = TraceEvent[]

export type RunCtx = { signal: AbortSignal; trace: Trace; llm: LlmClient }
export type RunResult = { output: string; steps: number; tokens: number }

export interface AgentRun {
  readonly name: string
  run(input: string, ctx: RunCtx): Promise<RunResult>
}
\`\`\`

几个刻意的选择，都是在防「框架味」渗进来：

- **\`LlmClient.id\` 是字符串而不是枚举**。它必须能被人一眼读出「哪个供应商、哪个快照」，因为报告里要写它。
- **\`stream\` 返回 \`AsyncIterable\`**，不是回调、不是 EventEmitter。这一层统一了，LangGraph 的 node 流、AI SDK 的 \`textStream\`、手写的 for-await 就能接到同一个口子上。
- **\`Tool.run\` 只接收 \`signal\`**。不接收框架的执行上下文对象——那样一换框架，所有工具都要改签名，而工具本来是与框架无关的资产。
- **\`Trace\` 是数组，事件用 \`kind\` 判别**。它是 L94 里 \`firstDivergence\` 的输入类型，也是 L73 那套 span 的最小投影。

### 一个 FakeLlm，把模型噪声先摘掉

搭完骨架，第一件事不是接真实模型，而是造一个脚本化的假模型：

\`\`\`ts title="impls/shared/fake-llm.ts —— 确定性模型，用于验证编排而非质量" note="要点：按脚本逐轮返回、尊重 abort、记录每轮请求便于 diff。"
import type { LlmChunk, LlmClient, LlmRequest } from '../../core/types.ts'

export type FakeOptions = {
  script: LlmChunk[][]
  onRequest?: (req: LlmRequest, turn: number) => void
}

export function fakeLlm({ script, onRequest }: FakeOptions): LlmClient {
  let turn = 0
  return {
    id: 'fake:scripted-v1',
    async *stream(req) {
      onRequest?.(req, turn)          // 把每轮完整请求暴露出来，用于首分歧 diff
      const chunks = script[turn++] ?? [{ type: 'done' as const, usage: { input: 0, output: 0 } }]
      for (const c of chunks) {
        if (req.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        yield c
      }
    },
  }
}

// 用法：先验「会不会按预期顺序调工具」，与模型质量无关
const llm = fakeLlm({
  script: [
    [{ type: 'tool_call', id: 'c1', name: 'get_order', args: { id: 'A1' } }],
    [{ type: 'tool_call', id: 'c2', name: 'refund', args: { id: 'A1' } }],
    [
      { type: 'text', delta: '已退款' },
      { type: 'done', usage: { input: 120, output: 8 } },
    ],
  ],
})
\`\`\`

这个东西的价值在于**把两个问题拆开**：

- 编排对不对（顺序、终止、错误分支）——用 FakeLlm 跑，结果完全确定，失败了一定是代码问题。
- 回答好不好（质量、措辞、边界）——接真实模型跑，此时的差异才归因于模型与提示词。

混在一起跑，一个失败的 case 你永远说不清是「流程写错了」还是「模型这轮发挥差」。L80 讲过「先测 harness 自己」，这里是同一个思路的延伸：先测骨架，再接模型。

:::deep
### 为什么 core 层必须零依赖

一个具体的滑坡：某天你想在 \`Message\` 上带一个 \`toolCalls\` 字段，因为手写实现需要它。于是 \`Message\` 变成 \`{ role, content, toolCalls?: { id, name, args }[] }\` ——这已经是某个特定框架的消息模型了。

再下一步，LangGraph 的适配层发现正好能直接用，于是 \`impls/langgraph\` 里的转换代码消失了，很省事。然后 OpenAI Agents SDK 的适配层发现字段名对不上（它叫 \`tool_calls\` 且是扁平结构），于是加一层映射。

等到你要对比「五家框架各自的消息模型」时，发现你已经在 core 里预埋了其中一家的形状，另外四家都在做妥协。**你的对照从这一刻开始失真，而且你不会有任何报错。**

自检方法很简单，也很快：

- \`core/\` 的 \`package.json\` 里 \`dependencies\` 为空
- 把 \`impls/\` 整个删掉，\`core/\` 仍能 \`tsc --noEmit\` 通过
- 加一条 import 白名单检查：\`core/\` 与 \`tools/\` 下不允许出现 \`@langchain\` / \`@ai-sdk\` / \`mastra\` / \`@openai\` 等字样

第三条用 grep 就够了，放进 CI 只要一行。它拦住的是那种「为了省一点转换代码，把框架漏进核心层」的小便利——这类便利的代价永远在几个月后才结算。
:::

:::warn
### 模板里最容易长出框架味的三处

- **\`Message\` 照抄某框架的消息模型**：一旦带上 \`tool_calls\` 数组、\`function_call\` 字段，你就把某家的形状写进了公共契约。正确做法是保持最小（\`role\` + \`content\`），工具调用放在 \`LlmChunk\` 里表达。
- **\`Tool.run\` 的签名带上框架的执行上下文**：比如 \`run(args, config)\` 里的 \`config\` 是 LangGraph 的 \`RunnableConfig\`。工具是与框架无关的资产，签名里出现框架类型，就意味着换框架时所有工具都要改。
- **trace 事件名用框架的命名**：叫 \`on_chain_start\` 还是 \`onStepStart\` 看似无所谓，但报告里要做跨实现对比时，这些名字就是你的度量口径。用中性的 \`llm\` / \`tool\` / \`human\` 三类，框架自己的事件在适配层翻译过来。

一条总结性的判据：**把 \`impls/\` 目录清空，剩下的东西应该还是一个能编译、能跑 FakeLlm、能跑 harness 的完整工程。** 如果做不到，说明框架已经渗进骨架了。
:::

### 与相邻课的分工

- **L03** 讲过工程基线（TS 工具链、版本锁定的基本做法），本课是它在「多实现对照」场景下的具体化：多了 peer 区间与模型快照两层。
- **L94** 的 harness 依赖本课的四个接口——没有统一契约，\`compare(impls)\` 就无从写起。
- **L96 之后** 每个框架专论都往 \`impls/<framework>/\` 里填一个实现，并在版本锁定表里追加一行。
`,
    null,
    [
      {
        text: '为什么只留 lockfile 不算锁定了版本？',
        options: [
          'lockfile 会过期',
          'lockfile 只锁「上次装到的是什么」，没锁「允许装什么」，一次 up 就能全换掉',
          'lockfile 不记录传递依赖',
          'lockfile 只在 CI 生效',
        ],
        answer: 1,
        explain: '还需要 package.json 精确版本、engines/运行时约束、peer 区间记录，四重锁缺一不可。',
        concept: 'framework-template',
      },
      {
        text: 'package.json 里写 ^1.2.0 这种范围版本的问题是什么？',
        options: [
          '会装不到 1.2.0',
          '允许升到 1.9.x，框架的 minor 常带影响行为但不删 API 的改动',
          '会导致 lockfile 失效',
          '没有影响',
        ],
        answer: 1,
        explain: 'semver 只保证不删 API，不保证行为一致。对照实验里一次 minor 升级就能让通过率变化。',
        concept: 'framework-template',
      },
      {
        text: 'core/ 层为什么必须零依赖？',
        options: [
          '能减小打包体积',
          '一旦漏进某框架，所有实现都继承它，对照退化成「同一框架的四种用法」',
          '方便测试',
          '为了通过 lint',
        ],
        answer: 1,
        explain: '核心层预埋某家形状后，其他实现都在做妥协，而你不会收到任何报错。',
        concept: 'framework-template',
      },
      {
        text: '搭完骨架先接 FakeLlm 而不是真实模型，是为了？',
        options: [
          '省钱',
          '把「编排对不对」与「回答好不好」拆开，前者确定可复现',
          '因为真实模型太慢',
          '框架不支持真实模型',
        ],
        answer: 1,
        explain: '混在一起跑，一个失败 case 说不清是流程写错还是模型发挥差。先测骨架，再接模型看质量。',
        concept: 'framework-template',
      },
    ],
    [
      ['四重锁', 'lockfile + 精确版本 + 运行时约束 + peer 区间记录'],
      ['精确版本', '写死 x.y.z，禁用 ^ / ~ / latest，避免 behavior drift'],
      ['框架无关骨架', 'core 层零依赖，实现可替换，对照才有意义'],
      ['LlmClient', '统一模型入口：可读的 id + AsyncIterable 流'],
      ['FakeLlm', '脚本化确定性模型，用于验证编排而非回答质量'],
      ['框架味', '核心层出现某框架的消息形状、执行上下文或事件命名'],
    ],
    [
      '只靠 lockfile 锁版本，一次 pnpm up 就把整个对照底座换掉。',
      'CI 里用 npx tool@latest 或依赖 postinstall 拉远端清单，工具版本不可复现。',
      'core 层的 Message 照抄某框架消息模型，其余实现全在做妥协。',
      '跳过 FakeLlm 直接接真实模型，失败 case 无法归因为流程错误还是模型波动。',
    ],
  ),
  'framework',
)
