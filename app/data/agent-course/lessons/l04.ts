import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L04 = L(
  'L04',
  0,
  '项目脚手架：一个可运行的最小 Agent 工程',
  14,
  2,
  ['L03'],
  ['scaffold'],
  [
    '搭出目录约定清晰、可运行、可测试的最小 Agent 工程',
    '理解「内容/引擎/视图」分层为何从脚手架就开始',
    '跑通第一个最小 Agent 循环的骨架',
  ],
  [
    prose(
      '脚手架决定后面每一课的起点',
      '后面 142 课要不断在同一个工程里加东西。如果目录约定、脚本、测试一开始就乱，越往后越难维护。所以本课把「一个能跑的最小 Agent 工程」当作地基。',
    ),
    code(
      '目录约定',
      'agent-course/\n├── src/\n│   ├── main.ts        # 入口：跑一个最小循环\n│   ├── agent/\n│   │   ├── loop.ts     # 核心循环（后续课填充）\n│   │   └── tools.ts    # 工具注册（后续课填充）\n│   ├── llm/\n│   │   └── client.ts   # LLM 调用封装\n│   └── trace/\n│       └── tracer.ts   # 追踪埋点（L05）\n├── test/\n│   └── loop.test.ts\n├── package.json\n└── tsconfig.json',
      'src 按「能力域」分目录（agent / llm / trace），而不是按文件类型堆在一起。',
    ),
    code(
      '最小可运行循环（先留骨架）',
      '// src/llm/client.ts\n// 教学基线：OpenAI 兼容接口；本课先用最小封装占位\nexport type LlmMessage = { role: "system" | "user" | "assistant"; content: string }\n\nexport interface LlmClient {\n  chat(messages: LlmMessage[]): Promise<string>\n}\n\n// src/agent/loop.ts\nexport async function runLoop(client: LlmClient, prompt: string): Promise<string> {\n  // 后续课会把它变成真正的「模型决定下一步」循环\n  return client.chat([{ role: "user", content: prompt }])\n}\n\n// src/main.ts\nimport { runLoop } from "./agent/loop.ts"\nimport { openAiClient } from "./llm/client.ts"\n\nconst answer = await runLoop(openAiClient, "用一句话解释什么是 Agent")\nconsole.log(answer)',
      '这是「先手写」的最小种子：loop 和 llm 的接口契约先定下来，后面不断充实。',
    ),
    call(
      'deep',
      '接口先于实现',
      '`LlmClient` 只有一个 `chat` 方法，`runLoop` 只依赖这个接口。这样做的好处是：后面做模型路由（模块六）、mock 测试、多 provider 切换时，都不需要改动调用方。',
    ),
    list('脚本约定', [
      '`pnpm dev`：tsx 热跑入口，快速验证。',
      '`pnpm test`：跑 test/ 下的单元测试（后续课的循环、解析器都要有测试覆盖）。',
      '`pnpm build`：tsc 编译，作为交付前检查。',
    ]),
  ],
  null,
  [
    q(
      '`LlmClient` 只暴露一个 `chat` 方法、`runLoop` 只依赖这个接口，这样设计的好处是？',
      ['代码更短', '后面做模型路由 / mock 测试 / 多 provider 时无需改动调用方', '性能更好', '避免类型检查'],
      1,
      '接口先于实现：调用方只依赖抽象，替换实现不动调用方。',
      'scaffold',
    ),
    q(
      'src 目录的划分原则是？',
      ['按文件类型（ts/json/test）', '按能力域（agent / llm / trace）', '全部平铺在根目录', '按字母顺序'],
      1,
      '按能力域分目录，避免「按类型堆在一起」导致后期难维护。',
      'scaffold',
    ),
    q(
      '最小工程骨架中 `runLoop` 当前的状态是？',
      ['已经是完整的 Agent 循环', '只调一次 chat 的占位骨架，后续课填充', '包含工具调用', '包含流式输出'],
      1,
      '先留骨架，后续课把它变成真正的「模型决定下一步」循环。',
      'scaffold',
    ),
  ],
  [
    ['能力域目录', '按 agent / llm / trace 等能力划分源码目录，而非按文件类型'],
    ['接口契约', '先定接口（如 LlmClient），实现可替换'],
    ['脚手架', '可运行、可测试、目录约定清晰的最小工程地基'],
  ],
  [
    '一上来就建一堆空目录和「未来会用」的抽象——脚手架只留最小可运行 + 清晰约定。',
    '把 LLM 调用写死在 runLoop 里，后续做路由 / mock 都得改调用方。',
  ],
)
