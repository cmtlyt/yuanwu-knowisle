import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 22 ========== */

export const L115 = withKind(
  L(
    'L115',
    22,
    'Python 生态对照：AutoGen / CrewAI 的架构思路（不写 Python）',
    1,
    ['L112'],
    ['python-ecosystem'],
    [
      '理解 Python 多 Agent 生态（AutoGen / CrewAI）的核心架构思想',
      '把 Python 生态当作「架构借鉴」而非「实现依赖」',
      '说清为何本课主线以 TS 框架为准',
    ],
    `
### Python 生态是「思路库」不是「代码库」

AutoGen 的「多 Agent 对话 + 群聊」、CrewAI 的「角色 + 任务 + 流程」是两种经典编排思想。本课把它们当架构蓝本，用 TS 手写或 TS 框架重实现，不写 Python 代码。

\`\`\` title="两种编排思想（架构对照，非 TS 代码）" note="注意：这里只有「思想」能借鉴，没有可复用的 TS 代码。"
// AutoGen 思想：多 Agent 自由对话
//   多个 Agent 放进一个「群聊」，谁有话说谁上
//   由「GroupChatManager」决定下一轮谁发言
//   → 映射到 TS：消息总线 + supervisor（对照 L68/L69）

// CrewAI 思想：角色 + 任务 + 流程
//   定义 Crew（研究员 / 写手）→ 定义 Task → 串成 Process
//   → 映射到 TS：角色定义 + 任务 DAG + 编排器（对照 L68）
\`\`\`

:::deep

### 为什么本课以 TS 框架为准

本课定位是「TS 手写 + TS 框架对照」，学员是 TS 开发者。Python 生态的 AutoGen / CrewAI 很成熟，但把它们当主线会引入第二套语言环境，违背「固定 Node 24、不混用」的工程纪律。它们的价值在「编排范式」层，这一层用 TS 完全能等价实现。

:::

### Python 生态 → TS 落地的映射

- AutoGen GroupChat → supervisor 编排 + 消息总线（L69 三种编排模式之一）。
- CrewAI 的 Role/Task/Process → 角色定义 + 任务分解 + 编排器（L60 P&E 引擎）。
- LiteLLM 多模型路由 → 模型路由策略（L88/L89 的 provider 抽象）。
- LlamaGuard 安全分类 → 输出护栏（L86 的守卫层思路）。

:::tip

### 跨语言借鉴的正确姿势

读 Python 生态时只问「它解决什么编排问题、怎么解耦的」，不抄它的 API。然后在 TS 里用「手写优先」实现同一思想，必要时用 TS 框架加速。

:::

`,
    null,
    [
      {
        text: '本课把 Python 生态当什么用？',
        options: ['直接引用的代码库', '架构思路借鉴，TS 重实现', '必须学习的语言', '部署平台'],
        answer: 1,
        explain: '架构对照，不写 Python 代码。',
        concept: 'python-ecosystem',
      },
      {
        text: 'AutoGen 的 GroupChat 思想映射到 TS 是？',
        options: ['supervisor 编排 + 消息总线', 'RAG 检索', '流式输出', '模型路由'],
        answer: 1,
        explain: '群聊管理 ≈ supervisor 编排。',
        concept: 'python-ecosystem',
      },
      {
        text: '为什么本课主线以 TS 框架为准？',
        options: ['Python 更强', '保持固定 Node 24、单一语言环境，不混用', 'TS 框架更好', '没有 Python 生态'],
        answer: 1,
        explain: '工程纪律：固定运行环境、单一语言。',
        concept: 'python-ecosystem',
      },
    ],
    [
      ['AutoGen', 'Python 多 Agent 群聊编排框架'],
      ['CrewAI', '角色 + 任务 + 流程的 Python 编排框架'],
      ['跨语言借鉴', '取架构思想、在目标语言重实现'],
    ],
    ['以为「借鉴 Python 生态」就必须引入 Python 依赖。', '照抄 Python API，而不是迁移其架构思想。'],
  ),
  'framework',
)
