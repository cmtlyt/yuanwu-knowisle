import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L31 = withKind(
  L(
    'L31',
    4,
    '运行时解剖：看懂 Agent Loop 的骨架',
    2,
    ['L13'],
    ['agent-loop'],
    [
      '解剖 Agent Loop 的四个本质部件',
      '理解循环 / 状态 / 终止 / 错误恢复各管什么',
      '为 L36 的最小运行时实现打基础',
    ],
    `
### 把循环拆成四个部件

任何一个 Agent 运行时，无论框架还是手写，都由四个部件组成：**循环**（怎么转）、**状态**（记什么）、**终止**（何时停）、**错误恢复**（崩了怎么办）。本课只做解剖，L36 再写完整代码。

\`\`\` title="Agent Loop 的四部件骨架" note="这个骨架是你后面所有运行时实现的模板。四个部件缺一不可。"
// ① 状态：循环间需要记住的一切
interface State { messages: Message[]; steps: number; done: boolean }

// ② 循环：决定 → 执行 → 观测 → 回填
while (!terminated(state)) {          // ③ 终止：每次先检查
  try {
    const action = await decide(state)         // 模型决定
    const obs = await execute(action)          // 工具执行
    state = update(state, action, obs)         // 观测回填
  } catch (e) {
    state = await recover(state, e)            // ④ 错误恢复
  }
}
\`\`\`

### 四部件职责

- 循环：驱动「决定→执行→观测」的往复。
- 状态：messages、步数、中间结果等跨轮次数据。
- 终止：finish 信号、步数上限、超时——没有它就停不下来。
- 错误恢复：工具失败、模型异常、网络抖动时的兜底。

:::deep

### 状态是运行时的灵魂

Agent 与传统「无状态函数」最大的不同是：它是有状态的。一次任务的所有上下文（聊了什么、调了什么工具、结果如何）都在 State 里。状态管理做不好，多轮对话会串、并发会乱、重启会丢。

:::

:::warn

### 先骨架后细节

本课刻意「只示意、不写完整可运行代码」。看懂骨架，L36 落地时才不会迷失在细节里。

:::

`,
    null,
    [
      {
        text: 'Agent Loop 的四个本质部件是？',
        options: [
          '模型、工具、内存、磁盘',
          '循环 / 状态 / 终止 / 错误恢复',
          '输入、处理、输出、存储',
          'prompt、token、API、缓存',
        ],
        answer: 1,
        explain: '循环、状态、终止、错误恢复。',
        concept: 'agent-loop',
      },
      {
        text: '「终止」部件负责什么？',
        options: ['调用模型', 'finish 信号、步数上限、超时——决定何时停', '存储状态', '执行工具'],
        answer: 1,
        explain: '没有终止，循环停不下来。',
        concept: 'agent-loop',
      },
      {
        text: '为什么说「状态是运行时的灵魂」？',
        options: [
          '状态最难写',
          'Agent 是有状态的，上下文/中间结果都在状态里',
          '状态影响性能',
          '状态不需要管理',
        ],
        answer: 1,
        explain: '状态管理不好会串话、并发乱、重启丢。',
        concept: 'agent-loop',
      },
    ],
    [
      ['运行时', '驱动 Agent 循环执行、管理状态与终止的组件'],
      ['状态 State', '循环间需要记住的一切数据'],
      ['错误恢复', '工具/模型/网络异常时的兜底机制'],
    ],
    ['忽略终止条件，Agent 停不下来或无限烧 token。', '把状态管理当次要问题，多轮对话串线。'],
  ),
  'practice',
)
