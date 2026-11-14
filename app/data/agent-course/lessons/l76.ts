import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 12 ========== */

export const L76 = L(
  'L76',
  12,
  '实战：把链路追踪与回放接入 L68 的多 Agent 系统',
  20,
  4,
  ['L75', 'L68'],
  ['trace-integration'],
  [
    '把 L75 的 span 中间件接入 L68 的多 Agent 系统',
    '实现跨 Agent 的 trace 串联与回放',
    '对照 LangSmith 对多 Agent 的自动 span 串联',
  ],
  [
    prose(
      '多 Agent 更需要追踪',
      '单 Agent 的链路已够复杂，多 Agent 的「谁把结果交给了谁」更是迷。本课把 L75 的追踪接进 L68，让每个 Agent 的调用、每次消息传递都成为 span。',
    ),
    code(
      '追踪接入多 Agent',
      'async function supervisor(task: string, bus: Bus, tracer: Tracer) {\n  return tracer.withSpan("supervisor.run", async (root) => {\n    // 每个 Agent 调用是 root 的子 span\n    const research = await tracer.withSpan("agent.researcher",\n      () => researcher.run(task), root)\n\n    bus.send({ from: "supervisor", to: "reviewer", type: "task", payload: research })\n    // 消息传递也可记录为 span，标注 from/to\n    tracer.withSpan("msg.supervisor→reviewer", async () => {}, root)\n\n    const review = await tracer.withSpan("agent.reviewer",\n      () => reviewer.run(research), root)\n\n    return tracer.withSpan("agent.writer",\n      () => writer.run(research + review), root)\n  }, undefined)\n}',
      '关键：每个 Agent 调用是 root 的子 span，消息传递也记录，整条协作链可追溯。',
    ),
    call(
      'deep',
      '跨 Agent 的 trace 串联',
      '多 Agent 的 trace 要回答「A 的结果影响了 B 的什么」。做法：每个 Agent 调用作为一个 span，消息传递（A→B）也作为 span，span 间通过 parentId 关联成树。LangSmith 对多 Agent 是「自动串联」——它识别 handoff / 消息传递，自动建父子关系。',
    ),
    list('接入后的三个能力', [
      '整条协作链可视化：supervisor → 各 Agent → 消息流转。',
      '定位「哪个 Agent 出错」：失败 span 一目了然。',
      '回放：整条多 Agent 轨迹可重放复现。',
    ]),
    call(
      'warn',
      '消息传递也要记 span',
      '只记 Agent 调用、不记「消息 A→B」，就看不到「谁把什么交给了谁」。消息 span 是多 Agent 追踪区别于单 Agent 的关键。',
    ),
  ],
  null,
  [
    q(
      '多 Agent 追踪区别于单 Agent 的关键是？',
      ['更多 span', '记录消息传递（谁把什么交给谁）', '更慢', '更省 token'],
      1,
      '消息 span 是多 Agent 追踪的关键。',
      'trace-integration',
    ),
    q(
      'LangSmith 对多 Agent 的「自动串联」指？',
      ['自动写代码', '识别 handoff/消息传递，自动建父子 span 关系', '自动部署', '自动评估'],
      1,
      '自动识别并建 span 父子关系。',
      'trace-integration',
    ),
    q(
      '接入追踪后能获得的能力不包括？',
      ['协作链可视化', '定位哪个 Agent 出错', '回放轨迹', '自动修 bug'],
      3,
      '追踪能可视化、定位、回放，不能自动修 bug。',
      'trace-integration',
    ),
  ],
  [
    ['消息 span', '记录 Agent 间消息传递的 span'],
    ['协作链可视化', '把多 Agent 协作过程画成可读链路'],
    ['自动串联', '框架自动识别并建立 span 父子关系'],
  ],
  ['只记 Agent 调用不记消息传递，看不到协作关系。', '多 Agent 追踪不做回放，偶发 bug 无法复现。'],
)
