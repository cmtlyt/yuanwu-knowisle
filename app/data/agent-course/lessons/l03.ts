import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 0 ========== */

export const L03 = L(
  'L03',
  0,
  '版本锁定表与依赖安装',
  12,
  1,
  ['L02'],
  ['version-lock'],
  [
    '理解为什么要集中锁定版本、而不是随手 `npm i` 最新版',
    '掌握本课框架版本锁定表（附录 B 落地口径）',
    '了解「估算」版本与「已核实」版本的区别',
  ],
  [
    prose(
      '版本不锁定，课程会教错',
      'Agent 生态迭代极快：一个框架几个月就能从 0.x 跳到 1.x。如果课程正文按旧版 API 写，学习者照着做会直接报错。所以本课把版本锁定视为第一道工程纪律。',
    ),
    list('版本锁定的三层含义', [
      '实现语言与运行时锁定：TypeScript 7 + Node 24 LTS。',
      '框架版本锁定：LangGraph / OpenAI Agents / Mastra / AI SDK 等各锁一个 major 版本。',
      '正文不散落版本号：版本统一集中在 META，正文只引用 API 名与宽泛 major。',
    ]),
    code(
      '版本锁定表（2026-11-15 联网核实）',
      '// 语言与运行时\n// typescript@7.0.2 · node@24 LTS\n\n// 框架对照（主线不装，用到才装）\n// @langchain/langgraph  ^1.0\n// langchain            ^1.0\n// @openai/agents       ^0.22\n// @openai/guardrails    ^0.3.0\n// @mastra/core          ^1.82\n// ai                    ^7.0      (Vercel AI SDK)\n// llamaindex            ^0.12\n// @modelcontextprotocol/sdk ^1.0\n// @opentelemetry/api    ^1.0\n// langsmith             ^0.12     (LangSmith TS 客户端)',
      '注意 LangSmith 的 TS 客户端包名是 `langsmith`，不是 `@langchain/langsmith`。',
    ),
    call(
      'warn',
      '不要随手 `npm i` 最新版',
      '课程正文基于锁定的 major 版本写。如果你装了更新的 minor，通常没问题；但跨了 major（如 langchain 0.x → 1.x）API 会断裂。',
    ),
    call(
      'tip',
      '「估算」与「已核实」',
      '大纲阶段标注「估算」的版本（如 llamaindex），落地时已联网核实到 0.12.x；「已核实」的（如 @openai/agents 0.22.x）直接沿用。二者都写进 META 的 notes，正文不再重复。',
    ),
  ],
  null,
  [
    q(
      '为什么必须锁定版本而不是随手装最新版？',
      [
        '最新版功能更多',
        '避免正文按旧版 API 写导致学习者照着做报错',
        '锁定版本可以少写代码',
        'npm 不支持最新版',
      ],
      1,
      'Agent 生态迭代快，版本不锁定正文会教错；锁定保证照着做能跑。',
      'version-lock',
    ),
    q(
      'LangSmith 的 TS 客户端正确包名是？',
      ['@langchain/langsmith', 'langsmith', '@langsmith/sdk', 'langchain-smith'],
      1,
      'TS 客户端包名是 `langsmith`（Python 侧同名）。',
      'version-lock',
    ),
    q(
      '正文中版本号应该怎么放？',
      [
        '每个代码块里都写死小版本号',
        '版本统一集中在 META，正文只引用 API 名与宽泛 major',
        '不写版本号',
        '只写在 README',
      ],
      1,
      '版本集中在 META（唯一版本源），正文不散落硬编码版本号。',
      'version-lock',
    ),
  ],
  [
    ['版本锁定', '把语言、运行时、框架各锁一个确定版本，作为教学基线'],
    ['major 版本', '语义化版本中破坏性变更的一级，如 0.x → 1.x'],
    ['META', '课程数据中唯一记录版本基线的字段'],
  ],
  [
    '以为装了更新的 major 版本「差不多」——跨 major 的 API 断裂会让人照着正文报错。',
    '在正文代码里随手写死小版本号，升级后正文与 META 分叉。',
  ],
)
