/**
 * 设备指纹：canvas + WebGL 渲染器 + 字体探测 + 屏幕分辨率 + 时区，拼串后 SHA-256。
 * 用途：作为 LLM 配置 AES-GCM 的派生密钥材料（密钥 = SHA-256(hash)）。
 *
 * 说明：
 * - 指纹会在浏览器大版本 / 字体 / GPU 驱动变更后漂移 → 加密配置随之无法解密（视为「配置已重置」）。
 * - 它不是秘密，只是「设备绑定混淆」：同机同浏览器的脚本可算出同一指纹。
 * - 所有因子采集包 try/catch，任一失败即跳过该因子，不影响其余；纯函数，由调用方在客户端守卫后执行。
 */

export interface Fingerprint {
  hash: string
  factors: string[]
}

/** 浏览器 SHA-256 → hex。 */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function canvasFactor(): string {
  try {
    const c = document.createElement('canvas')
    c.width = 320
    c.height = 24
    const ctx = c.getContext('2d')
    if (!ctx) return 'no-canvas'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '18px Arial'
    ctx.fillStyle = '#f6a'
    ctx.fillRect(12, 12, 280, 10)
    ctx.fillStyle = '#000'
    ctx.fillText('knowisle·tutor·fingerprint', 2, 16)
    const data = ctx.getImageData(0, 0, c.width, c.height).data
    let h = 0
    for (let i = 0; i < data.length; i += 4) {
      // noUncheckedIndexedAccess：索引访问返回 number | undefined，用 ?? 0 显式收口
      h = (Math.imul(h, 31) + (data[i] ?? 0)) | 0
      h = (Math.imul(h, 131) + (data[i + 1] ?? 0)) | 0
      h = (Math.imul(h, 131) + (data[i + 2] ?? 0)) | 0
      h = (Math.imul(h, 131) + (data[i + 3] ?? 0)) | 0
    }
    return `cv:${(h >>> 0).toString(36)}`
  } catch {
    return 'cv:na'
  }
}

function webglFactor(): string {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return 'gl:na'
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
    return `gl:${renderer}`
  } catch {
    return 'gl:na'
  }
}

function fontFactor(): string {
  try {
    const base = 'w'
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 'ft:na'
    const probes = [
      ['monospace', 'Courier New', 'Consolas'],
      ['serif', 'Georgia', 'Times New Roman'],
      ['sans-serif', 'Verdana', 'Arial'],
    ] as const
    let sig = ''
    for (const [family, primary, fallback] of probes) {
      ctx.font = `72px ${family}`
      const baseW = ctx.measureText(base).width
      ctx.font = `72px ${primary}, ${family}`
      const primaryW = ctx.measureText(base).width
      ctx.font = `72px ${fallback}, ${family}`
      const fallbackW = ctx.measureText(base).width
      sig += primaryW !== baseW ? 'P' : fallbackW !== baseW ? 'F' : '-'
    }
    return `ft:${sig}`
  } catch {
    return 'ft:na'
  }
}

function screenFactor(): string {
  try {
    return `sc:${screen.width}x${screen.height}x${screen.colorDepth}x${window.devicePixelRatio || 1}`
  } catch {
    return 'sc:na'
  }
}

function timezoneFactor(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'utc'
    const offset = -new Date().getTimezoneOffset()
    return `tz:${tz}(${offset})`
  } catch {
    return 'tz:na'
  }
}

/** 计算设备指纹。仅客户端可用（依赖 document / screen / crypto.subtle）。 */
export async function computeFingerprint(): Promise<Fingerprint> {
  const factors = [canvasFactor(), webglFactor(), fontFactor(), screenFactor(), timezoneFactor()]
  const hash = await sha256Hex(factors.join('|'))
  return { hash, factors }
}
