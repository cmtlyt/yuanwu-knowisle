<script setup lang="ts">
import { highlight } from '~/lib/highlight'
import type { LessonBlock as Block } from '~/types/course'

const props = defineProps<{ block: Block }>()
const icon = computed(() =>
  props.block.type === 'callout'
    ? props.block.tone === 'warn'
      ? '⚠️'
      : props.block.tone === 'deep'
        ? '🔬'
        : '💡'
    : '',
)
const paragraphs = computed(() =>
  props.block.type === 'prose' ? props.block.text.split('\n').filter(Boolean) : [],
)
</script>

<template>
  <div v-if="block.type === 'prose'" class="block">
    <h3 v-if="block.title">{{ block.title }}</h3>
    <p v-for="(p, i) in paragraphs" :key="i">{{ p }}</p>
  </div>

  <div v-else-if="block.type === 'code'" class="block">
    <div v-if="block.title" class="code-title">{{ block.title }}</div>
    <div class="code-scroll-hint">← 代码可左右滑动 →</div>
    <pre class="code-block"><code v-html="highlight(block.code)"></code></pre>
    <div v-if="block.note" class="code-note">💡 {{ block.note }}</div>
  </div>

  <div v-else-if="block.type === 'callout'" class="callout" :class="block.tone">
    <b>{{ icon }} {{ block.title }}</b>
    <p>{{ block.text }}</p>
  </div>

  <div v-else-if="block.type === 'list'" class="block list-block">
    <h3 v-if="block.title">{{ block.title }}</h3>
    <ul>
      <li v-for="(item, i) in block.items" :key="i">{{ item }}</li>
    </ul>
  </div>
</template>
