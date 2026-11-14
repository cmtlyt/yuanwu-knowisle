/**
 * LLM 客户端层：OpenAI Chat Completions 兼容（纯客户端 fetch）。
 * - baseUrl 视为已含 /v1（或裸 host），直接拼接 /chat/completions。
 * - chatOnce：非流式一次取全文（冒烟 / 验证 / 简单场景）。
 * - chatStream：SSE 逐帧解析增量，onDelta 回调 + 返回完整文本。
 * - 失败统一抛 LlmRequestError（实现 LlmError）：auth / quota / network / timeout / parse / http / aborted。
 */
import type { LlmErrorCode, LlmError, LLMMessage, TutorConfig } from '~/types/tutor'

/** 默认整次请求超时（毫秒）。 */
const DEFAULT_TIMEOUT_MS = 60_000

/** SSE 行分隔：\r\n / \n / 单独 \r 都兼容。 */
const LINE_BREAK = /\r\n|\n|\r/

/** 结构化 LLM 错误：code 见 LlmErrorCode，status 为 HTTP 状态码（网络/超时缺失）。 */
export class LlmRequestError extends Error implements LlmError {
  readonly code: LlmErrorCode
  readonly status?: number
  constructor(code: LlmErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'LlmRequestError'
    this.code = code
    this.status = status
  }
}

/** 端点：去掉尾部斜杠后拼接 /chat/completions。 */
function endpointOf(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/chat/completions'
}

function headersOf(config: TutorConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  }
}

/** 把 HTTP 非 2xx 归一为 LlmRequestError。 */
function httpError(res: Response, bodyText: string): LlmRequestError {
  let msg = bodyText.slice(0, 300)
  if (!msg) msg = `HTTP ${res.status}`
  let code: LlmErrorCode
  if (res.status === 401 || res.status === 403) code = 'auth'
  else if (res.status === 402 || res.status === 429) code = 'quota'
  // E1：500 / 404 不是「响应无法解析」，归 http 并带 status 给 UI 显示
  else code = 'http'
  return new LlmRequestError(code, msg, res.status)
}

interface Ctl {
  ctrl: AbortController
  cleanup: () => void
  /** 是否由内部 60s 定时器触发（用于区分 timeout 与外部取消）。 */
  timedOut: () => boolean
}

function makeController(timeoutMs: number, external?: AbortSignal): Ctl {
  const ctrl = new AbortController()
  let didTimeout = false
  const timer = setTimeout(() => {
    didTimeout = true
    ctrl.abort(new DOMException('timeout', 'TimeoutError'))
  }, timeoutMs)
  let externalCleanup = () => {}
  if (external) {
    if (external.aborted) ctrl.abort(external.reason)
    else {
      const onAbort = () => ctrl.abort(external.reason)
      external.addEventListener('abort', onAbort, { once: true })
      externalCleanup = () => external.removeEventListener('abort', onAbort)
    }
  }
  return {
    ctrl,
    cleanup: () => {
      clearTimeout(timer)
      externalCleanup()
    },
    timedOut: () => didTimeout,
  }
}

/** E2：把 fetch 的底层异常归类，区分内部超时 / 外部取消 / 网络错误。 */
function classify(err: unknown, ctl: Ctl): LlmRequestError {
  if (err instanceof LlmRequestError) return err
  if (ctl.timedOut()) return new LlmRequestError('timeout', 'LLM 请求超时')
  if (ctl.ctrl.signal.aborted) return new LlmRequestError('aborted', '请求已取消')
  if (err instanceof TypeError) return new LlmRequestError('network', err.message || '网络不可达')
  return new LlmRequestError('network', err instanceof Error ? err.message : String(err))
}

interface LlmOpts {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface ChatStreamOpts extends LlmOpts {
  /** 每收到一段文本增量回调；返回 false 提前中止（已收部分仍会返回）。 */
  onDelta?: (delta: string, full: string) => void | boolean
}

/** 非流式：一次拿到完整回复（冒烟 / 验证 / 简单场景）。 */
export async function chatOnce(
  config: TutorConfig,
  messages: LLMMessage[],
  opts: LlmOpts = {},
): Promise<string> {
  const ctl = makeController(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal)
  try {
    const res = await fetch(endpointOf(config.baseUrl), {
      method: 'POST',
      headers: headersOf(config),
      body: JSON.stringify({ model: config.model, messages, stream: false }),
      signal: ctl.ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw httpError(res, text)
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new LlmRequestError('parse', '响应缺少 choices[0].message.content')
    return content
  } catch (err) {
    throw classify(err, ctl)
  } finally {
    ctl.cleanup()
  }
}

/**
 * 流式（SSE）：逐帧解析 `data:` 增量，onDelta 回调打字机渲染，返回完整文本。
 * 兼容 OpenAI Chat Completions `stream:true`：跳过 role-only / finish_reason 等无 content 帧，
 * 遇 `[DONE]` 正常收束；onDelta 返回 false 可提前中止（已收文本仍返回）。
 * 行分隔兼容 \r\n / \n / 单独 \r；空流（无任何 content 帧）抛 parse 而非返回空串。
 * 失败统一抛 LlmRequestError（auth / quota / network / timeout / parse / http / aborted）。
 */
export async function chatStream(
  config: TutorConfig,
  messages: LLMMessage[],
  opts: ChatStreamOpts = {},
): Promise<string> {
  const ctl = makeController(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, opts.signal)
  try {
    const res = await fetch(endpointOf(config.baseUrl), {
      method: 'POST',
      headers: headersOf(config),
      body: JSON.stringify({ model: config.model, messages, stream: true }),
      signal: ctl.ctrl.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw httpError(res, text)
    }
    if (!res.body) throw new LlmRequestError('parse', '响应缺少可读流 body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''
    let stopped = false

    /** 处理单行 SSE 帧；解析失败抛 parse，空 content 帧跳过。 */
    const feed = (line: string): void => {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) return
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') {
        stopped = true
        return
      }
      let frame: { choices?: Array<{ delta?: { content?: string } }> }
      try {
        frame = JSON.parse(payload) as typeof frame
      } catch {
        throw new LlmRequestError('parse', 'SSE 帧不是合法 JSON')
      }
      const delta = frame.choices?.[0]?.delta?.content
      if (typeof delta !== 'string' || delta.length === 0) return
      full += delta
      if (opts.onDelta && opts.onDelta(delta, full) === false) stopped = true
    }

    try {
      while (!stopped) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // E8：行分隔兼容 \r\n / \n / 单独 \r；跨 chunk 的半行留在 buffer。
        let m: RegExpExecArray | null
        while ((m = LINE_BREAK.exec(buffer)) !== null) {
          const line = buffer.slice(0, m.index)
          buffer = buffer.slice(m.index + m[0].length)
          feed(line)
          if (stopped) break
        }
      }
      buffer += decoder.decode()
      if (!stopped && buffer.trim()) feed(buffer)
    } finally {
      if (stopped) await reader.cancel().catch(() => {})
      else reader.releaseLock()
    }
    // E3：端点一个 content 帧都没给，不能插入空气泡
    if (!full.trim()) throw new LlmRequestError('parse', 'SSE 流中没有收到任何回复内容')
    return full
  } catch (err) {
    throw classify(err, ctl)
  } finally {
    ctl.cleanup()
  }
}
