import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 20 ========== */

export const L107 = L(
  'L107',
  20,
  '对照：用 AI SDK 重写工具调用 + 流式 + 模型路由（对比 L42 / L89）',
  18,
  3,
  ['L106', 'L42', 'L89'],
  ['ai-sdk-rewrite'],
  [
    '用 AI SDK 重写工具调用、流式输出与模型路由',
    '对比 L42 的 FC 运行时与 L89 的模型路由',
    '理解 provider 抽象如何简化路由',
  ],
  [
    prose(
      '模型交互层，三件事重写',
      'L42 的 FC 运行时、L37 的流式、L89 的模型路由，用 AI SDK 重写——这三件事恰好是 AI SDK 的主场。',
    ),
    code(
      '三件事重写',
      '// ① 工具调用（对照 L42 runWithTools）\nconst { steps } = await generateText({\n  model, tools: { weather, calc }, maxSteps: 10,\n  prompt: "查天气并计算",\n})\n\n// ② 流式（对照 L37 手写 async iterator）\nconst { textStream } = streamText({ model, prompt })\nfor await (const t of textStream) process.stdout.write(t)\n\n// ③ 模型路由（对照 L89 手写 Router）\nconst cheap = openai("gpt-4o-mini")\nconst strong = openai("gpt-4o")\nconst model = complexity === "simple" ? cheap : strong  // provider 抽象让切换一行完成',
      '关键：provider 抽象让「切换模型」变成一行（L89 手写的 ModelProvider 接口被内置）。',
    ),
    call(
      'deep',
      'provider 抽象的价值',
      'L89 手写的 `ModelProvider` 接口 + `Router`，在 AI SDK 里 provider 抽象是**内置**的：`openai("...")` 返回统一接口，切换供应商（openai → anthropic → 自定义）只改一行。路由逻辑（难度分流 + 兜底）仍需自己写，但「换模型」的成本降到了零。',
    ),
    list('对照结论', [
      '工具调用：generateText + tools + maxSteps 替代手写 FC 运行时。',
      '流式：streamText 替代手写 SSE 解析 + async iterator。',
      '路由：provider 抽象替代手写 ModelProvider，但路由逻辑仍需自己写。',
    ]),
    call(
      'warn',
      '路由逻辑框架不包',
      'AI SDK 给了 provider 抽象（换模型方便），但「难度分流 + 兜底」的路由决策（L89 的 Router）仍要自己写。别以为「用了 AI SDK 就自动路由」了。',
    ),
  ],
  null,
  [
    q(
      'L89 手写的 ModelProvider 接口，在 AI SDK 里是？',
      ['手写', '内置 provider 抽象（openai("...") 统一接口）', 'workflow', '无对应'],
      1,
      'provider 抽象内置。',
      'ai-sdk-rewrite',
    ),
    q(
      'L37 手写的流式，在 AI SDK 里是？',
      ['SSE 解析', 'streamText + textStream', 'generateText', 'tool'],
      1,
      'streamText。',
      'ai-sdk-rewrite',
    ),
    q(
      'AI SDK 不替你做什么？',
      ['切换模型', '路由决策（难度分流+兜底）', '流式', '工具调用'],
      1,
      '路由逻辑仍要自己写。',
      'ai-sdk-rewrite',
    ),
  ],
  [
    ['provider 抽象', '统一多供应商的模型接口'],
    ['generateText', '非流式文本生成'],
    ['streamText', '流式文本生成'],
  ],
  ['以为用了 AI SDK 就自动路由了——路由逻辑仍要自己写。', '换模型仍写死供应商，忽视 provider 抽象。'],
)
