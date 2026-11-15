import type { Concept } from '~/types/course'

/* ---------------- 知识点图谱（30 概念） ---------------- */
export const CONCEPTS: Concept[] = [
  // S0 方法论
  { id: 'h-harness-def', name: 'Harness 定义与四控制面', stage: 0, weight: 4, prereqs: [] },
  { id: 'h-evidence-method', name: '证据分级与基准读法', stage: 0, weight: 4, prereqs: ['h-harness-def'] },

  // S1 Claude Code
  {
    id: 'h-cc-permission-runtime',
    name: 'Claude Code 权限运行时',
    stage: 1,
    weight: 3,
    prereqs: ['h-harness-def'],
  },
  {
    id: 'h-cc-instruction-carriers',
    name: '七种指令载体与取舍',
    stage: 1,
    weight: 3,
    prereqs: ['h-cc-permission-runtime'],
  },

  // S2 Codex CLI
  { id: 'h-codex-sandbox', name: '沙箱三档与平台实现', stage: 2, weight: 3, prereqs: ['h-harness-def'] },
  { id: 'h-codex-approval', name: '审批策略与信任模型', stage: 2, weight: 3, prereqs: ['h-codex-sandbox'] },

  // S3 DeepSeek Harness
  { id: 'h-dsh-plugin-kernel', name: 'Cordis 插件内核', stage: 3, weight: 3, prereqs: ['h-harness-def'] },
  {
    id: 'h-dsh-benchmark-flaws',
    name: 'DSH 榜单表现与缺陷读法',
    stage: 3,
    weight: 3,
    prereqs: ['h-evidence-method'],
  },

  // S4 Hermes
  { id: 'h-hermes-memory-loop', name: '记忆与学习闭环', stage: 4, weight: 3, prereqs: ['h-harness-def'] },
  {
    id: 'h-hermes-gateway',
    name: '消息网关与平台适配',
    stage: 4,
    weight: 2,
    prereqs: ['h-hermes-memory-loop'],
  },

  // S5 Pi
  { id: 'h-pi-minimal-core', name: '极简内核哲学', stage: 5, weight: 3, prereqs: ['h-harness-def'] },
  { id: 'h-pi-extensibility', name: '扩展机制与会话树', stage: 5, weight: 2, prereqs: ['h-pi-minimal-core'] },

  // S6 OpenCode
  { id: 'h-opencode-service', name: '常驻服务架构', stage: 6, weight: 3, prereqs: ['h-harness-def'] },
  {
    id: 'h-opencode-codemode',
    name: 'Code Mode 与插件热重载',
    stage: 6,
    weight: 3,
    prereqs: ['h-opencode-service'],
  },

  // S7–S15 单课系统
  { id: 'h-mini-bash-only', name: 'bash-only 极简路线', stage: 7, weight: 3, prereqs: ['h-pi-minimal-core'] },
  { id: 'h-kimi-pi-tui', name: '内核复用与信任分级', stage: 8, weight: 2, prereqs: ['h-pi-extensibility'] },
  { id: 'h-qwen-runtime-base', name: '从分叉到运行基座', stage: 9, weight: 2, prereqs: ['h-harness-def'] },
  {
    id: 'h-cline-approval-first',
    name: '审批优先工作流',
    stage: 10,
    weight: 2,
    prereqs: ['h-cc-permission-runtime'],
  },
  { id: 'h-kilo-platform', name: 'open-core 许可边界', stage: 11, weight: 2, prereqs: ['h-evidence-method'] },
  { id: 'h-grok-tui', name: '全屏 TUI 形态', stage: 12, weight: 2, prereqs: ['h-harness-def'] },
  {
    id: 'h-letta-memory-tier',
    name: '分层记忆模型',
    stage: 13,
    weight: 3,
    prereqs: ['h-hermes-memory-loop'],
  },
  {
    id: 'h-openhands-control-center',
    name: '控制中心转型',
    stage: 14,
    weight: 2,
    prereqs: ['h-harness-def'],
  },
  {
    id: 'h-openclaw-gateway-risk',
    name: '网关控制面与安全边界',
    stage: 15,
    weight: 3,
    prereqs: ['h-evidence-method'],
  },

  // S16 横向
  { id: 'h-x-landscape-table', name: '全景对照维度', stage: 16, weight: 4, prereqs: ['h-harness-def'] },
  {
    id: 'h-x-benchmark-reading',
    name: '基准横向交叉读法',
    stage: 16,
    weight: 4,
    prereqs: ['h-evidence-method'],
  },
  { id: 'h-x-arch-schools', name: '四大架构流派', stage: 16, weight: 4, prereqs: ['h-x-landscape-table'] },
  {
    id: 'h-x-selection',
    name: '场景化选型决策',
    stage: 16,
    weight: 4,
    prereqs: ['h-x-benchmark-reading', 'h-x-arch-schools'],
  },
]
