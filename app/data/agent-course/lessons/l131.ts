import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 26 ========== */

export const L131 = L(
  'L131',
  26,
  '实战 Capstone A：从零接入链路追踪与回放',
  20,
  4,
  ['L130'],
  ['cap-a-trace'],
  [
    '从零实现一个 span 追踪中间件，覆盖多 Agent 编排',
    '实现「失败现场回放」的调试能力',
    '理解追踪在多 Agent 场景下的串联方式',
  ],
  [
    prose(
      '追踪让「黑盒」变「可回放」',
      'Capstone A 的多 Agent 编排跑起来后，出问题时很难知道「哪个 Agent、哪一步、哪个工具」出了问题。本课从零实现 span 追踪中间件，并支持回放失败现场。不复用 L75/L76，思路一致。',
    ),
    code(
      '从零实现 span 追踪中间件（不复用 L75/L76）',
      'type Span = { id; parentId; name; start; end; input; output; tags }\n\nconst tracer = {\n  spans: [],\n  async trace<T>(name: string, parent: Span | null, fn: () => Promise<T>): Promise<T> {\n    const span = { id: uid(), parentId: parent?.id, name, start: now() }\n    try {\n      const out = await fn()\n      span.output = out\n      return out\n    } catch (e) { span.tags = { error: String(e) }; throw e }\n    finally { span.end = now(); this.spans.push(span) }\n  },\n}\n\n// 埋点：runtime 一次循环 = 一个 span；每个工具调用 = 子 span；每个 Agent = 顶层 span\nawait tracer.trace("supervise", null, () => supervise(task))',
      '关键：span 形成树（父子关系），失败现场可沿树「回放」——重放同输入、看每步输出。',
    ),
    call(
      'deep',
      '回放 = 把「一次运行」变成「可复现的数据」',
      'span 记录了每步的输入输出，所以「回放」就是：沿 span 树重放每一步的输入，观察在哪一步输出偏离预期。这比「看日志猜」高效得多，也是 L74「回放失败现场」思想在 Capstone A 的从零落地。',
    ),
    list('追踪与回放的验收点', [
      '一次完整多 Agent 运行，产出一棵完整 span 树。',
      '每个 span 有 start/end/input/output，可计算每步耗时。',
      '工具调用是运行时 span 的子 span，父子关系正确。',
      '失败时能定位到「具体哪个 Agent、哪个工具」出错。',
      '能重放同输入，复现失败路径。',
    ]),
    call(
      'tip',
      '先记录「输入输出」，再谈「可视化」',
      '追踪的价值在数据（input/output/父子/耗时），不在花哨的 UI。先把 span 数据完整落下来，回放和可视化都是「读这份数据」而已。',
    ),
  ],
  null,
  [
    q(
      'span 追踪中间件记录的核心是？',
      ['日志级别', 'span 树：id/parentId/input/output/耗时', '代码行数', 'token 数量'],
      1,
      'span 树是追踪的核心数据。',
      'cap-a-trace',
    ),
    q(
      '「回放失败现场」的实现基础是？',
      ['录屏', 'span 记录了每步输入输出，可沿树重放', '断点调试', '日志 grep'],
      1,
      '可复现的数据驱动回放。',
      'cap-a-trace',
    ),
    q(
      '多 Agent 场景下，追踪的父子关系是？',
      ['每个 Agent 一个顶层 span，工具调用是其子 span', '全部平铺', '只有一个 span', '不记录'],
      1,
      'span 形成树。',
      'cap-a-trace',
    ),
  ],
  [
    ['span', '一次操作（Agent/工具/循环）的追踪记录'],
    ['span 树', '父子关系组织的追踪记录'],
    ['回放', '沿 span 树重放输入以复现失败'],
  ],
  ['只记日志不记结构化 span，出问题只能「猜」。', 'span 不记 input/output，导致无法回放。'],
)
