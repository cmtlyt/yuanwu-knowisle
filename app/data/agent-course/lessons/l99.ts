import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 17 ========== */

export const L99 = withKind(
  L(
    'L99',
    17,
    'LangGraph 可观测性 + 部署（LangSmith / LangGraph Platform）',
    3,
    ['L96', 'L73'],
    ['langgraph-obs'],
    [
      '了解 LangGraph 的可观测性（LangSmith）与部署（LangGraph Platform）',
      '理解「自动 span 串联」如何简化追踪',
      '认识托管部署的收益与锁定风险',
    ],
    `
### 框架把追踪「自动化」了

L75 手写的 span 追踪，LangGraph 通过 LangSmith **自动**完成：每个节点、每次模型调用、每次工具调用都自动生成 span，无需手写埋点。

\`\`\` title="LangGraph 可观测 + 部署" note="关键：可观测「自动埋点」，部署「托管运行」，这是框架替你省的两大块。"
// ① 可观测：接入 LangSmith，自动追踪
process.env.LANGSMITH_API_KEY = "..."
// 之后每个节点/边/模型调用自动成 span，可在 LangSmith 可视化

// ② 部署：LangGraph Platform
//   托管部署：图编译成 API 服务，自带 checkpoint 持久化、
//   horizontal scaling、assistant UI
//   对比手写：自己部署要处理进程管理、状态存储、扩缩容
\`\`\`

:::deep

### 托管的收益与锁定

LangGraph Platform 托管部署，省去「进程管理、状态持久化、扩缩容」，但代价是**平台锁定**——你的运行强依赖 LangChain 生态，迁移成本高。这正是「运行时位置」维度（L93）的体现。

:::

### 可观测自动化的三个收益

- 零埋点：节点/调用自动成 span。
- 可视化：链路一目了然，回放调试（L74）内置。
- 成本归因：自动统计每个节点/工具的成本。

:::warn

### 别让「自动追踪」变成「黑盒追踪」

自动 span 虽然省事，但你要理解 span 的含义（呼应 L73），否则出了问题仍看不懂。框架自动化了「采集」，没自动化「理解」。

:::

`,
    null,
    [
      {
        text: 'LangSmith 对可观测性的核心贡献是？',
        options: ['自动写代码', '自动埋点：节点/调用自动成 span', '自动部署', '自动评估'],
        answer: 1,
        explain: '自动 span 串联。',
        concept: 'langgraph-obs',
      },
      {
        text: 'LangGraph Platform 托管部署的代价是？',
        options: ['更快', '平台锁定（强依赖 LangChain 生态）', '更便宜', '更可控'],
        answer: 1,
        explain: '托管带来平台锁定。',
        concept: 'langgraph-obs',
      },
      {
        text: '框架自动化了追踪的什么？',
        options: ['理解', '采集（自动成 span），没自动化「理解」', '评估', '修复'],
        answer: 1,
        explain: '自动化采集，理解仍靠人。',
        concept: 'langgraph-obs',
      },
    ],
    [
      ['LangSmith', 'LangChain 的可观测与评测平台'],
      ['自动埋点', '节点/调用自动生成 span'],
      ['平台锁定', '托管部署带来的迁移成本'],
    ],
    ['依赖自动追踪却不理解 span，出问题看不懂。', '忽视托管部署的平台锁定风险。'],
  ),
  'framework',
)
