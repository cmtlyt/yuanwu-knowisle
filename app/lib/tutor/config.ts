/**
 * LLM 配置加密存取。
 * - 存储：localStorage `knowisle:tutor:llm:v1`，值为 JSON `{ v: 1, fp, iv, ct }`。
 * - 加密：WebCrypto AES-GCM；派生密钥 = SHA-256(fingerprintHash)（指纹见 fingerprint.ts）。
 * - 指纹漂移：当前指纹与存储的 fp 不一致，或解密失败 → 判定 stale（配置已重置），不抛错。
 *
 * 隐私边界：key 仅存本机、随请求明文发往用户配置的端点；本模块不写进学情导出。
 */
import { computeFingerprint } from './fingerprint.ts'
import { isRecord } from './guards.ts'
import type { TutorConfig, TutorConfigRead } from '~/types/tutor'

const STORAGE_KEY = 'knowisle:tutor:llm:v1'

interface StoredBlob {
  v: number
  /** 加密时写入的指纹 hash。 */
  fp: string
  /** AES-GCM 初始化向量（base64）。 */
  iv: string
  /** 密文（base64）。 */
  ct: string
}

/** 只校验原来 `readStored` 会检查的字段，保证 stale / absent 判定与 00029 完全一致。 */
function isStoredBlob(value: unknown): value is StoredBlob {
  return (
    isRecord(value) &&
    value.v === 1 &&
    typeof value.fp === 'string' &&
    value.fp.length > 0 &&
    typeof value.iv === 'string' &&
    value.iv.length > 0 &&
    typeof value.ct === 'string' &&
    value.ct.length > 0
  )
}

/** 解密明文同样只校验原 `getTutorConfig` 的三项必填，不新增会导致旧配置失效的字段检查。 */
function isTutorConfig(value: unknown): value is TutorConfig {
  return (
    isRecord(value) &&
    typeof value.baseUrl === 'string' &&
    value.baseUrl.length > 0 &&
    typeof value.apiKey === 'string' &&
    value.apiKey.length > 0 &&
    typeof value.model === 'string' &&
    value.model.length > 0
  )
}

function b64FromBytes(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  // 显式绑定 ArrayBuffer：WebCrypto 的 BufferSource 要求 ArrayBufferView<ArrayBuffer>，
  // 默认 Uint8Array<ArrayBufferLike> 不满足 decrypt/encrypt 的重载。
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function deriveKey(fp: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fp))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function readStored(): StoredBlob | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isStoredBlob(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 存储键是否存在（用于区分「从未配置」与「密文 blob 已损坏」）。 */
function hasStoredBlob(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/**
 * 读取 LLM 配置。
 * - absent：本机从未配置。
 * - ok：解密成功，返回配置。
 * - stale：指纹漂移 / 解密失败（视为配置已重置，需重新配置）。
 */
export async function getTutorConfig(): Promise<TutorConfigRead> {
  if (typeof localStorage === 'undefined') return { status: 'absent', config: null }
  const stored = readStored()
  if (!stored) {
    // E10：key 存在却解析不了 = 密文 blob 损坏，应走「配置已重置」提示而非「从未配置」
    return { status: hasStoredBlob() ? 'stale' : 'absent', config: null }
  }

  try {
    // A2：指纹计算（crypto.subtle）/ 解密任一环节失败都不允许冒泡成 unhandledrejection
    const fp = await computeFingerprint()
    if (fp.hash !== stored.fp) return { status: 'stale', config: null }
    const key = await deriveKey(stored.fp)
    const iv = b64ToBytes(stored.iv)
    const ct = b64ToBytes(stored.ct)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
    const cfg: unknown = JSON.parse(new TextDecoder().decode(plain))
    if (!isTutorConfig(cfg)) return { status: 'stale', config: null }
    return { status: 'ok', config: cfg }
  } catch {
    // 指纹漂移 / WebCrypto 不可用 / 解密失败 / 明文损坏 → 一律视为已重置
    return { status: 'stale', config: null }
  }
}

/** 保存 LLM 配置：以当前设备指纹派生密钥加密后落盘。 */
export async function saveTutorConfig(input: Omit<TutorConfig, 'fingerprintHash'>): Promise<TutorConfig> {
  try {
    const fp = await computeFingerprint()
    const cfg: TutorConfig = { ...input, fingerprintHash: fp.hash }

    const key = await deriveKey(fp.hash)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plain = new TextEncoder().encode(JSON.stringify(cfg))
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)

    const blob: StoredBlob = { v: 1, fp: fp.hash, iv: b64FromBytes(iv), ct: b64FromBytes(ct) }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
    } catch {
      /* 隐私模式退化为不可持久；调用方据返回值继续，UI 可提示 */
    }
    return cfg
  } catch (err) {
    // A2：WebCrypto 不可用时抛可识别的普通 Error，由设置页捕获提示，不产生未处理异常
    throw new Error(`配置加密保存失败：${err instanceof Error ? err.message : String(err)}`, { cause: err })
  }
}

/** 清除本机 LLM 配置。 */
export function clearTutorConfig(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* noop */
  }
}
