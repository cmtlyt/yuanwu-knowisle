import { L } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L32 = L(
  'L32',
  4,
  'Thought / Action / Observation 各司其职',
  12,
  1,
  ['L31'],
  ['tao'],
  [
    '厘清 Thought / Action / Observation 三者的职责边界',
    '理解三者如何通过上下文串成闭环',
    '避免三者职责混淆导致的实现错误',
  ],
  `
### 三个词，三种职责

ReAct 循环里反复出现三个角色：Thought（想什么）、Action（做什么）、Observation（看到了什么）。它们的职责边界清晰，但新手容易混。

\`\`\` title="三者的职责与数据流" note="关键：Thought 和 Action 是模型产出的，Observation 是工具（环境）产出的。"
Thought:      "需要查天气"        ← 模型产出：推理（决策依据）
Action:       search_weather("北京")  ← 模型产出：动作（要执行什么）
Observation:  "晴，18°C"             ← 工具产出：观测（执行结果）

// 数据流：Thought 影响 Action，Action 产生 Observation，
//         Observation 回填上下文，影响下一轮 Thought。
\`\`\`

### 三者职责边界

- Thought：模型对「下一步」的推理，参与决策，不是给用户看的注释。
- Action：模型决定要执行的动作（调工具 / finish），是决策的落点。
- Observation：工具执行的结果，由环境回填，是下一轮决策的输入。

:::deep

### 谁产出谁

记住一个不等式：模型产出 Thought + Action，环境产出 Observation。混淆这一点会导致「把 Observation 当模型输出解析」或「把 Thought 当工具调用执行」这类低级错误。

:::

:::warn

### Observation 要「可被模型读懂」

Observation 不是给程序员看的日志，而是喂回给模型的上下文。它要结构化、信息完整、格式稳定，否则模型下一轮会误判。

:::

`,
  null,
  [
    {
      text: 'Thought 和 Action 由谁产出？',
      options: ['工具', '模型', '用户', '数据库'],
      answer: 1,
      explain: 'Thought 与 Action 都是模型产出；Observation 是环境/工具产出。',
      concept: 'tao',
    },
    {
      text: 'Observation 的正确角色是？',
      options: ['给程序员的日志', '工具执行结果，回填上下文作为下一轮决策输入', '模型的推理', '用户的输入'],
      answer: 1,
      explain: 'Observation 由环境回填，喂给模型影响下一轮。',
      concept: 'tao',
    },
    {
      text: '把 Observation 当模型输出解析，属于哪类错误？',
      options: ['性能问题', '职责混淆（环境产出误当模型产出）', '安全问题', '无影响'],
      answer: 1,
      explain: '混淆「谁产出谁」导致低级实现错误。',
      concept: 'tao',
    },
  ],
  [
    ['Thought', '模型对下一步的推理，参与决策'],
    ['Action', '模型决定执行的动作（调工具/finish）'],
    ['Observation', '工具执行结果，环境回填'],
  ],
  [
    '把 Observation 当模型输出解析，或把 Thought 当工具调用执行。',
    'Observation 写得像日志，模型读不懂导致下一轮误判。',
  ],
)
