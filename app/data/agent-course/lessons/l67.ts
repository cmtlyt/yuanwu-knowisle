import { L, prose, code, call, list, q } from '../../course-builders.ts'

/* ========== Stage 11 ========== */

export const L67 = L(
  'L67',
  11,
  '设计 Agent 之间的「对话协议」',
  12,
  2,
  ['L66'],
  ['agent-protocol'],
  ['理解 Agent 间「对话协议」的必要性', '掌握消息结构、路由、终止三要素', '认识协议与「消息总线」的关系'],
  [
    prose(
      'Agent 之间怎么「说话」',
      '多 Agent 协作需要一套「对话协议」：消息长什么样（结构）、发给谁（路由）、什么时候结束（终止）。协议定得清楚，协作才可控。',
    ),
    code(
      'Agent 间消息协议',
      'interface AgentMessage {\n  from: string          // 发送方 agent 名\n  to: string | "all"    // 接收方（或广播）\n  type: "task" | "result" | "query" | "done"  // 消息类型\n  payload: unknown      // 具体内容\n  id: string            // 唯一 id，便于追踪\n  replyTo?: string      // 回复关联\n}\n\n// 路由：消息总线根据 to 分发\nbus.route(msg)          // to=all → 广播；to=agentX → 单发\n\n// 终止：收到 done 或达到轮次上限\nif (msg.type === "done") endConversation()',
      '三要素：结构（字段齐）、路由（发给谁）、终止（何时结束）。',
    ),
    call(
      'deep',
      '协议要「可追踪」',
      '每个消息带唯一 id 和 replyTo，是为了让多 Agent 的「谁对谁说了什么」可追踪（呼应 L75 链路追踪）。没有 id 的协议，出问题时无法还原协作过程。',
    ),
    list('协议设计的三个要点', [
      '结构清晰：from/to/type/payload/id 字段齐备。',
      '类型明确：区分 task（派活）/ result（交结果）/ query（询问）/ done（结束）。',
      '终止明确：有明确的「对话结束」信号，而非自然沉默。',
    ]),
    call(
      'warn',
      '避免「自由聊天」',
      '如果 Agent 之间是「自由聊天」（无类型、无路由、无终止），协作会变成不可控的聊天室，既烧 token 又难调试。协议约束是必要的。',
    ),
  ],
  null,
  [
    q(
      'Agent 对话协议的三要素是？',
      ['结构、路由、终止', '快、稳、省', '增、删、改', '读、写、执行'],
      0,
      '消息结构、路由、终止。',
      'agent-protocol',
    ),
    q(
      '协议消息要带唯一 id 和 replyTo 的原因是？',
      ['好看', '让协作「谁对谁说了什么」可追踪', '更快', '省 token'],
      1,
      '可追踪，呼应链路追踪。',
      'agent-protocol',
    ),
    q(
      '「自由聊天」式协议的问题？',
      ['太正式', '无类型无路由无终止，协作变不可控聊天室', '太快', '太省 token'],
      1,
      '自由聊天不可控、难调试。',
      'agent-protocol',
    ),
  ],
  [
    ['对话协议', 'Agent 间消息的结构、路由、终止约定'],
    ['消息总线', '负责按 to 分发消息的组件'],
    ['可追踪协议', '带 id / replyTo 的消息约定'],
  ],
  ['Agent 间自由聊天，无类型无终止，协作失控。', '协议不带 id，出问题无法还原「谁对谁说了什么」。'],
)
