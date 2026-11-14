import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L132 = withKind(
  L(
    'L132',
    26,
    '实战 Capstone A：从零接入评测与 Agent 检测，建立回归基线',
    4,
    ['L131'],
    ['cap-a-eval'],
    [
      '从零搭建针对「执行型 Agent」的评测与 agent 检测',
      '建立 Capstone A 的回归基线',
      '理解「动作正确率」这类执行型指标的评测方法',
    ],
    `
### 执行型 Agent 评测什么？

Capstone A 是「动手做事」的 Agent，所以核心指标不是「回答得好不好」，而是「动作对不对」：工具选对了吗？参数对吗？副作用符合预期吗？还有「agent 检测」——是否在无意义地空转。

\`\`\` title="执行型评测：动作正确率 + agent 检测（不复用 L81）" note="关键：执行型 Agent 的评测是「轨迹级」的——对照期望动作序列，而不是看最终文本。"
// 评测用例：给定任务 + 期望动作序列
const cases = [
  { task: "重启 web 服务", expect: [
      { tool: "诊断Agent.查指标", param: { svc: "web" } },
      { tool: "执行Agent.重启服务", param: { svc: "web" } },
  ]},
]

// 动作正确率 = 期望动作在轨迹中按序出现 / 总用例数
function actionAccuracy(trace: Span[], expect: Step[]): number {
  const got = trace.filter(s => s.name.includes(".")).map(s => s.name)
  return expect.every((e, i) => got[i] === e.tool) ? 1 : 0
}

// agent 检测：步数超阈值、动作重复无进展 → 判「空转」
function detectSpin(trace: Span[]): boolean {
  return trace.length > MAX_STEPS || repeatedAction(trace)
}
\`\`\`

:::deep

### 回归基线：用「固定用例集」守住质量

回归基线的意义是「每次改动后重跑同一批用例，质量不能倒退」。Capstone A 的基线就是一批「任务 → 期望动作」用例。每次改 prompt/工具/编排，都重跑这批用例，动作正确率跌破阈值就说明改坏了（对照 L80/L126）。

:::

### Capstone A 评测验收点

- 有一批「任务 → 期望动作序列」的评测用例。
- 能计算动作正确率、平均步数、空转率。
- agent 检测能识别「空转 / 无进展」的运行。
- 每次改动后重跑基线，能发现质量倒退。

:::warn

### 执行型 Agent 别只看「最终文本」

执行型 Agent 的最终文本可能是「已完成」，但动作可能是错的（重启了错误的服务、漏了参数）。所以必须评测「动作轨迹」，而不是「输出文案」。这是执行型与研究型（Capstone B）评测的最大区别。

:::

`,
    null,
    [
      {
        text: '执行型 Agent 的核心评测指标是？',
        options: ['文笔', '动作正确率（动作轨迹对照期望）', '响应速度', 'UI 美观'],
        answer: 1,
        explain: '执行型看动作不看文案。',
        concept: 'cap-a-eval',
      },
      {
        text: '「agent 检测」主要识别什么？',
        options: ['内存泄漏', '空转 / 无进展的运行', '网络延迟', '代码风格'],
        answer: 1,
        explain: '识别空转、无进展。',
        concept: 'cap-a-eval',
      },
      {
        text: '回归基线的作用是？',
        options: ['一次性评测', '每次改动后重跑同批用例，防止质量倒退', '替代测试', '优化性能'],
        answer: 1,
        explain: '守住质量不倒退。',
        concept: 'cap-a-eval',
      },
    ],
    [
      ['轨迹级评测', '对照期望动作序列的评测'],
      ['动作正确率', '期望动作按序出现 / 总用例'],
      ['agent 检测', '识别空转/无进展'],
      ['回归基线', '固定用例集防止质量倒退'],
    ],
    ['执行型 Agent 只看最终文本，不看动作轨迹。', '评测只跑一次，不建立可重复的回归基线。'],
  ),
  'capstone',
)
