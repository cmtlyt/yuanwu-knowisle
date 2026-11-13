/** 轻量代码高亮与转义，供内容块、雷达图等 v-html 场景复用。 */
const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function esc(s: unknown): string {
  let text: string
  if (typeof s === 'string') {
    text = s
  } else if (s == null) {
    text = ''
  } else if (typeof s === 'object') {
    text = JSON.stringify(s) ?? ''
  } else if (typeof s === 'number' || typeof s === 'boolean' || typeof s === 'bigint') {
    text = String(s)
  } else {
    text = ''
  }
  return text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c)
}

const RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(\d+(?:\.\d+)?)\b|\b(import|from|const|let|function|return|await|class|extends|new|type|interface|declare|if|else|for|while|yield|of|in|true|false|null|undefined|never|void|async|export|default|static|readonly|as|switch|case|break)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()/g

export function highlight(src: string): string {
  let out = '',
    last = 0,
    m: RegExpExecArray | null
  RE.lastIndex = 0
  while ((m = RE.exec(src)) !== null) {
    out += esc(src.slice(last, m.index))
    const cls = m[1] ? 'com' : m[2] ? 'str' : m[3] ? 'num' : m[4] ? 'kw' : 'fn'
    out += `<span class="tok-${cls}">${esc(m[0])}</span>`
    last = m.index + m[0].length
  }
  return out + esc(src.slice(last))
}
