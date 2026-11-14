import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 12 ========== */

export const L74 = withKind(
  L(
    'L74',
    12,
    '回放失败现场：调试 Agent 的正确姿势',
    3,
    ['L73'],
    ['replay-debug'],
    [
      '理解「回放」如何复现 Agent 的失败现场',
      '掌握「确定性回放」与「记录即回放」两种方式',
      '认识 Agent 调试与普通程序调试的本质差异',
    ],
    `
### Agent 的 bug 是「偶发」的

普通程序的 bug 可复现（同样的输入同样的错）；Agent 的 bug 因为模型采样随机性，往往「时好时坏」。调试的正确姿势是**回放**：把失败的完整轨迹存下来，之后用同一份轨迹复现。

\`\`\` title="两种回放方式" note="两种方式互补：确定性回放适合「复现 bug」，记录回放适合「分析当时发生了什么」。"
// ① 确定性回放：固定 seed / temperature=0，让模型输出可复现
const trace = await runAgent(task, { temperature: 0, seed: 42 })
//   同样的 seed + 输入 → 同样的输出，bug 可稳定复现

// ② 记录即回放：把失败的完整轨迹存下来，回放时直接重放模型输出
const recorded = { messages: [...], toolCalls: [...], results: [...] }
await saveReplay(recorded)
//   回放：不重新调模型，直接按记录重放每一步
\`\`\`

:::deep

### 为什么回放这么重要

Agent 的失败往往是「某一步模型输出了奇怪的东西」导致的连锁反应。没有回放，你只能看到「最终错了」，看不到「哪一步开始错的」。回放让你能逐步重放、定位到「第一个偏离预期的 span」。

:::

### 回放调试的要点

- 存完整轨迹：messages + toolCalls + 结果 + 时间戳。
- 可逐步重放：定位「第一个偏离预期的步骤」。
- 记录环境：模型版本、参数、工具版本，否则回放结果不一致。

:::warn

### 回放 ≠ 简单重跑

简单重跑会因为采样随机性得到不同结果（bug 可能不出现）。真正的回放要么固定 seed，要么直接重放记录的输出。

:::

`,
    null,
    [
      {
        text: 'Agent 的 bug 为什么「偶发」？',
        options: ['代码随机', '模型采样随机性，同样输入可能不同输出', '网络抖动', '内存泄漏'],
        answer: 1,
        explain: '采样随机性导致时好时坏。',
        concept: 'replay-debug',
      },
      {
        text: '「确定性回放」靠什么实现？',
        options: ['固定 seed / temperature=0', '多跑几次', '换模型', '加日志'],
        answer: 0,
        explain: '固定 seed + temperature=0 让输出可复现。',
        concept: 'replay-debug',
      },
      {
        text: '回放与简单重跑的区别是？',
        options: [
          '没区别',
          '回放固定 seed 或重放记录输出，简单重跑可能不出现 bug',
          '回放更慢',
          '回放不用模型',
        ],
        answer: 1,
        explain: '简单重跑因随机性可能不出现 bug。',
        concept: 'replay-debug',
      },
    ],
    [
      ['确定性回放', '固定 seed/temperature 让输出可复现'],
      ['记录回放', '重放已记录的完整轨迹'],
      ['偏离定位', '找到第一个偏离预期的 span'],
    ],
    ['简单重跑当回放，随机性导致 bug 不出现、白费功夫。', '不记录模型版本与参数，回放结果不一致。'],
  ),
  'practice',
)
