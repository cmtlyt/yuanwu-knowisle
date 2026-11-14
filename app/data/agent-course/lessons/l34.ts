import { L } from '../../course-builders.ts'

/* ========== Stage 4 ========== */

export const L34 = L(
  'L34',
  4,
  '让 Agent 知道「该停了」：终止与回归',
  12,
  2,
  ['L31'],
  ['termination'],
  [
    '掌握三类终止条件：显式 finish / 步数上限 / 超时',
    '理解「终止」与「回归」的关系（正常收尾 vs 异常回退）',
    '避免「该停不停」「不该停硬停」两类错误',
  ],
  `
### 终止不是「模型自觉」

Agent 不会自动知道该停。终止必须由代码显式保证：模型说 finish、步数到上限、时间到上限，三者任一触发都要停。

\`\`\` title="三类终止条件" note="三者缺一不可：模型可能「忘」说 finish，可能陷入死循环，可能单步卡死。"
async function run(state, { maxSteps, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  while (true) {
    if (state.done) return { ok: true, result: state.answer }  // ① 显式 finish
    if (state.steps >= maxSteps)                                // ② 步数上限
      return { ok: false, reason: "超出步数上限" }
    if (Date.now() > deadline)                                  // ③ 超时
      return { ok: false, reason: "超时" }
    // ... 决定、执行、回填
  }
}
\`\`\`

:::deep

### 终止 vs 回归

「终止」是停止循环；「回归」（return）是停止后给调用方一个**可处理的返回值**。正常结束返回结果，异常终止返回带 reason 的失败结果——调用方据此决定重试、降级还是报错。两者是「停」与「停之后怎么交代」的关系。

:::

### 两类错误

- 该停不停：模型不说 finish、又没步数/超时上限 → 死循环烧 token。
- 不该停硬停：步数上限设太小，任务没做完就被截断 → 结果残缺。

:::warn

### 上限要随任务定

简单任务 maxSteps=5 足够，复杂任务可能需要 20+。把上限写死成「永远 10 步」会导致「该停不停 / 不该停硬停」交替出现。上限应可配置，并按任务难度调整。

:::

`,
  null,
  [
    {
      text: '三类终止条件是？',
      options: ['内存、CPU、磁盘', '显式 finish / 步数上限 / 超时', '鉴权、限流、重试', '输入、输出、反馈'],
      answer: 1,
      explain: 'finish、步数上限、超时三者缺一不可。',
      concept: 'termination',
    },
    {
      text: '「终止」与「回归」的关系是？',
      options: [
        '完全等同',
        '终止是停止循环，回归是停止后给调用方可处理的返回值',
        '回归在终止之前',
        '互不相关',
      ],
      answer: 1,
      explain: '终止是「停」，回归是「停之后怎么交代」。',
      concept: 'termination',
    },
    {
      text: '「不该停硬停」的原因通常是？',
      options: ['模型太聪明', '步数/超时上限设太小，任务没做完被截断', '工具太多', '温度太低'],
      answer: 1,
      explain: '上限设太小导致任务被截断。',
      concept: 'termination',
    },
  ],
  [
    ['显式 finish', '模型输出的「任务完成」信号'],
    ['步数上限', '防止死循环的最大迭代次数'],
    ['超时', '单次运行的总时间上限'],
  ],
  ['只依赖模型说 finish，没有步数/超时兜底，死循环烧 token。', '步数上限写死且过小，复杂任务频繁被截断。'],
)
