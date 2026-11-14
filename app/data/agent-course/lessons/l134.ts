import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L134 = withKind(
  L(
    'L134',
    26,
    '实战 Capstone A：从零部署上线 + 全链路复盘',
    4,
    ['L133'],
    ['cap-a-deploy'],
    [
      '把 Capstone A 从零部署上线（状态外置 + 可灰度 + 可监控）',
      '完成 Capstone A 交付物的全链路复盘',
      '输出一份可演示、可评测、可部署的完整交付物',
    ],
    `
### Capstone A 的最后一课：部署与复盘

把 L128–L133 从零构建的所有组件，组装成一个可部署的服务，并做全链路复盘。不复用 L127，但部署清单的思想一致（状态外置/灰度/监控/兜底）。这课的产物是 Capstone A 的最终交付物。

\`\`\` title="Capstone A 交付物组装（从零）" note="关键：交付物不是「一堆代码」，而是「可演示 + 可评测 + 可部署 + 有复盘」的完整系统。"
// 把所有组件串成一个可部署服务
export async function serve(req) {
  const sid = req.sessionId
  const state = await store.get(sid)              // 状态外置(L123思路)
  const variant = canary.pick(req.userId)          // 灰度(L125思路)

  const trace = await tracer.trace("request", null, async () => {  // 追踪(L131)
    return await supervise(req.task)               // 多Agent编排(L130)
  })

  await evalBaseline.log(req.task, trace)           // 回归评测(L132)
  await store.set(sid, appendState(state, trace))   // 落盘
  return trace
}

// 复盘清单：交付物 = 代码 + 架构图 + 评测基线 + 部署配置 + 复盘文档
\`\`\`

:::deep

### 复盘：把「做了什么」沉淀成「学到了什么」

Capstone 的价值一半在「做出来」，一半在「复盘」：哪些设计对了、哪些走了弯路、如果重做会怎么改。这份复盘是你从「跟着学」走向「独立做」的关键一步。对照 L126 的全生命周期，复盘是「迭代」环节的起点。

:::

### Capstone A 交付物清单

- 核心代码：运行时 + 工具 + MCP + 多 Agent + 追踪 + 评测 + 安全 + 部署。
- 架构图：一张能讲清整体设计的图。
- 评测基线：一批「任务 → 期望动作」用例 + 基线分数。
- 部署配置：状态外置 + 灰度 + 监控告警的配置。
- 复盘文档：设计决策、踩坑、改进方向。

:::tip

### 演示脚本是交付物的一部分

准备一个「演示脚本」：一个能打动人的场景（如「一条告警进来 → Agent 诊断 → 执行修复 → 展示追踪树」）。它证明的不只是「代码能跑」，而是「系统有价值」。

:::

`,
    null,
    [
      {
        text: 'Capstone A 的交付物是？',
        options: ['一堆代码', '可演示 + 可评测 + 可部署 + 有复盘的完整系统', '一份 PPT', '一个模型'],
        answer: 1,
        explain: '完整系统，不只是代码。',
        concept: 'cap-a-deploy',
      },
      {
        text: '「复盘」的价值在于？',
        options: ['凑字数', '把「做了什么」沉淀成「学到什么」，是从学到做的关键', '显得专业', '应付检查'],
        answer: 1,
        explain: '复盘是独立做的起点。',
        concept: 'cap-a-deploy',
      },
      {
        text: '演示脚本的作用是？',
        options: ['展示代码行数', '用真实场景证明系统有价值', '替代文档', '省略评测'],
        answer: 1,
        explain: '证明价值，而非代码能跑。',
        concept: 'cap-a-deploy',
      },
    ],
    [
      ['交付物', '代码+架构+评测+部署+复盘的完整系统'],
      ['复盘', '沉淀设计决策与改进方向'],
      ['演示脚本', '用真实场景证明价值'],
    ],
    [
      '把交付物当「代码合集」，缺架构图、评测基线、部署配置、复盘。',
      '部署不接状态外置/灰度/监控，交付一个「本地能跑」的半成品。',
    ],
  ),
  'capstone',
)
