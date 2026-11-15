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
    // 首尾空行去掉，但**中间的保留**：段间空行是段落分隔，filter(Boolean) 会把多段落压成一段
    const raw = (meta.inner || '').split('\n')
    while (raw.length && raw[0]!.trim() === '') raw.shift()
    while (raw.length && raw[raw.length - 1]!.trim() === '') raw.pop()
    let title = ''
    let body = ''
    if (raw.length) {
      title = raw[0]!.replace(/^#{1,6}\s*/, '').trim()
      body = raw.slice(1).join('\n').trim()
    }
    const icon = tone === 'warn' ? '⚠️' : tone === 'deep' ? '🔬' : '💡'
    const titleHtml = mdInstance.renderInline(title)
    // 正文按**块级**渲染：早期这里用 renderInline，导致容器里的表格退化成一行管道符、
    // 列表挤成一段、多个段落被合并（00060 在 L25 的对照表上撞到）。块级渲染后
    // 表格 / 列表 / 多段落 / 代码块都能正常展开，单段正文的输出与之前一致。
    const bodyHtml = body ? mdInstance.render(normalizeFenceInfo(body)) : ''
    return `<div class="callout ${tone}"><b>${icon} ${titleHtml}</b>${bodyHtml}</div>\n`
  }
  mdInstance.renderer.rules.callout_close = () => ''
}

calloutPlugin(md)

/**
 * CommonMark 规定反引号围栏的 info-string 里不能再出现反引号：一旦出现，整行不会被识别为代码块，
 * 于是代码被当段落渲染、后面的 `:::` 容器与标题全部错位（00058 审计发现 24 节历史数据有这问题）。
 *
 * 数据侧已批量把 info 里的行内反引号换成中文引号（`「」`），这里再做一层兜底：title / note
 * 只输出为纯文本（`code-title` / `code-note`），换引号视觉等价，但围栏能正常生效。
 */
function normalizeFenceInfo(src: string): string {
  return src.replace(
    /^( {0,3})(`{3,})(.*)$/gm,
    (line: string, indent: string, fence: string, info: string) => {
      if (!info.includes('`')) return line
      let n = 0
      const fixed = info.replace(/`/g, () => (++n % 2 === 1 ? '「' : '」'))
      return indent + fence + fixed
    },
  )
}

/** 渲染 Markdown 源为 HTML（html:false，原始 HTML 已被中和；客户端调用方自行 DOMPurify）。 */
export function renderMarkdown(src: string): string {
  if (!src) return ''
  return md.render(normalizeFenceInfo(src))
}
