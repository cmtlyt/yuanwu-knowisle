import { L, withKind } from '../../course-builders.ts'

/* ========== Stage 5 ========== */

export const L40 = withKind(
  L(
    'L40',
    5,
    '工具执行的安全边界（超时 / 权限 / 回滚）',
    3,
    ['L39'],
    ['tool-safety'],
    [
      '理解工具执行必须由代码兜底的三个安全边界',
      '掌握超时、权限校验、回滚的基本实现',
      '建立「模型提决策，代码保安全」的落地习惯',
    ],
    `
### 工具是 Agent 的手，也是最大的风险

工具能读写外部系统、花真钱、删数据。所以工具执行不能信任模型「点到为止」，必须由代码在三个边界兜底：**超时**（别卡死）、**权限**（别越权）、**回滚**（别不可逆）。

\`\`\` title="三个安全边界的最小实现" note="权限在「执行前」，超时在「执行中」，回滚在「失败后」——三道防线覆盖工具生命周期。"
async function safeRun(tool: Tool, args: unknown, ctx: RunContext) {
  // ① 权限：执行前校验
  if (!ctx.permissions.includes(tool.name))
    throw new Error("无权调用工具: " + tool.name)

  // ② 超时：执行加时间上限
  const timer = setTimeout(() => abort(), tool.timeoutMs ?? 5000)

  try {
    return await tool.run(args)
  } catch (e) {
    // ③ 回滚：失败时执行补偿操作
    if (tool.compensate) await tool.compensate(args)
    throw e
  } finally {
    clearTimeout(timer)
  }
}
\`\`\`

:::deep

### 最小权限原则

工具只给「完成任务所需的最小权限」。一个「查天气」的工具不该有「删除用户」的能力。权限最小化 + 白名单，是工具安全的第一性原理（详见 L85）。

:::

### 三类高风险工具

- 副作用工具：发邮件、发消息、扣款——需要人工确认或严格上限。
- 写操作：删除、更新数据库——需要回滚（compensate）能力。
- 外部调用：访问第三方 API——需要超时与限流。

:::warn

### 回滚不是万能的

有些副作用不可逆（已发出的邮件、已完成的扣款）。这类工具宁可「执行前人工确认」，也不要指望「失败后回滚」。

:::

`,
    null,
    [
      {
        text: '工具执行的三个安全边界是？',
        options: ['加密、签名、哈希', '超时、权限、回滚', '缓存、限流、重试', '日志、监控、告警'],
        answer: 1,
        explain: '超时、权限、回滚。',
        concept: 'tool-safety',
      },
      {
        text: '「最小权限原则」指什么？',
        options: ['工具越多越好', '工具只给完成任务所需的最小权限', '权限全开', '不设权限'],
        answer: 1,
        explain: '只给必要权限，查天气不该能删用户。',
        concept: 'tool-safety',
      },
      {
        text: '对不可逆副作用（发邮件/扣款）的正确做法是？',
        options: ['失败后回滚', '执行前人工确认，而非指望回滚', '不做任何限制', '自动重试'],
        answer: 1,
        explain: '不可逆副作用要执行前确认。',
        concept: 'tool-safety',
      },
    ],
    [
      ['最小权限', '工具只授予完成任务所需的最小能力'],
      ['回滚 compensate', '失败后执行的补偿操作'],
      ['副作用工具', '会改变外部状态的工具（发消息/扣款/写库）'],
    ],
    ['信任模型「点到为止」，不设权限白名单。', '对不可逆副作用指望失败后回滚，而非执行前确认。'],
  ),
  'practice',
)
