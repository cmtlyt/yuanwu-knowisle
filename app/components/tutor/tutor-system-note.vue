<script setup lang="ts">
/** 内联系统气泡：LLM 错误码→文案 + 未配置引导；提供「重试」「去设置」。 */
import type { LlmErrorCode, TutorNote } from '~/types/tutor'

const props = defineProps<{ note: TutorNote }>()
const emit = defineEmits<{ retry: []; settings: [] }>()

const ERROR_TEXT: Record<LlmErrorCode, string> = {
  auth: 'API Key 无效或已过期（401/403）。请检查助手设置里的 key。',
  quota: '账户额度不足或请求被限流（402/429）。请稍后重试或检查额度。',
  network: '无法连接 LLM 端点。请检查 baseUrl 是否正确、端点是否允许浏览器跨域（CORS）。',
  timeout: '请求超时。网络可能较慢，可以重试，或在设置里换一个响应更快的模型。',
  parse: '端点返回了无法解析的响应。请确认它是 OpenAI Chat Completions 兼容接口。',
  http: '端点返回了 HTTP 错误，请检查服务状态或 baseUrl 是否正确。',
  aborted: '请求已取消，可重新发送。',
}

const title = computed(() => (props.note.type === 'guide' ? '配置提示' : '调用失败'))
const text = computed(() => {
  if (props.note.type === 'guide') return props.note.text
  const err = props.note.error
  // E1：5xx / 404 明确显示真实状态码，不再误报「响应无法解析」
  if (err.code === 'http' && err.status)
    return `端点返回 HTTP ${err.status}。请检查服务状态或 baseUrl 是否正确。`
  return ERROR_TEXT[err.code]
})
const detail = computed(() =>
  props.note.type === 'error' && props.note.error.message ? props.note.error.message.slice(0, 160) : '',
)
</script>

<template>
  <div class="tutor-row">
    <div class="tutor-note" :class="note.type">
      <div class="tn-head">
        <span class="tn-ico" aria-hidden="true">{{ note.type === 'guide' ? '⚙' : '⚠' }}</span>
        <b>{{ title }}</b>
      </div>
      <p class="tn-text">{{ text }}</p>
      <p v-if="detail" class="tn-detail mono">{{ detail }}</p>
      <div class="tn-actions">
        <button v-if="note.type === 'error'" type="button" class="btn primary sm" @click="emit('retry')">
          重试
        </button>
        <button type="button" class="btn sm" @click="emit('settings')">去设置</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tutor-row {
  display: flex;
  justify-content: center;
  margin: 4px 0;
}
.tutor-note {
  width: 100%;
  max-width: 92%;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12.5px;
  border: 1px solid var(--border);
  background: var(--surface-2);
}
.tutor-note.error {
  background: var(--danger-soft);
  border-color: transparent;
}
.tutor-note.guide {
  background: var(--warn-soft);
  border-color: transparent;
}
.tn-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.tn-ico {
  font-size: 13px;
}
.tn-text {
  margin: 0;
  line-height: 1.55;
}
.tn-detail {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--muted);
  overflow-wrap: anywhere;
  max-height: 60px;
  overflow: auto;
}
.tn-actions {
  display: flex;
  gap: 8px;
  margin-top: 9px;
}
.tn-actions .btn {
  min-height: 36px;
}
</style>
