import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L133 = withKind(
  L(
    'L133',
    26,
    '实战 Capstone A：从零加安全护栏 + 成本优化 + 降级兜底',
    4,
    ['L132'],
    ['cap-a-safety'],
    [
      '从零为执行型 Agent 加上安全护栏与沙箱隔离',
      '从零实现模型路由与成本优化',
      '从零实现降级兜底，保证执行型 Agent 稳定',
    ],
    `
### 执行型 Agent 的安全是「硬需求」

Capstone A 会「产生副作用」（重启服务、写数据），所以安全护栏必须拉满：工具最小权限、危险操作确认、输出护栏。同时要做成本优化（模型路由）和降级兜底。不复用 L84/L89/L124，思路一致。

\`\`\` title="安全护栏 + 成本路由 + 降级兜底（从零）" note="关键：执行型 Agent 的安全护栏聚焦「危险动作要确认、工具要分级、沙箱要隔离」。"
// ① 安全护栏：工具分级 + 危险操作确认（人在回路 L71）
const tools = {
  "查日志": { level: "read", exec },
  "重启服务": { level: "write", exec, confirm: true },  // 需人工确认
}
async function execTool(name, params) {
  if (tools[name].confirm && !await askHuman(name, params)) return "已取消"
  return tools[name].exec(params)
}

// ② 成本路由：简单任务用便宜模型，复杂任务用强模型（L89 思路）
const model = route({ task, budget })  // 分流

// ③ 降级兜底：模型超时 → 熔断 → 备用模型 / 明确降级（L124 思路）
const res = await call(model, messages).catch(fallback)
\`\`\`

:::deep

### 人在回路是执行型 Agent 的安全底牌

对「不可逆的副作用」（重启生产、删数据、扣款），最可靠的安全措施不是「模型自己判断」，而是「关键动作交还人类确认」（L71 人在回路）。这比任何 prompt 护栏都更硬——因为护栏可能被绕过，人不会。

:::

### 安全 + 成本 + 降级的验收点

- 工具分级：read/write 分明，write 类可配置「需确认」。
- 危险操作有「人在回路」确认，可取消。
- 沙箱隔离：工具执行在受限环境，不碰生产密钥。
- 成本路由：简单任务走便宜模型，成本可度量。
- 降级兜底：模型/工具超时不会让整个任务崩掉。

:::warn

### 护栏可能被绕过，人不会

prompt 级护栏（「不许执行危险操作」）可能被提示注入绕过（L83/L84）。所以对不可逆副作用，唯一可靠的是「工具分级 + 人在回路确认」，把安全从「劝模型」升级到「卡工具」。

:::

`,
    null,
    [
      {
        text: '执行型 Agent 最可靠的安全措施是？',
        options: ['更长的安全 prompt', '危险动作「人在回路」确认', '更贵的模型', '更多日志'],
        answer: 1,
        explain: '护栏可被绕过，人不会。',
        concept: 'cap-a-safety',
      },
      {
        text: '「工具分级」的意义是？',
        options: ['更快', 'read/write 分明，write 类可配置确认', '更省 token', '更美观'],
        answer: 1,
        explain: '按风险分级，危险动作额外确认。',
        concept: 'cap-a-safety',
      },
      {
        text: 'prompt 级护栏的局限是？',
        options: ['太慢', '可能被提示注入绕过', '太贵', '没人用'],
        answer: 1,
        explain: '劝模型不如卡工具。',
        concept: 'cap-a-safety',
      },
    ],
    [
      ['人在回路', '关键动作交还人类确认'],
      ['工具分级', '按风险给工具分 read/write 等级'],
      ['沙箱隔离', '工具执行在受限环境'],
    ],
    [
      '把安全寄托在「prompt 里劝模型别乱来」，而不是工具分级 + 人在回路。',
      '执行型 Agent 不隔离沙箱，工具直接触碰生产环境。',
    ],
  ),
  'capstone',
)
