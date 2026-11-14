import { L } from '../../course-builders.ts'

/* ========== Stage 3 ========== */

export const L30 = L(
  'L30',
  3,
  '实战：同一任务跑三种范式并对比（成本 / 质量度量）',
  20,
  3,
  ['L28', 'L15', 'L13'],
  ['paradigm-benchmark'],
  [
    '为同一任务分别实现并跑通 ReAct / P&E / ToT 三种范式',
    '建立「成本 + 质量」双维度度量，客观对比',
    '对照三种范式在 LangGraph 中的实现差异',
  ],
  `
### 不靠感觉，靠度量

「哪种范式更好」不是玄学，是可以量化的。本课用同一任务跑三种范式，记录调用次数、token、耗时、正确率，得出客观对比。

\`\`\` title="度量基线：统一的任务与指标" note="关键：\\\`evaluator\\\` 是同一把尺子，三个范式的结果都用它判断对错，才能公平对比。"
interface RunMetrics {
  paradigm: string
  llmCalls: number      // 模型调用次数
  tokens: number        // 总 token（估算）
  latencyMs: number     // 总耗时
  correct: boolean      // 结果是否正确
}

async function bench(task: string, evaluator: (r: string) => boolean) {
  const runs: RunMetrics[] = []
  runs.push(await runReact(task, evaluator))   // ReAct
  runs.push(await runPlanExecute(task, evaluator)) // P&E
  runs.push(await runToT(task, evaluator))     // ToT
  return compare(runs)
}
\`\`\`

:::deep

### 一份典型对比（示意）

对「多步调研 + 汇总」类任务：ReAct 调用最多但灵活；P&E 调用少、流程清晰、可控；ToT 在「有探索空间」的任务上正确率最高但 token 最高。结论不唯一——**同一任务、不同指标、不同最优**，这正是选型矩阵存在的意义。

:::

### 本次实战要落地的三件事

- 统一 evaluator：三条范式共享同一正确性判断。
- 统一记录：llmCalls / tokens / latency / correct 四指标全量采集。
- 输出对比表：把结果落成一张可读的对比，而非散落的日志。

:::tip

### 框架对照：LangGraph 三种实现

LangGraph 里 ReAct 是「model→tool→model」的小图；P&E 是「planner→executor→replan」；ToT 是「expand→score→prune 的树遍历」自定义节点图。三种实现的差异在**图的拓扑**——这与你手写版的差异点完全对应。

:::

`,
  null,
  [
    {
      text: '三种范式公平对比的前提是？',
      options: ['都用同一模型', '共享同一 evaluator 判断正确性', '都不调工具', '代码行数相同'],
      answer: 1,
      explain: '同一把尺子判断对错，对比才公平。',
      concept: 'paradigm-benchmark',
    },
    {
      text: '对比的四个关键指标是？',
      options: [
        '代码行数、注释数、变量数、函数数',
        'llmCalls / tokens / latency / correct',
        '模型名、温度、top-p、seed',
        '工具数、内存、CPU、磁盘',
      ],
      answer: 1,
      explain: '调用次数、token、耗时、正确性。',
      concept: 'paradigm-benchmark',
    },
    {
      text: 'LangGraph 中三种范式的实现差异体现在？',
      options: ['变量命名', '图的拓扑（节点与边的结构）', '配色', '日志格式'],
      answer: 1,
      explain: '三种范式的差异就是图的拓扑差异。',
      concept: 'paradigm-benchmark',
    },
  ],
  [
    ['benchmark', '在同一任务、同一评估尺子下对比多范式的过程'],
    ['evaluator', '判断结果正确性的统一函数'],
    ['指标采集', '记录调用次数 / token / 耗时 / 正确性'],
  ],
  ['用不同 evaluator 对比三范式，结果不可比。', '只看「哪个对」不看「花了多少」，忽视了成本维度。'],
)
