import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L02 = L(
  'L02',
  0,
  'TypeScript 工具链与固定运行环境',
  12,
  1,
  [],
  ['toolchain'],
  [
    '理解为什么本课固定 Node 24 LTS、不混用 Deno / Bun',
    '理解 TypeScript 7 作为实现语言的意义',
    '搭好基础 tsconfig 与运行脚本',
  ],
  [
    prose(
      '固定运行环境，消除不确定性',
      'Agent 大量依赖异步 I/O、流式读取、进程通信（如 MCP 的 stdio transport）。不同运行时（Node / Deno / Bun）在这些细节上的行为差异会污染你的调试。本课锁定 Node 24 LTS，全课代码、脚本、测试都只在这一环境验证。',
    ),
    list('为什么是 Node 24 LTS', [
      'LTS 意味着长期稳定与安全修复，适合作为课程基线。',
      '原生支持 fetch / ReadableStream / async iterator / ESM，Agent 需要的 HTTP 与流式能力都内置。',
      'stdin/stdout 进程通信稳定，是 MCP stdio transport 的可靠宿主。',
    ]),
    code(
      '最小工程：package.json + tsconfig.json',
      '// package.json\n{\n  "name": "agent-course",\n  "type": "module",\n  "scripts": {\n    "dev": "tsx watch src/main.ts",\n    "build": "tsc -p tsconfig.json"\n  },\n  "devDependencies": {\n    "typescript": "^7.0.2",\n    "tsx": "^4.0.0"\n  }\n}\n\n// tsconfig.json\n{\n  "compilerOptions": {\n    "target": "ES2023",\n    "module": "NodeNext",\n    "moduleResolution": "NodeNext",\n    "strict": true,\n    "verbatimModuleSyntax": true\n  }\n}',
      'TS 7 是原生 Go 编译器；日常开发用 tsx 直接跑 TS，省去手动编译。',
    ),
    call(
      'warn',
      '不要混用运行时',
      '同一份代码在 Bun 能跑、Node 不能跑，或反过来，会浪费你大量时间排查。除非某课明确讲「运行时差异」，否则一切以 Node 24 为准。',
    ),
    call(
      'tip',
      'TypeScript 的价值在类型边界',
      'Agent 最脆弱的地方是「模型输出的不确定性」——一个不存在的工具名、一个格式错误的 JSON。TS 的类型系统恰好能把这种不确定性关进类型边界：模型的自由文本，到执行层一定是经过校验的强类型值。',
    ),
  ],
  null,
  [
    q(
      '本课为什么固定 Node 24 LTS？',
      ['它运行最快', '消除异步 I/O、流式、进程通信上的环境差异', 'Deno / Bun 不支持 Agent', '官方强制要求'],
      1,
      'LTS 稳定、内置 fetch/流式/ESM，且 stdio 通信可靠；固定环境是为了消除不确定性。',
      'toolchain',
    ),
    q(
      'TypeScript 7 对 Agent 开发最核心的价值是？',
      ['语法更简洁', '把模型输出的不确定性关进类型边界', '运行时更快', '不需要依赖管理'],
      1,
      '模型自由文本到执行层必须经过强类型校验，TS 类型系统是这道边界。',
      'toolchain',
    ),
    q(
      '关于运行时选择，正确的做法是？',
      [
        '同一份代码在 Bun 和 Node 之间随意切换',
        '全课固定 Node 24，除非某课明确讲运行时差异',
        '用 Deno 开发、Node 部署',
        '不关心运行时',
      ],
      1,
      '固定 Node 24，除非某课明确讲运行时差异，否则不混用。',
      'toolchain',
    ),
  ],
  [
    ['LTS', 'Long-Term Support，长期支持版本，适合作为稳定基线'],
    ['ESM', 'ECMAScript Modules，本课默认模块系统'],
    ['stdio transport', '通过标准输入输出做进程通信，MCP 常用'],
  ],
  [
    '把「能用 Bun 跑」当成「能在 Node 跑」——两套运行时细节不同。',
    '忽略了 `type: module`，导致 ESM 语法报错。',
  ],
)
