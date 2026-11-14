/**
 * 助学 agent 编排层（视图与引擎之间的唯一协调者）。
 *
 * 职责（对齐 docs/00028-tutor-agent/tech-design.md §3）：
 * - 全局单例状态（useState）：FAB / Drawer / 设置页共享同一份开合、会话、消息流、流式与错误态。
 * - open()：配置判断 → lessonKey 解析 → 一次性上下文快照 → ensureMain 载入主会话 → 同组会话列表。
 * - send()：意图粗路由，命中「导航」走本地 navigate（零 LLM），其余走 LLM SSE 流式。
 * - 一切浏览器 API（localStorage / WebCrypto / OPFS / fetch SSE）都在 import.meta.client 守卫内调用，SSR 不执行。
 *
 * 层约束：本文件只做编排与状态，不放内容判断细节（system prompt 在 context.ts、导航卡在 navigate.ts、请求在 llm.ts）。
 */
import { onScopeDispose } from 'vue'
import { getTutorConfig } from '~/lib/tutor/config'
import { makeSnapshot, buildMessages, detectIntent } from '~/lib/tutor/context'
import {
  resolveLessonKey,
  ensureMain,
  createMain,
  switchConversation,
  listConversations,
  appendMessage,
  clearAll,
  historyIsVolatile,
  type TutorRoute,
} from '~/lib/tutor/history'
import { buildNavCards } from '~/lib/tutor/navigate'
import { chatStream, LlmRequestError } from '~/lib/tutor/llm'
import { useCourse } from '~/composables/use-course'
import { useLearning } from '~/composables/use-learning'
import { availableCourses, courseBase } from '~/data/courses'
import type {
  ContextSnapshot,
  Conversation,
  FeedItem,
  LessonKey,
  LlmError,
  PageKind,
  TutorConfig,
  TutorConfigRead,
  TutorConfigStatus,
  TutorNavCards,
  TutorNote,
  TutorTurn,
} from '~/types/tutor'

/** 已解密的 LLM 配置只在客户端内存持有（含 apiKey，绝不进 useState / SSR payload）。 */
let runtimeConfig: TutorConfig | null = null
let feedSeq = 0
/** 路由监听全局只注册一次（useTutor 会被 FAB / Drawer / 设置页多次调用）。 */
let routeWatchBound = false
/** 进行中的配置探测；完成后立即清空，避免设置页保存后仍读到陈旧结果。 */
let configProbe: Promise<TutorConfigRead> | null = null
/** 首次客户端挂载只预探测一次（FAB 角标不必等抽屉打开才有正确状态）。 */
let configProbedOnce = false

/** OPFS / WebCrypto 不可用时的降级说明（会话仍在内存里可用）。 */
const VOLATILE_TEXT = '本机存储不可用，本次对话不跨刷新保存；答疑与本地导航仍可使用，站点其余功能不受影响。'

interface TutorState {
  open: boolean
  busy: boolean
  configStatus: TutorConfigStatus
  lessonKey: LessonKey
  conversation: Conversation | null
  conversations: Conversation[]
  feed: FeedItem[]
  streaming: boolean
  lastPrompt: string
}

function initialState(): TutorState {
  return {
    open: false,
    busy: false,
    configStatus: 'absent',
    lessonKey: 'home',
    conversation: null,
    conversations: [],
    feed: [],
    streaming: false,
    lastPrompt: '',
  }
}

/* ---------------- 模块级纯函数（不捕获 useTutor 作用域）---------------- */

function nextId(): string {
  return `f${Date.now().toString(36)}-${feedSeq++}`
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmRequestError) {
    return { code: err.code, status: err.status, message: err.message }
  }
  return { code: 'network', message: err instanceof Error ? err.message : String(err) }
}

function goSettings(): void {
  void navigateTo('/settings/llm')
}

export function useTutor() {
  const state = useState<TutorState>('knowisle:tutor', initialState)
  const { route, course, lessonById, stageById, conceptName } = useCourse()
  const learning = useLearning()

  /* ---------------- 只读视图 ---------------- */
  const isOpen = computed(() => state.value.open)
  const busy = computed(() => state.value.busy)
  const configStatus = computed(() => state.value.configStatus)
  const lessonKey = computed(() => state.value.lessonKey)
  const conversation = computed(() => state.value.conversation)
  const conversations = computed(() => state.value.conversations)
  const feed = computed(() => state.value.feed)
  const streaming = computed(() => state.value.streaming)
  const llmReady = computed(() => state.value.configStatus === 'ok')

  /* ---------------- 配置探测（C1）---------------- */

  /**
   * 读取并同步配置状态。并发时复用同一个 Promise；完成后清空，
   * 因此 loadConversation() / refreshConfig() 总能拿到最新落盘结果。
   */
  function probeConfig(): Promise<TutorConfigRead> {
    if (configProbe) return configProbe
    const p = getTutorConfig()
      .then((read) => {
        state.value.configStatus = read.status
        runtimeConfig = read.config
        return read
      })
      .catch(() => {
        const fallback: TutorConfigRead = { status: 'stale', config: null }
        state.value.configStatus = fallback.status
        runtimeConfig = null
        return fallback
      })
    configProbe = p
    void p.finally(() => {
      if (configProbe === p) configProbe = null
    })
    return p
  }

  /** 设置页保存 / 清除配置后调用，立即刷新 FAB 角标与 LLM 能力。 */
  async function refreshConfig(): Promise<void> {
    if (!import.meta.client) return
    configProbe = null
    await probeConfig()
  }

  if (import.meta.client && !configProbedOnce) {
    configProbedOnce = true
    void probeConfig()
  }

  /* ---------------- 路由 → 会话组 / 页面档位 ---------------- */

  /** 把 Vue Route 转成引擎层的纯数据 TutorRoute（lessonKey 永不空）。 */
  function currentRoute(): TutorRoute {
    const path = route.path
    const slug = String(route.params.slug || '')
    const inCourse = path.startsWith('/courses/') && !!slug
    const lessonId = String(route.params.id || '') || undefined
    const lesson = lessonId && inCourse ? lessonById(lessonId) : undefined
    return {
      path,
      inCourse,
      slug: slug || undefined,
      lessonId,
      stage: lesson?.stage,
    }
  }

  function pageKindOf(): PageKind {
    const p = route.path
    if (p.includes('/lessons/')) return 'lesson'
    if (p.includes('/review')) return 'review'
    if (p.includes('/dashboard')) return 'dashboard'
    if (p.includes('/concept') || route.query.concept) return 'concept'
    // 首页 / 课程地图 / 设计 / 教学 / 设置：统一按「导航倾向」档位
    return 'dashboard'
  }

  /**
   * B1：「是否学情页」与「提示词档位」是两个语义，不能混用 pageKindOf()。
   * pageKindOf 把首页也兜底为 'dashboard'，拿它当注入条件会让首页无端带学情卡片与摘要。
   */
  function isLearningPage(): boolean {
    const p = route.path
    return p.startsWith('/courses/') && (p.includes('/review') || p.includes('/dashboard'))
  }

  /** 学情摘要仅学情页（review / dashboard）注入，复用 analytics.ts 纯计算。 */
  function learningSummary(): string | undefined {
    if (!isLearningPage()) return undefined
    const c = course.value ?? availableCourses()[0]
    if (!c) return undefined
    const engine = learning.engineOf(c)
    const st = learning.stateOf(c)
    const o = engine.overall(st)
    const diag = engine.diagnose(st) as Array<{ name: string; cause: string }>
    const lines = [
      `课程：${c.title}`,
      `进度 ${o.progress}%（${o.doneCount}/${o.lessonCount} 课时）· 测验正确率 ${o.accuracy}% · 综合掌握度 ${o.mastery}%`,
    ]
    if (diag.length) {
      lines.push(
        `薄弱归因：${diag
          .slice(0, 3)
          .map((d) => `${d.name}（${d.cause}）`)
          .join('；')}`,
      )
    }
    return lines.join('\n')
  }

  /** 新建会话那一刻冻结的上下文快照；同会话内不再重组。 */
  function buildSnapshot(): ContextSnapshot {
    const c = course.value
    const lessonId = c ? String(route.params.id || '') || undefined : undefined
    const lesson = lessonId ? lessonById(lessonId) : undefined
    const stageName = lesson ? stageById(lesson.stage)?.name : undefined
    const conceptId = route.query.concept ? String(route.query.concept) : undefined
    return makeSnapshot({
      pageKind: pageKindOf(),
      course: c?.slug ?? 'home',
      courseTitle: c?.title ?? '源悟的知识岛',
      stageName,
      lessonId: lesson?.id,
      lessonTitle: lesson?.title,
      lessonGoals: lesson?.goals,
      lessonPitfalls: lesson?.pitfalls,
      lessonConcepts: lesson?.concepts.map((cid) => conceptName(cid)),
      conceptId,
      learningSummary: learningSummary(),
    })
  }

  /** 本地导航卡（零 LLM）；首页无课程上下文时用第一门可用课程兜底。 */
  function navCards(): TutorNavCards {
    const c = course.value ?? availableCourses()[0]
    if (!c) return { weaks: [], advice: '暂无可用课程，先去首页选一门课再开始学习吧。' }
    return buildNavCards(c, learning.stateOf(c), learning.engineOf(c), courseBase(c.slug))
  }

  /* ---------------- feed 操作 ---------------- */

  function pushTurn(turn: TutorTurn): string {
    const id = nextId()
    state.value.feed.push({ kind: 'turn', id, turn })
    return id
  }
  function pushNav(cards: TutorNavCards): void {
    state.value.feed.push({ kind: 'nav', id: nextId(), cards })
  }
  function pushNote(note: TutorNote): void {
    state.value.feed.push({ kind: 'note', id: nextId(), note })
  }
  function updateTurn(id: string, content: string): void {
    const item = state.value.feed.find((f) => f.id === id)
    if (item && item.kind === 'turn') item.turn.content = content
  }
  function removeItem(id: string): void {
    const i = state.value.feed.findIndex((f) => f.id === id)
    if (i >= 0) state.value.feed.splice(i, 1)
  }

  function guideText(): string {
    return state.value.configStatus === 'stale'
      ? '本机环境已变化，加密配置无法解密，已重置。请到「助手设置」重新配置后再使用答疑与追问；本地导航不受影响。'
      : '还没有配置 LLM 端点，答疑 / 追问暂不可用。去「助手设置」填入 OpenAI 兼容端点即可开启；本地「下一步导航」现在就能用。'
  }

  /** 依据会话历史重建渲染流；intro=true 时附加「配置引导 + 学情页开场导航卡」。 */
  function rebuildFeed(conv: Conversation, intro: boolean): void {
    const items: FeedItem[] = conv.messages.map((turn) => ({ kind: 'turn', id: nextId(), turn }))
    if (intro) {
      // B1：开场导航卡同样只在学情页出现，首页不再自动插卡
      if (isLearningPage()) items.push({ kind: 'nav', id: nextId(), cards: navCards() })
      if (state.value.configStatus !== 'ok') {
        items.push({ kind: 'note', id: nextId(), note: { type: 'guide', text: guideText() } })
      }
    } else if (state.value.configStatus !== 'ok') {
      items.push({ kind: 'note', id: nextId(), note: { type: 'guide', text: guideText() } })
    }
    state.value.feed = items
  }

  /* ---------------- 打开时序（tech-design §3.0）---------------- */

  async function loadConversation(): Promise<void> {
    if (!import.meta.client) return
    state.value.busy = true
    try {
      // ① 配置判断永远是第一步；它不阻断后续，只决定 LLM 能力是否可用
      await probeConfig()
      // ② 会话组键（永不空）
      const key = resolveLessonKey(currentRoute())
      state.value.lessonKey = key
      // ③ 载入 / 新建主会话：快照改为惰性工厂，已有主会话时根本不算学情（E6）
      const conv = await ensureMain(key, () => buildSnapshot())
      state.value.conversation = conv
      // ④ 同组会话列表（切换器数据源）
      state.value.conversations = await listConversations(key)
      rebuildFeed(conv, true)
      if (historyIsVolatile()) pushVolatileNote()
    } catch {
      // A2：存储 / 快照任一环节异常都不允许变成 unhandledrejection 或空白抽屉。
      // 内存会话仍可收发消息，只是不跨刷新保存。
      const key = state.value.lessonKey || resolveLessonKey(currentRoute())
      const conv: Conversation = {
        id: `volatile-${Date.now()}`,
        lessonKey: key,
        main: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        snapshot: makeSnapshot({ pageKind: pageKindOf(), course: 'home' }),
        messages: [],
      }
      state.value.conversation = conv
      state.value.conversations = [conv]
      state.value.feed = [{ kind: 'note', id: nextId(), note: { type: 'guide', text: VOLATILE_TEXT } }]
    } finally {
      state.value.busy = false
    }
  }

  function pushVolatileNote(): void {
    pushNote({ type: 'guide', text: VOLATILE_TEXT })
  }

  async function open(): Promise<void> {
    state.value.open = true
    await loadConversation()
  }
  function close(): void {
    state.value.open = false
  }
  function toggle(): void {
    if (state.value.open) close()
    else void open()
  }

  // 换页即刷新会话组（快照只在新建时重做）；抽屉关闭时不处理。
  // 全局单例监听：仅在第一个 useTutor() 调用处注册，避免多组件重复触发 loadConversation。
  if (import.meta.client && !routeWatchBound) {
    routeWatchBound = true
    watch(
      () => route.fullPath,
      () => {
        if (state.value.open) void loadConversation()
      },
    )
    // E7：watch 随首个调用组件的作用域自动停止，标志位必须同步释放，否则路由监听永久失效
    onScopeDispose(() => {
      routeWatchBound = false
    })
  }

  /* ---------------- 会话动作 ---------------- */

  async function newConversation(): Promise<void> {
    if (!import.meta.client || state.value.streaming) return
    const conv = await createMain(state.value.lessonKey, buildSnapshot())
    state.value.conversation = conv
    state.value.conversations = await listConversations(state.value.lessonKey)
    rebuildFeed(conv, true)
  }

  async function switchTo(convId: string): Promise<void> {
    if (!import.meta.client || state.value.streaming) return
    const conv = await switchConversation(state.value.lessonKey, convId)
    state.value.conversation = conv
    state.value.conversations = await listConversations(state.value.lessonKey)
    rebuildFeed(conv, false)
  }

  async function clearHistory(): Promise<void> {
    if (!import.meta.client) return
    await clearAll()
    state.value.conversations = []
    state.value.feed = []
    const conv = await ensureMain(state.value.lessonKey, () => buildSnapshot())
    state.value.conversation = conv
    state.value.conversations = await listConversations(state.value.lessonKey)
    rebuildFeed(conv, true)
  }

  /* ---------------- 发送 / 意图路由 / 流式 ---------------- */

  /**
   * 从 feed 抽取对话历史作为 LLM 请求体来源。
   * 不读 conv.messages：history.ts 的 withGroup 在 OPFS 模式下每次返回新副本、
   * 内存兜底模式下又与 conv 同一引用，直接依赖 conv 会出现「请求缺消息」或「重复计数」两种不一致。
   * feed 是视图与请求的唯一真实来源，OPFS 仅负责持久化。
   */
  function requestMessages(conv: Conversation): ReturnType<typeof buildMessages> {
    const turns: TutorTurn[] = []
    for (const f of state.value.feed) {
      if (f.kind === 'turn' && f.turn.role !== 'system' && f.turn.content) turns.push(f.turn)
    }
    // 沿用 context.ts 的冻结快照 + 最近 10 轮截取逻辑（system 提示词按 pageKind 选档）
    return buildMessages({ ...conv, messages: turns })
  }

  async function runLlm(): Promise<void> {
    const conv = state.value.conversation
    const cfg = runtimeConfig
    if (!conv || !cfg) return

    // 先据当前 feed 组装请求体，再插入流式占位气泡（避免把空 assistant 也送进历史）
    const messages = requestMessages(conv)
    const aiId = pushTurn({ role: 'assistant', content: '', ts: Date.now() })
    state.value.streaming = true
    try {
      const full = await chatStream(cfg, messages, {
        onDelta: (_delta, acc) => updateTurn(aiId, acc),
      })
      // E3：端点返回空流时不插入空气泡（chatStream 已抛 parse，这里兜底防御）
      if (!full.trim()) {
        removeItem(aiId)
        pushNote({ type: 'error', error: { code: 'parse', message: '端点未返回任何回复内容' } })
        return
      }
      const finalTurn: TutorTurn = { role: 'assistant', content: currentContent(aiId), ts: Date.now() }
      await appendMessage(state.value.lessonKey, conv.id, finalTurn)
    } catch (err) {
      removeItem(aiId)
      pushNote({ type: 'error', error: toLlmError(err) })
    } finally {
      state.value.streaming = false
    }
  }

  function currentContent(id: string): string {
    const item = state.value.feed.find((f) => f.id === id)
    return item && item.kind === 'turn' ? item.turn.content : ''
  }

  async function send(text: string): Promise<void> {
    const conv = state.value.conversation
    if (!import.meta.client || !conv || state.value.streaming) return
    const prompt = text.trim()
    if (!prompt) return
    state.value.lastPrompt = prompt

    // 用户消息先入流并落盘（本地导航也保留问答历史）。
    // 只写 feed + OPFS，不动 conv.messages（避免与 appendMessage 在内存兜底模式下重复计数）。
    const userTurn: TutorTurn = { role: 'user', content: prompt, ts: Date.now() }
    pushTurn(userTurn)
    await appendMessage(state.value.lessonKey, conv.id, userTurn)

    // 意图粗路由：命中导航 → 本地卡片（零 LLM）
    if (detectIntent(prompt) === 'nav') {
      pushNav(navCards())
      return
    }
    // LLM 能力未就绪 → 内联引导
    if (state.value.configStatus !== 'ok' || !runtimeConfig) {
      pushNote({ type: 'guide', text: guideText() })
      return
    }
    await runLlm()
  }

  async function retry(): Promise<void> {
    if (!state.value.lastPrompt || state.value.streaming) return
    // 移除上一条错误提示再重发（不重复追加用户气泡）
    const last = state.value.feed[state.value.feed.length - 1]
    if (last && last.kind === 'note' && last.note.type === 'error') removeItem(last.id)
    if (state.value.configStatus !== 'ok' || !runtimeConfig) {
      pushNote({ type: 'guide', text: guideText() })
      return
    }
    await runLlm()
  }

  /**
   * A2（00031）：本地导航误判后的自助出口。移除最近一张导航卡，改用 LLM 重答同一问题。
   * 硬约束：必须直接 runLlm()，由 requestMessages() 从 feed 合成请求体；
   * 不得写成 send(lastPrompt)，否则会重复追加用户气泡、破坏 feed 唯一真实来源。
   */
  async function askAi(): Promise<void> {
    if (!import.meta.client || state.value.streaming) return
    const last = state.value.feed[state.value.feed.length - 1]
    if (!last || last.kind !== 'nav') return // 只对最近一张导航卡生效
    // 开场自动插入的导航卡没有对应提问，给明确引导而不是静默无响应
    if (!state.value.lastPrompt) {
      pushNote({ type: 'guide', text: '请先在输入框里提问，再点「改用 AI 回答」。' })
      return
    }
    if (state.value.configStatus !== 'ok' || !runtimeConfig) {
      pushNote({ type: 'guide', text: guideText() })
      return // 未配置时保留卡片，不要先删后提示
    }
    removeItem(last.id) // 避免同题出现本地卡与 AI 答案两种结果
    await runLlm()
  }

  return {
    isOpen,
    busy,
    configStatus,
    llmReady,
    lessonKey,
    conversation,
    conversations,
    feed,
    streaming,
    open,
    close,
    toggle,
    refreshConfig,
    send,
    retry,
    askAi,
    goSettings,
    newConversation,
    switchTo,
    clearHistory,
  }
}
