/** 助学 agent（tutor-agent）的类型契约：配置、会话、导航卡、LLM 错误。 */

/**
 * 会话组键（lessonKey）—— 永远非空：
 * - 课时页   `${slug}:${stage}:${lessonId}`
 * - 课程内非课时页 `${slug}:course`
 * - 首页     `home`
 */
export type LessonKey = string

export type PageKind = 'lesson' | 'concept' | 'review' | 'dashboard'

/** LLM 配置（纯客户端，存本机；加密存储见 lib/tutor/config.ts）。 */
export interface TutorConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** 加密时写入的指纹 hash，用于检测指纹漂移。 */
  fingerprintHash: string
}

/** 配置读取结果（getTutorConfig 返回）。 */
export type TutorConfigStatus = 'ok' | 'absent' | 'stale'

export interface TutorConfigRead {
  status: TutorConfigStatus
  config: TutorConfig | null
}

/**
 * 新建会话时冻结的上下文快照：同一会话内发消息不再重组，只有「新建对话」重新快照。
 * course 存 slug；lessonId / conceptId 视页面而定；学情页额外带 learningSummary。
 */
export interface ContextSnapshot {
  pageKind: PageKind
  course: string
  lessonId?: string
  conceptId?: string
  learningSummary?: string
  /* 以下富上下文供 LLM 追问 / 答疑时锚定，全部在新建会话那一刻冻结 */
  courseTitle?: string
  stageName?: string
  lessonTitle?: string
  lessonGoals?: string[]
  lessonPitfalls?: string[]
  lessonConcepts?: string[]
}

/** 单条对话消息。 */
export interface TutorTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
  ts: number
}

/** 一条会话（属于某 lessonKey 组；main 标记为组内主会话）。 */
export interface Conversation {
  /** 时间戳 + 随机串，全局唯一。 */
  id: string
  lessonKey: LessonKey
  main: boolean
  createdAt: number
  updatedAt: number
  snapshot: ContextSnapshot
  /** 仅保留最近 TUTOR_TURN_LIMIT 轮。 */
  messages: TutorTurn[]
}

/** 一个 lessonKey 组的全部会话 + 主会话指针。 */
export interface LessonGroup {
  lessonKey: LessonKey
  mainId: string | null
  conversations: Conversation[]
}

/** 本地导航卡：下一步课时 + 薄弱概念（可点击跳转），由 navigate.ts 产出，零 LLM。 */
export interface NavItem {
  label: string
  detail: string
  path: string
}

export interface WeakItem {
  name: string
  mastery: number
  reason: string
  path: string | null
}

export interface TutorNavCards {
  next?: NavItem
  weaks: WeakItem[]
  advice: string
}

/**
 * LLM 调用结构化错误码。
 * - http：端点返回非 2xx 且不属于 401/402/403/429（如 500 / 404），带 status。
 * - aborted：外部 signal 主动取消（区别于内部超时 timeout）。
 */
export type LlmErrorCode = 'auth' | 'quota' | 'network' | 'timeout' | 'parse' | 'http' | 'aborted'

export interface LlmError {
  code: LlmErrorCode
  status?: number
  message: string
}

/** OpenAI Chat Completions 消息（请求体）。 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 内联系统提示（视图层）：错误码映射 + 未配置引导。
 * - error：LLM 调用失败，附带「重试 / 去设置」。
 * - guide：未配置 / 指纹漂移，引导去 /settings/llm。
 */
export type TutorNote = { type: 'error'; error: LlmError } | { type: 'guide'; text: string }

/** 抽屉消息流条目：对话气泡 / 本地导航卡 / 内联系统提示混排。 */
export type FeedItem =
  | { kind: 'turn'; id: string; turn: TutorTurn }
  | { kind: 'nav'; id: string; cards: TutorNavCards }
  | { kind: 'note'; id: string; note: TutorNote }
