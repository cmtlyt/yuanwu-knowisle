import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L05 = withKind(
  L(
    'L05',
    0,
    '可观测与评估的「预埋」',
    2,
    ['L04'],
    ['observability-priming'],
    [
      '理解为什么从第一课就要预埋 trace / assert',
      '学会给最小循环加一个最简 span 埋点',
      '理解「先有度量，再谈优化」的工程逻辑',
    ],
    `
### 从第一课就埋点，而不是最后补

Agent 系统的两个核心问题——「它为什么做了这个决定」和「它到底有没有变好」——都需要度量数据才能回答。如果等系统复杂了才想起加追踪和断言，你会面对一个无法定位问题的黑盒。

\`\`\` title="最简 span 埋点" note="\\\`Tracer.trace\\\` 只负责记录起止时间与属性，不改变业务逻辑——这就是「预埋」的最小形态。"
// src/trace/tracer.ts
export interface Span {
  name: string
  start: number
  end: number
  attrs: Record<string, unknown>
}

export class Tracer {
  private spans: Span[] = []
  trace<T>(name: string, attrs: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    return fn().finally(() => {
      this.spans.push({ name, start, end: performance.now(), attrs })
    })
  }
  dump(): Span[] {
    return this.spans
  }
}

// src/agent/loop.ts —— 用追踪包裹一次模型调用
export async function runLoop(client: LlmClient, prompt: string, tracer = new Tracer()) {
  return tracer.trace("llm.chat", { prompt }, () => client.chat([{ role: "user", content: prompt }]))
}
\`\`\`

:::deep

### 度量先于优化

没有 span，你就不知道一次回答花了多少时间、调了几次模型、哪一步最慢。有了 span，模块六的链路追踪、模块六的成本优化才有数据可依。预埋的代价几乎为零，但后补的代价是重构。

:::

### 评估要预埋什么

- 轨迹（trace）：一次请求经过了哪些步骤、每个步骤的输入输出。
- 断言（assert）：解析器 / 循环终止 / 工具调用的不变量，随测试跑。
- 样本（eval set）：几个固定的输入-期望输出对，作为回归基线。

:::warn

### 别把 trace 当 printf 调试

trace 是结构化数据（span 列表），不是散落的 console.log。它要能被程序消费、能被断言校验，而不是只能人肉看。

:::

`,
    null,
    [
      {
        text: '为什么要从第一课就预埋 trace / assert？',
        options: [
          '显得工程化',
          '等系统复杂了再补，代价是重构且难以定位问题',
          '框架强制要求',
          '为了增加代码量',
        ],
        answer: 1,
        explain: '度量先于优化：先有 span 和断言，后面才能定位问题、判断有没有变好。',
        concept: 'observability-priming',
      },
      {
        text: '`Tracer.trace` 的正确形态是？',
        options: ['一堆 console.log', '结构化 span 列表，可被程序消费和断言', '只记录报错', '打印到日志文件'],
        answer: 1,
        explain: 'trace 是结构化数据（span 列表），不是散落的 printf 调试。',
        concept: 'observability-priming',
      },
      {
        text: '评估「预埋」不包括以下哪项？',
        options: ['轨迹 trace', '断言 assert', '固定 eval set', '部署脚本'],
        answer: 3,
        explain: '预埋指轨迹、断言、样本；部署脚本与评估度量无关。',
        concept: 'observability-priming',
      },
    ],
    [
      ['span', '一次操作（如一次模型调用）的起止时间与属性记录'],
      ['trace', '由多个 span 组成的一次完整请求轨迹'],
      ['eval set', '固定的输入-期望输出样本，作为回归基线'],
    ],
    ['用 console.log 代替结构化 trace，后面无法程序化消费。', '等到模块六才想起加追踪，被迫重构核心循环。'],
  ),
  'practice',
)
