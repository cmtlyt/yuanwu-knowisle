import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L04 = withKind(
  L(
    'L04',
    0,
    '项目脚手架：一个可运行的最小 Agent 工程',
    2,
    ['L03'],
    ['scaffold'],
    [
      '搭出一个只有四段逻辑的最小 Agent 工程并跑通它',
      '实现模型调用、工具分发、循环与退出条件的分离骨架',
      '写出假模型驱动的冒烟测试，断言退出条件与工具调用次数',
    ],
    `
### 脚手架跑通了，却没人指得出哪行是 Agent

上一期开班时图省事，脚手架直接用了某框架的 \`createAgent\` 模板，学员 \`pnpm dev\` 一敲就能对话，成就感拉满。第三周布置了一个小改动：「不用框架，把退出条件从『模型说完了』改成『最多三轮工具调用』」。结果全组卡住——不是不会写 \`if\`，是**没人能指出循环在哪**。框架把消息装配、工具分发、终止判断都包在一个 \`run()\` 里，模板里能看见的只有配置项。

同一次还暴露了第二个问题：模板把密钥硬编码在入口文件、把两个示例工具直接写在 \`main\` 里。等到 L40 要加参数校验与权限、L85 要收最小权限时，几乎得整体重写。一个「能跑」的脚手架，如果没法让人**指认每一段逻辑的位置**，后面一百多课的每一次改动都会变成猜谜。

这一课要搭的工程因此刻意只有四段：模型调用、工具分发、循环、退出。没有框架、没有数据库、没有前端。它的价值不在功能多，在**可指认、可替换、可测试**。

### 目录骨架：每个后续概念都有一个落点

| 文件 | 唯一职责 | 后面哪几课会改它 | 不许放什么 |
|---|---|---|---|
| \`src/llm.ts\` | 发一次请求、返回统一结构 | L10（SDK 对照）、L88（路由） | 循环、重试策略 |
| \`src/tools.ts\` | 注册工具、校验参数、分发执行 | L38 / L40 / L42、L85（权限） | 模型调用 |
| \`src/loop.ts\` | 消息装配、轮次推进、退出判断 | L36、L61（重规划）、L97（图化） | 具体工具实现 |
| \`src/main.ts\` | 读配置、组装依赖、启动 | L127（服务化） | 业务逻辑 |
| \`src/config.ts\` | 环境变量与契约读取 | L02 / L03、L126 | 密钥字面量 |
| \`tests/smoke.test.ts\` | 假模型驱动的冒烟断言 | L80 / L81 | 真实网络请求 |

最后一行是这个工程的硬约束：**冒烟测试不许连真模型**。模型输出有随机性，把它放进最基础的脚手架测试里，会让「能不能跑」这件本该确定的事变得不确定（L82 也强调过同样的分层）。

:::deep
### 先手写不是反框架，是给对照实验留一个锚点

模块七要用六框架重写同一个 Agent 并做横向对比（L93–L115）。如果读者从没见过手写版，那批课就只能变成「六个框架的 API 介绍」——因为「框架替你省了什么」需要一个 baseline 才说得清。这个最小工程就是那个 baseline：它把循环、消息、工具三件事摊开成三个文件，日后无论换成图、换成 supervisor、换成成套件，都能逐项指出「原来这行现在由谁接管」。

L97 讲过一个叫「假迁移」的失败模式：代码搬到了新架构，控制流却还藏在旧位置（比如节点里跑 \`for\` 循环），LOC 降了、能力也降了。这里把循环单独放进 \`loop.ts\`，正是为了让这种迁移**有一个可被检查的目标**：迁移后如果 \`loop.ts\` 没了、而某个节点文件里出现了长循环，就该警觉。

所以「四段分离」不是代码美学，是后面所有对照、迁移、评测能成立的结构前提。
:::

### 工程骨架与启动脚本

\`\`\`text title="目录结构" note="要点：只有六个文件；任何一门后续课要改的东西都能指到具体一行。"
agent-from-scratch/
├── package.json          # 精确依赖（L03）、scripts
├── tsconfig.json         # 固定编译目标（L02）
├── deps.lock.json        # 版本锁定表（L03）
├── .env.example          # 只放变量名，不放值
├── src/
│   ├── config.ts
│   ├── llm.ts
│   ├── tools.ts
│   ├── loop.ts
│   └── main.ts
└── tests/smoke.test.ts
\`\`\`

\`\`\`json title="package.json 的 scripts" note="要点：dev 与 smoke 分开；smoke 用假模型，不消耗 token。"
{
  "scripts": {
    "check:env": "node scripts/check-env.mjs",
    "check:deps": "node scripts/check-deps.mjs",
    "dev": "tsx src/main.ts",
    "smoke": "node --import tsx --test tests/smoke.test.ts",
    "test": "pnpm check:env && pnpm check:deps && pnpm smoke"
  }
}
\`\`\`

\`\`\`ts title="src/config.ts" note="要点：密钥只从环境变量读；缺失就早失败，不留 undefined 到运行时。"
export type Config = { apiKey: string; baseUrl: string; model: string; maxTurns: number }

export function loadConfig(env = process.env): Config {
  const apiKey = env.AGENT_API_KEY
  const baseUrl = env.AGENT_BASE_URL
  const model = env.AGENT_MODEL
  if (!apiKey || !baseUrl || !model) {
    throw new Error('缺少 AGENT_API_KEY / AGENT_BASE_URL / AGENT_MODEL，请复制 .env.example')
  }
  return { apiKey, baseUrl, model, maxTurns: Number(env.AGENT_MAX_TURNS ?? 6) }
}
\`\`\`

\`\`\`text title=".env.example" note="要点：只写变量名，值留空；永远不要把真实密钥提交进仓库。"
AGENT_API_KEY=
AGENT_BASE_URL=
AGENT_MODEL=
AGENT_MAX_TURNS=6
\`\`\`

### 四段逻辑：调用、工具、循环、退出

\`\`\`ts title="src/llm.ts 与 src/tools.ts" note="要点：llm 只负责一次请求；tools 负责参数校验与分发，二者互不调用。"
export type Message = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }
export type LlmReply = { text: string; toolCalls: { name: string; args: string }[] }

export interface LlmClient {
  chat(messages: Message[]): Promise<LlmReply>
}

export class HttpLlmClient implements LlmClient {
  constructor(private cfg: Config) {}
  async chat(messages: Message[]): Promise<LlmReply> {
    const res = await fetch(this.cfg.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.cfg.apiKey },
      body: JSON.stringify({ model: this.cfg.model, messages, temperature: 0 }),
    })
    if (!res.ok) throw new Error('LLM HTTP ' + res.status)
    const data = await res.json()
    const choice = data.choices?.[0]?.message
    return {
      text: choice?.content ?? '',
      toolCalls: (choice?.tool_calls ?? []).map((c: CallShape) => ({
        name: c.function.name, args: c.function.arguments,
      })),
    }
  }
}

type Tool = { name: string; schema: ZodShape; run: (args: unknown) => Promise<string> }

export class ToolRegistry {
  private tools = new Map<string, Tool>()
  register(t: Tool) { this.tools.set(t.name, t); return this }
  names() { return [...this.tools.keys()] }
  async dispatch(call: { name: string; args: string }): Promise<string> {
    const tool = this.tools.get(call.name)
    if (!tool) throw new Error('未注册的工具: ' + call.name)
    const parsed = tool.schema.parse(JSON.parse(call.args))   // L40 参数校验在这里
    return tool.run(parsed)
  }
}
\`\`\`

\`\`\`ts title="src/loop.ts 与 src/main.ts" note="要点：循环与退出条件集中在一个函数；main 只组装依赖，不含业务判断。"
export type LoopDeps = { llm: LlmClient; tools: ToolRegistry; maxTurns: number }

export async function runLoop(deps: LoopDeps, question: string): Promise<string> {
  const messages: Message[] = [{ role: 'user', content: question }]
  for (let turn = 0; turn < deps.maxTurns; turn++) {
    const reply = await deps.llm.chat(messages)
    if (reply.toolCalls.length === 0) return reply.text        // 退出条件①：模型给最终答案
    messages.push({ role: 'assistant', content: '' })
    for (const call of reply.toolCalls) {
      const result = await deps.tools.dispatch(call)
      messages.push({ role: 'tool', content: result })
    }
  }
  throw new Error('max turns exceeded: ' + deps.maxTurns)     // 退出条件②：轮次上限
}

// main.ts：只做「读配置 → 组装 → 启动」，没有任何业务逻辑
const cfg = loadConfig()
const tools = new ToolRegistry().register({
  name: 'echo',
  schema: z.object({ text: z.string().max(200) }),
  run: async ({ text }) => 'echo: ' + text,
})
const answer = await runLoop({ llm: new HttpLlmClient(cfg), tools, maxTurns: cfg.maxTurns }, '重复一下「你好」')
console.log(answer)
\`\`\`

把 \`maxTurns\` 做成显式参数，是为了让第三周那个「改成最多三轮」的作业变成一行改动。同理，\`LlmClient\` 是接口而不是具体实现——下一课的冒烟测试才能用假模型替换它，而不需要动 \`runLoop\` 一个字。

### 冒烟测试：用假模型把四段跑通

\`\`\`ts title="tests/smoke.test.ts" note="要点：确定性假模型；断言退出、工具调用次数、轮次上限三类行为。"
import { test } from 'node:test'
import assert from 'node:assert/strict'

class FakeLlm implements LlmClient {
  calls = 0
  constructor(private script: LlmReply[]) {}
  async chat(): Promise<LlmReply> { return this.script[this.calls++] ?? { text: 'done', toolCalls: [] } }
}

function makeTools() {
  let used = 0
  const tools = new ToolRegistry().register({
    name: 'echo', schema: z.object({ text: z.string() }),
    run: async ({ text }) => { used++; return 'echo:' + text },
  })
  return { tools, used: () => used }
}

test('模型先调一次工具再给答案，循环应正常退出', async () => {
  const { tools, used } = makeTools()
  const llm = new FakeLlm([
    { text: '', toolCalls: [{ name: 'echo', args: '{"text":"hi"}' }] },
    { text: '完成', toolCalls: [] },
  ])
  const out = await runLoop({ llm, tools, maxTurns: 6 }, '测试')
  assert.equal(out, '完成')
  assert.equal(used(), 1)
  assert.equal(llm.calls, 2)
})

test('一直要求调工具时，轮次上限必须拦住', async () => {
  const { tools } = makeTools()
  const forever = new FakeLlm([])
  forever.chat = async () => ({ text: '', toolCalls: [{ name: 'echo', args: '{"text":"x"}' }] })
  await assert.rejects(runLoop({ llm: forever, tools, maxTurns: 3 }), /max turns exceeded/)
})

test('未注册的工具必须报错，不能静默吞掉', async () => {
  const { tools } = makeTools()
  const llm = new FakeLlm([
    { text: '', toolCalls: [{ name: 'missing', args: '{}' }] },
  ])
  await assert.rejects(runLoop({ llm, tools, maxTurns: 3 }), /未注册的工具/)
})
\`\`\`

三条断言分别对应循环最要紧的三种行为：正常退出、不能无限跑、失败要显性。它们全是确定性的，可以进 CI，也不花一分钱 token。等 L81 搭 Eval harness 时，这套 \`FakeLlm\` 会直接复用——**先有可替换的接口，才有可复用的测试资产**。

:::warn
### 两个必踩的坑

- **把密钥写进源码或提交 \`.env\`**。它会在某次截图、某次 paste、某次仓库迁移里泄露，而且一旦进过 git 历史，改密钥比改代码麻烦得多。只提交 \`.env.example\`，真实值走环境变量。
- **把循环塞进 \`main.ts\`**。表面上少一个文件，实际是让循环无法被单独测试、无法被替换、无法在迁移时被检查——正是 L97「假迁移」的温床。**入口文件只组装，不判断**。
:::

### 三个可替换接口，撑起后面所有改造

这个骨架能长到一百多课，靠的不是文件多，而是**三个边界都留成了接口**：\`LlmClient\`（换 SDK、换供应商、换假模型）、\`ToolRegistry\`（加权限、加参数校验、接 MCP）、\`EventSink\`（换 tracer、换评测采样、换告警）。加上 \`loadConfig()\` 把配置与代码分开，一共四处替换点。后面绝大多数课，本质上都是在这四个接口上换实现，而不是重写 \`runLoop\`。

这也是判断骨架是否腐化的简单办法：**想加一个新能力，如果必须改 \`loop.ts\` 的控制流，就要先问一句「它该不该是一个接口」**。比如 L88 的模型路由，正确落点是 \`LlmClient\` 内部按请求选模型，而不是在循环里加 \`if\`。L85 的最小权限同理，落在 \`ToolRegistry.dispatch\` 的鉴权钩子里，不该散落在每个工具函数里。

### 什么时候可以引入框架

先手写不等于永远不用框架。判据是**手写成本超过理解成本**：当需求出现状态断点续跑、复杂条件分支、多角色协作、或者需要长期挂起等待人工审批时，继续在 \`loop.ts\` 里堆 \`if\` 会让控制流变成一团乱麻，这时候引入图或成套件是划算的（模块七会逐个对照）。

但有两个前提。第一，**保留手写版**：它是 L94 对照实验的 baseline，也是出事时唯一能逐步调试的版本。第二，**迁移要能指认控制流去了哪里**——如果迁移后 \`loop.ts\` 消失了，而某个节点文件里出现一个长 \`for\` 循环，那就是 L97 说的「假迁移」：代码搬过去了，控制权还留在旧位置。所以这个骨架不是「最终形态」，它是**判断最终形态是否变好的尺子**。

顺带说一个常被问到的细节：示例用 \`tsx\` 直接跑 \`.ts\`，而不是先编译成 \`.js\`。教学阶段这样最快，也避免 \`dist\` 与源码不同步带来的困惑；但它不改变 \`tsconfig\` 的重要性——\`target\` / \`lib\` / \`strict\` 依然由 L02 的契约固定，\`tsx\` 只是省掉了emit 这一步。到了 L127 部署时，构建产物与环境契约会一起进 \`/ready\` 探针。

### 验收清单

| 检查项 | 怎么验 | 失败说明什么 |
|---|---|---|
| 四段分别在四个文件 | 目录对照 | 后面无法逐项替换 |
| \`pnpm dev\` 能跑通一轮 | 手动一次 | 环境或配置有问题（回 L02/L03） |
| \`pnpm smoke\` 三条断言全绿 | CI | 循环或工具分发有 bug |
| 冒烟不连真模型 | 断网跑 \`pnpm smoke\` | 测试被模型随机性污染 |
| 改 \`maxTurns\` 只动一处 | 把 6 改成 3 重跑 | 退出条件散落了 |

最后一行是最实用的自检：**一个配置项如果要在三个文件里改，说明骨架已经腐化了**。

### 与相邻课的分工

- **L02 / L03**：给环境与依赖契约，本课在上面搭工程，不重复讲版本。
- **L10**：裸 fetch 与官方 SDK 的对照，本课只给最小 \`HttpLlmClient\` 作为对照的一端。
- **L36 / L38 / L40 / L42**：手写循环、工具调用、参数校验与 Function Calling，本课的四个文件是它们的落点。
- **L95**：core 零依赖骨架与四核心接口，本课是它的最小前身。
- **L97 / L127**：图化迁移与服务化部署，都从这个可指认的骨架出发。

**一句话收束**：最小 Agent 工程的价值不是「能跑」，是**每一段逻辑都能被指出、替换、测试**——这是后面所有对照与迁移的锚点。
`,
    null,
    [
      {
        text: '脚手架用了框架的 createAgent 后，学员卡在「改退出条件」，根因是？',
        options: [
          '不会写 if',
          '循环与退出判断被包在框架 run() 里，无法指认位置',
          '模型不支持',
          '依赖版本不对',
        ],
        answer: 1,
        explain: '可指认比能跑更重要，后面每次改动都要落到具体文件。',
        concept: 'scaffold',
      },
      {
        text: '冒烟测试为什么必须用假模型？',
        options: [
          '省钱而已',
          '模型输出随机，会让「能不能跑」这件确定的事变得不确定',
          '真模型太慢',
          'CI 没有网络',
        ],
        answer: 1,
        explain: '确定性结构断言进 CI，真实模型输出只做人工抽检。',
        concept: 'scaffold',
      },
      {
        text: '把循环塞进 main.ts 的后果是？',
        options: [
          '少一个文件更简洁',
          '循环无法单独测试/替换/检查，是「假迁移」的温床',
          '启动更快',
          '类型更少',
        ],
        answer: 1,
        explain: '入口文件只组装不判断，循环必须独立成模块。',
        concept: 'scaffold',
      },
    ],
    [
      ['四段分离', '模型调用 / 工具分发 / 循环退出 / 入口组装各占一个文件'],
      ['可指认', '每个后续概念都能落到具体一行，是迁移与对照的前提'],
      ['FakeLlm', '确定性假模型，让冒烟断言进 CI 且可复用为 L81 的测试资产'],
    ],
    [
      '把密钥硬编码进源码或提交 .env，进过 git 历史后改密钥比改代码麻烦得多。',
      '把循环写进入口文件，导致无法单测、无法替换、迁移时无法检查控制流位置。',
    ],
  ),
  'practice',
)
