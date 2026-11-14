/**
 * 课程正文 Markdown 渲染（markdown-it 封装）。
 * 安全：关掉原始 HTML（html:false），输出由调用方在客户端经 DOMPurify 二次净化（与 tutor-message 一致）。
 * 扩展：
 *  - fence：解析 info-string 的 title=/note=，复用 highlight.ts 着色与全局 .code-* 样式。
 *  - :::tone 容器：零依赖自定义提示框，复用全局 .callout.tone 样式与图标语义。
 * 纯 JS 渲染，SSR 与客户端输出一致，无 hydration 漂移。
 */
import MarkdownIt from 'markdown-it'
import type { StateBlock, Token } from 'markdown-it'
import { highlight, esc } from './highlight.ts'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

type MdInstance = InstanceType<typeof MarkdownIt>

// 代码块：包一层全局 .code-* 类，解析 title/note 还原现有视觉
md.renderer.rules.fence = (tokens: Token[], idx: number) => {
  const token = tokens[idx]!
  const info = token.info.trim()
  const titleM = info.match(/\btitle="([^"]*)"/)
  const noteM = info.match(/\bnote="([^"]*)"/)
  const title = titleM ? titleM[1]! : ''
  const note = noteM ? noteM[1]! : ''
  const lang = info
    .replace(/\btitle="[^"]*"/g, '')
    .replace(/\bnote="[^"]*"/g, '')
    .trim()
  const code = highlight(token.content)
  let out = ''
  if (title) out += `<div class="code-title">${esc(title)}</div>`
  out += `<div class="code-scroll-hint">← 代码可左右滑动 →</div>`
  out += `<pre class="code-block"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${code}</code></pre>`
  if (note) out += `<div class="code-note">💡 ${esc(note)}</div>`
  return out
}

// 链接统一新窗口打开，避免把学习页导航走（沿用 tutor-message 的推断写法）
const baseLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const t = tokens[idx]!
  t.attrSet('target', '_blank')
  t.attrSet('rel', 'noopener noreferrer')
  return baseLinkOpen(tokens, idx, options, env, self)
}

// 零依赖 :::tone 提示框容器（复用全局 .callout.tone 样式 + 图标语义）
function calloutPlugin(mdInstance: MdInstance): void {
  const MIN = 3
  mdInstance.block.ruler.before(
    'fence',
    'callout',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const startPos = state.bMarks[startLine]! + state.tShift[startLine]!
      const startMax = state.eMarks[startLine]!
      if (startPos + MIN > startMax) return false
      if (state.src.slice(startPos, startPos + MIN) !== ':::') return false
      const count = state.src.slice(startPos, startMax).match(/^:+/)?.[0]?.length ?? 0
      if (count < MIN) return false
      const tone =
        state.src
          .slice(startPos + count, startMax)
          .trim()
          .split(/\s+/)[0] || ''
      if (!/^[\w-]+$/.test(tone)) return false
      if (silent) return true

      let nextLine = startLine
      let haveEnd = false
      while (nextLine + 1 < endLine) {
        nextLine++
        const p = state.bMarks[nextLine]! + state.tShift[nextLine]!
        const m = state.eMarks[nextLine]!
        if (p < m && state.tShift[nextLine]! < state.blkIndent) break
        if (state.src.slice(p, m).trim() === ':::') {
          haveEnd = true
          break
        }
      }

      let inner = ''
      for (let i = startLine + 1; i < nextLine; i++) {
        inner += state.src.slice(state.bMarks[i]!, state.eMarks[i]!) + '\n'
      }

      const open = state.push('callout_open', 'div', 1)
      open.markup = ':::'
      open.block = true
      open.meta = { tone, inner }
      state.line = haveEnd ? nextLine + 1 : nextLine

      const close = state.push('callout_close', 'div', -1)
      close.markup = ':::'
      close.block = true
      return true
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  )

  mdInstance.renderer.rules.callout_open = (tokens: Token[], idx: number) => {
    const meta = tokens[idx]!.meta as unknown as { tone: string; inner: string }
    const tone = meta.tone
    const lines = (meta.inner || '').split('\n').filter((l) => l.trim() !== '')
    let title = ''
    let body = ''
    if (lines.length) {
      title = lines[0]!.replace(/^#{1,6}\s*/, '').trim()
      body = lines.slice(1).join('\n').trim()
    }
    const icon = tone === 'warn' ? '⚠️' : tone === 'deep' ? '🔬' : '💡'
    const titleHtml = mdInstance.renderInline(title)
    const bodyHtml = body ? `<p>${mdInstance.renderInline(body)}</p>` : ''
    return `<div class="callout ${tone}"><b>${icon} ${titleHtml}</b>${bodyHtml}</div>\n`
  }
  mdInstance.renderer.rules.callout_close = () => ''
}

calloutPlugin(md)

/** 渲染 Markdown 源为 HTML（html:false，原始 HTML 已被中和；客户端调用方自行 DOMPurify）。 */
export function renderMarkdown(src: string): string {
  if (!src) return ''
  return md.render(src)
}
