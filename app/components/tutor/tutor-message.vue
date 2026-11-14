<script setup lang="ts">
/**
 * 单条对话气泡：LLM / 学生文本走 Markdown 渲染。
 * 安全：markdown-it 关掉原始 HTML，输出再经 DOMPurify 净化；代码块复用 highlight.ts 的 tok-* 着色。
 * vue 的 scoped 样式不作用于 v-html 注入的节点，故渲染体样式一律用 :deep()。
 */
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { highlight, esc } from '~/lib/highlight'
import type { TutorTurn } from '~/types/tutor'

const props = defineProps<{
  turn: TutorTurn
  /** 流式输出中：末尾显示闪烁光标。 */
  streaming?: boolean
}>()

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// 代码块：包一层 .code-block 以复用站点深色底 + tok-* 高亮类
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]!
  const lang = token.info.trim()
  const label = lang ? ` data-lang="${esc(lang)}"` : ''
  return `<pre class="code-block"${label}><code>${highlight(token.content)}</code></pre>`
}

// 链接统一新窗口打开，避免 LLM 输出把当前学习页导航走
const baseLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const t = tokens[idx]!
  t.attrSet('target', '_blank')
  t.attrSet('rel', 'noopener noreferrer')
  return baseLinkOpen(tokens, idx, options, env, self)
}

const html = computed(() => {
  if (!props.turn.content) return ''
  const raw = md.render(props.turn.content)
  // html:false 时 md.render 已转义原始标签；客户端再走 DOMPurify 双保险（含链接 target 放行）。
  return import.meta.client ? DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] }) : raw
})
</script>

<template>
  <div class="tutor-row" :class="`role-${turn.role}`">
    <div class="tutor-msg">
      <div v-if="turn.role === 'system'" class="tutor-msg-sys">{{ turn.content }}</div>
      <div v-else class="tutor-md" v-html="html" />
      <span v-if="streaming && !turn.content" class="tutor-caret" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.tutor-row {
  display: flex;
  margin: 2px 0;
}
.tutor-row.role-user {
  justify-content: flex-end;
}
.tutor-row.role-assistant,
.tutor-row.role-system {
  justify-content: flex-start;
}

.tutor-msg {
  max-width: 86%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 13.5px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.role-user .tutor-msg {
  background: var(--primary-soft);
  border-color: transparent;
  border-bottom-right-radius: 4px;
}
.role-assistant .tutor-msg {
  border-bottom-left-radius: 4px;
}
.role-system .tutor-msg {
  background: var(--surface-2);
  color: var(--muted);
  font-size: 12.5px;
}
.tutor-msg-sys {
  white-space: pre-wrap;
}

.tutor-caret {
  display: inline-block;
  width: 6px;
  height: 14px;
  vertical-align: -2px;
  margin-left: 2px;
  background: var(--primary);
  border-radius: 2px;
  animation: tutor-blink 1s steps(2, start) infinite;
}
@keyframes tutor-blink {
  to {
    visibility: hidden;
  }
}

/* v-html 注入节点需要用 :deep 才能命中 */
.tutor-md :deep(p) {
  margin: 0 0 8px;
}
.tutor-md :deep(p:last-child) {
  margin-bottom: 0;
}
.tutor-md :deep(ul),
.tutor-md :deep(ol) {
  padding-left: 20px;
  margin: 0 0 8px;
}
.tutor-md :deep(li) {
  margin-bottom: 3px;
}
.tutor-md :deep(h1),
.tutor-md :deep(h2),
.tutor-md :deep(h3) {
  font-size: 15px;
  margin: 10px 0 6px;
}
.tutor-md :deep(a) {
  color: var(--primary);
  text-decoration: underline;
}
.tutor-md :deep(blockquote) {
  border-left: 3px solid var(--primary);
  background: var(--surface-2);
  padding: 6px 10px;
  margin: 0 0 8px;
  border-radius: 0 6px 6px 0;
}
.tutor-md :deep(blockquote p) {
  margin: 0;
}
.tutor-md :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 10px 0;
}
.tutor-md :deep(code) {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
  overflow-wrap: anywhere;
}
.tutor-md :deep(pre.code-block) {
  background: #111827;
  color: #e6edf7;
  border-radius: 8px;
  padding: 10px 12px;
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.6;
  margin: 0 0 8px;
  border: 1px solid #253044;
  -webkit-overflow-scrolling: touch;
}
:global(html[data-theme='dark']) .tutor-md :deep(pre.code-block) {
  background: #0c111b;
}
.tutor-md :deep(pre.code-block code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
.tutor-md :deep(.code-block .tok-kw) {
  color: #c792ea;
}
.tutor-md :deep(.code-block .tok-str) {
  color: #a5d6a7;
}
.tutor-md :deep(.code-block .tok-com) {
  color: #7c8ba3;
  font-style: italic;
}
.tutor-md :deep(.code-block .tok-num) {
  color: #f7b267;
}
.tutor-md :deep(.code-block .tok-fn) {
  color: #82c7ff;
}
.tutor-md :deep(table) {
  border-collapse: collapse;
  font-size: 12px;
  display: block;
  overflow-x: auto;
  max-width: 100%;
  margin-bottom: 8px;
}
.tutor-md :deep(th),
.tutor-md :deep(td) {
  border: 1px solid var(--border);
  padding: 5px 8px;
  white-space: nowrap;
}
.tutor-md :deep(th) {
  background: var(--surface-2);
}
</style>
