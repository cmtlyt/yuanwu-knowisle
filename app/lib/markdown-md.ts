/**
 * 课程正文 Markdown 化的纯函数工具（不依赖 markdown-it，可在 Node 迁移脚本 / verify 中复用）。
 * - escBacktick：把字符串转成可安全放入 JS 模板字符串（反引号）的形式，运行时还原为原字符串。
 * - blocksToMarkdown：把现有结构化 LessonBlock[] 转写为 Markdown 源文本（迁移脚本用）。
 * - contentStats：统计「叙述正文量」与「代码示例量」，直接回应「统计真实内容有多少」。
 */

import type { LessonBlock } from '~/types/course'

/**
 * 转义为模板字符串安全的文本。运行时（JS 反序列化）后还原为 s。
 * 处理三类特殊字符：反引号 `（必须转义，否则会闭合外层模板）、
 * `${`（模板插值，必须转义）、反斜杠 \（自身需转义）。
 */
export function escBacktick(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

/** 把一段叙述文本按原 lesson-block 的「按 \n 拆段」语义转为 Markdown 段落（空行分隔）。 */
function mdParagraph(text: string): string {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .join('\n\n')
}

/** 把结构化正文块转写为 Markdown 源。code 的 title/note 走 fence info-string；callout 走 :::tone 容器。 */
export function blocksToMarkdown(blocks: LessonBlock[]): string {
  const out: string[] = []
  for (const b of blocks) {
    if (b.type === 'prose') {
      if (b.title) out.push('### ' + escBacktick(b.title))
      out.push(mdParagraph(escBacktick(b.text)))
    } else if (b.type === 'list') {
      if (b.title) out.push('### ' + escBacktick(b.title))
      out.push(b.items.map((i) => '- ' + escBacktick(i)).join('\n'))
    } else if (b.type === 'code') {
      const attrs: string[] = []
      if (b.title) attrs.push(`title="${escBacktick(b.title)}"`)
      if (b.note) attrs.push(`note="${escBacktick(b.note)}"`)
      const fence = '```' + (attrs.length ? ' ' + attrs.join(' ') : '')
      out.push(fence + '\n' + escBacktick(b.code) + '\n```')
    } else if (b.type === 'callout') {
      out.push(':::' + escBacktick(b.tone))
      out.push('### ' + escBacktick(b.title))
      out.push(escBacktick(b.text))
      out.push(':::')
    }
  }
  return (
    out
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

export interface ContentStats {
  /**
   * 叙述正文**字符数**：含提示框（`:::deep / :::warn / :::tip`）内的正文，
   * 不含代码、不含 md 标记语法、不含表格管道与列表序号；含标点，含段间单空格，
   * 英文按**字母**计（`useEffect` 算 9 个字符）。
   * 想量「写了多少字」用 `proseWords`——它才是汉字数 + 英文词数。
   */
  proseChars: number
  /** 叙述正文**词数**：中文一字算一词，英文/数字按整词算（`useEffect` 算 1 个）。不含标点。 */
  proseWords: number
  /** 代码示例字符数（不含围栏行与空白）。 */
  codeChars: number
  headings: number
  callouts: number
  codeBlocks: number
}

/** 统计 Markdown 正文的量与结构，区分「叙述正文」与「代码示例」。 */
export function contentStats(md: string): ContentStats {
  let codeChars = 0
  let codeBlocks = 0
  let callouts = 0
  let prose = md

  prose = prose.replace(/```[\s\S]*?```/g, (m) => {
    const inner = m.replace(/^```[^\n]*\n?/, '').replace(/```\s*$/, '')
    codeChars += inner.replace(/\s/g, '').length
    codeBlocks++
    return ''
  })
  prose = prose.replace(/:::[ \t]*[\w-]+[ \t]*\n([\s\S]*?):::[ \t]*(?=\n|$)/g, (_m, body: string) => {
    callouts++
    // 容器只脱壳，正文留在原处继续参与统计：`:::deep` / `:::warn` 里写的是
    // 「框架对照」「注意事项」这类主体叙述，按旧口径整段丢弃会漏掉近一半的阅读量。
    // 容器内的代码块已在上面剥离，不会重复计入 prose；容器内的 `### 标题` 随正文一起
    // 落回行首，照常参与 headings 计数。
    return body
  })

  const headingLines = prose.match(/^#{1,6}\s.*$/gm) || []
  // 去标记语法：目标是「排版记号一个不剩，可见文字一个不丢」。
  // 有序列表的 `1.` 与表格的 `|` 容易被漏掉——它们不是 md 的强调记号，
  // 但同样不是正文，留着会让字符数虚高，也会让人靠堆表格行刷体量。
  const text = prose
    .replace(/^#{1,6}\s+/gm, '') // 标题记号（保留标题文字）
    .replace(/^\s*[-*+]\s+/gm, '') // 无序列表 bullet
    .replace(/^\s*\d+[.)]\s+/gm, '') // 有序列表序号
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接/图片：留可见文字，丢 URL
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, '') // 表格分隔行（|---|:--:|）整行删
    .replace(/\|/g, ' ') // 表格管道：当列分隔符，不占字
    .replace(/[*_`>#]/g, '') // 残留强调记号、行内代码反引号、引用号
    .replace(/\s+/g, ' ')
    .trim()
  const proseChars = text.length
  const proseWords = (text.match(/[一-鿿]|[A-Za-z0-9]+/g) || []).length
  return {
    proseChars,
    proseWords,
    codeChars,
    headings: headingLines.length,
    callouts,
    codeBlocks,
  }
}
