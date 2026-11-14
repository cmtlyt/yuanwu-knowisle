import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L35 = withKind(
  L(
    'L35',
    4,
    '用状态机建模 Agent 行为',
    2,
    ['L31'],
    ['state-machine'],
    [
      '理解用有限状态机显式建模 Agent 行为的价值',
      '掌握状态、转移、事件三要素',
      '认识状态机如何让「该做什么」可预测、可调试',
    ],
    `
### 把「下一步做什么」显式化

Agent 的行为可以用有限状态机（FSM）建模：有限个**状态**（思考中 / 调工具 / 等待观测 / 已结束），在**事件**（拿到回复 / 工具返回 / 出错）驱动下发生**转移**。这让「该做什么」变得可预测、可枚举。

\`\`\` title="Agent 的最小状态机" note="注意：\\\`error\\\` 状态是显式的，且有 \\\`retry\\\` / \\\`giveUp\\\` 两条出路——错误不再是「崩溃」，而是「可恢复的状态」。"
type AgentState = "thinking" | "acting" | "observing" | "done" | "error"

transitions = {
  thinking: { gotAction: "acting", gotFinish: "done" },
  acting:   { toolOk: "observing", toolFail: "error" },
  observing:{ gotObservation: "thinking" },
  error:    { retry: "thinking", giveUp: "done" },
}

// 状态机驱动：当前状态 + 事件 → 下一状态
function next(state, event) { return transitions[state][event] ?? "error" }
\`\`\`

:::deep

### 状态机的三个收益

① 可预测：所有状态与转移显式枚举，不会有「意想不到的路径」。② 可调试：出问题时知道「卡在哪个状态、缺哪个事件」。③ 可测试：每个转移都能单测，不靠跑整段流程。

:::

### 何时用状态机

- 流程分支多、需要明确生命周期时（如多 Agent 协作、审批流）。
- 需要「错误可恢复」而非「异常即崩溃」时。
- 需要向用户展示「当前进度在哪一步」时。

:::warn

### 别过度建模

简单循环（ReAct）不一定需要完整 FSM——过度建模会让简单逻辑变重。状态机适合「分支多、生命周期明确」的场景，不是所有 Agent 的标配。

:::

`,
    null,
    [
      {
        text: '有限状态机的三要素是？',
        options: ['类、对象、方法', '状态、事件、转移', '输入、处理、输出', '模型、工具、记忆'],
        answer: 1,
        explain: '状态、事件、转移。',
        concept: 'state-machine',
      },
      {
        text: '状态机中「error」状态的价值是？',
        options: ['让程序崩溃', '错误可恢复：显式状态 + retry/giveUp 出路', '减少代码', '加快速度'],
        answer: 1,
        explain: '错误不再是崩溃，而是可恢复的状态。',
        concept: 'state-machine',
      },
      {
        text: '状态机的收益不包括？',
        options: ['可预测', '可调试', '可测试', '免费用模型'],
        answer: 3,
        explain: '收益是可预测、可调试、可测试。',
        concept: 'state-machine',
      },
    ],
    [
      ['有限状态机', '有限状态 + 事件驱动转移的行为模型'],
      ['转移', '在当前状态收到事件后进入下一状态'],
      ['事件', '触发状态变化的外部/内部信号'],
    ],
    ['把错误当成「异常即崩溃」，而非「可恢复状态」。', '对简单 ReAct 循环过度建模，引入不必要的复杂度。'],
  ),
  'practice',
)
