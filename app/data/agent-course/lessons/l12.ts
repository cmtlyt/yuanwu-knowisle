import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L12 = withKind(
  L(
    'L12',
    2,
    'ReAct：最通用的基线范式',
    1,
    ['L11'],
    ['react'],
    [
      '掌握 ReAct 的「推理-行动-观测」交替循环',
      '理解 ReAct 为何是最通用的基线',
      '认识 ReAct 的适用场景与代价',
    ],
    `
### ReAct = Reasoning + Acting

ReAct 让模型在每个回合交替做两件事：先**推理**（Thought，下一步该做什么），再**行动**（Action，调用工具），然后接收**观测**（Observation，工具结果），把观测回填上下文继续下一轮。

\`\`\` title="ReAct 一个回合的形状" note="注意每一轮都是「先想一句、再做一个动作」，观测结果决定下一轮想什么。"
Question: 北京今天天气如何，适合跑步吗？

Thought: 我需要先查北京今天的天气，再判断是否适合跑步。
Action: search_weather(city="北京")
Observation: 晴，18°C，微风，空气质量优

Thought: 18°C 微风、空气质量优，适合户外跑步。
Action: finish(answer="适合，18°C 微风空气质量优")
\`\`\`

:::deep

### 为什么 ReAct 是基线

ReAct 的「交替」结构是所有更复杂范式的地基：ToT 是并行展开多条 ReAct 路径，Reflexion 是在 ReAct 循环外加一层失败反思。掌握 ReAct，其余范式只是在这个骨架上加东西。

:::

### ReAct 的优势与代价

- 优势：通用、直观、边做边看能即时纠偏，工具多、步骤长也能应付。
- 代价：每走一步都要一次模型调用，token 消耗大；不显式规划，可能走弯路。

:::warn

### Thought 不是装饰

Thought 不是给用户看的注释，而是**参与决策的上下文**——它会影响模型下一轮的判断。砍掉 Thought 的「纯 Action」循环会明显变笨。

:::

`,
    null,
    [
      {
        text: 'ReAct 的核心结构是？',
        options: [
          '先规划后执行',
          '推理（Thought）-行动（Action）-观测（Observation）交替',
          '树搜索回溯',
          '多路径投票',
        ],
        answer: 1,
        explain: 'ReAct 每回合交替进行推理、行动、观测，观测回填后继续。',
        concept: 'react',
      },
      {
        text: 'ReAct 被称为「基线范式」的原因是？',
        options: [
          '它最简单所以不用学',
          '更复杂的范式（ToT/Reflexion）都在它骨架上加东西',
          '它没有缺点',
          '它是唯一正确的',
        ],
        answer: 1,
        explain: 'ReAct 的交替结构是 ToT、Reflexion 等地基。',
        concept: 'react',
      },
      {
        text: 'ReAct 中 Thought 的作用是？',
        options: [
          '给用户看的注释，可删除',
          '参与决策的上下文，影响模型下一轮判断',
          '只用于日志',
          '只用于评测',
        ],
        answer: 1,
        explain: 'Thought 参与决策，砍掉会让模型变笨。',
        concept: 'react',
      },
    ],
    [
      ['Thought', '模型对「下一步该做什么」的推理，参与决策'],
      ['Action', '模型选择要执行的动作（工具调用或 finish）'],
      ['Observation', '工具执行结果，回填上下文影响下一轮'],
    ],
    [
      '把 Thought 当装饰删掉，导致循环退化、决策质量下降。',
      '以为 ReAct 只能处理简单任务——它通用，只是长任务 token 消耗大。',
    ],
  ),
  'theory',
)
