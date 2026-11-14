/**
 * 上下文装配层：系统提示词档位 + 意图粗路由 + LLM 请求体组装。
 *
 * 关键约定（与需求对齐）：
 * - 上下文快照在「新建会话」那一刻冻结进 Conversation.snapshot；同会话内发消息不再重组。
 * - 系统提示词按会话冻结的 pageKind 选档位；当前页面富上下文（课时/概念/学情摘要）一并写进 system。
 * - 意图粗路由命中「导航」则走本地 navigate（零 LLM），其余交 LLM 按提示词自决三姿态。
 */
import type { Conversation, ContextSnapshot, LLMMessage, PageKind } from '~/types/tutor'
import { TUTOR_TURN_LIMIT } from './history.ts'

/** 供视图层在「新建会话」时收集，喂给 makeSnapshot 冻结。 */
export interface SnapshotInput {
  pageKind: PageKind
  course: string
  courseTitle?: string
  stageName?: string
  lessonId?: string
  lessonTitle?: string
  lessonGoals?: string[]
  lessonPitfalls?: string[]
  lessonConcepts?: string[]
  conceptId?: string
  /** 学情页注入：引擎 overall / diagnose 的文本摘要。 */
  learningSummary?: string
}

/** 由视图层解析课程/课时数据后，构造一份可冻结的快照。 */
export function makeSnapshot(input: SnapshotInput): ContextSnapshot {
  return {
    pageKind: input.pageKind,
    course: input.course,
    courseTitle: input.courseTitle,
    stageName: input.stageName,
    lessonId: input.lessonId,
    lessonTitle: input.lessonTitle,
    lessonGoals: input.lessonGoals,
    lessonPitfalls: input.lessonPitfalls,
    lessonConcepts: input.lessonConcepts,
    conceptId: input.conceptId,
    learningSummary: input.learningSummary,
  }
}

/* ---------------- 系统提示词档位 ---------------- */

const BASE_PERSONA = `你是「源悟的知识岛」里的助学助教，正在陪学生学这门课程。
你有三种姿态，根据学生这句话的意图自行切换：
- 答疑：学生问概念/报错/代码，直接讲清原理并给最小可运行示例。
- 追问（苏格拉底式）：学生卡住或想被检验时，不要直接给答案，用反问引导他自己推理；追问必须锚定他正在看的概念/课时，一次只问一个问题。
- 导航：学生问「下一步学什么」，依据学情给出下一步课时与薄弱概念。
原则：中文回答；代码用 TypeScript / JavaScript；回答精炼、移动端可读；不确定就说明边界，不要编造 API。
- 语境优先：解释概念或 API 时，以「当前会话冻结上下文」里的课程、课时、核心概念与常见误区为准；同名术语在通用语言与本站课程里含义不同时，先点明区分再作答，不要默认按通用语义解释。
- 歧义先澄清：若无法判断学生问的是哪个语境（例如 Effect 的 flatMap 与 Array.prototype.flatMap），先用一句话反问，或同时给出两者区别；不要凭猜测下断言。
- 短答也要对齐语境：即使学生要求「一句话」「简单说」，也不能为压缩长度而省略必要的语境区分。`

function pageTone(kind: PageKind): string {
  switch (kind) {
    case 'lesson':
      return '（此刻学生在课程课时页，倾向于先追问引导理解、再按需答疑；他手头有具体代码/概念可锚定。解释概念时以本课时核心概念与常见误区为准；遇到同名 API 先区分语境。）'
    case 'concept':
      return '（此刻学生在概念页，倾向于先答疑把概念讲透，再给 1-2 个常见误区反例供反思。解释概念时以本课时核心概念与常见误区为准；遇到同名 API 先区分语境。）'
    case 'review':
    case 'dashboard':
    default:
      // 00032：default 与 dashboard 共享兜底文案，保证 PageKind 扩展时仍有返回值；
      // B1：措辞避开「学情摘要」字面，否则首页（档位兜底为 dashboard）的 system 提示词
      // 会凭空出现该词，与「仅学情页注入」的动态断言冲突。真正注入的摘要由 contextBlock 输出。
      return '（此刻学生关心学习进度，倾向于导航：结合下方提供的学情信息给出下一步与薄弱概念，追问深度按掌握度个性化。）'
  }
}

function contextBlock(s: ContextSnapshot): string {
  const lines: string[] = []
  lines.push(`当前课程：${s.courseTitle ?? s.course}`)
  if (s.stageName) lines.push(`当前阶段：${s.stageName}`)
  if (s.lessonTitle) lines.push(`当前课时：${s.lessonTitle}`)
  if (s.lessonConcepts?.length) lines.push(`本课时核心概念：${s.lessonConcepts.join('、')}`)
  if (s.conceptId) lines.push(`选中概念：${s.conceptId}`)
  if (s.lessonGoals?.length) lines.push(`本课目标：\n- ${s.lessonGoals.join('\n- ')}`)
  if (s.lessonPitfalls?.length) lines.push(`本课常见误区：\n- ${s.lessonPitfalls.join('\n- ')}`)
  if (s.learningSummary) lines.push(`学情摘要：\n${s.learningSummary}`)
  return lines.join('\n')
}

export function buildSystemPrompt(s: ContextSnapshot): string {
  return [BASE_PERSONA, pageTone(s.pageKind), `—— 当前会话冻结上下文 ——`, contextBlock(s)].join('\n')
}

/** 把会话历史转成 LLM 消息（保留最近 TUTOR_TURN_LIMIT 轮）。 */
export function buildHistory(conv: Conversation): LLMMessage[] {
  const cap = TUTOR_TURN_LIMIT * 2
  const recent = conv.messages.slice(-cap)
  // role 的联合类型与 LLMMessage['role'] 完全一致，无需断言
  return recent.map((m) => ({ role: m.role, content: m.content }))
}

/** 组装一次 LLM 请求体：system（含冻结上下文）+ 最近历史。 */
export function buildMessages(conv: Conversation): LLMMessage[] {
  return [{ role: 'system', content: buildSystemPrompt(conv.snapshot) }, ...buildHistory(conv)]
}

/* ---------------- 意图粗路由 ---------------- */

export type Intent = 'nav' | 'llm'

/**
 * A1（00031）：只保留「短语级强导航信号」。
 * 旧正则里的裸泛词「导航」会误截「这个路由怎么导航」，贪婪的 `按.*顺序学` 会跨句命中
 * 「这段代码按推荐顺序学会怎样」；命中即零 LLM 出本地卡，用户无从察觉也无从恢复。
 * 去掉这两项，弱导航信号一律交 LLM 由三姿态自决；误判残留由导航卡上的 askAi() 兜底。
 */
const NAV_STRONG_RE = /下一步|接下来学|学什么|学哪|学习路线|学习路径|按什么顺序学|按顺序学/

/** 明确的答疑语境：出现这些词且没有强导航词时，一律交 LLM。 */
const QA_RE = /为什么|原理|区别|报错|如何|怎么|是什么|哪个|是不是|对不对|会不会|能不能|错了|不对|含义|用法/
/** 强导航词优先级高于答疑护栏（「下一步学什么，为什么」仍是导航）。 */
const EXPLICIT_NAV_RE = /下一步|学什么|学哪|学习路线|学习路径/

/**
 * 护栏优先 → 强信号 → 默认 LLM。命中强信号才走本地 navigate（零 LLM），
 * 其余一律交 LLM（由系统提示词在答疑/追问/导航间自决）。
 * 已知边界：含强导航词的组合句（「为什么下一步学这个」）仍判 nav，由导航卡按钮兜底。
 */
export function detectIntent(text: string): Intent {
  if (QA_RE.test(text) && !EXPLICIT_NAV_RE.test(text)) return 'llm'
  return NAV_STRONG_RE.test(text) ? 'nav' : 'llm'
}
