import { L, prose, code, call, q } from '../../course-builders.ts'

/* ========== Stage 2 ========== */

export const L13 = L(
  'L13',
  2,
  '实战：用 TS 实现 ReAct 循环（真代码）',
  18,
  3,
  ['L12', 'L10'],
  ['react-loop'],
  [
    '用 TS 写一个可运行的 ReAct 循环（解析 / 执行 / 回填）',
    '理解「解析模型输出」与「执行工具」的边界',
    '对照 LangGraph / OpenAI Agents SDK 的等价 ReAct',
  ],
  [
    prose(
      '把 L12 的交替循环写成代码',
      'ReAct 的难点不在循环本身，而在「可靠地解析模型输出」和「把工具结果回填」。我们分三步实现。',
    ),
    code(
      '第一步：定义工具与消息',
      'interface Tool {\n  name: string\n  run(args: Record<string, unknown>): Promise<string>\n}\n\ninterface Message { role: "system" | "user" | "assistant" | "tool"; content: string }\n\nconst tools: Record<string, Tool> = {\n  search_weather: {\n    name: "search_weather",\n    async run({ city }) { return "晴，18°C，微风" },  // 真实场景接 API\n  },\n}',
      '工具就是「名字 → 可执行函数」的注册表，后面 L38 会升级为 Function Calling。',
    ),
    code(
      '第二步：循环骨架',
      'async function reactLoop(client: LlmClient, prompt: string, maxSteps = 10) {\n  const messages: Message[] = [{ role: "system", content: SYSTEM_PROMPT },\n                                { role: "user", content: prompt }]\n  for (let i = 0; i < maxSteps; i++) {\n    const raw = await client.chat(messages)\n    messages.push({ role: "assistant", content: raw })\n    const { thought, action, args } = parseReAct(raw)\n    if (action === "finish") return args.answer\n    const tool = tools[action]\n    if (!tool) throw new Error("未知工具: " + action)\n    const obs = await tool.run(args)\n    messages.push({ role: "tool", content: obs })\n  }\n  throw new Error("超出最大步数仍未终止")\n}',
      '循环三件事：调模型 → 解析意图 → 执行工具并回填观测。`maxSteps` 是终止保险。',
    ),
    code(
      '第三步：解析模型输出',
      'function parseReAct(raw: string) {\n  const thought = raw.match(/Thought: (.*)/)?.[1] ?? ""\n  const actionLine = raw.match(/Action: (\\w+)\\((.*)\\)/)\n  if (!actionLine) throw new Error("无法解析 Action")\n  return { thought, action: actionLine[1], args: parseArgs(actionLine[2]) }\n}',
      '解析是 ReAct 最脆弱的环节：模型输出格式不稳，必须容错并给出清晰错误。',
    ),
    call(
      'deep',
      '框架对照：LangGraph 的 ReAct',
      'LangGraph 里 ReAct 被建模成一张图：`model 节点 → 条件边（有工具就 tool 节点，否则 end）→ tool 节点 → 回到 model`。它把「循环」显式化成图节点与边，状态由 `State` 累加器维护。OpenAI Agents SDK 则用 `run()` 内置的 agent loop 直接替你转，你只写工具。手写版让你看清，框架版让你省事。',
    ),
    call(
      'warn',
      'maxSteps 是必须的',
      '没有步数上限，ReAct 可能陷入「反复调用同一工具」的死循环。终止条件（finish + 步数上限 + 超时）三样缺一不可，详见 L34。',
    ),
  ],
  null,
  [
    q(
      'ReAct 循环中「解析模型输出」最需要注意什么？',
      ['速度', '模型输出格式不稳，必须容错并给出清晰错误', '内存', '鉴权'],
      1,
      '解析是 ReAct 最脆弱环节，模型格式可能不规整，需容错。',
      'react-loop',
    ),
    q(
      '为什么必须有 `maxSteps` 上限？',
      ['为了性能', '防止模型陷入反复调用同一工具的死循环', '为了省 token', '框架要求'],
      1,
      '没有步数上限可能死循环；终止条件 = finish + 步数上限 + 超时。',
      'react-loop',
    ),
    q(
      'LangGraph 把 ReAct 建模成什么？',
      ['一个 while 循环', '一张图：model 节点 + 条件边 + tool 节点，状态由 State 累加', '一棵树', '一个数组'],
      1,
      'LangGraph 用图节点与边显式表达循环，状态由 State 累加器维护。',
      'react-loop',
    ),
  ],
  [
    ['解析器', '把模型自由文本转成结构化 {thought, action, args} 的函数'],
    ['工具注册表', '工具名 → 可执行函数的映射'],
    ['终止保险', 'finish + 步数上限 + 超时的三重终止机制'],
  ],
  [
    '信任模型一定输出规整格式，不做容错，第一次格式抖动就抛异常。',
    '忘了步数上限，模型反复调用同一工具把 token 烧光。',
  ],
)
