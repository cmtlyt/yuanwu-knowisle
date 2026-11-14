import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 24 ========== */

export const L122 = withKind(
  L(
    'L122',
    24,
    '模型与供应商生态',
    1,
    ['L88'],
    ['model-ecosystem'],
    [
      '了解主流模型供应商与「兼容接口」的生态格局',
      '理解 provider 抽象如何屏蔽多供应商差异',
      '掌握按「能力 / 成本 / 延迟 / 数据合规」选供应商的框架',
    ],
    `
### 模型不再只有一家

从教学基线（OpenAI 兼容接口）往外看，模型生态已经高度分化：闭源头部、开源权重、本地部署、以及大量「兼容 OpenAI 接口」的服务。多供应商意味着你的 Agent 不该写死某个 provider，而应该通过 provider 抽象来路由。

\`\`\` title="provider 抽象（对照 L89 模型路由）" note="关键：provider 抽象 + 路由策略，让你能随时换供应商而不改业务逻辑。"
type Provider = {
  name: string
  chat(messages, opts): Promise<Response>  // 统一接口
  embed(texts): Promise<number[][]>          // 向量也抽象
}

const providers: Provider[] = [
  openaiCompat(baseURL: "https://api.a.com/v1"),
  openaiCompat(baseURL: "https://api.b.com/v1"),
  localLLM("http://localhost:11434"),        // 本地模型
]

// 路由：按成本 / 质量 / 延迟 / 数据合规选（对照 L89 的分流逻辑）
const p = route({ task, budget, latency, compliance })
const res = await p.chat(messages)
\`\`\`

:::deep

### 「兼容接口」是生态的通货

大量供应商都提供 OpenAI 兼容的 API 端点，所以「OpenAI 兼容接口」成了事实标准。你的 provider 抽象只要实现这一个形状，就能接入几十家供应商——这跟 MCP 的「统一接口」是同一套思想：用一个稳定接口，屏蔽底层差异。

:::

### 选供应商的四个维度

- 能力：某类任务（推理 / 代码 / 长文 / 多模态）谁更强。
- 成本：token 单价 + 缓存命中价，按任务分级。
- 延迟：在线服务 vs 本地模型，延迟差异巨大。
- 数据合规：敏感数据能不能发到第三方？不能就上本地 / 私有化。

:::warn

### 数据合规是「硬约束」不是「软偏好」

能力再强、再便宜，如果数据合规不允许把用户数据发到该供应商，就得一票否决。这决定了很多企业 Agent 必须走「本地模型 + 私有化部署」路线（呼应 L87 多租户隔离）。

:::

`,
    null,
    [
      {
        text: '屏蔽多供应商差异的关键是？',
        options: ['写死一个供应商', 'provider 抽象 + 统一接口', '更长的 prompt', '更贵的模型'],
        answer: 1,
        explain: 'provider 抽象屏蔽差异。',
        concept: 'model-ecosystem',
      },
      {
        text: '「OpenAI 兼容接口」在生态里的角色是？',
        options: ['某家公司的私有协议', '事实标准，一个形状接入多家供应商', '本地协议', '硬件接口'],
        answer: 1,
        explain: '它是生态通货。',
        concept: 'model-ecosystem',
      },
      {
        text: '以下哪个是「硬约束」？',
        options: ['延迟', '成本', '数据合规（敏感数据不能发第三方）', '模型名气'],
        answer: 1,
        explain: '数据合规一票否决。',
        concept: 'model-ecosystem',
      },
    ],
    [
      ['provider 抽象', '把不同模型供应商统一成同一接口'],
      ['兼容接口', '与 OpenAI API 形状一致的事实标准'],
      ['数据合规', '敏感数据可否发到第三方供应商'],
    ],
    ['写死某个供应商，导致换供应商要改业务逻辑。', '把数据合规当软偏好，为了能力/成本忽视隐私约束。'],
  ),
  'scenario',
)
