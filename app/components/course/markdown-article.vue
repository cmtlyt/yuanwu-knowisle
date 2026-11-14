<script setup lang="ts">
/**
 * 课程正文渲染：把 Markdown 源（来自 Lesson.md 模板字符串）渲染为 HTML。
 * 安全：renderMarkdown 已 html:false 中和原始 HTML；客户端再经 DOMPurify 二次净化（与 tutor-message 一致）。
 * vue scoped 样式不作用于 v-html 节点，故用 :deep() 命中；代码/提示框样式复用全局 .code-* / .callout.*。
 */
import DOMPurify from 'dompurify'
import { renderMarkdown } from '~/lib/markdown'

const props = defineProps<{ md: string }>()

const html = computed(() => {
  if (!props.md) return ''
  const raw = renderMarkdown(props.md)
  // html:false 时 SSR 已输出转义 HTML；客户端再走 DOMPurify 双保险（含链接 target 放行）。
  return import.meta.client ? DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] }) : raw
})
</script>

<template>
  <div class="md-body" v-html="html" />
</template>

<style scoped>
/* 复用全局 .code-* / .callout.* 视觉；这里只补 markdown 正文块之间的间距与段落/列表排版，对齐 lesson-block 的 .block 间距 */
.md-body :deep(> *) {
  margin-bottom: 20px;
}
.md-body :deep(> *:last-child) {
  margin-bottom: 0;
}
.md-body :deep(h3) {
  font-size: 16px;
  margin: 0 0 9px;
}
.md-body :deep(p) {
  margin: 0 0 10px;
}
.md-body :deep(p:last-child) {
  margin-bottom: 0;
}
.md-body :deep(ul),
.md-body :deep(ol) {
  padding-left: 20px;
  margin: 0 0 10px;
}
.md-body :deep(li) {
  margin-bottom: 4px;
}
.md-body :deep(a) {
  color: var(--primary);
  text-decoration: underline;
}
.md-body :deep(code:not(pre code)) {
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 12.5px;
  overflow-wrap: anywhere;
}
</style>
