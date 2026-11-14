import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 15 ========== */

export const L89 = L(
  'L89',
  15,
  '实战：实现模型路由（provider 抽象 + 按成本/质量分流）',
  20,
  4,
  ['L88'],
  ['routing-impl'],
  [
    '用 TS 实现 provider 抽象 + 路由分流的模型路由',
    '实现成本/质量分流的决策逻辑',
    '对照 Vercel AI SDK provider 切换 / LiteLLM 思路',
  ],
  [
    prose(
      '把 L88 的路由写成可运行代码',
      '本课实现一个 provider 抽象层 + 路由器：统一不同模型的接口，按成本/质量策略分流。',
    ),
    code(
      'provider 抽象 + 路由',
      'interface ModelProvider {\n  name: string\n  costPer1kTokens: number\n  chat(messages: Message[]): Promise<string>\n}\n\nclass Router {\n  constructor(private tiers: { cheap: ModelProvider; strong: ModelProvider }) {}\n\n  async route(task: string): Promise<string> {\n    // ① 难度评估（可用规则/小模型判断）\n    const complexity = await assessComplexity(task)   // "simple" | "complex"\n\n    // ② 分流：简单走 cheap，复杂走 strong\n    const model = complexity === "simple" ? this.tiers.cheap : this.tiers.strong\n\n    // ③ 兜底：cheap 失败或质量不够 → 升级 strong\n    try {\n      const out = await model.chat([{ role: "user", content: task }])\n      if (complexity === "simple" && !qualityOk(out)) {\n        return this.tiers.strong.chat([{ role: "user", content: task }])\n      }\n      return out\n    } catch {\n      return this.tiers.strong.chat([{ role: "user", content: task }])  // 失败升级\n    }\n  }\n}',
      '关键：provider 抽象统一接口（可换任何模型），路由做「难度分流 + 质量/失败兜底」。',
    ),
    call(
      'deep',
      '框架对照：AI SDK / LiteLLM',
      'Vercel AI SDK 的 provider 抽象让你一行切换模型（`openai` / `anthropic` / 自定义），路由逻辑仍要自己写；LiteLLM（Python）则内置了「fallback / retry / budget」路由。你手写的 Router 是它们的核心思想的最小实现。',
    ),
    list('provider 抽象的三个收益', [
      '可替换：换模型/供应商不改业务代码。',
      '可对比：统一接口下方便对比各模型的成本与质量。',
      '可扩展：新增模型只需实现 ModelProvider 接口。',
    ]),
    call(
      'warn',
      '难度评估别太重',
      '如果 assessComplexity 本身又调一次大模型，路由省的钱就没了。评估要轻量（规则或小模型）。',
    ),
  ],
  null,
  [
    q(
      'provider 抽象的核心收益是？',
      ['代码更短', '可替换、可对比、可扩展（换模型不改业务代码）', '更快', '省内存'],
      1,
      '统一接口、可替换。',
      'routing-impl',
    ),
    q(
      '路由器的「分流 + 兜底」逻辑是？',
      ['只分流', '难度分流 + 质量/失败时升级兜底', '只兜底', '随机'],
      1,
      '分流 + 兜底。',
      'routing-impl',
    ),
    q(
      '难度评估要「轻量」的原因是？',
      ['好看', '评估太重（又调大模型）会让路由省的钱被吃掉', '更快', '省内存'],
      1,
      '评估要轻量。',
      'routing-impl',
    ),
  ],
  [
    ['provider 抽象', '统一不同模型接口的抽象层'],
    ['难度评估', '判断任务复杂度以分流的轻量逻辑'],
    ['升级兜底', '失败或质量不够时升级到强模型'],
  ],
  ['难度评估又调大模型，路由省的钱被评估吃掉。', 'provider 抽象不做，换模型要改一堆业务代码。'],
)
