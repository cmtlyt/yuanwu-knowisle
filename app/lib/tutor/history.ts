/**
 * 助学 agent 会话容器（OPFS 持久化）。
 *
 * 存储布局（OPFS 根下 `tutor/` 目录）：
 * - 课程文件 `<slug>.json`：持有该课程所有会话组（各课时键 + `${slug}:course` 课程级组）
 * - 首页文件 `home.json`：`home` 组
 * 每个文件内容：`{ groups: LessonGroup[] }`；组 = 若干会话 + mainId（主会话指针）。
 *
 * 语义：
 * - 打开默认载入组内「主会话」；无则新建并设为主会话。
 * - 「新建对话」替换 mainId（旧主会话降级为普通会话，仍可切回）。
 * - 会话切换仅同组；切换即把目标会话设为组 mainId。
 * - 会话消息只保留最近 TUTOR_TURN_LIMIT 轮（= 2*TUTOR_TURN_LIMIT 条消息）。
 *
 * OPFS 不可用时退化为内存态（本会话内有效，不跨刷新）；不抛错。
 * 清除会话按目录枚举删除（不硬编码文件名），避免新增课程分组漏删。
 */
import type { Conversation, ContextSnapshot, LessonGroup, LessonKey, TutorTurn } from '~/types/tutor'

/** 保留最近 10 轮（user+assistant 各计一条 → 共 20 条消息）。后续可调。 */
export const TUTOR_TURN_LIMIT = 10

interface CourseFile {
  groups: LessonGroup[]
}

/** 路由信息（纯数据，不依赖 Vue Route，便于引擎层使用与测试）。 */
export interface TutorRoute {
  path: string
  /** 是否课程内课时页（/courses/[slug]/lessons/[id]）。 */
  inCourse: boolean
  slug?: string
  lessonId?: string
  /** 当前课时所属阶段（由视图层从课程数据解析后传入）。 */
  stage?: number | string
}

/**
 * 会话组键，永远非空：
 * - 课时页 → `${slug}:${stage}:${lessonId}`
 * - 课程内非课时页 → `${slug}:course`
 * - 首页 → `home`
 */
export function resolveLessonKey(route: TutorRoute): LessonKey {
  if (route.inCourse && route.slug) {
    if (route.lessonId && route.stage !== undefined && route.stage !== null) {
      return `${route.slug}:${route.stage}:${route.lessonId}`
    }
    return `${route.slug}:course`
  }
  return 'home'
}

/* ---------------- OPFS 基础 ---------------- */

const memoryFallback = new Map<string, CourseFile>()

/** 最近一次存储访问是否落在内存兜底（不跨刷新）。供 UI 给出「本机存储不可用」提示。 */
let volatile = false

export function historyIsVolatile(): boolean {
  return volatile
}

function opfsSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  const storage = navigator.storage
  // 无安全上下文 / 老浏览器：getDirectory 可能整个不存在，不能只看 'storage' in navigator
  return !!storage && typeof storage.getDirectory === 'function'
}

async function tutorDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!opfsSupported()) {
    volatile = true
    return null
  }
  try {
    // getDirectory 返回 OPFS 根；子目录用句柄的 getDirectoryHandle
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle('tutor', { create: true })
    volatile = false
    return dir
  } catch {
    // SecurityError / 配额 / webview 不支持：一律退化为内存态，绝不冒泡成 unhandledrejection
    volatile = true
    return null
  }
}

function fileNameFor(lessonKey: LessonKey): string {
  return lessonKey === 'home' ? 'home.json' : `${lessonKey.split(':')[0]}.json`
}

async function readFile(file: FileSystemFileHandle): Promise<CourseFile> {
  const fh = await file.getFile()
  const text = await fh.text()
  if (!text) return { groups: [] }
  try {
    const parsed = JSON.parse(text) as CourseFile
    if (!parsed || !Array.isArray(parsed.groups)) return { groups: [] }
    return parsed
  } catch {
    return { groups: [] }
  }
}

async function writeFile(file: FileSystemFileHandle, data: CourseFile): Promise<void> {
  const stream = await file.createWritable()
  await stream.write(new Blob([JSON.stringify(data)], { type: 'application/json' }))
  await stream.close()
}

/** 取某组（不存在则创建空组）+ 写回函数。返回的是内存副本，调用方改完须 write。 */
async function withGroup(
  lessonKey: LessonKey,
  fn: (file: CourseFile, group: LessonGroup) => void,
): Promise<void> {
  const name = fileNameFor(lessonKey)
  const dir = await tutorDir()

  if (dir) {
    try {
      const file = await dir.getFileHandle(name, { create: true })
      const data = await readFile(file)
      let group = data.groups.find((g) => g.lessonKey === lessonKey)
      if (!group) {
        group = { lessonKey, mainId: null, conversations: [] }
        data.groups.push(group)
      }
      fn(data, group)
      await writeFile(file, data)
      return
    } catch {
      // 读/写任一环节失败：整组回退内存分支，避免「改了内存副本却没落盘」的半写状态
      volatile = true
    }
  }

  // 内存兜底
  let mem = memoryFallback.get(name)
  if (!mem) {
    mem = { groups: [] }
    memoryFallback.set(name, mem)
  }
  let group = mem.groups.find((g) => g.lessonKey === lessonKey)
  if (!group) {
    group = { lessonKey, mainId: null, conversations: [] }
    mem.groups.push(group)
  }
  fn(mem, group)
}

function newId(): string {
  try {
    const rand = crypto.getRandomValues(new Uint32Array(2))
    return `${Date.now().toString(36)}-${rand[0]!.toString(36)}${rand[1]!.toString(36)}`
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  }
}

/** 规整组内会话的 main 标记（以 mainId 为唯一事实来源）。 */
function normalizeMain(group: LessonGroup): void {
  for (const c of group.conversations) c.main = c.id === group.mainId
}

function findConversation(group: LessonGroup, id: string): Conversation | undefined {
  return group.conversations.find((c) => c.id === id)
}

function makeConversation(lessonKey: LessonKey, snapshot: ContextSnapshot, main: boolean): Conversation {
  const now = Date.now()
  return {
    id: newId(),
    lessonKey,
    main,
    createdAt: now,
    updatedAt: now,
    snapshot,
    messages: [],
  }
}

function trimMessages(conv: Conversation): void {
  const cap = TUTOR_TURN_LIMIT * 2
  if (conv.messages.length > cap) conv.messages = conv.messages.slice(-cap)
}

/* ---------------- 对外 API ---------------- */

/** 读取某组全部会话（按 updatedAt 倒序），无则返回空组（不落盘）。 */
export async function loadGroup(lessonKey: LessonKey): Promise<LessonGroup> {
  let result: LessonGroup = { lessonKey, mainId: null, conversations: [] }
  await withGroup(lessonKey, (_file, group) => {
    normalizeMain(group)
    result = { ...group, conversations: [...group.conversations] }
  })
  result.conversations.sort((a, b) => b.updatedAt - a.updatedAt)
  return result
}

/**
 * 打开时：加载组主会话；无主会话才新建（此刻做上下文快照）。
 * 第二参是快照工厂：已有主会话时根本不调用，避免每次开抽屉都重算学情。
 */
export async function ensureMain(
  lessonKey: LessonKey,
  snapshot: () => ContextSnapshot,
): Promise<Conversation> {
  let out: Conversation | null = null
  await withGroup(lessonKey, (file, group) => {
    normalizeMain(group)
    const existing = group.mainId ? findConversation(group, group.mainId) : undefined
    if (existing) {
      out = existing
    } else {
      const conv = makeConversation(lessonKey, snapshot(), true)
      group.conversations.push(conv)
      group.mainId = conv.id
      out = conv
    }
  })
  if (!out) throw new Error('ensureMain: 会话创建失败（OPFS 与内存兜底均不可用）')
  return out
}

/** 「新建对话」：新建一条会话并替换组 mainId；旧主会话降级为普通会话仍可切回。 */
export async function createMain(lessonKey: LessonKey, snapshot: ContextSnapshot): Promise<Conversation> {
  let out: Conversation | null = null
  await withGroup(lessonKey, (_file, group) => {
    normalizeMain(group)
    const conv = makeConversation(lessonKey, snapshot, true)
    group.conversations.push(conv)
    group.mainId = conv.id
    normalizeMain(group)
    out = conv
  })
  if (!out) throw new Error('createMain: 会话创建失败（OPFS 与内存兜底均不可用）')
  return out
}

/** 会话切换（仅同组）：把目标会话设为组 mainId，返回它。找不到则抛错。 */
export async function switchConversation(lessonKey: LessonKey, convId: string): Promise<Conversation> {
  let out: Conversation | null = null
  await withGroup(lessonKey, (_file, group) => {
    normalizeMain(group)
    const target = findConversation(group, convId)
    if (!target) return
    group.mainId = convId
    normalizeMain(group)
    out = target
  })
  if (!out) throw new Error(`switchConversation: 会话 ${convId} 不属于组 ${lessonKey}`)
  return out
}

/** 追加一条消息到会话，保留最近 TUTOR_TURN_LIMIT 轮。 */
export async function appendMessage(lessonKey: LessonKey, convId: string, turn: TutorTurn): Promise<void> {
  await withGroup(lessonKey, (_file, group) => {
    const conv = findConversation(group, convId)
    if (!conv) return
    conv.messages.push(turn)
    trimMessages(conv)
    conv.updatedAt = Date.now()
  })
}

/** 组内会话切换器数据源（同组全部会话；主会话置顶，其余按 updatedAt 倒序）。 */
export async function listConversations(lessonKey: LessonKey): Promise<Conversation[]> {
  let out: Conversation[] = []
  await withGroup(lessonKey, (_file, group) => {
    normalizeMain(group)
    out = [...group.conversations]
  })
  out.sort((a, b) => {
    if (a.main !== b.main) return a.main ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
  return out
}

/** 清除全部会话（枚举 tutor/ 下所有 .json + 内存兜底）。设置页「清除」入口使用。 */
export async function clearAll(): Promise<void> {
  const dir = await tutorDir()
  if (dir) {
    try {
      // 按目录实际内容删除，不能只删 home.json：OPFS 模式下 memoryFallback 恒为空，
      // 各课程的 <slug>.json 会残留（00029 审计 P0-1）。
      // 先收集再删，避免边遍历边 removeEntry 导致异步迭代器行为不确定。
      const names: string[] = []
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json')) names.push(name)
      }
      for (const name of names) {
        try {
          await dir.removeEntry(name)
        } catch {
          /* 单个文件删失败不阻断其余 */
        }
      }
    } catch {
      /* 目录枚举失败：仍清空内存兜底，不抛未处理异常 */
    }
  }
  memoryFallback.clear()
}
