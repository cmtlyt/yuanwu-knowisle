import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 18 ========== */

export const L102 = L(
  'L102',
  18,
  '对照：用 @openai/guardrails 做输入 / 输出护栏（对比 L84 手写版）',
  18,
  3,
  ['L100', 'L84'],
  ['oa-guardrails'],
  [
    '用 @openai/guardrails 实现输入/输出护栏，对比 L84 手写版',
    '理解可声明护栏规则与「tripwire」机制',
    '认识框架护栏与手写护栏的取舍',
  ],
  [
    prose(
      '把 L84 的手写护栏声明化',
      'L84 手写的「正则 + 白名单 + 输出校验」，@openai/guardrails 用**可声明规则**表达：定义一个 guardrail（匹配即触发），Agent 运行时自动检查。',
    ),
    code(
      'guardrails 声明式护栏',
      'import { Guardrail, inputGuardrail, outputGuardrail } from "@openai/guardrails"\n\n// ① 输入护栏：拦截危险输入\nconst noSecretsInput = inputGuardrail((ctx, input) => ({\n  triggers: [/api[_-]?key/i, /password/i].some((re) => re.test(input)),\n}))\n\n// ② 输出护栏：拦截泄露输出\nconst noSecretsOutput = outputGuardrail((ctx, output) => ({\n  triggers: /api[_-]?key|secret/i.test(output),\n}))\n\n// ③ 挂到 Agent 上\nconst agent = new Agent({\n  name: "assistant",\n  inputGuardrails: [noSecretsInput],\n  outputGuardrails: [noSecretsOutput],\n})',
      '关键：手写版在「调用前后手动校验」，guardrails 版是「声明规则 + 框架自动触发」。',
    ),
    call(
      'deep',
      'tripwire vs 主动拦截',
      'guardrails 的 `triggers` 是「tripwire」（绊线）语义：规则返回 true 即触发拦截。框架在正确的位置（输入前/输出后）自动检查，你只写「什么算违规」。这比手写版「记得在每处调用前后手动校验」更不易漏。',
    ),
    list('手写 vs guardrails', [
      '手写版：灵活、可控，但每个调用点都要记得加校验，容易漏。',
      'guardrails 版：声明式、自动触发、不易漏，但规则表达能力受框架约束。',
      '复杂护栏（需上下文、需调用模型）两者都要写自定义逻辑。',
    ]),
    call(
      'warn',
      '规则护栏有盲区',
      '正则护栏（无论手写还是 guardrails）都挡不住「变着法绕过」的注入（如拆词、同义词）。深度防护仍要靠 L84 的内容隔离 + 模型分类（LlamaGuard）。',
    ),
  ],
  null,
  [
    q(
      'guardrails 的 `triggers` 语义是？',
      ['计数器', 'tripwire 绊线：返回 true 即触发拦截', '日志', '配置'],
      1,
      'tripwire 语义。',
      'oa-guardrails',
    ),
    q(
      'guardrails 相比手写护栏的核心优势是？',
      ['更快', '声明式、框架自动在正确位置触发，不易漏', '更便宜', '更强'],
      1,
      '自动触发、不易漏。',
      'oa-guardrails',
    ),
    q(
      '正则护栏的盲区是？',
      ['太慢', '挡不住变着法绕过的注入（拆词/同义词）', '太贵', '太复杂'],
      1,
      '正则挡不住变体注入。',
      'oa-guardrails',
    ),
  ],
  [
    ['guardrail', '可声明的输入/输出护栏规则'],
    ['tripwire', '规则返回 true 即触发的绊线语义'],
    ['inputGuardrail', '输入阶段的护栏'],
  ],
  ['依赖纯正则护栏，挡不住变体注入。', '手写护栏散落各处，漏掉某个调用点的校验。'],
)
